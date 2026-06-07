/**
 * 工资预支模块
 * 员工申请预支工资 → 管理员审核
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
      case 'apply':
        return applyAdvance(event);
      case 'list':
        return listAdvances(event);
      case 'approve':
        return approveAdvance(event);
      case 'reject':
        return rejectAdvance(event);
      case 'issue':
        return issueAdvance(event);
      default:
        return error(400, '不支持的操作');
    }
  } catch (err) {
    console.error('预支模块错误:', err);
    return error(500, err.message);
  }
};

/**
 * 员工申请预支
 */
async function applyAdvance(data) {
  const { employee_id, company_id, apply_amount, apply_reason } = data;

  // 1. 检查上月实发工资（计算上限）
  const lastMonth = new Date();
  lastMonth.setMonth(lastMonth.getMonth() - 1);
  const year = lastMonth.getFullYear();
  const month = lastMonth.getMonth() + 1;

  const salaryDoc = await db.collection('salaries')
    .where({ employee_id, company_id, year, month, status: 'paid' })
    .get();

  if (!salaryDoc.data || salaryDoc.data.length === 0) {
    return error(400, '上月工资尚未发放，无法申请预支');
  }

  const lastMonthSalary = salaryDoc.data[0];
  const lastMonthNet = lastMonthSalary.net_pay;
  const maxAmount = lastMonthNet * 0.5;

  if (apply_amount > maxAmount) {
    return error(400, `申请金额超过上限（最高 ¥${maxAmount.toFixed(2)}）`);
  }

  // 2. 检查是否有已发放未扣除的预支
  const existing = await db.collection('salary_advances')
    .where({ employee_id, status: 'issued' })
    .get();

  if (existing.data.length > 0) {
    return error(400, '有待扣除的预支未处理');
  }

  // 3. 创建申请
  const result = await db.collection('salary_advances').add({
    data: {
      employee_id,
      company_id,
      apply_amount,
      apply_reason,
      max_amount: maxAmount,
      last_month_net: lastMonthNet,
      status: 'pending',
      created_at: db.serverDate(),
      updated_at: db.serverDate()
    }
  });

  return success({ id: result.id }, '预支申请已提交');
}

/**
 * 预支列表（员工查看自己的，管理员查全部）
 */
async function listAdvances(data) {
  const { employee_id, company_id, status } = data;
  const query = db.collection('salary_advances').where({});

  if (employee_id) query.where({ employee_id });
  if (company_id) query.where({ company_id });
  if (status) query.where({ status });

  const res = await query.orderBy('created_at', 'desc').limit(50).get();
  return success(res.data);
}

/**
 * 审核通过
 */
async function approveAdvance(data) {
  const { advance_id, approver_id, approve_remark } = data;

  await db.collection('salary_advances').doc(advance_id).update({
    data: {
      status: 'approved',
      approve_by: approver_id,
      approve_time: db.serverDate(),
      approve_remark,
      updated_at: db.serverDate()
    }
  });

  return success(null, '预支已批准');
}

/**
 * 审核驳回
 */
async function rejectAdvance(data) {
  const { advance_id, approver_id, remark } = data;

  await db.collection('salary_advances').doc(advance_id).update({
    data: {
      status: 'rejected',
      approve_by: approver_id,
      approve_time: db.serverDate(),
      approve_remark: remark,
      updated_at: db.serverDate()
    }
  });

  return success(null, '预支已驳回');
}

/**
 * 发放（打款）
 */
async function issueAdvance(data) {
  const { advance_id } = data;

  await db.collection('salary_advances').doc(advance_id).update({
    data: {
      status: 'issued',
      issue_time: db.serverDate(),
      updated_at: db.serverDate()
    }
  });

  return success(null, '预支已发放');
}
