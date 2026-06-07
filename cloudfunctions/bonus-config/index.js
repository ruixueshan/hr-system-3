/**
 * 提成规则配置模块
 * 设置 HR 提成系数、外协人员提成规则
 */
const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();

const RULE_COLLECTION = 'recruitment_bonus_rules';
const USER_COLLECTION = 'users';
const COMPANY_COLLECTION = 'companies';
const EMPLOYEE_COLLECTION = 'employees';
const EMPLOYEE_COMPANY_COLLECTION = 'employee_companies';
const BONUS_CALCULATION_MODES = new Set(['hourly', 'service_fee', 'gross_salary']);
const BONUS_PERIOD_TYPES = new Set(['long_term', 'fixed_months']);

function success(data = null, message = 'success') {
  return { code: 0, message, data };
}

function error(code = 1, message = 'error', data = null) {
  return { code, message, data };
}

function normalizeId(value) {
  return String(value || '').trim();
}

function toNumber(value, fallback = 0) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
}

function normalizeCalculationMode(value) {
  const mode = String(value || '').trim();
  return BONUS_CALCULATION_MODES.has(mode) ? mode : 'hourly';
}

function normalizeBonusPeriodType(value) {
  const type = String(value || '').trim();
  return BONUS_PERIOD_TYPES.has(type) ? type : 'long_term';
}

function normalizeBonusPeriodMonths(value, type = normalizeBonusPeriodType()) {
  if (type !== 'fixed_months') return 0;
  const months = Math.max(1, Math.floor(toNumber(value, 0)));
  return Number.isFinite(months) ? months : 0;
}

function normalizeRuleDate(value, fallback = '') {
  const text = String(value || '').trim();
  if (!text) return fallback;
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return text;
  if (/^\d{4}-\d{2}$/.test(text)) return `${text}-01`;
  return fallback;
}

function normalizeRuleEndDate(value, fallback = '') {
  const text = String(value || '').trim();
  if (!text) return fallback;
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return text;
  if (/^\d{4}-\d{2}$/.test(text)) {
    const [yearText, monthText] = text.split('-');
    const year = Number(yearText);
    const month = Number(monthText);
    const endDay = new Date(year, month, 0).getDate();
    return `${text}-${String(endDay).padStart(2, '0')}`;
  }
  return fallback;
}

function resolveRuleDateRange(data) {
  const startDate = normalizeRuleDate(data.start_date, normalizeRuleDate(data.start_month));
  const endDate = normalizeRuleEndDate(data.end_date, normalizeRuleEndDate(data.end_month));
  return {
    start_date: startDate,
    end_date: endDate || null,
    start_month: startDate ? startDate.slice(0, 7) : '',
    end_month: endDate ? endDate.slice(0, 7) : null
  };
}

function getRuleValueField(mode) {
  if (mode === 'service_fee') return 'service_fee_rate';
  if (mode === 'gross_salary') return 'gross_salary_rate';
  return 'hourly_coefficient';
}

function getRuleValue(rule, mode = normalizeCalculationMode(rule.calculation_mode)) {
  return toNumber(rule[getRuleValueField(mode)]);
}

function buildMetricPayload(data, mode) {
  return {
    hourly_coefficient: mode === 'hourly' ? toNumber(data.hourly_coefficient) : 0,
    service_fee_rate: mode === 'service_fee' ? toNumber(data.service_fee_rate) : 0,
    gross_salary_rate: mode === 'gross_salary' ? toNumber(data.gross_salary_rate) : 0
  };
}

function isValidReferrerUser(user) {
  if (!normalizeId(user && (user._id || user.id))) return false;
  if (user.role === 'candidate' || user.role === 'employee' || user.user_type === 'candidate') return false;
  return true;
}

function getRuleScope(data) {
  const hasRecommender = !!normalizeId(data.recommender_id);
  const hasCompany = !!normalizeId(data.company_id);
  if (hasRecommender && hasCompany) return 'recommender_company';
  if (hasRecommender) return 'recommender';
  if (hasCompany) return 'company';
  return 'global';
}

