/**
 * 认证授权云函数
 * 提供用户认证、token验证、权限检查等功能
 */

const cloud = require('wx-server-sdk');
cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
});
const db = cloud.database();

/**
 * 验证用户身份并返回用户信息
 * @param {Object} event - 云函数事件参数
 * @param {Array<string>} allowedRoles - 允许访问的角色数组
 * @returns {Promise<Object>} 用户信息
 */
async function authenticate(event, allowedRoles = null) {
  const wxContext = cloud.getWXContext();

  // 1. 尝试从 token 获取用户信息（Web 端）
  let user = null;
  if (event.token) {
    user = await verifyToken(event.token);
  }

  // 2. 小程序端直接用 openid
  if (!user) {
    user = await findUserByOpenId(wxContext.OPENID);
  }

  if (!user) {
    throw {
      code: 401,
      message: '用户未认证，请先登录',
      data: null
    };
  }

  // 3. 检查用户状态
  if (user.status === 'disabled') {
    throw {
      code: 403,
      message: '账号已被禁用，请联系管理员',
      data: null
    };
  }

  // 4. 检查权限（如果指定了 allowedRoles）
  if (allowedRoles && !allowedRoles.includes(user.user_type)) {
    throw {
      code: 403,
      message: '权限不足，无法访问该功能',
      data: null
    };
  }

  return user;
}

/**
 * 验证 JWT Token（Web 端）
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

/**
 * 通过 OpenID 查找用户
 */
async function findUserByOpenId(openid) {
  try {
    const userDoc = await db.collection('users')
      .where({ openid, status: { $ne: 'disabled' } })
      .get();

    if (userDoc.data.length === 0) {
      return null;
    }

    return userDoc.data[0];
  } catch (err) {
    console.error('OpenID 查找失败:', err);
    return null;
  }
}

/**
 * 检查用户是否属于指定企业（员工或管理员）
 */
async function checkCompanyAccess(userId, companyId) {
  const user = await db.collection('users').doc(userId).get();
  if (!user.data) {
    return false;
  }

  // 管理员可访问所有企业
  if (user.data.user_type === 'admin' || user.data.role === 'gm' || user.data.role === 'deputy') {
    return true;
  }

  // 检查员工-企业关联
  if (user.data.user_type === 'employee') {
    const ecDoc = await db.collection('employee_companies')
      .where({
        employee_id: userId,
        company_id,
        status: 'active'
      })
      .get();

    return ecDoc.data.length > 0;
  }

  return false;
}

/**
 * 中间件工厂：创建带权限检查的处理器
 */
function withAuth(allowedRoles = null) {
  return async (handler) => {
    return async (event, context) => {
      try {
        const user = await authenticate(event, allowedRoles);
        // 注入用户信息到 event
        event.userInfo = user;
        return await handler(event, context);
      } catch (err) {
        if (err.code === 401 || err.code === 403) {
          return {
            code: err.code,
            message: err.message,
            data: null
          };
        }
        throw err;
      }
    };
  };
}

/**
 * 主入口
 */
exports.main = async (event, context) => {
  const { action, params = {} } = event;
  
  try {
    switch (action) {
      case 'authenticate':
        // 认证用户
        const { allowedRoles } = params;
        const user = await authenticate(event, allowedRoles);
        return {
          code: 0,
          message: 'success',
          data: user
        };
        
      case 'verifyToken':
        // 验证token
        const { token } = params;
        const userInfo = await verifyToken(token);
        return {
          code: 0,
          message: 'success',
          data: userInfo
        };
        
      case 'findUserByOpenId':
        // 通过openid查找用户
        const { openid } = params;
        const userByOpenId = await findUserByOpenId(openid);
        return {
          code: 0,
          message: 'success',
          data: userByOpenId
        };
        
      case 'checkCompanyAccess':
        // 检查企业访问权限
        const { userId, companyId } = params;
        const hasAccess = await checkCompanyAccess(userId, companyId);
        return {
          code: 0,
          message: 'success',
          data: hasAccess
        };
        
      case 'withAuth':
        // 中间件工厂，这里返回一个函数描述，实际使用时需要调用
        const { handler, roles } = params;
        const authMiddleware = withAuth(roles);
        return {
          code: 0,
          message: 'success',
          data: { middleware: 'withAuth' }
        };
        
      default:
        return {
          code: 400,
          message: `未知操作: ${action}`,
          data: null
        };
    }
  } catch (error) {
    console.error('认证云函数错误:', error);
    return {
      code: error.code || 500,
      message: error.message || 'internal error',
      data: null
    };
  }
};