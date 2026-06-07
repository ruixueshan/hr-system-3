/**
 * salary-engine-v2 统一入口
 * 与 v1 保持相同的 event 接口：{ type, data, userInfo }
 */
const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();

const salaryCalc = require('./calculate-salary');
const bonusCalc = require('./calculate-bonus');
const profitCalc = require('./calculate-profit');
const allCalc = require('./calculate-all');
const exportUtil = require('./export');
const insuranceLedger = require('./insurance-ledger');

async function logAudit(userId, userName, role, action, targetType, targetId, changes, remark) {
  try {
    await db.collection('audit_logs').add({
      data: {
        user_id: userId, user_name: userName, role, action,
        target_type: targetType, target_id: targetId, changes, remark,
        ip: 'N/A', user_agent: 'CloudBase Function v2', created_at: db.serverDate()
      }
    });
  } catch (err) {
    console.error('审计日志记录失败:', err);
  }
}

const ALLOWED_ROLES = {
  salary: ['hr', 'finance', 'gm', 'deputy'],
  bonus: ['hr', 'finance', 'gm', 'deputy'],
  profit: ['hr', 'finance', 'gm', 'deputy'],
  all: ['gm', 'deputy'],
  export: ['finance', 'gm', 'deputy'],
  'insurance-ledger': ['hr', 'finance', 'gm', 'deputy']
};

exports.main = async (event, context) => {
  const { type, data, userInfo } = event;
  const wxContext = cloud.getWXContext();

  const operator = userInfo || { uid: wxContext.OPENID, role: 'admin' };

  if (!ALLOWED_ROLES[type] || !ALLOWED_ROLES[type].includes(operator.role)) {
    await logAudit(operator.uid, operator.name || 'unknown', operator.role, `${type}_denied`, 'none', 'none', {}, '权限不足');
    return { code: 403, message: '权限不足' };
  }

  try {
    let result;

    switch (type) {
      case 'salary':
        result = await salaryCalc.calculateSalary(data, operator);
        break;
      case 'bonus':
        if (data?.action === 'calculateBatch') result = await bonusCalc.calculateBonusBatch(data, operator);
        else if (data?.action === 'getSummary') result = await bonusCalc.getBonusSummary(data, operator);
        else if (data?.action === 'getDetail') result = await bonusCalc.getBonusDetail(data, operator);
        else if (data?.action === 'approveBatch') result = await bonusCalc.approveBonusBatch(data, operator);
        else if (data?.action === 'batchApprove') result = await bonusCalc.batchApproveBonusBatches(data, operator);
        else if (data?.action === 'markBatchPaid') result = await bonusCalc.markBonusBatchPaid(data, operator);
        else result = await bonusCalc.calculateBonus(data, operator);
        break;
      case 'profit':
        result = await profitCalc.calculateProfit(data, operator);
        break;
      case 'all':
        result = await allCalc.calculateAll(data, operator);
        break;
      case 'export':
        result = await exportUtil.exportData(data, operator);
        break;
      case 'insurance-ledger':
        result = await insuranceLedger.handleInsuranceLedger(data, operator);
        break;
      default:
        return { code: 400, message: '不支持的操作类型' };
    }

    const normalizedResult = result && typeof result.code === 'number' && Object.prototype.hasOwnProperty.call(result, 'data')
      ? result.data : result;

    await logAudit(operator.uid, operator.name || 'unknown', operator.role, type, '', '', {}, `${type} 操作成功`);

    return { code: 0, message: 'success', data: normalizedResult };

  } catch (err) {
    console.error('salary-engine-v2 执行失败:', err);
    return { code: 500, message: err.message || '系统错误' };
  }
};
