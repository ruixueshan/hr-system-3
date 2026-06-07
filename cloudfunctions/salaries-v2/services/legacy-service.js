/**
 * salaries-v2 薪资发放模块
 * 
 * 关键优化：
 * 1. handleBankTransfer: 批量查询 employees/companies 替代 N+1 逐条查询
 *    原: 1000条薪资 → 3000次 doc().get()  
 *    新: 1000条薪资 → 2次 where(_.in) 批量查询
 * 2. getDailyPlanForWorktime: 缓存 employee/employeeCompany/job/plan 避免重复查询
 * 3. handleMyList: 并行化查询
 */
const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();
const _ = db.command;

async function writeOpsMetric(payload = {}) {
  try {
    await db.collection('operation_metrics').add({
      metric_type: 'monthly_salary_pipeline',
      created_at: new Date(),
      ...payload
    });
  } catch (err) {
    const text = String(err?.message || err || '');
    if (text.includes('collection not exists') || text.includes('Db or Table not exist') || text.includes('ResourceNotFound')) return;
    console.warn('[salary.writeOpsMetric] 写入失败:', err?.message || err);
  }
}

const {
  ensureInsuranceLedger,
  listInsuranceLedgers,
  applyInsuranceDeduction
} = require('../insurance-ledger');
const {
  consumeLedgerIds,
  pickUnconsumedLedgers
} = require('./daily-insurance-allocation');
const {
  SALARY_INSURANCE_V2_START_MONTH,
  isInsuranceMonthInV2Scope
} = require('../runtime-config');
const { getEmployeeSalaries } = require('../salary-query');
const { fetchAllDocuments } = require('../pagination');

function success(data = null, message = 'success') {
  return { code: 0, message, data };
}
function error(code = 1, message = 'error', data = null) {
  return { code, message, data };
}
function roundMoney(value) {
  return Math.round((Number(value) || 0) * 100) / 100;
}
function normalizeTransferRemark(value) {
  return String(value || '').replace(/\s+/g, '');
}
function normalizeDate(value) {
  if (!value) return '';
  const text = String(value);
  const match = text.match(/^(\d{4}-\d{2}-\d{2})/);
  if (match) return match[1];
  const parsed = new Date(text);
  if (Number.isNaN(parsed.getTime())) return '';
  return parsed.toISOString().slice(0, 10);
}
function normalizeSortTime(value) {
  if (!value) return 0;
  if (typeof value === 'number') return value;
  if (value instanceof Date) return value.getTime() || 0;
  if (typeof value === 'object' && value.$date) return normalizeSortTime(value.$date);
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? 0 : parsed.getTime();
}
function getSalarySortTime(item = {}) {
  return normalizeSortTime(item.created_at)
    || normalizeSortTime(item.updated_at)
    || normalizeSortTime(item.pay_date)
    || normalizeSortTime(item.work_date);
}
function normalizeYearMonth(value) {
  const dateText = normalizeDate(value);
  if (dateText) return dateText.slice(0, 7);
  const text = String(value || '');
  const ymMatch = text.match(/^(\d{4}-\d{2})$/);
  return ymMatch ? ymMatch[1] : '';
}
function diffDays(start, end) {
  const s = new Date(start || 0).getTime();
  const e = new Date(end || 0).getTime();
  if (!s || !e || Number.isNaN(s) || Number.isNaN(e) || e < s) return null;
  return Math.round((e - s) / (24 * 60 * 60 * 1000));
}
function buildYearMonth(year, month) {
  return `${year}-${String(month).padStart(2, '0')}`;
}
function getPreviousYearMonth(yearMonth) {
  const normalized = normalizeYearMonth(yearMonth);
  if (!normalized) return '';
  const [year, month] = normalized.split('-').map(Number);
  const baseDate = new Date(year, month - 1, 1);
  baseDate.setMonth(baseDate.getMonth() - 1);
  return buildYearMonth(baseDate.getFullYear(), baseDate.getMonth() + 1);
}
function getNextYearMonth(yearMonth) {
  const normalized = normalizeYearMonth(yearMonth);
  if (!normalized) return '';
  const [year, month] = normalized.split('-').map(Number);
  const baseDate = new Date(year, month - 1, 1);
  baseDate.setMonth(baseDate.getMonth() + 1);
  return buildYearMonth(baseDate.getFullYear(), baseDate.getMonth() + 1);
}
function getMonthEnd(yearMonth) {
  const [year, month] = normalizeYearMonth(yearMonth).split('-').map(Number);
  return `${yearMonth}-${String(new Date(year, month, 0).getDate()).padStart(2, '0')}`;
}
function isRelationOverlappingYearMonth(relation, yearMonth) {
  const normalized = normalizeYearMonth(yearMonth);
  if (!relation || !normalized) return false;
  const monthStart = `${normalized}-01`;
  const monthEnd = getMonthEnd(normalized);
  const joinDate = normalizeDate(relation.join_date);
  const leaveDate = normalizeDate(relation.leave_date);
  if (joinDate && joinDate > monthEnd) return false;
  if (leaveDate && leaveDate < monthStart) return false;
  return true;
}
function getDueDailyInsuranceMonths(currentYearMonth) {
  const lastDueMonth = getPreviousYearMonth(currentYearMonth);
  if (!lastDueMonth || lastDueMonth < SALARY_INSURANCE_V2_START_MONTH) return [];
  const months = [];
  for (let cursor = SALARY_INSURANCE_V2_START_MONTH; cursor <= lastDueMonth; cursor = getNextYearMonth(cursor)) {
    months.push(cursor);
  }
  return months;
}
function buildDailySalarySourceId(worktimeId) {
  return `salary_daily:${worktimeId || ''}`;
}
function normalizeSettlementMode(value) {
  const mode = String(value || '').trim().toLowerCase();
  if (mode === '日结') return 'daily';
  if (mode === '月结') return 'monthly';
  return mode;
}
function parsePreviewDueLedgerIds(detail) {
  if (!detail) return new Set();
  let parsed = detail;
  if (typeof detail === 'string') {
    try {
      parsed = JSON.parse(detail);
    } catch (e) {
      return new Set();
    }
  }
  const ids = Array.isArray(parsed?.due_ledger_ids) ? parsed.due_ledger_ids : [];
  return new Set(ids.map((id) => String(id || '')).filter(Boolean));
}

