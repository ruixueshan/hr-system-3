const cloud = require('wx-server-sdk');

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

const db = cloud.database();
const _ = db.command;

const ADMIN_ROLES = ['gm', 'deputy', 'finance'];
const MIN_WITHDRAW_FEN = 1;
const AUTO_APPROVE_WITHDRAW_LIMIT_FEN = 1000000;
const WECHAT_WITHDRAW_SINGLE_LIMIT_FEN = 500000;
const WECHAT_WITHDRAW_DAILY_LIMIT_FEN = 1000000;
const ACTIVE_WITHDRAW_STATUSES = ['APPLIED', 'RISK_REVIEW', 'APPROVED', 'PAYING', 'SUCCESS'];

function success(data = null, message = 'success') {
  return { code: 0, message, data };
}

function error(code = 1, message = 'error', data = null) {
  return { code, message, data };
}

function normalizeText(value) {
  return String(value || '').trim();
}

// ─── JWT 验证（兼容 Web 端 auth-web-login 云函数生成的 JWT token）───
function isJwtToken(token) {
  return typeof token === 'string' && token.split('.').length === 3;
}

function getJwtSecret() {
  const secret = String(process.env.JWT_SECRET || '');
  if (secret.length < 32) return '';
  return secret;
}

function signJwt(content, secret) {
  return require('crypto').createHmac('sha256', secret).update(content).digest('base64url');
}

function toBase64Url(text) {
  return Buffer.from(text).toString('base64url');
}

function fromBase64Url(text) {
  return Buffer.from(text, 'base64url').toString();
}

function verifyJwtInternal(token) {
  const [headerB64, bodyB64, signature] = token.split('.');
  const secret = getJwtSecret();
  if (!secret) return null;
  const expectedSignature = signJwt(`${headerB64}.${bodyB64}`, secret);
  const sigBuf = Buffer.from(signature);
  const expBuf = Buffer.from(expectedSignature);
  if (sigBuf.length !== expBuf.length || !require('crypto').timingSafeEqual(sigBuf, expBuf)) {
    return null;
  }
  try {
    const payload = JSON.parse(fromBase64Url(bodyB64));
    if (payload.exp < Math.floor(Date.now() / 1000)) return null;
    return payload;
  } catch {
    return null;
  }
}

async function verifyJwtUser(token) {
  const payload = verifyJwtInternal(token);
  if (!payload || !payload.uid) return null;
  try {
    const userRes = await db.collection('users').doc(payload.uid).get();
    return userRes.data || null;
  } catch {
    return null;
  }
}