function getSuggestedPriority(scope) {
  const map = {
    recommender_company: 300,
    recommender: 200,
    company: 100,
    global: 0
  };
  return map[scope] ?? 0;
}

function pickLatestRelation(current, candidate) {
  if (!current) return candidate;
  const currentStamp = String(current.updated_at || current.created_at || current.join_date || '');
  const candidateStamp = String(candidate.updated_at || candidate.created_at || candidate.join_date || '');
  return candidateStamp > currentStamp ? candidate : current;
}

async function fetchAllDocuments(query, batchSize = 100) {
  const countRes = await query.count();
  const total = Number(countRes.total || 0);
  const list = [];
  for (let offset = 0; offset < total; offset += batchSize) {
    const res = await query.skip(offset).limit(batchSize).get();
    list.push(...(res.data || []));
  }
  return list;
}

function normalizeRuleDoc(item) {
  const calculationMode = normalizeCalculationMode(item.calculation_mode);
  const dateRange = resolveRuleDateRange(item);
  const bonusPeriodType = normalizeBonusPeriodType(item.bonus_period_type);
  return {
    ...item,
    _id: normalizeId(item._id || item.id),
    recommender_id: normalizeId(item.recommender_id),
    company_id: normalizeId(item.company_id),
    recommender_name: String(item.recommender_name || ''),
    company_name: String(item.company_name || ''),
    calculation_mode: calculationMode,
    hourly_coefficient: toNumber(item.hourly_coefficient),
    service_fee_rate: toNumber(item.service_fee_rate),
    gross_salary_rate: toNumber(item.gross_salary_rate),
    rule_value: getRuleValue(item, calculationMode),
    bonus_period_type: bonusPeriodType,
    bonus_period_months: normalizeBonusPeriodMonths(item.bonus_period_months, bonusPeriodType),
    start_date: dateRange.start_date,
    end_date: dateRange.end_date ? String(dateRange.end_date) : '',
    start_month: dateRange.start_month,
    end_month: dateRange.end_month ? String(dateRange.end_month) : '',
    priority: toNumber(item.priority),
    status: String(item.status || 'active'),
    scope: String(item.scope || getRuleScope(item)),
    remark: String(item.remark || ''),
    created_by: String(item.created_by || ''),
    created_at: item.created_at,
    updated_at: item.updated_at
  };
}

async function loadActiveReferrers(recommenderIds = []) {
  const users = await fetchAllDocuments(db.collection(USER_COLLECTION));
  const allowedIds = new Set((recommenderIds || []).map(normalizeId).filter(Boolean));
  return (users || [])
    .filter((item) => isValidReferrerUser(item))
    .filter((item) => !allowedIds.size || allowedIds.has(normalizeId(item._id || item.id)))
    .map((item) => ({
      _id: normalizeId(item._id || item.id),
      name: String(item.name || item.real_name || item.phone || item._id || '')
    }));
}

async function loadActiveCompanies(companyIds = []) {
  const companies = await fetchAllDocuments(db.collection(COMPANY_COLLECTION));
  const allowedIds = new Set((companyIds || []).map(normalizeId).filter(Boolean));
  return (companies || [])
    .filter((item) => String(item.status || '') !== 'terminated')
    .filter((item) => !allowedIds.size || allowedIds.has(normalizeId(item._id || item.id)))
    .map((item) => ({
      _id: normalizeId(item._id || item.id),
      name: String(item.name || '')
    }));
}

async function loadEmployeeCompanyMap() {
  const relations = await fetchAllDocuments(db.collection(EMPLOYEE_COMPANY_COLLECTION));
  const relationMap = new Map();
  (relations || []).forEach((item) => {
    const employeeId = normalizeId(item.employee_id);
    if (!employeeId) return;
    relationMap.set(employeeId, pickLatestRelation(relationMap.get(employeeId), item));
  });
  return relationMap;
}

