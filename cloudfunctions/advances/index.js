/**
 * 预支管理（最小可用，与 salary_advances 集合保持一致）
 */
const cloud = require('wx-server-sdk');
const { success, error } = require('./common/response');
const { verifyToken } = require('./common/auth');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();

async function getOptionalUser(token) {
  const auth = await verifyToken(token, false);
  return auth.valid ? auth.userInfo : null;
}

exports.main = async (event, context) => {
  const { action } = event;
  try {
    switch (action) {
      case 'apply':
        return await applyAdvance(event);
      case 'list':
        return await listAdvances(event);
      case 'approve':
        return await approveAdvance(event, true);
      case 'reject':
        return await approveAdvance(event, false);
      case 'deduct':
        return await deductFromSalary(event);
      case 'my-applications':
        return await myApplications(event);
      default:
        return error(400, '未知操作');
    }
  } catch (err) {
    console.error('[advances] error:', err);
    return error(500, err.message || '服务器错误');
  }
};

// 申请
async function applyAdvance(data) {
  const { employee_id, company_id, apply_amount, apply_reason, token } = data;
  const user = await getOptionalUser(token);
  const empId = employee_id || user?._id;
  if (!empId || !company_id || !apply_amount) return error(400, '参数不完整');

  const res = await db.collection('salary_advances').add({
    data: {
      employee_id: empId,
      company_id,
      apply_amount,
      apply_reason: apply_reason || '',
      status: 'pending',
      created_at: db.serverDate(),
      updated_at: db.serverDate()
    }
  });
  return success({ id: res.id }, '申请提交成功');
}

// 列表
async function listAdvances({ company_id, employee_id, status, page = 1, pageSize = 50 } = {}) {
  let query = db.collection('salary_advances');
  if (company_id) query = query.where({ company_id });
  if (employee_id) query = query.where({ employee_id });
  if (status) query = query.where({ status });

  const skip = (page - 1) * pageSize;
  const [countRes, listRes] = await Promise.all([
    query.count(),
    query.orderBy('created_at', 'desc').skip(skip).limit(pageSize).get()
  ]);

  return success({ list: listRes.data || [], total: countRes.total || 0, page, pageSize });
}

// 审批/驳回
async function approveAdvance(data, approved = true) {
  const { id, remark } = data;
  if (!id) return error(400, '缺少 id');
  await db.collection('salary_advances').doc(id).update({
    data: {
      status: approved ? 'approved' : 'rejected',
      approve_remark: remark || '',
      approve_time: db.serverDate(),
      updated_at: db.serverDate()
    }
  });
  return success(null, approved ? '已审核通过' : '已驳回');
}

// 发薪扣款（标记）
async function deductFromSalary({ id, deduct_month }) {
  if (!id) return error(400, '缺少 id');
  await db.collection('salary_advances').doc(id).update({
    data: {
      status: 'issued',
      deduct_month: deduct_month || '',
      updated_at: db.serverDate()
    }
  });
  return success(null, '已标记为待扣款');
}

// 我的申请
async function myApplications({ token, employee_id }) {
  const user = await getOptionalUser(token);
  const empId = employee_id || user?._id;
  if (!empId) return error(401, '未登录');

  const res = await db.collection('salary_advances')
    .where({ employee_id: empId })
    .orderBy('created_at', 'desc')
    .limit(50)
    .get();

  return success(res.data || []);
}
