/**
 * 初始化测试数据云函数
 */
const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();

function success(data = null, message = 'success') {
  return { code: 0, message, data };
}

const testJobs = [
  { title: '食品厂普工', company: '达利食品', salary: '6000-8000元/月', location: '宿迁经开区', type: '全职', requirements: '18-45岁，身体健康', description: '食品加工车间操作工', tags: ['包吃住', '长白班', '缴纳五险'], hot: true, views: 156 },
  { title: '仓库分拣员', company: '圆通快递', salary: '5000-7000元/月', location: '宿迁经开区', type: '全职', requirements: '18-48岁', description: '快递包裹分拣', tags: ['日结', '包住宿'], hot: true, views: 89 },
  { title: '玻璃厂操作工', company: '无双玻璃', salary: '5500-7500元/月', location: '睢宁凌城', type: '全职', requirements: '18-40岁', description: '玻璃生产线操作', tags: ['日结', '包吃住'], hot: false, views: 67 },
  { title: '电子厂焊工', company: '华天科技', salary: '7000-9000元/月', location: '南京浦口', type: '全职', requirements: '18-35岁', description: '电子产品焊接', tags: ['包吃住', '五险一金'], hot: true, views: 123 },
  { title: '保安', company: '苏宿园区', salary: '4000-5000元/月', location: '苏宿园区', type: '全职', requirements: '20-45岁', description: '园区门岗值班', tags: ['长白班', '缴纳五险'], hot: false, views: 45 },
  { title: '包装工', company: '可成科技', salary: '5000-6500元/月', location: '宿豫区', type: '全职', requirements: '18-42岁', description: '产品包装', tags: ['包吃住', '坐班'], hot: false, views: 78 }
];

exports.main = async (event, context) => {
  try {
    // 检查是否已有数据
    const existing = await db.collection('jobs').limit(1).get();
    if (existing.data.length > 0) {
      return success({ added: 0, total: existing.data.length }, '数据已存在');
    }

    // 添加测试数据
    let added = 0;
    for (const job of testJobs) {
      await db.collection('jobs').add({
        data: {
          ...job,
          is_recruiting: true,
          status: 'active',
          recruited: 0,
          createTime: db.serverDate(),
          updateTime: db.serverDate()
        }
      });
      added++;
    }

    return success({ added, total: added }, '测试数据添加成功');
  } catch (err) {
    return { code: 1, message: err.message };
  }
};
