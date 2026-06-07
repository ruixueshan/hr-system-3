/**
 * 工时管理模块
 * 员工自录入、Excel导入、批量审核
 */
const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

function success(data = null, message = 'success') {
  return { code: 0, message, data };
}

// 调试接口：返回 employees 文档（通过 employee_id 或 phone）
async function debugEmployee(data) {
  const { employee_id, phone } = data;
  try {
    if (employee_id) {
      const doc = await db.collection('employees').doc(employee_id).get();
      return success(doc.data || null);
    }
    if (phone) {
      const res = await db.collection('employees').where({ phone }).limit(1).get();
      return success((res.data && res.data[0]) || null);
    }
    return error(400, '需要 employee_id 或 phone');
  } catch (err) {
    console.error('debugEmployee failed', err);
    return error(500, err.message);
  }
}

function error(code = 1, message = 'error', data = null) {
  return { code, message, data };
}
const db = cloud.database();
const _ = db.command;
const WORKTIME_MANAGE_FALLBACK_ROLES = ['gm', 'deputy', 'hr'];

async function writeOpsMetric(payload = {}) {
  try {
    await db.collection('operation_metrics').add({
      metric_type: 'monthly_worktime_pipeline',
      created_at: new Date(),
      ...payload
    });
  } catch (err) {
    const text = String(err?.message || err || '');
    if (text.includes('collection not exists') || text.includes('Db or Table not exist') || text.includes('ResourceNotFound')) return;
    console.warn('[worktime.writeOpsMetric] 写入失败:', err?.message || err);
  }
}

function toDateStr(val) {
  if (!val) return '';
  // 处理字符串格式 - 支持多种日期格式
  if (typeof val === 'string') {
    const trimmed = val.trim();
    if (!trimmed || ['-', '无', 'null', 'undefined'].includes(trimmed.toLowerCase())) return '';
    // 首先尝试严格匹配 YYYY-MM-DD
    const strictMatch = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (strictMatch) {
      return trimmed.substring(0, 10);
    }
    // 再尝试宽松匹配 YYYY-M-D 或 YYYY/MM/DD 等格式
    const looseMatch = trimmed.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})/);
    if (looseMatch) {
      const year = looseMatch[1];
      const month = String(Number(looseMatch[2])).padStart(2, '0');
      const day = String(Number(looseMatch[3])).padStart(2, '0');
      return `${year}-${month}-${day}`;
    }
  }
  // 处理 Timestamp 对象或其他对象类型
  let timestamp = val;
  if (typeof val === 'object' && val !== null) {
    // CloudBase Timestamp 对象有 _seconds 属性
    if (val.$date) {
      timestamp = val.$date;
    } else if (val._seconds) {
      timestamp = val._seconds * 1000;
    } else if (val.seconds) {
      timestamp = val.seconds * 1000;
    } else if (val._milliseconds) {
      timestamp = val._milliseconds;
    } else if (val.milliseconds) {
      timestamp = val.milliseconds;
    } else if (val.getTime) {
      timestamp = val.getTime();
    } else {
      return '';
    }
  }
  // 处理数字时间戳
  if (typeof timestamp === 'number') {
    // 如果是 10 位数（秒级时间戳），转为毫秒
    if (timestamp < 10000000000) {
      timestamp = timestamp * 1000;
    }
  }
  const d = new Date(timestamp);
  if (isNaN(d.getTime())) return '';
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  });
  return formatter.format(d);
}

// 安全的日期比较：转换为时间戳后比较
function dateStrToTimestamp(dateStr) {
  const normalized = toDateStr(dateStr);
  if (!normalized) return 0;
  // 解析 YYYY-MM-DD 为 UTC 时间戳（避免时区歧义）
  const parts = normalized.split('-');
  if (parts.length !== 3) return 0;
  const y = Number(parts[0]);
  const m = Number(parts[1]) - 1;
  const d = Number(parts[2]);
  return Date.UTC(y, m, d);
}

function toYearMonth(val) {
  if (!val) return '';
  const m = String(val).trim();
  const strict = m.match(/^(\d{4})-(\d{2})$/);
  if (strict) return m;
  const loose = m.match(/^(\d{4})[-/](\d{1,2})/);
  if (loose) {
    const year = loose[1];
    const month = String(Number(loose[2])).padStart(2, '0');
    return `${year}-${month}`;
  }
  return '';
}

function isDateBefore(date1, date2) {
  const ts1 = dateStrToTimestamp(date1);
  const ts2 = dateStrToTimestamp(date2);
  return ts1 < ts2;
}

function isDateAfter(date1, date2) {
  const ts1 = dateStrToTimestamp(date1);
  const ts2 = dateStrToTimestamp(date2);
  return ts1 > ts2;
}

function isWorkDateWithinEmploymentRange(workDate, joinDate, leaveDate) {
  const normalizedWorkDate = toDateStr(workDate);
  const normalizedJoinDate = toDateStr(joinDate);
  const normalizedLeaveDate = toDateStr(leaveDate);

  if (!normalizedWorkDate) return false;
  if (normalizedJoinDate && isDateBefore(normalizedWorkDate, normalizedJoinDate)) return false;
  if (normalizedLeaveDate && isDateAfter(normalizedWorkDate, normalizedLeaveDate)) return false;

  return true;
}

/**
 * 检查某个月份是否在员工的在职范围内
 * @param {string} yearMonth - YYYY-MM 格式
 * @param {object} ec - 员工企业关系记录
 * @returns {boolean}
 */
function isMonthWithinEmploymentRange(yearMonth, ec) {
  if (!yearMonth || !ec) return false;
  
  const joinDate = toDateStr(ec.join_date);
  const leaveDate = toDateStr(ec.leave_date);
  
  // 转换为该月的起始和结束日期
  const monthStart = `${yearMonth}-01`;
  const lastDay = new Date(Number(yearMonth.slice(0, 4)), Number(yearMonth.slice(5, 7)), 0).getDate();
  const monthEnd = `${yearMonth}-${String(lastDay).padStart(2, '0')}`;
  
  // 核心逻辑：检查该月份是否与在职期间有交集
  // (1) 如果有入职日期，月份结束必须 >= 入职日期（即不能在入职之前）
  if (joinDate && isDateBefore(monthEnd, joinDate)) {
    // 月份结束 < 入职日期 => 还未入职，无交集
    return false;
  }
  
  // (2) 如果有离职日期，月份开始必须 <= 离职日期（即不能在离职之后）
  if (leaveDate && isDateAfter(monthStart, leaveDate)) {
    // 月份开始 > 离职日期 => 已经离职，无交集
    return false;
  }
  
  // 该月与在职期间有交集
  return true;
}

