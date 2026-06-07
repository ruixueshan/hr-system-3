/**
 * 薪资发放模块
 * - 计算：统一调用 salary-engine-v2（单人或企业整月）
 * - 查询：分页筛选
 * - 审核 / 发放：状态流转
 * - 导出：返回前端可直接生成 Excel 的数据
 * - 我的工资单：小程序端
 */
const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();
const { getEmployeeSalaries } = require('./salary-query');
const {
  listInsuranceLedgers,
  applyInsuranceDeduction
} = require('./insurance-ledger');
const {
  getSalaryInsuranceV2RuntimeConfig,
  isSalaryInsuranceV2ActiveForCompany
} = require('./runtime-config');

// 内联响应
function success(data = null, message = 'success') {
  return { code: 0, message, data };
}
function error(code = 1, message = 'error', data = null) {
  return { code, message, data };
}

function normalizeTransferRemark(value) {
  return String(value || '').replace(/\s+/g, '');
}

const insuranceV2EnabledCache = new Map();
const MANAGEMENT_ROLES = new Set(['gm', 'deputy', 'hr', 'finance', 'admin']);

async function isInsuranceV2EnabledForCompany(companyId) {
  const key = String(companyId || '');
  if (!key) return false;
  if (insuranceV2EnabledCache.has(key)) {
    return insuranceV2EnabledCache.get(key);
  }
  const config = await getSalaryInsuranceV2RuntimeConfig(db);
  const enabled = isSalaryInsuranceV2ActiveForCompany(config, key);
  insuranceV2EnabledCache.set(key, enabled);
  return enabled;
}

// Token 验证（与 auth 模块一致的简化版）
async function verifyToken(token) {
  try {
    if (!token) return null;
    const tokenDoc = await db.collection('login_tokens')
      .where({
        token,
        status: 'logged',
        expire_time: db.command.gt(Date.now())
      })
      .get();
    if (!tokenDoc.data.length) return null;
    const user = await db.collection('users').doc(tokenDoc.data[0].user_id).get();
    return user.data || null;
  } catch (e) {
    console.error('[salaries] verifyToken failed:', e);
    return null;
  }
}

function getUserRole(user = {}) {
  return String(user.role || user.user_type || '').toLowerCase();
}

function buildUnauthorized(message = '未登录') {
  return error(401, message);
}

function buildForbidden(message = '无权限') {
  return error(403, message);
}

async function requireAuthenticatedUser(token, { roles = [] } = {}) {
  const user = await verifyToken(token);
  if (!user) {
    return { ok: false, response: buildUnauthorized('请先登录') };
  }
  if (Array.isArray(roles) && roles.length) {
    const role = getUserRole(user);
    if (!roles.includes(role)) {
      return { ok: false, response: buildForbidden('当前账号无权执行该操作') };
    }
  }
  return { ok: true, user };
}

exports.main = async (event, context) => {
  const { action } = event;
  try {
    switch (action) {
      case 'calculate':
        return await handleCalculate(event);
      case 'list':
        return await handleList(event);
      case 'approve':
        return await handleApprove(event);
      case 'pay':
        return await handlePay(event);
      case 'daily-preview':
        return await handleDailyPreview(event);
      case 'batch-pay-daily':
        return await handleBatchPayDaily(event);
      case 'batch-pay-deposit':
        return await handleBatchPayDeposit(event);
      case 'backfill-source-fields':
        return await handleBackfillSourceFields(event);
      case 'export':
        return await handleExport(event);
      case 'my-list':
        return await handleMyList(event);
      case 'bank-transfer':
        return await handleBankTransfer(event);
      case 'debug-bank-transfer':
        return await debugBankTransfer(event);
      default:
        return error(400, '未知操作');
    }
  } catch (err) {
    console.error('[salaries] error:', err);
    return error(500, err.message || '服务器错误');
  }
};

/**
 * 计算薪资
 * 支持两种模式：
 * - 指定 employee_id：单人计算
 * - 仅传 company_id/year/month：企业整月批量计算
 */
async function handleCalculate(data) {
  const { company_id, employee_id, year, month, settlement_mode = 'monthly', token } = data;
  if (!company_id || !year || !month) {
    return error(400, '缺少 company_id/year/month');
  }

  const auth = await requireAuthenticatedUser(token, { roles: Array.from(MANAGEMENT_ROLES) });
  if (!auth.ok) return auth.response;
  const operator = auth.user;

  // 统一转到 V2 薪资引擎，避免本地/测试环境继续依赖已废弃的 salary-engine
  const { calculateSalary } = require('../salary-engine-v2/calculate-salary');

  if (employee_id) {
    await calculateSalary({ employee_id, company_id, year, month, settlement_mode }, operator);
    return success(null, '单人薪资已计算');
  }

  const salaryCalc = require('../salary-engine-v2/calculate-all');
  const result = await salaryCalc.calculateAll({ company_id, year, month, settlement_mode }, operator);
  if (result && typeof result.code === 'number' && result.code !== 0) {
    return result;
  }
  const summary = result.data || {};
  const salarySummary = summary.salary || {};
  return success({
    ...summary,
    salary_count: Number(salarySummary.total || 0),
    salary_success: Number(salarySummary.total || 0),
    salary_skipped: Number(salarySummary.skipped || 0),
    salary_failed: Number(salarySummary.failed || 0),
    salary_errors: [
      ...(Array.isArray(salarySummary.failedDetails) ? salarySummary.failedDetails : []),
      ...(Array.isArray(salarySummary.skippedDetails) ? salarySummary.skippedDetails : [])
    ]
  }, result.message || '批量薪资计算完成');
}

/**
 * 分页查询
 */
