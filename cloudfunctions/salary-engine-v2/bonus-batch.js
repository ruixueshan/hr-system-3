/**
 * bonus-batch.js - 提成批次管理（增删改查 + 核心计算流程）
 * 从 calculate-bonus.js 提取的批次相关函数
 * 
 * N+1 优化点：
 *   - removeBatchDetails: 使用 where 批量删除替代逐条 doc().remove()
 *   - approveBonusBatch: 使用 where + update 批量审核替代逐条更新
 *   - markBonusBatchPaid: 使用 where + update 批量标记替代逐条更新
 *   - upsertBatchAndDetails: 批量 add 替代逐条 add（CloudBase 暂不支持 bulkAdd，保留循环但可改 Promise.all 小批量并发）
 */
const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();
const _ = db.command;

const { success, error } = require('./response');
const { fetchAllDocuments } = require('./common/pagination');
const { formatYearMonth, daysInMonth, getMonthDateRange, getDateOverlap, getDateDiffDays } = require('./common/date-utils');
const {
  normalizeCalculationMode, normalizeBonusPeriodType,
  resolveRule, isEligibleByJoinDate, getEligibleHours,
  resolveBonusPeriod, resolveFinanceConfig,
  calculateServiceFeeAmount, calculateBonusByRule, getRuleValueField
} = require('./bonus-rules');
const {
  loadEmployeesMap, loadEmployeeCompanyMap, loadRulesForMonth,
  loadMapByCollection, loadUserNameMap, loadJobsMap,
  loadSalaryMap, loadFinanceConfigMap, loadApprovedWorktimeMap,
  normalizeId, toNumber
} = require('./bonus-data');

const BONUS_COLLECTION = 'recruitment_bonuses';
const BATCH_COLLECTION = 'recruitment_bonus_batches';
const COMPANY_COLLECTION = 'companies';
const ACTIVE_EMPLOYEE_STATUSES = new Set(['probation', 'regular']);
const FINAL_BATCH_STATUSES = new Set(['approved', 'paid', 'partially_paid']);

function toIsoString(value) {
  if (!value) return '';
  if (typeof value === 'string') return value;
  if (value instanceof Date) return value.toISOString();
  if (typeof value === 'object' && value.$date) return value.$date;
  return String(value);
}

function formatDateInput(value) {
  if (!value) return '';
  const str = String(value).trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(str)) return str.slice(0, 10);
  const d = new Date(str);
  if (Number.isNaN(d.getTime())) return '';
  return d.toISOString().slice(0, 10);
}

function buildBatchKey(yearMonth, recommenderId) {
  return `${yearMonth}__${recommenderId || 'unassigned'}`;
}

function buildBatchNo(year, month, recommenderId) {
  return `RB${year}${String(month).padStart(2, '0')}${recommenderId.slice(-6).padStart(6, '0')}${Date.now().toString().slice(-4)}`;
}

function normalizeDetail(item, companyMap) {
  const calculationMode = normalizeCalculationMode(item.calculation_mode);
  return {
    ...item,
    _id: normalizeId(item._id || item.id),
    batch_id: normalizeId(item.batch_id),
    batch_no: String(item.batch_no || ''),
    recommender_id: normalizeId(item.recommender_id),
    recommender_name: String(item.recommender_name || ''),
    employee_id: normalizeId(item.employee_id),
    candidate_name: String(item.candidate_name || ''),
    company_id: normalizeId(item.company_id),
    company_name: String(item.company_name || companyMap.get(normalizeId(item.company_id)) || ''),
    join_date: formatDateInput(item.join_date),
    bonus_period_type: normalizeBonusPeriodType(item.bonus_period_type),
    bonus_period_months: toNumber(item.bonus_period_months),
    bonus_period_end_date: formatDateInput(item.bonus_period_end_date),
    eligible_start_date: formatDateInput(item.eligible_start_date),
    eligible_end_date: formatDateInput(item.eligible_end_date),
    calculation_mode: calculationMode,
    hourly_coefficient: toNumber(item.hourly_coefficient),
    service_fee_rate: toNumber(item.service_fee_rate),
    gross_salary_rate: toNumber(item.gross_salary_rate),
    calculation_base_amount: toNumber(item.calculation_base_amount),
    service_fee_amount: toNumber(item.service_fee_amount),
    gross_salary_amount: toNumber(item.gross_salary_amount),
    rule_value: toNumber(item.rule_value || item[getRuleValueField(calculationMode)]),
    total_hours: toNumber(item.total_hours),
    bonus_amount: toNumber(item.bonus_amount),
    year: toNumber(item.year),
    month: toNumber(item.month),
    year_month: String(item.year_month || formatYearMonth(item.year, item.month)),
    status: String(item.status || 'pending'),
    approved_at: toIsoString(item.approved_at),
    paid_at: toIsoString(item.paid_at),
    created_at: toIsoString(item.created_at),
    updated_at: toIsoString(item.updated_at)
  };
}

