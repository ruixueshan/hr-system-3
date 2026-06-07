#!/usr/bin/env node
/**
 * HR 系统 3.0 - 模拟数据注入脚本
 * 用于小程序端测试
 */

const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.getEnv() });
const db = cloud.database();

// ============================================
// 工具函数
// ============================================
function randomChoice(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

function randomInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function randomPhone() {
  const prefix = ['13', '14', '15', '17', '18', '19'][randomInt(0, 5)];
  const suffix = String(randomInt(100000000, 999999999));
  return prefix + suffix;
}

function randomIdCard() {
  // 简化版随机身份证（仅格式正确）
  const area = ['310101', '320100', '320300', '320500', '321000', '321100'][randomInt(0, 5)];
  const year = randomInt(1970, 2005);
  const month = String(randomInt(1, 12)).padStart(2, '0');
  const day = String(randomInt(1, 28)).padStart(2, '0');
  const order = String(randomInt(100, 999));
  const check = ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9', 'X'][randomInt(0, 10)];
  return area + year + month + day + order + check;
}

function generateName() {
  const surnames = ['张', '王', '李', '赵', '刘', '陈', '杨', '黄', '周', '吴', '徐', '孙', '马', '朱', '胡'];
  const maleNames = ['伟', '强', '勇', '军', '磊', '涛', '明', '超', '鹏', '浩', '杰', '宇', '晨', '浩宇', '子轩'];
  const femaleNames = ['芳', '敏', '静', '丽', '艳', '娟', '玲', '萍', '秀英', '丽丽', '婷婷', '雪', '萌', '欣怡', '诗涵'];
  const surname = randomChoice(surnames);
  const isMale = Math.random() > 0.5;
  const nameList = isMale ? maleNames : femaleNames;
  const name = surname + randomChoice(nameList);
  return { name, gender: isMale ? 'male' : 'female' };
}

// ============================================
// 数据生成
// ============================================

/**
 * 生成企业数据
 */
function generateCompanies(count = 50) {
  const companies = [];
  const locations = [
    { district: '宿城区', address: '江苏省宿迁市宿城区幸福路263号' },
    { district: '宿豫区', address: '江苏省宿迁市宿豫区珠江路100号' },
    { district: '南京江宁区', address: '江苏省南京市江宁区秣陵街道诚信大道' },
    { district: '南京栖霞区', address: '江苏省南京市栖霞区尧化街道' },
    { district: '盐城亭湖区', address: '江苏省盐城市亭湖区希望大道' },
    { district: '徐州鼓楼区', address: '江苏省徐州市鼓楼区徐州经济技术开发区' }
  ];

  const industries = ['制造', '电子', '物流', '食品', '新能源', '机械', '纺织', '塑胶', '包装'];
  const scales = ['0-50人', '50-200人', '200-500人', '500-1000人', '1000人以上'];

  for (let i = 0; i < count; i++) {
    const location = randomChoice(locations);
    const industry = randomChoice(industries);
    const scale = randomChoice(scales);
    const companyNo = `JC${String(i + 1).padStart(4, '0')}`;

    companies.push({
      company_name: `${location.district}${industry}${randomChoice(['科技', '实业', '制造', '工贸', '电器'])}有限公司`,
      unified_social_credit_code: `91${String(randomInt(100000000000000, 999999999999999))}`,
      legal_person: randomChoice(['张三', '李四', '王五', '赵六', '孙七']),
      registered_capital: randomInt(100, 5000) + '万',
      address: location.address,
      business_scope: `从事${industry}领域的技术开发、生产、销售。`,
      industry,
      scale,
      status: 'active',
      contact_person: randomChoice(['单先生', '王小姐', '李经理', '刘主任']),
      contact_phone: randomPhone(),
      source: 'manual',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    });
  }

  return companies;
}

/**
 * 生成岗位数据
 */
function generateJobs(companies, countPerCompany = 5) {
  const jobs = [];

  const positions = [
    { name: '普工', category: '生产', hourly_rate: 18, age_range: [18, 48], gender: 'any' },
    { name: '操作工', category: '生产', hourly_rate: 20, age_range: [18, 45], gender: 'any' },
    { name: '质检员', category: '质检', hourly_rate: 22, age_range: [20, 40], gender: 'any' },
    { name: '包装工', category: '包装', hourly_rate: 17, age_range: [18, 50], gender: 'any' },
    { name: '叉车工', category: '物流', hourly_rate: 25, age_range: [22, 45], gender: 'any' },
    { name: '电工', category: '维修', hourly_rate: 28, age_range: [25, 48], gender: 'male' },
    { name: '焊工', category: '技术', hourly_rate: 32, age_range: [25, 48], gender: 'male' },
    { name: '仓管', category: '仓储', hourly_rate: 21, age_range: [20, 45], gender: 'any' },
    { name: '清洗工', category: '生产', hourly_rate: 19, age_range: [18, 50], gender: 'any' },
    { name: '配送员', category: '物流', hourly_rate: 23, age_range: [22, 45], gender: 'male' }
  ];

  const benefitsPool = [
    '包吃住', '白班', '夜班补贴', '五险', '节日福利', '年终奖', '全勤奖', '加班费'
  ];

  companies.forEach(company => {
    const posCount = randomInt(3, countPerCompany);

    for (let i = 0; i < posCount; i++) {
      const position = randomChoice(positions);
      const startTime = new Date();
      startTime.setDate(startTime.getDate() + randomInt(-30, 0));

      const vacancies = randomInt(10, 100);
      const recruited = randomInt(0, Math.floor(vacancies * 0.8));
      const ageRange = position.age_range;

      jobs.push({
        company_id: company._id,
        company_name: company.company_name,
        position: position.name,
        category: position.category,
        hourly_rate: position.hourly_rate,
        daily_hours: randomInt(8, 12),
        work_type: Math.random() > 0.5 ? 'long-term' : 'temp',
        work_schedule: ['两班倒', '长白班', '三班倒'][randomInt(0, 2)],
        location: company.address,
        age_min: ageRange[0],
        age_max: ageRange[1],
        gender: position.gender,
        education: randomChoice(['不限', '初中', '高中', '中专', '大专']),
        experience: randomChoice(['不限', '经验不限', '1年以上', '3年以上']),
        benefits: randomChoice([benefitsPool.slice(0, 4), benefitsPool.slice(2, 6), benefitsPool.slice(4, 8)]),
        description: `岗位职责：负责${position.name}相关工作。任职要求：年龄${ageRange[0]}-${ageRange[1]}岁，${position.gender === 'male' ? '男性' : position.gender === 'female' ? '女性' : '性别不限'}，身体健康，能吃苦耐劳。`,
        requirements: `1. 年龄${ageRange[0]}-${ageRange[1]}岁\n2. ${position.gender === 'male' ? '男' : position.gender === 'female' ? '女' : '性别不限'}\n3. 身体健康，服从管理`,
        salary_description: `计时工资：${position.hourly_rate}元/时，月综合收入${position.hourly_rate * 26 * 8} - ${position.hourly_rate * 30 * 10}元。`,
        vacancies,
        recruited,
        status: 'active',
        recruiter: 'system',
        expires_at: new Date(Date.now() + randomInt(7, 30) * 24 * 60 * 60 * 1000).toISOString(),
        created_at: startTime.toISOString(),
        updated_at: new Date().toISOString()
      });
    }
  });

  return jobs;
}

/**
 * 生成用户数据
 */
function generateUsers(count = 200) {
  const users = [];

  for (let i = 0; i < count; i++) {
    const { name, gender } = generateName();
    const phone = randomPhone();
    const id_card = randomIdCard();

    users.push({
      phone,
      name,
      id_card: id_card,
      gender,
      avatar: 'https://thirdwx.qlogo.cn/mmopen/vi_32/POgEwh4mIHO4nibH0KlMECNjjGxQUq24ZEaGT4poC6icRiccVGKSyXwibcPq4BWmiaIGuG1icwxaQX6grC9VemZoJ8rg/132',
      role: 'candidate',
      status: 'active',
      is_blacklisted: false,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    });
  }

  return users;
}

/**
 * 生成申请记录
 */
function generateApplications(jobs, users, count = 500) {
  const applications = [];
  const statuses = ['pending', 'approved', 'rejected', 'interviewed', 'hired'];
  const weights = [0.6, 0.1, 0.1, 0.1, 0.1]; // 大部分是待处理

  for (let i = 0; i < count; i++) {
    const job = randomChoice(jobs);
    const user = randomChoice(users);
    const status = statuses[Math.floor(Math.random() * statuses.length)];

    const random = Math.random();
    let final_status = 'pending';
    if (random < 0.6) final_status = 'pending';
    else if (random < 0.7) final_status = 'approved';
    else if (random < 0.8) final_status = 'rejected';
    else if (random < 0.9) final_status = 'interviewed';
    else final_status = 'hired';

    const createdAt = new Date(Date.now() - randomInt(0, 30) * 24 * 60 * 60 * 1000);

    applications.push({
      job_id: job._id,
      user_id: user._id,
      user_name: user.name,
      user_phone: user.phone,
      user_id_card: user.id_card,
      current_address: `江苏省宿迁市${['宿城区', '宿豫区', '沭阳县', '泗阳县', '泗洪县'][randomInt(0, 4)]}`,
      emergency_contact: randomChoice(['父亲', '母亲', '配偶']) + user.name,
      emergency_phone: randomPhone(),
      work_experience: randomChoice(['1-3年', '3-5年', '5-10年', '无经验']),
      status: final_status,
      remark: final_status === 'rejected' ? '不符合岗位要求' : '',
      reviewed_by: final_status !== 'pending' ? 'admin' : '',
      reviewed_at: final_status !== 'pending' ? new Date().toISOString() : null,
      created_at: createdAt.toISOString(),
      updated_at: new Date().toISOString()
    });
  }

  return applications;
}

/**
 * 生成员工档案
 */
function generateEmployees(applications, count = 100) {
  const employees = [];

  // 从已录用的申请中选取
  const hiredApps = applications.filter(a => a.status === 'hired').slice(0, count);

  hiredApps.forEach((app, idx) => {
    const hireDate = new Date(app.created_at);
    hireDate.setDate(hireDate.getDate() + randomInt(1, 14));

    employees.push({
      user_id: app.user_id,
      name: app.user_name,
      phone: app.user_phone,
      id_card: app.user_id_card,
      gender: randomChoice(['male', 'female']),
      company_id: app.job_id,
      position: '普工',
      department: '生产部',
      hire_date: hireDate.toISOString().split('T')[0],
      salary_standard: randomInt(18, 25),
      salary_type: 'hourly',
      status: 'active',
      worktime_status: 'normal',
      last_work_date: new Date().toISOString().split('T')[0],
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    });
  });

  return employees;
}

/**
 * 生成轮播图数据
 */
function generateBanners() {
  return [
    {
      id: 'banner_1',
      title: '高薪岗位',
      image: 'https://via.placeholder.com/750x300/667eea/ffffff?text=展瑞招聘',
      link: '/pages/index/index',
      position: 'home',
      sort: 1,
      status: 'active',
      created_at: new Date().toISOString()
    },
    {
      id: 'banner_2',
      title: '立即报名',
      image: 'https://via.placeholder.com/750x300/764ba2/ffffff?text=加入我们',
      link: '/pages/apply/apply',
      position: 'home',
      sort: 2,
      status: 'active',
      created_at: new Date().toISOString()
    },
    {
      id: 'banner_3',
      title: '查看工资',
      image: 'https://via.placeholder.com/750x300/667eea/ffffff?text=工资透明',
      link: '/pages/my/salaries/salaries',
      position: 'home',
      sort: 3,
      status: 'active',
      created_at: new Date().toISOString()
    }
  ];
}

// ============================================
// 主流程
// ============================================

async function main() {
  console.log('🚀 开始注入模拟数据...\n');

  try {
    // 1. 清理旧数据（可选）
    console.log('🧹 清理旧数据...');
    await Promise.all([
      db.collection('companies').remove({}),
      db.collection('jobs').remove({}),
      db.collection('users').remove({}),
      db.collection('applications').remove({}),
      db.collection('employees').remove({}),
      db.collection('banners').remove({})
    ]);
    console.log('✅ 旧数据清理完成\n');

    // 2. 生成企业
    console.log('🏢 生成企业数据...');
    const companies = generateCompanies(30);
    const companyResults = [];
    for (const company of companies) {
      const res = await db.collection('companies').add({ data: company });
      companyResults.push({ ...company, _id: res._id });
    }
    console.log(`✅ 已创建 ${companyResults.length} 家企业\n`);

    // 3. 生成岗位
    console.log('💼 生成岗位数据...');
    const jobs = generateJobs(companyResults, 8);
    for (const job of jobs) {
      await db.collection('jobs').add({ data: job });
    }
    console.log(`✅ 已创建 ${jobs.length} 个岗位\n`);

    // 4. 生成用户
    console.log('👥 生成用户数据...');
    const users = generateUsers(300);
    for (const user of users) {
      await db.collection('users').add({ data: user });
    }
    console.log(`✅ 已创建 ${users.length} 名用户\n`);

    // 5. 生成申请记录
    console.log('📝 生成申请记录...');
    const applications = generateApplications(jobs, users, 800);
    for (const app of applications) {
      await db.collection('applications').add({ data: app });
    }
    console.log(`✅ 已创建 ${applications.length} 条申请记录\n`);

    // 6. 生成员工档案
    console.log('📊 生成员工档案...');
    const employees = generateEmployees(applications, 150);
    for (const emp of employees) {
      await db.collection('employees').add({ data: emp });
    }
    console.log(`✅ 已创建 ${employees.length} 份员工档案\n`);

    // 7. 生成轮播图
    console.log('🎨 生成轮播图...');
    const banners = generateBanners();
    for (const banner of banners) {
      await db.collection('banners').add({ data: banner });
    }
    console.log(`✅ 已创建 ${banners.length} 张轮播图\n`);

    console.log('🎉 模拟数据注入完成！总计：');
    console.log(`   企业: ${companyResults.length}`);
    console.log(`   岗位: ${jobs.length}`);
    console.log(`   用户: ${users.length}`);
    console.log(`   申请: ${applications.length}`);
    console.log(`   员工: ${employees.length}`);
    console.log(`   轮播: ${banners.length}`);
    console.log('\n💡 您可以在 CloudBase 控制台查看数据：https://tcb.cloud.tencent.com/dev?envId=cloud1-5glojms9a83c3457#/db');

  } catch (err) {
    console.error('❌ 数据注入失败:', err);
    process.exit(1);
  }
}

main();