// ----- source_type 推断 (与 v1 相同) -----
const SOURCE_TYPE_ALIAS_MAP = {
  salary_daily: 'salary_daily', daily_salary: 'salary_daily', daily: 'salary_daily',
  '日结工资': 'salary_daily', '日结薪资': 'salary_daily',
  salary_monthly: 'salary_monthly', monthly_salary: 'salary_monthly', monthly: 'salary_monthly',
  '月结工资': 'salary_monthly', '月结薪资': 'salary_monthly',
  deposit: 'deposit', '押金发放': 'deposit', '押金返还': 'deposit',
  project_reimbursement: 'project_reimbursement', reimbursement: 'project_reimbursement', '项目报销': 'project_reimbursement'
};
function normalizeSourceTypeValue(value) {
  const raw = String(value || '').trim();
  if (!raw) return '';
  return SOURCE_TYPE_ALIAS_MAP[raw] || SOURCE_TYPE_ALIAS_MAP[raw.toLowerCase()] || '';
}
function normalizeTextValue(value) {
  return String(value || '').trim();
}
function pickPreferredEmployee(list = []) {
  const candidates = (Array.isArray(list) ? list : []).filter(Boolean);
  if (!candidates.length) return null;

  const score = (item) => {
    const status = normalizeTextValue(item.status).toLowerCase();
    const merged = normalizeTextValue(item.merged_into_employee_id);
    const activeScore = ['regular', 'probation'].includes(status) ? 100 : 0;
    const mergedScore = merged ? -1000 : 0;
    const updatedAt = new Date(item.updated_at || item.created_at || 0).getTime() || 0;
    return activeScore + mergedScore + updatedAt / 1e13;
  };

  return [...candidates].sort((a, b) => score(b) - score(a))[0];
}
function tryParseDetails(details) {
  if (!details) return {};
  if (typeof details === 'object') return details;
  if (typeof details !== 'string') return {};
  try { return JSON.parse(details); } catch (e) { return {}; }
}
function getNormalizedRemarkText(item = {}, details = {}) {
  return [item.pay_remark, item.remark, item.source, details.original_remark, details.remark, details.pay_remark]
    .map((v) => String(v || '').trim()).join(' ');
}
function inferSalarySourceType(item = {}) {
  const explicitType = normalizeSourceTypeValue(item.source_type || item.sourceType);
  if (explicitType) return explicitType;
  const sourceId = String(item.source_id || '');
  if (sourceId.startsWith('salary_daily:')) return 'salary_daily';
  if (sourceId.startsWith('salary_monthly:')) return 'salary_monthly';
  if (sourceId.startsWith('deposit:')) return 'deposit';
  if (sourceId.startsWith('project_reimbursement:')) return 'project_reimbursement';
  const details = tryParseDetails(item.details);
  const detailsType = normalizeSourceTypeValue(details.source_type || details.sourceType);
  if (detailsType) return detailsType;
  if (details.reimbursement_to_user_id || details.period_start) return 'project_reimbursement';
  if (details.worktime_id || details.worktimeId || item.worktime_id || item.work_date || Array.isArray(details.salaryDetails)) return 'salary_daily';
  if (item.source_summary_id || details.source_summary_id) return 'salary_monthly';
  const remarkText = getNormalizedRemarkText(item, details);
  if (remarkText.includes('项目报销')) return 'project_reimbursement';
  if (remarkText.includes('押金')) return 'deposit';
  if (remarkText.includes('日结')) return 'salary_daily';
  if (remarkText.includes('月结')) return 'salary_monthly';
  if (item.settlement_mode === 'daily') return 'salary_daily';
  if (item.settlement_mode === 'monthly') return 'salary_monthly';
  return '';
}
function inferSalarySourceId(item = {}) {
  if (item.source_id) return String(item.source_id || '').trim();
  const sourceType = inferSalarySourceType(item);
  const details = tryParseDetails(item.details);
  const worktimeId = String(details.worktime_id || details.worktimeId || item.worktime_id || '').trim();
  const reimbursementId = String(details.source_id || details.reimbursement_id || item.reimbursement_id || '').trim();
  if (sourceType === 'salary_daily') { return worktimeId ? buildDailySalarySourceId(worktimeId) : `salary_daily:${item.employee_id || ''}:${item.company_id || ''}:${item.year_month || ''}`; }
  if (sourceType === 'salary_monthly') { return `salary_monthly:${item.employee_id || ''}:${item.company_id || ''}:${item.year_month || ''}`; }
  if (sourceType === 'deposit') { return worktimeId ? `deposit:${worktimeId}` : `deposit:${item.employee_id || ''}:${item.company_id || ''}:${item.year_month || ''}`; }
  if (sourceType === 'project_reimbursement') return reimbursementId || '';
  return '';
}
function normalizeSalarySourceFields(item = {}) {
  const source_type = inferSalarySourceType(item);
  const source_id = inferSalarySourceId({ ...item, source_type });
  return { ...item, source_type, source_id };
}
async function backfillSalarySourceFields(records = []) {
  if (!Array.isArray(records) || !records.length) return;
  const tasks = [];
  for (const row of records) {
    if (!row || !row._id) continue;
    const inferredType = inferSalarySourceType(row);
    const inferredId = inferSalarySourceId({ ...row, source_type: inferredType });
    const normalizedCurrentType = normalizeSourceTypeValue(row.source_type || row.sourceType);
    const currentId = String(row.source_id || '').trim();
    const patch = {};
    if (inferredType && normalizedCurrentType !== inferredType) patch.source_type = inferredType;
    if (inferredId && (!currentId || (inferredType === 'project_reimbursement' && currentId.startsWith('project_reimbursement:') && currentId !== inferredId))) patch.source_id = inferredId;
    if (Object.keys(patch).length) { patch.updated_at = db.serverDate(); tasks.push(db.collection('salaries').doc(row._id).update({ data: patch })); }
  }
  if (tasks.length) await Promise.allSettled(tasks);
}

// Token 验证
async function verifyToken(token) {
  try {
    if (!token) return null;
    const tokenDoc = await db.collection('login_tokens').where({ token, status: 'logged', expire_time: _.gt(Date.now()) }).get();
    if (!tokenDoc.data.length) return null;
    const user = await db.collection('users').doc(tokenDoc.data[0].user_id).get();
    return user.data || null;
  } catch (e) {
    console.error('[salaries-v2] verifyToken failed:', e);
    return null;
  }
}

async function loadSalaryRelationMap(rows = []) {
  const employeeIds = [...new Set((rows || []).map((item) => item.employee_id).filter(Boolean))];
  const relationMap = new Map();
  const batchSize = 100;

  for (let i = 0; i < employeeIds.length; i += batchSize) {
    const chunk = employeeIds.slice(i, i + batchSize);
    const res = await db.collection('employee_companies')
      .where({ employee_id: _.in(chunk) })
      .get();
    (res.data || []).forEach((relation) => {
      const key = `${relation.employee_id || ''}__${relation.company_id || ''}`;
      relationMap.set(key, [...(relationMap.get(key) || []), relation]);
    });
  }

  return relationMap;
}

function pickSalaryRelation(row, relationMap) {
  const key = `${row.employee_id || ''}__${row.company_id || ''}`;
  const relations = relationMap.get(key) || [];
  if (!relations.length) return null;

  const yearMonth = normalizeYearMonth(row.year_month || (row.year && row.month ? buildYearMonth(row.year, row.month) : ''));
  const workDate = normalizeDate(row.work_date);
  const matched = relations
    .filter((relation) => {
      if (workDate) return isRelationAvailableOnDate(relation, workDate);
      if (yearMonth) return isRelationOverlappingYearMonth(relation, yearMonth);
      return true;
    })
    .sort((a, b) => {
      const at = new Date(a.updated_at || a.created_at || 0).getTime() || 0;
      const bt = new Date(b.updated_at || b.created_at || 0).getTime() || 0;
      return bt - at;
    })[0];

  return matched || relations[0] || null;
}

// ========= handleCalculate（与 v1 相同） =========
async function handleCalculate(data) {
  const { company_id, employee_id, year, month, settlement_mode = 'monthly', token } = data;
  if (!company_id || !year || !month) return error(400, '缺少 company_id/year/month');
  const operator = await verifyToken(token) || { uid: 'system', name: 'system' };
  const { calculateSalary } = require('../calculate-salary');
  if (employee_id) {
    await calculateSalary({ employee_id, company_id, year, month, settlement_mode }, operator);
    return success(null, '单人薪资已计算');
  }
  const allCalc = require('../calculate-all');
  const result = await allCalc.calculateAll({ company_id, year, month, settlement_mode }, operator);
  if (result && typeof result.code === 'number' && result.code !== 0) {
    return result;
  }
  const summary = result.data || {};
  const salarySummary = summary.salary || {};
  return success({
    ...summary,
    salary_count: Number(salarySummary.total || 0),
    salary_success: Number(salarySummary.total || 0),
    salary_skipped: Number(salarySummary.skipped || 0),
    salary_failed: Number(salarySummary.failed || 0),
    salary_errors: [
      ...(Array.isArray(salarySummary.failedDetails) ? salarySummary.failedDetails : []),
      ...(Array.isArray(salarySummary.skippedDetails) ? salarySummary.skippedDetails : [])
    ]
  }, result.message || '批量薪资计算完成');
}