function normalizeBatch(item) {
  return {
    ...item,
    _id: normalizeId(item._id || item.id),
    batch_key: String(item.batch_key || ''),
    batch_no: String(item.batch_no || ''),
    recommender_id: normalizeId(item.recommender_id),
    recommender_name: String(item.recommender_name || ''),
    year: toNumber(item.year),
    month: toNumber(item.month),
    year_month: String(item.year_month || formatYearMonth(item.year, item.month)),
    candidate_count: toNumber(item.candidate_count),
    detail_count: toNumber(item.detail_count || item.candidate_count),
    total_hours: toNumber(item.total_hours),
    total_bonus: toNumber(item.total_bonus),
    approved_count: toNumber(item.approved_count),
    paid_count: toNumber(item.paid_count),
    status: String(item.status || 'calculated'),
    calculated_at: toIsoString(item.calculated_at || item.created_at),
    approved_at: toIsoString(item.approved_at),
    paid_at: toIsoString(item.paid_at),
    created_at: toIsoString(item.created_at),
    updated_at: toIsoString(item.updated_at)
  };
}

function buildBatchPayload({ existingBatch, year, month, yearMonth, recommenderId, recommenderName, items, operator, status }) {
  const candidateCount = items.length;
  const totalHours = Number(items.reduce((sum, item) => sum + toNumber(item.total_hours), 0).toFixed(2));
  const totalBonus = Number(items.reduce((sum, item) => sum + toNumber(item.bonus_amount), 0).toFixed(2));
  return {
    batch_key: buildBatchKey(yearMonth, recommenderId),
    batch_no: existingBatch?.batch_no || buildBatchNo(year, month, recommenderId),
    recommender_id: recommenderId,
    recommender_name: recommenderName,
    year, month, year_month: yearMonth,
    candidate_count: candidateCount,
    detail_count: candidateCount,
    total_hours: totalHours,
    total_bonus: totalBonus,
    approved_count: status === 'approved' ? candidateCount : 0,
    paid_count: status === 'paid' ? candidateCount : 0,
    status,
    calculated_by: normalizeId(operator.uid),
    calculated_by_name: operator.name || '',
    calculated_at: db.serverDate(),
    updated_at: db.serverDate(),
    ...(existingBatch?.created_at ? {} : { created_at: db.serverDate() })
  };
}

// ★ N+1 FIX: 使用 where 条件批量删除，替代原来逐条 doc().remove()
async function removeBatchDetails(batchId) {
  if (!batchId) return;
  // CloudBase where().remove() 一次最多删除 100 条，需要循环
  let removed;
  do {
    removed = await db.collection(BONUS_COLLECTION).where({ batch_id: batchId }).limit(100).remove();
  } while (removed.stats && removed.stats.removed > 0);
}

async function upsertBatchAndDetails(batchPayload, items, existingBatchId) {
  let batchId = existingBatchId;
  if (batchId) {
    await db.collection(BATCH_COLLECTION).doc(batchId).update({ data: batchPayload });
    await removeBatchDetails(batchId);
  } else {
    const res = await db.collection(BATCH_COLLECTION).add({ data: batchPayload });
    batchId = res.id;
  }

  // 小批量并发写入（每批 10 条）
  const BATCH_SIZE = 10;
  for (let i = 0; i < items.length; i += BATCH_SIZE) {
    const batch = items.slice(i, i + BATCH_SIZE);
    await Promise.all(batch.map((item) =>
      db.collection(BONUS_COLLECTION).add({
        data: {
          ...item,
          batch_id: batchId,
          batch_no: batchPayload.batch_no,
          year_month: batchPayload.year_month,
          created_at: db.serverDate(),
          updated_at: db.serverDate()
        }
      })
    ));
  }
  return batchId;
}

