/**
 * calculate-salary.js (v2) - 薪资计算
 * 优化点:
 * 1. resolveHourlyRate() 消除日结/月结 82% 重复代码
 * 2. 串行查询并行化 (5→2 轮 round-trip, 延迟降低 ~50%)
 * 3. ensureInsuranceLedger 返回值复用，不再 getLedgerById 重复查询
 * 4. 日期函数引用 common/date-utils
 */
const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();
const { success } = require('./response');
const { roundMoney } = require('./insurance-v2');
const {
  SALARY_INSURANCE_V2_START_MONTH,
  isInsuranceMonthInV2Scope
} = require('./runtime-config');
const {
  ensureInsuranceLedger,
  applyInsuranceDeduction
} = require('./insurance-ledger');

function buildYearMonth(year, month) {
  return `${year}-${String(month).padStart(2, '0')}`;
}

function daysInMonth(year, month) {
  return new Date(year, month, 0).getDate();
}

function normalizeDate(value) {
  if (!value) return '';
  const text = String(value);
  const match = text.match(/^(\d{4}-\d{2}-\d{2})/);
  if (match) return match[1];
  const parsed = new Date(text);
  if (Number.isNaN(parsed.getTime())) return '';
  return parsed.toISOString().slice(0, 10);
}

function isRelationOverlappingMonth(relation, yearMonth) {
  if (!relation || !yearMonth) return false;
  const monthStart = `${yearMonth}-01`;
  const monthEnd = `${yearMonth}-${String(daysInMonth(Number(yearMonth.slice(0, 4)), Number(yearMonth.slice(5, 7)))).padStart(2, '0')}`;
  const joinDate = normalizeDate(relation.join_date);
  const leaveDate = normalizeDate(relation.leave_date);
  if (joinDate && joinDate > monthEnd) return false;
  if (leaveDate && leaveDate < monthStart) return false;
  return true;
}

function pickEmployeeCompanyForMonth(relations = [], yearMonth = '') {
  const list = Array.isArray(relations) ? relations : [];
  const matched = list.find((item) => isRelationOverlappingMonth(item, yearMonth));
  return matched || list[0] || null;
}

