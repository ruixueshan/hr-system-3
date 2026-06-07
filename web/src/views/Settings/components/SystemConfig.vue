<template>
  <div class="system-config">
    <el-row :gutter="20">
      <el-col :xs="24" :lg="12">
        <el-card title="系统参数">
          <el-form :model="config" label-width="150px">
            <el-form-item label="公司名称">
              <el-input v-model="config.company_name" />
            </el-form-item>
            <el-form-item label="客服电话">
              <el-input v-model="config.service_phone" />
            </el-form-item>
            <el-form-item label="HR提成规则">
              <el-input v-model="config.hr_bonus_rule" type="textarea" :rows="3" />
            </el-form-item>
            <el-form-item label="外协提成规则">
              <el-input v-model="config.external_bonus_rule" type="textarea" :rows="3" />
            </el-form-item>
            <el-form-item label="预支比例上限">
              <el-input-number v-model="config.advance_limit_percent" :min="1" :max="100" />
              <span class="ml-8">%</span>
            </el-form-item>
            <el-form-item label="单次预支上限">
              <el-input-number v-model="config.advance_max_amount" :min="100" :max="100000" />
              <span class="ml-8">元</span>
            </el-form-item>
            <el-form-item label="每月可预支次数">
              <el-input-number v-model="config.advance_monthly_times" :min="1" :max="10" />
              <span class="ml-8">次</span>
            </el-form-item>
            <el-form-item label="是否允许跨月扣回">
              <el-switch v-model="config.advance_allow_cross_month" active-text="允许" inactive-text="本月扣回" />
            </el-form-item>
            <el-form-item>
              <el-button type="primary" @click="handleSave">保存配置</el-button>
            </el-form-item>
          </el-form>
        </el-card>
      </el-col>
    </el-row>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { ElMessage } from 'element-plus';

const config = ref({
  company_name: '宿迁展瑞人力资源有限公司',
  service_phone: '13815736023',
  hr_bonus_rule: '每月推荐3人以上，每人奖励100元',
  external_bonus_rule: '候选人工作满7天，奖励200元/人',
  advance_limit_percent: 50,
  advance_max_amount: 5000,
  advance_monthly_times: 2,
  advance_allow_cross_month: false
});

const STORAGE_KEY = 'hr3_system_config';

onMounted(() => {
  const saved = localStorage.getItem(STORAGE_KEY);
  if (saved) {
    try {
      Object.assign(config.value, JSON.parse(saved));
    } catch (err) {
      console.warn('读取系统配置失败', err);
    }
  }
});

function handleSave() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(config.value));
  ElMessage.success('配置已保存');
}
</script>

<style scoped lang="scss">
.system-config {
  .ml-8 {
    margin-left: 8px;
  }
}
</style>
