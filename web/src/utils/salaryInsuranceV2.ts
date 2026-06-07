function buildYearMonth(year: number, month: number) {
  return `${year}-${String(month).padStart(2, '0')}`;
}

function toDateStr(value?: string | Date | null) {
  if (!value) return '';
  if (typeof value === 'string') {
    const match = value.match(/^(\d{4}-\d{2}-\d{2})/);
    if (match) return match[1];
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function roundMoney(value: number) {
  return Math.round((Number(value) || 0) * 100) / 100;
}

function daysInMonth(year: number, month: number) {
  return new Date(year, month, 0).getDate();
}

function daysBetweenInclusive(start: string, end: string) {
  const startDate = new Date(`${start}T00:00:00`);
  const endDate = new Date(`${end}T00:00:00`);
  const diff = endDate.getTime() - startDate.getTime();
  if (diff < 0) return 0;
  return Math.floor(diff / (24 * 60 * 60 * 1000)) + 1;
}

export function getServiceDaysInMonth(year: number, month: number, joinDate?: string | null, leaveDate?: string | null) {
  const yearMonth = buildYearMonth(year, month);
  let start = `${yearMonth}-01`;
  let end = `${yearMonth}-${String(daysInMonth(year, month)).padStart(2, '0')}`;
  const normalizedJoin = toDateStr(joinDate || '');
  const normalizedLeave = toDateStr(leaveDate || '');

  if (normalizedJoin && normalizedJoin > start) start = normalizedJoin;
  if (normalizedLeave && normalizedLeave < end) end = normalizedLeave;
  if (start > end) return 0;
  return daysBetweenInclusive(start, end);
}

export function isEntryMonth(year: number, month: number, joinDate?: string | null) {
  const joinDateStr = toDateStr(joinDate || '');
  if (!joinDateStr) return false;
  return joinDateStr.slice(0, 7) === buildYearMonth(year, month);
}

export function calculateMonthlyInsuranceObligation(params: {
  year: number;
  month: number;
  joinDate?: string | null;
  leaveDate?: string | null;
  insuranceDailyDeduct?: number;
  insuranceMonthlyDeduct?: number;
}) {
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
  if (!dailyDeduct && !monthlyDeduct) return 0;

  if (isEntryMonth(year, month, joinDate)) {
    const serviceDays = getServiceDaysInMonth(year, month, joinDate, leaveDate);
    return roundMoney(Math.min(serviceDays * dailyDeduct, monthlyDeduct || serviceDays * dailyDeduct));
  }

  return roundMoney(monthlyDeduct);
}

export function getPreviousYearMonth(year: number, month: number) {
  const baseDate = new Date(year, month - 1, 1);
  baseDate.setMonth(baseDate.getMonth() - 1);
  return {
    year: baseDate.getFullYear(),
    month: baseDate.getMonth() + 1,
    yearMonth: buildYearMonth(baseDate.getFullYear(), baseDate.getMonth() + 1)
  };
}
