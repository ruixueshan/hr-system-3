/**
 * 面试管理模块
 */
const cloud = require('wx-server-sdk');
const { success, error } = require('./common/response');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

const db = cloud.database();
const { recordCandidateAction } = require('./candidateOwnership');
const FULL_ACCESS_ROLES = new Set(['gm', 'deputy']);

function pickFirstNonEmpty(...values) {
  for (const value of values) {
    if (value !== undefined && value !== null && String(value).trim() !== '') {
      return value;
    }
  }
  return '';
}

function extractDatePart(value = '') {
  const text = String(value || '').trim();
  if (!text) return '';
  return text.slice(0, 10);
}

function normalizeDateTimeValue(value) {
  if (!value) return '';
  if (typeof value === 'string') {
    return value.trim();
  }
  if (value instanceof Date) {
    const year = value.getFullYear();
    const month = String(value.getMonth() + 1).padStart(2, '0');
    const day = String(value.getDate()).padStart(2, '0');
    const hours = String(value.getHours()).padStart(2, '0');
    const minutes = String(value.getMinutes()).padStart(2, '0');
    const seconds = String(value.getSeconds()).padStart(2, '0');
    return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
  }
  if (typeof value === 'object') {
    if (value.$date) {
      return normalizeDateTimeValue(value.$date);
    }
    if (value.value) {
      return normalizeDateTimeValue(value.value);
    }
    if (value.seconds) {
      return normalizeDateTimeValue(new Date(Number(value.seconds) * 1000));
    }
  }
  return String(value).trim();
}

function buildDateRange(dateFrom = '', dateTo = '') {
  const range = {};
  if (dateFrom) range.$gte = `${dateFrom} 00:00:00`;
  if (dateTo) range.$lte = `${dateTo} 23:59:59`;
  return range;
}

async function getDocById(collectionName, id) {
  if (!id) return null;
  try {
    const res = await db.collection(collectionName).doc(id).get();
    return res.data || null;
  } catch (err) {
    console.warn(`[interviews] 读取 ${collectionName} 失败:`, id, err.message || err);
    return null;
  }
}

async function getInterviewContext({ application_id = '', user_id = '', job_id = '', company_id = '' } = {}) {
  const application = await getDocById('applications', application_id);
  const finalUserId = application?.user_id || user_id;
  const finalJobId = application?.job_id || job_id;
  const finalCompanyId = application?.company_id || company_id;
  const [user, job, company] = await Promise.all([
    getDocById('users', finalUserId),
    getDocById('jobs', finalJobId),
    getDocById('companies', finalCompanyId || application?.company_id || '')
  ]);

  return { application, user, job, company };
}

async function findExistingInterview(applicationId, interviewTime = '') {
  if (!applicationId) return null;
  const res = await db.collection('interviews')
    .where({ application_id: applicationId })
    .limit(20)
    .get();
  const list = res.data || [];
  if (!list.length) return null;
  if (!interviewTime) return list[0];
  return list.find(item => String(item.interview_time || '') === String(interviewTime)) || list[0];
}

