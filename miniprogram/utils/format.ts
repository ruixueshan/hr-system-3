// utils/format.ts - 格式化工具函数

/**
 * 格式化手机号，隐藏中间4位
 * @param phone 手机号
 * @returns 格式化后的手机号
 */
function formatPhone(phone: string): string {
  if (!phone || phone.length < 11) return phone;
  return phone.replace(/(\d{3})\d{4}(\d{4})/, '$1****$2');
}

/**
 * 格式化金额，千分位分隔
 * @param amount 金额
 * @returns 格式化后的金额
 */
function formatAmount(amount: number): string {
  if (typeof amount !== 'number') return '0';
  return amount.toLocaleString();
}

/**
 * 格式化日期
 * @param date 日期字符串或时间戳
 * @returns 格式化后的日期 YYYY-MM-DD
 */
function formatDate(date: string | number): string {
  const d = new Date(date);
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * 格式化时间
 * @param date 日期字符串或时间戳
 * @returns 格式化后的时间 YYYY-MM-DD HH:mm:ss
 */
function formatDateTime(date: string | number): string {
  const d = new Date(date);
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  const hours = String(d.getHours()).padStart(2, '0');
  const minutes = String(d.getMinutes()).padStart(2, '0');
  const seconds = String(d.getSeconds()).padStart(2, '0');
  return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
}

// CommonJS 导出
module.exports = {
  formatPhone,
  formatAmount,
  formatDate,
  formatDateTime
};

export {};