// ========= handleList（与 v1 相同） =========
async function handleList(params = {}) {
  const {
    company_id,
    employee_id,
    employee_name,
    status,
    settlement_mode,
    source_type,
    month,
    pay_date,
    start_date,
    end_date,
    year,
    page = 1,
    pageSize = 50,
    include_summary = false
  } = params;
  const conditions = {};
  if (company_id) conditions.company_id = company_id;
  if (employee_id) conditions.employee_id = employee_id;
  if (status) conditions.status = status;
  const shouldInferDailySourceFilter = settlement_mode === 'daily' && source_type === 'salary_daily';
  if (source_type && !shouldInferDailySourceFilter) conditions.source_type = source_type;
  if (pay_date) conditions.pay_date = pay_date;
  if (start_date && end_date) conditions.work_date = _.gte(start_date).lte(end_date);
  else if (start_date) conditions.work_date = _.gte(start_date);
  else if (end_date) conditions.work_date = _.lte(end_date);
  if (month) {
    const [y, m] = month.split('-').map(Number);
    conditions.year = y;
    conditions.month = m;
  } else if (year) {
    conditions.year = year;
  }

  // 【优化】settlement_mode 直接加入数据库条件（兼容新旧数据）
  // 新数据：salaries.settlement_mode 有值；旧数据：通过关联表查询
  let useDatabaseSettlementFilter = false;
  let hasSettlementModeCondition = false;
  if (settlement_mode) {
    const normalizedMode = normalizeSettlementMode(settlement_mode);
    // 直接用 settlement_mode 过滤新数据
    conditions.settlement_mode = normalizedMode;
    useDatabaseSettlementFilter = true;
    hasSettlementModeCondition = true;
  }

  const query = db.collection('salaries').where(conditions);
  const currentPage = Math.max(Number(page) || 1, 1);
  const currentPageSize = Math.max(Number(pageSize) || 50, 1);
  const skip = (currentPage - 1) * currentPageSize;
  const employeeNameKeyword = String(employee_name || '').trim().toLowerCase();
  const relationSettlementMode = normalizeSettlementMode(settlement_mode);
  
  // 【优化】如果 settlement_mode 已在数据库层面过滤，则不需要客户端过滤
  // 只有当需要关联查询或其他条件时才需要客户端过滤
  const needsClientFilter = (!useDatabaseSettlementFilter && Boolean(relationSettlementMode)) || shouldInferDailySourceFilter || employeeNameKeyword || include_summary;

  function filterSalaryRows(rows = [], relationMap = new Map()) {
    return rows
      .map((item) => normalizeSalarySourceFields(item))
      .filter((item) => {
        if (relationSettlementMode) {
          if (item.source_type === 'project_reimbursement') {
            if (normalizeSettlementMode(item.settlement_mode) !== relationSettlementMode) return false;
          } else {
            const relation = pickSalaryRelation(item, relationMap);
            if (normalizeSettlementMode(relation?.settlement_mode) !== relationSettlementMode) return false;
          }
        }
        if (shouldInferDailySourceFilter && item.source_type !== 'salary_daily') return false;
        if (employeeNameKeyword) {
          const searchableName = String(item.employee_name || '').toLowerCase();
          const searchableNo = String(item.employee_no || '').toLowerCase();
          if (!searchableName.includes(employeeNameKeyword) && !searchableNo.includes(employeeNameKeyword)) return false;
        }
        return true;
      });
  }

  function buildSalarySummary(rows = []) {
    return {
      total_hours: roundMoney(rows.reduce((sum, item) => sum + (Number(item.total_hours) || 0), 0)),
      net_pay: roundMoney(rows.reduce((sum, item) => sum + (Number(item.net_pay) || 0), 0))
    };
  }

  if (needsClientFilter) {
    let allRows = await fetchAllDocuments(query.orderBy('created_at', 'desc'));
    if (!allRows.length && month && relationSettlementMode === 'monthly') {
      const fallbackConditions = { ...conditions };
      delete fallbackConditions.year;
      delete fallbackConditions.month;
      fallbackConditions.year_month = month;
      allRows = await fetchAllDocuments(
        db.collection('salaries').where(fallbackConditions).orderBy('created_at', 'desc')
      );
    }
    const relationMap = relationSettlementMode ? await loadSalaryRelationMap(allRows) : new Map();
    const filteredRows = filterSalaryRows(allRows, relationMap)
      .sort((a, b) => getSalarySortTime(b) - getSalarySortTime(a));
    const pagedRows = filteredRows.slice(skip, skip + currentPageSize);
    await backfillSalarySourceFields(allRows);
    return success({
      list: pagedRows,
      total: filteredRows.length,
      page: currentPage,
      pageSize: currentPageSize,
      summary: include_summary ? buildSalarySummary(filteredRows) : undefined
    });
  }

  let [countRes, listRes] = await Promise.all([
    query.count(),
    query.orderBy('created_at', 'desc').skip(skip).limit(currentPageSize).get()
  ]);

  let list = listRes.data || [];
  let total = countRes.total || 0;

  // 【优化】如果数据库过滤查不到数据（可能是历史数据没有 settlement_mode），回退到关联查询
  if (total === 0 && hasSettlementModeCondition) {
    console.log('[handleList] 数据库过滤无数据，回退到关联查询（旧数据）');
    // 移除 settlement_mode 条件，使用关联表查询
    delete conditions.settlement_mode;
    const fallbackQuery = db.collection('salaries').where(conditions);
    const [fallbackCountRes, fallbackListRes] = await Promise.all([
      fallbackQuery.count(),
      fallbackQuery.orderBy('created_at', 'desc').get()
    ]);
    let allRows = fallbackListRes.data || [];
    const relationMap = relationSettlementMode ? await loadSalaryRelationMap(allRows) : new Map();
    const filteredRows = filterSalaryRows(allRows, relationMap)
      .sort((a, b) => getSalarySortTime(b) - getSalarySortTime(a));
    const pagedRows = filteredRows.slice(skip, skip + currentPageSize);
    await backfillSalarySourceFields(allRows);
    return success({
      list: pagedRows.map(item => normalizeSalarySourceFields(item)),
      total: filteredRows.length,
      page: currentPage,
      pageSize: currentPageSize,
      summary: include_summary ? buildSalarySummary(filteredRows) : undefined
    });
  }

  // 兼容月结数据：若历史/异常数据的 year/month 未正确写入，但 year_month 已存在，则回退按 year_month 查询
  if (total === 0 && month && settlement_mode === 'monthly') {
    const fallbackConditions = { ...conditions };
    delete fallbackConditions.year;
    delete fallbackConditions.month;
    fallbackConditions.year_month = month;

    const fallbackQuery = db.collection('salaries').where(fallbackConditions);
    const [fallbackCountRes, fallbackListRes] = await Promise.all([
      fallbackQuery.count(),
      fallbackQuery.orderBy('created_at', 'desc').skip(skip).limit(currentPageSize).get()
    ]);
    list = fallbackListRes.data || [];
    total = fallbackCountRes.total || 0;
  }

  const normalizedList = list.map((item) => normalizeSalarySourceFields(item));
  await backfillSalarySourceFields(list);
  return success({ list: normalizedList, total, page: currentPage, pageSize: currentPageSize });
}

// ========= handleApprove / handlePay（与 v1 相同） =========
async function assertSalaryInsuranceConsistency(salary) {
  if (!salary || salary.source_type !== 'salary_monthly' || !salary.insurance_ledger_id) return;
  const ledgerDoc = await db.collection('salary_insurance_ledgers').doc(salary.insurance_ledger_id).get();
  if (!ledgerDoc.data) throw new Error('对应保险台账不存在，不能继续审核/发放');
  const salaryDeduct = roundMoney(Number(salary.insurance_deduct || 0));
  if (salaryDeduct <= 0) return;
  const sourceId = salary.source_id || `salary_monthly:${salary.employee_id || ''}:${salary.company_id || ''}:${salary.year_month || ''}`;
  const deductionRes = await db.collection('salary_insurance_deductions').where({ ledger_id: salary.insurance_ledger_id, source_type: 'salary_monthly', source_id: sourceId }).limit(1).get();
  if (!deductionRes.data?.[0]) throw new Error('保险扣减流水缺失，不能继续审核/发放');
  const ledgerDeduct = roundMoney(Number(deductionRes.data[0].deduct_amount || 0));
  if (salaryDeduct !== ledgerDeduct) throw new Error(`保险台账与工资单不一致：工资单 ${salaryDeduct}，台账 ${ledgerDeduct}`);
}

async function handleApprove(data) {
  const { id, token } = data;
  if (!id) return error(400, '缺少薪资ID');
  const user = await verifyToken(token);
  const salaryDoc = await db.collection('salaries').doc(id).get();
  const salary = salaryDoc.data || null;
  if (!salary) return error(404, '薪资记录不存在');
  if (salary.status !== 'calculated') return error(400, '仅 calculated 状态可审核');
  await assertSalaryInsuranceConsistency(salary);
  await db.collection('salaries').doc(id).update({ data: { status: 'approved', approved_by: user?._id || 'system', approved_at: db.serverDate(), updated_at: db.serverDate() } });
  await writeOpsMetric({
    action: 'approve_single_salary',
    salary_id: id,
    company_id: salary.company_id || '',
    settlement_mode: salary.settlement_mode || '',
    year_month: salary.year_month || ''
  });
  return success(null, '已审核');
}