async function collectObservedPairs({ recommender_ids = [], company_ids = [] } = {}) {
  const recommenderSet = new Set((recommender_ids || []).map(normalizeId).filter(Boolean));
  const companySet = new Set((company_ids || []).map(normalizeId).filter(Boolean));
  const [employees, relationMap, referrers, companies] = await Promise.all([
    fetchAllDocuments(db.collection(EMPLOYEE_COLLECTION)),
    loadEmployeeCompanyMap(),
    loadActiveReferrers(recommender_ids),
    loadActiveCompanies(company_ids)
  ]);

  const referrerMap = new Map(referrers.map((item) => [item._id, item]));
  const companyMap = new Map(companies.map((item) => [item._id, item]));
  const pairMap = new Map();

  (employees || []).forEach((employee) => {
    const status = String(employee.status || '');
    if (!['probation', 'regular'].includes(status)) return;

    const recommenderId = normalizeId(employee.referrer_id || employee.recommender_id);
    if (!recommenderId) return;
    if (recommenderSet.size && !recommenderSet.has(recommenderId)) return;

    const relation = relationMap.get(normalizeId(employee._id || employee.id)) || {};
    const companyId = normalizeId(employee.company_id || relation.company_id);
    if (!companyId) return;
    if (companySet.size && !companySet.has(companyId)) return;

    const referrer = referrerMap.get(recommenderId);
    const company = companyMap.get(companyId);
    if (!referrer || !company) return;

    pairMap.set(`${recommenderId}__${companyId}`, {
      recommender_id: recommenderId,
      recommender_name: referrer.name,
      company_id: companyId,
      company_name: company.name
    });
  });

  return Array.from(pairMap.values()).sort((left, right) => {
    const leftText = `${left.recommender_name}-${left.company_name}`;
    const rightText = `${right.recommender_name}-${right.company_name}`;
    return leftText.localeCompare(rightText, 'zh-CN');
  });
}

function buildRulePayload(data, isCreate = false) {
  const scope = data.scope || getRuleScope(data);
  const calculationMode = normalizeCalculationMode(data.calculation_mode);
  const dateRange = resolveRuleDateRange(data);
  const bonusPeriodType = normalizeBonusPeriodType(data.bonus_period_type);
  const payload = {
    recommender_id: normalizeId(data.recommender_id),
    recommender_name: String(data.recommender_name || ''),
    company_id: normalizeId(data.company_id),
    company_name: String(data.company_name || ''),
    calculation_mode: calculationMode,
    ...buildMetricPayload(data, calculationMode),
    bonus_period_type: bonusPeriodType,
    bonus_period_months: normalizeBonusPeriodMonths(data.bonus_period_months, bonusPeriodType),
    start_date: dateRange.start_date,
    end_date: dateRange.end_date,
    start_month: dateRange.start_month,
    end_month: dateRange.end_month,
    priority: data.priority === undefined || data.priority === null || data.priority === ''
      ? getSuggestedPriority(scope)
      : toNumber(data.priority),
    status: String(data.status || 'active'),
    scope,
    remark: String(data.remark || ''),
    created_by: String(data.created_by || 'bonus-config')
  };

  return {
    ...payload,
    updated_at: db.serverDate(),
    ...(isCreate ? { created_at: db.serverDate() } : {})
  };
}

async function loadAllRules() {
  const rules = await fetchAllDocuments(db.collection(RULE_COLLECTION));
  return (rules || []).map(normalizeRuleDoc);
}

async function loadRulesByIds(ruleIds = []) {
  const uniqueIds = Array.from(new Set((ruleIds || []).map(normalizeId).filter(Boolean)));
  const list = [];
  for (const ruleId of uniqueIds) {
    const res = await db.collection(RULE_COLLECTION).doc(ruleId).get();
    const item = Array.isArray(res.data) ? res.data[0] : res.data;
    if (item) list.push(normalizeRuleDoc(item));
  }
  return list;
}

