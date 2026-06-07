import { getDatabase } from '../cloud';
import { logAction } from './operationLogs';
import type { PaginationResult, ProjectReimbursement } from '../types';
import { normalizeDate, normalizeText } from '@/utils/db-helper';

function getDocData(result: any) {
  return result?.data?.[0] || result?.data || null;
}

function normalizeAmount(value?: number | string | null) {
  const amount = Number(value);
  return Number.isFinite(amount) ? amount : 0;
}

function getYearMonthParts(dateText: string) {
  const [yearText, monthText] = dateText.split('-');
  return {
    year: Number(yearText) || new Date().getFullYear(),
    month: Number(monthText) || new Date().getMonth() + 1,
    year_month: `${yearText || new Date().getFullYear()}-${monthText || String(new Date().getMonth() + 1).padStart(2, '0')}`
  };
}

function getCurrentUser() {
  try {
    const raw = localStorage.getItem('hr3_user');
    if (!raw) return { id: '', name: '' };
    const user = JSON.parse(raw);
    return {
      id: user.id || user._id || '',
      name: user.real_name || user.name || ''
    };
  } catch {
    return { id: '', name: '' };
  }
}

async function fetchAllProjectReimbursements(query: any, batchSize = 100) {
  const countRes = await query.count();
  const total = countRes.total || 0;
  const list: any[] = [];

  for (let skip = 0; skip < total; skip += batchSize) {
    const result = await query.skip(skip).limit(Math.min(batchSize, total - skip)).get();
    list.push(...(result.data || []));
  }

  return list;
}

async function getProjectReimbursementById(db: any, id: string) {
  const res = await db.collection('project_reimbursements').doc(id).get();
  return getDocData(res);
}

async function getUserById(db: any, id: string) {
  if (!id) return null;
  const res = await db.collection('users').doc(id).get();
  return getDocData(res);
}

async function getEmployeeByUserId(db: any, userId: string) {
  if (!userId) return null;
  const res = await db.collection('employees').where({ user_id: userId }).limit(1).get();
  return res.data?.[0] || null;
}

async function getProjectReimbursementSalary(db: any, reimbursementId: string) {
  const res = await db.collection('salaries')
    .where({ source_type: 'project_reimbursement', source_id: reimbursementId })
    .limit(1)
    .get();
  return res.data?.[0] || null;
}

function buildProjectReimbursementSalary(params: {
  reimbursement: any;
  reimbursementUser: any;
  employee: any;
  approvedAt: string;
  operatorId: string;
}) {
  const { reimbursement, reimbursementUser, employee, approvedAt, operatorId } = params;
  const workDate = normalizeDate(reimbursement.work_date || reimbursement.period_start || approvedAt);
  const payDate = normalizeDate(approvedAt);
  const amount = normalizeAmount(reimbursement.reimbursement_amount);
  const { year, month, year_month } = getYearMonthParts(workDate);
  const employeeName = normalizeText(employee?.name)
    || normalizeText(reimbursementUser?.real_name)
    || normalizeText(reimbursementUser?.name)
    || normalizeText(reimbursement.reimbursement_to_user_name);
  const employeeId = normalizeText(employee?._id || employee?.id || reimbursement.reimbursement_to_user_id);
  const employeeNo = normalizeText(employee?.employee_no || reimbursementUser?.employee_no);
  const details = {
    source_type: 'project_reimbursement',
    source_id: reimbursement._id,
    reimbursement_to_user_id: reimbursement.reimbursement_to_user_id,
    reimbursement_to_user_name: reimbursement.reimbursement_to_user_name || employeeName,
    work_date: workDate,
    period_start: reimbursement.period_start,
    period_end: reimbursement.period_end,
    work_quantity: normalizeAmount(reimbursement.work_quantity),
    original_remark: normalizeText(reimbursement.remark)
  };

  return {
    employee_id: employeeId,
    user_id: normalizeText(reimbursement.reimbursement_to_user_id),
    employee_name: employeeName,
    employee_no: employeeNo,
    company_id: normalizeText(reimbursement.company_id),
    company_name: normalizeText(reimbursement.company_name),
    job_id: normalizeText(reimbursement.job_id),
    job_name: normalizeText(reimbursement.job_name),
    year,
    month,
    year_month,
    settlement_mode: 'daily',
    work_date: workDate,
    total_hours: normalizeAmount(reimbursement.work_quantity),
    total_days: 1,
    regular_hours: 0,
    overtime_hours: 0,
    hourly_rate: 0,
    regular_pay: 0,
    overtime_pay: 0,
    base_pay: amount,
    gross_pay: amount,
    net_pay: amount,
    total_amount: amount,
    night_allowance: 0,
    insurance_deduct: 0,
    deductions: 0,
    status: 'paid',
    pay_date: payDate,
    pay_remark: normalizeText(reimbursement.remark) || '项目报销',
    remark: normalizeText(reimbursement.remark) || '项目报销',
    source_type: 'project_reimbursement',
    source_id: normalizeText(reimbursement._id),
    details: JSON.stringify(details),
    created_by: operatorId,
    created_at: approvedAt,
    updated_at: approvedAt
  };
}

