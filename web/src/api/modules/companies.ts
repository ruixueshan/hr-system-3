/**
 * 企业模块 API
 */

import { getDatabase } from '../cloud';
import type { Company, PaginationParams, PaginationResult } from '../types';
import { logAction } from './operationLogs';

function normalizeCode(value?: string) {
  return String(value || '').trim().toUpperCase();
}

async function generateUniqueCompanyCode(db: any) {
  for (let index = 0; index < 5; index += 1) {
    const now = new Date();
    const y = String(now.getFullYear()).slice(-2);
    const m = String(now.getMonth() + 1).padStart(2, '0');
    const d = String(now.getDate()).padStart(2, '0');
    const hh = String(now.getHours()).padStart(2, '0');
    const mm = String(now.getMinutes()).padStart(2, '0');
    const ss = String(now.getSeconds()).padStart(2, '0');
    const rand = String(Math.floor(Math.random() * 100)).padStart(2, '0');
    const code = `COMP${y}${m}${d}${hh}${mm}${ss}${rand}`;
    const exists = await db.collection('companies').where({ company_code: code }).limit(1).get();
    if (!exists.data?.length) return code;
  }
  return `COMP${Date.now()}`;
}

export const companiesApi = {
  // 规范 ID
  normalizeId(id: string | undefined | null): string {
    if (!id) throw new Error('企业ID缺失');
    return id;
  },

  // 获取企业列表
  async getList(params?: PaginationParams & { keyword?: string; status?: string }): Promise<PaginationResult<Company>> {
    try {
      const db = await getDatabase();
      const command = db.command;
      let query = db.collection('companies');

      // 默认排除已终止合作的企业，除非显式传入 status
      if (!params?.status) {
        query = query.where({ status: command.neq('terminated') });
      }

      // 应用过滤条件
      if (params?.keyword) {
        query = query.where({
          name: db.command.regex(params.keyword)
        });
      }
      if (params?.status) {
        query = query.where({ status: params.status });
      }

      // 分页
      const pageSize = params?.pageSize || 20;
      const page = params?.page || 1;
      const skip = (page - 1) * pageSize;

      // 获取总数
      const countResult = await query.count();
      const total = countResult.total || 0;

      // 获取数据
      const result = await query
        .skip(skip)
        .limit(pageSize)
        .orderBy('created_at', 'desc')
        .get();

      const list = (result.data || []).map((item: any) => ({
        ...item,
        _id: item._id || item.id,
        id: item._id || item.id
      }));

      console.log(`[companiesApi.getList] 获取企业列表成功，共 ${total} 条`);

      return {
        list: list as Company[] || [],
        total,
        page,
        pageSize,
        totalPages: Math.ceil(total / pageSize)
      };
    } catch (err: any) {
      console.error('[companiesApi.getList] 失败:', err?.message || err);
      return {
        list: [],
        total: 0,
        page: 1,
        pageSize: 20,
        totalPages: 0
      };
    }
  },

  // 获取单个企业详情
  async getDetail(id: string): Promise<Company> {
    try {
      const db = await getDatabase();
      const realId = companiesApi.normalizeId(id);
      const result = await db.collection('companies')
        .doc(realId)
        .get();

      if (!result.data || result.data.length === 0) {
        throw new Error('企业不存在');
      }

      return result.data[0] as Company;
    } catch (err: any) {
      console.error('[companiesApi.getDetail] 失败:', err);
      throw new Error(err.message || '获取企业详情失败');
    }
  },

  // 创建企业
  async create(data: Partial<Company>): Promise<Company> {
    try {
      const db = await getDatabase();
      const companyCode = normalizeCode(data.company_code) || await generateUniqueCompanyCode(db);
      const company = {
        ...data,
        company_code: companyCode,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        status: 'active'
      };

      const result = await db.collection('companies').add(company);
      await logAction('create', `company:${result.id}`, company.name);
      return { _id: result.id, ...company } as Company;
    } catch (err: any) {
      console.error('[companiesApi.create] 失败:', err);
      throw new Error(err.message || '创建企业失败');
    }
  },

  // 更新企业
  async update(id: string, data: Partial<Company>): Promise<Company> {
    try {
      const db = await getDatabase();
      const realId = companiesApi.normalizeId(id);
      const { _id: _omit1, id: _omit2, ...payload } = data as any;
      const detail = await db.collection('companies').doc(realId).get();
      if (!detail.data || !detail.data.length) {
        throw new Error('企业不存在');
      }
      const existing = detail.data[0] || {};
      const incomingCode = Object.prototype.hasOwnProperty.call(payload, 'company_code')
        ? normalizeCode(payload.company_code)
        : normalizeCode(existing.company_code);
      payload.company_code = incomingCode || await generateUniqueCompanyCode(db);

      const res = await db.collection('companies')
        .doc(realId)
        .update({
          ...payload,
          updated_at: new Date().toISOString()
        });

      if (!res.updated) {
        const merged = { ...existing, ...payload, updated_at: new Date().toISOString() };
        delete (merged as any)._id;
        delete (merged as any).id;
        delete (merged as any)._openid;
        const setRes = await db.collection('companies').doc(realId).set(merged);
        if (!setRes.updated && !setRes.ok && !setRes.stats) {
          throw new Error('无权限更新企业');
        }
      }

      await logAction('update', `company:${realId}`, payload);
      return { _id: realId, ...payload } as Company;
    } catch (err: any) {
      console.error('[companiesApi.update] 失败:', err);
      throw new Error(err.message || '更新企业失败');
    }
  },

  // 删除企业（软删除）
  async delete(id: string): Promise<void> {
    try {
      const db = await getDatabase();
      const realId = companiesApi.normalizeId(id);
      const res = await db.collection('companies')
        .doc(realId)
        .update({ status: 'terminated', updated_at: new Date().toISOString() });

      if (!res.updated) {
        throw new Error('未找到企业或无权限删除');
      }

      await logAction('delete', `company:${realId}`);
    } catch (err: any) {
      console.error('[companiesApi.delete] 失败:', err);
      throw new Error(err.message || '删除企业失败');
    }
  },

  // 启用/停用企业
  async toggleStatus(id: string, status: 'active' | 'paused' | 'terminated'): Promise<Company> {
    try {
      const db = await getDatabase();
      await db.collection('companies')
        .doc(id)
        .update({ status, updated_at: new Date().toISOString() });

      console.log('[companiesApi.toggleStatus] 企业状态更新成功:', id, status);
      return { _id: id, status } as Company;
    } catch (err: any) {
      console.error('[companiesApi.toggleStatus] 失败:', err);
      throw new Error(err.message || '更新企业状态失败');
    }
  },

  // 批量删除企业
  async batchDelete(ids: string[]): Promise<{ success: number; failed: number }> {
    try {
      const db = await getDatabase();
      const batch = db.batch();
      
      for (const id of ids) {
        batch.collection('companies').doc(id).update({ 
          status: 'terminated', 
          updated_at: new Date().toISOString() 
        });
      }
      
      await batch.commit();
      console.log('[companiesApi.batchDelete] 批量删除成功:', ids.length);
      return { success: ids.length, failed: 0 };
    } catch (err: any) {
      console.error('[companiesApi.batchDelete] 失败:', err);
      throw new Error(err.message || '批量删除失败');
    }
  },

  // 获取企业统计
  async getStats(): Promise<any> {
    try {
      const db = await getDatabase();
      const countResult = await db.collection('companies').where({ status: 'active' }).count();
      return {
        total: countResult.total || 0,
        active: countResult.total || 0,
        paused: 0,
        terminated: 0
      };
    } catch (err: any) {
      console.error('[companiesApi.getStats] 失败:', err);
      return { total: 0, active: 0, paused: 0, terminated: 0 };
    }
  },

  // 获取仪表板统计
  async getDashboardStats(): Promise<any> {
    try {
      const db = await getDatabase();
      const activeCount = await db.collection('companies').where({ status: 'active' }).count();
      return {
        activeCompanies: activeCount.total || 0,
        totalCompanies: activeCount.total || 0
      };
    } catch (err: any) {
      console.error('[companiesApi.getDashboardStats] 失败:', err);
      return { activeCompanies: 0, totalCompanies: 0 };
    }
  }
};