function isDateBeforeOrEqual(date1, date2) {
  return isDateBefore(date1, date2) || date1 === date2;
}

function normalizeSettlementMode(value) {
  const text = String(value || '').trim().toLowerCase();
  if (!text) return '';
  if (text === 'daily' || text === '日结') return 'daily';
  if (text === 'monthly' || text === '月结') return 'monthly';
  return text;
}

function normalizeTextValue(value) {
  return String(value || '').trim();
}

function pickPreferredEmployee(list = []) {
  const candidates = (Array.isArray(list) ? list : []).filter(Boolean);
  if (!candidates.length) return null;

  const score = (item) => {
    const status = normalizeTextValue(item.status).toLowerCase();
    const merged = normalizeTextValue(item.merged_into_employee_id);
    const activeScore = ['regular', 'probation'].includes(status) ? 100 : 0;
    const mergedScore = merged ? -1000 : 0;
    const updatedAt = new Date(item.updated_at || item.created_at || 0).getTime() || 0;
    return activeScore + mergedScore + updatedAt / 1e13;
  };

  return [...candidates].sort((a, b) => score(b) - score(a))[0];
}

async function getLatestEmployeeRelation(employeeId, referenceDate = '') {
  if (!employeeId) return null;
  const res = await db.collection('employee_companies')
    .where({ employee_id: employeeId })
    .orderBy('updated_at', 'desc')
    .get();
  const relations = (res.data || []).filter((item) => isRelationAvailable(item, referenceDate));
  return pickEmployeeCompanyRelationForWorkDate(relations, referenceDate) || relations[0] || null;
}

async function resolveEmployeeByUserOrPhone({ user = null, phone = '', employee_id = '' } = {}) {
  if (employee_id) {
    const doc = await db.collection('employees').doc(employee_id).get();
    if (doc?.data) return doc.data;
  }

  if (user?.employee_id) {
    const doc = await db.collection('employees').doc(user.employee_id).get();
    if (doc?.data && !doc.data.merged_into_employee_id) return doc.data;
  }

  if (user?._id) {
    const employeeRes = await db.collection('employees')
      .where({ user_id: user._id })
      .limit(10)
      .get();
    const preferred = pickPreferredEmployee(employeeRes.data || []);
    if (preferred) return preferred;
  }

  const phoneToUse = phone || user?.phone || '';
  if (phoneToUse) {
    const phoneRes = await db.collection('employees')
      .where({ phone: phoneToUse })
      .limit(10)
      .get();
    const preferred = pickPreferredEmployee(phoneRes.data || []);
    if (preferred) return preferred;
  }

  return null;
}

function isRelationAvailable(item, referenceDate = '') {
  if (!item) return false;

  const status = String(item.status || '').trim().toLowerCase();

  // 以下状态无论何时都不可用
  if (['cancelled', 'inactive', 'disabled', 'archived', 'deleted'].includes(status)) {
    return false;
  }

  if (referenceDate) {
    return isWorkDateWithinEmploymentRange(referenceDate, item.join_date, item.leave_date);
  }

  return true;
}

function isRelationSelectable(item) {
  if (!item || !item.company_id) return false;
  const status = String(item.status || '').trim().toLowerCase();
  return !['cancelled', 'inactive', 'disabled', 'archived', 'deleted'].includes(status);
}

function isEmployeeReportable(employee, referenceDate = '') {
  if (!employee) return false;

  const status = String(employee.status || '').trim().toLowerCase();
  if (status === 'resigned' || status === 'inactive' || status === 'disabled' || status === 'archived') {
    return false;
  }

  if (referenceDate) {
    return isWorkDateWithinEmploymentRange(referenceDate, employee.join_date, employee.leave_date);
  }

  const today = toDateStr(new Date());
  return isWorkDateWithinEmploymentRange(today, employee.join_date, employee.leave_date);
}

function pickLatestRecord(current, incoming) {
  if (!current) return incoming || null;
  if (!incoming) return current;

  const currentUpdated = dateStrToTimestamp(current.updated_at || current.created_at || current.join_date);
  const incomingUpdated = dateStrToTimestamp(incoming.updated_at || incoming.created_at || incoming.join_date);
  return incomingUpdated >= currentUpdated ? incoming : current;
}

function dedupeRelationsByCompany(relations = []) {
  const relationMap = new Map();
  for (const item of relations) {
    const companyId = item?.company_id || '';
    if (!companyId) continue;
    relationMap.set(companyId, pickLatestRecord(relationMap.get(companyId), item));
  }
  return Array.from(relationMap.values());
}

function compareRelationDesc(a, b) {
  const aJoin = dateStrToTimestamp(a?.join_date);
  const bJoin = dateStrToTimestamp(b?.join_date);
  if (aJoin !== bJoin) return bJoin - aJoin;

  const aUpdated = dateStrToTimestamp(a?.updated_at || a?.created_at);
  const bUpdated = dateStrToTimestamp(b?.updated_at || b?.created_at);
  if (aUpdated !== bUpdated) return bUpdated - aUpdated;

  return String(b?._id || '').localeCompare(String(a?._id || ''));
}

function isUsableEmployeeCompanyRelation(item) {
  if (!item || !item.company_id) return false;
  const status = String(item.status || '').trim().toLowerCase();
  return !['cancelled', 'inactive', 'disabled', 'archived', 'deleted'].includes(status);
}

function buildRelationDisplayName(companyName, relation) {
  const name = companyName || relation?.company_name || relation?.companyName || '企业';
  const join = toDateStr(relation?.join_date);
  const leave = toDateStr(relation?.leave_date);
  if (join && leave) return `${name}（${join} 至 ${leave}）`;
  if (join) return `${name}（${join} 入职）`;
  if (leave) return `${name}（至 ${leave}）`;
  return name;
}

