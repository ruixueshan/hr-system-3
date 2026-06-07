// utils/db-helper.ts - 跨文件复用的数据库工具函数
// 集中消除 API 层和页面中的重复定义

/**
 * 标准化文本：去空、去首尾空格
 */
export function normalizeText(value?: string | number | null): string {
  return String(value ?? '').trim();
}

/**
 * 标准化电话号码：去除非数字字符
 */
export function normalizePhone(value?: string | number | null): string {
  return normalizeText(value).replace(/\D+/g, '');
}

/**
 * 标准化身份证号：去空 + 转大写
 */
export function normalizeIdCard(value?: string | number | null): string {
  return normalizeText(value).toUpperCase();
}

/**
 * 日期标准化：提取 YYYY-MM-DD 部分
 */
export function normalizeDate(value?: string | Date | null): string {
  if (!value) return '';
  const text = normalizeText(value as any);
  if (!text) return '';
  const match = text.match(/^(\d{4}-\d{2}-\d{2})/);
  if (match) return match[1];
  const parsed = new Date(text);
  if (Number.isNaN(parsed.getTime())) return '';
  const year = parsed.getFullYear();
  const month = String(parsed.getMonth() + 1).padStart(2, '0');
  const day = String(parsed.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * 金额四舍五入到两位小数
 */
export function roundMoney(value: number): number {
  return Math.round((Number(value) || 0) * 100) / 100;
}

/**
 * 数组分块
 */
export function chunkArray<T>(list: T[], size = 20): T[][] {
  if (!Array.isArray(list) || !list.length) return [];
  const chunkSize = Math.max(1, size);
  const result: T[][] = [];
  for (let i = 0; i < list.length; i += chunkSize) {
    result.push(list.slice(i, i + chunkSize));
  }
  return result;
}

/**
 * 批量获取集合所有文档（基于集合名）
 */
export async function fetchAllDocs(db: any, collectionName: string, batchSize = 500): Promise<any[]> {
  const countRes = await db.collection(collectionName).count();
  const total = countRes.total || 0;
  const docs: any[] = [];
  for (let skip = 0; skip < total; skip += batchSize) {
    const res = await db.collection(collectionName).skip(skip).limit(batchSize).get();
    docs.push(...(res.data || []));
  }
  return docs;
}

/**
 * 批量获取文档（基于 query 对象）
 */
export async function fetchAllQueryDocs(query: any, batchSize = 100): Promise<any[]> {
  const countRes = await query.count();
  const total = countRes.total || 0;
  const list: any[] = [];
  for (let skip = 0; skip < total; skip += batchSize) {
    const result = await query.skip(skip).limit(Math.min(batchSize, total - skip)).get();
    list.push(...(result.data || []));
  }
  return list;
}

/**
 * 从 source 中提取指定字段组成新对象
 */
export function pickFields(source: Record<string, any>, fields: string[]): Record<string, any> {
  const payload: Record<string, any> = {};
  fields.forEach((field) => {
    if (source[field] !== undefined) payload[field] = source[field];
  });
  return payload;
}
