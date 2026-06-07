const cloud = require('wx-server-sdk');
const { success, error } = require('./common/response');
const {
  getDb,
  ensureCandidateProfile,
  claimCandidate,
  moveCandidateToPublic,
  recordCandidateAction,
  recycleExpiredCandidates,
  toDateTimeStr
} = require('./candidateOwnership');

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

const db = getDb();
const QUERY_PAGE_SIZE = 100;
const IN_QUERY_BATCH_SIZE = 100;

function getLoggedUser(event) {
  return {
    id: event.operator_id || event.owner_id || '',
    name: event.operator_name || event.owner_name || '',
    role: event.operator_role || event.owner_role || ''
  };
}

function chunkArray(items = [], chunkSize = IN_QUERY_BATCH_SIZE) {
  const result = [];
  for (let index = 0; index < items.length; index += chunkSize) {
    result.push(items.slice(index, index + chunkSize));
  }
  return result;
}

async function fetchAllByWhere(collectionName, where) {
  const list = [];
  let skip = 0;

  while (true) {
    const res = await db.collection(collectionName)
      .where(where)
      .skip(skip)
      .limit(QUERY_PAGE_SIZE)
      .get();

    const rows = res.data || [];
    list.push(...rows);

    if (rows.length < QUERY_PAGE_SIZE) {
      break;
    }

    skip += rows.length;
  }

  return list;
}

async function fetchAllByInBatches(collectionName, field, values = []) {
  const uniqueValues = Array.from(new Set(values.filter(Boolean)));
  if (!uniqueValues.length) return [];

  const result = [];
  for (const batch of chunkArray(uniqueValues)) {
    const rows = await fetchAllByWhere(collectionName, {
      [field]: db.command.in(batch)
    });
    result.push(...rows);
  }

  return result;
}

function normalizeStatus(application, employee) {
  if (employee && employee.status !== 'resigned') return 'onboarded';
  if (!application) return 'registered';
  if (application.status === 'interview') return 'interviewing';
  if (['pending', 'contacted'].includes(application.status)) return 'applied';
  if (application.status === 'passed') return 'passed';
  if (application.status === 'rejected') return 'rejected';
  if (application.status === 'cancelled') return 'cancelled';
  return application.status || 'registered';
}

function normalizeOwnership(user) {
  const ownerType = String(user.candidate_owner_type || '').trim();
  const poolStatus = String(user.candidate_pool_status || '').trim();
  const ownerId = String(user.candidate_owner_id || '').trim();

  if (ownerType === 'public' || poolStatus === 'public') return 'public';
  if (ownerType && ownerType !== 'public') return 'owned';
  if (ownerId) return 'owned';
  if (!ownerType && !poolStatus && !ownerId) return 'public';
  return 'public';
}

function normalizeSearchText(value = '') {
  return String(value || '').trim().toLowerCase();
}

function normalizeSearchPhone(value = '') {
  return String(value || '').replace(/\D/g, '');
}

function matchesCandidateKeyword(candidate, keyword) {
  const normalizedKeyword = normalizeSearchText(keyword);
  const normalizedKeywordPhone = normalizeSearchPhone(keyword);
  if (!normalizedKeyword) return true;

  const searchableTexts = [
    candidate.name,
    candidate.phone,
    candidate.owner_name,
    candidate.source_referrer_name,
    candidate.latest_job_name,
    candidate.latest_company_name
  ].map(normalizeSearchText);

  if (searchableTexts.some(text => text.includes(normalizedKeyword))) {
    return true;
  }

  if (normalizedKeywordPhone) {
    return normalizeSearchPhone(candidate.phone).includes(normalizedKeywordPhone);
  }

  return false;
}

