/**
 * 云工保保险管理模块
 */
const cloud = require('wx-server-sdk');
const https = require('https');

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

const db = cloud.database();
const _ = db.command;

const BASE_URL = process.env.YUNGONGBAO_BASE_URL || 'https://www.langongbao.top';
const PROVIDER = 'yungongbao';
const DEFAULT_PAGE_LIMIT = 100;
const ADD_BATCH_SIZE = 10;
const INSURANCE_COLLECTIONS = [
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

function success(data = null, message = 'success') {
  return { code: 0, message, data };
}

function error(code = 1, message = 'error', data = null) {
  return { code, message, data };
}

function nowIso() {
  return new Date().toISOString();
}

function normalizeText(value) {
  return String(value || '').trim();
}

function normalizeId(value) {
  const text = normalizeText(value);
  return text || '';
}

function toNumber(value, fallback = 0) {
  const num = Number(value);
  return Number.isFinite(num) ? num : fallback;
}

function pickAccountBalance(payload = {}) {
  const data = payload.data || payload || {};
  const user = data.user || {};
  const candidates = [
    data.balance,
    user.balance,
    data.account_balance,
    user.account_balance,
    data.usable_balance,
    user.usable_balance,
    data.available_balance,
    user.available_balance,
    data.money,
    user.money,
    data.amount,
    user.amount,
    data.account_money,
    user.account_money,
    data.wallet_balance,
    user.wallet_balance,
    data.deposit,
    user.deposit,
    data.remain_money,
    user.remain_money,
    data.surplus_money,
    user.surplus_money
  ];
  const value = candidates.find((item) => item !== undefined && item !== null && item !== '');
  return value === undefined ? null : normalizeText(value);
}

function pickProviderActivePerson(payload = {}) {
  const data = payload.data || payload || {};
  const user = data.user || {};
  const value = user.active_person ?? data.active_person ?? user.active_count ?? data.active_count;
  return value === undefined || value === null || value === '' ? null : toNumber(value);
}

function maskIdcard(value) {
  const text = normalizeText(value);
  if (text.length < 10) return text ? '***' : '';
  return `${text.slice(0, 3)}***********${text.slice(-4)}`;
}

function maskIdCard(value) {
  const text = normalizeText(value);
  if (!text || text.length < 10) return text;
  return `${text.slice(0, 3)}***********${text.slice(-4)}`;
}

function pickFullIdcard(...values) {
  const normalized = values.map(normalizeText).filter(Boolean);
  return normalized.find((value) => !value.includes('*')) || normalized[0] || '';
}

function maskPersonPayload(person) {
  return {
    ...person,
    idcard: normalizeText(person && person.idcard)
  };
}

function sanitizeProviderConfig(config) {
  if (!config) return null;
  return {
    ...config,
    password: config.password ? '******' : '',
    token: config.token ? '******' : ''
  };
}

function buildQuery(params = {}) {
  const entries = Object.entries(params)
    .filter(([, value]) => value !== undefined && value !== null && value !== '')
    .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`);
  return entries.length ? `?${entries.join('&')}` : '';
}

async function readConfig() {
  const res = await db.collection('insurance_provider_configs')
    .where({ provider: PROVIDER })
    .limit(1)
    .get()
    .catch(() => ({ data: [] }));
  return (res.data || [])[0] || null;
}

async function upsertByQuery(collectionName, query, data) {
  const collection = db.collection(collectionName);
  const existing = await collection.where(query).limit(1).get().catch(() => ({ data: [] }));
  const doc = (existing.data || [])[0];
  if (doc && doc._id) {
    const nextData = {
      ...data,
      updated_at: nowIso()
    };
    try {
      await collection.doc(doc._id).update({ data: nextData });
    } catch (err) {
      const message = err?.message || err?.errMsg || '';
      if (!message.includes('Cannot create field')) throw err;
      const { _id, ...currentData } = doc;
      await collection.doc(doc._id).set({
        data: {
          ...currentData,
          ...nextData
        }
      });
    }
    return { _id: doc._id, ...doc, ...data };
  }
  const addRes = await collection.add({
    data: {
      ...query,
      ...data,
      created_at: nowIso(),
      updated_at: nowIso()
    }
  });
  return { _id: addRes._id || addRes.id, ...query, ...data };
}

async function listCollection(collectionName, { page = 1, pageSize = 20, where = {}, orderBy = 'updated_at', order = 'desc' } = {}) {
  const p = Math.max(1, Number(page) || 1);
  const ps = Math.max(1, Math.min(100, Number(pageSize) || 20));
  let query = db.collection(collectionName).where(where || {});
  const countRes = await query.count().catch(() => ({ total: 0 }));
  const res = await query
    .orderBy(orderBy, order)
    .skip((p - 1) * ps)
    .limit(ps)
    .get()
    .catch(() => ({ data: [] }));
  return {
    list: res.data || [],
    total: countRes.total || 0,
    page: p,
    pageSize: ps,
    totalPages: Math.ceil((countRes.total || 0) / ps)
  };
}

async function fetchAllQuery(query, batchSize = 100) {
  const countRes = await query.count().catch(() => ({ total: 0 }));
  const total = countRes.total || 0;
  const list = [];
  for (let skip = 0; skip < total; skip += batchSize) {
    const res = await query
      .skip(skip)
      .limit(Math.min(batchSize, total - skip))
      .get()
      .catch(() => ({ data: [] }));
    list.push(...(res.data || []));
  }
  return list;
}

async function getEmployeesByIds(employeeIds = []) {
  const uniqueIds = [...new Set(employeeIds.map(normalizeText).filter(Boolean))];
  const list = [];
  for (let index = 0; index < uniqueIds.length; index += 100) {
    const ids = uniqueIds.slice(index, index + 100);
    const res = await db.collection('employees')
      .where({ _id: _.in(ids) })
      .limit(100)
      .get()
      .catch(() => ({ data: [] }));
    list.push(...(res.data || []));
  }
  return list;
}

async function getDocsByIds(collectionName, ids = []) {
  const uniqueIds = [...new Set(ids.map(normalizeText).filter(Boolean))];
  const list = [];
  for (let index = 0; index < uniqueIds.length; index += 100) {
    const chunk = uniqueIds.slice(index, index + 100);
    const res = await db.collection(collectionName)
      .where({ _id: _.in(chunk) })
      .limit(100)
      .get()
      .catch(() => ({ data: [] }));
    list.push(...(res.data || []));
  }
  return list;
}

function getUninsuredDedupeKey(employee = {}) {
  const employeeId = normalizeText(employee.employee_id);
  if (employeeId) return `employee:${employeeId}`;

  const idcard = normalizeText(employee.id_card);
  const name = normalizeText(employee.name);
  if (idcard && name) return `idcard-name:${idcard}__${name}`;

  return `relation:${normalizeText(employee.relation_id || employee._id)}`;
}

function mergeUninsuredDuplicate(current, next) {
  if (!current) return next;
  return {
    ...current,
    company_id: current.company_id || next.company_id,
    company_name: current.company_name || next.company_name,
    job_id: current.job_id || next.job_id,
    job_name: current.job_name || next.job_name,
    join_date: current.join_date || next.join_date
  };
}

function resolveCompanyNameForSnapshot(relation = {}, employee = {}, company = {}, job = {}) {
  return normalizeText(
    employee.company_name
    || company.name
    || company.company_name
    || company.short_name
    || job.company_name
    || relation.company_name
  );
}

function resolveJobNameForSnapshot(relation = {}, employee = {}, job = {}) {
  return normalizeText(
    employee.job_name
    || job.position
    || job.job_name
    || job.name
    || relation.job_name
  );
}

async function syncEmployeeCompanySnapshots(event = {}) {
  const companyId = normalizeId(event.company_id);
  const overwrite = event.overwrite === true;
  const relationWhere = { employee_id: _.exists(true), status: 'active' };
  if (companyId) relationWhere.company_id = companyId;

  const relationDocs = await fetchAllQuery(db.collection('employee_companies').where(relationWhere));
  const employeeIds = [...new Set(relationDocs.map((relation) => relation.employee_id).filter(Boolean))];
  const employeeDocs = employeeIds.length ? await getEmployeesByIds(employeeIds) : [];
  const employeeMap = new Map((employeeDocs || []).map((employee) => [
    normalizeText(employee._id),
    employee
  ]));

  const companyIds = [];
  const jobIds = [];
  for (const relation of relationDocs) {
    const employee = employeeMap.get(normalizeText(relation.employee_id)) || {};
    companyIds.push(relation.company_id, employee.company_id);
    jobIds.push(relation.job_id, employee.job_id);
  }

  const companyDocs = await getDocsByIds('companies', companyIds);
  const jobDocs = await getDocsByIds('jobs', jobIds);
  const companyMap = new Map(companyDocs.map((company) => [normalizeText(company._id), company]));
  const jobMap = new Map(jobDocs.map((job) => [normalizeText(job._id), job]));

  const summary = {
    relation_total: relationDocs.length,
    employee_loaded_total: employeeDocs.length,
    company_loaded_total: companyDocs.length,
    job_loaded_total: jobDocs.length,
    updated_total: 0,
    filled_company_name_total: 0,
    filled_job_name_total: 0,
    filled_company_id_total: 0,
    filled_job_id_total: 0,
    skipped_missing_employee: 0,
    skipped_no_change: 0
  };

  for (const relation of relationDocs) {
    const employee = employeeMap.get(normalizeText(relation.employee_id));
    if (!employee) {
      summary.skipped_missing_employee += 1;
      continue;
    }

    const companyIdSnapshot = normalizeText(relation.company_id || employee.company_id);
    const jobIdSnapshot = normalizeText(relation.job_id || employee.job_id);
    const company = companyMap.get(companyIdSnapshot) || {};
    const job = jobMap.get(jobIdSnapshot) || {};
    const companyName = resolveCompanyNameForSnapshot(relation, employee, company, job);
    const jobName = resolveJobNameForSnapshot(relation, employee, job);

    const updateData = {};
    if (companyIdSnapshot && (overwrite || !normalizeText(relation.company_id))) {
      updateData.company_id = companyIdSnapshot;
    }
    if (jobIdSnapshot && (overwrite || !normalizeText(relation.job_id))) {
      updateData.job_id = jobIdSnapshot;
    }
    if (companyName && (overwrite || !normalizeText(relation.company_name))) {
      updateData.company_name = companyName;
    }
    if (jobName && (overwrite || !normalizeText(relation.job_name))) {
      updateData.job_name = jobName;
    }

    if (!Object.keys(updateData).length) {
      summary.skipped_no_change += 1;
      continue;
    }

    await db.collection('employee_companies').doc(relation._id).update({
      data: {
        ...updateData,
        updated_at: nowIso()
      }
    });

    summary.updated_total += 1;
    if (updateData.company_name) summary.filled_company_name_total += 1;
    if (updateData.job_name) summary.filled_job_name_total += 1;
    if (updateData.company_id) summary.filled_company_id_total += 1;
    if (updateData.job_id) summary.filled_job_id_total += 1;
  }

  return summary;
}

async function listInsuranceRecords(event = {}) {
  const result = await listCollection('employee_insurance_records', event);
  result.list = await Promise.all((result.list || []).map(async (record) => {
    if (normalizeText(record.occupation_name) || !record.policy_id || !record.occupation_id) return record;
    const occupation = await getOccupation(record.policy_id, record.occupation_id);
    const occupationName = occupation?.show_name || occupation?.name || occupation?.occupation_name || '';
    return occupationName ? { ...record, occupation_name: occupationName } : record;
  }));
  return result;
}

// 查询未承保人员（后端封装）
async function listUninsuredEmployees(event = {}) {
  const companyId = normalizeId(event.company_id);
  const nameKeyword = normalizeText(event.name);
  const page = Math.max(1, Number(event.page) || 1);
  const pageSize = Math.max(1, Math.min(100, Number(event.pageSize) || 20));
  const diagnostics = {
    relation_query_total: 0,
    relation_active_total: 0,
    employee_id_total: 0,
    employee_loaded_total: 0,
    skipped_missing_employee: 0,
    skipped_merged_employee: 0,
    active_employee_total: 0,
    insured_record_total: 0,
    insured_match_key_total: 0,
    matched_insured_total: 0,
    skipped_name_keyword: 0,
    uninsured_before_dedupe_total: 0,
    uninsured_dedupe_removed: 0,
    uninsured_total: 0
  };

  // 1. 以 employee_companies.status = active 作为未在保匹配基数
  const relationWhere = { employee_id: _.exists(true), status: 'active' };
  if (companyId) relationWhere.company_id = companyId;
  const relationDocs = await fetchAllQuery(db.collection('employee_companies').where(relationWhere));
  diagnostics.relation_query_total = relationDocs.length;
  diagnostics.relation_active_total = relationDocs.length;

  // 2. 获取员工ID列表，查询员工主档（只需要姓名、身份证、手机号）
  const employeeIds = [...new Set(relationDocs.map(r => r.employee_id).filter(Boolean))];
  diagnostics.employee_id_total = employeeIds.length;
  const employeeDocs = employeeIds.length ? await getEmployeesByIds(employeeIds) : [];
  diagnostics.employee_loaded_total = employeeDocs.length;

  const employeeMap = new Map();
  for (const employee of employeeDocs || []) {
    if (normalizeText(employee.merged_into_employee_id)) {
      diagnostics.skipped_merged_employee += 1;
      continue;
    }
    employeeMap.set(normalizeText(employee._id), employee);
  }

  // 3. 构建员工数据：企业/岗位只读取 employee_companies 已同步快照
  const activeEmployees = relationDocs
    .map(relation => {
      const employeeId = normalizeText(relation.employee_id);
      const employee = employeeMap.get(employeeId);
      if (!employee) {
        diagnostics.skipped_missing_employee += 1;
        return null;
      }
      return {
        _id: relation._id,
        relation_id: relation._id,
        employee_id: employeeId,
        employee_no: employee.employee_no || '',
        name: employee.name || relation.name || '',
        id_card: employee.id_card || relation.id_card || '',
        phone: employee.phone || '',
        company_id: normalizeText(relation.company_id),
        company_name: normalizeText(relation.company_name),
        job_id: normalizeText(relation.job_id),
        job_name: normalizeText(relation.job_name),
        join_date: relation.join_date || employee.join_date || ''
      };
    })
    .filter(Boolean);
  diagnostics.active_employee_total = activeEmployees.length;

  // 4. 查询保险在保记录（只取身份证+姓名用于匹配）
  const insuredRecords = await fetchAllQuery(db.collection('employee_insurance_records')
    .where({ provider: PROVIDER, status: 'active' }));
  diagnostics.insured_record_total = insuredRecords.length;

  // 5. 构建匹配集合（只用身份证+姓名）
  const idcardNamePairs = new Set();
  for (const record of insuredRecords) {
    const idcard = normalizeText(record.idcard || record.idcard_masked);
    const legacyMaskedIdcard = maskIdCard(idcard);
    const name = normalizeText(record.name_snapshot || record.name);
    if (idcard && name) idcardNamePairs.add(`${idcard}__${name}`);
    if (legacyMaskedIdcard && name) idcardNamePairs.add(`${legacyMaskedIdcard}__${name}`);
  }
  diagnostics.insured_match_key_total = idcardNamePairs.size;

  // 6. 过滤出未承保人员
  const uninsuredBeforeDedupe = [];
  for (const emp of activeEmployees) {
    // 姓名筛选
    if (nameKeyword && !normalizeText(emp.name).includes(nameKeyword)) {
      diagnostics.skipped_name_keyword += 1;
      continue;
    }

    // 保险匹配（只用身份证+姓名）
    const idcard = normalizeText(emp.id_card);
    const masked = maskIdCard(idcard);
    const name = normalizeText(emp.name);
    if (
      (idcard && name && idcardNamePairs.has(`${idcard}__${name}`))
      || (masked && name && idcardNamePairs.has(`${masked}__${name}`))
    ) {
      diagnostics.matched_insured_total += 1;
      continue;
    }

    uninsuredBeforeDedupe.push({
      ...emp,
      id_card_masked: emp.id_card,
      uninsured_reason: emp.id_card ? '在职但未在云工保在保清单匹配' : '在职但缺少身份证'
    });
  }
  diagnostics.uninsured_before_dedupe_total = uninsuredBeforeDedupe.length;

  const uninsuredMap = new Map();
  for (const emp of uninsuredBeforeDedupe) {
    const key = getUninsuredDedupeKey(emp);
    uninsuredMap.set(key, mergeUninsuredDuplicate(uninsuredMap.get(key), emp));
  }
  const uninsured = [...uninsuredMap.values()];
  diagnostics.uninsured_dedupe_removed = uninsuredBeforeDedupe.length - uninsured.length;

  // 7. 分页返回
  const total = uninsured.length;
  diagnostics.uninsured_total = total;
  const list = uninsured.slice((page - 1) * pageSize, page * pageSize);

  return {
    list,
    total,
    page,
    pageSize,
    totalPages: Math.ceil(total / pageSize),
    diagnostics
  };
}

async function setupCollections() {
  const results = [];
  for (const name of INSURANCE_COLLECTIONS) {
    try {
      await db.createCollection(name);
      results.push({ name, status: 'created' });
    } catch (err) {
      const message = err?.message || '';
      if (
        err?.code === 'DATABASE_COLLECTION_EXIST'
        || err?.code === 'RESOURCE_ALREADY_EXISTS'
        || message.includes('already exists')
        || message.includes('exist')
      ) {
        results.push({ name, status: 'exists' });
      } else {
        results.push({ name, status: 'failed', message });
      }
    }
  }

  const failed = results.filter((item) => item.status === 'failed');
  if (failed.length) {
    return error(500, '部分保险集合创建失败', { results });
  }
  return success({ results }, '保险集合已就绪');
}

async function saveConfig(event) {
  await setupCollections();
  const current = await readConfig();
  const payload = {
    provider: PROVIDER,
    base_url: normalizeText(event.base_url) || current?.base_url || BASE_URL,
    user_name: normalizeText(event.user_name) || current?.user_name || '',
    enabled: event.enabled !== undefined ? Boolean(event.enabled) : current?.enabled !== false
  };
  if (event.password) {
    payload.password = String(event.password);
    payload.password_secret_key = 'database';
  } else if (current?.password) {
    payload.password = current.password;
    payload.password_secret_key = current.password_secret_key || 'database';
  }
  const saved = await upsertByQuery('insurance_provider_configs', { provider: PROVIDER }, payload);
  return success(sanitizeProviderConfig(saved), '配置已保存');
}

async function getConfig() {
  const config = await readConfig();
  if (!config) {
    return success({
      provider: PROVIDER,
      base_url: BASE_URL,
      user_name: process.env.YUNGONGBAO_USER_NAME || '',
      enabled: false
    });
  }
  return success(sanitizeProviderConfig(config));
}

function resolveCredential(config) {
  const userName = process.env.YUNGONGBAO_USER_NAME || config?.user_name || '';
  const password = process.env.YUNGONGBAO_PASSWORD || config?.password || '';
  if (!userName || !password) {
    throw new Error('云工保账号或密码未配置');
  }
  return { userName, password };
}

async function requestProvider(path, { method = 'POST', token = '', query = {}, body, requireToken = true } = {}) {
  const config = await readConfig();
  const baseUrl = config?.base_url || BASE_URL;
  const url = `${baseUrl}${path}${buildQuery(query)}`;
  const headers = {};
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (requireToken) {
    const realToken = token || config?.token || '';
    if (!realToken) throw new Error('云工保 token 不存在，请先登录');
    headers.token = realToken;
  }

  const requestBody = body !== undefined ? JSON.stringify(body) : '';
  if (requestBody) headers['Content-Length'] = Buffer.byteLength(requestBody);

  const { statusCode, text } = await new Promise((resolve, reject) => {
    const req = https.request(url, { method, headers }, (res) => {
      const chunks = [];
      res.on('data', (chunk) => chunks.push(chunk));
      res.on('end', () => {
        resolve({
          statusCode: res.statusCode || 0,
          text: Buffer.concat(chunks).toString('utf8')
        });
      });
    });
    req.on('error', reject);
    if (requestBody) req.write(requestBody);
    req.end();
  });

  let payload;
  try {
    payload = text ? JSON.parse(text) : {};
  } catch (err) {
    throw new Error(`云工保响应不是 JSON: ${text.slice(0, 120)}`);
  }
  if (statusCode < 200 || statusCode >= 300) {
    throw new Error(`云工保 HTTP ${statusCode}: ${payload.msg || text}`);
  }
  return payload;
}

async function login() {
  const config = await readConfig();
  const { userName, password } = resolveCredential(config);
  const payload = await requestProvider('/api/passport/login', {
    requireToken: false,
    body: { user_name: userName, password }
  });
  if (Number(payload.code) !== 1 || !payload.data?.token) {
    throw new Error(payload.msg || '云工保登录失败');
  }
  const accountBalance = pickAccountBalance(payload);
  const providerActivePerson = pickProviderActivePerson(payload);
  const saved = await upsertByQuery('insurance_provider_configs', { provider: PROVIDER }, {
    base_url: config?.base_url || BASE_URL,
    user_name: userName,
    password: config?.password || '',
    password_secret_key: config?.password_secret_key || (config?.password ? 'database' : 'env'),
    token: payload.data.token,
    token_updated_at: nowIso(),
    enabled: true,
    account_balance: accountBalance,
    provider_active_person: providerActivePerson,
    balance_updated_at: accountBalance !== null ? nowIso() : config?.balance_updated_at || '',
    provider_stats_updated_at: providerActivePerson !== null ? nowIso() : config?.provider_stats_updated_at || '',
    last_login_response: { code: payload.code, msg: payload.msg, data: { ...payload.data, token: '******' } }
  });
  const status = await checkCustomerStatus({ token: payload.data.token });
  return success({ ...sanitizeProviderConfig(saved), customer: status.data }, '登录成功');
}

async function ensureToken() {
  const config = await readConfig();
  if (config?.token) return config.token;
  await login();
  const refreshedConfig = await readConfig();
  if (!refreshedConfig?.token) throw new Error('云工保 token 不存在，请先登录');
  return refreshedConfig.token;
}

async function checkCustomerStatus({ token } = {}) {
  const realToken = token || await ensureToken();
  const payload = await requestProvider('/api/customer/check', {
    method: 'GET',
    token: realToken
  });
  const data = payload.data && !Array.isArray(payload.data) ? payload.data : {};
  const accountBalance = pickAccountBalance(payload);
  await upsertByQuery('insurance_provider_configs', { provider: PROVIDER }, {
    customer_status: toNumber(data.status, -1),
    contract_id: data.contract_id || 0,
    ...(accountBalance !== null ? { account_balance: accountBalance, balance_updated_at: nowIso() } : {}),
    last_checked_at: nowIso(),
    last_check_response: payload
  });
  return success(data, payload.msg || 'success');
}

async function ensureReady() {
  const token = await ensureToken();
  const statusRes = await checkCustomerStatus({ token });
  if (toNumber(statusRes.data?.status, -1) !== 0) {
    throw new Error('云工保账号未认证或未完成签约，不能执行保险操作');
  }
  return token;
}

function mapPolicy(item = {}) {
  return {
    provider: PROVIDER,
    policy_id: normalizeId(item.policy_id),
    policy_no: normalizeText(item.policy_no),
    plan_id: normalizeId(item.plan_id),
    plan_name: normalizeText(item.plan),
    can_today: toNumber(item.can_today),
    month: normalizeText(item.month),
    price: normalizeText(item.price),
    start_date: normalizeText(item.start_date),
    end_date: normalizeText(item.end_date),
    premium: toNumber(item.premium),
    real_premium: normalizeText(item.real_premium),
    wxapp_id: normalizeId(item.wxapp_id),
    project_id: normalizeId(item.project_id),
    source: toNumber(item.source),
    is_disable: toNumber(item.is_disable),
    is_locked: toNumber(item.is_locked),
    is_subsidiary: toNumber(item.is_subsidiary),
    subsidiary_policy_id: normalizeId(item.subsidiary_policy_id),
    total_person_count: toNumber(item.total_person_count),
    active_count: toNumber(item.active_count),
    count: toNumber(item.count),
    pricing_count: toNumber(item.pricing_count),
    price_type: toNumber(item.price_type),
    renewal_type: toNumber(item.renewal_type),
    series: normalizeText(item.series),
    show_pdf: Boolean(item.show_pdf),
    plan_describe: normalizeText(item.plan_describe),
    is_active: toNumber(item.is_active),
    raw_data: item,
    synced_at: nowIso()
  };
}

async function syncPolicies() {
  const token = await ensureReady();
  const synced = [];
  let page = 1;
  let lastPage = 1;
  do {
    const payload = await requestProvider('/api/policy/lists', { token, query: { page }, body: {} });
    if (Number(payload.code) !== 1) throw new Error(payload.msg || '同步保单失败');
    const data = payload.data || {};
    lastPage = Number(data.last_page || 1);
    for (const item of data.data || []) {
      const mapped = mapPolicy(item);
      const saved = await upsertByQuery('insurance_policies', {
        provider: PROVIDER,
        policy_id: mapped.policy_id
      }, mapped);
      synced.push(saved);
    }
    page += 1;
  } while (page <= lastPage);

  await writeSyncLog('policies', 'success', { count: synced.length });
  return success({ list: synced, total: synced.length });
}

function mapActivePolicy(item = {}) {
  return {
    provider: PROVIDER,
    policy_id: normalizeId(item.policy_id),
    plan_id: normalizeId(item.plan_id),
    month: normalizeText(item.month),
    price: normalizeText(item.price),
    type: normalizeText(item.type),
    plan_name: normalizeText(item.plan),
    price_type: toNumber(item.price_type),
    insurance_company_id: normalizeId(item.insurance_company_id),
    insurance_company_name: normalizeText(item.insurance_company_name),
    date_from: normalizeText(item.date_from),
    date_to: normalizeText(item.date_to),
    person_count: toNumber(item.person_count),
    premium: normalizeText(item.premium),
    raw_data: item,
    synced_at: nowIso()
  };
}

async function syncActivePolicies() {
  const token = await ensureReady();
  const payload = await requestProvider('/api/policy/activeLists', { token, body: {} });
  if (Number(payload.code) !== 1) throw new Error(payload.msg || '同步可用保单失败');
  const list = [];
  for (const item of payload.data || []) {
    const mapped = mapActivePolicy(item);
    list.push(await upsertByQuery('insurance_active_policies', {
      provider: PROVIDER,
      policy_id: mapped.policy_id
    }, mapped));
  }
  await writeSyncLog('active_policies', 'success', { count: list.length });
  return success({ list, total: list.length });
}

function mapWorkCompany(policyId, item = {}) {
  return {
    provider: PROVIDER,
    policy_id: normalizeId(policyId),
    work_company_id: normalizeId(item.company_id),
    external_company_id: normalizeId(item.company_id),
    status: normalizeText(item.status),
    name: normalizeText(item.name),
    wxapp_id: normalizeId(item.wxapp_id),
    project_id: normalizeId(item.project_id),
    convention: item.convention || null,
    file_id: item.file_id || [],
    describe: item.describe || null,
    remark: normalizeText(item.remark),
    occupation_ids: normalizeText(item.occupation_ids),
    active_person_cache: toNumber(item.active_person_cache),
    occupation_category_list: item.occupation_category_list || [],
    is_hidden: toNumber(item.is_hidden),
    is_special: toNumber(item.is_special),
    file_url: item.file_url || [],
    occupation: item.occupation || [],
    raw_data: item,
    synced_at: nowIso()
  };
}

async function syncWorkCompanies({ policy_id }) {
  const policyId = normalizeId(policy_id);
  if (!policyId) throw new Error('缺少 policy_id');
  const token = await ensureReady();
  const payload = await requestProvider('/api/work_company/lists', {
    token,
    query: { policy_id: policyId },
    body: {}
  });
  if (Number(payload.code) !== 1) throw new Error(payload.msg || '同步被派遣单位失败');
  const list = [];
  for (const item of payload.data || []) {
    const mapped = mapWorkCompany(policyId, item);
    list.push(await upsertByQuery('insurance_work_companies', {
      provider: PROVIDER,
      policy_id: policyId,
      work_company_id: mapped.work_company_id
    }, mapped));
    for (const occupation of item.occupation || []) {
      const mappedOccupation = mapOccupation(policyId, occupation);
      mappedOccupation.source = 'work_company';
      await upsertByQuery('insurance_occupations', {
        provider: PROVIDER,
        policy_id: policyId,
        occupation_id: mappedOccupation.occupation_id
      }, mappedOccupation);
    }
  }
  await writeSyncLog('work_companies', 'success', { policy_id: policyId, count: list.length });
  return success({ list, total: list.length });
}

function mapOccupation(policyId, item = {}) {
  return {
    provider: PROVIDER,
    policy_id: normalizeId(policyId),
    occupation_id: normalizeId(item.occupation_id),
    project_id: normalizeId(item.project_id),
    pcode: normalizeText(item.pcode),
    name: normalizeText(item.name),
    show_name: normalizeText(item.show_name) || normalizeText(item.name),
    level: toNumber(item.level),
    merger_name: normalizeText(item.merger_name),
    category: toNumber(item.category),
    real_category: normalizeText(item.real_category),
    code: normalizeText(item.code),
    is_hot: toNumber(item.is_hot),
    series: normalizeText(item.series),
    is_show: toNumber(item.is_show),
    is_disable: Boolean(item.is_disable),
    raw_data: item,
    synced_at: nowIso()
  };
}

async function syncOccupations({ policy_id }) {
  const policyId = normalizeId(policy_id);
  if (!policyId) throw new Error('缺少 policy_id');
  const token = await ensureReady();
  const payload = await requestProvider('/api/Occupation/listsAll', {
    token,
    query: { policy_id: policyId },
    body: {}
  });
  if (Number(payload.code) !== 1) throw new Error(payload.msg || '同步工种失败');
  const list = [];
  for (const item of payload.data || []) {
    const mapped = mapOccupation(policyId, item);
    list.push(await upsertByQuery('insurance_occupations', {
      provider: PROVIDER,
      policy_id: policyId,
      occupation_id: mapped.occupation_id
    }, mapped));
  }
  await writeSyncLog('occupations', 'success', { policy_id: policyId, count: list.length });
  return success({ list, total: list.length });
}

function mapPolicyPerson(policyId, item = {}) {
  const fullIdcard = pickFullIdcard(item.idcard_bak, item.idcard);
  return {
    provider: PROVIDER,
    policy_id: normalizeId(policyId),
    policy_person_id: normalizeId(item.policy_person_id),
    external_employee_id: normalizeId(item.employee_id),
    employee_id: normalizeId(item.employee_id),
    idcard: fullIdcard,
    idcard_masked: fullIdcard,
    name_snapshot: normalizeText(item.name),
    work_company: normalizeText(item.work_company),
    start_date: normalizeText(item.start_date),
    end_date: normalizeText(item.end_date),
    occupation_id: normalizeId(item.occupation_id),
    occupation_name: normalizeText(item.occupation_name),
    occupation_category: toNumber(item.category),
    is_active: toNumber(item.is_active),
    status: toNumber(item.is_active) === 1 ? 'active' : 'offed',
    raw_data: { ...item, idcard: fullIdcard, provider_idcard: normalizeText(item.idcard) },
    last_synced_at: nowIso()
  };
}

function getLocalTodayDate() {
  return new Date(Date.now() + 8 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

function normalizeDateText(value) {
  const text = normalizeText(value);
  const match = text.match(/^(\d{4}-\d{2}-\d{2})/);
  return match ? match[1] : '';
}

function isDateDue(value) {
  const dateText = normalizeDateText(value);
  return !!dateText && dateText <= getLocalTodayDate();
}

async function findExistingPolicyPersonRecord(policyId, mapped = {}) {
  if (mapped.policy_person_id) {
    const byPolicyPerson = await db.collection('employee_insurance_records')
      .where({
        provider: PROVIDER,
        policy_id: normalizeId(policyId),
        policy_person_id: mapped.policy_person_id
      })
      .limit(1)
      .get()
      .catch(() => ({ data: [] }));
    if (byPolicyPerson.data?.[0]) return byPolicyPerson.data[0];
  }

  if (mapped.name_snapshot && mapped.idcard_masked) {
    const byPerson = await db.collection('employee_insurance_records')
      .where({
        provider: PROVIDER,
        policy_id: normalizeId(policyId),
        name_snapshot: mapped.name_snapshot,
        idcard_masked: mapped.idcard_masked
      })
      .limit(1)
      .get()
      .catch(() => ({ data: [] }));
    if (byPerson.data?.[0]) return byPerson.data[0];
  }

  return null;
}

function mergePolicyPersonRecord(existing, mapped) {
  return mapped;
}

async function savePolicyPersonRecord(policyId, mapped) {
  const existing = await findExistingPolicyPersonRecord(policyId, mapped);
  const data = mergePolicyPersonRecord(existing, mapped);
  if (existing?._id) {
    await db.collection('employee_insurance_records').doc(existing._id).update({
      data: {
        ...data,
        updated_at: nowIso()
      }
    });
    return { ...existing, ...data };
  }
  return upsertByQuery('employee_insurance_records', {
    provider: PROVIDER,
    policy_id: normalizeId(policyId),
    policy_person_id: mapped.policy_person_id
  }, data);
}

function pickBestInsuranceRecord(records = []) {
  if (!records.length) return null;
  return [...records].sort((a, b) => {
    const statusScore = (item) => item.status === 'active' ? 2 : 1;
    if (statusScore(b) !== statusScore(a)) return statusScore(b) - statusScore(a);
    return normalizeText(b.updated_at || b.created_at).localeCompare(normalizeText(a.updated_at || a.created_at));
  })[0] || null;
}

async function findInsuranceRecordForOff(policyId, person = {}) {
  const base = { provider: PROVIDER, policy_id: normalizeId(policyId) };
  const queries = [];
  const policyPersonId = normalizeId(person.policy_person_id);
  const employeeCompanyId = normalizeId(person.employee_company_id);
  const employeeId = normalizeId(person.employee_id);
  const name = normalizeText(person.name);
  const idcardMasked = normalizeText(person.idcard);

  if (policyPersonId) queries.push({ ...base, policy_person_id: policyPersonId });
  if (employeeCompanyId) queries.push({ ...base, employee_company_id: employeeCompanyId });
  if (employeeId) queries.push({ ...base, employee_id: employeeId });
  if (name && idcardMasked) queries.push({ ...base, name_snapshot: name, idcard_masked: idcardMasked });

  for (const query of queries) {
    const res = await db.collection('employee_insurance_records')
      .where(query)
      .limit(10)
      .get()
      .catch(() => ({ data: [] }));
    const match = pickBestInsuranceRecord(res.data || []);
    if (match?._id) return match;
  }

  return null;
}

function parseProviderDate(value) {
  const text = normalizeText(value);
  if (!text) return null;
  const dateText = text.slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateText)) return null;
  const time = new Date(`${dateText}T00:00:00+08:00`).getTime();
  return Number.isNaN(time) ? null : time;
}

function isCurrentPolicyPerson(item = {}) {
  if (toNumber(item.is_active) !== 1) return false;
  const today = new Date(`${new Date().toISOString().slice(0, 10)}T00:00:00+08:00`).getTime();
  const startTime = parseProviderDate(item.start_date);
  const endTime = parseProviderDate(item.end_date);
  if (startTime && startTime > today) return false;
  if (endTime && endTime < today) return false;
  return true;
}

async function syncPolicyPersons({ policy_id, pageSize = DEFAULT_PAGE_LIMIT }) {
  const policyId = normalizeId(policy_id);
  if (!policyId) throw new Error('缺少 policy_id');
  const token = await ensureReady();
  const list = [];
  let skipped = 0;
  let page = 1;
  let lastPage = 1;
  await db.collection('employee_insurance_records')
    .where({ provider: PROVIDER, policy_id: policyId, status: 'active' })
    .update({
      data: {
        status: 'offed',
        is_active: 0,
        last_synced_at: nowIso(),
        updated_at: nowIso()
      }
    })
    .catch(() => null);
  do {
    const payload = await requestProvider('/api/policy_person/lists', {
      token,
      query: { policy_id: policyId, page, limit: pageSize },
      body: { policy_id: policyId }
    });
    if (Number(payload.code) !== 1) throw new Error(payload.msg || '同步保单人员失败');
    const data = payload.data || {};
    lastPage = Number(data.last_page || 1);
    for (const item of data.data || []) {
      if (!isCurrentPolicyPerson(item)) {
        skipped += 1;
        continue;
      }
      const mapped = mapPolicyPerson(policyId, item);
      list.push(await savePolicyPersonRecord(policyId, mapped));
    }
    page += 1;
  } while (page <= lastPage);
  await writeSyncLog('policy_persons', 'success', {
    policy_id: policyId,
    active_count: list.length,
    skipped_inactive_count: skipped
  });
  return success({
    list,
    total: list.length,
    skipped_inactive_count: skipped
  });
}

async function syncOffEmployees({ policy_id }) {
  const policyId = normalizeId(policy_id);
  if (!policyId) throw new Error('缺少 policy_id');
  const token = await ensureReady();
  const payload = await requestProvider('/api/employee/listsForOff', {
    token,
    query: { policy_id: policyId },
    body: {}
  });
  if (Number(payload.code) !== 1) throw new Error(payload.msg || '同步可减保员工失败');
  const list = (payload.data || []).map((item) => ({
    ...item,
    provider: PROVIDER,
    policy_id: policyId,
    policy_person_id: normalizeId(item.policy_person_id),
    employee_id: normalizeId(item.employee_id),
    idcard: normalizeText(item.idcard),    // 完整身份证
    idcard_masked: normalizeText(item.idcard),
    raw_data: { ...item, idcard: normalizeText(item.idcard) },
    synced_at: nowIso()
  }));
  for (const item of list) {
    const { idcard, ...stored } = item;
    await upsertByQuery('insurance_off_employees', {
      provider: PROVIDER,
      policy_id: policyId,
      policy_person_id: item.policy_person_id
    }, stored);
  }
  return success({ list, total: list.length });
}

async function writeSyncLog(syncType, status, summary = {}, diffs = []) {
  await db.collection('insurance_sync_logs').add({
    data: {
      provider: PROVIDER,
      sync_type: syncType,
      status,
      summary,
      diffs,
      started_at: nowIso(),
      finished_at: nowIso(),
      created_at: nowIso()
    }
  }).catch(() => null);
}

async function getPolicy(policyId) {
  const [activeRes, fullRes] = await Promise.all([
    db.collection('insurance_active_policies').where({ provider: PROVIDER, policy_id: normalizeId(policyId) }).limit(1).get().catch(() => ({ data: [] })),
    db.collection('insurance_policies').where({ provider: PROVIDER, policy_id: normalizeId(policyId) }).limit(1).get().catch(() => ({ data: [] }))
  ]);
  return { active: activeRes.data?.[0] || null, full: fullRes.data?.[0] || null };
}

async function getWorkCompany(policyId, workCompanyNameOrId) {
  const key = normalizeText(workCompanyNameOrId);
  const res = await db.collection('insurance_work_companies')
    .where({ provider: PROVIDER, policy_id: normalizeId(policyId) })
    .limit(100)
    .get()
    .catch(() => ({ data: [] }));
  return (res.data || []).find((item) => item.work_company_id === key || item.name === key) || null;
}

async function getOccupation(policyId, occupationId) {
  const res = await db.collection('insurance_occupations')
    .where({ provider: PROVIDER, policy_id: normalizeId(policyId), occupation_id: normalizeId(occupationId) })
    .limit(1)
    .get()
    .catch(() => ({ data: [] }));
  return res.data?.[0] || null;
}

async function precheckAddInsurance(event) {
  const person = (event.persons && event.persons[0]) || event.person || event;
  const policyId = normalizeId(event.policy_id || person.policy_id);
  const workCompany = normalizeText(person.work_company || event.work_company);
  const occupationId = normalizeId(person.occupation_id || event.occupation_id);
  const errors = [];

  if (!policyId) errors.push('缺少保单');
  if (!normalizeText(person.name)) errors.push('姓名不能为空');
  if (!normalizeText(person.idcard)) errors.push('身份证不能为空');
  if (!workCompany) errors.push('被派遣单位不能为空');
  if (!occupationId) errors.push('工种不能为空');
  if (!normalizeText(event.start_date || person.start_date)) errors.push('生效日期不能为空');
  if (errors.length) return success({ valid: false, errors });

  const policy = await getPolicy(policyId);
  if (!policy.active) errors.push('保单不在可加减保下拉列表中');
  if (policy.full && (toNumber(policy.full.is_disable) || !toNumber(policy.full.is_active, 1))) {
    errors.push('保单已禁用或未生效');
  }

  const company = await getWorkCompany(policyId, workCompany);
  if (!company) {
    errors.push('被派遣单位不在该保单可选列表中');
  } else {
    if (company.status !== '已通过') errors.push('被派遣单位状态不是已通过');
    const allowed = String(company.occupation_ids || '').split(',').map((item) => item.trim());
    if (!allowed.includes(occupationId)) errors.push('工种不在被派遣单位白名单内');
  }

  const occupation = await getOccupation(policyId, occupationId);
  if (!occupation) {
    errors.push('工种不在该保单工种库中');
  } else {
    if (occupation.is_disable) errors.push('工种已禁用');
    const policySeries = policy.full?.series || '';
    if (policySeries && occupation.series && policySeries !== occupation.series) {
      errors.push('工种 series 与保单 series 不一致');
    }
  }

  const existing = await db.collection('employee_insurance_records')
    .where({
      provider: PROVIDER,
      policy_id: policyId,
      name_snapshot: normalizeText(person.name),
      idcard_masked: normalizeText(person.idcard),
      status: 'active'
    })
    .limit(1)
    .get()
    .catch(() => ({ data: [] }));
  if (existing.data?.length) errors.push('本地已有同保单在保记录');

  return success({
    valid: errors.length === 0,
    errors,
    normalized: {
      policy_id: policyId,
      start_date: normalizeText(event.start_date || person.start_date),
      person: {
        name: normalizeText(person.name),
        idcard: normalizeText(person.idcard),
        work_company: company?.name || workCompany,
        occupation_id: occupationId,
        occupation_name: occupation?.show_name || occupation?.name || ''
      }
    }
  });
}

async function precheckOffInsurance(event) {
  const policyId = normalizeId(event.policy_id);
  const errors = [];
  if (!policyId) errors.push('缺少保单');
  if (!normalizeText(event.start_date)) errors.push('减保日期不能为空');
  if (event.start_date && event.start_date < new Date().toISOString().slice(0, 10)) {
    errors.push('减保日期不能早于今天');
  }
  let candidate = null;
  if (policyId && (event.policy_person_id || event.employee_id || event.name)) {
    const offRes = await syncOffEmployees({ policy_id: policyId });
    candidate = (offRes.data.list || []).find((item) => {
      return (event.policy_person_id && normalizeId(item.policy_person_id) === normalizeId(event.policy_person_id))
        || (event.employee_id && normalizeId(item.employee_id) === normalizeId(event.employee_id))
        || (event.name && normalizeText(item.name) === normalizeText(event.name));
    });
    if (!candidate) errors.push('云工保可减保员工列表中未找到该员工');
  }
  return success({ valid: errors.length === 0, errors, candidate });
}

async function writeChangeRequest(data) {
  const requestNo = data.request_no || `INS${Date.now()}${Math.floor(Math.random() * 1000)}`;
  const collection = db.collection('insurance_change_requests');
  const query = {
    provider: PROVIDER,
    request_no: requestNo
  };
  const payload = {
    ...data,
    provider_response: data.provider_response || {},
    request_no: requestNo
  };
  const existing = await collection.where(query).limit(1).get().catch(() => ({ data: [] }));
  const doc = (existing.data || [])[0];
  if (doc && doc._id) {
    await collection.doc(doc._id).update({
      data: {
        ...payload,
        provider_response: _.set(payload.provider_response),
        updated_at: nowIso()
      }
    });
    return { _id: doc._id, ...doc, ...payload };
  }
  const addRes = await collection.add({
    data: {
      ...query,
      ...payload,
      created_at: nowIso(),
      updated_at: nowIso()
    }
  });
  return { _id: addRes._id || addRes.id, ...query, ...payload };
}

function isAlreadyInsuredMessage(message) {
  const text = normalizeText(message);
  return text.includes('已投保') || text.includes('重复投保') || text.includes('无法重复投保');
}

function isAlreadyAcceptedAddResponse(payload, preparedPersons = []) {
  if (Number(payload?.code) === 1) return false;
  const list = Array.isArray(payload?.data?.list) ? payload.data.list : [];
  const listStr = normalizeText(payload?.data?.list_str || payload?.msg);
  if (list.length) {
    return list.length >= preparedPersons.length && list.every((item) => isAlreadyInsuredMessage(item.msg || listStr));
  }
  return !!preparedPersons.length && isAlreadyInsuredMessage(listStr);
}

function findProviderAddItem(person, providerItems = []) {
  const idcard = normalizeText(person.idcard).toUpperCase();
  const name = normalizeText(person.name);
  return providerItems.find((item) => normalizeText(item.idcard).toUpperCase() === idcard)
    || providerItems.find((item) => normalizeText(item.name) === name)
    || null;
}

async function findEmployeeByIdcardOrName(idcard, name) {
  const normalizedIdcard = normalizeText(idcard).toUpperCase();
  if (normalizedIdcard) {
    const res = await db.collection('employees').where({ id_card: normalizedIdcard }).limit(1).get().catch(() => ({ data: [] }));
    if (res.data?.[0]) return res.data[0];
  }
  if (name) {
    const res = await db.collection('employees').where({ name }).limit(5).get().catch(() => ({ data: [] }));
    if (res.data?.[0]) return res.data[0];
  }
  return null;
}

async function findActiveEmployeeCompany(employeeId, companyId) {
  if (!employeeId) return null;
  let query = db.collection('employee_companies').where({
    employee_id: employeeId,
    status: 'active'
  });
  if (companyId) {
    query = db.collection('employee_companies').where({
      employee_id: employeeId,
      company_id: companyId,
      status: 'active'
    });
  }
  const res = await query.limit(10).get().catch(() => ({ data: [] }));
  return res.data?.[0] || null;
}

async function reconcileAddChangeRequest(event = {}) {
  const requestId = normalizeId(event.request_id || event.requestId || event._id);
  const requestNo = normalizeText(event.request_no || event.requestNo);
  let request = null;
  if (requestId) {
    const doc = await db.collection('insurance_change_requests').doc(requestId).get();
    request = doc.data;
  } else if (requestNo) {
    const res = await db.collection('insurance_change_requests').where({ provider: PROVIDER, request_no: requestNo }).limit(1).get();
    request = res.data?.[0] || null;
  }
  if (!request || request.type !== 'add') throw new Error('加保变更请求不存在');

  const policyId = normalizeId(request.policy_id);
  const startDate = normalizeText(request.start_date);
  const providerItems = Array.isArray(request.provider_response?.data?.list) ? request.provider_response.data.list : [];
  const sourcePersons = providerItems.length
    ? providerItems.map((item) => ({
      name: item.name,
      idcard: item.idcard,
      work_company: item.work_company,
      occupation_id: request.persons_payload?.[Number(item.num || 1) - 1]?.occupation_id,
      occupation_name: request.persons_payload?.[Number(item.num || 1) - 1]?.occupation_name
    }))
    : (request.persons_payload || []);

  await db.collection('insurance_change_requests').doc(request._id).update({
    data: {
      status: 'success',
      reconciled_at: nowIso(),
      reconcile_note: `已确认云工保加保日志 ${sourcePersons.length} 人，本地不再回写待加保状态`,
      error_message: '',
      updated_at: nowIso()
    }
  });

  return success({ count: sourcePersons.length }, `已确认云工保加保日志 ${sourcePersons.length} 人`);
}

async function recordException(event = {}) {
  const employeeId = normalizeId(event.employee_id || event.employeeId || event._id || event.id);
  const relationId = normalizeId(event.employee_company_id || event.relation_id);
  const policyId = normalizeId(event.policy_id);
  const name = normalizeText(event.name || event.name_snapshot);
  const source = normalizeText(event.source || 'manual');
  const exceptionKey = normalizeText(event.exception_key)
    || [source, employeeId || relationId || name || 'unknown', policyId || 'no_policy'].join(':');

  const saved = await upsertByQuery('employee_insurance_records', {
    provider: PROVIDER,
    exception_key: exceptionKey
  }, {
    provider: PROVIDER,
    exception_key: exceptionKey,
    status: normalizeText(event.status) || 'mismatch',
    policy_id: policyId,
    employee_id: employeeId,
    employee_company_id: relationId,
    name_snapshot: name,
    idcard_masked: normalizeText(event.idcard || event.id_card),
    work_company: normalizeText(event.work_company || event.company_name),
    occupation_id: normalizeId(event.occupation_id),
    occupation_name: normalizeText(event.occupation_name),
    company_id: normalizeId(event.company_id),
    job_id: normalizeId(event.job_id),
    rate_plan_id: normalizeId(event.rate_plan_id),
    last_error: normalizeText(event.last_error || event.message || '保险自动流程异常'),
    last_synced_at: nowIso(),
    raw_data: {
      ...event,
      idcard: normalizeText(event.idcard || event.id_card),
      id_card: normalizeText(event.idcard || event.id_card)
    }
  });
  return success(saved, '异常已记录');
}

async function addInsurance(event) {
  const token = await ensureReady();
  const policyId = normalizeId(event.policy_id);
  const startDate = normalizeText(event.start_date);
  const requestNo = normalizeText(event.request_no || event.requestNo) || `INS${Date.now()}${Math.floor(Math.random() * 1000)}`;
  const persons = Array.isArray(event.persons) ? event.persons : [event.person || event];
  const precheckErrors = [];
  const preparedPersons = [];
  for (const person of persons) {
    const check = await precheckAddInsurance({ policy_id: policyId, start_date: startDate, person });
    if (!check.data.valid) precheckErrors.push({ name: person.name, errors: check.data.errors });
    const normalized = check.data?.normalized?.person || {};
    preparedPersons.push({
      name: normalizeText(person.name),
      idcard: normalizeText(person.idcard),
      work_company: normalizeText(person.work_company || normalized.work_company),
      occupation_id: normalizeId(person.occupation_id),
      occupation_name: normalizeText(person.occupation_name || normalized.occupation_name),
      employee_id: normalizeId(person.employee_id),
      employee_company_id: normalizeId(person.employee_company_id),
      company_id: normalizeId(person.company_id),
      job_id: normalizeId(person.job_id),
      rate_plan_id: normalizeId(person.rate_plan_id)
    });
  }
  if (precheckErrors.length) {
    return error(400, '加保预校验失败', { list: precheckErrors });
  }
  const providerPersons = preparedPersons.map((person) => ({
    name: normalizeText(person.name),
    idcard: normalizeText(person.idcard),
    work_company: normalizeText(person.work_company),
    occupation_id: toNumber(person.occupation_id)
  }));

  let request = await writeChangeRequest({
    request_no: requestNo,
    type: 'add',
    policy_id: policyId,
    start_date: startDate,
    persons_payload: preparedPersons.map(maskPersonPayload),
    status: 'submitting',
    provider_response: {},
    error_message: '',
    operator_id: event.userInfo?.uid || '',
    operator_name: event.userInfo?.name || '',
    submitted_at: nowIso()
  });

  let payload;
  try {
    payload = await requestProvider('/api/policy_change/add', {
      token,
      body: {
        policy_id: policyId,
        start_date: startDate,
        persons: JSON.stringify(providerPersons)
      }
    });
  } catch (err) {
    request = await writeChangeRequest({
      request_no: requestNo,
      type: 'add',
      policy_id: policyId,
      start_date: startDate,
      persons_payload: preparedPersons.map(maskPersonPayload),
      status: 'failed',
      provider_response: {},
      error_message: err.message || '加保接口调用失败',
      operator_id: event.userInfo?.uid || '',
      operator_name: event.userInfo?.name || ''
    });
    return error(400, err.message || '加保接口调用失败', { request });
  }

  const ok = Number(payload.code) === 1;
  const alreadyAccepted = isAlreadyAcceptedAddResponse(payload, preparedPersons);
  const providerItems = Array.isArray(payload?.data?.list) ? payload.data.list : [];
  request = await writeChangeRequest({
    request_no: requestNo,
    type: 'add',
    policy_id: policyId,
    start_date: startDate,
    persons_payload: preparedPersons.map(maskPersonPayload),
    status: (ok || alreadyAccepted) ? 'success' : 'failed',
    provider_response: payload,
    error_message: ok ? '' : (alreadyAccepted ? '云工保返回已投保，已按待加保回写' : (payload.data?.list_str || payload.msg || '加保失败')),
    operator_id: event.userInfo?.uid || '',
    operator_name: event.userInfo?.name || ''
  });
  if (!ok && !alreadyAccepted) {
    const failMessage = payload.data?.list_str || payload.msg || '加保失败';
    return error(400, failMessage, { request, provider: payload });
  }

  return success({ request, provider: payload, reconciled: alreadyAccepted }, alreadyAccepted ? '云工保已存在投保记录，已写入操作日志' : '加保提交成功');
}

async function offInsurance(event) {
  const token = await ensureReady();
  const policyId = normalizeId(event.policy_id);
  const startDate = normalizeText(event.start_date);
  const personsInput = Array.isArray(event.persons) ? event.persons : [event.person || event];
  const persons = [];
  let offRes = null;
  for (const person of personsInput) {
    let matched = null;
    if (!normalizeText(person.name) || !normalizeText(person.idcard)) {
      if (!offRes) offRes = await syncOffEmployees({ policy_id: policyId });
      matched = (offRes.data.list || []).find((item) => {
        return (person.policy_person_id && normalizeId(item.policy_person_id) === normalizeId(person.policy_person_id))
          || (person.employee_id && normalizeId(item.employee_id) === normalizeId(person.employee_id))
          || (person.name && normalizeText(item.name) === normalizeText(person.name));
      });
    }
    persons.push({
      name: normalizeText(matched?.name || person.name),
      idcard: normalizeText(matched?.idcard || person.idcard)
    });
  }
  if (persons.some((item) => !item.name || !item.idcard)) {
    return error(400, '减保员工缺少姓名或身份证');
  }
  if (!startDate || startDate < new Date().toISOString().slice(0, 10)) {
    return error(400, '减保日期不能为空且不能早于今天');
  }

  const payload = await requestProvider('/api/policy_change/off', {
    token,
    body: {
      policy_id: policyId,
      start_date: startDate,
      persons: JSON.stringify(persons)
    }
  });
  const ok = Number(payload.code) === 1;
  const request = await writeChangeRequest({
    type: 'off',
    policy_id: policyId,
    start_date: startDate,
    persons_payload: persons.map(maskPersonPayload),
    status: ok ? 'success' : 'failed',
    provider_response: payload,
    error_message: ok ? '' : (payload.data?.list_str || payload.msg || '减保失败'),
    operator_id: event.userInfo?.uid || '',
    operator_name: event.userInfo?.name || ''
  });

  const results = persons.map((person) => ({
    person: maskPersonPayload(person),
    ok,
    request,
    provider: payload
  }));

  if (!ok) {
    return error(400, payload.data?.list_str || payload.msg || '减保失败', { results, request, provider: payload });
  }

  return success({ results }, '减保提交成功');
}

async function createBatchTask(event) {
  const type = normalizeText(event.type);
  if (!['batch_add', 'batch_off'].includes(type)) throw new Error('批量任务类型不正确');
  const persons = Array.isArray(event.persons) ? event.persons : [];
  const taskNo = `BAT${Date.now()}${Math.floor(Math.random() * 1000)}`;
  const taskRes = await db.collection('insurance_batch_tasks').add({
    data: {
      provider: PROVIDER,
      task_no: taskNo,
      type,
      source: event.source || 'manual_select',
      policy_id: normalizeId(event.policy_id),
      work_company_name: normalizeText(event.work_company_name),
      total_count: persons.length,
      success_count: 0,
      failed_count: 0,
      skipped_count: 0,
      status: 'draft',
      operator_id: event.userInfo?.uid || '',
      operator_name: event.userInfo?.name || '',
      created_at: nowIso(),
      updated_at: nowIso()
    }
  });
  const taskId = taskRes._id || taskRes.id;
  const items = [];
  for (let index = 0; index < persons.length; index += 1) {
    const person = persons[index];
    const addRes = await db.collection('insurance_batch_task_items').add({
      data: {
        provider: PROVIDER,
        task_id: taskId,
        row_no: index + 1,
        employee_id: normalizeId(person.employee_id),
        employee_company_id: normalizeId(person.employee_company_id),
        company_id: normalizeId(person.company_id),
        name_snapshot: normalizeText(person.name),
        idcard: normalizeText(person.idcard),
        idcard_masked: normalizeText(person.idcard),
        policy_id: normalizeId(person.policy_id || event.policy_id),
        work_company: normalizeText(person.work_company || event.work_company_name),
        occupation_id: normalizeId(person.occupation_id),
        operation_start_date: normalizeText(person.start_date || event.start_date),
        raw_person: maskPersonPayload(person),
        submit_person: person,
        item_status: 'pending',
        precheck_errors: [],
        created_at: nowIso(),
        updated_at: nowIso()
      }
    });
    items.push({ _id: addRes._id || addRes.id });
  }
  return success({ task_id: taskId, task_no: taskNo, items }, '批量任务已创建');
}

async function precheckBatchTask(event) {
  const taskId = normalizeId(event.task_id);
  const taskDoc = await db.collection('insurance_batch_tasks').doc(taskId).get();
  const task = taskDoc.data;
  if (!task) throw new Error('批量任务不存在');
  const itemsRes = await db.collection('insurance_batch_task_items').where({ task_id: taskId }).limit(1000).get();
  let ready = 0;
  let failed = 0;
  for (const item of itemsRes.data || []) {
    const person = item.submit_person || item.raw_person || {};
    const check = task.type === 'batch_add'
      ? await precheckAddInsurance({ policy_id: item.policy_id, start_date: item.operation_start_date, person: { ...person, work_company: item.work_company, occupation_id: item.occupation_id } })
      : await precheckOffInsurance({ policy_id: item.policy_id, start_date: item.operation_start_date, ...person });
    const valid = check.data.valid;
    if (valid) ready += 1;
    else failed += 1;
    await db.collection('insurance_batch_task_items').doc(item._id).update({
      data: {
        item_status: valid ? 'ready' : 'precheck_failed',
        precheck_errors: check.data.errors || [],
        updated_at: nowIso()
      }
    });
  }
  await db.collection('insurance_batch_tasks').doc(taskId).update({
    data: {
      status: ready > 0 ? 'ready' : 'failed',
      failed_count: failed,
      precheck_summary: { ready, failed },
      updated_at: nowIso()
    }
  });
  return success({ ready, failed }, '批量预校验完成');
}

function groupAddItems(items) {
  const groups = new Map();
  for (const item of items) {
    const key = [item.policy_id, item.operation_start_date, item.work_company, item.occupation_id].join('__');
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(item);
  }
  return Array.from(groups.values());
}

async function submitBatchTask(event) {
  const taskId = normalizeId(event.task_id);
  const taskDoc = await db.collection('insurance_batch_tasks').doc(taskId).get();
  const task = taskDoc.data;
  if (!task) throw new Error('批量任务不存在');
  const itemsRes = await db.collection('insurance_batch_task_items')
    .where({ task_id: taskId, item_status: _.in(['ready', 'failed']) })
    .limit(1000)
    .get();
  const items = (itemsRes.data || []).filter((item) => event.retry_failed ? item.item_status === 'failed' : item.item_status === 'ready');
  let successCount = 0;
  let failedCount = 0;
  await db.collection('insurance_batch_tasks').doc(taskId).update({ data: { status: 'processing', updated_at: nowIso() } });

  if (task.type === 'batch_add') {
    for (const group of groupAddItems(items)) {
      for (let index = 0; index < group.length; index += ADD_BATCH_SIZE) {
        const chunk = group.slice(index, index + ADD_BATCH_SIZE);
        const persons = chunk.map((item) => ({
          ...(item.submit_person || {}),
          name: item.name_snapshot,
          idcard: item.submit_person?.idcard,
          work_company: item.work_company,
          occupation_id: item.occupation_id
        }));
        const res = await addInsurance({
          policy_id: chunk[0].policy_id,
          start_date: chunk[0].operation_start_date,
          persons,
          userInfo: event.userInfo
        }).catch((err) => error(400, err.message));
        const ok = res.code === 0;
        for (const item of chunk) {
          await db.collection('insurance_batch_task_items').doc(item._id).update({
            data: {
              item_status: ok ? 'success' : 'failed',
              provider_response: res,
              updated_at: nowIso()
            }
          });
          if (ok) successCount += 1;
          else failedCount += 1;
        }
      }
    }
  } else {
    const offGroups = new Map();
    for (const item of items) {
      const key = [item.policy_id, item.operation_start_date].join('__');
      if (!offGroups.has(key)) offGroups.set(key, []);
      offGroups.get(key).push(item);
    }

    for (const group of offGroups.values()) {
      const persons = group.map((item) => {
        const person = item.submit_person || {};
        return { ...person, name: item.name_snapshot, policy_person_id: person.policy_person_id };
      });
      const res = await offInsurance({
        policy_id: group[0].policy_id,
        start_date: group[0].operation_start_date,
        persons,
        userInfo: event.userInfo
      }).catch((err) => error(400, err.message));
      const ok = res.code === 0;
      for (const item of group) {
        await db.collection('insurance_batch_task_items').doc(item._id).update({
          data: {
            item_status: ok ? 'success' : 'failed',
            provider_response: res,
            updated_at: nowIso()
          }
        });
        if (ok) successCount += 1;
        else failedCount += 1;
      }
    }
  }

  const status = failedCount > 0 && successCount > 0 ? 'partial_success' : (failedCount > 0 ? 'failed' : 'success');
  await db.collection('insurance_batch_tasks').doc(taskId).update({
    data: {
      status,
      success_count: successCount,
      failed_count: failedCount,
      finished_at: nowIso(),
      updated_at: nowIso()
    }
  });
  return success({ success_count: successCount, failed_count: failedCount, status }, '批量提交完成');
}

async function retryBatchFailedItems(event) {
  return submitBatchTask({ ...event, retry_failed: true });
}

function normalizeProviderChangeType(value) {
  const text = normalizeText(value);
  if (['add', 'pending_add', '加保'].includes(text)) return '加保';
  if (['off', 'pending_off', '减保'].includes(text)) return '减保';
  return text;
}

function mapProviderChangeRecord(item = {}) {
  const providerChangeId = normalizeId(item.policy_change_id || item.id);
  const typeText = normalizeText(item.type);
  return {
    _id: providerChangeId,
    provider: PROVIDER,
    provider_change_id: providerChangeId,
    policy_change_id: providerChangeId,
    policy_id: normalizeId(item.policy_id),
    operation_type: typeText === '加保' ? 'add' : (typeText === '减保' ? 'off' : typeText),
    type: typeText,
    type_text: typeText,
    change_type: item.change_type,
    start_date: normalizeText(item.start_date),
    end_date: normalizeText(item.end_date),
    person_count: toNumber(item.person_count),
    premium: toNumber(item.premium),
    agent_premium: toNumber(item.agent_premium),
    cost_premium: toNumber(item.cost_premium),
    source: normalizeText(item.source),
    operate_name: normalizeText(item.operate_name),
    input_user_id: normalizeId(item.input_user_id),
    status: item.status,
    status_code: item.status,
    progress_status: item.progress_status,
    progress_status_code: item.progress_status,
    progress_by: normalizeText(item.progress_by),
    progress_remark: normalizeText(item.progress_remark),
    progress_time: normalizeText(item.progress_time),
    create_time: normalizeText(item.create_time),
    update_time: normalizeText(item.update_time),
    created_at: normalizeText(item.create_time),
    updated_at: normalizeText(item.update_time),
    plan: normalizeText(item.plan),
    plan_id: normalizeId(item.plan_id),
    policy_no: normalizeText(item.policy_no),
    price: normalizeText(item.price),
    month: normalizeText(item.month),
    remark: normalizeText(item.remark),
    raw_data: item
  };
}

async function fetchProviderChangePage({ page = 1, policy_id } = {}) {
  const query = { page: Math.max(1, Number(page) || 1) };
  if (policy_id) query.policy_id = normalizeId(policy_id);
  const payload = await requestProvider('/api/policy_change/lists', {
    method: 'GET',
    query
  });
  if (Number(payload.code) !== 1) throw new Error(payload.msg || '获取云工保投保变更记录失败');
  const data = payload.data || {};
  return {
    list: (data.data || []).map(mapProviderChangeRecord),
    total: toNumber(data.total),
    page: toNumber(data.current_page, query.page),
    pageSize: toNumber(data.per_page, 15),
    totalPages: toNumber(data.last_page, 1)
  };
}

function filterProviderChangeRecords(list = [], event = {}) {
  const typeFilter = normalizeProviderChangeType(event.type || event.operation_type || event.changeType);
  const keyword = normalizeText(event.keyword || event.name || event.search);
  return list.filter((item) => {
    const typeMatched = !typeFilter || item.type_text === typeFilter;
    const keywordMatched = !keyword || [
      item.policy_id,
      item.policy_no,
      item.plan,
      item.remark,
      item.source,
      item.operate_name
    ].some((value) => normalizeText(value).includes(keyword));
    return typeMatched && keywordMatched;
  });
}

async function listProviderChangeRecords(event = {}) {
  const page = Math.max(1, Number(event.page) || 1);
  const pageSize = Math.max(1, Math.min(100, Number(event.pageSize) || 15));
  const hasClientFilter = Boolean(
    normalizeProviderChangeType(event.type || event.operation_type || event.changeType)
    || normalizeText(event.keyword || event.name || event.search)
  );

  const firstPage = await fetchProviderChangePage({ page: hasClientFilter ? 1 : page, policy_id: event.policy_id });
  if (!hasClientFilter) return success(firstPage);

  const all = [...firstPage.list];
  for (let nextPage = 2; nextPage <= firstPage.totalPages; nextPage += 1) {
    const pageResult = await fetchProviderChangePage({ page: nextPage, policy_id: event.policy_id });
    all.push(...pageResult.list);
  }

  const filtered = filterProviderChangeRecords(all, event);
  const start = (page - 1) * pageSize;
  return success({
    list: filtered.slice(start, start + pageSize),
    total: filtered.length,
    page,
    pageSize,
    totalPages: Math.ceil(filtered.length / pageSize)
  });
}

async function getProviderChangeDetail(event = {}) {
  const providerChangeId = normalizeId(event.policy_change_id || event.provider_change_id || event.id);
  if (!providerChangeId) throw new Error('缺少 policy_change_id');
  const [payload, personsPayload] = await Promise.all([
    requestProvider('/api/policy_change/detail', {
      method: 'GET',
      query: { policy_change_id: providerChangeId }
    }),
    requestProvider('/api/policy_change/persons', {
      method: 'GET',
      query: { policy_change_id: providerChangeId }
    }).catch((err) => ({ code: 0, msg: err.message, data: { data: [] } }))
  ]);
  if (Number(payload.code) !== 1) throw new Error(payload.msg || '获取云工保投保变更详情失败');
  const personsData = personsPayload.data || {};
  return success({
    ...mapProviderChangeRecord(payload.data || {}),
    work_company: payload.data?.work_company || [],
    persons: (personsData.data || []).map(mapProviderChangePerson),
    persons_total: toNumber(personsData.total),
    persons_page: toNumber(personsData.current_page, 1),
    persons_page_size: toNumber(personsData.per_page, 15),
    persons_total_pages: toNumber(personsData.last_page, 1),
    persons_summary: {
      replace_count: toNumber(personsData.replace_count),
      add_count: toNumber(personsData.add_count),
      premium: toNumber(personsData.premium),
      show_type: personsData.show_type
    }
  });
}

function mapProviderChangePerson(item = {}) {
  const fullIdcard = pickFullIdcard(item.idcard_ok, item.idcard_bak, item.idcard);
  const fullOffIdcard = pickFullIdcard(item.off_idcard);
  return {
    _id: normalizeId(item.policy_change_person_id || item.employee_id),
    policy_change_person_id: normalizeId(item.policy_change_person_id),
    employee_id: normalizeId(item.employee_id),
    name: normalizeText(item.name),
    idcard: fullIdcard,
    idcard_masked: fullIdcard,
    employee_mobile: normalizeText(item.employee_mobile),
    employee_mobile_masked: normalizeText(item.employee_mobile),
    work_company: normalizeText(item.work_company),
    job: normalizeText(item.job),
    occupation_name: normalizeText(item.occupation_name),
    occupation_category: normalizeText(item.category),
    operation: normalizeText(item.operation),
    off_start_date: normalizeText(item.off_start_date),
    off_name: normalizeText(item.off_name),
    off_idcard: fullOffIdcard,
    off_idcard_masked: fullOffIdcard,
    idcard_ok: normalizeText(item.idcard_ok),
    idcard_ok_masked: normalizeText(item.idcard_ok),
    idcard_bak: normalizeText(item.idcard_bak),
    idcard_bak_masked: normalizeText(item.idcard_bak),
    raw_data: {
      ...item,
      idcard: normalizeText(item.idcard),
      employee_mobile: normalizeText(item.employee_mobile),
      idcard_ok: normalizeText(item.idcard_ok),
      idcard_bak: normalizeText(item.idcard_bak),
      off_idcard: normalizeText(item.off_idcard)
    }
  };
}

function mapProviderEmployee(item = {}) {
  return {
    _id: normalizeId(item.employee_id),
    provider: PROVIDER,
    provider_employee_id: normalizeId(item.employee_id),
    employee_id: normalizeId(item.employee_id),
    policy_id: normalizeId(item.policy_id),
    policy_person_id: normalizeId(item.policy_person_id),
    name: normalizeText(item.name),
    name_snapshot: normalizeText(item.name),
    idcard: normalizeText(item.idcard),    // 完整身份证
    idcard_masked: normalizeText(item.idcard),
    employee_mobile_masked: normalizeText(item.employee_mobile),
    job: normalizeText(item.job),
    work_company: normalizeText(item.work_company),
    occupation_name: normalizeText(item.occupation_name),
    occupation_category: normalizeText(item.occupation_category),
    insurance_company_name: normalizeText(item.insurance_company_name),
    start_date: normalizeText(item.start_date),
    end_date: normalizeText(item.end_date),
    is_active: toNumber(item.is_active),
    status: toNumber(item.is_active) === 1 ? 'active' : 'offed',
    age: toNumber(item.age),
    gender: normalizeText(item.gender),
    raw_data: { ...item, idcard: normalizeText(item.idcard), employee_mobile: normalizeText(item.employee_mobile) }
  };
}

async function listProviderEmployees(event = {}) {
  const page = Math.max(1, Number(event.page) || 1);
  const query = { page };
  if (event.policy_id) query.policy_id = normalizeId(event.policy_id);
  const payload = await requestProvider('/api/employee/lists', {
    method: 'GET',
    query
  });
  if (Number(payload.code) !== 1) throw new Error(payload.msg || '获取云工保员工档案失败');
  const data = payload.data || {};
  return success({
    list: (data.data || []).map(mapProviderEmployee),
    total: toNumber(data.total),
    active_count: toNumber(data.active_count),
    page: toNumber(data.current_page, page),
    pageSize: toNumber(data.per_page, 15),
    totalPages: toNumber(data.last_page, 1)
  });
}

async function getProviderEmployeeDetail(event = {}) {
  const employeeId = normalizeId(event.employee_id || event.provider_employee_id || event.id);
  if (!employeeId) throw new Error('缺少 employee_id');
  const payload = await requestProvider('/api/employee/detail', {
    method: 'GET',
    query: { employee_id: employeeId }
  });
  if (Number(payload.code) !== 1) throw new Error(payload.msg || '获取云工保员工详情失败');
  const data = payload.data || {};
  return success({
    ...mapProviderEmployee(data),
    records: (data.records || []).map((record) => ({
      ...record,
      employee_id: normalizeId(record.employee_id)
    })),
    replace_record: data.replace_record || []
  });
}

async function saveCompanyMapping(event) {
  const data = {
    provider: PROVIDER,
    company_id: normalizeId(event.company_id),
    company_name_snapshot: normalizeText(event.company_name_snapshot || event.company_name),
    policy_id: normalizeId(event.policy_id),
    work_company_id: normalizeId(event.work_company_id),
    work_company_name: normalizeText(event.work_company_name),
    suggest_policy_id: normalizeId(event.suggest_policy_id || event.policy_id),
    enabled: event.enabled !== false
  };
  if (!data.company_id || !data.policy_id || !data.work_company_id || !data.work_company_name) {
    throw new Error('企业映射缺少必要字段');
  }
  const company = await getWorkCompany(data.policy_id, data.work_company_id);
  if (!company) throw new Error('被派遣单位不存在，请先同步该保单的被派遣单位');
  if (company.status !== '已通过') throw new Error('被派遣单位状态不是已通过');
  return success(await upsertByQuery('insurance_company_mappings', {
    provider: PROVIDER,
    company_id: data.company_id,
    policy_id: data.policy_id
  }, data), '企业映射已保存');
}

async function saveJobMapping(event) {
  const data = {
    provider: PROVIDER,
    company_id: normalizeId(event.company_id),
    company_name_snapshot: normalizeText(event.company_name_snapshot || event.company_name),
    job_id: normalizeId(event.job_id),
    job_name_snapshot: normalizeText(event.job_name_snapshot || event.job_name),
    rate_plan_id: normalizeId(event.rate_plan_id),
    policy_id: normalizeId(event.policy_id),
    policy_name: normalizeText(event.policy_name || event.plan_name || event.plan),
    work_company_id: normalizeId(event.work_company_id),
    work_company_name: normalizeText(event.work_company_name),
    occupation_id: normalizeId(event.occupation_id),
    occupation_name: normalizeText(event.occupation_name),
    occupation_category: toNumber(event.occupation_category),
    series: normalizeText(event.series),
    series_name: normalizeText(event.series_name),
    mapping_status: event.mapping_status || 'active',
    match_rule: event.match_rule || 'manual',
    confidence: toNumber(event.confidence, 1),
    remark: normalizeText(event.remark),
    updated_by: event.userInfo?.uid || ''
  };
  if (!data.company_id || (!data.job_id && !data.rate_plan_id) || !data.policy_id || !data.work_company_id || !data.occupation_id) {
    throw new Error('岗位映射缺少必要字段');
  }
  const policy = await getPolicy(data.policy_id);
  if (!policy.active) throw new Error('保单不在可加减保下拉列表中');
  data.policy_name = data.policy_name || policy.active?.plan_name || policy.full?.plan_name || policy.active?.plan || policy.full?.plan || '';
  const company = await getWorkCompany(data.policy_id, data.work_company_id);
  if (!company) throw new Error('被派遣单位不存在');
  if (company.status !== '已通过') throw new Error('被派遣单位状态不是已通过');
  const occupation = await getOccupation(data.policy_id, data.occupation_id);
  if (!occupation) throw new Error('工种不存在');
  const allowed = String(company.occupation_ids || '').split(',').map((item) => item.trim());
  if (!allowed.includes(data.occupation_id)) throw new Error('工种不在被派遣单位白名单内');
  const policySeries = policy.full?.series || '';
  if (policySeries && occupation.series && policySeries !== occupation.series) {
    throw new Error('工种 series 与保单 series 不一致');
  }
  data.occupation_name = data.occupation_name || occupation.show_name || occupation.name;
  data.occupation_category = data.occupation_category || occupation.category;
  data.series = data.series || occupation.series;
  data.series_name = data.series_name || occupation.series_name || '';
  if (event._id) {
    await db.collection('insurance_job_mappings').doc(event._id).update({
      data: {
        ...data,
        updated_at: nowIso()
      }
    });
    return success({ _id: event._id, ...data }, '岗位映射已保存');
  }
  return success(await upsertByQuery('insurance_job_mappings', {
    provider: PROVIDER,
    company_id: data.company_id,
    job_id: data.job_id,
    rate_plan_id: data.rate_plan_id,
    policy_id: data.policy_id
  }, data), '岗位映射已保存');
}

async function getOverview() {
  const [
	    config,
	    policies,
	    activePolicies,
	    recordsActive,
	    providerChanges,
	    recordsFailed,
	    exceptions
	  ] = await Promise.all([
	    readConfig(),
	    db.collection('insurance_policies').where({ provider: PROVIDER }).count().catch(() => ({ total: 0 })),
	    db.collection('insurance_active_policies').where({ provider: PROVIDER }).count().catch(() => ({ total: 0 })),
	    db.collection('employee_insurance_records').where({ provider: PROVIDER, status: 'active' }).count().catch(() => ({ total: 0 })),
	    fetchProviderChangePage({ page: 1 }).catch(() => ({ total: 0 })),
	    db.collection('employee_insurance_records').where({ provider: PROVIDER, status: 'failed' }).count().catch(() => ({ total: 0 })),
	    db.collection('employee_insurance_records').where({ provider: PROVIDER, status: 'mismatch' }).count().catch(() => ({ total: 0 }))
  ]);
  return success({
    config: sanitizeProviderConfig(config),
    policy_count: policies.total || 0,
    active_policy_count: activePolicies.total || 0,
    active_count: config?.provider_active_person ?? recordsActive.total ?? 0,
    local_active_count: recordsActive.total || 0,
	    account_balance: config?.account_balance ?? null,
	    balance_updated_at: config?.balance_updated_at || '',
	    provider_stats_updated_at: config?.provider_stats_updated_at || '',
	    provider_change_count: providerChanges.total || 0,
	    failed_count: recordsFailed.total || 0,
	    exception_count: exceptions.total || 0
	  });
}

exports.main = async (event = {}) => {
  try {
    switch (event.action) {
      case 'getConfig': return await getConfig();
      case 'setupCollections': return await setupCollections();
      case 'saveConfig': return await saveConfig(event);
      case 'login': return await login(event);
      case 'checkCustomerStatus': return await checkCustomerStatus(event);
      case 'syncPolicies': return await syncPolicies(event);
      case 'syncActivePolicies': return await syncActivePolicies(event);
      case 'syncWorkCompanies': return await syncWorkCompanies(event);
      case 'syncOccupations': return await syncOccupations(event);
      case 'syncPolicyPersons': return await syncPolicyPersons(event);
      case 'syncOffEmployees': return await syncOffEmployees(event);
      case 'precheckAddInsurance': return await precheckAddInsurance(event);
      case 'precheckOffInsurance': return await precheckOffInsurance(event);
      case 'addInsurance': return await addInsurance(event);
      case 'offInsurance': return await offInsurance(event);
      case 'createBatchTask': return await createBatchTask(event);
      case 'precheckBatchTask': return await precheckBatchTask(event);
      case 'submitBatchTask': return await submitBatchTask(event);
      case 'retryBatchFailedItems': return await retryBatchFailedItems(event);
      case 'reconcileAddChangeRequest': return await reconcileAddChangeRequest(event);
      case 'listProviderChangeRecords': return await listProviderChangeRecords(event);
      case 'getProviderChangeDetail': return await getProviderChangeDetail(event);
      case 'listProviderEmployees': return await listProviderEmployees(event);
      case 'getProviderEmployeeDetail': return await getProviderEmployeeDetail(event);
      case 'saveCompanyMapping': return await saveCompanyMapping(event);
      case 'saveJobMapping': return await saveJobMapping(event);
      case 'getOverview': return await getOverview(event);
      case 'listPolicies': return success(await listCollection('insurance_policies', event));
      case 'listActivePolicies': return success(await listCollection('insurance_active_policies', event));
      case 'listWorkCompanies': return success(await listCollection('insurance_work_companies', event));
      case 'listOccupations': return success(await listCollection('insurance_occupations', event));
      case 'listCompanyMappings': return success(await listCollection('insurance_company_mappings', event));
      case 'listJobMappings': return success(await listCollection('insurance_job_mappings', event));
      case 'listInsuranceRecords': return success(await listInsuranceRecords(event));
      case 'listUninsuredEmployees': return success(await listUninsuredEmployees(event));
      case 'syncEmployeeCompanySnapshots': return success(await syncEmployeeCompanySnapshots(event), '员工企业关系快照已同步');
      case 'listBatchTasks': return success(await listCollection('insurance_batch_tasks', event));
      case 'listBatchTaskItems': return success(await listCollection('insurance_batch_task_items', event));
      case 'listChangeRequests': return success(await listCollection('insurance_change_requests', event));
      case 'listSyncLogs': return success(await listCollection('insurance_sync_logs', event));
      case 'listExceptions': return success(await listCollection('employee_insurance_records', {
        ...event,
        where: { provider: PROVIDER, status: _.in(['failed', 'mismatch']) }
      }));
      case 'recordException': return await recordException(event);
      default:
        return error(400, '不支持的操作');
    }
  } catch (err) {
    console.error('[insurance-yungongbao] error:', err);
    await writeSyncLog(event.action || 'unknown', 'failed', { message: err.message }).catch(() => null);
    return error(500, err.message || '保险模块错误');
  }
};
