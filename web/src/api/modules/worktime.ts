/**
 * 工时模块 API
 * - 日结工时：worktimes
 * - 月结汇总：worktime_monthly_summaries
 */

import { callFunction, getDatabase } from '../cloud';
import type { DailySalarySummary, Employee, WorktimeMonthlySummary, WorktimeRecord } from '../types';
import { normalizeDate, roundMoney } from '@/utils/db-helper';
import { formatDate } from '@/utils/format';

function getTodayStr() {
  return normalizeDate(new Date().toISOString());
}

function getEmploymentStatus(leaveDate?: string): 'active' | 'pending_resign' | 'resigned' {
  const normalized = normalizeDate(leaveDate);
  if (!normalized) return 'active';
  const today = getTodayStr();
  if (normalized < today) return 'resigned';
  return 'pending_resign';
}

function pickLatestRelation(current: any, next: any) {
  if (!current) return next;
  const currentTime = normalizeDate(current.updated_at || current.created_at);
  const nextTime = normalizeDate(next.updated_at || next.created_at);
  return nextTime >= currentTime ? next : current;
}

function isDateWithinRelation(targetDate: string, relation: any) {
  if (!targetDate || !relation) return false;
  const joinDate = normalizeDate(relation.join_date);
  const leaveDate = normalizeDate(relation.leave_date);
  if (joinDate && joinDate > targetDate) return false;
  if (leaveDate && leaveDate < targetDate) return false;
  return true;
}

function getRowReferenceDate(item: any) {
  const workDate = normalizeDate(item?.work_date);
  if (workDate) return workDate;
  const yearMonth = String(item?.year_month || '').match(/^\d{4}-\d{2}/)?.[0] || '';
  if (yearMonth) return getMonthEnd(yearMonth);
  return getTodayStr();
}

function pickRelationForRow(relations: any[] = [], item: any) {
  const referenceDate = getRowReferenceDate(item);
  const matched = relations
    .filter((relation) => isDateWithinRelation(referenceDate, relation))
    .reduce((current, next) => pickLatestRelation(current, next), null);
  if (matched) return matched;
  return relations.reduce((current, next) => pickLatestRelation(current, next), null);
}

function isRelationActive(item: any, today = getTodayStr()) {
  if (!item?.employee_id || !item?.company_id) return false;
  const status = String(item.status || '').trim().toLowerCase();
  if (['left', 'resigned', 'inactive', 'disabled', 'archived'].includes(status)) return false;
  return isDateWithinRelation(today, item);
}

function getMonthEnd(yearMonth: string) {
  const [year, month] = yearMonth.split('-').map(Number);
  return `${yearMonth}-${String(new Date(year, month, 0).getDate()).padStart(2, '0')}`;
}

async function fetchAll(query: any, batchSize = 100) {
  const list: any[] = [];
  let skip = 0;

  while (true) {
    const res = await query.skip(skip).limit(batchSize).get();
    const rows = res.data || [];
    list.push(...rows);
    if (rows.length < batchSize) break;
    skip += rows.length;
  }

  return list;
}

async function fetchByFieldIn(db: any, collectionName: string, field: string, values: string[], batchSize = 100) {
  const uniqueValues = [...new Set((values || []).filter(Boolean))];
  if (!uniqueValues.length) return [];

  const result: any[] = [];
  for (let i = 0; i < uniqueValues.length; i += batchSize) {
    const chunk = uniqueValues.slice(i, i + batchSize);
    const rows = await fetchAll(
      db.collection(collectionName).where({ [field]: db.command.in(chunk) }),
      batchSize
    );
    result.push(...rows);
  }
  return result;
}