async function handleList(params = {}) {
  const {
    company_id,
    employee_id,
    status,
    settlement_mode,
    source_type,
    month, // YYYY-MM 可选
    pay_date, // 发放日期
    year,
    page = 1,
    pageSize = 50
  } = params;
  const auth = await requireAuthenticatedUser(params.token, { roles: Array.from(MANAGEMENT_ROLES) });
  if (!auth.ok) return auth.response;

  console.log('[handleList] 查询参数:', JSON.stringify(params));

  // 构建查询条件
  const conditions = {};
  if (company_id) conditions.company_id = company_id;
  if (employee_id) conditions.employee_id = employee_id;
  if (status) conditions.status = status;
  if (settlement_mode) conditions.settlement_mode = settlement_mode;
  const shouldInferDailySourceFilter = settlement_mode === 'daily' && source_type === 'salary_daily';
  if (source_type && !shouldInferDailySourceFilter) conditions.source_type = source_type;
  if (pay_date) conditions.pay_date = pay_date;
  
  if (month) {
    const [y, m] = month.split('-').map(Number);
    conditions.year = y;
    conditions.month = m;
  } else if (year) {
    conditions.year = year;
  }

  console.log('[handleList] 查询条件:', JSON.stringify(conditions));

  const query = db.collection('salaries').where(conditions);
  const skip = (page - 1) * pageSize;

  // 历史兼容：日结工资筛选时，包含缺失 source_type 但可推断为 salary_daily 的记录
  if (shouldInferDailySourceFilter) {
    const batchSize = 500;
    let offset = 0;
    const allRows = [];
    while (true) {
      const chunk = await query.orderBy('created_at', 'desc').skip(offset).limit(batchSize).get();
      const list = chunk.data || [];
      allRows.push(...list);
      if (list.length < batchSize) break;
      offset += batchSize;
      if (offset > 10000) break; // 防止极端情况下全量扫描过大
    }

    const normalizedRows = allRows.map((item) => normalizeSalarySourceFields(item));
    const filteredRows = normalizedRows.filter((item) => item.source_type === 'salary_daily');
    const pagedRows = filteredRows.slice(skip, skip + pageSize);

    await backfillSalarySourceFields(allRows);
    console.log('[handleList] 历史兼容查询结果数量:', filteredRows.length);
    return success({
      list: pagedRows,
      total: filteredRows.length,
      page,
      pageSize
    });
  }

  const [countRes, listRes] = await Promise.all([
    query.count(),
    query.orderBy('created_at', 'desc').skip(skip).limit(pageSize).get()
  ]);
  const normalizedList = (listRes.data || []).map((item) => normalizeSalarySourceFields(item));
  await backfillSalarySourceFields(listRes.data || []);

  console.log('[handleList] 查询结果数量:', countRes.total);

  return success({
    list: normalizedList,
    total: countRes.total || 0,
    page,
    pageSize
  });
}

/**
 * 审核通过
 */
async function handleApprove(data) {
  const { id, token } = data;
  if (!id) return error(400, '缺少薪资ID');
  const auth = await requireAuthenticatedUser(token, { roles: Array.from(MANAGEMENT_ROLES) });
  if (!auth.ok) return auth.response;
  const user = auth.user;
  const salaryDoc = await db.collection('salaries').doc(id).get();
  const salary = salaryDoc.data || null;
  if (!salary) return error(404, '薪资记录不存在');

  await assertSalaryInsuranceConsistency(salary);

  await db.collection('salaries').doc(id).update({
    data: {
      status: 'approved',
      approved_by: user?._id || 'system',
      approved_at: db.serverDate(),
      updated_at: db.serverDate()
    }
  });
  return success(null, '已审核');
}

/**
 * 标记打款
 */
async function handlePay(data) {
  const { id, pay_date, token } = data;
  if (!id) return error(400, '缺少薪资ID');
  const auth = await requireAuthenticatedUser(token, { roles: Array.from(MANAGEMENT_ROLES) });
  if (!auth.ok) return auth.response;
  const user = auth.user;
  const salaryDoc = await db.collection('salaries').doc(id).get();
  const salary = salaryDoc.data || null;
  if (!salary) return error(404, '薪资记录不存在');

  await assertSalaryInsuranceConsistency(salary);
  await db.collection('salaries').doc(id).update({
    data: {
      status: 'paid',
      pay_date: pay_date || db.serverDate(),
      pay_operator: user?.name || 'system',
      updated_at: db.serverDate()
    }
  });
  return success(null, '已标记发放');
}

function roundMoney(value) {
  return Math.round((Number(value) || 0) * 100) / 100;
}

const SOURCE_TYPE_ALIAS_MAP = {
  salary_daily: 'salary_daily',
  daily_salary: 'salary_daily',
  daily: 'salary_daily',
  '日结工资': 'salary_daily',
  '日结薪资': 'salary_daily',
  salary_monthly: 'salary_monthly',
  monthly_salary: 'salary_monthly',
  monthly: 'salary_monthly',
  '月结工资': 'salary_monthly',
  '月结薪资': 'salary_monthly',
  deposit: 'deposit',
  '押金发放': 'deposit',
  '押金返还': 'deposit',
  project_reimbursement: 'project_reimbursement',
  reimbursement: 'project_reimbursement',
  '项目报销': 'project_reimbursement'
};

function normalizeSourceTypeValue(value) {
  const raw = String(value || '').trim();
  if (!raw) return '';
  return SOURCE_TYPE_ALIAS_MAP[raw] || SOURCE_TYPE_ALIAS_MAP[raw.toLowerCase()] || '';
}

function buildDailySalarySourceId(worktimeId) {
  return `salary_daily:${worktimeId || ''}`;
}

function normalizeDate(value) {
  if (!value) return '';
  const text = String(value);
  const match = text.match(/^(\d{4}-\d{2}-\d{2})/);
  if (match) return match[1];
  const parsed = new Date(text);
  if (Number.isNaN(parsed.getTime())) return '';
  return parsed.toISOString().slice(0, 10);
}

function normalizeYearMonth(value) {
  const dateText = normalizeDate(value);
  if (dateText) return dateText.slice(0, 7);
  const text = String(value || '');
  const match = text.match(/^(\d{4}-\d{2})$/);
  return match ? match[1] : '';
}

function tryParseDetails(details) {
  if (!details) return {};
  if (typeof details === 'object') return details;
  if (typeof details !== 'string') return {};
  try {
    return JSON.parse(details);
  } catch (e) {
    return {};
  }
}

