// utils/auth.ts - 登录状态管理
import api from './api';

export async function login(phone: string, code: string, userType: string): Promise<any> {
  const result = await api.callFunction('auth', 'login', { phone, code, user_type: userType });

  // 保存 token
  wx.setStorageSync('token', result.token);
  wx.setStorageSync('userInfo', result.userInfo);

  return result;
}

export function logout() {
  wx.removeStorageSync('token');
  wx.removeStorageSync('userInfo');

  const app = getApp();
  if (app) {
    app.globalData.isLoggedIn = false;
    app.globalData.userInfo = null;
  }
}

export function getToken(): string {
  return wx.getStorageSync('token') || '';
}

export function getUserInfo(): any {
  return wx.getStorageSync('userInfo') || null;
}

export function isLoggedIn(): boolean {
  return !!getToken();
}

// 刷新 token（如果需要）
export async function refreshToken(): Promise<void> {
  const refreshToken = wx.getStorageSync('refresh_token');
  if (!refreshToken) {
    throw new Error('未找到 refresh_token');
  }

  try {
    const result = await api.callFunction('auth', 'refresh', { refresh_token: refreshToken });
    wx.setStorageSync('token', result.token);
  } catch (err: any) {
    // 只对401错误才清除缓存
    if (err.code === 401 || (err.result && err.result.code === 401)) {
      logout();
    }
    throw err;
  }
}