function pickEmployeeCompanyRelationForWorkDate(relations, workDate) {
  if (!Array.isArray(relations) || !relations.length) return null;

  const matched = [...relations]
    .sort(compareRelationDesc)
    .find((item) => isWorkDateWithinEmploymentRange(workDate, item.join_date, item.leave_date));
  if (matched) return matched;

  return null;
}

async function assertWorktimeEmployeeCompanyRelations(recordIds = []) {
  if (!Array.isArray(recordIds) || !recordIds.length) return;

  const batchSize = 100;
  const missingPairs = [];

  for (let i = 0; i < recordIds.length; i += batchSize) {
    const batch = recordIds.slice(i, i + batchSize);
    const worktimeRes = await db.collection('worktimes')
      .where({ _id: _.in(batch) })
      .get();
    const worktimes = worktimeRes.data || [];

    for (const item of worktimes) {
      if (!item?.employee_id || !item?.company_id) {
        missingPairs.push({
          worktime_id: item?._id || '',
          employee_id: item?.employee_id || '',
          company_id: item?.company_id || '',
          reason: 'missing_employee_or_company'
        });
        continue;
      }

      const relationRes = await db.collection('employee_companies')
        .where({ employee_id: item.employee_id, company_id: item.company_id })
        .limit(1)
        .get();

      if (!relationRes.data || !relationRes.data.length) {
        missingPairs.push({
          worktime_id: item._id,
          employee_id: item.employee_id,
          company_id: item.company_id,
          reason: 'employee_company_missing'
        });
      }
    }
  }

  if (missingPairs.length) {
    const preview = missingPairs.slice(0, 5)
      .map((item) => `${item.worktime_id || 'unknown'}:${item.employee_id}/${item.company_id}`)
      .join(', ');
    throw new Error(`存在 ${missingPairs.length} 条工时缺少 employee_companies 关联，请先执行关系修复。样例：${preview}`);
  }
}

async function assertWorktimeSettlementMode(recordIds = [], expectedMode = 'daily') {
  if (!Array.isArray(recordIds) || !recordIds.length) return;

  const batchSize = 100;
  const invalidRows = [];

  for (let i = 0; i < recordIds.length; i += batchSize) {
    const batch = recordIds.slice(i, i + batchSize);
    const worktimeRes = await db.collection('worktimes')
      .where({ _id: _.in(batch) })
      .get();
    const worktimes = worktimeRes.data || [];

    for (const item of worktimes) {
      let mode = '';
      if (item.employee_id && item.company_id) {
        const relationRes = await db.collection('employee_companies')
          .where({ employee_id: item.employee_id, company_id: item.company_id })
          .get();
        const relations = (relationRes.data || []).filter((relation) => isRelationAvailable(relation, toDateStr(item.work_date)));
        const relation = pickEmployeeCompanyRelationForWorkDate(relations, toDateStr(item.work_date));
        mode = normalizeSettlementMode(relation?.settlement_mode);
      }

      if (mode !== expectedMode) {
        invalidRows.push({
          worktime_id: item._id,
          employee_id: item.employee_id,
          company_id: item.company_id,
          settlement_mode: mode
        });
      }
    }
  }

  if (invalidRows.length) {
    const label = expectedMode === 'daily' ? '日结' : '月结';
    throw new Error(`所选记录包含非${label}工时，请切换到对应工时页审核`);
  }
}

async function assertMonthlySummarySettlementMode(recordIds = []) {
  if (!Array.isArray(recordIds) || !recordIds.length) return;

  const batchSize = 100;
  const invalidRows = [];

  for (let i = 0; i < recordIds.length; i += batchSize) {
    const batch = recordIds.slice(i, i + batchSize);
    const summaryRes = await db.collection('worktime_monthly_summaries')
      .where({ _id: _.in(batch) })
      .get();
    const summaries = summaryRes.data || [];

    for (const item of summaries) {
      let mode = '';
      if (item.employee_id && item.company_id) {
        const relationRes = await db.collection('employee_companies')
          .where({ employee_id: item.employee_id, company_id: item.company_id })
          .get();
        const relations = (relationRes.data || []).filter((relation) => isMonthWithinEmploymentRange(item.year_month, relation));
        const relation = relations.sort((a, b) => {
          const at = new Date(a.updated_at || a.created_at || 0).getTime() || 0;
          const bt = new Date(b.updated_at || b.created_at || 0).getTime() || 0;
          return bt - at;
        })[0];
        mode = normalizeSettlementMode(relation?.settlement_mode);
      }

      if (mode !== 'monthly') {
        invalidRows.push({
          summary_id: item._id,
          employee_id: item.employee_id,
          company_id: item.company_id,
          settlement_mode: mode
        });
      }
    }
  }

  if (invalidRows.length) {
    throw new Error('所选记录包含非月结工时，请切换到对应工时页审核');
  }
}

/**
 * Token验证（与auth云函数相同逻辑）
 */
async function verifyToken(token) {
  try {
    // 从数据库查询有效的 token
    const tokenDoc = await db.collection('login_tokens')
      .where({
        token,
        status: 'logged',
        expire_time: db.command.gt(Date.now())
      })
      .get();

    if (tokenDoc.data.length === 0) {
      return null;
    }

    const tokenRecord = tokenDoc.data[0];
    const user = await db.collection('users')
      .doc(tokenRecord.user_id)
      .get();

    return user.data || null;
  } catch (err) {
    console.error('Token 验证失败:', err);
    return null;
  }
}

async function canManageWorktime(user) {
  if (!user || !user.role) return false;
  const role = String(user.role || '').trim();
  if (WORKTIME_MANAGE_FALLBACK_ROLES.includes(role)) return true;

  try {
    const roleRes = await db.collection('roles')
      .where({ name: role })
      .limit(1)
      .get();
    const roleDoc = roleRes.data && roleRes.data[0];
    const permissions = Array.isArray(roleDoc?.permissions) ? roleDoc.permissions : [];
    return permissions.includes('*') || permissions.includes('worktime:manage');
  } catch (err) {
    console.warn('[worktime.canManageWorktime] 查询角色权限失败:', err?.message || err);
    return false;
  }
}

/**
 * 员工自录入工时 / 管理端代填工时
 */
