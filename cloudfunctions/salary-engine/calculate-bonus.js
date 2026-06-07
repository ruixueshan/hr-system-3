/**
 * 计算招聘提成
 * 支持单条计算、后端批量结算、批次汇总与审核流转
 */
const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();
const _ = db.command;
const { success, error } = require('./response');

const BONUS_COLLECTION = 'recruitment_bonuses';
const BATCH_COLLECTION = 'recruitment_bonus_batches';
const RULE_COLLECTION = 'recruitment_bonus_rules';
const SALARY_COLLECTION = 'salaries';
const JOB_COLLECTION = 'jobs';
const FINANCE_BILLING_CONFIG_COLLECTION = 'finance_billing_configs';
const COMPANY_COLLECTION = 'companies';
const USER_COLLECTION = 'users';
const EMPLOYEE_COLLECTION = 'employees';
const EMPLOYEE_COMPANY_COLLECTION = 'employee_companies';
const WORKTIME_COLLECTION_CANDIDATES = ['worktime_records', 'worktimes'];
const ACTIVE_EMPLOYEE_STATUSES = new Set(['probation', 'regular']);
const FINAL_BATCH_STATUSES = new Set(['approved', 'paid', 'partially_paid']);
const BONUS_CALCULATION_MODES = new Set(['hourly', 'service_fee', 'gross_salary']);
const BONUS_PERIOD_TYPES = new Set(['long_term', 'fixed_months']);

function normalizeId(value) {
  return String(value || '').trim();
}

function toNumber(value) {
  const numeric = Number(value || 0);
  return Number.isFinite(numeric) ? numeric : 0;
}

function normalizeCalculationMode(value) {
  const mode = String(value || '').trim();
  return BONUS_CALCULATION_MODES.has(mode) ? mode : 'hourly';
}

function normalizeBonusPeriodType(value) {
  const type = String(value || '').trim();
  return BONUS_PERIOD_TYPES.has(type) ? type : 'long_term';
}

function normalizeBonusPeriodMonths(value, type) {
  if (normalizeBonusPeriodType(type) !== 'fixed_months') return 0;
  const months = Math.max(1, Math.floor(toNumber(value)));
  return Number.isFinite(months) ? months : 0;
}

function getRuleValueField(mode) {
  if (mode === 'service_fee') return 'service_fee_rate';
  if (mode === 'gross_salary') return 'gross_salary_rate';
  return 'hourly_coefficient';
}

function getRuleValue(rule, mode = normalizeCalculationMode(rule.calculation_mode)) {
  return toNumber(rule[getRuleValueField(mode)]);
}

function normalizeDate(value) {
  if (!value) return '';
  if (typeof value === 'string') return value.slice(0, 10);
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  if (typeof value.toDate === 'function') return value.toDate().toISOString().slice(0, 10);
  if (typeof value.seconds === 'number') return new Date(value.seconds * 1000).toISOString().slice(0, 10);
  if (typeof value._seconds === 'number') return new Date(value._seconds * 1000).toISOString().slice(0, 10);
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '' : date.toISOString().slice(0, 10);
}

