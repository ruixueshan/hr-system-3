/**
 * 统计分析模块
 * 提供仪表盘、招聘、员工、薪资、财务、趋势、导出
 */
const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();
const _ = db.command;

function normalizeText(value) {
  return String(value || '').trim();
}

function toDateStr(value) {
  if (!value) return '';
  if (typeof value === 'string') {
    const match = value.match(/^(\d{4}-\d{2}-\d{2})/);
    if (match) return match[1];
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function isActiveEmployeeRelation(item, today = toDateStr(new Date())) {
  const status = normalizeText(item?.status).toLowerCase();
  if (!item?.employee_id) return false;
  if (['left', 'resigned', 'inactive', 'disabled', 'archived'].includes(status)) return false;
  const joinDate = toDateStr(item?.join_date);
  const leaveDate = toDateStr(item?.leave_date);
  if (joinDate && joinDate > today) return false;
  if (leaveDate && leaveDate < today) return false;
  return true;
}

// 北京时间当天起始/结束
function getBeijingTodayRange() {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth();
  const day = now.getDate();
  // 当天 00:00:00 CST (UTC+8)
  const todayStart = new Date(Date.UTC(year, month, day, 0, 0, 0) - 8 * 60 * 60 * 1000);
  const tomorrowStart = new Date(Date.UTC(year, month, day + 1, 0, 0, 0) - 8 * 60 * 60 * 1000);
  return { todayStart, tomorrowStart };
}

function success(data = null, message = 'success') {
  return { code: 0, message, data };
}
function error(code = 1, message = 'error', data = null) {
  return { code, message, data };
}

exports.main = async (event, context) => {
  const { action } = event;
  try {
    switch (action) {
      case 'dashboard':
        return await getDashboardStats();
      case 'dashboard-overview':
        return await getDashboardOverview(event);
      case 'recruitment':
        return await getRecruitmentStats(event);
      case 'employee':
        return await getEmployeeStats(event);
      case 'salary':
        return await getSalaryStats(event);
      case 'finance':
        return await getFinanceStats(event);
      case 'trend':
        return await getTrend(event);
      case 'export':
        return await exportReport(event);
      default:
        return error(400, '未知操作');
    }
  } catch (err) {
    console.error('[stats] error:', err);
    return error(500, err.message || '服务器错误');
  }
};

// 仪表盘核心指标
async function getDashboardStats() {
  const [companies, employees, jobs, applications] = await Promise.all([
    db.collection('companies').count(),
    db.collection('employees').count(),
    db.collection('jobs').where({ is_deleted: false }).count(),
    db.collection('applications').count()
  ]);

  // 本月工资总额（已发放）
  let monthlyPayroll = 0;
  try {
    const now = new Date();
    const payrollRes = await db.collection('salaries')
      .where({ year: now.getFullYear(), month: now.getMonth() + 1, status: 'paid' })
      .get();
    monthlyPayroll = (payrollRes.data || []).reduce((sum, s) => sum + (s.net_pay || s.total_amount || 0), 0);
  } catch (err) {
    console.warn('[stats] payroll calc warn:', err.message);
  }

  return success({
    companies: companies.total || 0,
    employees: employees.total || 0,
    activeJobs: jobs.total || 0,
    totalApplications: applications.total || 0,
    monthlyPayroll
  });
}

// ========= 仪表盘概览（专为 Dashboard 首页优化，1 次调用返回全部数据） =========
async function getDashboardOverview(event) {
  // 同时发起 4 个 DB level count/limit 查询
  const [candidatesCount, employeesCount, todayCount, appRes] = await Promise.all([
    // 1. 总候选人：users 表中 user_type 为 candidate 的数量
    db.collection('users').where({ user_type: 'candidate' }).count(),

    // 2. 在职员工：来自 employee_companies 表，状态为 active 的去重计数
    db.collection('employee_companies').where({ status: 'active' }).count(),

    // 3. 今日报名数
    (() => {
      const { todayStart, tomorrowStart } = getBeijingTodayRange();
      return db.collection('applications')
        .where({
          created_at: _.and(_.gte(todayStart), _.lt(tomorrowStart))
        })
        .count();
    })(),

    // 4. 最近 5 条报名记录
    db.collection('applications')
      .orderBy('created_at', 'desc')
      .limit(5)
      .get()
  ]);

  // 处理报名列表：批量关联岗位和用户
  const rawApps = appRes.data || [];
  const jobIds = [...new Set(rawApps.map(a => a.job_id).filter(Boolean))];
  const userIds = [...new Set(rawApps.map(a => a.user_id).filter(Boolean))];

  const [jobsList, usersList] = await Promise.all([
    jobIds.length
      ? db.collection('jobs').where({ _id: _.in(jobIds) }).get().then(r => r.data || []).catch(() => [])
      : Promise.resolve([]),
    userIds.length
      ? db.collection('users').where({ _id: _.in(userIds) }).get().then(r => r.data || []).catch(() => [])
      : Promise.resolve([])
  ]);

  const jobMap = new Map(jobsList.map(j => [j._id, j.job_name || j.position || '']));
  const userMap = new Map(usersList.map(u => [u._id, { name: u.name || u.nickname || '', phone: u.phone || '' }]));

  const recentApplications = rawApps.map(app => ({
    _id: app._id,
    job_id: app.job_id,
    job_name: jobMap.get(app.job_id) || app.job_name || app.job_id || '',
    user_id: app.user_id,
    user_name: userMap.get(app.user_id)?.name || app.user_name || app.name || '',
    phone: userMap.get(app.user_id)?.phone || app.phone || '',
    source: app.source || '',
    apply_time: app.apply_time || app.created_at || '',
    status: app.status || ''
  }));

  return success({
    totalCandidates: candidatesCount.total || 0,
    onJobEmployees: employeesCount.total || 0,
    todayApplications: todayCount.total || 0,
    recentApplications
  });
}

// 招聘漏斗与来源
async function getRecruitmentStats({ company_id, start_date, end_date } = {}) {
  let query = db.collection('applications');
  if (company_id) query = query.where({ company_id });
  if (start_date && end_date) {
    query = query.where({
      created_at: db.command.gte(new Date(start_date)).and(db.command.lte(new Date(end_date)))
    });
  }
  const res = await query.get();
  const data = res.data || [];

  const byStatus = groupCount(data, 'status');
  const bySource = groupCount(data, 'source');

  return success({ total: data.length, byStatus, bySource });
}

// 员工分布
async function getEmployeeStats({ company_id } = {}) {
  let query = db.collection('employee_companies');
  if (company_id) query = query.where({ company_id });
  const res = await query.get();
  const today = toDateStr(new Date());
  const relationMap = new Map();

  (res.data || []).forEach((item) => {
    if (!item?.employee_id) return;
    if (!isActiveEmployeeRelation(item, today)) return;
    const current = relationMap.get(item.employee_id);
    const currentUpdated = new Date(current?.updated_at || current?.created_at || 0).getTime() || 0;
    const nextUpdated = new Date(item.updated_at || item.created_at || 0).getTime() || 0;
    if (!current || nextUpdated >= currentUpdated) {
      relationMap.set(item.employee_id, item);
    }
  });

  const data = Array.from(relationMap.values());

  return success({
    total: data.length,
    byStatus: groupCount(data, 'status'),
    byCompany: groupCount(data, 'company_id')
  });
}

// 薪资统计
async function getSalaryStats({ company_id, year, month } = {}) {
  let query = db.collection('salaries');
  if (company_id) query = query.where({ company_id });
  if (year) query = query.where({ year });
  if (month) query = query.where({ month });

  const res = await query.get();
  const data = res.data || [];
  const totalAmount = data.reduce((sum, s) => sum + (s.net_pay || s.total_amount || 0), 0);

  return success({
    total: data.length,
    totalAmount,
    avgSalary: data.length ? totalAmount / data.length : 0,
    byStatus: groupCount(data, 'status')
  });
}

// 财务汇总（薪资+预支+提成）
async function getFinanceStats({ company_id, year, month } = {}) {
  const filters = (col) => {
    let q = db.collection(col);
    if (company_id) q = q.where({ company_id });
    if (col === 'salaries' && year && month) q = q.where({ year, month });
    return q;
  };

  const getBonusCollection = async () => {
    for (const collectionName of ['recruitment_bonuses', 'bonus']) {
      try {
        let query = db.collection(collectionName);
        if (company_id) query = query.where({ company_id });
        return await query.get();
      } catch (err) {
        console.warn(`[stats] finance bonus collection fallback: ${collectionName}`, err.message);
      }
    }
    return { data: [] };
  };

  const [salariesRes, advancesRes, bonusRes] = await Promise.all([
    filters('salaries').get(),
    filters('salary_advances').get(),
    getBonusCollection()
  ]);

  const salarySum = sumField(salariesRes.data, ['net_pay', 'total_amount']);
  const advanceSum = sumField(advancesRes.data, ['apply_amount', 'amount', 'amount_approved']);
  const bonusSum = sumField(bonusRes.data, ['amount', 'total_bonus']);

  return success({
    salary: salarySum,
    advances: advanceSum,
    bonus: bonusSum,
    cost: salarySum + advanceSum + bonusSum
  });
}

// 趋势分析（默认最近 30 天报名趋势）
async function getTrend({ days = 30, company_id } = {}) {
  const end = new Date();
  const start = new Date();
  start.setDate(end.getDate() - days + 1);

  let query = db.collection('applications').where({
    created_at: db.command.gte(start).and(db.command.lte(end))
  });
  if (company_id) query = query.where({ company_id });

  const res = await query.get();
  const data = res.data || [];
  const grouped = {};
  for (let i = 0; i < days; i++) {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    const key = d.toISOString().slice(0, 10);
    grouped[key] = 0;
  }
  data.forEach((item) => {
    const key = (item.created_at && new Date(item.created_at).toISOString().slice(0, 10)) || '';
    if (grouped[key] !== undefined) grouped[key] += 1;
  });

  return success({ trend: grouped });
}

// 导出：按 type 返回原始数据
async function exportReport({ type = 'applications', company_id } = {}) {
  const map = {
    applications: 'applications',
    employees: 'employees',
    salaries: 'salaries',
    advances: 'salary_advances'
  };
  const col = map[type] || 'applications';
  let query = db.collection(col);
  if (company_id) query = query.where({ company_id });
  const res = await query.limit(5000).get();
  return success(res.data || []);
}

// Helpers
function groupCount(list, field) {
  const map = {};
  (list || []).forEach((item) => {
    const key = item[field] ?? 'unknown';
    map[key] = (map[key] || 0) + 1;
  });
  return map;
}

function sumField(list, fields) {
  return (list || []).reduce((sum, item) => {
    for (const f of fields) {
      if (item[f] !== undefined) {
        return sum + Number(item[f] || 0);
      }
    }
    return sum;
  }, 0);
}
