/**
 * CloudBase 云函数调用封装
 * Web 端直接调用 CloudBase 数据库
 */

import cloudbase from '@cloudbase/js-sdk';

// 初始化 CloudBase
const cloud = cloudbase.init({
  env: import.meta.env.VITE_CLOUDBASE_ENV || 'cloud1-5glojms9a83c3457',
  region: import.meta.env.VITE_CLOUDBASE_REGION || 'ap-shanghai'
});

console.log('[CloudBase] 初始化配置:', {
  env: import.meta.env.VITE_CLOUDBASE_ENV,
  region: import.meta.env.VITE_CLOUDBASE_REGION
});

// 认证初始化标志
let authInitialized = false;
let authInitPromise: Promise<boolean> | null = null;

// 初始化认证（匿名或自定义登录）
async function ensureAuthInitialized() {
  if (authInitialized) return true;

  if (authInitPromise) return authInitPromise;

  authInitPromise = (async () => {
    try {
      const auth = cloud.auth({
        persistence: 'local'
      });

      // 检查是否已登录
      const loginState = await auth.getLoginState().catch(() => null);
      if (!loginState) {
        // 尝试匿名登录
        await auth.signInAnonymously();
      }

      authInitialized = true;
      console.log('[CloudBase] 认证初始化成功');
      return true;
    } catch (err: any) {
      authInitialized = false;
      const message = err?.message || '未知错误';
      console.warn('[CloudBase] 认证初始化失败:', message);
      throw new Error(`CloudBase 认证初始化失败: ${message}`);
    } finally {
      authInitPromise = null;
    }
  })();

  return authInitPromise;
}

function resetAuthInitialization() {
  authInitialized = false;
  authInitPromise = null;
}

function isCloudBaseAuthStateError(err: any) {
  return typeof err?.message === 'string' && err.message.includes("Cannot read properties of null (reading 'scope')");
}

function clearCloudBaseLocalAuthCache() {
  const storageKeys = [localStorage, sessionStorage];

  storageKeys.forEach((storage) => {
    Object.keys(storage)
      .filter((key) => key.toLowerCase().includes('cloudbase') || key.toLowerCase().includes('tcb'))
      .forEach((key) => storage.removeItem(key));
  });
}

async function ensureAuthInitializedWithRetry() {
  try {
    return await ensureAuthInitialized();
  } catch (err: any) {
    if (!isCloudBaseAuthStateError(err)) {
      throw err;
    }

    resetAuthInitialization();
    clearCloudBaseLocalAuthCache();
    return ensureAuthInitialized();
  }
}

// 获取数据库实例
export async function getDatabase() {
  try {
    // 确保认证已初始化
    await ensureAuthInitializedWithRetry();
    
    const db = cloud.database();
    if (!db) {
      throw new Error('数据库实例为 null，请检查 CloudBase 初始化');
    }
    return db;
  } catch (err: any) {
    console.error('[getDatabase] 获取数据库失败:', err?.message);
    throw new Error('数据库连接失败: ' + (err?.message || '未知错误'));
  }
}

// 获取云实例
export { cloud };

// 存储Cookie的key
const COOKIE_KEY = 'hr3_token';
const USER_INFO_KEY = 'hr3_user';

function getStoredUserInfo() {
  const storedUserRaw = sessionStorage.getItem(USER_INFO_KEY)
    || localStorage.getItem(USER_INFO_KEY)
    || localStorage.getItem('userInfo')
    || '{}';

  try {
    const storedUser = JSON.parse(storedUserRaw);
    if (!storedUser || typeof storedUser !== 'object') return null;
    const uid = storedUser._id || storedUser.id || '';
    if (!uid) return null;
    return {
      uid,
      id: uid,
      _id: uid,
      name: storedUser.real_name || storedUser.name || '',
      real_name: storedUser.real_name || storedUser.name || '',
      phone: storedUser.phone || '',
      role: storedUser.role || ''
    };
  } catch {
    return null;
  }
}

