// api/request.ts - Axios 封装
import axios from 'axios';
import { ElMessage } from 'element-plus';
import { useAuthStore } from '@/stores/auth.store';

const request = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL || 'https://cloud1-5glojms9a83c3457.service.tcloudbase.com/HTTP',
  timeout: 10000,
  headers: {
    'Content-Type': 'application/json'
  }
});

// 请求拦截器
request.interceptors.request.use(
  (config) => {
    const authStore = useAuthStore();
    if (authStore.token) {
      config.headers.Authorization = `Bearer ${authStore.token}`;
    }
    return config;
  },
  (error) => Promise.reject(error)
);

// 响应拦截器
request.interceptors.response.use(
  (response) => {
    const { data } = response;
    // CloudBase 云函数返回格式: { code: 0, data, message }
    if (data.code === 0) {
      return data.data;
    } else if (data.code === 401) {
      const authStore = useAuthStore();
      authStore.logout();
      ElMessage.error(data.message || '登录已失效，请重新登录');
      if (window.location.pathname !== '/login') {
        window.location.href = '/login';
      }
      return Promise.reject(new Error(data.message || '登录已失效'));
    } else {
      ElMessage.error(data.message || '请求失败');
      return Promise.reject(new Error(data.message));
    }
  },
  (error) => {
    const { response } = error;
    if (response?.status === 401) {
      const authStore = useAuthStore();
      authStore.logout();
      window.location.href = '/login';
    } else if (response?.status >= 500) {
      ElMessage.error('服务器错误');
    } else {
      ElMessage.error(error.message || '网络请求失败');
    }
    return Promise.reject(error);
  }
);

export default request;
