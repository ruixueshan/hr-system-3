#!/usr/bin/env node

/**
 * 修复被破坏的 API 模块文件
 * 使用 CloudBase SDK 的 await getDatabase() 方式
 */

const fs = require('fs');
const path = require('path');

const MODULES_DIR = path.join(__dirname, 'web/src/api/modules');

// 确保目录存在
if (!fs.existsSync(MODULES_DIR)) {
  fs.mkdirSync(MODULES_DIR, { recursive: true });
}

// 生成的文件内容定义
const filesContent = {
  'companies.ts': `/**
 * 企业模块 API
 */

import { getDatabase } from '../cloud';
import type { Company, PaginationParams, PaginationResult } from '../types';

export const companiesApi = {
  // 获取企业列表
  async getList(params?: PaginationParams & { keyword?: string; status?: string }): Promise<PaginationResult<Company>> {
    try {
      const db = await getDatabase();
      let query = db.collection('companies');

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

      console.log(\`[companiesApi.getList] 获取企业列表成功，共 \${total} 条\`);

      return {
        list: result.data as Company[] || [],
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
      const result = await db.collection('companies')
        .doc(id)
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
      const company = {
        ...data,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        status: 'active'
      };

      const result = await db.collection('companies').add(company);
      console.log('[companiesApi.create] 企业创建成功:', result.id);
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
      await db.collection('companies')
        .doc(id)
        .update({
          ...data,
          updated_at: new Date().toISOString()
        });

      console.log('[companiesApi.update] 企业更新成功:', id);
      return { _id: id, ...data } as Company;
    } catch (err: any) {
      console.error('[companiesApi.update] 失败:', err);
      throw new Error(err.message || '更新企业失败');
    }
  },

  // 删除企业（软删除）
  async delete(id: string): Promise<void> {
    try {
      const db = await getDatabase();
      await db.collection('companies')
        .doc(id)
        .update({ status: 'terminated', updated_at: new Date().toISOString() });

      console.log('[companiesApi.delete] 企业删除成功:', id);
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
`,

  'employees.ts': `/**
 * 员工模块 API
 */

import { getDatabase } from '../cloud';
import type { PaginationParams, PaginationResult } from '../types';

export interface Employee {
  _id?: string;
  name: string;
  phone: string;
  email?: string;
  company_id?: string;
  department?: string;
  position?: string;
  hire_date?: string;
  status: 'active' | 'archived' | 'terminated';
  created_at?: string;
  updated_at?: string;
}

export const employeesApi = {
  // 获取员工列表
  async getList(params?: PaginationParams & { keyword?: string; status?: string }): Promise<PaginationResult<Employee>> {
    try {
      const db = await getDatabase();
      let query = db.collection('employees');

      if (params?.keyword) {
        query = query.where({
          name: db.command.regex(params.keyword)
        });
      }
      if (params?.status) {
        query = query.where({ status: params.status });
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
        list: result.data as Employee[] || [],
        total,
        page,
        pageSize,
        totalPages: Math.ceil(total / pageSize)
      };
    } catch (err: any) {
      console.error('[employeesApi.getList] 失败:', err);
      return { list: [], total: 0, page: 1, pageSize: 20, totalPages: 0 };
    }
  },

  // 获取员工详情
  async getDetail(id: string): Promise<Employee> {
    try {
      const db = await getDatabase();
      const result = await db.collection('employees')
        .doc(id)
        .get();

      if (!result.data?.length) throw new Error('员工不存在');
      return result.data[0] as Employee;
    } catch (err: any) {
      console.error('[employeesApi.getDetail] 失败:', err);
      throw new Error(err.message || '获取员工详情失败');
    }
  },

  // 创建员工
  async create(data: Partial<Employee>): Promise<Employee> {
    try {
      const db = await getDatabase();
      const employee = {
        ...data,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        status: 'active'
      };

      const result = await db.collection('employees').add(employee);
      return { _id: result.id, ...employee } as Employee;
    } catch (err: any) {
      console.error('[employeesApi.create] 失败:', err);
      throw new Error(err.message || '创建员工失败');
    }
  },

  // 更新员工
  async update(id: string, data: Partial<Employee>): Promise<Employee> {
    try {
      const db = await getDatabase();
      await db.collection('employees')
        .doc(id)
        .update({ ...data, updated_at: new Date().toISOString() });

      return { _id: id, ...data } as Employee;
    } catch (err: any) {
      console.error('[employeesApi.update] 失败:', err);
      throw new Error(err.message || '更新员工失败');
    }
  },

  // 删除员工
  async delete(id: string): Promise<void> {
    try {
      const db = await getDatabase();
      await db.collection('employees')
        .doc(id)
        .update({ status: 'terminated', updated_at: new Date().toISOString() });
    } catch (err: any) {
      console.error('[employeesApi.delete] 失败:', err);
      throw new Error(err.message || '删除员工失败');
    }
  },

  // 归档员工
  async archive(id: string): Promise<void> {
    try {
      const db = await getDatabase();
      await db.collection('employees')
        .doc(id)
        .update({ status: 'archived', updated_at: new Date().toISOString() });
    } catch (err: any) {
      console.error('[employeesApi.archive] 失败:', err);
      throw new Error(err.message || '归档员工失败');
    }
  },

  // 获取仪表板统计
  async getDashboardStats(): Promise<any> {
    try {
      const db = await getDatabase();
      const total = await db.collection('employees').count();
      const active = await db.collection('employees').where({ status: 'active' }).count();
      return {
        totalEmployees: total.total || 0,
        activeEmployees: active.total || 0
      };
    } catch (err: any) {
      console.error('[employeesApi.getDashboardStats] 失败:', err);
      return { totalEmployees: 0, activeEmployees: 0 };
    }
  }
};
`,

  'jobs.ts': `/**
 * 岗位模块 API
 */

import { getDatabase } from '../cloud';
import type { Job, PaginationParams, PaginationResult } from '../types';

export const jobsApi = {
  // 获取岗位列表
  async getList(params?: PaginationParams & { keyword?: string; status?: string; company_id?: string }): Promise<PaginationResult<Job>> {
    try {
      const db = await getDatabase();
      let query = db.collection('jobs');

      if (params?.keyword) {
        query = query.where({
          position: db.command.regex(params.keyword)
        });
      }
      if (params?.status) {
        query = query.where({ status: params.status });
      }
      if (params?.company_id) {
        query = query.where({ company_id: params.company_id });
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
        list: result.data as Job[] || [],
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
      const result = await db.collection('jobs')
        .doc(id)
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
      const job = {
        ...data,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        status: 'active',
        recruited: 0
      };

      const result = await db.collection('jobs').add(job);
      return { _id: result.id, ...job } as Job;
    } catch (err: any) {
      console.error('[jobsApi.create] 失败:', err);
      throw new Error(err.message || '创建岗位失败');
    }
  },

  // 更新岗位
  async update(id: string, data: Partial<Job>): Promise<Job> {
    try {
      const db = await getDatabase();
      await db.collection('jobs')
        .doc(id)
        .update({ ...data, updated_at: new Date().toISOString() });

      return { _id: id, ...data } as Job;
    } catch (err: any) {
      console.error('[jobsApi.update] 失败:', err);
      throw new Error(err.message || '更新岗位失败');
    }
  },

  // 删除岗位
  async delete(id: string): Promise<void> {
    try {
      const db = await getDatabase();
      await db.collection('jobs')
        .doc(id)
        .update({ status: 'closed', updated_at: new Date().toISOString() });
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
  }
};
`,

  'applications.ts': `/**
 * 求职应聘模块 API
 */

import { getDatabase } from '../cloud';
import type { Application, PaginationParams, PaginationResult } from '../types';

export const applicationsApi = {
  // 获取应聘列表
  async getList(params?: PaginationParams & { status?: string; job_id?: string }): Promise<PaginationResult<Application>> {
    try {
      const db = await getDatabase();
      let query = db.collection('applications');

      if (params?.status) {
        query = query.where({ status: params.status });
      }
      if (params?.job_id) {
        query = query.where({ job_id: params.job_id });
      }

      const pageSize = params?.pageSize || 20;
      const page = params?.page || 1;
      const skip = (page - 1) * pageSize;

      const countResult = await query.count();
      const total = countResult.total || 0;

      const result = await query
        .skip(skip)
        .limit(pageSize)
        .orderBy('apply_time', 'desc')
        .get();

      return {
        list: result.data as Application[] || [],
        total,
        page,
        pageSize,
        totalPages: Math.ceil(total / pageSize)
      };
    } catch (err: any) {
      console.error('[applicationsApi.getList] 失败:', err);
      return { list: [], total: 0, page: 1, pageSize: 20, totalPages: 0 };
    }
  },

  // 创建应聘
  async create(data: Partial<Application>): Promise<Application> {
    try {
      const db = await getDatabase();
      const application = {
        ...data,
        apply_time: new Date().toISOString(),
        status: 'pending'
      };

      const result = await db.collection('applications').add(application);
      return { _id: result.id, ...application } as Application;
    } catch (err: any) {
      console.error('[applicationsApi.create] 失败:', err);
      throw new Error(err.message || '创建应聘失败');
    }
  },

  // 获取仪表板统计
  async getDashboardStats(): Promise<any> {
    try {
      const db = await getDatabase();
      const total = await db.collection('applications').count();
      const pending = await db.collection('applications').where({ status: 'pending' }).count();
      const interview = await db.collection('applications').where({ status: 'interview' }).count();
      return {
        totalApplications: total.total || 0,
        pendingApplications: pending.total || 0,
        interviewApplications: interview.total || 0
      };
    } catch (err: any) {
      console.error('[applicationsApi.getDashboardStats] 失败:', err);
      return { totalApplications: 0, pendingApplications: 0, interviewApplications: 0 };
    }
  }
};
`,

  'interviews.ts': `/**
 * 面试模块 API
 */

import { getDatabase } from '../cloud';

export interface Interview {
  _id?: string;
  application_id: string;
  job_id: string;
  user_id: string;
  interview_time?: string;
  location?: string;
  status: 'scheduled' | 'completed' | 'cancelled';
  notes?: string;
  created_at?: string;
  updated_at?: string;
}

export const interviewsApi = {
  // 获取面试列表
  async getList(params?: any): Promise<any> {
    try {
      const db = await getDatabase();
      const result = await db.collection('interviews').get();
      return { list: result.data || [], total: result.data?.length || 0 };
    } catch (err: any) {
      console.error('[interviewsApi.getList] 失败:', err);
      return { list: [], total: 0 };
    }
  },

  // 创建面试
  async create(data: Partial<Interview>): Promise<Interview> {
    try {
      const db = await getDatabase();
      const interview = {
        ...data,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        status: 'scheduled'
      };

      const result = await db.collection('interviews').add(interview);
      return { _id: result.id, ...interview } as Interview;
    } catch (err: any) {
      console.error('[interviewsApi.create] 失败:', err);
      throw new Error(err.message || '创建面试失败');
    }
  }
};
`,

  'salaries.ts': `/**
 * 工资模块 API
 */

import { getDatabase } from '../cloud';

export interface Salary {
  _id?: string;
  employee_id: string;
  month: string;
  salary_type: 'monthly' | 'hourly' | 'piece';
  amount: number;
  deductions?: number;
  net_amount?: number;
  status: 'pending' | 'approved' | 'paid' | 'cancelled';
  created_at?: string;
  updated_at?: string;
}

export const salariesApi = {
  // 获取工资列表
  async getList(params?: any): Promise<any> {
    try {
      const db = await getDatabase();
      const result = await db.collection('salaries').get();
      return { list: result.data || [], total: result.data?.length || 0 };
    } catch (err: any) {
      console.error('[salariesApi.getList] 失败:', err);
      return { list: [], total: 0 };
    }
  },

  // 创建工资记录
  async create(data: Partial<Salary>): Promise<Salary> {
    try {
      const db = await getDatabase();
      const salary = {
        ...data,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        status: 'pending'
      };

      const result = await db.collection('salaries').add(salary);
      return { _id: result.id, ...salary } as Salary;
    } catch (err: any) {
      console.error('[salariesApi.create] 失败:', err);
      throw new Error(err.message || '创建工资记录失败');
    }
  }
};
`,

  'qrcode.ts': `/**
 * 二维码模块 API
 */

import { getDatabase } from '../cloud';

export interface QRCode {
  _id?: string;
  code: string;
  job_id: string;
  type: 'recruitment' | 'verification';
  is_used: boolean;
  used_by?: string;
  used_at?: string;
  created_at?: string;
  updated_at?: string;
}

export const qrcodeApi = {
  // 获取二维码列表
  async getList(params?: any): Promise<any> {
    try {
      const db = await getDatabase();
      const result = await db.collection('qrcodes').get();
      return { list: result.data || [], total: result.data?.length || 0 };
    } catch (err: any) {
      console.error('[qrcodeApi.getList] 失败:', err);
      return { list: [], total: 0 };
    }
  },

  // 创建二维码
  async create(data: Partial<QRCode>): Promise<QRCode> {
    try {
      const db = await getDatabase();
      const qrcode = {
        ...data,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        is_used: false
      };

      const result = await db.collection('qrcodes').add(qrcode);
      return { _id: result.id, ...qrcode } as QRCode;
    } catch (err: any) {
      console.error('[qrcodeApi.create] 失败:', err);
      throw new Error(err.message || '创建二维码失败');
    }
  }
};
`,

  'archives.ts': `/**
 * 档案模块 API
 */

import { getDatabase } from '../cloud';

export interface Archive {
  _id?: string;
  user_id: string;
  file_type: string;
  file_url: string;
  file_size?: number;
  description?: string;
  status: 'active' | 'archived' | 'deleted';
  created_at?: string;
  updated_at?: string;
}

export const archivesApi = {
  // 获取档案列表
  async getList(params?: any): Promise<any> {
    try {
      const db = await getDatabase();
      const result = await db.collection('archives').get();
      return { list: result.data || [], total: result.data?.length || 0 };
    } catch (err: any) {
      console.error('[archivesApi.getList] 失败:', err);
      return { list: [], total: 0 };
    }
  },

  // 创建档案
  async create(data: Partial<Archive>): Promise<Archive> {
    try {
      const db = await getDatabase();
      const archive = {
        ...data,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        status: 'active'
      };

      const result = await db.collection('archives').add(archive);
      return { _id: result.id, ...archive } as Archive;
    } catch (err: any) {
      console.error('[archivesApi.create] 失败:', err);
      throw new Error(err.message || '创建档案失败');
    }
  }
};
`,

  'bonus.ts': `/**
 * 奖金模块 API
 */

import { getDatabase } from '../cloud';

export interface Bonus {
  _id?: string;
  employee_id: string;
  amount: number;
  reason: string;
  bonus_type: 'performance' | 'annual' | 'special';
  issued_date?: string;
  status: 'pending' | 'approved' | 'paid' | 'cancelled';
  created_at?: string;
  updated_at?: string;
}

export const bonusApi = {
  // 获取奖金列表
  async getList(params?: any): Promise<any> {
    try {
      const db = await getDatabase();
      const result = await db.collection('bonuses').get();
      return { list: result.data || [], total: result.data?.length || 0 };
    } catch (err: any) {
      console.error('[bonusApi.getList] 失败:', err);
      return { list: [], total: 0 };
    }
  },

  // 创建奖金记录
  async create(data: Partial<Bonus>): Promise<Bonus> {
    try {
      const db = await getDatabase();
      const bonus = {
        ...data,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        status: 'pending'
      };

      const result = await db.collection('bonuses').add(bonus);
      return { _id: result.id, ...bonus } as Bonus;
    } catch (err: any) {
      console.error('[bonusApi.create] 失败:', err);
      throw new Error(err.message || '创建奖金记录失败');
    }
  }
};
`,

  'worktime.ts': `/**
 * 工时模块 API
 */

import { getDatabase } from '../cloud';

export interface WorkTime {
  _id?: string;
  employee_id: string;
  work_date: string;
  hours: number;
  work_type: 'regular' | 'overtime' | 'holiday';
  status: 'pending' | 'approved' | 'paid' | 'cancelled';
  created_at?: string;
  updated_at?: string;
}

export const worktimeApi = {
  // 获取工时列表
  async getList(params?: any): Promise<any> {
    try {
      const db = await getDatabase();
      const result = await db.collection('worktimes').get();
      return { list: result.data || [], total: result.data?.length || 0 };
    } catch (err: any) {
      console.error('[worktimeApi.getList] 失败:', err);
      return { list: [], total: 0 };
    }
  },

  // 创建工时记录
  async create(data: Partial<WorkTime>): Promise<WorkTime> {
    try {
      const db = await getDatabase();
      const worktime = {
        ...data,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        status: 'pending'
      };

      const result = await db.collection('worktimes').add(worktime);
      return { _id: result.id, ...worktime } as WorkTime;
    } catch (err: any) {
      console.error('[worktimeApi.create] 失败:', err);
      throw new Error(err.message || '创建工时记录失败');
    }
  }
};
`,

  'advances.ts': `/**
 * 工资垫付模块 API
 */

import { getDatabase } from '../cloud';

export interface Advance {
  _id?: string;
  employee_id: string;
  amount: number;
  advance_type: 'salary_advance' | 'special_advance';
  reason: string;
  advance_date?: string;
  repay_date?: string;
  status: 'pending' | 'approved' | 'paid' | 'cancelled';
  created_at?: string;
  updated_at?: string;
}

export const advancesApi = {
  // 获取垫付列表
  async getList(params?: any): Promise<any> {
    try {
      const db = await getDatabase();
      const result = await db.collection('advances').get();
      return { list: result.data || [], total: result.data?.length || 0 };
    } catch (err: any) {
      console.error('[advancesApi.getList] 失败:', err);
      return { list: [], total: 0 };
    }
  },

  // 创建垫付记录
  async create(data: Partial<Advance>): Promise<Advance> {
    try {
      const db = await getDatabase();
      const advance = {
        ...data,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        status: 'pending'
      };

      const result = await db.collection('advances').add(advance);
      return { _id: result.id, ...advance } as Advance;
    } catch (err: any) {
      console.error('[advancesApi.create] 失败:', err);
      throw new Error(err.message || '创建垫付记录失败');
    }
  }
};
`
};

// 执行写入
const results = {
  success: [],
  failed: []
};

Object.entries(filesContent).forEach(([filename, content]) => {
  const filePath = path.join(MODULES_DIR, filename);
  try {
    fs.writeFileSync(filePath, content, 'utf-8');
    results.success.push(filename);
    console.log(`✅ 已生成: ${filename}`);
  } catch (err) {
    results.failed.push({ file: filename, error: err.message });
    console.error(`❌ 失败: ${filename}`, err.message);
  }
});

// 输出报告
console.log('\n' + '='.repeat(60));
console.log('修复报告');
console.log('='.repeat(60));
console.log(`\n✅ 成功修复: ${results.success.length} 个文件`);
results.success.forEach(file => console.log(`  - ${file}`));

if (results.failed.length > 0) {
  console.log(`\n❌ 失败: ${results.failed.length} 个文件`);
  results.failed.forEach(item => console.log(`  - ${item.file}: ${item.error}`));
} else {
  console.log('\n🎉 所有文件修复成功！');
}

console.log('\n位置: ' + MODULES_DIR);
console.log('='.repeat(60));
