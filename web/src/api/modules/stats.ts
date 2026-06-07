// 统计分析 API 模块
import { callFunction, getDatabase } from '../cloud';
import { formatDate } from '@/utils/format';

function normalizeExportType(type?: string) {
  const map: Record<string, string> = {
    recruitment: 'applications',
    employee: 'employees',
    employees: 'employees',
    salary: 'salaries',
    salaries: 'salaries',
    finance: 'advances',
    advances: 'advances'
  };
  return map[type || ''] || 'applications';
}

async function fetchAllStatsDocs(query: any, batchSize = 100) {
  const countRes = await query.count();
  const total = countRes.total || 0;
  const list: any[] = [];

  for (let skip = 0; skip < total; skip += batchSize) {
    const result = await query.skip(skip).limit(Math.min(batchSize, total - skip)).get();
    list.push(...(result.data || []));
  }

  return list;
}

export const statsApi = {
  // 仪表盘统计（通用版）
  async dashboard() {
    try {
      const db = await getDatabase();
      // 获取各类统计数据
      const companies = await db.collection('companies').count();
      const employees = await db.collection('employees').count();
      const jobs = await db.collection('jobs').where({ status: 'active' }).count();
      const applications = await db.collection('applications').count();

      // 计算月度营收（从薪资或订单集合）
      let monthlyRevenue = 0;
      try {
        const now = new Date();
        const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
        const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0);
        
        // 如果有 salaries 集合，计算本月已发放薪资总额
        const salaries = await db.collection('salaries')
          .where({
            month: now.getMonth() + 1,
            year: now.getFullYear(),
            status: 'paid'
          });
        const salaryRows = await fetchAllStatsDocs(salaries);
        
        monthlyRevenue = salaryRows.reduce((sum: number, item: any) => {
          return sum + (item.total_amount || 0);
        }, 0);
      } catch (err) {
        console.warn('[statsApi.dashboard] 计算月度营收失败:', err?.message);
      }

      return {
        totalCompanies: companies.total || 0,
        totalEmployees: employees.total || 0,
        activeJobs: jobs.total || 0,
        totalApplications: applications.total || 0,
        monthlyRevenue
      };
    } catch (err: any) {
      console.error('仪表盘统计失败:', err?.message || err);
      // 返回空数据而不是抛出错误，允许页面继续加载
      return {
        totalCompanies: 0,
        totalEmployees: 0,
        activeJobs: 0,
        totalApplications: 0,
        monthlyRevenue: 0
      };
    }
  },

  // 仪表盘概览（专为 Dashboard 首页优化，1 次云函数调用返回全部数据）
  async dashboardOverview() {
    try {
      const result = await callFunction('stats', 'dashboard-overview', {});
      return {
        totalCandidates: result?.totalCandidates ?? 0,
        onJobEmployees: result?.onJobEmployees ?? 0,
        todayApplications: result?.todayApplications ?? 0,
        recentApplications: result?.recentApplications ?? []
      };
    } catch (err: any) {
      console.error('仪表盘概览加载失败:', err?.message || err);
      return {
        totalCandidates: 0,
        onJobEmployees: 0,
        todayApplications: 0,
        recentApplications: []
      };
    }
  },

  // 报名趋势数据（最近7天）
  async applicationTrend(days: number = 7): Promise<{ dates: string[]; counts: number[] }> {
    try {
      const db = await getDatabase();
      const dates: string[] = [];
      const counts: number[] = [];
      const today = new Date();
      
      // 计算日期范围
      const endDate = new Date(today.getFullYear(), today.getMonth(), today.getDate());
      const startDate = new Date(endDate);
      startDate.setDate(startDate.getDate() - days + 1);
      
      // 查询指定日期范围内的所有报名
      const query = db.collection('applications')
        .where({
          created_at: db.command.gte(startDate).and(db.command.lte(endDate))
        })
        .orderBy('created_at', 'asc');
      const rows = await fetchAllStatsDocs(query);
      
      // 按日期分组统计
      const grouped = new Map<string, number>();
      for (let i = 0; i < days; i++) {
        const date = new Date(startDate);
        date.setDate(date.getDate() + i);
        const dateStr = formatDate(date, 'YYYY-MM-DD');
        dates.push(dateStr);
        grouped.set(dateStr, 0);
      }
      
      // 统计每天的报名数
      rows.forEach((app: any) => {
        const appDate = new Date(app.created_at || app.apply_time);
        const dateStr = formatDate(appDate, 'YYYY-MM-DD');
        if (grouped.has(dateStr)) {
          grouped.set(dateStr, (grouped.get(dateStr) || 0) + 1);
        }
      });
      
      // 转换为数组
      for (const date of dates) {
        counts.push(grouped.get(date) || 0);
      }
      
      return { dates, counts };
    } catch (err: any) {
      console.error('报名趋势统计失败:', err);
      // 返回空数据
      const dates: string[] = [];
      const counts: number[] = [];
      const today = new Date();
      for (let i = 6; i >= 0; i--) {
        const date = new Date(today);
        date.setDate(date.getDate() - i);
        dates.push(formatDate(date, 'YYYY-MM-DD'));
        counts.push(0);
      }
      return { dates, counts };
    }
  },

  // 招聘统计
  async recruitment(params: any = {}) {
    try {
      return await callFunction('stats', 'recruitment', params);
    } catch (err: any) {
      console.error('招聘统计失败:', err);
      throw new Error(err.message || '招聘统计失败');
    }
  },

  // 员工统计
  async employees(params: any = {}) {
    try {
      return await callFunction('stats', 'employee', params);
    } catch (err: any) {
      console.error('员工统计失败:', err);
      throw new Error(err.message || '员工统计失败');
    }
  },

  // 薪资统计
  async salaries(params: any = {}) {
    try {
      return await callFunction('stats', 'salary', params);
    } catch (err: any) {
      console.error('薪资统计失败:', err);
      throw new Error(err.message || '薪资统计失败');
    }
  },

  // 财务统计
  async finance(params: any = {}) {
    try {
      return await callFunction('stats', 'finance', params);
    } catch (err: any) {
      console.error('财务统计失败:', err);
      throw new Error(err.message || '财务统计失败');
    }
  },

  // 趋势分析
  async trend(params: any = {}) {
    try {
      const db = await getDatabase();
      const { company_id, start_date, end_date, days = 30 } = params;

      if (!start_date && !end_date) {
        return await callFunction('stats', 'trend', { company_id, days });
      }

      let query = db.collection('applications');
      if (company_id) query = query.where({ company_id });
      if (start_date && end_date) {
        query = query.where({
          created_at: db.command.gte(new Date(start_date)).and(db.command.lte(new Date(end_date)))
        });
      }

      const rows = await fetchAllStatsDocs(query);
      const trendData: any = {};
      rows.forEach((item: any) => {
        const date = item.created_at ? formatDate(item.created_at, 'YYYY-MM-DD') : 'unknown';
        trendData[date] = (trendData[date] || 0) + 1;
      });

      return { trend: trendData };
    } catch (err: any) {
      console.error('趋势分析失败:', err);
      throw new Error(err.message || '趋势分析失败');
    }
  },

  // 导出报表
  async export(params: any = {}) {
    try {
      const { type = 'recruitment', company_id } = params;
      return await callFunction('stats', 'export', {
        type: normalizeExportType(type),
        company_id
      });
    } catch (err: any) {
      console.error('导出报表失败:', err);
      throw new Error(err.message || '导出报表失败');
    }
  },

  // 辅助方法：按字段分组
  _groupBy(data: any[], field: string) {
    const grouped: any = {};
    data.forEach(item => {
      const key = item[field] || 'unknown';
      grouped[key] = (grouped[key] || 0) + 1;
    });
    return grouped;
  }
};
