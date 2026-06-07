<template>
  <el-tab-pane label="月结发薪" name="monthly">
    <!-- 工时汇总提示 -->
    <el-alert
      v-if="monthlySummaryStats && monthlySummaryStats.total > 0"
      :type="monthlySummaryStats.approved === monthlySummaryStats.total ? 'success' : 'warning'"
      :closable="true"
      show-icon
    >
      <template #title>
        <span v-if="monthlySummaryStats.approved === monthlySummaryStats.total">
          ✓ 本月工时汇总已全部审核
        </span>
        <span v-else>
          ⚠️ 工时汇总审核进度：{{ monthlySummaryStats.approved }}/{{ monthlySummaryStats.total }}
        </span>
      </template>
      <div v-if="monthlySummaryStats.pending > 0" style="margin-top: 8px;">
        {{ monthlySummaryStats.pending }} 条待审核，{{ monthlySummaryStats.rejected }} 条已驳回
      </div>
    </el-alert>

    <el-card class="filter-card">
      <el-form :model="monthlyForm" inline>
        <el-form-item label="企业">
          <CompanySelect
            v-model="monthlyForm.company_id"
            placeholder="选择企业"
            clearable
            width="240px"
            @change="handleMonthlyCompanyChange"
          />
        </el-form-item>
        <el-form-item label="年月">
          <el-date-picker
            v-model="monthlyForm.year_month"
            type="month"
            placeholder="选择月份"
            format="YYYY年MM月"
            value-format="YYYY-MM"
            @change="handleMonthlyMonthChange"
          />
        </el-form-item>
        <el-form-item>
          <el-button
            type="primary"
            :loading="monthlyCalculating"
            :disabled="!isMonthlyReadyToCalculate"
            @click="handleCalculateMonthly"
          >
            计算薪资
          </el-button>
          <el-button @click="handleMonthlySearch">刷新</el-button>
          <el-button @click="() => handleToggleMonthlySummaryDetail()" :loading="checkingSummary">
            {{ showMonthlySummaryDetail ? '隐藏' : '显示' }}工时汇总
          </el-button>
          <el-button type="success" @click="handleBatchApproveCalculatedMonthly" :loading="monthlyApproving">
            批量审核已计算
          </el-button>
          <el-button :icon="Download" @click="handleExportMonthly" :disabled="!monthlyPagination.total">
            导出
          </el-button>
        </el-form-item>
      </el-form>
    </el-card>

    <!-- 工时汇总详情卡片 -->
    <el-card
      v-if="showMonthlySummaryDetail && monthlySummaryStats"
      title="月工时汇总详情"
      style="margin-bottom: 20px;"
    >
      <el-row :gutter="20" style="margin-bottom: 16px;">
        <el-col :span="6">
          <div class="stat-item">
            <div class="stat-label">总数</div>
            <div class="stat-value">{{ monthlySummaryStats.total }}</div>
          </div>
        </el-col>
        <el-col :span="6">
          <div class="stat-item">
            <div class="stat-label">已审核</div>
            <div class="stat-value" style="color: #67c23a;">{{ monthlySummaryStats.approved }}</div>
          </div>
        </el-col>
        <el-col :span="6">
          <div class="stat-item">
            <div class="stat-label">待审核</div>
            <div class="stat-value" style="color: #e6a23c;">{{ monthlySummaryStats.pending }}</div>
          </div>
        </el-col>
        <el-col :span="6">
          <div class="stat-item">
            <div class="stat-label">已驳回</div>
            <div class="stat-value" style="color: #f56c6c;">{{ monthlySummaryStats.rejected }}</div>
          </div>
        </el-col>
      </el-row>

      <el-progress
        :percentage="
          monthlySummaryStats.total > 0
            ? Math.round((monthlySummaryStats.approved / monthlySummaryStats.total) * 100)
            : 0
        "
        :color="monthlySummaryStats.approved === monthlySummaryStats.total ? '#67c23a' : '#e6a23c'"
        style="margin-bottom: 16px;"
      />

      <el-table :data="monthlySummaryList" v-loading="checkingSummary" stripe max-height="400">
        <el-table-column prop="employee_name" label="员工" width="120" />
        <el-table-column prop="employee_no" label="工号" width="100" />
        <el-table-column prop="total_hours" label="工时" width="100" />
        <el-table-column prop="total_days" label="天数" width="100" />
        <el-table-column prop="night_hours" label="夜班工时" width="100" />
        <el-table-column prop="salary_amount" label="厂方核定应发" width="140">
          <template #default="{ row }">{{ Number(row.salary_amount || 0) > 0 ? `¥${toFix(row.salary_amount)}` : '-' }}</template>
        </el-table-column>
        <el-table-column prop="status" label="状态" width="100">
          <template #default="{ row }">
            <el-tag
              :type="
                row.status === 'approved'
                  ? 'success'
                  : row.status === 'pending'
                    ? 'warning'
                    : 'danger'
              "
            >
              {{
                row.status === 'approved'
                  ? '已审核'
                  : row.status === 'pending'
                    ? '待审核'
                    : '已驳回'
              }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column label="操作" width="120" fixed="right">
          <template #default="{ row }">
            <el-button
              v-if="row.status !== 'approved'"
              link
              type="success"
              size="small"
              @click="handleApproveMonthlySummary(row)"
            >
              审核通过
            </el-button>
            <el-button
              v-if="row.status !== 'rejected'"
              link
              type="danger"
              size="small"
              @click="handleRejectMonthlySummary(row)"
            >
              驳回
            </el-button>
          </template>
        </el-table-column>
      </el-table>
    </el-card>

    <!-- 薪资列表 -->
    <el-card>
      <el-table v-loading="monthlyLoading" :data="monthlyRows" stripe>
        <el-table-column prop="employee_no" label="工号" width="120" />
        <el-table-column prop="employee_name" label="姓名" width="100" />
        <el-table-column prop="company_name" label="企业" min-width="150" />
        <el-table-column prop="job_name" label="岗位" min-width="140" />
        <el-table-column prop="regular_hours" label="总工时" width="100" />
        <el-table-column prop="total_days" label="总天数" width="100" />
        <el-table-column prop="night_allowance" label="夜班补贴" width="120">
          <template #default="{ row }">¥{{ toFix(row.night_allowance) }}</template>
        </el-table-column>
        <el-table-column prop="insurance_deduct" label="保险" width="100">
          <template #default="{ row }">¥{{ toFix(row.insurance_deduct) }}</template>
        </el-table-column>
        <el-table-column prop="tax" label="个税" width="100">
          <template #default="{ row }">¥{{ toFix(row.tax) }}</template>
        </el-table-column>
        <el-table-column prop="gross_pay" label="应发工资" width="120">
          <template #default="{ row }">¥{{ toFix(row.gross_pay || row.total_amount) }}</template>
        </el-table-column>
        <el-table-column prop="net_pay" label="实发工资" width="120">
          <template #default="{ row }">¥{{ toFix(row.net_pay || row.total_amount) }}</template>
        </el-table-column>
        <el-table-column prop="status" label="状态" width="100">
          <template #default="{ row }">
            <el-tag :type="getStatusType(row.status)">{{ getStatusText(row.status) }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column label="操作" width="160" fixed="right">
          <template #default="{ row }">
            <el-button
              link
              type="success"
              @click="handleApproveMonthly(row)"
              v-if="row.status === 'calculated'"
            >
              审核通过
            </el-button>
            <el-button
              link
              type="primary"
              @click="handlePayMonthly(row)"
              v-if="row.status === 'approved'"
            >
              标记发放
            </el-button>
          </template>
        </el-table-column>
      </el-table>
      <div class="table-pagination">
        <el-pagination
          v-model:current-page="monthlyPagination.page"
          v-model:page-size="monthlyPagination.pageSize"
          :total="monthlyPagination.total"
          :page-sizes="[10, 20, 50, 100]"
          layout="total, sizes, prev, pager, next, jumper"
          background
          @size-change="handleMonthlyPageSizeChange"
          @current-change="handleMonthlyPageChange"
        />
      </div>
    </el-card>

    <!-- 月结薪资预览对话框 -->
    <el-dialog
      v-model="monthlyPreviewVisible"
      title="月结薪资预览 - 确认和手工调整"
      width="90%"
      :close-on-click-modal="false"
      :before-close="handleBeforeCloseMonthlyPreview"
    >
      <div style="margin-bottom: 16px;">
        <el-alert
          type="info"
          :closable="false"
          show-icon
        >
          <template #title>
            <span>已计算 {{ monthlyPreviewRows.length }} 条月结薪资，请确认无误后保存（仅保存调节，不会自动审核）</span>
          </template>
        </el-alert>
      </div>

      <!-- 预览汇总统计 -->
      <el-row :gutter="20" style="margin-bottom: 16px;">
        <el-col :span="6">
          <div class="preview-stat">
            <div class="preview-stat-label">总应发</div>
            <div class="preview-stat-value">¥{{ toFix(monthlyPreviewTotal.gross) }}</div>
          </div>
        </el-col>
        <el-col :span="6">
          <div class="preview-stat">
            <div class="preview-stat-label">手工调整</div>
            <div class="preview-stat-value">¥{{ toFix(monthlyPreviewTotal.adjust) }}</div>
          </div>
        </el-col>
        <el-col :span="6">
          <div class="preview-stat">
            <div class="preview-stat-label">总实发</div>
            <div class="preview-stat-value" style="color: #67c23a; font-weight: bold;">¥{{ toFix(monthlyPreviewTotal.net) }}</div>
          </div>
        </el-col>
        <el-col :span="6">
          <div class="preview-stat">
            <div class="preview-stat-label">预计支出</div>
            <div class="preview-stat-value" style="color: #409eff;">¥{{ toFix(monthlyPreviewTotal.net) }}</div>
          </div>
        </el-col>
      </el-row>

      <!-- 预览表格 -->
      <el-table
        :data="monthlyPreviewRows"
        stripe
        max-height="500"
        style="margin-bottom: 16px;"
      >
        <el-table-column prop="employee_no" label="工号" width="100" />
        <el-table-column prop="employee_name" label="姓名" width="100" />
        <el-table-column prop="job_name" label="岗位" min-width="120" />
        <el-table-column prop="regular_hours" label="工时" width="80" />
        <el-table-column prop="gross_pay" label="应发" width="100">
          <template #default="{ row }">¥{{ toFix(row.gross_pay) }}</template>
        </el-table-column>
        <el-table-column prop="insurance_deduct" label="保险" width="80">
          <template #default="{ row }">¥{{ toFix(row.insurance_deduct) }}</template>
        </el-table-column>
        <el-table-column prop="tax" label="个税" width="80">
          <template #default="{ row }">¥{{ toFix(row.tax) }}</template>
        </el-table-column>
        <el-table-column prop="manual_adjust" label="手工调整" width="150">
          <template #default="{ row, $index }">
            <el-input-number
              v-model="row.manual_adjust"
              :precision="2"
              :step="10"
              :controls="false"
              style="width: 130px;"
              @change="() => updateMonthlyFinalPay($index)"
            />
          </template>
        </el-table-column>
        <el-table-column prop="adjust_remark" label="调整备注" min-width="120">
          <template #default="{ row }">
            <el-input
              v-model="row.adjust_remark"
              size="small"
              placeholder="输入调整原因"
              clearable
            />
          </template>
        </el-table-column>
        <el-table-column prop="final_pay" label="实发工资" width="100">
          <template #default="{ row }">
            <span style="color: #67c23a; font-weight: bold;">¥{{ toFix(row.final_pay) }}</span>
          </template>
        </el-table-column>
      </el-table>

      <template #footer>
        <div style="text-align: right;">
          <el-button @click="handleCancelMonthlyPreview">取消</el-button>
          <el-button type="primary" @click="handleConfirmMonthlyPreview" :loading="monthlySaving">
            确认保存调节
          </el-button>
        </div>
      </template>
    </el-dialog>
  </el-tab-pane>
</template>

<script setup lang="ts">
import { reactive, ref, computed, watch } from 'vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import { Download } from '@element-plus/icons-vue';
import { salariesApi } from '@/api/modules/salaries';
import { worktimeEnhancedApi } from '@/api/modules/worktime-enhanced';
import type { Salary } from '@/api/types';
import { getCurrentMonthBeijing, getStatusText, getStatusType } from '@/utils/format';
import { loadXlsx } from '@/utils/loadXlsx';
import { usePagination } from '@/composables/usePagination';
import { roundMoney } from '@/utils/db-helper';
import { useTableLoading } from '@/composables/useTableLoading';
const { loading: monthlyLoading, withLoading: withMonthlyLoading } = useTableLoading();
const monthlyCalculating = ref(false);
const monthlyRows = ref<Salary[]>([]);
const { pagination: monthlyPagination, onSizeChange: handleMonthlyPageSizeChange, onCurrentChange: handleMonthlyPageChange } = usePagination(loadMonthlyData);
const monthlyPreviewRows = ref<any[]>([]);
const monthlyPreviewVisible = ref(false);
const monthlySaving = ref(false);
const monthlyApproving = ref(false);

const monthlyForm = reactive({
  company_id: '',
  year_month: getCurrentMonthBeijing()
});

const checkingSummary = ref(false);
const showMonthlySummaryDetail = ref(false);
const monthlySummaryList = ref<any[]>([]);
const monthlySummaryStats = ref<any>(null);

// 是否准备好计算薪资
const isMonthlyReadyToCalculate = computed(() => {
  return (
    monthlyForm.company_id &&
    monthlyForm.year_month &&
    monthlySummaryStats.value?.approved === monthlySummaryStats.value?.total &&
    monthlySummaryStats.value?.total > 0
  );
});

// 月结薪资预览汇总
const monthlyPreviewTotal = computed(() => {
  const gross = monthlyPreviewRows.value.reduce((sum, row) => sum + (Number(row.gross_pay) || 0), 0);
  const adjust = monthlyPreviewRows.value.reduce((sum, row) => sum + (Number(row.manual_adjust) || 0), 0);
  const net = monthlyPreviewRows.value.reduce((sum, row) => sum + (Number(row.final_pay) || 0), 0);
  return { gross, adjust, net };
});

function toFix(value?: number) {
  return (Number(value) || 0).toFixed(2);
}

function handleMonthlyCompanyChange() {
  handleToggleMonthlySummaryDetail(true);
}

function handleMonthlyMonthChange() {
  handleToggleMonthlySummaryDetail(true);
}

async function handleToggleMonthlySummaryDetail(forceLoad = false) {
  if (!monthlyForm.company_id || !monthlyForm.year_month) {
    ElMessage.warning('请先选择企业和月份');
    return;
  }

  if (!showMonthlySummaryDetail.value || forceLoad) {
    checkingSummary.value = true;
    try {
      const [y, m] = monthlyForm.year_month.split('-').map(Number);
      const result = await worktimeEnhancedApi.getMonthlySummaryStats({
        company_id: monthlyForm.company_id,
        year: y,
        month: m
      });

      monthlySummaryStats.value = result.stats;
      monthlySummaryList.value = result.list || [];
      showMonthlySummaryDetail.value = true;
    } catch (err: any) {
      ElMessage.error(err?.message || '获取工时汇总失败');
    } finally {
      checkingSummary.value = false;
    }
  } else {
    showMonthlySummaryDetail.value = false;
  }
}

async function handleApproveMonthlySummary(row: any) {
  ElMessageBox.confirm('确认审核通过此工时汇总？', '提示', {
    confirmButtonText: '确认',
    cancelButtonText: '取消',
    type: 'warning'
  })
    .then(async () => {
      try {
        await worktimeEnhancedApi.approveMonthlySummaryBatch([row._id]);
        ElMessage.success('审核通过');
        await handleToggleMonthlySummaryDetail(true);
      } catch (err: any) {
        ElMessage.error(err?.message || '操作失败');
      }
    })
    .catch(() => {});
}

async function handleRejectMonthlySummary(row: any) {
  ElMessageBox.prompt('请输入驳回原因', '驳回工时汇总', {
    confirmButtonText: '确认',
    cancelButtonText: '取消',
    type: 'warning'
  })
    .then(async ({ value }) => {
      try {
        await worktimeEnhancedApi.rejectMonthlySummary(row._id, value);
        ElMessage.success('已驳回');
        await handleToggleMonthlySummaryDetail(true);
      } catch (err: any) {
        ElMessage.error(err?.message || '操作失败');
      }
    })
    .catch(() => {});
}


async function loadMonthlyData() {
  if (!monthlyForm.company_id || !monthlyForm.year_month) {
    monthlyRows.value = [];
    return;
  }
  await withMonthlyLoading(async () => {
    const result = await salariesApi.getList({
      company_id: monthlyForm.company_id || undefined,
      month: monthlyForm.year_month,
      settlement_mode: 'monthly',
      page: monthlyPagination.page,
      pageSize: monthlyPagination.pageSize
    });
    monthlyRows.value = result.list || [];
    monthlyPagination.total = result.total || 0;
    monthlyPagination.page = result.page || monthlyPagination.page;
    monthlyPagination.pageSize = result.pageSize || monthlyPagination.pageSize;
  });
}

function handleMonthlySearch() {
  monthlyPagination.page = 1;
  loadMonthlyData();
}

async function handleCalculateMonthly() {
  if (!isMonthlyReadyToCalculate.value) {
    ElMessage.warning('工时汇总未全部审核，无法进行薪资计算');
    return;
  }

  monthlyCalculating.value = true;
  try {
    // 第一步：执行计算
    const result = await salariesApi.calculate({
      company_id: monthlyForm.company_id,
      month: monthlyForm.year_month,
      settlement_mode: 'monthly'
    });
    const summary = result?.data || {};
    const salarySummary = summary.salary || summary;
    const successCount = Number(
      salarySummary.total ??
      salarySummary.salary_success ??
      salarySummary.salary_count ??
      0
    );
    const skippedCount = Number(
      salarySummary.skipped ??
      salarySummary.salary_skipped ??
      0
    );
    const failedCount = Number(
      salarySummary.failed ??
      salarySummary.salary_failed ??
      0
    );

    if (failedCount > 0 || skippedCount > 0) {
      const errorList =
        (Array.isArray(salarySummary.failedDetails) && salarySummary.failedDetails) ||
        (Array.isArray(salarySummary.skippedDetails) && salarySummary.skippedDetails) ||
        (Array.isArray(summary.salary_errors) && summary.salary_errors) ||
        [];
      const firstError = errorList[0] || null;
      const detail = (firstError?.error || firstError?.reason) ? `；首条原因：${firstError.error || firstError.reason}` : '';
      ElMessage.warning(`月结计算完成：成功 ${successCount} 人，跳过 ${skippedCount} 人，失败 ${failedCount} 人${detail}`);
    } else {
      ElMessage.success('月结计算完成，请在预览中确认并保存调节');
    }

    // 第二步：加载预览数据
    await loadMonthlyPreview();
  } catch (err: any) {
    const message = err?.message || '计算失败';
    ElMessage.error(message);
  } finally {
    monthlyCalculating.value = false;
  }
}

async function loadMonthlyPreview() {
  try {
    const previewRows = await salariesApi.calculateMonthlyPreview({
      company_id: monthlyForm.company_id,
      month: monthlyForm.year_month
    });

    if (!previewRows || !previewRows.length) {
      ElMessage.warning('未获取到待确认数据（可能已全部审核），请刷新后重试');
      return;
    }

    // 初始化 final_pay：net_pay 是原始实发，final_pay 是含手工调节后的预览实发
    monthlyPreviewRows.value = previewRows.map((item: any) => ({
      ...item,
      manual_adjust: Number(item.manual_adjust || 0),
      adjust_remark: item.adjust_remark || '',
      final_pay: roundMoney(Number(item.net_pay || 0) + Number(item.manual_adjust || 0))
    }));

    monthlyPreviewVisible.value = true;
  } catch (err: any) {
    ElMessage.error(err.message || '加载预览数据失败');
  }
}

function updateMonthlyFinalPay(index: number) {
  const row = monthlyPreviewRows.value[index];
  if (row) {
    row.final_pay = roundMoney(Number(row.net_pay || 0) + Number(row.manual_adjust || 0));
  }
}

function confirmCloseMonthlyPreview(done?: () => void) {
  ElMessageBox.confirm('取消预览将不保存任何更改，是否继续？', '提示', {
    confirmButtonText: '确认取消',
    cancelButtonText: '继续调整',
    type: 'warning'
  })
    .then(() => {
      monthlyPreviewRows.value = [];
      loadMonthlyData();
      if (done) {
        done();
      } else {
        monthlyPreviewVisible.value = false;
      }
    })
    .catch(() => {});
}

function handleBeforeCloseMonthlyPreview(done: () => void) {
  confirmCloseMonthlyPreview(done);
}

function handleCancelMonthlyPreview() {
  confirmCloseMonthlyPreview();
}

async function handleConfirmMonthlyPreview() {
  if (!monthlyPreviewRows.value.length) {
    ElMessage.warning('没有可保存的数据');
    return;
  }

  monthlySaving.value = true;
  try {
    const { successCount, failCount } = await salariesApi.batchSaveMonthlyPreview({
      company_id: monthlyForm.company_id,
      month: monthlyForm.year_month,
      salaries: monthlyPreviewRows.value.map((row) => ({
        _id: row._id,
        manual_adjust: Number(row.manual_adjust || 0),
        adjust_remark: row.adjust_remark || '',
        final_pay: roundMoney(Number(row.final_pay || 0))
      }))
    });

    if (failCount > 0) {
      ElMessage.warning(`保存完成：成功 ${successCount} 条，失败 ${failCount} 条`);
    } else {
      ElMessage.success(`已保存 ${successCount} 条月结薪资调节，请继续审核`);
    }

    monthlyPreviewVisible.value = false;
    monthlyPreviewRows.value = [];
    await loadMonthlyData();
  } catch (err: any) {
    ElMessage.error(err.message || '保存失败');
  } finally {
    monthlySaving.value = false;
  }
}

async function handleBatchApproveCalculatedMonthly() {
  if (!monthlyForm.company_id || !monthlyForm.year_month) {
    ElMessage.warning('请先选择企业和月份');
    return;
  }
  monthlyApproving.value = true;
  try {
    const result = await salariesApi.getList({
      company_id: monthlyForm.company_id,
      month: monthlyForm.year_month,
      settlement_mode: 'monthly',
      status: 'calculated',
      page: 1,
      pageSize: 5000
    });
    const ids = (result.list || []).map((item: any) => item._id).filter(Boolean);
    if (!ids.length) {
      ElMessage.info('当前没有待审核（calculated）记录');
      return;
    }
    const { successCount, failCount } = await salariesApi.batchApproveMonthly({
      company_id: monthlyForm.company_id,
      month: monthlyForm.year_month,
      salary_ids: ids
    });
    if (failCount > 0) {
      ElMessage.warning(`批量审核完成：成功 ${successCount} 条，失败 ${failCount} 条`);
    } else {
      ElMessage.success(`批量审核完成：成功 ${successCount} 条`);
    }
    await loadMonthlyData();
  } catch (err: any) {
    ElMessage.error(err?.message || '批量审核失败');
  } finally {
    monthlyApproving.value = false;
  }
}

async function handleApproveMonthly(row: Salary) {
  await salariesApi.approve(row._id);
  ElMessage.success('已审核通过');
  loadMonthlyData();
}

async function handlePayMonthly(row: Salary) {
  await salariesApi.pay(row._id);
  ElMessage.success('已标记发放');
  loadMonthlyData();
}

async function handleExportMonthly() {
  const exportResult = await salariesApi.getList({
    company_id: monthlyForm.company_id || undefined,
    month: monthlyForm.year_month,
    settlement_mode: 'monthly',
    page: 1,
    pageSize: Math.max(monthlyPagination.total || monthlyPagination.pageSize, monthlyPagination.pageSize)
  });
  const XLSX = await loadXlsx();
  const rows = (exportResult.list || []).map((item) => ({
    工号: item.employee_no,
    姓名: item.employee_name,
    企业: item.company_name,
    岗位: item.job_name,
    月份: item.year_month || `${item.year}-${String(item.month).padStart(2, '0')}`,
    总工时: item.regular_hours,
    总天数: item.total_days,
    夜班补贴: item.night_allowance,
    保险: item.insurance_deduct,
    个税: item.tax,
    应发工资: item.gross_pay || item.total_amount,
    实发工资: item.net_pay || item.total_amount,
    状态: getStatusText(item.status)
  }));
  const ws = XLSX.utils.json_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, '月结发薪');
  XLSX.writeFile(wb, `月结发薪_${monthlyForm.year_month}.xlsx`);
}

watch(
  () => [monthlyForm.company_id, monthlyForm.year_month],
  ([companyId, yearMonth]) => {
    if (!companyId || !yearMonth) {
      monthlyRows.value = [];
      monthlyPagination.total = 0;
      monthlyPagination.page = 1;
      monthlySummaryStats.value = null;
      monthlySummaryList.value = [];
      showMonthlySummaryDetail.value = false;
      return;
    }
    monthlyPagination.page = 1;
    loadMonthlyData();
  }
);
</script>

<style scoped>
.stat-item {
  text-align: center;
  padding: 10px;
}

.stat-label {
  font-size: 12px;
  color: #909399;
  margin-bottom: 5px;
}

.stat-value {
  font-size: 24px;
  font-weight: bold;
  color: #303133;
}

.preview-stat {
  text-align: center;
  padding: 12px 8px;
  background-color: #f5f7fa;
  border-radius: 4px;
}

.preview-stat-label {
  font-size: 12px;
  color: #909399;
  margin-bottom: 8px;
}

.preview-stat-value {
  font-size: 20px;
  font-weight: bold;
  color: #303133;
}

.table-pagination {
  display: flex;
  justify-content: flex-end;
  padding-top: 16px;
}
</style>