async function cancelMissingCalculatedBatches(existingBatchMap, nextBatchKeys) {
  for (const [batchKey, batch] of existingBatchMap.entries()) {
    if (nextBatchKeys.has(batchKey)) continue;
    if (FINAL_BATCH_STATUSES.has(String(batch.status || ''))) continue;
    const batchId = normalizeId(batch._id || batch.id);
    if (!batchId) continue;
    await removeBatchDetails(batchId);
    await db.collection(BATCH_COLLECTION).doc(batchId).update({
      data: {
        candidate_count: 0, detail_count: 0, total_hours: 0, total_bonus: 0,
        approved_count: 0, paid_count: 0, status: 'cancelled', updated_at: db.serverDate()
      }
    });
  }
}

async function calculateBatchInternal(params, operator) {
  const year = toNumber(params.year);
  const month = toNumber(params.month);
  const recommenderFilter = normalizeId(params.recommender_id);
  const forceRecalculate = !!params.force_recalculate;
  if (!year || !month) throw new Error('缺少结算年月');

  const { yearMonth } = getMonthDateRange(year, month);
  const targetDate = `${yearMonth}-${String(daysInMonth(year, month)).padStart(2, '0')}`;

  const [employeesMap, employeeCompanyMap, rules, companyMap, userNameMap, worktimeResult, jobsMap, salaryMap, financeConfigMap] = await Promise.all([
    loadEmployeesMap(db),
    loadEmployeeCompanyMap(db),
    loadRulesForMonth(db, year, month),
    loadMapByCollection(db, COMPANY_COLLECTION, 'name'),
    loadUserNameMap(db),
    loadApprovedWorktimeMap(db, year, month),
    loadJobsMap(db),
    loadSalaryMap(db, year, month),
    loadFinanceConfigMap(db)
  ]);

  if (!rules.length) {
    return {
      year, month, year_month: yearMonth,
      worktime_source: worktimeResult.collectionName,
      batch_count: 0, detail_count: 0,
      created_batches: 0, updated_batches: 0, skipped_finalized_batches: 0,
      skipped_employees: [],
      errors: [{ employee_id: '', employee_name: '', reason: '未找到可用提成规则，请先创建 recruitment_bonus_rules 数据' }],
      results: []
    };
  }

  const batchesRaw = await fetchAllDocuments(db.collection(BATCH_COLLECTION).where({ year, month }));
  const existingBatchMap = new Map(
    (batchesRaw || [])
      .filter((item) => !recommenderFilter || normalizeId(item.recommender_id) === recommenderFilter)
      .map((item) => [String(item.batch_key || buildBatchKey(yearMonth, normalizeId(item.recommender_id))), item])
  );

  const groupedDetails = new Map();
  const skippedEmployees = [];
  const errors = [];

  for (const employee of employeesMap.values()) {
    const employeeId = normalizeId(employee._id || employee.id);
    const recommenderId = normalizeId(employee.referrer_id || employee.recommender_id);
    if (!employeeId || !recommenderId) continue;
    if (recommenderFilter && recommenderId !== recommenderFilter) continue;
    if (!ACTIVE_EMPLOYEE_STATUSES.has(String(employee.status || ''))) continue;

    const relation = employeeCompanyMap.get(employeeId) || {};
    const companyId = normalizeId(employee.company_id || relation.company_id);
    const joinDate = formatDateInput(employee.join_date || relation.join_date);
    if (!companyId || !joinDate) {
      skippedEmployees.push({ employee_id: employeeId, reason: '缺少企业或入职日期' });
      continue;
    }
    if (!isEligibleByJoinDate(joinDate, year, month)) {
      skippedEmployees.push({ employee_id: employeeId, reason: '未满足入职满7天' });
      continue;
    }

    const rule = resolveRule(rules, recommenderId, companyId);
    if (!rule) {
      errors.push({ employee_id: employeeId, employee_name: employee.name || '', reason: '未匹配到提成规则' });
      continue;
    }

    const bonusPeriod = resolveBonusPeriod(rule, joinDate);
    const monthRange = getMonthDateRange(year, month);
    const eligibleWindow = getDateOverlap(
      monthRange.start, monthRange.end,
      joinDate,
      formatDateInput(employee.leave_date || relation.leave_date) || monthRange.end
    );
    const cycleWindow = getDateOverlap(
      eligibleWindow?.start || '', eligibleWindow?.end || '',
      joinDate,
      bonusPeriod.bonus_period_end_date || eligibleWindow?.end || ''
    );
    if (!cycleWindow) {
      skippedEmployees.push({ employee_id: employeeId, reason: '已超出提成周期' });
      continue;
    }

    const eligibleDays = getDateDiffDays(cycleWindow.start, cycleWindow.end);
    const calculationMode = normalizeCalculationMode(rule.calculation_mode);
    const worktimeKey = `${employeeId}__${companyId}`;
    const totalHours = getEligibleHours(worktimeResult.worktimeEntriesMap, worktimeKey, cycleWindow.start, cycleWindow.end);
    if (calculationMode === 'hourly' && totalHours <= 0) {
      skippedEmployees.push({ employee_id: employeeId, reason: '当月无有效工时' });
      continue;
    }

    const salary = salaryMap.get(worktimeKey);
    const salaryGrossAmount = toNumber(salary && (salary.gross_pay || salary.total_amount));
    const salaryTotalDays = toNumber(salary && salary.total_days);
    const grossSalaryAmount = salaryGrossAmount > 0 && salaryTotalDays > 0 && eligibleDays > 0
      ? Number((salaryGrossAmount * Math.min(eligibleDays, salaryTotalDays) / salaryTotalDays).toFixed(2))
      : salaryGrossAmount;
    const jobId = normalizeId(employee.job_id || salary?.job_id || relation.job_id);
    const financeConfig = resolveFinanceConfig(financeConfigMap, jobsMap, jobId, targetDate);
    const serviceFeeAmount = calculateServiceFeeAmount({
      year, month, totalHours, eligibleDays, joinDate,
      leaveDate: formatDateInput(employee.leave_date || relation.leave_date),
      salary, config: financeConfig
    });

    if (calculationMode === 'gross_salary' && grossSalaryAmount <= 0) {
      errors.push({ employee_id: employeeId, employee_name: employee.name || '', reason: '按应发工资计提但未找到有效薪资数据' });
      continue;
    }

    const calculationResult = calculateBonusByRule({
      rule, totalHours, serviceFeeAmount, grossSalaryAmount, eligibleDays, year, month
    });
    if (calculationMode === 'service_fee' && calculationResult.bonus_amount <= 0) {
      errors.push({ employee_id: employeeId, employee_name: employee.name || '', reason: '按在职时长计提但未计算出有效提成金额' });
      continue;
    }
    const batchKey = buildBatchKey(yearMonth, recommenderId);
    const current = groupedDetails.get(batchKey) || [];
    current.push({
      recommender_id: recommenderId,
      recommender_name: String(rule.recommender_name || userNameMap.get(recommenderId) || employee.referrer_name || ''),
      employee_id: employeeId,
      candidate_name: String(employee.name || ''),
      company_id: companyId,
      company_name: String(employee.company_name || companyMap.get(companyId) || ''),
      join_date: joinDate,
      rule_id: normalizeId(rule._id || rule.id),
      bonus_period_type: bonusPeriod.bonus_period_type,
      bonus_period_months: bonusPeriod.bonus_period_months,
      bonus_period_end_date: bonusPeriod.bonus_period_end_date,
      eligible_start_date: cycleWindow.start,
      eligible_end_date: cycleWindow.end,
      calculation_mode: calculationResult.calculation_mode,
      hourly_coefficient: toNumber(rule.hourly_coefficient),
      service_fee_rate: toNumber(rule.service_fee_rate),
      gross_salary_rate: toNumber(rule.gross_salary_rate),
      calculation_base_amount: calculationResult.calculation_base_amount,
      service_fee_amount: serviceFeeAmount,
      gross_salary_amount: grossSalaryAmount,
      rule_value: calculationResult.rule_value,
      total_hours: totalHours,
      bonus_amount: calculationResult.bonus_amount,
      year, month, year_month: yearMonth, status: 'pending'
    });
    groupedDetails.set(batchKey, current);
  }

  const nextBatchKeys = new Set(groupedDetails.keys());
  await cancelMissingCalculatedBatches(existingBatchMap, nextBatchKeys);

  const results = [];
  let createdBatches = 0, updatedBatches = 0, skippedFinalized = 0, totalDetails = 0;

  for (const [batchKey, items] of groupedDetails.entries()) {
    const recommenderId = normalizeId(items[0]?.recommender_id);
    const recommenderName = String(items[0]?.recommender_name || '');
    const existingBatch = existingBatchMap.get(batchKey);
    const existingStatus = String(existingBatch?.status || '');
    if (existingBatch && FINAL_BATCH_STATUSES.has(existingStatus) && !forceRecalculate) {
      skippedFinalized++;
      continue;
    }

    const batchPayload = buildBatchPayload({
      existingBatch, year, month, yearMonth, recommenderId, recommenderName,
      items, operator, status: 'calculated'
    });
    const batchId = await upsertBatchAndDetails(batchPayload, items, normalizeId(existingBatch?._id || existingBatch?.id));

    if (existingBatch) updatedBatches++;
    else createdBatches++;
    totalDetails += items.length;
    results.push({
      batch_id: batchId, batch_no: batchPayload.batch_no,
      recommender_id: recommenderId, recommender_name: recommenderName,
      detail_count: items.length, total_bonus: batchPayload.total_bonus,
      total_hours: batchPayload.total_hours, status: batchPayload.status
    });
  }

  return {
    year, month, year_month: yearMonth,
    worktime_source: worktimeResult.collectionName,
    batch_count: results.length, detail_count: totalDetails,
    created_batches: createdBatches, updated_batches: updatedBatches,
    skipped_finalized_batches: skippedFinalized,
    skipped_employees: skippedEmployees, errors, results
  };
}