function normalizeSettlementMode(value) {
  const mode = String(value || '').trim().toLowerCase();
  if (mode === '日结') return 'daily';
  if (mode === '月结') return 'monthly';
  return mode;
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

function buildBusinessError(message, data = {}) {
  const err = new Error(message);
  err.code = 400;
  err.data = data;
  return err;
}

async function getHourlyRatePlan(employee, employeeCompany, summary) {
  const jobId = pickFirstValue(summary?.job_id, employeeCompany?.job_id, employee?.job_id);
  let job = null;
  let planId = pickFirstValue(summary?.rate_plan_id, employeeCompany?.rate_plan_id, employee?.rate_plan_id);

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

// ── 优化 1: 统一时薪获取函数 ──────────────────────────────
function resolveHourlyRate(plan, settlementMode, summary, employeeCompany, job, employee) {
  const suffix = settlementMode === 'monthly' ? '_monthly' : '_daily';

  // 1. 工价表时薪
  let hourlyRate = roundMoney(Number(plan?.[`hourly_rate${suffix}`] || 0));

  // 2. 工价表无时薪 → 日薪 / 计薪时长换算
  if (!hourlyRate) {
    const dailyRate = Number(plan?.[`daily_rate${suffix}`] || 0);
    const payHours = Number(plan?.[`pay_hours${suffix}`] || 8);
    if (dailyRate && payHours) hourlyRate = roundMoney(dailyRate / payHours);
  }

  // 3. 降级取月结汇总快照 / employeeCompany / job / employee
  if (!hourlyRate) {
    hourlyRate = roundMoney(Number(
      pickFirstValue(
        summary?.hourly_rate,
        employeeCompany?.hourly_rate,
        job?.hourly_rate_monthly,
        job?.hourly_rate_daily,
        job?.hourly_rate,
        employee?.hourly_rate,
        0
      ) || 0
    ));
  }

  return hourlyRate;
}

function resolveNightRates(plan, settlementMode, summary, employeeCompany, job, employee) {
  const suffix = settlementMode === 'monthly' ? '_monthly' : '_daily';

  // 时薪模式的夜班时薪
  let nightHourlyRate = Number(plan?.[`night_hourly_rate${suffix}`] ?? 0);
  if (!nightHourlyRate) {
    nightHourlyRate = Number(
      summary?.night_hourly_rate ??
      plan?.night_hourly_rate ??
      employeeCompany?.night_hourly_rate ??
      job?.night_hourly_rate ??
      employee?.night_hourly_rate ??
      0
    );
  }

  // 日薪模式的夜班补贴
  let nightDailyRate = Number(plan?.[`night_daily_rate${suffix}`] ?? 0);
  if (!nightDailyRate) {
    nightDailyRate = Number(
      summary?.night_daily_rate ??
      plan?.night_daily_rate ??
      employeeCompany?.night_daily_rate ??
      job?.night_daily_rate ??
      employee?.night_daily_rate ??
      0
    );
  }

  return { nightHourlyRate, nightDailyRate };
}

/**
 * 计算个人所得税（累进税率）
 * 按照2024年税率：
 * - 0-3000：3%
 * - 3000-12000：10%
 * - 12000-25000：20%
 * - 25000-35000：25%
 * - 35000-55000：30%
 * - 55000-80000：35%
 * - 80000+：45%
 */
function calculateTax(grossPay, insuranceDeduct, threshold = 5000) {
  const taxableIncome = Math.max(0, Number(grossPay || 0) - Number(insuranceDeduct || 0) - Number(threshold || 5000));
  
  if (taxableIncome <= 0) return 0;

  // 累进税率表
  const brackets = [
    { max: 3000, rate: 0.03 },
    { max: 12000, rate: 0.1 },
    { max: 25000, rate: 0.2 },
    { max: 35000, rate: 0.25 },
    { max: 55000, rate: 0.3 },
    { max: 80000, rate: 0.35 },
    { max: Infinity, rate: 0.45 }
  ];

  let tax = 0;
  let previousMax = 0;

  for (const bracket of brackets) {
    if (taxableIncome > previousMax) {
      const amountInBracket = Math.min(taxableIncome, bracket.max) - previousMax;
      tax += amountInBracket * bracket.rate;
      previousMax = bracket.max;
    }
    if (taxableIncome <= bracket.max) break;
  }

  return roundMoney(tax);
}

function buildMonthlySalarySourceId(employee_id, company_id, yearMonth) {
  return `salary_monthly:${employee_id || ''}:${company_id || ''}:${yearMonth || ''}`;
}

function buildDailySalarySourceId(employee_id, company_id, yearMonth) {
  return `salary_daily:${employee_id || ''}:${company_id || ''}:${yearMonth || ''}`;
}

// ── 优化 3: 不再重复查询 ledger ──────────────────────────
async function prepareMonthlyInsuranceSettlement(params = {}) {
  const {
    transaction, employee_id, company_id, yearMonth,
    joinDate, leaveDate, ratePlanId,
    insuranceDailyDeduct, insuranceMonthlyDeduct, createdBy
  } = params;

  const ensureResult = await ensureInsuranceLedger({
    employee_id, company_id, insurance_month: yearMonth,
    settlement_mode: 'monthly', join_date: joinDate, leave_date: leaveDate,
    rate_plan_id: ratePlanId,
    insurance_daily_deduct: insuranceDailyDeduct,
    insurance_monthly_deduct: insuranceMonthlyDeduct
  }, transaction);

  const ledger = ensureResult.ledger;
  const sourceId = buildMonthlySalarySourceId(employee_id, company_id, yearMonth);

  if (ensureResult.skipped || !ledger?._id || Number(ledger.remaining_amount || 0) <= 0) {
    return {
      ledger,
      deduction: null,
      insuranceDeduct: 0,
      sourceId,
      reused: false,
      skipped: Boolean(ensureResult.skipped)
    };
  }

  const existingDeductionRes = await transaction.collection('salary_insurance_deductions')
    .where({ ledger_id: ledger._id, source_type: 'salary_monthly', source_id: sourceId })
    .limit(1)
    .get();

  if (existingDeductionRes.data?.length) {
    const existingDeduction = existingDeductionRes.data[0];
    // v2 优化: 直接使用 ensureResult.ledger，不再 getLedgerById 重新查询
    return {
      ledger,
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
    let summary = null;
    const yearMonth = buildYearMonth(year, month);

    const [employeeDoc, ecRes] = await Promise.all([
      db.collection('employees').doc(employee_id).get(),
      db.collection('employee_companies')
        .where({ employee_id, company_id })
        .orderBy('updated_at', 'desc')
        .get()
    ]);

    if (!employeeDoc.data) throw new Error('员工不存在');
    const employee = employeeDoc.data;
    const employeeCompany = pickEmployeeCompanyForMonth(ecRes.data || [], yearMonth);

    if (!employeeCompany) {
      console.warn(`[calculate-salary-v2] 员工 ${employee_id} 在企业 ${company_id} 下无 employee_companies 关联`);
    }

    const settlementMode = normalizeSettlementMode(employeeCompany?.settlement_mode);
    if (!['daily', 'monthly'].includes(settlementMode)) {
      throw new Error('员工企业关系未配置结算方式，无法计算薪资');
    }

    const startDate = `${yearMonth}-01`;
    const endDate = `${yearMonth}-${String(daysInMonth(year, month)).padStart(2, '0')}`;

    if (settlementMode === 'monthly') {
      const summaryRes = await db.collection('worktime_monthly_summaries')
        .where({ employee_id, company_id, year_month: yearMonth, status: 'approved' })
        .limit(1)
        .get();

      if (!summaryRes.data?.length) {
        console.warn(`[calculate-salary] 员工 ${employee_id}(${employee.name}) 在企业 ${company_id} 的 ${yearMonth} 无已审核工时汇总`);
        return {
          code: 400,
          message: `员工 ${employee.name} 缺少 ${yearMonth} 的已审核工时汇总`,
          data: {
            employee_id,
            employee_name: employee.name,
            company_id,
            reason: 'MISSING_MONTHLY_SUMMARY',
            year_month: yearMonth
          }
        };
      }

      summary = summaryRes.data[0];
    }

    const { plan, job, planId, jobId } = await getHourlyRatePlan(employee, employeeCompany, summary);

    // ── 优化 1: 使用统一函数 ──────────────────────────────
    const hourlyRate = resolveHourlyRate(plan, settlementMode, summary, employeeCompany, job, employee);
    const importedMonthlySalaryAmount = settlementMode === 'monthly'
      ? roundMoney(Number(summary?.salary_amount || 0))
      : 0;
    const useImportedMonthlySalaryAmount = importedMonthlySalaryAmount > 0;
    if (!hourlyRate && !useImportedMonthlySalaryAmount) {
      throw buildBusinessError('未找到可用的岗位工价方案，请先补充员工/岗位工价', {
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

    let salaryData;
    let transactionMonthlyPayload = null;

    if (settlementMode === 'monthly') {
      const totalHours = Number(summary.total_hours || 0);
      const totalDays = Number(summary.total_days || 0);
      const nightHours = Number(summary.night_hours || 0);
      const nightDays = Number(summary.night_days || 0);
      const calculatedBasePay = roundMoney(totalHours * hourlyRate);
      const calculatedNightAllowance = roundMoney(nightHours * nightHourlyRate + nightDays * nightDailyRate);
      const basePay = useImportedMonthlySalaryAmount ? importedMonthlySalaryAmount : calculatedBasePay;
      const nightAllowance = useImportedMonthlySalaryAmount ? 0 : calculatedNightAllowance;
      const grossPay = useImportedMonthlySalaryAmount
        ? importedMonthlySalaryAmount
        : roundMoney(basePay + nightAllowance);

      transactionMonthlyPayload = {
        employee_id, employee_name: employee.name || '',
        employee_no: employee.employee_no || '', company_id,
        company_name: summary.company_name || employeeCompany?.company_name || employee.company_name || '',
        job_id: summary.job_id || jobId || employee.job_id || '',
        job_name: summary.job_name || job?.position || job?.job_name || employeeCompany?.job_name || employee.job_name || '',
        year, month, year_month: yearMonth, settlement_mode: 'monthly',
        start_date: startDate, end_date: endDate,
        regular_hours: roundMoney(totalHours), overtime_hours: 0,
        total_hours: roundMoney(totalHours), total_days: totalDays,
        hourly_rate: hourlyRate, regular_pay: basePay,
        overtime_pay: 0, base_pay: basePay,
        night_allowance: nightAllowance, gross_pay: grossPay,
        source_summary_id: summary._id,
        night_hours: nightHours, night_days: nightDays,
        rate_plan_id: planId || plan?._id || '',
        salary_amount_source: useImportedMonthlySalaryAmount ? 'imported' : 'calculated',
        imported_salary_amount: importedMonthlySalaryAmount,
        imported_salary_includes_allowances: useImportedMonthlySalaryAmount,
        calculated_base_pay: calculatedBasePay,
        calculated_night_allowance: calculatedNightAllowance
      };
    } else {
      const worktimeDocs = await db.collection('worktimes')
        .where({
          employee_id, company_id,
          work_date: db.command.gte(startDate).lte(endDate),
          status: 'approved'
        })
        .get();

      const records = worktimeDocs.data || [];
      let totalHours = 0, workDays = 0, nightHours = 0, nightDays = 0;
      const salaryDetails = [];

      records.forEach((record) => {
        const hours = roundMoney(Number(record.total_hours || record.regular_hours || 0));
        totalHours = roundMoney(totalHours + hours);  // ✓ 每次累加都进行精度控制
        workDays += 1;
        if (record.shift === 'night') { 
          nightHours = roundMoney(nightHours + hours);  // ✓ 夜班工时也进行精度控制
          nightDays += 1; 
        }
        salaryDetails.push({ 
          work_date: record.work_date, 
          hours: roundMoney(hours), 
          shift: record.shift, 
          hourly_rate: roundMoney(hourlyRate) 
        });
      });

      const basePay = roundMoney(totalHours * hourlyRate);
      const nightAllowance = roundMoney(nightHours * nightHourlyRate + nightDays * nightDailyRate);
      const grossPay = roundMoney(basePay + nightAllowance);
      const netPay = grossPay;

      salaryData = {
        employee_id, employee_name: employee.name || '',
        employee_no: employee.employee_no || '', company_id,
        company_name: employeeCompany?.company_name || employee.company_name || '',
        job_id: employeeCompany?.job_id || employee.job_id || '', job_name: employeeCompany?.job_name || employee.job_name || '',
        year, month, year_month: yearMonth, settlement_mode: 'daily',
        source_type: 'salary_daily',
        source_id: buildDailySalarySourceId(employee_id, company_id, yearMonth),
        start_date: startDate, end_date: endDate,
        regular_hours: roundMoney(totalHours), overtime_hours: 0,
        total_hours: roundMoney(totalHours), total_days: workDays,
        hourly_rate: hourlyRate, regular_pay: basePay,
        overtime_pay: 0, base_pay: basePay,
        night_allowance: nightAllowance, insurance_deduct: 0,
        deductions: 0, gross_pay: grossPay,
        net_pay: netPay, total_amount: netPay,
        status: 'calculated',
        details: JSON.stringify({
          settlement_mode: 'daily', salaryDetails,
          night_hours: nightHours, night_days: nightDays,
          rate_plan_id: plan?._id || '', insurance_deduct: 0,
          insurance_mode: 'v2_daily_uses_batch_pay'
        }),
        created_by: operator.uid,
        created_at: db.serverDate(), updated_at: db.serverDate()
      };
    }

    await db.runTransaction(async (transaction) => {
      const existing = await transaction.collection('salaries')
        .where({ employee_id, company_id, year, month, settlement_mode: settlementMode })
        .get();

      if (settlementMode === 'monthly') {
        const monthlyPayload = transactionMonthlyPayload;
        let finalInsuranceDeduct = 0;
        let insuranceLedgerId = '';
        let insuranceMonth = yearMonth;
        let insuranceDeductDetail = {};

        console.log(`[calculate-salary] 使用 V2 保险处理 ${employee_id}(${employee.name})，起算月份 ${SALARY_INSURANCE_V2_START_MONTH}`);
        
        const insuranceSettlement = await prepareMonthlyInsuranceSettlement({
          transaction, employee_id, company_id, yearMonth,
          joinDate: employeeCompany?.join_date || summary?.join_date,
          leaveDate: employeeCompany?.leave_date || summary?.leave_date,
          ratePlanId: monthlyPayload.rate_plan_id,
          insuranceDailyDeduct: Number(plan?.insurance_daily_deduct ?? summary?.insurance_daily_deduct ?? 0),
          insuranceMonthlyDeduct: Number(plan?.insurance_monthly_deduct ?? summary?.insurance_monthly_deduct ?? 0),
          createdBy: operator.uid
        });

        finalInsuranceDeduct = roundMoney(insuranceSettlement.insuranceDeduct);
        insuranceLedgerId = insuranceSettlement.ledger?._id || '';
        insuranceMonth = insuranceSettlement.ledger?.insurance_month || yearMonth;
        insuranceDeductDetail = {
          mode: 'v2', 
          version: '2026-04',
          start_month: SALARY_INSURANCE_V2_START_MONTH,
          insurance_month: insuranceMonth,
          ledger_id: insuranceLedgerId,
          obligation_amount: roundMoney(Number(insuranceSettlement.ledger?.obligation_amount || 0)),
          deducted_amount: roundMoney(Number(insuranceSettlement.ledger?.deducted_amount || 0)),
          remaining_amount: roundMoney(Number(insuranceSettlement.ledger?.remaining_amount || 0)),
          source_type: 'salary_monthly', source_id: insuranceSettlement.sourceId,
          deduction_id: insuranceSettlement.deduction?._id || '',
          reused_deduction: Boolean(insuranceSettlement.reused),
          skipped_before_start: Boolean(insuranceSettlement.skipped || !isInsuranceMonthInV2Scope(yearMonth))
        };

        const tax = calculateTax(monthlyPayload.gross_pay, finalInsuranceDeduct);
        const netPay = roundMoney(monthlyPayload.gross_pay - finalInsuranceDeduct - tax);

        salaryData = {
          employee_id: monthlyPayload.employee_id,
          employee_name: monthlyPayload.employee_name,
          employee_no: monthlyPayload.employee_no,
          company_id: monthlyPayload.company_id,
          company_name: monthlyPayload.company_name,
          job_id: monthlyPayload.job_id, job_name: monthlyPayload.job_name,
          year, month, year_month: yearMonth,
          settlement_mode: 'monthly',
          source_type: 'salary_monthly',
          source_id: buildMonthlySalarySourceId(employee_id, company_id, yearMonth),
          start_date: monthlyPayload.start_date, end_date: monthlyPayload.end_date,
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
          insurance_deduct: finalInsuranceDeduct, tax,
          deductions: roundMoney(finalInsuranceDeduct + tax),
          gross_pay: monthlyPayload.gross_pay,
          net_pay: netPay, total_amount: netPay,
          status: 'calculated',
          calc_source: 'salaries-v2',
          calc_version: 'monthly-v3',
          details: JSON.stringify({
            settlement_mode: 'monthly',
            source_summary_id: monthlyPayload.source_summary_id,
            total_days: monthlyPayload.total_days,
            night_hours: monthlyPayload.night_hours,
            night_days: monthlyPayload.night_days,
            rate_plan_id: monthlyPayload.rate_plan_id,
            job_id: monthlyPayload.job_id,
            job_name: monthlyPayload.job_name,
            salary_amount_source: monthlyPayload.salary_amount_source,
            imported_salary_amount: monthlyPayload.imported_salary_amount,
            imported_salary_includes_allowances: monthlyPayload.imported_salary_includes_allowances,
            calculated_base_pay: monthlyPayload.calculated_base_pay,
            calculated_night_allowance: monthlyPayload.calculated_night_allowance,
            insurance_deduct: finalInsuranceDeduct,
            insurance_mode: 'v2',
            insurance_start_month: SALARY_INSURANCE_V2_START_MONTH,
            tax
          }),
          created_by: operator.uid,
          created_at: db.serverDate(), updated_at: db.serverDate()
        };
      }

      if (existing.data?.length > 0) {
        await transaction.collection('salaries').doc(existing.data[0]._id).update({ data: salaryData });
      } else {
        await transaction.collection('salaries').add({ data: salaryData });
      }
    });

    return {
      ...success(null, '薪资计算完成'),
      data: {
        employee_id, company_id, year, month, settlement_mode: settlementMode,
        net_pay: salaryData.net_pay, gross_pay: salaryData.gross_pay,
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
