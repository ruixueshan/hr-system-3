/**
 * 测试数据初始化工具
 * 直接在浏览器中调用来创建测试数据
 * 使用: window.seedTestData.createAll()
 */

import { getDatabase } from '@/api/cloud';

function randomInt(min: number, max: number) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function randomPhone() {
  const prefix = ['138', '139', '152', '157', '158', '159', '186', '187'][randomInt(0, 7)];
  return prefix + String(randomInt(10000000, 99999999));
}

function generateName() {
  const surnames = ['张', '王', '李', '赵', '刘', '陈', '杨', '黄', '周', '吴'];
  const male = ['伟', '强', '勇', '军', '磊', '涛', '明', '超', '鹏', '浩'];
  const female = ['芳', '敏', '静', '丽', '艳', '娟', '玲', '萍', '秀英', '婷'];
  const surname = surnames[randomInt(0, surnames.length - 1)];
  const isMale = Math.random() > 0.5;
  const givenName = isMale ? male[randomInt(0, male.length - 1)] : female[randomInt(0, female.length - 1)];
  return surname + givenName;
}

export const seedTestData = {
  // 创建测试企业
  async createCompanies(count: number = 5) {
    try {
      const db = await getDatabase();
      const industries = ['软件开发', '互联网', '电子商务', '教育培训', '金融服务'];
      const scales = ['50-200人', '200-500人', '500-1000人'];

      const companies = [];
      for (let i = 0; i < count; i++) {
        companies.push({
          name: `${generateName()}科技有限公司`,
          industry: industries[randomInt(0, industries.length - 1)],
          scale: scales[randomInt(0, scales.length - 1)],
          address: '上海市浦东新区',
          contact_person: generateName(),
          contact_phone: randomPhone(),
          status: 'active',
          created_at: new Date(),
          updated_at: new Date()
        });
      }

      // 批量插入
      for (const company of companies) {
        await db.collection('companies').add(company);
      }

      console.log(`✅ 已创建 ${count} 个测试企业`);
      return companies;
    } catch (err: any) {
      console.error('创建企业失败:', err);
      throw err;
    }
  },

  // 创建测试岗位
  async createJobs(count: number = 10) {
    try {
      const db = await getDatabase();
      const jobTitles = ['前端工程师', '后端工程师', '产品经理', '数据分析师', '测试工程师', '运维工程师', '设计师', '商务BD'];
      const locations = ['北京', '上海', '深圳', '杭州', '南京'];
      const salaries = ['15k-25k', '25k-35k', '35k-50k', '50k-80k'];

      const jobs = [];
      for (let i = 0; i < count; i++) {
        jobs.push({
          job_name: jobTitles[randomInt(0, jobTitles.length - 1)] + `_${i + 1}`,
          job_title: jobTitles[randomInt(0, jobTitles.length - 1)],
          company_id: `company_${randomInt(1, 5)}`,
          location: locations[randomInt(0, locations.length - 1)],
          salary: salaries[randomInt(0, salaries.length - 1)],
          description: '岗位职责：负责产品开发和维护',
          requirements: '要求：3年以上工作经验',
          status: 'active',
          is_recruiting: true,
          published_at: new Date(),
          created_at: new Date(),
          updated_at: new Date()
        });
      }

      // 批量插入
      for (const job of jobs) {
        await db.collection('jobs').add(job);
      }

      console.log(`✅ 已创建 ${count} 个测试岗位`);
      return jobs;
    } catch (err: any) {
      console.error('创建岗位失败:', err);
      throw err;
    }
  },

  // 创建测试应聘
  async createApplications(count: number = 20) {
    try {
      const db = await getDatabase();
      const statuses = ['pending', 'contacted', 'interview', 'passed', 'rejected'];
      const sources = ['招聘网站', '员工推荐', '学校招聘', '社交媒体', '猎头'];

      const applications = [];
      for (let i = 0; i < count; i++) {
        applications.push({
          candidate_name: generateName(),
          applicant_name: generateName(),
          job_id: `job_${randomInt(1, 10)}`,
          job_name: '前端工程师',
          job_title: '前端工程师',
          phone: randomPhone(),
          applicant_phone: randomPhone(),
          email: `candidate_${i}@test.com`,
          resume: '简历内容',
          status: statuses[randomInt(0, statuses.length - 1)],
          source: sources[randomInt(0, sources.length - 1)],
          created_at: new Date(Date.now() - randomInt(1, 30) * 24 * 60 * 60 * 1000),
          updated_at: new Date()
        });
      }

      // 批量插入
      for (const app of applications) {
        await db.collection('applications').add(app);
      }

      console.log(`✅ 已创建 ${count} 个测试应聘`);
      return applications;
    } catch (err: any) {
      console.error('创建应聘失败:', err);
      throw err;
    }
  },

  // 创建测试员工
  async createEmployees(count: number = 15) {
    try {
      const db = await getDatabase();
      const departments = ['技术部', '产品部', '运营部', '销售部', '人事部'];
      const positions = ['工程师', '经理', '总监', '专员', '主管'];

      const employees = [];
      for (let i = 0; i < count; i++) {
        employees.push({
          name: generateName(),
          phone: randomPhone(),
          department: departments[randomInt(0, departments.length - 1)],
          position: positions[randomInt(0, positions.length - 1)],
          salary: randomInt(8, 30) + 'k',
          status: ['probation', 'regular', 'resigned'][randomInt(0, 2)],
          hire_date: new Date(Date.now() - randomInt(1, 365) * 24 * 60 * 60 * 1000),
          company_id: `company_${randomInt(1, 5)}`,
          created_at: new Date(),
          updated_at: new Date()
        });
      }

      // 批量插入
      for (const emp of employees) {
        await db.collection('employees').add(emp);
      }

      console.log(`✅ 已创建 ${count} 个测试员工`);
      return employees;
    } catch (err: any) {
      console.error('创建员工失败:', err);
      throw err;
    }
  },

  // 创建所有测试数据
  async createAll() {
    try {
      console.log('🚀 开始创建测试数据...');
      
      await this.createCompanies(5);
      await this.createJobs(10);
      await this.createApplications(20);
      await this.createEmployees(15);

      console.log('✅ 所有测试数据创建完成！');
      console.log('📊 统计:');
      console.log('  - 5 个企业');
      console.log('  - 10 个岗位');
      console.log('  - 20 个应聘');
      console.log('  - 15 个员工');
      console.log('\n👉 请刷新页面查看数据');

      return true;
    } catch (err: any) {
      console.error('❌ 创建测试数据失败:', err);
      return false;
    }
  },

  // 清空所有测试数据
  async clearAll() {
    try {
      console.log('🗑️ 开始清空测试数据...');
      const db = await getDatabase();

      const collections = ['companies', 'jobs', 'applications', 'employees'];
      for (const col of collections) {
        try {
          const result = await db.collection(col).get();
          for (const doc of result.data) {
            await db.collection(col).doc(doc._id).remove();
          }
          console.log(`✅ 已清空 ${col}`);
        } catch (e) {
          console.warn(`⚠️ ${col} 清空失败`);
        }
      }

      console.log('✅ 所有数据已清空');
      return true;
    } catch (err: any) {
      console.error('❌ 清空数据失败:', err);
      return false;
    }
  }
};

// 暴露到全局作用域，方便在浏览器控制台调用
(window as any).seedTestData = seedTestData;
