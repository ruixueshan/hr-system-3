/**
 * 批量计算（按企业+月份）
 * 触发该企业下所有员工的薪资计算，同时计算提成和利润
 */
const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();
const { success, error } = require('./response');

// 引用内部模块
const salaryCalc = require('./calculate-salary');
const bonusCalc = require('./calculate-bonus');
const profitCalc = require('./calculate-profit');

exports.calculateAll = async (params, operator) => {
  const { company_id, year, month, settlement_mode = 'monthly' } = params;

  try {
    let employeeIds = [];
    if (settlement_mode === 'monthly') {
      const yearMonth = `${year}-${String(month).padStart(2, '0')}`;
      const [summaryRes, relationsRes] = await Promise.all([
        db.collection('worktime_monthly_summaries')
          .where({ company_id, year_month: yearMonth, status: 'approved' })
          .get(),
        db.collection('employee_companies')
          .where({ company_id, settlement_mode })
          .get()
      ]);

      employeeIds = [...new Set([
        ...(summaryRes.data || []).map((item) => item.employee_id).filter(Boolean),
        ...(relationsRes.data || []).map((item) => item.employee_id).filter(Boolean)
      ])];
    } else {
      const relationsRes = await db.collection('employee_companies')
        .where({ company_id, settlement_mode })
        .get();
      employeeIds = [...new Set((relationsRes.data || []).map((item) => item.employee_id).filter(Boolean))];
    }

    if (employeeIds.length === 0) {
      return success(null, '该企业暂无匹配结算方式的员工');
    }

    const employees = await db.collection('employees')
      .where({ _id: db.command.in(employeeIds) })
      .get();
    const employeeMap = new Map((employees.data || []).map((item) => [item._id, item]));

    const salaryResults = [];
    const salaryErrors = [];
    const BATCH_SIZE = 5;

    for (let i = 0; i < employeeIds.length; i += BATCH_SIZE) {
      const batch = employeeIds.slice(i, i + BATCH_SIZE);
      const batchResults = await Promise.all(batch.map(async (empId) => {
        try {
          const result = await salaryCalc.calculateSalary({
            employee_id: empId,
            company_id,
            year,
            month,
            settlement_mode
          }, operator);
          return { ok: true, result, employee_id: empId };
        } catch (err) {
          return { ok: false, err, employee_id: empId };
        }
      }));

      for (const item of batchResults) {
        if (item.ok) {
          salaryResults.push(item.result);
          continue;
        }
        const employee = employeeMap.get(item.employee_id) || {};
        salaryErrors.push({
          employee_id: item.employee_id,
          employee_name: employee.name || employee.real_name || '',
          error: item.err?.message || '未知错误',
          code: item.err?.code || 500,
          data: item.err?.data || null
        });
      }
    }

    // 3. 计算提成（外协人员）
    const bonusResult = await bonusCalc.calculateBonusBatch({
      year,
      month
    }, operator);

    // 4. 计算利润
    const profitResult = await profitCalc.calculateProfit({
      company_id,
      year,
      month
    }, operator);

    return {
      ...success(null, '批量计算完成'),
      data: {
        company_id,
        year,
        month,
        settlement_mode,
        salary_count: salaryResults.length,
        salary_success: salaryResults.length,
        salary_failed: salaryErrors.filter((item) => Number(item.code) >= 500).length,
        salary_skipped: salaryErrors.filter((item) => Number(item.code) < 500).length,
        salary_errors: salaryErrors,
        bonus_summary: bonusResult.data,
        profit_summary: profitResult.data
      }
    };

  } catch (err) {
    console.error('批量计算失败:', err);
    throw err;
  }
};
