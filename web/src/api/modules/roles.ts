/**
 * 角色权限模块 API
 */
import { getDatabase } from '../cloud';
import type { PaginationParams, PaginationResult } from '../types';
import { logAction } from './operationLogs';

export interface RoleItem {
  _id?: string;
  name: string; // 角色标识
  description?: string;
  permissions: string[];
  status?: 'active' | 'inactive' | 'deleted';
  created_at?: string;
  updated_at?: string;
}

export const rolesApi = {
  async getList(params?: PaginationParams & { keyword?: string; status?: string }): Promise<PaginationResult<RoleItem>> {
    try {
      const db = await getDatabase();
      const cmd = db.command;
      let query = db.collection('roles').where({ status: cmd.neq('deleted') });

      if (params?.keyword) {
        const reg = db.RegExp({ regexp: params.keyword, options: 'i' });
        query = query.where({ name: reg });
      }
      if (params?.status) {
        query = query.where({ status: params.status });
      }

      const pageSize = params?.pageSize || 50;
      const page = params?.page || 1;
      const skip = (page - 1) * pageSize;

      const count = await query.count();
      const total = count.total || 0;
      const res = await query.skip(skip).limit(pageSize).orderBy('created_at', 'desc').get();
      const list = (res.data || []).map((i: any) => ({ ...i, _id: i._id || i.id, id: i._id || i.id }));
      return { list, total, page, pageSize, totalPages: Math.ceil(total / pageSize) };
    } catch (err) {
      console.error('[rolesApi.getList] 失败:', err);
      return { list: [], total: 0, page: 1, pageSize: 20, totalPages: 0 };
    }
  },

  async create(data: Partial<RoleItem>): Promise<RoleItem> {
    const db = await getDatabase();
    const { _id, id, ...rest } = data as any;
    const payload = {
      status: rest.status || 'active',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      permissions: rest.permissions || [],
      ...rest
    };
    const res = await db.collection('roles').add(payload);
    const finalId = (res as any)?.id || (res as any)?._id;
    if (!finalId) throw new Error('未拿到角色ID，请检查 roles 集合权限或名称');
    await logAction('create', `role:${finalId}`, payload.name);
    return { _id: finalId, ...payload } as RoleItem;
  },

  async update(id: string, data: Partial<RoleItem>): Promise<RoleItem> {
    const db = await getDatabase();
    const detail = await db.collection('roles').doc(id).get();
    if (!detail.data || !detail.data.length) throw new Error('未找到角色或无权限更新');
    const merged = { ...detail.data[0], ...data, updated_at: new Date().toISOString() };
    delete (merged as any)._id;
    delete (merged as any).id;
    delete (merged as any)._openid;
    const res = await db.collection('roles').doc(id).set(merged);
    if (!res.updated && !(res as any).ok && !(res as any).stats) {
      throw new Error('未找到角色或无权限更新');
    }
    await logAction('update', `role:${id}`, data);
    return { _id: id, ...data } as RoleItem;
  },

  async delete(id: string): Promise<void> {
    const db = await getDatabase();
    const res = await db.collection('roles').doc(id).update({
      status: 'deleted',
      updated_at: new Date().toISOString()
    });
    if (!res.updated) throw new Error('删除失败');
    await logAction('delete', `role:${id}`);
  }
};
