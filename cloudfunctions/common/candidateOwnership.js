const cloud = require('wx-server-sdk');

let db;

function getDb() {
  if (!db) {
    cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
    db = cloud.database();
  }
  return db;
}

function toDate(value) {
  if (!value) return null;
  if (value instanceof Date) return value;
  if (typeof value === 'number') {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
  }
  if (typeof value === 'string') {
    const match = value.match(/^(\d{4}-\d{2}-\d{2})(?:[ T](\d{2}:\d{2}:\d{2}))?/);
    if (match) {
      const date = new Date(match[2] ? `${match[1]}T${match[2]}+08:00` : `${match[1]}T00:00:00+08:00`);
      return Number.isNaN(date.getTime()) ? null : date;
    }
  }
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function toTimestamp(value) {
  const date = toDate(value);
  return date ? date.getTime() : 0;
}

function toDateTimeStr(value) {
  const date = toDate(value) || new Date();
  const formatter = new Intl.DateTimeFormat('zh-CN', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
    hour12: false
  });
  const parts = formatter.formatToParts(date);
  const get = type => parts.find(p => p.type === type).value;
  return `${get('year')}-${get('month')}-${get('day')} ${get('hour')}:${get('minute')}:${get('second')}`;
}

function toDateStr(value) {
  return toDateTimeStr(value).slice(0, 10);
}

function getNowTs() {
  return Date.now();
}

function getExpireTs(baseTs = getNowTs(), days = 7) {
  return baseTs + days * 24 * 60 * 60 * 1000;
}

async function getUserById(candidateId) {
  const db = getDb();
  const res = await db.collection('users').doc(candidateId).get();
  return res.data || null;
}

async function getActiveOwnerRecord(candidateId) {
  const db = getDb();
  const res = await db.collection('candidate_owners')
    .where({
      candidate_id: candidateId,
      status: 'active'
    })
    .orderBy('bind_at_ts', 'desc')
    .limit(1)
    .get();

  return res.data && res.data.length ? res.data[0] : null;
}

async function closeActiveOwner(candidateId, releasedReason, options = {}) {
  const db = getDb();
  const activeOwner = await getActiveOwnerRecord(candidateId);
  if (!activeOwner) return null;

  const nowTs = options.nowTs || getNowTs();
  await db.collection('candidate_owners').doc(activeOwner._id).update({
    data: {
      status: releasedReason === 'timeout' ? 'expired' : 'released',
      released_reason: releasedReason,
      released_at: db.serverDate(),
      released_at_ts: nowTs,
      updated_at: db.serverDate()
    }
  });

  return activeOwner;
}

async function updateUserOwnership(candidateId, payload) {
  const db = getDb();
  await db.collection('users').doc(candidateId).update({
    data: {
      ...payload,
      updated_at: db.serverDate(),
      update_time: db.serverDate()
    }
  });
}

async function createOwnerRecord(candidateId, owner, options = {}) {
  const db = getDb();
  const nowTs = options.nowTs || getNowTs();
  const lastActionTs = options.lastActionTs || nowTs;
  const expireAtTs = options.expireAtTs || getExpireTs(lastActionTs);

  const data = {
    candidate_id: candidateId,
    owner_type: owner.owner_type,
    owner_id: owner.owner_id || '',
    owner_name: owner.owner_name || '',
    status: 'active',
    bind_reason: owner.bind_reason || '',
    bind_at: db.serverDate(),
    bind_at_ts: nowTs,
    last_action_at: db.serverDate(),
    last_action_at_ts: lastActionTs,
    expire_at: toDateTimeStr(expireAtTs),
    expire_at_ts: expireAtTs,
    released_reason: '',
    created_at: db.serverDate(),
    updated_at: db.serverDate()
  };

  if (owner.source_referrer_id !== undefined) data.source_referrer_id = owner.source_referrer_id || '';
  if (owner.source_referrer_name !== undefined) data.source_referrer_name = owner.source_referrer_name || '';

  const res = await db.collection('candidate_owners').add({ data });
  return { _id: res.id, ...data };
}

