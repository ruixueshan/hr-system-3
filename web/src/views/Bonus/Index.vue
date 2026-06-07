<template>
  <div class="bonus-page">
    <el-tabs v-model="activeTab">
      <el-tab-pane label="提成结算" name="batches">
        <el-card class="filter-card">
          <el-form :model="filterForm" inline>
            <el-form-item label="HR员工">
              <el-select v-model="filterForm.hr_id" placeholder="选择HR" clearable filterable style="width: 220px;">
                <el-option v-for="hr in hrUsers" :key="hr._id" :label="hr.name" :value="hr._id" />
              </el-select>
            </el-form-item>
            <el-form-item label="月份">
              <el-date-picker
                v-model="filterForm.year_month"
                type="month"
                placeholder="选择月份"
                format="YYYY年MM月"
                value-format="YYYY-MM"
              />
            </el-form-item>
            <el-form-item label="状态">
              <el-select v-model="filterForm.status" placeholder="全部状态" clearable style="width: 160px;">
                <el-option label="待审核" value="calculated" />
                <el-option label="已审核" value="approved" />
                <el-option label="部分发放" value="partially_paid" />
                <el-option label="已发放" value="paid" />
                <el-option label="已取消" value="cancelled" />
              </el-select>
            </el-form-item>
            <el-form-item>
              <el-button type="primary" @click="handleSearch">查询</el-button>
              <el-button @click="handleReset">重置</el-button>
              <el-button type="primary" :loading="calculating" :icon="Money" @click="handleCalculate">
                计算提成
              </el-button>
              <el-button type="success" :icon="Check" :disabled="!hasCalculableRows" @click="handleBatchApprove">批量审核</el-button>
            </el-form-item>
          </el-form>
        </el-card>

        <el-card>
          <el-table v-loading="loading" :data="tableData" stripe>
            <el-table-column prop="batch_no" label="批次号" min-width="180" />
            <el-table-column prop="recommender_name" label="HR专员" min-width="140" />
            <el-table-column prop="year_month" label="年月" width="120" />
            <el-table-column prop="candidate_count" label="提成人数" width="100">
              <template #default="{ row }">{{ row.candidate_count }}人</template>
            </el-table-column>
            <el-table-column prop="total_hours" label="累计工时" width="110">
              <template #default="{ row }">{{ row.total_hours.toFixed(2) }}</template>
            </el-table-column>
            <el-table-column prop="total_bonus" label="提成金额" width="120">
              <template #default="{ row }">¥{{ formatMoney(row.total_bonus) }}</template>
            </el-table-column>
            <el-table-column prop="status" label="状态" width="100">
              <template #default="{ row }">
                <el-tag :type="getBonusStatusType(row.status)">{{ getBonusStatusText(row.status) }}</el-tag>
              </template>
            </el-table-column>
            <el-table-column prop="approved_count" label="已审" width="90">
              <template #default="{ row }">{{ row.approved_count }}人</template>
            </el-table-column>
            <el-table-column prop="paid_count" label="已发" width="90">
              <template #default="{ row }">{{ row.paid_count }}人</template>
            </el-table-column>
            <el-table-column prop="calculated_at" label="结算时间" width="190">
              <template #default="{ row }"><BeijingDateTime :value="row.calculated_at" /></template>
            </el-table-column>
            <el-table-column label="操作" width="170" fixed="right">
              <template #default="{ row }">
                <el-button link type="primary" @click="handleView(row)">明细</el-button>
                <el-button link type="success" @click="handleApprove(row)" v-if="row.status === 'calculated'">
                  审核通过
                </el-button>
              </template>
            </el-table-column>

            <template #empty>
              <el-empty description="暂无提成数据" />
            </template>
          </el-table>

          <div class="pagination-wrapper">
            <el-pagination
              v-model:current-page="pagination.page"
              v-model:page-size="pagination.pageSize"
              :total="pagination.total"
              :page-sizes="[10, 20, 50]"
              layout="total, sizes, prev, pager, next, jumper"
              @size-change="onSizeChange"
              @current-change="onCurrentChange"
            />
          </div>
        </el-card>
      </el-tab-pane>

      <el-tab-pane label="规则管理" name="rules">
        <RulesManager />
      </el-tab-pane>
    </el-tabs>

    <el-dialog v-model="detailVisible" title="提成明细" width="980px">
      <div v-if="detailBatch" class="detail-header">
        <span>批次：{{ detailBatch.batch_no || '-' }}</span>
        <span>HR：{{ detailBatch.recommender_name || '-' }}</span>
        <span>月份：{{ detailBatch.year_month || '-' }}</span>
        <span>人数：{{ detailBatch.candidate_count || 0 }}人</span>
        <span>金额：¥{{ formatMoney(detailBatch.total_bonus || 0) }}</span>
      </div>

      <el-table v-loading="detailLoading" :data="detailRows" stripe max-height="520">
        <el-table-column prop="candidate_name" label="员工姓名" min-width="120" />
        <el-table-column prop="company_name" label="企业" min-width="160" />
        <el-table-column prop="join_date" label="入职日期" width="120" />
        <el-table-column prop="total_hours" label="工时" width="90">
          <template #default="{ row }">{{ row.total_hours.toFixed(2) }}</template>
        </el-table-column>
        <el-table-column prop="calculation_mode" label="计提方式" width="130">
          <template #default="{ row }">{{ getCalculationModeLabel(row.calculation_mode) }}</template>
        </el-table-column>
        <el-table-column label="规则值" width="100">
          <template #default="{ row }">{{ formatRuleValue(row) }}</template>
        </el-table-column>
        <el-table-column prop="calculation_base_amount" label="计提基数" width="110">
          <template #default="{ row }">{{ formatBaseAmount(row) }}</template>
        </el-table-column>
        <el-table-column prop="bonus_amount" label="金额" width="110">
          <template #default="{ row }">¥{{ formatMoney(row.bonus_amount) }}</template>
        </el-table-column>
        <el-table-column prop="status" label="状态" width="110">
          <template #default="{ row }">
            <el-tag :type="getBonusStatusType(row.status)">{{ getBonusStatusText(row.status) }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="created_at" label="计算时间" min-width="190">
          <template #default="{ row }"><BeijingDateTime :value="row.created_at" /></template>
        </el-table-column>
      </el-table>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import { Money, Check } from '@element-plus/icons-vue';
import {
  bonusApi,
  getBonusCalculationModeLabel,
  getBonusRuleValue,
  type BonusBatchStatus,
  type BonusBatchSummary,
  type RecruitmentBonusDetail
} from '@/api/modules/bonus';
import { usersApi } from '@/api/modules/users';
import { formatMoney, getCurrentMonthBeijing } from '@/utils/format';
import BeijingDateTime from '@/components/common/BeijingDateTime.vue';
import { normalizeReferrerUsers } from '@/utils/referrerUsers';
import RulesManager from './components/RulesManager.vue';
import { usePagination } from '@/composables/usePagination';
import { useTableLoading } from '@/composables/useTableLoading';

const { loading, withLoading } = useTableLoading();
const calculating = ref(false);
const activeTab = ref<'batches' | 'rules'>('batches');
const hrUsers = ref<any[]>([]);
const tableData = ref<BonusBatchSummary[]>([]);
const detailVisible = ref(false);
const { loading: detailLoading, withLoading: withDetailLoading } = useTableLoading();
const detailBatch = ref<BonusBatchSummary | null>(null);
const detailRows = ref<RecruitmentBonusDetail[]>([]);

const filterForm = reactive({
  hr_id: '',
  year_month: getCurrentMonthBeijing(),
  status: '' as '' | BonusBatchStatus
});

const { pagination, onSizeChange, onCurrentChange } = usePagination(loadData);

const hasCalculableRows = computed(() => tableData.value.some((item) => item.status === 'calculated'));

function getBonusStatusText(status: string) {
  const map: Record<string, string> = {
    calculated: '待审核',
    approved: '已审核',
    partially_paid: '部分发放',
    paid: '已发放',
    cancelled: '已取消'
  };
  return map[status] || status;
}

function getBonusStatusType(status: string): '' | 'success' | 'warning' | 'info' | 'danger' {
  const map: Record<string, '' | 'success' | 'warning' | 'info' | 'danger'> = {
    calculated: 'warning',
    approved: 'success',
    partially_paid: 'info',
    paid: 'success',
    cancelled: 'danger'
  };
  return map[status] || '';
}

function getCalculationModeLabel(mode: RecruitmentBonusDetail['calculation_mode']) {
  return getBonusCalculationModeLabel(mode);
}

function formatRuleValue(row: RecruitmentBonusDetail) {
  const value = getBonusRuleValue(row as any);
  if (row.calculation_mode === 'hourly') return value.toFixed(2);
  if (row.calculation_mode === 'service_fee') return `¥${value.toFixed(2)}`;
  return `${value.toFixed(2)}%`;
}

function formatBaseAmount(row: RecruitmentBonusDetail) {
  if (row.calculation_mode === 'hourly') return row.calculation_base_amount.toFixed(2);
  if (row.calculation_mode === 'service_fee') return `¥${formatMoney(row.calculation_base_amount)}`;
  return `¥${formatMoney(row.calculation_base_amount)}`;
}

function buildCalculateResultMessage(result: {
  created_batches: number;
  updated_batches: number;
  skipped_finalized_batches: number;
  errors?: Array<{ reason: string }>;
}) {
  const summary = [
    `新增批次 ${result.created_batches} 个`,
    `更新批次 ${result.updated_batches} 个`,
    `锁定跳过 ${result.skipped_finalized_batches} 个`
  ].join('，');

  const reasons = Array.from(new Set((result.errors || []).map((item) => item.reason).filter(Boolean)));
  if (!reasons.length) {
    return summary;
  }

  return `${summary}；${reasons.join('；')}`;
}

async function loadHrUsers() {
  try {
    const result = await usersApi.getList({ page: 1, pageSize: 500 });
    hrUsers.value = normalizeReferrerUsers(result.list || []);
  } catch (err) {
    console.error('加载HR列表失败:', err);
  }
}

async function loadData(resetPage = false) {
  if (resetPage) pagination.page = 1;
  await withLoading(async () => {
    const result = await bonusApi.getList({
      ...filterForm,
      page: pagination.page,
      pageSize: pagination.pageSize,
      hr_id: filterForm.hr_id || undefined,
      status: filterForm.status || undefined
    });
    tableData.value = result.list;
    pagination.total = result.total;
  });
}

function handleSearch() {
  loadData(true);
}

function handleReset() {
  filterForm.hr_id = '';
  filterForm.year_month = getCurrentMonthBeijing();
  filterForm.status = '';
  loadData(true);
}

async function handleCalculate() {
  if (!filterForm.year_month) {
    ElMessage.warning('请选择月份');
    return;
  }

  calculating.value = true;
  try {
    const [yearText, monthText] = filterForm.year_month.split('-');
    const result = await bonusApi.calculateBatch({
      year: Number(yearText),
      month: Number(monthText),
      recommender_id: filterForm.hr_id || undefined
    });

    const message = buildCalculateResultMessage(result);
    if ((result.errors || []).length > 0) {
      ElMessage.warning(message);
      console.warn('提成计算失败明细:', result.errors || []);
    } else {
      ElMessage.success(message);
    }
    await loadData();
  } catch (err) {
    console.error('计算失败:', err);
    ElMessage.error('计算失败');
  } finally {
    calculating.value = false;
  }
}

async function handleBatchApprove() {
  const batchIds = tableData.value.filter((item) => item.status === 'calculated').map((item) => item._id);
  if (!batchIds.length) {
    ElMessage.warning('当前列表没有待审核批次');
    return;
  }

  try {
    await ElMessageBox.confirm(`批量审核当前列表中的 ${batchIds.length} 个待审核批次？`, '提示', { type: 'warning' });
    await bonusApi.batchApprove(batchIds);
    ElMessage.success('审核通过');
    await loadData();
  } catch (err) {
    if (err !== 'cancel') console.error('批量审核失败:', err);
  }
}

async function handleView(row: BonusBatchSummary) {
  detailVisible.value = true;
  detailBatch.value = row;
  detailRows.value = [];
  await withDetailLoading(async () => {
    const result = await bonusApi.getDetail(row._id);
    detailBatch.value = result.batch;
    detailRows.value = result.details || [];
  });
}

async function handleApprove(row: BonusBatchSummary) {
  if (row.status !== 'calculated') {
    ElMessage.warning('该批次当前不可审核');
    return;
  }

  try {
    await ElMessageBox.confirm(`审核通过 ${row.recommender_name} 在 ${row.year_month} 的批次 ${row.batch_no}？`, '提示', { type: 'warning' });
    await bonusApi.approveBatch(row._id);
    ElMessage.success('审核通过');
    await loadData();
    if (detailVisible.value && detailBatch.value?._id === row._id) {
      await handleView(row);
    }
  } catch (err) {
    if (err !== 'cancel') console.error('审核失败:', err);
  }
}

onMounted(async () => {
  await Promise.all([loadHrUsers(), loadData()]);
});
</script>

<style scoped lang="scss">
.bonus-page {
  .filter-card {
    margin-bottom: 16px;
  }

  .pagination-wrapper {
    margin-top: 16px;
    display: flex;
    justify-content: flex-end;
  }

  .detail-header {
    display: flex;
    gap: 20px;
    margin-bottom: 16px;
    color: #606266;
    flex-wrap: wrap;
  }
}
</style>
