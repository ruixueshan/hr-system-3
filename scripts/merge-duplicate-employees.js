const fs = require('fs');
const tcb = require('tcb-admin-node');

const ENV_ID = process.env.CLOUDBASE_ENV || 'cloud1-5glojms9a83c3457';
const PAGE_SIZE = Number(process.env.PAGE_SIZE || 100);
const DRY_RUN = process.argv.includes('--dry-run');

const authConfigPath = '/Users/zhanrui/.config/.cloudbase/auth.json';

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
const _ = db.command;

const REFERENCE_COLLECTIONS = [
  { name: 'users', field: 'employee_id', extraUpdate: (doc, canonical) => ({ employee_no: canonical.employee_no || doc.employee_no || '' }) },
  { name: 'employee_companies', field: 'employee_id' },
  { name: 'worktimes', field: 'employee_id' },
  { name: 'worktime_monthly_summaries', field: 'employee_id' },
  { name: 'salaries', field: 'employee_id' },
  { name: 'salary_advances', field: 'employee_id' },
  { name: 'salary_insurance_ledgers', field: 'employee_id' },
  { name: 'salary_insurance_deductions', field: 'employee_id' },
  { name: 'personal_rewards', field: 'employee_id' },
  { name: 'recruitment_bonuses', field: 'employee_id' },
  { name: 'archives', field: 'employee_id' },
  { name: 'candidate_action_logs', field: 'related_employee_id' }
];

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

    const loose = value.trim().match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})/);
    if (loose) {
      return `${loose[1]}-${String(Number(loose[2])).padStart(2, '0')}-${String(Number(loose[3])).padStart(2, '0')}`;
    }
  }

  let timestamp = value;
  if (typeof value === 'object') {
    if (typeof value.getTime === 'function') {
      timestamp = value.getTime();
    } else if (typeof value._seconds === 'number') {
      timestamp = value._seconds * 1000;
    }
  }

  if (typeof timestamp === 'number' && timestamp < 10000000000) {
    timestamp *= 1000;
  }

  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) return '';
  return date.toISOString().slice(0, 10);
}

function toTimestamp(value) {
  const normalized = normalizeDate(value);
  if (!normalized) return Number.MAX_SAFE_INTEGER;
  return new Date(`${normalized}T00:00:00+08:00`).getTime();
}

function pickFirstNonEmpty(...values) {
  for (const value of values) {
    if (value !== undefined && value !== null && value !== '') return value;
  }
  return '';
}

function unique(values) {
  return [...new Set(values.filter(Boolean))];
}

async function scanCollection(name, onChunk) {
  const countRes = await db.collection(name).count();
  const total = Number(countRes.total || 0);

  for (let skip = 0; skip < total; skip += PAGE_SIZE) {
    const res = await db.collection(name).skip(skip).limit(PAGE_SIZE).get();
    const items = Array.isArray(res.data) ? res.data : [];
    if (!items.length) break;
    await onChunk(items);
  }

  return total;
}

async function loadEmployees() {
  const employees = [];
  await scanCollection('employees', async (items) => {
    employees.push(...items.filter(Boolean));
  });
  return employees;
}

async function loadEmployeeCompanies() {
  const relations = [];
  await scanCollection('employee_companies', async (items) => {
    relations.push(...items.filter(Boolean));
  });
  return relations;
}

function createUnionFind(ids) {
  const parent = new Map();
  ids.forEach((id) => parent.set(id, id));

  function find(id) {
    const current = parent.get(id);
    if (!current || current === id) return current || id;
    const root = find(current);
    parent.set(id, root);
    return root;
  }

  function union(a, b) {
    if (!a || !b) return;
    const rootA = find(a);
    const rootB = find(b);
    if (rootA !== rootB) parent.set(rootB, rootA);
  }

  return { find, union };
}

function buildEmployeeMetrics(employees, relations) {
  const relationMap = new Map();
  relations.forEach((item) => {
    if (!item?.employee_id) return;
    const list = relationMap.get(item.employee_id) || [];
    list.push(item);
    relationMap.set(item.employee_id, list);
  });

  const metrics = new Map();
  employees.forEach((employee) => {
    const employeeId = employee._id;
    const employeeRelations = relationMap.get(employeeId) || [];
    const relationJoinDates = employeeRelations
      .map((item) => normalizeDate(item.join_date))
      .filter(Boolean)
      .sort();
    const joinDate = pickFirstNonEmpty(
      normalizeDate(employee.join_date),
      relationJoinDates[0],
      normalizeDate(employee.created_at),
      normalizeDate(employee.updated_at)
    );

    metrics.set(employeeId, {
      join_date: joinDate,
      join_ts: toTimestamp(joinDate),
      created_ts: toTimestamp(employee.created_at),
      relation_count: employeeRelations.length
    });
  });

  return metrics;
}

