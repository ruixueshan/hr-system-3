/**
 * HR报表定时推送（推荐人维度）
 * 日报: 每天 18:00 — 今日面试、今日到面、本月入职、当前在职
 * 月报: 每周六 18:00 — 当月报名、本月入职、累计在职
 */
const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();
const _ = db.command;

function success(data = null, message = 'success') {
  return { code: 0, message, data };
}
function error(code = 1, message = 'error', data = null) {
  return { code, message, data };
}

exports.main = async (event = {}) => {
  const { action } = event;
  const isTimer = process.env.TRIGGER_SRC === 'timer';

  try {
    if (action === 'weekly-report') return await weeklyReport();
    if (action === 'test') return await sendTestMessage();
    if (action === 'daily-report' || isTimer || !action) return await dailyReport();
    return error(400, '不支持的操作');
  } catch (err) {
    console.error('[stats-report] error:', err);
    return error(500, err.message || String(err));
  }
};

function getTimeInfo() {
  const now = new Date();
  const offset = 8 * 60 * 60 * 1000;
  const cnNow = new Date(now.getTime() + offset);
  const year = cnNow.getUTCFullYear();
  const monthIndex = cnNow.getUTCMonth();
  const date = cnNow.getUTCDate();
  const hour = cnNow.getUTCHours();
  const minute = cnNow.getUTCMinutes();
  const todayStart = new Date(Date.UTC(year, monthIndex, date) - offset);
  const monthStart = new Date(Date.UTC(year, monthIndex, 1) - offset);
  const dateStr = `${year}-${String(monthIndex + 1).padStart(2, '0')}-${String(date).padStart(2, '0')}`;
  const monthStartStr = `${year}-${String(monthIndex + 1).padStart(2, '0')}-01`;
  const timeStr = `${dateStr} ${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
  const monthStr = `${year}年${monthIndex + 1}月`;
  return { todayStart, monthStart, monthStartStr, dateStr, timeStr, monthStr, year, month: monthIndex + 1 };
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

async function getAll(collection, where = {}) {
  const MAX = 100;
  const all = [];
  let offset = 0;
  while (true) {
    const res = await db.collection(collection).where(where).skip(offset).limit(MAX).get();
    all.push(...(res.data || []));
    if (!res.data || res.data.length < MAX) break;
    offset += MAX;
  }
  return all;
}

async function getEmployeesMap(employeeIds = []) {
  const ids = [...new Set(employeeIds.filter(Boolean))];
  const map = new Map();
  for (let i = 0; i < ids.length; i += 100) {
    const docs = await getAll('employees', { _id: _.in(ids.slice(i, i + 100)) });
    docs.forEach((item) => map.set(item._id, item));
  }
  return map;
}

function getApplicationRecommender(item = {}) {
  return item.recommender_name || '自然流量';
}

function getRelationRecommender(item = {}) {
  return item.referrer_name || '自然流量';
}

function groupCount(rows = [], getName = () => '自然流量') {
  const map = {};
  for (const row of rows) {
    const name = getName(row) || '自然流量';
    map[name] = (map[name] || 0) + 1;
  }
  return map;
}

function dedupeRelationsByIdCard(relations = [], employeesMap = new Map()) {
  const seen = new Set();
  const result = [];
  for (const relation of relations) {
    const employee = employeesMap.get(relation.employee_id) || {};
    const key = String(employee.id_card || relation.employee_id || relation._id || '').trim().toUpperCase();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    result.push({ ...relation, employee });
  }
  return result;
}

function isActiveRelation(relation, todayStr) {
  if (!relation || !relation.employee_id) return false;
  const status = String(relation.status || '').trim().toLowerCase();
  if (status && status !== 'active') return false;
  const joinDate = toDateStr(relation.join_date);
  const leaveDate = toDateStr(relation.leave_date);
  if (joinDate && joinDate > todayStr) return false;
  if (leaveDate && leaveDate < todayStr) return false;
  return true;
}

function mergeGroups(...groups) {
  const allNames = new Set();
  for (const g of groups) Object.keys(g).forEach((k) => allNames.add(k));
  const names = [...allNames].filter((n) => n !== '自然流量').sort();
  if (allNames.has('自然流量')) names.push('自然流量');
  return names;
}

async function getRecommenderWhitelist() {
  try {
    const res = await cloud.callFunction({ name: 'system', data: { action: 'get-config', key: 'report_recommender_list' } });
    const config = res.result?.data || {};
    const val = config.report_recommender_list;
    return Array.isArray(val) ? val : [];
  } catch (err) {
    console.warn('[stats-report] 获取白名单失败，将展示全部:', err.message);
    return [];
  }
}

function filterByWhitelist(names, whitelist) {
  if (!whitelist || whitelist.length === 0) return names;
  return names.filter((n) => whitelist.includes(n));
}

async function acquireReportLock(reportKey) {
  const exists = await db.collection('notification_logs')
    .where({ type: 'stats-report-lock', report_key: reportKey, status: 'sent' })
    .limit(1)
    .get();
  if (exists.data?.length) return false;
  await db.collection('notification_logs').add({
    data: {
      type: 'stats-report-lock',
      report_key: reportKey,
      status: 'sent',
      created_at: db.serverDate()
    }
  });
  return true;
}

async function dailyReport() {
  const { monthStartStr, dateStr, timeStr } = getTimeInfo();
  const reportKey = `daily:${dateStr}`;
  const locked = await acquireReportLock(reportKey);
  if (!locked) return success({ skipped: true, report_key: reportKey }, '日报已推送，跳过重复发送');

  const whitelist = await getRecommenderWhitelist();
  const [applications, relations] = await Promise.all([
    getAll('applications'),
    getAll('employee_companies')
  ]);
  const employeesMap = await getEmployeesMap(relations.map((item) => item.employee_id));

  const todayInterviews = applications.filter((item) => toDateStr(item.interview_time || item.expected_interview_time) === dateStr);
  const todayArrived = applications.filter((item) => (
    ['checked_in', 'onboarded'].includes(String(item.checkin_status || ''))
    && toDateStr(item.checkin_time || item.checked_in_at) === dateStr
  ));
  const monthOnboardRaw = relations.filter((item) => {
    const joinDate = toDateStr(item.join_date);
    return joinDate && joinDate >= monthStartStr && joinDate <= dateStr;
  });
  const activeRaw = relations.filter((item) => isActiveRelation(item, dateStr));

  const monthOnboard = dedupeRelationsByIdCard(monthOnboardRaw, employeesMap);
  const activeRelations = dedupeRelationsByIdCard(activeRaw, employeesMap);

  const todayInterview = groupCount(todayInterviews, getApplicationRecommender);
  const todayArrivedMap = groupCount(todayArrived, getApplicationRecommender);
  const monthOnboardMap = groupCount(monthOnboard, getRelationRecommender);
  const currentActive = groupCount(activeRelations, getRelationRecommender);
  const names = filterByWhitelist(mergeGroups(todayInterview, todayArrivedMap, monthOnboardMap, currentActive), whitelist);

  let content = `# 📊 HR日报 (${timeStr})\n\n`;
  content += `| 推荐人 | 今日面试 | 今日到面 | 本月入职 | 当前在职 |\n`;
  content += `| :--- | ---: | ---: | ---: | ---: |\n`;

  let totalInterview = 0, totalArrived = 0, totalOnboard = 0, totalActive = 0;
  for (const name of names) {
    const i = todayInterview[name] || 0;
    const a = todayArrivedMap[name] || 0;
    const o = monthOnboardMap[name] || 0;
    const c = currentActive[name] || 0;
    totalInterview += i;
    totalArrived += a;
    totalOnboard += o;
    totalActive += c;
    content += `| ${name} | ${i} | ${a} | ${o} | ${c} |\n`;
  }
  content += `| **合计** | **${totalInterview}** | **${totalArrived}** | **${totalOnboard}** | **${totalActive}** |\n`;
  if (!names.length) content = `# 📊 HR日报 (${timeStr})\n\n暂无数据`;

  await sendToWecom(content, reportKey);
  return success({ todayInterview: totalInterview, todayArrived: totalArrived, monthOnboard: totalOnboard, currentActive: totalActive }, '日报已推送');
}

