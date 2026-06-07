/**
 * 入职/员工管理模块
 */
const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

function success(data = null, message = 'success') {
  return { code: 0, message, data };
}

function error(code = 1, message = 'error', data = null) {
  return { code, message, data };
}
const db = cloud.database();
let generateEmployeeNo;
try {
  ({ generateEmployeeNo } = require('../common/utils'));
} catch (err) {
  generateEmployeeNo = function fallbackGenerateEmployeeNo() {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    const random = Math.floor(Math.random() * 10000);
    return `EP${year}${month}${day}${String(random).padStart(4, '0')}`;
  };
}

let encrypt;
try {
  ({ encrypt } = require('../common/crypto'));
} catch (err) {
  encrypt = (value) => value;
}
const { recordCandidateAction } = require('./candidateOwnership');

function toDateStr(val) {
  if (!val) return '';
  if (typeof val === 'string') {
    const match = val.match(/^(\d{4}-\d{2}-\d{2})/);
    if (match) return match[1];
  }
  const d = new Date(val);
  if (isNaN(d.getTime())) return '';
  const formatter = new Intl.DateTimeFormat('zh-CN', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric', month: '2-digit', day: '2-digit'
  });
  const parts = formatter.formatToParts(d);
  const get = type => parts.find(p => p.type === type).value;
  return `${get('year')}-${get('month')}-${get('day')}`;
}

function getTodayStr() {
  return toDateStr(new Date());
}

function deriveRelationStatusFromLeaveDate(leaveDateInput, today = getTodayStr()) {
  const leaveDate = toDateStr(leaveDateInput);
  if (!leaveDate) return 'active';
  if (leaveDate < today) return 'resigned';
  return 'pending_resign';
}

function getNextDateStr(date = new Date()) {
  const next = new Date(date);
  next.setDate(next.getDate() + 1);
  return toDateStr(next);
}

function roundMoney(value) {
  return Math.round(Number(value || 0) * 100) / 100;
}

function getPairKey(employeeId, companyId) {
  return `${employeeId}__${companyId}`;
}

function getAddResultId(result) {
  return String(result?._id || result?.id || '');
}

function pickFirstValue(...values) {
  for (const value of values) {
    if (value !== undefined && value !== null && value !== '') {
      return value;
    }
  }
  return '';
}

function normalizeText(value) {
  return String(value || '').trim();
}

function normalizeName(value) {
  return normalizeText(value).replace(/\s+/g, '');
}

async function resolveEmployeeCompanySnapshot(companyId, relationPayload = {}) {
  let company = null;
  let job = null;
  const jobId = normalizeText(relationPayload.job_id);

  if (companyId && !normalizeText(relationPayload.company_name)) {
    const companyRes = await db.collection('companies').doc(companyId).get().catch(() => ({ data: null }));
    company = getDocData(companyRes) || null;
  }

  if (jobId && (!normalizeText(relationPayload.job_name) || !normalizeText(relationPayload.company_name))) {
    const jobRes = await db.collection('jobs').doc(jobId).get().catch(() => ({ data: null }));
    job = getDocData(jobRes) || null;
  }

  return {
    ...relationPayload,
    company_name: normalizeText(
      relationPayload.company_name
      || company?.name
      || company?.company_name
      || company?.short_name
      || job?.company_name
    ),
    job_name: normalizeText(
      relationPayload.job_name
      || job?.position
      || job?.job_name
      || job?.name
    )
  };
}

function buildReferralSnapshot({
  referrer_id = '',
  referrer_name = '',
  source_referrer_id = '',
  source_referrer_name = '',
  recommender_id = '',
  recommender_name = ''
} = {}) {
  const referralId = pickFirstValue(source_referrer_id, referrer_id, recommender_id);
  const referralName = pickFirstValue(source_referrer_name, referrer_name, recommender_name);
  return {
    source_referrer_id: referralId,
    source_referrer_name: referralName,
    referrer_id: referralId,
    referrer_name: referralName,
    recommender_id: referralId,
    recommender_name: referralName
  };
}

function normalizePhone(value) {
  return normalizeText(value).replace(/\D+/g, '');
}

function normalizeIdCard(value) {
  return normalizeText(value).toUpperCase();
}

