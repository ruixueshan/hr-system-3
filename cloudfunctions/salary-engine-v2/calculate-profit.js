/**
 * calculate-profit.js (v2)
 * 计算利润（按企业+月份）
 * 使用 common/date-utils 的 daysInMonth
 */
const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();
const { success, error } = require('./response');
const { daysInMonth } = require('./common/date-utils');

exports.calculateProfit = async (params, operator) => {
  const { company_id, year, month } = params;

  try {
    const startDate = `${year}-${String(month).padStart(2, '0')}-01`;
    const endDate = `${year}-${String(month).padStart(2, '0')}-${daysInMonth(year, month)}`;

    const worktimeDocs = await db.collection('worktime_records')
      .where({ company_id, work_date: db.command.gte(startDate).and(db.command.lte(endDate)), status: 'approved' })
      .get();

    if (!worktimeDocs.data || worktimeDocs.data.length === 0) {
      return success(null, '该月无有效工时记录');
    }

    const employeeHours = {};
    worktimeDocs.data.forEach((record) => {
      const eid = record.employee_id;
      if (!employeeHours[eid]) employeeHours[eid] = 0;
      employeeHours[eid] += record.total_hours || 0;
    });

    const employeeIds = Object.keys(employeeHours);

    // 并行查询
    const [employeeDocs, ecDocs, jobDocs] = await Promise.all([
      db.collection('employees').where({ _id: db.command.in(employeeIds) }).get(),
      db.collection('employee_companies').where({ employee_id: db.command.in(employeeIds), company_id, status: 'active' }).get(),
      db.collection('jobs').where({ company_id }).get()
    ]);

    const employeeMap = {};
    employeeDocs.data.forEach((emp) => { employeeMap[emp._id] = emp; });
    const ecMap = {};
    ecDocs.data.forEach((ec) => { ecMap[ec.employee_id] = ec; });

    const defaultPurchaseRate = jobDocs.data[0] ? jobDocs.data[0].purchase_hourly_rate : 0;

    let grossProfit = 0;
    const profitDetails = [];

    for (const eid of employeeIds) {
      const hours = employeeHours[eid];
      const employee = employeeMap[eid];
      const ec = ecMap[eid];
      if (!employee || !ec) continue;

      const employeeRate = ec.hourly_rate || (employee.job_id ? (jobDocs.data.find((j) => j._id === employee.job_id)?.hourly_rate || 0) : 0);
      const purchaseRate = defaultPurchaseRate;
      const gross = (purchaseRate - employeeRate) * hours;
      grossProfit += gross;

      profitDetails.push({
        employee_id: eid, employee_name: employee.name,
        employee_rate: employeeRate, purchase_rate: purchaseRate,
        hours: Math.round(hours * 100) / 100, gross: Math.round(gross * 100) / 100
      });
    }

    // 获取该月提成总额
    const bonusDocs = await db.collection('recruitment_bonuses').where({ year, month }).get();
    const totalBonus = bonusDocs.data.reduce((sum, b) => sum + (b.bonus_amount || 0), 0);

    const netProfit = grossProfit - totalBonus;

    return success({
      company_id, year, month,
      gross_profit: Math.round(grossProfit * 100) / 100,
      total_bonus: Math.round(totalBonus * 100) / 100,
      net_profit: Math.round(netProfit * 100) / 100,
      employee_count: profitDetails.length,
      details: profitDetails
    }, '利润计算完毕');

  } catch (err) {
    console.error('计算利润失败:', err);
    return error(500, `计算失败: ${err.message}`);
  }
};
