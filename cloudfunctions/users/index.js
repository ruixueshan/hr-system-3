/**
 * 用户管理云函数
 * 获取用户信息、更新用户资料等
 */
const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();
const { ensureUserEmployeeBinding } = require('./employeeBinding');

function normalizeText(value) {
  return String(value || '').trim();
}

function normalizeName(value) {
  return normalizeText(value).replace(/\s+/g, '');
}

function normalizeBankAccount(value) {
  return String(value || '').replace(/\s+/g, '');
}

function normalizeIdCard(value) {
  return normalizeText(value).toUpperCase();
}

function normalizePhone(value) {
  return normalizeText(value).replace(/\D+/g, '');
}

function hasOwn(obj, key) {
  return Object.prototype.hasOwnProperty.call(obj || {}, key);
}

function getAddResultId(result) {
  return String(result?._id || result?.id || result?.ids?.[0] || '');
}

function buildEmployeeProfilePatch(data = {}) {
  const patch = {};
  if (hasOwn(data, 'real_name')) patch.name = normalizeText(data.real_name);
  if (hasOwn(data, 'phone')) patch.phone = normalizePhone(data.phone);
  if (hasOwn(data, 'id_card')) patch.id_card = normalizeText(data.id_card).toUpperCase();
  if (hasOwn(data, 'gender')) patch.gender = data.gender;
  if (hasOwn(data, 'birth_date')) patch.birth_date = normalizeText(data.birth_date);
  if (hasOwn(data, 'bank_name')) patch.bank_name = normalizeText(data.bank_name);
  if (hasOwn(data, 'bank_account')) {
    patch.bank_account = normalizeBankAccount(data.bank_account);
    patch.bank_card_last4 = patch.bank_account ? patch.bank_account.slice(-4) : '';
  }
  if (hasOwn(data, 'bank_account_name')) patch.bank_account_name = normalizeText(data.bank_account_name);
  if (hasOwn(data, 'salary_payment_method')) {
    const method = normalizeText(data.salary_payment_method).toUpperCase();
    patch.salary_payment_method = method === 'WECHAT' ? 'WECHAT' : 'BANK';
  }
  if (hasOwn(data, 'wechat_receiver_name')) patch.wechat_receiver_name = normalizeText(data.wechat_receiver_name);
  if (hasOwn(data, 'wechat_receiver_id_card')) patch.wechat_receiver_id_card = normalizeIdCard(data.wechat_receiver_id_card);
  if (hasOwn(data, 'wechat_transfer_authorized')) patch.wechat_transfer_authorized = Boolean(data.wechat_transfer_authorized);
  if (hasOwn(data, 'wechat_transfer_authorized_at')) patch.wechat_transfer_authorized_at = data.wechat_transfer_authorized_at || '';
  return patch;
}

