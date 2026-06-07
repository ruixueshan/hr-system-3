/**
 * 工资预支模块 API
 */

import { getDatabase } from '../cloud';
import { logAction } from './operationLogs';
import type { Advance } from '../types';

export const advancesApi = {
  // 获取垫付列表
  async getList(params?: { status?: string; employee_name?: string; page?: number; pageSize?: number }): Promise<any> {
    try {
      const db = await getDatabase();
      let query = db.collection('salary_advances');
      const cmd = db.command;
      if (params?.status) query = query.where({ status: params.status });
      if (params?.employee_name) {
        const reg = db.RegExp({ regexp: params.employee_name, options: 'i' });
        query = query.where({ employee_name: reg });
      }
      const pageSize = params?.pageSize || 20;
      const page = params?.page || 1;
      const skip = (page - 1) * pageSize;
      const count = await query.count();
      const total = count.total || 0;
      const res = await query.skip(skip).limit(pageSize).orderBy('created_at', 'desc').get();
      return { list: res.data || [], total, page, pageSize };
    } catch (err: any) {
      console.error('[advancesApi.getList] 失败:', err);
      return { list: [], total: 0 };
    }
  },

  // 创建垫付记录
  async create(data: Partial<Advance>): Promise<Advance> {
    try {
      const db = await getDatabase();
      const advance = {
        ...data,
        apply_amount: data.amount || data.apply_amount,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        status: 'pending'
      };

      const result = await db.collection('salary_advances').add(advance);
      await logAction('create', `advance:${result.id}`, advance);
      return { _id: result.id, ...advance } as Advance;
    } catch (err: any) {
      console.error('[advancesApi.create] 失败:', err);
      throw new Error(err.message || '创建垫付记录失败');
    }
  },

  // 申请预支（员工端）
  async apply(data: Partial<Advance>): Promise<Advance> {
    return this.create({
      ...data,
      status: 'pending'
    });
  },

  // 审批预支
  async approve(id: string, approved: boolean, remark?: string, amount_approved?: number): Promise<Advance> {
    try {
      const db = await getDatabase();
      const updateData: any = {
        status: approved ? 'approved' : 'rejected',
        updated_at: new Date().toISOString()
      };
      if (remark) updateData.remark = remark;
      if (amount_approved) updateData.amount_approved = amount_approved;
      
      await db.collection('salary_advances').doc(id).update(updateData);
      await logAction(approved ? 'approve' : 'reject', `advance:${id}`, updateData);
      return { _id: id, ...updateData } as Advance;
    } catch (err: any) {
      console.error('[advancesApi.approve] 失败:', err);
      throw new Error(err.message || '审批失败');
    }
  },

  async reject(id: string, remark?: string): Promise<Advance> {
    return this.approve(id, false, remark);
  },

  // 打款
  async pay(id: string, data?: { pay_time?: string }): Promise<Advance> {
    const db = await getDatabase();
    const payload = {
      status: 'paid',
      pay_time: data?.pay_time || new Date().toISOString(),
      updated_at: new Date().toISOString()
    };
    const res = await db.collection('salary_advances').doc(id).update(payload);
    if (!res.updated) throw new Error('未找到预支记录或无权限');
    await logAction('pay', `advance:${id}`, payload);
    return { _id: id, ...payload } as Advance;
  }
};