function nowCompact() {
  const d = new Date(Date.now() + 8 * 60 * 60 * 1000);
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}`;
}

function randomSuffix(len = 8) {
  return Math.random().toString(36).slice(2, 2 + len).toUpperCase().padEnd(len, '0');
}

function buildWithdrawNo() {
  return `WD${nowCompact()}${randomSuffix(6)}`;
}

function buildOutBatchNo() {
  return `WB${nowCompact()}${randomSuffix(6)}`;
}

function buildOutDetailNo(outBatchNo) {
  return `${outBatchNo}D1`;
}

function normalizeClientRequestId(value) {
  return normalizeText(value).replace(/[^0-9A-Za-z_-]/g, '').slice(0, 64);
}

function toFen(value) {
  if (value === undefined || value === null || value === '') return 0;
  const text = String(value).trim();
  if (!text) return 0;
  if (/^-?\d+$/.test(text)) {
    return Number(text);
  }
  const num = Number(text);
  if (!Number.isFinite(num)) return 0;
  return Math.round(num * 100);
}

function fenToYuan(fen) {
  return (Number(fen || 0) / 100).toFixed(2);
}

function getBeijingDayRange(date = new Date()) {
  const beijingNow = new Date(date.getTime() + 8 * 60 * 60 * 1000);
  const startUtcMs = Date.UTC(
    beijingNow.getUTCFullYear(),
    beijingNow.getUTCMonth(),
    beijingNow.getUTCDate()
  ) - 8 * 60 * 60 * 1000;
  return {
    start: new Date(startUtcMs),
    end: new Date(startUtcMs + 24 * 60 * 60 * 1000)
  };
}

function toMillis(value) {
  if (!value) return 0;
  if (value instanceof Date) return value.getTime();
  if (typeof value === 'number') return value;
  if (typeof value === 'string') return Date.parse(value) || 0;
  if (value.$date) return toMillis(value.$date);
  if (typeof value.toDate === 'function') return value.toDate().getTime();
  return 0;
}

function maskName(name) {
  const text = normalizeText(name);
  if (!text) return '';
  if (text.length <= 1) return '*';
  return `${text[0]}${'*'.repeat(Math.max(1, text.length - 1))}`;
}

async function verifyToken(token) {
  if (!token) return null;

  // 方式一：查 login_tokens 表（小程序 token，随机 hex 字符串）
  const tokenRes = await db.collection('login_tokens').where({ token, status: 'logged' }).limit(1).get();
  const record = tokenRes.data && tokenRes.data[0];
  if (record && Date.now() <= Number(record.expire_time || 0)) {
    const userRes = await db.collection('users').doc(record.user_id).get();
    if (userRes.data) return userRes.data;
  }

  // 方式二：JWT 自签名验证（Web 端 token，auth-web-login 生成的三段式 JWT）
  if (isJwtToken(token)) {
    const jwtUser = await verifyJwtUser(token);
    if (jwtUser) return jwtUser;
  }

  return null;
}

async function getCurrentUser(event, wxContext) {
  const tokenUser = await verifyToken(event.token).catch((err) => {
    console.warn('[wallet] token verify failed:', err && err.message);
    return null;
  });
  if (tokenUser) return tokenUser;

  if (!wxContext.OPENID) return null;
  const userRes = await db.collection('users').where({ openid: wxContext.OPENID }).limit(1).get();
  return userRes.data && userRes.data[0] ? userRes.data[0] : null;
}

function assertLogin(user) {
  if (!user) throw Object.assign(new Error('请先登录后再使用钱包'), { code: 401 });
}

function assertEmployeeBound(user) {
  if (!user.employee_id) throw Object.assign(new Error('当前账号未绑定员工档案，无法开通钱包'), { code: 400 });
}

function assertAdmin(user) {
  if (!user || !ADMIN_ROLES.includes(user.role)) {
    throw Object.assign(new Error('无提现审核权限'), { code: 403 });
  }
}

async function getEmployee(employeeId) {
  if (!employeeId) return null;
  const res = await db.collection('employees').doc(employeeId).get();
  return res.data || null;
}

async function findWalletByUser(user) {
  if (!user) return null;
  const conditions = [];
  if (user._id) conditions.push({ user_id: user._id });
  if (user.employee_id) conditions.push({ employee_id: user.employee_id });
  if (user.openid) conditions.push({ openid: user.openid });
  if (!conditions.length) return null;

  for (const condition of conditions) {
    const res = await db.collection('wallet_accounts').where(condition).limit(1).get();
    if (res.data && res.data[0]) return res.data[0];
  }
  return null;
}

async function createWalletAccount(user, employee, realName) {
  const payload = {
    user_id: user._id,
    employee_id: user.employee_id,
    openid: user.openid,
    available_amount: 0,
    frozen_amount: 0,
    total_income: 0,
    total_withdrawn: 0,
    currency: 'CNY',
    status: 'active',
    risk_level: 'normal',
    real_name_masked: maskName(realName || employee?.name || user.real_name || user.name),
    created_at: db.serverDate(),
    updated_at: db.serverDate()
  };
  const addRes = await db.collection('wallet_accounts').add({ data: payload });
  const walletId = addRes._id || addRes.id;
  return { _id: walletId, ...payload };
}

async function ensureWallet(user, options = {}) {
  assertLogin(user);
  assertEmployeeBound(user);
  if (!user.openid) throw Object.assign(new Error('当前账号缺少微信 openid，无法开通钱包'), { code: 400 });

  let wallet = await findWalletByUser(user);
  if (wallet) return wallet;

  const employee = await getEmployee(user.employee_id);
  if (!employee) throw Object.assign(new Error('员工档案不存在，无法开通钱包'), { code: 404 });

  wallet = await createWalletAccount(user, employee, options.realName);
  await db.collection('users').doc(user._id).update({
    data: {
      wallet_enabled: true,
      wallet_account_id: wallet._id,
      updated_at: db.serverDate()
    }
  }).catch((err) => console.warn('[wallet] update user wallet flag failed:', err && err.message));

  if (options.realName) {
    await db.collection('payout_profiles').add({
      data: {
        user_id: user._id,
        employee_id: user.employee_id,
        wallet_account_id: wallet._id,
        real_name_masked: maskName(options.realName),
        status: 'active',
        created_at: db.serverDate(),
        updated_at: db.serverDate()
      }
    }).catch((err) => console.warn('[wallet] payout profile create skipped:', err && err.message));

    if (employee) {
      await db.collection('employees').doc(employee._id).update({
        data: {
          wechat_receiver_name: normalizeText(options.realName),
          updated_at: db.serverDate()
        }
      }).catch((err) => console.warn('[wallet] sync employee real name failed:', err && err.message));
    }
  }

  return wallet;
}

async function listRecentLedgers(walletAccountId, limit = 10, ledgerTypes = null) {
  if (!walletAccountId) return [];
  const where = { wallet_account_id: walletAccountId };
  if (Array.isArray(ledgerTypes) && ledgerTypes.length) {
    where.ledger_type = _.in(ledgerTypes);
  }
  const res = await db.collection('wallet_ledger')
    .where(where)
    .orderBy('created_at', 'desc')
    .limit(Math.min(Number(limit) || 10, 50))
    .get();
  return (res.data || []).map((item) => ({
    ...item,
    amount_yuan: fenToYuan(item.amount),
    balance_after_yuan: fenToYuan(item.balance_after),
    frozen_after_yuan: fenToYuan(item.frozen_after)
  }));
}

async function fetchEmployeeMap(employeeIds = []) {
  const ids = Array.from(new Set(employeeIds.filter(Boolean)));
  const map = new Map();
  for (let index = 0; index < ids.length; index += 100) {
    const chunk = ids.slice(index, index + 100);
    if (!chunk.length) continue;
    const res = await db.collection('employees').where({ _id: _.in(chunk) }).limit(chunk.length).get().catch(() => ({ data: [] }));
    for (const employee of res.data || []) {
      map.set(employee._id, employee);
    }
  }
  return map;
}

async function fetchPaymentOrderMap(paymentOrderIds = []) {
  const ids = Array.from(new Set(paymentOrderIds.filter(Boolean)));
  const map = new Map();
  for (let index = 0; index < ids.length; index += 100) {
    const chunk = ids.slice(index, index + 100);
    if (!chunk.length) continue;
    const res = await db.collection('payment_orders').where({ _id: _.in(chunk) }).limit(chunk.length).get().catch(() => ({ data: [] }));
    for (const payment of res.data || []) {
      map.set(payment._id, payment);
    }
  }
  return map;
}

function employeeDisplayName(employee, fallback = '') {
  return normalizeText(
    employee?.name
    || employee?.real_name
    || employee?.employee_name
    || employee?.nickname
    || fallback
  ) || '-';
}

async function getWalletAccountsSummary() {
  const $ = db.command.aggregate;

  try {
    const res = await db.collection('wallet_accounts')
      .aggregate()
      .match({ status: _.neq('deactivated') })
      .group({
        _id: null,
        activeWalletCount: $.sum(1),
        totalAvailable: $.sum('$available_amount'),
        totalFrozen: $.sum('$frozen_amount')
      })
      .end();

    const list = res.list || [];
    const summary = list[0] || { activeWalletCount: 0, totalAvailable: 0, totalFrozen: 0 };

    const totalAvailable = Number(summary.totalAvailable || 0);
    const totalFrozen = Number(summary.totalFrozen || 0);
    const count = Number(summary.activeWalletCount || 0);
    const totalUnwithdrawn = totalAvailable + totalFrozen;

    return {
      wallet_account_count: count,
      wallet_available_amount: totalAvailable,
      wallet_frozen_amount: totalFrozen,
      wallet_unwithdrawn_amount: totalUnwithdrawn,
      wallet_available_amount_yuan: fenToYuan(totalAvailable),
      wallet_frozen_amount_yuan: fenToYuan(totalFrozen),
      wallet_unwithdrawn_amount_yuan: fenToYuan(totalUnwithdrawn)
    };
  } catch (err) {
    console.error('[getWalletAccountsSummary] aggregate 失败，降级为循环遍历:', err);
    // 降级方案
    let totalAvailable = 0;
    let totalFrozen = 0;
    let activeWalletCount = 0;
    let offset = 0;

    while (offset < 10000) {
      const res = await db.collection('wallet_accounts')
        .skip(offset)
        .limit(100)
        .get();
      const list = res.data || [];
      for (const wallet of list) {
        if (wallet.status && wallet.status !== 'active') continue;
        activeWalletCount += 1;
        totalAvailable += Number(wallet.available_amount || 0);
        totalFrozen += Number(wallet.frozen_amount || 0);
      }
      if (list.length < 100) break;
      offset += 100;
    }

    return {
      wallet_account_count: activeWalletCount,
      wallet_available_amount: totalAvailable,
      wallet_frozen_amount: totalFrozen,
      wallet_unwithdrawn_amount: totalAvailable + totalFrozen,
      wallet_available_amount_yuan: fenToYuan(totalAvailable),
      wallet_frozen_amount_yuan: fenToYuan(totalFrozen),
      wallet_unwithdrawn_amount_yuan: fenToYuan(totalAvailable + totalFrozen)
    };
  }
}

async function getTodayWithdrawnFen(user) {
  if (!user || !user._id) return 0;
  const { start, end } = getBeijingDayRange();
  const startMs = start.getTime();
  const endMs = end.getTime();
  let total = 0;
  let skip = 0;

  while (skip < 1000) {
    const res = await db.collection('withdraw_orders')
      .where({ user_id: user._id, created_at: _.gte(start) })
      .orderBy('created_at', 'desc')
      .skip(skip)
      .limit(100)
      .get();
    const list = res.data || [];
    for (const item of list) {
      const createdAt = toMillis(item.created_at || item.apply_time);
      if (createdAt >= startMs && createdAt < endMs && ACTIVE_WITHDRAW_STATUSES.includes(String(item.status || ''))) {
        total += Number(item.amount || 0);
      }
    }
    if (list.length < 100) break;
    skip += 100;
  }

  return total;
}

function buildTransferAuthorizationSnapshot(employee, user) {
  const authorized = Boolean(employee?.wechat_transfer_authorized || user?.wechat_transfer_authorized);
  const status = authorized ? 'TAKING_EFFECT' : 'NONE';
  return {
    transfer_auth_status: status,
    transfer_auth_text: authorized ? '已开通免确认收款授权' : '未开通免确认收款授权',
    wechat_transfer_authorized: authorized,
    wechat_transfer_authorized_at: employee?.wechat_transfer_authorized_at || user?.wechat_transfer_authorized_at || '',
    wechat_receiver_name: employee?.wechat_receiver_name || employee?.name || user?.real_name || user?.name || ''
  };
}

async function listRecentWithdrawOrders(user, limit = 3) {
  if (!user || !user._id) return [];
  const res = await db.collection('withdraw_orders')
    .where({ user_id: user._id })
    .orderBy('created_at', 'desc')
    .limit(Math.min(Math.max(Number(limit) || 3, 1), 20))
    .get();
  return (res.data || []).map((item) => ({
    ...item,
    amount_yuan: fenToYuan(item.amount)
  }));
}

async function findWithdrawByClientRequest(user, clientRequestId) {
  if (!user?._id || !clientRequestId) return null;
  const res = await db.collection('withdraw_orders')
    .where({ user_id: user._id, client_request_id: clientRequestId })
    .limit(1)
    .get()
    .catch(() => ({ data: [] }));
  return res.data && res.data[0] ? res.data[0] : null;
}

async function getActiveTransferAuthorization(user) {
  if (!user) return null;
  const conditions = [];
  if (user._id) conditions.push({ user_id: user._id, status: 'TAKING_EFFECT' });
  if (user.openid) conditions.push({ openid: user.openid, status: 'TAKING_EFFECT' });

  for (const condition of conditions) {
    const res = await db.collection('wxpay_transfer_authorizations')
      .where(condition)
      .orderBy('updated_at', 'desc')
      .limit(1)
      .get()
      .catch(() => ({ data: [] }));
    if (res.data && res.data[0]) return res.data[0];
  }
  return null;
}

// ========= handleAdminCredit: 管理员手工入账（用于一键发薪-微信发薪） =========
async function handleAdminCredit(event, user) {
  const { employee_id, amount, source, source_id, remark } = event;
  if (!employee_id) return error(400, '缺少员工ID');
  const creditAmountFen = toFen(amount);
  if (creditAmountFen <= 0) return error(400, '入账金额必须大于0');

  try {
    // 先用 employee_id 查找钱包
    let wallet = await db.collection('wallet_accounts').where({ employee_id }).limit(1).get()
      .then(r => r.data && r.data[0]);

    // 如果钱包不存在则创建一个最小钱包（管理端入账不依赖 openid）
    if (!wallet) {
      const employee = await getEmployee(employee_id).catch(() => null);
      const walletPayload = {
        employee_id,
        available_amount: 0,
        frozen_amount: 0,
        total_income: 0,
        total_withdrawn: 0,
        currency: 'CNY',
        status: 'active',
        risk_level: 'normal',
        real_name_masked: employee?.name ? maskName(employee.name) : '',
        created_at: db.serverDate(),
        updated_at: db.serverDate()
      };
      if (employee?.user_id) walletPayload.user_id = employee.user_id;
      const addRes = await db.collection('wallet_accounts').add({ data: walletPayload });
      wallet = { _id: addRes._id || addRes.id, ...walletPayload };
    }

    // 事务入账
    await db.runTransaction(async (transaction) => {
      const walletDoc = await transaction.collection('wallet_accounts').doc(wallet._id).get();
      const currentWallet = walletDoc.data;
      const newAvailable = (currentWallet.available_amount || 0) + creditAmountFen;
      const newTotalIncome = (currentWallet.total_income || 0) + creditAmountFen;

      await transaction.collection('wallet_accounts').doc(wallet._id).update({
        data: {
          available_amount: newAvailable,
          total_income: newTotalIncome,
          updated_at: db.serverDate()
        }
      });

      await transaction.collection('wallet_ledger').add({
        data: {
          wallet_account_id: wallet._id,
          employee_id,
          ledger_type: 'SALARY_CREDIT',
          amount: creditAmountFen,
          balance_before: currentWallet.available_amount || 0,
          balance_after: newAvailable,
          source,
          source_id,
          remark: remark || '薪资入账',
          created_at: db.serverDate()
        }
      });
    });

    return success({
      wallet_account_id: wallet._id,
      amount_credited: creditAmountFen,
      amount_credited_yuan: fenToYuan(creditAmountFen)
    }, '入账成功');
  } catch (err) {
    console.error('[handleAdminCredit] 入账失败:', err);
    return error(500, err.message || '入账失败');
  }
}

// ========= unfreezeWithdrawOrder: 统一解冻回滚（幂等安全）=========
async function unfreezeWithdrawOrder(
  withdrawOrderId,
  walletAccountId,
  userId,
  employeeId,
  withdrawNo,
  amountFen,
  reason,
  ledgerType,
  createdBy
) {
  const safeAmount = Math.max(0, Number(amountFen || 0));

  await db.runTransaction(async (transaction) => {
    const orderDoc = await transaction.collection('withdraw_orders').doc(withdrawOrderId).get();
    const order = orderDoc.data || null;
    if (!order) throw new Error('提现单不存在');
    // 幂等保护：已是终态则跳过
    if (['SUCCESS', 'FAILED', 'CLOSED'].includes(order.status)) return;

    const walletDoc = await transaction.collection('wallet_accounts').doc(walletAccountId).get();
    const wallet = walletDoc.data || null;
    if (!wallet) throw new Error('钱包账户不存在');

    const balanceBefore = Number(wallet.available_amount || 0);
    const frozenBefore = Number(wallet.frozen_amount || 0);

    await transaction.collection('wallet_accounts').doc(walletAccountId).update({
      data: {
        available_amount: _.inc(safeAmount),
        frozen_amount: _.inc(-safeAmount),
        updated_at: db.serverDate()
      }
    });

    const ledgerAdd = await transaction.collection('wallet_ledger').add({
      data: {
        wallet_account_id: walletAccountId,
        user_id: userId,
        employee_id: employeeId,
        ledger_type: ledgerType,
        direction: 'unfreeze',
        amount: safeAmount,
        balance_before: balanceBefore,
        balance_after: balanceBefore + safeAmount,
        frozen_before: frozenBefore,
        frozen_after: Math.max(0, frozenBefore - safeAmount),
        source_type: 'withdraw',
        source_id: withdrawNo,
        withdraw_order_id: withdrawOrderId,
        remark: reason || '提现失败解冻',
        created_by: createdBy || 'system',
        created_at: db.serverDate()
      }
    });

    await transaction.collection('withdraw_orders').doc(withdrawOrderId).update({
      data: {
        status: 'FAILED',
        fail_reason: reason || '提现失败',
        failed_ledger_id: ledgerAdd._id || ledgerAdd.id || '',
        finished_at: db.serverDate(),
        updated_at: db.serverDate()
      }
    });
  });
}

// ========= handleUnfreeze: 供外部云函数（如 payment-proxy）调用的解冻入口 =========
async function handleUnfreeze(event, user) {
  const {
    withdraw_order_id,
    wallet_account_id,
    user_id,
    employee_id,
    withdraw_no,
    amount,
    reason,
    ledger_type,
    created_by
  } = event;
  if (!withdraw_order_id) return error(400, '缺少提现单ID');
  if (!wallet_account_id) return error(400, '缺少钱包账户ID');
  if (!amount) return error(400, '缺少解冻金额');

  try {
    await unfreezeWithdrawOrder(
      withdraw_order_id,
      wallet_account_id,
      user_id || '',
      employee_id || '',
      withdraw_no || '',
      toFen(amount),
      reason || '外部调用解冻',
      ledger_type || 'WITHDRAW_EXTERNAL_UNFREEZE',
      created_by || 'system'
    );
    return success({ withdraw_order_id }, '解冻成功');
  } catch (err) {
    console.error('[handleUnfreeze] 解冻失败:', err);
    return error(500, err.message || '解冻失败');
  }
}

async function handleBind(event, user) {
  const realName = normalizeText(event.realName || event.real_name || event.name);
  if (!realName) return error(400, '请输入真实姓名');
  const wallet = await ensureWallet(user, { realName });
  return success({
    wallet_account_id: wallet._id,
    wallet_enabled: true,
    available_amount: wallet.available_amount || 0,
    available_amount_yuan: fenToYuan(wallet.available_amount)
  }, '钱包已开通');
}

async function handleGetSummary(event, user) {
  assertLogin(user);
  const [wallet, employee, todayWithdrawnFen] = await Promise.all([
    findWalletByUser(user),
    getEmployee(user.employee_id).catch(() => null),
    getTodayWithdrawnFen(user)
  ]);
  const todayRemainingFen = Math.max(0, WECHAT_WITHDRAW_DAILY_LIMIT_FEN - todayWithdrawnFen);
  const authSnapshot = buildTransferAuthorizationSnapshot(employee, user);
  const withdrawLimit = event.withdrawLimit || event.withdraw_limit || 10;
  const recentWithdrawOrdersPromise = listRecentWithdrawOrders(user, withdrawLimit);
  if (!wallet) {
    return success({
      wallet_enabled: false,
      available_amount: 0,
      frozen_amount: 0,
      total_income: 0,
      total_withdrawn: 0,
      available_amount_yuan: '0.00',
      frozen_amount_yuan: '0.00',
      total_income_yuan: '0.00',
      total_withdrawn_yuan: '0.00',
      today_withdrawn: todayWithdrawnFen,
      today_remaining: todayRemainingFen,
      today_withdrawn_yuan: fenToYuan(todayWithdrawnFen),
      today_remaining_yuan: fenToYuan(todayRemainingFen),
      ledgers: [],
      withdraw_orders: await recentWithdrawOrdersPromise,
      ...authSnapshot
    });
  }

  const ledgerTypes = event.ledger_types;
  const [ledgers, withdrawOrders] = await Promise.all([
    listRecentLedgers(wallet._id, event.limit || 10, ledgerTypes),
    recentWithdrawOrdersPromise
  ]);
  return success({
    wallet_enabled: wallet.status === 'active',
    wallet_account_id: wallet._id,
    status: wallet.status || 'active',
    risk_level: wallet.risk_level || 'normal',
    available_amount: wallet.available_amount || 0,
    frozen_amount: wallet.frozen_amount || 0,
    total_income: wallet.total_income || 0,
    total_withdrawn: wallet.total_withdrawn || 0,
    available_amount_yuan: fenToYuan(wallet.available_amount),
    frozen_amount_yuan: fenToYuan(wallet.frozen_amount),
    total_income_yuan: fenToYuan(wallet.total_income),
    total_withdrawn_yuan: fenToYuan(wallet.total_withdrawn),
    today_withdrawn: todayWithdrawnFen,
    today_remaining: todayRemainingFen,
    today_withdrawn_yuan: fenToYuan(todayWithdrawnFen),
    today_remaining_yuan: fenToYuan(todayRemainingFen),
    ledgers,
    withdraw_orders: withdrawOrders,
    ...authSnapshot
  });
}

async function checkWithdrawRisk(user, wallet, amountFen) {
  if (wallet.status !== 'active') return { blocked: true, message: '钱包状态不可提现' };
  if (wallet.risk_level === 'blocked') return { blocked: true, message: '钱包风控限制提现' };

  if (amountFen > WECHAT_WITHDRAW_SINGLE_LIMIT_FEN) {
    return { blocked: true, message: '微信发薪提现单笔不能超过 5000 元，大额发薪请选择银行代发' };
  }

  const todayWithdrawnFen = await getTodayWithdrawnFen(user);
  if (todayWithdrawnFen + amountFen > WECHAT_WITHDRAW_DAILY_LIMIT_FEN) {
    return {
      blocked: true,
      message: `今日微信提现剩余额度 ${fenToYuan(Math.max(0, WECHAT_WITHDRAW_DAILY_LIMIT_FEN - todayWithdrawnFen))} 元，大额发薪请选择银行代发`
    };
  }

  const employee = await getEmployee(user.employee_id);
  if (employee && employee.is_blacklisted) return { blocked: true, message: '员工已被列入黑名单，禁止提现' };

  if (amountFen >= AUTO_APPROVE_WITHDRAW_LIMIT_FEN) {
    return { manualReview: true, reason: '单笔提现达到 1 万元，需人工复核' };
  }

  return { passed: true };
}

async function handleApplyWithdraw(event, user) {
  assertLogin(user);
  const amountFen = toFen(event.amount_fen !== undefined ? event.amount_fen : event.amount);
  if (amountFen < MIN_WITHDRAW_FEN) return error(400, '提现金额必须大于 0');
  const clientRequestId = normalizeClientRequestId(event.client_request_id || event.clientRequestId);

  const existingWithdraw = await findWithdrawByClientRequest(user, clientRequestId);
  if (existingWithdraw) {
    if (Number(existingWithdraw.amount || 0) !== amountFen) {
      return error(409, '请勿复用提现请求号，请刷新后重试');
    }
    const existingResponseStatus = existingWithdraw.status === 'PAYING' && existingWithdraw.payment_order_id
      ? 'APPROVED'
      : existingWithdraw.status;
    return success({
      withdraw_order_id: existingWithdraw._id,
      withdraw_no: existingWithdraw.withdraw_no,
      payment_order_id: existingWithdraw.payment_order_id || '',
      status: existingResponseStatus,
      actual_status: existingWithdraw.status,
      risk_status: existingWithdraw.risk_status || '',
      amount: existingWithdraw.amount || 0,
      amount_yuan: fenToYuan(existingWithdraw.amount),
      auto_payment_status: existingWithdraw.payment_order_id ? 'queued' : '',
      auto_payment_message: existingWithdraw.payment_order_id ? '提现申请已入队，系统正在打款' : '',
      message: '提现申请已提交，请勿重复提交'
    }, '提现申请已提交');
  }

  const wallet = await ensureWallet(user);
  const available = Number(wallet.available_amount || 0);
  if (available < amountFen) return error(400, '可提现余额不足');

  const risk = await checkWithdrawRisk(user, wallet, amountFen);
  if (risk.blocked) return error(403, risk.message || '提现被风控阻断');

  const employee = await getEmployee(user.employee_id).catch(() => null);
  const withdrawRealName = normalizeText(employee?.wechat_receiver_name || employee?.name || user.real_name || user.name);

  const withdrawNo = buildWithdrawNo();
  const status = risk.manualReview ? 'RISK_REVIEW' : 'APPROVED';
  const riskStatus = risk.manualReview ? 'manual_review' : 'passed';
  const shouldQueuePayment = status === 'APPROVED' && amountFen < AUTO_APPROVE_WITHDRAW_LIMIT_FEN;
  const authorization = shouldQueuePayment ? await getActiveTransferAuthorization(user) : null;
  if (shouldQueuePayment && !authorization) {
    return error(428, '员工尚未完成微信零钱免确认收款授权，不能发起自动打款');
  }
  let withdrawId = '';
  let paymentOrderId = '';
  const outBatchNo = shouldQueuePayment ? buildOutBatchNo() : '';
  const outDetailNo = shouldQueuePayment ? buildOutDetailNo(outBatchNo) : '';

  await db.runTransaction(async (transaction) => {
    const latestWalletDoc = await transaction.collection('wallet_accounts').doc(wallet._id).get();
    const latestWallet = latestWalletDoc.data || null;
    if (!latestWallet) throw new Error('钱包账户不存在');
    if (Number(latestWallet.available_amount || 0) < amountFen) throw new Error('可提现余额不足');

    const withdrawAdd = await transaction.collection('withdraw_orders').add({
      data: {
        withdraw_no: withdrawNo,
        wallet_account_id: wallet._id,
        user_id: user._id,
        employee_id: user.employee_id,
        openid: user.openid,
        amount: amountFen,
        real_name: withdrawRealName,
        status: shouldQueuePayment ? 'PAYING' : status,
        risk_status: riskStatus,
        risk_reason: risk.reason || '',
        fail_reason: '',
        client_request_id: clientRequestId,
        payment_async: shouldQueuePayment,
        apply_time: db.serverDate(),
        created_at: db.serverDate(),
        updated_at: db.serverDate()
      }
    });
    withdrawId = withdrawAdd._id || withdrawAdd.id;

    const balanceBefore = Number(latestWallet.available_amount || 0);
    const frozenBefore = Number(latestWallet.frozen_amount || 0);
    await transaction.collection('wallet_accounts').doc(wallet._id).update({
      data: {
        available_amount: _.inc(-amountFen),
        frozen_amount: _.inc(amountFen),
        updated_at: db.serverDate()
      }
    });

    await transaction.collection('wallet_ledger').add({
      data: {
        wallet_account_id: wallet._id,
        user_id: user._id,
        employee_id: user.employee_id,
        ledger_type: 'WITHDRAW_FREEZE',
        direction: 'freeze',
        amount: amountFen,
        balance_before: balanceBefore,
        balance_after: balanceBefore - amountFen,
        frozen_before: frozenBefore,
        frozen_after: frozenBefore + amountFen,
        source_type: 'withdraw',
        source_id: withdrawNo,
        withdraw_order_id: withdrawId,
        remark: '提现申请冻结',
        created_by: user._id,
        created_at: db.serverDate()
      }
    });

    if (shouldQueuePayment) {
      const paymentAdd = await transaction.collection('payment_orders').add({
        data: {
          withdraw_order_id: withdrawId,
          out_batch_no: outBatchNo,
          out_detail_no: outDetailNo,
          out_bill_no: outBatchNo,
          transfer_scene_id: '1005',
          user_recv_perception: '劳务报酬',
          transfer_scene_report_infos: [
            { info_type: '岗位类型', info_content: '灵活用工' },
            { info_type: '报酬说明', info_content: '劳务报酬' }
          ],
          out_authorization_no: authorization.out_authorization_no || '',
          authorization_id: authorization.authorization_id || '',
          wx_batch_id: '',
          wx_detail_id: '',
          wx_transfer_bill_no: '',
          appid: process.env.WX_APP_ID || '',
          mchid: process.env.WX_MCH_ID || '',
          openid: user.openid,
          amount: amountFen,
          status: 'CREATED',
          wx_state: '',
          client_request_id: clientRequestId,
          request_snapshot: {
            out_batch_no: outBatchNo,
            out_detail_no: outDetailNo,
            out_bill_no: outBatchNo,
            transfer_scene_id: '1005',
            out_authorization_no: authorization.out_authorization_no || '',
            authorization_id: authorization.authorization_id || '',
            amount: amountFen
          },
          response_snapshot: null,
          fail_code: '',
          fail_reason: '',
          first_unknown_at: null,
          query_fail_count: 0,
          last_query_error: '',
          created_at: db.serverDate(),
          updated_at: db.serverDate()
        }
      });
      paymentOrderId = paymentAdd._id || paymentAdd.id;
      await transaction.collection('withdraw_orders').doc(withdrawId).update({
        data: {
          payment_order_id: paymentOrderId,
          updated_at: db.serverDate()
        }
      });
    }
  });

  const finalStatus = shouldQueuePayment ? 'PAYING' : status;
  // 对旧版小程序保持兼容：旧前端只在 APPROVED 时展示"打款处理中"并跳过二次触发。
  const responseStatus = shouldQueuePayment ? 'APPROVED' : finalStatus;
  const autoPaymentStatus = shouldQueuePayment ? 'queued' : '';
  const autoPaymentMessage = shouldQueuePayment ? '提现申请已入队，系统正在打款' : '';

  return success({
    withdraw_order_id: withdrawId,
    withdraw_no: withdrawNo,
    payment_order_id: paymentOrderId,
    status: responseStatus,
    actual_status: finalStatus,
    risk_status: riskStatus,
    amount: amountFen,
    amount_yuan: fenToYuan(amountFen),
    auto_payment_status: autoPaymentStatus,
    auto_payment_message: autoPaymentMessage,
    message: shouldQueuePayment ? '提现申请已提交，系统正在后台打款' : '提现申请已提交，等待人工审核'
  }, shouldQueuePayment ? '提现申请已提交' : '提现申请需人工审核');
}

async function listWithdrawOrders(event, user) {
  assertLogin(user);
  const page = Math.max(1, Number(event.page || 1));
  const pageSize = Math.min(50, Math.max(1, Number(event.pageSize || 20)));
  const where = ADMIN_ROLES.includes(user.role) && event.admin ? {} : { user_id: user._id };
  if (event.status) where.status = event.status;

  const [countRes, listRes] = await Promise.all([
    db.collection('withdraw_orders').where(where).count(),
    db.collection('withdraw_orders').where(where).orderBy('created_at', 'desc').skip((page - 1) * pageSize).limit(pageSize).get()
  ]);
  const rawList = listRes.data || [];
  const [employeeMap, paymentMap] = await Promise.all([
    fetchEmployeeMap(rawList.map((item) => item.employee_id)),
    fetchPaymentOrderMap(rawList.map((item) => item.payment_order_id))
  ]);

  return success({
    list: rawList.map((item) => {
      const employee = employeeMap.get(item.employee_id);
      const payment = paymentMap.get(item.payment_order_id) || {};
      return {
        ...item,
        employee_name: employeeDisplayName(employee, item.employee_name),
        employee_no: employee?.employee_no || employee?.employee_id || '',
        payment_status: payment.status || '',
        payment_out_bill_no: payment.out_bill_no || payment.out_batch_no || '',
        payment_fail_reason: payment.fail_reason || '',
        payment_last_query_error: payment.last_query_error || '',
        payment_last_query_at: payment.last_query_at || null,
        payment_query_fail_count: Number(payment.query_fail_count || 0),
        amount_yuan: fenToYuan(item.amount)
      };
    }),
    total: countRes.total || 0,
    page,
    pageSize
  });
}

async function getManagementSummary(event, user) {
  assertLogin(user);
  assertAdmin(user);
  return success(await getWalletAccountsSummary());
}

async function adminListWalletAccounts(event, user) {
  assertLogin(user);
  assertAdmin(user);

  const page = Math.max(1, Number(event.page || 1));
  const pageSize = Math.min(50, Math.max(1, Number(event.pageSize || 20)));
  const keyword = normalizeText(event.keyword);
  const status = normalizeText(event.status);

  // 构建查询条件
  const where = {};
  if (status) where.status = status;

  // 模糊搜索员工（姓名/工号/手机号）
  if (keyword) {
    const empRegex = new RegExp(keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
    const empRes = await db.collection('employees')
      .where(_.or([
        { name: empRegex },
        { employee_no: empRegex },
        { phone: empRegex }
      ]))
      .limit(200)
      .get()
      .catch(() => ({ data: [] }));

    const empIds = (empRes.data || []).map(e => e._id).filter(Boolean);
    if (!empIds.length) {
      // 没有匹配员工，直接返回空
      return success({ list: [], total: 0, page, pageSize });
    }
    where.employee_id = _.in(empIds);
  }

  const [countRes, listRes] = await Promise.all([
    db.collection('wallet_accounts').where(where).count(),
    db.collection('wallet_accounts').where(where).orderBy('created_at', 'desc').skip((page - 1) * pageSize).limit(pageSize).get()
  ]);

  const rawList = listRes.data || [];
  const employeeIds = rawList.map(item => item.employee_id).filter(Boolean);
  const employeeMap = await fetchEmployeeMap(employeeIds);

  const list = rawList.map(item => {
    const employee = employeeMap.get(item.employee_id);
    return {
      wallet_account_id: item._id,
      employee_id: item.employee_id,
      employee_name: employeeDisplayName(employee),
      employee_no: (employee && employee.employee_no) || '',
      phone: (employee && employee.phone) || '',
      status: item.status || 'active',
      available_amount: Number(item.available_amount || 0),
      frozen_amount: Number(item.frozen_amount || 0),
      available_amount_yuan: fenToYuan(item.available_amount),
      frozen_amount_yuan: fenToYuan(item.frozen_amount),
      created_at: item.created_at
    };
  });

  return success({ list, total: countRes.total || 0, page, pageSize });
}

async function getWithdrawOrder(event, user) {
  assertLogin(user);
  const id = event.id || event.withdraw_order_id;
  if (!id) return error(400, '缺少提现单 ID');
  const doc = await db.collection('withdraw_orders').doc(id).get();
  const order = doc.data || null;
  if (!order) return error(404, '提现单不存在');
  if (order.user_id !== user._id && !ADMIN_ROLES.includes(user.role)) return error(403, '无权查看该提现单');
  return success({ ...order, amount_yuan: fenToYuan(order.amount) });
}

async function listLedgers(event, user) {
  assertLogin(user);
  const wallet = await findWalletByUser(user);
  if (!wallet) return success({ list: [], total: 0 });
  const page = Math.max(1, Number(event.page || 1));
  const pageSize = Math.min(50, Math.max(1, Number(event.pageSize || 20)));
  const where = { wallet_account_id: wallet._id };
  const ledgerTypes = event.ledger_types;
  if (Array.isArray(ledgerTypes) && ledgerTypes.length) {
    where.ledger_type = _.in(ledgerTypes);
  }
  const [countRes, listRes] = await Promise.all([
    db.collection('wallet_ledger').where(where).count(),
    db.collection('wallet_ledger').where(where).orderBy('created_at', 'desc').skip((page - 1) * pageSize).limit(pageSize).get()
  ]);
  return success({
    list: (listRes.data || []).map((item) => ({ ...item, amount_yuan: fenToYuan(item.amount) })),
    total: countRes.total || 0,
    page,
    pageSize
  });
}

async function adminListLedgers(event, user) {
  assertLogin(user);
  assertAdmin(user);

  const walletAccountId = normalizeText(event.wallet_account_id);
  if (!walletAccountId) return error(400, '缺少钱包账户ID');

  const page = Math.max(1, Number(event.page || 1));
  const pageSize = Math.min(50, Math.max(1, Number(event.pageSize || 20)));

  const where = { wallet_account_id: walletAccountId };
  const ledgerTypes = event.ledger_types;
  if (Array.isArray(ledgerTypes) && ledgerTypes.length) {
    where.ledger_type = _.in(ledgerTypes);
  }

  const [countRes, listRes] = await Promise.all([
    db.collection('wallet_ledger').where(where).count(),
    db.collection('wallet_ledger').where(where).orderBy('created_at', 'desc').skip((page - 1) * pageSize).limit(pageSize).get()
  ]);

  return success({
    list: (listRes.data || []).map((item) => ({
      ...item,
      amount_yuan: fenToYuan(item.amount),
      balance_before_yuan: fenToYuan(item.balance_before),
      balance_after_yuan: fenToYuan(item.balance_after),
      frozen_before_yuan: fenToYuan(item.frozen_before),
      frozen_after_yuan: fenToYuan(item.frozen_after)
    })),
    total: countRes.total || 0,
    page,
    pageSize
  });
}

async function handleReview(event, user, approve) {
  assertLogin(user);
  assertAdmin(user);
  const id = event.id || event.withdraw_order_id;
  if (!id) return error(400, '缺少提现单 ID');
  const orderDoc = await db.collection('withdraw_orders').doc(id).get();
  const order = orderDoc.data || null;
  if (!order) return error(404, '提现单不存在');
  if (!['APPLIED', 'RISK_REVIEW', 'APPROVED'].includes(order.status)) return error(400, '当前提现状态不可审核');

  if (approve) {
    await db.collection('withdraw_orders').doc(id).update({
      data: {
        status: 'APPROVED',
        risk_status: 'passed',
        review_remark: normalizeText(event.remark),
        reviewed_by: user._id,
        reviewed_at: db.serverDate(),
        updated_at: db.serverDate()
      }
    });
    await db.collection('payment_audit_logs').add({ data: {
      target_type: 'withdraw_order', target_id: id, action: 'review_approve', operator_id: user._id,
      before_status: order.status, after_status: 'APPROVED', summary: { remark: normalizeText(event.remark) }, created_at: db.serverDate()
    }}).catch(() => null);
    return success({ withdraw_order_id: id, status: 'APPROVED' }, '审核通过');
  }

  const amountFen = Number(order.amount || 0);
  try {
    await unfreezeWithdrawOrder(
      id,
      order.wallet_account_id,
      order.user_id,
      order.employee_id,
      order.withdraw_no,
      amountFen,
      normalizeText(event.remark) || '审核驳回',
      'WITHDRAW_REJECT_UNFREEZE',
      user._id
    );
  } catch (err) {
    console.error('[wallet] reject unfreeze error:', err);
    return error(500, err.message || '解冻失败');
  }
  await db.collection('payment_audit_logs').add({ data: {
    target_type: 'withdraw_order', target_id: id, action: 'review_reject', operator_id: user._id,
    before_status: order.status, after_status: 'FAILED', summary: { remark: normalizeText(event.remark) }, created_at: db.serverDate()
  }}).catch(() => null);
  return success({ withdraw_order_id: id, status: 'FAILED' }, '已驳回并解冻');
}

exports.main = async (event = {}, context) => {
  const wxContext = cloud.getWXContext();
  try {
    const action = event.action || 'get-summary';
    const user = await getCurrentUser(event, wxContext);

    switch (action) {
      case 'bind':
      case 'bind-wallet':
        return await handleBind(event, user);
      case 'get-summary':
      case 'get-balance':
        return await handleGetSummary(event, user);
      case 'apply-withdraw':
      case 'create-withdraw':
        return await handleApplyWithdraw(event, user);
      case 'list-withdraw-orders':
        return await listWithdrawOrders(event, user);
      case 'get-withdraw-order':
        return await getWithdrawOrder(event, user);
      case 'list-ledgers':
        return await listLedgers(event, user);
      case 'admin-credit':
        return await handleAdminCredit(event, user);
      case 'management-summary':
      case 'get-management-summary':
        return await getManagementSummary(event, user);
      case 'admin-list-wallet-accounts':
        return await adminListWalletAccounts(event, user);
      case 'admin-list-ledgers':
        return await adminListLedgers(event, user);
      case 'approve-withdraw':
        return await handleReview(event, user, true);
      case 'reject-withdraw':
        return await handleReview(event, user, false);
      case 'unfreeze':
        return await handleUnfreeze(event, user);
      default:
        return error(400, `未知操作: ${action}`);
    }
  } catch (err) {
    console.error('[wallet] error:', err);
    return error(err.code || 500, err.message || '钱包服务异常');
  }
};