function buildInterviewData(input, context) {
  const { application, user, job, company } = context;
  const finalInterviewTime = pickFirstNonEmpty(
    input.interview_time,
    application?.expected_interview_time,
    input.interview_date ? `${input.interview_date} 00:00:00` : ''
  );
  const finalInterviewDate = pickFirstNonEmpty(input.interview_date, extractDatePart(finalInterviewTime));
  const finalUserId = pickFirstNonEmpty(application?.user_id, input.user_id, user?._id);
  const finalJobId = pickFirstNonEmpty(application?.job_id, input.job_id, job?._id);
  const finalCompanyId = pickFirstNonEmpty(application?.company_id, input.company_id, job?.company_id, company?._id);
  const finalCandidateName = pickFirstNonEmpty(
    input.candidate_name,
    user?.real_name,
    user?.name,
    application?.candidate_name,
    application?.name
  );
  const finalPhone = pickFirstNonEmpty(
    input.phone,
    user?.phone,
    user?.account_phone,
    application?.phone
  );
  const finalIdCard = pickFirstNonEmpty(
    input.id_card,
    application?.id_card,
    user?.id_card
  );
  const finalJobName = pickFirstNonEmpty(
    input.job_name,
    job?.position,
    job?.job_name,
    application?.job_name
  );
  const finalCompanyName = pickFirstNonEmpty(
    input.company_name,
    company?.name,
    job?.company_name,
    application?.company_name
  );
  const finalRecommenderId = pickFirstNonEmpty(
    input.recommender_id,
    application?.recommender_id,
    user?.source_referrer_id,
    user?.referrer_id
  );
  const finalRecommenderName = pickFirstNonEmpty(
    input.recommender_name,
    application?.recommender_name,
    user?.source_referrer_name,
    user?.referrer_name
  );

  return {
    application_id: input.application_id || '',
    user_id: finalUserId || '',
    job_id: finalJobId || '',
    company_id: finalCompanyId || '',
    candidate_name: finalCandidateName || '',
    phone: finalPhone || '',
    id_card: finalIdCard || '',
    job_name: finalJobName || '',
    company_name: finalCompanyName || '',
    recommender_id: finalRecommenderId || '',
    recommender_name: finalRecommenderName || '',
    interview_date: finalInterviewDate || '',
    interview_time: finalInterviewTime || '',
    interview_type: input.interview_type || 'offline',
    interviewer: input.interviewer || '',
    location: input.location || '',
    remark: input.remark || '',
    notes: input.notes || '',
    status: input.status || 'scheduled',
    result: input.result || 'pending'
  };
}

async function syncExistingInterview(interview, interviewData) {
  const patch = {};
  const syncFields = [
    'user_id',
    'job_id',
    'company_id',
    'candidate_name',
    'phone',
    'id_card',
    'job_name',
    'company_name',
    'recommender_id',
    'recommender_name',
    'interview_date',
    'interview_time'
  ];

  syncFields.forEach((field) => {
    const nextValue = interviewData[field];
    const currentValue = interview[field];
    if (String(currentValue || '') === '' && String(nextValue || '') !== '') {
      patch[field] = nextValue;
    }
  });

  if (Object.keys(patch).length === 0) {
    return false;
  }

  await db.collection('interviews').doc(interview._id).update({
    data: {
      ...patch,
      updated_at: db.serverDate()
    }
  });
  return true;
}

async function batchGetDocs(collectionName, ids = []) {
  const uniqueIds = Array.from(new Set((ids || []).filter(Boolean)));
  if (!uniqueIds.length) return new Map();

  const res = await db.collection(collectionName)
    .where({ _id: db.command.in(uniqueIds) })
    .get();

  const map = new Map();
  (res.data || []).forEach((item) => {
    map.set(item._id, item);
  });
  return map;
}

async function hydrateInterviewRecords(records = []) {
  if (!records.length) return records;

  const applicationMap = await batchGetDocs('applications', records.map(item => item.application_id));
  const userIds = [];
  const jobIds = [];
  const companyIds = [];

  records.forEach((item) => {
    const application = applicationMap.get(item.application_id);
    userIds.push(item.user_id || application?.user_id || '');
    jobIds.push(item.job_id || application?.job_id || '');
    companyIds.push(item.company_id || application?.company_id || '');
  });

  const userMap = await batchGetDocs('users', userIds);
  const jobMap = await batchGetDocs('jobs', jobIds);

  jobMap.forEach((job) => {
    if (job?.company_id) companyIds.push(job.company_id);
  });
  const companyMap = await batchGetDocs('companies', companyIds);

  const hydrated = [];
  for (const item of records) {
    const application = applicationMap.get(item.application_id);
    const user = userMap.get(item.user_id || application?.user_id || '');
    const job = jobMap.get(item.job_id || application?.job_id || '');
    const company = companyMap.get(item.company_id || application?.company_id || job?.company_id || '');
    const merged = buildInterviewData({
      ...item,
      application_id: item.application_id || application?._id || ''
    }, {
      application,
      user,
      job,
      company
    });

    const nextItem = {
      ...item,
      user_id: item.user_id || merged.user_id,
      job_id: item.job_id || merged.job_id,
      company_id: item.company_id || merged.company_id,
      candidate_name: item.candidate_name || merged.candidate_name,
      phone: item.phone || merged.phone,
      job_name: item.job_name || merged.job_name,
      company_name: item.company_name || merged.company_name,
      recommender_id: item.recommender_id || merged.recommender_id,
      recommender_name: item.recommender_name || merged.recommender_name,
      interview_date: item.interview_date || merged.interview_date,
      interview_time: item.interview_time || merged.interview_time,
      application_status: item.application_status || application?.status || '',
      application_source: item.application_source || application?.source || '',
      application_checkin_time: item.application_checkin_time || application?.checkin_time || '',
      checkin_status: item.checkin_status || '',
      checked_in_at: item.checked_in_at || item.checkin_time || '',
      checkin_source: item.checkin_source || '',
      onboarded_at: item.onboarded_at || '',
      id_card: item.id_card || application?.id_card || merged.id_card || ''
    };

    hydrated.push(nextItem);

    await syncExistingInterview(item, nextItem);
  }

  return hydrated;
}