function normalizeCloudFunctionResult(result) {
  const payload = result?.result || result;
  if (typeof payload === 'string') {
    try {
      return JSON.parse(payload);
    } catch (err) {
      return payload;
    }
  }
  return payload;
}

async function callInsurance(action, data = {}) {
  const result = await cloud.callFunction({
    name: 'insurance-yungongbao',
    data: { action, ...data }
  });
  const payload = normalizeCloudFunctionResult(result);
  if (!payload || payload.code !== 0) {
    throw new Error(payload?.message || '保险云函数调用失败');
  }
  return payload.data;
}

async function findActiveInsuranceJobMapping({ company_id, job_id, rate_plan_id }) {
  const companyId = normalizeText(company_id);
  const jobId = normalizeText(job_id);
  const ratePlanId = normalizeText(rate_plan_id);
  if (!companyId || (!jobId && !ratePlanId)) return null;
  const candidates = [
    jobId ? { company_id: companyId, job_id: jobId, mapping_status: 'active' } : null,
    ratePlanId ? { company_id: companyId, rate_plan_id: ratePlanId, mapping_status: 'active' } : null
  ].filter(Boolean);
  for (const where of candidates) {
    const res = await callInsurance('listJobMappings', { page: 1, pageSize: 1, where });
    if (res?.list?.length) return res.list[0];
  }
  return null;
}

async function tryAutoAddInsuranceAfterOnboard(employee) {
  try {
    const mapping = await findActiveInsuranceJobMapping(employee);
    if (!mapping) return;
    await callInsurance('addInsurance', {
      policy_id: mapping.policy_id,
      start_date: getNextDateStr(),
      persons: [{
        name: employee.name,
        idcard: employee.id_card,
        work_company: mapping.work_company_name,
        occupation_id: mapping.occupation_id,
        employee_id: employee.employee_id || employee._id || employee.id,
        employee_company_id: employee.relation_id || ''
      }]
    });
  } catch (err) {
    console.warn('[employees] 自动加保失败，不阻断入职:', err && err.message);
  }
}

function pickPreferredEmployee(list = []) {
  const candidates = (Array.isArray(list) ? list : []).filter(Boolean);
  if (!candidates.length) return null;

  const score = (item) => {
    const status = normalizeText(item.status).toLowerCase();
    const merged = normalizeText(item.merged_into_employee_id);
    const activeScore = ['regular', 'probation'].includes(status) ? 100 : 0;
    const mergedScore = merged ? -1000 : 0;
    const updatedAt = new Date(item.updated_at || item.created_at || 0).getTime() || 0;
    return activeScore + mergedScore + updatedAt / 1e13;
  };

  return [...candidates].sort((a, b) => score(b) - score(a))[0];
}

function getDocData(res) {
  return res?.data?.[0] || res?.data || null;
}

function isEmployeeCompanyRelationActive(relation, today = getTodayStr()) {
  if (!relation) return false;

  const status = normalizeText(relation.status).toLowerCase();
  if (['resigned', 'left', 'inactive', 'disabled', 'archived'].includes(status)) {
    return false;
  }

  const leaveDate = toDateStr(relation.leave_date);
  if (leaveDate && leaveDate < today) return false;
  return true;
}

async function getExistingBoundEmployee(userId) {
  if (!userId) return null;

  const userRes = await db.collection('users').doc(userId).get();
  const user = getDocData(userRes);
  if (user?.employee_id) {
    const employeeRes = await db.collection('employees').doc(user.employee_id).get();
    const employee = getDocData(employeeRes);
    if (employee && !normalizeText(employee.merged_into_employee_id)) return employee;
  }

  const employeeRes = await db.collection('employees').where({ user_id: userId }).limit(10).get();
  return pickPreferredEmployee(employeeRes.data || []);
}