function getNormalizedRemarkText(item = {}, details = {}) {
  return [
    item.pay_remark,
    item.remark,
    item.source,
    details.original_remark,
    details.remark,
    details.pay_remark
  ].map((value) => String(value || '').trim()).join(' ');
}

function inferSalarySourceType(item = {}) {
  const explicitType = normalizeSourceTypeValue(item.source_type || item.sourceType);
  if (explicitType) return explicitType;
  const sourceId = String(item.source_id || '');
  if (sourceId.startsWith('salary_daily:')) return 'salary_daily';
  if (sourceId.startsWith('salary_monthly:')) return 'salary_monthly';
  if (sourceId.startsWith('deposit:')) return 'deposit';
  if (sourceId.startsWith('project_reimbursement:')) return 'project_reimbursement';

  const details = tryParseDetails(item.details);
  const detailsSourceType = normalizeSourceTypeValue(details.source_type || details.sourceType);
  if (detailsSourceType) return detailsSourceType;

  if (details.reimbursement_to_user_id || details.reimbursement_to_user_name || details.period_start || details.period_end) {
    return 'project_reimbursement';
  }

  if (details.worktime_id || details.worktimeId || item.worktime_id || item.work_date || Array.isArray(details.salaryDetails)) {
    return 'salary_daily';
  }

  if (item.source_summary_id || details.source_summary_id || details.sourceSummaryId) {
    return 'salary_monthly';
  }

  const remarkText = getNormalizedRemarkText(item, details);
  if (remarkText.includes('项目报销')) return 'project_reimbursement';
  if (remarkText.includes('押金')) return 'deposit';
  if (remarkText.includes('日结')) return 'salary_daily';
  if (remarkText.includes('月结')) return 'salary_monthly';

  if (item.settlement_mode === 'daily') return 'salary_daily';
  if (item.settlement_mode === 'monthly') return 'salary_monthly';
  return '';
}

function inferSalarySourceId(item = {}) {
  if (item.source_id) return String(item.source_id || '').trim();
  const sourceType = inferSalarySourceType(item);
  const details = tryParseDetails(item.details);
  const worktimeId = String(details.worktime_id || details.worktimeId || item.worktime_id || '').trim();
  const reimbursementId = String(
    details.source_id ||
    details.sourceId ||
    details.reimbursement_id ||
    details.reimbursementId ||
    item.reimbursement_id ||
    item.project_reimbursement_id ||
    ''
  ).trim();

  if (sourceType === 'salary_daily') {
    if (worktimeId) return buildDailySalarySourceId(worktimeId);
    return `salary_daily:${item.employee_id || ''}:${item.company_id || ''}:${item.year_month || ''}`;
  }
  if (sourceType === 'salary_monthly') {
    return `salary_monthly:${item.employee_id || ''}:${item.company_id || ''}:${item.year_month || ''}`;
  }
  if (sourceType === 'deposit') {
    if (worktimeId) return `deposit:${worktimeId}`;
    return `deposit:${item.employee_id || ''}:${item.company_id || ''}:${item.year_month || ''}`;
  }
  if (sourceType === 'project_reimbursement') {
    if (reimbursementId) return reimbursementId;
    return '';
  }
  return '';
}

function normalizeSalarySourceFields(item = {}) {
  const source_type = inferSalarySourceType(item);
  const source_id = inferSalarySourceId({ ...item, source_type });
  return { ...item, source_type, source_id };
}

async function backfillSalarySourceFields(records = []) {
  if (!Array.isArray(records) || !records.length) return;
  const tasks = [];
  for (const row of records) {
    if (!row || !row._id) continue;
    const inferredType = inferSalarySourceType(row);
    const inferredId = inferSalarySourceId({ ...row, source_type: inferredType });
    const normalizedCurrentType = normalizeSourceTypeValue(row.source_type || row.sourceType);
    const currentId = String(row.source_id || '').trim();
    const patch = {};
    if (inferredType && normalizedCurrentType !== inferredType) patch.source_type = inferredType;
    if (
      inferredId && (
        !currentId ||
        (inferredType === 'project_reimbursement' && currentId.startsWith('project_reimbursement:') && currentId !== inferredId)
      )
    ) {
      patch.source_id = inferredId;
    }
    if (Object.keys(patch).length) {
      patch.updated_at = db.serverDate();
      tasks.push(db.collection('salaries').doc(row._id).update({ data: patch }));
    }
  }
  if (tasks.length) {
    await Promise.allSettled(tasks);
  }
}

async function handleBackfillSourceFields(params = {}) {
  const auth = await requireAuthenticatedUser(params.token, { roles: Array.from(MANAGEMENT_ROLES) });
  if (!auth.ok) return auth.response;
  const {
    settlement_mode = 'daily',
    batchSize = 500,
    maxScan = 20000
  } = params;

  const conditions = {};
  if (settlement_mode) conditions.settlement_mode = settlement_mode;
  const query = db.collection('salaries').where(conditions);

  let scanned = 0;
  let updated = 0;
  let offset = 0;

  while (scanned < maxScan) {
    const chunk = await query.orderBy('created_at', 'desc').skip(offset).limit(batchSize).get();
    const list = chunk.data || [];
    if (!list.length) break;

    const tasks = [];
    for (const row of list) {
      scanned += 1;
      const inferredType = inferSalarySourceType(row);
      const inferredId = inferSalarySourceId({ ...row, source_type: inferredType });
      const normalizedCurrentType = normalizeSourceTypeValue(row.source_type || row.sourceType);
      const currentId = String(row.source_id || '').trim();
      const patch = {};
      if (inferredType && normalizedCurrentType !== inferredType) patch.source_type = inferredType;
      if (
        inferredId && (
          !currentId ||
          (inferredType === 'project_reimbursement' && currentId.startsWith('project_reimbursement:') && currentId !== inferredId)
        )
      ) {
        patch.source_id = inferredId;
      }
      if (Object.keys(patch).length) {
        patch.updated_at = db.serverDate();
        updated += 1;
        tasks.push(db.collection('salaries').doc(row._id).update({ data: patch }));
      }
    }

    if (tasks.length) {
      await Promise.allSettled(tasks);
    }

    if (list.length < batchSize) break;
    offset += batchSize;
  }

  return success({
    settlement_mode: settlement_mode || '',
    scanned,
    updated
  }, '来源字段回填完成');
}

