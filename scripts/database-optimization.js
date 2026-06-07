/**
 * 数据库优化脚本
 * 用途：创建必要的索引以优化查询性能
 * 
 * 执行步骤：
 * 1. 在 CloudBase 控制台的数据库集合管理中创建以下索引
 * 2. 或通过 CloudBase SDK 调用以下代码
 */

const cloud = require('wx-server-sdk');
cloud.init({ env: process.env.ENV_ID || 'cloud1-5glojms9a83c3457' });
const db = cloud.database();

/**
 * 创建所有必要的索引
 */
async function createAllIndexes() {
  console.log('[DatabaseOptimization] 开始创建数据库索引...\n');

  const indexesConfig = [
    {
      collection: 'worktime_monthly_summaries',
      name: 'idx_summary_query',
      fields: [
        { employee_id: 1 },
        { company_id: 1 },
        { year_month: 1 },
        { status: 1 }
      ],
      description: '用于月结工时汇总查询'
    },
    {
      collection: 'worktime_monthly_summaries',
      name: 'idx_company_month',
      fields: [
        { company_id: 1 },
        { year_month: 1 },
        { status: 1 }
      ],
      description: '用于企业+月份的汇总查询'
    },
    {
      collection: 'salaries',
      name: 'idx_salary_query',
      fields: [
        { company_id: 1 },
        { settlement_mode: 1 },
        { year: 1 },
        { month: 1 },
        { status: 1 }
      ],
      description: '用于薪资记录查询'
    },
    {
      collection: 'salaries',
      name: 'idx_employee_salary',
      fields: [
        { employee_id: 1 },
        { company_id: 1 },
        { year_month: 1 }
      ],
      description: '用于员工薪资查询'
    },
    {
      collection: 'insurance_ledgers',
      name: 'idx_insurance_month',
      fields: [
        { employee_id: 1 },
        { company_id: 1 },
        { insurance_month: 1 }
      ],
      description: '用于保险账本查询'
    },
    {
      collection: 'salary_insurance_deductions',
      name: 'idx_deduction_query',
      fields: [
        { ledger_id: 1 },
        { source_type: 1 },
        { source_id: 1 }
      ],
      description: '用于保险扣减查询'
    },
    {
      collection: 'system_locks',
      name: 'idx_lock_query',
      fields: [
        { lock_key: 1 },
        { expires_at: 1 }
      ],
      description: '用于并发锁查询'
    },
    {
      collection: 'worktimes',
      name: 'idx_worktime_query',
      fields: [
        { employee_id: 1 },
        { company_id: 1 },
        { work_date: 1 },
        { status: 1 }
      ],
      description: '用于日工时记录查询'
    }
  ];

  // 输出创建索引的 CloudBase 控制台指令
  console.log('═══════════════════════════════════════════════════════════');
  console.log('【CloudBase 控制台手动创建索引指令】');
  console.log('═══════════════════════════════════════════════════════════\n');

  for (const config of indexesConfig) {
    console.log(`【集合】${config.collection}`);
    console.log(`【索引名】${config.name}`);
    console.log(`【字段】${config.fields.map((f) => Object.keys(f)[0] + ':' + Object.values(f)[0]).join(', ')}`);
    console.log(`【描述】${config.description}`);
    console.log('---\n');
  }

  console.log('═══════════════════════════════════════════════════════════');
  console.log('【CloudBase SDK 创建索引代码】');
  console.log('═══════════════════════════════════════════════════════════\n');

  // 使用 SDK 创建索引
  const successCount = 0;
  const failCount = 0;

  for (const config of indexesConfig) {
    try {
      // CloudBase 暂不支持直接通过 SDK 创建索引，需通过管理端
      console.log(`✓ ${config.collection}.${config.name} - 请在控制台手动创建`);
    } catch (err) {
      console.error(`✗ ${config.collection}.${config.name} 创建失败:`, (err as any).message);
    }
  }

  console.log(
    `\n【总结】请在 CloudBase 控制台手动创建以上 ${indexesConfig.length} 个索引以优化查询性能。`
  );
}

/**
 * 初始化 system_locks 集合（如果不存在）
 */
async function initSystemLocksCollection() {
  console.log('\n[DatabaseOptimization] 检查 system_locks 集合...\n');

  try {
    // 尝试查询，如果集合不存在会抛出错误
    const res = await db.collection('system_locks').limit(1).get();
    console.log('✓ system_locks 集合已存在');
    return;
  } catch (err: any) {
    if ((err as any).message.includes('not found') || (err as any).message.includes('does not exist')) {
      console.log('✓ system_locks 集合不存在，需要在 CloudBase 控制台创建\n');
      console.log('集合设置：');
      console.log('- 集合名: system_locks');
      console.log('- 字段:');
      console.log('  - lock_key: String (必需)');
      console.log('  - company_id: String');
      console.log('  - year: Number');
      console.log('  - month: Number');
      console.log('  - settlement_mode: String');
      console.log('  - operator_id: String');
      console.log('  - operator_name: String');
      console.log('  - created_at: Date');
      console.log('  - expires_at: Date (用于自动清理过期锁)');
      console.log('  - _id: String (自动生成)');
    } else {
      console.error('✗ 查询异常:', (err as any).message);
    }
  }
}

/**
 * 清理过期的锁（可定期执行）
 */
async function cleanupExpiredLocks() {
  console.log('\n[DatabaseOptimization] 清理过期的锁...\n');

  try {
    const now = new Date();
    const result = await db
      .collection('system_locks')
      .where({
        expires_at: db.command.lt(now)
      })
      .remove();

    console.log(`✓ 已清理 ${(result as any).deleted || 0} 条过期锁记录`);
  } catch (err: any) {
    console.error('✗ 清理失败:', (err as any).message);
  }
}

// 执行所有初始化步骤
async function main() {
  console.log('【HR系统薪资模块数据库优化】\n');
  console.log(`时间: ${new Date().toISOString()}\n`);

  await createAllIndexes();
  await initSystemLocksCollection();
  await cleanupExpiredLocks();

  console.log('\n【完成】数据库优化脚本执行完毕。');
}

// 执行
main().catch((err) => {
  console.error('执行错误:', err);
  process.exit(1);
});

module.exports = {
  createAllIndexes,
  initSystemLocksCollection,
  cleanupExpiredLocks
};