exports.main = async (event) => {
  const isTimerTrigger = process.env.TRIGGER_SRC === 'timer';

  try {
    if (!event.action && isTimerTrigger) {
      return success(await recycleExpiredCandidates(), '候选人公海回收完成');
    }

    switch (event.action) {
      case 'list':
        return listCandidates(event);
      case 'detail':
        return getCandidateDetail(event);
      case 'claim':
        return handleClaim(event);
      case 'move-to-public':
        return handleMoveToPublic(event);
      case 'record-action':
        return handleRecordAction(event);
      case 'bind-scan-referral':
        return bindScanReferral(event);
      case 'recycle-expired':
        return success(await recycleExpiredCandidates(), '候选人公海回收完成');
      case 'import':
        return handleImport(event);
      case 'get-remarks':
        return getRemarks(event);
      case 'save-remark':
        return saveRemark(event);
      default:
        return error(400, '不支持的操作');
    }
  } catch (err) {
    console.error('候选人模块错误:', err);
    return error(500, err.message || '服务器错误');
  }
};

async function listCandidates(event) {
  const { keyword = '', scope = 'mine', owner_id = '', page = 1, pageSize = 20 } = event;

  let candidates = await fetchAllByWhere('users', { user_type: 'candidate' });
  const trimmedKeyword = String(keyword || '').trim();

  if (scope === 'mine' && owner_id) {
    candidates = candidates.filter(item => normalizeOwnership(item) === 'owned' && String(item.candidate_owner_id || '') === String(owner_id));
  } else if (scope === 'public') {
    candidates = candidates.filter(item => normalizeOwnership(item) === 'public');
  }

  const userIds = candidates.map(item => item._id).filter(Boolean);
  const applicationsMap = new Map();
  const employeesMap = new Map();
  const jobsMap = new Map();
  const companiesMap = new Map();

  if (userIds.length) {
    const applications = await fetchAllByInBatches('applications', 'user_id', userIds);
    for (const item of applications) {
      const current = applicationsMap.get(item.user_id);
      const currentTime = new Date(current?.created_at || current?.apply_time || 0).getTime();
      const nextTime = new Date(item.created_at || item.apply_time || 0).getTime();
      if (!current || nextTime >= currentTime) applicationsMap.set(item.user_id, item);
    }

    const employees = await fetchAllByInBatches('employees', 'user_id', userIds);
    for (const item of employees) {
      const current = employeesMap.get(item.user_id);
      const currentTime = new Date(current?.created_at || 0).getTime();
      const nextTime = new Date(item.created_at || 0).getTime();
      if (!current || nextTime >= currentTime) employeesMap.set(item.user_id, item);
    }
  }

  const jobIds = Array.from(new Set(
    candidates
      .map(item => applicationsMap.get(item._id)?.job_id)
      .filter(Boolean)
  ));

  if (jobIds.length) {
    const jobs = await fetchAllByInBatches('jobs', '_id', jobIds);
    for (const item of jobs) jobsMap.set(item._id, item);
  }

  const companyIds = Array.from(new Set(
    candidates
      .map(item => {
        const app = applicationsMap.get(item._id);
        const employee = employeesMap.get(item._id);
        return employee?.company_id || app?.company_id || jobsMap.get(app?.job_id || '')?.company_id || '';
      })
      .filter(Boolean)
  ));

  if (companyIds.length) {
    const companies = await fetchAllByInBatches('companies', '_id', companyIds);
    for (const item of companies) companiesMap.set(item._id, item);
  }

  let list = candidates
    .map(item => {
      const latestApplication = applicationsMap.get(item._id);
      const employee = employeesMap.get(item._id);
      const latestJob = jobsMap.get(latestApplication?.job_id || '');
      const companyId = employee?.company_id || latestApplication?.company_id || latestJob?.company_id || '';
      return {
        _id: item._id,
        name: item.real_name || item.name || item.nickname || '未命名候选人',
        phone: item.phone || item.mobile || '',
        source: latestApplication?.source || (item.source_referrer_id ? 'qrcode' : 'miniprogram'),
        business_status: normalizeStatus(latestApplication, employee),
        ownership_status: normalizeOwnership(item),
        owner_type: item.candidate_owner_type || 'public',
        owner_id: item.candidate_owner_id || '',
        owner_name: item.candidate_owner_name || '',
        source_referrer_id: item.source_referrer_id || item.referrer_id || '',
        source_referrer_name: item.source_referrer_name || item.referrer_name || '',
        last_action_at: item.candidate_last_action_at || '',
        owner_expire_at: item.candidate_owner_expire_at || '',
        latest_action_type: item.candidate_last_action_type || '',
        latest_job_id: latestApplication?.job_id || '',
        latest_job_name: latestJob?.position || latestApplication?.job_name || '',
        latest_company_id: companyId,
        latest_company_name: companiesMap.get(companyId)?.name || employee?.company_name || '',
        latest_application_id: latestApplication?._id || '',
        created_at: item.create_time || item.created_at || '',
        raw_status: latestApplication?.status || '',
        user_id: item._id
      };
    })
    .sort((a, b) => {
      const aTime = new Date(a.last_action_at || a.created_at || 0).getTime();
      const bTime = new Date(b.last_action_at || b.created_at || 0).getTime();
      return bTime - aTime;
    });

  if (trimmedKeyword) {
    list = list.filter(item => matchesCandidateKeyword(item, trimmedKeyword));
  }

  const total = list.length;
  const skip = (Number(page) - 1) * Number(pageSize);
  return success({
    list: list.slice(skip, skip + Number(pageSize)),
    total,
    page: Number(page),
    pageSize: Number(pageSize)
  });
}

