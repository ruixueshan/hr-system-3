/**
 * 创建候选人相关的数据库集合
 */
const tcb = require('tcb-admin-node');

const envId = 'zhanrui-02140214-6f4e9jcb7c96a25';

tcb.init({
  env: envId
});

const db = tcb.database();

async function createCollections() {
  console.log('开始创建数据库集合...\n');

  const collections = [
    {
      name: 'candidate_action_logs',
      description: '候选人动作记录'
    },
    {
      name: 'candidate_owners',
      description: '候选人归属历史'
    }
  ];

  for (const coll of collections) {
    try {
      console.log(`创建集合: ${coll.name}...`);
      
      const createRes = await db.createCollection(coll.name);
      console.log(`✓ 集合 ${coll.name} 创建成功`);
      
    } catch (err) {
      if (err.code === 'RESOURCE_ALREADY_EXISTS') {
        console.log(`⚠ 集合 ${coll.name} 已存在`);
      } else if (err.code === 'DATABASE_COLLECTION_EXIST') {
        console.log(`⚠ 集合 ${coll.name} 已存在`);
      } else {
        console.log(`✗ 集合 ${coll.name} 创建失败:`, err.message);
      }
    }
  }

  console.log('\n创建索引...\n');

  const indexes = [
    {
      collectionName: 'candidate_action_logs',
      indexes: [
        { name: 'idx_candidate_id', fields: [{ fieldName: 'candidate_id', order: 'asc' }] },
        { name: 'idx_action_type', fields: [{ fieldName: 'action_type', order: 'asc' }] },
        { name: 'idx_operator_id', fields: [{ fieldName: 'operator_id', order: 'asc' }] },
        { name: 'idx_related_job_id', fields: [{ fieldName: 'related_job_id', order: 'asc' }] },
        { name: 'idx_created_at_ts', fields: [{ fieldName: 'created_at_ts', order: 'desc' }] }
      ]
    },
    {
      collectionName: 'candidate_owners',
      indexes: [
        { name: 'idx_candidate_id', fields: [{ fieldName: 'candidate_id', order: 'asc' }] },
        { name: 'idx_owner_id', fields: [{ fieldName: 'owner_id', order: 'asc' }] },
        { name: 'idx_bind_at_ts', fields: [{ fieldName: 'bind_at_ts', order: 'desc' }] }
      ]
    }
  ];

  for (const idx of indexes) {
    try {
      console.log(`为集合 ${idx.collectionName} 创建索引...`);
      
      for (const index of idx.indexes) {
        try {
          await db.collection('_index').add({
            data: {
              CollectionName: idx.collectionName,
              IndexName: index.name,
              Fields: index.fields
            }
          });
          console.log(`  ✓ 索引 ${index.name} 创建成功`);
        } catch (err) {
          if (err.code === 'RESOURCE_ALREADY_EXISTS' || err.message?.includes('already exists')) {
            console.log(`  ⚠ 索引 ${index.name} 已存在`);
          } else {
            console.log(`  ✗ 索引 ${index.name} 创建失败:`, err.message);
          }
        }
      }
      
    } catch (err) {
      console.log(`✗ 索引创建失败:`, err.message);
    }
  }

  console.log('\n完成!');
}

createCollections().catch(console.error);