async function getLatestEmployeeCompany(employeeId, companyId) {
  const res = await db.collection('employee_companies')
    .where({ employee_id: employeeId, company_id: companyId })
    .orderBy('updated_at', 'desc')
    .limit(1)
    .get();
  return res.data?.[0] || null;
}

async function getDailyPlanForWorktime(worktime) {
  const employeeId = worktime.employee_id;
  const companyId = worktime.company_id;
  const employeeDoc = await db.collection('employees').doc(employeeId).get();
  const employee = employeeDoc.data || {};
  const employeeCompany = await getLatestEmployeeCompany(employeeId, companyId);
  if (!employeeCompany) {
    console.warn(`[daily-preview] 员工 ${employeeId} 在企业 ${companyId} 下无 employee_companies 关联，回退 employee/job 口径计算`);
  }

  let job = null;
  let ratePlanId = worktime.rate_plan_id || employeeCompany?.rate_plan_id || employee.rate_plan_id || '';
  const jobId = worktime.job_id || employee.job_id || '';

  if (jobId) {
    const jobDoc = await db.collection('jobs').doc(jobId).get();
    job = jobDoc.data || null;
    if (!ratePlanId) {
      ratePlanId = job?.rate_plan_id || '';
    }
  }

  let plan = null;
  if (ratePlanId) {
    const planDoc = await db.collection('rate_plans').doc(ratePlanId).get();
    plan = planDoc.data || null;
  }

  const _rateDebug = {
    ratePlanId: ratePlanId || '(empty)',
    plan_hourly_rate_daily: plan?.hourly_rate_daily,
    plan_daily_rate_daily: plan?.daily_rate_daily,
    plan_pay_hours_daily: plan?.pay_hours_daily,
    ec_hourly_rate: employeeCompany?.hourly_rate,
    job_hourly_rate: job?.hourly_rate,
    emp_hourly_rate: employee?.hourly_rate,
    source: 'unknown'
  };

  let hourlyRate = roundMoney(Number(plan?.hourly_rate_daily || 0));
  if (hourlyRate) {
    _rateDebug.source = 'plan.hourly_rate_daily';
  }
  if (!hourlyRate) {
    const dailyRate = Number(plan?.daily_rate_daily || 0);
    const payHours = Number(plan?.pay_hours_daily || 8);
    if (dailyRate && payHours) {
      hourlyRate = roundMoney(dailyRate / payHours);
      _rateDebug.source = `plan.daily_rate_daily(${dailyRate})/pay_hours(${payHours})`;
    }
  }
  // 工价表无时薪也无日薪时，降级取 employeeCompany / job / employee 上的 hourly_rate
  if (!hourlyRate) {
    hourlyRate = roundMoney(Number(employeeCompany?.hourly_rate ?? job?.hourly_rate ?? employee.hourly_rate ?? 0));
    if (employeeCompany?.hourly_rate) _rateDebug.source = 'employeeCompany.hourly_rate';
    else if (job?.hourly_rate) _rateDebug.source = 'job.hourly_rate';
    else if (employee?.hourly_rate) _rateDebug.source = 'employee.hourly_rate';
    else _rateDebug.source = 'none(all zero)';
  }
  _rateDebug.final_hourlyRate = hourlyRate;
  console.log('[daily-preview-debug]', JSON.stringify(_rateDebug));

  const nightHourlyRate = Number(plan?.night_hourly_rate_daily ?? plan?.night_hourly_rate ?? 0);
  const nightDailyRate = Number(plan?.night_daily_rate_daily ?? plan?.night_daily_rate ?? 0);

  // 日薪及计薪时长（用于精度补偿：工时==计薪时长时直接取日薪）
  const dailyRateDaily = Number(plan?.daily_rate_daily || 0);
  const payHoursDaily = Number(plan?.pay_hours_daily || 0);

  return {
    employee,
    employeeCompany,
    plan,
    job,
    ratePlanId,
    jobId,
    hourlyRate,
    dailyRateDaily,
    payHoursDaily,
    nightHourlyRate,
    nightDailyRate,
    _rateDebug
  };
}

