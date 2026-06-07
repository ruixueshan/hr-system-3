// utils/api.ts - 云函数调用封装
// 注意：使用 CommonJS 模块格式以兼容小程序

interface ApiOptions {
  showLoading?: boolean;
  loadingText?: string;
}

// 兼容性导出，保持向后兼容
let api: typeof callFunction;

// 云函数映射配置
const FUNCTION_MAP: Record<string, Record<string, string>> = {
  // auth 模块 -> 对应的云函数名
  'auth': {
    'login': 'auth-login',
    'send-code': 'auth-login', // 验证码也走同一个函数
    'wechat-phone-login': 'auth-phone-login', // 微信手机号快捷登录
    'web-login': 'auth-web-login',
    'verify-token': 'auth-token-verify',
    'token-verify': 'auth-token-verify'
  },
  // 其他模块保持原样
  'users': { 'default': 'users' },
  'companies': { 'default': 'companies' },
  'jobs': { 'default': 'jobs' },
  'applications': { 'default': 'applications' },
  'interviews': { 'default': 'interviews' },
  'employees': { 'default': 'employees' },
  'candidates': { 'default': 'candidates' },
  'worktime': { 'default': 'worktime' },
  // 薪资/薪酬引擎统一走 V2，保留旧模块名别名兼容历史页面调用
  'salary-engine': { 'default': 'salary-engine-v2' },
  'salary-engine-v2': { 'default': 'salary-engine-v2' },
  'salaries': { 'default': 'salaries-v2' },
  'salaries-v2': { 'default': 'salaries-v2' },
  'wallet': { 'default': 'wallet' },
  'withdraw': { 'default': 'wallet' },
  'payment-proxy': { 'default': 'payment-proxy' },
  'advances': { 'default': 'advances' },
  'blacklist': { 'default': 'blacklist' },
  'archives': { 'default': 'archives' },
  'logs': { 'default': 'logs' },
  'stats': { 'default': 'stats' },
  'bonus-config': { 'default': 'bonus-config' },
  'notification': { 'default': 'notification' },
  'qrcode': { 'default': 'qrcode' },
  'system': { 'default': 'system' },
  'archive': { 'default': 'archive' }
};

function sanitizeErrorMessage(message: any, fallback = '请求失败，请稍后重试'): string {
  const text = String(message || '').trim();
  if (!text) return fallback;

  const firstLine = text
    .split('\n')
    .map(line => line.trim())
    .find(line => line && !/^at\s/i.test(line) && !/^\(/.test(line));

  const normalized = firstLine || text.split('\n')[0].trim() || fallback;

  if (/FUNCTIONS_EXECUTE_FAIL|toSDKError|returnAsFinalCloudSDKError|wx-server-sdk|processTicksAndRejections/i.test(text)) {
    return '系统处理报名时出现异常，请稍后重试或联系管理员。';
  }

  if (/abort\)?$/i.test(normalized) || normalized.length > 80) {
    return fallback;
  }

  return normalized;
}

function getErrorMessage(err: any, fallback = '请求失败，请稍后重试'): string {
  return sanitizeErrorMessage(
    err?.userMessage || err?.message || err?.result?.message || err?.errMsg || '',
    fallback
  );
}

async function callFunction(
  module: string,
  action: string,
  data: any = {},
  options: ApiOptions = {}
): Promise<any> {
  const { showLoading = true, loadingText = '加载中...' } = options;

  if (showLoading) {
    wx.showLoading({ title: loadingText, mask: true });
  }

  try {
    // 获取 token
    const token = wx.getStorageSync('token');

    // 确定实际云函数名
    const moduleMap = FUNCTION_MAP[module];
    let functionName = module;
    if (moduleMap) {
      functionName = moduleMap[action] || moduleMap['default'] || module;
    }

    // 构建请求数据，自动添加 token
    const requestData: any = {
      action,
      token: token,  // 自动传递 token
      ...data
    };

    console.log(`[API] 调用云函数: ${functionName}, action: ${action}, token: ${token ? '已携带' : '未携带'}`);

    // 调用云函数
    const result = await wx.cloud.callFunction({
      name: functionName,
      data: requestData
    });

    if (showLoading) {
      wx.hideLoading();
    }

    if (result.result.code === 0) {
      return result.result.data;
    } else {
      // 抛出包含完整错误信息的对象
      const error: any = new Error(result.result.message || '请求失败');
      error.result = result.result;
      error.code = result.result.code;
      error.userMessage = sanitizeErrorMessage(result.result.message, '请求失败，请稍后重试');
      throw error;
    }
  } catch (err: any) {
    if (showLoading) {
      wx.hideLoading();
    }

    // 处理未授权 - 只对明确的401错误码才清除缓存
    const shouldClearAuth = err.code === 401 || (err.result && err.result.code === 401);
    if (shouldClearAuth) {
      wx.removeStorageSync('token');
      const app = getApp();
      if (app) {
        app.globalData.isLoggedIn = false;
        app.globalData.userInfo = null;
      }
      wx.showToast({ title: '请先登录', icon: 'none' });
      throw err;
    }

    wx.showToast({
      title: getErrorMessage(err),
      icon: 'none',
      duration: 2000
    });

    throw err;
  }
}

// 将 callFunction 赋值给 api 用于向后兼容
api = callFunction;

// 文件上传
function uploadFile(filePath: string, cloudPath: string): Promise<string> {
  return new Promise((resolve, reject) => {
    wx.showLoading({ title: '上传中...' });

    wx.cloud.uploadFile({
      cloudPath,
      filePath,
      success: (res) => {
        wx.hideLoading();
        resolve(res.fileID);
      },
      fail: (err) => {
        wx.hideLoading();
        reject(err);
      }
    });
  });
}

// 下载文件
function downloadFile(fileID: string): Promise<string> {
  return new Promise((resolve, reject) => {
    wx.showLoading({ title: '下载中...' });

    wx.cloud.downloadFile({
      fileID,
      success: (res) => {
        wx.hideLoading();
        resolve(res.tempFilePath);
      },
      fail: (err) => {
        wx.hideLoading();
        reject(err);
      }
    });
  });
}

// 创建 api 对象，支持 api.callFunction 调用方式
const apiObject = {
  callFunction,
  getErrorMessage,
  uploadFile,
  downloadFile
};

// 导出默认的 api 函数以支持 import
export default apiObject;

// 同时保留 CommonJS 导出以保持向后兼容
module.exports = apiObject;