async function submitWorktime(data) {
  const { token, employee_id, employee_company_id, company_id, work_date, shift, regular_hours } = data;
  const tokenUser = token ? await verifyToken(token) : null;
  const isWorktimeManager = await canManageWorktime(tokenUser);
  const resolvedEmployeeId = isWorktimeManager && employee_id
    ? employee_id
    : (tokenUser?.employee_id || employee_id || '');

  if (!resolvedEmployeeId) {
    return error(400, '当前账号未绑定员工主档，请先完善资料或联系管理员');
  }
  if (!isWorktimeManager && employee_id && tokenUser?.employee_id && employee_id !== tokenUser.employee_id) {
    return error(403, '员工身份不匹配，请重新登录');
  }

  const empDoc = await db.collection('employees').doc(resolvedEmployeeId).get();
  if (!empDoc || !empDoc.data || empDoc.data.merged_into_employee_id) {
    return error(404, '未找到员工信息，请先完善个人资料');
  }
  const finalEmployeeId = empDoc.data._id;
  const workDateStr = toDateStr(work_date);
  if (!workDateStr) {
    return error(400, '工作日期格式不正确');
  }

  const today = toDateStr(new Date());
  if (today && isDateAfter(workDateStr, today)) {
    return error(400, '日期不能晚于今天');
  }

  let relationQuery;
  if (employee_company_id) {
    relationQuery = db.collection('employee_companies').where({
      _id: employee_company_id,
      employee_id: finalEmployeeId
    });
  } else if (company_id) {
    relationQuery = db.collection('employee_companies').where({
      employee_id: finalEmployeeId,
      company_id
    });
  } else {
    return error(400, '请先选择企业');
  }

  const relationRes = await relationQuery.get();
  const candidateRelations = (relationRes.data || [])
    .filter(isUsableEmployeeCompanyRelation)
    .sort(compareRelationDesc);
  const employeeCompany = pickEmployeeCompanyRelationForWorkDate(candidateRelations, workDateStr);

  if (!employeeCompany) {
    return error(400, '所选企业在该日期不在入职至离职时间内，无法填报工时');
  }

  const finalCompanyId = employeeCompany.company_id;
  const total_hours = Number(regular_hours) || 0;
  if (total_hours <= 0) {
    return error(400, '工时必须大于 0');
  }

  // 若当日已有记录，则改为更新（防重复多条）
  const existing = await db.collection('worktimes')
    .where({ employee_id: finalEmployeeId, company_id: finalCompanyId, work_date: workDateStr })
    .limit(1)
    .get();

  if (existing.data && existing.data.length) {
    const rec = existing.data[0];
    if (rec.status === 'approved') {
      return error(400, '该日期工时已审核通过，不能修改');
    }

    await db.collection('worktimes').doc(rec._id).update({
      data: {
        company_id: finalCompanyId,
        employee_company_id: employeeCompany._id || employee_company_id || '',
        shift: shift || rec.shift || 'day',
        regular_hours,
        total_hours,
        source: isWorktimeManager ? 'admin_manual' : 'self',
        status: 'pending',
        submit_time: db.serverDate(),
        submitted_by: tokenUser?._id || '',
        submitted_by_role: tokenUser?.role || '',
        updated_at: db.serverDate()
      }
    });
    return success({ id: rec._id }, '已更新当日工时，等待审核');
  }

  const result = await db.collection('worktimes').add({
    data: {
      employee_id: finalEmployeeId,
      company_id: finalCompanyId,
      employee_company_id: employeeCompany._id || employee_company_id || '',
      work_date: workDateStr,
      shift: shift || 'day',
      regular_hours,
      total_hours,
      source: isWorktimeManager ? 'admin_manual' : 'self',
      status: 'pending',
      submit_time: db.serverDate(),
      submitted_by: tokenUser?._id || '',
      submitted_by_role: tokenUser?.role || '',
      created_at: db.serverDate(),
      updated_at: db.serverDate()
    }
  });

  return success({ id: result.id }, '工时提交成功，等待审核');
}

/**
 * HR 新增 / 覆盖月结工时汇总
 * data: { employee_id, company_id, year_month, total_hours, total_days, night_hours, night_days, salary_amount, remark }
 */
