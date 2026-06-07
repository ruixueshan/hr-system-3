/**
 * salaries/list.js — 薪资记录查询
 *
 * 包含：
 * - list: 分页列表（支持多条件筛选）
 * - export: 导出（返回全量数据）
 * - myList: 员工本人薪资查询
 * - bankTransfer: 银行报送数据查询
 */
const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();
const _ = db.command;
const { success, error } = require('../response');

/**
 * 构建筛选条件
 */
function buildFilter(params) {
  const { company_id, employee_name, status, settlement_mode, year, month, year_month, pay_date, employee_id } = params;
  const filter = {};

  if (company_id) filter.company_id = company_id;
  if (employee_id) filter.employee_id = employee_id;
  if (status) filter.status = status;
  if (settlement_mode) filter.settlement_mode = settlement_mode;
  if (year) filter.year = Number(year);
  if (month) filter.month = Number(month);
  if (year_month) filter.year_month = year_month;
  if (pay_date) filter.pay_date = pay_date;
  if (employee_name) filter.employee_name = { $regex: `.*${employee_name}.*`, $options: 'i' };

  return filter;
}

/**
 * 分页查询薪资列表
 * @param {object} params
 */
async function list(params) {
  const {
    company_id, employee_name, status, settlement_mode,
    year, month, year_month, pay_date,
    page = 1, pageSize = 20
  } = params;

  if (!company_id) return error(400, '缺少企业ID company_id');

  const filter = buildFilter(params);
  const skip = (Math.max(1, Number(page)) - 1) * Number(pageSize);
  const limit = Math.min(Math.max(1, Number(pageSize)), 200);

  try {
    const countRes = await db.collection('salaries').where(filter).count();
    const total = countRes.total || 0;

    const query = db.collection('salaries')
      .where(filter)
      .orderBy('year', 'desc')
      .orderBy('month', 'desc')
      .orderBy('employee_no', 'asc')
      .skip(skip)
      .limit(limit);

    const res = await query.get();
    const list = (res.data || []).map(item => ({
      _id: item._id,
      employee_id: item.employee_id,
      employee_no: item.employee_no || '',
      employee_name: item.employee_name || '',
      company_id: item.company_id,
      company_name: item.company_name || '',
      job_id: item.job_id || '',
      job_name: item.job_name || '',
      year: item.year,
      month: item.month,
      year_month: item.year_month || '',
      settlement_mode: item.settlement_mode || '',
      status: item.status || 'pending',
      base_pay: Number(item.base_pay || 0),
      night_allowance: Number(item.night_allowance || 0),
      gross_pay: Number(item.gross_pay || 0),
      social_insurance: Number(item.social_insurance || 0),
      provident_fund: Number(item.provident_fund || 0),
      insurance_deduct: Number(item.insurance_deduct || 0),
      tax: Number(item.tax || 0),
      deductions: Number(item.deductions || 0),
      net_pay: Number(item.net_pay || 0),
      total_amount: Number(item.total_amount || 0),
      manual_adjust: Number(item.manual_adjust || 0),
      adjust_remark: item.adjust_remark || '',
      pay_date: item.pay_date || '',
      pay_method: item.pay_method || '',
      approved_by: item.approved_by || '',
      approved_at: item.approved_at || null,
      paid_by: item.paid_by || '',
      paid_at: item.paid_at || null,
      created_at: item.created_at || null,
      updated_at: item.updated_at || null
    }));

    return success({
      list,
      total,
      page: Math.max(1, Number(page)),
      pageSize: limit,
      pagination: {
        page: Math.max(1, Number(page)),
        pageSize: limit,
        total,
        totalPages: Math.ceil(total / limit)
      }
    }, `查询到 ${list.length} 条薪资记录`);
  } catch (err) {
    console.error('[salaries/list] 查询失败:', err.message);
    return error(500, `查询失败: ${err.message}`);
  }
}

/**
 * 导出薪资数据（全量，无分页限制）
 * @param {object} params
 */