function buildDuplicateGroups(employees, metrics) {
  const employeeIds = employees.map((item) => item._id).filter(Boolean);
  const uf = createUnionFind(employeeIds);
  const keyMaps = {
    id_card: new Map(),
    user_id: new Map(),
    phone_name: new Map()
  };

  employees.forEach((employee) => {
    const employeeId = employee._id;
    const idCard = normalizeIdCard(employee.id_card);
    const userId = normalizeText(employee.user_id);
    const phoneNameKey = (() => {
      const phone = normalizePhone(employee.phone);
      const name = normalizeName(employee.name);
      return phone && name ? `${phone}::${name}` : '';
    })();

    if (idCard) {
      const owner = keyMaps.id_card.get(idCard);
      if (owner) uf.union(owner, employeeId);
      else keyMaps.id_card.set(idCard, employeeId);
    }

    if (userId) {
      const owner = keyMaps.user_id.get(userId);
      if (owner) uf.union(owner, employeeId);
      else keyMaps.user_id.set(userId, employeeId);
    }

    if (!idCard && phoneNameKey) {
      const owner = keyMaps.phone_name.get(phoneNameKey);
      if (owner) uf.union(owner, employeeId);
      else keyMaps.phone_name.set(phoneNameKey, employeeId);
    }
  });

  const grouped = new Map();
  employees.forEach((employee) => {
    const root = uf.find(employee._id);
    const list = grouped.get(root) || [];
    list.push(employee);
    grouped.set(root, list);
  });

  const duplicateGroups = [];
  for (const list of grouped.values()) {
    if (list.length <= 1) continue;

    const sorted = [...list].sort((a, b) => {
      const metricsA = metrics.get(a._id);
      const metricsB = metrics.get(b._id);
      if ((metricsA?.join_ts || 0) !== (metricsB?.join_ts || 0)) {
        return (metricsA?.join_ts || 0) - (metricsB?.join_ts || 0);
      }
      if ((metricsA?.created_ts || 0) !== (metricsB?.created_ts || 0)) {
        return (metricsA?.created_ts || 0) - (metricsB?.created_ts || 0);
      }
      return String(a._id).localeCompare(String(b._id));
    });

    duplicateGroups.push({
      canonical: sorted[0],
      duplicates: sorted.slice(1),
      members: sorted
    });
  }

  return duplicateGroups;
}

function buildCanonicalUpdate(canonical, duplicates, metrics) {
  const canonicalMetric = metrics.get(canonical._id) || {};
  const mergedEmployees = [canonical, ...duplicates];
  const duplicateUserIds = unique(duplicates.map((item) => normalizeText(item.user_id)));

  const payload = {
    updated_at: new Date().toISOString(),
    join_date: canonicalMetric.join_date || canonical.join_date || '',
    user_id: pickFirstNonEmpty(
      normalizeText(canonical.user_id),
      ...duplicates.map((item) => normalizeText(item.user_id))
    ),
    phone: pickFirstNonEmpty(
      normalizePhone(canonical.phone),
      ...duplicates.map((item) => normalizePhone(item.phone))
    ),
    id_card: pickFirstNonEmpty(
      normalizeIdCard(canonical.id_card),
      ...duplicates.map((item) => normalizeIdCard(item.id_card))
    ),
    name: pickFirstNonEmpty(
      normalizeText(canonical.name),
      ...duplicates.map((item) => normalizeText(item.name))
    ),
    real_name: pickFirstNonEmpty(
      normalizeText(canonical.real_name),
      ...duplicates.map((item) => normalizeText(item.real_name))
    ),
    employee_no: canonical.employee_no || '',
    duplicate_employee_ids: duplicates.map((item) => item._id),
    duplicate_user_ids: duplicateUserIds,
    merge_note: `duplicate_employees_merged_at_${new Date().toISOString()}`
  };

  const fillableFields = [
    'gender',
    'job_id',
    'job_name',
    'company_id',
    'company_name',
    'referrer_id',
    'referrer_name',
    'settlement_mode',
    'bank_name',
    'bank_account',
    'bank_account_name',
    'emergency_contact',
    'emergency_phone',
    'contract_start',
    'contract_end',
    'contract_type'
  ];

  fillableFields.forEach((field) => {
    payload[field] = pickFirstNonEmpty(
      canonical[field],
      ...duplicates.map((item) => item[field])
    );
  });

  const statuses = mergedEmployees.map((item) => normalizeText(item.status));
  if (statuses.includes('regular')) payload.status = 'regular';
  else if (statuses.includes('probation')) payload.status = 'probation';
  else payload.status = canonical.status || 'resigned';

  const leaveDate = pickFirstNonEmpty(
    normalizeDate(canonical.leave_date),
    ...duplicates.map((item) => normalizeDate(item.leave_date))
  );
  if (payload.status === 'resigned' && leaveDate) {
    payload.leave_date = leaveDate;
  } else if (payload.status !== 'resigned') {
    payload.leave_date = '';
  }

  return payload;
}

