/**
 * 二维码管理模块
 * 支持岗位二维码、分销推广二维码、内部扫码入职二维码
 */
const cloud = require('wx-server-sdk');
const { success, error } = require('./common/response');
const { verifyToken: verifyAuthToken } = require('./common/auth');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

const db = cloud.database();

function normalizeText(value) {
  return String(value || '').trim();
}

function normalizeName(value) {
  return normalizeText(value).replace(/\s+/g, '');
}

function pickFirstValue(...values) {
  for (const value of values) {
    if (value !== undefined && value !== null && value !== '') {
      return value;
    }
  }
  return '';
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

function buildExistingRelationResult(activeRelation) {
  return {
    status: 'existing',
    relation: {
      ...activeRelation,
      _id: getRecordId(activeRelation)
    }
  };
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

function normalizePhone(value) {
  return normalizeText(value).replace(/\D+/g, '');
}

function normalizeIdCard(value) {
  return normalizeText(value).toUpperCase();
}

function hasOwn(obj, key) {
  return Object.prototype.hasOwnProperty.call(obj || {}, key);
}

function isPlaceholderName(value) {
  return /^候选人\d+$/.test(normalizeText(value));
}

function isValidRealName(value) {
  const name = normalizeText(value);
  return Boolean(name) && !/\d/.test(name) && !isPlaceholderName(name);
}

function getDocData(res) {
  return res?.data?.[0] || res?.data || null;
}

function getRecordId(item) {
  return String(item?._id || item?.id || '');
}

function getAddResultId(result) {
  return String(result?._id || result?.id || result?.ids?.[0] || '');
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

function getChinaDateStr(offsetDays = 0) {
  const date = new Date(Date.now() + 8 * 60 * 60 * 1000 + offsetDays * 24 * 60 * 60 * 1000);
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, '0');
  const day = String(date.getUTCDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function formatChinaDateTime(value = new Date()) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const chinaDate = new Date(date.getTime() + 8 * 60 * 60 * 1000);
  const year = chinaDate.getUTCFullYear();
  const month = String(chinaDate.getUTCMonth() + 1).padStart(2, '0');
  const day = String(chinaDate.getUTCDate()).padStart(2, '0');
  const hours = String(chinaDate.getUTCHours()).padStart(2, '0');
  const minutes = String(chinaDate.getUTCMinutes()).padStart(2, '0');
  return `${year}-${month}-${day} ${hours}:${minutes}`;
}

function normalizeChinaDateTime(value = '') {
  if (!value) return '';
  if (value instanceof Date) return formatChinaDateTime(value);
  if (typeof value === 'object') {
    if (value.$date) return normalizeChinaDateTime(value.$date);
    if (value.seconds) return normalizeChinaDateTime(new Date(Number(value.seconds) * 1000));
    return '';
  }

  const text = String(value || '').trim();
  if (!text) return '';
  const localDateTime = text.replace('T', ' ').match(/^(\d{4}-\d{2}-\d{2})[ ](\d{2}:\d{2})(?::\d{2})?$/);
  if (localDateTime) return `${localDateTime[1]} ${localDateTime[2]}`;
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return `${text} 00:00`;

  const parsed = new Date(text);
  if (!Number.isNaN(parsed.getTime())) return formatChinaDateTime(parsed);
  return text;
}

function getNextDateStr() {
  return getChinaDateStr(1);
}

function addDaysToDateStr(value, offsetDays = 0) {
  const normalized = toDateStr(value);
  if (!normalized) return '';

  const match = normalized.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return '';

  const date = new Date(Date.UTC(
    Number(match[1]),
    Number(match[2]) - 1,
    Number(match[3]) + offsetDays
  ));
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, '0');
  const day = String(date.getUTCDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function resolveAutoInsuranceStartDate(joinDate) {
  const joinNextDate = addDaysToDateStr(joinDate, 1);
  const today = getChinaDateStr(0);
  const tomorrow = getNextDateStr();

  if (!joinNextDate) return tomorrow;
  return joinNextDate < today ? tomorrow : joinNextDate;
}

function toDateStr(val) {
  if (!val) return '';
  if (typeof val === 'string') {
    const match = val.match(/^(\d{4}-\d{2}-\d{2})/);
    if (match) return match[1];
  }
  const d = new Date(val);
  if (Number.isNaN(d.getTime())) return '';
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function isValidDateStr(value) {
  return /^\d{4}-\d{2}-\d{2}$/.test(normalizeText(value));
}

function normalizeSettlementMode(value) {
  return normalizeText(value) === 'daily' ? 'daily' : 'monthly';
}

function resolveSupportsDaily(company = {}, job = {}) {
  const companyDailyFields = [
    'supports_daily',
    'enable_daily_settlement',
    'daily_settlement_enabled',
    'is_daily_supported'
  ];

  for (const field of companyDailyFields) {
    if (hasOwn(company, field)) {
      return !!company[field];
    }
  }

  return !!job.supports_daily;
}

function parseIdCard(idCard) {
  const normalized = normalizeIdCard(idCard);
  if (!/^[1-9]\d{5}(19|20)\d{2}(0[1-9]|1[0-2])(0[1-9]|[12]\d|3[01])\d{3}[\dX]$/.test(normalized)) {
    return { valid: false };
  }

  const birthDate = `${normalized.slice(6, 10)}-${normalized.slice(10, 12)}-${normalized.slice(12, 14)}`;
  const genderCode = Number(normalized.slice(16, 17));
  return {
    valid: true,
    birth_date: birthDate,
    gender: genderCode % 2 === 1 ? 1 : 0
  };
}

function generateEmployeeNo() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  const random = Math.floor(Math.random() * 10000);
  return `EP${year}${month}${day}${String(random).padStart(4, '0')}`;
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

function isEmployeeCompanyRelationActive(relation, today = toDateStr(new Date())) {
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

async function findReusableEmployee({ userId = '', idCard = '', phone = '', name = '' } = {}) {
  const normalizedIdCard = normalizeIdCard(idCard);
  const normalizedName = normalizeName(name);
  if (normalizedIdCard && normalizedName) {
    const idCardRes = await db.collection('employees').where({ id_card: normalizedIdCard }).get();
    const matches = (idCardRes.data || []).filter((item) => !normalizeText(item.merged_into_employee_id));
    const nameMatches = matches.filter((item) => normalizeName(item.name) === normalizedName);
    if (nameMatches.length === 1) return { employee: nameMatches[0], rule: 'id_card_name', ambiguous: false };
    if (nameMatches.length > 1) return { employee: null, rule: 'id_card_name', ambiguous: true };
    if (matches.length > 0) return { employee: null, rule: 'id_card_name_conflict', ambiguous: true };
  }

  if (userId) {
    const boundEmployee = await getExistingBoundEmployee(userId);
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

async function ensureEmployeeCompanyRelation(
  employeeId,
  companyId,
  {
    hourly_rate = 0,
    rate_plan_id = '',
    salary_type = 'monthly',
    settlement_mode = 'monthly',
    join_date = '',
    created_by = 'system',
    job_id = '',
    job_name = '',
    company_name = '',
    referrer_id = '',
    referrer_name = '',
    source_referrer_id = '',
    source_referrer_name = '',
    recommender_id = '',
    recommender_name = ''
  } = {},
  options = {}
) {
  const { allowExisting = false } = options;
  if (!employeeId || !companyId) throw new Error('缺少员工或企业信息');
  const snapshotPayload = await resolveEmployeeCompanySnapshot(companyId, {
    hourly_rate,
    rate_plan_id,
    salary_type,
    settlement_mode,
    join_date,
    created_by,
    job_id,
    job_name,
    company_name,
    referrer_id,
    referrer_name,
    source_referrer_id,
    source_referrer_name,
    recommender_id,
    recommender_name
  });

  const relationRes = await db.collection('employee_companies')
    .where({ employee_id: employeeId, company_id: companyId })
    .get();

  const relations = relationRes.data || [];
  const relationPayload = {
    employee_id: employeeId,
    company_id: companyId,
    company_name: snapshotPayload.company_name || '',
    hourly_rate: snapshotPayload.hourly_rate,
    rate_plan_id: snapshotPayload.rate_plan_id,
    salary_type: snapshotPayload.salary_type,
    settlement_mode: snapshotPayload.settlement_mode,
    join_date: snapshotPayload.join_date,
    status: 'active',
    created_by: snapshotPayload.created_by,
    job_id: snapshotPayload.job_id || '',
    job_name: snapshotPayload.job_name || '',
    ...buildReferralSnapshot({
      referrer_id: snapshotPayload.referrer_id,
      referrer_name: snapshotPayload.referrer_name,
      source_referrer_id: snapshotPayload.source_referrer_id,
      source_referrer_name: snapshotPayload.source_referrer_name,
      recommender_id: snapshotPayload.recommender_id,
      recommender_name: snapshotPayload.recommender_name
    }),
    created_at: db.serverDate(),
    updated_at: db.serverDate()
  };

  const activeRelation = relations.find((item) => isEmployeeCompanyRelationActive(item));
  if (activeRelation) {
    if (allowExisting) {
      // 存量在职关系只能由 Web 在职管理修改；扫码入职只复用关系，不回写工价/结算等核心字段。
      return buildExistingRelationResult(activeRelation);
    }
    throw new Error('该员工已在当前企业存在有效入职关系');
  }

  const addRes = await db.collection('employee_companies').add({ data: relationPayload });
  const relationId = getAddResultId(addRes);
  return { status: 'created', relation: { _id: relationId, ...relationPayload } };
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
    jobId && ratePlanId ? { company_id: companyId, job_id: jobId, rate_plan_id: ratePlanId, mapping_status: 'active' } : null,
    ratePlanId ? { company_id: companyId, rate_plan_id: ratePlanId, mapping_status: 'active' } : null,
    jobId ? { company_id: companyId, job_id: jobId, mapping_status: 'active' } : null
  ].filter(Boolean);

  for (const where of candidates) {
    const res = await callInsurance('listJobMappings', { page: 1, pageSize: 1, where });
    if (res?.list?.length) return res.list[0];
  }
  return null;
}

function buildInsuranceContextFromRelation(employee, relation) {
  const relationDoc = relation || {};
  return {
    employee_id: relationDoc.employee_id || '',
    relation_id: relationDoc._id || '',
    name: employee?.name || '',
    id_card: employee?.id_card || '',
    company_id: relationDoc.company_id || '',
    company_name: relationDoc.company_name || '',
    job_id: relationDoc.job_id || '',
    job_name: relationDoc.job_name || '',
    rate_plan_id: relationDoc.rate_plan_id || '',
    join_date: relationDoc.join_date || ''
  };
}

async function recordAutoAddInsuranceException(context, message, mapping) {
  try {
    await callInsurance('recordException', {
      source: 'auto_add_internal_qrcode',
      status: 'mismatch',
      exception_key: [
        'auto_add_internal_qrcode',
        normalizeText(context.relation_id || context.employee_id || context.name),
        normalizeText(mapping?.policy_id || 'no_policy')
      ].join(':'),
      employee_id: context.employee_id || '',
      employee_company_id: context.relation_id || '',
      name: context.name || '',
      idcard: context.id_card || '',
      company_id: context.company_id || '',
      company_name: context.company_name || '',
      job_id: context.job_id || '',
      rate_plan_id: context.rate_plan_id || '',
      policy_id: mapping?.policy_id || '',
      work_company: mapping?.work_company_name || '',
      occupation_id: mapping?.occupation_id || '',
      occupation_name: mapping?.occupation_name || '',
      message
    });
  } catch (err) {
    console.warn('[qrcode] 记录扫码入职自动加保异常失败:', err && err.message);
  }
}

async function tryAutoAddInsuranceAfterInternalOnboard(employee, relation) {
  let mapping = null;
  const context = buildInsuranceContextFromRelation(employee, relation);
  try {
    if (!context.relation_id || !context.employee_id) {
      await recordAutoAddInsuranceException(context, '扫码入职自动加保跳过：员工企业关系未建立');
      return;
    }
    mapping = await findActiveInsuranceJobMapping(context);
    if (!mapping) {
      await recordAutoAddInsuranceException(context, '扫码入职自动加保跳过：员工企业关系没有对应的有效保险映射');
      return;
    }
    await callInsurance('addInsurance', {
      policy_id: mapping.policy_id,
      start_date: resolveAutoInsuranceStartDate(context.join_date),
      persons: [{
        name: context.name,
        idcard: context.id_card,
        work_company: mapping.work_company_name,
        occupation_id: mapping.occupation_id,
        employee_id: context.employee_id,
        employee_company_id: context.relation_id
      }]
    });
  } catch (err) {
    console.warn('[qrcode] 扫码入职自动加保失败，不阻断入职:', err && err.message);
    await recordAutoAddInsuranceException(context, `扫码入职自动加保失败：${(err && err.message) || err}`, mapping);
  }
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

async function getUserFromToken(token) {
  const auth = await verifyAuthToken(token, false);
  if (!auth.valid) {
    return null;
  }

  return auth.userInfo || null;
}

async function requireUserFromToken(token, message = '请先登录') {
  const user = await getUserFromToken(token);
  if (!user?._id) {
    throw new Error(message);
  }
  return user;
}

async function getQrByCode(code) {
  const qrDoc = await db.collection('qr_codes')
    .where({ code, status: 'active' })
    .get();

  if (!qrDoc.data || qrDoc.data.length === 0) {
    throw new Error('二维码无效');
  }

  return qrDoc.data[0];
}


async function generateMiniProgramCode(code, page = 'pages/internal-onboard/index', envVersion = 'release') {
  try {
    console.log('generateMiniProgramCode: code=', code, 'page=', page, 'envVersion=', envVersion);
    
    let wxacodeRes;
    try {
      wxacodeRes = await cloud.openapi.wxacode.getUnlimited({
        scene: code,
        page: page,
        check_path: false,
        env_version: envVersion
      });

      const cloudPath = `qrcodes/${code}.png`;
      const uploadRes = await cloud.uploadFile({
        cloudPath,
        fileContent: wxacodeRes.buffer
      });

      const tempRes = await cloud.getTempFileURL({
        fileList: [uploadRes.fileID]
      });

      const tempFileURL = tempRes.fileList && tempRes.fileList.length
        ? tempRes.fileList[0].tempFileURL
        : '';

      return {
        qrUrl: tempFileURL || '',
        fileID: uploadRes.fileID || ''
      };
    } catch (apiErr) {
      console.warn('小程序码API失败，使用URL替代方案:', apiErr.message);
      const envId = process.env.TENCENTCLOUD_RUN_ENV || process.env.SCB_NAMESPACE || 'cloud1-5glojms9a83c3457';
      return {
        qrUrl: '',
        fileID: '',
        code: code,
        errorMessage: apiErr.message || '小程序码生成失败',
        fallbackUrl: `https://${envId}.service.tcloudbase.com/${page}?code=${code}`
      };
    }
  } catch (err) {
    console.error('generateMiniProgramCode 失败:', err && err.message);
    throw err;
  }
}

exports.main = async (event, context) => {
  const { action, token } = event;

  try {
    switch (action) {
      case 'generate':
        return await generateQR(event);
      case 'list':
        return await listQRs(event);
      case 'pause':
        return await pauseQR(event);
      case 'resume':
        return await resumeQR(event);
      case 'delete':
        return await deleteQR(event);
      case 'scan':
        return await scanQR(event);
      case 'checkin-preview':
        return await previewInterviewCheckin(event);
      case 'interview-checkin':
        return await submitInterviewCheckin(event);
      case 'internal-onboard':
        return await submitInternalOnboard(event, context);
      case 'job-apply':
        return await submitJobApply(event, context);
      default:
        return error(400, '不支持的操作');
    }
  } catch (err) {
    console.error('二维码模块错误:', err);
    return error(500, err.message);
  }
};

/**
 * 生成二维码
 * data: { type, job_id, recommender_id, creator_id }
 */
async function generateQR(data) {
  const {
    type = 'job_referral',
    company_id = '',
    job_id = '',
    recommender_id = '',
    creator_id = ''
  } = data;

  const isAgentReferral = type === 'agent_referral';
  const isInternalOnboard = type === 'internal_onboard';
  const isJobApply = type === 'job_apply';
  const isInterviewCheckin = type === 'interview_checkin';
  const ownerId = creator_id || recommender_id;

  if (!ownerId) {
    return error(400, '缺少创建人');
  }

  const creatorDoc = await db.collection('users').doc(ownerId).get();
  if (!creatorDoc.data) {
    return error(404, '创建人不存在');
  }

  let jobDoc = { data: null };
  if (!isAgentReferral && !isJobApply) {
    if (!job_id) {
      return error(400, '缺少岗位ID');
    }
    jobDoc = await db.collection('jobs').doc(job_id).get();
    if (!jobDoc.data) {
      return error(404, '岗位不存在');
    }
  }
  
  // job_apply 也需要岗位信息
  if (isJobApply || isInterviewCheckin) {
    if (!job_id) {
      return error(400, '缺少岗位ID');
    }
    jobDoc = await db.collection('jobs').doc(job_id).get();
    if (!jobDoc.data) {
      return error(404, '岗位不存在');
    }
  }

  const jobCompanyId = jobDoc.data?.company_id || '';
  if (company_id && jobCompanyId && company_id !== jobCompanyId) {
    return error(400, '所选岗位不属于当前企业');
  }

  const interviewDate = isInterviewCheckin ? toDateStr(data.interview_date) : '';
  if (isInterviewCheckin && !isValidDateStr(interviewDate)) {
    return error(400, '请选择有效的面试日期');
  }

  const resolvedCompanyId = company_id || jobCompanyId;
  let companyDoc = { data: null };
  if (resolvedCompanyId) {
    companyDoc = await db.collection('companies').doc(resolvedCompanyId).get();
  }
  const resolvedCompanyName = companyDoc.data?.name || jobDoc.data?.company_name || '';
  const supportsDaily = resolveSupportsDaily(companyDoc.data || {}, jobDoc.data || {});
  const jobApplyInterviewTime = isJobApply ? normalizeChinaDateTime(data.interview_time || '') : '';

  // 生成唯一编码
  const codePrefix = isAgentReferral ? 'AG' : (isInternalOnboard ? 'ONB' : (isJobApply ? 'APL' : (isInterviewCheckin ? 'CHK' : 'QR')));
  const code = `${codePrefix}${Date.now()}${Math.floor(Math.random() * 1000)}`;
  const qrContent = code;
  const landing_page = isAgentReferral
    ? `/pages/my/my?ref_code=${code}`
    : (isInternalOnboard
      ? `/pages/internal-onboard/index?code=${code}`
      : (isJobApply
        ? `/pages/job-apply/index?code=${code}`
        : (isInterviewCheckin
          ? `/pages/interview-checkin/index?code=${code}`
          : `/pages/apply/apply?jobId=${job_id}&code=${code}`)));
  let qrUrl = '';
  let qrFileID = '';
  let qrMode = 'mini_program';

  // 必须生成小程序码
  const miniPage = isAgentReferral
    ? 'pages/my/my'
    : (isJobApply
      ? 'pages/job-apply/index'
      : (isInterviewCheckin ? 'pages/interview-checkin/index' : 'pages/internal-onboard/index'));
  const envVersion = data.env_version || 'release';
  
  console.log('开始生成小程序码, code:', code, 'page:', miniPage, 'env:', envVersion);
  
  const miniProgramCode = await generateMiniProgramCode(code, miniPage, envVersion);
  
  if (!miniProgramCode || (!miniProgramCode.qrUrl && !miniProgramCode.fileID)) {
    console.error('小程序码生成失败');
    return error(500, '小程序码生成失败，请稍后重试');
  }
  
  qrUrl = miniProgramCode.qrUrl;
  qrFileID = miniProgramCode.fileID || '';
  console.log('小程序码生成成功');

  const qrData = {
    data: {
      code,
      type,
      job_id: job_id || '',
      job_name: jobDoc.data?.position || '',
      recommender_id: recommender_id || '',
      recommender_name: recommender_id ? (creatorDoc.data?.real_name || creatorDoc.data?.name || '') : '',
      company_id: resolvedCompanyId,
      company_name: resolvedCompanyName,
      creator_id: ownerId,
      creator_name: creatorDoc.data?.real_name || creatorDoc.data?.name || '',
      internal_only: isInternalOnboard,
      supports_daily: supportsDaily,
      interview_time: jobApplyInterviewTime,
      interview_date: isInterviewCheckin ? interviewDate : '',
      location: isInterviewCheckin ? (data.location || '') : '',
      qr_url: qrUrl,
      qr_file_id: qrFileID,
      qr_mode: qrMode,
      landing_page,
      status: 'active',
      created_by: ownerId,
      created_at: db.serverDate(),
      updated_at: db.serverDate()
    }
  };

  const result = await db.collection('qr_codes').add(qrData);

  return success({
    id: getAddResultId(result),
    code,
    type,
    qrUrl,
    qrFileID,
    qr_file_id: qrFileID,
    fileID: qrFileID,
    landing_page,
    qr_mode: qrMode,
    recommender_name: recommender_id ? (creatorDoc.data?.real_name || creatorDoc.data?.name || '') : '',
    creator_name: creatorDoc.data?.real_name || creatorDoc.data?.name || '',
    company_name: resolvedCompanyName,
    job_name: jobDoc.data?.position || '',
    supports_daily: supportsDaily,
    interview_time: jobApplyInterviewTime,
    interview_date: isInterviewCheckin ? interviewDate : '',
    location: isInterviewCheckin ? (data.location || '') : ''
  }, '二维码生成成功');
}

/**
 * 二维码列表
 */
async function listQRs(data) {
  const { job_id, recommender_id, status, type } = data;
  const query = db.collection('qr_codes').where({});

  if (job_id) query.where({ job_id });
  if (recommender_id) query.where({ recommender_id });
  if (status) query.where({ status });
  if (type) query.where({ type });

  const res = await query.orderBy('created_at', 'desc').limit(50).get();
  return success(res.data);
}

/**
 * 暂停二维码
 */
async function pauseQR(data) {
  const { id } = data;
  await db.collection('qr_codes').doc(id).update({
    data: { status: 'paused', updated_at: db.serverDate() }
  });
  return success(null, '二维码已暂停');
}

/**
 * 恢复二维码
 */
async function resumeQR(data) {
  const { id } = data;
  await db.collection('qr_codes').doc(id).update({
    data: { status: 'active', updated_at: db.serverDate() }
  });
  return success(null, '二维码已恢复');
}

/**
 * 删除二维码
 */
async function deleteQR(data) {
  const { id } = data;
  await db.collection('qr_codes').doc(id).remove();
  return success(null, '二维码已删除');
}

/**
 * 扫码回调（小程序端调用）
 */
async function scanQR(data) {
  const { code } = data;
  
  console.log('scanQR called with code:', code);

  const qr = await getQrByCode(code);
  console.log('qr found:', qr ? qr.code : 'null');

  let scanJob = null;
  let scanCompany = null;
  if (qr.type === 'internal_onboard') {
    if (qr.job_id) {
      try {
        const jobDoc = await db.collection('jobs').doc(qr.job_id).get();
        scanJob = jobDoc.data || null;
      } catch (err) {
        console.warn('扫码入职获取岗位日结配置失败:', err && err.message);
      }
    }

    const companyId = qr.company_id || scanJob?.company_id || '';
    if (companyId) {
      try {
        const companyDoc = await db.collection('companies').doc(companyId).get();
        scanCompany = companyDoc.data || null;
      } catch (err) {
        console.warn('扫码入职获取企业日结配置失败:', err && err.message);
      }
    }
  }

  const supportsDaily = qr.type === 'internal_onboard'
    ? resolveSupportsDaily(scanCompany || {}, scanJob || { supports_daily: qr.supports_daily })
    : !!qr.supports_daily;

  const scanResult = {
    code: qr.code,
    type: qr.type || 'job_referral',
    job_id: qr.job_id,
    job_name: qr.job_name,
    company_id: qr.company_id || '',
    company_name: qr.company_name || '',
    interview_time: qr.interview_time || '',
    interview_date: qr.interview_date || '',
    location: qr.location || '',
    recommender_id: qr.recommender_id,
    recommender_name: qr.recommender_name,
    creator_id: qr.creator_id || '',
    creator_name: qr.creator_name || '',
    internal_only: !!qr.internal_only,
    supports_daily: supportsDaily,
    landing_page: qr.landing_page || ''
  };
  
  console.log('scanQR returning:', JSON.stringify(scanResult));
  
  return success(scanResult, qr.type === 'agent_referral'
    ? '扫码成功，已绑定分销人'
    : (qr.type === 'internal_onboard' ? '扫码成功，可进行内部入职登记' : '扫码成功，可进行报名'));
}

async function previewInterviewCheckin(data) {
  const { code = '' } = data;
  const qr = await getQrByCode(code);
  if (qr.type !== 'interview_checkin') {
    return error(400, '当前二维码不是面试签到码');
  }

  const interviewDate = toDateStr(qr.interview_date);
  let user = null;
  if (data.token) {
    user = await getUserFromToken(data.token);
  }

  return success({
    type: qr.type,
    code: qr.code,
    company_id: qr.company_id || '',
    company_name: qr.company_name || '',
    job_id: qr.job_id || '',
    job_name: qr.job_name || '',
    interview_date: interviewDate,
    location: qr.location || '',
    default_name: user?.real_name || user?.name || '',
    default_phone: user?.phone || user?.account_phone || user?.employee_phone || ''
  });
}

async function recordRecruitmentAction({
  candidate_id = '',
  action_type = '',
  operator_id = '',
  operator_name = '',
  operator_role = 'system',
  related_job_id = '',
  related_company_id = '',
  related_application_id = '',
  related_interview_id = '',
  related_employee_id = '',
  related_employee_company_id = '',
  remark = ''
} = {}) {
  if (!candidate_id || !action_type) return;
  const nowTs = Date.now();
  try {
    await db.collection('candidate_action_logs').add({
      data: {
        candidate_id,
        action_type,
        operator_id,
        operator_name,
        operator_role,
        related_job_id,
        related_company_id,
        related_application_id,
        related_interview_id,
        related_employee_id,
        related_employee_company_id,
        remark,
        created_at: db.serverDate(),
        created_at_ts: nowTs
      }
    });
  } catch (err) {
    console.warn('[qrcode] 记录候选人动作失败:', err && err.message);
  }
}

async function submitInterviewCheckin(data) {
  const {
    code = '',
    token = '',
    real_name = '',
    phone = ''
  } = data;

  const loginUser = await requireUserFromToken(token, '请先登录后签到');

  const qr = await getQrByCode(code);
  if (qr.type !== 'interview_checkin') {
    return error(400, '当前二维码不是面试签到码');
  }

  const normalizedName = normalizeText(real_name || loginUser.real_name || loginUser.name || '');
  const normalizedPhone = normalizePhone(phone || loginUser.phone || loginUser.account_phone || loginUser.employee_phone || '');
  if (!normalizedName) return error(400, '请输入姓名');
  if (!isValidRealName(normalizedName)) return error(400, '姓名不能包含数字或候选人占位名');
  if (!/^1[3-9]\d{9}$/.test(normalizedPhone)) return error(400, '手机号格式不正确');

  const jobDoc = await db.collection('jobs').doc(qr.job_id).get();
  const job = jobDoc.data || {};
  if (!job._id) return error(404, '签到码对应岗位不存在');

  const companyId = qr.company_id || job.company_id || '';
  const companyName = qr.company_name || job.company_name || '';
  const jobName = qr.job_name || job.position || job.job_name || '';
  const interviewDate = toDateStr(qr.interview_date);
  const loginUserName = loginUser.real_name || loginUser.name || normalizedName;
  const loginUserPhone = loginUser.phone || loginUser.account_phone || loginUser.employee_phone || normalizedPhone;

  await db.collection('users').doc(loginUser._id).update({
    data: {
      real_name: normalizedName,
      name: normalizedName,
      phone: normalizedPhone,
      account_phone: loginUser.account_phone || normalizedPhone,
      last_checkin_at: db.serverDate(),
      updated_at: db.serverDate(),
      update_time: db.serverDate()
    }
  });

  const existingApp = await db.collection('applications')
    .where({ applicant_phone: normalizedPhone, job_id: qr.job_id })
    .orderBy('created_at', 'desc')
    .limit(1)
    .get();

  let applicationId = '';
  const matchedExisting = existingApp.data && existingApp.data.length > 0;
  const checkinPatch = {
    user_id: loginUser._id,
    applicant_name: normalizedName,
    applicant_phone: normalizedPhone,
    status: 'arrived',
    checkin_time: db.serverDate(),
    checkin_qr_code: code,
    checkin_status: 'checked_in',
    checkin_user_id: loginUser._id,
    checkin_user_name: loginUserName,
    checkin_user_phone: loginUserPhone,
    updated_at: db.serverDate()
  };

  if (matchedExisting) {
    applicationId = existingApp.data[0]._id;
    await db.collection('applications').doc(applicationId).update({ data: checkinPatch });
  } else {
    const addRes = await db.collection('applications').add({
      data: {
        job_id: qr.job_id,
        company_id: companyId,
        job_name: jobName,
        company_name: companyName,
        source: 'checkin_qr',
        recommender_id: '',
        recommender_name: '',
        qr_code: code,
        apply_time: db.serverDate(),
        interview_time: interviewDate ? `${interviewDate} 00:00:00` : '',
        created_at: db.serverDate(),
        ...checkinPatch
      }
    });
    applicationId = getAddResultId(addRes);
  }

  await recordRecruitmentAction({
    candidate_id: loginUser._id,
    action_type: 'interview_checkin',
    operator_id: loginUser._id,
    operator_name: loginUserName,
    operator_role: loginUser.role || 'candidate',
    related_job_id: qr.job_id,
    related_company_id: companyId,
    related_application_id: applicationId,
    remark: interviewDate ? `面试日期 ${interviewDate}` : '扫码签到'
  });

  return success({
    application_id: applicationId,
    company_name: companyName,
    job_name: jobName,
    interview_date: interviewDate,
    matched_existing_application: matchedExisting,
    checkin_status: 'checked_in'
  }, matchedExisting ? '签到成功，已更新报名签到状态' : '签到成功，已自动创建报名记录');
}

async function findApplicationForInternalOnboard({
  id_card = '',
  company_id = '',
  job_id = ''
} = {}) {
  const normalizedIdCard = normalizeIdCard(id_card);
  if (!normalizedIdCard || !company_id || !job_id) return null;

  const baseQuery = { company_id, job_id };
  const idCardFields = ['applicant_id_card', 'id_card'];

  for (const field of idCardFields) {
    const appRes = await db.collection('applications')
      .where({ ...baseQuery, [field]: normalizedIdCard })
      .orderBy('created_at', 'desc')
      .limit(1)
      .get();
    if (appRes.data && appRes.data.length) {
      return appRes.data[0];
    }
  }

  return null;
}

async function syncRecruitmentFlowAfterOnboard({
  application = null,
  id_card = '',
  company_id = '',
  job_id = '',
  employee_id = '',
  employee_company_id = '',
  onboard_user_id = '',
  onboard_user_name = '',
  onboard_user_phone = ''
} = {}) {
  if (!employee_id || !employee_company_id) return { application_id: '' };

  const matchedApplication = application || await findApplicationForInternalOnboard({
    id_card,
    company_id,
    job_id
  });
  const applicationId = matchedApplication?._id || '';

  if (applicationId) {
    await db.collection('applications').doc(applicationId).update({
      data: {
        status: 'onboarded',
        checkin_status: 'onboarded',
        employee_id,
        employee_company_id,
        onboarded_at: db.serverDate(),
        onboard_user_id,
        onboard_user_name,
        onboard_user_phone,
        updated_at: db.serverDate()
      }
    });
  }

  return { application_id: applicationId };
}


async function submitInternalOnboard(data, context) {
  const {
    code = '',
    real_name = '',
    phone = '',
    id_card = '',
    join_date = '',
    settlement_mode = '',
    token = ''
  } = data;

  const loginUser = await requireUserFromToken(token, '请先登录后入职登记');
  const qr = await getQrByCode(code);
  if (qr.type !== 'internal_onboard') {
    return error(400, '当前二维码不是内部入职码');
  }

  const normalizedName = normalizeText(real_name);
  const normalizedPhone = normalizePhone(phone);
  const normalizedIdCard = normalizeIdCard(id_card);
  const onboardDate = toDateStr(join_date);

  if (!normalizedName) return error(400, '请输入姓名');
  if (!isValidRealName(normalizedName)) return error(400, '姓名不能包含数字或候选人占位名');
  if (!/^1[3-9]\d{9}$/.test(normalizedPhone)) return error(400, '手机号格式不正确');
  if (!normalizedIdCard) return error(400, '请输入身份证号');
  if (!onboardDate) return error(400, '请选择入职日期');

  const idCardInfo = parseIdCard(normalizedIdCard);
  if (!idCardInfo.valid) return error(400, '身份证号格式不正确');

  const jobDoc = await db.collection('jobs').doc(qr.job_id).get();
  if (!jobDoc.data) return error(404, '岗位不存在');
  const job = jobDoc.data;

  const companyId = qr.company_id || job.company_id || '';
  let company = {};
  if (companyId) {
    const companyDoc = await db.collection('companies').doc(companyId).get();
    company = companyDoc.data || {};
  }
  const resolvedCompanyId = company._id || companyId;
  if (!resolvedCompanyId) return error(400, '缺少企业信息');

  const resolvedCompanyName = company.name || company.company_name || job.company_name || qr.company_name || '';
  const resolvedJobId = job._id || qr.job_id || '';
  const resolvedJobName = job.position || job.job_name || qr.job_name || '';
  if (!resolvedCompanyName) return error(400, '缺少企业名称');
  if (!resolvedJobId || !resolvedJobName) return error(400, '缺少岗位信息');
  const supportsDaily = resolveSupportsDaily(company, job);
  const settlementMode = supportsDaily && normalizeSettlementMode(settlement_mode) === 'daily' ? 'daily' : 'monthly';
  const matchedApplication = await findApplicationForInternalOnboard({
    id_card: normalizedIdCard,
    company_id: resolvedCompanyId,
    job_id: resolvedJobId
  });
  const applicationUserId = normalizeText(matchedApplication?.user_id || '');
  const referralSnapshot = buildReferralSnapshot({
    referrer_id: matchedApplication?.referrer_id || '',
    referrer_name: matchedApplication?.referrer_name || '',
    source_referrer_id: matchedApplication?.source_referrer_id || '',
    source_referrer_name: matchedApplication?.source_referrer_name || '',
    recommender_id: matchedApplication?.recommender_id || '',
    recommender_name: matchedApplication?.recommender_name || ''
  });

  const reusable = await findReusableEmployee({
    userId: applicationUserId,
    idCard: normalizedIdCard,
    phone: normalizedPhone,
    name: normalizedName
  });
  if (reusable.ambiguous) {
    return error(400, '员工档案存在冲突，请联系管理员处理后再入职');
  }

  let employeeId = reusable.employee?._id || '';
  let employeeNo = reusable.employee?.employee_no || '';
  let employeeForInsurance = null;

  if (employeeId) {
    employeeForInsurance = await updateEmployeeMasterForOnboard(employeeId, {
      name: normalizedName,
      phone: normalizedPhone,
      id_card: normalizedIdCard,
      gender: idCardInfo.gender,
      birth_date: idCardInfo.birth_date
    }, applicationUserId);

    if (!employeeNo) {
      employeeNo = generateEmployeeNo();
      await db.collection('employees').doc(employeeId).update({
        data: {
          employee_no: employeeNo,
          updated_at: db.serverDate()
        }
      });
      employeeForInsurance.employee_no = employeeNo;
    }
  } else {
    employeeNo = generateEmployeeNo();
    const employeeRes = await db.collection('employees').add({
      data: {
        ...(applicationUserId ? { user_id: applicationUserId } : {}),
        name: normalizedName,
        phone: normalizedPhone,
        id_card: normalizedIdCard,
        gender: idCardInfo.gender,
        birth_date: idCardInfo.birth_date,
        employee_no: employeeNo,
        status: 'probation',
        source: 'internal_qrcode',
        created_at: db.serverDate(),
        updated_at: db.serverDate()
      }
    });
    employeeId = getAddResultId(employeeRes);
    if (!employeeId) {
      throw new Error('创建员工档案失败：未返回员工ID');
    }
    employeeForInsurance = {
      _id: employeeId,
      name: normalizedName,
      phone: normalizedPhone,
      id_card: normalizedIdCard,
      employee_no: employeeNo
    };
  }

  let relationResult = null;
  try {
    relationResult = await ensureEmployeeCompanyRelation(employeeId, resolvedCompanyId, {
      hourly_rate: job.hourly_rate || 0,
      rate_plan_id: job.rate_plan_id || '',
      salary_type: job.salary_type || 'monthly',
      settlement_mode: settlementMode,
      join_date: onboardDate,
      created_by: loginUser._id,
      job_id: resolvedJobId,
      job_name: resolvedJobName,
      company_name: resolvedCompanyName,
      referrer_id: referralSnapshot.referrer_id,
      referrer_name: referralSnapshot.referrer_name,
      source_referrer_id: referralSnapshot.source_referrer_id,
      source_referrer_name: referralSnapshot.source_referrer_name,
      recommender_id: referralSnapshot.recommender_id,
      recommender_name: referralSnapshot.recommender_name
    }, { allowExisting: true });
  } catch (err) {
    console.error('写入 employee_companies 失败', err && err.message);
    throw new Error('创建员工企业关联失败：' + ((err && err.message) || 'unknown error'));
  }

  if (applicationUserId) {
    await db.collection('users').doc(applicationUserId).update({
      data: {
        employee_id: employeeId,
        employee_no: employeeNo,
        updated_at: db.serverDate(),
        update_time: db.serverDate()
      }
    });
  }

  const isExistingRelation = relationResult?.status === 'existing';
  if (isExistingRelation) {
    return success({
      employee_id: employeeId,
      employee_company_id: relationResult?.relation?._id || '',
      employee_no: employeeNo,
      company_id: resolvedCompanyId,
      company_name: resolvedCompanyName,
      job_id: resolvedJobId,
      job_name: resolvedJobName,
      relation_status: relationResult?.status || ''
    }, '已存在有效在职关系，只绑定账号，未重复执行入职/投保动作');
  }

  await tryAutoAddInsuranceAfterInternalOnboard(employeeForInsurance, relationResult?.relation);

  const onboardUserName = loginUser.real_name || loginUser.name || '';
  const onboardUserPhone = normalizePhone(loginUser.account_phone || loginUser.phone || '');
  const recruitmentSync = await syncRecruitmentFlowAfterOnboard({
    application: matchedApplication,
    id_card: normalizedIdCard,
    company_id: resolvedCompanyId,
    job_id: resolvedJobId,
    employee_id: employeeId,
    employee_company_id: relationResult?.relation?._id || '',
    onboard_user_id: loginUser._id,
    onboard_user_name: onboardUserName,
    onboard_user_phone: onboardUserPhone
  });

  return success({
    employee_id: employeeId,
    employee_company_id: relationResult?.relation?._id || '',
    employee_no: employeeNo,
    company_id: resolvedCompanyId,
    company_name: resolvedCompanyName,
    job_id: resolvedJobId,
    job_name: resolvedJobName,
    relation_status: relationResult?.status || '',
    application_id: recruitmentSync.application_id || ''
  }, '扫码入职登记成功');
}


async function submitJobApply(data, context) {
  const {
    code = '',
    real_name = '',
    phone = '',
    id_card = '',
    token = ''
  } = data;

  // 1. 验证二维码
  const qr = await getQrByCode(code);
  if (qr.type !== 'job_apply') {
    return error(400, '当前二维码不是报名码');
  }

  const normalizedName = normalizeText(real_name);
  const normalizedPhone = normalizePhone(phone);
  const normalizedIdCard = normalizeIdCard(id_card);

  if (!normalizedName) return error(400, '请输入姓名');
  if (!/^1[3-9]\d{9}$/.test(normalizedPhone)) return error(400, '手机号格式不正确');
  if (!normalizedIdCard) return error(400, '请输入身份证号');

  const idCardInfo = parseIdCard(normalizedIdCard);
  if (!idCardInfo.valid) return error(400, '身份证号格式不正确');

  // 2. 查岗位信息（仅用于企业微信推送）
  const jobDoc = await db.collection('jobs').doc(qr.job_id).get();
  if (!jobDoc.data) return error(404, '岗位不存在');
  const job = jobDoc.data;
  const referralId = qr.recommender_id || qr.creator_id || '';
  const referralName = qr.recommender_name || qr.creator_name || '';

  const companyId = qr.company_id || job.company_id || '';
  let company = {};
  if (companyId) {
    const companyDoc = await db.collection('companies').doc(companyId).get();
    company = companyDoc.data || {};
  }
  const loginUser = token ? await getUserFromToken(token) : null;
  const loginUserPhone = normalizePhone(loginUser?.account_phone || loginUser?.phone || '');
  const loginUserName = loginUser?.real_name || loginUser?.name || '';

  // 3. 直接创建报名记录（不查不写 users 表）
  const applicationData = {
    user_id: loginUser?._id || '',
    job_id: job._id,
    company_id: companyId,
    job_name: job.position || job.job_name || qr.job_name || '',
    company_name: company.name || company.company_name || job.company_name || qr.company_name || '',
    source: 'qrcode',
    recommender_id: referralId,
    recommender_name: referralName,
    ...(loginUser?._id ? {
      login_user_id: loginUser._id,
      login_user_name: loginUserName,
      login_user_phone: loginUserPhone
    } : {}),
    applicant_name: normalizedName,
    applicant_phone: normalizedPhone,
    applicant_id_card: normalizedIdCard,
    qr_code: code,
    status: 'pending',
    checkin_status: 'not_checked_in',
    interview_time: qr.interview_time || '',
    apply_time: db.serverDate(),
    created_at: db.serverDate(),
    updated_at: db.serverDate()
  };

  const addRes = await db.collection('applications').add({ data: applicationData });
  const applicationId = getAddResultId(addRes);

  if (!applicationId) {
    throw new Error('报名记录创建成功但未返回记录ID');
  }

  // 4. 企业微信推送通知
  try {
    await cloud.callFunction({
      name: 'notification',
      data: {
        action: 'send-wecom-apply',
        applicant_name: normalizedName,
        applicant_phone: normalizedPhone,
        applicant_id_card: normalizedIdCard,
        job_name: job.position || job.job_name || '',
        company_name: company.name || job.company_name || '',
        source: referralId ? '扫码报名' : '小程序申请',
        recommender_name: referralName || '',
        application_id: applicationId,
        interview_time: qr.interview_time || ''
      }
    });
  } catch (notifyErr) {
    console.warn('企业微信通知发送失败（不影响报名）:', notifyErr);
  }

  return success({
    application_id: applicationId,
    job_name: job.position || job.job_name || '',
    company_name: company.name || job.company_name || '',
    interview_time: qr.interview_time || ''
  }, '报名成功');
}
