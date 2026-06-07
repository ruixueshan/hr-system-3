/**
 * 响应格式化云函数
 * 提供统一成功/错误响应格式
 */

const cloud = require('wx-server-sdk');
cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
});

/**
 * 统一响应格式
 */
function success(data = null, message = 'success') {
  return {
    code: 0,
    message,
    data
  };
}

function error(code = 1, message = 'error', data = null) {
  return {
    code,
    message,
    data
  };
}

/**
 * 主入口
 */
exports.main = async (event, context) => {
  const { action, params = {} } = event;
  
  try {
    switch (action) {
      case 'success':
        // 成功响应
        const { data, message } = params;
        const successResponse = success(data, message);
        return successResponse;
        
      case 'error':
        // 错误响应
        const { code, message: errorMessage, data: errorData } = params;
        const errorResponse = error(code, errorMessage, errorData);
        return errorResponse;
        
      case 'format':
        // 通用格式化，根据success参数决定
        const { isSuccess, ...formatParams } = params;
        if (isSuccess) {
          return success(formatParams.data, formatParams.message);
        } else {
          return error(formatParams.code, formatParams.message, formatParams.data);
        }
        
      default:
        // 默认返回错误响应
        return error(400, `未知操作: ${action}`);
    }
  } catch (err) {
    console.error('响应云函数错误:', err);
    return error(500, err.message || 'internal error');
  }
};