async function findReusableEmployee({ user_id = '', id_card = '', phone = '', name = '' } = {}) {
  const normalizedIdCard = normalizeIdCard(id_card);
  const normalizedName = normalizeName(name);
  if (normalizedIdCard && normalizedName) {
    const idCardRes = await db.collection('employees').where({ id_card: normalizedIdCard }).get();
    const matches = (idCardRes.data || []).filter((item) => !normalizeText(item.merged_into_employee_id));
    const nameMatches = matches.filter((item) => normalizeName(item.name) === normalizedName);
    if (nameMatches.length === 1) return { employee: nameMatches[0], rule: 'id_card_name', ambiguous: false };
    if (nameMatches.length > 1) return { employee: null, rule: 'id_card_name', ambiguous: true };
    if (matches.length > 0) return { employee: null, rule: 'id_card_name_conflict', ambiguous: true };
  }

  if (user_id) {
    const boundEmployee = await getExistingBoundEmployee(user_id);
    if (boundEmployee) {
      if (normalizedIdCard && normalizeIdCard(boundEmployee.id_card) && normalizeIdCard(boundEmployee.id_card) !== normalizedIdCard) {
        return { employee: null, rule: 'user_id_id_card_conflict', ambiguous: true };
      }
      return { employee: boundEmployee, rule: 'user_id', ambiguous: false };
    }
  }

  const normalizedPhone = normalizePhone(phone);
  if (normalizedPhone && normalizedName) {
    const phoneRes = await db.collection('employees').where({ phone: normalizedPhone }).get();
    const matches = (phoneRes.data || []).filter((item) => (
      !normalizeText(item.merged_into_employee_id)
      && normalizeName(item.name) === normalizedName
    ));
    if (matches.length === 1) return { employee: matches[0], rule: 'phone_name', ambiguous: false };
    if (matches.length > 1) return { employee: null, rule: 'phone_name', ambiguous: true };
  }

  return { employee: null, rule: '', ambiguous: false };
}

async function ensureEmployeeCompanyRelation(employeeId, companyId, relationPayload) {
  if (!employeeId || !companyId) throw new Error('缺少员工或企业信息');
  const snapshotPayload = await resolveEmployeeCompanySnapshot(companyId, relationPayload || {});

  const relationRes = await db.collection('employee_companies')
    .where({ employee_id: employeeId, company_id: companyId })
    .get();

  const relations = relationRes.data || [];
  const activeRelation = relations.find((item) => isEmployeeCompanyRelationActive(item));
  if (activeRelation) {
    throw new Error('该员工已在当前企业存在有效入职关系');
  }

  await db.collection('employee_companies').add({
    data: {
      employee_id: employeeId,
      company_id: companyId,
      ...snapshotPayload,
      status: deriveRelationStatusFromLeaveDate(snapshotPayload?.leave_date),
      created_at: db.serverDate(),
      updated_at: db.serverDate()
    }
  });
}

async function updateEmployeeMasterForOnboard(employeeId, payload, userId = '') {
  const employeeRes = await db.collection('employees').doc(employeeId).get();
  const currentEmployee = getDocData(employeeRes);
  if (!currentEmployee) throw new Error('员工不存在');

  if (userId && normalizeText(currentEmployee.user_id) && normalizeText(currentEmployee.user_id) !== userId) {
    throw new Error('该员工已绑定其他账号');
  }

  const updatePayload = {
    ...(userId ? { user_id: userId } : {}),
    ...(payload.name ? { name: payload.name } : {}),
    ...(payload.phone ? { phone: payload.phone } : {}),
    ...(payload.id_card ? { id_card: payload.id_card } : {}),
    ...(payload.gender !== undefined ? { gender: payload.gender } : {}),
    ...(payload.birth_date ? { birth_date: payload.birth_date } : {}),
    updated_at: db.serverDate()
  };

  await db.collection('employees').doc(employeeId).update({ data: updatePayload });
  return { ...currentEmployee, ...updatePayload, _id: employeeId };
}

async function syncUserEmployeeBinding(userId, employeeId, employeeNo) {
  if (!userId || !employeeId) return;

  await db.collection('users').doc(userId).update({
    data: {
      employee_id: employeeId,
      employee_no: employeeNo || '',
      updated_at: db.serverDate()
    }
  });
}