async function buildDailyPreviewRows(worktimes = []) {
  const sortedWorktimes = [...worktimes].sort((a, b) => {
    const left = `${normalizeDate(a.work_date)}:${a._id || a.worktime_id || ''}`;
    const right = `${normalizeDate(b.work_date)}:${b._id || b.worktime_id || ''}`;
    return left.localeCompare(right);
  });

  const firstRowKeySet = new Set();
  const pendingLedgerCache = new Map();
  const results = [];

  for (const wt of sortedWorktimes) {
    const worktimeId = wt.worktime_id || wt._id;
    const workDate = normalizeDate(wt.work_date);
    const yearMonth = normalizeYearMonth(workDate);
    const groupKey = `${wt.employee_id}__${wt.company_id}`;
    const isFirstRow = !firstRowKeySet.has(groupKey);
    if (isFirstRow) firstRowKeySet.add(groupKey);

    const {
      ratePlanId,
      jobId,
      hourlyRate,
      dailyRateDaily,
      payHoursDaily,
      nightHourlyRate,
      nightDailyRate,
      _rateDebug
    } = await getDailyPlanForWorktime(wt);

    const totalHours = Number(wt.total_hours || wt.regular_hours || 0);
    // 精度补偿：当使用日薪折算且工时恰好等于计薪时长时，直接取日薪避免除法精度丢失
    const basePay = (dailyRateDaily && payHoursDaily && totalHours === payHoursDaily)
      ? roundMoney(dailyRateDaily)
      : roundMoney(totalHours * hourlyRate);
    const nightAllowance = wt.shift === 'night'
      ? roundMoney(totalHours * nightHourlyRate + nightDailyRate)
      : 0;
    const grossPay = roundMoney(basePay + nightAllowance);

    const insuranceV2Enabled = await isInsuranceV2EnabledForCompany(wt.company_id);
    let dueLedgers = [];
    if (insuranceV2Enabled && isFirstRow) {
      const cacheKey = `${groupKey}__${yearMonth}`;
      if (!pendingLedgerCache.has(cacheKey)) {
        const ledgers = await listInsuranceLedgers({
          employee_id: wt.employee_id,
          company_id: wt.company_id,
          due_before_or_equal: yearMonth,
          status_list: ['pending', 'partial']
        });
        pendingLedgerCache.set(cacheKey, ledgers);
      }
      dueLedgers = pendingLedgerCache.get(cacheKey) || [];
    }

    const insuranceDeduct = insuranceV2Enabled
      ? roundMoney(dueLedgers.reduce((sum, item) => sum + Number(item.remaining_amount || 0), 0))
      : 0;
    const netPay = roundMoney(grossPay - insuranceDeduct);

    results.push({
      worktime_id: worktimeId,
      employee_id: wt.employee_id,
      employee_name: wt.employee_name,
      employee_no: wt.employee_no,
      company_id: wt.company_id,
      company_name: wt.company_name,
      job_id: jobId || wt.job_id || '',
      job_name: wt.job_name,
      work_date: workDate,
      year: Number(workDate.slice(0, 4)),
      month: Number(workDate.slice(5, 7)),
      year_month: yearMonth,
      total_hours: totalHours,
      hourly_rate: hourlyRate,
      base_pay: basePay,
      night_allowance: nightAllowance,
      insurance_deduct: insuranceDeduct,
      insurance_deduct_detail: JSON.stringify({
        mode: 'v2_preview',
        hit_first_pay_event: isFirstRow && dueLedgers.length > 0,
        due_ledger_ids: dueLedgers.map((item) => item._id),
        due_insurance_months: dueLedgers.map((item) => item.insurance_month),
        due_total: insuranceDeduct
      }),
      gross_pay: grossPay,
      net_pay: netPay,
      manual_adjust: 0,
      final_pay: netPay,
      shift: wt.shift || 'day',
      source_type: 'salary_daily',
      source_id: buildDailySalarySourceId(worktimeId),
      _rateDebug
    });
  }

  return results;
}

async function assertSalaryInsuranceConsistency(salary) {
  if (!salary || salary.source_type !== 'salary_monthly' || !salary.insurance_ledger_id) {
    return;
  }

  const ledgerDoc = await db.collection('salary_insurance_ledgers').doc(salary.insurance_ledger_id).get();
  const ledger = ledgerDoc.data || null;
  if (!ledger) {
    throw new Error('对应保险台账不存在，不能继续审核/发放');
  }

  const sourceId = salary.source_id || `salary_monthly:${salary.employee_id || ''}:${salary.company_id || ''}:${salary.year_month || ''}`;
  const deductionRes = await db.collection('salary_insurance_deductions')
    .where({
      ledger_id: salary.insurance_ledger_id,
      source_type: 'salary_monthly',
      source_id: sourceId
    })
    .limit(1)
    .get();
  const deduction = deductionRes.data?.[0] || null;
  if (!deduction) {
    throw new Error('保险扣减流水缺失，不能继续审核/发放');
  }

  const salaryDeduct = roundMoney(Number(salary.insurance_deduct || 0));
  const ledgerDeduct = roundMoney(Number(deduction.deduct_amount || 0));
  if (salaryDeduct !== ledgerDeduct) {
    throw new Error(`保险台账与工资单不一致：工资单 ${salaryDeduct}，台账 ${ledgerDeduct}`);
  }
}

async function handleDailyPreview(data = {}) {
  const auth = await requireAuthenticatedUser(data.token, { roles: Array.from(MANAGEMENT_ROLES) });
  if (!auth.ok) return auth.response;
  const { worktimes = [] } = data;
  if (!Array.isArray(worktimes) || !worktimes.length) {
    return success([], '暂无可预览工时');
  }
  const rows = await buildDailyPreviewRows(worktimes);
  return success(rows, '日结薪资预览计算完成');
}

