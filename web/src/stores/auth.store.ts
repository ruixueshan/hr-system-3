// stores/auth.store.ts - 认证状态管理
import { defineStore } from 'pinia';
import { ref } from 'vue';
import { authApi } from '@/api/modules/auth';
import { useUserStore } from '@/stores/user.store';
import type { UserInfo } from '@/api/types';

export const useAuthStore = defineStore('auth', () => {
  // 优先读取新键名，其次旧键名，同时检查sessionStorage
  const getToken = () => {
    return sessionStorage.getItem('hr3_token') || 
           localStorage.getItem('hr3_token') || 
           localStorage.getItem('token') || '';
  };
  const getUserInfo = () => {
    let data = sessionStorage.getItem('hr3_user') || 
               localStorage.getItem('hr3_user') || 
               localStorage.getItem('userInfo');
    if (!data) return null;
    try {
      return JSON.parse(data) as UserInfo;
    } catch {
      return null;
    }
  };

  const token = ref<string>(getToken());
  const userInfo = ref<UserInfo | null>(getUserInfo());
  const isLoggedIn = ref(!!token.value);
  let initPromise: Promise<boolean> | null = null;

  function normalizeUserInfo(info: any): UserInfo {
    const uid = info?._id || info?.id || '';
    return {
      ...info,
      _id: uid,
      id: uid
    } as UserInfo;
  }

  function persistUserInfo(info: UserInfo, rememberMe = true) {
    const payload = JSON.stringify(info);
    if (rememberMe) {
      localStorage.setItem('hr3_user', payload);
      localStorage.setItem('userInfo', payload);
      return;
    }
    sessionStorage.setItem('hr3_user', payload);
  }

  // login(phone, password, rememberMe?) - 密码登录
  async function login(phone: string, password: string, rememberMe = true) {
    // 调用云函数认证，避免前端直连用户表校验密码
    const result = await authApi.login({ phone, password });
    const normalizedUser = normalizeUserInfo(result.user);
    token.value = result.token;
    userInfo.value = normalizedUser;
    isLoggedIn.value = true;
    
    if (rememberMe) {
      // 持久化存储
      localStorage.setItem('hr3_token', result.token);
      persistUserInfo(normalizedUser, true);
    } else {
      // 会话存储
      sessionStorage.setItem('hr3_token', result.token);
      persistUserInfo(normalizedUser, false);
    }

    // 加载角色权限
    const userStore = useUserStore();
    await userStore.loadPermissions(normalizedUser?.role || '');
    
    return result;
  }

  function logout() {
    token.value = '';
    userInfo.value = null;
    isLoggedIn.value = false;
    // 清除所有存储
    sessionStorage.removeItem('hr3_token');
    sessionStorage.removeItem('hr3_user');
    localStorage.removeItem('hr3_token');
    localStorage.removeItem('hr3_user');
    // 同时也清理旧键名，避免残留
    localStorage.removeItem('token');
    localStorage.removeItem('userInfo');
  }

  function setUserInfo(info: UserInfo) {
    const normalizedUser = normalizeUserInfo(info);
    userInfo.value = normalizedUser;
    persistUserInfo(normalizedUser, true);
  }

  function clear() {
    logout();
  }

  // 初始化：验证本地 token 是否有效
  async function init() {
    if (!token.value) return false;
    if (initPromise) return initPromise;

    initPromise = (async () => {
      try {
        const user = normalizeUserInfo(await authApi.verifyToken(token.value));
        userInfo.value = user;
        isLoggedIn.value = true;
        persistUserInfo(user, !sessionStorage.getItem('hr3_token'));
        // 页面刷新后重新加载权限
        const userStore = useUserStore();
        await userStore.loadPermissions(user?.role || '');
        return true;
      } catch {
        logout();
        return false;
      } finally {
        initPromise = null;
      }
    })();

    return initPromise;
  }

  return {
    token,
    userInfo,
    isLoggedIn,
    login,
    logout,
    setUserInfo,
    clear,
    init
  };
});
