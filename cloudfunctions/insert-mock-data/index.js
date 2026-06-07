const cloud = require('wx-server-sdk');

exports.main = async (event, context) => {
  cloud.init({
    env: cloud.DYNAMIC_CURRENT_ENV
  });
  const db = cloud.database();

  // 工具函数
  const randomDate = (start, end) => new Date(start.getTime() + Math.random() * (end.getTime() - start.getTime()));
  const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
  const randomPhone = () => '1' + ['3','5','7','8','9'][Math.floor(Math.random()*5)] + Math.random().toString().substr(2,9);
  const randomIdCard = () => {
    const area = ['3201','3202','3203','3204','3205'][Math.floor(Math.random()*5)];
    const year = 1990 + Math.floor(Math.random()*20);
    const month = String(1+Math.floor(Math.random()*12)).padStart(2,'0');
    const day = String(1+Math.floor(Math.random()*28)).padStart(2,'0');
    const seq = String(Math.floor(Math.random()*1000)).padStart(3,'0');
    return area + year + month + day + seq;
  };

  const companyNames = [
    '达利食品集团','韩电电器有限公司','双鹿冰箱有限公司','汉杰电气有限公司',
    '东贝机电有限公司','南京华天科技','京东方光电','嘉隆电子有限公司',
    '泗阳玻璃厂','苏宿园区机械厂','宿豫精密制造','盐城纺织集团',
    '徐州物流公司','宿迁电商产业园','南京软件科技','无锡物联网公司',
    '南通船舶重工','常州新能源材料','扬州化工园区','镇江汽车配件'
  ];
  const positions = [
    {name:'普工',dept:'生产部',hourlyRate:[15,16,17,18]},
    {name:'焊工',dept:'制造部',hourlyRate:[22,25,28,30]},
    {name:'质检员',dept:'质量部',hourlyRate:[16,17,18]},
    {name:'包装工',dept:'物流部',hourlyRate:[15,16]},
    {name:'叉车司机',dept:'物流部',hourlyRate:[18,20,22]},
    {name:'电工',dept:'设备部',hourlyRate:[22,25,28]},
    {name:'仓管员',dept:'仓储部',hourlyRate:[17,18,19]},
    {name:'清洁工',dept:'后勤部',hourlyRate:[12,13,14]}
  ];
  const userTypes = ['candidate','employee','admin'];
  const firstNames = ['张','王','李','赵','刘','陈','杨','黄','吴','周','徐','孙','马','朱','胡'];
  const lastNames = ['伟','芳','娜','秀英','敏','静','丽','强','磊','洋','艳','勇','军','杰','娟'];

  try {
    console.log('开始生成模拟数据...');

    // 生成企业
    const companies = companyNames.map((name, idx) => ({
      name,
      short_name: name.replace(/(集团|有限公司|公司|产业园|园区)/,''),
      industry: pick(['制造业','电子科技','物流仓储','食品饮料','化工材料','汽车配件','新能源']),
      address: `江苏省宿迁市${pick(['宿城区','宿豫区','沭阳县','泗阳县','泗洪县'])}${Math.floor(Math.random()*1000)}号`,
      contact_person: pick(['张经理','李主任','王厂长','刘总','陈主管']),
      contact_phone: randomPhone(),
      business_scope: '生产、加工、销售相关产品',
      status: 'active',
      tags: ['五险','包吃住','长白班','夜班有补贴'].slice(0, Math.floor(Math.random()*3)+2),
      created_by: 'system',
      created_at: new Date(),
      updated_at: new Date()
    }));
    // 批量插入企业，收集ID
    const companyIds = [];
    for (const company of companies) {
      const res = await db.collection('companies').add(company);
      companyIds.push(res._id);
    }
    console.log(`企业: ${companies.length}`);

    // 生成用户
    const users = [];
    for (let i=0; i<200; i++) {
      const isAdmin = i<10;
      const name = pick(firstNames) + pick(lastNames);
      users.push({
        openid: 'mock_'+Date.now()+'_'+i,
        unionid: 'mock_union_'+Date.now()+'_'+i,
        name,
        phone: randomPhone(),
        gender: Math.floor(Math.random()*2),
        avatar: 'https://thirdwx.qlogo.cn/mmopen/...',
        user_type: isAdmin ? 'admin' : 'candidate',
        role: isAdmin ? pick(['gm','deputy','hr','finance']) : null,
        status: 'normal',
        last_login: randomDate(new Date(2025,0,1), new Date()),
        created_at: randomDate(new Date(2025,0,1), new Date()),
        updated_at: new Date()
      });
    }
    // 批量插入用户，收集ID
    const userIds = [];
    for (const user of users) {
      const res = await db.collection('users').add(user);
      userIds.push(res._id);
    }
    console.log(`用户: ${users.length}`);

    // 生成岗位
    const jobs = [];
    for (let i=0; i<companyIds.length; i++) {
      const count = Math.floor(Math.random()*3)+1;
      for (let j=0; j<count; j++) {
        const pos = pick(positions);
        const hourly = pick(pos.hourlyRate);
        jobs.push({
          company_id: companyIds[i],
          position: pos.name,
          location: pick(['宿城区','宿豫区','经开区','高新区']),
          department: pos.dept,
          age_min: 18,
          age_max: 48,
          gender: pick(['不限','男','女']),
          education: pick(['不限','初中及以上','高中及以上']),
          experience: pick(['不限','1年以上','2年以上']),
          salary_type: 'hourly',
          hourly_rate: hourly,
          salary_min: hourly*8*26,
          salary_max: hourly*12*30,
          salary_remark: '按实际工时结算',
          purchase_hourly_rate: Math.floor(hourly*(0.8+Math.random()*0.4)),
          benefits: ['包吃住','夜班补贴','全勤奖','节假日福利'].slice(0, Math.floor(Math.random()*3)+2),
          vacancies: Math.floor(Math.random()*50)+10,
          recruited: 0,
          is_recruiting: true,
          status: 'active',
          description: `${pos.name}岗位，负责${pos.dept}相关工作`,
          work_content: '按岗位标准作业，服从管理',
          work_time: '8:00-20:00，两班倒',
          sort_order: j,
          created_by: 'system',
          created_at: new Date(),
          updated_at: new Date()
        });
      }
    }
    // 批量插入岗位，收集ID
    const jobIds = [];
    for (const job of jobs) {
      const res = await db.collection('jobs').add(job);
      jobIds.push(res._id);
    }
    console.log(`岗位: ${jobs.length}`);

    // 生成二维码
    const qrCodes = jobIds.map((jid, idx) => ({
      code: 'QC'+Date.now()+String(idx).padStart(4,'0'),
      job_id: jid,
      job_name: jobs[idx].position,
      recommender_id: null,
      recommender_name: null,
      company_id: companyIds[idx % companyIds.length],
      qr_url: `https://zhanrui.cloud/apply?job=${jid}`,
      max_uses: 999,
      used_count: 0,
      scan_count: Math.floor(Math.random()*100),
      expire_time: new Date(Date.now()+30*24*60*60*1000),
      status: 'active',
      created_by: 'system',
      created_at: new Date(),
      updated_at: new Date()
    }));
    // 批量插入二维码
    for (const qrCode of qrCodes) {
      await db.collection('qr_codes').add(qrCode);
    }
    console.log(`二维码: ${qrCodes.length}`);

    return {
      success: true,
      message: '模拟数据插入完成',
      counts: {
        companies: companies.length,
        users: users.length,
        jobs: jobs.length,
        qr_codes: qrCodes.length
      }
    };

  } catch (err) {
    console.error(err);
    return {
      success: false,
      error: err.message,
      stack: err.stack
    };
  }
};
