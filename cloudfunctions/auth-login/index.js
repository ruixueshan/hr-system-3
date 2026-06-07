/**
 * 手机验证码登录云函数
 * 支持 send-code（发送验证码）和 login（验证码登录）
 */
const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();
const crypto = require('crypto');
const { ensureCandidateProfile } = require('./candidateOwnership');
const { ensureUserEmployeeBinding } = require('./employeeBinding');

function success(data = null, message = 'success') {
  return { code: 0, message, data };
}

function error(code = 1, message = 'error', data = null) {
  return { code, message, data };
}

// 生成随机 token
function generateToken() {
  return crypto.randomBytes(32).toString('hex');
}

// 生成 6 位数字验证码
function generateCode() {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

exports.main = async (event, context) => {
  const { action, phone, code, user_type } = event;

  try {
    switch (action) {
      case 'send-code':
        return await sendCode(phone);
      case 'login':
        return await login(phone, code, user_type);
      default:
        return error(400, '不支持的操作');
    }
  } catch (err) {
    console.error('手机验证码登录错误:', err);
    return error(500, err.message || '操作失败');
  }
};

// 发送验证码
async function sendCode(phone) {
  // 验证手机号格式
  if (!/^1[3-9]\d{9}$/.test(phone)) {
    return error(400, '手机号格式不正确');
  }

  // 检查是否频繁发送（1分钟内不能重复发送）
  const now = Date.now();
  const oneMinuteAgo = now - 60 * 1000;

  const recentCode = await db.collection('verification_codes')
    .where({
      phone,
      create_time: db.command.gte(oneMinuteAgo)
    })
    .get();

  if (recentCode.data && recentCode.data.length > 0) {
    return error(400, '验证码发送过于频繁，请稍后再试');
  }

  // 生成验证码
  const verifyCode = generateCode();
  const expireTime = now + 5 * 60 * 1000; // 5分钟后过期

  // 存储验证码（开发环境直接使用，生产环境需要对接短信服务）
  await db.collection('verification_codes').add({
    data: {
      phone,
      code: verifyCode,
      type: 'login',
      status: 'pending',
      expire_time: expireTime,
      create_time: db.serverDate()
    }
  });

  // 开发环境：在控制台打印验证码
  console.log(`【验证码】手机号 ${phone} 的登录验证码是：${verifyCode}（5分钟内有效）`);

  // 生产环境：对接短信服务发送验证码
  // const smsResult = await sendSMS(phone, verifyCode);
  // if (!smsResult.success) {
  //   return error(500, '验证码发送失败');
  // }

  return success(null, '验证码已发送');
}

// 验证码登录
async function login(phone, code, user_type) {
  // 验证参数
  if (!phone || !code) {
    return error(400, '请输入手机号和验证码');
  }

  // 验证验证码
  const now = Date.now();
  const codeRecords = await db.collection('verification_codes')
    .where({
      phone,
      code,
      type: 'login',
      status: 'pending',
      expire_time: db.command.gte(now)
    })
    .get();

  if (!codeRecords.data || codeRecords.data.length === 0) {
    return error(400, '验证码错误或已过期');
  }

  // 标记验证码已使用
  const codeRecord = codeRecords.data[0];
  await db.collection('verification_codes').doc(codeRecord._id).update({
    data: {
      status: 'used',
      use_time: db.serverDate()
    }
  });

  // 查询或创建用户
  let users = await db.collection('users')
    .where({ phone })
    .get();

  let user;
  if (users.data && users.data.length > 0) {
    user = users.data[0];

    // 更新用户登录信息
    await db.collection('users').doc(user._id).update({
      data: {
        update_time: db.serverDate()
      }
    });
  } else {
    // 新用户自动注册
    const result = await db.collection('users').add({
      data: {
        phone,
        name: '候选人' + phone.substr(-4),
        role: 'candidate',
        user_type: user_type || 'candidate',
        status: 'active',
        create_time: db.serverDate(),
        update_time: db.serverDate()
      }
    });

    const newUser = await db.collection('users').doc(result._id).get();
    user = newUser.data;
  }

  if ((user.user_type || user_type || 'candidate') === 'candidate') {
    await ensureCandidateProfile(user._id, {
      bind_reason: 'register'
    });
  }

  await ensureUserEmployeeBinding(db, user);

  const latestUser = await db.collection('users').doc(user._id).get();
  user = latestUser.data || user;

  // 生成登录 token
  const loginToken = generateToken();
  const expireTime = now + 7 * 24 * 60 * 60 * 1000; // 7天

  // 存储登录态
  await db.collection('login_tokens').add({
    data: {
      token: loginToken,
      type: 'phone',
      user_id: user._id,
      phone,
      status: 'logged',
      expire_time: expireTime,
      create_time: db.serverDate()
    }
  });

  // 返回登录信息
  return success({
    token: loginToken,
    userInfo: {
      id: user._id,
      name: user.name || '',
      phone: user.phone || '',
      avatar: user.avatar || '',
      role: user.role || 'candidate',
      user_type: user.user_type || 'candidate'
    }
  }, '登录成功');
}
