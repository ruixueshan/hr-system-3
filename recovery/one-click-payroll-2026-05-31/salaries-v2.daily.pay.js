/**
 * daily/pay.js — 日结发薪 + 押金发放
 * 每条工时记录：创建 salary + 扣保险台账 + 标记 worktime.salary_status=paid
 */
const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();
const { roundMoney, buildYearMonth } = require('../common/money');
const { getRatePlan } = require('../common/rate-plan');
const dailyCalc = require('./calculate');
const {
  ensureDueDailyInsuranceLedgers,
  listInsuranceLedgers,
  applyInsuranceDeduction
} = require('../insurance-ledger');
const { error, success } = require('../response');

function buildDailySalarySourceId(worktimeId) {
  return `salary_daily:${worktimeId || ''}`;
}

/**
 * 批量日结发薪
 */
async function batchPay(worktimes, payDate, operator) {
  if (!Array.isArray(worktimes) || !worktimes.length) return error(400, '缺少待发薪工时');

  const summary = { successCount: 0, failCount: 0 };

  for (const wt of worktimes) {
    const wtId = wt._id || wt.worktime_id;
    if (!wtId) { summary.failCount += 1; continue; }

    try {
      await db.runTransaction(async (tx) => {
        // 查工时记录
        const wtDoc = await tx.collection('worktimes').doc(wtId).get();
        const worktime = wtDoc.data;
        if (!worktime) throw new Error('工时记录不存在');
        if (worktime.salary_status === 'paid') throw new Error('工时已发薪');

        // 计算日结薪资
        const salaryData = await dailyCalc.calculate(worktime, operator, tx);

        // 保险台账扣减
        let insuranceDeductApplied = 0;
        const deductionDetails = [];

        const plan = await getRatePlan(
          (await tx.collection('employee_companies')
            .where({ employee_id: salaryData.employee_id, company_id: salaryData.company_id })
            .orderBy('updated_at', 'desc').limit(1).get()).data?.[0] || null
        );

        const yearMonth = salaryData.work_date?.slice(0, 7) || '';
        if (plan?.insurance_daily_deduct > 0 && yearMonth) {
          const ec = (await tx.collection('employee_companies')
            .where({ employee_id: salaryData.employee_id, company_id: salaryData.company_id })
            .orderBy('updated_at', 'desc').limit(1).get()).data?.[0];

          await ensureDueDailyInsuranceLedgers({
            employee_id: salaryData.employee_id,
            company_id: salaryData.company_id,
            year_month: yearMonth,
            employeeCompany: ec,
            ratePlanId: plan._id,
            plan
          }, tx);

          const ledgers = await listInsuranceLedgers({
            employee_id: salaryData.employee_id,
            company_id: salaryData.company_id,
            due_before_or_equal: yearMonth,
            status_list: ['pending', 'partial']
          }, tx);

          for (const ledger of ledgers) {
            const result = await applyInsuranceDeduction({
              ledger_id: ledger._id,
              source_type: 'salary_daily',
              source_id: buildDailySalarySourceId(wtId),
              deduct_amount: Number(ledger.remaining_amount || 0),
              pay_date: payDate,
              remark: `${salaryData.work_date} 日结保险扣减`,
              created_by: operator.uid
            }, tx);

            if (result.applied_amount > 0) {
              insuranceDeductApplied = roundMoney(insuranceDeductApplied + Number(result.applied_amount || 0));
              deductionDetails.push({
                ledger_id: ledger._id,
                insurance_month: ledger.insurance_month,
                deduct_amount: roundMoney(Number(result.applied_amount || 0)),
                deduction_id: result.deduction?._id || ''
              });
            }
          }
        }

        // 完善 salaryData（含保险扣减）
        salaryData.source_type = 'salary_daily';
        salaryData.source_id = buildDailySalarySourceId(wtId);
        salaryData.insurance_deduct = insuranceDeductApplied;
        salaryData.insurance_deduct_detail = JSON.stringify({
          mode: 'v2_daily', version: '2026-04', items: deductionDetails
        });
        salaryData.deductions = insuranceDeductApplied;
        salaryData.net_pay = roundMoney(salaryData.gross_pay - insuranceDeductApplied);
        salaryData.total_amount = salaryData.net_pay;
        salaryData.status = 'paid';
        salaryData.pay_date = payDate;
        salaryData.manual_adjust = Number(wt.manual_adjust || 0);
        salaryData.adjust_remark = wt.adjust_remark || '';
        salaryData.created_by = operator.uid;
        salaryData.created_at = db.serverDate();
        salaryData.updated_at = db.serverDate();

        await tx.collection('salaries').add({ data: salaryData });
        await tx.collection('worktimes').doc(wtId).update({
          data: { salary_status: 'paid', pay_date: payDate, updated_at: db.serverDate() }
        });
      });

      summary.successCount += 1;
    } catch (err) {
      console.error('[daily/pay] 发薪失败:', wtId, err.message);
      summary.failCount += 1;
    }
  }

  return summary.failCount
    ? error(500, `批量发薪部分失败，成功 ${summary.successCount} 条，失败 ${summary.failCount} 条`, summary)
    : success(summary, '批量发薪成功');
}

