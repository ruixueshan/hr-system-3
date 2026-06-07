<template>
  <div class="insurance-overview">
    <div class="toolbar">
      <el-button :loading="loading.overview" @click="loadAll">刷新</el-button>
      <el-button type="primary" :loading="loading.login" @click="handleLogin">登录并检查状态</el-button>
    </div>

    <div class="two-column">
      <section class="panel">
        <div class="panel-title">云工保账号配置</div>
        <el-form label-width="110px" :model="configForm">
          <el-form-item label="Base URL">
            <el-input v-model="configForm.base_url" placeholder="https://www.langongbao.top" />
          </el-form-item>
          <el-form-item label="账号">
            <el-input v-model="configForm.user_name" placeholder="云工保 user_name" />
          </el-form-item>
          <el-form-item label="密码">
            <el-input v-model="configForm.password" type="password" show-password placeholder="留空则不修改" />
          </el-form-item>
          <el-form-item label="启用">
            <el-switch v-model="configForm.enabled" />
          </el-form-item>
          <el-form-item>
            <el-button type="primary" :loading="loading.config" @click="saveConfig">保存配置</el-button>
          </el-form-item>
        </el-form>
      </section>

      <section class="panel">
        <div class="panel-title">账户状态</div>
        <el-descriptions :column="1" border>
          <el-descriptions-item label="客户状态">
            <el-tag :type="customerReady ? 'success' : 'warning'">{{ customerStatusText }}</el-tag>
          </el-descriptions-item>
          <el-descriptions-item label="合同ID">{{ overview.config?.contract_id || '-' }}</el-descriptions-item>
          <el-descriptions-item label="最后检查"><BeijingDateTime :value="overview.config?.last_checked_at" /></el-descriptions-item>
          <el-descriptions-item label="Token更新时间"><BeijingDateTime :value="overview.config?.token_updated_at" /></el-descriptions-item>
        </el-descriptions>
      </section>
    </div>

    <section class="panel">
      <div class="panel-title">同步日志</div>
      <el-table :data="syncLogs" height="300" stripe>
        <el-table-column prop="sync_type" label="类型" width="160" />
        <el-table-column prop="status" label="状态" width="120" />
        <el-table-column prop="summary" label="摘要" min-width="220">
          <template #default="{ row }">{{ formatJson(row.summary) }}</template>
        </el-table-column>
        <el-table-column label="时间" width="180">
          <template #default="{ row }"><BeijingDateTime :value="row.created_at" /></template>
        </el-table-column>
      </el-table>
    </section>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue';
import { ElMessage } from 'element-plus';
import { insuranceApi } from '@/api/modules/insurance';
import BeijingDateTime from '@/components/common/BeijingDateTime.vue';

const overview = reactive<any>({});
const configForm = reactive<any>({ base_url: 'https://www.langongbao.top', user_name: '', password: '', enabled: true });
const loading = reactive<Record<string, boolean>>({});
const syncLogs = ref<any[]>([]);

const customerReady = computed(() => Number(overview.config?.customer_status) === 0);
const customerStatusText = computed(() => {
  const status = Number(overview.config?.customer_status);
  if (status === 0) return '正常';
  if (status === 1) return '待认证';
  if (status === 2) return '待签约咨询服务协议';
  if (status === 3) return '待签约企业开户承诺书';
  return '未检查';
});

function setLoading(key: string, value: boolean) {
  loading[key] = value;
}

function formatJson(value: any) {
  if (!value) return '-';
  if (typeof value === 'string') return value;
  return JSON.stringify(value);
}

async function run(key: string, fn: () => Promise<void>, successText?: string) {
  setLoading(key, true);
  try {
    await fn();
    if (successText) ElMessage.success(successText);
  } catch (err: any) {
    ElMessage.error(err?.message || '操作失败');
  } finally {
    setLoading(key, false);
  }
}

async function loadOverview() {
  const data = await insuranceApi.getOverview();
  Object.assign(overview, data || {});
  if (overview.config) {
    Object.assign(configForm, {
      base_url: overview.config.base_url || 'https://www.langongbao.top',
      user_name: overview.config.user_name || '',
      password: '',
      enabled: overview.config.enabled !== false
    });
  }
}

async function loadLogs() {
  const logRes = await insuranceApi.listSyncLogs({ page: 1, pageSize: 50, orderBy: 'created_at' });
  syncLogs.value = logRes?.list || [];
}

async function loadAll() {
  await run('overview', async () => {
    await Promise.all([loadOverview(), loadLogs()]);
  });
}

async function saveConfig() {
  await run('config', async () => {
    await insuranceApi.saveConfig(configForm);
    await loadOverview();
  }, '配置已保存');
}

async function handleLogin() {
  await run('login', async () => {
    await insuranceApi.login();
    await loadOverview();
  }, '云工保登录成功');
}

onMounted(() => {
  void loadAll();
});
</script>

<style scoped lang="scss">
.insurance-overview {
  .toolbar {
    display: flex;
    justify-content: flex-end;
    gap: 8px;
    margin-bottom: 14px;
  }
}

.two-column {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
  gap: 18px;
}

.panel {
  padding: 14px 0;
}

.panel-title {
  margin-bottom: 12px;
  font-size: 15px;
  font-weight: 650;
}

@media (max-width: 920px) {
  .two-column {
    display: block;
  }
}
</style>
