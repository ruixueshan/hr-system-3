<template>
  <div class="settings-page">
    <el-tabs v-model="activeTab" type="border-card" @tab-change="handleTabChange">
      <el-tab-pane label="用户管理" name="users" lazy>
        <UserManagement />
      </el-tab-pane>
      <el-tab-pane label="角色权限" name="roles" lazy>
        <RolePermissions />
      </el-tab-pane>
      <el-tab-pane label="通知模板" name="notification" lazy>
        <NotificationTemplates />
      </el-tab-pane>
      <el-tab-pane label="系统参数" name="system" lazy>
        <SystemConfig />
      </el-tab-pane>
      <el-tab-pane label="保险概览" name="insurance" lazy>
        <InsuranceOverview />
      </el-tab-pane>
      <el-tab-pane label="操作日志" name="logs" lazy>
        <OperationLogs />
      </el-tab-pane>
      <el-tab-pane label="员工账号绑定" name="employee-binding" lazy>
        <EmployeeBinding />
      </el-tab-pane>
      <el-tab-pane label="报表配置" name="report" lazy>
        <ReportConfig />
      </el-tab-pane>
    </el-tabs>
  </div>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import UserManagement from './components/UserManagement.vue';
import RolePermissions from './components/RolePermissions.vue';
import NotificationTemplates from './components/NotificationTemplates.vue';
import SystemConfig from './components/SystemConfig.vue';
import InsuranceOverview from './components/InsuranceOverview.vue';
import OperationLogs from './components/OperationLogs.vue';
import EmployeeBinding from './components/EmployeeBinding.vue';
import ReportConfig from './components/ReportConfig.vue';

const route = useRoute();
const router = useRouter();

const TAB_NAMES = ['users', 'roles', 'notification', 'system', 'insurance', 'logs', 'employee-binding', 'report'] as const;
type SettingsTabName = typeof TAB_NAMES[number];
const DEFAULT_TAB: SettingsTabName = 'users';

function isValidTabName(value: unknown): value is SettingsTabName {
  return typeof value === 'string' && TAB_NAMES.includes(value as SettingsTabName);
}

function resolveTabFromRoute(): SettingsTabName {
  const tab = route.query.tab;
  const value = Array.isArray(tab) ? tab[0] : tab;
  return isValidTabName(value) ? value : DEFAULT_TAB;
}

const activeTab = ref<SettingsTabName>(resolveTabFromRoute());

watch(
  () => route.query.tab,
  () => {
    const nextTab = resolveTabFromRoute();
    if (activeTab.value !== nextTab) {
      activeTab.value = nextTab;
    }
  },
  { immediate: true }
);

function handleTabChange(name: string | number) {
  if (typeof name !== 'string' || !isValidTabName(name)) return;
  if (route.query.tab === name) return;
  router.replace({
    query: {
      ...route.query,
      tab: name
    }
  });
}
</script>

<style scoped lang="scss">
.settings-page {
  :deep(.el-tabs) {
    min-height: calc(100vh - 120px);
  }

  :deep(.el-tabs__content) {
    padding: 20px;
  }
}
</style>