function buildExactRuleKey(rule) {
  return [
    normalizeId(rule.recommender_id),
    normalizeId(rule.company_id),
    normalizeRuleDate(rule.start_date, normalizeRuleDate(rule.start_month)),
    normalizeRuleEndDate(rule.end_date, normalizeRuleEndDate(rule.end_month))
  ].join('__');
}

function isFallbackDefaultRule(rule) {
  const recommenderId = normalizeId(rule.recommender_id);
  const companyId = normalizeId(rule.company_id);
  if (recommenderId || companyId) return false;
  const remark = String(rule.remark || '');
  const createdBy = String(rule.created_by || '');
  const recommenderName = String(rule.recommender_name || '');
  return remark.includes('初始化兜底规则') || createdBy === 'init-collections' || createdBy === 'setup-bonus-env' || recommenderName === '系统默认规则';
}

exports.main = async (event, context) => {
  const { action } = event;

  try {
    switch (action) {
      case 'list-rules':
        return listRules(event);
      case 'create-rule':
        return createRule(event);
      case 'update-rule':
        return updateRule(event);
      case 'delete-rule':
        return deleteRule(event);
      case 'copy-rules':
        return copyRules(event);
      case 'batch-update-coefficient':
        return batchUpdateCoefficient(event);
      case 'renew-rules':
        return renewRules(event);
      case 'generate-formal-rules':
        return generateFormalRules(event);
      case 'inspect-deprecated-commission-plans':
        return inspectDeprecatedCommissionPlans();
      case 'get-hr-performance':
        return getHRPerformance(event);
      default:
        return error(400, '不支持的操作');
    }
  } catch (err) {
    console.error('提成配置模块错误:', err);
    return error(500, err.message);
  }
};

async function listRules(data) {
  const { recommender_id, company_id, status } = data;
  const whereCondition = {};
  if (recommender_id) whereCondition.recommender_id = recommender_id;
  if (company_id) whereCondition.company_id = company_id;
  if (status) whereCondition.status = status;
  const query = Object.keys(whereCondition).length
    ? db.collection(RULE_COLLECTION).where(whereCondition)
    : db.collection(RULE_COLLECTION);

  const res = await query.orderBy('priority', 'desc').get();
  return success((res.data || []).map(normalizeRuleDoc));
}

async function createRule(data) {
  const payload = buildRulePayload(data, true);
  const result = await db.collection(RULE_COLLECTION).add({ data: payload });

  return success({ id: result.id }, '规则创建成功');
}

async function updateRule(data) {
  const { id, ...updateData } = data;
  await db.collection(RULE_COLLECTION).doc(id).update({ data: buildRulePayload(updateData, false) });
  return success(null, '规则更新成功');
}

async function deleteRule(data) {
  await db.collection(RULE_COLLECTION).doc(data.id).remove();
  return success(null, '规则删除成功');
}

async function copyRules(data) {
  const ruleIds = Array.from(new Set((data.rule_ids || []).map(normalizeId).filter(Boolean)));
  if (!ruleIds.length) return error(400, '缺少 rule_ids');

  const startDate = normalizeRuleDate(data.start_date, normalizeRuleDate(data.start_month));
  if (!startDate) return error(400, '缺少 start_date');
  const endDate = normalizeRuleEndDate(data.end_date, normalizeRuleEndDate(data.end_month));
  const replaceExisting = data.replace_existing === true;

  const [sourceRules, allRules] = await Promise.all([loadRulesByIds(ruleIds), loadAllRules()]);
  const exactRuleMap = new Map(allRules.map((rule) => [buildExactRuleKey(rule), rule]));

  let created = 0;
  let updated = 0;
  let skipped = 0;

  for (const sourceRule of sourceRules) {
    const key = buildExactRuleKey({
      recommender_id: sourceRule.recommender_id,
      company_id: sourceRule.company_id,
      start_date: startDate,
      end_date: endDate || ''
    });
    const existing = exactRuleMap.get(key);
    const payload = buildRulePayload({
      ...sourceRule,
      start_date: startDate,
      end_date: endDate,
      remark: data.remark || sourceRule.remark || '复制生成',
      created_by: 'bonus-config.copy-rules'
    }, !existing);

    if (existing) {
      if (!replaceExisting) {
        skipped += 1;
        continue;
      }
      await db.collection(RULE_COLLECTION).doc(existing._id).update({ data: payload });
      updated += 1;
    } else {
      await db.collection(RULE_COLLECTION).add({ data: payload });
      created += 1;
    }
  }

  return success({ created, updated, skipped, source_count: sourceRules.length }, '规则复制完成');
}