async function handleBatchPayDaily(data = {}) {
  const { worktimes = [], payDate, token } = data;
  if (!Array.isArray(worktimes) || !worktimes.length) {
    return error(400, '缺少待发薪工时');
  }
  if (!payDate) {
    return error(400, '缺少发放日期');
  }

  const auth = await requireAuthenticatedUser(token, { roles: Array.from(MANAGEMENT_ROLES) });
  if (!auth.ok) return auth.response;
  const operator = auth.user;
  const previewRows = await buildDailyPreviewRows(worktimes);
  const previewMap = new Map(previewRows.map((item) => [item.worktime_id, item]));
  const summary = { successCount: 0, failCount: 0 };

  for (const wt of worktimes) {
    const worktimeId = wt.worktime_id || wt._id;
    const preview = previewMap.get(worktimeId);
    if (!preview) {
      summary.failCount += 1;
      continue;
    }

    try {
      await db.runTransaction(async (transaction) => {
        const worktimeDoc = await transaction.collection('worktimes').doc(worktimeId).get();
        const worktime = worktimeDoc.data || null;
        if (!worktime) throw new Error('工时记录不存在');
        if (worktime.salary_status === 'paid') throw new Error('工时已发薪');

        let insuranceDeductApplied = 0;
        let deductionDetails = [];
        const insuranceV2Enabled = await isInsuranceV2EnabledForCompany(preview.company_id);
        if (insuranceV2Enabled && Number(preview.insurance_deduct || 0) > 0) {
          const dueLedgers = await listInsuranceLedgers({
            employee_id: preview.employee_id,
            company_id: preview.company_id,
            due_before_or_equal: preview.year_month,
            status_list: ['pending', 'partial']
          }, transaction);

          for (const ledger of dueLedgers) {
            const applyResult = await applyInsuranceDeduction({
              ledger_id: ledger._id,
              source_type: 'salary_daily',
              source_id: buildDailySalarySourceId(worktimeId),
              deduct_amount: Number(ledger.remaining_amount || 0),
              pay_date: payDate,
              remark: `${preview.work_date} 日结薪资保险扣减`,
              created_by: operator.uid
            }, transaction);
            if (applyResult.applied_amount > 0) {
              insuranceDeductApplied = roundMoney(insuranceDeductApplied + Number(applyResult.applied_amount || 0));
              deductionDetails.push({
                ledger_id: ledger._id,
                insurance_month: ledger.insurance_month,
                deduct_amount: roundMoney(Number(applyResult.applied_amount || 0)),
                deduction_id: applyResult.deduction?._id || ''
              });
            }
          }
        }

        const salaryData = {
          employee_id: preview.employee_id,
          employee_name: preview.employee_name,
          employee_no: preview.employee_no,
          company_id: preview.company_id,
          company_name: preview.company_name,
          job_id: preview.job_id || '',
          job_name: preview.job_name,
          work_date: preview.work_date,
          year: preview.year,
          month: preview.month,
          year_month: preview.year_month,
          settlement_mode: 'daily',
          source_type: 'salary_daily',
          source_id: buildDailySalarySourceId(worktimeId),
          regular_hours: preview.total_hours,
          overtime_hours: 0,
          total_hours: preview.total_hours,
          total_days: 1,
          hourly_rate: preview.hourly_rate,
          regular_pay: preview.base_pay,
          overtime_pay: 0,
          base_pay: preview.base_pay,
          night_allowance: preview.night_allowance,
          insurance_deduct: insuranceDeductApplied,
          insurance_deduct_detail: JSON.stringify({
            mode: 'v2_daily',
            items: deductionDetails
          }),
          deductions: insuranceDeductApplied,
          gross_pay: preview.gross_pay,
          net_pay: roundMoney(Number(preview.gross_pay || 0) + Number(wt.manual_adjust || 0) - insuranceDeductApplied),
          total_amount: roundMoney(Number(preview.gross_pay || 0) + Number(wt.manual_adjust || 0) - insuranceDeductApplied),
          manual_adjust: Number(wt.manual_adjust || 0),
          adjust_remark: wt.adjust_remark || '',
          status: 'paid',
          shift: preview.shift || 'day',
          pay_date: payDate,
          details: JSON.stringify({
            worktime_id: worktimeId,
            work_date: preview.work_date,
            shift: preview.shift
          }),
          created_by: operator.uid,
          created_at: db.serverDate(),
          updated_at: db.serverDate()
        };

        await transaction.collection('salaries').add({ data: salaryData });
        await transaction.collection('worktimes').doc(worktimeId).update({
          data: {
            salary_status: 'paid',
            pay_date: payDate,
            updated_at: db.serverDate()
          }
        });
      });
      summary.successCount += 1;
    } catch (err) {
      console.error('[handleBatchPayDaily] 单条发薪失败:', worktimeId, err);
      summary.failCount += 1;
    }
  }

  return summary.failCount
    ? error(500, `批量发薪部分失败，成功 ${summary.successCount} 条，失败 ${summary.failCount} 条`, summary)
    : success(summary, '批量发薪成功');
}

async function handleBatchPayDeposit(data = {}) {
  const { worktimes = [], payDate, token } = data;
  if (!Array.isArray(worktimes) || !worktimes.length) {
    return error(400, '缺少待发放押金工时');
  }
  if (!payDate) {
    return error(400, '缺少发放日期');
  }

  const auth = await requireAuthenticatedUser(token, { roles: Array.from(MANAGEMENT_ROLES) });
  if (!auth.ok) return auth.response;
  const operator = auth.user;
  const payYearMonth = normalizeYearMonth(payDate);
  const summary = { successCount: 0, failCount: 0 };

  for (const wt of worktimes) {
    const worktimeId = wt.worktime_id || wt._id;
    if (!worktimeId) {
      summary.failCount += 1;
      continue;
    }

    try {
      await db.runTransaction(async (transaction) => {
        const worktimeDoc = await transaction.collection('worktimes').doc(worktimeId).get();
        const worktime = worktimeDoc.data || null;
        if (!worktime) throw new Error('工时记录不存在');
        if (!worktime.is_deposit) throw new Error('当前记录不是押金工时');
        if (worktime.salary_status === 'paid') throw new Error('押金工时已发放');

        const wtWithIdentity = {
          ...worktime,
          employee_name: wt.employee_name || worktime.employee_name,
          employee_no: wt.employee_no || worktime.employee_no,
          company_name: wt.company_name || worktime.company_name,
          job_name: wt.job_name || worktime.job_name
        };
        const previewRows = await buildDailyPreviewRows([wtWithIdentity]);
        const preview = previewRows[0];
        if (!preview) throw new Error('无法计算押金薪资');
        const insuranceV2Enabled = await isInsuranceV2EnabledForCompany(preview.company_id);

        const grossPay = roundMoney(Number(preview.gross_pay || 0));
        let remainingBudget = grossPay;
        let insuranceDeductApplied = 0;
        const deductionDetails = [];
        if (insuranceV2Enabled) {
          const dueLedgers = await listInsuranceLedgers({
            employee_id: preview.employee_id,
            company_id: preview.company_id,
            due_before_or_equal: payYearMonth,
            status_list: ['pending', 'partial']
          }, transaction);

          for (const ledger of dueLedgers) {
            if (remainingBudget <= 0) break;
            const planDeductAmount = roundMoney(Math.min(Number(ledger.remaining_amount || 0), remainingBudget));
            if (planDeductAmount <= 0) continue;
            const applyResult = await applyInsuranceDeduction({
              ledger_id: ledger._id,
              source_type: 'deposit',
              source_id: `deposit:${worktimeId}`,
              deduct_amount: planDeductAmount,
              pay_date: payDate,
              remark: `${payDate} 押金发放保险补扣`,
              created_by: operator.uid
            }, transaction);
            if (applyResult.applied_amount > 0) {
              insuranceDeductApplied = roundMoney(insuranceDeductApplied + Number(applyResult.applied_amount || 0));
              remainingBudget = roundMoney(Math.max(0, remainingBudget - Number(applyResult.applied_amount || 0)));
              deductionDetails.push({
                ledger_id: ledger._id,
                insurance_month: ledger.insurance_month,
                deduct_amount: roundMoney(Number(applyResult.applied_amount || 0)),
                deduction_id: applyResult.deduction?._id || ''
              });
            }
          }
        }

        const netPay = roundMoney(grossPay - insuranceDeductApplied);

        const salaryData = {
          employee_id: preview.employee_id,
          employee_name: preview.employee_name,
          employee_no: preview.employee_no,
          company_id: preview.company_id,
          company_name: preview.company_name,
          job_id: preview.job_id || '',
          job_name: preview.job_name,
          work_date: preview.work_date,
          year: Number(payDate.slice(0, 4)),
          month: Number(payDate.slice(5, 7)),
          year_month: payYearMonth,
          settlement_mode: 'daily',
          source_type: 'deposit',
          source_id: `deposit:${worktimeId}`,
          regular_hours: preview.total_hours,
          overtime_hours: 0,
          total_hours: preview.total_hours,
          total_days: 1,
          hourly_rate: preview.hourly_rate,
          regular_pay: preview.base_pay,
          overtime_pay: 0,
          base_pay: preview.base_pay,
          night_allowance: preview.night_allowance,
          deposit_gross_amount: grossPay,
          insurance_deduct: insuranceDeductApplied,
          insurance_deduct_detail: JSON.stringify({
            mode: 'v2_deposit',
            items: deductionDetails
          }),
          deductions: insuranceDeductApplied,
          gross_pay: grossPay,
          net_pay: netPay,
          total_amount: netPay,
          status: 'paid',
          shift: preview.shift || 'day',
          pay_date: payDate,
          pay_remark: '押金发放',
          details: JSON.stringify({
            worktime_id: worktimeId,
            work_date: preview.work_date,
            shift: preview.shift,
            source_type: 'deposit'
          }),
          created_by: operator.uid,
          created_at: db.serverDate(),
          updated_at: db.serverDate()
        };

        await transaction.collection('salaries').add({ data: salaryData });
        await transaction.collection('worktimes').doc(worktimeId).update({
          data: {
            salary_status: 'paid',
            pay_date: payDate,
            deposit_settlement_status: 'paid',
            updated_at: db.serverDate()
          }
        });
      });
      summary.successCount += 1;
    } catch (err) {
      console.error('[handleBatchPayDeposit] 单条发放失败:', worktimeId, err);
      summary.failCount += 1;
    }
  }

  return summary.failCount
    ? error(500, `押金发放部分失败，成功 ${summary.successCount} 条，失败 ${summary.failCount} 条`, summary)
    : success(summary, '押金发放成功');
}