/**
 * 批量押金发放
 */
async function batchPayDeposit(worktimes, payDate, operator) {
  if (!Array.isArray(worktimes) || !worktimes.length) return error(400, '缺少待发放押金工时');

  const summary = { successCount: 0, failCount: 0 };
  const payYearMonth = payDate ? payDate.slice(0, 7) : '';

  for (const wt of worktimes) {
    const wtId = wt._id || wt.worktime_id;
    if (!wtId) { summary.failCount += 1; continue; }

    try {
      await db.runTransaction(async (tx) => {
        const wtDoc = await tx.collection('worktimes').doc(wtId).get();
        const worktime = wtDoc.data;
        if (!worktime) throw new Error('工时记录不存在');
        if (worktime.salary_status === 'paid') throw new Error('已发放');

        // 查员工 + 企业
        const [empDoc, ecRes] = await Promise.all([
          tx.collection('employees').doc(worktime.employee_id).get().catch(() => ({ data: null })),
          tx.collection('employee_companies')
            .where({ employee_id: worktime.employee_id, company_id: worktime.company_id })
            .orderBy('updated_at', 'desc').limit(1).get()
        ]);
        const employee = empDoc.data || {};
        const ec = ecRes.data?.[0] || {};

        const hours = roundMoney(Number(worktime.total_hours || worktime.regular_hours || 0));
        const salaryData = {
          employee_id: worktime.employee_id,
          employee_name: employee.name || '',
          employee_no: employee.employee_no || '',
          company_id: worktime.company_id,
          company_name: ec.company_name || '',
          job_id: ec.job_id || '',
          job_name: ec.job_name || '',
          work_date: worktime.work_date || '',
          year: Number(worktime.work_date?.slice(0, 4) || 0),
          month: Number(worktime.work_date?.slice(5, 7) || 0),
          year_month: (worktime.work_date || '').slice(0, 7),
          settlement_mode: 'daily',
          shift: worktime.shift || 'day',
          source_type: 'salary_daily',
          source_id: buildDailySalarySourceId(wtId),
          total_hours: hours,
          hourly_rate: 0,
          base_pay: 0,
          night_allowance: 0,
          gross_pay: hours,
          insurance_deduct: 0,
          deductions: 0,
          net_pay: hours,
          total_amount: hours,
          deposit: true,
          status: 'paid',
          pay_date: payDate,
          created_by: operator.uid,
          created_at: db.serverDate(),
          updated_at: db.serverDate()
        };

        await tx.collection('salaries').add({ data: salaryData });
        await tx.collection('worktimes').doc(wtId).update({
          data: { salary_status: 'paid', pay_date: payDate, updated_at: db.serverDate() }
        });
      });

      summary.successCount += 1;
    } catch (err) {
      console.error('[daily/pay] 押金发放失败:', wtId, err.message);
      summary.failCount += 1;
    }
  }

  return summary.failCount
    ? error(500, `批量押金部分失败，成功 ${summary.successCount} 条，失败 ${summary.failCount} 条`, summary)
    : success(summary, '批量押金发放成功');
}

module.exports = { batchPay, batchPayDeposit };
