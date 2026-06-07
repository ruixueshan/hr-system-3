import { getDatabase } from '../cloud';
import type { Employee, FinanceBillingConfig, FinanceMonthlyResult, Job, Salary } from '../types';
import { normalizeDate, roundMoney, chunkArray, normalizeText, fetchAllQueryDocs } from '@/utils/db-helper';

type BillingMode = FinanceBillingConfig['billing_mode'];

function toNumber(value: any) {
  const num = Number(value);
  return Number.isFinite(num) ? num : 0;
}

function normalizeBillingMode(value?: BillingMode | string | null): BillingMode {
  if (value === 'service_fee_monthly' || value === 'service_fee_hourly' || value === 'hourly_included') {
    return value;
  }
  return 'hourly_included';
}

function buildYearMonth(year: number, month: number) {
  return `${year}-${String(month).padStart(2, '0')}`;
}

function getMonthRange(year: number, month: number) {
  const start = `${buildYearMonth(year, month)}-01`;
  const end = normalizeDate(new Date(year, month, 0));
  return { start, end, yearMonth: buildYearMonth(year, month) };
}

function getDaysInMonth(year: number, month: number) {
  return new Date(year, month, 0).getDate();
}

function daysBetweenInclusive(start: string, end: string) {
  const startDate = new Date(`${start}T00:00:00`);
  const endDate = new Date(`${end}T00:00:00`);
  const diff = endDate.getTime() - startDate.getTime();
  if (diff < 0) return 0;
  return Math.floor(diff / (24 * 60 * 60 * 1000)) + 1;
}

function getServiceDaysInMonth(yearMonth: string, joinDate?: string, leaveDate?: string) {
  let start = `${yearMonth}-01`;
  let end = `${yearMonth}-${String(getDaysInMonth(Number(yearMonth.slice(0, 4)), Number(yearMonth.slice(5, 7)))).padStart(2, '0')}`;
  const normalizedJoin = normalizeDate(joinDate);
  const normalizedLeave = normalizeDate(leaveDate);
  if (normalizedJoin && normalizedJoin > start) start = normalizedJoin;
  if (normalizedLeave && normalizedLeave < end) end = normalizedLeave;
  return start > end ? 0 : daysBetweenInclusive(start, end);
}

function enumerateYearMonths(startDate?: string, endDate?: string) {
  const start = normalizeDate(startDate);
  const end = normalizeDate(endDate);
  if (!start || !end) return [] as Array<{ year: number; month: number; yearMonth: string }>;

  const startMonth = new Date(`${start.slice(0, 7)}-01T00:00:00`);
  const endMonth = new Date(`${end.slice(0, 7)}-01T00:00:00`);
  const result: Array<{ year: number; month: number; yearMonth: string }> = [];
  const cursor = new Date(startMonth);

  while (cursor <= endMonth) {
    const year = cursor.getFullYear();
    const month = cursor.getMonth() + 1;
    result.push({ year, month, yearMonth: buildYearMonth(year, month) });
    cursor.setMonth(cursor.getMonth() + 1);
  }

  return result;
}

function isConfigActive(config: FinanceBillingConfig, targetDate: string) {
  const from = normalizeDate(config.effective_from);
  const to = normalizeDate(config.effective_to);
  if (!from) return false;
  if (from > targetDate) return false;
  if (to && to < targetDate) return false;
  return (config.status || 'active') === 'active';
}

function buildDefaultBillingConfig(job: Partial<Job>): FinanceBillingConfig | null {
  const jobId = normalizeText(job._id || (job as any).id);
  const companyId = normalizeText(job.company_id);
  const purchaseRate = toNumber(job.purchase_hourly_rate);
  if (!jobId || !companyId || purchaseRate <= 0) {
    return null;
  }

  return {
    company_id: companyId,
    company_name: job.company_name,
    job_id: jobId,
    job_name: job.position || (job as any).job_name,
    billing_mode: 'hourly_included',
    salary_cost_bearing_mode: 'platform_cost',
    client_hourly_rate: purchaseRate,
    service_fee_monthly: 0,
    service_fee_hourly: 0,
    bill_hours_rule: toNumber(job.bill_hours) > 0 ? 'fixed_daily_hours' : 'actual_hours',
    fixed_bill_hours: toNumber(job.bill_hours) > 0 ? toNumber(job.bill_hours) : undefined,
    effective_from: normalizeDate((job as any).created_at) || '2026-01-01',
    effective_to: '',
    status: 'active',
    remark: '由岗位历史采购单价兼容生成',
    source_job_purchase_hourly_rate: purchaseRate,
    source_job_bill_hours: toNumber(job.bill_hours) || undefined
  };
}

