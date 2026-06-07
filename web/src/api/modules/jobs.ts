/**
 * 岗位模块 API
 */

import { getDatabase } from '../cloud';
import type { Job, PaginationParams, PaginationResult } from '../types';
import { logAction } from './operationLogs';

function normalizeCode(value?: string) {
  return String(value || '').trim().toUpperCase();
}

function normalizeSortOrder(value?: number | null) {
  const num = Number(value);
  if (!Number.isInteger(num) || num < 1 || num > 100) return null;
  return num;
}

function sortJobsByOrder<T extends { sort_order?: number; created_at?: string }>(list: T[]): T[] {
  return [...list].sort((left, right) => {
    const leftOrder = normalizeSortOrder(left.sort_order);
    const rightOrder = normalizeSortOrder(right.sort_order);
    const leftHasOrder = leftOrder !== null;
    const rightHasOrder = rightOrder !== null;

    if (leftHasOrder !== rightHasOrder) {
      return leftHasOrder ? -1 : 1;
    }

    if (leftHasOrder && rightHasOrder && leftOrder !== rightOrder) {
      return (leftOrder as number) - (rightOrder as number);
    }

    const leftTime = new Date(left.created_at || 0).getTime();
    const rightTime = new Date(right.created_at || 0).getTime();
    return rightTime - leftTime;
  });
}

async function fetchAllJobs(query: any, total: number, batchSize = 100) {
  const rows: any[] = [];
  for (let skip = 0; skip < total; skip += batchSize) {
    const result = await query
      .skip(skip)
      .limit(Math.min(batchSize, total - skip))
      .orderBy('created_at', 'desc')
      .get();
    rows.push(...(result.data || []));
  }
  return rows;
}

async function generateUniqueJobCode(db: any) {
  for (let index = 0; index < 5; index += 1) {
    const now = new Date();
    const y = String(now.getFullYear()).slice(-2);
    const m = String(now.getMonth() + 1).padStart(2, '0');
    const d = String(now.getDate()).padStart(2, '0');
    const hh = String(now.getHours()).padStart(2, '0');
    const mm = String(now.getMinutes()).padStart(2, '0');
    const ss = String(now.getSeconds()).padStart(2, '0');
    const rand = String(Math.floor(Math.random() * 100)).padStart(2, '0');
    const code = `JOB${y}${m}${d}${hh}${mm}${ss}${rand}`;
    const exists = await db.collection('jobs').where({ job_code: code }).limit(1).get();
    if (!exists.data?.length) return code;
  }
  return `JOB${Date.now()}`;
}

