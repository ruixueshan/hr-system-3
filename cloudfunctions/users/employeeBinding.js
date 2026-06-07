const cloud = require('wx-server-sdk');

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

function normalizeText(value) {
  return String(value || '').trim();
}

function normalizeName(value) {
  return normalizeText(value).replace(/\s+/g, '');
}

function normalizePhone(value) {
  return normalizeText(value).replace(/\D+/g, '');
}

function normalizeIdCard(value) {
  return normalizeText(value).toUpperCase();
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

function isPlaceholderName(value) {
  return /^候选人\d{4}$/.test(normalizeText(value));
}

function getUserMatchName(user) {
  const realName = normalizeName(user.real_name);
  if (realName) return realName;
  const name = normalizeName(user.name);
  return isPlaceholderName(name) ? '' : name;
}

async function getUser(db, userOrId) {
  if (!userOrId) return null;
  if (typeof userOrId === 'object' && userOrId._id) return userOrId;
  const res = await db.collection('users').doc(userOrId).get();
  return res.data || null;
}

async function getEmployeeById(db, employeeId) {
  if (!employeeId) return null;
  const res = await db.collection('employees').doc(employeeId).get();
  const employee = res.data || null;
  if (employee?.merged_into_employee_id) {
    return getEmployeeById(db, employee.merged_into_employee_id);
  }
  return employee;
}

async function getEmployeeByUserId(db, userId) {
  const res = await db.collection('employees').where({ user_id: userId }).limit(10).get();
  return pickPreferredEmployee(res.data || []);
}

async function bindEmployeeAndUser(db, user, employee) {
  if (!user || !employee) return { status: 'none' };
  if (employee.user_id && employee.user_id !== user._id) {
    return { status: 'conflict', reason: 'employee_bound' };
  }

  const existingEmployee = await getEmployeeByUserId(db, user._id);
  if (existingEmployee && existingEmployee._id !== employee._id) {
    return { status: 'conflict', reason: 'user_bound' };
  }

  if (user.employee_id && user.employee_id !== employee._id) {
    return { status: 'conflict', reason: 'user_employee_mismatch' };
  }

  const now = db.serverDate();
  const userType = normalizeText(user.user_type);
  const userUpdate = {
    employee_id: employee._id,
    employee_no: employee.employee_no || '',
    user_type: (!userType || ['candidate', 'employee'].includes(userType)) ? 'employee' : user.user_type,
    updated_at: now,
    update_time: now
  };

  if (!normalizeName(user.real_name) && normalizeName(employee.name)) {
    userUpdate.real_name = employee.name;
  }
  if (isPlaceholderName(user.name) && normalizeName(employee.name)) {
    userUpdate.name = employee.name;
  }
  const employeeUpdate = {
    user_id: user._id,
    updated_at: now
  };

  await Promise.all([
    db.collection('users').doc(user._id).update({ data: userUpdate }),
    db.collection('employees').doc(employee._id).update({ data: employeeUpdate })
  ]);

  return { status: 'bound', employee_id: employee._id, user_id: user._id };
}

async function findMatchedEmployee(db, user) {
  if (!user) return { status: 'none' };

  if (user.employee_id) {
    const employee = await getEmployeeById(db, user.employee_id);
    if (employee) return { status: 'matched', employee, rule: 'employee_id' };
  }

  const boundEmployee = await getEmployeeByUserId(db, user._id);
  if (boundEmployee) return { status: 'matched', employee: boundEmployee, rule: 'user_id' };

  const name = getUserMatchName(user);
  const idCard = normalizeIdCard(user.id_card);
  if (idCard && name) {
    const res = await db.collection('employees').where({ id_card: idCard }).get();
    const matches = (res.data || [])
      .filter((item) => !normalizeText(item.merged_into_employee_id));
    const nameMatches = matches.filter((item) => normalizeName(item.name) === name);
    if (nameMatches.length === 1) return { status: 'matched', employee: nameMatches[0], rule: 'id_card_name' };
    if (nameMatches.length > 1) return { status: 'ambiguous', employees: nameMatches, rule: 'id_card_name' };
    if (matches.length > 0) return { status: 'conflict', employees: matches, rule: 'id_card_name_conflict' };
  }

  const phone = normalizePhone(user.phone || user.account_phone);
  if (phone && name) {
    const res = await db.collection('employees').where({ phone }).get();
    const matches = (res.data || []).filter((item) => (
      normalizeName(item.name) === name
      && !normalizeText(item.merged_into_employee_id)
    ));
    if (matches.length === 1) return { status: 'matched', employee: matches[0], rule: 'phone_name' };
    if (matches.length > 1) return { status: 'ambiguous', employees: matches, rule: 'phone_name' };
  }

  return { status: 'none' };
}

async function ensureUserEmployeeBinding(db, userOrId) {
  const user = await getUser(db, userOrId);
  if (!user) return { status: 'missing_user' };

  const matched = await findMatchedEmployee(db, user);
  if (matched.status !== 'matched') return matched;

  return bindEmployeeAndUser(db, user, matched.employee);
}

module.exports = {
  ensureUserEmployeeBinding
};
