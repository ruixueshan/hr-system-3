import { createRouter, createWebHashHistory, RouteRecordRaw } from 'vue-router';
import { useAuthStore } from '@/stores/auth.store';
import { useUserStore } from '@/stores/user.store';

const routes: RouteRecordRaw[] = [
  {
    path: '/login',
    name: 'Login',
    component: () => import('@/views/Login/Index.vue'),
    meta: { title: '登录', requiresAuth: false }
  },
  {
    path: '/',
    component: () => import('@/views/Layout/Index.vue'),
    redirect: '/dashboard',
    meta: { requiresAuth: true },
    children: [
      {
        path: 'dashboard',
        name: 'Dashboard',
        component: () => import('@/views/Dashboard/Index.vue'),
        meta: { title: '仪表盘', icon: 'Odometer', permission: 'dashboard:view' }
      },
      {
        path: 'companies',
        name: 'Companies',
        component: () => import('@/views/Companies/Index.vue'),
        meta: { title: '企业管理', icon: 'OfficeBuilding', permission: 'companies:manage' }
      },
      {
        path: 'jobs',
        name: 'Jobs',
        component: () => import('@/views/Jobs/Index.vue'),
        meta: { title: '岗位管理', icon: 'MoreFilled', permission: 'jobs:manage' }
      },
      {
        path: 'candidates',
        name: 'Candidates',
        component: () => import('@/views/Candidates/Index.vue'),
        meta: { title: '候选人库', icon: 'User', permission: 'candidates:view' }
      },
      {
        path: 'interviews',
        name: 'Interviews',
        component: () => import('@/views/Interviews/Index.vue'),
        meta: { title: '面试管理', icon: 'ChatLineRound', permission: 'interviews:manage' }
      },
      {
        path: 'employees',
        name: 'EmployeeProfiles',
        component: () => import('@/views/EmployeeProfiles/Index.vue'),
        meta: { title: '员工档案管理', icon: 'User', permission: 'employees:manage' }
      },
      {
        path: 'employment',
        name: 'Employment',
        component: () => import('@/views/Employees/Index.vue'),
        meta: { title: '在职管理', icon: 'UserFilled', permission: 'employees:manage' }
      },
      {
        path: 'worktime',
        name: 'Worktime',
        component: () => import('@/views/Worktime/Index.vue'),
        meta: { title: '工时管理', icon: 'Timer', permission: 'worktime:manage' }
      },
      {
        path: 'salary',
        name: 'Salary',
        component: () => import('@/views/Salary/Index.vue'),
        meta: { title: '薪资管理', icon: 'Money', permission: 'salary:manage' }
      },
      {
        path: 'bank-transfer',
        name: 'BankTransfer',
        component: () => import('@/views/BankTransfer/Index.vue'),
        meta: { title: '一键发薪', icon: 'CreditCard', permission: 'salary:manage' }
      },
      {
        path: 'wallet-withdrawals',
        name: 'WalletWithdrawals',
        component: () => import('@/views/WalletWithdrawals/Index.vue'),
        meta: { title: '微信发薪管理', icon: 'Wallet', permission: 'salary:manage' }
      },
      {
        path: 'project-reimbursements',
        name: 'ProjectReimbursements',
        component: () => import('@/views/ProjectReimbursements/Index.vue'),
        meta: { title: '项目报销', icon: 'Tickets', permission: 'salary:manage' }
      },
      {
        path: 'bonus',
        name: 'Bonus',
        component: () => import('@/views/Bonus/Index.vue'),
        meta: { title: '提成管理', icon: 'Trophy', permission: 'bonus:manage' }
      },
      {
        path: 'rate-plans',
        name: 'RatePlans',
        component: () => import('@/views/RatePlans/Index.vue'),
        meta: { title: '工价方案', icon: 'Money', permission: 'salary:manage' }
      },
      {
        path: 'insurance',
        name: 'Insurance',
        component: () => import('@/views/Insurance/Index.vue'),
        meta: { title: '保险管理', icon: 'Money', permission: 'insurance:view' }
      },
      {
        path: 'reports',
        name: 'Reports',
        component: () => import('@/views/Reports/Index.vue'),
        meta: { title: '报表统计', icon: 'DataAnalysis', permission: 'reports:view' }
      },
      {
        path: 'finance-reports',
        name: 'FinanceReports',
        component: () => import('@/views/Finance/Index.vue'),
        meta: { title: '财务统计', icon: 'DataAnalysis', permission: 'reports:view' }
      },
      {
        path: 'profile',
        name: 'Profile',
        component: () => import('@/views/Profile/Index.vue'),
        meta: { title: '个人中心', icon: 'User', permission: '' }
      },
      {
        path: 'settings',
        name: 'Settings',
        component: () => import('@/views/Settings/Index.vue'),
        meta: { title: '系统设置', icon: 'Setting', permission: 'settings:manage' }
      },
      ...(import.meta.env.DEV ? [{
        path: 'devtools',
        name: 'DevTools',
        component: () => import('@/views/DevTools/Index.vue'),
        meta: { title: '开发者工具', icon: 'Tools', permission: 'devtools:access' }
      }] : []),
      {
        path: '/:pathMatch(.*)*',
        redirect: '/404'
      }
    ]
  },
  {
    path: '/404',
    name: 'NotFound',
    component: () => import('@/views/Error/404.vue'),
    meta: { title: '404', requiresAuth: false }
  }
];

const router = createRouter({
  history: createWebHashHistory(),
  routes
});

// 处理路由懒加载失败（如网络抖动、热更新失效）时的空白页
router.onError((error) => {
  const message = error?.message || '';
  const chunkFailed = message.includes('Loading chunk') || message.includes('Failed to fetch dynamically imported module');
  if (chunkFailed) {
    console.warn('[Router] 发现路由模块加载失败，自动刷新恢复');
    window.location.reload();
  } else {
    console.error('[Router] 路由错误:', error);
  }
});

// 路由守卫
router.beforeEach(async (to, from, next) => {
  const authStore = useAuthStore();
  const userStore = useUserStore();

  // 设置页面标题
  if (to.meta.title) {
    document.title = `${to.meta.title} - ${import.meta.env.VITE_APP_TITLE || '展瑞HR系统'}`;
  }

  // 需要认证的页面
  if (to.meta.requiresAuth !== false) {
    if (!authStore.isLoggedIn) {
      next({ path: '/login', query: { redirect: to.fullPath } });
      return;
    }

    if (authStore.token && userStore.permissions.length === 0) {
      const valid = await authStore.init();
      if (!valid) {
        next({ path: '/login', query: { redirect: to.fullPath } });
        return;
      }
    }

    const requiredPermission = to.meta.permission as string | undefined;
    if (requiredPermission && !userStore.hasPermission(requiredPermission)) {
      next(to.path === '/dashboard' ? '/404' : '/dashboard');
      return;
    }
  } else {
    // 已登录用户访问登录页，重定向到首页
    if (authStore.isLoggedIn && to.path === '/login') {
      next('/dashboard');
      return;
    }
  }

  next();
});

export default router;