async function addMonthlySummary(data) {
  const {
    employee_id,
    company_id,
    year_month,
    total_hours = 0,
    total_days = 0,
    night_hours = 0,
    night_days = 0,
    salary_amount = 0,
    remark = '',
    source = 'manual'
  } = data;

  if (!employee_id || !company_id || !year_month) {
    return error(400, '缺少必填参数');
  }
  const ym = toYearMonth(year_month);
  if (!ym) return error(400, '月份格式不正确，应为 YYYY-MM');

  const empRes = await db.collection('employees').doc(employee_id).get();
  const employee = empRes.data || {};
  if (!employee._id) return error(404, '员工不存在');
  if ((employee.company_id || '') !== company_id) {
    const relationCheck = await db.collection('employee_companies')
      .where({ employee_id, company_id })
      .limit(1)
      .get();
    if (!relationCheck.data || !relationCheck.data.length) {
      return error(400, '员工不属于所选企业');
    }
  }

  const companyRes = await db.collection('companies').doc(company_id).get();
  const company = companyRes.data || {};
  if (!company._id) return error(404, '企业不存在');

  // 校验结算方式
  // 查询该员工在该企业的所有关联记录，再按月份判断覆盖范围
  const ecRes = await db.collection('employee_companies')
    .where({ employee_id, company_id })
    .get();
  const ecList = ecRes.data || [];

  // 查找是否有记录覆盖该月份
  let ec = null;
  for (const item of ecList) {
    if (isMonthWithinEmploymentRange(ym, item)) {
      ec = item;
      break;
    }
  }

  if (!ec) {
    // 检查是否有离职记录
    const resignedRecord = ecList.find(item => {
      const leaveDate = toDateStr(item.leave_date);
      return leaveDate && isDateBefore(leaveDate, `${ym}-01`);
    });
    if (resignedRecord) {
      const leaveDate = toDateStr(resignedRecord.leave_date);
      return error(400, `该员工已于 ${leaveDate} 离职，无法录入 ${ym} 月的月结工时`);
    }
    return error(400, `该员工在 ${ym} 月不在职，无法录入月结工时`);
  }

  const settlement = normalizeSettlementMode(ec.settlement_mode);
  if (settlement !== 'monthly') {
    return error(400, '该员工为日结模式，不能录入月结工时');
  }

  const jobId = ec.job_id || employee.job_id || '';
  let job = null;
  if (jobId) {
    const jobRes = await db.collection('jobs').doc(jobId).get().catch(() => ({ data: null }));
    job = jobRes.data || null;
  }

  const ratePlanId = ec.rate_plan_id || employee.rate_plan_id || job?.rate_plan_id || '';
  let ratePlan = null;
  if (ratePlanId) {
    const planRes = await db.collection('rate_plans').doc(ratePlanId).get().catch(() => ({ data: null }));
    ratePlan = planRes.data || null;
  }

  let hourlyRate = Number(ratePlan?.hourly_rate_monthly || 0);
  if (!hourlyRate) {
    const dailyRate = Number(ratePlan?.daily_rate_monthly || 0);
    const payHours = Number(ratePlan?.pay_hours_monthly || 8);
    if (dailyRate && payHours) {
      hourlyRate = Math.round((dailyRate / payHours) * 100) / 100;
    }
  }
  if (!hourlyRate) {
    hourlyRate = Number(ec.hourly_rate ?? job?.hourly_rate ?? employee.hourly_rate ?? 0);
  }

  // upsert：同一个员工+公司+月份覆盖
  const existingRes = await db.collection('worktime_monthly_summaries')
    .where({ employee_id, company_id, year_month: ym })
    .limit(1)
    .get();

  const payload = {
    employee_id,
    company_id,
    employee_no: employee.employee_no || '',
    employee_name: employee.name || employee.real_name || '',
    company_name: company.name || employee.company_name || '',
    job_id: jobId,
    job_name: job?.position || job?.job_name || employee.job_name || '',
    rate_plan_id: ratePlanId,
    year_month: ym,
    total_hours: Number(total_hours) || 0,
    total_days: Number(total_days) || 0,
    night_hours: Number(night_hours) || 0,
    night_days: Number(night_days) || 0,
    salary_amount: Math.round((Number(salary_amount) || 0) * 100) / 100,
    hourly_rate: Number(hourlyRate) || 0,
    night_hourly_rate: Number(ratePlan?.night_hourly_rate_monthly ?? ratePlan?.night_hourly_rate ?? ec.night_hourly_rate ?? job?.night_hourly_rate ?? employee.night_hourly_rate ?? 0),
    night_daily_rate: Number(ratePlan?.night_daily_rate_monthly ?? ratePlan?.night_daily_rate ?? ec.night_daily_rate ?? job?.night_daily_rate ?? employee.night_daily_rate ?? 0),
    insurance_daily_deduct: Number(ratePlan?.insurance_daily_deduct || 0),
    insurance_monthly_deduct: Number(ratePlan?.insurance_monthly_deduct || 0),
    remark: remark || '',
    source: existingRes.data && existingRes.data.length ? (existingRes.data[0].source || source || 'manual') : (source || 'manual'),
    settlement_mode: 'monthly',
    employment_status: ec.leave_date && isDateBefore(toDateStr(ec.leave_date), toDateStr(new Date())) ? 'resigned' : 'active',
    status: 'pending',
    updated_at: db.serverDate()
  };

  if (existingRes.data && existingRes.data.length) {
    await db.collection('worktime_monthly_summaries').doc(existingRes.data[0]._id).update({
      data: payload
    });
    return success({ id: existingRes.data[0]._id }, '已覆盖该月份工时汇总');
  }

  const addRes = await db.collection('worktime_monthly_summaries').add({
    data: {
      ...payload,
      created_at: db.serverDate()
    }
  });
  return success({ id: addRes.id }, '新增月结工时成功');
}

async function batchAddMonthlySummaries(data = {}) {
  const { records = [] } = data;
  if (!Array.isArray(records) || !records.length) {
    return error(400, '缺少导入记录');
  }

  const successItems = [];
  const failedItems = [];

  for (let i = 0; i < records.length; i += 1) {
    const record = records[i] || {};
    try {
      const result = await addMonthlySummary(record);
      if (result?.code === 0) {
        successItems.push({ index: i, id: result?.data?.id || '' });
      } else {
        failedItems.push({
          index: i,
          employee_id: record.employee_id || '',
          employee_no: record.employee_no || '',
          employee_name: record.employee_name || '',
          company_id: record.company_id || '',
          year_month: record.year_month || '',
          error: result?.message || '导入失败'
        });
      }
    } catch (err) {
      failedItems.push({
        index: i,
        employee_id: record.employee_id || '',
        employee_no: record.employee_no || '',
        employee_name: record.employee_name || '',
        company_id: record.company_id || '',
        year_month: record.year_month || '',
        error: err?.message || '导入异常'
      });
    }
  }

  const result = {
    total: records.length,
    imported: successItems.length,
    failed: failedItems.length,
    failedItems
  };

  await writeOpsMetric({
    action: 'batch_add_monthly_summaries',
    total: result.total,
    imported: result.imported,
    failed: result.failed
  });

  return success(result, failedItems.length ? `导入完成：成功 ${successItems.length} 条，失败 ${failedItems.length} 条` : `导入成功，共 ${successItems.length} 条`);
}

/**
 * Excel 批量导入工时
 * data 包含 { company_id, year, month, records: [...] }
 */
async function batchImport(data) {
  const { company_id, year, month, records } = data;

  const batchSize = 500; // 云数据库批量写入上限 500
  const batch = [];
  const errors = [];

  for (let i = 0; i < records.length; i++) {
    const rec = records[i];
    const { employee_id, work_date, regular_hours, shift } = rec;

    try {
      const total_hours = regular_hours || 0;
      const hourly_rate = await getEmployeeHourlyRate(employee_id, company_id);

      batch.push({
        employee_id,
        company_id,
        work_date,
        shift: shift || 'day',
        regular_hours,
        total_hours,
        hourly_rate,
        settlement_mode: 'daily',
        source: 'excel',
        status: 'pending',
        submit_time: db.serverDate(),
        created_at: db.serverDate(),
        updated_at: db.serverDate()
      });

      if (batch.length >= batchSize) {
        await db.collection('worktimes').add(batch);
        batch.length = 0;
      }
    } catch (err) {
      errors.push({ record: rec, error: err.message });
    }
  }

  // 剩余批次
  if (batch.length > 0) {
    await db.collection('worktimes').add(batch);
  }

  return success(
    { imported: records.length - errors.length, errors: errors.length },
    `成功导入 ${records.length - errors.length} 条，失败 ${errors.length} 条`
  );
}

