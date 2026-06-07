/**
 * 黑名单管理（最小可用）
 * 规则可自定义，这里仅提供手动新增/移除/查询/列表
 */
const cloud = require('wx-server-sdk');
const { success, error } = require('./common/response');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();

exports.main = async (event, context) => {
  const { action } = event;
  try {
    switch (action) {
      case 'add':
        return await add(event);
      case 'remove':
        return await remove(event);
      case 'list':
        return await list(event);
      case 'check':
        return await check(event);
      default:
        return error(400, '未知操作');
    }
  } catch (err) {
    console.error('[blacklist] error:', err);
    return error(500, err.message || '服务器错误');
  }
};

async function add(data) {
  const { user_id, reason, expire_time } = data;
  if (!user_id) return error(400, '缺少 user_id');
  await db.collection('blacklist').add({
    data: {
      user_id,
      reason: reason || '违规',
      expire_time: expire_time || null,
      created_at: db.serverDate(),
      status: 'active'
    }
  });
  return success(null, '已加入黑名单');
}

async function remove({ id, user_id }) {
  if (!id && !user_id) return error(400, '缺少标识');
  const query = id ? db.collection('blacklist').doc(id) : db.collection('blacklist').where({ user_id, status: 'active' });
  await query.update({
    data: {
      status: 'removed',
      updated_at: db.serverDate()
    }
  });
  return success(null, '已移除');
}

async function list({ page = 1, pageSize = 50, status = 'active' } = {}) {
  const query = db.collection('blacklist').where(status ? { status } : {});
  const skip = (page - 1) * pageSize;
  const [countRes, listRes] = await Promise.all([
    query.count(),
    query.orderBy('created_at', 'desc').skip(skip).limit(pageSize).get()
  ]);
  return success({
    list: listRes.data || [],
    total: countRes.total || 0,
    page,
    pageSize
  });
}

async function check({ user_id }) {
  if (!user_id) return error(400, '缺少 user_id');
  const res = await db.collection('blacklist')
    .where({ user_id, status: 'active' })
    .limit(1)
    .get();
  const hit = res.data && res.data.length > 0;
  return success({ is_blacklisted: hit, record: hit ? res.data[0] : null });
}
