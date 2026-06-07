/**
 * 修复 employee_companies 缺失记录
 * 扫描 employees 和 worktimes，为缺失 employee_companies 关联的员工-企业对创建记录
 * 
 * 调用方式：
 *   wx.cloud.callFunction({ name: 'fix-employee-companies', data: { dryRun: true } })
 *   dryRun=true 时仅检查不写入
 */
const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();
const PAGE_SIZE = 100;

function normalizeDate(value) {
  if (!value) return '';
  if (typeof value === 'string') {
    const match = value.trim().match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (match) return `${match[1]}-${match[2]}-${match[3]}`;
  }
  if (typeof value === 'object' && typeof value.getTime === 'function') {
    return value.toISOString().slice(0, 10);
  }
  return '';
}

function roundMoney(value) {
  return Math.round(Number(value || 0) * 100) / 100;
}

function pickFirstValue(...values) {
  for (const value of values) {
    if (value !== undefined && value !== null && value !== '') return value;
  }
  return '';
}

function buildReferralSnapshot(employee = {}) {
  const referralId = pickFirstValue(
    employee.source_referrer_id,
    employee.referrer_id,
    employee.recommender_id
  );
  const referralName = pickFirstValue(
    employee.source_referrer_name,
    employee.referrer_name,
    employee.recommender_name
  );
  return {
    source_referrer_id: referralId,
    source_referrer_name: referralName,
    referrer_id: referralId,
    referrer_name: referralName,
    recommender_id: referralId,
    recommender_name: referralName
  };
}

function hasRelationReferrer(relation = {}) {
  return Boolean(
    relation.source_referrer_id ||
    relation.source_referrer_name ||
    relation.referrer_id ||
    relation.referrer_name ||
    relation.recommender_id ||
    relation.recommender_name
  );
}

function pairKey(employeeId, companyId) {
  return `${employeeId}__${companyId}`;
}

async function scanAll(collectionName) {
  const items = [];
  const countRes = await db.collection(collectionName).count();
  const total = countRes.total || 0;
  for (let skip = 0; skip < total; skip += PAGE_SIZE) {
    const res = await db.collection(collectionName).skip(skip).limit(PAGE_SIZE).get();
    if (!res.data || !res.data.length) break;
    items.push(...res.data);
  }
  return items;
}