exports.main = async (event, context) => {
  const { action, token } = event;

  try {
    switch (action) {
      case 'create':
        return createInterview(event);
      case 'update':
        return updateInterview(event);
      case 'list':
        return listInterviews(event);
      case 'backfill-from-applications':
        return backfillFromApplications(event);
      case 'update-result':
        return updateResult(event);
      case 'mark-absent':
        return markAbsent(event);
      default:
        return error(400, '不支持的操作');
    }
  } catch (err) {
    console.error('面试模块错误:', err);
    return error(500, err.message);
  }
};

async function createInterview(data) {
  const { application_id = '', skip_if_exists = false } = data;
  const context = await getInterviewContext(data);
  if (application_id && !context.application) {
    return error(404, '报名记录不存在');
  }

  const interviewData = buildInterviewData(data, context);
  if (!interviewData.interview_time) {
    return error(400, '缺少面试时间');
  }

  if (skip_if_exists && application_id) {
    const existing = await findExistingInterview(application_id, interviewData.interview_time);
    if (existing) {
      await syncExistingInterview(existing, interviewData);
      return success({ id: existing._id || existing.id, existing: true }, '面试记录已存在');
    }
  }

  const result = await db.collection('interviews').add({
    data: {
      ...interviewData,
      created_at: db.serverDate(),
      updated_at: db.serverDate()
    }
  });

  // 更新 applications 状态为面试中
  if (application_id) {
    await db.collection('applications').doc(application_id).update({
      data: {
        status: 'interview',
        interview_time: interviewData.interview_time,
        updated_at: db.serverDate()
      }
    });
  }

  if (interviewData.user_id) {
    await recordCandidateAction({
      candidate_id: interviewData.user_id,
      action_type: 'interview_schedule',
      operator_id: data.operator_id || '',
      operator_name: data.operator_name || '',
      operator_role: data.operator_role || 'hr',
      related_job_id: interviewData.job_id || '',
      related_company_id: interviewData.company_id || '',
      related_application_id: application_id || '',
      related_interview_id: result.id,
      remark: interviewData.interview_time || '已安排面试'
    });
  }

  return success({ id: result.id }, '面试安排成功');
}

async function updateInterview(data) {
  const { interview_id = '' } = data;
  if (!interview_id) {
    return error(400, '缺少面试ID');
  }

  const existingRes = await db.collection('interviews').doc(interview_id).get();
  const existing = existingRes.data || null;
  if (!existing) {
    return error(404, '面试记录不存在');
  }

  const applicationId = data.application_id || existing.application_id || '';
  const context = await getInterviewContext({
    application_id: applicationId,
    user_id: data.user_id || existing.user_id || '',
    job_id: data.job_id || existing.job_id || '',
    company_id: data.company_id || existing.company_id || ''
  });
  const interviewData = buildInterviewData({
    ...existing,
    ...data,
    application_id: applicationId
  }, context);

  if (!interviewData.interview_time) {
    return error(400, '缺少面试时间');
  }

  await db.collection('interviews').doc(interview_id).update({
    data: {
      ...interviewData,
      updated_at: db.serverDate()
    }
  });

  if (applicationId) {
    const applicationStatus = ['pass', 'passed', 'hired'].includes(interviewData.result)
      ? 'passed'
      : (interviewData.result === 'pending' ? 'interview' : 'rejected');
    await db.collection('applications').doc(applicationId).update({
      data: {
        interview_time: interviewData.interview_time,
        status: applicationStatus,
        updated_at: db.serverDate()
      }
    });
  }

  return success({ id: interview_id }, '面试修改成功');
}