async function exportData(params) {
  const { company_id } = params;
  if (!company_id) return error(400, '缺少企业ID company_id');

  const filter = buildFilter(params);
  const MAX_EXPORT = 10000;

  try {
    const query = db.collection('salaries')
      .where(filter)
      .orderBy('year', 'desc')
      .orderBy('month', 'desc')
      .orderBy('employee_no', 'asc');

    const res = await query.limit(MAX_EXPORT).get();
    const list = (res.data || []).map(item => ({
      _id: item._id,
      employee_id: item.employee_id,
      employee_no: item.employee_no || '',
      employee_name: item.employee_name || '',
      company_name: item.company_name || '',
      job_name: item.job_name || '',
      year: item.year,
      month: item.month,
      year_month: item.year_month || '',
      settlement_mode: item.settlement_mode || '',
      status: item.status || 'pending',
      base_pay: Number(item.base_pay || 0),
      night_allowance: Number(item.night_allowance || 0),
      gross_pay: Number(item.gross_pay || 0),
      social_insurance: Number(item.social_insurance || 0),
      provident_fund: Number(item.provident_fund || 0),
      insurance_deduct: Number(item.insurance_deduct || 0),
      tax: Number(item.tax || 0),
      deductions: Number(item.deductions || 0),
      net_pay: Number(item.net_pay || 0),
      total_amount: Number(item.total_amount || 0),
      manual_adjust: Number(item.manual_adjust || 0),
      adjust_remark: item.adjust_remark || '',
      pay_date: item.pay_date || '',
      pay_method: item.pay_method || '',
      created_at: item.created_at || null,
      updated_at: item.updated_at || null
    }));

    return success({
      list,
      total: list.length,
      exported_at: new Date().toISOString()
    }, `导出 ${list.length} 条薪资记录`);
  } catch (err) {
    console.error('[salaries/list] 导出失败:', err.message);
    return error(500, `导出失败: ${err.message}`);
  }
}

/**
 * 员工本人薪资列表
 * @param {object} params - { employee_id, page, pageSize }
 */
async function myList(params) {
  const { employee_id, page = 1, pageSize = 20 } = params;
  if (!employee_id) return error(400, '缺少员工ID employee_id');

  const skip = (Math.max(1, Number(page)) - 1) * Number(pageSize);
  const limit = Math.min(Math.max(1, Number(pageSize)), 200);

  try {
    const countRes = await db.collection('salaries')
      .where({ employee_id })
      .count();
    const total = countRes.total || 0;

    const res = await db.collection('salaries')
      .where({ employee_id })
      .orderBy('year', 'desc')
      .orderBy('month', 'desc')
      .skip(skip)
      .limit(limit)
      .get();

    const list = (res.data || []).map(item => ({
      _id: item._id,
      employee_name: item.employee_name || '',
      company_name: item.company_name || '',
      job_name: item.job_name || '',
      year: item.year,
      month: item.month,
      year_month: item.year_month || '',
      settlement_mode: item.settlement_mode || '',
      status: item.status || 'pending',
      base_pay: Number(item.base_pay || 0),
      gross_pay: Number(item.gross_pay || 0),
      net_pay: Number(item.net_pay || 0),
      total_amount: Number(item.total_amount || 0),
      pay_date: item.pay_date || '',
      created_at: item.created_at || null
    }));

    return success({
      list,
      pagination: {
        page: Math.max(1, Number(page)),
        pageSize: limit,
        total,
        totalPages: Math.ceil(total / limit)
      }
    }, `查询到 ${list.length} 条薪资记录`);
  } catch (err) {
    console.error('[salaries/list] 员工薪资查询失败:', err.message);
    return error(500, `查询失败: ${err.message}`);
  }
}

/**
 * 银行报送数据查询
 * 查询已发放薪资记录，关联银行卡/员工信息，供银行转账使用
 * @param {object} params - { company_id, date?, page?, pageSize? }
 */