/**
 * 导出：返回列表数据，交由前端生成 Excel
 */
async function handleExport(params = {}) {
  const auth = await requireAuthenticatedUser(params.token, { roles: Array.from(MANAGEMENT_ROLES) });
  if (!auth.ok) return auth.response;
  const listResult = await handleList({ ...params, page: 1, pageSize: 5000 });
  return success(listResult.data?.list || [], '导出数据准备完毕');
}

/**
 * 小程序端：我的工资单
 */
async function handleMyList(params = {}) {
  const { token } = params;
  const user = await verifyToken(token);
  if (!user) return error(401, '未登录');

  const cmd = db.command;
  const salaryList = [];

  // 方案1: 通过 user_id 查询 employees，再查 salaries
  const empByUserId = await db.collection('employees')
    .where({ user_id: user._id })
    .limit(10)
    .get();

  if (empByUserId.data?.length) {
    const empIds = empByUserId.data.map(e => e._id);
    const salRes1 = await db.collection('salaries')
      .where({ employee_id: cmd.in(empIds) })
      .get();
    if (salRes1.data?.length) {
      salaryList.push(...salRes1.data);
    }
  }

  // 方案2: 兜底 - 通过 phone 查询
  if (salaryList.length === 0 && user.phone) {
    const empByPhone = await db.collection('employees')
      .where({ phone: user.phone })
      .limit(10)
      .get();

    if (empByPhone.data?.length) {
      const empIds = empByPhone.data.map(e => e._id);
      const salRes2 = await db.collection('salaries')
        .where({ employee_id: cmd.in(empIds) })
        .get();
      if (salRes2.data?.length) {
        salaryList.push(...salRes2.data);
      }
    }
  }

  // 按 year-month 分组汇总
  const groupedMap = new Map();
  salaryList.forEach(item => {
    const key = `${item.year}-${String(item.month).padStart(2, '0')}`;
    const insuranceDeduct = item.insurance_deduct || item.social_security || 0;
    if (!groupedMap.has(key)) {
      groupedMap.set(key, {
        year: item.year,
        month: item.month,
        key,
        monthText: `${item.year}年${item.month}月`,
        status: item.status,
        gross_pay: item.gross_pay || 0,
        insurance_deduct: insuranceDeduct,
        tax: item.tax || 0,
        net_pay: item.net_pay || 0
      });
    } else {
      const existing = groupedMap.get(key);
      existing.gross_pay = (existing.gross_pay || 0) + (item.gross_pay || 0);
      existing.insurance_deduct = (existing.insurance_deduct || 0) + insuranceDeduct;
      existing.tax = (existing.tax || 0) + (item.tax || 0);
      existing.net_pay = (existing.net_pay || 0) + (item.net_pay || 0);
    }
  });

  const groupedList = Array.from(groupedMap.values())
    .sort((a, b) => b.key.localeCompare(a.key));

  return success(groupedList);
}

/**
 * 查询报送银行数据
 * 从发薪表查询当天/当月的实发记录，并关联employees表的银行卡信息
 */
