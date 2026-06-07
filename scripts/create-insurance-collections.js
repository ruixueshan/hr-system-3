/**
 * 创建云工保保险管理模块集合
 */
const tcb = require('tcb-admin-node');

const envId = process.env.CLOUDBASE_ENV || 'cloud1-5glojms9a83c3457';

tcb.init({ env: envId });

const db = tcb.database();

const collections = [
  'insurance_provider_configs',
  'insurance_policies',
  'insurance_active_policies',
  'insurance_work_companies',
  'insurance_occupations',
  'insurance_company_mappings',
  'insurance_job_mappings',
  'employee_insurance_records',
  'insurance_off_employees',
  'insurance_batch_tasks',
  'insurance_batch_task_items',
  'insurance_change_requests',
  'insurance_sync_logs'
];

async function createCollection(name) {
  try {
    await db.createCollection(name);
    console.log(`✓ ${name} 创建成功`);
  } catch (err) {
    const message = err?.message || '';
    if (
      err?.code === 'RESOURCE_ALREADY_EXISTS'
      || err?.code === 'DATABASE_COLLECTION_EXIST'
      || message.includes('already exists')
      || message.includes('collection exists')
      || message.includes('Table exist')
    ) {
      console.log(`- ${name} 已存在`);
      return;
    }
    console.error(`✗ ${name} 创建失败: ${message}`);
    throw err;
  }
}

async function main() {
  console.log(`开始创建保险集合，环境：${envId}`);
  for (const name of collections) {
    await createCollection(name);
  }
  console.log('保险集合创建完成');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