async function bankTransfer(params) {
  const { company_id, date, page = 1, pageSize = 1000 } = params;

  try {
    const conditions = { status: 'paid' };
    if (date) conditions.pay_date = date;
    if (company_id) conditions.company_id = company_id;

    const skip = (Math.max(1, Number(page)) - 1) * Number(pageSize);
    const [countRes, queryRes] = await Promise.all([
      db.collection('salaries').where(conditions).count(),
      db.collection('salaries').where(conditions).orderBy('_id', 'desc').skip(skip).limit(pageSize).get()
    ]);

    let list = (queryRes.data || []).map(item => ({
      _id: item._id,
      // compatibility: frontend expects `salary_id`
      salary_id: item._id,
      employee_id: item.employee_id,
      employee_no: item.employee_no || '',
      employee_name: item.employee_name || '',
      company_id: item.company_id,
      company_name: item.company_name || '',
      year_month: item.year_month || '',
      settlement_mode: item.settlement_mode || '',
      gross_pay: Number(item.gross_pay || 0),
      net_pay: Number(item.net_pay || 0),
      total_amount: Number(item.total_amount || 0),
      // transaction amount used for bank export: prefer total_amount -> net_pay -> gross_pay
      transaction_amount: Number(item.total_amount || item.net_pay || item.gross_pay || 0),
      pay_date: item.pay_date || '',
      pay_method: item.pay_method || '',
      // whether salary was disbursed to bank/wallet - frontend expects SUCCESS/PENDING
      salary_disbursement_status: (item.status === 'paid') ? 'SUCCESS' : (item.salary_disbursement_status || 'PENDING'),
      // payment channel
      salary_payment_method: item.salary_payment_method || '',
      // optional bank fields (may be present on salary record or empty; frontend will fall back to employee data if needed)
      bank_name: item.bank_name || '',
      bank_account: item.bank_account || '',
      account_holder: item.account_holder || item.bank_account_name || '',
      remark: item.remark || '',
      cross_bank_flag: item.cross_bank_flag || '',
      personal_flag: item.personal_flag || ''
    }));

    // enrich with employee and employee_company info
    try {
      const employeeIds = Array.from(new Set(list.map(i => i.employee_id).filter(Boolean)));
      const empMap = {};
      const empCompMap = {};

      if (employeeIds.length) {
        // fetch employees
        const empRes = await db.collection('employees').where({ _id: _.in(employeeIds) }).get();
        (empRes.data || []).forEach(e => { empMap[e._id] = e; });

        // fetch employee_companies for this company (if provided)
        const compQuery = { employee_id: _.in(employeeIds) };
        if (company_id) compQuery.company_id = company_id;
        const empCompRes = await db.collection('employee_companies').where(compQuery).get();
        (empCompRes.data || []).forEach(ec => { empCompMap[ec.employee_id] = ec; });
      }

      list = list.map(item => {
        const emp = empMap[item.employee_id] || {};
        const ec = empCompMap[item.employee_id] || {};

        // fill missing bank/account/holder from employee master or employee_company
        const bank_name = item.bank_name || emp.bank_name || ec.bank_name || '';
        const bank_account = item.bank_account || emp.bank_account || ec.bank_account || '';
        const account_holder = item.account_holder || emp.bank_account_name || emp.name || ec.bank_account_name || '';

        // determine payment method: salary record > employee master > default BANK
        const salary_payment_method = item.salary_payment_method || emp.salary_payment_method || 'BANK';

        // company name fallback
        const company_name = item.company_name || ec.company_name || '';

        return Object.assign({}, item, {
          bank_name,
          bank_account,
          account_holder,
          salary_payment_method,
          company_name
        });
      });
    } catch (err) {
      console.warn('[salaries/list] enrich employee info failed:', err && err.message);
    }

    return success({
      list, total: countRes.total || 0,
      page: Math.max(1, Number(page)),
      pageSize: Number(pageSize)
    }, `查询到 ${list.length} 条银行报送记录`);
  } catch (err) {
    console.error('[salaries/list] 银行报送查询失败:', err.message);
    return error(500, `银行报送查询失败: ${err.message}`);
  }
}

module.exports = { list, export: exportData, myList, bankTransfer };
