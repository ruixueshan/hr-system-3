<template>
  <div class="interviews-page">
    <el-card class="search-card">
      <el-form :model="searchForm" inline>
        <el-form-item label="候选人">
          <el-input v-model="searchForm.candidate_name" placeholder="搜索候选人姓名" clearable />
        </el-form-item>
        <el-form-item label="岗位">
          <el-input v-model="searchForm.job_name" placeholder="搜索岗位" clearable />
        </el-form-item>
        <el-form-item label="面试日期">
          <el-date-picker
            v-model="searchForm.date_range"
            type="daterange"
            range-separator="至"
            start-placeholder="开始日期"
            end-placeholder="结束日期"
            value-format="YYYY-MM-DD"
          />
        </el-form-item>
        <el-form-item label="结果">
          <el-select v-model="searchForm.result" placeholder="面试结果" clearable style="width: 180px;">
            <el-option label="全部" value="" />
            <el-option label="待面试" value="pending" />
            <el-option label="已通过" value="passed" />
            <el-option label="未通过" value="rejected" />
            <el-option label="未到面" value="absent" />
          </el-select>
        </el-form-item>
        <el-form-item label="到面状态">
          <el-select v-model="searchForm.checkin_status" placeholder="到面状态" clearable style="width: 180px;">
            <el-option label="未签到" value="not_checked_in" />
            <el-option label="已到面" value="checked_in" />
            <el-option label="已入职" value="onboarded" />
            <el-option label="未到面" value="absent" />
          </el-select>
        </el-form-item>
        <el-form-item>
          <el-button type="primary" @click="handleSearch">搜索</el-button>
          <el-button @click="handleReset">重置</el-button>
        </el-form-item>
      </el-form>
    </el-card>

    <div class="toolbar">
      <el-button type="success" @click="batchPass" :disabled="!selectedRows.length">批量通过</el-button>
      <el-button type="warning" @click="batchReject" :disabled="!selectedRows.length">批量不通过</el-button>
      <el-button @click="batchAbsent" :disabled="!selectedRows.length">批量未到面</el-button>
      <el-button type="primary" @click="batchOnboard" :disabled="!selectedRows.length">批量入职</el-button>
    </div>

    <el-card>
      <el-table v-loading="loading" :data="tableData" stripe @selection-change="handleSelection">
        <el-table-column type="selection" width="50" />
        <el-table-column prop="candidate_name" label="候选人" width="150">
          <template #default="{ row }">
            <div>{{ row.candidate_name || '-' }}</div>
            <div class="text-muted">{{ row.phone || '-' }}</div>
          </template>
        </el-table-column>
        <el-table-column prop="job_name" label="岗位" min-width="200">
          <template #default="{ row }">
            <div>{{ row.job_name || '-' }}</div>
            <div class="text-muted">{{ row.company_name || '-' }}</div>
          </template>
        </el-table-column>
        <el-table-column prop="interview_time" label="面试时间" width="190">
          <template #default="{ row }"><BeijingDateTime :value="row.interview_time" /></template>
        </el-table-column>
        <el-table-column prop="checkin_status" label="到面状态" width="130">
          <template #default="{ row }">
            <el-tag :type="getCheckinStatusType(row.checkin_status)">{{ getCheckinStatusText(row.checkin_status) }}</el-tag>
            <div v-if="row.checked_in_at || row.application_checkin_time" class="text-muted">
              <BeijingDateTime :value="row.checked_in_at || row.application_checkin_time" />
            </div>
          </template>
        </el-table-column>
        <el-table-column prop="result" label="面试结果" width="120">
          <template #default="{ row }">
            <el-tag :type="getResultType(row.result)" effect="plain">{{ getResultText(row.result) }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="application_status" label="报名状态" width="120">
          <template #default="{ row }">
            <el-tag :type="getApplicationStatusType(row.application_status)" effect="plain">
              {{ getApplicationStatusText(row.application_status) }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="recommender_name" label="推荐人" width="120">
          <template #default="{ row }">{{ row.recommender_name || '-' }}</template>
        </el-table-column>
        <el-table-column prop="id_card" label="身份证号" width="190">
          <template #default="{ row }">{{ row.id_card || '-' }}</template>
        </el-table-column>
      </el-table>

      <div class="pagination-wrapper">
        <el-pagination
          v-model:current-page="pagination.page"
          v-model:page-size="pagination.pageSize"
          :total="pagination.total"
          :page-sizes="[10, 20, 50, 100]"
          layout="total, sizes, prev, pager, next, jumper"
          @size-change="onSizeChange"
          @current-change="onCurrentChange"
        />
      </div>
    </el-card>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, onMounted } from 'vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import { interviewsApi } from '@/api/modules/interviews';
import { useAuthStore } from '@/stores/auth.store';
import { usePagination } from '@/composables/usePagination';
import type { Interview } from '@/api/modules/interviews';
import { useTableLoading } from '@/composables/useTableLoading';
import { formatDate } from '@/utils/format';
import BeijingDateTime from '@/components/common/BeijingDateTime.vue';

const authStore = useAuthStore();
const { loading, withLoading } = useTableLoading();
const authReady = ref(false);
const tableData = ref<Interview[]>([]);
const selectedRows = ref<Interview[]>([]);

const today = new Date();
const sevenDaysAgo = new Date(today);
sevenDaysAgo.setDate(today.getDate() - 6);
const defaultDateRange = [formatDate(sevenDaysAgo, 'YYYY-MM-DD'), formatDate(today, 'YYYY-MM-DD')];

const searchForm = reactive({
  candidate_name: '',
  job_name: '',
  date_range: [...defaultDateRange],
  result: '',
  checkin_status: ''
});

const { pagination, onSizeChange, onCurrentChange } = usePagination(loadData);

async function ensureAuthReady() {
  if (authReady.value) return true;
  if (!authStore.token) {
    authReady.value = true;
    return false;
  }
  const valid = await authStore.init();
  authReady.value = valid;
  return valid;
}

function normalizeCheckinStatus(row: any) {
  if (row.checkin_status) return row.checkin_status;
  if (row.checked_in_at || row.application_checkin_time || row.application_status === 'arrived') return 'checked_in';
  if (row.result === 'absent') return 'absent';
  return 'not_checked_in';
}

async function loadData() {
  await withLoading(async () => {
    const ready = await ensureAuthReady();
    if (!ready) {
      tableData.value = [];
      pagination.total = 0;
      return;
    }

    const params: any = {
      page: pagination.page,
      pageSize: pagination.pageSize,
      candidate_name: searchForm.candidate_name || undefined,
      job_name: searchForm.job_name || undefined,
      result: searchForm.result || undefined,
      checkin_status: searchForm.checkin_status === 'not_checked_in' ? undefined : (searchForm.checkin_status || undefined)
    };
    if (searchForm.date_range?.length === 2) {
      params.date_from = searchForm.date_range[0];
      params.date_to = searchForm.date_range[1];
    }
    const result = await interviewsApi.getList(params);
    const rows = (result.list || []).map((item: any) => ({
      ...item,
      _id: item._id || item.application_id || item.id,
      result: item.result || item.interview_result || 'pending',
      checkin_status: normalizeCheckinStatus(item)
    }));
    tableData.value = searchForm.checkin_status === 'not_checked_in'
      ? rows.filter((item: any) => item.checkin_status === 'not_checked_in')
      : rows;
    pagination.total = result.total;
  });
}

function handleSearch() {
  pagination.page = 1;
  loadData();
}

function handleReset() {
  searchForm.candidate_name = '';
  searchForm.job_name = '';
  searchForm.date_range = [...defaultDateRange];
  searchForm.result = '';
  searchForm.checkin_status = '';
  handleSearch();
}

function getCheckinStatusText(status?: string) {
  const map: Record<string, string> = {
    not_checked_in: '未签到',
    checked_in: '已到面',
    onboarded: '已入职',
    absent: '未到面'
  };
  return map[status || ''] || '未签到';
}

function getCheckinStatusType(status?: string): '' | 'success' | 'warning' | 'info' | 'danger' {
  const map: Record<string, '' | 'success' | 'warning' | 'info' | 'danger'> = {
    not_checked_in: 'warning',
    checked_in: 'success',
    onboarded: 'success',
    absent: 'info'
  };
  return map[status || ''] || 'warning';
}

function getResultText(result?: string) {
  const map: Record<string, string> = {
    pending: '待面试',
    passed: '已通过',
    rejected: '未通过',
    absent: '未到面',
    onboarded: '已入职',
    hired: '已入职'
  };
  return map[result || ''] || '-';
}

function getResultType(result?: string): '' | 'success' | 'warning' | 'info' | 'danger' {
  const map: Record<string, '' | 'success' | 'warning' | 'info' | 'danger'> = {
    pending: 'warning',
    passed: 'success',
    rejected: 'danger',
    absent: 'info',
    onboarded: 'success',
    hired: 'success'
  };
  return map[result || ''] || 'info';
}

function getApplicationStatusText(status?: string) {
  const map: Record<string, string> = {
    pending: '待面试',
    arrived: '已到面',
    passed: '已通过',
    rejected: '已拒绝',
    onboarded: '已入职',
    cancelled: '已取消'
  };
  return map[status || ''] || '-';
}

function getApplicationStatusType(status?: string): '' | 'success' | 'warning' | 'info' | 'danger' {
  const map: Record<string, '' | 'success' | 'warning' | 'info' | 'danger'> = {
    pending: 'warning',
    arrived: 'success',
    passed: 'success',
    rejected: 'danger',
    onboarded: 'success',
    cancelled: 'info'
  };
  return map[status || ''] || 'info';
}

function handleSelection(rows: Interview[]) {
  selectedRows.value = rows;
}

async function setRowsResult(rows: Interview[], result: Interview['result']) {
  if (!rows.length) return;
  await Promise.all(rows.map((row) => interviewsApi.setResult(row._id!, result)));
}

async function onboardRows(rows: Interview[]) {
  if (!rows.length) return;
  await Promise.all(rows.map((row) => interviewsApi.onboard(row._id!)));
}

async function runBatch(label: string, runner: () => Promise<void>) {
  if (!selectedRows.value.length) return;
  try {
    await ElMessageBox.confirm(`确认${label}选中的 ${selectedRows.value.length} 条记录？`, '提示');
    await runner();
    ElMessage.success('操作成功');
    selectedRows.value = [];
    loadData();
  } catch (err: any) {
    if (err !== 'cancel') ElMessage.error(err?.message || '操作失败');
  }
}

function batchPass() {
  return runBatch('通过', () => setRowsResult(selectedRows.value, 'passed'));
}
function batchReject() {
  return runBatch('标记不通过', () => setRowsResult(selectedRows.value, 'rejected'));
}
function batchAbsent() {
  return runBatch('标记未到面', () => setRowsResult(selectedRows.value, 'absent'));
}
function batchOnboard() {
  return runBatch('办理入职', () => onboardRows(selectedRows.value));
}

onMounted(async () => {
  await ensureAuthReady();
  loadData();
});
</script>

<style scoped lang="scss">
.interviews-page {
  .search-card,
  .toolbar {
    margin-bottom: 16px;
  }

  .text-muted {
    color: #909399;
    font-size: 12px;
    margin-top: 4px;
  }

  .pagination-wrapper {
    margin-top: 16px;
    display: flex;
    justify-content: flex-end;
  }
}
</style>