function serializeDetails(payload: Record<string, any>) {
  try {
    return JSON.stringify(payload);
  } catch {
    return '{}';
  }
}

async function getEmployeesByIds(db: any, employeeIds: string[]) {
  const uniqueIds = [...new Set(employeeIds.map(normalizeText).filter(Boolean))];
  const employeeMap = new Map<string, Employee & Record<string, any>>();
  if (!uniqueIds.length) return employeeMap;

  for (const chunk of chunkArray(uniqueIds, 100)) {
    try {
      const res = await db.collection('employees').where({ _id: db.command.in(chunk) }).get();
      (res.data || []).forEach((item: any) => {
        const id = normalizeText(item._id || item.id);
        if (!id) return;
        employeeMap.set(id, { ...item, _id: id });
      });
    } catch (err) {
      console.warn('[financeApi] 批量读取员工失败', (err as any)?.message || err);
    }
  }

  return employeeMap;
}

function getSalaryHours(salary: Partial<Salary> & Record<string, any>) {
  const totalHours = toNumber(salary.total_hours);
  if (totalHours > 0) return totalHours;
  return roundMoney(toNumber(salary.regular_hours) + toNumber(salary.overtime_hours));
}

function getSalaryDays(salary: Partial<Salary> & Record<string, any>) {
  return toNumber(salary.total_days) || 0;
}

function parseSalaryDetails(salary: Partial<Salary> & Record<string, any>) {
  try {
    return typeof salary.details === 'string' ? JSON.parse(salary.details || '{}') : (salary.details || {});
  } catch {
    return {} as Record<string, any>;
  }
}

function normalizeSalarySourceType(salary: Partial<Salary> & Record<string, any>) {
  const explicitType = String(salary.source_type || salary.sourceType || '').trim().toLowerCase();
  if (explicitType === 'salary_daily' || explicitType === 'daily_salary' || explicitType === 'daily') return 'salary_daily';
  if (explicitType === 'salary_monthly' || explicitType === 'monthly_salary' || explicitType === 'monthly') return 'salary_monthly';
  if (explicitType === 'project_reimbursement' || explicitType === 'reimbursement') return 'project_reimbursement';

  const sourceId = String(salary.source_id || '').trim().toLowerCase();
  if (sourceId.startsWith('salary_daily:')) return 'salary_daily';
  if (sourceId.startsWith('salary_monthly:')) return 'salary_monthly';

  const details = parseSalaryDetails(salary);

  const detailType = String(details.source_type || details.sourceType || '').trim().toLowerCase();
  if (detailType === 'project_reimbursement' || detailType === 'reimbursement') return 'project_reimbursement';
  if (detailType === 'salary_daily' || details.worktime_id || details.work_date || Array.isArray(details.salaryDetails)) return 'salary_daily';
  if (detailType === 'salary_monthly' || details.source_summary_id || details.sourceSummaryId) return 'salary_monthly';

  const remarkText = [salary.pay_remark, salary.remark, salary.source, details.original_remark, details.remark]
    .map((item) => String(item || '').trim())
    .join(' ');
  if (remarkText.includes('项目报销')) return 'project_reimbursement';
  if (remarkText.includes('日结')) return 'salary_daily';
  if (remarkText.includes('月结')) return 'salary_monthly';

  if (salary.settlement_mode === 'daily') return 'salary_daily';
  if (salary.settlement_mode === 'monthly') return 'salary_monthly';
  return '';
}