async function handlePay(data) {
  const { id, pay_date, token } = data;
  if (!id) return error(400, '缺少薪资ID');
  const user = await verifyToken(token);
  const salaryDoc = await db.collection('salaries').doc(id).get();
  const salary = salaryDoc.data || null;
  if (!salary) return error(404, '薪资记录不存在');
  if (salary.status !== 'approved') return error(400, '仅 approved 状态可发放');
  await assertSalaryInsuranceConsistency(salary);
  const payDateValue = pay_date || new Date().toISOString();
  await db.collection('salaries').doc(id).update({ data: { status: 'paid', pay_date: payDateValue, pay_operator: user?.name || 'system', updated_at: db.serverDate() } });
  await writeOpsMetric({
    action: 'pay_single_salary',
    salary_id: id,
    company_id: salary.company_id || '',
    settlement_mode: salary.settlement_mode || '',
    year_month: salary.year_month || '',
    cycle_days_from_calc_to_pay: diffDays(salary.created_at, payDateValue)
  });
  return success(null, '已标记发放');
}

// ========= getDailyPlanForWorktime ★ 带缓存 =========
const _dailyPlanCache = new Map();

async function getLatestEmployeeCompany(employeeId, companyId) {
  const res = await db.collection('employee_companies').where({ employee_id: employeeId, company_id: companyId }).orderBy('updated_at', 'desc').limit(1).get();
  return res.data?.[0] || null;
}

function isRelationAvailableOnDate(relation, dateText) {
  if (!relation || !dateText) return false;
  const joinDate = normalizeDate(relation.join_date);
  const leaveDate = normalizeDate(relation.leave_date);
  if (joinDate && joinDate > dateText) return false;
  if (leaveDate && leaveDate < dateText) return false;
  return true;
}

async function getEmployeeCompanyForWorktime(worktime) {
  const employeeId = worktime.employee_id;
  const companyId = worktime.company_id;
  const workDate = normalizeDate(worktime.work_date);
  const res = await db.collection('employee_companies')
    .where({ employee_id: employeeId, company_id: companyId })
    .orderBy('updated_at', 'desc')
    .get();
  const relations = res.data || [];
  return relations.find((item) => isRelationAvailableOnDate(item, workDate)) || relations[0] || null;
}

async function getDailyPlanForWorktime(worktime) {
  const cacheKey = `${worktime.employee_id}__${worktime.company_id}__${normalizeDate(worktime.work_date)}`;
  if (_dailyPlanCache.has(cacheKey)) return _dailyPlanCache.get(cacheKey);

  const employeeId = worktime.employee_id;
  const companyId = worktime.company_id;

  // ★ 优化: 并行查询 employee + employeeCompany
  const [employeeDoc, employeeCompany] = await Promise.all([
    db.collection('employees').doc(employeeId).get(),
    getEmployeeCompanyForWorktime(worktime)
  ]);
  const employee = employeeDoc.data || {};
  const settlementMode = normalizeSettlementMode(employeeCompany?.settlement_mode);
  if (settlementMode !== 'daily') {
    throw new Error('该工时的员工企业关系不是日结，不能进行日结发薪');
  }

  let ratePlanId = worktime.rate_plan_id || employeeCompany?.rate_plan_id || employee.rate_plan_id || '';
  const jobId = worktime.job_id || employeeCompany?.job_id || employee.job_id || '';

  // ★ 优化: 并行查询 job + plan (如果都需要)
  let job = null, plan = null;
  const promises = [];
  if (jobId) promises.push(db.collection('jobs').doc(jobId).get().then((r) => { job = r.data || null; }));
  if (ratePlanId) promises.push(db.collection('rate_plans').doc(ratePlanId).get().then((r) => { plan = r.data || null; }));
  if (promises.length) await Promise.all(promises);

  // job 查完后可能补充 ratePlanId
  if (!ratePlanId && job?.rate_plan_id) {
    ratePlanId = job.rate_plan_id;
    const planDoc = await db.collection('rate_plans').doc(ratePlanId).get();
    plan = planDoc.data || null;
  }

  let hourlyRate = roundMoney(Number(plan?.hourly_rate_daily || 0));
  if (!hourlyRate) {
    const dailyRate = Number(plan?.daily_rate_daily || 0);
    const payHours = Number(plan?.pay_hours_daily || 8);
    if (dailyRate && payHours) hourlyRate = roundMoney(dailyRate / payHours);
  }
  if (!hourlyRate) hourlyRate = roundMoney(Number(employeeCompany?.hourly_rate ?? job?.hourly_rate ?? employee.hourly_rate ?? 0));

  const nightHourlyRate = Number(plan?.night_hourly_rate_daily ?? plan?.night_hourly_rate ?? 0);
  const nightDailyRate = Number(plan?.night_daily_rate_daily ?? plan?.night_daily_rate ?? 0);
  const dailyRateDaily = Number(plan?.daily_rate_daily || 0);
  const payHoursDaily = Number(plan?.pay_hours_daily || 0);

  const result = { employee, employeeCompany, plan, job, ratePlanId, jobId, hourlyRate, dailyRateDaily, payHoursDaily, nightHourlyRate, nightDailyRate };
  _dailyPlanCache.set(cacheKey, result);
  return result;
}

async function ensureDueDailyInsuranceLedgers(previewContext, collectionAccessor = db) {
  const {
    employee_id,
    company_id,
    year_month,
    employeeCompany,
    ratePlanId,
    plan
  } = previewContext || {};

  if (!employee_id || !company_id || !year_month || !employeeCompany) return [];

  const dueMonths = getDueDailyInsuranceMonths(year_month)
    .filter((insuranceMonth) => isInsuranceMonthInV2Scope(insuranceMonth))
    .filter((insuranceMonth) => isRelationOverlappingYearMonth(employeeCompany, insuranceMonth));

  const results = [];
  for (const insuranceMonth of dueMonths) {
    const ensureResult = await ensureInsuranceLedger({
      employee_id,
      company_id,
      insurance_month: insuranceMonth,
      settlement_mode: 'daily',
      join_date: employeeCompany.join_date,
      leave_date: employeeCompany.leave_date,
      rate_plan_id: ratePlanId || plan?._id || '',
      insurance_daily_deduct: Number(plan?.insurance_daily_deduct || 0),
      insurance_monthly_deduct: Number(plan?.insurance_monthly_deduct || 0)
    }, collectionAccessor);
    if (!ensureResult.skipped && ensureResult.ledger?._id) {
      results.push(ensureResult.ledger);
    }
  }
  return results;
}

// ========= buildDailyPreviewRows（与 v1 逻辑相同，但受益于 getDailyPlanForWorktime 缓存） =========
async function buildDailyPreviewRows(worktimes = []) {
  const sortedWorktimes = [...worktimes].sort((a, b) => {
    const left = `${normalizeDate(a.work_date)}:${a._id || a.worktime_id || ''}`;
    const right = `${normalizeDate(b.work_date)}:${b._id || b.worktime_id || ''}`;
    return left.localeCompare(right);
  });

  const pendingLedgerCache = new Map();
  const consumedLedgerIds = new Set();
  const results = [];

  for (const wt of sortedWorktimes) {
    const worktimeId = wt.worktime_id || wt._id;
    const workDate = normalizeDate(wt.work_date);
    const yearMonth = normalizeYearMonth(workDate);
    const groupKey = `${wt.employee_id}__${wt.company_id}`;

    const { employeeCompany, plan, ratePlanId, jobId, hourlyRate, dailyRateDaily, payHoursDaily, nightHourlyRate, nightDailyRate, job } = await getDailyPlanForWorktime(wt);

    const totalHours = Number(wt.total_hours || wt.regular_hours || 0);
    const basePay = (dailyRateDaily && payHoursDaily && totalHours === payHoursDaily) ? roundMoney(dailyRateDaily) : roundMoney(totalHours * hourlyRate);
    const nightAllowance = wt.shift === 'night' ? roundMoney(totalHours * nightHourlyRate + nightDailyRate) : 0;
    const grossPay = roundMoney(basePay + nightAllowance);

    let dueLedgers = [];
    const cacheKey = `${groupKey}__${yearMonth}`;
    if (!pendingLedgerCache.has(cacheKey)) {
      await ensureDueDailyInsuranceLedgers({
        employee_id: wt.employee_id,
        company_id: wt.company_id,
        year_month: yearMonth,
        employeeCompany,
        ratePlanId,
        plan
      });
      const ledgers = await listInsuranceLedgers({ employee_id: wt.employee_id, company_id: wt.company_id, due_before_or_equal: yearMonth, status_list: ['pending', 'partial'] });
      pendingLedgerCache.set(cacheKey, ledgers);
    }
    dueLedgers = pickUnconsumedLedgers(pendingLedgerCache.get(cacheKey), consumedLedgerIds);
    consumeLedgerIds(dueLedgers, consumedLedgerIds);

    const insuranceDeduct = roundMoney(dueLedgers.reduce((sum, item) => sum + Number(item.remaining_amount || 0), 0));
    const netPay = roundMoney(grossPay - insuranceDeduct);

    results.push({
      worktime_id: worktimeId, employee_id: wt.employee_id, employee_name: wt.employee_name, employee_no: wt.employee_no,
      company_id: wt.company_id, company_name: wt.company_name, job_id: jobId || wt.job_id || '', job_name: wt.job_name || job?.position || job?.job_name || '',
      work_date: workDate, year: Number(workDate.slice(0, 4)), month: Number(workDate.slice(5, 7)), year_month: yearMonth,
      total_hours: totalHours, hourly_rate: hourlyRate, base_pay: basePay, night_allowance: nightAllowance,
      insurance_deduct: insuranceDeduct,
      insurance_deduct_detail: JSON.stringify({ mode: 'v2_preview', version: '2026-04', start_month: SALARY_INSURANCE_V2_START_MONTH, hit_first_pay_event: dueLedgers.length > 0, due_ledger_ids: dueLedgers.map((i) => i._id), due_insurance_months: dueLedgers.map((i) => i.insurance_month), due_total: insuranceDeduct }),
      gross_pay: grossPay, net_pay: netPay, manual_adjust: 0, final_pay: netPay,
      shift: wt.shift || 'day', source_type: 'salary_daily', source_id: buildDailySalarySourceId(worktimeId)
    });
  }
  return results;
}