function buildUserProfilePatch(data = {}) {
  const patch = {};
  const snapshotFields = [
    'education', 'work_years', 'current_company', 'current_position',
    'expected_salary', 'expected_location', 'skills', 'self_introduction',
    'position', 'avatar'
  ];

  for (const field of snapshotFields) {
    if (hasOwn(data, field)) patch[field] = data[field];
  }

  if (hasOwn(data, 'real_name')) {
    const realName = normalizeText(data.real_name);
    patch.real_name = realName;
    patch.name = realName;
  }
  if (hasOwn(data, 'phone')) {
    const phone = normalizePhone(data.phone);
    patch.phone = phone;
    patch.account_phone = phone;
  }

  return patch;
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

async function generateUniqueEmployeeNo(db) {
  for (let i = 0; i < 10; i += 1) {
    const employeeNo = generateEmployeeNo();
    const existing = await db.collection('employees').where({ employee_no: employeeNo }).limit(1).get();
    if (!existing.data?.length) return employeeNo;
  }
  return `EP${Date.now()}`;
}

async function verifyToken(db, token) {
  const normalizedToken = normalizeText(token);
  if (!normalizedToken) return null;

  const tokenRes = await db.collection('login_tokens')
    .where({
      token: normalizedToken,
      status: 'logged',
      expire_time: db.command.gt(Date.now())
    })
    .limit(1)
    .get();

  const tokenRecord = tokenRes.data?.[0];
  if (!tokenRecord?.user_id) return null;

  const userRes = await db.collection('users').doc(tokenRecord.user_id).get();
  return userRes.data || null;
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

function pickPreferredUser(list = []) {
  const candidates = (Array.isArray(list) ? list : []).filter(Boolean);
  if (!candidates.length) return null;

  const score = (item) => {
    const status = normalizeText(item.status).toLowerCase();
    const userType = normalizeText(item.user_type).toLowerCase();
    const merged = normalizeText(item.merged_into_user_id);
    const activeScore = !status || status === 'active' ? 100 : 0;
    const employeeScore = userType === 'employee' ? 300 : 0;
    const employeeIdScore = normalizeText(item.employee_id) ? 200 : 0;
    const mergedScore = merged ? -1000 : 0;
    const updatedAt = new Date(item.updated_at || item.update_time || item.created_at || item.create_time || 0).getTime() || 0;
    return activeScore + employeeScore + employeeIdScore + mergedScore + updatedAt / 1e13;
  };

  return [...candidates].sort((a, b) => score(b) - score(a))[0];
}

async function resolveUserByOpenid(db, openid) {
  const normalizedOpenid = normalizeText(openid);
  if (!normalizedOpenid) return null;
  const result = await db.collection('users')
    .where({ openid: normalizedOpenid })
    .limit(20)
    .get();
  if ((result.data || []).length > 1) {
    console.warn('resolveUserByOpenid: 同一 OPENID 命中多个用户，已按员工账号优先选择', {
      openid: normalizedOpenid,
      userIds: (result.data || []).map((item) => item._id)
    });
  }
  return pickPreferredUser(result.data || []);
}

function pickPreferredRelation(list = []) {
  const candidates = (Array.isArray(list) ? list : []).filter(Boolean);
  if (!candidates.length) return null;

  const score = (item) => {
    const status = normalizeText(item.status).toLowerCase();
    const activeScore = ['active', 'regular', 'probation'].includes(status) ? 100 : 0;
    const updatedAt = new Date(item.updated_at || item.created_at || item.join_date || 0).getTime() || 0;
    return activeScore + updatedAt / 1e13;
  };

  return [...candidates].sort((a, b) => score(b) - score(a))[0];
}

function dedupeCompanyRelations(list = []) {
  const relationMap = new Map();
  (Array.isArray(list) ? list : []).forEach((item) => {
    if (!item?.company_id) return;
    const existing = relationMap.get(item.company_id);
    if (!existing) {
      relationMap.set(item.company_id, item);
      return;
    }

    relationMap.set(item.company_id, pickPreferredRelation([existing, item]));
  });
  return [...relationMap.values()];
}

async function resolveCurrentEmployee(db, user) {
  if (!user?._id) return null;

  if (user.employee_id) {
    try {
      const byIdRes = await db.collection('employees').doc(user.employee_id).get();
      const byId = byIdRes.data || null;
      if (byId && !byId.merged_into_employee_id) return byId;
    } catch (err) {
      console.warn('resolveCurrentEmployee 通过 user.employee_id 查询失败', err?.message);
    }
  }

  const byUserIdRes = await db.collection('employees')
    .where({ user_id: user._id })
    .limit(10)
    .get();
  const byUserId = pickPreferredEmployee(byUserIdRes.data || []);
  if (byUserId) return byUserId;

  return null;
}

function pickEffectiveTransferAuthorization(list = []) {
  const candidates = (Array.isArray(list) ? list : [])
    .filter((item) => normalizeText(item.status) === 'TAKING_EFFECT');
  if (!candidates.length) return null;

  const getTime = (item) => new Date(
    item.response_snapshot?.authorize_time
    || item.updated_at
    || item.created_at
    || 0
  ).getTime() || 0;

  return [...candidates].sort((a, b) => getTime(b) - getTime(a))[0];
}

async function getEffectiveTransferAuthorization(db, { user, employee } = {}) {
  const queries = [];
  if (employee?._id) queries.push({ employee_id: employee._id });
  if (user?._id) queries.push({ user_id: user._id });
  if (user?.openid) queries.push({ openid: user.openid });

  const all = [];
  for (const query of queries) {
    const res = await db.collection('wxpay_transfer_authorizations')
      .where({ ...query, status: 'TAKING_EFFECT' })
      .limit(10)
      .get()
      .catch((err) => {
        console.warn('getEffectiveTransferAuthorization: 查询授权状态失败', query, err?.message);
        return { data: [] };
      });
    all.push(...(res.data || []));
  }

  const deduped = Array.from(new Map(all.map((item) => [item._id, item])).values());
  return pickEffectiveTransferAuthorization(deduped);
}

async function syncEmployeeAuthorizationSnapshot(db, employee, authorization) {
  if (!employee?._id || !authorization) return employee;

  const authorizedAt = authorization.response_snapshot?.authorize_time || authorization.updated_at || '';
  const patch = {
    wechat_transfer_authorized: true,
    updated_at: db.serverDate()
  };
  if (authorizedAt) patch.wechat_transfer_authorized_at = authorizedAt;
  if (!normalizeText(employee.wechat_receiver_name) && normalizeText(authorization.user_display_name)) {
    patch.wechat_receiver_name = normalizeText(authorization.user_display_name);
  }

  if (
    employee.wechat_transfer_authorized !== true
    || (authorizedAt && employee.wechat_transfer_authorized_at !== authorizedAt)
    || patch.wechat_receiver_name
  ) {
    await db.collection('employees').doc(employee._id).update({ data: patch }).catch((err) => {
      console.warn('syncEmployeeAuthorizationSnapshot: 回写员工授权快照失败', err?.message);
    });
    return { ...employee, ...patch };
  }

  return employee;
}

async function resolveEmployeeByIdCard(db, idCard) {
  const normalizedIdCard = normalizeIdCard(idCard);
  if (!normalizedIdCard) return { status: 'none', employee: null };

  const res = await db.collection('employees').where({ id_card: normalizedIdCard }).get();
  const matches = (res.data || []).filter((item) => !normalizeText(item.merged_into_employee_id));
  if (matches.length === 1) return { status: 'matched', employee: matches[0] };
  if (matches.length > 1) return { status: 'ambiguous', employee: null };
  return { status: 'none', employee: null };
}

async function resolveEmployeeForAutoBind(db, { idCard = '', phone = '', name = '' } = {}) {
  const normalizedIdCard = normalizeIdCard(idCard);
  const normalizedPhone = normalizePhone(phone);
  const normalizedName = normalizeName(name);

  if (normalizedIdCard && normalizedName) {
    const idCardRes = await db.collection('employees').where({ id_card: normalizedIdCard }).get();
    const idCardMatches = (idCardRes.data || [])
      .filter((item) => !normalizeText(item.merged_into_employee_id));
    const nameMatches = idCardMatches
      .filter((item) => normalizeName(item.name) === normalizedName);
    if (nameMatches.length === 1) return { status: 'matched', employee: nameMatches[0], rule: 'id_card_name' };
    if (nameMatches.length > 1) return { status: 'ambiguous', employee: null, rule: 'id_card_name' };
    if (idCardMatches.length > 0) return { status: 'conflict', employee: null, rule: 'id_card_name' };
  }

  if (normalizedPhone && normalizedName) {
    const phoneRes = await db.collection('employees').where({ phone: normalizedPhone }).get();
    const phoneNameMatches = (phoneRes.data || [])
      .filter((item) => !normalizeText(item.merged_into_employee_id))
      .filter((item) => normalizeName(item.name) === normalizedName);
    if (phoneNameMatches.length === 1) return { status: 'matched', employee: phoneNameMatches[0], rule: 'phone_name' };
    if (phoneNameMatches.length > 1) return { status: 'ambiguous', employee: null, rule: 'phone_name' };
  }

  return { status: 'none', employee: null, rule: '' };
}

async function bindUserAndEmployee(db, user, employee) {
  if (!user?._id || !employee?._id) throw new Error('缺少用户或员工主档');
  if (normalizeText(user.employee_id) && normalizeText(user.employee_id) !== employee._id) {
    throw new Error('当前账号已绑定其他员工主档，请联系管理员处理');
  }
  if (normalizeText(employee.user_id) && normalizeText(employee.user_id) !== user._id) {
    throw new Error('该员工主档已绑定其他账号，请联系管理员处理');
  }

  const now = db.serverDate();
  const userType = normalizeText(user.user_type);
  const userPatch = {
    employee_id: employee._id,
    employee_no: employee.employee_no || '',
    user_type: (!userType || ['candidate', 'employee'].includes(userType)) ? 'employee' : user.user_type,
    updated_at: now,
    update_time: now
  };
  const employeePatch = {
    user_id: user._id,
    updated_at: now
  };

  await Promise.all([
    db.collection('users').doc(user._id).update({ data: userPatch }),
    db.collection('employees').doc(employee._id).update({ data: employeePatch })
  ]);

  return {
    user: { ...user, ...userPatch },
    employee: { ...employee, ...employeePatch }
  };
}

async function resolveOrCreateEmployeeForProfile(db, user, employeePatch) {
  const idCard = normalizeIdCard(employeePatch.id_card);
  if (!idCard) return { employee: null, user, created: false };

  const idCardInfo = parseIdCard(idCard);
  if (!idCardInfo.valid) throw new Error('身份证号格式不正确');

  const matched = await resolveEmployeeForAutoBind(db, {
    idCard,
    phone: employeePatch.phone || user.phone || user.account_phone,
    name: employeePatch.name || user.real_name || user.name
  });
  if (matched.status === 'ambiguous') {
    throw new Error('自动绑定匹配到多个员工主档，请联系管理员处理');
  }
  if (matched.status === 'conflict') {
    throw new Error('身份证号已存在但姓名不一致，请联系管理员核对员工主档');
  }

  let employee = matched.employee;
  if (!employee) {
    const addRes = await db.collection('employees').add({
      data: {
        name: employeePatch.name || user.real_name || user.name || '',
        phone: employeePatch.phone || user.phone || user.account_phone || '',
        id_card: idCard,
        gender: employeePatch.gender ?? idCardInfo.gender,
        birth_date: employeePatch.birth_date || idCardInfo.birth_date,
        employee_no: await generateUniqueEmployeeNo(db),
        status: 'probation',
        source: 'profile',
        user_id: user._id,
        created_at: db.serverDate(),
        updated_at: db.serverDate()
      }
    });
    const employeeId = getAddResultId(addRes);
    if (!employeeId) throw new Error('创建员工主档失败：未返回员工ID');
    const employeeDoc = await db.collection('employees').doc(employeeId).get();
    employee = employeeDoc.data;
  }

  const bound = await bindUserAndEmployee(db, user, employee);
  return {
    employee: bound.employee,
    user: bound.user,
    created: matched.status === 'none'
  };
}

exports.main = async (event, context) => {
  console.log('users云函数被调用，event:', JSON.stringify(event, null, 2));
  const { action, token, tcbContext, userInfo, ...data } = event;
  const wxContext = cloud.getWXContext();
  console.log('wxContext:', {
    OPENID: wxContext.OPENID,
    APPID: wxContext.APPID,
    UNIONID: wxContext.UNIONID,
    ENV: wxContext.ENV
  });

  try {
    switch (action) {
      case 'get-profile':
        return await getProfile(wxContext, db, token, data.minimal);

      case 'update-profile':
        return await updateProfile(wxContext, db, data);

      default:
        return { code: -1, message: `未知操作: ${action}` };
    }
  } catch (err) {
    console.error('Users 错误:', err);
    return { code: 1, message: err.message || '系统错误' };
  }
};

async function getProfile(wxContext, db, token = '', minimal = false) {
  try {
    console.log('getProfile: 开始查询用户信息，openid:', wxContext.OPENID, 'minimal:', minimal);

    const tokenUser = await verifyToken(db, token).catch((err) => {
      console.warn('getProfile: token 解析失败，回退 OPENID', err?.message);
      return null;
    });

    if (!wxContext.OPENID && !tokenUser) {
      console.error('getProfile: OPENID 为空，用户未登录或登录状态失效');
      return { 
        code: 401, 
        message: '用户未登录或登录状态失效，请重新登录' 
      };
    }

    let user = tokenUser;
    if (!user && wxContext.OPENID) {
      user = await resolveUserByOpenid(db, wxContext.OPENID);
    }

    if (!user) {
      console.log('getProfile: 用户不存在');
      return { code: 404, message: '用户不存在' };
    }

    console.log('getProfile: 用户数据:', JSON.stringify(user, null, 2));
    
    const latestUserRes = await db.collection('users').doc(user._id).get();
    const latestUser = latestUserRes.data || user;

    let employee = null;
    employee = await resolveCurrentEmployee(db, latestUser);

    let application_count = 0;
    let total_salary = 0;

    // 完整模式：查询统计数据和薪资
    if (!minimal) {
      try {
        const appCountRes = await db.collection('applications')
          .where({ user_id: user._id })
          .count();
        application_count = appCountRes.total || 0;
      } catch (err) {
        console.warn('getProfile: 报名统计查询失败', err?.message);
      }

      await ensureUserEmployeeBinding(db, user);

      // 再次拉取最新 employee（ensureUserEmployeeBinding 可能新建了记录）
      employee = await resolveCurrentEmployee(db, latestUser);

      if (employee) {
        // 薪资总计 - aggregate sum
        try {
          const $ = db.command.aggregate;
          const salaryAggRes = await db.collection('salaries')
            .aggregate()
            .match({ employee_id: employee._id })
            .group({ _id: null, total: $.sum('$net_pay') })
            .end();
          total_salary = salaryAggRes.list?.[0]?.total || 0;
        } catch (err) {
          console.warn('getProfile: 薪资聚合查询失败', err?.message);
        }
      }
    }

    console.log('getProfile: 结果:', {
      application_count,
      total_salary
    });
    
    return {
      code: 0,
      data: {
        id: user._id,
        name: latestUser.name || '',
        phone: employee?.phone || latestUser.phone || '',
        account_phone: latestUser.phone || '',
        avatar: latestUser.avatar || '',
        role: latestUser.role || 'candidate',
        user_type: latestUser.user_type || 'candidate',
        agent_status: latestUser.agent_status || 'none',
        email: latestUser.email || '',
        created_at: latestUser.created_at,
        real_name: employee?.name || latestUser.real_name || latestUser.name || '',
        gender: (() => { const g = employee?.gender ?? latestUser.gender; if (g === 1 || g === '1' || g === '男') return '男'; if (g === 0 || g === '0' || g === '女') return '女'; return g || ''; })(),
        id_card: employee?.id_card || '',
        birth_date: employee?.birth_date || '',
        bank_name: employee?.bank_name || '',
        bank_account: normalizeBankAccount(employee?.bank_account || ''),
        bank_account_name: employee?.bank_account_name || '',
        salary_payment_method: employee?.salary_payment_method || 'BANK',
        wechat_receiver_name: employee?.wechat_receiver_name || employee?.name || latestUser.real_name || latestUser.name || '',
        wechat_receiver_id_card: employee?.wechat_receiver_id_card || employee?.id_card || '',
        wechat_transfer_authorized: Boolean(employee?.wechat_transfer_authorized),
        wechat_transfer_authorized_at: employee?.wechat_transfer_authorized_at || '',
        position: latestUser.position || '',
        employee_id: employee ? employee._id : '',
        employee_no: employee?.employee_no || latestUser.employee_no || '',
        application_count,
        total_salary
      }
    };
  } catch (err) {
    console.error('getProfile 函数错误:', err);
    return { 
      code: 500, 
      message: `查询用户信息失败: ${err.message || '未知错误'}` 
    };
  }
}

async function updateProfile(wxContext, db, data) {
  console.log('updateProfile: 开始更新用户资料，openid:', wxContext.OPENID, 'data:', JSON.stringify(data, null, 2));

  const userRes = await db.collection('users')
    .where({ openid: wxContext.OPENID })
    .limit(20)
    .get();
  const currentUser = pickPreferredUser(userRes.data || []);
  if (!currentUser) {
    return { code: 404, message: '用户不存在或未登录' };
  }

  let employee = await resolveCurrentEmployee(db, currentUser);
  const employeePatch = buildEmployeeProfilePatch(data);
  const userPatch = buildUserProfilePatch(data);

  let latestUser = currentUser;
  if (!employee && normalizeIdCard(data.id_card)) {
    const resolved = await resolveOrCreateEmployeeForProfile(db, currentUser, employeePatch);
    employee = resolved.employee;
    latestUser = resolved.user || currentUser;
  }

  if (Object.keys(employeePatch).length === 0 && Object.keys(userPatch).length === 0) {
    return { code: 400, message: '没有需要更新的字段' };
  }

  if (employee && employeePatch.id_card) {
    const matched = await resolveEmployeeByIdCard(db, employeePatch.id_card);
    if (matched.status === 'ambiguous') {
      return { code: 400, message: '身份证号匹配到多个员工主档，请联系管理员处理' };
    }
    if (matched.employee && matched.employee._id !== employee._id) {
      return { code: 400, message: '该身份证号已绑定其他员工主档，请联系管理员处理' };
    }
  }

  if (employee) {
    const transferAuthorization = await getEffectiveTransferAuthorization(db, {
      user: latestUser,
      employee
    });
    if (transferAuthorization) {
      employeePatch.wechat_transfer_authorized = true;
      employeePatch.wechat_transfer_authorized_at = transferAuthorization.response_snapshot?.authorize_time
        || employeePatch.wechat_transfer_authorized_at
        || employee.wechat_transfer_authorized_at
        || '';
      if (!employeePatch.wechat_receiver_name && transferAuthorization.user_display_name) {
        employeePatch.wechat_receiver_name = normalizeText(transferAuthorization.user_display_name);
      }
    }
  }

  const tasks = [];
  if (Object.keys(userPatch).length) {
    tasks.push(db.collection('users').doc(latestUser._id).update({
      data: {
        ...userPatch,
        updated_at: db.serverDate()
      }
    }));
  }
  if (employee && Object.keys(employeePatch).length) {
    tasks.push(db.collection('employees').doc(employee._id).update({
      data: {
        ...employeePatch,
        updated_at: db.serverDate()
      }
    }));
  }

  await Promise.all(tasks);

  return {
    code: 0,
    message: employee ? '更新成功，员工主档已同步' : '更新成功'
  };
}