// 初始化 CloudBase（确保认证）
export async function initCloud() {
  try {
    // CloudBase 已经在顶部初始化了，这里不需要重复初始化
    console.log('[initCloud] CloudBase 已初始化');
    return true;
  } catch (err: any) {
    console.error('[initCloud] 初始化失败:', err);
    return false;
  }
}

// 登出
export function logout() {
  localStorage.removeItem(COOKIE_KEY);
  localStorage.removeItem(USER_INFO_KEY);
  return Promise.resolve(null);
}

function tryParseJsonPayload(value: any) {
  if (typeof value !== 'string') return value;
  const text = value.trim();
  if (!text) return value;
  if (!(text.startsWith('{') || text.startsWith('['))) return value;
  try {
    return JSON.parse(text);
  } catch {
    return value;
  }
}

function normalizeCloudFunctionResponse(result: any) {
  let current = tryParseJsonPayload(result);

  for (let index = 0; index < 3; index += 1) {
    if (!current) break;
    if (typeof current.code === 'number') return current;

    const next = tryParseJsonPayload(current.result);
    if (next && next !== current) {
      current = next;
      continue;
    }

    if (current.data !== undefined && typeof current.data === 'object' && current.data !== null && typeof current.data.code === 'number') {
      current = current.data;
      continue;
    }

    break;
  }

  return current;
}

// 通用云函数调用
export async function callFunction(functionName: string, action: string, data: any = {}) {
  try {
    // 确保初始化
    await initCloud();
    await ensureAuthInitializedWithRetry();
    
    // 将 action 与 data 展开为顶层字段，兼容后端云函数的参数解构
    const payload = Object.assign({ action }, data || {});
    const localUserInfo = getStoredUserInfo();
    if (localUserInfo && payload.userInfo === undefined) {
      payload.userInfo = localUserInfo;
    }
    // 传递 token 给云函数，支撑 Web 端身份验证
    // 云函数通过 event.token → login_tokens 表 → 获取用户信息
    if (!payload.token) {
      const storedToken = sessionStorage.getItem('hr3_token')
        || localStorage.getItem('hr3_token')
        || '';
      if (storedToken) {
        payload.token = storedToken;
      }
    }
    const result = await cloud.callFunction({
      name: functionName,
      data: payload
    });

    // 兼容性保护：部分环境 cloud.callFunction 返回的结构可能不同。
    // 优先使用 result.result，如果不存在则退回到 result 本身。
    const resObj = normalizeCloudFunctionResponse((result && result.result) ? result.result : result);

    if (!resObj) {
      throw new Error('云函数返回无效响应');
    }

    // CloudBase 返回格式示例：{ code, message, data }
    if (typeof resObj.code !== 'number') {
      // 当结构不包含 code，但后端已执行成功且未返回标准结构时，尽量返回 data 或直接成功
      if (resObj.data !== undefined) return resObj.data;
      return null as any;
    }

    if (resObj.code === 0) {
      return resObj.data;
    } else {
      throw new Error(resObj.message || '云函数调用失败');
    }
  } catch (err: any) {
    console.error(`[CloudFunction:${functionName}] 调用失败:`, err);
    throw err;
  }
}

// 导出云函数模块（命名导出，供 modules 使用）
export const authApi = {
  // 发送验证码（暂时保留，可废弃）
  sendCode: (phone: string) => callFunction('auth-web-login', 'sendCode', { phone }),
  // 密码登录（云函数方式，需部署成功）
  login: (phone: string, password: string) => callFunction('auth-web-login', 'loginByPassword', { phone, password }),
  // 验证 Token
  verifyToken: (token: string) => callFunction('auth-web-login', 'verifyToken', { token }),
  // 登出
  logout: () => callFunction('auth-web-login', 'logout', {})
};

// 其他模块...

declare module '@cloudbase/js-sdk' {
  interface CloudBaseConfig {
    env: string;
    region?: string;
  }
}