async function handleDailyPreview(data = {}) {
  const { worktimes = [] } = data;
  if (!Array.isArray(worktimes) || !worktimes.length) return success([], '暂无可预览工时');
  return success(await buildDailyPreviewRows(worktimes), '日结薪资预览计算完成');
}

// ========= handleMonthlyPreview（月结薪资预览） =========
/**
 * 月结薪资预览
 * 查询已计算的月结薪资记录，用于前端展示和手工调整
 * 不会修改数据库记录，只做查询和展示
 */
async function handleMonthlyPreview(data = {}) {
  const { company_id, year, month } = data;
  if (!company_id || !year || !month) return error(400, '缺少 company_id/year/month');
  
  const yearMonth = `${year}-${String(month).padStart(2, '0')}`;
  
  try {
    // 查询该企业该月份已计算但未批准的薪资（status = 'calculated' 或 'pending_approval'）
    const res = await db.collection('salaries')
      .where({
        company_id,
        year,
        month,
        settlement_mode: 'monthly',
        status: db.command.in(['calculated'])
      })
      .orderBy('employee_no', 'asc')
      .get();
    
    const salaries = (res.data || []).map(item => ({
      _id: item._id,
      employee_id: item.employee_id,
      employee_no: item.employee_no,
      employee_name: item.employee_name,
      company_id: item.company_id,
      company_name: item.company_name,
      job_name: item.job_name,
      year_month: item.year_month || yearMonth,
      year: item.year,
      month: item.month,
      regular_hours: Number(item.regular_hours || 0),
      total_days: Number(item.total_days || 0),
      night_allowance: Number(item.night_allowance || 0),
      insurance_deduct: Number(item.insurance_deduct || 0),
      tax: Number(item.tax || 0),
      gross_pay: Number(item.gross_pay || 0),
      net_pay: Number(item.net_pay || 0),
      manual_adjust: Number(item.manual_adjust || 0),
      adjust_remark: item.adjust_remark || '',
      status: item.status,
      created_at: item.created_at,
      settlement_mode: item.settlement_mode
    }));
    
    return success(salaries, `成功获取 ${salaries.length} 条月结薪资预览数据`);
  } catch (err) {
    console.error('[handleMonthlyPreview] 错误:', err);
    return error(500, err.message || '获取预览数据失败');
  }
}

async function handleBatchSaveMonthlyPreview(data = {}) {
  const { company_id, year, month, salaries = [], token } = data;
  if (!company_id || !year || !month) return error(400, '缺少 company_id/year/month');
  if (!Array.isArray(salaries) || !salaries.length) return error(400, '缺少待保存薪资');

  const summary = { successCount: 0, failCount: 0 };
  const yearMonth = `${year}-${String(month).padStart(2, '0')}`;

  for (const item of salaries) {
    const id = item._id || item.id;
    if (!id) {
      summary.failCount += 1;
      continue;
    }

    try {
      const salaryDoc = await db.collection('salaries').doc(id).get();
      const salary = salaryDoc.data || null;
      if (!salary) throw new Error('薪资记录不存在');
      if (salary.company_id !== company_id) throw new Error('薪资记录企业不匹配');
      const salaryYearMonth = salary.year_month || `${salary.year}-${String(salary.month).padStart(2, '0')}`;
      if (salaryYearMonth !== yearMonth) throw new Error('薪资记录月份不匹配');
      if (salary.settlement_mode !== 'monthly') throw new Error('非月结薪资不能在此保存');
      if (salary.status !== 'calculated') throw new Error('仅待审核薪资允许保存预览调整');

      await assertSalaryInsuranceConsistency(salary);

      const manualAdjust = roundMoney(Number(item.manual_adjust || 0));
      const baseNetPay = roundMoney(Number(salary.net_pay || salary.total_amount || 0) - Number(salary.manual_adjust || 0));
      const finalPay = item.final_pay !== undefined
        ? roundMoney(Number(item.final_pay || 0))
        : roundMoney(baseNetPay + manualAdjust);

      await db.collection('salaries').doc(id).update({
        data: {
          manual_adjust: manualAdjust,
          adjust_remark: item.adjust_remark || '',
          net_pay: finalPay,
          total_amount: finalPay,
          updated_at: db.serverDate()
        }
      });
      summary.successCount += 1;
    } catch (err) {
      console.error('[handleBatchSaveMonthlyPreview] 单条保存失败:', id, err);
      summary.failCount += 1;
    }
  }

  await writeOpsMetric({
    action: 'save_monthly_preview',
    company_id,
    year,
    month,
    saved_count: summary.successCount,
    failed_count: summary.failCount
  });

  return summary.failCount
    ? error(500, `月结薪资保存部分失败，成功 ${summary.successCount} 条，失败 ${summary.failCount} 条`, summary)
    : success(summary, '月结薪资预览已保存');
}

async function handleBatchApproveMonthly(data = {}) {
  const { company_id, year, month, salary_ids = [], token } = data;
  if (!company_id || !year || !month) return error(400, '缺少 company_id/year/month');
  if (!Array.isArray(salary_ids) || !salary_ids.length) return error(400, '缺少待审核薪资');

  const user = await verifyToken(token);
  const summary = { successCount: 0, failCount: 0 };
  const yearMonth = `${year}-${String(month).padStart(2, '0')}`;

  for (const id of salary_ids.filter(Boolean)) {
    try {
      const salaryDoc = await db.collection('salaries').doc(id).get();
      const salary = salaryDoc.data || null;
      if (!salary) throw new Error('薪资记录不存在');
      if (salary.company_id !== company_id) throw new Error('薪资记录企业不匹配');
      const salaryYearMonth = salary.year_month || `${salary.year}-${String(salary.month).padStart(2, '0')}`;
      if (salaryYearMonth !== yearMonth) throw new Error('薪资记录月份不匹配');
      if (salary.settlement_mode !== 'monthly') throw new Error('非月结薪资不能在此审核');
      if (salary.status !== 'calculated') throw new Error('仅 calculated 状态允许审核');

      await assertSalaryInsuranceConsistency(salary);

      await db.collection('salaries').doc(id).update({
        data: {
          status: 'approved',
          approved_by: user?._id || 'system',
          approved_at: db.serverDate(),
          updated_at: db.serverDate()
        }
      });
      summary.successCount += 1;
    } catch (err) {
      console.error('[handleBatchApproveMonthly] 单条审核失败:', id, err);
      summary.failCount += 1;
    }
  }

  await writeOpsMetric({
    action: 'approve_monthly_salary',
    company_id,
    year,
    month,
    approved_count: summary.successCount,
    failed_count: summary.failCount
  });

  return summary.failCount
    ? error(500, `月结薪资审核部分失败，成功 ${summary.successCount} 条，失败 ${summary.failCount} 条`, summary)
    : success(summary, '月结薪资审核完成');
}