async function findExistingEmployeeByPhoneAndCompany(phone, companyId) {
  const normalizedPhone = String(phone || '').replace(/\D+/g, '');
  if (!normalizedPhone || !companyId) return null;

  const employeeRes = await db.collection('employees')
    .where({
      phone: normalizedPhone,
      status: db.command.in(['probation', 'regular'])
    })
    .limit(20)
    .get();

  const employees = Array.isArray(employeeRes.data) ? employeeRes.data : [];
  if (!employees.length) return null;
  const activeEmployees = employees.filter((item) => !normalizeText(item.merged_into_employee_id));

  const employeeIds = activeEmployees.map(item => item && item._id).filter(Boolean);
  if (!employeeIds.length) return null;

  try {
    const relationRes = await db.collection('employee_companies')
      .where({
        employee_id: db.command.in(employeeIds),
        company_id: companyId,
        status: 'active'
      })
      .limit(20)
      .get();

    const relationList = Array.isArray(relationRes.data) ? relationRes.data : [];
    if (!relationList.length) return null;

    const matchedEmployeeId = relationList[0].employee_id;
    return activeEmployees.find(item => item._id === matchedEmployeeId) || null;
  } catch (err) {
    console.warn('按手机号+企业检查重复入职失败，回退 employees.company_id 判断', err?.message);
    return null;
  }
}

async function scanCollection(name, handler, pageSize = 100) {
  const countRes = await db.collection(name).count();
  const total = Number(countRes.total || 0);

  for (let skip = 0; skip < total; skip += pageSize) {
    const res = await db.collection(name).skip(skip).limit(pageSize).get();
    const list = Array.isArray(res.data) ? res.data : [];
    if (!list.length) break;
    await handler(list);
  }

  return total;
}

exports.main = async (event, context) => {
  const { action, token } = event;
  const isTimerTrigger = process.env.TRIGGER_SRC === 'timer';

  try {
    if (!action && isTimerTrigger) {
      return syncResignedStatus(event);
    }

    switch (action) {
      case 'onboard':
        return createEmployee(event);
      case 'list':
        return listEmployees(event);
      case 'detail':
        return getEmployeeDetail(event);
      case 'update-profile':
        return updateProfile(event);
      case 'resign':
        return resignEmployee(event);
      case 'sync-resigned-status':
        return syncResignedStatus(event);
      case 'repair-employee-companies':
        return repairEmployeeCompanies(event);
      default:
        return error(400, '不支持的操作');
    }
  } catch (err) {
    console.error('入职模块错误:', err);
    return error(500, err.message);
  }
};

/**
 * 办理入职（从候选人转为员工）
 */
