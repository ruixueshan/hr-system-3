/**
 * 计算单个员工薪资（按企业+月份）
 * 规则：
 * - 仅套用时薪工价方案
 * - 日结：工时 * 时薪 + 夜班补贴 - 保险
 * - 月结：月工时 * 时薪 + 夜班补贴 - 保险 - 个税
 */
const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();
const { success } = require('./response');
const {
  buildYearMonth,
  toDateStr,
  roundMoney,
  calculateMonthlyInsuranceObligation,
  buildInsuranceShadowSnapshot
} = require('./insurance-v2');
const {
  getSalaryInsuranceV2RuntimeConfig,
  isSalaryInsuranceV2ActiveForCompany,
  isSalaryInsuranceV2ShadowEnabled
} = require('./runtime-config');
const {
  ensureInsuranceLedger,
  getLedgerById,
  applyInsuranceDeduction
} = require('./insurance-ledger');

function daysInMonth(year, month) {
  return new Date(year, month, 0).getDate();
}

function daysBetweenInclusive(start, end) {
  const startDate = new Date(`${start}T00:00:00`);
  const endDate = new Date(`${end}T00:00:00`);
  const diff = endDate.getTime() - startDate.getTime();
  if (diff < 0) return 0;
  return Math.floor(diff / (24 * 60 * 60 * 1000)) + 1;
}

function getServiceDaysInMonth(year, month, joinDate, leaveDate) {
  const yearMonth = buildYearMonth(year, month);
  let start = `${yearMonth}-01`;
  let end = `${yearMonth}-${String(daysInMonth(year, month)).padStart(2, '0')}`;
  const normalizedJoin = toDateStr(joinDate);
  const normalizedLeave = toDateStr(leaveDate);

  if (normalizedJoin && normalizedJoin > start) start = normalizedJoin;
  if (normalizedLeave && normalizedLeave < end) end = normalizedLeave;
  if (start > end) return 0;
  return daysBetweenInclusive(start, end);
}

async function getLatestEmployeeCompany(employee_id, company_id) {
  const res = await db.collection('employee_companies')
    .where({ employee_id, company_id })
    .orderBy('updated_at', 'desc')
    .limit(1)
    .get();
  if (!res.data || !res.data.length) {
    return null;
  }
  return res.data[0];
}

function pickFirstValue(...values) {
  for (const value of values) {
    if (value === undefined || value === null) continue;
    if (typeof value === 'string') {
      if (value.trim()) return value;
      continue;
    }
    return value;
  }
  return '';
}

function throwBusinessError(message, data = {}) {
  const err = new Error(message);
  err.code = 400;
  err.data = data;
  throw err;
}

async function getHourlyRatePlan(employee, employeeCompany, summary) {
  const jobId = pickFirstValue(summary?.job_id, employeeCompany?.job_id, employee.job_id);
  let job = null;
  let planId = pickFirstValue(summary?.rate_plan_id, employeeCompany?.rate_plan_id, employee.rate_plan_id);

  if (jobId) {
    const jobDoc = await db.collection('jobs').doc(jobId).get().catch(() => ({ data: null }));
    job = jobDoc.data || null;
    if (!planId) {
      planId = job?.rate_plan_id || '';
    }
  }

  let plan = null;
  if (planId) {
    const planDoc = await db.collection('rate_plans').doc(planId).get().catch(() => ({ data: null }));
    plan = planDoc.data || null;
  }

  return { plan, job, planId, jobId };
}

function resolveHourlyRate(plan, settlementMode, summary, employeeCompany, job, employee) {
  const suffix = settlementMode === 'monthly' ? '_monthly' : '_daily';
  let hourlyRate = roundMoney(Number(plan?.[`hourly_rate${suffix}`] || 0));

  if (!hourlyRate) {
    const dailyRate = Number(plan?.[`daily_rate${suffix}`] || 0);
    const payHours = Number(plan?.[`pay_hours${suffix}`] || 8);
    if (dailyRate && payHours) {
      hourlyRate = roundMoney(dailyRate / payHours);
    }
  }

  if (!hourlyRate) {
    hourlyRate = roundMoney(Number(
      pickFirstValue(
        summary?.hourly_rate,
        employeeCompany?.hourly_rate,
        job?.hourly_rate,
        employee.hourly_rate,
        0
      ) || 0
    ));
  }

  return hourlyRate;
}