function getDateOverlapDays(startDate?: string, endDate?: string, monthStart?: string, monthEnd?: string) {
  const normalizedStart = normalizeDate(startDate);
  const normalizedEnd = normalizeDate(endDate);
  const normalizedMonthStart = normalizeDate(monthStart);
  const normalizedMonthEnd = normalizeDate(monthEnd);
  if (!normalizedMonthStart || !normalizedMonthEnd) return 0;

  const finalStart = normalizedStart && normalizedStart > normalizedMonthStart ? normalizedStart : normalizedMonthStart;
  const finalEnd = normalizedEnd && normalizedEnd < normalizedMonthEnd ? normalizedEnd : normalizedMonthEnd;
  if (finalStart > finalEnd) return 0;
  return daysBetweenInclusive(finalStart, finalEnd);
}

function getServiceDaysForRevenue(params: {
  salary: Partial<Salary> & Record<string, any>;
  employee?: (Employee & Record<string, any>) | null;
  monthStart: string;
  monthEnd: string;
  yearMonth: string;
}) {
  const { salary, employee, monthStart, monthEnd, yearMonth } = params;
  const employeeJoinDate = normalizeDate((employee as any)?.join_date);
  const employeeLeaveDate = normalizeDate((employee as any)?.leave_date);
  if (employeeJoinDate || employeeLeaveDate) {
    return getServiceDaysInMonth(yearMonth, employeeJoinDate, employeeLeaveDate);
  }

  const details = parseSalaryDetails(salary);
  const periodDays = getDateOverlapDays(details.period_start, details.period_end, monthStart, monthEnd);
  if (periodDays > 0) return periodDays;

  const workDate = normalizeDate(salary.work_date || salary.pay_date);
  if (workDate && workDate >= monthStart && workDate <= monthEnd) return 1;
  return 0;
}

function getFinanceRowEmployeeKey(salary: Partial<Salary> & Record<string, any>) {
  const employeeId = normalizeText(salary.employee_id);
  if (employeeId) return employeeId;
  const userId = normalizeText((salary as any).user_id);
  if (userId) return `user:${userId}`;
  const details = parseSalaryDetails(salary);
  const reimbursementUserId = normalizeText(details.reimbursement_to_user_id);
  if (reimbursementUserId) return `reimbursement-user:${reimbursementUserId}`;
  return normalizeText(salary.source_id || salary._id);
}

function resolveConfigForJob(configMap: Map<string, FinanceBillingConfig[]>, jobMap: Map<string, Job & Record<string, any>>, jobId: string, targetDate: string) {
  const configs = configMap.get(jobId) || [];
  const active = configs.find((item) => isConfigActive(item, targetDate));
  if (active) return active;
  const job = jobMap.get(jobId);
  return job ? buildDefaultBillingConfig(job) : null;
}

function createEmptyMonthlyRow(params: {
  companyId: string;
  companyName?: string;
  jobId?: string;
  jobName?: string;
  year: number;
  month: number;
  config?: FinanceBillingConfig | null;
  status?: 'generated' | 'missing_config';
}) {
  const yearMonth = buildYearMonth(params.year, params.month);
  const config = params.config || null;
  const billingMode: BillingMode = config?.billing_mode || 'hourly_included';
  const salaryCostBearingMode: string = config?.salary_cost_bearing_mode || 'platform_cost';

  return {
    company_id: params.companyId,
    company_name: params.companyName || '',
    job_id: params.jobId || 'unknown',
    job_name: params.jobName || '未识别岗位',
    year: params.year,
    month: params.month,
    year_month: yearMonth,
    billing_mode: billingMode,
    salary_cost_bearing_mode: salaryCostBearingMode,
    billable_hours: 0,
    billable_headcount: 0,
    service_days: 0,
    month_days: getDaysInMonth(params.year, params.month),
    revenue_amount: 0,
    salary_cost_amount: 0,
    advance_cost_amount: 0,
    bonus_cost_amount: 0,
    reimbursement_cost_amount: 0,
    other_cost_amount: 0,
    gross_profit: 0,
    net_profit: 0,
    source_config_id: config?._id || config?.id,
    status: params.status || (config ? 'generated' : 'missing_config'),
    details: serializeDetails({
      billing_config: config || null,
      salary_ids: [],
      advance_ids: [],
      bonus_ids: [],
      reimbursement_ids: [],
      revenue_breakdown: [],
      anomalies: config ? [] : ['missing_billing_config']
    }),
    calculated_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    _employeeSet: new Set<string>(),
    _serviceDayEmployeeSet: new Set<string>()
  } as FinanceMonthlyResult & { _employeeSet: Set<string>; _serviceDayEmployeeSet: Set<string> };
}