async function recordCandidateAction(payload) {
  const db = getDb();
  const nowTs = payload.created_at_ts || getNowTs();
  const candidateId = payload.candidate_id;
  const activeOwner = candidateId ? await getActiveOwnerRecord(candidateId) : null;

  const data = {
    candidate_id: candidateId,
    action_type: payload.action_type,
    operator_id: payload.operator_id || '',
    operator_name: payload.operator_name || '',
    operator_role: payload.operator_role || '',
    related_job_id: payload.related_job_id || '',
    related_company_id: payload.related_company_id || '',
    related_application_id: payload.related_application_id || '',
    related_interview_id: payload.related_interview_id || '',
    related_employee_id: payload.related_employee_id || '',
    remark: payload.remark || '',
    owner_type: activeOwner?.owner_type || '',
    owner_id: activeOwner?.owner_id || '',
    owner_name: activeOwner?.owner_name || '',
    created_at: db.serverDate(),
    created_at_ts: nowTs,
    updated_at: db.serverDate()
  };

  await db.collection('candidate_action_logs').add({ data });

  if (!candidateId) return;

  const shouldRefresh = payload.refresh_owner !== false;
  if (!shouldRefresh) return;

  const nextExpireTs = getExpireTs(nowTs);

  await updateUserOwnership(candidateId, {
    candidate_last_action_at: toDateTimeStr(nowTs),
    candidate_last_action_at_ts: nowTs,
    candidate_last_action_type: payload.action_type,
    ...(activeOwner && activeOwner.owner_type !== 'public'
      ? { candidate_owner_expire_at: toDateTimeStr(nextExpireTs), candidate_owner_expire_at_ts: nextExpireTs }
      : {})
  });

  if (activeOwner && activeOwner.owner_type !== 'public') {
    await db.collection('candidate_owners').doc(activeOwner._id).update({
      data: {
        last_action_at: db.serverDate(),
        last_action_at_ts: nowTs,
        expire_at: toDateTimeStr(nextExpireTs),
        expire_at_ts: nextExpireTs,
        updated_at: db.serverDate()
      }
    });
  }
}

async function bindOwner(candidateId, owner, options = {}) {
  const db = getDb();
  const nowTs = options.nowTs || getNowTs();
  const currentUser = options.user || await getUserById(candidateId);
  const activeOwner = options.activeOwner || await getActiveOwnerRecord(candidateId);
  const expireAtTs = owner.owner_type === 'public' ? 0 : getExpireTs(nowTs);

  const isSameOwner = activeOwner
    && activeOwner.owner_type === owner.owner_type
    && String(activeOwner.owner_id || '') === String(owner.owner_id || '');

  if (activeOwner && !isSameOwner) {
    await closeActiveOwner(candidateId, options.releaseReason || 'rebind', { nowTs });
  }

  if (isSameOwner) {
    await db.collection('candidate_owners').doc(activeOwner._id).update({
      data: {
        owner_name: owner.owner_name || activeOwner.owner_name || '',
        bind_reason: owner.bind_reason || activeOwner.bind_reason || '',
        last_action_at: db.serverDate(),
        last_action_at_ts: nowTs,
        ...(owner.owner_type === 'public'
          ? { expire_at: '', expire_at_ts: 0 }
          : { expire_at: toDateTimeStr(expireAtTs), expire_at_ts: expireAtTs }),
        updated_at: db.serverDate()
      }
    });
  } else {
    await createOwnerRecord(candidateId, owner, {
      nowTs,
      lastActionTs: nowTs,
      expireAtTs: owner.owner_type === 'public' ? 0 : expireAtTs
    });
  }

  const nextUserPayload = {
    candidate_pool_status: owner.owner_type === 'public' ? 'public' : 'owned',
    candidate_owner_type: owner.owner_type,
    candidate_owner_id: owner.owner_id || '',
    candidate_owner_name: owner.owner_name || '',
    candidate_owner_bind_at: toDateTimeStr(nowTs),
    candidate_owner_bind_at_ts: nowTs,
    candidate_last_action_at: toDateTimeStr(nowTs),
    candidate_last_action_at_ts: nowTs,
    candidate_last_action_type: owner.bind_reason || 'bind',
    candidate_owner_expire_at: owner.owner_type === 'public' ? '' : toDateTimeStr(expireAtTs),
    candidate_owner_expire_at_ts: owner.owner_type === 'public' ? 0 : expireAtTs,
    candidate_public_pool_at: owner.owner_type === 'public' ? toDateTimeStr(nowTs) : '',
    candidate_public_pool_at_ts: owner.owner_type === 'public' ? nowTs : 0
  };

  if (owner.source_referrer_id !== undefined) {
    nextUserPayload.source_referrer_id = owner.source_referrer_id || '';
    nextUserPayload.referrer_id = owner.source_referrer_id || currentUser?.referrer_id || '';
  }
  if (owner.source_referrer_name !== undefined) {
    nextUserPayload.source_referrer_name = owner.source_referrer_name || '';
    nextUserPayload.referrer_name = owner.source_referrer_name || currentUser?.referrer_name || '';
  }

  await updateUserOwnership(candidateId, nextUserPayload);
}