function normalizeRuleStartDate(value, fallback = '') {
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

function getRuleDateRange(rule) {
  return {
    start_date: normalizeRuleStartDate(rule.start_date, normalizeRuleStartDate(rule.start_month)),
    end_date: normalizeRuleEndDate(rule.end_date, normalizeRuleEndDate(rule.end_month))
  };
}

function formatYearMonth(year, month) {
  return `${year}-${String(month).padStart(2, '0')}`;
}

function formatDateInput(value) {
  if (!value) return '';
  if (typeof value === 'string') return value.slice(0, 10);
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  if (typeof value.toDate === 'function') return value.toDate().toISOString().slice(0, 10);
  if (typeof value.seconds === 'number') return new Date(value.seconds * 1000).toISOString().slice(0, 10);
  if (typeof value._seconds === 'number') return new Date(value._seconds * 1000).toISOString().slice(0, 10);
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '' : date.toISOString().slice(0, 10);
}

function toIsoString(value) {
  if (!value) return '';
  if (typeof value === 'string') return value;
  if (value instanceof Date) return value.toISOString();
  if (typeof value.toDate === 'function') return value.toDate().toISOString();
  if (typeof value.seconds === 'number') return new Date(value.seconds * 1000).toISOString();
  if (typeof value._seconds === 'number') return new Date(value._seconds * 1000).toISOString();
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '' : date.toISOString();
}

function getMonthDateRange(year, month) {
  const start = `${year}-${String(month).padStart(2, '0')}-01`;
  const end = `${year}-${String(month).padStart(2, '0')}-${daysInMonth(year, month)}`;
  return { start, end, yearMonth: formatYearMonth(year, month) };
}

function addDays(dateText, days) {
  const date = new Date(`${dateText}T00:00:00+08:00`);
  if (Number.isNaN(date.getTime())) return '';
  date.setDate(date.getDate() + days);
  return date.toISOString().slice(0, 10);
}

function addMonths(dateText, months) {
  const date = new Date(`${dateText}T00:00:00+08:00`);
  if (Number.isNaN(date.getTime())) return '';
  const day = date.getDate();
  const next = new Date(date);
  next.setMonth(next.getMonth() + months);
  if (next.getDate() !== day) {
    next.setDate(0);
  }
  return next.toISOString().slice(0, 10);
}

function minDate(...dates) {
  return dates.filter(Boolean).sort()[0] || '';
}

function maxDate(...dates) {
  return dates.filter(Boolean).sort().slice(-1)[0] || '';
}

function getDateOverlap(startA, endA, startB, endB) {
  const start = maxDate(startA, startB);
  const end = minDate(endA, endB);
  if (!start || !end || start > end) return null;
  return { start, end };
}

function getDateDiffDays(startDateText, endDateText) {
  if (!startDateText || !endDateText) return 0;
  const start = new Date(`${startDateText}T00:00:00+08:00`);
  const end = new Date(`${endDateText}T00:00:00+08:00`);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end < start) return 0;
  return Math.floor((end - start) / (24 * 60 * 60 * 1000)) + 1;
}

function resolveBonusPeriod(rule, joinDateText) {
  const type = normalizeBonusPeriodType(rule.bonus_period_type);
  const months = normalizeBonusPeriodMonths(rule.bonus_period_months, type);
  const startDate = formatDateInput(joinDateText);
  if (!startDate) {
    return { bonus_period_type: type, bonus_period_months: months, bonus_period_end_date: '' };
  }
  if (type !== 'fixed_months' || months <= 0) {
    return { bonus_period_type: 'long_term', bonus_period_months: 0, bonus_period_end_date: '' };
  }
  const endDate = addDays(addMonths(startDate, months), -1);
  return { bonus_period_type: 'fixed_months', bonus_period_months: months, bonus_period_end_date: endDate };
}

function pickLatestRelation(current, candidate) {
  if (!current) return candidate;
  const currentStamp = String(current.updated_at || current.created_at || current.join_date || '');
  const candidateStamp = String(candidate.updated_at || candidate.created_at || candidate.join_date || '');
  return candidateStamp > currentStamp ? candidate : current;
}

async function fetchAllDocuments(query, batchSize = 100) {
  const countRes = await query.count();
  const total = countRes.total || 0;
  const list = [];
  for (let offset = 0; offset < total; offset += batchSize) {
    const res = await query.skip(offset).limit(batchSize).get();
    list.push(...(res.data || []));
  }
  return list;
}

async function loadMapByCollection(collectionName, valueField = 'name') {
  const records = await fetchAllDocuments(db.collection(collectionName));
  return new Map((records || []).map((item) => [normalizeId(item._id || item.id), String(item[valueField] || item.name || '')]));
}