async function getCandidateDetail(event) {
  const { candidate_id } = event;
  if (!candidate_id) return error(400, '缺少候选人ID');

  const userRes = await db.collection('users').doc(candidate_id).get();
  const user = userRes.data;
  if (!user) return error(404, '候选人不存在');

  const applicationsRes = await db.collection('applications')
    .where({ user_id: candidate_id })
    .orderBy('created_at', 'desc')
    .limit(50)
    .get();

  const logsRes = await db.collection('candidate_action_logs')
    .where({ candidate_id })
    .orderBy('created_at_ts', 'desc')
    .limit(100)
    .get();

  const ownerRes = await db.collection('candidate_owners')
    .where({ candidate_id })
    .orderBy('bind_at_ts', 'desc')
    .limit(50)
    .get();

  const remarksRes = await db.collection('candidate_remarks')
    .where({ candidate_id })
    .orderBy('created_at', 'desc')
    .get();

  const remarksMap = {};
  for (const item of remarksRes.data || []) {
    const category = item.category || 'other';
    if (!remarksMap[category]) remarksMap[category] = [];
    remarksMap[category].push(item);
  }

  const jobIds = Array.from(new Set((applicationsRes.data || []).map(item => item.job_id).filter(Boolean)));
  const jobsMap = new Map();
  const companiesMap = new Map();

  if (jobIds.length) {
    const jobsRes = await db.collection('jobs').where({ _id: db.command.in(jobIds) }).get();
    for (const item of jobsRes.data || []) jobsMap.set(item._id, item);
  }

  const companyIds = Array.from(new Set((applicationsRes.data || []).map(item => {
    const job = jobsMap.get(item.job_id);
    return item.company_id || job?.company_id || '';
  }).filter(Boolean)));

  if (companyIds.length) {
    const companiesRes = await db.collection('companies').where({ _id: db.command.in(companyIds) }).get();
    for (const item of companiesRes.data || []) companiesMap.set(item._id, item);
  }

  const applications = (applicationsRes.data || []).map(item => {
    const job = jobsMap.get(item.job_id);
    const companyId = item.company_id || job?.company_id || '';
    return {
      ...item,
      job_name: job?.position || item.job_name || '',
      company_name: companiesMap.get(companyId)?.name || ''
    };
  });

  return success({
    profile: {
      _id: user._id,
      name: user.real_name || user.name || user.nickname || '未命名候选人',
      phone: user.phone || user.mobile || '',
      ownership_status: normalizeOwnership(user),
      owner_type: user.candidate_owner_type || 'public',
      owner_id: user.candidate_owner_id || '',
      owner_name: user.candidate_owner_name || '',
      source_referrer_id: user.source_referrer_id || user.referrer_id || '',
      source_referrer_name: user.source_referrer_name || user.referrer_name || '',
      last_action_at: user.candidate_last_action_at || '',
      owner_expire_at: user.candidate_owner_expire_at || '',
      created_at: user.create_time || user.created_at || ''
    },
    user_info: {
      gender: user.gender !== undefined ? (user.gender === 1 || user.gender === '1' || user.gender === '男' ? '男' : user.gender === 0 || user.gender === '0' || user.gender === '女' ? '女' : user.gender) : '',
      id_card: applications.find((item) => item.id_card)?.id_card || '',
      birth_date: user.birth_date || '',
      education: user.education || '',
      work_years: user.work_years || '',
      current_company: user.current_company || '',
      current_position: user.current_position || '',
      expected_salary: user.expected_salary || '',
      expected_location: user.expected_location || '',
      skills: user.skills || '',
      self_introduction: user.self_introduction || ''
    },
    remarks: remarksMap,
    applications,
    action_logs: logsRes.data || [],
    owners: ownerRes.data || []
  });
}

