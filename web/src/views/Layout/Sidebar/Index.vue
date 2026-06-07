<template>
  <div class="sidebar-container">
    <div class="logo">
      <img :src="brandLogo" alt="展瑞logo" class="logo-image" />
      <span v-if="!isCollapse">展瑞HR</span>
    </div>

    <el-menu
      :default-active="activeMenu"
      :collapse="isCollapse"
      :unique-opened="true"
      background-color="#304156"
      text-color="#bfcbd9"
      active-text-color="#409eff"
      router
    >
      <el-menu-item index="/dashboard" v-if="userStore.hasPermission('dashboard:view')">
        <el-icon><Odometer /></el-icon>
        <template #title>仪表盘</template>
      </el-menu-item>

      <el-menu-item index="/companies" v-if="userStore.hasPermission('companies:manage')">
        <el-icon><OfficeBuilding /></el-icon>
        <template #title>企业管理</template>
      </el-menu-item>

      <el-menu-item index="/jobs" v-if="userStore.hasPermission('jobs:manage')">
        <el-icon><Briefcase /></el-icon>
        <template #title>岗位管理</template>
      </el-menu-item>

      <el-menu-item index="/candidates" v-if="userStore.hasPermission('candidates:view')">
        <el-icon><User /></el-icon>
        <template #title>候选人库</template>
      </el-menu-item>

      <el-menu-item index="/interviews" v-if="userStore.hasPermission('interviews:manage')">
        <el-icon><ChatLineRound /></el-icon>
        <template #title>面试管理</template>
      </el-menu-item>

      <el-menu-item index="/employees" v-if="userStore.hasPermission('employees:manage')">
        <el-icon><User /></el-icon>
        <template #title>员工档案管理</template>
      </el-menu-item>

      <el-menu-item index="/employment" v-if="userStore.hasPermission('employees:manage')">
        <el-icon><UserFilled /></el-icon>
        <template #title>在职管理</template>
      </el-menu-item>

      <el-menu-item index="/insurance" v-if="userStore.hasPermission('insurance:view')" @click="notifyInsuranceMenuEnter">
        <el-icon><Money /></el-icon>
        <template #title>保险管理</template>
      </el-menu-item>

      <el-sub-menu index="salary" v-if="userStore.hasPermission('salary:manage') || userStore.hasPermission('worktime:manage') || userStore.hasPermission('bonus:manage')">
        <template #title>
          <el-icon><Money /></el-icon>
          <span>薪资管理</span>
        </template>
        <el-menu-item index="/worktime" v-if="userStore.hasPermission('worktime:manage')">工时管理</el-menu-item>
        <el-menu-item index="/salary" v-if="userStore.hasPermission('salary:manage')">薪资计算</el-menu-item>
        <el-menu-item index="/bank-transfer" v-if="userStore.hasPermission('salary:manage')">一键发薪</el-menu-item>
        <el-menu-item index="/wallet-withdrawals" v-if="userStore.hasPermission('salary:manage')">微信发薪管理</el-menu-item>
        <el-menu-item index="/project-reimbursements" v-if="userStore.hasPermission('salary:manage')">项目报销</el-menu-item>
        <el-menu-item index="/bonus" v-if="userStore.hasPermission('bonus:manage')">提成管理</el-menu-item>
        <el-menu-item index="/rate-plans" v-if="userStore.hasPermission('salary:manage')">工价方案</el-menu-item>
      </el-sub-menu>

      <el-menu-item index="/reports" v-if="userStore.hasPermission('reports:view')">
        <el-icon><DataAnalysis /></el-icon>
        <template #title>报表统计</template>
      </el-menu-item>

      <el-menu-item index="/finance-reports" v-if="userStore.hasPermission('reports:view')">
        <el-icon><DataAnalysis /></el-icon>
        <template #title>财务统计</template>
      </el-menu-item>

      <el-menu-item index="/settings" v-if="userStore.hasPermission('settings:manage')">
        <el-icon><Setting /></el-icon>
        <template #title>系统设置</template>
      </el-menu-item>
    </el-menu>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { useRoute } from 'vue-router';
import { ElMenu, ElMenuItem, ElSubMenu, ElIcon } from 'element-plus';
import { useUserStore } from '@/stores/user.store';
import brandLogo from '@/assets/brand/zhanrui-logo.png';
import {
  Odometer,
  OfficeBuilding,
  Briefcase,
  User,
  ChatLineRound,
  UserFilled,
  Money,
  DataAnalysis,
  Setting
} from '@element-plus/icons-vue';

defineProps<{
  isCollapse: boolean;
}>();

const route = useRoute();
const userStore = useUserStore();
const activeMenu = computed(() => route.path);

function notifyInsuranceMenuEnter() {
  window.dispatchEvent(new CustomEvent('insurance-menu-enter'));
}
</script>

<style scoped lang="scss">
.sidebar-container {
  height: 100%;
  display: flex;
  flex-direction: column;

  .logo {
    height: 60px;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 10px;
    color: #fff;
    font-size: 18px;
    font-weight: 600;
    background-color: #2b3a4d;

    .logo-image {
      width: 40px;
      height: 40px;
      object-fit: contain;
      background: rgba(255, 248, 238, 0.96);
      padding: 4px;
      border-radius: 10px;
      box-shadow: 0 4px 10px rgba(0, 0, 0, 0.18);
    }
  }

  :deep(.el-menu) {
    border-right: none;
  }

  :deep(.el-menu-item),
  :deep(.el-sub-menu__title) {
    height: 50px;
    line-height: 50px;
  }

  :deep(.el-menu-item.is-active) {
    background-color: #263445 !important;
  }
}
</style>