async function loadMaps(db: any, rows: any[]) {
  const employeeIds = [...new Set(rows.map((item: any) => item.employee_id).filter(Boolean))];
  const companyIds = [...new Set(rows.map((item: any) => item.company_id).filter(Boolean))];

  let employeeList: Employee[] = [];
  let relationList: any[] = [];
  let companyList: any[] = [];

  if (employeeIds.length) {
    const [employees, relations] = await Promise.all([
      fetchByFieldIn(db, 'employees', '_id', employeeIds),
      fetchByFieldIn(db, 'employee_companies', 'employee_id', employeeIds)
    ]);
    employeeList = employees || [];
    relationList = relations || [];
  }

  if (companyIds.length) {
    companyList = await fetchByFieldIn(db, 'companies', '_id', companyIds);
  }

  const employeeMap = new Map(employeeList.map((item: any) => [item._id || item.id, item]));
  const companyMap = new Map(companyList.map((item: any) => [item._id || item.id, item.name]));
  const relationMap = new Map<string, any[]>();
  relationList.forEach((item: any) => {
    const key = `${item.employee_id}__${item.company_id || ''}`;
    relationMap.set(key, [...(relationMap.get(key) || []), item]);
  });

  return { employeeMap, companyMap, relationMap };
}

function enrichRow(item: any, employeeMap: Map<string, any>, companyMap: Map<string, any>, relationMap: Map<string, any[]>) {
  const employee = employeeMap.get(item.employee_id) || {};
  const relation = pickRelationForRow(relationMap.get(`${item.employee_id}__${item.company_id || ''}`) || [], item) || {};
  const company_name = item.company_name || relation.company_name || companyMap.get(item.company_id) || employee.company_name || '';
  const leave_date = relation.leave_date || '';
  const record_settlement_mode = item.settlement_mode || '';
  const current_settlement_mode = normalizeSettlementMode(relation.settlement_mode);
  // 日结/押金等操作以 employee_companies 关系为准；工时记录快照只作为展示兼容字段保留。
  const settlement_mode = current_settlement_mode;
  const hourly_rate = item.hourly_rate || relation.hourly_rate || employee.hourly_rate || 0;
  return {
    ...item,
    job_id: item.job_id || relation.job_id || employee.job_id || '',
    rate_plan_id: item.rate_plan_id || relation.rate_plan_id || employee.rate_plan_id || '',
    join_date: relation.join_date || '',
    leave_date,
    employee_no: employee.employee_no || '-',
    employee_name: employee.name || '-',
    company_name,
    job_name: item.job_name || relation.job_name || employee.job_name || '-',
    employment_status: getEmploymentStatus(leave_date),
    record_settlement_mode,
    current_settlement_mode,
    settlement_mode,
    hourly_rate
  };
}

function normalizeSettlementMode(value: any) {
  const mode = String(value || '').trim().toLowerCase();
  if (mode === '日结') return 'daily';
  if (mode === '月结') return 'monthly';
  if (mode === 'daily' || mode === 'monthly') return mode;
  return '';
}

function getRelationSettlementMode(item: any) {
  return normalizeSettlementMode(item?.current_settlement_mode);
}

/**
 * 创建通用列表查询 API，消除 fetchAll + loadMaps + enrichRow + 内存分页的重复模板代码
 * @param collectionName 集合名
 * @param buildFilter 构建查询条件 (params, db) => filter
 * @param processList 后处理列表：转换、过滤等 (list, params) => list
 * @param options 可选配置
 */
function createListApi(
  collectionName: string,
  buildFilter: (params: any, db: any) => any,
  processList: (list: any[], params: any) => any[],
  options?: {
    orderBy?: string;
    orderDir?: string;
    defaultPageSize?: number;
    errorLabel?: string;
  }
) {
  return async (params: any) => {
    try {
      const db = await getDatabase();
      let query = db.collection(collectionName);
      const filter = buildFilter(params, db);
      if (Object.keys(filter).length) {
        query = query.where(filter);
      }
      const orderField = options?.orderBy || 'created_at';
      const orderDir = options?.orderDir || 'desc';
      const rows = await fetchAll(query.orderBy(orderField, orderDir as any));
      const { employeeMap, companyMap, relationMap } = await loadMaps(db, rows);
      let list = rows.map((item: any) => enrichRow(item, employeeMap, companyMap, relationMap));
      list = processList(list, params);
      const pageSize = params?.pageSize || options?.defaultPageSize || 50;
      const page = params?.page || 1;
      const total = list.length;
      const skip = (page - 1) * pageSize;
      return { list: list.slice(skip, skip + pageSize), total, page, pageSize };
    } catch (err: any) {
      const label = options?.errorLabel || 'worktimeApi';
      console.error(`[${label}] 失败:`, err);
      return { list: [], total: 0, page: 1, pageSize: options?.defaultPageSize || 50 };
    }
  };
}

