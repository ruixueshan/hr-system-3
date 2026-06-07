/**
 * 数据归档模块
 * 定时任务：每日凌晨 2:00 执行
 * 将历史数据迁移到归档表
 */
const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

function success(data = null, message = 'success') {
  return { code: 0, message, data };
}

function error(code = 1, message = 'error', data = null) {
  return { code, message, data };
}
const db = cloud.database();

exports.main = async (event, context) => {
  const { action } = event;

  try {
    switch (action) {
      case 'archive-worktime':
        return archiveWorktime();
      case 'archive-salaries':
        return archiveSalaries();
      case 'archive-interviews':
        return archiveInterviews();
      case 'run-all':
        return runAllArchives();
      default:
        return error(400, '不支持的操作');
    }
  } catch (err) {
    console.error('归档模块错误:', err);
    return error(500, err.message);
  }
};

/**
 * 归档工时记录（超过6个月）
 */
async function archiveWorktime() {
  const monthsToKeep = 6; // 保留近6个月
  const cutoffDate = new Date();
  cutoffDate.setMonth(cutoffDate.getMonth() - monthsToKeep);
  const cutoffStr = cutoffDate.toISOString().split('T')[0];

  // 查找需要归档的记录
  const query = db.collection('worktime_records')
    .where({ work_date: db.command.lt(cutoffStr) });

  const totalRes = await query.count();
  const total = totalRes.total;

  if (total === 0) {
    return success(null, '无需归档');
  }

  // 分批迁移
  const batchSize = 500;
  let archived = 0;

  for (let page = 0; ; page++) {
    const records = await query.skip(page * batchSize).limit(batchSize).get();

    if (!records.data || records.data.length === 0) {
      break;
    }

    // 写入归档表
    await db.collection('worktime_records_archive').add(records.data);

    // 从原表删除
    const ids = records.data.map(r => r._id);
    await db.collection('worktime_records')
      .where({ _id: db.command.in(ids) })
      .remove();

    archived += records.data.length;
  }

  return success(null, `归档完成，共迁移 ${archived} 条记录`);
}

/**
 * 归档薪资记录（超过12个月）
 */
async function archiveSalaries() {
  const monthsToKeep = 12;
  const cutoffDate = new Date();
  cutoffDate.setMonth(cutoffDate.getMonth() - monthsToKeep);
  const cutoffYear = cutoffDate.getFullYear();
  const cutoffMonth = cutoffDate.getMonth() + 1;

  const query = db.collection('salaries').where({
    $or: [
      { year: { $lt: cutoffYear } },
      { year: cutoffYear, month: { $lt: cutoffMonth } }
    ]
  });

  const totalRes = await query.count();
  const total = totalRes.total;

  if (total === 0) {
    return success(null, '无需归档');
  }

  const batchSize = 500;
  let archived = 0;

  for (let page = 0; ; page++) {
    const records = await query.skip(page * batchSize).limit(batchSize).get();

    if (!records.data || records.data.length === 0) {
      break;
    }

    await db.collection('salaries_archive').add(records.data);
    const ids = records.data.map(r => r._id);
    await db.collection('salaries').where({ _id: db.command.in(ids) }).remove();

    archived += records.data.length;
  }

  return success(null, `归档完成，共迁移 ${archived} 条记录`);
}

/**
 * 归档面试记录（超过12个月）
 */
async function archiveInterviews() {
  const cutoffDate = new Date();
  cutoffDate.setMonth(cutoffDate.getMonth() - 12);
  const cutoffStr = cutoffDate.toISOString().split('T')[0];

  const query = db.collection('interviews')
    .where({ interview_date: db.command.lt(cutoffStr) });

  const totalRes = await query.count();
  const total = totalRes.total;

  if (total === 0) {
    return success(null, '无需归档');
  }

  const batchSize = 500;
  let archived = 0;

  for (let page = 0; ; page++) {
    const records = await query.skip(page * batchSize).limit(batchSize).get();

    if (!records.data || records.data.length === 0) {
      break;
    }

    await db.collection('interviews_archive').add(records.data);
    const ids = records.data.map(r => r._id);
    await db.collection('interviews').where({ _id: db.command.in(ids) }).remove();

    archived += records.data.length;
  }

  return success(null, `归档完成，共迁移 ${archived} 条记录`);
}

/**
 * 执行所有归档任务
 */
async function runAllArchives() {
  const results = [];

  results.push(await archiveWorktime());
  results.push(await archiveSalaries());
  results.push(await archiveInterviews());

  return success({ results }, '所有归档任务完成');
}