export const projectReimbursementsApi = {
  async getList(params?: {
    keyword?: string;
    company_id?: string;
    job_id?: string;
    status?: string;
    page?: number;
    pageSize?: number;
  }): Promise<PaginationResult<ProjectReimbursement>> {
    try {
      const db = await getDatabase();
      const rows = await fetchAllProjectReimbursements(
        db.collection('project_reimbursements').orderBy('created_at', 'desc')
      );

      let list = rows.map((item: any) => ({
        ...item,
        _id: item._id || item.id,
        work_date: normalizeDate(item.work_date || item.period_start),
        work_quantity: normalizeAmount(item.work_quantity),
        reimbursement_amount: normalizeAmount(item.reimbursement_amount)
      }));

      if (params?.keyword) {
        const keyword = normalizeText(params.keyword).toLowerCase();
        list = list.filter((item: any) => [
          item.company_name,
          item.job_name,
          item.reimbursement_to_user_name,
          item.remark
        ].some((field) => normalizeText(field).toLowerCase().includes(keyword)));
      }

      if (params?.company_id) {
        list = list.filter((item: any) => item.company_id === params.company_id);
      }

      if (params?.job_id) {
        list = list.filter((item: any) => item.job_id === params.job_id);
      }

      if (params?.status) {
        list = list.filter((item: any) => item.status === params.status);
      } else {
        list = list.filter((item: any) => item.status !== 'deleted');
      }

      const pageSize = params?.pageSize || 20;
      const page = params?.page || 1;
      const total = list.length;
      const start = (page - 1) * pageSize;
      const paged = list.slice(start, start + pageSize);

      return {
        list: paged as ProjectReimbursement[],
        total,
        page,
        pageSize,
        totalPages: Math.ceil(total / pageSize)
      };
    } catch (err: any) {
      console.error('[projectReimbursementsApi.getList] 失败:', err);
      return { list: [], total: 0, page: 1, pageSize: 20, totalPages: 0 };
    }
  },

  async create(data: Partial<ProjectReimbursement>) {
    try {
      const db = await getDatabase();
      const payload = {
        company_id: normalizeText(data.company_id),
        company_name: normalizeText(data.company_name),
        job_id: normalizeText(data.job_id),
        job_name: normalizeText(data.job_name),
        work_date: normalizeDate(data.work_date || data.period_start),
        period_start: normalizeDate(data.period_start || data.work_date),
        period_end: normalizeDate(data.period_end || data.work_date),
        work_quantity: normalizeAmount(data.work_quantity),
        reimbursement_amount: normalizeAmount(data.reimbursement_amount),
        reimbursement_to_user_id: normalizeText(data.reimbursement_to_user_id),
        reimbursement_to_user_name: normalizeText(data.reimbursement_to_user_name),
        remark: normalizeText(data.remark),
        status: 'pending',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      };

      const res = await db.collection('project_reimbursements').add(payload);
      const finalId = (res as any)?.id || (res as any)?._id;
      await logAction('create', `project_reimbursement:${finalId}`, payload);
      return { _id: finalId, ...payload } as ProjectReimbursement;
    } catch (err: any) {
      console.error('[projectReimbursementsApi.create] 失败:', err);
      throw new Error(err.message || '新增项目报销失败');
    }
  },

  async update(id: string, data: Partial<ProjectReimbursement>) {
    try {
      const db = await getDatabase();
      const existing = await getProjectReimbursementById(db, id);
      if (!existing) throw new Error('项目报销记录不存在');
      if (existing.status === 'approved') throw new Error('审核通过的数据禁止修改');
      if (existing.status === 'deleted') throw new Error('已删除的数据禁止修改');

      const payload = {
        ...(data.company_id !== undefined ? { company_id: normalizeText(data.company_id) } : {}),
        ...(data.company_name !== undefined ? { company_name: normalizeText(data.company_name) } : {}),
        ...(data.job_id !== undefined ? { job_id: normalizeText(data.job_id) } : {}),
        ...(data.job_name !== undefined ? { job_name: normalizeText(data.job_name) } : {}),
        ...(data.work_date !== undefined ? { work_date: normalizeDate(data.work_date) } : {}),
        ...(data.period_start !== undefined ? { period_start: normalizeDate(data.period_start) } : {}),
        ...(data.period_end !== undefined ? { period_end: normalizeDate(data.period_end) } : {}),
        ...(data.work_quantity !== undefined ? { work_quantity: normalizeAmount(data.work_quantity) } : {}),
        ...(data.reimbursement_amount !== undefined ? { reimbursement_amount: normalizeAmount(data.reimbursement_amount) } : {}),
        ...(data.reimbursement_to_user_id !== undefined ? { reimbursement_to_user_id: normalizeText(data.reimbursement_to_user_id) } : {}),
        ...(data.reimbursement_to_user_name !== undefined ? { reimbursement_to_user_name: normalizeText(data.reimbursement_to_user_name) } : {}),
        ...(data.remark !== undefined ? { remark: normalizeText(data.remark) } : {}),
        updated_at: new Date().toISOString()
      };
      const res = await db.collection('project_reimbursements').doc(id).update(payload);
      if (!res.updated) throw new Error('未找到项目报销记录或无权限');
      await logAction('update', `project_reimbursement:${id}`, payload);
      return { _id: id, ...payload } as ProjectReimbursement;
    } catch (err: any) {
      console.error('[projectReimbursementsApi.update] 失败:', err);
      throw new Error(err.message || '更新项目报销失败');
    }
  },

  async approve(id: string) {
    try {
      const db = await getDatabase();
      const operator = getCurrentUser();
      const reimbursement = await getProjectReimbursementById(db, id);
      if (!reimbursement) throw new Error('项目报销记录不存在');
      if (reimbursement.status === 'deleted') throw new Error('已删除的数据不能审批');
      if (reimbursement.status === 'approved') throw new Error('该项目报销已审批通过');

      const approvedAt = new Date().toISOString();
      const reimbursementUser = await getUserById(db, normalizeText(reimbursement.reimbursement_to_user_id));
      if (!reimbursementUser) throw new Error('报销至用户不存在，无法生成发薪记录');
      const employee = await getEmployeeByUserId(db, reimbursement.reimbursement_to_user_id);
      const salaryPayload = buildProjectReimbursementSalary({
        reimbursement: { ...reimbursement, _id: reimbursement._id || id },
        reimbursementUser,
        employee,
        approvedAt,
        operatorId: operator.id
      });

      const existingSalary = await getProjectReimbursementSalary(db, id);
      if (existingSalary?._id) {
        await db.collection('salaries').doc(existingSalary._id).update(salaryPayload);
      } else {
        await db.collection('salaries').add(salaryPayload);
      }

      const payload = {
        status: 'approved',
        approved_at: approvedAt,
        approved_by: operator.id,
        approved_by_name: operator.name,
        updated_at: approvedAt
      };
      const res = await db.collection('project_reimbursements').doc(id).update(payload);
      if (!res.updated) throw new Error('未找到项目报销记录或无权限');
      await logAction('approve', `project_reimbursement:${id}`, payload);
      return { _id: id, ...payload } as ProjectReimbursement;
    } catch (err: any) {
      console.error('[projectReimbursementsApi.approve] 失败:', err);
      throw new Error(err.message || '审批失败');
    }
  },

  async softDelete(id: string) {
    try {
      const db = await getDatabase();
      const existing = await getProjectReimbursementById(db, id);
      if (!existing) throw new Error('项目报销记录不存在');
      if (existing.status === 'approved') throw new Error('审核通过的数据禁止删除');
      if (existing.status === 'deleted') throw new Error('该项目报销已删除');

      const operator = getCurrentUser();
      const payload = {
        status: 'deleted',
        deleted_at: new Date().toISOString(),
        deleted_by: operator.id,
        deleted_by_name: operator.name,
        updated_at: new Date().toISOString()
      };
      const res = await db.collection('project_reimbursements').doc(id).update(payload);
      if (!res.updated) throw new Error('未找到项目报销记录或无权限');
      await logAction('delete', `project_reimbursement:${id}`, payload);
      return { _id: id, ...payload } as ProjectReimbursement;
    } catch (err: any) {
      console.error('[projectReimbursementsApi.softDelete] 失败:', err);
      throw new Error(err.message || '删除失败');
    }
  }
};