async function listInterviews(data) {
  const {
    company_id = '',
    interviewer = '',
    candidate_name = '',
    job_name = '',
    result = '',
    checkin_status = '',
    date_from = '',
    date_to = '',
    page = 1,
    pageSize = 20,
    user_id = '',
    user_role = '',
    include_all = false
  } = data;

  const cmd = db.command;
  const conditions = [];

  if (company_id) conditions.push({ company_id });
  if (interviewer) conditions.push({ interviewer });
  if (candidate_name) conditions.push({ candidate_name: db.RegExp({ regexp: candidate_name, options: 'i' }) });
  if (job_name) conditions.push({ job_name: db.RegExp({ regexp: job_name, options: 'i' }) });
  conditions.push({ result: cmd.neq('hired') });
  if (result) conditions.push({ result });
  if (date_from || date_to) conditions.push({ interview_time: buildDateRange(date_from, date_to) });
  if (checkin_status) conditions.push({ checkin_status });

  const hasFullAccess = FULL_ACCESS_ROLES.has(String(user_role || ''));
  if ((!include_all || !hasFullAccess) && !hasFullAccess) {
    if (!user_id) {
      return success({ list: [], total: 0, page, pageSize, totalPages: 0 });
    }
    conditions.push({ recommender_id: user_id });
  }

  let query = db.collection('interviews');
  if (conditions.length === 1) {
    query = query.where(conditions[0]);
  } else if (conditions.length > 1) {
    query = query.where(cmd.and(conditions));
  }

  const skip = (Number(page) - 1) * Number(pageSize);
  const countRes = await query.count();
  const total = countRes.total || 0;
  const res = await query
    .orderBy('interview_time', 'desc')
    .skip(skip)
    .limit(Number(pageSize))
    .get();

  const list = await hydrateInterviewRecords(res.data || []);

  return success({
    list,
    total,
    page: Number(page),
    pageSize: Number(pageSize),
    totalPages: Math.ceil(total / Number(pageSize || 20))
  });
}

async function backfillFromApplications(data) {
  const limit = Math.max(1, Math.min(Number(data.limit) || 500, 2000));
  const dryRun = !!data.dry_run;
  const applicationsRes = await db.collection('applications')
    .orderBy('created_at', 'desc')
    .limit(limit)
    .get();

  let scanned = 0;
  let created = 0;
  let updated = 0;
  let skipped = 0;

  for (const application of applicationsRes.data || []) {
    const scheduledTime = pickFirstNonEmpty(
      normalizeDateTimeValue(application.expected_interview_time),
      normalizeDateTimeValue(application.interview_time),
      normalizeDateTimeValue(application.apply_time),
      normalizeDateTimeValue(application.created_at)
    );
    if (!scheduledTime) continue;
    scanned += 1;

    const existing = await findExistingInterview(application._id, scheduledTime);
    const context = await getInterviewContext({
      application_id: application._id,
      user_id: application.user_id,
      job_id: application.job_id,
      company_id: application.company_id
    });
    const interviewData = buildInterviewData({
      application_id: application._id,
      interview_time: scheduledTime,
      operator_id: 'system',
      operator_name: '系统',
      operator_role: 'system'
    }, context);

    if (!existing) {
      if (!dryRun) {
        await createInterview({
          application_id: application._id,
          interview_time: scheduledTime,
          remark: '历史报名数据自动补齐面试记录',
          operator_id: 'system',
          operator_name: '系统',
          operator_role: 'system',
          skip_if_exists: true
        });
      }
      created += 1;
      continue;
    }

    const needsSync = await (dryRun ? Promise.resolve(
      ['candidate_name', 'phone', 'job_name', 'company_name', 'recommender_id', 'recommender_name', 'interview_date']
        .some(field => String(existing[field] || '') === '' && String(interviewData[field] || '') !== '')
    ) : syncExistingInterview(existing, interviewData));

    if (needsSync) {
      updated += 1;
    } else {
      skipped += 1;
    }
  }

  return success({
    scanned,
    created,
    updated,
    skipped,
    dry_run: dryRun
  }, dryRun ? '回填预检查完成' : '面试数据补齐完成');
}

