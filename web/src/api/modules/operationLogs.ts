/**
 * 操作日志 API
 */
import { getDatabase } from '../cloud';
import type { PaginationParams, PaginationResult } from '../types';

export interface OperationLog {
  _id?: string;
  operator_id?: string;
  operator_name?: string;
  action: string;
  resource?: string;
  details?: string;
  ip?: string;
  created_at: string;
}

export const operationLogsApi = {
  async getList(params?: PaginationParams & { operator?: string; action?: string; start_date?: string; end_date?: string }): Promise<PaginationResult<OperationLog>> {
    const db = await getDatabase();
    const cmd = db.command;
    let query = db.collection('operation_logs');

    if (params?.operator) {
      const reg = db.RegExp({ regexp: params.operator, options: 'i' });
      query = query.where({ operator_name: reg });
    }
    if (params?.action) {
      query = query.where({ action: params.action });
    }
    if (params?.start_date && params?.end_date) {
      query = query.where({
        created_at: cmd.and(cmd.gte(params.start_date), cmd.lte(params.end_date + ' 23:59:59'))
      });
    }

    const pageSize = params?.pageSize || 50;
    const page = params?.page || 1;
    const skip = (page - 1) * pageSize;

    const count = await query.count();
    const total = count.total || 0;

    const res = await query
      .skip(skip)
      .limit(pageSize)
      .orderBy('created_at', 'desc')
      .get();

    const list = (res.data || []).map((i: any) => ({ ...i, _id: i._id || i.id, id: i._id || i.id }));

    return { list, total, page, pageSize, totalPages: Math.ceil(total / pageSize) };
  }
};

/**
 * 便捷写日志（失败时只打印，不抛错）
 */
export async function logAction(action: string, resource?: string, details?: any) {
  try {
    const db = await getDatabase();
    const user = JSON.parse(localStorage.getItem('hr3_user') || '{}');
    const payload: any = {
      action,
      resource,
      details: typeof details === 'string' ? details : JSON.stringify(details || {}),
      operator_id: user?.id || user?._id,
      operator_name: user?.name || '',
      created_at: new Date().toISOString()
    };
    await db.collection('operation_logs').add(payload);
  } catch (err) {
    console.warn('[logAction] 写日志失败', err);
  }
}
