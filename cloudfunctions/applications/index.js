/**
 * 报名/投递模块
 * 报名、面试状态、代理身份与入职关联统一收敛到 applications/users。
 */
const cloud = require('wx-server-sdk');
const { success, error } = require('./common/response');
const { verifyToken: verifyAuthToken } = require('./common/auth');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

const db = cloud.database();
const _ = db.command;
const {
  ensureCandidateProfile,
  recordCandidateAction
} = require('./candidateOwnership');

function normalizeText(value) {
  return String(value ?? '').trim();
}

function normalizePhone(value) {
  return normalizeText(value).replace(/\D+/g, '');
}

function normalizeIdCard(value) {
  return normalizeText(value).toUpperCase();
}

function normalizeName(value) {
  return normalizeText(value).replace(/\s+/g, '');
}

function pickFirst(...values) {
  for (const value of values) {
    const text = normalizeText(value);
    if (text) return text;
  }
  return '';
}

function getAddResultId(result) {
  return String(result?.id || result?._id || result?.ids?.[0] || '');
}

function toDateStr(value) {
  if (!value) return '';
  if (typeof value === 'string') {
    const match = value.match(/^(\d{4}-\d{2}-\d{2})/);
    if (match) return match[1];
  }
  if (typeof value === 'object') {
    if (value.$date) return toDateStr(value.$date);
    if (value.seconds) return toDateStr(new Date(Number(value.seconds) * 1000));
    if (value._seconds) return toDateStr(new Date(Number(value._seconds) * 1000));
    if (value.milliseconds) return toDateStr(new Date(Number(value.milliseconds)));
    if (value._milliseconds) return toDateStr(new Date(Number(value._milliseconds)));
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const cn = new Date(date.getTime() + 8 * 60 * 60 * 1000);
  return `${cn.getUTCFullYear()}-${String(cn.getUTCMonth() + 1).padStart(2, '0')}-${String(cn.getUTCDate()).padStart(2, '0')}`;
}

function normalizeDateTime(value = '') {
  const text = normalizeText(value);
  if (!text) return '';
  const local = text.replace('T', ' ').match(/^(\d{4}-\d{2}-\d{2})\s+(\d{2}:\d{2})(?::\d{2})?/);
  if (local) return `${local[1]} ${local[2]}:00`;
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return `${text} 00:00:00`;
  return text;
}

function getTodayDate() {
  return toDateStr(new Date());
}

function generateEmployeeNo() {
  const now = new Date(Date.now() + 8 * 60 * 60 * 1000);
  const year = now.getUTCFullYear();
  const month = String(now.getUTCMonth() + 1).padStart(2, '0');
  const day = String(now.getUTCDate()).padStart(2, '0');
  const random = Math.floor(Math.random() * 10000);
  return `EP${year}${month}${day}${String(random).padStart(4, '0')}`;
}

function parseIdCard(idCard) {
  const normalized = normalizeIdCard(idCard);
  if (!/^[1-9]\d{5}(19|20)\d{2}(0[1-9]|1[0-2])(0[1-9]|[12]\d|3[01])\d{3}[\dX]$/.test(normalized)) {
    return { valid: false };
  }
  return {
    valid: true,
    birth_date: `${normalized.slice(6, 10)}-${normalized.slice(10, 12)}-${normalized.slice(12, 14)}`,
    gender: Number(normalized.slice(16, 17)) % 2 === 1 ? 1 : 0
  };
}

function mapApplicationToInterviewRow(app = {}) {
  const result = app.interview_result || (app.status === 'passed' ? 'passed' : app.status === 'rejected' ? 'rejected' : 'pending');
  const checkinStatus = app.checkin_status || (app.status === 'arrived' ? 'checked_in' : app.status === 'onboarded' ? 'onboarded' : 'not_checked_in');
  return {
    ...app,
    _id: app._id,
    application_id: app._id,
    candidate_name: app.applicant_name || app.candidate_name || '',
    phone: app.applicant_phone || app.phone || '',
    id_card: app.applicant_id_card || app.id_card || '',
    result,
    status: app.status || 'pending',
    application_status: app.status || 'pending',
    checkin_status: checkinStatus,
    checked_in_at: app.checkin_time || app.checked_in_at || '',
    application_checkin_time: app.checkin_time || app.checked_in_at || '',
    interview_time: app.interview_time || app.expected_interview_time || '',
    remark: app.remark || app.interview_evaluation || ''
  };
}

async function getUserFromToken(token) {
  try {
    const auth = await verifyAuthToken(token, false);
    return auth.valid ? auth.userInfo : null;
  } catch (err) {
    console.error('Token 验证失败:', err);
    return null;
  }
}

async function resolveOptionalUser({ token = '', user_id = '' } = {}) {
  if (token) {
    const user = await getUserFromToken(token);
    if (user?._id) return user;
  }
  if (user_id) {
    const userDoc = await db.collection('users').doc(user_id).get().catch(() => ({ data: null }));
    if (userDoc.data) return userDoc.data;
  }
  return null;
}

async function resolveRequiredUser({ token = '', user_id = '' } = {}) {
  const user = await resolveOptionalUser({ token, user_id });
  if (!user?._id) throw new Error('请先登录');
  return user;
}

async function getJobAndCompany(jobId) {
  if (!jobId) throw new Error('缺少岗位ID');
  const jobDoc = await db.collection('jobs').doc(jobId).get();
  const job = jobDoc.data;
  if (!job) throw new Error('岗位不存在');

  const companyId = job.company_id || '';
  let company = null;
  if (companyId) {
    const companyDoc = await db.collection('companies').doc(companyId).get().catch(() => ({ data: null }));
    company = companyDoc.data || null;
  }

  return {
    job,
    company,
    job_id: job._id || jobId,
    job_name: pickFirst(job.position, job.job_name, job.name),
    company_id: company?._id || companyId,
    company_name: pickFirst(company?.name, company?.company_name, company?.short_name, job.company_name)
  };
}

async function apply(data) {
  const {
    token = '',
    user_id = '',
    job_id = '',
    source = 'miniprogram',
    expected_interview_time = '',
    interview_time = '',
    name = '',
    real_name = '',
    phone = '',
    id_card = '',
    recommender_id = '',
    recommender_name = '',
    qr_code = '',
    code = ''
  } = data;

  const user = await resolveOptionalUser({ token, user_id });
  const currentUserId = user?._id || '';
  const { job_id: resolvedJobId, job_name, company_id, company_name } = await getJobAndCompany(job_id);

  const applicantName = pickFirst(real_name, name, user?.real_name, user?.name);
  const applicantPhone = normalizePhone(pickFirst(phone, user?.phone, user?.account_phone));
  const applicantIdCard = normalizeIdCard(id_card);
  if (!applicantName) return error(400, '请输入姓名');
  if (!/^1[3-9]\d{9}$/.test(applicantPhone)) return error(400, '手机号格式不正确');
  if (!applicantIdCard) return error(400, '请输入身份证号');

  const duplicateWhere = currentUserId
    ? { user_id: currentUserId, job_id: resolvedJobId }
    : { applicant_phone: applicantPhone, job_id: resolvedJobId };
  const existingRes = await db.collection('applications')
    .where(duplicateWhere)
    .orderBy('created_at', 'desc')
    .limit(1)
    .get();
  const existing = existingRes.data?.[0];
  if (existing && !['cancelled', 'rejected', 'expired'].includes(existing.status)) {
    return error(400, `您已申请该岗位，当前状态：${existing.status || 'pending'}，无法重复提交`);
  }

  const finalInterviewTime = normalizeDateTime(expected_interview_time || interview_time || '');
  const applicationData = {
    user_id: currentUserId,
    job_id: resolvedJobId,
    job_name,
    company_id,
    company_name,
    source,
    recommender_id: recommender_id || '',
    recommender_name: recommender_name || '',
    applicant_name: applicantName,
    applicant_phone: applicantPhone,
    applicant_id_card: applicantIdCard,
    qr_code: qr_code || code || '',
    status: 'pending',
    interview_result: 'pending',
    checkin_status: 'not_checked_in',
    interview_time: finalInterviewTime,
    expected_interview_time: finalInterviewTime,
    ...(currentUserId ? {
      login_user_id: currentUserId,
      login_user_name: pickFirst(user?.real_name, user?.name),
      login_user_phone: normalizePhone(pickFirst(user?.phone, user?.account_phone))
    } : {}),
    apply_time: db.serverDate(),
    created_at: db.serverDate(),
    updated_at: db.serverDate()
  };

  const result = await db.collection('applications').add({ data: applicationData });
  const applicationId = getAddResultId(result);
  if (!applicationId) throw new Error('报名记录创建成功但未返回记录ID');

  if (currentUserId) {
    await ensureCandidateProfile(currentUserId, {
      recommender_id,
      recommender_name,
      bind_reason: recommender_id ? 'scan_register' : 'register'
    }).catch((err) => console.warn('ensureCandidateProfile 失败:', err.message || err));
    await recordCandidateAction({
      candidate_id: currentUserId,
      action_type: 'job_apply',
      operator_id: currentUserId,
      operator_name: pickFirst(user?.real_name, user?.name),
      operator_role: 'candidate',
      related_job_id: resolvedJobId,
      related_company_id: company_id,
      related_application_id: applicationId,
      remark: recommender_id ? '扫码报名' : '岗位报名'
    }).catch((err) => console.warn('recordCandidateAction 失败:', err.message || err));
  }

  try {
    await cloud.callFunction({
      name: 'notification',
      data: {
        action: 'send-wecom-apply',
        application_id: applicationId,
        applicant_name: applicantName,
        applicant_phone: applicantPhone,
        applicant_id_card: applicantIdCard,
        job_name,
        company_name,
        source: recommender_id ? '扫码报名' : '小程序申请',
        recommender_name: recommender_name || '',
        interview_time: finalInterviewTime,
        user_id: currentUserId
      }
    });
  } catch (notifyErr) {
    console.warn('企业微信通知发送失败（不影响报名）:', notifyErr.message || notifyErr);
  }

  return success({ id: applicationId, application_id: applicationId, interview_time: finalInterviewTime }, '报名成功');
}

async function applyByQR(data) {
  const { qr_code = '', code = '' } = data;
  const finalCode = qr_code || code;
  const qrDoc = await db.collection('qr_codes').where({ code: finalCode, status: 'active' }).get();
  if (!qrDoc.data?.length) return error(404, '二维码无效');
  const qr = qrDoc.data[0];
  return apply({
    ...data,
    job_id: qr.job_id,
    source: 'qrcode',
    recommender_id: qr.recommender_id || qr.creator_id || '',
    recommender_name: qr.recommender_name || qr.creator_name || '',
    interview_time: qr.interview_time || '',
    qr_code: finalCode
  });
}

async function checkStatus(data) {
  const { token = '', job_id = '' } = data;
  if (!job_id) return error(400, '缺少岗位ID');
  const user = await resolveOptionalUser({ token });
  if (!user?._id) return success({ has_application: false, can_apply: true });

  const existing = await db.collection('applications')
    .where({ user_id: user._id, job_id })
    .orderBy('created_at', 'desc')
    .limit(1)
    .get();
  if (!existing.data.length) return success({ has_application: false, can_apply: true });
  const application = existing.data[0];
  return success({
    has_application: true,
    application,
    can_reapply: ['cancelled', 'rejected', 'expired'].includes(application.status)
  });
}

async function myList(data) {
  const user = await resolveRequiredUser({ token: data.token, user_id: data.user_id });
  const res = await db.collection('applications')
    .where({ user_id: user._id })
    .orderBy('created_at', 'desc')
    .limit(50)
    .get();
  return success(res.data || []);
}

async function adminList(data) {
  return listInterviews(data);
}

async function listInterviews(data) {
  const {
    page = 1,
    pageSize = 20,
    candidate_name = '',
    job_name = '',
    result = '',
    checkin_status = '',
    status = '',
    company_id = '',
    job_id = '',
    date_from = '',
    date_to = ''
  } = data;

  const where = {};
  if (company_id) where.company_id = company_id;
  if (job_id) where.job_id = job_id;
  if (status) where.status = status;
  if (result) where.interview_result = result === 'noshow' ? 'absent' : result;
  if (checkin_status) where.checkin_status = checkin_status;

  let query = db.collection('applications').where(where);
  const totalRes = await query.count();
  const skip = (Number(page) - 1) * Number(pageSize);
  const listRes = await query.orderBy('created_at', 'desc').skip(skip).limit(Number(pageSize)).get();

  let list = (listRes.data || []).map(mapApplicationToInterviewRow);
  const nameFilter = normalizeText(candidate_name);
  const jobFilter = normalizeText(job_name);
  if (nameFilter) list = list.filter((item) => normalizeText(item.candidate_name).includes(nameFilter));
  if (jobFilter) list = list.filter((item) => normalizeText(item.job_name).includes(jobFilter));
  if (date_from) list = list.filter((item) => toDateStr(item.interview_time) >= date_from);
  if (date_to) list = list.filter((item) => toDateStr(item.interview_time) <= date_to);

  return success({
    list,
    total: totalRes.total || list.length,
    page: Number(page),
    pageSize: Number(pageSize),
    totalPages: Math.ceil((totalRes.total || 0) / Number(pageSize))
  });
}

async function updateStatus(data) {
  const { application_id = '', status = '', remark = '' } = data;
  if (!application_id || !status) return error(400, '缺少报名记录或状态');
  await db.collection('applications').doc(application_id).update({
    data: { status, remark, updated_at: db.serverDate() }
  });
  return success(null, '状态已更新');
}

function buildResultPatch(result) {
  const normalized = result === 'noshow' ? 'absent' : result;
  const patch = {
    interview_result: normalized,
    updated_at: db.serverDate()
  };
  if (normalized === 'passed') patch.status = 'passed';
  if (normalized === 'rejected') patch.status = 'rejected';
  if (normalized === 'absent') {
    patch.status = 'rejected';
    patch.checkin_status = 'absent';
  }
  if (normalized === 'arrived' || normalized === 'checked_in') {
    patch.status = 'arrived';
    patch.checkin_status = 'checked_in';
    patch.checkin_time = db.serverDate();
  }
  return patch;
}

async function updateInterviewResult(data) {
  const applicationId = data.application_id || data.interview_id;
  const result = data.result;
  if (!applicationId || !result) return error(400, '缺少记录或结果');
  await db.collection('applications').doc(applicationId).update({ data: buildResultPatch(result) });
  return success(null, '面试状态已更新');
}

async function findReusableEmployee({ user_id = '', id_card = '', phone = '', name = '' } = {}) {
  const normalizedIdCard = normalizeIdCard(id_card);
  const normalizedPhone = normalizePhone(phone);
  const normalizedName = normalizeName(name);

  if (normalizedIdCard) {
    const res = await db.collection('employees').where({ id_card: normalizedIdCard }).limit(10).get();
    const matches = (res.data || []).filter((item) => !normalizeText(item.merged_into_employee_id));
    if (matches.length === 1) return matches[0];
    if (matches.length > 1) {
      const sameName = matches.filter((item) => normalizeName(item.name) === normalizedName);
      if (sameName.length === 1) return sameName[0];
      throw new Error('身份证匹配到多个员工档案，请先清理重复数据');
    }
  }

  if (user_id) {
    const userRes = await db.collection('employees').where({ user_id }).limit(10).get();
    if ((userRes.data || []).length === 1) return userRes.data[0];
  }

  if (normalizedPhone && normalizedName) {
    const phoneRes = await db.collection('employees').where({ phone: normalizedPhone }).limit(10).get();
    const matches = (phoneRes.data || []).filter((item) => normalizeName(item.name) === normalizedName && !normalizeText(item.merged_into_employee_id));
    if (matches.length === 1) return matches[0];
  }

  return null;
}

async function ensureEmployeeCompanyRelation(employeeId, application, employeeUserId = '') {
  const activeRes = await db.collection('employee_companies')
    .where({ employee_id: employeeId, company_id: application.company_id, status: 'active' })
    .limit(1)
    .get();
  if (activeRes.data?.length) return activeRes.data[0];

  const jobDoc = application.job_id ? await db.collection('jobs').doc(application.job_id).get().catch(() => ({ data: null })) : { data: null };
  const job = jobDoc.data || {};
  const payload = {
    employee_id: employeeId,
    company_id: application.company_id || job.company_id || '',
    company_name: application.company_name || job.company_name || '',
    job_id: application.job_id || '',
    job_name: application.job_name || job.position || job.job_name || '',
    rate_plan_id: job.rate_plan_id || '',
    salary_type: job.salary_type || 'monthly',
    settlement_mode: job.salary_type === 'daily' ? 'daily' : 'monthly',
    hourly_rate: job.hourly_rate || 0,
    join_date: toDateStr(application.join_date || dataSafe(application, 'onboard_join_date')) || getTodayDate(),
    status: 'active',
    referrer_id: application.recommender_id || application.referrer_id || '',
    referrer_name: application.recommender_name || application.referrer_name || '',
    source_referrer_id: application.recommender_id || application.referrer_id || '',
    source_referrer_name: application.recommender_name || application.referrer_name || '',
    recommender_id: application.recommender_id || application.referrer_id || '',
    recommender_name: application.recommender_name || application.referrer_name || '',
    created_by: employeeUserId || 'system',
    created_at: db.serverDate(),
    updated_at: db.serverDate()
  };
  const res = await db.collection('employee_companies').add({ data: payload });
  return { _id: getAddResultId(res), ...payload };
}

function dataSafe(obj, key) {
  return obj && Object.prototype.hasOwnProperty.call(obj, key) ? obj[key] : '';
}

async function onboardApplication(data) {
  const applicationId = data.application_id || data.interview_id;
  if (!applicationId) return error(400, '缺少报名记录ID');
  const appDoc = await db.collection('applications').doc(applicationId).get();
  const application = appDoc.data;
  if (!application) return error(404, '报名记录不存在');

  const applicantName = pickFirst(data.name, data.real_name, application.applicant_name, application.candidate_name);
  const applicantPhone = normalizePhone(pickFirst(data.phone, application.applicant_phone, application.phone));
  const applicantIdCard = normalizeIdCard(pickFirst(data.id_card, application.applicant_id_card, application.id_card));
  if (!applicantName) return error(400, '缺少姓名，无法入职');
  if (!applicantIdCard) return error(400, '缺少身份证号，无法入职');
  const idCardInfo = parseIdCard(applicantIdCard);

  const applicationUserId = application.user_id || '';
  let employee = await findReusableEmployee({
    user_id: applicationUserId,
    id_card: applicantIdCard,
    phone: applicantPhone,
    name: applicantName
  });

  if (employee) {
    await db.collection('employees').doc(employee._id).update({
      data: {
        ...(applicationUserId ? { user_id: applicationUserId } : {}),
        name: applicantName,
        phone: applicantPhone,
        id_card: applicantIdCard,
        ...(idCardInfo.valid ? { gender: idCardInfo.gender, birth_date: idCardInfo.birth_date } : {}),
        updated_at: db.serverDate()
      }
    });
  } else {
    const employeeNo = generateEmployeeNo();
    const res = await db.collection('employees').add({
      data: {
        ...(applicationUserId ? { user_id: applicationUserId } : {}),
        name: applicantName,
        phone: applicantPhone,
        id_card: applicantIdCard,
        ...(idCardInfo.valid ? { gender: idCardInfo.gender, birth_date: idCardInfo.birth_date } : {}),
        employee_no: employeeNo,
        status: 'probation',
        source: 'application_onboard',
        created_at: db.serverDate(),
        updated_at: db.serverDate()
      }
    });
    employee = { _id: getAddResultId(res), employee_no: employeeNo };
  }

  const relation = await ensureEmployeeCompanyRelation(employee._id, {
    ...application,
    join_date: data.join_date || application.join_date || getTodayDate()
  }, applicationUserId);

  if (applicationUserId) {
    await db.collection('users').doc(applicationUserId).update({
      data: {
        employee_id: employee._id,
        employee_no: employee.employee_no || '',
        updated_at: db.serverDate(),
        update_time: db.serverDate()
      }
    }).catch((err) => console.warn('回写 users.employee_id 失败:', err.message || err));
  }

  await db.collection('applications').doc(applicationId).update({
    data: {
      status: 'onboarded',
      interview_result: 'passed',
      checkin_status: 'onboarded',
      employee_id: employee._id,
      employee_company_id: relation._id || '',
      onboarded_at: db.serverDate(),
      updated_at: db.serverDate()
    }
  });

  return success({
    employee_id: employee._id,
    employee_company_id: relation._id || '',
    application_id: applicationId
  }, '入职办理成功');
}

async function applyForAgent(data) {
  const user = await resolveRequiredUser({ token: data.token, user_id: data.user_id || data.user_info?.id });
  await db.collection('users').doc(user._id).update({
    data: {
      user_type: 'agent',
      role: user.role || 'external',
      updated_at: db.serverDate(),
      update_time: db.serverDate()
    }
  });
  return success({ status: 'approved', user_type: 'agent' }, '申请已通过，您已成为代理');
}

async function getAgentApplication(data) {
  const user = await resolveRequiredUser({ token: data.token, user_id: data.user_id });
  const isAgent = user.user_type === 'agent';
  return success({
    status: isAgent ? 'approved' : 'none',
    user_type: user.user_type || 'candidate',
    application: isAgent ? { user_id: user._id, status: 'approved' } : null
  });
}

exports.main = async (event) => {
  const { action } = event;
  console.log('applications云函数调用:', { action, token: event.token ? '已携带' : '未携带' });

  try {
    switch (action) {
      case 'create':
      case 'apply':
        return apply(event);
      case 'apply-by-qr':
        return applyByQR(event);
      case 'my-list':
        return myList(event);
      case 'list':
        return adminList(event);
      case 'list-interviews':
        return listInterviews(event);
      case 'update-status':
        return updateStatus(event);
      case 'update-result':
      case 'set-interview-result':
        return updateInterviewResult(event);
      case 'onboard-application':
      case 'onboard-from-application':
        return onboardApplication(event);
      case 'check-status':
        return checkStatus(event);
      case 'apply-for-agent':
        return applyForAgent(event);
      case 'get-agent-application':
        return getAgentApplication(event);
      default:
        return error(400, '不支持的操作');
    }
  } catch (err) {
    console.error('报名模块错误:', err);
    return error(500, err.message || String(err));
  }
};