function appendDetailId(row: any, key: string, value?: string) {
  if (!value) return;
  const details = JSON.parse(String(row.details || '{}'));
  const current = Array.isArray(details[key]) ? details[key] : [];
  if (!current.includes(value)) current.push(value);
  details[key] = current;
  row.details = serializeDetails(details);
}

async function syncMonthlyResults(db: any, rows: Array<FinanceMonthlyResult & Record<string, any>>, params: { year: number; month: number; company_id?: string }) {
  try {
    const existing = await fetchAllQueryDocs(
      db.collection('finance_monthly_results').where({
        year: params.year,
        month: params.month,
        ...(params.company_id ? { company_id: params.company_id } : {})
      })
    );

    for (const item of existing) {
      const id = normalizeText(item._id || item.id);
      if (!id) continue;
      try {
        await db.collection('finance_monthly_results').doc(id).remove();
      } catch (err) {
        console.warn('[financeApi] 删除旧财务结果失败', (err as any)?.message || err);
      }
    }

    for (const row of rows) {
      const { _employeeSet, _serviceDayEmployeeSet, ...payload } = row;
      await db.collection('finance_monthly_results').add({
        ...payload,
        calculated_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      });
    }
  } catch (err) {
    console.warn('[financeApi] 同步 finance_monthly_results 失败', (err as any)?.message || err);
  }
}

