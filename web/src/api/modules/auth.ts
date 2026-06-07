/**
 * 认证模块 API - 封装登录逻辑
 */

import { 
  initCloud, 
  authApi as cloudAuthApi,
  logout as clearCloudAuthStorage
} from '../cloud';
import type { UserInfo } from '../types';

function getUserInfoFromLocal(): UserInfo | null {
  const data = sessionStorage.getItem('hr3_user') || localStorage.getItem('hr3_user');
  if (!data) return null;
  try {
    return JSON.parse(data) as UserInfo;
  } catch {
    return null;
  }
}

export const authApi = {
  // 初始化 CloudBase
  init: () => initCloud(),

  // 密码登录：必须走云函数，避免前端直接读取 users 集合或降级到本地账号
  async login(data: { phone: string, password: string }) {
    return cloudAuthApi.login(data.phone, data.password);
  },

  // 退出登录
  logout() {
    clearCloudAuthStorage();
    return cloudAuthApi.logout();
  },

  // 获取当前用户信息（读取本地存储）
  getProfile() {
    const user = getUserInfoFromLocal();
    if (!user) {
      return Promise.reject(new Error('未登录'));
    }
    return Promise.resolve(user);
  },

  // 刷新 Token（暂不实现）
  refreshToken(refreshToken: string) {
    return Promise.reject(new Error('暂未实现'));
  },

  // 验证 Token：必须以服务端状态为准，支持禁用用户即时失效
  async verifyToken(token: string) {
    const result = await cloudAuthApi.verifyToken(token);
    return (result?.user || result) as UserInfo;
  },

  // 微信登录（暂未实现）
  loginByWechat(openid: string) {
    return Promise.reject(new Error('微信登录暂未开放'));
  }
};