export const jobsApi = {
  // 内部工具：兼容 _id / id
  normalizeId(id: string | undefined | null): string {
    if (!id) throw new Error('岗位ID缺失');
    return id;
  },

  // 获取岗位列表
  async getList(params?: PaginationParams & { keyword?: string; status?: string; company_id?: string; is_recruiting?: boolean }): Promise<PaginationResult<Job>> {
    try {
      const db = await getDatabase();
      const command = db.command;
      const conditions: any[] = [];

      // 默认显示所有岗位（包括已关闭），不过滤

      if (params?.keyword) {
        const reg = db.RegExp({ regexp: params.keyword, options: 'i' });
        conditions.push(
          command.or([
            { position: reg },
            { job_name: reg },
            { title: reg }
          ])
        );
      }
      if (params?.status) {
        conditions.push({ status: params.status });
      }
      if (params?.company_id) {
        conditions.push({ company_id: params.company_id });
      }
      if (typeof params?.is_recruiting === 'boolean') {
        conditions.push({ is_recruiting: params.is_recruiting });
      }

      let query = db.collection('jobs');
      if (conditions.length > 0) {
        query = query.where(command.and(conditions));
      }

      const pageSize = params?.pageSize || 20;
      const page = params?.page || 1;

      const countResult = await query.count();
      const total = countResult.total || 0;

      const allRows = total > 0 ? await fetchAllJobs(query, total) : [];
      const sortedRows = sortJobsByOrder(allRows);
      const pagedRows = sortedRows.slice((page - 1) * pageSize, page * pageSize);

      const list = (pagedRows || []).map((item: any) => ({
      ...item,
      _id: item._id || item.id,
      id: item._id || item.id,
      // 兼容旧数据字段
      position: item.position || item.job_name || item.title,
      company_name: item.company_name
    }));

      return {
        list: list as Job[] || [],
        total,
        page,
        pageSize,
        totalPages: Math.ceil(total / pageSize)
      };
    } catch (err: any) {
      console.error('[jobsApi.getList] 失败:', err);
      return { list: [], total: 0, page: 1, pageSize: 20, totalPages: 0 };
    }
  },

  // 获取岗位详情
  async getDetail(id: string): Promise<Job> {
    try {
      const db = await getDatabase();
      const realId = jobsApi.normalizeId(id);
      const result = await db.collection('jobs')
        .doc(realId)
        .get();

      if (!result.data?.length) throw new Error('岗位不存在');
      return result.data[0] as Job;
    } catch (err: any) {
      console.error('[jobsApi.getDetail] 失败:', err);
      throw new Error(err.message || '获取岗位详情失败');
    }
  },

  // 创建岗位
  async create(data: Partial<Job>): Promise<Job> {
    try {
      const db = await getDatabase();
      const { _id, id, ...rest } = data as any;
      const jobCode = normalizeCode(data.job_code) || await generateUniqueJobCode(db);
      const job = {
        ...rest,
        job_code: jobCode,
        job_name: data.job_name || data.position,
        salary_type: data.salary_type || 'hourly',
        sort_order: normalizeSortOrder(data.sort_order),
        purchase_hourly_rate: data.purchase_hourly_rate ?? data.hourly_rate ?? 0,
        bill_hours: data.bill_hours ?? rest.bill_hours ?? undefined,
        work_time: data.work_time || rest.work_time || '',
        shift_type: (data.shift_type as any) || 'day',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        status: 'active',
        recruited: 0
      };

      const result = await db.collection('jobs').add(job);
      const finalId = (result as any)?.id || (result as any)?._id;
      if (!finalId) throw new Error('未拿到新增岗位ID，请检查 jobs 集合权限或名称');
      await logAction('create', `job:${finalId}`, job.position);
      return { _id: finalId, ...job } as Job;
    } catch (err: any) {
      console.error('[jobsApi.create] 失败:', err);
      throw new Error(err.message || '创建岗位失败');
    }
  },

  // 更新岗位
  async update(id: string, data: Partial<Job>): Promise<Job> {
    try {
      const db = await getDatabase();
      const realId = jobsApi.normalizeId(id);
      // 移除 _id/id，避免误传
      const { _id: _omit1, id: _omit2, ...payload } = data as any;
      const detail = await db.collection('jobs').doc(realId).get();
      if (!detail.data || !detail.data.length) {
        throw new Error('岗位不存在');
      }
      const existing = detail.data[0] || {};
      const incomingCode = Object.prototype.hasOwnProperty.call(payload, 'job_code')
        ? normalizeCode(payload.job_code)
        : normalizeCode(existing.job_code);
      payload.job_code = incomingCode || await generateUniqueJobCode(db);
      payload.sort_order = normalizeSortOrder(payload.sort_order);

      const res = await db.collection('jobs')
        .doc(realId)
        .update({ ...payload, updated_at: new Date().toISOString() });

      if (!res.updated) {
        // 可能是“无权限”或“未找到”，尝试先读取确认存在，再用 set 覆盖
        const merged = { ...existing, ...payload, updated_at: new Date().toISOString() };
        delete (merged as any)._id;
        delete (merged as any).id;
        delete (merged as any)._openid;
        const setRes = await db.collection('jobs').doc(realId).set(merged);
        if (!setRes.updated && !setRes.ok && !setRes.stats) {
          throw new Error('无权限更新岗位');
        }
      }

      await logAction('update', `job:${realId}`, payload);
      return { _id: realId, ...payload } as Job;
    } catch (err: any) {
      console.error('[jobsApi.update] 失败:', err);
      throw new Error(err.message || '更新岗位失败');
    }
  },

  // 删除岗位
  async delete(id: string): Promise<void> {
    try {
      const db = await getDatabase();
      const realId = jobsApi.normalizeId(id);
      const res = await db.collection('jobs')
        .doc(realId)
        .update({ status: 'closed', updated_at: new Date().toISOString() });

      if (!res.updated) {
        throw new Error('未找到岗位或无权限删除');
      }
      await logAction('delete', `job:${realId}`);
    } catch (err: any) {
      console.error('[jobsApi.delete] 失败:', err);
      throw new Error(err.message || '删除岗位失败');
    }
  },

  // 获取仪表板统计
  async getDashboardStats(): Promise<any> {
    try {
      const db = await getDatabase();
      const active = await db.collection('jobs').where({ status: 'active' }).count();
      const total = await db.collection('jobs').count();
      return {
        activeJobs: active.total || 0,
        totalJobs: total.total || 0
      };
    } catch (err: any) {
      console.error('[jobsApi.getDashboardStats] 失败:', err);
      return { activeJobs: 0, totalJobs: 0 };
    }
  },

  // 停止招聘
  async stopRecruiting(id: string): Promise<Job> {
    try {
      const db = await getDatabase();
      const realId = jobsApi.normalizeId(id);
      const res = await db.collection('jobs')
        .doc(realId)
        .update({ is_recruiting: false, status: 'paused', updated_at: new Date().toISOString() });

      if (!res.updated) {
        throw new Error('未找到岗位或无权限更新');
      }

      await logAction('update', `job:${realId}`, { is_recruiting: false, status: 'paused' });
      return { _id: realId, is_recruiting: false, status: 'paused' } as Job;
    } catch (err: any) {
      console.error('[jobsApi.stopRecruiting] 失败:', err);
      throw new Error(err.message || '停止招聘失败');
    }
  },

  // 发布岗位（恢复招聘）
  async publish(id: string): Promise<Job> {
    try {
      const db = await getDatabase();
      const realId = jobsApi.normalizeId(id);
      const res = await db.collection('jobs')
        .doc(realId)
        .update({ is_recruiting: true, status: 'active', updated_at: new Date().toISOString() });

      if (!res.updated) {
        throw new Error('未找到岗位或无权限更新');
      }

      await logAction('update', `job:${realId}`, { is_recruiting: true, status: 'active' });
      return { _id: realId, is_recruiting: true, status: 'active' } as Job;
    } catch (err: any) {
      console.error('[jobsApi.publish] 失败:', err);
      throw new Error(err.message || '发布岗位失败');
    }
  }
};
