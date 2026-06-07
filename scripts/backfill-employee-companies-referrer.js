const fs = require('fs');
const path = require('path');
const tcb = require('tcb-admin-node');

const ENV_ID = process.env.CLOUDBASE_ENV || 'cloud1-5glojms9a83c3457';
const PAGE_SIZE = Number(process.env.PAGE_SIZE || 100);
const APPLY = process.argv.includes('--apply');
const authConfigPath = path.join(process.env.HOME || '', '.config/.cloudbase/auth.json');

if (!process.env.TENCENT_SECRET_ID || !process.env.TENCENT_SECRET_KEY) {
  try {
    if (fs.existsSync(authConfigPath)) {
      const authConfig = JSON.parse(fs.readFileSync(authConfigPath, 'utf8'));
      const credential = authConfig?.credential || {};
      if (credential.tmpSecretId && credential.tmpSecretKey) {
        process.env.TENCENT_SECRET_ID = credential.tmpSecretId;
        process.env.TENCENT_SECRET_KEY = credential.tmpSecretKey;
        if (credential.tmpToken) {
          process.env.TENCENT_SESSION_TOKEN = credential.tmpToken;
        }
      }
    }
  } catch (err) {
    console.warn('读取 CloudBase 本地凭证失败:', err.message);
  }
}

if (!process.env.TENCENT_SECRET_ID || !process.env.TENCENT_SECRET_KEY) {
  console.error('缺少腾讯云凭证，请先执行 tcb login 或设置 TENCENT_SECRET_ID/TENCENT_SECRET_KEY。');
  process.exit(1);
}

tcb.init({
  secretId: process.env.TENCENT_SECRET_ID,
  secretKey: process.env.TENCENT_SECRET_KEY,
  sessionToken: process.env.TENCENT_SESSION_TOKEN || undefined,
  env: ENV_ID
});

const db = tcb.database();

function normalizeText(value) {
  return String(value || '').trim();
}

function isEmpty(value) {
  return !normalizeText(value);
}

async function scanCollection(name, onChunk) {
  const countRes = await db.collection(name).count();
  const total = Number(countRes.total || 0);
  for (let skip = 0; skip < total; skip += PAGE_SIZE) {
    const res = await db.collection(name).skip(skip).limit(Math.min(PAGE_SIZE, total - skip)).get();
    const items = Array.isArray(res.data) ? res.data : [];
    if (!items.length) break;
    await onChunk(items);
  }
  return total;
}

async function loadEmployeeReferrerMap() {
  const map = new Map();
  const total = await scanCollection('employees', async (items) => {
    for (const item of items) {
      if (!item?._id) continue;
      map.set(item._id, {
        referrer_id: normalizeText(item.referrer_id),
        referrer_name: normalizeText(item.referrer_name)
      });
    }
  });
  return { map, total };
}

async function main() {
  console.log(`开始回填 employee_companies 推荐人字段，环境: ${ENV_ID}${APPLY ? '（执行写入）' : '（dry-run）'}`);

  const { map: employeeReferrerMap, total: employeeTotal } = await loadEmployeeReferrerMap();
  const updates = [];
  let relationTotal = 0;
  let missingEmployeeCount = 0;
  let sourceEmptyCount = 0;
  let alreadyCompleteCount = 0;

  relationTotal = await scanCollection('employee_companies', async (items) => {
    for (const relation of items) {
      const relationId = normalizeText(relation?._id || relation?.id);
      const employeeId = normalizeText(relation?.employee_id);
      if (!relationId || !employeeId) continue;

      const source = employeeReferrerMap.get(employeeId);
      if (!source) {
        missingEmployeeCount += 1;
        continue;
      }

      const sourceReferrerId = normalizeText(source.referrer_id);
      const sourceReferrerName = normalizeText(source.referrer_name);
      if (!sourceReferrerId && !sourceReferrerName) {
        sourceEmptyCount += 1;
        continue;
      }

      const relationReferrerId = normalizeText(relation.referrer_id);
      const relationReferrerName = normalizeText(relation.referrer_name);

      const patch = {};
      if (isEmpty(relationReferrerId) && sourceReferrerId) {
        patch.referrer_id = sourceReferrerId;
      }
      if (isEmpty(relationReferrerName) && sourceReferrerName) {
        patch.referrer_name = sourceReferrerName;
      }

      if (!Object.keys(patch).length) {
        alreadyCompleteCount += 1;
        continue;
      }

      patch.updated_at = new Date().toISOString();
      updates.push({
        relation_id: relationId,
        employee_id: employeeId,
        patch
      });
    }
  });

  console.log(`employees: ${employeeTotal}, employee_companies: ${relationTotal}`);
  console.log(`待回填记录: ${updates.length}, 已完整跳过: ${alreadyCompleteCount}, 员工不存在: ${missingEmployeeCount}, 员工源推荐人为空: ${sourceEmptyCount}`);

  if (updates.length) {
    console.log('回填样例(前10条):');
    updates.slice(0, 10).forEach((item) => {
      console.log(`- relation=${item.relation_id}, employee=${item.employee_id}, patch=${JSON.stringify(item.patch)}`);
    });
  }

  if (!APPLY) {
    console.log('dry-run 完成；确认无误后执行：node scripts/backfill-employee-companies-referrer.js --apply');
    return;
  }

  let success = 0;
  let fail = 0;
  for (const item of updates) {
    try {
      await db.collection('employee_companies').doc(item.relation_id).update(item.patch);
      success += 1;
      if (success % 100 === 0) {
        console.log(`已完成 ${success}/${updates.length}`);
      }
    } catch (err) {
      fail += 1;
      console.warn(`更新失败 relation=${item.relation_id}:`, err.message);
    }
  }

  console.log(`回填完成：成功 ${success}，失败 ${fail}`);
}

main().catch((err) => {
  console.error('回填 employee_companies 推荐人失败:', err);
  process.exit(1);
});