async function createEmployee(data) {
  const { user_id, job_id, join_date, referrer_id, referrer_name } = data;
  const referralSnapshot = buildReferralSnapshot({
    referrer_id,
    referrer_name,
    source_referrer_id: data.source_referrer_id,
    source_referrer_name: data.source_referrer_name,
    recommender_id: data.recommender_id,
    recommender_name: data.recommender_name
  });

  // 2. 获取用户信息
  const userDoc = await db.collection('users').doc(user_id).get();
  if (!userDoc.data) {
    return error(404, '用户不存在');
  }
  const user = userDoc.data;
  const profileName = normalizeText(data.real_name || data.name || user.real_name || user.name || '');
  const profilePhone = normalizePhone(data.phone || user.phone || user.employee_phone || user.account_phone || '');
  let profileIdCard = normalizeIdCard(data.id_card || '');
  if (!profileIdCard) {
    const appRes = await db.collection('applications')
      .where({ user_id, job_id })
      .limit(10)
      .get();
    const identityApplication = (appRes.data || []).find((item) => normalizeIdCard(item.applicant_id_card));
    profileIdCard = normalizeIdCard(identityApplication?.applicant_id_card || '');
  }
  if (!profileIdCard) {
    return error(400, '缺少身份证号，无法办理入职');
  }
  const profileGender = data.gender !== undefined ? data.gender : (user.gender || 0);
  const profileBirthDate = normalizeText(data.birth_date || user.birth_date || '');

  // 3. 获取岗位信息
  const jobDoc = await db.collection('jobs').doc(job_id).get();
  const job = jobDoc.data;
  const settlement_mode = data.settlement_mode || (job.salary_type === 'monthly' ? 'monthly' : 'daily');
  const reusableMatch = await findReusableEmployee({
    user_id,
    id_card: profileIdCard,
    phone: profilePhone,
    name: profileName
  });

  if (reusableMatch.ambiguous) {
    return error(400, '匹配到多个历史员工档案，请先清理重复员工数据');
  }

  if (reusableMatch.employee) {
    const updatedEmployee = await updateEmployeeMasterForOnboard(reusableMatch.employee._id, {
      name: profileName,
      phone: profilePhone,
      id_card: profileIdCard,
      gender: profileGender,
      birth_date: profileBirthDate
    }, user_id);

    await ensureEmployeeCompanyRelation(reusableMatch.employee._id, job.company_id || '', {
      hourly_rate: job.hourly_rate,
      rate_plan_id: job.rate_plan_id || '',
      salary_type: job.salary_type || 'monthly',
      settlement_mode,
      join_date,
      ...referralSnapshot,
      created_by: 'system',
      job_id,
      job_name: job.position || job.job_name || '',
      company_name: job.company_name || ''
    });

    await Promise.all([
      syncUserEmployeeBinding(user_id, reusableMatch.employee._id, reusableMatch.employee.employee_no || updatedEmployee.employee_no || ''),
      db.collection('applications')
        .where({ user_id, job_id })
        .update({
          data: {
            status: 'passed',
            updated_at: db.serverDate()
          }
        })
    ]);

    if (user_id) {
      await recordCandidateAction({
        candidate_id: user_id,
        action_type: 'onboard',
        operator_id: data.operator_id || '',
        operator_name: data.operator_name || '',
        operator_role: data.operator_role || 'hr',
        related_job_id: job_id,
        related_company_id: job.company_id || '',
        related_employee_id: reusableMatch.employee._id,
        remark: `入职日期 ${join_date || ''}`.trim()
      });
    }

    await tryAutoAddInsuranceAfterOnboard({
      ...updatedEmployee,
      name: profileName,
      id_card: profileIdCard,
      employee_id: reusableMatch.employee._id,
      _id: reusableMatch.employee._id,
      company_id: job.company_id || '',
      job_id,
      rate_plan_id: job.rate_plan_id || ''
    });

    return success({
      id: reusableMatch.employee._id,
      employee_no: reusableMatch.employee.employee_no || updatedEmployee.employee_no || '',
      reused: true,
      reuse_rule: reusableMatch.rule
    }, '已复用现有员工主档并创建入职关系');
  }

  const existingByPhoneCompany = await findExistingEmployeeByPhoneAndCompany(
    profilePhone,
    job.company_id || ''
  );
  if (existingByPhoneCompany) {
    return error(400, '该手机号已在当前企业存在入职记录');
  }

  // 4. 创建员工档案
  const employeeNo = generateEmployeeNo();

  const result = await db.collection('employees').add({
    data: {
      user_id,
      name: profileName,
      phone: profilePhone,
      id_card: profileIdCard,
      gender: profileGender,
      birth_date: profileBirthDate,
      employee_no: employeeNo,
      status: 'probation',
      created_at: db.serverDate(),
      updated_at: db.serverDate()
    }
  });
  const employeeId = getAddResultId(result);
  if (!employeeId) {
    throw new Error('创建员工档案失败：未返回员工ID');
  }

  // 5. 必须创建员工-企业关联
  if (!job.company_id) {
    await db.collection('employees').doc(employeeId).remove().catch((rollbackErr) => {
      console.error('岗位缺少企业信息，回滚员工档案失败', rollbackErr && rollbackErr.message);
    });
    throw new Error('岗位缺少企业信息，无法入职');
  }
  try {
    await ensureEmployeeCompanyRelation(employeeId, job.company_id, {
      hourly_rate: job.hourly_rate,
      rate_plan_id: job.rate_plan_id || '',
      salary_type: job.salary_type || 'monthly',
      settlement_mode,
      join_date,
      ...referralSnapshot,
      created_by: 'system',
      job_id,
      job_name: job.position || job.job_name || '',
      company_name: job.company_name || ''
    });
  } catch (err) {
    console.error('写入 employee_companies 失败，准备回滚员工档案', err && err.message);
    await db.collection('employees').doc(employeeId).remove().catch((rollbackErr) => {
      console.error('回滚 employees 失败', rollbackErr && rollbackErr.message);
    });
    throw err;
  }

  await syncUserEmployeeBinding(user_id, employeeId, employeeNo);

  // 6. 更新 applications 状态
  await db.collection('applications')
    .where({ user_id, job_id })
    .update({
      data: {
        status: 'passed',
        updated_at: db.serverDate()
      }
    });

  if (user_id) {
    await recordCandidateAction({
      candidate_id: user_id,
      action_type: 'onboard',
      operator_id: data.operator_id || '',
      operator_name: data.operator_name || '',
      operator_role: data.operator_role || 'hr',
      related_job_id: job_id,
      related_company_id: job.company_id || '',
      related_employee_id: employeeId,
      remark: `入职日期 ${join_date || ''}`.trim()
    });
  }

  await tryAutoAddInsuranceAfterOnboard({
    name: profileName,
    id_card: profileIdCard,
    employee_id: employeeId,
    _id: employeeId,
    company_id: job.company_id || '',
    job_id,
    rate_plan_id: job.rate_plan_id || ''
  });

  return success({ id: employeeId, employee_no }, '入职办理成功');
}