async function handleBankTransfer(data) {
  const {
    company_id,
    date, // YYYY-MM-DD，按发放日期筛选（可选）
    page = 1,
    pageSize = 1000
  } = data;
  const auth = await requireAuthenticatedUser(data.token, { roles: Array.from(MANAGEMENT_ROLES) });
  if (!auth.ok) return auth.response;

  try {
    let query = db.collection('salaries');
    
    // 按状态过滤（已发薪的记录）
    query = query.where({ status: 'paid' });
    
    if (date) {
      query = query.where({ pay_date: date });
    }
    
    if (company_id) {
      query = query.where({ company_id });
    }
    
    const skip = (page - 1) * pageSize;
    const result = await query
      .orderBy('_id', 'desc')
      .skip(skip)
      .limit(pageSize)
      .get();
    
    const salaries = result.data || [];
    
    // 关联 employees 表获取银行卡信息和持卡人姓名，报送银行以员工档案为准
    const bankTransferData = await Promise.all(
      salaries.map(async (salary) => {
        let bankInfo = {};
        let employee = {};
        let accountHolder = '';
        try {
          const employeeRes = await db.collection('employees').doc(salary.employee_id).get();
          employee = employeeRes.data?.[0] || employeeRes.data || {};
          bankInfo = employee || {};
        } catch (e) {
          console.warn(`获取员工 ${salary.employee_id} 的银行信息失败:`, e);
        }

        const bankAccount = bankInfo.bank_account || bankInfo.bankCard || bankInfo.bank_card || '';
        const bankName = bankInfo.bank_name || bankInfo.bank || '';
        accountHolder = bankInfo.bank_account_name || '';
        
        // 获取企业简称
        let companyShortName = salary.company_name || '';
        try {
          if (salary.company_id) {
            const companyRes = await db.collection('companies').doc(salary.company_id).get();
            const company = companyRes.data?.[0] || companyRes.data || {};
            companyShortName = company.short_name || salary.company_name || '';
          }
        } catch (cErr) {
          console.warn(`获取企业简称失败 ${salary.company_id}:`, cErr);
        }
        
        // 构建交易备注：项目报销记录与普通工资记录区分显示
        const rawDate = salary.work_date || salary.pay_date || '';
        let dateStr = '';
        if (rawDate) {
          const parts = rawDate.split('-');
          const m = parseInt(parts[1], 10);
          const d = parseInt(parts[2], 10);
          dateStr = `${m}月${d}日`;
        }
        const remarkSuffix = salary.source_type === 'project_reimbursement' ? '项目报销' : '工资';
        const remark = `${companyShortName}${dateStr}${remarkSuffix}`;
        
        const employeeName = employee.name || salary.employee_name || '';
        // 收款户名与员工姓名不一致时，在备注前加上员工姓名
        const finalRemark = (accountHolder && employeeName && accountHolder !== employeeName)
          ? `${employeeName} ${remark}`
          : remark;
        
        return {
          salary_id: salary._id,
          employee_id: salary.employee_id,
          employee_name: employeeName,
          employee_no: employee.employee_no || salary.employee_no,
          company_id: salary.company_id,
          company_name: salary.company_name,
          bank_name: bankName,
          bank_account: bankAccount,
          account_holder: accountHolder,
          transaction_amount: salary.net_pay || 0,
          remark: normalizeTransferRemark(finalRemark),
          cross_bank_flag: '是',
          personal_flag: '是',
          pay_date: salary.pay_date,
          work_date: salary.work_date
        };
      })
    );
    
    // 获取总数
    let countQuery = db.collection('salaries').where({ status: 'paid' });
    if (date) {
      countQuery = countQuery.where({ pay_date: date });
    }
    if (company_id) {
      countQuery = countQuery.where({ company_id });
    }
    const countResult = await countQuery.count();
    const total = countResult.total || 0;
    
    return success({
      list: bankTransferData,
      total,
      page,
      pageSize
    });
  } catch (err) {
    console.error('[handleBankTransfer] 查询失败:', err);
    return error(500, err.message || '查询报送银行数据失败');
  }
}

/**
 * 调试：检查3月23日的数据状态
 */
async function debugBankTransfer(data) {
  const auth = await requireAuthenticatedUser(data.token, { roles: Array.from(MANAGEMENT_ROLES) });
  if (!auth.ok) return auth.response;
  try {
    const debugData = {
      current_date: new Date().toISOString(),
      target_date: '2026-03-23'
    };
    
    // 检查3月23日的所有salaries记录
    const allRes = await db.collection('salaries')
      .where({
        pay_date: '2026-03-23'
      })
      .get();
    
    debugData.total_on_03_23 = allRes.data.length;
    
    // 按status分组
    const statusMap = {};
    allRes.data.forEach(item => {
      if (!statusMap[item.status]) {
        statusMap[item.status] = [];
      }
      statusMap[item.status].push({
        _id: item._id,
        employee_no: item.employee_no,
        employee_name: item.employee_name,
        net_pay: item.net_pay,
        settlement_mode: item.settlement_mode
      });
    });
    
    debugData.by_status = {};
    Object.keys(statusMap).forEach(status => {
      debugData.by_status[status] = {
        count: statusMap[status].length,
        samples: statusMap[status].slice(0, 2)
      };
    });
    
    // 检查已发薪且状态为paid的
    const paidRes = await db.collection('salaries')
      .where({
        pay_date: '2026-03-23',
        status: 'paid'
      })
      .get();
    
    debugData.paid_on_03_23 = paidRes.data.length;
    
    // 检查employees表是否有银行卡信息
    const empWithBank = await db.collection('employees')
      .where({
        bank_account: db.command.exists(true)
      })
      .limit(1)
      .get();
    
    debugData.employees_with_bank_account = empWithBank.data.length;
    
    if (empWithBank.data.length > 0) {
      const emp = empWithBank.data[0];
      debugData.sample_employee = {
        _id: emp._id,
        name: emp.name,
        bank_name: emp.bank_name || null,
        has_bank_account: !!emp.bank_account
      };
    }
    
    // 建议
    debugData.suggestions = [];
    if (debugData.total_on_03_23 === 0) {
      debugData.suggestions.push('3月23日未找到任何salaries记录');
    } else if (debugData.paid_on_03_23 === 0) {
      debugData.suggestions.push(`3月23日有${debugData.total_on_03_23}条记录，但status不是'paid'。当前status分布: ${JSON.stringify(Object.keys(statusMap))}`);
    } else if (debugData.employees_with_bank_account === 0) {
      debugData.suggestions.push('employees表中没有银行卡信息，需要补充bank_account字段');
    } else {
      debugData.suggestions.push('数据看起来正常，问题可能在API参数或前端调用');
    }
    
    return success(debugData);
  } catch (err) {
    console.error('[debugBankTransfer] 诊断失败:', err);
    return error(500, err.message || '诊断失败');
  }
}