/**
 * 批量审核通过
 */
async function batchApprove(data) {
  const { record_ids, approver_id } = data;

  await assertWorktimeEmployeeCompanyRelations(record_ids);
  await assertWorktimeSettlementMode(record_ids, 'daily');
  const existingRes = await db.collection('worktimes')
    .where({ _id: _.in(record_ids) })
    .get();
  const nonPending = (existingRes.data || []).filter((item) => item.status !== 'pending');
  if (nonPending.length) {
    return error(400, '仅 pending 状态的日结工时可审核通过');
  }

  const updateData = {
    status: 'approved',
    approve_by: approver_id,
    approve_time: db.serverDate(),
    updated_at: db.serverDate()
  };

  // 批量更新（限制 500 条）
  const batchSize = 500;
  for (let i = 0; i < record_ids.length; i += batchSize) {
    const batch = record_ids.slice(i, i + batchSize);
    await db.collection('worktimes')
      .where({ _id: db.command.in(batch) })
      .update({ data: updateData });
  }

  return success(null, `已通过 ${record_ids.length} 条工时记录`);
}

/**
 * 批量审核驳回
 */
async function batchReject(data) {
  const { record_ids, approver_id, remark } = data;

  await assertWorktimeSettlementMode(record_ids, 'daily');
  const existingRes = await db.collection('worktimes')
    .where({ _id: _.in(record_ids) })
    .get();
  const nonPending = (existingRes.data || []).filter((item) => item.status !== 'pending');
  if (nonPending.length) {
    return error(400, '仅 pending 状态的日结工时可驳回');
  }

  const updateData = {
    status: 'rejected',
    approve_by: approver_id,
    approve_time: db.serverDate(),
    approve_remark: remark,
    updated_at: db.serverDate()
  };

  const batchSize = 500;
  for (let i = 0; i < record_ids.length; i += batchSize) {
    const batch = record_ids.slice(i, i + batchSize);
    await db.collection('worktimes')
      .where({ _id: db.command.in(batch) })
      .update({ data: updateData });
  }

  return success(null, `已驳回 ${record_ids.length} 条工时记录`);
}

// 批量审核月结汇总
async function batchApproveMonthly(data) {
  const { record_ids, approver_id } = data;
  if (!Array.isArray(record_ids) || !record_ids.length) {
    return error(400, '缺少记录ID');
  }
  await assertMonthlySummarySettlementMode(record_ids);
  const existingRes = await db.collection('worktime_monthly_summaries')
    .where({ _id: _.in(record_ids) })
    .get();
  const nonPending = (existingRes.data || []).filter((item) => item.status !== 'pending');
  if (nonPending.length) {
    return error(400, '仅 pending 状态的月结工时可审核通过');
  }
  const updateData = {
    status: 'approved',
    approve_by: approver_id,
    approve_time: db.serverDate(),
    updated_at: db.serverDate()
  };

  const batchSize = 500;
  for (let i = 0; i < record_ids.length; i += batchSize) {
    const batch = record_ids.slice(i, i + batchSize);
    await db.collection('worktime_monthly_summaries')
      .where({ _id: db.command.in(batch) })
      .update({ data: updateData });
  }

  await writeOpsMetric({
    action: 'approve_monthly_worktime',
    approved_count: record_ids.length
  });
  return success(null, `已通过 ${record_ids.length} 条月结工时`);
}

async function batchRejectMonthly(data) {
  const { record_ids, approver_id, remark } = data;
  if (!Array.isArray(record_ids) || !record_ids.length) {
    return error(400, '缺少记录ID');
  }
  await assertMonthlySummarySettlementMode(record_ids);
  const existingRes = await db.collection('worktime_monthly_summaries')
    .where({ _id: _.in(record_ids) })
    .get();
  const nonPending = (existingRes.data || []).filter((item) => item.status !== 'pending');
  if (nonPending.length) {
    return error(400, '仅 pending 状态的月结工时可驳回');
  }
  const updateData = {
    status: 'rejected',
    approve_by: approver_id,
    approve_time: db.serverDate(),
    approve_remark: remark || '',
    updated_at: db.serverDate()
  };

  const batchSize = 500;
  for (let i = 0; i < record_ids.length; i += batchSize) {
    const batch = record_ids.slice(i, i + batchSize);
    await db.collection('worktime_monthly_summaries')
      .where({ _id: db.command.in(batch) })
      .update({ data: updateData });
  }

  await writeOpsMetric({
    action: 'reject_monthly_worktime',
    rejected_count: record_ids.length
  });
  return success(null, `已驳回 ${record_ids.length} 条月结工时`);
}

/**
 * 工时列表查询
 */
async function listWorktime(data) {
  const { token, employee_id, company_id, year, month, status, phone, with_summary } = data;

  // 验证必要参数
  if (!year || !month) {
    return error(400, '缺少年月参数');
  }

  // 确定 employee_id：优先使用传入的，否则通过 token 获取
  let currentEmployeeId = employee_id;
  let currentCompanyId = company_id;

  if (!currentEmployeeId) {
    let user = null;
    if (token) {
      user = await verifyToken(token);
    }

    const emp = await resolveEmployeeByUserOrPhone({ user, phone });
    if (emp?._id) {
      currentEmployeeId = emp._id;
      if (!currentCompanyId) {
        const relation = await getLatestEmployeeRelation(emp._id);
        currentCompanyId = relation?.company_id || '';
      }
    }
  }

  // 找不到员工时返回空列表而不是报错，避免前端阻塞
  if (!currentEmployeeId) {
    return success([]);
  }

  if (!currentEmployeeId) {
    return error(400, '缺少员工标识');
  }

  const monthPrefix = `${year}-${String(month).padStart(2, '0')}`;

  const conds = [{ employee_id: currentEmployeeId }];
  if (currentCompanyId) conds.push({ company_id: currentCompanyId });
  if (status) conds.push({ status });

  const res = await db.collection('worktimes')
    .where(_.and(conds))
    .orderBy('work_date', 'desc')
    .get();

  const list = (res.data || []).filter((item) => toDateStr(item.work_date).startsWith(monthPrefix));
  if (!with_summary) {
    return success(list);
  }

  const summary = await buildWorktimeSummary({
    employeeId: currentEmployeeId,
    companyId: currentCompanyId,
    yearMonth: monthPrefix,
    records: list
  });
  return success({ list, summary });
}

