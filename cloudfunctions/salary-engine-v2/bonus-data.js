/**
 * bonus-data.js - 提成数据获取层
 * 从 calculate-bonus.js 提取的 10+ 个 loadXxxMap 函数
 */
const { fetchAllDocuments } = require('./common/pagination');
const { normalizeDate, formatYearMonth, toIsoString } = require('./common/date-utils');

const SALARY_COLLECTION = 'salaries';
const FINANCE_BILLING_CONFIG_COLLECTION = 'finance_billing_configs';
const COMPANY_COLLECTION = 'companies';
const USER_COLLECTION = 'users';
const EMPLOYEE_COLLECTION = 'employees';
const EMPLOYEE_COMPANY_COLLECTION = 'employee_companies';
const JOB_COLLECTION = 'jobs';
const RULE_COLLECTION = 'recruitment_bonus_rules';
const WORKTIME_COLLECTION_CANDIDATES = ['worktime_records', 'worktimes'];

function normalizeId(value) {
  return String(value || '').trim();
}

function toNumber(value) {
  const numeric = Number(value || 0);
  return Number.isFinite(numeric) ? numeric : 0;
}

function pickLatestRelation(current, candidate) {
  if (!current) return candidate;
  const currentStamp = String(current.updated_at || current.created_at || current.join_date || '');
  const candidateStamp = String(candidate.updated_at || candidate.created_at || candidate.join_date || '');
  return candidateStamp > currentStamp ? candidate : current;
}

async function loadMapByCollection(db, collectionName, valueField = 'name') {
  const records = await fetchAllDocuments(db.collection(collectionName));
  return new Map((records || []).map((item) => [normalizeId(item._id || item.id), String(item[valueField] || item.name || '')]));
}

async function loadUserNameMap(db) {
  const records = await fetchAllDocuments(db.collection(USER_COLLECTION));
  return new Map((records || []).map((item) => [normalizeId(item._id || item.id), String(item.real_name || item.name || item.phone || '')]));
}

async function loadEmployeeCompanyMap(db) {
  const relations = await fetchAllDocuments(db.collection(EMPLOYEE_COMPANY_COLLECTION));
  const relationMap = new Map();
  (relations || []).forEach((item) => {
    const employeeId = normalizeId(item.employee_id);
    if (!employeeId) return;
    relationMap.set(employeeId, pickLatestRelation(relationMap.get(employeeId), item));
  });
  return relationMap;
}

async function loadEmployeesMap(db) {
  const employees = await fetchAllDocuments(db.collection(EMPLOYEE_COLLECTION));
  return new Map((employees || []).map((item) => [normalizeId(item._id || item.id), item]));
}

async function loadJobsMap(db) {
  const jobs = await fetchAllDocuments(db.collection(JOB_COLLECTION));
  return new Map((jobs || []).map((item) => [normalizeId(item._id || item.id), item]));
}

async function loadSalaryMap(db, year, month) {
  let rows = [];
  try {
    rows = await fetchAllDocuments(db.collection(SALARY_COLLECTION).where({ year, month }));
  } catch (err) {
    console.warn(`读取 ${SALARY_COLLECTION} 失败:`, err.message);
    return new Map();
  }
  const salaryMap = new Map();
  (rows || []).forEach((item) => {
    const employeeId = normalizeId(item.employee_id);
    const companyId = normalizeId(item.company_id);
    if (!employeeId || !companyId) return;
    const key = `${employeeId}__${companyId}`;
    salaryMap.set(key, pickLatestRelation(salaryMap.get(key), item));
  });
  return salaryMap;
}

async function loadFinanceConfigMap(db) {
  let configs = [];
  try {
    configs = await fetchAllDocuments(db.collection(FINANCE_BILLING_CONFIG_COLLECTION));
  } catch (err) {
    console.warn(`读取 ${FINANCE_BILLING_CONFIG_COLLECTION} 失败:`, err.message);
    return new Map();
  }
  const configMap = new Map();
  (configs || []).forEach((item) => {
    const jobId = normalizeId(item.job_id);
    if (!jobId) return;
    const list = configMap.get(jobId) || [];
    list.push(item);
    configMap.set(jobId, list);
  });
  for (const list of configMap.values()) {
    list.sort((left, right) => String(right.effective_from || '').localeCompare(String(left.effective_from || '')));
  }
  return configMap;
}