async function batchUpdateCoefficient(data) {
  const ruleIds = Array.from(new Set((data.rule_ids || []).map(normalizeId).filter(Boolean)));
  if (!ruleIds.length) return error(400, '缺少 rule_ids');

  const sourceRules = await loadRulesByIds(ruleIds);
  const calculationModes = Array.from(new Set(sourceRules.map((item) => normalizeCalculationMode(item.calculation_mode))));
  if (calculationModes.length > 1) return error(400, '批量更新仅支持同一计提方式的规则');

  const calculationMode = normalizeCalculationMode(data.calculation_mode || calculationModes[0] || 'hourly');
  if (calculationModes[0] && calculationMode !== calculationModes[0]) {
    return error(400, '传入的计提方式与所选规则不一致');
  }
  const valueField = getRuleValueField(calculationMode);
  const coefficient = toNumber(data.rule_value, toNumber(data[valueField], NaN));
  if (!Number.isFinite(coefficient) || coefficient < 0) return error(400, 'rule_value 非法');
  let updated = 0;

  for (const sourceRule of sourceRules) {
    const payload = buildRulePayload({
      ...sourceRule,
      [valueField]: coefficient,
      remark: data.remark || sourceRule.remark || ''
    }, false);
    await db.collection(RULE_COLLECTION).doc(sourceRule._id).update({ data: payload });
    updated += 1;
  }

  return success({ updated, calculation_mode: calculationMode, rule_value: coefficient }, '批量更新规则值完成');
}

async function renewRules(data) {
  const ruleIds = Array.from(new Set((data.rule_ids || []).map(normalizeId).filter(Boolean)));
  if (!ruleIds.length) return error(400, '缺少 rule_ids');

  const startDate = normalizeRuleDate(data.start_date, normalizeRuleDate(data.start_month));
  if (!startDate) return error(400, '缺少 start_date');
  const endDate = normalizeRuleEndDate(data.end_date, normalizeRuleEndDate(data.end_month));
  const replaceExisting = data.replace_existing === true;

  const [sourceRules, allRules] = await Promise.all([loadRulesByIds(ruleIds), loadAllRules()]);
  const exactRuleMap = new Map(allRules.map((rule) => [buildExactRuleKey(rule), rule]));

  let created = 0;
  let updated = 0;
  let skipped = 0;

  for (const sourceRule of sourceRules) {
    const key = buildExactRuleKey({
      recommender_id: sourceRule.recommender_id,
      company_id: sourceRule.company_id,
      start_date: startDate,
      end_date: endDate || ''
    });
    const existing = exactRuleMap.get(key);
    const payload = buildRulePayload({
      ...sourceRule,
      start_date: startDate,
      end_date: endDate,
      remark: data.remark || `续期自 ${sourceRule.start_date || sourceRule.start_month || ''}`.trim(),
      created_by: 'bonus-config.renew-rules'
    }, !existing);

    if (existing) {
      if (!replaceExisting) {
        skipped += 1;
        continue;
      }
      await db.collection(RULE_COLLECTION).doc(existing._id).update({ data: payload });
      updated += 1;
    } else {
      await db.collection(RULE_COLLECTION).add({ data: payload });
      created += 1;
    }
  }

  return success({ created, updated, skipped, source_count: sourceRules.length }, '规则续期完成');
}