async function loadUserNameMap() {
  const records = await fetchAllDocuments(db.collection(USER_COLLECTION));
  return new Map((records || []).map((item) => [normalizeId(item._id || item.id), String(item.real_name || item.name || item.phone || '')]));
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

async function loadEmployeesMap() {
  const employees = await fetchAllDocuments(db.collection(EMPLOYEE_COLLECTION));
  return new Map((employees || []).map((item) => [normalizeId(item._id || item.id), item]));
}

async function loadJobsMap() {
  const jobs = await fetchAllDocuments(db.collection(JOB_COLLECTION));
  return new Map((jobs || []).map((item) => [normalizeId(item._id || item.id), item]));
}

async function loadSalaryMap(year, month) {
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

function isConfigActive(config, targetDate) {
  const from = normalizeDate(config && config.effective_from);
  const to = normalizeDate(config && config.effective_to);
  if (!from) return false;
  if (from > targetDate) return false;
  if (to && to < targetDate) return false;
  return String(config && config.status || 'active') === 'active';
}

function buildDefaultBillingConfig(job) {
  if (!job) return null;
  const jobId = normalizeId(job._id || job.id);
  const companyId = normalizeId(job.company_id);
  if (!jobId || !companyId) return null;

  const billingMode = String(job.billing_mode || '').trim();
  if (billingMode === 'service_fee_monthly' || billingMode === 'service_fee_hourly') {
    return {
      job_id: jobId,
      company_id: companyId,
      billing_mode: billingMode,
      service_fee_monthly: toNumber(job.service_fee_monthly),
      service_fee_hourly: toNumber(job.service_fee_hourly),
      bill_hours_rule: job.bill_hours_rule || (toNumber(job.fixed_bill_hours || job.bill_hours) > 0 ? 'fixed_daily_hours' : 'actual_hours'),
      fixed_bill_hours: toNumber(job.fixed_bill_hours || job.bill_hours),
      effective_from: normalizeDate(job.finance_effective_from || job.created_at) || '2026-01-01',
      effective_to: normalizeDate(job.finance_effective_to),
      status: job.finance_config_status || 'active'
    };
  }

  return null;
}

async function loadFinanceConfigMap() {
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

function resolveFinanceConfig(configMap, jobsMap, jobId, targetDate) {
  const configs = configMap.get(jobId) || [];
  const activeConfig = configs.find((item) => isConfigActive(item, targetDate));
  if (activeConfig) return activeConfig;
  return buildDefaultBillingConfig(jobsMap.get(jobId));
}

function getServiceDaysInMonth(year, month, joinDateText, leaveDateText) {
  const monthStart = new Date(`${formatYearMonth(year, month)}-01T00:00:00+08:00`);
  const monthEnd = new Date(`${formatYearMonth(year, month)}-${String(daysInMonth(year, month)).padStart(2, '0')}T23:59:59+08:00`);
  const joinDate = joinDateText ? new Date(`${joinDateText}T00:00:00+08:00`) : monthStart;
  const leaveDate = leaveDateText ? new Date(`${leaveDateText}T23:59:59+08:00`) : monthEnd;
  const effectiveStart = joinDate > monthStart ? joinDate : monthStart;
  const effectiveEnd = leaveDate < monthEnd ? leaveDate : monthEnd;
  if (Number.isNaN(effectiveStart.getTime()) || Number.isNaN(effectiveEnd.getTime()) || effectiveEnd < effectiveStart) return 0;
  return Math.floor((effectiveEnd - effectiveStart) / (24 * 60 * 60 * 1000)) + 1;
}

function calculateServiceFeeAmount({ year, month, totalHours, eligibleDays, joinDate, leaveDate, salary, config }) {
  const resolvedConfig = config || {};
  const salaryDays = toNumber(salary && salary.total_days);
  let billableHours = totalHours;
  if (String(resolvedConfig.bill_hours_rule || '') === 'fixed_daily_hours') {
    const fixedBillHours = toNumber(resolvedConfig.fixed_bill_hours);
    const effectiveDays = eligibleDays > 0 ? eligibleDays : salaryDays;
    if (fixedBillHours > 0 && effectiveDays > 0) {
      billableHours = Number((fixedBillHours * effectiveDays).toFixed(2));
    }
  }

  const mode = String(resolvedConfig.billing_mode || '').trim();
  if ((mode === 'service_fee_monthly' || toNumber(resolvedConfig.service_fee_monthly) > 0)) {
    const monthDays = daysInMonth(year, month);
    const serviceDays = eligibleDays > 0 ? eligibleDays : getServiceDaysInMonth(year, month, joinDate, leaveDate);
    const serviceFeeMonthly = toNumber(resolvedConfig.service_fee_monthly);
    return monthDays > 0 ? Number(((serviceDays / monthDays) * serviceFeeMonthly).toFixed(2)) : 0;
  }

  if (mode === 'service_fee_hourly' || toNumber(resolvedConfig.service_fee_hourly) > 0) {
    return Number((billableHours * toNumber(resolvedConfig.service_fee_hourly)).toFixed(2));
  }

  return 0;
}

function calculateBonusByRule({ rule, totalHours, serviceFeeAmount, grossSalaryAmount, eligibleDays, year, month }) {
  const calculationMode = normalizeCalculationMode(rule.calculation_mode);
  if (calculationMode === 'service_fee') {
    const configuredMonthlyFee = getRuleValue(rule, calculationMode);
    const monthDays = daysInMonth(year, month);
    const proratedAmount = configuredMonthlyFee > 0
      ? (monthDays > 0 && eligibleDays > 0
        ? Number((configuredMonthlyFee * eligibleDays / monthDays).toFixed(2))
        : 0)
      : serviceFeeAmount;
    return {
      calculation_mode: calculationMode,
      rule_value: configuredMonthlyFee || serviceFeeAmount,
      calculation_base_amount: proratedAmount,
      bonus_amount: proratedAmount
    };
  }

  if (calculationMode === 'gross_salary') {
    const ruleValue = getRuleValue(rule, calculationMode);
    return {
      calculation_mode: calculationMode,
      rule_value: ruleValue,
      calculation_base_amount: grossSalaryAmount,
      bonus_amount: Number((grossSalaryAmount * ruleValue / 100).toFixed(2))
    };
  }

  const ruleValue = getRuleValue(rule, 'hourly');
  return {
    calculation_mode: 'hourly',
    rule_value: ruleValue,
    calculation_base_amount: totalHours,
    bonus_amount: Number((totalHours * ruleValue).toFixed(2))
  };
}

async function loadRulesForMonth(year, month) {
  const { start: monthStart, end: monthEnd } = getMonthDateRange(year, month);
  let rules = [];
  try {
    rules = await fetchAllDocuments(db.collection(RULE_COLLECTION).where({ status: 'active' }));
  } catch (err) {
    console.warn(`读取 ${RULE_COLLECTION} 失败:`, err.message);
    return [];
  }
  return (rules || [])
    .filter((rule) => {
      const dateRange = getRuleDateRange(rule);
      if (!dateRange.start_date) return false;
      if (dateRange.start_date > monthEnd) return false;
      if (dateRange.end_date && dateRange.end_date < monthStart) return false;
      return true;
    })
    .sort((left, right) => {
      const priorityDiff = toNumber(right.priority) - toNumber(left.priority);
      if (priorityDiff !== 0) return priorityDiff;
      const rightStartDate = getRuleDateRange(right).start_date;
      const leftStartDate = getRuleDateRange(left).start_date;
      return String(rightStartDate || '').localeCompare(String(leftStartDate || ''));
    });
}

function getRuleMatchWeight(rule, recommenderId, companyId) {
  const ruleRecommenderId = normalizeId(rule.recommender_id);
  const ruleCompanyId = normalizeId(rule.company_id);

  if (ruleRecommenderId && ruleCompanyId) {
    return ruleRecommenderId === recommenderId && ruleCompanyId === companyId ? 300 : -1;
  }
  if (ruleRecommenderId) {
    return ruleRecommenderId === recommenderId ? 200 : -1;
  }
  if (ruleCompanyId) {
    return ruleCompanyId === companyId ? 100 : -1;
  }
  return 0;
}

function resolveRule(rules, recommenderId, companyId) {
  let matchedRule = null;
  let matchedWeight = -1;
  let matchedPriority = -Infinity;
  let matchedStartDate = '';

  for (const rule of rules) {
    const weight = getRuleMatchWeight(rule, recommenderId, companyId);
    if (weight < 0) continue;

    const priority = toNumber(rule.priority);
    const startDate = getRuleDateRange(rule).start_date;
    if (weight > matchedWeight || (weight === matchedWeight && (priority > matchedPriority || (priority === matchedPriority && String(startDate || '') > String(matchedStartDate || ''))))) {
      matchedRule = rule;
      matchedWeight = weight;
      matchedPriority = priority;
      matchedStartDate = startDate;
    }
  }

  return matchedRule;
}

function isEligibleByJoinDate(joinDateText, year, month) {
  if (!joinDateText) return false;
  const joinDate = new Date(joinDateText);
  if (Number.isNaN(joinDate.getTime())) return false;
  const threshold = new Date(joinDate);
  threshold.setDate(threshold.getDate() + 7);
  const monthEnd = new Date(`${year}-${String(month).padStart(2, '0')}-${String(daysInMonth(year, month)).padStart(2, '0')}T23:59:59+08:00`);
  const now = new Date();
  const evaluationDate = monthEnd < now ? monthEnd : now;
  return threshold <= evaluationDate;
}

async function loadApprovedWorktimeMap(year, month) {
  const { yearMonth } = getMonthDateRange(year, month);
  for (const collectionName of WORKTIME_COLLECTION_CANDIDATES) {
    try {
      let records = await fetchAllDocuments(db.collection(collectionName).where({ status: 'approved', year_month: yearMonth }));
      if (!records.length) {
        records = await fetchAllDocuments(db.collection(collectionName).where({ status: 'approved' }));
      }
      const monthRecords = (records || []).filter((item) => {
        const explicitYearMonth = String(item.year_month || '');
        if (explicitYearMonth) return explicitYearMonth === yearMonth;
        const workDate = formatDateInput(item.work_date);
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
        const workDate = formatDateInput(item.work_date);
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

function getEligibleHours(worktimeEntriesMap, key, startDate, endDate) {
  const entries = worktimeEntriesMap.get(key) || [];
  return Number(entries.reduce((sum, item) => {
    if (!item.work_date || item.work_date < startDate || item.work_date > endDate) return sum;
    return sum + toNumber(item.total_hours);
  }, 0).toFixed(2));
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
    year,
    month,
    year_month: yearMonth,
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

async function removeBatchDetails(batchId) {
  if (!batchId) return;
  let removedCount = 0;
  do {
    const res = await db.collection(BONUS_COLLECTION).where({ batch_id: batchId }).limit(100).remove();
    removedCount = toNumber(res?.stats?.removed || res?.removed);
  } while (removedCount > 0);
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

  const writeBatchSize = 10;
  for (let index = 0; index < items.length; index += writeBatchSize) {
    const batchItems = items.slice(index, index + writeBatchSize);
    await Promise.all(batchItems.map((item) => db.collection(BONUS_COLLECTION).add({
      data: {
        ...item,
        batch_id: batchId,
        batch_no: batchPayload.batch_no,
        year_month: batchPayload.year_month,
        created_at: db.serverDate(),
        updated_at: db.serverDate()
      }
    })));
  }

  return batchId;
}

async function updateBatchDetailsStatus(batchId, data, statusCondition, predicate = () => true) {
  const details = await fetchAllDocuments(db.collection(BONUS_COLLECTION).where({ batch_id: batchId }));
  const validDetails = details.filter((item) => normalizeId(item._id || item.id));
  const matched = validDetails.filter((item) => {
    const detailId = normalizeId(item._id || item.id);
    return detailId && predicate(item);
  });
  if (!matched.length) return { total: validDetails.length, matched: 0 };

  const conditions = { batch_id: batchId };
  if (statusCondition) conditions.status = statusCondition;
  await db.collection(BONUS_COLLECTION).where(conditions).update({ data });

  return { total: validDetails.length, matched: matched.length };
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
        candidate_count: 0,
        detail_count: 0,
        total_hours: 0,
        total_bonus: 0,
        approved_count: 0,
        paid_count: 0,
        status: 'cancelled',
        updated_at: db.serverDate()
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
    loadEmployeesMap(),
    loadEmployeeCompanyMap(),
    loadRulesForMonth(year, month),
    loadMapByCollection(COMPANY_COLLECTION, 'name'),
    loadUserNameMap(),
    loadApprovedWorktimeMap(year, month),
    loadJobsMap(),
    loadSalaryMap(year, month),
    loadFinanceConfigMap()
  ]);

  if (!rules.length) {
    return {
      year,
      month,
      year_month: yearMonth,
      worktime_source: worktimeResult.collectionName,
      batch_count: 0,
      detail_count: 0,
      created_batches: 0,
      updated_batches: 0,
      skipped_finalized_batches: 0,
      skipped_employees: [],
      errors: [{ employee_id: '', employee_name: '', reason: `未找到可用提成规则，请先创建 ${RULE_COLLECTION} 数据` }],
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

    const worktimeKey = `${employeeId}__${companyId}`;
    const bonusPeriod = resolveBonusPeriod(rule, joinDate);
    const monthRange = getMonthDateRange(year, month);
    const eligibleWindow = getDateOverlap(
      monthRange.start,
      monthRange.end,
      joinDate,
      formatDateInput(employee.leave_date || relation.leave_date) || monthRange.end
    );
    const cycleWindow = getDateOverlap(
      eligibleWindow?.start || '',
      eligibleWindow?.end || '',
      joinDate,
      bonusPeriod.bonus_period_end_date || eligibleWindow?.end || ''
    );
    if (!cycleWindow) {
      skippedEmployees.push({ employee_id: employeeId, reason: '已超出提成周期' });
      continue;
    }

    const eligibleDays = getDateDiffDays(cycleWindow.start, cycleWindow.end);
    const calculationMode = normalizeCalculationMode(rule.calculation_mode);
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
      year,
      month,
      totalHours,
      eligibleDays,
      joinDate,
      leaveDate: formatDateInput(employee.leave_date || relation.leave_date),
      salary,
      config: financeConfig
    });

    if (calculationMode === 'gross_salary' && grossSalaryAmount <= 0) {
      errors.push({ employee_id: employeeId, employee_name: employee.name || '', reason: '按应发工资计提但未找到有效薪资数据' });
      continue;
    }

    const calculationResult = calculateBonusByRule({
      rule,
      totalHours,
      serviceFeeAmount,
      grossSalaryAmount,
      eligibleDays,
      year,
      month
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
      year,
      month,
      year_month: yearMonth,
      status: 'pending'
    });
    groupedDetails.set(batchKey, current);
  }

  const nextBatchKeys = new Set(groupedDetails.keys());
  await cancelMissingCalculatedBatches(existingBatchMap, nextBatchKeys);

  const results = [];
  let createdBatches = 0;
  let updatedBatches = 0;
  let skippedFinalized = 0;
  let totalDetails = 0;

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
      existingBatch,
      year,
      month,
      yearMonth,
      recommenderId,
      recommenderName,
      items,
      operator,
      status: 'calculated'
    });
    const batchId = await upsertBatchAndDetails(batchPayload, items, normalizeId(existingBatch?._id || existingBatch?.id));

    if (existingBatch) updatedBatches++;
    else createdBatches++;
    totalDetails += items.length;
    results.push({
      batch_id: batchId,
      batch_no: batchPayload.batch_no,
      recommender_id: recommenderId,
      recommender_name: recommenderName,
      detail_count: items.length,
      total_bonus: batchPayload.total_bonus,
      total_hours: batchPayload.total_hours,
      status: batchPayload.status
    });
  }

  return {
    year,
    month,
    year_month: yearMonth,
    worktime_source: worktimeResult.collectionName,
    batch_count: results.length,
    detail_count: totalDetails,
    created_batches: createdBatches,
    updated_batches: updatedBatches,
    skipped_finalized_batches: skippedFinalized,
    skipped_employees: skippedEmployees,
    errors,
    results
  };
}

async function getBatchRecords(batchId) {
  const companyMap = await loadMapByCollection(COMPANY_COLLECTION, 'name');
  const detailDocs = await fetchAllDocuments(db.collection(BONUS_COLLECTION).where({ batch_id: batchId }));
  return detailDocs
    .map((item) => normalizeDetail(item, companyMap))
    .sort((left, right) => String(left.candidate_name || '').localeCompare(String(right.candidate_name || ''), 'zh-CN'));
}

/**
 * 计算单条提成
 */
exports.calculateBonus = async (params, operator) => {
  const { recommender_id, employee_id, company_id, year, month } = params;

  try {
    const result = await calculateBatchInternal({
      year,
      month,
      recommender_id,
      force_recalculate: true
    }, operator);
    const targetBatch = (result.results || []).find((item) => normalizeId(item.recommender_id) === normalizeId(recommender_id));
    const details = targetBatch ? await getBatchRecords(targetBatch.batch_id) : [];
    const targetDetail = details.find((item) => normalizeId(item.employee_id) === normalizeId(employee_id) && normalizeId(item.company_id) === normalizeId(company_id));
    if (!targetDetail) {
      return success(null, '未生成提成记录');
    }
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

  } catch (err) {
    console.error('计算提成失败:', err);
    throw err;
  }
};

/**
 * 批量计算提成（定时任务）
 * 计算所有外协人员的提成
 */
exports.calculateBonusBatch = async (params, operator) => {
  try {
    const result = await calculateBatchInternal(params, operator);
    return success(result, '批量提成计算完成');

  } catch (err) {
    console.error('批量计算提成失败:', err);
    throw err;
  }
};

exports.getBonusSummary = async (params) => {
  const year = toNumber(params.year);
  const month = toNumber(params.month);
  const yearMonth = String(params.year_month || (year && month ? formatYearMonth(year, month) : ''));
  const recommenderId = normalizeId(params.recommender_id || params.hr_id);
  const status = String(params.status || '').trim();
  const page = Math.max(1, toNumber(params.page) || 1);
  const pageSize = Math.max(1, toNumber(params.pageSize) || 20);

  const conditions = {};
  if (yearMonth) conditions.year_month = yearMonth;
  if (recommenderId) conditions.recommender_id = recommenderId;
  if (status) conditions.status = status;
  const query = Object.keys(conditions).length
    ? db.collection(BATCH_COLLECTION).where(conditions)
    : db.collection(BATCH_COLLECTION);
  const allBatches = await fetchAllDocuments(query);
  let list = allBatches.map(normalizeBatch);

  list.sort((left, right) => String(right.year_month).localeCompare(String(left.year_month)) || String(right.updated_at || '').localeCompare(String(left.updated_at || '')));
  const total = list.length;
  const paged = list.slice((page - 1) * pageSize, page * pageSize);
  return success({ list: paged, total, page, pageSize }, '查询提成批次成功');
};

exports.getBonusDetail = async (params) => {
  const batchId = normalizeId(params.batch_id);
  if (!batchId) return error(400, '缺少批次ID');
  const batchRes = await db.collection(BATCH_COLLECTION).doc(batchId).get();
  const batchDoc = Array.isArray(batchRes.data) ? batchRes.data[0] : batchRes.data;
  if (!batchDoc || !normalizeId(batchDoc._id || batchDoc.id)) return error(404, '提成批次不存在');
  const details = await getBatchRecords(batchId);
  return success({ batch: normalizeBatch(batchDoc), details }, '查询提成明细成功');
};

exports.approveBonusBatch = async (params, operator) => {
  const batchId = normalizeId(params.batch_id);
  if (!batchId) return error(400, '缺少批次ID');
  const batchRes = await db.collection(BATCH_COLLECTION).doc(batchId).get();
  const batchDoc = Array.isArray(batchRes.data) ? batchRes.data[0] : batchRes.data;
  if (!batchDoc || !normalizeId(batchDoc._id || batchDoc.id)) return error(404, '提成批次不存在');
  const currentBatch = normalizeBatch(batchDoc);
  if (currentBatch.status === 'paid') return error(400, '已发放批次不能再审核');

  const statusUpdate = await updateBatchDetailsStatus(
    batchId,
    {
      status: 'approved',
      approved_by: normalizeId(operator.uid),
      approved_by_name: operator.name || '',
      approved_at: db.serverDate(),
      updated_at: db.serverDate()
    },
    _.nin(['approved', 'paid']),
    (item) => !['approved', 'paid'].includes(String(item.status || 'pending'))
  );
  const approvedCount = statusUpdate.total;

  await db.collection(BATCH_COLLECTION).doc(batchId).update({
    data: {
      status: 'approved',
      approved_count: approvedCount,
      approved_by: normalizeId(operator.uid),
      approved_by_name: operator.name || '',
      approved_at: db.serverDate(),
      updated_at: db.serverDate()
    }
  });

  return success({ batch_id: batchId, approved_count: approvedCount }, '提成批次审核成功');
};

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

exports.markBonusBatchPaid = async (params, operator) => {
  const batchId = normalizeId(params.batch_id);
  if (!batchId) return error(400, '缺少批次ID');
  const statusUpdate = await updateBatchDetailsStatus(batchId, {
    status: 'paid',
    paid_by: normalizeId(operator.uid),
    paid_by_name: operator.name || '',
    paid_at: db.serverDate(),
    updated_at: db.serverDate()
  });
  const paidCount = statusUpdate.total;
  await db.collection(BATCH_COLLECTION).doc(batchId).update({
    data: {
      status: 'paid',
      paid_count: paidCount,
      paid_by: normalizeId(operator.uid),
      paid_by_name: operator.name || '',
      paid_at: db.serverDate(),
      updated_at: db.serverDate()
    }
  });
  return success({ batch_id: batchId, paid_count: paidCount }, '提成批次已标记发放');
};

/**
 * 匹配提成规则
 * 优先级：推荐人+项目(10) > 推荐人(5) > 项目(1) > 全局(0)
 */
async function matchBonusRule(recommenderId, companyId, year, month) {
  const rules = await loadRulesForMonth(year, month);
  return resolveRule(rules, normalizeId(recommenderId), normalizeId(companyId));
}

function daysInMonth(year, month) {
  return new Date(year, month, 0).getDate();
}
