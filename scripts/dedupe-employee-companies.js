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

function normalizeName(value) {
  return normalizeText(value).replace(/\s+/g, '');
}

function normalizePhone(value) {
  return normalizeText(value).replace(/\D+/g, '');
}

function normalizeIdCard(value) {
  return normalizeText(value).toUpperCase();
}

function normalizeDate(value) {
  if (!value) return '';
  if (typeof value === 'string') {
    const strict = value.trim().match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (strict) return `${strict[1]}-${strict[2]}-${strict[3]}`;
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toISOString().slice(0, 10);
}

function toTime(value) {
  if (!value) return 0;
  if (typeof value === 'object' && typeof value.getTime === 'function') return value.getTime();
  if (typeof value === 'object' && typeof value._seconds === 'number') return value._seconds * 1000;
  const parsed = new Date(value).getTime();
  return Number.isFinite(parsed) ? parsed : 0;
}

function relationStatusRank(item) {
  const status = normalizeText(item.status).toLowerCase();
  const leaveDate = normalizeDate(item.leave_date);
  if (status === 'active' && !leaveDate) return 300;
  if (!['resigned', 'left', 'inactive', 'disabled', 'archived'].includes(status) && !leaveDate) return 250;
  if (leaveDate) return 100;
  return 50;
}

function completenessScore(item) {
  return [
    item.job_id,
    item.job_name,
    item.rate_plan_id,
    item.rate_plan_name,
    item.settlement_mode,
    item.join_date,
    item.referrer_id,
    item.referrer_name
  ].filter((value) => normalizeText(value)).length;
}

function pickKeepRecord(list) {
  return [...list].sort((a, b) => {
    const statusDiff = relationStatusRank(b.relation) - relationStatusRank(a.relation);
    if (statusDiff) return statusDiff;
    const completenessDiff = completenessScore(b.relation) - completenessScore(a.relation);
    if (completenessDiff) return completenessDiff;
    const updateDiff = toTime(b.relation.updated_at || b.relation.created_at) - toTime(a.relation.updated_at || a.relation.created_at);
    if (updateDiff) return updateDiff;
    return normalizeText(a.relation._id).localeCompare(normalizeText(b.relation._id));
  })[0];
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

async function loadMap(collectionName) {
  const map = new Map();
  const total = await scanCollection(collectionName, async (items) => {
    for (const item of items) {
      if (item?._id) map.set(item._id, item);
    }
  });
  return { map, total };
}

function buildDuplicateKey(relation, employee, company) {
  const employeeNo = normalizeText(employee?.employee_no || relation.employee_no);
  const name = normalizeName(employee?.name || relation.name);
  const phone = normalizePhone(employee?.phone || relation.phone);
  const idCard = normalizeIdCard(employee?.id_card || relation.id_card);
  const companyId = normalizeText(relation.company_id || employee?.company_id || company?._id);

  if (!employeeNo || !name || !phone || !idCard || !companyId) return '';
  return [employeeNo, name, phone, idCard, companyId].join('__');
}

async function main() {
  console.log(`开始扫描在职关系重复数据，环境: ${ENV_ID}${APPLY ? '（执行删除）' : '（dry-run）'}`);

  const [{ map: employees, total: employeeTotal }, { map: companies, total: companyTotal }] = await Promise.all([
    loadMap('employees'),
    loadMap('companies')
  ]);

  const groups = new Map();
  let relationTotal = 0;
  let skipped = 0;

  relationTotal = await scanCollection('employee_companies', async (items) => {
    for (const relation of items) {
      const employee = employees.get(relation.employee_id);
      const company = companies.get(relation.company_id);
      const key = buildDuplicateKey(relation, employee, company);
      if (!key) {
        skipped += 1;
        continue;
      }
      const list = groups.get(key) || [];
      list.push({ relation, employee, company });
      groups.set(key, list);
    }
  });

  const duplicateGroups = [...groups.entries()]
    .map(([key, list]) => ({ key, list }))
    .filter((group) => group.list.length > 1);

  const deleteIds = [];
  const report = duplicateGroups.map((group) => {
    const keep = pickKeepRecord(group.list);
    const remove = group.list.filter((item) => item.relation._id !== keep.relation._id);
    deleteIds.push(...remove.map((item) => item.relation._id));
    const [employeeNo, name, phone, idCard, companyId] = group.key.split('__');
    return {
      employee_no: employeeNo,
      name,
      phone,
      id_card: idCard,
      company_id: companyId,
      company_name: keep.company?.name || keep.relation.company_name || '',
      total: group.list.length,
      keep_id: keep.relation._id,
      delete_ids: remove.map((item) => item.relation._id)
    };
  });

  console.log(`employees: ${employeeTotal}, companies: ${companyTotal}, employee_companies: ${relationTotal}`);
  console.log(`可判定重复组: ${duplicateGroups.length}, 将删除关系记录: ${deleteIds.length}, 因关键字段不完整跳过: ${skipped}`);
  console.log(JSON.stringify(report, null, 2));

  if (!APPLY) {
    console.log('dry-run 完成；确认无误后执行：node scripts/dedupe-employee-companies.js --apply');
    return;
  }

  for (const id of deleteIds) {
    await db.collection('employee_companies').doc(id).remove();
    console.log(`已删除 employee_companies/${id}`);
  }

  console.log(`清理完成，删除 ${deleteIds.length} 条重复在职关系。`);
}

main().catch((err) => {
  console.error('清理重复在职关系失败:', err);
  process.exit(1);
});
