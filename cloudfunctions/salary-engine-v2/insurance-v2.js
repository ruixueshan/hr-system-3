/**
 * insurance-v2.js (v2) - 保险计算工具
 * 改用 common/date-utils 消除日期函数重复
 */
const {
  buildYearMonth,
  toDateStr,
  daysInMonth,
  daysBetweenInclusive,
  getServiceDaysInMonth,
  getPreviousYearMonth
} = require('./common/date-utils');

function roundMoney(value) {
  return Math.round((Number(value) || 0) * 100) / 100;
}

function isEntryMonth(year, month, joinDate) {
  const joinDateStr = toDateStr(joinDate);
  if (!joinDateStr) return false;
  return joinDateStr.slice(0, 7) === buildYearMonth(year, month);
}

function calculateMonthlyInsuranceObligation(params = {}) {
  const {
    year,
    month,
    joinDate,
    leaveDate,
    insuranceDailyDeduct = 0,
    insuranceMonthlyDeduct = 0
  } = params;

  const dailyDeduct = Number(insuranceDailyDeduct || 0);
  const monthlyDeduct = Number(insuranceMonthlyDeduct || 0);
  if (!year || !month) return 0;
  if (!dailyDeduct && !monthlyDeduct) return 0;

  if (isEntryMonth(year, month, joinDate)) {
    const serviceDays = getServiceDaysInMonth(year, month, joinDate, leaveDate);
    return roundMoney(Math.min(serviceDays * dailyDeduct, monthlyDeduct || serviceDays * dailyDeduct));
  }

  return roundMoney(monthlyDeduct);
}

function buildInsuranceShadowSnapshot(params = {}) {
  const {
    settlementMode = 'monthly',
    year,
    month,
    joinDate,
    leaveDate,
    insuranceDailyDeduct = 0,
    insuranceMonthlyDeduct = 0
  } = params;

  const obligationAmount = calculateMonthlyInsuranceObligation({
    year, month, joinDate, leaveDate, insuranceDailyDeduct, insuranceMonthlyDeduct
  });

  const currentMonth = buildYearMonth(year, month);
  const previousMonth = getPreviousYearMonth(year, month);

  return {
    rule_version: 'v2',
    settlement_mode: settlementMode,
    insurance_month: currentMonth,
    current_month_obligation: obligationAmount,
    collection_month: currentMonth,
    previous_month_for_daily_preview: previousMonth.yearMonth,
    join_date: toDateStr(joinDate),
    leave_date: toDateStr(leaveDate),
    insurance_daily_deduct: roundMoney(insuranceDailyDeduct),
    insurance_monthly_deduct: roundMoney(insuranceMonthlyDeduct)
  };
}

module.exports = {
  buildYearMonth,
  toDateStr,
  roundMoney,
  getServiceDaysInMonth,
  isEntryMonth,
  calculateMonthlyInsuranceObligation,
  getPreviousYearMonth,
  buildInsuranceShadowSnapshot
};
