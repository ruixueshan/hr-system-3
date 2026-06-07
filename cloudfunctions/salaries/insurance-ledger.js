const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();

const { success, error } = require('./response');
const {
  buildYearMonth,
  roundMoney,
  toDateStr,
  calculateMonthlyInsuranceObligation
} = require('./insurance-v2');

function normalizeYearMonth(value) {
  if (!value) return '';
  if (typeof value === 'string') {
    const match = value.match(/^(\d{4})-(\d{2})$/);
    if (match) return `${match[1]}-${match[2]}`;
  }
  return '';
}

function getNextYearMonth(yearMonth) {
  const normalized = normalizeYearMonth(yearMonth);
  if (!normalized) return '';
  const [year, month] = normalized.split('-').map(Number);
  const baseDate = new Date(year, month - 1, 1);
  baseDate.setMonth(baseDate.getMonth() + 1);
  return buildYearMonth(baseDate.getFullYear(), baseDate.getMonth() + 1);
}

function compareYearMonth(left, right) {
  const a = normalizeYearMonth(left);
  const b = normalizeYearMonth(right);
  if (!a || !b) return 0;
  return a.localeCompare(b);
}

function buildLedgerKey(employeeId, companyId, insuranceMonth) {
  return `${employeeId || ''}__${companyId || ''}__${insuranceMonth || ''}`;
}

function getFirstDueEventMonth(settlementMode, insuranceMonth) {
  return settlementMode === 'daily' ? getNextYearMonth(insuranceMonth) : insuranceMonth;
}

function buildLedgerPayload(params = {}) {
  const {
    employee_id,
    company_id,
    insurance_month,
    settlement_mode = 'monthly',
    join_date,
    leave_date,
    rate_plan_id,
    insurance_daily_deduct = 0,
    insurance_monthly_deduct = 0,
    obligation_amount,
    remark = ''
  } = params;

  const normalizedMonth = normalizeYearMonth(insurance_month);
  if (!employee_id || !company_id || !normalizedMonth) {
    throw new Error('缺少 employee_id/company_id/insurance_month');
  }

  const [year, month] = normalizedMonth.split('-').map(Number);
  const calculatedObligation = obligation_amount !== undefined
    ? Number(obligation_amount)
    : calculateMonthlyInsuranceObligation({
      year,
      month,
      joinDate: join_date,
      leaveDate: leave_date,
      insuranceDailyDeduct: Number(insurance_daily_deduct || 0),
      insuranceMonthlyDeduct: Number(insurance_monthly_deduct || 0)
    });

  const obligationAmount = roundMoney(calculatedObligation);
  const remainingAmount = Math.max(0, obligationAmount);

  return {
    employee_id,
    company_id,
    insurance_month: normalizedMonth,
    ledger_key: buildLedgerKey(employee_id, company_id, normalizedMonth),
    rule_version: 'v2',
    settlement_mode_snapshot: settlement_mode,
    join_date_snapshot: toDateStr(join_date),
    leave_date_snapshot: toDateStr(leave_date),
    rate_plan_id_snapshot: rate_plan_id || '',
    insurance_daily_deduct_snapshot: roundMoney(insurance_daily_deduct),
    insurance_monthly_deduct_snapshot: roundMoney(insurance_monthly_deduct),
    obligation_amount: obligationAmount,
    deducted_amount: 0,
    remaining_amount: remainingAmount,
    status: remainingAmount > 0 ? 'pending' : 'settled',
    first_due_event_month: getFirstDueEventMonth(settlement_mode, normalizedMonth),
    last_deduct_source_type: '',
    last_deduct_source_id: '',
    remark
  };
}

async function findLedger(collectionAccessor, params = {}) {
  const { employee_id, company_id, insurance_month } = params;
  const res = await collectionAccessor.collection('salary_insurance_ledgers')
    .where({
      employee_id,
      company_id,
      insurance_month: normalizeYearMonth(insurance_month)
    })
    .limit(1)
    .get();

  return res.data?.[0] || null;
}

async function ensureInsuranceLedger(params = {}, collectionAccessor = db) {
  const payload = buildLedgerPayload(params);
  const existing = await findLedger(collectionAccessor, payload);
  if (existing) {
    return {
      ledger: existing,
      created: false
    };
  }

  const nowData = {
    ...payload,
    created_at: collectionAccessor.serverDate ? collectionAccessor.serverDate() : db.serverDate(),
    updated_at: collectionAccessor.serverDate ? collectionAccessor.serverDate() : db.serverDate()
  };

  const addRes = await collectionAccessor.collection('salary_insurance_ledgers').add({
    data: nowData
  });

  return {
    ledger: {
      _id: addRes._id || addRes.id,
      ...payload
    },
    created: true
  };
}

