/**
 * 工资模块 API
 */

import { callFunction } from '../cloud';
import type { Salary } from '../types';

// 薪资模块统一收口到 V2，避免再落回 legacy salaries
const salariesFnName = 'salaries-v2';
console.log('[salariesApi] 使用云函数:', salariesFnName);

function normalizeDailyPreviewWorktime(item: any) {
  return {
    _id: item?._id || item?.worktime_id || '',
    worktime_id: item?.worktime_id || item?._id || '',
    employee_id: item?.employee_id || '',
    employee_name: item?.employee_name || '',
    employee_no: item?.employee_no || '',
    company_id: item?.company_id || '',
    company_name: item?.company_name || '',
    job_id: item?.job_id || '',
    job_name: item?.job_name || '',
    rate_plan_id: item?.rate_plan_id || '',
    work_date: item?.work_date || '',
    shift: item?.shift || 'day',
    total_hours: Number(item?.total_hours || item?.regular_hours || 0),
    regular_hours: Number(item?.regular_hours || item?.total_hours || 0),
    hourly_rate: Number(item?.hourly_rate || 0),
    total_pay: Number(item?.total_pay || 0),
    salary_status: item?.salary_status || 'pending',
    manual_adjust: Number(item?.manual_adjust || 0),
    adjust_remark: item?.adjust_remark || ''
  };
}

export const salariesApi = {
  async getList(params?: {
    company_id?: string;
    employee_name?: string;
    month?: string;
    status?: string;
    settlement_mode?: 'daily' | 'monthly';
    source_type?: string;
    pay_date?: string;
    start_date?: string;
    end_date?: string;
    include_summary?: boolean;
    page?: number;
    pageSize?: number;
  }): Promise<{ list: Salary[]; total: number; page?: number; pageSize?: number; summary?: { total_hours?: number; net_pay?: number } }> {
    console.log('[salariesApi.getList] 调用参数:', JSON.stringify(params));
    const data = await callFunction(salariesFnName, 'list', params);
    console.log('[salariesApi.getList] 返回结果数量:', data?.total || 0);
    return {
      list: data.list || [],
      total: data.total || 0,
      page: data.page,
      pageSize: data.pageSize,
      summary: data.summary
    };
  },

  async calculate(params: { company_id: string; month: string; employee_id?: string; settlement_mode?: 'daily' | 'monthly' }) {
    const [year, month] = params.month.split('-').map(Number);
    const data = await callFunction(salariesFnName, 'calculate', {
      company_id: params.company_id,
      employee_id: params.employee_id,
      settlement_mode: params.settlement_mode || 'monthly',
      year,
      month
    });
    return {
      data: data || null,
      message: '薪资计算完成'
    };
  },

  async approve(id: string) {
    return callFunction(salariesFnName, 'approve', { id });
  },

  async pay(id: string, pay_date?: string) {
    return callFunction(salariesFnName, 'pay', { id, pay_date });
  },

  async export(params: any = {}) {
    return callFunction(salariesFnName, 'export', params);
  },

  // 计算日结薪资预览（返回每条记录的薪资明细）
  async calculateDailyPreview(worktimes: any[]): Promise<any[]> {
    const payload = (worktimes || []).map((item) => normalizeDailyPreviewWorktime(item));
    const data = await callFunction(salariesFnName, 'daily-preview', { worktimes: payload });
    return Array.isArray(data) ? data : [];
  },

  // 批量发薪（日结）
  async batchPayDaily(params: {
    worktimes: any[];
    payDate: string;
  }): Promise<{ successCount: number; failCount: number }> {
    const payload = (params.worktimes || []).map((item) => normalizeDailyPreviewWorktime(item));
    const data = await callFunction(salariesFnName, 'batch-pay-daily', {
      worktimes: payload,
      payDate: params.payDate
    });
    return data || { successCount: 0, failCount: 0 };
  },

  async batchPayDeposit(params: {
    worktimes: any[];
    payDate: string;
  }): Promise<{ successCount: number; failCount: number }> {
    const payload = (params.worktimes || []).map((item) => normalizeDailyPreviewWorktime(item));
    const data = await callFunction(salariesFnName, 'batch-pay-deposit', {
      worktimes: payload,
      payDate: params.payDate
    });
    return data || { successCount: 0, failCount: 0 };
  },

  // 查询报送银行数据（从发薪表关联银行卡信息）
  async getBankTransferData(params?: {
    company_id?: string;
    date?: string; // YYYY-MM-DD
    settlement_mode?: string; // daily / monthly
    include_all?: boolean;
    payment_method?: string; // BANK / WECHAT
    disbursement_status?: string; // PENDING / SUCCESS
    page?: number;
    pageSize?: number;
  }): Promise<{ list: any[]; total: number }> {
    const data = await callFunction(salariesFnName, 'bank-transfer', params);
    return {
      list: data.list || [],
      total: data.total || 0
    };
  },

  // 调试：检查bank-transfer数据
  async debugBankTransfer() {
    return callFunction(salariesFnName, 'debug-bank-transfer');
  },

  // 月结薪资预览（不保存，只查询已计算的记录用于用户确认和手工调整）
  async calculateMonthlyPreview(params: { company_id: string; month: string }): Promise<any[]> {
    const [year, month] = params.month.split('-').map(Number);
    const data = await callFunction(salariesFnName, 'monthly-preview', {
      company_id: params.company_id,
      year,
      month
    });
    return Array.isArray(data) ? data : [];
  },

  // 批量保存月结薪资（用户确认后调用）
  async batchSaveMonthlyPreview(params: {
    company_id: string;
    month: string;
    salaries: any[];
  }): Promise<{ successCount: number; failCount: number }> {
    const [year, month] = params.month.split('-').map(Number);
    const data = await callFunction(salariesFnName, 'batch-save-monthly-preview', {
      company_id: params.company_id,
      year,
      month,
      salaries: params.salaries
    });
    return data || { successCount: 0, failCount: 0 };
  },

  async batchApproveMonthly(params: {
    company_id: string;
    month: string;
    salary_ids: string[];
  }): Promise<{ successCount: number; failCount: number }> {
    const [year, month] = params.month.split('-').map(Number);
    const data = await callFunction(salariesFnName, 'batch-approve-monthly', {
      company_id: params.company_id,
      year,
      month,
      salary_ids: params.salary_ids || []
    });
    return data || { successCount: 0, failCount: 0 };
  },

  // 一键发薪（统一入口，按 employees 发薪方式自动分流）
  async disburse(salaryIds: string[]): Promise<{ successCount: number; failCount: number; wechatCount: number; bankCount: number }> {
    const data = await callFunction(salariesFnName, 'disburse', {
      salary_ids: salaryIds
    });
    return data || { successCount: 0, failCount: 0, wechatCount: 0, bankCount: 0 };
  },

  // 一键发薪 - 微信发薪（入员工钱包）【保留兼容，内部统一转发 handleDisburse】
  async disburseToWallet(salaryIds: string[]): Promise<{ successCount: number; failCount: number }> {
    const data = await callFunction(salariesFnName, 'disburse-to-wallet', {
      salary_ids: salaryIds
    });
    return data || { successCount: 0, failCount: 0 };
  },

  // 一键发薪 - 银行代发（标记已发薪）【保留兼容，内部统一转发 handleDisburse】
  async markDisbursed(salaryIds: string[], payDate?: string): Promise<{ successCount: number; failCount: number }> {
    const data = await callFunction(salariesFnName, 'mark-disbursed', {
      salary_ids: salaryIds,
      pay_date: payDate
    });
    return data || { successCount: 0, failCount: 0 };
  }
};
