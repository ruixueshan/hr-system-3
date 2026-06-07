/**
 * 工价方案模块 API
 */

import { getDatabase } from '../cloud';
import type { PaginationParams, PaginationResult } from '../types';
import { logAction } from './operationLogs';

export interface RatePlan {
  _id?: string;
  id?: string;
  company_id?: string;
  company_name?: string;
  name: string;
  hourly_rate_daily?: number;
  daily_rate_daily?: number;
  pay_hours_daily?: number;
  night_hourly_rate_daily?: number;
  night_daily_rate_daily?: number;
  hourly_rate_monthly?: number;
  daily_rate_monthly?: number;
  pay_hours_monthly?: number;
  night_hourly_rate_monthly?: number;
  night_daily_rate_monthly?: number;
  night_hourly_rate?: number;
  night_daily_rate?: number;
  insurance_daily_deduct?: number;
  insurance_monthly_deduct?: number;
  effective_from?: string;
  effective_to?: string;
  status?: 'active' | 'inactive' | 'deleted';
  is_deleted?: boolean;
  deleted_at?: string;
  created_at?: string;
  updated_at?: string;
}

export const ratePlansApi = {
  async getList(params?: PaginationParams & { company_id?: string; keyword?: string; status?: string }): Promise<PaginationResult<RatePlan>> {
    try {
      const db = await getDatabase();
      let query = db.collection('rate_plans');
      const cmd = db.command;

      // 默认排除软删除
      query = query.where({ is_deleted: cmd.neq(true) });

      if (params?.company_id) query = query.where({ company_id: params.company_id });
      if (params?.status) query = query.where({ status: params.status });
      if (params?.keyword) {
        const reg = db.RegExp({ regexp: params.keyword, options: 'i' });
        query = query.where({ name: reg });
      }

      const pageSize = params?.pageSize || 20;
      const page = params?.page || 1;
      const skip = (page - 1) * pageSize;

      const count = await query.count();
      const total = count.total || 0;
      const res = await query.skip(skip).limit(pageSize).orderBy('created_at', 'desc').get();
      const list = (res.data || []).map((i: any) => {
        const id = i._id || i.id;
        return { ...i, _id: id, id };
      });
      return { list, total, page, pageSize, totalPages: Math.ceil(total / pageSize) };
    } catch (err: any) {
      console.error('[ratePlansApi.getList] 失败:', err);
      return { list: [], total: 0, page: 1, pageSize: 20, totalPages: 0 };
    }
  },

  async create(data: Partial<RatePlan>): Promise<RatePlan> {
    const db = await getDatabase();
    const { _id, id: _omit, ...rest } = data as any;

    // 保证写入字段不携带 _id，交由云端自动生成
    const payload = {
      status: 'active',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      ...rest
    };

    const res = await db.collection('rate_plans').add(payload);
    const finalId = (res as any)?.id || (res as any)?._id;
    if (!finalId) {
      throw new Error('未拿到新增记录ID，请检查 rate_plans 集合名称与权限');
    }

    await logAction('create', `rate_plan:${finalId}`, payload.name);
    return { _id: finalId, id: finalId, ...payload } as RatePlan;
  },

  async update(id: string, data: Partial<RatePlan>): Promise<RatePlan> {
    const db = await getDatabase();
    const { _id, id: _omit, ...payload } = data as any;

    // 先取原记录，随后用 set 全量写入，避免某些字段（如 company_id）更新失败
    const detail = await db.collection('rate_plans').doc(id).get();
    if (!detail.data || !detail.data.length) {
      throw new Error('未找到方案或无权限更新');
    }
    const existing = detail.data[0];
    const merged = { ...existing, ...payload, updated_at: new Date().toISOString() };
    delete (merged as any)._id;
    delete (merged as any).id;
    delete (merged as any)._openid;

    const setRes = await db.collection('rate_plans').doc(id).set(merged);
    if (!setRes.updated && !(setRes as any).ok && !(setRes as any).stats) {
      throw new Error('未找到方案或无权限更新');
    }

    await logAction('update', `rate_plan:${id}`, payload);
    return { _id: id, ...payload } as RatePlan;
  },

  async delete(id: string): Promise<void> {
    const db = await getDatabase();
    const res = await db.collection('rate_plans').doc(id).update({
      status: 'deleted',
      is_deleted: true,
      deleted_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    });
    if (!res.updated) throw new Error('删除失败');
    await logAction('delete', `rate_plan:${id}`);
  }
};
