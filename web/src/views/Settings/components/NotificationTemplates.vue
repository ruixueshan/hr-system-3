<template>
  <div class="notification-templates">
    <el-button type="primary" class="mb-16">新增模板</el-button>
    <el-table :data="templates" stripe>
      <el-table-column prop="name" label="模板名称" width="200" />
      <el-table-column prop="type" label="类型" width="120">
        <template #default="{ row }">{{ getTypeText(row.type) }}</template>
      </el-table-column>
      <el-table-column prop="content" label="模板内容" min-width="300" />
      <el-table-column label="操作" width="150">
        <template #default="{ row }">
          <el-button link type="primary">编辑</el-button>
          <el-button link type="danger">删除</el-button>
        </template>
      </el-table-column>
    </el-table>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue';

const templates = ref([
  { name: '面试通知', type: 'sms', content: '您已通过初筛，请于{date}参加面试' },
  { name: '入职通知', type: 'sms', content: '恭喜您通过面试，请于{date}入职' },
  { name: '工资条', type: 'wechat', content: '您的{month}月份工资已发放，金额{amount}' }
]);

function getTypeText(type: string) {
  const map: Record<string, string> = { sms: '短信', wechat: '微信', email: '邮件' };
  return map[type] || type;
}
</script>

<style scoped lang="scss">
.notification-templates {
  .mb-16 {
    margin-bottom: 16px;
  }
}
</style>
