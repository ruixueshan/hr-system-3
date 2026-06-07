<template>
  <div class="not-found-page">
    <div class="content">
      <h1 class="code">404</h1>
      <h2 class="title">页面不存在</h2>
      <p class="description">抱歉，您访问的页面不存在或已被删除</p>
      <el-button type="primary" @click="goHome">返回首页</el-button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { useRouter } from 'vue-router';

const router = useRouter();

function goHome() {
  router.push('/');
}
</script>

<style scoped lang="scss">
.not-found-page {
  display: flex;
  justify-content: center;
  align-items: center;
  min-height: 100vh;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);

  .content {
    text-align: center;
    color: #fff;

    .code {
      font-size: 120px;
      font-weight: 700;
      margin: 0;
      line-height: 1;
    }

    .title {
      font-size: 32px;
      margin: 16px 0 8px;
    }

    .description {
      font-size: 16px;
      opacity: 0.9;
      margin-bottom: 32px;
    }
  }
}
</style>
