/**
 * 微信扫码登录模块
 * 生成二维码、轮询状态、微信登录
 */
const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();
const _ = db.command;
const crypto = require('crypto');

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

// 获取微信登录二维码
async function getQrcode() {
  const token = generateToken();
  const expireTime = Date.now() + 5 * 60 * 1000; // 5分钟有效
  
  // 存储 token 到数据库
  await db.collection('login_tokens').add({
    data: {
      token,
      type: 'wechat',
      status: 'pending',
      expireTime,
      createTime: db.serverDate()
    }
  });
  
  // 生成二维码内容（包含 token）
  const qrcodeContent = `https://zhanrui.cloud/wxlogin?token=${token}`;
  
  // 返回二维码图片 URL（使用第三方服务生成）
  const qrcodeUrl = `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(qrcodeContent)}`;
  
  return {
    qrcodeUrl,
    token
  };
}

// 检查扫码状态
async function checkStatus(token) {
  const { data } = await db.collection('login_tokens').where({
    token,
    type: 'wechat'
  }).get();
  
  if (!data || data.length === 0) {
    return { status: 'invalid' };
  }
  
  const loginToken = data[0];
  
  // 检查是否过期
  if (loginToken.expireTime < Date.now()) {
    return { status: 'expired' };
  }
  
  return {
    status: loginToken.status,
    openid: loginToken.openid
  };
}

// 微信登录（小程序调用）
async function wechatLogin(code) {
  if (!code) {
    return error(400, '缺少 code');
  }

  // 调用微信登录凭证校验接口
  const appid = process.env.WECHAT_APPID || '';
  const secret = process.env.WECHAT_SECRET || '';
  if (!appid || !secret) {
    return error(500, '未配置 WECHAT_APPID / WECHAT_SECRET');
  }
  
  let openid = '';
  
  try {
    const wxRes = await cloud.openapi.auth.code2Session({
      appid,
      secret,
      js_code: code,
      grant_type: 'authorization_code'
    });
    openid = String(wxRes?.openid || '');
    if (!openid) {
      return error(401, '微信登录失败：无效 code');
    }
  } catch (err) {
    console.error('微信登录失败:', err);
    return error(500, '微信登录失败');
  }
  
  // 查询或创建用户
  let { data: users } = await db.collection('users').where({
    wechat_openid: openid
  }).get();
  
  let user;
  if (users.length === 0) {
    // 新用户自动注册
    const result = await db.collection('users').add({
      data: {
        wechat_openid: openid,
        role: 'employee',
        createTime: db.serverDate(),
        updateTime: db.serverDate()
      }
    });
    user = { _id: result.id, wechat_openid: openid, role: 'employee' };
  } else {
    user = users[0];
  }
  
  // 生成登录 token
  const loginToken = generateToken();
  const expireTime = Date.now() + 7 * 24 * 60 * 60 * 1000; // 7天
  
  // 存储登录态
  await db.collection('login_tokens').add({
    data: {
      token: loginToken,
      type: 'session',
      userId: user._id,
      openid,
      status: 'logged',
      expireTime,
      createTime: db.serverDate()
    }
  });
  
  return success({
    token: loginToken,
    user: {
      id: user._id,
      role: user.role
    }
  });
}

// 小程序确认登录
async function confirmLogin(token, openid) {
  await db.collection('login_tokens').where({
    token,
    type: 'wechat'
  }).update({
    data: {
      status: 'logged',
      openid,
      confirmTime: db.serverDate()
    }
  });
  
  return success({ status: 'logged' });
}

exports.main = async (event, context) => {
  const { action } = event || {};

  try {
    switch (action) {
      case 'getQrcode':
        return await getQrcode();
      case 'checkStatus':
        return await checkStatus(event?.token);
      case 'wechatLogin':
        return await wechatLogin(event?.code);
      case 'confirmLogin':
        return await confirmLogin(event?.token, event?.openid);
      default:
        return error(400, '不支持的操作');
    }
  } catch (err) {
    console.error('微信登录模块错误:', err);
    return error(500, err.message);
  }
};
