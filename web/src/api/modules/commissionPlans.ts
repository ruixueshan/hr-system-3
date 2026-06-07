/**
 * 提成方案模块 API
 */
import { getDatabase } from '../cloud';
import type { PaginationParams, PaginationResult } from '../types';
import { logAction } from './operationLogs';

export interface CommissionPlan {
  _id?: string;
  name: string;
  scope?: 'template' | 'personal'; // 模板 / 个人
  company_id?: string;
  company_name?: string;
  job_id?: string;
  job_name?: string;
  employee_id?: string;
  employee_name?: string;
  mode: 'percent' | 'fixed'; // 百分比 / 固定金额
  percent?: number;
  amount?: number;
  remark?: string;
  status?: 'active' | 'inactive' | 'deleted';
  is_deleted?: boolean;
  created_at?: string;
  updated_at?: string;
}

export const commissionPlansApi = {
  async getList(params?: PaginationParams & { company_id?: string; job_id?: string; employee_id?: string; status?: string; scope?: string; keyword?: string }): Promise<PaginationResult<CommissionPlan>> {
    try {
      const db = await getDatabase();
      const cmd = db.command;
      let query = db.collection('commission_plans').where({ is_deleted: cmd.neq(true) });

      if (params?.company_id) query = query.where({ company_id: params.company_id });
      if (params?.job_id) query = query.where({ job_id: params.job_id });
      if (params?.employee_id) query = query.where({ employee_id: params.employee_id });
      if (params?.status) query = query.where({ status: params.status });
      if (params?.scope) query = query.where({ scope: params.scope });
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
    } catch (err) {
      console.error('[commissionPlansApi.getList] 失败:', err);
      return { list: [], total: 0, page: 1, pageSize: 20, totalPages: 0 };
    }
  },

  async create(data: Partial<CommissionPlan>): Promise<CommissionPlan> {
    const db = await getDatabase();
    const { _id, id, ...rest } = data as any;
    const payload = {
      scope: rest.scope || (rest.employee_id ? 'personal' : 'template'),
      status: rest.status || 'active',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      ...rest
    };
    const res = await db.collection('commission_plans').add(payload);
    const finalId = (res as any)?.id || (res as any)?._id;
    if (!finalId) throw new Error('未拿到新增提成方案ID，请检查 commission_plans 集合权限或名称');
    await logAction('create', `commission_plan:${finalId}`, payload.name);
    return { _id: finalId, ...payload } as CommissionPlan;
  },

  async update(id: string, data: Partial<CommissionPlan>): Promise<CommissionPlan> {
    const db = await getDatabase();
    const { _id, id: _omit, ...payload } = data as any;
    const detail = await db.collection('commission_plans').doc(id).get();
    if (!detail.data || !detail.data.length) throw new Error('未找到方案或无权限更新');
    const merged = { ...detail.data[0], ...payload, updated_at: new Date().toISOString() };
    delete (merged as any)._id;
    delete (merged as any).id;
    delete (merged as any)._openid;
    const res = await db.collection('commission_plans').doc(id).set(merged);
    if (!res.updated && !(res as any).ok && !(res as any).stats) {
      throw new Error('未找到方案或无权限更新');
    }
    await logAction('update', `commission_plan:${id}`, payload);
    return { _id: id, ...payload } as CommissionPlan;
  },

  async delete(id: string): Promise<void> {
    const db = await getDatabase();
    const res = await db.collection('commission_plans').doc(id).update({
      status: 'deleted',
      is_deleted: true,
      deleted_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    });
    if (!res.updated) throw new Error('删除失败');
    await logAction('delete', `commission_plan:${id}`);
  }
};