// ========= handleBatchPayDaily（与 v1 逻辑相同） =========
async function handleBatchPayDaily(data = {}) {
  const { worktimes = [], payDate, token } = data;
  if (!Array.isArray(worktimes) || !worktimes.length) return error(400, '缺少待发薪工时');
  if (!payDate) return error(400, '缺少发放日期');

  const operator = await verifyToken(token) || { uid: 'system', name: 'system' };
  const previewRows = await buildDailyPreviewRows(worktimes);
  const previewMap = new Map(previewRows.map((item) => [item.worktime_id, item]));
  const summary = { successCount: 0, failCount: 0 };

  for (const wt of worktimes) {
    const worktimeId = wt.worktime_id || wt._id;
    const preview = previewMap.get(worktimeId);
    if (!preview) { summary.failCount += 1; continue; }
    try {
      await db.runTransaction(async (transaction) => {
        const worktimeDoc = await transaction.collection('worktimes').doc(worktimeId).get();
        const worktime = worktimeDoc.data || null;
        if (!worktime) throw new Error('工时记录不存在');
        if (worktime.salary_status === 'paid') throw new Error('工时已发薪');

        let insuranceDeductApplied = 0;
        const deductionDetails = [];
        const previewDueLedgerIds = parsePreviewDueLedgerIds(preview.insurance_deduct_detail);
        if (previewDueLedgerIds.size || Number(preview.insurance_deduct || 0) > 0) {
          const dailyPlan = await getDailyPlanForWorktime(worktime);
          await ensureDueDailyInsuranceLedgers({
            employee_id: preview.employee_id,
            company_id: preview.company_id,
            year_month: preview.year_month,
            employeeCompany: dailyPlan.employeeCompany,
            ratePlanId: dailyPlan.ratePlanId,
            plan: dailyPlan.plan
          }, transaction);
          const listedLedgers = await listInsuranceLedgers({ employee_id: preview.employee_id, company_id: preview.company_id, due_before_or_equal: preview.year_month, status_list: ['pending', 'partial'] }, transaction);
          const dueLedgers = previewDueLedgerIds.size
            ? listedLedgers.filter((ledger) => previewDueLedgerIds.has(String(ledger._id || '')))
            : listedLedgers;
          for (const ledger of dueLedgers) {
            const applyResult = await applyInsuranceDeduction({ ledger_id: ledger._id, source_type: 'salary_daily', source_id: buildDailySalarySourceId(worktimeId), deduct_amount: Number(ledger.remaining_amount || 0), pay_date: payDate, remark: `${preview.work_date} 日结薪资保险扣减`, created_by: operator.uid }, transaction);
            if (applyResult.applied_amount > 0) {
              insuranceDeductApplied = roundMoney(insuranceDeductApplied + Number(applyResult.applied_amount || 0));
              deductionDetails.push({ ledger_id: ledger._id, insurance_month: ledger.insurance_month, deduct_amount: roundMoney(Number(applyResult.applied_amount || 0)), deduction_id: applyResult.deduction?._id || '' });
            }
          }
        }

        const salaryData = {
          employee_id: preview.employee_id, employee_name: preview.employee_name, employee_no: preview.employee_no,
          company_id: preview.company_id, company_name: preview.company_name, job_id: preview.job_id || '', job_name: preview.job_name,
          work_date: preview.work_date, year: preview.year, month: preview.month, year_month: preview.year_month,
          settlement_mode: 'daily', source_type: 'salary_daily', source_id: buildDailySalarySourceId(worktimeId),
          regular_hours: preview.total_hours, overtime_hours: 0, total_hours: preview.total_hours, total_days: 1,
          hourly_rate: preview.hourly_rate, regular_pay: preview.base_pay, overtime_pay: 0, base_pay: preview.base_pay,
          night_allowance: preview.night_allowance, insurance_deduct: insuranceDeductApplied,
          insurance_deduct_detail: JSON.stringify({ mode: 'v2_daily', version: '2026-04', start_month: SALARY_INSURANCE_V2_START_MONTH, items: deductionDetails }),
          deductions: insuranceDeductApplied, gross_pay: preview.gross_pay,
          net_pay: roundMoney(Number(preview.gross_pay || 0) + Number(wt.manual_adjust || 0) - insuranceDeductApplied),
          total_amount: roundMoney(Number(preview.gross_pay || 0) + Number(wt.manual_adjust || 0) - insuranceDeductApplied),
          manual_adjust: Number(wt.manual_adjust || 0), adjust_remark: wt.adjust_remark || '',
          status: 'paid', shift: preview.shift || 'day', pay_date: payDate,
          details: JSON.stringify({ worktime_id: worktimeId, work_date: preview.work_date, shift: preview.shift }),
          created_by: operator.uid, created_at: db.serverDate(), updated_at: db.serverDate()
        };
        await transaction.collection('salaries').add({ data: salaryData });
        await transaction.collection('worktimes').doc(worktimeId).update({ data: { salary_status: 'paid', pay_date: payDate, updated_at: db.serverDate() } });
      });
      summary.successCount += 1;
    } catch (err) {
      console.error('[handleBatchPayDaily] 单条发薪失败:', worktimeId, err);
      summary.failCount += 1;
    }
  }
  return summary.failCount
    ? error(500, `批量发薪部分失败，成功 ${summary.successCount} 条，失败 ${summary.failCount} 条`, summary)
    : success(summary, '批量发薪成功');
}

// ========= handleBatchPayDeposit（与 v1 逻辑相同） =========
async function handleBatchPayDeposit(data = {}) {
  const { worktimes = [], payDate, token } = data;
  if (!Array.isArray(worktimes) || !worktimes.length) return error(400, '缺少待发放押金工时');
  if (!payDate) return error(400, '缺少发放日期');
  const operator = await verifyToken(token) || { uid: 'system', name: 'system' };
  const payYearMonth = normalizeYearMonth(payDate);
  const summary = { successCount: 0, failCount: 0 };

  for (const wt of worktimes) {
    const worktimeId = wt.worktime_id || wt._id;
    if (!worktimeId) { summary.failCount += 1; continue; }
    try {
      await db.runTransaction(async (transaction) => {
        const worktimeDoc = await transaction.collection('worktimes').doc(worktimeId).get();
        const worktime = worktimeDoc.data || null;
        if (!worktime) throw new Error('工时记录不存在');
        if (!worktime.is_deposit) throw new Error('当前记录不是押金工时');
        if (worktime.salary_status === 'paid') throw new Error('押金工时已发放');
        const wtWithIdentity = { ...worktime, employee_name: wt.employee_name || worktime.employee_name, employee_no: wt.employee_no || worktime.employee_no, company_name: wt.company_name || worktime.company_name, job_name: wt.job_name || worktime.job_name };
        const previewRows = await buildDailyPreviewRows([wtWithIdentity]);
        const preview = previewRows[0];
        if (!preview) throw new Error('无法计算押金薪资');
        const grossPay = roundMoney(Number(preview.gross_pay || 0));
        let remainingBudget = grossPay;
        let insuranceDeductApplied = 0;
        const deductionDetails = [];
        const dailyPlan = await getDailyPlanForWorktime(worktime);
        await ensureDueDailyInsuranceLedgers({
          employee_id: preview.employee_id,
          company_id: preview.company_id,
          year_month: payYearMonth,
          employeeCompany: dailyPlan.employeeCompany,
          ratePlanId: dailyPlan.ratePlanId,
          plan: dailyPlan.plan
        }, transaction);
        const dueLedgers = await listInsuranceLedgers({ employee_id: preview.employee_id, company_id: preview.company_id, due_before_or_equal: payYearMonth, status_list: ['pending', 'partial'] }, transaction);
        for (const ledger of dueLedgers) {
          if (remainingBudget <= 0) break;
          const planDeductAmount = roundMoney(Math.min(Number(ledger.remaining_amount || 0), remainingBudget));
          if (planDeductAmount <= 0) continue;
          const applyResult = await applyInsuranceDeduction({ ledger_id: ledger._id, source_type: 'deposit', source_id: `deposit:${worktimeId}`, deduct_amount: planDeductAmount, pay_date: payDate, remark: `${payDate} 押金发放保险补扣`, created_by: operator.uid }, transaction);
          if (applyResult.applied_amount > 0) {
            insuranceDeductApplied = roundMoney(insuranceDeductApplied + Number(applyResult.applied_amount || 0));
            remainingBudget = roundMoney(Math.max(0, remainingBudget - Number(applyResult.applied_amount || 0)));
            deductionDetails.push({ ledger_id: ledger._id, insurance_month: ledger.insurance_month, deduct_amount: roundMoney(Number(applyResult.applied_amount || 0)), deduction_id: applyResult.deduction?._id || '' });
          }
        }
        const netPay = roundMoney(grossPay - insuranceDeductApplied);
        const salaryData = {
          employee_id: preview.employee_id, employee_name: preview.employee_name, employee_no: preview.employee_no,
          company_id: preview.company_id, company_name: preview.company_name, job_id: preview.job_id || '', job_name: preview.job_name,
          work_date: preview.work_date, year: Number(payDate.slice(0, 4)), month: Number(payDate.slice(5, 7)), year_month: payYearMonth,
          settlement_mode: 'daily', source_type: 'deposit', source_id: `deposit:${worktimeId}`,
          regular_hours: preview.total_hours, overtime_hours: 0, total_hours: preview.total_hours, total_days: 1,
          hourly_rate: preview.hourly_rate, regular_pay: preview.base_pay, overtime_pay: 0, base_pay: preview.base_pay,
          night_allowance: preview.night_allowance, deposit_gross_amount: grossPay,
          insurance_deduct: insuranceDeductApplied, insurance_deduct_detail: JSON.stringify({ mode: 'v2_deposit', version: '2026-04', start_month: SALARY_INSURANCE_V2_START_MONTH, items: deductionDetails }),
          deductions: insuranceDeductApplied, gross_pay: grossPay, net_pay: netPay, total_amount: netPay,
          status: 'paid', shift: preview.shift || 'day', pay_date: payDate, pay_remark: '押金发放',
          details: JSON.stringify({ worktime_id: worktimeId, work_date: preview.work_date, shift: preview.shift, source_type: 'deposit' }),
          created_by: operator.uid, created_at: db.serverDate(), updated_at: db.serverDate()
        };
        await transaction.collection('salaries').add({ data: salaryData });
        await transaction.collection('worktimes').doc(worktimeId).update({ data: { salary_status: 'paid', pay_date: payDate, deposit_settlement_status: 'paid', updated_at: db.serverDate() } });
      });
      summary.successCount += 1;
    } catch (err) {
      console.error('[handleBatchPayDeposit] 失败:', worktimeId, err);
      summary.failCount += 1;
    }
  }
  return summary.failCount
    ? error(500, `押金发放部分失败，成功 ${summary.successCount} 条，失败 ${summary.failCount} 条`, summary)
    : success(summary, '押金发放成功');
}

