/**
 * 操作日志模块（最小可用）
 * 字段：action, operator_id, operator_name, resource, details, ip, ua, created_at
 */
const cloud = require('wx-server-sdk');
const { success, error } = require('./common/response');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();

exports.main = async (event, context) => {
  const { action } = event;
  try {
    switch (action) {
      case 'create':
        return await createLog(event);
      case 'list':
        return await listLogs(event);
      case 'detail':
        return await getLogDetail(event);
      case 'export':
        return await exportLogs(event);
      case 'stats':
        return await getLogStats(event);
      default:
        return error(400, '未知操作');
    }
  } catch (err) {
    console.error('[logs] error:', err);
    return error(500, err.message || '服务器错误');
  }
};

// 写日志
async function createLog(data) {
  const { action, operator_id, operator_name, resource, details, ip, user_agent } = data;
  if (!action) return error(400, '缺少 action');
  await db.collection('audit_logs').add({
    data: {
      action,
      operator_id: operator_id || '',
      operator_name: operator_name || '',
      resource: resource || '',
      details: details || null,
      ip: ip || '',
      user_agent: user_agent || '',
      created_at: db.serverDate()
    }
  });
  return success(null, '日志记录成功');
}

// 分页查询
async function listLogs(params = {}) {
  const { action, operator_id, start_date, end_date, page = 1, pageSize = 50 } = params;
  const query = db.collection('audit_logs').where({});
  if (action) query.where({ action });
  if (operator_id) query.where({ operator_id });
  if (start_date && end_date) {
    query.where({
      created_at: db.command.gte(new Date(start_date)).and(db.command.lte(new Date(end_date)))
    });
  }

  const skip = (page - 1) * pageSize;
  const [countRes, listRes] = await Promise.all([
    query.count(),
    query.orderBy('created_at', 'desc').skip(skip).limit(pageSize).get()
  ]);

  return success({ list: listRes.data || [], total: countRes.total || 0, page, pageSize });
}

// 详情
async function getLogDetail({ id }) {
  if (!id) return error(400, '缺少日志ID');
  const res = await db.collection('audit_logs').doc(id).get();
  if (!res.data) return error(404, '未找到日志');
  return success(res.data);
}

// 导出：返回数据，前端生成 CSV
async function exportLogs(params = {}) {
  const list = await listLogs({ ...params, page: 1, pageSize: 5000 });
  return success(list.data.list || [], '导出数据准备完成');
}

// 统计：按 action/operator/date
async function getLogStats(params = {}) {
  const list = await listLogs({ ...params, page: 1, pageSize: 5000 });
  const data = list.data.list || [];
  return success({
    total: data.length,
    by_action: groupCount(data, 'action'),
    by_operator: groupCount(data, 'operator_id'),
    by_date: groupByDate(data, 'created_at')
  });
}

function groupCount(list, field) {
  const map = {};
  (list || []).forEach((item) => {
    const key = item[field] || 'unknown';
    map[key] = (map[key] || 0) + 1;
  });
  return map;
}

function groupByDate(list, field) {
  const map = {};
  (list || []).forEach((item) => {
    if (!item[field]) return;
    const key = new Date(item[field]).toISOString().slice(0, 10);
    map[key] = (map[key] || 0) + 1;
  });
  return map;
}