async function weeklyReport() {
  const { monthStart, monthStartStr, dateStr, monthStr } = getTimeInfo();
  const reportKey = `weekly:${dateStr}`;
  const locked = await acquireReportLock(reportKey);
  if (!locked) return success({ skipped: true, report_key: reportKey }, '周报/月报已推送，跳过重复发送');

  const whitelist = await getRecommenderWhitelist();
  const [applications, relations] = await Promise.all([
    getAll('applications'),
    getAll('employee_companies')
  ]);
  const employeesMap = await getEmployeesMap(relations.map((item) => item.employee_id));

  const monthlyApply = applications.filter((item) => item.apply_time && new Date(item.apply_time) >= monthStart);
  const monthlyOnboardRaw = relations.filter((item) => {
    const joinDate = toDateStr(item.join_date);
    return joinDate && joinDate >= monthStartStr && joinDate <= dateStr;
  });
  const activeRaw = relations.filter((item) => isActiveRelation(item, dateStr));
  const monthlyOnboard = dedupeRelationsByIdCard(monthlyOnboardRaw, employeesMap);
  const activeRelations = dedupeRelationsByIdCard(activeRaw, employeesMap);

  const monthApply = groupCount(monthlyApply, getApplicationRecommender);
  const monthOnboard = groupCount(monthlyOnboard, getRelationRecommender);
  const currentActive = groupCount(activeRelations, getRelationRecommender);
  const names = filterByWhitelist(mergeGroups(monthApply, monthOnboard, currentActive), whitelist);

  let content = `# 📈 HR月报 (${monthStr})\n\n`;
  content += `| 推荐人 | 当月报名 | 本月入职 | 累计在职 |\n`;
  content += `| :--- | ---: | ---: | ---: |\n`;
  let totalApply = 0, totalOnboard = 0, totalActive = 0;
  for (const name of names) {
    const a = monthApply[name] || 0;
    const o = monthOnboard[name] || 0;
    const c = currentActive[name] || 0;
    totalApply += a;
    totalOnboard += o;
    totalActive += c;
    content += `| ${name} | ${a} | ${o} | ${c} |\n`;
  }
  content += `| **合计** | **${totalApply}** | **${totalOnboard}** | **${totalActive}** |\n`;
  if (!names.length) content = `# 📈 HR月报 (${monthStr})\n\n暂无数据`;

  await sendToWecom(content, reportKey);
  return success({ monthApply: totalApply, monthOnboard: totalOnboard, currentActive: totalActive }, '月报已推送');
}

async function sendTestMessage() {
  const { timeStr } = getTimeInfo();
  const content = `# 📊 HR日报测试 (${timeStr})\n\n| 推荐人 | 今日面试 | 今日到面 | 本月入职 | 当前在职 |\n| :--- | ---: | ---: | ---: | ---: |\n| 张三 | 3 | 1 | 2 | 15 |\n| 李四 | 2 | 0 | 1 | 8 |\n| 自然流量 | 2 | 2 | 0 | 5 |\n| **合计** | **7** | **3** | **3** | **28** |`;
  await sendToWecom(content, `test:${Date.now()}`);
  return success(null, '测试消息已推送');
}

async function sendToWecom(content, reportKey = '') {
  return cloud.callFunction({
    name: 'notification',
    data: {
      action: 'send-wecom',
      webhook_key: 'wecom_webhook_report',
      msg_type: 'markdown_v2',
      content,
      report_key: reportKey
    }
  });
}