exports.main = async (event) => {
  const dryRun = event.dryRun !== false; // 默认 dry-run

  console.log(`[fix-employee-companies] 开始${dryRun ? '（dry-run）' : '（正式写入）'}`);

  // 1. 加载所有 employee_companies 的引用 key 集合
  const existingRelations = await scanAll('employee_companies');
  const existingKeys = new Set();
  for (const rel of existingRelations) {
    if (rel.employee_id && rel.company_id) {
      existingKeys.add(pairKey(rel.employee_id, rel.company_id));
    }
  }

  // 2. 加载所有员工
  const employees = await scanAll('employees');
  const employeeMap = new Map();
  for (const emp of employees) {
    if (emp._id) employeeMap.set(emp._id, emp);
  }

  const referrerBackfills = [];
  for (const rel of existingRelations) {
    if (!rel._id || hasRelationReferrer(rel)) continue;
    const employee = employeeMap.get(rel.employee_id);
    if (!employee) continue;
    const snapshot = buildReferralSnapshot(employee);
    if (hasRelationReferrer(snapshot)) {
      referrerBackfills.push({
        relation_id: rel._id,
        employee_id: rel.employee_id,
        company_id: rel.company_id,
        snapshot
      });
    }
  }

  // 3. 加载所有岗位
  const jobs = await scanAll('jobs');
  const jobMap = new Map();
  for (const job of jobs) {
    if (job._id) jobMap.set(job._id, job);
  }

  // 4. 从 worktimes 提取员工-企业对及元数据
  const worktimes = await scanAll('worktimes');
  const worktimeMeta = new Map();
  for (const wt of worktimes) {
    if (!wt.employee_id || !wt.company_id) continue;
    const key = pairKey(wt.employee_id, wt.company_id);
    const meta = worktimeMeta.get(key) || {
      employee_id: wt.employee_id,
      company_id: wt.company_id,
      company_name: '',
      job_id: '',
      earliest_work_date: '',
      hourly_rate: 0,
      count: 0
    };
    meta.count += 1;
    if (!meta.company_name && wt.company_name) meta.company_name = wt.company_name;
    if (!meta.job_id && wt.job_id) meta.job_id = wt.job_id;
    if (Number(wt.hourly_rate || 0)) meta.hourly_rate = roundMoney(wt.hourly_rate);
    const wd = normalizeDate(wt.work_date);
    if (wd && (!meta.earliest_work_date || wd < meta.earliest_work_date)) {
      meta.earliest_work_date = wd;
    }
    worktimeMeta.set(key, meta);
  }

  // 5. 收集所有需要创建关联的员工-企业对
  const candidatePairs = new Map();
  // 来源1: employees 表的 company_id
  for (const emp of employees) {
    if (emp.company_id) {
      const key = pairKey(emp._id, emp.company_id);
      candidatePairs.set(key, { employee_id: emp._id, company_id: emp.company_id, source: 'employee' });
    }
  }
  // 来源2: worktimes 中找到但 employees 没有的
  for (const meta of worktimeMeta.values()) {
    const key = pairKey(meta.employee_id, meta.company_id);
    if (!candidatePairs.has(key)) {
      candidatePairs.set(key, { employee_id: meta.employee_id, company_id: meta.company_id, source: 'worktime' });
    }
  }

  // 6. 筛选出缺失的
  const repairs = [];
  const skipped = [];

  for (const candidate of candidatePairs.values()) {
    const key = pairKey(candidate.employee_id, candidate.company_id);
    if (existingKeys.has(key)) continue;

    const employee = employeeMap.get(candidate.employee_id);
    if (!employee) {
      skipped.push({ ...candidate, reason: 'employee_not_found' });
      continue;
    }

    const meta = worktimeMeta.get(key) || null;
    const jobId = employee.job_id || meta?.job_id || '';
    const job = jobId ? jobMap.get(jobId) || null : null;

    const settlementMode = employee.settlement_mode
      || (job?.salary_type === 'monthly' ? 'monthly' : 'daily');
    const joinDate = normalizeDate(employee.join_date)
      || meta?.earliest_work_date
      || normalizeDate(employee.created_at)
      || new Date().toISOString().slice(0, 10);

    const payload = {
      employee_id: employee._id,
      company_id: candidate.company_id,
      hourly_rate: roundMoney(employee.hourly_rate || meta?.hourly_rate || job?.hourly_rate || 0),
      rate_plan_id: employee.rate_plan_id || job?.rate_plan_id || '',
      salary_type: job?.salary_type || settlementMode,
      settlement_mode: settlementMode,
      join_date: joinDate,
      status: employee.status === 'resigned' ? 'resigned' : 'active',
      ...buildReferralSnapshot(employee),
      created_by: 'fix-employee-companies',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };

    if (employee.leave_date) {
      payload.leave_date = normalizeDate(employee.leave_date);
    }

    repairs.push(payload);
  }

  console.log(`员工数: ${employees.length}`);
  console.log(`岗位数: ${jobs.length}`);
  console.log(`现有关联数: ${existingRelations.length}`);
  console.log(`工时数: ${worktimes.length}`);
  console.log(`候选对数: ${candidatePairs.size}`);
  console.log(`待补数: ${repairs.length}`);
  console.log(`待回填推荐人快照数: ${referrerBackfills.length}`);
  console.log(`跳过数: ${skipped.length}`);

  if (repairs.length) {
    console.log('待补样例:', JSON.stringify(repairs.slice(0, 5)));
  }

  if (dryRun || (!repairs.length && !referrerBackfills.length)) {
    return {
      code: 0,
      message: dryRun ? 'dry-run 完成' : '无需修复',
      data: {
        totalEmployees: employees.length,
        totalRelations: existingRelations.length,
        totalWorktimes: worktimes.length,
        candidatePairs: candidatePairs.size,
        missingCount: repairs.length,
        referrerBackfillCount: referrerBackfills.length,
        skippedCount: skipped.length,
        samples: repairs.slice(0, 10),
        referrerBackfillSamples: referrerBackfills.slice(0, 10),
        skippedSamples: skipped.slice(0, 5)
      }
    };
  }

  // 正式写入
  let created = 0;
  let referrerBackfilled = 0;
  const errors = [];
  for (const item of referrerBackfills) {
    try {
      await db.collection('employee_companies').doc(item.relation_id).update({
        data: {
          ...item.snapshot,
          updated_at: new Date().toISOString()
        }
      });
      referrerBackfilled += 1;
    } catch (err) {
      errors.push({ employee_id: item.employee_id, company_id: item.company_id, error: err.message });
    }
  }
  for (const payload of repairs) {
    try {
      await db.collection('employee_companies').add({ data: payload });
      created += 1;
    } catch (err) {
      errors.push({ employee_id: payload.employee_id, company_id: payload.company_id, error: err.message });
    }
  }

  console.log(`完成。已补写 ${created} 条，已回填推荐人快照 ${referrerBackfilled} 条，失败 ${errors.length} 条`);
  return {
    code: 0,
    message: `已补写 ${created} 条 employee_companies，已回填推荐人快照 ${referrerBackfilled} 条`,
    data: {
      created,
      referrerBackfilled,
      errors: errors.slice(0, 10),
      totalRepairs: repairs.length
    }
  };
};