async function listInsuranceLedgers(params = {}, collectionAccessor = db) {
  const {
    employee_id,
    company_id,
    due_before_or_equal,
    status_list
  } = params;

  const conditions = {};
  if (employee_id) conditions.employee_id = employee_id;
  if (company_id) conditions.company_id = company_id;

  const res = await collectionAccessor.collection('salary_insurance_ledgers')
    .where(conditions)
    .orderBy('insurance_month', 'asc')
    .get();

  const allowedStatuses = Array.isArray(status_list) && status_list.length
    ? status_list
    : ['pending', 'partial'];

  const dueMonth = normalizeYearMonth(due_before_or_equal);

  return (res.data || []).filter((item) => {
    if (!allowedStatuses.includes(item.status)) return false;
    if (dueMonth && compareYearMonth(item.first_due_event_month, dueMonth) > 0) return false;
    return true;
  });
}

async function getLedgerById(ledgerId, collectionAccessor = db) {
  if (!ledgerId) return null;
  const doc = await collectionAccessor.collection('salary_insurance_ledgers').doc(ledgerId).get();
  return doc.data || null;
}

async function applyInsuranceDeduction(params = {}, collectionAccessor = db) {
  const {
    ledger_id,
    source_type,
    source_id = '',
    deduct_amount,
    pay_date,
    remark = '',
    created_by = ''
  } = params;

  if (!ledger_id || !source_type) {
    throw new Error('缺少 ledger_id/source_type');
  }

  const ledger = await getLedgerById(ledger_id, collectionAccessor);
  if (!ledger) {
    throw new Error('保险台账不存在');
  }

  if (ledger.status === 'cancelled') {
    throw new Error('已取消的台账不能扣减');
  }

  const requestAmount = roundMoney(Number(deduct_amount || 0));
  if (requestAmount <= 0) {
    return {
      ledger,
      deduction: null,
      applied_amount: 0
    };
  }

  const remainingAmount = roundMoney(Number(ledger.remaining_amount || 0));
  const appliedAmount = roundMoney(Math.min(requestAmount, remainingAmount));
  if (appliedAmount <= 0) {
    return {
      ledger,
      deduction: null,
      applied_amount: 0
    };
  }

  const nextDeductedAmount = roundMoney(Number(ledger.deducted_amount || 0) + appliedAmount);
  const nextRemainingAmount = roundMoney(Math.max(0, Number(ledger.obligation_amount || 0) - nextDeductedAmount));
  const nextStatus = nextRemainingAmount <= 0 ? 'settled' : 'partial';

  const deductionPayload = {
    ledger_id,
    employee_id: ledger.employee_id,
    company_id: ledger.company_id,
    insurance_month: ledger.insurance_month,
    source_type,
    source_id,
    deduct_amount: appliedAmount,
    pay_date: pay_date || '',
    remark,
    created_by,
    created_at: collectionAccessor.serverDate ? collectionAccessor.serverDate() : db.serverDate()
  };

  const deductionRes = await collectionAccessor.collection('salary_insurance_deductions').add({
    data: deductionPayload
  });

  await collectionAccessor.collection('salary_insurance_ledgers').doc(ledger_id).update({
    data: {
      deducted_amount: nextDeductedAmount,
      remaining_amount: nextRemainingAmount,
      status: nextStatus,
      last_deduct_source_type: source_type,
      last_deduct_source_id: source_id,
      updated_at: collectionAccessor.serverDate ? collectionAccessor.serverDate() : db.serverDate()
    }
  });

  return {
    ledger: {
      ...ledger,
      deducted_amount: nextDeductedAmount,
      remaining_amount: nextRemainingAmount,
      status: nextStatus,
      last_deduct_source_type: source_type,
      last_deduct_source_id: source_id
    },
    deduction: {
      _id: deductionRes._id || deductionRes.id,
      ...deductionPayload
    },
    applied_amount: appliedAmount
  };
}

async function handleEnsure(data) {
  const result = await ensureInsuranceLedger(data);
  return success(result, result.created ? '保险台账已创建' : '保险台账已存在');
}

async function handleList(data) {
  const list = await listInsuranceLedgers(data);
  return success({
    list,
    total: list.length
  });
}

async function handleApply(data, operator) {
  const result = await applyInsuranceDeduction({
    ...data,
    created_by: data.created_by || operator?.uid || ''
  });
  return success(result, result.applied_amount > 0 ? '保险扣减已登记' : '无需扣减');
}

async function handleGet(data) {
  if (data?.ledger_id) {
    const ledger = await getLedgerById(data.ledger_id);
    return ledger ? success(ledger) : error(404, '保险台账不存在');
  }

  const ledger = await findLedger(db, data);
  return ledger ? success(ledger) : error(404, '保险台账不存在');
}

exports.handleInsuranceLedger = async (data = {}, operator = {}) => {
  const action = data.action || 'list';

  switch (action) {
    case 'ensure':
      return handleEnsure(data, operator);
    case 'list':
      return handleList(data, operator);
    case 'get':
      return handleGet(data, operator);
    case 'apply':
      return handleApply(data, operator);
    default:
      return error(400, '未知保险台账操作');
  }
};

module.exports = {
  normalizeYearMonth,
  getNextYearMonth,
  compareYearMonth,
  buildLedgerKey,
  getFirstDueEventMonth,
  buildLedgerPayload,
  ensureInsuranceLedger,
  listInsuranceLedgers,
  getLedgerById,
  applyInsuranceDeduction,
  handleInsuranceLedger: exports.handleInsuranceLedger
};