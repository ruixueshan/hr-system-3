// utils/format.ts - 格式化工具函数
export const BEIJING_TIME_ZONE = 'Asia/Shanghai';

/**
 * 日期格式化
 * @param date Date对象、时间戳或日期字符串
 * @param fmt 格式模板
 */
export function formatDate(date: Date | string | number, fmt = 'YYYY-MM-DD HH:mm:ss'): string {
  if (!date) return '-';

  const d = normalizeDateInput(date);
  if (!d) return '-';

  const parts = getTimePartsByZone(d, BEIJING_TIME_ZONE);
  return fmt.replace(/YYYY|MM|DD|HH|mm|ss/g, (token) => parts[token]);
}

export function getNowBeijing(fmt: 'YYYY-MM-DD' | 'YYYY-MM' | 'YYYY-MM-DD HH:mm:ss' = 'YYYY-MM-DD'): string {
  return formatDate(new Date(), fmt);
}

export function getTodayBeijing(): string {
  return getNowBeijing('YYYY-MM-DD');
}

export function getCurrentMonthBeijing(): string {
  return getNowBeijing('YYYY-MM');
}

export function normalizeToBeijingDate(input: Date | string | number | null | undefined): string {
  if (!input) return '';
  const text = formatDate(input, 'YYYY-MM-DD');
  return text === '-' ? '' : text;
}

function parseLocalShanghaiDateTime(str: string): Date | null {
  const m = str.match(/^(\d{4})-(\d{2})-(\d{2})[T\s](\d{2}):(\d{2})(?::(\d{2}))?$/);
  if (!m) return null;
  const year = Number(m[1]);
  const month = Number(m[2]);
  const day = Number(m[3]);
  const hour = Number(m[4]);
  const minute = Number(m[5]);
  const second = Number(m[6] || '0');
  if ([year, month, day, hour, minute, second].some((n) => Number.isNaN(n))) return null;
  // Persisted datetime strings in this project are intended as Shanghai local time.
  return new Date(Date.UTC(year, month - 1, day, hour - 8, minute, second));
}

function normalizeDateInput(input: Date | string | number | any): Date | null {
  if (!input) return null;
  if (input instanceof Date) return Number.isNaN(input.getTime()) ? null : input;

  if (typeof input === 'number') {
    const value = input < 1e12 ? input * 1000 : input;
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
  }

  if (typeof input === 'string') {
    const str = input.trim();
    if (!str || str === '-') return null;
    if (/^\d{10}$/.test(str)) return normalizeDateInput(parseInt(str, 10) * 1000);
    if (/^\d{13}$/.test(str)) return normalizeDateInput(parseInt(str, 10));
    if (/^\d{4}-\d{2}-\d{2}$/.test(str)) {
      return normalizeDateInput(`${str}T00:00:00+08:00`);
    }
    if (/^\d{4}-\d{2}-\d{2}(?:\s|T)\d{2}:\d{2}(?::\d{2})?(?:\.\d+)?$/.test(str)) {
      const parsed = parseLocalShanghaiDateTime(str);
      return parsed && !Number.isNaN(parsed.getTime()) ? parsed : null;
    }
    const date = new Date(str);
    return Number.isNaN(date.getTime()) ? null : date;
  }

  if (typeof input === 'object') {
    if (typeof input.toDate === 'function') {
      const d = input.toDate();
      return normalizeDateInput(d);
    }
    if (typeof input.$date !== 'undefined') return normalizeDateInput(input.$date);
    if (typeof input.seconds === 'number') {
      const ms = input.seconds * 1000 + Math.floor((input.nanoseconds || 0) / 1e6);
      return normalizeDateInput(ms);
    }
    if (typeof input._seconds === 'number') {
      const ms = input._seconds * 1000 + Math.floor((input._nanoseconds || 0) / 1e6);
      return normalizeDateInput(ms);
    }
    if (typeof input.ts === 'number') return normalizeDateInput(input.ts);
  }

  const fallback = new Date(input as any);
  return Number.isNaN(fallback.getTime()) ? null : fallback;
}

function getTimePartsByZone(date: Date, timeZone: string): Record<string, string> {
  const formatter = new Intl.DateTimeFormat('zh-CN', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false
  });
  const parts = formatter.formatToParts(date);
  const map: Record<string, string> = {
    YYYY: '',
    MM: '',
    DD: '',
    HH: '',
    mm: '',
    ss: ''
  };

  for (const p of parts) {
    if (p.type === 'year') map.YYYY = p.value;
    if (p.type === 'month') map.MM = p.value;
    if (p.type === 'day') map.DD = p.value;
    if (p.type === 'hour') map.HH = p.value;
    if (p.type === 'minute') map.mm = p.value;
    if (p.type === 'second') map.ss = p.value;
  }

  return map;
}

/**
 * 金额格式化（千分位）
 */
export function formatMoney(amount: number | string, decimals = 2): string {
  const num = Number(amount);
  if (isNaN(num)) return '0.00';
  return num.toFixed(decimals).replace(/\d{1,3}(?=(\d{3})+(\.\d*)?$)/g, '$&,');
}

/**
 * 手机号脱敏
 */
export function maskPhone(phone: string): string {
  if (!phone || phone.length !== 11) return phone || '-';
  return phone.replace(/(\d{3})\d{4}(\d{4})/, '$1****$2');
}

/**
 * 获取状态文本
 */
export function getStatusText(status: string): string {
  const statusMap: Record<string, string> = {
    // 企业状态
    'active': '合作中',
    'paused': '暂停合作',
    'terminated': '终止合作',
    // 候选人状态
    'pending': '待联系',
    'contacted': '已联系',
    'interview': '已面试',
    'passed': '已通过',
    'rejected': '未通过',
    'cancelled': '已取消',
    // 员工状态
    'probation': '试用期',
    'regular': '正式员工',
    'resigned': '已离职',
    // 工时状态
    'worktime_approved': '已通过',
    'worktime_rejected': '已驳回',
    // 薪资状态
    'calculated': '核算完成',
    'approved': '已审核',
    'paid': '已发放'
  };
  return statusMap[status] || status;
}

/**
 * 获取状态标签类型（Element Plus）
 */
export function getStatusType(status: string): '' | 'success' | 'warning' | 'info' | 'danger' {
  const typeMap: Record<string, '' | 'success' | 'warning' | 'info' | 'danger'> = {
    'active': 'success',
    'paused': 'warning',
    'terminated': 'info',
    'pending': 'warning',
    'contacted': '',
    'interview': '',
    'passed': 'success',
    'rejected': 'danger',
    'cancelled': 'info',
    'probation': 'warning',
    'regular': 'success',
    'resigned': 'info',
    'worktime_approved': 'success',
    'worktime_rejected': 'danger',
    'calculated': '',
    'approved': 'success',
    'paid': 'success'
  };
  return typeMap[status] || '';
}

// 别名（兼容不同命名）
export const getStatusTagType = getStatusType;

/**
 * 获取来源文本
 */
export function getSourceText(source: string): string {
  const sourceMap: Record<string, string> = {
    'miniprogram': '小程序',
    'import': '导入',
    'admin': '管理员',
    'qrcode': '二维码',
    'unknown': '未知'
  };
  return sourceMap[source] || source;
}