async function handleClaim(event) {
  const { candidate_id } = event;
  const owner = getLoggedUser(event);
  if (!candidate_id) return error(400, '缺少候选人ID');
  if (!owner.id) return error(400, '缺少领取人信息');
  const candidate = await claimCandidate(candidate_id, {
    owner_id: owner.id,
    owner_name: owner.name,
    owner_role: owner.role || 'hr'
  });
  return success(candidate, '领取成功');
}

async function handleMoveToPublic(event) {
  const { candidate_id, reason = 'manual_release' } = event;
  if (!candidate_id) return error(400, '缺少候选人ID');
  const operator = getLoggedUser(event);
  await moveCandidateToPublic(candidate_id, {
    reason,
    bindReason: reason === 'timeout' ? 'system_recycle' : 'manual_release',
    operator_id: operator.id,
    operator_name: operator.name,
    operator_role: operator.role || 'hr'
  });
  return success(null, '候选人已回收到公海');
}

async function handleRecordAction(event) {
  const { candidate_id, action_type, remark = '', related_job_id = '', related_company_id = '', related_application_id = '', related_interview_id = '' } = event;
  if (!candidate_id || !action_type) return error(400, '缺少必要参数');

  const operator = getLoggedUser(event);
  await recordCandidateAction({
    candidate_id,
    action_type,
    operator_id: operator.id,
    operator_name: operator.name,
    operator_role: operator.role || 'hr',
    related_job_id,
    related_company_id,
    related_application_id,
    related_interview_id,
    remark
  });

  return success({ candidate_id, action_type, recorded_at: toDateTimeStr(Date.now()) }, '动作记录成功');
}

