/**
 * calculate-bonus.js (v2 facade)
 * 7 个导出 API + matchBonusRule
 * 原 1880+ 行 → 精简为 ~150 行门面层
 */
const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();

const { success, error } = require('./response');
const { fetchAllDocuments } = require('./common/pagination');
const { formatYearMonth } = require('./common/date-utils');
const { normalizeCalculationMode, resolveRule } = require('./bonus-rules');
const { normalizeId, toNumber, loadRulesForMonth } = require('./bonus-data');
const {
  BONUS_COLLECTION, BATCH_COLLECTION,
  normalizeBatch, calculateBatchInternal,
  getBatchRecords, batchUpdateDetailStatus
} = require('./bonus-batch');

/**
 * 计算单条提成
 */
exports.calculateBonus = async (params, operator) => {
  const { recommender_id, employee_id, company_id, year, month } = params;
  const result = await calculateBatchInternal({ year, month, recommender_id, force_recalculate: true }, operator);
  const targetBatch = (result.results || []).find((item) => normalizeId(item.recommender_id) === normalizeId(recommender_id));
  const details = targetBatch ? await getBatchRecords(targetBatch.batch_id) : [];
  const targetDetail = details.find((item) => normalizeId(item.employee_id) === normalizeId(employee_id) && normalizeId(item.company_id) === normalizeId(company_id));
  if (!targetDetail) return success(null, '未生成提成记录');
  return success({
    bonus_id: targetDetail._id,
    batch_id: targetBatch.batch_id,
    recommender_name: targetDetail.recommender_name,
    candidate_name: targetDetail.candidate_name,
    calculation_mode: targetDetail.calculation_mode,
    calculation_base_amount: targetDetail.calculation_base_amount,
    total_hours: targetDetail.total_hours,
    coefficient: targetDetail.rule_value,
    bonus_amount: targetDetail.bonus_amount,
    year: targetDetail.year,
    month: targetDetail.month
  }, '提成计算完成');
};

/**
 * 批量计算提成
 */
exports.calculateBonusBatch = async (params, operator) => {
  const result = await calculateBatchInternal(params, operator);
  return success(result, '批量提成计算完成');
};

/**
 * 提成批次汇总
 */
exports.getBonusSummary = async (params) => {
  const year = toNumber(params.year);
  const month = toNumber(params.month);
  const yearMonth = String(params.year_month || (year && month ? formatYearMonth(year, month) : ''));
  const recommenderId = normalizeId(params.recommender_id || params.hr_id);
  const status = String(params.status || '').trim();
  const page = Math.max(1, toNumber(params.page) || 1);
  const pageSize = Math.max(1, toNumber(params.pageSize) || 20);

  const allBatches = await fetchAllDocuments(db.collection(BATCH_COLLECTION));
  let list = allBatches.map(normalizeBatch);
  if (yearMonth) list = list.filter((item) => item.year_month === yearMonth);
  if (recommenderId) list = list.filter((item) => item.recommender_id === recommenderId);
  if (status) list = list.filter((item) => item.status === status);

  list.sort((a, b) => String(b.year_month).localeCompare(String(a.year_month)) || String(b.updated_at || '').localeCompare(String(a.updated_at || '')));
  const total = list.length;
  const paged = list.slice((page - 1) * pageSize, page * pageSize);
  return success({ list: paged, total, page, pageSize }, '查询提成批次成功');
};

/**
 * 提成明细
 */
exports.getBonusDetail = async (params) => {
  const batchId = normalizeId(params.batch_id);
  if (!batchId) return error(400, '缺少批次ID');
  const batchRes = await db.collection(BATCH_COLLECTION).doc(batchId).get();
  const batchDoc = Array.isArray(batchRes.data) ? batchRes.data[0] : batchRes.data;
  if (!batchDoc || !normalizeId(batchDoc._id || batchDoc.id)) return error(404, '提成批次不存在');
  const details = await getBatchRecords(batchId);
  return success({ batch: normalizeBatch(batchDoc), details }, '查询提成明细成功');
};

/**
 * ★ N+1 FIX: 审核使用 where().update() 批量更新
 */
exports.approveBonusBatch = async (params, operator) => {
  const batchId = normalizeId(params.batch_id);
  if (!batchId) return error(400, '缺少批次ID');
  const batchRes = await db.collection(BATCH_COLLECTION).doc(batchId).get();
  const batchDoc = Array.isArray(batchRes.data) ? batchRes.data[0] : batchRes.data;
  if (!batchDoc || !normalizeId(batchDoc._id || batchDoc.id)) return error(404, '提成批次不存在');
  if (normalizeBatch(batchDoc).status === 'paid') return error(400, '已发放批次不能再审核');

  const approvedCount = await batchUpdateDetailStatus(batchId, {
    status: 'approved',
    approved_by: normalizeId(operator.uid),
    approved_by_name: operator.name || '',
    approved_at: db.serverDate(),
    updated_at: db.serverDate()
  });

  await db.collection(BATCH_COLLECTION).doc(batchId).update({
    data: {
      status: 'approved', approved_count: approvedCount,
      approved_by: normalizeId(operator.uid),
      approved_by_name: operator.name || '',
      approved_at: db.serverDate(), updated_at: db.serverDate()
    }
  });
  return success({ batch_id: batchId, approved_count: approvedCount }, '提成批次审核成功');
};

/**
 * 批量审核
 */
exports.batchApproveBonusBatches = async (params, operator) => {
  const batchIds = Array.from(new Set((params.batch_ids || []).map((item) => normalizeId(item)).filter(Boolean)));
  if (!batchIds.length) return error(400, '缺少批次ID');
  const results = [];
  for (const batchId of batchIds) {
    const result = await exports.approveBonusBatch({ batch_id: batchId }, operator);
    if (result.code !== 0) throw new Error(result.message || '批量审核失败');
    results.push(result.data);
  }
  return success({ batch_ids: batchIds, results }, '批量审核成功');
};

/**
 * ★ N+1 FIX: 标记发放使用 where().update() 批量更新
 */
exports.markBonusBatchPaid = async (params, operator) => {
  const batchId = normalizeId(params.batch_id);
  if (!batchId) return error(400, '缺少批次ID');

  const paidCount = await batchUpdateDetailStatus(batchId, {
    status: 'paid',
    paid_by: normalizeId(operator.uid),
    paid_by_name: operator.name || '',
    paid_at: db.serverDate(),
    updated_at: db.serverDate()
  });

  await db.collection(BATCH_COLLECTION).doc(batchId).update({
    data: {
      status: 'paid', paid_count: paidCount,
      paid_by: normalizeId(operator.uid),
      paid_by_name: operator.name || '',
      paid_at: db.serverDate(), updated_at: db.serverDate()
    }
  });
  return success({ batch_id: batchId, paid_count: paidCount }, '提成批次已标记发放');
};

/**
 * 匹配提成规则（公开接口）
 */
exports.matchBonusRule = async (recommenderId, companyId, year, month) => {
  const rules = await loadRulesForMonth(db, year, month);
  return resolveRule(rules, normalizeId(recommenderId), normalizeId(companyId));
};
