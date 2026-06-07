<template>
  <router-view />
</template>

<script setup lang="ts">
import { onMounted } from 'vue';
import { useAuthStore } from '@/stores/auth.store';

// 应用启动时验证 token 并加载权限，确保刷新后状态恢复
const authStore = useAuthStore();
onMounted(async () => {
  if (authStore.token) {
    await authStore.init();
  }
});
</script>

<style>
#app {
  width: 100%;
  height: 100vh;
  overflow: hidden;
}
</style>