async function moveCandidateToPublic(candidateId, options = {}) {
  const nowTs = options.nowTs || getNowTs();
  await closeActiveOwner(candidateId, options.reason || 'manual_release', { nowTs });
  await bindOwner(candidateId, {
    owner_type: 'public',
    owner_id: '',
    owner_name: '',
    bind_reason: options.bindReason || 'public_pool',
    source_referrer_id: options.source_referrer_id,
    source_referrer_name: options.source_referrer_name
  }, { nowTs });

  if (options.logAction !== false) {
    await recordCandidateAction({
      candidate_id: candidateId,
      action_type: 'public_pool',
      operator_id: options.operator_id || '',
      operator_name: options.operator_name || '',
      operator_role: options.operator_role || '',
      remark: options.reason || '进入公海',
      refresh_owner: false,
      created_at_ts: nowTs
    });
  }
}

async function ensureCandidateProfile(candidateId, options = {}) {
  const user = options.user || await getUserById(candidateId);
  if (!user) return null;

  const currentOwnerType = user.candidate_owner_type || '';
  const hasOwner = Boolean(user.candidate_pool_status || currentOwnerType);

  if (options.recommender_id) {
    if (!hasOwner || currentOwnerType === 'public' || String(user.candidate_owner_id || '') === String(options.recommender_id)) {
      await bindOwner(candidateId, {
        owner_type: 'referrer',
        owner_id: options.recommender_id,
        owner_name: options.recommender_name || '',
        bind_reason: options.bind_reason || 'scan_register',
        source_referrer_id: options.recommender_id,
        source_referrer_name: options.recommender_name || ''
      }, { user });
    }
    return getUserById(candidateId);
  }

  if (!hasOwner) {
    await bindOwner(candidateId, {
      owner_type: 'public',
      owner_id: '',
      owner_name: '',
      bind_reason: options.bind_reason || 'register'
    }, { user });
  }

  return getUserById(candidateId);
}

async function claimCandidate(candidateId, options = {}) {
  const user = await getUserById(candidateId);
  if (!user) {
    throw new Error('候选人不存在');
  }

  const currentOwnerType = user.candidate_owner_type || '';
  const currentOwnerId = String(user.candidate_owner_id || '');
  const ownerId = String(options.owner_id || '');

  if (currentOwnerType && currentOwnerType !== 'public' && currentOwnerId && currentOwnerId !== ownerId) {
    throw new Error('候选人已被其他跟进人领取');
  }

  await bindOwner(candidateId, {
    owner_type: 'hr',
    owner_id: ownerId,
    owner_name: options.owner_name || '',
    bind_reason: options.bind_reason || 'manual_claim',
    source_referrer_id: user.source_referrer_id || user.referrer_id || '',
    source_referrer_name: user.source_referrer_name || user.referrer_name || ''
  }, { user });

  await recordCandidateAction({
    candidate_id: candidateId,
    action_type: 'claim',
    operator_id: ownerId,
    operator_name: options.owner_name || '',
    operator_role: options.operator_role || 'hr',
    remark: options.remark || '从公海领取',
    refresh_owner: false
  });

  return getUserById(candidateId);
}

async function recycleExpiredCandidates() {
  const db = getDb();
  const nowTs = getNowTs();
  const userRes = await db.collection('users')
    .where({ user_type: 'candidate' })
    .limit(500)
    .get();

  const expiredCandidates = (userRes.data || []).filter(item => (
    item.candidate_owner_type
    && item.candidate_owner_type !== 'public'
    && Number(item.candidate_owner_expire_at_ts || 0) > 0
    && Number(item.candidate_owner_expire_at_ts || 0) < nowTs
  ));

  for (const candidate of expiredCandidates) {
    await moveCandidateToPublic(candidate._id, {
      reason: 'timeout',
      bindReason: 'system_recycle',
      logAction: true,
      operator_id: 'system',
      operator_name: '系统',
      operator_role: 'system',
      nowTs,
      source_referrer_id: candidate.source_referrer_id || candidate.referrer_id || '',
      source_referrer_name: candidate.source_referrer_name || candidate.referrer_name || ''
    });
  }

  return {
    recycled: expiredCandidates.length,
    candidate_ids: expiredCandidates.map(item => item._id),
    run_at: toDateTimeStr(nowTs)
  };
}

module.exports = {
  getDb,
  getUserById,
  toDateStr,
  toDateTimeStr,
  toTimestamp,
  getNowTs,
  getExpireTs,
  getActiveOwnerRecord,
  ensureCandidateProfile,
  bindOwner,
  moveCandidateToPublic,
  claimCandidate,
  recordCandidateAction,
  recycleExpiredCandidates
};