async function listEmployees(data) {
  const { company_id, status, page = 1, pageSize = 20 } = data;
  const [employeeRes, relationRes] = await Promise.all([
    db.collection('employees').orderBy('created_at', 'desc').get(),
    db.collection('employee_companies').orderBy('updated_at', 'desc').get()
  ]);
  const employees = (employeeRes.data || []).filter((item) => !normalizeText(item.merged_into_employee_id));
  const employeeMap = new Map(employees.map((item) => [item._id, item]));
  const relationMap = new Map();

  (relationRes.data || []).forEach((item) => {
    if (!item?.employee_id || !employeeMap.has(item.employee_id)) return;
    if (company_id && item.company_id !== company_id) return;
    const key = `${item.employee_id}__${item.company_id || ''}`;
    const current = relationMap.get(key);
    const currentUpdated = new Date(current?.updated_at || current?.created_at || 0).getTime() || 0;
    const nextUpdated = new Date(item.updated_at || item.created_at || 0).getTime() || 0;
    if (!current || nextUpdated >= currentUpdated) {
      relationMap.set(key, item);
    }
  });

  let list = [...relationMap.values()].map((relation) => {
    const employee = employeeMap.get(relation.employee_id) || {};
    return {
      ...employee,
      relation_id: relation._id,
      employee_id: relation.employee_id,
      company_id: relation.company_id || employee.company_id || '',
      company_name: relation.company_name || employee.company_name || '',
      job_id: relation.job_id || employee.job_id || '',
      join_date: relation.join_date || employee.join_date || '',
      leave_date: relation.leave_date || employee.leave_date || '',
      settlement_mode: relation.settlement_mode || employee.settlement_mode || 'daily',
      relation_status: relation.status || 'active'
    };
  });

  if (!company_id) {
    const relationEmployeeIds = new Set(list.map((item) => item.employee_id));
    const fallbackEmployees = employees
      .filter((item) => !relationEmployeeIds.has(item._id))
      .map((item) => ({ ...item, employee_id: item._id, relation_id: '', relation_status: item.status || '' }));
    list = [...list, ...fallbackEmployees];
  }

  if (status) {
    const lowered = normalizeText(status).toLowerCase();
    list = list.filter((item) => {
      const relationStatus = normalizeText(item.relation_status).toLowerCase();
      const employeeStatus = normalizeText(item.status).toLowerCase();
      return relationStatus === lowered || employeeStatus === lowered;
    });
  }

  list.sort((a, b) => {
    const aTime = new Date(a.updated_at || a.created_at || a.join_date || 0).getTime() || 0;
    const bTime = new Date(b.updated_at || b.created_at || b.join_date || 0).getTime() || 0;
    return bTime - aTime;
  });

  const total = list.length;
  const skip = (page - 1) * pageSize;
  return success({ list: list.slice(skip, skip + pageSize), total, page, pageSize });
}

async function getEmployeeDetail(data) {
  const { id } = data;

  const empDoc = await db.collection('employees').doc(id).get();
  if (!empDoc.data) {
    return error(404, '员工不存在');
  }

  // 获取当前企业关联
  const ecDoc = await db.collection('employee_companies')
    .where({ employee_id: id, status: db.command.in(['active', 'pending_resign']) })
    .get();

  return success({
    ...empDoc.data,
    current_company: ecDoc.data[0] || null
  });
}

