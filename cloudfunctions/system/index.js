/**
 * 系统配置模块
 * 获取和设置系统配置（通知模板、归档配置等）
 */
const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

function success(data = null, message = 'success') {
  return { code: 0, message, data };
}

function error(code = 1, message = 'error', data = null) {
  return { code, message, data };
}
const db = cloud.database();

exports.main = async (event, context) => {
  const { action, token } = event;

  try {
    switch (action) {
      case 'get-config':
        return getConfig(event);
      case 'set-config':
        return setConfig(event);
      case 'get-dashboard-stats':
        return getDashboardStats(event);
      case 'getBanners':
        return getBanners(event);
      default:
        return error(400, '不支持的操作');
    }
  } catch (err) {
    console.error('系统配置模块错误:', err);
    return error(500, err.message);
  }
};

/**
 * 获取系统配置
 */
async function getConfig(data) {
  const { category, key } = data;

  const query = db.collection('system_config').where({ status: 'active' });
  if (category) query.where({ category });
  if (key) query.where({ key });

  const res = await query.get();

  // 转换为 key-value 对象
  const config = {};
  res.data.forEach(item => {
    config[item.key] = item.value;
  });

  return success(config);
}

/**
 * 设置系统配置
 */
async function setConfig(data) {
  const { key, value, category, description } = data;

  // 检查是否已存在
  const existing = await db.collection('system_config')
    .where({ key })
    .get();

  if (existing.data.length > 0) {
    // 更新
    await db.collection('system_config').doc(existing.data[0]._id).update({
      data: {
        value,
        description: description || existing.data[0].description,
        updated_at: db.serverDate()
      }
    });
  } else {
    // 创建
    await db.collection('system_config').add({
      data: {
        key,
        category: category || 'general',
        value,
        description: description || '',
        status: 'active',
        created_at: db.serverDate(),
        updated_at: db.serverDate()
      }
    });
  }

  return success(null, '配置已保存');
}

/**
 * 获取管理看板统计数据
 */
async function getDashboardStats(data) {
  const { company_id } = data;

  // 1. 候选人总数（所有报名）
  const totalApplications = await db.collection('applications').count();

  // 2. 在职员工
  const onJobEmployees = await db.collection('employees')
    .where({ status: { $in: ['probation', 'regular'] } })
    .count();

  // 3. 今日报名
  const today = new Date().toISOString().split('T')[0];
  const todayApplications = await db.collection('applications')
    .where({
      create_time: db.command.gte(`${today}T00:00:00`).lt(`${today}T23:59:59`)
    })
    .count();

  // 4. 在招岗位数
  const activeJobs = await db.collection('jobs')
    .where({ is_recruiting: true, status: 'active' })
    .count();

  // 5. 本月营收（粗略：已发放薪资总和）
  const currentYear = new Date().getFullYear();
  const currentMonth = new Date().getMonth() + 1;
  const totalSalary = await db.collection('salaries')
    .where({ year: currentYear, month: currentMonth, status: 'paid' })
    .aggregate()
    .group({
      _id: null,
      total: db.command.sum('$net_pay')
    })
    .end();

  return success({
    total_applications: totalApplications.total,
    on_job_employees: onJobEmployees.total,
    today_applications: todayApplications.total,
    active_jobs: activeJobs.total,
    monthly_revenue: totalSalary.list[0]?.total || 0
  });
}

/**
 * 获取轮播图配置
 * 位置：home（首页）
 */
async function getBanners(data) {
  const { position = 'home' } = data;

  // 查询有效轮播图（按排序字段升序）
  const res = await db.collection('banners')
    .where({
      position,
      status: 'active'
    })
    .orderBy('sort_order', 'asc')
    .orderBy('created_at', 'desc')
    .get();

  return success({
    banners: res.data.map(item => ({
      id: item._id,
      image: item.image,
      title: item.title || '',
      link: item.link || '',
      sort_order: item.sort_order
    }))
  });
}
