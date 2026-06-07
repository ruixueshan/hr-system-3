/**
 * 工时模块增强 API
 * 添加工时汇总统计和审核状态查询功能
 */

import { callFunction, getDatabase } from '../cloud';

export const worktimeEnhancedApi = {
  /**
   * 获取月工时汇总统计（按企业+月份）
   * 返回已审核/待审核/驳回的统计数据
   */
  async getMonthlySummaryStats(params: {
    company_id: string;
    year: number;
    month: number;
  }): Promise<{
    stats: {
      total: number;
      approved: number;
      pending: number;
      rejected: number;
    };
    list: any[];
  }> {
    const db = await getDatabase();
    const yearMonth = `${params.year}-${String(params.month).padStart(2, '0')}`;

    try {
      const res = await db
        .collection('worktime_monthly_summaries')
        .where({
          company_id: params.company_id,
          year_month: yearMonth
        })
        .get();

      const list = res.data || [];
      const stats = {
        total: list.length,
        approved: list.filter((item: any) => item.status === 'approved').length,
        pending: list.filter((item: any) => item.status === 'pending').length,
        rejected: list.filter((item: any) => item.status === 'rejected').length
      };

      return { stats, list };
    } catch (err: any) {
      console.error('[getMonthlySummaryStats] 失败:', err);
      return {
        stats: { total: 0, approved: 0, pending: 0, rejected: 0 },
        list: []
      };
    }
  },

  /**
   * 批量审核工时汇总
   */
  async approveMonthlySummaryBatch(ids: string[]): Promise<{ successCount: number; failCount: number }> {
    const data = await callFunction('worktime', 'batch-approve-monthly', { record_ids: ids || [] });
    const total = Array.isArray(ids) ? ids.length : 0;
    const successCount = Number(data?.updated || data?.successCount || total);
    const failCount = Math.max(0, total - successCount);
    return { successCount, failCount };
  },

  /**
   * 拒绝工时汇总
   */
  async rejectMonthlySummary(id: string, reason: string): Promise<void> {
    await callFunction('worktime', 'batch-reject-monthly', {
      record_ids: [id],
      remark: reason || ''
    });
  }
};
