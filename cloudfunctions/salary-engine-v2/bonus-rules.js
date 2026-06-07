/**
 * bonus-rules.js - 提成规则匹配与计算
 * 从 calculate-bonus.js 提取的业务规则函数
 */
const {
  normalizeDate, normalizeRuleStartDate, normalizeRuleEndDate,
  daysInMonth, formatYearMonth, addDays, addMonths,
  getMonthDateRange, getDateOverlap, getDateDiffDays
} = require('./common/date-utils');

const BONUS_CALCULATION_MODES = new Set(['hourly', 'service_fee', 'gross_salary']);
const BONUS_PERIOD_TYPES = new Set(['long_term', 'fixed_months']);

function toNumber(value) {
  const numeric = Number(value || 0);
  return Number.isFinite(numeric) ? numeric : 0;
}

function normalizeId(value) {
  return String(value || '').trim();
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

function getRuleDateRange(rule) {
  return {
    start_date: normalizeRuleStartDate(rule.start_date, normalizeRuleStartDate(rule.start_month)),
    end_date: normalizeRuleEndDate(rule.end_date, normalizeRuleEndDate(rule.end_month))
  };
}

function resolveBonusPeriod(rule, joinDateText) {
  const type = normalizeBonusPeriodType(rule.bonus_period_type);
  const months = normalizeBonusPeriodMonths(rule.bonus_period_months, type);
  const startDate = normalizeDate(joinDateText);
  if (!startDate) {
    return { bonus_period_type: type, bonus_period_months: months, bonus_period_end_date: '' };
  }
  if (type !== 'fixed_months' || months <= 0) {
    return { bonus_period_type: 'long_term', bonus_period_months: 0, bonus_period_end_date: '' };
  }
  const endDate = addDays(addMonths(startDate, months), -1);
  return { bonus_period_type: 'fixed_months', bonus_period_months: months, bonus_period_end_date: endDate };
}

function getRuleMatchWeight(rule, recommenderId, companyId) {
  const ruleRecommenderId = normalizeId(rule.recommender_id);
  const ruleCompanyId = normalizeId(rule.company_id);

  if (ruleRecommenderId && ruleCompanyId) return ruleRecommenderId === recommenderId && ruleCompanyId === companyId ? 300 : -1;
  if (ruleRecommenderId) return ruleRecommenderId === recommenderId ? 200 : -1;
  if (ruleCompanyId) return ruleCompanyId === companyId ? 100 : -1;
  return 0;
}

function resolveRule(rules, recommenderId, companyId) {
  let matchedRule = null, matchedWeight = -1, matchedPriority = -Infinity, matchedStartDate = '';

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

function getEligibleHours(worktimeEntriesMap, key, startDate, endDate) {
  const entries = worktimeEntriesMap.get(key) || [];
  return Number(entries.reduce((sum, item) => {
    if (!item.work_date || item.work_date < startDate || item.work_date > endDate) return sum;
    return sum + toNumber(item.total_hours);
  }, 0).toFixed(2));
}

function isConfigActive(config, targetDate) {
  const from = normalizeDate(config?.effective_from);
  const to = normalizeDate(config?.effective_to);
  if (!from) return false;
  if (from > targetDate) return false;
  if (to && to < targetDate) return false;
  return String(config?.status || 'active') === 'active';
}

function buildDefaultBillingConfig(job) {
  if (!job) return null;
  const jobId = normalizeId(job._id || job.id);
  const companyId = normalizeId(job.company_id);
  if (!jobId || !companyId) return null;
  const billingMode = String(job.billing_mode || '').trim();
  if (billingMode === 'service_fee_monthly' || billingMode === 'service_fee_hourly') {
    return {
      job_id: jobId, company_id: companyId, billing_mode: billingMode,
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

function resolveFinanceConfig(configMap, jobsMap, jobId, targetDate) {
  const configs = configMap.get(jobId) || [];
  const activeConfig = configs.find((item) => isConfigActive(item, targetDate));
  if (activeConfig) return activeConfig;
  return buildDefaultBillingConfig(jobsMap.get(jobId));
}

function getServiceDaysInMonth(year, month, joinDateText, leaveDateText) {
  const { formatYearMonth, daysInMonth: dim } = require('./common/date-utils');
  const ym = formatYearMonth(year, month);
  const monthStart = new Date(`${ym}-01T00:00:00+08:00`);
  const monthEnd = new Date(`${ym}-${String(dim(year, month)).padStart(2, '0')}T23:59:59+08:00`);
  const joinDate = joinDateText ? new Date(`${joinDateText}T00:00:00+08:00`) : monthStart;
  const leaveDate = leaveDateText ? new Date(`${leaveDateText}T23:59:59+08:00`) : monthEnd;
  const effectiveStart = joinDate > monthStart ? joinDate : monthStart;
  const effectiveEnd = leaveDate < monthEnd ? leaveDate : monthEnd;
  if (Number.isNaN(effectiveStart.getTime()) || Number.isNaN(effectiveEnd.getTime()) || effectiveEnd < effectiveStart) return 0;
  return Math.floor((effectiveEnd - effectiveStart) / (24 * 60 * 60 * 1000)) + 1;
}

function calculateServiceFeeAmount({ year, month, totalHours, eligibleDays, joinDate, leaveDate, salary, config }) {
  const resolvedConfig = config || {};
  const salaryDays = toNumber(salary?.total_days);
  let billableHours = totalHours;
  if (String(resolvedConfig.bill_hours_rule || '') === 'fixed_daily_hours') {
    const fixedBillHours = toNumber(resolvedConfig.fixed_bill_hours);
    const effectiveDays = eligibleDays > 0 ? eligibleDays : salaryDays;
    if (fixedBillHours > 0 && effectiveDays > 0) billableHours = Number((fixedBillHours * effectiveDays).toFixed(2));
  }

  const mode = String(resolvedConfig.billing_mode || '').trim();
  if (mode === 'service_fee_monthly' || toNumber(resolvedConfig.service_fee_monthly) > 0) {
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
      ? (monthDays > 0 && eligibleDays > 0 ? Number((configuredMonthlyFee * eligibleDays / monthDays).toFixed(2)) : 0)
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
    return { calculation_mode: calculationMode, rule_value: ruleValue, calculation_base_amount: grossSalaryAmount, bonus_amount: Number((grossSalaryAmount * ruleValue / 100).toFixed(2)) };
  }
  const ruleValue = getRuleValue(rule, 'hourly');
  return { calculation_mode: 'hourly', rule_value: ruleValue, calculation_base_amount: totalHours, bonus_amount: Number((totalHours * ruleValue).toFixed(2)) };
}

module.exports = {
  BONUS_CALCULATION_MODES,
  BONUS_PERIOD_TYPES,
  normalizeCalculationMode,
  normalizeBonusPeriodType,
  normalizeBonusPeriodMonths,
  getRuleValueField,
  getRuleValue,
  getRuleDateRange,
  resolveBonusPeriod,
  getRuleMatchWeight,
  resolveRule,
  isEligibleByJoinDate,
  getEligibleHours,
  isConfigActive,
  buildDefaultBillingConfig,
  resolveFinanceConfig,
  getServiceDaysInMonth,
  calculateServiceFeeAmount,
  calculateBonusByRule
};
