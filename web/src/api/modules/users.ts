/**
 * 用户模块 API
 */

import { getDatabase, callFunction } from '../cloud';
import type { UserInfo, PaginationParams, PaginationResult } from '../types';

function normalizeText(value?: string | null) {
  return String(value || '').trim();
}

function normalizePhone(value?: string | null) {
  return normalizeText(value).replace(/\D+/g, '');
}

function normalizeIdCard(value?: string | null) {
  return normalizeText(value).toUpperCase();
}

function normalizeBankAccount(value?: string | null) {
  return normalizeText(value).replace(/\s+/g, '');
}

function hasOwn(obj: Record<string, any>, key: string) {
  return Object.prototype.hasOwnProperty.call(obj || {}, key);
}

function buildUserAccountPayload(data: Record<string, any>) {
  const allowedFields = [
    'openid',
    'name',
    'real_name',
    'phone',
    'avatar',
    'user_type',
    'role',
    'status',
    'password',
    'employee_id',
    'employee_no',
    'candidate_owner_id',
    'candidate_owner_name',
    'candidate_owner_role',
    'candidate_owner_type',
    'source_referrer_id',
    'source_referrer_name',
    'referrer_id',
    'referrer_name'
  ];

  const payload: Record<string, any> = {};
  allowedFields.forEach((field) => {
    if (!hasOwn(data, field)) return;
    payload[field] = data[field];
  });

  if (payload.name !== undefined) payload.name = normalizeText(payload.name);
  if (payload.real_name !== undefined) payload.real_name = normalizeText(payload.real_name);
  if (payload.phone !== undefined) payload.phone = normalizePhone(payload.phone);
  return payload;
}

function buildEmployeeProfilePayload(data: Record<string, any>) {
  const payload: Record<string, any> = {};
  if (hasOwn(data, 'real_name')) payload.name = normalizeText(data.real_name);
  if (hasOwn(data, 'name')) payload.name = normalizeText(data.name);
  if (hasOwn(data, 'phone')) payload.phone = normalizePhone(data.phone);
  if (hasOwn(data, 'id_card')) payload.id_card = normalizeIdCard(data.id_card);
  if (hasOwn(data, 'gender')) payload.gender = data.gender;
  if (hasOwn(data, 'bank_name')) payload.bank_name = normalizeText(data.bank_name);
  if (hasOwn(data, 'bank_account')) {
    payload.bank_account = normalizeBankAccount(data.bank_account);
    payload.bank_card_last4 = payload.bank_account ? payload.bank_account.slice(-4) : '';
  }
  if (hasOwn(data, 'bank_account_name')) payload.bank_account_name = normalizeText(data.bank_account_name);
  return payload;
}

function buildCandidateSnapshotPayload(data: Record<string, any>) {
  return buildUserAccountPayload(data);
}

async function resolveBoundEmployee(db: any, userId: string, user?: Record<string, any>) {
  const currentUser = user || {};
  const employeeId = normalizeText(currentUser.employee_id);
  if (employeeId) {
    const employeeRes = await db.collection('employees').doc(employeeId).get();
    const employee = employeeRes.data?.[0] || employeeRes.data || null;
    if (employee) return employee;
  }

  const byUserRes = await db.collection('employees').where({ user_id: userId }).limit(1).get();
  return byUserRes.data?.[0] || null;
}

async function syncEmployeeProfileFromUserUpdate(db: any, userId: string, user: Record<string, any>, data: Record<string, any>) {
  const employee = await resolveBoundEmployee(db, userId, user);
  if (!employee) return;

  const targetEmployeeId = normalizeText(employee._id || employee.id);
  if (!targetEmployeeId) return;

  const payload = buildEmployeeProfilePayload(data);
  if (!Object.keys(payload).length) return;

  await db.collection('employees').doc(targetEmployeeId).update({
    ...payload,
    updated_at: new Date().toISOString()
  });
}

