/**
 * 计算利润（按企业+月份）
 * 公式：利润 = (厂家工价 - 员工工价) × 工时 - HR提成
 */
const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();
const { success, error } = require('./response');

exports.calculateProfit = async (params, operator) => {
  const { company_id, year, month } = params;

  try {
    // 1. 获取该月所有在该企业工作的员工工时记录
    const startDate = `${year}-${String(month).padStart(2, '0')}-01`;
    const endDate = `${year}-${String(month).padStart(2, '0')}-${daysInMonth(year, month)}`;

    // 查询已审核的工时记录，按员工分组统计
    const worktimeDocs = await db.collection('worktime_records')
      .where({
        company_id,
        work_date: db.command.gte(startDate).lte(endDate),
        status: 'approved'
      })
      .get();

    if (!worktimeDocs.data || worktimeDocs.data.length === 0) {
      return success(null, '该月无有效工时记录');
    }

    // 2. 统计每个员工的工时总和
    const employeeHours = {};
    worktimeDocs.data.forEach(record => {
      const eid = record.employee_id;
      if (!employeeHours[eid]) {
        employeeHours[eid] = 0;
      }
      employeeHours[eid] += record.total_hours || 0;
    });

    // 3. 批量获取员工信息和员工-企业关联
    const employeeIds = Object.keys(employeeHours);
    const employeeDocs = await db.collection('employees')
      .where({ _id: db.command.in(employeeIds) })
      .get();

    const employeeMap = {};
    employeeDocs.data.forEach(emp => {
      employeeMap[emp._id] = emp;
    });

    const ecDocs = await db.collection('employee_companies')
      .where({
        employee_id: db.command.in(employeeIds),
        company_id,
        status: 'active'
      })
      .get();

    const ecMap = {};
    ecDocs.data.forEach(ec => {
      ecMap[ec.employee_id] = ec;
    });

    // 4. 获取该企业的岗位列表（用于查厂家工价）
    const jobDocs = await db.collection('jobs')
      .where({ company_id })
      .get();

    // 假设所有岗位厂家工价相同（取第一个岗位的，或者按岗位细分）
    const defaultPurchaseRate = jobDocs.data[0] ? jobDocs.data[0].purchase_hourly_rate : 0;

    // 5. 计算毛利（厂家工价 - 员工工价）× 工时
    let grossProfit = 0;
    const profitDetails = [];

    for (const eid of employeeIds) {
      const hours = employeeHours[eid];
      const employee = employeeMap[eid];
      const ec = ecMap[eid];

      if (!employee || !ec) continue;

      // 员工工价：优先 employee_companies.hourly_rate，其次岗位默认
      const employeeRate = ec.hourly_rate || (employee.job_id ? jobDocs.data.find(j => j._id === employee.job_id)?.hourly_rate || 0 : 0);
      const purchaseRate = defaultPurchaseRate;

      const gross = (purchaseRate - employeeRate) * hours;
      grossProfit += gross;

      profitDetails.push({
        employee_id: eid,
        employee_name: employee.name,
        employee_rate: employeeRate,
        purchase_rate: purchaseRate,
        hours: Math.round(hours * 100) / 100,
        gross: Math.round(gross * 100) / 100
      });
    }

    // 6. 查询该企业当月已确认的HR提成总额
    // HR提成：属于该企业的员工产生的提成，归属HR的提成
    // 简化：统计所有提成记录中，被推荐人属于该企业的提成
    const bonusQuery = db.collection('recruitment_bonuses')
      .where({
        company_id,
        year,
        month,
        status: 'approved'
      });

    const bonusDocs = await bonusQuery.get();
    const totalBonus = bonusDocs.data.reduce((sum, b) => sum + (b.bonus_amount || 0), 0);

    // 7. 净利润
    const netProfit = grossProfit - totalBonus;

    // 8. 保存利润记录（可选，可单独建表 profit_records）
    // 这里暂不建表，直接返回

    return {
      ...success(null, '利润计算完成'),
      data: {
        company_id,
        year,
        month,
        total_employees: Object.keys(employeeHours).length,
        total_hours: Object.values(employeeHours).reduce((a, b) => a + b, 0),
        gross_profit: Math.round(grossProfit * 100) / 100,
        hr_bonus: Math.round(totalBonus * 100) / 100,
        net_profit: Math.round(netProfit * 100) / 100,
        details: profitDetails
      }
    };

  } catch (err) {
    console.error('计算利润失败:', err);
    throw err;
  }
};

function daysInMonth(year, month) {
  return new Date(year, month, 0).getDate();
}