async function getBatchRecords(batchId) {
  const companyMap = await loadMapByCollection(db, COMPANY_COLLECTION, 'name');
  const detailDocs = await fetchAllDocuments(db.collection(BONUS_COLLECTION).where({ batch_id: batchId }));
  return detailDocs
    .map((item) => normalizeDetail(item, companyMap))
    .sort((a, b) => String(a.candidate_name || '').localeCompare(String(b.candidate_name || ''), 'zh-CN'));
}

// ★ N+1 FIX: 批量 where + update 替代逐条更新
async function batchUpdateDetailStatus(batchId, statusUpdate) {
  if (!batchId) return 0;
  const details = await fetchAllDocuments(db.collection(BONUS_COLLECTION).where({ batch_id: batchId }));
  const toUpdate = details.filter((item) => {
    const s = String(item.status || 'pending');
    return s !== 'paid'; // 已发放的不再更新
  });
  // CloudBase where().update() 一次最多更新 100 条
  // 用 batch_id 条件 + status 条件批量更新
  if (toUpdate.length > 0) {
    await db.collection(BONUS_COLLECTION).where({
      batch_id: batchId,
      status: _.neq('paid')
    }).update({ data: statusUpdate });
  }
  return details.length;
}

module.exports = {
  BONUS_COLLECTION,
  BATCH_COLLECTION,
  FINAL_BATCH_STATUSES,
  normalizeDetail,
  normalizeBatch,
  buildBatchKey,
  buildBatchNo,
  buildBatchPayload,
  removeBatchDetails,
  upsertBatchAndDetails,
  cancelMissingCalculatedBatches,
  calculateBatchInternal,
  getBatchRecords,
  batchUpdateDetailStatus,
  formatDateInput,
  toIsoString
};