async function generateFormalRules(data) {
  const calculationMode = normalizeCalculationMode(data.calculation_mode);
  const valueField = getRuleValueField(calculationMode);
  const coefficient = toNumber(data[valueField], calculationMode === 'hourly' ? 1 : 0);
  const startDate = normalizeRuleDate(data.start_date, normalizeRuleDate(data.start_month));
  if (!startDate) return error(400, '缺少 start_date');

  const endDate = normalizeRuleEndDate(data.end_date, normalizeRuleEndDate(data.end_month));
  const replaceExisting = data.replace_existing !== false;
  const deleteFallback = data.delete_fallback !== false;
  const observedPairs = await collectObservedPairs({
    recommender_ids: data.recommender_ids || [],
    company_ids: data.company_ids || []
  });

  if (!observedPairs.length) {
    return success({ created: 0, updated: 0, deleted_fallback: 0, pair_count: 0, skipped: 0 }, '未发现可生成的推荐人-企业组合');
  }

  const rules = await loadAllRules();
  const exactRuleMap = new Map();
  rules.forEach((rule) => {
    const key = buildExactRuleKey(rule);
    if (!exactRuleMap.has(key)) exactRuleMap.set(key, rule);
  });

  let created = 0;
  let updated = 0;
  let skipped = 0;

  for (const pair of observedPairs) {
    const key = buildExactRuleKey({
      recommender_id: pair.recommender_id,
      company_id: pair.company_id,
      start_date: startDate,
      end_date: endDate || ''
    });
    const existing = exactRuleMap.get(key);
    const payload = buildRulePayload({
      ...pair,
      calculation_mode: calculationMode,
      [valueField]: coefficient,
      bonus_period_type: data.bonus_period_type,
      bonus_period_months: data.bonus_period_months,
      start_date: startDate,
      end_date: endDate,
      priority: getSuggestedPriority('recommender_company'),
      status: 'active',
      scope: 'recommender_company',
      remark: '正式规则-按推荐人和企业生成',
      created_by: 'bonus-config.generate-formal-rules'
    }, !existing);

    if (existing) {
      if (!replaceExisting) {
        skipped += 1;
        continue;
      }
      await db.collection(RULE_COLLECTION).doc(existing._id).update({ data: payload });
      updated += 1;
    } else {
      await db.collection(RULE_COLLECTION).add({ data: payload });
      created += 1;
    }
  }

  let deletedFallback = 0;
  if (deleteFallback) {
    const fallbackRules = rules.filter(isFallbackDefaultRule);
    for (const rule of fallbackRules) {
      await db.collection(RULE_COLLECTION).doc(rule._id).remove();
      deletedFallback += 1;
    }
  }

  return success({
    created,
    updated,
    deleted_fallback: deletedFallback,
    pair_count: observedPairs.length,
    skipped,
    calculation_mode: calculationMode,
    rule_value: coefficient,
    start_date: startDate,
    end_date: endDate || ''
  }, '正式规则生成成功');
}

async function inspectDeprecatedCommissionPlans() {
  const collectionName = 'commission_plans';
  try {
    const countRes = await db.collection(collectionName).count();
    const total = Number(countRes.total || 0);
    return success({ collection: collectionName, total, can_remove: total === 0 }, '检查完成');
  } catch (err) {
    if (String(err.message || '').includes('Db or Table not exist')) {
      return success({ collection: collectionName, total: 0, can_remove: true, missing: true }, '集合不存在，可直接清理代码');
    }
    throw err;
  }
}

async function getHRPerformance(data) {
  const { hr_id, year, month } = data;

  const perfDoc = await db.collection('hr_performance')
    .where({ hr_id, year, month })
    .get();

  if (!perfDoc.data || perfDoc.data.length === 0) {
    // 计算 HR 有效入职人数和工时
    // 简化：返回空，实际需要根据 recruitment_bonuses 统计
    return success({
      hr_id,
      year,
      month,
      valid_hires: 0,
      total_hours: 0,
      status: 'pending'
    });
  }

  return success(perfDoc.data[0]);
}