function buildArchivedDuplicateUpdate(duplicate, canonicalId) {
  const snapshot = {
    user_id: duplicate.user_id || '',
    phone: duplicate.phone || '',
    id_card: duplicate.id_card || '',
    company_id: duplicate.company_id || '',
    company_name: duplicate.company_name || '',
    job_id: duplicate.job_id || '',
    job_name: duplicate.job_name || '',
    join_date: duplicate.join_date || '',
    leave_date: duplicate.leave_date || '',
    status: duplicate.status || '',
    employee_no: duplicate.employee_no || ''
  };

  return {
    user_id: '',
    phone: '',
    id_card: '',
    company_id: '',
    company_name: '',
    job_id: '',
    job_name: '',
    status: duplicate.status || '',
    leave_date: normalizeDate(duplicate.leave_date) || '',
    merged_into_employee_id: canonicalId,
    merged_record: true,
    hidden_from_employee_list: true,
    merged_at: new Date().toISOString(),
    merged_snapshot: snapshot,
    updated_at: new Date().toISOString()
  };
}

async function rewriteCollectionReferences(collectionConfig, remap, canonicalMap, summary) {
  const { name, field, extraUpdate } = collectionConfig;
  let scanned = 0;
  let updated = 0;

  await scanCollection(name, async (items) => {
    scanned += items.length;
    for (const item of items) {
      const currentEmployeeId = normalizeText(item[field]);
      const canonicalId = remap.get(currentEmployeeId);
      if (!canonicalId) continue;

      updated += 1;
      if (DRY_RUN) continue;

      const canonical = canonicalMap.get(canonicalId) || {};
      const payload = {
        [field]: canonicalId,
        updated_at: new Date().toISOString(),
        ...(typeof extraUpdate === 'function' ? extraUpdate(item, canonical) : {}),
        data: _.remove()
      };
      await db.collection(name).doc(item._id).update(payload);
    }
  });

  summary.collections.push({ name, scanned, updated });
}

async function main() {
  console.log(`开始归并重复员工，环境: ${ENV_ID}${DRY_RUN ? '（dry-run）' : ''}`);

  const [employees, relations] = await Promise.all([
    loadEmployees(),
    loadEmployeeCompanies()
  ]);

  const metrics = buildEmployeeMetrics(employees, relations);
  const duplicateGroups = buildDuplicateGroups(employees, metrics);

  if (!duplicateGroups.length) {
    console.log('未发现重复员工主档。');
    return;
  }

  const remap = new Map();
  const canonicalMap = new Map();
  const canonicalUpdates = [];
  const duplicateUpdates = [];

  duplicateGroups.forEach((group) => {
    const canonical = group.canonical;
    const duplicates = group.duplicates;
    canonicalMap.set(canonical._id, canonical);

    duplicates.forEach((duplicate) => {
      remap.set(duplicate._id, canonical._id);
    });

    canonicalUpdates.push({
      employeeId: canonical._id,
      payload: buildCanonicalUpdate(canonical, duplicates, metrics)
    });

    duplicateUpdates.push(...duplicates.map((duplicate) => ({
      employeeId: duplicate._id,
      canonicalId: canonical._id,
      payload: buildArchivedDuplicateUpdate(duplicate, canonical._id)
    })));
  });

  console.log(`发现重复员工组: ${duplicateGroups.length}`);
  duplicateGroups.slice(0, 20).forEach((group, index) => {
    const canonical = group.canonical;
    const duplicates = group.duplicates;
    const canonicalJoin = metrics.get(canonical._id)?.join_date || canonical.join_date || canonical.created_at || '';
    console.log(`${index + 1}. 保留 ${canonical._id} (${canonical.name || '-'} / ${canonical.employee_no || '-'}) join=${canonicalJoin}`);
    duplicates.forEach((item) => {
      const duplicateJoin = metrics.get(item._id)?.join_date || item.join_date || item.created_at || '';
      console.log(`   -> 归并 ${item._id} (${item.name || '-'} / ${item.employee_no || '-'}) join=${duplicateJoin}`);
    });
  });

  const summary = {
    groups: duplicateGroups.length,
    remappedEmployees: remap.size,
    collections: []
  };

  for (const collectionConfig of REFERENCE_COLLECTIONS) {
    await rewriteCollectionReferences(collectionConfig, remap, canonicalMap, summary);
  }

  console.log('引用改写统计:');
  summary.collections.forEach((item) => {
    console.log(`- ${item.name}: scanned=${item.scanned}, updated=${item.updated}`);
  });

  if (DRY_RUN) {
    console.log('dry-run 完成，未写入数据。');
    return;
  }

  for (const item of canonicalUpdates) {
    await db.collection('employees').doc(item.employeeId).update({
      ...item.payload,
      data: _.remove()
    });
  }

  for (const item of duplicateUpdates) {
    await db.collection('employees').doc(item.employeeId).update({
      ...item.payload,
      data: _.remove()
    });
  }

  console.log(`完成。已归并 ${summary.groups} 组重复员工，共迁移 ${summary.remappedEmployees} 个重复主档。`);
}

main().catch((err) => {
  console.error('归并重复员工失败:', err);
  process.exitCode = 1;
});