async function assertDailyWorktimeRecords(db: any, ids: string[]) {
  const recordIds = [...new Set((ids || []).filter(Boolean))];
  if (!recordIds.length) return;

  const rows = await fetchByFieldIn(db, 'worktimes', '_id', recordIds);
  const { employeeMap, companyMap, relationMap } = await loadMaps(db, rows);
  const nonDaily = rows
    .map((item: any) => enrichRow(item, employeeMap, companyMap, relationMap))
    .filter((item: any) => getRelationSettlementMode(item) !== 'daily');

  if (nonDaily.length) {
    throw new Error('所选记录包含月结工时，请在月结工时页审核');
  }
}

export const worktimeApi = {
  getDailyList: createListApi(
    'worktimes',
    (params) => {
      const conditions: Record<string, any> = {};
      if (params?.company_id) conditions.company_id = params.company_id;
      if (params?.status) conditions.status = params.status;
      return conditions;
    },
    (list, params) => {
      list = list
        .map((item: any) => ({
          ...item,
          review_status: item.status,
          total_hours: item.total_hours ?? item.regular_hours ?? 0,
          total_pay: Number(item.regular_pay || 0) + Number(item.overtime_pay || 0)
        }))
        .filter((item: any) => {
          const mode = getRelationSettlementMode(item);
          return mode === 'daily' && !item.is_deposit;
        });
      if (params?.company_id) {
        list = list.filter((item: any) => item.company_id === params.company_id);
      }
      if (params?.month) {
        list = list.filter((item: any) => normalizeDate(item.work_date).startsWith(params.month as string));
      }
      if (params?.start_date) {
        const startDate = normalizeDate(params.start_date);
        list = list.filter((item: any) => normalizeDate(item.work_date) >= startDate);
      }
      if (params?.end_date) {
        const endDate = normalizeDate(params.end_date);
        list = list.filter((item: any) => normalizeDate(item.work_date) <= endDate);
      }
      if (params?.work_date) {
        const workDate = normalizeDate(params.work_date);
        list = list.filter((item: any) => normalizeDate(item.work_date) === workDate);
      }
      if (params?.employee_name) {
        const keyword = params.employee_name.trim().toLowerCase();
        list = list.filter((item: any) =>
          String(item.employee_name || '').toLowerCase().includes(keyword) ||
          String(item.employee_no || '').toLowerCase().includes(keyword)
        );
      }
      return list;
    },
    { orderBy: 'work_date', orderDir: 'desc', errorLabel: 'worktimeApi.getDailyList' }
  ) as (params?: {
    company_id?: string;
    employee_name?: string;
    month?: string;
    start_date?: string;
    end_date?: string;
    work_date?: string;
    status?: string;
    page?: number;
    pageSize?: number;
  }) => Promise<{ list: WorktimeRecord[]; total: number; page: number; pageSize: number }>,


  getMonthlyList: createListApi(
    'worktime_monthly_summaries',
    (params) => {
      const conditions: Record<string, any> = {};
      if (params?.company_id) conditions.company_id = params.company_id;
      if (params?.status) conditions.status = params.status;
      if (params?.month) conditions.year_month = params.month;
      return conditions;
    },
    (list, params) => {
      list = list
        .map((item: any) => ({
          ...item,
          total_hours: Number(item.total_hours || 0),
          total_days: Number(item.total_days || 0),
          night_hours: Number(item.night_hours || 0),
          night_days: Number(item.night_days || 0),
          salary_amount: Number(item.salary_amount || 0),
          hourly_rate: Number(item.hourly_rate || 0)
        }))
        .filter((item: any) => {
          const mode = getRelationSettlementMode(item);
          return mode === 'monthly';
        });
      if (params?.employee_name) {
        const keyword = params.employee_name.trim().toLowerCase();
        list = list.filter((item: any) =>
          String(item.employee_name || '').toLowerCase().includes(keyword) ||
          String(item.employee_no || '').toLowerCase().includes(keyword)
        );
      }
      return list;
    },
    { orderBy: 'year_month', orderDir: 'desc', errorLabel: 'worktimeApi.getMonthlyList' }
  ) as (params?: {
    company_id?: string;
    employee_name?: string;
    month?: string;
    status?: string;
    page?: number;
    pageSize?: number;
  }) => Promise<{ list: WorktimeMonthlySummary[]; total: number; page: number; pageSize: number }>,


  async saveMonthlySummary(data: Partial<WorktimeMonthlySummary>): Promise<WorktimeMonthlySummary> {
    return this.addMonthlySummary({
      employee_id: String(data.employee_id || ''),
      company_id: String(data.company_id || ''),
      year_month: String(data.year_month || ''),
      total_hours: Number(data.total_hours || 0),
      total_days: Number(data.total_days || 0),
      night_hours: Number((data as any).night_hours || 0),
      night_days: Number((data as any).night_days || 0),
      salary_amount: Number((data as any).salary_amount || 0),
      remark: String(data.remark || '')
    }) as unknown as WorktimeMonthlySummary;
  },

  async approveDaily(id: string): Promise<void> {
    await callFunction('worktime', 'batch-approve', { record_ids: [id] });
  },

  async rejectDaily(id: string): Promise<void> {
    await callFunction('worktime', 'batch-reject', { record_ids: [id] });
  },

  async setDeposit(id: string, isDeposit: boolean): Promise<void> {
    const db = await getDatabase();
    await assertDailyWorktimeRecords(db, [id]);
    await db.collection('worktimes').doc(id).update({
      is_deposit: isDeposit,
      deposit_time: isDeposit ? new Date().toISOString() : null,
      updated_at: new Date().toISOString()
    });
  },

  async batchSetDeposit(ids: string[], isDeposit: boolean): Promise<void> {
    const db = await getDatabase();
    await assertDailyWorktimeRecords(db, ids);
    const batch = db.batch();
    const now = new Date().toISOString();
    ids.forEach((id) => {
      batch.collection('worktimes').doc(id).update({
        data: {
          is_deposit: isDeposit,
          deposit_time: isDeposit ? now : null,
          updated_at: now
        }
      });
    });
    await batch.commit();
  },

  async batchApproveDaily(ids: string[]): Promise<void> {
    await callFunction('worktime', 'batch-approve', { record_ids: ids });
  },

  async batchApproveMonthly(ids: string[]): Promise<void> {
    await callFunction('worktime', 'batch-approve-monthly', { record_ids: ids });
  },

  async batchRejectDaily(ids: string[], remark = ''): Promise<void> {
    await callFunction('worktime', 'batch-reject', { record_ids: ids, remark });
  },

  async batchRejectMonthly(ids: string[], remark = ''): Promise<void> {
    await callFunction('worktime', 'batch-reject-monthly', { record_ids: ids, remark });
  },

  getDepositList: createListApi(
    'worktimes',
    () => ({ is_deposit: true }),
    (list, params) => {
      list = list
        .map((item: any) => ({
          ...item,
          review_status: item.status,
          total_hours: item.total_hours ?? item.regular_hours ?? 0,
          total_pay: Number(item.regular_pay || 0) + Number(item.overtime_pay || 0)
        }))
        .filter((item: any) => {
          const mode = getRelationSettlementMode(item);
          return mode === 'daily';
        });
      if (params?.company_id) {
        list = list.filter((item: any) => item.company_id === params.company_id);
      }
      if (params?.start_date) {
        const startDate = normalizeDate(params.start_date);
        list = list.filter((item: any) => normalizeDate(item.work_date) >= startDate);
      }
      if (params?.end_date) {
        const endDate = normalizeDate(params.end_date);
        list = list.filter((item: any) => normalizeDate(item.work_date) <= endDate);
      }
      if (params?.employee_name) {
        const keyword = params.employee_name.trim().toLowerCase();
        list = list.filter((item: any) =>
          String(item.employee_name || '').toLowerCase().includes(keyword) ||
          String(item.employee_no || '').toLowerCase().includes(keyword)
        );
      }
      return list;
    },
    { orderBy: 'deposit_time', orderDir: 'desc', errorLabel: 'worktimeApi.getDepositList' }
  ) as (params?: {
    company_id?: string;
    employee_name?: string;
    start_date?: string;
    end_date?: string;
    page?: number;
    pageSize?: number;
  }) => Promise<{ list: WorktimeRecord[]; total: number; page: number; pageSize: number }>,


  async approveMonthly(id: string): Promise<void> {
    await callFunction('worktime', 'batch-approve-monthly', { record_ids: [id] });
  },

  async rejectMonthly(id: string): Promise<void> {
    await callFunction('worktime', 'batch-reject-monthly', { record_ids: [id] });
  },

  async getCompanyEmployees(company_id?: string, settlement_mode?: 'daily' | 'monthly') {
    const db = await getDatabase();
    const [employeeRows, relationRows] = await Promise.all([
      fetchAll(db.collection('employees').orderBy('created_at', 'desc')),
      fetchAll(db.collection('employee_companies').orderBy('updated_at', 'desc'))
    ]);
    const employeeMap = new Map(employeeRows.map((item: any) => [item._id || item.id, item]));
    const today = getTodayStr();
    const relationMap = new Map<string, any>();

    relationRows.forEach((item: any) => {
      if (!isRelationActive(item, today)) return;
      if (company_id && item.company_id !== company_id) return;
      const employee = employeeMap.get(item.employee_id);
      if (!employee) return;
      const relationSettlementMode = normalizeSettlementMode(item.settlement_mode);
      if (settlement_mode && relationSettlementMode !== settlement_mode) return;
      relationMap.set(`${item.employee_id}__${item.company_id || ''}`, pickLatestRelation(relationMap.get(`${item.employee_id}__${item.company_id || ''}`), item));
    });

    return [...relationMap.values()]
      .map((relation: any) => {
        const employee = employeeMap.get(relation.employee_id) || {};
        return {
          ...employee,
          relation_id: relation._id || relation.id,
          employee_id: relation.employee_id,
          company_id: relation.company_id || employee.company_id,
          company_name: relation.company_name || employee.company_name || '',
          job_id: relation.job_id || employee.job_id || '',
          job_name: relation.job_name || employee.job_name || '',
          hourly_rate: relation.hourly_rate || employee.hourly_rate || 0,
          join_date: relation.join_date || '',
          leave_date: relation.leave_date || '',
          settlement_mode: normalizeSettlementMode(relation.settlement_mode)
        };
      })
      .sort((a: any, b: any) => {
        const aTime = new Date(a.updated_at || a.created_at || a.join_date || 0).getTime() || 0;
        const bTime = new Date(b.updated_at || b.created_at || b.join_date || 0).getTime() || 0;
        return bTime - aTime;
      });
  },

  async getDailySalaryPreview(params: {
    company_id?: string;
    work_date: string;
  }): Promise<{ list: WorktimeRecord[]; total: number }> {
    const targetDate = normalizeDate(params.work_date);
    const rows = await this.getComputedDailySalaryRows({
      company_id: params.company_id,
      month: targetDate.slice(0, 7)
    });
    const list = rows.filter((item: any) => normalizeDate(item.work_date) === targetDate);
    return { list, total: list.length };
  },

  async getComputedDailySalaryRows(params: {
    company_id?: string;
    month: string;
  }): Promise<WorktimeRecord[]> {
    const yearMonth = params.month;
    const baseResult = await this.getDailyList({
      company_id: params.company_id,
      month: yearMonth,
      status: 'approved',
      page: 1,
      pageSize: 5000
    });

    const db = await getDatabase();
    const jobIds = [...new Set((baseResult.list || []).map((item: any) => item.job_id).filter(Boolean))];
    const directPlanIds = [...new Set((baseResult.list || []).map((item: any) => item.rate_plan_id).filter(Boolean))];

    const [jobsRes, directPlansRes] = await Promise.all([
      jobIds.length ? db.collection('jobs').where({ _id: db.command.in(jobIds) }).get() : Promise.resolve({ data: [] }),
      directPlanIds.length ? db.collection('rate_plans').where({ _id: db.command.in(directPlanIds) }).get() : Promise.resolve({ data: [] })
    ]);

    const jobMap = new Map((jobsRes.data || []).map((item: any) => [item._id || item.id, item]));
    const extraPlanIds = [...new Set((jobsRes.data || []).map((item: any) => item.rate_plan_id).filter(Boolean).filter((id: string) => !directPlanIds.includes(id)))];
    const extraPlansRes = extraPlanIds.length
      ? await db.collection('rate_plans').where({ _id: db.command.in(extraPlanIds) }).get()
      : { data: [] };
    const planMap = new Map([...(directPlansRes.data || []), ...(extraPlansRes.data || [])].map((item: any) => [item._id || item.id, item]));

    return (baseResult.list || []).map((item: any) => {
        const job = jobMap.get(item.job_id || '');
        const plan = planMap.get(item.rate_plan_id || '') || planMap.get(job?.rate_plan_id || '');
        const hourlyRate = Number(plan?.hourly_rate ?? item.hourly_rate ?? job?.hourly_rate ?? 0);
        const basePay = roundMoney(Number(item.total_hours || 0) * hourlyRate);
        const nightAllowance = item.shift === 'night'
          ? roundMoney(Number(item.total_hours || 0) * Number(plan?.night_hourly_rate || 0) + Number(plan?.night_daily_rate || 0))
          : 0;
        return {
          ...item,
          hourly_rate: hourlyRate,
          base_pay: basePay,
          night_allowance: nightAllowance,
          insurance_deduct: 0,
          insurance_deduct_detail: JSON.stringify({ mode: 'v2_cloud_only', start_month: '2026-04' }),
          total_pay: roundMoney(basePay + nightAllowance)
        };
      });
  },

  async getDailySalaryMonthlySummary(params: {
    company_id?: string;
    month: string;
  }): Promise<{ list: DailySalarySummary[]; total: number }> {
    const yearMonth = params.month;
    const rows = await this.getComputedDailySalaryRows({
      company_id: params.company_id,
      month: yearMonth
    });

    const db = await getDatabase();
    const [year, month] = yearMonth.split('-').map(Number);
    const salaryRes = await db.collection('salaries')
      .where({
        settlement_mode: 'daily',
        year,
        month,
        ...(params.company_id ? { company_id: params.company_id } : {})
      })
      .get();

    const salaryMap = new Map<string, any>();
    (salaryRes.data || []).forEach((item: any) => {
      const key = `${item.employee_id}__${item.company_id || ''}`;
      salaryMap.set(key, item);
    });

    const grouped = new Map<string, DailySalarySummary>();
    rows.forEach((item: any) => {
      const key = `${item.employee_id}__${item.company_id || ''}`;
      const current = grouped.get(key) || {
        employee_id: item.employee_id,
        employee_no: item.employee_no,
        employee_name: item.employee_name,
        company_id: item.company_id,
        company_name: item.company_name,
        job_name: item.job_name,
        year_month: yearMonth,
        work_days: 0,
        total_hours: 0,
        gross_amount: 0,
        paid_amount: 0,
        pending_amount: 0,
        salary_status: ''
      };
      current.work_days += 1;
      current.total_hours = roundMoney(current.total_hours + Number(item.total_hours || 0));
      current.gross_amount = roundMoney(current.gross_amount + Number(item.total_pay || 0));
      grouped.set(key, current);
    });

    const list = [...grouped.values()].map((item) => {
      const salary = salaryMap.get(`${item.employee_id}__${item.company_id || ''}`);
      const salaryStatus = salary?.status || '';
      const paidAmount = salaryStatus === 'paid' ? item.gross_amount : 0;
      const pendingAmount = salaryStatus === 'paid' ? 0 : item.gross_amount;
      return {
        ...item,
        paid_amount: roundMoney(paidAmount),
        pending_amount: roundMoney(pendingAmount),
        salary_status: salaryStatus
      };
    });

    return { list, total: list.length };
  },

  // 兼容旧调用
  async getList(params?: any) {
    return this.getDailyList(params);
  },

  async approve(id: string) {
    return this.approveDaily(id);
  },

  async reject(id: string) {
    return this.rejectDaily(id);
  },

  // 查询未发薪的日结工时明细（用于薪资计算）
  getUnpaidDailyWorktimes: createListApi(
    'worktimes',
    (params, db) => {
      const command = db.command;
      const endDate = params.end_date || (() => {
        const d = new Date();
        d.setDate(d.getDate() - 1);
        return formatDate(d, 'YYYY-MM-DD');
      })();
      return {
        status: 'approved',
        work_date: command.lte(endDate)
      };
    },
    (list, params) => {
      list = list
        .map((item: any) => {
          const isPaid = item.salary_status === 'paid';
          const hours = item.total_hours ?? item.regular_hours ?? 0;
          const rate = Number(item.hourly_rate) || 0;
          console.log('[getUnpaidDailyWorktimes] item:', {
            id: item._id,
            total_hours: hours,
            hourly_rate: rate,
            employee_id: item.employee_id
          });
          return {
            ...item,
            worktime_id: item._id,
            review_status: item.status,
            total_hours: hours,
            hourly_rate: rate,
            salary_status: item.salary_status || 'pending',
            is_paid: isPaid
          };
        })
        .filter((item: any) => {
          const mode = getRelationSettlementMode(item);
          return mode === 'daily' && !item.is_paid && !item.is_deposit;
        });
      if (params.company_id) {
        list = list.filter((item: any) => item.company_id === params.company_id);
      }
      if (params.start_date) {
        list = list.filter((item: any) => normalizeDate(item.work_date) >= params.start_date);
      }
      return list;
    },
    { orderBy: 'work_date', orderDir: 'desc', defaultPageSize: 20, errorLabel: 'worktimeApi.getUnpaidDailyWorktimes' }
  ) as (params: {
    company_id?: string;
    start_date?: string;
    end_date?: string;
    page?: number;
    pageSize?: number;
  }) => Promise<{ list: WorktimeRecord[]; total: number; page: number; pageSize: number }>,


  // 批量更新工时为已发薪状态
  async batchMarkAsPaid(ids: string[], payDate: string): Promise<void> {
    try {
      const db = await getDatabase();
      const batch = db.batch();
      ids.forEach((id: string) => {
        batch.collection('worktimes').doc(id).update({
          data: {
            salary_status: 'paid',
            pay_date: payDate
          }
        });
      });
      await batch.commit();
    } catch (err: any) {
      console.error('[worktimeApi.batchMarkAsPaid] 失败:', err);
      throw new Error('批量更新失败: ' + err.message);
    }
  },

  // HR 手工新增日结工时
  async submitDaily(data: {
    employee_id: string;
    company_id: string;
    work_date: string;
    shift?: 'day' | 'night';
    regular_hours: number;
    overtime_hours?: number;
  }) {
    return callFunction('worktime', 'submit', data);
  },

  // HR 新增 / 覆盖月结工时
  async addMonthlySummary(data: {
    employee_id: string;
    company_id: string;
    year_month: string;
    total_hours: number;
    total_days: number;
    night_hours?: number;
    night_days?: number;
    salary_amount?: number;
    remark?: string;
    source?: 'import' | 'manual';
  }) {
    return callFunction('worktime', 'add-monthly-summary', data);
  },

  async batchAddMonthlySummaries(data: {
    records: Array<{
      employee_id: string;
      employee_no?: string;
      employee_name?: string;
      company_id: string;
      year_month: string;
      total_hours: number;
      total_days: number;
      night_hours?: number;
      night_days?: number;
      salary_amount?: number;
      remark?: string;
      source?: 'import' | 'manual';
    }>;
  }): Promise<{ total: number; imported: number; failed: number; failedItems: any[] }> {
    const res = await callFunction('worktime', 'batch-add-monthly-summaries', data);
    return {
      total: Number(res?.total || 0),
      imported: Number(res?.imported || 0),
      failed: Number(res?.failed || 0),
      failedItems: Array.isArray(res?.failedItems) ? res.failedItems : []
    };
  },

  getYesterday(): string {
    const date = new Date();
    date.setDate(date.getDate() - 1);
    return formatDate(date, 'YYYY-MM-DD');
  }
};