async function repairEmployeeCompanies(data) {
  const { dry_run = false, page_size = 100, sample_limit = 10 } = data;

  const employees = new Map();
  const jobs = new Map();
  const companies = new Map();
  const relationKeys = new Set();
  const pairMeta = new Map();

  const [employeeTotal, jobTotal, companyTotal, relationTotal, worktimeTotal] = await Promise.all([
    scanCollection('employees', async (items) => {
      items.forEach((item) => {
        if (item?._id) employees.set(item._id, item);
      });
    }, page_size),
    scanCollection('jobs', async (items) => {
      items.forEach((item) => {
        if (item?._id) jobs.set(item._id, item);
      });
    }, page_size),
    scanCollection('companies', async (items) => {
      items.forEach((item) => {
        if (item?._id) companies.set(item._id, item);
      });
    }, page_size),
    scanCollection('employee_companies', async (items) => {
      items.forEach((item) => {
        if (item?.employee_id && item?.company_id) {
          relationKeys.add(getPairKey(item.employee_id, item.company_id));
        }
      });
    }, page_size),
    scanCollection('worktimes', async (items) => {
      items.forEach((item) => {
        if (!item?.employee_id || !item?.company_id) return;

        const key = getPairKey(item.employee_id, item.company_id);
        const workDate = toDateStr(item.work_date);
        const current = pairMeta.get(key) || {
          employee_id: item.employee_id,
          company_id: item.company_id,
          company_name: item.company_name || '',
          job_id: item.job_id || '',
          earliest_work_date: '',
          latest_hourly_rate: 0,
          count: 0
        };

        current.count += 1;
        if (!current.company_name && item.company_name) current.company_name = item.company_name;
        if (!current.job_id && item.job_id) current.job_id = item.job_id;
        if (Number(item.hourly_rate || 0)) current.latest_hourly_rate = roundMoney(item.hourly_rate);
        if (workDate && (!current.earliest_work_date || workDate < current.earliest_work_date)) {
          current.earliest_work_date = workDate;
        }

        pairMeta.set(key, current);
      });
    }, page_size)
  ]);

  const candidatePairs = new Map();
  employees.forEach((employee) => {
    if (employee.company_id) {
      const key = getPairKey(employee._id, employee.company_id);
      candidatePairs.set(key, { employee_id: employee._id, company_id: employee.company_id, source: 'employee' });
    }
  });
  pairMeta.forEach((meta) => {
    const key = getPairKey(meta.employee_id, meta.company_id);
    if (!candidatePairs.has(key)) {
      candidatePairs.set(key, { employee_id: meta.employee_id, company_id: meta.company_id, source: 'worktime' });
    }
  });

  const repairs = [];
  const skipped = [];

  candidatePairs.forEach((candidate) => {
    const key = getPairKey(candidate.employee_id, candidate.company_id);
    if (relationKeys.has(key)) return;

    const employee = employees.get(candidate.employee_id);
    if (!employee) {
      skipped.push({ ...candidate, reason: 'employee_missing' });
      return;
    }

    const meta = pairMeta.get(key) || null;
    const job = jobs.get(employee.job_id || meta?.job_id || '') || null;
    const company = companies.get(candidate.company_id) || null;
    const leaveDate = employee.company_id === candidate.company_id ? toDateStr(employee.leave_date) : '';
    const payload = {
      employee_id: employee._id,
      company_id: candidate.company_id,
      company_name: pickFirstValue(employee.company_name, meta?.company_name, company?.name, company?.company_name, company?.short_name, job?.company_name),
      job_id: pickFirstValue(employee.job_id, meta?.job_id, job?._id),
      job_name: pickFirstValue(employee.job_name, job?.position, job?.job_name, job?.name),
      hourly_rate: roundMoney(Number(pickFirstValue(
        employee.hourly_rate,
        meta?.latest_hourly_rate,
        job?.hourly_rate,
        0
      ))),
      salary_type: pickFirstValue(
        employee.salary_type,
        job?.salary_type,
        (employee.settlement_mode || '') === 'monthly' ? 'monthly' : 'daily'
      ),
      settlement_mode: pickFirstValue(
        employee.settlement_mode,
        job?.salary_type === 'monthly' ? 'monthly' : '',
        'daily'
      ),
      join_date: toDateStr(pickFirstValue(employee.join_date, meta?.earliest_work_date, employee.created_at, new Date())),
      status: employee.status === 'resigned' || leaveDate ? 'resigned' : 'active',
      created_by: 'employees.repair-employee-companies',
      ...buildReferralSnapshot(employee)
    };

    const ratePlanId = pickFirstValue(employee.rate_plan_id, job?.rate_plan_id);
    if (ratePlanId) payload.rate_plan_id = ratePlanId;
    if (leaveDate) payload.leave_date = leaveDate;
    repairs.push(payload);
  });

  if (!dry_run) {
    for (const payload of repairs) {
      await db.collection('employee_companies').add({
        data: {
          ...payload,
          created_at: db.serverDate(),
          updated_at: db.serverDate()
        }
      });
    }
  }

  return success({
    dry_run,
    employee_total: employeeTotal,
    job_total: jobTotal,
    company_total: companyTotal,
    relation_total: relationTotal,
    worktime_total: worktimeTotal,
    candidate_pair_total: candidatePairs.size,
    repair_total: repairs.length,
    skipped_total: skipped.length,
    repair_sample: repairs.slice(0, sample_limit),
    skipped_sample: skipped.slice(0, sample_limit)
  }, dry_run ? 'employee_companies 关系扫描完成' : `employee_companies 关系修复完成，新增 ${repairs.length} 条`);
}