function resolveNightRates(plan, settlementMode, summary, employeeCompany, job, employee) {
  const suffix = settlementMode === 'monthly' ? '_monthly' : '_daily';

  let nightHourlyRate = Number(plan?.[`night_hourly_rate${suffix}`] ?? 0);
  if (!nightHourlyRate) {
    nightHourlyRate = Number(
      pickFirstValue(
        summary?.night_hourly_rate,
        plan?.night_hourly_rate,
        employeeCompany?.night_hourly_rate,
        job?.night_hourly_rate,
        employee?.night_hourly_rate,
        0
      ) || 0
    );
  }

  let nightDailyRate = Number(plan?.[`night_daily_rate${suffix}`] ?? 0);
  if (!nightDailyRate) {
    nightDailyRate = Number(
      pickFirstValue(
        summary?.night_daily_rate,
        plan?.night_daily_rate,
        employeeCompany?.night_daily_rate,
        job?.night_daily_rate,
        employee?.night_daily_rate,
        0
      ) || 0
    );
  }

  return { nightHourlyRate, nightDailyRate };
}

function calculateInsuranceDeduct(plan, summary, year, month, joinDate, leaveDate) {
  return calculateMonthlyInsuranceObligation({
    year,
    month,
    joinDate,
    leaveDate,
    insuranceDailyDeduct: Number(plan?.insurance_daily_deduct ?? summary?.insurance_daily_deduct ?? 0),
    insuranceMonthlyDeduct: Number(plan?.insurance_monthly_deduct ?? summary?.insurance_monthly_deduct ?? 0)
  });
}

function calculateTax(grossPay, insuranceDeduct, threshold = 5000) {
  const taxableIncome = Math.max(0, Number(grossPay || 0) - Number(insuranceDeduct || 0) - Number(threshold || 5000));
  return roundMoney(taxableIncome * 0.1);
}

function buildMonthlySalarySourceId(employee_id, company_id, yearMonth) {
  return `salary_monthly:${employee_id || ''}:${company_id || ''}:${yearMonth || ''}`;
}

function buildDailySalarySourceId(employee_id, company_id, yearMonth) {
  return `salary_daily:${employee_id || ''}:${company_id || ''}:${yearMonth || ''}`;
}

async function prepareMonthlyInsuranceSettlement(params = {}) {
  const {
    transaction,
    employee_id,
    company_id,
    yearMonth,
    joinDate,
    leaveDate,
    ratePlanId,
    insuranceDailyDeduct,
    insuranceMonthlyDeduct,
    createdBy
  } = params;

  const ensureResult = await ensureInsuranceLedger({
    employee_id,
    company_id,
    insurance_month: yearMonth,
    settlement_mode: 'monthly',
    join_date: joinDate,
    leave_date: leaveDate,
    rate_plan_id: ratePlanId,
    insurance_daily_deduct: insuranceDailyDeduct,
    insurance_monthly_deduct: insuranceMonthlyDeduct
  }, transaction);

  const ledger = ensureResult.ledger;
  const sourceId = buildMonthlySalarySourceId(employee_id, company_id, yearMonth);

  const existingDeductionRes = await transaction.collection('salary_insurance_deductions')
    .where({
      ledger_id: ledger._id,
      source_type: 'salary_monthly',
      source_id: sourceId
    })
    .limit(1)
    .get();

  if (existingDeductionRes.data?.length) {
    const existingDeduction = existingDeductionRes.data[0];
    const latestLedger = await getLedgerById(ledger._id, transaction);
    return {
      ledger: latestLedger || ledger,
      deduction: existingDeduction,
      insuranceDeduct: roundMoney(Number(existingDeduction.deduct_amount || 0)),
      sourceId,
      reused: true
    };
  }

  const applyResult = await applyInsuranceDeduction({
    ledger_id: ledger._id,
    source_type: 'salary_monthly',
    source_id: sourceId,
    deduct_amount: Number(ledger.remaining_amount || 0),
    pay_date: '',
    remark: `${yearMonth} 月结薪资保险扣减`,
    created_by: createdBy
  }, transaction);

  return {
    ledger: applyResult.ledger || ledger,
    deduction: applyResult.deduction,
    insuranceDeduct: roundMoney(Number(applyResult.applied_amount || 0)),
    sourceId,
    reused: false
  };
}

