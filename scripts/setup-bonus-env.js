const tcb = require('tcb-admin-node');

const ENV_ID = process.env.CLOUDBASE_ENV || 'cloud1-5glojms9a83c3457';
const DEFAULT_COEFFICIENT = Number(process.env.BONUS_DEFAULT_COEFFICIENT || 1);
const DEFAULT_START_MONTH = process.env.BONUS_RULE_START_MONTH || new Date().toISOString().slice(0, 7);
const DEFAULT_START_DATE = /^\d{4}-\d{2}-\d{2}$/.test(DEFAULT_START_MONTH)
  ? DEFAULT_START_MONTH
  : `${DEFAULT_START_MONTH}-01`;

tcb.init({ env: ENV_ID });

const db = tcb.database();

const REQUIRED_COLLECTIONS = ['recruitment_bonus_rules', 'audit_logs'];

async function ensureCollection(name) {
  try {
    await db.createCollection(name);
    console.log(`✓ 已创建集合: ${name}`);
    return 'created';
  } catch (err) {
    const message = String(err.message || '');
    if (
      err.code === 'RESOURCE_ALREADY_EXISTS' ||
      err.code === 'DATABASE_COLLECTION_EXIST' ||
      message.includes('already exists') ||
      message.includes('DATABASE_COLLECTION_EXIST')
    ) {
      console.log(`- 集合已存在: ${name}`);
      return 'exists';
    }
    throw err;
  }
}

async function ensureDefaultBonusRule() {
  const countRes = await db.collection('recruitment_bonus_rules').count();
  const total = Number(countRes.total || 0);
  if (total > 0) {
    console.log(`- recruitment_bonus_rules 已有 ${total} 条规则，跳过默认规则写入`);
    return { created: false, total };
  }

  const now = new Date().toISOString();
  const payload = {
    recommender_id: '',
    recommender_name: '系统默认规则',
    company_id: '',
    hourly_coefficient: DEFAULT_COEFFICIENT,
    bonus_period_type: 'long_term',
    bonus_period_months: 0,
    start_date: DEFAULT_START_DATE,
    end_date: null,
    start_month: DEFAULT_START_DATE.slice(0, 7),
    end_month: null,
    priority: 0,
    status: 'active',
    remark: '初始化兜底规则，请按实际业务尽快调整',
    created_by: 'setup-bonus-env',
    created_at: now,
    updated_at: now
  };

  const result = await db.collection('recruitment_bonus_rules').add({ data: payload });
  console.log(`✓ 已写入默认提成规则: ${result.id || result._id || 'unknown-id'}`);
  console.log(`  系数: ${DEFAULT_COEFFICIENT}`);
  console.log(`  生效日期: ${DEFAULT_START_DATE}`);
  return { created: true, total: 1, id: result.id || result._id || '' };
}

async function main() {
  console.log(`开始补齐提成环境，环境: ${ENV_ID}`);

  for (const name of REQUIRED_COLLECTIONS) {
    await ensureCollection(name);
  }

  const ruleResult = await ensureDefaultBonusRule();

  console.log('\n完成。');
  if (ruleResult.created) {
    console.log('当前已具备最小可运行提成规则。');
  } else {
    console.log('未改动现有提成规则。');
  }
}

main().catch((err) => {
  console.error('补齐提成环境失败:', err);
  process.exitCode = 1;
});