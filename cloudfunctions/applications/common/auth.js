/**
 * 云函数通用验证模块
 * 提供 token 验证、用户信息获取等通用功能
 */

const cloud = require('wx-server-sdk');
const { success, error } = require('./response');
let db = null;

/**
 * 初始化云开发（懒加载）
 */
function getDatabase() {
  if (!db) {
    cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
    db = cloud.database();
  }
  return db;
}

/**
 * 验证 token 并返回用户信息
 * @param {string} token - 登录 token
 * @param {boolean} required - 是否必须登录，默认 true
 * @returns {Object} { valid: boolean, userInfo: object, error: object }
 */
async function verifyToken(token, required = true) {
  // 如果不需要登录且没有 token，直接返回
  if (!required && !token) {
    return { valid: false, userInfo: null, isOptional: true };
  }

  // 如果需要登录但没有 token
  if (required && !token) {
    return {
      valid: false,
      userInfo: null,
      error: error(401, '未登录，请先登录')
    };
  }

  try {
    const db = getDatabase();

    // 查询 token 是否有效
    const tokenResult = await db.collection('login_tokens')
      .where({
        token: token,
        status: 'logged'
      })
      .get();

    if (!tokenResult.data || tokenResult.data.length === 0) {
      return {
        valid: false,
        userInfo: null,
        error: error(401, '登录已过期，请重新登录')
      };
    }

    const tokenRecord = tokenResult.data[0];

    // 检查是否过期
    const now = Date.now();
    if (now > tokenRecord.expire_time) {
      return {
        valid: false,
        userInfo: null,
        error: error(401, '登录已过期，请重新登录')
      };
    }

    // 获取用户信息
    const userResult = await db.collection('users')
      .doc(tokenRecord.user_id)
      .get();

    if (!userResult.data) {
      return {
        valid: false,
        userInfo: null,
        error: error(404, '用户不存在')
      };
    }

    return {
      valid: true,
      userInfo: userResult.data,
      tokenRecord: tokenRecord
    };

  } catch (err) {
    console.error('验证 token 失败:', err);
    return {
      valid: false,
      userInfo: null,
      error: error(500, '验证登录状态失败: ' + (err.message || err))
    };
  }
}

/**
 * 云函数入口包装器 - 自动验证 token
 * @param {Function} handler - 实际的业务处理函数
 * @param {boolean} required - 是否必须登录，默认 true
 */
function withAuth(handler, required = true) {
  return async (event, context) => {
    try {
      const token = event.token;
      const result = await verifyToken(token, required);

      // 可选登录且未登录的情况
      if (result.isOptional && !token) {
        return handler(event, context, null);
      }

      // token 无效
      if (!result.valid) {
        return result.error;
      }

      // token 有效，调用实际处理函数
      return handler(event, context, result.userInfo, result.tokenRecord);

    } catch (err) {
      console.error('withAuth 包装器错误:', err);
      return error(500, '服务器错误: ' + (err.message || err));
    }
  };
}

module.exports = {
  verifyToken,
  withAuth,
  getDatabase,
  error,
  success
};
