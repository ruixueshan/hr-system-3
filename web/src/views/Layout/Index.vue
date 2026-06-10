<template>
  <div class="layout-container">
    <el-aside :width="isCollapse ? '64px' : '200px'" class="sidebar">
      <Sidebar :is-collapse="isCollapse" />
    </el-aside>
    <el-container class="main-container">
      <el-header class="header">
        <Header @toggle-sidebar="toggleSidebar" />
      </el-header>
      <el-main class="main">
        <router-view v-slot="{ Component }">
          <component :is="Component" :key="$route.fullPath" />
        </router-view>
      </el-main>
    </el-container>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import { ElContainer, ElAside, ElHeader, ElMain } from 'element-plus';
import Sidebar from './Sidebar/Index.vue';
import Header from './Header/Index.vue';

const isCollapse = ref(false);

function toggleSidebar() {
  isCollapse.value = !isCollapse.value;
}
</script>

<style scoped lang="scss">
.layout-container {
  display: flex;
  height: 100vh;
  overflow: hidden;
}

.sidebar {
  background-color: var(--sidebar-bg);
  transition: width 0.3s;
  overflow: hidden;
}

.main-container {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.header {
  background-color: #fff;
  box-shadow: 0 1px 4px rgba(0, 21, 41, 0.08);
  display: flex;
  align-items: center;
  padding: 0 20px;
  height: 60px;
}

.main {
  background-color: var(--bg-color);
  padding: 20px;
  overflow-y: auto;
  overflow-x: hidden;
  min-height: 0;
}

.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.2s ease;
}

.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}
</style>