// ========= handleExport =========
async function handleExport(params = {}) {
  const listResult = await handleList({ ...params, page: 1, pageSize: 5000 });
  return success(listResult.data?.list || [], '导出数据准备完毕');
}

// ========= handleBackfillSourceFields（与 v1 相同） =========
async function handleBackfillSourceFields(params = {}) {
  const { settlement_mode = 'daily', batchSize = 500, maxScan = 20000 } = params;
  const conditions = {};
  if (settlement_mode) conditions.settlement_mode = settlement_mode;
  const query = db.collection('salaries').where(conditions);
  let scanned = 0, updated = 0, offset = 0;
  while (scanned < maxScan) {
    const chunk = await query.orderBy('created_at', 'desc').skip(offset).limit(batchSize).get();
    const list = chunk.data || [];
    if (!list.length) break;
    const tasks = [];
    for (const row of list) {
      scanned += 1;
      const inferredType = inferSalarySourceType(row);
      const inferredId = inferSalarySourceId({ ...row, source_type: inferredType });
      const normalizedCurrentType = normalizeSourceTypeValue(row.source_type || row.sourceType);
      const currentId = String(row.source_id || '').trim();
      const patch = {};
      if (inferredType && normalizedCurrentType !== inferredType) patch.source_type = inferredType;
      if (inferredId && (!currentId || (inferredType === 'project_reimbursement' && currentId.startsWith('project_reimbursement:') && currentId !== inferredId))) patch.source_id = inferredId;
      if (Object.keys(patch).length) { patch.updated_at = db.serverDate(); updated += 1; tasks.push(db.collection('salaries').doc(row._id).update({ data: patch })); }
    }
    if (tasks.length) await Promise.allSettled(tasks);
    if (list.length < batchSize) break;
    offset += batchSize;
  }
  return success({ settlement_mode: settlement_mode || '', scanned, updated }, '来源字段回填完成');
}

// ========= ★★★ handleMyList 优化: 并行化查询 ★★★ =========
async function handleMyList(params = {}) {
  const { token } = params;
  const user = await verifyToken(token);
  if (!user) return error(401, '未登录');

  const empIdSet = new Set();
  if (user.employee_id) {
    empIdSet.add(user.employee_id);
  }

  // ★ 优化: 并行查询 user_id 和 phone 两个维度的 employees
  const empPromises = [
    db.collection('employees').where({ user_id: user._id }).limit(10).get()
  ];
  if (user.phone) {
    empPromises.push(db.collection('employees').where({ phone: user.phone }).limit(10).get());
  }
  const empResults = await Promise.all(empPromises);

  empResults.forEach((res) => {
    const candidates = (res.data || []).filter((item) => !normalizeTextValue(item.merged_into_employee_id));
    candidates.forEach((item) => {
      if (item?._id) empIdSet.add(item._id);
    });
    const preferred = pickPreferredEmployee(candidates);
    if (preferred?._id) empIdSet.add(preferred._id);
  });
  if (!empIdSet.size) {
    empIdSet.add(user._id); // 兜底兼容旧数据
  }

  const uniqueEmpIds = [...empIdSet];
  if (uniqueEmpIds.length === 0) return success([]);

  const salRes = await db.collection('salaries').where({ employee_id: _.in(uniqueEmpIds) }).get();
  const salaryList = salRes.data || [];

  // 按 year-month 分组汇总
  const groupedMap = new Map();
  salaryList.forEach((item) => {
    const key = `${item.year}-${String(item.month).padStart(2, '0')}`;
    const insuranceDeduct = item.insurance_deduct || item.social_security || 0;
    if (!groupedMap.has(key)) {
      groupedMap.set(key, { year: item.year, month: item.month, key, monthText: `${item.year}年${item.month}月`, status: item.status, gross_pay: item.gross_pay || 0, insurance_deduct: insuranceDeduct, tax: item.tax || 0, net_pay: item.net_pay || 0 });
    } else {
      const existing = groupedMap.get(key);
      existing.gross_pay = (existing.gross_pay || 0) + (item.gross_pay || 0);
      existing.insurance_deduct = (existing.insurance_deduct || 0) + insuranceDeduct;
      existing.tax = (existing.tax || 0) + (item.tax || 0);
      existing.net_pay = (existing.net_pay || 0) + (item.net_pay || 0);
    }
  });

  return success(Array.from(groupedMap.values()).sort((a, b) => b.key.localeCompare(a.key)));
}

