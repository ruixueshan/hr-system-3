import { createApp } from 'vue';
import { createPinia } from 'pinia';
import 'element-plus/dist/index.css';
import App from './App.vue';
import router from './router';
import '@/assets/styles/global.scss';

if (import.meta.env.DEV) {
  import('@/utils/seed-test-data');
  import('@/utils/diagnose-cloudbase');
}

// 延迟初始化 CloudBase（在需要时由各模块调用 initCloud）
// initCloud().then(success => {
//   if (!success) {
//     console.warn('[App] CloudBase 初始化失败，部分功能可能不可用');
//   }
// }).catch(err => {
//   console.error('[App] CloudBase 初始化异常:', err);
// });

const app = createApp(App);
const pinia = createPinia();

app.use(pinia);
app.use(router);

// Global error handlers
app.config.errorHandler = (err, instance, info) => {
  console.error('[Global Error Handler]', err);
  console.error('Component:', instance);
  console.error('Info:', info);
};

app.config.warnHandler = (msg, instance, trace) => {
  console.warn('[Global Warn]', msg, trace);
};

app.mount('#app');