async function calculateMonthlyResults(params: { year: number; month: number; company_id?: string }) {
  const db = await getDatabase();
  const { start, end, yearMonth } = getMonthRange(params.year, params.month);
  const jobs = (await fetchAllQueryDocs(
    params.company_id
      ? db.collection('jobs').where({ company_id: params.company_id })
      : db.collection('jobs')
  )) as Array<Job & Record<string, any>>;
  const billingConfigs = (await fetchAllQueryDocs(
    params.company_id
      ? db.collection('finance_billing_configs').where({ company_id: params.company_id })
      : db.collection('finance_billing_configs')
  )) as Array<FinanceBillingConfig & Record<string, any>>;
  const salaries = (await fetchAllQueryDocs(
    db.collection('salaries').where({
      year: params.year,
      month: params.month,
      ...(params.company_id ? { company_id: params.company_id } : {})
    })
  )) as Array<Salary & Record<string, any>>;
  const normalizedSalaries = salaries
    .filter((item) => ['calculated', 'approved', 'paid'].includes(String(item.status || '')))
    .map((item) => ({ ...item, source_type: normalizeSalarySourceType(item) }));
  const payrollSalaries = normalizedSalaries.filter((item) => item.source_type === 'salary_daily' || item.source_type === 'salary_monthly');
  const reimbursementSalaries = normalizedSalaries.filter((item) => item.source_type === 'project_reimbursement');

  const employeeIds = [
    ...payrollSalaries.map((item) => normalizeText(item.employee_id)),
    ...reimbursementSalaries.map((item) => normalizeText(item.employee_id))
  ].filter(Boolean);
  const employeeMap = await getEmployeesByIds(db, employeeIds);
  const jobMap = new Map(jobs.map((item) => [normalizeText(item._id || (item as any).id), item]));
  const configMap = new Map<string, FinanceBillingConfig[]>();
  billingConfigs.forEach((item) => {
    const jobId = normalizeText(item.job_id);
    if (!jobId) return;
    const current = configMap.get(jobId) || [];
    current.push({
      ...item,
      _id: normalizeText(item._id || item.id),
      company_id: normalizeText(item.company_id),
      job_id: jobId,
      billing_mode: item.billing_mode || 'hourly_included',
      salary_cost_bearing_mode: item.salary_cost_bearing_mode || 'platform_cost',
      service_fee_monthly: toNumber(item.service_fee_monthly),
      bill_hours_rule: item.bill_hours_rule || 'actual_hours',
      status: item.status || 'active'
    });
    current.sort((left, right) => String(right.effective_from || '').localeCompare(String(left.effective_from || '')));
    configMap.set(jobId, current);
  });

  const rowMap = new Map<string, FinanceMonthlyResult & Record<string, any>>();
  const getRow = (companyId: string, companyName: string, jobId: string, jobName: string, config: FinanceBillingConfig | null) => {
    const key = `${companyId}__${jobId || 'unknown'}`;
    if (!rowMap.has(key)) {
      rowMap.set(key, createEmptyMonthlyRow({
        companyId,
        companyName,
        jobId,
        jobName,
        year: params.year,
        month: params.month,
        config,
        status: config ? 'generated' : 'missing_config'
      }));
    }
    return rowMap.get(key)!;
  };

  const applyRevenueFromSalary = (params: {
    salary: Partial<Salary> & Record<string, any>;
    employee?: (Employee & Record<string, any>) | null;
    row: FinanceMonthlyResult & Record<string, any>;
    config: FinanceBillingConfig | null;
  }) => {
    const { salary, employee, row, config } = params;
    const salaryHours = getSalaryHours(salary);
    const salaryDays = getSalaryDays(salary);
    const monthDays = getDaysInMonth(params.row.year, params.row.month);

    let billableHours = salaryHours;
    if (config?.bill_hours_rule === 'fixed_daily_hours') {
      const fixedHours = toNumber(config.fixed_bill_hours) || toNumber(jobMap.get(normalizeText(salary.job_id || employee?.job_id || ''))?.bill_hours);
      if (fixedHours > 0 && salaryDays > 0) {
        billableHours = roundMoney(fixedHours * salaryDays);
      }
    }

    const employeeKey = getFinanceRowEmployeeKey(salary);
    const alreadyCountedServiceDays = employeeKey ? row._serviceDayEmployeeSet?.has(employeeKey) : false;
    const serviceDays = alreadyCountedServiceDays
      ? 0
      : getServiceDaysForRevenue({ salary, employee, monthStart: start, monthEnd: end, yearMonth });

    let revenueAmount = 0;
    if (config?.billing_mode === 'service_fee_monthly') {
      revenueAmount = monthDays > 0
        ? roundMoney((serviceDays / monthDays) * toNumber(config.service_fee_monthly))
        : 0;
    } else if (config?.billing_mode === 'service_fee_hourly') {
      revenueAmount = roundMoney(billableHours * toNumber(config.service_fee_hourly));
    } else if (config?.billing_mode === 'hourly_included') {
      revenueAmount = roundMoney(billableHours * toNumber(config.client_hourly_rate));
    }

    row.billable_hours = roundMoney(row.billable_hours + billableHours);
    row.service_days = roundMoney(row.service_days + serviceDays);
    row.month_days = monthDays;
    row.revenue_amount = roundMoney(row.revenue_amount + revenueAmount);
    if (employeeKey) {
      row._employeeSet.add(employeeKey);
      if (serviceDays > 0) row._serviceDayEmployeeSet.add(employeeKey);
    }

    if (revenueAmount > 0) {
      try {
        const details = JSON.parse(String(row.details || '{}'));
        const current = Array.isArray(details.revenue_breakdown) ? details.revenue_breakdown : [];
        current.push({
          employee_id: normalizeText(salary.employee_id),
          employee_name: employee?.name || salary.employee_name || '',
          source_type: normalizeSalarySourceType(salary),
          billing_mode: config?.billing_mode || 'hourly_included',
          billable_hours: billableHours,
          service_days: serviceDays,
          month_days: monthDays,
          client_hourly_rate: toNumber(config?.client_hourly_rate),
          service_fee_monthly: toNumber(config?.service_fee_monthly),
          service_fee_hourly: toNumber(config?.service_fee_hourly),
          revenue_amount: revenueAmount
        });
        details.revenue_breakdown = current;
        row.details = serializeDetails(details);
      } catch {
        // ignore detail serialization errors
      }
    }
  };

  payrollSalaries.forEach((salary) => {
    const employee = employeeMap.get(normalizeText(salary.employee_id));
    const companyId = normalizeText(salary.company_id || employee?.company_id);
    if (!companyId) return;
    const companyName = salary.company_name || employee?.company_name || '';
    const jobId = normalizeText(salary.job_id || employee?.job_id);
    const jobName = salary.job_name || employee?.job_name || jobMap.get(jobId)?.position || '未识别岗位';
    const config = resolveConfigForJob(configMap, jobMap, jobId, end);
    const row = getRow(companyId, companyName, jobId || 'unknown', jobName, config);
    applyRevenueFromSalary({ salary, employee, row, config });
    if (config?.salary_cost_bearing_mode !== 'company_cost') {
      row.salary_cost_amount = roundMoney(row.salary_cost_amount + toNumber(salary.net_pay || salary.total_amount));
    }
    appendDetailId(row, 'salary_ids', normalizeText(salary._id));
  });

  reimbursementSalaries.forEach((record) => {
    const employee = employeeMap.get(normalizeText(record.employee_id));
    const companyId = normalizeText(record.company_id || employee?.company_id);
    if (!companyId) return;
    const companyName = record.company_name || employee?.company_name || '';
    const jobId = normalizeText(record.job_id || employee?.job_id);
    const jobName = record.job_name || employee?.job_name || jobMap.get(jobId)?.position || '未识别岗位';
    const config = resolveConfigForJob(configMap, jobMap, jobId, end);
    const row = getRow(companyId, companyName, jobId || 'unknown', jobName, config);
    applyRevenueFromSalary({ salary: record, employee, row, config });
    row.reimbursement_cost_amount = roundMoney(row.reimbursement_cost_amount + toNumber(record.net_pay || record.total_amount || record.reimbursement_amount));
    appendDetailId(row, 'reimbursement_ids', normalizeText(record._id));
  });

  const rows = Array.from(rowMap.values()).map((row) => {
    row.billable_headcount = row._employeeSet.size;
    row.advance_cost_amount = 0;
    row.bonus_cost_amount = 0;
    row.other_cost_amount = roundMoney(row.reimbursement_cost_amount);
    row.gross_profit = roundMoney(row.revenue_amount - row.salary_cost_amount);
    row.net_profit = roundMoney(row.revenue_amount - row.salary_cost_amount - row.other_cost_amount);
    row.updated_at = new Date().toISOString();
    return row;
  });

  await syncMonthlyResults(db, rows, params);
  return rows;
}