exports.calculateSalary = async (params, operator) => {
  const { employee_id, company_id, year, month } = params;

  try {
    const employeeDoc = await db.collection('employees').doc(employee_id).get();
    if (!employeeDoc.data) {
      throw new Error('员工不存在');
    }

    const employee = employeeDoc.data;
    const employeeCompany = await getLatestEmployeeCompany(employee_id, company_id);
    if (!employeeCompany) {
      console.warn(`[calculate-salary] 员工 ${employee_id} 在企业 ${company_id} 下无 employee_companies 关联，回退 employee 口径计算`);
    }
    const settlementMode = params.settlement_mode || employeeCompany?.settlement_mode || employee.settlement_mode || 'daily';
    const yearMonth = buildYearMonth(year, month);
    const startDate = `${yearMonth}-01`;
    const endDate = `${yearMonth}-${String(daysInMonth(year, month)).padStart(2, '0')}`;
    let summary = null;
    if (settlementMode === 'monthly') {
      const summaryRes = await db.collection('worktime_monthly_summaries')
        .where({
          employee_id,
          company_id,
          year_month: yearMonth,
          status: 'approved'
        })
        .limit(1)
        .get();

      if (!summaryRes.data || !summaryRes.data.length) {
        throwBusinessError('未找到已审核的月结工时汇总', {
          employee_id,
          employee_name: employee.name || employee.real_name || '',
          company_id,
          year_month: yearMonth,
          reason: 'MISSING_MONTHLY_SUMMARY'
        });
      }
      summary = summaryRes.data[0];
    }

    const { plan, job, planId, jobId } = await getHourlyRatePlan(employee, employeeCompany, summary);
    const insuranceConfig = await getSalaryInsuranceV2RuntimeConfig(db);
    const insuranceV2Enabled = isSalaryInsuranceV2ActiveForCompany(insuranceConfig, company_id);
    const insuranceV2ShadowEnabled = isSalaryInsuranceV2ShadowEnabled(insuranceConfig, company_id);

    const hourlyRate = resolveHourlyRate(plan, settlementMode, summary, employeeCompany, job, employee);
    const importedMonthlySalaryAmount = settlementMode === 'monthly'
      ? roundMoney(Number(summary?.salary_amount || 0))
      : 0;
    const useImportedMonthlySalaryAmount = importedMonthlySalaryAmount > 0;
    if (!hourlyRate && !useImportedMonthlySalaryAmount) {
      throwBusinessError('未找到可用的岗位工价方案，请先补充员工/岗位工价', {
        employee_id,
        employee_name: employee.name || employee.real_name || '',
        company_id,
        year_month: yearMonth,
        settlement_mode: settlementMode,
        job_id: jobId || '',
        rate_plan_id: planId || '',
        reason: 'MISSING_RATE_PLAN'
      });
    }
    const { nightHourlyRate, nightDailyRate } = resolveNightRates(plan, settlementMode, summary, employeeCompany, job, employee);
    const insuranceDeduct = calculateInsuranceDeduct(plan, summary, year, month, employeeCompany?.join_date, employeeCompany?.leave_date);
    const insuranceShadow = buildInsuranceShadowSnapshot({
      settlementMode,
      year,
      month,
      joinDate: employeeCompany?.join_date,
      leaveDate: employeeCompany?.leave_date,
      insuranceDailyDeduct: Number(plan?.insurance_daily_deduct ?? summary?.insurance_daily_deduct ?? 0),
      insuranceMonthlyDeduct: Number(plan?.insurance_monthly_deduct ?? summary?.insurance_monthly_deduct ?? 0)
    });

    if (insuranceV2ShadowEnabled || insuranceV2Enabled) {
      console.log('[salary-insurance-v2]', JSON.stringify({
        mode: insuranceV2Enabled ? 'enabled' : 'shadow',
        employee_id,
        company_id,
        settlement_mode: settlementMode,
        insurance_month: insuranceShadow.insurance_month,
        current_logic_amount: insuranceDeduct,
        v2_obligation_amount: insuranceShadow.current_month_obligation,
        first_due_event_month: settlementMode === 'daily'
          ? insuranceShadow.previous_month_for_daily_preview
          : insuranceShadow.insurance_month
      }));
    }

    let salaryData;
    let transactionMonthlyPayload = null;

    if (settlementMode === 'monthly') {
      const totalHours = Number(summary.total_hours || 0);
      const totalDays = Number(summary.total_days || 0);
      const nightHours = Number(summary.night_hours || 0);
      const nightDays = Number(summary.night_days || 0);
      const calculatedBasePay = roundMoney(totalHours * hourlyRate);
      const calculatedNightAllowance = roundMoney(
        nightHours * nightHourlyRate +
        nightDays * nightDailyRate
      );
      const basePay = useImportedMonthlySalaryAmount ? importedMonthlySalaryAmount : calculatedBasePay;
      const nightAllowance = useImportedMonthlySalaryAmount ? 0 : calculatedNightAllowance;
      const grossPay = useImportedMonthlySalaryAmount
        ? importedMonthlySalaryAmount
        : roundMoney(basePay + nightAllowance);
      transactionMonthlyPayload = {
        employee_id,
        employee_name: summary.employee_name || employee.name || employee.real_name || '',
        employee_no: summary.employee_no || employee.employee_no || '',
        company_id,
        company_name: summary.company_name || employeeCompany?.company_name || employee.company_name || '',
        job_id: summary.job_id || jobId || '',
        job_name: summary.job_name || job?.name || employee.job_name || '',
        year,
        month,
        year_month: yearMonth,
        settlement_mode: 'monthly',
        start_date: startDate,
        end_date: endDate,
        regular_hours: roundMoney(totalHours),
        overtime_hours: 0,
        total_hours: roundMoney(totalHours),
        total_days: totalDays,
        hourly_rate: hourlyRate,
        regular_pay: basePay,
        overtime_pay: 0,
        base_pay: basePay,
        night_allowance: nightAllowance,
        gross_pay: grossPay,
        source_summary_id: summary._id,
        night_hours: nightHours,
        night_days: nightDays,
        rate_plan_id: planId || '',
        salary_amount_source: useImportedMonthlySalaryAmount ? 'imported' : 'calculated',
        imported_salary_amount: importedMonthlySalaryAmount,
        calculated_base_pay: calculatedBasePay,
        calculated_night_allowance: calculatedNightAllowance,
        legacy_insurance_deduct: insuranceDeduct
      };
    } else {
      const worktimeDocs = await db.collection('worktimes')
        .where({
          employee_id,
          company_id,
          work_date: db.command.gte(startDate).lte(endDate),
          status: 'approved'
        })
        .get();

      const records = worktimeDocs.data || [];
      let totalHours = 0;
      let workDays = 0;
      let nightHours = 0;
      let nightDays = 0;
      const salaryDetails = [];

      records.forEach((record) => {
        const hours = Number(record.total_hours || record.regular_hours || 0);
        totalHours += hours;
        workDays += 1;
        if (record.shift === 'night') {
          nightHours += hours;
          nightDays += 1;
        }
        salaryDetails.push({
          work_date: record.work_date,
          hours,
          shift: record.shift,
          hourly_rate: hourlyRate
        });
      });

      const basePay = roundMoney(totalHours * hourlyRate);
      const nightAllowance = roundMoney(
        nightHours * nightHourlyRate +
        nightDays * nightDailyRate
      );
      const grossPay = roundMoney(basePay + nightAllowance);
      const netPay = roundMoney(grossPay - insuranceDeduct);

      salaryData = {
        employee_id,
        employee_name: employee.name || employee.real_name || '',
        employee_no: employee.employee_no || '',
        company_id,
        company_name: employee.company_name || employeeCompany?.company_name || '',
        job_id: jobId || employee.job_id || '',
        job_name: job?.name || employee.job_name || '',
        year,
        month,
        year_month: yearMonth,
        settlement_mode: 'daily',
        source_type: 'salary_daily',
        source_id: buildDailySalarySourceId(employee_id, company_id, yearMonth),
        start_date: startDate,
        end_date: endDate,
        regular_hours: roundMoney(totalHours),
        overtime_hours: 0,
        total_hours: roundMoney(totalHours),
        total_days: workDays,
        hourly_rate: hourlyRate,
        regular_pay: basePay,
        overtime_pay: 0,
        base_pay: basePay,
        night_allowance: nightAllowance,
        insurance_deduct: insuranceDeduct,
        deductions: insuranceDeduct,
        gross_pay: grossPay,
        net_pay: netPay,
        total_amount: netPay,
        status: 'calculated',
        details: JSON.stringify({
          settlement_mode: 'daily',
          salaryDetails,
          night_hours: nightHours,
          night_days: nightDays,
          rate_plan_id: planId || '',
          insurance_deduct: insuranceDeduct
        }),
        created_by: operator.uid,
        created_at: db.serverDate(),
        updated_at: db.serverDate()
      };
    }

    await db.runTransaction(async (transaction) => {
      const existing = await transaction.collection('salaries')
        .where({ employee_id, company_id, year, month, settlement_mode })
        .get();

      if (settlementMode === 'monthly') {
        const monthlyPayload = transactionMonthlyPayload;
        let finalInsuranceDeduct = monthlyPayload.legacy_insurance_deduct;
        let insuranceLedgerId = '';
        let insuranceMonth = yearMonth;
        let insuranceDeductDetail = {
          mode: insuranceV2Enabled ? 'v2' : 'legacy',
          insurance_month: yearMonth,
          legacy_insurance_deduct: roundMoney(monthlyPayload.legacy_insurance_deduct)
        };

        if (insuranceV2Enabled) {
          const insuranceSettlement = await prepareMonthlyInsuranceSettlement({
            transaction,
            employee_id,
            company_id,
            yearMonth,
            joinDate: employeeCompany?.join_date || summary?.join_date,
            leaveDate: employeeCompany?.leave_date || summary?.leave_date,
            ratePlanId: monthlyPayload.rate_plan_id,
            insuranceDailyDeduct: Number(plan?.insurance_daily_deduct || 0),
            insuranceMonthlyDeduct: Number(plan?.insurance_monthly_deduct || 0),
            createdBy: operator.uid
          });

          finalInsuranceDeduct = roundMoney(insuranceSettlement.insuranceDeduct);
          insuranceLedgerId = insuranceSettlement.ledger?._id || '';
          insuranceMonth = insuranceSettlement.ledger?.insurance_month || yearMonth;
          insuranceDeductDetail = {
            mode: 'v2',
            insurance_month: insuranceMonth,
            ledger_id: insuranceLedgerId,
            obligation_amount: roundMoney(Number(insuranceSettlement.ledger?.obligation_amount || 0)),
            deducted_amount: roundMoney(Number(insuranceSettlement.ledger?.deducted_amount || 0)),
            remaining_amount: roundMoney(Number(insuranceSettlement.ledger?.remaining_amount || 0)),
            source_type: 'salary_monthly',
            source_id: insuranceSettlement.sourceId,
            deduction_id: insuranceSettlement.deduction?._id || '',
            reused_deduction: Boolean(insuranceSettlement.reused)
          };
        }

        const tax = calculateTax(monthlyPayload.gross_pay, finalInsuranceDeduct);
        const netPay = roundMoney(monthlyPayload.gross_pay - finalInsuranceDeduct - tax);

        salaryData = {
            employee_id: monthlyPayload.employee_id,
            employee_name: monthlyPayload.employee_name,
            employee_no: monthlyPayload.employee_no,
          company_id: monthlyPayload.company_id,
          company_name: monthlyPayload.company_name,
          job_id: monthlyPayload.job_id,
          job_name: monthlyPayload.job_name,
          year,
          month,
          year_month: yearMonth,
          settlement_mode: 'monthly',
          source_type: 'salary_monthly',
          source_id: buildMonthlySalarySourceId(employee_id, company_id, yearMonth),
          start_date: monthlyPayload.start_date,
          end_date: monthlyPayload.end_date,
          regular_hours: monthlyPayload.regular_hours,
          overtime_hours: monthlyPayload.overtime_hours,
          total_hours: monthlyPayload.total_hours,
          total_days: monthlyPayload.total_days,
          hourly_rate: monthlyPayload.hourly_rate,
          regular_pay: monthlyPayload.regular_pay,
          overtime_pay: monthlyPayload.overtime_pay,
          base_pay: monthlyPayload.base_pay,
          night_allowance: monthlyPayload.night_allowance,
          insurance_month: insuranceMonth,
          insurance_ledger_id: insuranceLedgerId,
          insurance_deduct_detail: JSON.stringify(insuranceDeductDetail),
          insurance_deduct: finalInsuranceDeduct,
          tax,
          deductions: roundMoney(finalInsuranceDeduct + tax),
          gross_pay: monthlyPayload.gross_pay,
          net_pay: netPay,
          total_amount: netPay,
          status: 'calculated',
          details: JSON.stringify({
            settlement_mode: 'monthly',
            source_summary_id: monthlyPayload.source_summary_id,
            total_days: monthlyPayload.total_days,
            night_hours: monthlyPayload.night_hours,
            night_days: monthlyPayload.night_days,
            rate_plan_id: monthlyPayload.rate_plan_id,
            salary_amount_source: monthlyPayload.salary_amount_source,
            imported_salary_amount: monthlyPayload.imported_salary_amount,
            calculated_base_pay: monthlyPayload.calculated_base_pay,
            calculated_night_allowance: monthlyPayload.calculated_night_allowance,
            insurance_deduct: finalInsuranceDeduct,
            insurance_mode: insuranceV2Enabled ? 'v2' : 'legacy',
            insurance_shadow_obligation: insuranceShadow.current_month_obligation,
            tax
          }),
          created_by: operator.uid,
          created_at: db.serverDate(),
          updated_at: db.serverDate()
        };
      }

      if (existing.data && existing.data.length > 0) {
        await transaction.collection('salaries')
          .doc(existing.data[0]._id)
          .update({
            data: salaryData
          });
      } else {
        await transaction.collection('salaries').add({
          data: salaryData
        });
      }
    });

    return {
      ...success(null, '薪资计算完成'),
      data: {
        employee_id,
        company_id,
        year,
        month,
        settlement_mode: settlementMode,
        net_pay: salaryData.net_pay,
        gross_pay: salaryData.gross_pay,
        insurance_deduct: salaryData.insurance_deduct,
        tax: salaryData.tax || 0,
        message: `${yearMonth} 薪资已计算完成`
      }
    };
  } catch (err) {
    console.error('计算薪资失败:', err);
    throw err;
  }
};
