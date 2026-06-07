/**
 * 求职应聘模块 API
 */

import { getDatabase } from '../cloud';
import type { Application, PaginationParams, PaginationResult } from '../types';

export const applicationsApi = {
  // 获取应聘列表
  async getList(params?: PaginationParams & { status?: string; job_id?: string; source?: string }): Promise<PaginationResult<Application>> {
    try {
      const db = await getDatabase();
      let query = db.collection('applications');

      if (params?.status) {
        query = query.where({ status: params.status });
      }
      if (params?.job_id) {
        query = query.where({ job_id: params.job_id });
      }
      if (params?.source) {
        query = query.where({ source: params.source });
      }

      const pageSize = params?.pageSize || 20;
      const page = params?.page || 1;
      const skip = (page - 1) * pageSize;

      const countResult = await query.count();
      const total = countResult.total || 0;

      const result = await query
        .skip(skip)
        .limit(pageSize)
        .orderBy('apply_time', 'desc')
        .get();

      return {
        list: result.data as Application[] || [],
        total,
        page,
        pageSize,
        totalPages: Math.ceil(total / pageSize)
      };
    } catch (err: any) {
      console.error('[applicationsApi.getList] 失败:', err);
      return { list: [], total: 0, page: 1, pageSize: 20, totalPages: 0 };
    }
  },

  // 创建应聘
  async create(data: Partial<Application>): Promise<Application> {
    try {
      const db = await getDatabase();
      const application = {
        ...data,
        apply_time: new Date().toISOString(),
        status: 'pending'
      };

      const result = await db.collection('applications').add(application);
      return { _id: result.id, ...application } as Application;
    } catch (err: any) {
      console.error('[applicationsApi.create] 失败:', err);
      throw new Error(err.message || '创建应聘失败');
    }
  },

  // 获取候选人历史报名记录（按 user_id 或 phone）
  async getHistory(params: { user_id?: string; phone?: string; limit?: number }): Promise<Application[]> {
    try {
      const db = await getDatabase();
      let query = db.collection('applications');
      if (params.user_id) {
        query = query.where({ user_id: params.user_id });
      } else if (params.phone) {
        query = query.where({ phone: params.phone });
      } else {
        return [];
      }
      const res = await query
        .orderBy('apply_time', 'desc')
        .limit(params.limit || 50)
        .get();
      return res.data || [];
    } catch (err: any) {
      console.error('[applicationsApi.getHistory] 失败:', err);
      return [];
    }
  },

  // 更新报名
  async update(id: string, data: Partial<Application>): Promise<Application> {
    try {
      const db = await getDatabase();
      const { _id: _omit1, id: _omit2, ...payload } = data as any;
      const res = await db.collection('applications')
        .doc(id)
        .update({ ...payload, updated_at: new Date().toISOString() });
      if (!res.updated) {
        throw new Error('未找到报名或无权限更新');
      }
      return { _id: id, ...payload } as Application;
    } catch (err: any) {
      console.error('[applicationsApi.update] 失败:', err);
      throw new Error(err.message || '更新报名失败');
    }
  },

  async updateStatus(id: string, status: Application['status']): Promise<void> {
    await applicationsApi.update(id, { status });
  },

  // 获取仪表板统计
  async getDashboardStats(): Promise<any> {
    try {
      const db = await getDatabase();
      const total = await db.collection('applications').count();
      const pending = await db.collection('applications').where({ status: 'pending' }).count();
      const interview = await db.collection('applications').where({ status: 'interview' }).count();
      return {
        totalApplications: total.total || 0,
        pendingApplications: pending.total || 0,
        interviewApplications: interview.total || 0
      };
    } catch (err: any) {
      console.error('[applicationsApi.getDashboardStats] 失败:', err);
      return { totalApplications: 0, pendingApplications: 0, interviewApplications: 0 };
    }
  }
};
