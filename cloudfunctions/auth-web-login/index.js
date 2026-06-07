/**
 * Web 端登录云函数 - 简化版（仅密码登录和Token验证）
 * 调用方式：{ "action": "loginByPassword", "phone": "...", "password": "..." }
 * 或：{ "action": "verifyToken", "token": "..." }
 */

const cloud = require('wx-server-sdk');
const crypto = require('crypto');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();

function success(data = null, message = 'success') {
  return { code: 0, message, data };
}

function error(code = 1, message = 'error', data = null) {
  return { code, message, data };
}

exports.main = async (event, context) => {
  const { action } = event;

  try {
    switch (action) {
      case 'loginByPassword':
        return await loginWithPassword(event);
      case 'verifyToken':
        return await verifyToken(event);
      case 'logout':
        return await logout(event);
      default:
        return error(400, '不支持的操作');
    }
  } catch (err) {
    console.error('Auth 错误:', err);
    return error(500, err.message);
  }
};

// 密码登录
async function loginWithPassword({ phone, password }) {
  if (!phone || !password) {
    return error(400, '手机号和密码不能为空');
  }

  // 查询用户（按手机号）
  const user = await db.collection('users')
    .where({ phone })
    .get();

  if (user.data.length === 0) {
    return error(400, '用户不存在');
  }

  const userData = user.data[0];

  // 验证密码（支持 data.password 和顶层 password 字段）
  let actualPassword = null;
  if (userData.data && userData.data.password) {
    actualPassword = userData.data.password;
  } else if (userData.password) {
    actualPassword = userData.password;
  }

  if (!actualPassword) {
    return error(400, '该用户未设置密码，请联系管理员');
  }

  if (actualPassword !== password) {
    return error(400, '密码错误');
  }

  // 验证用户状态
  if (userData.status !== 'normal') {
    return error(401, '用户已被禁用');
  }

  // 生成 JWT Token
  const token = generateToken({
    uid: userData._id,
    phone: userData.phone,
    role: userData.role || 'candidate'
  });

  // 更新最后登录时间（可选）
  try {
    await db.collection('users').doc(userData._id).update({
      data: { last_login: db.serverDate() }
    });
  } catch (e) {
    // 忽略更新失败
  }

  return success({
    token,
    user: {
      id: userData._id,
      name: userData.name || '',
      phone: userData.phone || '',
      avatar: userData.avatar || '',
      role: userData.role || 'candidate'
    }
  });
}

// 验证 Token
async function verifyToken({ token }) {
  try {
    const decoded = verifyTokenInternal(token);
    if (decoded.exp < Math.floor(Date.now() / 1000)) {
      return error(401, 'Token 已过期');
    }

    // 查询用户是否存在且正常
    const user = await db.collection('users')
      .doc(decoded.uid)
      .get();

    if (!user.data || user.data.status !== 'normal') {
      return error(401, '用户不存在或已被禁用');
    }

    return success({
      user: {
        id: user.data._id,
        name: user.data.name || '',
        phone: user.data.phone || '',
        role: user.data.role || 'candidate'
      }
    });
  } catch (err) {
    return error(401, 'Token 无效');
  }
}

// 登出（前端只需删除 Token，但也可以记录日志）
async function logout(data) {
  // 可选：记录登出日志到 audit_logs
  return success(null, '登出成功');
}

// JWT 生成（简化版，生产需用 rs256）
function generateToken(payload) {
  const secret = getJwtSecret();
  const header = toBase64Url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const body = toBase64Url(JSON.stringify({
    ...payload,
    iat: Math.floor(Date.now() / 1000),
    exp: Math.floor(Date.now() / 1000) + 7 * 24 * 60 * 60 // 7天
  }));
  const signature = signJwt(`${header}.${body}`, secret);
  return `${header}.${body}.${signature}`;
}

// JWT 验证（简化版）
function verifyTokenInternal(token) {
  if (!token || typeof token !== 'string' || token.split('.').length !== 3) {
    throw new Error('Invalid token format');
  }
  const [headerB64, bodyB64, signature] = token.split('.');
  const secret = getJwtSecret();
  const expectedSignature = signJwt(`${headerB64}.${bodyB64}`, secret);

  const signatureBuf = Buffer.from(signature);
  const expectedSignatureBuf = Buffer.from(expectedSignature);
  if (signatureBuf.length !== expectedSignatureBuf.length || !crypto.timingSafeEqual(signatureBuf, expectedSignatureBuf)) {
    throw new Error('Invalid signature');
  }

  const payload = JSON.parse(fromBase64Url(bodyB64));
  return payload;
}

function getJwtSecret() {
  const secret = String(process.env.JWT_SECRET || '');
  if (secret.length < 32) {
    throw new Error('JWT_SECRET 未配置或长度不足（至少 32 位）');
  }
  return secret;
}

function signJwt(content, secret) {
  return crypto.createHmac('sha256', secret).update(content).digest('base64url');
}

function toBase64Url(text) {
  return Buffer.from(text).toString('base64url');
}

function fromBase64Url(text) {
  return Buffer.from(text, 'base64url').toString();
}