export const usersApi = {
  // 获取用户列表
  async getList(params?: PaginationParams & { keyword?: string; user_type?: string; role?: string }): Promise<PaginationResult<UserInfo>> {
    try {
      const db = await getDatabase();
      let query = db.collection('users');
      const command = db.command;

      if (params?.keyword) {
        const reg = db.RegExp({ regexp: params.keyword, options: 'i' });
        query = query.where(command.or([
          { name: reg },
          { real_name: reg },
          { phone: reg }
        ]));
      }
      if (params?.user_type) {
        query = query.where({ user_type: params.user_type });
      }
      if (params?.role) {
        query = query.where({ role: params.role });
      }

      const pageSize = params?.pageSize || 20;
      const page = params?.page || 1;
      const skip = (page - 1) * pageSize;

      const countResult = await query.count();
      const total = countResult.total || 0;

      const result = await query
        .skip(skip)
        .limit(pageSize)
        .orderBy('created_at', 'desc')
        .get();

      return {
        list: result.data as UserInfo[] || [],
        total,
        page,
        pageSize,
        totalPages: Math.ceil(total / pageSize)
      };
    } catch (err: any) {
      console.error('[usersApi.getList] 失败:', err);
      return { list: [], total: 0, page: 1, pageSize: 20, totalPages: 0 };
    }
  },

  // 创建用户
  async create(data: Partial<UserInfo>): Promise<UserInfo> {
    const db = await getDatabase();
    const { _id, id, ...rest } = data as any;
    
    // 过滤掉空字符串和 undefined 值
    const accountPayload = buildCandidateSnapshotPayload(rest);
    const basePayload = {
      status: rest.status || 'normal',
      password: rest.password || ('sqzr' + (rest.phone?.slice(-4) || '0000')),
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      ...accountPayload
    };
    
    const payload: Record<string, any> = {};
    Object.entries(basePayload).forEach(([key, value]) => {
      if (value !== '' && value !== undefined && value !== null) {
        payload[key] = value;
      }
    });
    
    const res = await db.collection('users').add(payload);
    const finalId = (res as any)?.id || (res as any)?._id;
    if (!finalId) throw new Error('未拿到新增用户ID，请检查 users 集合权限或名称');
    try {
      const { logAction } = await import('./operationLogs');
      await logAction('create', `user:${finalId}`, payload.name);
    } catch (err) {
      console.warn('[usersApi.create] logAction failed', err);
    }
    return { _id: finalId, ...payload } as UserInfo;
  },

  // 获取用户详情
  async getDetail(id: string): Promise<UserInfo> {
    try {
      const db = await getDatabase();
      const result = await db.collection('users')
        .doc(id)
        .get();

      if (!result.data?.length) throw new Error('用户不存在');
      return result.data[0] as UserInfo;
    } catch (err: any) {
      console.error('[usersApi.getDetail] 失败:', err);
      throw new Error(err.message || '获取用户详情失败');
    }
  },

  // 更新用户
  async update(id: string, data: Partial<UserInfo>): Promise<UserInfo> {
    try {
      if (!id || (typeof id !== 'string' && typeof id !== 'number')) {
        throw new Error('更新用户失败：无效的用户ID');
      }
      const db = await getDatabase();
      const currentRes = await db.collection('users').doc(id).get();
      const currentUser = currentRes.data?.[0] || currentRes.data || {};
      const employee = await resolveBoundEmployee(db, String(id), currentUser);
      const userPayload = employee
        ? buildUserAccountPayload(data as Record<string, any>)
        : buildCandidateSnapshotPayload(data as Record<string, any>);

      if (employee) {
        await syncEmployeeProfileFromUserUpdate(db, String(id), currentUser, data as Record<string, any>);
      }

      if (!Object.keys(userPayload).length) {
        return { _id: id } as UserInfo;
      }

      await db.collection('users')
        .doc(id)
        .update({ ...userPayload, updated_at: new Date().toISOString() });

      return { _id: id, ...userPayload } as UserInfo;
    } catch (err: any) {
      console.error('[usersApi.update] 失败:', err);
      throw new Error(err.message || '更新用户失败');
    }
  },

  // 禁用/启用用户
  async toggleStatus(id: string, status: 'normal' | 'disabled'): Promise<UserInfo> {
    try {
      const db = await getDatabase();
      await db.collection('users')
        .doc(id)
        .update({ status, updated_at: new Date().toISOString() });

      return { _id: id, status } as UserInfo;
    } catch (err: any) {
      console.error('[usersApi.toggleStatus] 失败:', err);
      throw new Error(err.message || '更新用户状态失败');
    }
  },

  // 重置密码
  async resetPassword(id: string, phone: string): Promise<void> {
    try {
      const newPassword = 'sqzr' + phone.slice(-4);
      const db = await getDatabase();
      await db.collection('users')
        .doc(id)
        .update({ password: newPassword, updated_at: new Date().toISOString() });
    } catch (err: any) {
      console.error('[usersApi.resetPassword] 失败:', err);
      throw new Error(err.message || '重置密码失败');
    }
  },

  // 修改密码（用户自主）
  async changePassword(userId: string, oldPassword: string, newPassword: string): Promise<void> {
    try {
      // callFunction 如果失败会直接抛异常，成功则返回数据（可能为 null）
      await callFunction('auth-change-password', 'changePassword', {
        userId,
        oldPassword,
        newPassword
      });
      // 如果没有异常，则说明成功
      return;
    } catch (err: any) {
      console.error('[usersApi.changePassword] 失败:', err);
      throw new Error(err.message || '修改密码失败');
    }
  }
};