// ========= ★★★ handleBankTransfer 优化: 批量查询替代 N+1 ★★★ =========
async function handleBankTransfer(data) {
  const { company_id, date, page = 1, pageSize = 1000, include_all, payment_method, disbursement_status, settlement_mode } = data;

  try {
    const conditions = {};
    // 默认查待发薪的记录（薪资计算页面审核通过的）；include_all=true 时查全部
    if (!include_all) {
      conditions.status = 'approved';
    }
    if (date) conditions.pay_date = date;
    if (company_id) conditions.company_id = company_id;
    if (payment_method) conditions.salary_payment_method = payment_method;
    if (settlement_mode) conditions.settlement_mode = settlement_mode;
    // disbursement_status 过滤：PENDING = 排除 SUCCESS（含无字段的记录）；SUCCESS = 已发薪
    if (disbursement_status === 'PENDING') {
      conditions.salary_disbursement_status = _.nin(['SUCCESS']);
      console.log('[handleBankTransfer] PENDING filter active, conditions:', JSON.stringify(conditions));
    } else if (disbursement_status === 'SUCCESS') {
      conditions.salary_disbursement_status = 'SUCCESS';
    }

    const skip = (page - 1) * pageSize;
    const [countResult, queryResult] = await Promise.all([
      db.collection('salaries').where(conditions).count(),
      db.collection('salaries').where(conditions).orderBy('_id', 'desc').skip(skip).limit(pageSize).get()
    ]);

    const salaries = queryResult.data || [];
    const total = countResult.total || 0;

    if (!salaries.length) return success({ list: [], total: 0, page, pageSize });

    // ★ 批量收集所有需要查询的 ID
    const employeeIdSet = new Set();
    const companyIdSet = new Set();
    salaries.forEach((s) => {
      if (s.employee_id) employeeIdSet.add(s.employee_id);
      if (s.company_id) companyIdSet.add(s.company_id);
    });

    const employeeIds = [...employeeIdSet];
    const companyIds = [...companyIdSet];

    // ★ 批量查询 employees + companies (2 次查询替代 2000 次)
    // CloudBase where(_.in) 最多支持 500 个元素，需要分片
    const BATCH_IN_SIZE = 500;
    async function batchWhereIn(collectionName, ids) {
      const map = new Map();
      for (let i = 0; i < ids.length; i += BATCH_IN_SIZE) {
        const batch = ids.slice(i, i + BATCH_IN_SIZE);
        const res = await db.collection(collectionName).where({ _id: _.in(batch) }).limit(batch.length).get();
        (res.data || []).forEach((doc) => map.set(doc._id, doc));
      }
      return map;
    }

    const [employeeMap, companyMap] = await Promise.all([
      batchWhereIn('employees', employeeIds),
      batchWhereIn('companies', companyIds)
    ]);

    // 构建转账列表 (纯内存操作，0 次查询)
    const bankTransferData = salaries.map((salary) => {
      const employee = employeeMap.get(salary.employee_id) || {};
      const company = companyMap.get(salary.company_id) || {};
      const bankInfo = { ...employee };
      const bankAccount = bankInfo.bank_account || bankInfo.bankCard || bankInfo.bank_card || '';
      const bankName = bankInfo.bank_name || bankInfo.bank || '';
      const accountHolder = bankInfo.bank_account_name || '';
      const companyShortName = company.short_name || salary.company_name || '';
      const rawDate = salary.work_date || salary.pay_date || '';
      let dateStr = '';
      if (rawDate) { const parts = rawDate.split('-'); dateStr = `${parseInt(parts[1], 10)}月${parseInt(parts[2], 10)}日`; }
      const remarkSuffix = salary.source_type === 'project_reimbursement' ? '项目报销' : '工资';
      const remark = `${companyShortName}${dateStr}${remarkSuffix}`;
      const employeeName = employee.name || salary.employee_name || '';
      const finalRemark = (accountHolder && employeeName && accountHolder !== employeeName) ? `${employeeName} ${remark}` : remark;

      // 发薪方式：直接从 employees 表获取
      const paymentMethod = employee.salary_payment_method || 'BANK';
      // 发薪状态：只有显式写入 salary_disbursement_status='SUCCESS' 才算已发薪，否则默认待发薪
      const disbursementStatus = salary.salary_disbursement_status || 'PENDING';

      return {
        salary_id: salary._id, employee_id: salary.employee_id, employee_name: employeeName,
        employee_no: employee.employee_no || salary.employee_no, company_id: salary.company_id, company_name: salary.company_name,
        bank_name: bankName, bank_account: bankAccount, account_holder: accountHolder,
        transaction_amount: salary.net_pay || 0, remark: normalizeTransferRemark(finalRemark),
        cross_bank_flag: '是', personal_flag: '是', pay_date: salary.pay_date, work_date: salary.work_date,
        salary_payment_method: paymentMethod,
        salary_disbursement_status: disbursementStatus,
        salary_payment_channel: salary.payment_channel || ''
      };
    });

    // 调试：打印第一条记录的 disbursement 状态
    if (bankTransferData.length > 0) {
      console.log('[handleBankTransfer] 第一条记录:', JSON.stringify({
        id: bankTransferData[0].salary_id,
        status: bankTransferData[0].salary_disbursement_status,
        method: bankTransferData[0].salary_payment_method
      }));
    }

    return success({ list: bankTransferData, total, page, pageSize });
  } catch (err) {
    console.error('[handleBankTransfer v2] 查询失败:', err);
    return error(500, err.message || '查询报送银行数据失败');
  }
}

// ========= handleDisburse: 一键发薪（统一入口，按 employees 发薪方式自动分流） =========
async function handleDisburse(data = {}) {
  const { salary_ids = [] } = data;
  if (!Array.isArray(salary_ids) || !salary_ids.length) {
    return error(400, '缺少待发薪记录');
  }

  try {
    // 1. 批量查询 salaries（修复 fetchAllDocuments 调用）
    const salaries = await fetchAllDocuments(
      db.collection('salaries').where({ _id: _.in(salary_ids) })
    );

    // 2. 收集 employee_ids，批量查询 employees 表获取发薪方式快照
    const employeeIdSet = new Set();
    salaries.forEach(s => { if (s.employee_id) employeeIdSet.add(s.employee_id); });
    const employeeIds = [...employeeIdSet];

    const employeeMap = new Map();
    if (employeeIds.length) {
      const BATCH_IN_SIZE = 500;
      for (let i = 0; i < employeeIds.length; i += BATCH_IN_SIZE) {
        const batch = employeeIds.slice(i, i + BATCH_IN_SIZE);
        const res = await db.collection('employees').where({ _id: _.in(batch) }).limit(batch.length).get();
        (res.data || []).forEach(e => employeeMap.set(e._id, e));
      }
    }

    const summary = { successCount: 0, failCount: 0, wechatCount: 0, bankCount: 0, failedIds: [] };
    const payDate = data.pay_date || new Date().toISOString().slice(0, 10);

    for (const salary of salaries) {
      try {
        // 已发薪跳过
        if (salary.salary_disbursement_status === 'SUCCESS') {
          summary.failCount += 1;
          summary.failedIds.push({ id: salary._id, reason: '已发薪' });
          continue;
        }

        // 从 employees 表取得发薪方式快照（默认银行代发）
        const employee = employeeMap.get(salary.employee_id) || {};
        const paymentMethod = employee.salary_payment_method || 'BANK';

        if (paymentMethod === 'WECHAT') {
          // ★ 微信发薪：入员工钱包
          const walletResult = await cloud.callFunction({
            name: 'wallet',
            data: {
              action: 'admin-credit',
              employee_id: salary.employee_id,
              amount: Math.round((Number(salary.net_pay) || 0) * 100),
              source: 'salary',
              source_id: salary._id,
              remark: `薪资入账 ${salary.employee_name || employee.name || ''} ${salary.work_date || salary.pay_date || ''}`
            }
          });

          if (walletResult?.result?.code === 0) {
            await db.collection('salaries').doc(salary._id).update({
              data: {
                salary_payment_method: paymentMethod, // ← 从 employees 快照
                salary_disbursement_status: 'SUCCESS',
                payment_channel: 'WECHAT_WALLET',
                salary_disbursed_at: db.serverDate(),
                updated_at: db.serverDate()
              }
            });
            summary.successCount += 1;
            summary.wechatCount += 1;
          } else {
            summary.failCount += 1;
            summary.failedIds.push({ id: salary._id, reason: walletResult?.result?.message || '钱包入账失败' });
          }
        } else {
          // ★ 银行代发：标记已发薪
          await db.collection('salaries').doc(salary._id).update({
            data: {
              salary_payment_method: paymentMethod, // ← 从 employees 快照
              salary_disbursement_status: 'SUCCESS',
              salary_disbursed_at: db.serverDate(),
              pay_date: payDate,
              status: 'paid',
              updated_at: db.serverDate()
            }
          });
          summary.successCount += 1;
          summary.bankCount += 1;
        }
      } catch (err) {
        console.error('[handleDisburse] 单条失败:', salary._id, err);
        summary.failCount += 1;
        summary.failedIds.push({ id: salary._id, reason: err.message || '未知错误' });
      }
    }

    return summary.failCount
      ? error(500, `发薪完成：成功 ${summary.successCount} 条（微信 ${summary.wechatCount} 银行 ${summary.bankCount}），失败 ${summary.failCount} 条`, summary)
      : success(summary, `发薪成功 ${summary.successCount} 条（微信 ${summary.wechatCount} 银行 ${summary.bankCount}）`);
  } catch (err) {
    console.error('[handleDisburse] 查询失败:', err);
    return error(500, err.message || '发薪失败');
  }
}

// ========= 旧 action 保留兼容（统一转发到 handleDisburse） =========
async function handleDisburseToWallet(data = {}) {
  return handleDisburse(data);
}
async function handleMarkDisbursed(data = {}) {
  return handleDisburse(data);
}

module.exports = {
  handleCalculate,
  handleList,
  handleApprove,
  handlePay,
  handleDailyPreview,
  handleMonthlyPreview,
  handleBatchSaveMonthlyPreview,
  handleBatchApproveMonthly,
  handleBatchPayDaily,
  handleBatchPayDeposit,
  handleBackfillSourceFields,
  handleExport,
  handleMyList,
  handleBankTransfer,
  handleDisburse,
  handleDisburseToWallet,
  handleMarkDisbursed
};