async function updateResult(data) {
  const { interview_id, result, score, evaluation, if_employed } = data;
  const patch = {
    result,
    score,
    evaluation,
    if_employed,
    updated_at: db.serverDate()
  };
  if (result === 'noshow' || result === 'absent') {
    patch.checkin_status = 'absent';
  }
  if (result === 'hired') {
    patch.checkin_status = 'onboarded';
    patch.onboarded_at = db.serverDate();
  }

  await db.collection('interviews').doc(interview_id).update({
    data: patch
  });

  // 获取面试记录
  const interviewDoc = await db.collection('interviews').doc(interview_id).get();
  const interview = interviewDoc.data;

  // 更新 applications 状态
  let appStatus = ['pass', 'passed', 'hired'].includes(result) ? 'passed' : 'rejected';
  if (interview.application_id) {
    await db.collection('applications').doc(interview.application_id).update({
      data: {
        status: appStatus,
        remark: evaluation,
        updated_at: db.serverDate()
      }
    });
  }

  if (interview.user_id) {
    await recordCandidateAction({
      candidate_id: interview.user_id,
      action_type: 'interview_result',
      operator_id: data.operator_id || '',
      operator_name: data.operator_name || '',
      operator_role: data.operator_role || 'hr',
      related_job_id: interview.job_id || '',
      related_company_id: interview.company_id || '',
      related_application_id: interview.application_id || '',
      related_interview_id: interview_id,
      remark: `${result}${evaluation ? `：${evaluation}` : ''}`
    });
  }

  return success(null, '面试结果已更新');
}

async function markAbsent(data) {
  const { application_id } = data;

  // 查询该候选人之前的缺席次数
  const absentCountRes = await db.collection('interviews')
    .where({ application_id, result: 'absent' })
    .count();

  const absentCount = absentCountRes.total + 1;

  // 标记缺席
  await db.collection('interviews').add({
    data: {
      application_id,
      result: 'absent',
      created_at: db.serverDate()
    }
  });

  // 累计3次缺席加入黑名单
  if (absentCount >= 3) {
    // 获取用户信息
    const appDoc = await db.collection('applications').doc(application_id).get();
    const user = await db.collection('users').doc(appDoc.data.user_id).get();

    await db.collection('blacklists').add({
      data: {
        user_id: user.data._id,
        user_name: user.data.name,
        id_card: appDoc.data.id_card || '',
        type: 'absent_3times',
        expire_type: 'temporary',
        expire_time: new Date(Date.now() + 6 * 30 * 24 * 60 * 60 * 1000), // 6个月
        reason: '面试累计3次未到',
        related_applications: [application_id],
        created_by: 'system',
        created_by_name: '系统',
        created_at: db.serverDate()
      }
    });

    // 更新 applications 状态
    await db.collection('applications').doc(application_id).update({
      data: { status: 'cancelled' }
    });

    if (appDoc.data?.user_id) {
      await recordCandidateAction({
        candidate_id: appDoc.data.user_id,
        action_type: 'interview_result',
        operator_id: 'system',
        operator_name: '系统',
        operator_role: 'system',
        related_job_id: appDoc.data.job_id || '',
        related_company_id: appDoc.data.company_id || '',
        related_application_id: application_id,
        remark: '面试累计3次未到，已取消'
      });
    }

    return success(null, `已标记缺席（累计${absentCount}次），已加入黑名单`);
  }

  return success(null, `已标记缺席，当前累计${absentCount}次`);
}
