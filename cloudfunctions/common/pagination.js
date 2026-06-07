/**
 * 通用分页查询工具
 * 统一 fetchAllDocuments / scanCollection 模式
 */

/**
 * 批量读取集合全部文档（自动分页）
 * @param {Object} query - db.collection(...).where(...) 查询对象
 * @param {number} batchSize - 每批大小，默认 100
 * @returns {Promise<Array>} 所有文档数组
 */
async function fetchAllDocuments(query, batchSize = 100) {
  const countRes = await query.count();
  const total = countRes.total || 0;
  const list = [];
  for (let offset = 0; offset < total; offset += batchSize) {
    const res = await query.skip(offset).limit(batchSize).get();
    list.push(...(res.data || []));
  }
  return list;
}

/**
 * 扫描集合并逐批处理（用于大数据量场景）
 * @param {Object} db - 数据库实例
 * @param {string} collectionName - 集合名
 * @param {Object} conditions - where 条件
 * @param {Function} handler - 逐批处理函数 (batch: Array) => Promise<void>
 * @param {number} batchSize - 每批大小，默认 100
 * @returns {Promise<number>} 处理的总记录数
 */
async function scanCollection(db, collectionName, conditions, handler, batchSize = 100) {
  let query = db.collection(collectionName);
  if (conditions && Object.keys(conditions).length) {
    query = query.where(conditions);
  }
  const countRes = await query.count();
  const total = countRes.total || 0;
  let processed = 0;

  for (let offset = 0; offset < total; offset += batchSize) {
    let batchQuery = db.collection(collectionName);
    if (conditions && Object.keys(conditions).length) {
      batchQuery = batchQuery.where(conditions);
    }
    const res = await batchQuery.skip(offset).limit(batchSize).get();
    const batch = res.data || [];
    if (batch.length && handler) {
      await handler(batch);
    }
    processed += batch.length;
  }

  return processed;
}

module.exports = {
  fetchAllDocuments,
  scanCollection
};