async function updateProfile(data) {
  const { id, phone, bank_name, bank_account, emergency_contact, emergency_phone } = data;

  const updateData = { updated_at: db.serverDate() };

  // 敏感信息加密存储
  if (phone !== undefined) {
    updateData.phone = phone; // 应在云函数内加密
  }
  if (bank_account !== undefined) {
    updateData.bank_account = bank_account; // 应加密
    updateData.bank_card_last4 = bank_account.slice(-4);
  }
  if (bank_name !== undefined) updateData.bank_name = bank_name;
  if (emergency_contact !== undefined) updateData.emergency_contact = emergency_contact;
  if (emergency_phone !== undefined) updateData.emergency_phone = emergency_phone;

  await db.collection('employees').doc(id).update({ data: updateData });

  return success(null, '档案更新成功');
}

async function resignEmployee(data) {
  const { id, departure_date, departure_reason } = data;
  const leaveDate = toDateStr(departure_date);
  const today = getTodayStr();
  const employeeStatus = leaveDate && leaveDate < today ? 'resigned' : undefined;
  const companyStatus = deriveRelationStatusFromLeaveDate(leaveDate, today);

  await db.collection('employees').doc(id).update({
    data: {
      ...(employeeStatus ? { status: 'resigned' } : {}),
      departure_date: leaveDate,
      leave_date: leaveDate,
      departure_reason,
      updated_at: db.serverDate()
    }
  });

  const ecRes = await db.collection('employee_companies')
    .where({ employee_id: id })
    .get();

  if (ecRes.data?.length) {
    for (const item of ecRes.data) {
      await db.collection('employee_companies').doc(item._id).update({
        data: {
          status: companyStatus,
          leave_date: leaveDate,
          updated_at: db.serverDate()
        }
      });
    }
  }

  return success(null, '离职办理成功');
}

async function syncResignedStatus() {
  const today = getTodayStr();
  let employeeUpdated = 0;
  let companyUpdated = 0;
  let companyChecked = 0;

  const employeesRes = await db.collection('employees')
    .where({ leave_date: db.command.lt(today) })
    .get();

  for (const item of employeesRes.data || []) {
    if (item.status !== 'resigned') {
      await db.collection('employees').doc(item._id).update({
        data: {
          status: 'resigned',
          updated_at: db.serverDate()
        }
      });
      employeeUpdated += 1;
    }
  }

  await scanCollection('employee_companies', async (items) => {
    for (const item of items || []) {
      const nextStatus = deriveRelationStatusFromLeaveDate(item.leave_date, today);
      const currentStatus = normalizeText(item.status).toLowerCase();
      companyChecked += 1;
      if (currentStatus !== nextStatus) {
        await db.collection('employee_companies').doc(item._id).update({
          data: {
            status: nextStatus,
            updated_at: db.serverDate()
          }
        });
        companyUpdated += 1;
      }
    }
  }, 100);

  return success({ employeeUpdated, companyUpdated, companyChecked, today }, '离职状态结转完成');
}
