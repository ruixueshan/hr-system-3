/**
 * 初始化候选人相关数据库集合
 */
const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

const db = cloud.database();

async function createCollectionIfNotExists(name) {
  try {
    await db.createCollection(name);
    console.log(`Collection ${name} created successfully`);
    return { success: true, collection: name, action: 'created' };
  } catch (err) {
    if (err.code === 'RESOURCE_ALREADY_EXISTS' || err.code === 'DATABASE_COLLECTION_EXIST') {
      console.log(`Collection ${name} already exists`);
      return { success: true, collection: name, action: 'exists' };
    }
    console.error(`Error creating collection ${name}:`, err);
    return { success: false, collection: name, error: err.message };
  }
}

async function createIndex(collectionName, indexName, fields) {
  try {
    const result = await db.collection('_index').add({
      data: {
        CollectionName: collectionName,
        IndexName: indexName,
        Fields: fields
      }
    });
    console.log(`Index ${indexName} on ${collectionName} created`);
    return { success: true, index: indexName, collection: collectionName, action: 'created' };
  } catch (err) {
    if (err.code === 'RESOURCE_ALREADY_EXISTS' || err.message?.includes('already exists')) {
      return { success: true, index: indexName, collection: collectionName, action: 'exists' };
    }
    console.error(`Error creating index ${indexName}:`, err);
    return { success: false, index: indexName, collection: collectionName, error: err.message };
  }
}

async function ensureDefaultBonusRule({ coefficient = 1, startMonth = new Date().toISOString().slice(0, 7) } = {}) {
  const countRes = await db.collection('recruitment_bonus_rules').count();
  const total = Number(countRes.total || 0);
  if (total > 0) {
    return { success: true, action: 'skip', total, reason: '已有提成规则' };
  }

  const startDate = /^\d{4}-\d{2}-\d{2}$/.test(String(startMonth || ''))
    ? String(startMonth)
    : `${String(startMonth || new Date().toISOString().slice(0, 7))}-01`;

  const result = await db.collection('recruitment_bonus_rules').add({
    data: {
      recommender_id: '',
      recommender_name: '系统默认规则',
      company_id: '',
      calculation_mode: 'hourly',
      hourly_coefficient: Number(coefficient || 1),
      service_fee_rate: 0,
      gross_salary_rate: 0,
      bonus_period_type: 'long_term',
      bonus_period_months: 0,
      start_date: startDate,
      end_date: null,
      start_month: startDate.slice(0, 7),
      end_month: null,
      priority: 0,
      status: 'active',
      remark: '初始化兜底规则，请按实际业务尽快调整',
      created_by: 'init-collections',
      created_at: db.serverDate(),
      updated_at: db.serverDate()
    }
  });

  return { success: true, action: 'created', id: result.id, coefficient: Number(coefficient || 1), start_date: startDate };
}

async function initBonusEnvironment(event = {}) {
  const results = {
    collections: [],
    bonusRule: null
  };

  for (const collName of ['recruitment_bonus_rules', 'recruitment_bonus_batches', 'recruitment_bonuses', 'audit_logs']) {
    const result = await createCollectionIfNotExists(collName);
    results.collections.push(result);
  }

  results.bonusRule = await ensureDefaultBonusRule({
    coefficient: event.coefficient,
    startMonth: event.start_month
  });

  return {
    code: 0,
    message: '提成环境初始化完成',
    data: results
  };
}

exports.main = async (event) => {
  if (event?.action === 'bonus-env') {
    return initBonusEnvironment(event);
  }

  console.log('Starting collection initialization...');
  
  const results = {
    collections: [],
    indexes: []
  };

  // Create collections
  const collectionsToCreate = ['candidate_action_logs', 'candidate_owners', 'candidate_remarks'];
  
  for (const collName of collectionsToCreate) {
    const result = await createCollectionIfNotExists(collName);
    results.collections.push(result);
  }

  // Create indexes for candidate_action_logs
  const actionLogIndexes = [
    { name: 'idx_candidate_id', fields: [{ fieldName: 'candidate_id', order: 'asc' }] },
    { name: 'idx_action_type', fields: [{ fieldName: 'action_type', order: 'asc' }] },
    { name: 'idx_operator_id', fields: [{ fieldName: 'operator_id', order: 'asc' }] },
    { name: 'idx_related_job_id', fields: [{ fieldName: 'related_job_id', order: 'asc' }] },
    { name: 'idx_created_at_ts', fields: [{ fieldName: 'created_at_ts', order: 'desc' }] }
  ];

  for (const idx of actionLogIndexes) {
    const result = await createIndex('candidate_action_logs', idx.name, idx.fields);
    results.indexes.push(result);
  }

  // Create indexes for candidate_owners
  const ownerIndexes = [
    { name: 'idx_candidate_id', fields: [{ fieldName: 'candidate_id', order: 'asc' }] },
    { name: 'idx_owner_id', fields: [{ fieldName: 'owner_id', order: 'asc' }] },
    { name: 'idx_bind_at_ts', fields: [{ fieldName: 'bind_at_ts', order: 'desc' }] }
  ];

  for (const idx of ownerIndexes) {
    const result = await createIndex('candidate_owners', idx.name, idx.fields);
    results.indexes.push(result);
  }

  // Create indexes for candidate_remarks
  const remarkIndexes = [
    { name: 'idx_candidate_id', fields: [{ fieldName: 'candidate_id', order: 'asc' }] },
    { name: 'idx_category', fields: [{ fieldName: 'category', order: 'asc' }] },
    { name: 'idx_created_at', fields: [{ fieldName: 'created_at', order: 'desc' }] }
  ];

  for (const idx of remarkIndexes) {
    const result = await createIndex('candidate_remarks', idx.name, idx.fields);
    results.indexes.push(result);
  }

  console.log('Collection initialization completed:', JSON.stringify(results, null, 2));

  return {
    code: 0,
    message: '初始化完成',
    data: results
  };
};
