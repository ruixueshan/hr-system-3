const cloud = require('wx-server-sdk');
const crypto = require('crypto');
const axios = require('axios');

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

const db = cloud.database();
const _ = db.command;

const ADMIN_ROLES = ['gm', 'deputy', 'finance'];
const AUTO_PAYMENT_LIMIT_FEN = 1000000;
const QUERY_MISSING_FAILURE_THRESHOLD = 3;
const QUERY_MISSING_MIN_AGE_MS = 10 * 60 * 1000;
const PAYMENT_SERVICE_URL = String(process.env.PAYMENT_SERVICE_URL || '').replace(/\/$/, '');
const PAYMENT_INTERNAL_SECRET = process.env.PAYMENT_INTERNAL_SECRET || '';
const PAYMENT_HTTP_TIMEOUT_MS = 25000; // 25 秒，小于云函数 60 秒超时，给云托管冷启动留余量

function success(data = null, message = 'success') {
  return { code: 0, message, data };
}

function error(code = 1, message = 'error', data = null) {
  return { code, message, data };
}

function normalizeText(value) {
  return String(value || '').trim();
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

function nowCompact() {
  const d = new Date(Date.now() + 8 * 60 * 60 * 1000);
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}`;
}

function randomSuffix(len = 8) {
  return Math.random().toString(36).slice(2, 2 + len).toUpperCase().padEnd(len, '0');
}

function buildOutBatchNo() {
  return `WB${nowCompact()}${randomSuffix(6)}`;
}

function buildOutDetailNo(outBatchNo) {
  return `${outBatchNo}D1`;
}

function buildOutAuthorizationNo(userId) {
  const suffix = String(userId || '').replace(/[^0-9A-Za-z]/g, '').slice(-6).toUpperCase();
  return `AUTH${nowCompact()}${suffix}${randomSuffix(4)}`.slice(0, 32);
}

function fenToYuan(fen) {
  return (Number(fen || 0) / 100).toFixed(2);
}

async function verifyToken(token) {
  if (!token) return null;
  const tokenRes = await db.collection('login_tokens').where({ token, status: 'logged' }).limit(1).get();
  const record = tokenRes.data && tokenRes.data[0];
  if (!record || Date.now() > Number(record.expire_time || 0)) return null;
  const userRes = await db.collection('users').doc(record.user_id).get();
  return userRes.data || null;
}

async function getCurrentUser(event, wxContext) {
  const tokenUser = await verifyToken(event.token).catch((err) => {
    console.warn('[payment-proxy] token verify failed:', err && err.message);
    return null;
  });
  if (tokenUser) return tokenUser;

  if (!wxContext.OPENID) return null;
  const userRes = await db.collection('users').where({ openid: wxContext.OPENID }).limit(20).get();
  if ((userRes.data || []).length > 1) {
    console.warn('[payment-proxy] same OPENID matched multiple users, prefer employee user', {
      openid: wxContext.OPENID,
      userIds: (userRes.data || []).map((item) => item._id)
    });
  }
  return pickPreferredUser(userRes.data || []);
}

function assertAdmin(user) {
  if (!user || !ADMIN_ROLES.includes(user.role)) {
    throw Object.assign(new Error('无支付操作权限'), { code: 403 });
  }
}

function canCreatePaymentForWithdraw(user, withdrawOrder) {
  if (!user || !withdrawOrder) return false;
  if (ADMIN_ROLES.includes(user.role)) return true;
  const isOwner = withdrawOrder.user_id === user._id || (user.openid && withdrawOrder.openid === user.openid);
  return isOwner && Number(withdrawOrder.amount || 0) < AUTO_PAYMENT_LIMIT_FEN;
}

function ensureServiceConfigured() {
  if (!PAYMENT_SERVICE_URL) throw Object.assign(new Error('缺少 PAYMENT_SERVICE_URL，无法调用支付服务'), { code: 500 });
  if (!PAYMENT_INTERNAL_SECRET) throw Object.assign(new Error('缺少 PAYMENT_INTERNAL_SECRET，无法进行服务间签名'), { code: 500 });
}

function signInternalRequest(method, requestPath, bodyText, timestamp, nonce) {
  const payload = `${method.toUpperCase()}\n${requestPath}\n${timestamp}\n${nonce}\n${bodyText}`;
  return crypto.createHmac('sha256', PAYMENT_INTERNAL_SECRET).update(payload).digest('hex');
}

async function callPaymentService(method, requestPath, body) {
  ensureServiceConfigured();
  const bodyText = body ? JSON.stringify(body) : '';
  const timestamp = String(Math.floor(Date.now() / 1000));
  const nonce = crypto.randomBytes(12).toString('hex');
  const signature = signInternalRequest(method, requestPath, bodyText, timestamp, nonce);
  const url = `${PAYMENT_SERVICE_URL}${requestPath}`;
  const startTime = Date.now();
  console.log('[payment-proxy] callPaymentService start', {
    method,
    requestPath,
    url,
    timeout: 30000,
    body
  });
  try {
    const response = await axios({
      method,
      url,
      data: body || undefined,
      timeout: PAYMENT_HTTP_TIMEOUT_MS,
      headers: {
        'Content-Type': 'application/json',
        'X-Payment-Timestamp': timestamp,
        'X-Payment-Nonce': nonce,
        'X-Payment-Signature': signature
      }
    });
    console.log('[payment-proxy] callPaymentService success', {
      method,
      requestPath,
      durationMs: Date.now() - startTime,
      status: response.status
    });
    return response.data;
  } catch (err) {
    console.error('[payment-proxy] callPaymentService error', {
      method,
      requestPath,
      durationMs: Date.now() - startTime,
      code: err.code,
      message: err.message,
      responseStatus: err.response?.status,
      responseData: err.response?.data
    });
    throw err;
  }
}

async function addAuditLog(targetType, targetId, action, operatorId, beforeStatus, afterStatus, summary = {}) {
  await db.collection('payment_audit_logs').add({
    data: {
      target_type: targetType,
      target_id: targetId,
      action,
      operator_id: operatorId || 'system',
      before_status: beforeStatus || '',
      after_status: afterStatus || '',
      summary,
      created_at: db.serverDate()
    }
  }).catch((err) => console.warn('[payment-proxy] audit log skipped:', err && err.message));
}

async function getWithdrawOrder(id) {
  const doc = await db.collection('withdraw_orders').doc(id).get();
  return doc.data ? { _id: id, ...doc.data } : null;
}

async function getPaymentOrder(id) {
  if (!id) return null;
  const doc = await db.collection('payment_orders').doc(id).get();
  return doc.data ? { _id: id, ...doc.data } : null;
}

async function getActiveTransferAuthorization(userId, openid) {
  const conditions = [];
  if (userId) conditions.push({ user_id: userId, status: 'TAKING_EFFECT' });
  if (openid) conditions.push({ openid, status: 'TAKING_EFFECT' });
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

async function syncEmployeeAuthorizationSnapshot(authorization) {
  if (!authorization?.employee_id || normalizeText(authorization.status) !== 'TAKING_EFFECT') return;
  const authorizedAt = authorization.response_snapshot?.authorize_time || authorization.updated_at || '';
  const patch = {
    wechat_transfer_authorized: true,
    updated_at: db.serverDate()
  };
  if (authorizedAt) patch.wechat_transfer_authorized_at = authorizedAt;
  if (normalizeText(authorization.user_display_name)) {
    patch.wechat_receiver_name = normalizeText(authorization.user_display_name);
  }
  await db.collection('employees').doc(authorization.employee_id).update({ data: patch }).catch((err) => {
    console.warn('[payment-proxy] sync employee authorization snapshot failed:', err?.message);
  });
}

async function getLatestTransferAuthorization(userId, openid) {
  const conditions = [];
  if (userId) conditions.push({ user_id: userId });
  if (openid) conditions.push({ openid });
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

async function createPaymentOrderForWithdraw(withdrawOrder, operatorId) {
  if (withdrawOrder.payment_order_id) {
    const existing = await getPaymentOrder(withdrawOrder.payment_order_id);
    if (existing) return existing;
  }

  const outBatchNo = buildOutBatchNo();
  const outDetailNo = buildOutDetailNo(outBatchNo);
  const authorization = await getActiveTransferAuthorization(withdrawOrder.user_id, withdrawOrder.openid);
  if (!authorization) {
    throw Object.assign(new Error('员工尚未完成微信零钱免确认收款授权，不能发起自动打款'), { code: 428 });
  }
  let paymentOrderId = '';

  await db.runTransaction(async (transaction) => {
    const latestDoc = await transaction.collection('withdraw_orders').doc(withdrawOrder._id).get();
    const latest = latestDoc.data || null;
    if (!latest) throw new Error('提现单不存在');
    if (latest.payment_order_id) {
      paymentOrderId = latest.payment_order_id;
      return;
    }
    if (latest.status !== 'APPROVED') throw new Error('提现单未审核通过，不能发起支付');

    const addRes = await transaction.collection('payment_orders').add({
      data: {
        withdraw_order_id: withdrawOrder._id,
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
        openid: latest.openid,
        amount: Number(latest.amount || 0),
        status: 'CREATED',
        wx_state: '',
        request_snapshot: {
          out_batch_no: outBatchNo,
          out_detail_no: outDetailNo,
          out_bill_no: outBatchNo,
          transfer_scene_id: '1005',
          out_authorization_no: authorization.out_authorization_no || '',
          authorization_id: authorization.authorization_id || '',
          amount: Number(latest.amount || 0)
        },
        response_snapshot: null,
        fail_code: '',
        fail_reason: '',
        created_at: db.serverDate(),
        updated_at: db.serverDate()
      }
    });
    paymentOrderId = addRes._id || addRes.id;

    await transaction.collection('withdraw_orders').doc(withdrawOrder._id).update({
      data: {
        payment_order_id: paymentOrderId,
        status: 'PAYING',
        updated_at: db.serverDate()
      }
    });
  });

  const payment = await getPaymentOrder(paymentOrderId);
  await addAuditLog('payment_order', paymentOrderId, 'pay_create', operatorId, 'APPROVED', 'CREATED', {
    withdraw_order_id: withdrawOrder._id,
    out_bill_no: payment.out_bill_no || payment.out_batch_no,
    out_authorization_no: payment.out_authorization_no,
    amount: payment.amount
  });
  return payment;
}

async function markPaymentAccepted(payment, serviceData) {
  const data = serviceData && serviceData.data ? serviceData.data : serviceData || {};
  const wxState = data.state || data.batch_state || data.wx_state || 'PROCESSING';
  const nextStatus = wxState === 'SUCCESS' || wxState === 'FINISHED' ? 'SUCCESS' : 'PROCESSING';
  await db.collection('payment_orders').doc(payment._id).update({
    data: {
      status: nextStatus,
      wx_state: wxState,
      wx_batch_id: data.batchId || data.batch_id || data.wx_batch_id || payment.wx_batch_id || '',
      wx_transfer_bill_no: data.transferBillNo || data.transfer_bill_no || payment.wx_transfer_bill_no || '',
      response_snapshot: _.set(data),
      updated_at: db.serverDate()
    }
  });
  await db.collection('withdraw_orders').doc(payment.withdraw_order_id).update({
    data: {
      status: nextStatus === 'SUCCESS' ? 'SUCCESS' : 'PAYING',
      updated_at: db.serverDate(),
      ...(nextStatus === 'SUCCESS' ? { finished_at: db.serverDate() } : {})
    }
  });
  await addAuditLog('payment_order', payment._id, 'pay_sent', 'system', payment.status, nextStatus, data);
  if (nextStatus === 'SUCCESS') await finalizeWalletSuccess(payment.withdraw_order_id, payment._id);
}

async function finalizeWalletSuccess(withdrawOrderId, paymentOrderId) {
  const order = await getWithdrawOrder(withdrawOrderId);
  if (!order) throw new Error('提现单不存在');
  if (order.status === 'SUCCESS' && order.success_ledger_id) return;
  const amountFen = Number(order.amount || 0);

  await db.runTransaction(async (transaction) => {
    const latestOrderDoc = await transaction.collection('withdraw_orders').doc(withdrawOrderId).get();
    const latestOrder = latestOrderDoc.data || null;
    if (!latestOrder) throw new Error('提现单不存在');
    if (latestOrder.success_ledger_id) return;

    const walletDoc = await transaction.collection('wallet_accounts').doc(latestOrder.wallet_account_id).get();
    const wallet = walletDoc.data || null;
    if (!wallet) throw new Error('钱包账户不存在');
    const balanceBefore = Number(wallet.available_amount || 0);
    const frozenBefore = Number(wallet.frozen_amount || 0);

    await transaction.collection('wallet_accounts').doc(latestOrder.wallet_account_id).update({
      data: {
        frozen_amount: _.inc(-amountFen),
        total_withdrawn: _.inc(amountFen),
        updated_at: db.serverDate()
      }
    });
    const ledgerAdd = await transaction.collection('wallet_ledger').add({ data: {
      wallet_account_id: latestOrder.wallet_account_id,
      user_id: latestOrder.user_id,
      employee_id: latestOrder.employee_id,
      ledger_type: 'WITHDRAW_SUCCESS_DEDUCT',
      direction: 'out',
      amount: amountFen,
      balance_before: balanceBefore,
      balance_after: balanceBefore,
      frozen_before: frozenBefore,
      frozen_after: Math.max(0, frozenBefore - amountFen),
      source_type: 'withdraw',
      source_id: latestOrder.withdraw_no,
      withdraw_order_id: withdrawOrderId,
      payment_order_id: paymentOrderId,
      remark: '微信提现到账扣减冻结余额',
      created_by: 'payment-proxy',
      created_at: db.serverDate()
    }});
    await transaction.collection('withdraw_orders').doc(withdrawOrderId).update({ data: {
      status: 'SUCCESS',
      success_ledger_id: ledgerAdd._id || ledgerAdd.id || '',
      finished_at: db.serverDate(),
      updated_at: db.serverDate()
    }});
  });
}

async function finalizeWalletFailure(withdrawOrderId, paymentOrderId, reason) {
  const order = await getWithdrawOrder(withdrawOrderId);
  if (!order) throw new Error('提现单不存在');
  if (['FAILED', 'CLOSED'].includes(order.status) && order.failed_ledger_id) return;
  const amountFen = Number(order.amount || 0);

  await db.runTransaction(async (transaction) => {
    const latestOrderDoc = await transaction.collection('withdraw_orders').doc(withdrawOrderId).get();
    const latestOrder = latestOrderDoc.data || null;
    if (!latestOrder) throw new Error('提现单不存在');
    if (latestOrder.failed_ledger_id) return;

    const walletDoc = await transaction.collection('wallet_accounts').doc(latestOrder.wallet_account_id).get();
    const wallet = walletDoc.data || null;
    if (!wallet) throw new Error('钱包账户不存在');
    const balanceBefore = Number(wallet.available_amount || 0);
    const frozenBefore = Number(wallet.frozen_amount || 0);

    await transaction.collection('wallet_accounts').doc(latestOrder.wallet_account_id).update({ data: {
      available_amount: _.inc(amountFen),
      frozen_amount: _.inc(-amountFen),
      updated_at: db.serverDate()
    }});
    const ledgerAdd = await transaction.collection('wallet_ledger').add({ data: {
      wallet_account_id: latestOrder.wallet_account_id,
      user_id: latestOrder.user_id,
      employee_id: latestOrder.employee_id,
      ledger_type: 'WITHDRAW_FAILED_UNFREEZE',
      direction: 'unfreeze',
      amount: amountFen,
      balance_before: balanceBefore,
      balance_after: balanceBefore + amountFen,
      frozen_before: frozenBefore,
      frozen_after: Math.max(0, frozenBefore - amountFen),
      source_type: 'withdraw',
      source_id: latestOrder.withdraw_no,
      withdraw_order_id: withdrawOrderId,
      payment_order_id: paymentOrderId,
      remark: reason || '微信提现失败解冻',
      created_by: 'payment-proxy',
      created_at: db.serverDate()
    }});
    await transaction.collection('withdraw_orders').doc(withdrawOrderId).update({ data: {
      status: 'FAILED',
      fail_reason: reason || '微信提现失败',
      failed_ledger_id: ledgerAdd._id || ledgerAdd.id || '',
      finished_at: db.serverDate(),
      updated_at: db.serverDate()
    }});
  });
}

async function sendPaymentOrder(payment, event = {}, operatorId = 'system') {
  const withdrawOrder = await getWithdrawOrder(payment.withdraw_order_id);
  if (!withdrawOrder) throw Object.assign(new Error('提现单不存在'), { code: 404 });
  if (payment.status !== 'CREATED') {
    return success({ payment_order: payment }, '支付单已存在');
  }

  let realName = normalizeText(event.realName || event.real_name || withdrawOrder.real_name);
  if (!realName && withdrawOrder.employee_id) {
    const employee = await getEmployee(withdrawOrder.employee_id).catch(() => null);
    if (employee) {
      realName = normalizeText(employee.wechat_receiver_name || employee.name);
    }
  }
  if (!realName && withdrawOrder.user_id) {
    const userDoc = await db.collection('users').doc(withdrawOrder.user_id).get().catch(() => null);
    realName = normalizeText(userDoc?.data?.wechat_receiver_name || userDoc?.data?.name || userDoc?.data?.real_name);
  }

  let employeeName = '';
  if (withdrawOrder.user_id) {
    const userDoc = await db.collection('users').doc(withdrawOrder.user_id).get().catch(() => null);
    employeeName = normalizeText(userDoc?.data?.name || userDoc?.data?.real_name);
  }

  const paymentAmount = Number(payment.amount || withdrawOrder.amount || 0);
  const body = {
    outBillNo: payment.out_bill_no || payment.out_batch_no,
    outBatchNo: payment.out_batch_no,
    outDetailNo: payment.out_detail_no,
    openid: payment.openid,
    amount: paymentAmount,
    authorizationId: payment.authorization_id,
    outAuthorizationNo: payment.authorization_id ? '' : payment.out_authorization_no,
    transferSceneId: payment.transfer_scene_id || '1005',
    userRecvPerception: payment.user_recv_perception || '劳务报酬',
    jobType: '灵活用工',
    compensationDesc: '劳务报酬',
    remark: employeeName ? `${employeeName}·劳务报酬提现` : (normalizeText(event.remark) || '劳务报酬提现')
  };
  if (realName && paymentAmount >= 200000) {
    body.realName = realName;
  }

  await db.collection('payment_orders').doc(payment._id).update({
    data: { status: 'SENT', updated_at: db.serverDate() }
  });

  try {
    const serviceResult = await callPaymentService('POST', '/internal/transfer', body);
    await markPaymentAccepted({ ...payment, status: 'SENT' }, serviceResult);
    return success({ payment_order_id: payment._id, service_result: serviceResult }, '支付请求已提交');
  } catch (err) {
    const hasResponse = !!err.response;
    const reason = err.response?.data?.message || err.response?.data?.detail?.message || err.message || '支付服务调用失败';
    console.error('[payment-proxy] payment service failed', {
      withdraw_order_id: payment.withdraw_order_id,
      payment_order_id: payment._id,
      code: err.code,
      reason,
      responseStatus: err.response?.status,
      responseData: err.response?.data,
      stack: err.stack
    });

    if (err.response?.status === 503 && err.response?.data?.code === 'SERVICE_NOT_READY') {
      await db.collection('payment_orders').doc(payment._id).update({ data: {
        status: 'CREATED',
        fail_code: 'SERVICE_NOT_READY',
        fail_reason: reason,
        response_snapshot: _.set(err.response?.data || null),
        updated_at: db.serverDate()
      }});
      await db.collection('withdraw_orders').doc(payment.withdraw_order_id).update({ data: {
        status: 'PAYING',
        updated_at: db.serverDate()
      }});
      await addAuditLog('payment_order', payment._id, 'pay_deferred', operatorId, 'SENT', 'CREATED', { reason });
      return error(503, reason, { payment_order_id: payment._id, retryable: true });
    }

    if (hasResponse) {
      await db.collection('payment_orders').doc(payment._id).update({ data: {
        status: 'FAILED',
        fail_code: err.response?.data?.code || 'SERVICE_ERROR',
        fail_reason: reason,
        response_snapshot: _.set(err.response?.data || null),
        updated_at: db.serverDate()
      }});
      await finalizeWalletFailure(payment.withdraw_order_id, payment._id, reason);
      await addAuditLog('payment_order', payment._id, 'pay_failed', operatorId, 'SENT', 'FAILED', { reason });
      return error(500, reason, { payment_order_id: payment._id });
    }

    await db.collection('payment_orders').doc(payment._id).update({ data: {
      status: 'PROCESSING',
      fail_reason: `未知状态待查单: ${reason}`,
      first_unknown_at: db.serverDate(),
      query_fail_count: 0,
      last_query_error: reason,
      updated_at: db.serverDate()
    }});
    await addAuditLog('payment_order', payment._id, 'pay_unknown', operatorId, 'SENT', 'PROCESSING', { reason });
    return success({ payment_order_id: payment._id, status: 'PROCESSING' }, '支付请求状态未知，已进入查单队列');
  }
}

async function handleCreatePayment(event, user) {
  if (!user) return error(401, '请先登录');
  const withdrawOrderId = event.withdraw_order_id || event.withdrawOrderId || event.id;
  if (!withdrawOrderId) return error(400, '缺少提现单 ID');
  const withdrawOrder = await getWithdrawOrder(withdrawOrderId);
  if (!withdrawOrder) return error(404, '提现单不存在');
  if (!canCreatePaymentForWithdraw(user, withdrawOrder)) return error(403, '万元及以上提现需后台审核后打款');
  if (!['APPROVED', 'PAYING'].includes(withdrawOrder.status)) return error(400, '提现单未审核通过或已终态');

  let realName = normalizeText(event.realName || event.real_name || withdrawOrder.real_name);
  if (!realName && withdrawOrder.employee_id) {
    const employee = await getEmployee(withdrawOrder.employee_id).catch(() => null);
    if (employee) {
      realName = normalizeText(employee.wechat_receiver_name || employee.name);
    }
  }
  if (!realName && withdrawOrder.user_id) {
    const userDoc = await db.collection('users').doc(withdrawOrder.user_id).get().catch(() => null);
    realName = normalizeText(userDoc?.data?.wechat_receiver_name || userDoc?.data?.name || userDoc?.data?.real_name);
  }

  const payment = await createPaymentOrderForWithdraw({ _id: withdrawOrderId, ...withdrawOrder }, user._id);
  if (!payment) return error(500, '支付单创建失败');
  if (['SUCCESS', 'PROCESSING', 'ACCEPTED', 'SENT'].includes(payment.status)) {
    return success({ payment_order: payment }, '支付单已存在');
  }
  return await sendPaymentOrder(payment, { ...event, realName }, user._id);
}

function mapWxStateToStatus(raw) {
  const state = String(raw || '').toUpperCase();
  if (['SUCCESS', 'FINISHED', 'ACCEPTED_SUCCESS'].includes(state)) return 'SUCCESS';
  if (['FAIL', 'FAILED', 'CLOSED', 'CANCELLED', 'CANCELED'].includes(state)) return 'FAILED';
  return 'PROCESSING';
}

function toMillis(value) {
  if (!value) return 0;
  if (value instanceof Date) return value.getTime();
  if (typeof value === 'number') return value;
  if (value.$date) return Number(value.$date) || new Date(value.$date).getTime() || 0;
  return new Date(value).getTime() || 0;
}

function getWxErrorCode(err) {
  return normalizeText(err?.response?.data?.code || err?.response?.data?.detail?.code || err?.code).toUpperCase();
}

function isMissingQueryFailure(reason, code) {
  const text = String(reason || '').toLowerCase();
  const wxCode = String(code || '').toUpperCase();
  return [
    '记录不存在',
    '订单不存在',
    '单号不存在',
    '单据不存在',
    'not found',
    'not_exist',
    'not exists'
  ].some((keyword) => text.includes(keyword.toLowerCase()))
    || ['NOT_FOUND', 'RESOURCE_NOT_EXISTS', 'ORDER_NOT_EXIST', 'RECORD_NOT_FOUND'].includes(wxCode);
}

function isImmediateTerminalQueryFailure(reason, code) {
  const text = String(reason || '').toLowerCase();
  const wxCode = String(code || '').toUpperCase();
  return [
    '传入的转账明细状态无效',
    'invalid transfer detail state'
  ].some((keyword) => text.includes(keyword.toLowerCase()))
    || ['INVALID_TRANSFER_DETAIL_STATE'].includes(wxCode);
}

function shouldFailMissingQuery(payment, nextFailCount) {
  const firstUnknownAtMs = toMillis(payment.first_unknown_at || payment.created_at);
  const ageMs = firstUnknownAtMs ? Date.now() - firstUnknownAtMs : 0;
  return nextFailCount >= QUERY_MISSING_FAILURE_THRESHOLD
    || (nextFailCount >= 2 && ageMs >= QUERY_MISSING_MIN_AGE_MS);
}

async function syncPaymentOrder(payment, operatorId = 'system') {
  if (!payment?._id) throw new Error('支付单不存在');
  const serviceResult = await callPaymentService('GET', `/internal/transfer/${encodeURIComponent(payment.out_bill_no || payment.out_batch_no)}`);
  const data = serviceResult && serviceResult.data ? serviceResult.data : serviceResult || {};
  const wxState = data.state || data.batch_state || data.transfer_state || data.detail_state || '';
  const nextStatus = mapWxStateToStatus(wxState);

  await db.collection('payment_orders').doc(payment._id).update({ data: {
    status: nextStatus,
    wx_state: wxState || nextStatus,
    wx_batch_id: data.batch_id || payment.wx_batch_id || '',
    wx_transfer_bill_no: data.transfer_bill_no || payment.wx_transfer_bill_no || '',
    response_snapshot: _.set(data),
    query_fail_count: 0,
    last_query_error: '',
    last_query_at: db.serverDate(),
    updated_at: db.serverDate()
  }});

  if (nextStatus === 'SUCCESS') {
    await finalizeWalletSuccess(payment.withdraw_order_id, payment._id);
  } else if (nextStatus === 'FAILED') {
    await finalizeWalletFailure(payment.withdraw_order_id, payment._id, data.fail_reason || data.message || '微信支付失败');
  }
  await addAuditLog('payment_order', payment._id, 'pay_query', operatorId, payment.status, nextStatus, { wx_state: wxState });
  return { payment_order_id: payment._id, status: nextStatus, wx_state: wxState, data };
}

async function handleCreateAuthorization(event, user) {
  if (!user) return error(401, '请先登录');
  if (!user.openid) return error(400, '当前账号缺少 openid，无法申请免确认收款授权');

  const existing = await getLatestTransferAuthorization(user._id, user.openid);
  if (existing && existing.status === 'TAKING_EFFECT') {
    return success({
      out_authorization_no: existing.out_authorization_no,
      authorization_id: existing.authorization_id || '',
      status: existing.status,
      package_info: existing.package_info || '',
      mch_id: process.env.WX_MCH_ID || '',
      app_id: process.env.WX_APP_ID || ''
    }, '免确认收款授权已生效');
  }

  const outAuthorizationNo = buildOutAuthorizationNo(user._id);
  const userDisplayName = normalizeText(event.user_display_name || event.userDisplayName || user.name || user.real_name || '微信用户');
  const authorizationNotifyUrl = normalizeText(event.authorization_notify_url || event.authorizationNotifyUrl)
    || `${PAYMENT_SERVICE_URL}/wechatpay/authorization/callback`;

  const body = {
    outAuthorizationNo,
    openid: user.openid,
    userDisplayName,
    userRecvPerception: '劳务报酬',
    authorizationNotifyUrl
  };

  const serviceResult = await callPaymentService('POST', '/internal/authorizations', body);
  const data = serviceResult && serviceResult.data ? serviceResult.data : serviceResult || {};
  const status = data.state || data.authorization_state || 'WAIT_USER_CONFIRM';

  await db.collection('wxpay_transfer_authorizations').add({ data: {
    out_authorization_no: outAuthorizationNo,
    authorization_id: data.authorization_id || '',
    user_id: user._id,
    employee_id: user.employee_id || '',
    openid: user.openid,
    transfer_scene_id: '1005',
    user_recv_perception: '劳务报酬',
    user_display_name: userDisplayName,
    status,
    package_info: data.package_info || '',
    request_snapshot: body,
    response_snapshot: data,
    created_at: db.serverDate(),
    updated_at: db.serverDate()
  }});

  return success({
    out_authorization_no: outAuthorizationNo,
    authorization_id: data.authorization_id || '',
    status,
    package_info: data.package_info || '',
    mch_id: process.env.WX_MCH_ID || '',
    app_id: process.env.WX_APP_ID || ''
  }, '免确认收款授权申请已创建');
}

async function handleQueryAuthorization(event, user) {
  if (!user) return error(401, '请先登录');
  const outAuthorizationNo = normalizeText(event.out_authorization_no || event.outAuthorizationNo);
  let authorization = null;
  if (outAuthorizationNo) {
    const res = await db.collection('wxpay_transfer_authorizations').where({ out_authorization_no: outAuthorizationNo }).limit(1).get();
    authorization = res.data && res.data[0];
  } else {
    authorization = await getActiveTransferAuthorization(user._id, user.openid);
    if (!authorization) authorization = await getLatestTransferAuthorization(user._id, user.openid);
  }
  if (!authorization) return success({ status: 'NONE' });

  const serviceResult = await callPaymentService('GET', `/internal/authorizations/${encodeURIComponent(authorization.out_authorization_no)}`);
  const data = serviceResult && serviceResult.data ? serviceResult.data : serviceResult || {};
  const status = data.state || data.authorization_state || authorization.status;
  await db.collection('wxpay_transfer_authorizations').doc(authorization._id).update({ data: {
    status,
    authorization_id: data.authorization_id || authorization.authorization_id || '',
    response_snapshot: _.set(data),
    updated_at: db.serverDate()
  }}).catch(() => null);
  const syncedAuthorization = {
    ...authorization,
    status,
    authorization_id: data.authorization_id || authorization.authorization_id || '',
    response_snapshot: data
  };
  await syncEmployeeAuthorizationSnapshot(syncedAuthorization);
  return success(syncedAuthorization);
}

async function handleSyncPayment(event, user) {
  assertAdmin(user);
  const paymentOrderId = event.payment_order_id || event.paymentOrderId || event.id;
  if (!paymentOrderId) return error(400, '缺少支付单 ID');
  const payment = await getPaymentOrder(paymentOrderId);
  if (!payment) return error(404, '支付单不存在');
  const result = await syncPaymentOrder(payment, user._id);
  return success(result);
}

async function handleGetMerchantBalance(event, user) {
  assertAdmin(user);
  let serviceResult = null;
  try {
    serviceResult = await callPaymentService('GET', '/internal/balance');
  } catch (err) {
    const serviceError = err.response?.data || {};
    const wxCode = serviceError.code || err.code || 'MERCHANT_BALANCE_QUERY_FAILED';
    const wxMessage = serviceError.message || err.message || '商户余额读取失败';
    return error(err.response?.status || 500, wxMessage, {
      wx_code: wxCode,
      detail: serviceError.detail || null
    });
  }
  const data = serviceResult && serviceResult.data ? serviceResult.data : serviceResult || {};
  const availableBalance = Number(data.availableBalance || data.available_balance || 0);
  const pendingBalance = Number(data.pendingBalance || data.pending_balance || 0);
  return success({
    account_type: data.accountType || data.account_type || 'OPERATION',
    available_balance: availableBalance,
    pending_balance: pendingBalance,
    total_balance: availableBalance + pendingBalance,
    available_balance_yuan: fenToYuan(availableBalance),
    pending_balance_yuan: fenToYuan(pendingBalance),
    total_balance_yuan: fenToYuan(availableBalance + pendingBalance)
  });
}

async function handleSyncPendingPayments(event = {}) {
  const limit = Math.min(Math.max(Number(event.limit || 20), 1), 100);
  const statuses = Array.isArray(event.statuses) && event.statuses.length
    ? event.statuses
    : ['CREATED', 'SENT', 'ACCEPTED', 'PROCESSING'];

  const listRes = await db.collection('payment_orders')
    .where({ status: _.in(statuses) })
    .orderBy('updated_at', 'asc')
    .limit(limit)
    .get();

  const results = [];
  for (const payment of listRes.data || []) {
    try {
      const result = payment.status === 'CREATED'
        ? await sendPaymentOrder(payment, {}, 'payment-sync')
        : await syncPaymentOrder(payment, 'payment-sync');
      const resultCode = Object.prototype.hasOwnProperty.call(result || {}, 'code') ? Number(result.code) : 0;
      results.push({ payment_order_id: payment._id, ok: resultCode === 0, ...result });
    } catch (err) {
      const reason = err.response?.data?.message || err.response?.data?.detail?.message || err.message || '查单失败';
      const wxCode = getWxErrorCode(err);
      const nextFailCount = Number(payment.query_fail_count || 0) + 1;
      const isMissing = isMissingQueryFailure(reason, wxCode);

      // 🟢 兜底阈值：任何查单失败超过合理次数/时长都自动解冻（不再仅限"缺失"类错误）
      const firstUnknownAtMs = toMillis(payment.first_unknown_at || payment.created_at);
      const ageMs = firstUnknownAtMs ? Date.now() - firstUnknownAtMs : 0;
      const genericFailThreshold = nextFailCount >= 5
        || (nextFailCount >= 3 && ageMs >= 30 * 60 * 1000);

      const shouldFail = isImmediateTerminalQueryFailure(reason, wxCode)
        || (isMissing && shouldFailMissingQuery(payment, nextFailCount))
        || genericFailThreshold;

      if (shouldFail) {
        await db.collection('payment_orders').doc(payment._id).update({ data: {
          status: 'FAILED',
          fail_code: err.response?.data?.code || 'WX_QUERY_TERMINAL_FAILURE',
          fail_reason: reason,
          response_snapshot: _.set(err.response?.data || null),
          query_fail_count: nextFailCount,
          last_query_error: reason,
          last_query_at: db.serverDate(),
          updated_at: db.serverDate()
        }});
        await finalizeWalletFailure(payment.withdraw_order_id, payment._id, reason);
        await addAuditLog('payment_order', payment._id, 'pay_query_failed', 'payment-sync', payment.status, 'FAILED', {
          reason,
          wx_code: wxCode,
          query_fail_count: nextFailCount
        });
        results.push({ payment_order_id: payment._id, ok: true, status: 'FAILED', reason, query_fail_count: nextFailCount });
        continue;
      }

      const updateData = {
        fail_reason: `自动查单失败: ${reason}`,
        query_fail_count: nextFailCount,
        last_query_error: reason,
        ...(payment.first_unknown_at ? {} : { first_unknown_at: db.serverDate() }),
        last_query_at: db.serverDate(),
        updated_at: db.serverDate()
      };
      await db.collection('payment_orders').doc(payment._id).update({ data: updateData }).catch(() => null);
      results.push({ payment_order_id: payment._id, ok: false, reason, query_fail_count: nextFailCount });
    }
  }

  return success({
    total: results.length,
    successCount: results.filter((item) => item.ok).length,
    failCount: results.filter((item) => !item.ok).length,
    results
  });
}

exports.main = async (event = {}, context) => {
  const wxContext = cloud.getWXContext();
  try {
    const isTimerEvent = event.Type === 'Timer' || event.type === 'timer' || event.TriggerName || event.triggerName;
    const action = event.action || (isTimerEvent ? 'sync-pending-payments' : 'create-payment');
    if (action === 'sync-pending-payments') {
      return await handleSyncPendingPayments(event);
    }

    const user = await getCurrentUser(event, wxContext);
    if (!user) return error(401, '请先登录');

    switch (action) {
      case 'create-authorization':
      case 'create-transfer-authorization':
        return await handleCreateAuthorization(event, user);
      case 'query-authorization':
      case 'query-transfer-authorization':
        return await handleQueryAuthorization(event, user);
      case 'create-payment':
      case 'trigger-payment':
        return await handleCreatePayment(event, user);
      case 'sync-payment':
      case 'query-payment':
        return await handleSyncPayment(event, user);
      case 'get-merchant-balance':
      case 'merchant-balance':
        return await handleGetMerchantBalance(event, user);
      default:
        return error(400, `未知操作: ${action}`);
    }
  } catch (err) {
    console.error('[payment-proxy] error:', err);
    return error(err.code || 500, err.message || '支付代理服务异常');
  }
};