function aggregateRowsByCompany(rows: FinanceMonthlyResult[]) {
  const companyMap = new Map<string, any>();
  rows.forEach((item) => {
    const key = normalizeText(item.company_id);
    if (!key) return;
    if (!companyMap.has(key)) {
      companyMap.set(key, {
        company_id: item.company_id,
        company_name: item.company_name || item.company_id,
        revenue: 0,
        salary_cost: 0,
        other_cost: 0,
        profit: 0,
        billable_hours: 0,
        job_count: 0
      });
    }
    const row = companyMap.get(key);
    row.revenue += toNumber(item.revenue_amount);
    row.salary_cost += toNumber(item.salary_cost_amount);
    row.other_cost += toNumber(item.other_cost_amount);
    row.profit += toNumber(item.net_profit);
    row.billable_hours += toNumber(item.billable_hours);
    row.job_count += 1;
  });

  return Array.from(companyMap.values())
    .map((item) => ({
      ...item,
      revenue: roundMoney(item.revenue),
      salary_cost: roundMoney(item.salary_cost),
      other_cost: roundMoney(item.other_cost),
      profit: roundMoney(item.profit),
      billable_hours: roundMoney(item.billable_hours)
    }))
    .sort((left, right) => right.revenue - left.revenue);
}

export const financeApi = {
  buildDefaultBillingConfig,

  async listBillingConfigs(params?: { company_id?: string; job_id?: string; status?: string }) {
    const db = await getDatabase();
    const whereData: Record<string, any> = {};
    if (params?.company_id) whereData.company_id = params.company_id;
    if (params?.job_id) whereData.job_id = params.job_id;
    if (params?.status) whereData.status = params.status;
    let query = db.collection('finance_billing_configs');
    if (Object.keys(whereData).length) query = query.where(whereData);
    const rows = await fetchAllQueryDocs(query);
    return rows.map((item: any) => ({
      ...item,
      _id: normalizeText(item._id || item.id),
      id: normalizeText(item._id || item.id)
    })) as FinanceBillingConfig[];
  },

  async saveBillingConfig(payload: FinanceBillingConfig) {
    const db = await getDatabase();
    const now = new Date().toISOString();
    const { _id, id, ...restPayload } = payload;
    const billingMode = normalizeBillingMode(restPayload.billing_mode);
    const normalizedPayload = {
      ...restPayload,
      company_id: normalizeText(restPayload.company_id),
      job_id: normalizeText(restPayload.job_id),
      effective_from: normalizeDate(restPayload.effective_from) || now.slice(0, 10),
      effective_to: normalizeDate(restPayload.effective_to),
      status: restPayload.status || 'active',
      billing_mode: billingMode,
      salary_cost_bearing_mode: restPayload.salary_cost_bearing_mode || 'platform_cost',
      client_hourly_rate: billingMode === 'hourly_included' ? toNumber(restPayload.client_hourly_rate) : 0,
      service_fee_monthly: billingMode === 'service_fee_monthly' ? toNumber(restPayload.service_fee_monthly) : 0,
      service_fee_hourly: billingMode === 'service_fee_hourly' ? toNumber(restPayload.service_fee_hourly) : 0,
      bill_hours_rule: restPayload.bill_hours_rule || 'actual_hours',
      updated_at: now
    };

    const existingId = normalizeText(_id || id);
    if (existingId) {
      await db.collection('finance_billing_configs').doc(existingId).update(normalizedPayload);
      return { ...normalizedPayload, _id: existingId, id: existingId } as FinanceBillingConfig;
    }

    const existed = await fetchAllQueryDocs(
      db.collection('finance_billing_configs').where({
        company_id: normalizedPayload.company_id,
        job_id: normalizedPayload.job_id,
        effective_from: normalizedPayload.effective_from
      })
    );

    if (existed.length > 0) {
      const existedId = normalizeText(existed[0]._id || existed[0].id);
      await db.collection('finance_billing_configs').doc(existedId).update({
        ...normalizedPayload,
        created_at: existed[0].created_at || now
      });
      return { ...normalizedPayload, _id: existedId, id: existedId } as FinanceBillingConfig;
    }

    const result = await db.collection('finance_billing_configs').add({
      ...normalizedPayload,
      created_at: now
    });
    const finalId = normalizeText((result as any)?.id || (result as any)?._id);
    return { ...normalizedPayload, _id: finalId, id: finalId } as FinanceBillingConfig;
  },

  async calculateMonthlyResults(params: { year: number; month: number; company_id?: string }) {
    return calculateMonthlyResults(params);
  },

  async getFinanceSummary(params: { start_date?: string; end_date?: string; company_id?: string }) {
    const startDate = normalizeDate(params.start_date);
    const endDate = normalizeDate(params.end_date);
    const ranges = startDate && endDate
      ? enumerateYearMonths(startDate, endDate)
      : (() => {
          const now = new Date();
          return [{ year: now.getFullYear(), month: now.getMonth() + 1, yearMonth: buildYearMonth(now.getFullYear(), now.getMonth() + 1) }];
        })();

    const allRows: FinanceMonthlyResult[] = [];
    for (const range of ranges) {
      const rows = await calculateMonthlyResults({ year: range.year, month: range.month, company_id: params.company_id });
      allRows.push(...rows.map((item) => ({ ...item })));
    }

    const companyRows = aggregateRowsByCompany(allRows);
    const totals = companyRows.reduce((acc, item) => {
      acc.revenue += toNumber(item.revenue);
      acc.salary_cost += toNumber(item.salary_cost);
      acc.other_cost += toNumber(item.other_cost);
      acc.profit += toNumber(item.profit);
      return acc;
    }, { revenue: 0, salary_cost: 0, other_cost: 0, profit: 0 });

    return {
      summary: {
        totalRevenue: roundMoney(totals.revenue),
        totalSalaryCost: roundMoney(totals.salary_cost),
        totalOtherCost: roundMoney(totals.other_cost),
        totalProfit: roundMoney(totals.profit)
      },
      list: companyRows,
      details: allRows
    };
  }
};