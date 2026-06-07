/**
 * 二维码模块 API
 */

import { callFunction } from '../cloud';

export interface QRCode {
  _id?: string;
  id?: string;
  code: string;
  job_id?: string;
  company_id?: string;
  company_name?: string;
  job_name?: string;
  creator_id?: string;
  creator_name?: string;
  recommender_id?: string;
  recommender_name?: string;
  type: 'job_referral' | 'agent_referral' | 'internal_onboard' | 'interview_checkin' | 'recruitment' | 'verification';
  qr_url?: string;
  qrUrl?: string;
  landing_page?: string;
  interview_date?: string;
  location?: string;
  status?: string;
  internal_only?: boolean;
  max_uses?: number | null;
  used_count?: number;
  scan_count?: number;
  created_at?: string;
  updated_at?: string;
}

async function callQRCode<T = any>(action: string, data: Record<string, any> = {}) {
  return callFunction('qrcode', action, data) as Promise<T>;
}

export const qrcodeApi = {
  // 获取二维码列表
  async getList(params?: any): Promise<any> {
    try {
      const list = await callQRCode<QRCode[]>('list', params || {});
      return { list: list || [], total: list?.length || 0 };
    } catch (err: any) {
      console.error('[qrcodeApi.getList] 失败:', err);
      return { list: [], total: 0 };
    }
  },

  // 创建二维码
  async create(data: Partial<QRCode>): Promise<QRCode> {
    try {
      return await callQRCode<QRCode>('generate', data);
    } catch (err: any) {
      console.error('[qrcodeApi.create] 失败:', err);
      throw new Error(err.message || '创建二维码失败');
    }
  },

  async generateInternalOnboard(data: { job_id: string; creator_id: string; max_uses?: number; expire_time?: string | null }) {
    return callQRCode<QRCode>('generate', {
      type: 'internal_onboard',
      ...data
    });
  },

  async generateInterviewCheckin(data: { company_id: string; job_id: string; interview_date: string; creator_id: string; location?: string }) {
    return callQRCode<QRCode>('generate', {
      type: 'interview_checkin',
      ...data
    });
  }
};