module.exports = {
  submitWorktime,
  addMonthlySummary,
  batchAddMonthlySummaries,
  batchImport,
  batchApprove,
  batchReject,
  batchApproveMonthly,
  batchRejectMonthly,
  listWorktime,
  listPending,
  listCompanies,
  debugEmployeeCompanies,
  debugEmployee
};

  // 调试接口：列出某员工所有 employee_companies 记录（按 updated_at 降序）
  async function debugEmployeeCompanies(data) {
    const { employee_id, phone } = data;
    let emp = null;
    if (employee_id) {
      const doc = await db.collection('employees').doc(employee_id).get();
      if (doc?.data) emp = doc.data;
    }
    if (!emp && phone) {
      const res = await db.collection('employees').where({ phone }).limit(1).get();
      if (res.data && res.data.length) emp = res.data[0];
    }
    if (!emp) return error(404, '未找到员工');

    try {
      const res = await db.collection('employee_companies')
        .where({ employee_id: emp._id })
        .orderBy('updated_at', 'desc')
        .get();
      return success(res.data || []);
    } catch (err) {
      console.error('debugEmployeeCompanies failed', err);
      return error(500, err.message);
    }
  }

/**
 * 待审核列表
 */
async function listPending(data) {
  const { company_id } = data;
  let query = db.collection('worktimes').where({ status: 'pending' });
  if (company_id) {
    query = query.where({ status: 'pending', company_id });
  }
  const res = await query.orderBy('created_at', 'desc').limit(100).get();
  return success(res.data);
}

/**
 * 获取员工时薪
 * 只从 rate_plan（工价方案）取时薪，不依赖 ec/employee/job 上的散装 hourly_rate
 * 优先级：个人绑定的 rate_plan → 岗位的 rate_plan → 0
 */
async function getEmployeeHourlyRate(employee_id, company_id) {
  let ec = null;
  let employee = null;
  let job = null;
  let plan = null;
  let ratePlanId = '';

  // 1. 查 employee_companies：拿个人的 rate_plan_id
  try {
    const ecDoc = await db.collection('employee_companies')
      .where({ employee_id, company_id })
      .orderBy('updated_at', 'desc')
      .limit(1)
      .get();
    if (ecDoc.data && ecDoc.data.length) ec = ecDoc.data[0];
  } catch (err) {
    console.warn('查询 employee_companies 失败', err?.message);
  }

  // 2. 优先用个人绑定的 rate_plan_id
  ratePlanId = ec?.rate_plan_id || '';
  if (!ratePlanId) {
    // 个人没有，查岗位的 rate_plan_id
    try {
      const empDoc = await db.collection('employees').doc(employee_id).get();
      employee = empDoc?.data || null;
      if (employee?.job_id) {
        const jobDoc = await db.collection('jobs').doc(employee.job_id).get();
        job = jobDoc?.data || null;
        ratePlanId = job?.rate_plan_id || '';
      }
    } catch (err) {
      console.warn('查询 employee/jobs 失败', err?.message);
    }
  }

  // 3. 查 rate_plans 取时薪
  if (ratePlanId) {
    try {
      const planDoc = await db.collection('rate_plans').doc(ratePlanId).get();
      plan = planDoc?.data || null;
    } catch (err) {
      console.warn('查询 rate_plans 失败', err?.message);
    }
  }

  if (plan) {
    const planHourlyRate = Number(plan.hourly_rate_daily ?? 0);
    if (planHourlyRate) return planHourlyRate;

    const dailyRate = Number(plan.daily_rate_daily ?? 0);
    const payHours = Number(plan.pay_hours_daily || 8);
    if (dailyRate && payHours) return Math.round((dailyRate / payHours) * 100) / 100;
  }

  // 4. 都没有则返回0（不阻断，等审核时再算）
  return 0;
}

function daysInMonth(year, month) {
  return new Date(year, month, 0).getDate();
}

function roundMoney(value) {
  return Math.round((Number(value) || 0) * 100) / 100;
}

function pickRatePlanFieldBySettlementMode(plan = {}, settlementMode = 'daily', baseField = 'hourly_rate') {
  const normalized = normalizeSettlementMode(settlementMode) || 'daily';
  const suffix = normalized === 'monthly' ? '_monthly' : '_daily';
  return plan?.[`${baseField}${suffix}`];
}

function resolveHourlyRateBySettlementMode(plan = {}, settlementMode = 'daily') {
  let hourlyRate = Number(pickRatePlanFieldBySettlementMode(plan, settlementMode, 'hourly_rate') || 0);
  if (hourlyRate) return roundMoney(hourlyRate);

  const dailyRate = Number(pickRatePlanFieldBySettlementMode(plan, settlementMode, 'daily_rate') || 0);
  const payHours = Number(pickRatePlanFieldBySettlementMode(plan, settlementMode, 'pay_hours') || 8);
  if (dailyRate && payHours) {
    hourlyRate = dailyRate / payHours;
  }
  return roundMoney(hourlyRate);
}

