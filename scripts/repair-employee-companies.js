const tcb = require('tcb-admin-node');

const ENV_ID = process.env.CLOUDBASE_ENV || 'cloud1-5glojms9a83c3457';
const PAGE_SIZE = Number(process.env.PAGE_SIZE || 100);
const DRY_RUN = process.argv.includes('--dry-run');

tcb.init({ env: ENV_ID });

const db = tcb.database();

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

function roundMoney(value) {
  return Math.round(Number(value || 0) * 100) / 100;
}

function getPairKey(employeeId, companyId) {
  return `${employeeId}__${companyId}`;
}

function pickFirstValue(...values) {
  for (const value of values) {
    if (value !== undefined && value !== null && value !== '') {
      return value;
    }
  }
  return '';
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
  const employees = new Map();
  const total = await scanCollection('employees', async (items) => {
    for (const item of items) {
      if (item && item._id) {
        employees.set(item._id, item);
      }
    }
  });
  return { employees, total };
}

async function loadJobs() {
  const jobs = new Map();
  const total = await scanCollection('jobs', async (items) => {
    for (const item of items) {
      if (item && item._id) {
        jobs.set(item._id, item);
      }
    }
  });
  return { jobs, total };
}

async function loadExistingRelationKeys() {
  const keys = new Set();
  const total = await scanCollection('employee_companies', async (items) => {
    for (const item of items) {
      if (item?.employee_id && item?.company_id) {
        keys.add(getPairKey(item.employee_id, item.company_id));
      }
    }
  });
  return { keys, total };
}

async function loadWorktimeMeta() {
  const pairMeta = new Map();
  const total = await scanCollection('worktimes', async (items) => {
    for (const item of items) {
      if (!item?.employee_id || !item?.company_id) continue;

      const key = getPairKey(item.employee_id, item.company_id);
      const workDate = normalizeDate(item.work_date);
      const existing = pairMeta.get(key) || {
        employee_id: item.employee_id,
        company_id: item.company_id,
        company_name: item.company_name || '',
        job_id: item.job_id || '',
        earliest_work_date: '',
        latest_work_date: '',
        latest_hourly_rate: 0,
        count: 0
      };

      existing.count += 1;
      if (!existing.company_name && item.company_name) {
        existing.company_name = item.company_name;
      }
      if (!existing.job_id && item.job_id) {
        existing.job_id = item.job_id;
      }
      if (Number(item.hourly_rate || 0)) {
        existing.latest_hourly_rate = roundMoney(Number(item.hourly_rate || 0));
      }

      if (workDate) {
        if (!existing.earliest_work_date || workDate < existing.earliest_work_date) {
          existing.earliest_work_date = workDate;
        }
        if (!existing.latest_work_date || workDate > existing.latest_work_date) {
          existing.latest_work_date = workDate;
        }
      }

      pairMeta.set(key, existing);
    }
  });
  return { pairMeta, total };
}

function buildRepairPayload({ employee, companyId, pairMeta, job }) {
  const settlementMode = pickFirstValue(
    employee.settlement_mode,
    job?.salary_type === 'monthly' ? 'monthly' : '',
    'daily'
  );
  const salaryType = pickFirstValue(
    employee.salary_type,
    job?.salary_type,
    settlementMode === 'monthly' ? 'monthly' : 'daily'
  );
  const joinDate = normalizeDate(
    pickFirstValue(employee.join_date, pairMeta?.earliest_work_date, employee.created_at, new Date())
  );
  const leaveDate = employee.company_id === companyId ? normalizeDate(employee.leave_date) : '';
  const payload = {
    employee_id: employee._id,
    company_id: companyId,
    hourly_rate: roundMoney(Number(pickFirstValue(
      employee.hourly_rate,
      pairMeta?.latest_hourly_rate,
      job?.hourly_rate,
      0
    ))),
    salary_type: salaryType,
    settlement_mode: settlementMode,
    join_date: joinDate,
    status: employee.status === 'resigned' || leaveDate ? 'resigned' : 'active',
    created_by: 'repair-employee-companies',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  };

  const ratePlanId = pickFirstValue(employee.rate_plan_id, job?.rate_plan_id);
  if (ratePlanId) payload.rate_plan_id = ratePlanId;
  if (leaveDate) payload.leave_date = leaveDate;

  return payload;
}

async function main() {
  console.log(`开始扫描 employee_companies 缺失关系，环境: ${ENV_ID}${DRY_RUN ? '（dry-run）' : ''}`);

  const [{ employees, total: employeeTotal }, { jobs, total: jobTotal }, { keys: relationKeys, total: relationTotal }, { pairMeta, total: worktimeTotal }] = await Promise.all([
    loadEmployees(),
    loadJobs(),
    loadExistingRelationKeys(),
    loadWorktimeMeta()
  ]);

  const candidatePairs = new Map();
  for (const employee of employees.values()) {
    if (employee.company_id) {
      const key = getPairKey(employee._id, employee.company_id);
      candidatePairs.set(key, {
        employee_id: employee._id,
        company_id: employee.company_id,
        source: 'employee'
      });
    }
  }
  for (const meta of pairMeta.values()) {
    const key = getPairKey(meta.employee_id, meta.company_id);
    if (!candidatePairs.has(key)) {
      candidatePairs.set(key, {
        employee_id: meta.employee_id,
        company_id: meta.company_id,
        source: 'worktime'
      });
    }
  }

  const repairs = [];
  const skipped = [];
  for (const candidate of candidatePairs.values()) {
    const key = getPairKey(candidate.employee_id, candidate.company_id);
    if (relationKeys.has(key)) continue;

    const employee = employees.get(candidate.employee_id);
    if (!employee) {
      skipped.push({ ...candidate, reason: 'employee_missing' });
      continue;
    }

    const meta = pairMeta.get(key) || null;
    const jobId = employee.job_id || meta?.job_id || '';
    const job = jobId ? jobs.get(jobId) || null : null;
    repairs.push(buildRepairPayload({ employee, companyId: candidate.company_id, pairMeta: meta, job }));
  }

  console.log(`员工数: ${employeeTotal}`);
  console.log(`岗位数: ${jobTotal}`);
  console.log(`现有关联数: ${relationTotal}`);
  console.log(`工时数: ${worktimeTotal}`);
  console.log(`候选员工-企业对: ${candidatePairs.size}`);
  console.log(`待补关系数: ${repairs.length}`);
  console.log(`跳过数: ${skipped.length}`);

  if (skipped.length) {
    console.log('跳过样例:');
    skipped.slice(0, 10).forEach((item) => {
      console.log(`- employee=${item.employee_id}, company=${item.company_id}, reason=${item.reason}`);
    });
  }

  if (repairs.length) {
    console.log('待补样例:');
    repairs.slice(0, 10).forEach((item) => {
      console.log(`- employee=${item.employee_id}, company=${item.company_id}, join_date=${item.join_date}, settlement_mode=${item.settlement_mode}`);
    });
  }

  if (DRY_RUN || !repairs.length) {
    console.log(DRY_RUN ? 'dry-run 完成，未写入数据。' : '没有发现需要修复的关系。');
    return;
  }

  let created = 0;
  for (const payload of repairs) {
    await db.collection('employee_companies').add({ data: payload });
    created += 1;
  }

  console.log(`完成。已补写 ${created} 条 employee_companies 关系。`);
}

main().catch((err) => {
  console.error('修复 employee_companies 失败:', err);
  process.exitCode = 1;
});