async function loadRulesForMonth(db, year, month) {
  const yearMonth = formatYearMonth(year, month);
  const { normalizeRuleStartDate, normalizeRuleEndDate, daysInMonth } = require('./common/date-utils');
  const monthStart = `${yearMonth}-01`;
  const monthEnd = `${yearMonth}-${String(daysInMonth(year, month)).padStart(2, '0')}`;

  let rules = [];
  try {
    rules = await fetchAllDocuments(db.collection(RULE_COLLECTION).where({ status: 'active' }));
  } catch (err) {
    console.warn(`读取 ${RULE_COLLECTION} 失败:`, err.message);
    return [];
  }

  return (rules || [])
    .filter((rule) => {
      const startDate = normalizeRuleStartDate(rule.start_date, normalizeRuleStartDate(rule.start_month));
      const endDate = normalizeRuleEndDate(rule.end_date, normalizeRuleEndDate(rule.end_month));
      if (!startDate) return false;
      if (startDate > monthEnd) return false;
      if (endDate && endDate < monthStart) return false;
      return true;
    })
    .sort((left, right) => {
      const priorityDiff = toNumber(right.priority) - toNumber(left.priority);
      if (priorityDiff !== 0) return priorityDiff;
      const rightStart = normalizeRuleStartDate(right.start_date, normalizeRuleStartDate(right.start_month));
      const leftStart = normalizeRuleStartDate(left.start_date, normalizeRuleStartDate(left.start_month));
      return String(rightStart || '').localeCompare(String(leftStart || ''));
    });
}

async function loadApprovedWorktimeMap(db, year, month) {
  const yearMonth = formatYearMonth(year, month);
  for (const collectionName of WORKTIME_COLLECTION_CANDIDATES) {
    try {
      const records = await fetchAllDocuments(db.collection(collectionName).where({ status: 'approved' }));
      const monthRecords = (records || []).filter((item) => {
        const explicitYearMonth = String(item.year_month || '');
        if (explicitYearMonth) return explicitYearMonth === yearMonth;
        const workDate = normalizeDate(item.work_date);
        return workDate.startsWith(yearMonth);
      });
      if (!monthRecords.length) continue;

      const worktimeMap = new Map();
      const worktimeEntriesMap = new Map();
      monthRecords.forEach((item) => {
        const employeeId = normalizeId(item.employee_id);
        const companyId = normalizeId(item.company_id);
        if (!employeeId || !companyId) return;
        const key = `${employeeId}__${companyId}`;
        const hours = toNumber(item.total_hours || item.regular_hours);
        const workDate = normalizeDate(item.work_date);
        worktimeMap.set(key, Number((toNumber(worktimeMap.get(key)) + hours).toFixed(2)));
        const entries = worktimeEntriesMap.get(key) || [];
        entries.push({ work_date: workDate, total_hours: hours });
        worktimeEntriesMap.set(key, entries);
      });
      return { collectionName, worktimeMap, worktimeEntriesMap };
    } catch (err) {
      console.warn(`读取 ${collectionName} 工时失败:`, err.message);
    }
  }
  return { collectionName: '', worktimeMap: new Map(), worktimeEntriesMap: new Map() };
}

module.exports = {
  normalizeId,
  toNumber,
  pickLatestRelation,
  loadMapByCollection,
  loadUserNameMap,
  loadEmployeeCompanyMap,
  loadEmployeesMap,
  loadJobsMap,
  loadSalaryMap,
  loadFinanceConfigMap,
  loadRulesForMonth,
  loadApprovedWorktimeMap,
  SALARY_COLLECTION,
  FINANCE_BILLING_CONFIG_COLLECTION,
  COMPANY_COLLECTION,
  USER_COLLECTION,
  EMPLOYEE_COLLECTION,
  EMPLOYEE_COMPANY_COLLECTION,
  JOB_COLLECTION,
  RULE_COLLECTION,
  WORKTIME_COLLECTION_CANDIDATES
};
