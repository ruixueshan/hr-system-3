const cloud = require('tcb-admin-node');

// 初始化云开发
cloud.init({
  env: 'cloud1-5glojms9a83c3457'
});

const db = cloud.database();

const testJobs = [
  {
    title: '食品厂普工',
    company: '达利食品',
    salary: '6000-8000元/月',
    location: '宿迁经开区',
    type: '全职',
    requirements: '18-45岁，身体健康',
    description: '食品加工车间操作工，负责生产线作业',
    tags: ['包吃住', '长白班', '缴纳五险'],
    status: 'active',
    hot: true,
    views: 156,
    createTime: new Date()
  },
  {
    title: '仓库分拣员',
    company: '圆通快递',
    salary: '5000-7000元/月',
    location: '宿迁经开区',
    type: '全职',
    requirements: '18-48岁，男女不限',
    description: '负责快递包裹分拣、扫码',
    tags: ['日结', '包住宿', '工作简单'],
    status: 'active',
    hot: true,
    views: 89,
    createTime: new Date()
  },
  {
    title: '玻璃厂操作工',
    company: '无双玻璃',
    salary: '5500-7500元/月',
    location: '睢宁凌城',
    type: '全职',
    requirements: '18-40岁，男工优先',
    description: '玻璃生产线操作，机器操控',
    tags: ['日结', '包吃住', '车间空调'],
    status: 'active',
    hot: false,
    views: 67,
    createTime: new Date()
  },
  {
    title: '电子厂焊工',
    company: '华天科技',
    salary: '7000-9000元/月',
    location: '南京浦口',
    type: '全职',
    requirements: '18-35岁，有焊工证优先',
    description: '电子产品焊接作业',
    tags: ['包吃住', '五险一金', '恒温车间'],
    status: 'active',
    hot: true,
    views: 123,
    createTime: new Date()
  },
  {
    title: '保安',
    company: '苏宿园区',
    salary: '4000-5000元/月',
    location: '苏宿园区',
    type: '全职',
    requirements: '20-45岁，身高170cm以上',
    description: '园区门岗值班，秩序维护',
    tags: ['长白班', '缴纳五险', '工作轻松'],
    status: 'active',
    hot: false,
    views: 45,
    createTime: new Date()
  },
  {
    title: '包装工',
    company: '可成科技',
    salary: '5000-6500元/月',
    location: '宿豫区',
    type: '全职',
    requirements: '18-42岁，手脚灵活',
    description: '产品包装、装箱',
    tags: ['包吃住', '坐班', '简单易学'],
    status: 'active',
    hot: false,
    views: 78,
    createTime: new Date()
  }
];

async function addTestData() {
  const collection = db.collection('jobs');
  
  for (const job of testJobs) {
    try {
      const result = await collection.add({
        ...job,
        createTime: db.serverDate(),
        updateTime: db.serverDate()
      });
      console.log(`✅ 添加成功: ${job.title}, id: ${result.id}`);
    } catch (err) {
      console.error(`❌ 添加失败: ${job.title}`, err);
    }
  }
  
  console.log('\n🎉 测试数据添加完成！');
}

addTestData();