function resolveNightAllowanceBySettlementMode(records = [], plan = {}, settlementMode = 'daily') {
  const normalized = normalizeSettlementMode(settlementMode) || 'daily';
  const nightRecords = (records || []).filter((item) => String(item?.shift || '').toLowerCase() === 'night');
  if (!nightRecords.length) return 0;

  const nightHours = nightRecords.reduce((sum, item) => sum + Number(item?.total_hours ?? item?.hours ?? 0), 0);
  const nightDays = new Set(nightRecords.map((item) => toDateStr(item?.work_date)).filter(Boolean)).size;

  const nightHourlyRate = Number(pickRatePlanFieldBySettlementMode(plan, normalized, 'night_hourly_rate') ?? plan?.night_hourly_rate ?? 0);
  if (nightHourlyRate > 0) {
    return roundMoney(nightHours * nightHourlyRate);
  }

  const nightDailyRate = Number(pickRatePlanFieldBySettlementMode(plan, normalized, 'night_daily_rate') ?? plan?.night_daily_rate ?? 0);
  if (nightDailyRate > 0) {
    return roundMoney(nightDays * nightDailyRate);
  }

  return 0;
}

function pickEmployeeCompanyForMonth(relations = [], yearMonth = '') {
  const list = Array.isArray(relations) ? relations : [];
  const matched = list.find((item) => isMonthWithinEmploymentRange(yearMonth, item));
  return matched || list[0] || null;
}

async function buildWorktimeSummary({
  employeeId = '',
  companyId = '',
  yearMonth = '',
  records = []
} = {}) {
  const monthlyTotalHours = roundMoney(
    (records || []).reduce((sum, item) => sum + Number(item?.total_hours ?? item?.hours ?? 0), 0)
  );
  const monthlyWorkDays = new Set(
    (records || []).map((item) => toDateStr(item?.work_date)).filter(Boolean)
  ).size;

  const emptySummary = {
    month: yearMonth,
    monthly_total_hours: monthlyTotalHours,
    monthly_work_days: monthlyWorkDays,
    estimated_salary: 0,
    settlement_mode: 'daily',
    hourly_rate_snapshot: 0,
    night_allowance_snapshot: 0,
    rate_plan_id_snapshot: '',
    estimate_rule_version: 'worktime-v1'
  };

  if (!employeeId || !companyId) return emptySummary;

  let employeeCompany = null;
  try {
    const ecRes = await db.collection('employee_companies')
      .where({ employee_id: employeeId, company_id: companyId })
      .orderBy('updated_at', 'desc')
      .get();
    employeeCompany = pickEmployeeCompanyForMonth(ecRes.data || [], yearMonth);
  } catch (err) {
    console.warn('[worktime.list.summary] 查询 employee_companies 失败', err?.message || err);
  }

  const settlementMode = normalizeSettlementMode(employeeCompany?.settlement_mode || employeeCompany?.salary_type) || 'daily';

  let employee = null;
  let job = null;
  let ratePlan = null;
  let ratePlanId = normalizeTextValue(employeeCompany?.rate_plan_id);

  try {
    const empDoc = await db.collection('employees').doc(employeeId).get();
    employee = empDoc?.data || null;
  } catch (err) {
    console.warn('[worktime.list.summary] 查询 employees 失败', err?.message || err);
  }

  const jobId = normalizeTextValue(employeeCompany?.job_id || employee?.job_id);
  if (jobId) {
    try {
      const jobDoc = await db.collection('jobs').doc(jobId).get();
      job = jobDoc?.data || null;
      if (!ratePlanId) ratePlanId = normalizeTextValue(job?.rate_plan_id);
    } catch (err) {
      console.warn('[worktime.list.summary] 查询 jobs 失败', err?.message || err);
    }
  }

  if (ratePlanId) {
    try {
      const planDoc = await db.collection('rate_plans').doc(ratePlanId).get();
      ratePlan = planDoc?.data || null;
    } catch (err) {
      console.warn('[worktime.list.summary] 查询 rate_plans 失败', err?.message || err);
    }
  }

  const hourlyRate = resolveHourlyRateBySettlementMode(ratePlan || {}, settlementMode);
  const basePay = roundMoney(monthlyTotalHours * hourlyRate);
  const nightAllowance = resolveNightAllowanceBySettlementMode(records, ratePlan || {}, settlementMode);
  const estimatedSalary = roundMoney(basePay + nightAllowance);

  return {
    ...emptySummary,
    settlement_mode: settlementMode,
    hourly_rate_snapshot: hourlyRate,
    night_allowance_snapshot: nightAllowance,
    rate_plan_id_snapshot: ratePlanId || '',
    estimated_salary: estimatedSalary
  };
}

/**
 * 获取员工所在企业列表（用于前端选择）
 */
async function listCompanies(data) {
  const { token, employee_id } = data;
  const tokenUser = token ? await verifyToken(token) : null;
  const resolvedEmployeeId = tokenUser?.employee_id || employee_id || '';

  if (!resolvedEmployeeId) {
    return success([]);
  }
  if (employee_id && tokenUser?.employee_id && employee_id !== tokenUser.employee_id) {
    return error(403, '员工身份不匹配，请重新登录');
  }

  const empDoc = await db.collection('employees').doc(resolvedEmployeeId).get().catch(err => {
    console.warn('[worktime.list-companies] 查询 employees 时出错', err?.message || err);
    return { data: null };
  });
  const emp = empDoc?.data || null;

  if (!emp || emp.merged_into_employee_id) {
    return success([]);
  }

  let ecList = [];
  try {
    const relationRes = await db.collection('employee_companies')
      .where({ employee_id: emp._id })
      .get();
    ecList = (relationRes.data || [])
      .filter(isUsableEmployeeCompanyRelation)
      .sort(compareRelationDesc);
  } catch (err) {
    console.warn('list-companies 查询 employee_companies 失败', err?.message || err);
  }

  const companyIds = Array.from(new Set(ecList.map(i => i.company_id).filter(Boolean)));
  let companyMap = {};
  if (companyIds.length) {
    const cRes = await db.collection('companies').where({ _id: db.command.in(companyIds) }).get();
    (cRes.data || []).forEach(c => { companyMap[c._id] = c; });
  }

  const list = ecList.map(item => {
    const company = companyMap[item.company_id] || {};
    const name = company.name || company.company_name || company.companyName || item.company_name || item.companyName || '';
    return {
      _id: item._id,
      employee_company_id: item._id,
      company_id: item.company_id,
      name,
      display_name: name || '企业',
      status: item.status,
      settlement_mode: item.settlement_mode || '',
      hourly_rate: item.hourly_rate,
      join_date: toDateStr(item.join_date),
      leave_date: toDateStr(item.leave_date)
    };
  });

  return success(list);
}
