/**
 * Token验证云函数
 * 调用方式：{ "action": "token-verify", "token": "..." }
 */
const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();

exports.main = async (event, context) => {
  const { token } = event;
  console.log('[auth-token-verify] 收到请求，token:', token ? '存在' : '不存在');

  try {
    // 验证 Token（使用与auth云函数相同的逻辑）
    const user = await verifyToken(token);
    console.log('[auth-token-verify] 验证结果:', user ? '用户存在' : '用户不存在');
    
    if (!user) {
      return { code: 401, message: 'Token 无效或已过期' };
    }

    // 检查用户状态
    if (user.status === 'disabled') {
      return { code: 403, message: '用户已被禁用' };
    }

    // 返回用户信息，包含 _id 字段以便前端使用
    return {
      code: 0,
      message: '验证通过',
      data: {
        _id: user._id,
        name: user.name,
        role: user.role,
        phone: user.phone,
        user_type: user.user_type,
        openid: user.openid,
        status: user.status,
        // 保持向后兼容
        id: user._id
      }
    };
  } catch (err) {
    console.error('[auth-token-verify] Token验证失败:', err);
    return { code: 401, message: 'Token 验证失败' };
  }
};

/**
 * 验证 Token（与auth云函数相同的逻辑）
 * 从 login_tokens 集合查询有效token，并返回对应的用户信息
 */
async function verifyToken(token) {
  try {
    if (!token) {
      console.log('[auth-token-verify] token为空');
      return null;
    }

    console.log('[auth-token-verify] 查询login_tokens，token:', token.substring(0, 10) + '...');
    
    // 从数据库查询有效的 token
    const tokenDoc = await db.collection('login_tokens')
      .where({
        token,
        status: 'logged',
        expire_time: db.command.gt(Date.now())
      })
      .get();

    console.log('[auth-token-verify] token查询结果，数量:', tokenDoc.data.length);

    if (tokenDoc.data.length === 0) {
      console.log('[auth-token-verify] 未找到有效token');
      return null;
    }

    const tokenRecord = tokenDoc.data[0];
    console.log('[auth-token-verify] 找到token记录，user_id:', tokenRecord.user_id);
    
    const user = await db.collection('users')
      .doc(tokenRecord.user_id)
      .get();

    console.log('[auth-token-verify] 用户查询结果:', user.data ? '找到用户' : '用户不存在');
    
    return user.data || null;
  } catch (err) {
    console.error('[auth-token-verify] Token 验证失败:', err);
    return null;
  }
}
