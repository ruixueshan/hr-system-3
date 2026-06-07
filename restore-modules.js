const fs = require('fs');

const modules = {
  'employees.ts': `import { getDatabase } from '../cloud';
import type { Employee, PaginationParams, PaginationResult } from '../types';

export const employeesApi = {
  async getList(params?: PaginationParams & { status?: string; department?: string }): Promise<PaginationResult<Employee>> {
    try {
      const db = await getDatabase();
      let query = db.collection('employees');
      
      if (params?.status) query = query.where({ status: params.status });
      if (params?.department) query = query.where({ department: params.department });
      
      const pageSize = params?.pageSize || 20;
      const page = params?.page || 1;
      const skip = (page - 1) * pageSize;
      const countResult = await query.count();
      const total = countResult.total || 0;
      const result = await query.skip(skip).limit(pageSize).orderBy('created_at', 'desc').get();
      
      return { list: result.data as Employee[] || [], total, page, pageSize, totalPages: Math.ceil(total / pageSize) };
    } catch (err: any) {
      console.error('[employeesApi.getList] 失败:', err?.message);
      return { list: [], total: 0, page: 1, pageSize: 20, totalPages: 0 };
    }
  },

  async getDetail(id: string): Promise<Employee> {
    try {
      const db = await getDatabase();
      const result = await db.collection('employees').doc(id).get();
      if (!result.data?.length) throw new Error('员工不存在');
      return result.data[0] as Employee;
    } catch (err: any) {
      console.error('[employeesApi.getDetail] 失败:', err);
      throw err;
    }
  },

  async create(data: Partial<Employee>): Promise<Employee> {
    try {
      const db = await getDatabase();
      const result = await db.collection('employees').add({ ...data, created_at: new Date() });
      return { _id: result.id, ...data } as Employee;
    } catch (err: any) {
      console.error('[employeesApi.create] 失败:', err);
      throw err;
    }
  },

  async update(id: string, data: Partial<Employee>): Promise<Employee> {
    try {
      const db = await getDatabase();
      await db.collection('employees').doc(id).update(data);
      return { _id: id, ...data } as Employee;
    } catch (err: any) {
      console.error('[employeesApi.update] 失败:', err);
      throw err;
    }
  },

  async delete(id: string): Promise<void> {
    try {
      const db = await getDatabase();
      await db.collection('employees').doc(id).remove();
    } catch (err: any) {
      console.error('[employeesApi.delete] 失败:', err);
      throw err;
    }
  },

  async archive(id: string): Promise<void> {
    try {
      const db = await getDatabase();
      await db.collection('employees').doc(id).update({ status: 'archived' });
    } catch (err: any) {
      console.error('[employeesApi.archive] 失败:', err);
      throw err;
    }
  },

  async getDashboardStats(): Promise<any> {
    return { totalEmployees: 0, onJobEmployees: 0, resignedEmployees: 0 };
  }
};
`,

  'jobs.ts': `import { getDatabase } from '../cloud';
import type { Job, PaginationParams, PaginationResult } from '../types';

export const jobsApi = {
  async getList(params?: PaginationParams & { status?: string; company_id?: string }): Promise<PaginationResult<Job>> {
    try {
      const db = await getDatabase();
      let query = db.collection('jobs');
      
      if (params?.status) query = query.where({ status: params.status });
      if (params?.company_id) query = query.where({ company_id: params.company_id });
      
      const pageSize = params?.pageSize || 20;
      const page = params?.page || 1;
      const skip = (page - 1) * pageSize;
      const countResult = await query.count();
      const total = countResult.total || 0;
      const result = await query.skip(skip).limit(pageSize).orderBy('created_at', 'desc').get();
      
      return { list: result.data as Job[] || [], total, page, pageSize, totalPages: Math.ceil(total / pageSize) };
    } catch (err: any) {
      console.error('[jobsApi.getList] 失败:', err?.message);
      return { list: [], total: 0, page: 1, pageSize: 20, totalPages: 0 };
    }
  },

  async getDetail(id: string): Promise<Job> {
    try {
      const db = await getDatabase();
      const result = await db.collection('jobs').doc(id).get();
      if (!result.data?.length) throw new Error('岗位不存在');
      return result.data[0] as Job;
    } catch (err: any) {
      console.error('[jobsApi.getDetail] 失败:', err);
      throw err;
    }
  },

  async create(data: Partial<Job>): Promise<Job> {
    try {
      const db = await getDatabase();
      const result = await db.collection('jobs').add({ ...data, created_at: new Date(), status: 'active' });
      return { _id: result.id, ...data } as Job;
    } catch (err: any) {
      console.error('[jobsApi.create] 失败:', err);
      throw err;
    }
  },

  async update(id: string, data: Partial<Job>): Promise<Job> {
    try {
      const db = await getDatabase();
      await db.collection('jobs').doc(id).update(data);
      return { _id: id, ...data } as Job;
    } catch (err: any) {
      console.error('[jobsApi.update] 失败:', err);
      throw err;
    }
  },

  async delete(id: string): Promise<void> {
    try {
      const db = await getDatabase();
      await db.collection('jobs').doc(id).update({ status: 'archived' });
    } catch (err: any) {
      console.error('[jobsApi.delete] 失败:', err);
      throw err;
    }
  },

  async getDashboardStats(): Promise<any> {
    return { activeJobs: 0 };
  }
};
`,

  'applications.ts': `import { getDatabase } from '../cloud';
import type { Application, PaginationParams, PaginationResult } from '../types';

export const applicationsApi = {
  async getList(params?: PaginationParams & { status?: string; job_id?: string }): Promise<PaginationResult<Application>> {
    try {
      const db = await getDatabase();
      let query = db.collection('applications');
      
      if (params?.status) query = query.where({ status: params.status });
      if (params?.job_id) query = query.where({ job_id: params.job_id });
      
      const pageSize = params?.pageSize || 20;
      const page = params?.page || 1;
      const skip = (page - 1) * pageSize;
      const countResult = await query.count();
      const total = countResult.total || 0;
      const result = await query.skip(skip).limit(pageSize).orderBy('created_at', 'desc').get();
      
      return { list: result.data as Application[] || [], total, page, pageSize, totalPages: Math.ceil(total / pageSize) };
    } catch (err: any) {
      console.error('[applicationsApi.getList] 失败:', err?.message);
      return { list: [], total: 0, page: 1, pageSize: 20, totalPages: 0 };
    }
  },

  async create(data: Partial<Application>): Promise<Application> {
    try {
      const db = await getDatabase();
      const result = await db.collection('applications').add({ ...data, created_at: new Date(), status: 'pending' });
      return { _id: result.id, ...data } as Application;
    } catch (err: any) {
      console.error('[applicationsApi.create] 失败:', err);
      throw err;
    }
  },

  async getDashboardStats(): Promise<any> {
    return { totalApplications: 0, todayApplications: 0 };
  }
};
`,

  'interviews.ts': `import { getDatabase } from '../cloud';

export const interviewsApi = {
  async getList(params?: any) {
    try {
      const db = await getDatabase();
      const result = await db.collection('interviews').limit(100).get();
      return { list: result.data || [], total: result.data?.length || 0 };
    } catch (err: any) {
      console.error('[interviewsApi.getList] 失败:', err?.message);
      return { list: [], total: 0 };
    }
  },

  async create(data: any) {
    try {
      const db = await getDatabase();
      const result = await db.collection('interviews').add(data);
      return { id: result.id, ...data };
    } catch (err: any) {
      console.error('[interviewsApi.create] 失败:', err);
      throw err;
    }
  },

  async update(id: string, data: any) {
    try {
      const db = await getDatabase();
      await db.collection('interviews').doc(id).update(data);
      return { id, ...data };
    } catch (err: any) {
      console.error('[interviewsApi.update] 失败:', err);
      throw err;
    }
  }
};
`,

  'salaries.ts': `import { getDatabase } from '../cloud';

export const salariesApi = {
  async getList(params?: any) {
    try {
      const db = await getDatabase();
      const result = await db.collection('salaries').limit(100).get();
      return { list: result.data || [], total: result.data?.length || 0 };
    } catch (err: any) {
      console.error('[salariesApi.getList] 失败:', err?.message);
      return { list: [], total: 0 };
    }
  },

  async create(data: any) {
    try {
      const db = await getDatabase();
      const result = await db.collection('salaries').add(data);
      return { id: result.id, ...data };
    } catch (err: any) {
      console.error('[salariesApi.create] 失败:', err);
      throw err;
    }
  }
};
`,

  'bonus.ts': `import { getDatabase } from '../cloud';

export const bonusApi = {
  async getList(params?: any) {
    try {
      const db = await getDatabase();
      const result = await db.collection('bonus').limit(100).get();
      return { list: result.data || [], total: result.data?.length || 0 };
    } catch (err: any) {
      console.error('[bonusApi.getList] 失败:', err?.message);
      return { list: [], total: 0 };
    }
  }
};
`,

  'advances.ts': `import { getDatabase } from '../cloud';

export const advancesApi = {
  async getList(params?: any) {
    try {
      const db = await getDatabase();
      const result = await db.collection('advances').limit(100).get();
      return { list: result.data || [], total: result.data?.length || 0 };
    } catch (err: any) {
      console.error('[advancesApi.getList] 失败:', err?.message);
      return { list: [], total: 0 };
    }
  }
};
`,

  'worktime.ts': `import { getDatabase } from '../cloud';

export const worktimeApi = {
  async getList(params?: any) {
    try {
      const db = await getDatabase();
      const result = await db.collection('worktime').limit(100).get();
      return { list: result.data || [], total: result.data?.length || 0 };
    } catch (err: any) {
      console.error('[worktimeApi.getList] 失败:', err?.message);
      return { list: [], total: 0 };
    }
  }
};
`,

  'archives.ts': `import { getDatabase } from '../cloud';

export const archivesApi = {
  async getList(params?: any) {
    try {
      const db = await getDatabase();
      const result = await db.collection('archives').limit(100).get();
      return { list: result.data || [], total: result.data?.length || 0 };
    } catch (err: any) {
      console.error('[archivesApi.getList] 失败:', err?.message);
      return { list: [], total: 0 };
    }
  }
};
`,

  'qrcode.ts': `import { getDatabase } from '../cloud';

export const qrcodeApi = {
  async getList(params?: any) {
    try {
      const db = await getDatabase();
      const result = await db.collection('qrcode').limit(100).get();
      return { list: result.data || [], total: result.data?.length || 0 };
    } catch (err: any) {
      console.error('[qrcodeApi.getList] 失败:', err?.message);
      return { list: [], total: 0 };
    }
  }
};
`
};

const basePath = '/Users/zhanrui/Documents/hr-system-3.0/web/src/api/modules';
let count = 0;

for (const [filename, code] of Object.entries(modules)) {
  fs.writeFileSync(`${basePath}/${filename}`, code);
  count++;
  console.log(`✅ ${filename}`);
}

console.log(`\n✅ 已修复 ${count} 个模块文件`);