async function bindScanReferral(event) {
  const { candidate_id = '', recommender_id = '', recommender_name = '', token, code = '' } = event;
  let currentCandidateId = candidate_id;
  let resolvedRecommenderId = recommender_id;
  let resolvedRecommenderName = recommender_name;
  let resolvedJobId = event.job_id || '';

  if (!currentCandidateId && token) {
    const tokenRes = await db.collection('login_tokens')
      .where({ token, status: 'logged', expire_time: db.command.gt(Date.now()) })
      .limit(1)
      .get();
    currentCandidateId = tokenRes.data && tokenRes.data.length ? tokenRes.data[0].user_id : '';
  }

  if (!currentCandidateId) return error(400, '缺少候选人ID');

  if ((!resolvedRecommenderId || !resolvedRecommenderName || !resolvedJobId) && code) {
    try {
      const qrRes = await db.collection('qr_codes')
        .where({ code, status: 'active' })
        .orderBy('created_at', 'desc')
        .limit(1)
        .get();

      if (qrRes.data && qrRes.data.length > 0) {
        const qr = qrRes.data[0];
        if (!resolvedRecommenderId) resolvedRecommenderId = qr.recommender_id || qr.creator_id || '';
        if (!resolvedRecommenderName) resolvedRecommenderName = qr.recommender_name || qr.creator_name || '';
        if (!resolvedJobId) resolvedJobId = qr.job_id || '';
      }
    } catch (err) {
      console.warn('根据扫码码值反查推荐人失败:', err);
    }
  }

  const user = await ensureCandidateProfile(currentCandidateId, {
    recommender_id: resolvedRecommenderId,
    recommender_name: resolvedRecommenderName,
    bind_reason: 'scan_register'
  });

  if (resolvedRecommenderId) {
    await recordCandidateAction({
      candidate_id: currentCandidateId,
      action_type: 'scan_bind',
      operator_id: resolvedRecommenderId,
      operator_name: resolvedRecommenderName,
      operator_role: 'referrer',
      related_job_id: resolvedJobId,
      remark: `扫码绑定推荐人${resolvedRecommenderName || ''}`.trim()
    });
  }

  return success({
    candidate_id: currentCandidateId,
    owner_type: user?.candidate_owner_type || 'public',
    owner_name: user?.candidate_owner_name || ''
  }, resolvedRecommenderId ? '已绑定推荐人' : '候选人已进入公海');
}

function normalizePhone(value) {
  return String(value || '').replace(/\D/g, '');
}

async function handleImport(event) {
  const { scope = 'mine', owner_id = '', owner_name = '', owner_role = 'hr', candidates = [] } = event;
  
  if (!Array.isArray(candidates) || candidates.length === 0) {
    return error(400, '导入数据不能为空');
  }

  const cmd = db.command;
  const now = Date.now();
  const nowStr = toDateTimeStr(now);
  const nowTs = now;

  const existingPhones = new Set(
    candidates.map(item => normalizePhone(item.phone)).filter(Boolean)
  );

  const existingUsersMap = new Map();
  for (const phoneBatch of chunkArray([...existingPhones])) {
    const users = await fetchAllByWhere('users', cmd.or(
      { phone: cmd.in(phoneBatch) },
      { account_phone: cmd.in(phoneBatch) }
    ));

    for (const user of users) {
      const phone = normalizePhone(user.phone || user.account_phone || '');
      existingUsersMap.set(phone, user);
    }
  }

  const ownerType = scope === 'mine' ? 'hr' : 'public';
  const ownerId = scope === 'mine' ? owner_id : '';
  const expireAt = scope === 'mine' ? toDateTimeStr(now + 30 * 24 * 60 * 60 * 1000) : '';
  const expireAtTs = scope === 'mine' ? now + 30 * 24 * 60 * 60 * 1000 : 0;

  const results = {
    created: 0,
    updated: 0,
    skipped: 0,
    errors: []
  };

  for (let i = 0; i < candidates.length; i++) {
    const item = candidates[i];
    const phone = normalizePhone(item.phone);
    
    if (!phone) {
      results.errors.push({
        row_no: i + 1,
        phone: item.phone || '',
        name: item.name || '',
        reason: '手机号为空'
      });
      continue;
    }

    const existingUser = existingUsersMap.get(phone);

    if (existingUser) {
      results.skipped++;
      continue;
    } else {
      try {
        const displayName = item.name || `候选人${phone.slice(-4)}`;
        const newUserId = await db.collection('users').add({
          data: {
            phone,
            account_phone: phone,
            real_name: item.name || '',
            name: displayName,
            role: 'candidate',
            user_type: 'candidate',
            status: 'active',
            gender: item.gender,
            education: item.education || '',
            candidate_owner_type: ownerType,
            candidate_owner_id: ownerId,
            candidate_owner_name: owner_name,
            candidate_owner_bind_at: nowStr,
            candidate_owner_bind_at_ts: nowTs,
            candidate_owner_expire_at: expireAt,
            candidate_owner_expire_at_ts: expireAtTs,
            candidate_last_action_at: nowStr,
            candidate_last_action_at_ts: nowTs,
            candidate_last_action_type: 'import',
            create_time: nowStr,
            update_time: nowStr
          }
        });

        existingUsersMap.set(phone, { _id: newUserId._id });
        results.created++;
      } catch (err) {
        results.errors.push({
          row_no: i + 1,
          phone: item.phone,
          name: item.name || '',
          reason: err.message || '创建失败'
        });
      }
    }
  }

  return success({
    created: results.created,
    updated: results.updated,
    skipped: results.skipped,
    errors: results.errors.slice(0, 50),
    total_errors: results.errors.length
  }, `导入完成：新增 ${results.created} 条，更新 ${results.updated} 条，跳过 ${results.skipped} 条`);
}

