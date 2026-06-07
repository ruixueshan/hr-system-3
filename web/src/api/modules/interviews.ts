/**
 * 面试管理 API
 * interviews 表已废弃，本模块保留文件名用于前端兼容，实际全部走 applications。
 */

import { callFunction } from '../cloud';
import type { PaginationParams, PaginationResult } from '../types';

export interface Interview {
  _id?: string;
  application_id?: string;
  job_id?: string;
  company_id?: string;
  job_name?: string;
  company_name?: string;
  user_id?: string;
  candidate_name?: string;
  phone?: string;
  id_card?: string;
  recommender_id?: string;
  recommender_name?: string;
  interview_time?: string;
  status?: 'pending' | 'arrived' | 'passed' | 'rejected' | 'onboarded' | 'cancelled' | string;
  result?: 'pending' | 'passed' | 'rejected' | 'absent' | 'hired' | 'onboarded' | string;
  checkin_status?: 'not_checked_in' | 'checked_in' | 'onboarded' | 'absent' | string;
  checked_in_at?: string;
  application_status?: string;
  application_source?: string;
  application_checkin_time?: string;
  employee_id?: string;
  employee_company_id?: string;
  onboarded_at?: string;
  remark?: string;
  created_at?: string;
  updated_at?: string;
}

export const interviewsApi = {
  async getList(params?: PaginationParams & {
    candidate_name?: string;
    job_name?: string;
    result?: Interview['result'];
    checkin_status?: string;
    date_from?: string;
    date_to?: string;
    include_all?: boolean;
  }): Promise<PaginationResult<Interview>> {
    try {
      const result = await callFunction('applications', 'list-interviews', params || {});
      return {
        list: result?.list || [],
        total: result?.total || 0,
        page: result?.page || params?.page || 1,
        pageSize: result?.pageSize || params?.pageSize || 20,
        totalPages: result?.totalPages || 0
      };
    } catch (err: any) {
      console.error('[interviewsApi.getList] 失败:', err);
      return { list: [], total: 0, page: 1, pageSize: 20, totalPages: 0 };
    }
  },

  async setResult(id: string, result: Interview['result']) {
    try {
      return callFunction('applications', 'update-result', {
        application_id: id,
        result
      });
    } catch (err: any) {
      console.error('[interviewsApi.setResult] 失败:', err);
      throw new Error(err.message || '更新面试失败');
    }
  },

  async onboard(id: string, joinDate?: string) {
    try {
      return callFunction('applications', 'onboard-application', {
        application_id: id,
        join_date: joinDate || new Date().toISOString().slice(0, 10)
      });
    } catch (err: any) {
      console.error('[interviewsApi.onboard] 失败:', err);
      throw new Error(err.message || '办理入职失败');
    }
  }
};
