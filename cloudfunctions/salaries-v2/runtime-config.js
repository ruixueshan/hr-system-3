const SALARY_INSURANCE_V2_START_MONTH = '2026-04';
const SALARY_INSURANCE_V2_START_DATE = '2026-04-01';

function normalizeYearMonth(value) {
  const text = String(value || '');
  const match = text.match(/^(\d{4})-(\d{2})/);
  return match ? `${match[1]}-${match[2]}` : '';
}

function isInsuranceMonthInV2Scope(value) {
  const yearMonth = normalizeYearMonth(value);
  return Boolean(yearMonth && yearMonth >= SALARY_INSURANCE_V2_START_MONTH);
}

module.exports = {
  SALARY_INSURANCE_V2_START_DATE,
  SALARY_INSURANCE_V2_START_MONTH,
  isInsuranceMonthInV2Scope
};