const REMARK_CATEGORIES = ['skill', 'residence_area', 'target_area', 'shift_demand'];

async function getRemarks(event) {
  const { candidate_id } = event;
  if (!candidate_id) return error(400, '缺少候选人ID');

  const remarksRes = await db.collection('candidate_remarks')
    .where({ candidate_id })
    .orderBy('created_at', 'desc')
    .get();

  const remarksMap = {};
  for (const item of remarksRes.data || []) {
    const category = item.category || 'other';
    if (!remarksMap[category]) remarksMap[category] = [];
    remarksMap[category].push(item);
  }

  return success(remarksMap);
}

async function saveRemark(event) {
  const { candidate_id, category, content, remark_id } = event;
  if (!candidate_id) return error(400, '缺少候选人ID');
  if (!REMARK_CATEGORIES.includes(category)) return error(400, '无效的备注分类');

  const operator = getLoggedUser(event);
  const now = Date.now();
  const nowStr = toDateTimeStr(now);

  if (remark_id) {
    const existingRes = await db.collection('candidate_remarks').doc(remark_id).get();
    if (!existingRes.data) return error(404, '备注不存在');

    await db.collection('candidate_remarks').doc(remark_id).update({
      data: {
        content,
        updated_by: operator.id,
        updated_by_name: operator.name,
        updated_at: nowStr,
        updated_at_ts: now
      }
    });

    await recordCandidateAction({
      candidate_id,
      action_type: 'remark_update',
      operator_id: operator.id,
      operator_name: operator.name,
      operator_role: operator.role || 'hr',
      remark: `[${getCategoryText(category)}] ${content}`
    });

    return success({ remark_id, updated_at: nowStr }, '备注已更新');
  } else {
    if (!content || !content.trim()) return error(400, '备注内容不能为空');

    const addRes = await db.collection('candidate_remarks').add({
      data: {
        candidate_id,
        category,
        content: content.trim(),
        created_by: operator.id,
        created_by_name: operator.name,
        created_at: nowStr,
        created_at_ts: now,
        updated_by: operator.id,
        updated_by_name: operator.name,
        updated_at: nowStr,
        updated_at_ts: now
      }
    });

    await recordCandidateAction({
      candidate_id,
      action_type: 'remark_create',
      operator_id: operator.id,
      operator_name: operator.name,
      operator_role: operator.role || 'hr',
      remark: `[${getCategoryText(category)}] ${content.trim()}`
    });

    return success({ remark_id: addRes._id, created_at: nowStr }, '备注已保存');
  }
}

function getCategoryText(category) {
  const map = {
    skill: '技能',
    residence_area: '住所地区',
    target_area: '意向地区',
    shift_demand: '班次诉求'
  };
  return map[category] || category;
}
