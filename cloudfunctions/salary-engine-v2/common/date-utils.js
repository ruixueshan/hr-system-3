/**
 * 统一日期工具模块
 * 收录散落在 salary-engine、worktime、employees、interviews、applications 中的日期函数
 * 消除 8+ 文件中的重复定义
 */

/**
 * 将各种日期格式规范化为 YYYY-MM-DD 字符串
 * 支持: string, Date, Firestore Timestamp ({seconds}), CloudBase ServerDate ({toDate()})
 */
function normalizeDate(value) {
  if (!value) return '';
  if (typeof value === 'string') {
    const match = value.match(/^(\d{4}-\d{2}-\d{2})/);
    return match ? match[1] : '';
  }
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) return '';
    return value.toISOString().slice(0, 10);
  }
  if (typeof value.toDate === 'function') return value.toDate().toISOString().slice(0, 10);
  if (typeof value.seconds === 'number') return new Date(value.seconds * 1000).toISOString().slice(0, 10);
  if (typeof value._seconds === 'number') return new Date(value._seconds * 1000).toISOString().slice(0, 10);
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '' : date.toISOString().slice(0, 10);
}

/** normalizeDate 别名，兼容 insurance-v2 旧调用方 */
const toDateStr = normalizeDate;

/**
 * 将各种日期格式转换为完整 ISO-8601 字符串
 */
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

/** 格式化为 YYYY-MM */
function buildYearMonth(year, month) {
  return `${year}-${String(month).padStart(2, '0')}`;
}

/** buildYearMonth 的别名 */
const formatYearMonth = buildYearMonth;

/** 获取某月天数 */
function daysInMonth(year, month) {
  return new Date(year, month, 0).getDate();
}

/**
 * 计算日期范围内天数（含首尾）
 * start/end: YYYY-MM-DD 字符串
 */
function daysBetweenInclusive(start, end) {
  const startDate = new Date(`${start}T00:00:00`);
  const endDate = new Date(`${end}T00:00:00`);
  const diff = endDate.getTime() - startDate.getTime();
  if (diff < 0) return 0;
  return Math.floor(diff / (24 * 60 * 60 * 1000)) + 1;
}

/**
 * 计算两个日期之间的天数（不含首日）
 */
function daysBetween(start, end) {
  const oneDay = 24 * 60 * 60 * 1000;
  return Math.round(Math.abs((new Date(end) - new Date(start)) / oneDay));
}

/** 获取指定月份的 start/end/yearMonth */
function getMonthDateRange(year, month) {
  const yearMonth = buildYearMonth(year, month);
  const start = `${yearMonth}-01`;
  const end = `${yearMonth}-${String(daysInMonth(year, month)).padStart(2, '0')}`;
  return { start, end, yearMonth };
}

/**
 * 计算员工在指定月份的在职天数
 */
function getServiceDaysInMonth(year, month, joinDate, leaveDate) {
  const yearMonth = buildYearMonth(year, month);
  let start = `${yearMonth}-01`;
  let end = `${yearMonth}-${String(daysInMonth(year, month)).padStart(2, '0')}`;
  const normalizedJoin = normalizeDate(joinDate);
  const normalizedLeave = normalizeDate(leaveDate);

  if (normalizedJoin && normalizedJoin > start) start = normalizedJoin;
  if (normalizedLeave && normalizedLeave < end) end = normalizedLeave;
  if (start > end) return 0;
  return daysBetweenInclusive(start, end);
}

/** 日期加减天数，返回 YYYY-MM-DD */
function addDays(dateText, days) {
  const date = new Date(`${dateText}T00:00:00+08:00`);
  if (Number.isNaN(date.getTime())) return '';
  date.setDate(date.getDate() + days);
  return date.toISOString().slice(0, 10);
}

/** 日期加减月数，返回 YYYY-MM-DD（自动处理月末溢出） */
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

/** 取最小日期（字符串排序） */
function minDate(...dates) {
  return dates.filter(Boolean).sort()[0] || '';
}

/** 取最大日期（字符串排序） */
function maxDate(...dates) {
  return dates.filter(Boolean).sort().slice(-1)[0] || '';
}

/** 计算两个日期范围的交集 */
function getDateOverlap(startA, endA, startB, endB) {
  const start = maxDate(startA, startB);
  const end = minDate(endA, endB);
  if (!start || !end || start > end) return null;
  return { start, end };
}

/** 计算日期相差天数（含首尾） */
function getDateDiffDays(startDateText, endDateText) {
  if (!startDateText || !endDateText) return 0;
  const start = new Date(`${startDateText}T00:00:00+08:00`);
  const end = new Date(`${endDateText}T00:00:00+08:00`);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end < start) return 0;
  return Math.floor((end - start) / (24 * 60 * 60 * 1000)) + 1;
}

/** 获取上一个月份 */
function getPreviousYearMonth(year, month) {
  const baseDate = new Date(year, month - 1, 1);
  baseDate.setMonth(baseDate.getMonth() - 1);
  return {
    year: baseDate.getFullYear(),
    month: baseDate.getMonth() + 1,
    yearMonth: buildYearMonth(baseDate.getFullYear(), baseDate.getMonth() + 1)
  };
}

/** 规范化规则开始日期，支持 YYYY-MM-DD 和 YYYY-MM 格式 */
function normalizeRuleStartDate(value, fallback = '') {
  const text = String(value || '').trim();
  if (!text) return fallback;
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return text;
  if (/^\d{4}-\d{2}$/.test(text)) return `${text}-01`;
  return fallback;
}

/** 规范化规则结束日期，YYYY-MM 自动取月末 */
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

module.exports = {
  normalizeDate,
  toDateStr,
  toIsoString,
  buildYearMonth,
  formatYearMonth,
  daysInMonth,
  daysBetweenInclusive,
  daysBetween,
  getMonthDateRange,
  getServiceDaysInMonth,
  addDays,
  addMonths,
  minDate,
  maxDate,
  getDateOverlap,
  getDateDiffDays,
  getPreviousYearMonth,
  normalizeRuleStartDate,
  normalizeRuleEndDate
};
