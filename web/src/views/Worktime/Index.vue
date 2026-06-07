<template>
  <div class="worktime-page">
    <el-tabs v-model="activeTab" type="card">
      <el-tab-pane label="日结工时" name="daily">
        <el-card class="filter-card">
          <el-form :model="dailyFilterForm" inline>
            <el-form-item label="企业">
              <CompanySelect v-model="dailyFilterForm.company_id" />
            </el-form-item>
            <el-form-item label="员工">
              <el-input v-model="dailyFilterForm.employee_name" placeholder="姓名/工号" clearable />
            </el-form-item>
            <el-form-item label="审核状态">
              <el-select v-model="dailyFilterForm.status" placeholder="选择状态" clearable style="width: 160px;">
                <el-option label="待审核" value="pending" />
                <el-option label="已通过" value="approved" />
                <el-option label="已驳回" value="rejected" />
              </el-select>
            </el-form-item>
            <el-form-item label="时间区间">
              <el-date-picker
                v-model="dailyFilterForm.date_range"
                type="daterange"
                range-separator="至"
                start-placeholder="开始日期"
                end-placeholder="结束日期"
                format="YYYY-MM-DD"
                value-format="YYYY-MM-DD"
              />
            </el-form-item>
            <el-form-item>
              <el-button type="primary" @click="handleDailySearch">查询</el-button>
              <el-button @click="handleDailyReset">重置</el-button>
              <el-button type="success" :icon="Plus" @click="openCreateDaily()">新增工时</el-button>
            </el-form-item>
          </el-form>
        </el-card>

        <el-card>
          <div class="table-actions">
            <el-button
              type="primary"
              size="small"
              :disabled="!selectedDailyRows.length"
              @click="handleBatchApproveDaily"
            >批量通过</el-button>
            <el-button
              type="danger"
              size="small"
              :disabled="!selectedDailyRows.length"
              @click="handleBatchRejectDaily"
            >批量驳回</el-button>
            <el-button
              type="warning"
              size="small"
              :disabled="!selectedDailyRows.length"
              @click="handleBatchSetDeposit"
            >批量设为押金</el-button>
          </div>
          <el-table
            v-loading="dailyLoading"
            :data="dailyTableData"
            stripe
            @selection-change="handleDailySelectionChange"
          >
            <el-table-column type="selection" width="50" />
            <el-table-column prop="employee_no" label="工号" width="120" />
            <el-table-column prop="employee_name" label="姓名" width="100" />
            <el-table-column prop="company_name" label="企业" min-width="150" />
            <el-table-column prop="job_name" label="岗位" min-width="140" />
            <el-table-column prop="work_date" label="工作日期" width="120" />
            <el-table-column prop="total_hours" label="工时" width="100" />
            <el-table-column prop="shift" label="班次" width="80">
              <template #default="{ row }">
                <el-tag :type="row.shift === 'night' ? 'warning' : ''" size="small">{{ row.shift === 'night' ? '夜班' : '白班' }}</el-tag>
              </template>
            </el-table-column>
            <el-table-column label="在职状态" width="100">
              <template #default="{ row }">
                <StatusTag :status="row.employment_status" :map="EMPLOYMENT_STATUS_MAP" />
              </template>
            </el-table-column>
            <el-table-column prop="review_status" label="审核状态" width="100">
              <template #default="{ row }">
                <el-tag :type="getReviewStatusType(row.review_status)">{{ getReviewStatusText(row.review_status) }}</el-tag>
              </template>
            </el-table-column>
            <el-table-column label="增加时间" width="180">
              <template #default="{ row }">
                <BeijingDateTime :value="(row as any).created_at || (row as any).create_time || (row as any).createTime" />
              </template>
            </el-table-column>
            <el-table-column label="操作" width="160" fixed="right">
              <template #default="{ row }">
                <el-button link type="success" @click="handleApproveDaily(row)" v-if="row.review_status === 'pending'">通过</el-button>
                <el-button link type="danger" @click="handleRejectDaily(row)" v-if="row.review_status === 'pending'">驳回</el-button>
                <el-button link type="warning" @click="handleSetDeposit(row)" v-if="row.review_status === 'approved'">设为押金</el-button>
              </template>
            </el-table-column>
          </el-table>

          <div class="pagination-wrapper">
            <el-pagination
              v-model:current-page="dailyPagination.page"
              v-model:page-size="dailyPagination.pageSize"
              :total="dailyPagination.total"
              :page-sizes="[20, 50, 100, 200]"
              layout="total, sizes, prev, pager, next, jumper"
              @size-change="dailySizeChange"
              @current-change="dailyPageChange"
            />
          </div>
        </el-card>
      </el-tab-pane>

      <el-tab-pane label="押金管理" name="deposit">
        <el-card class="filter-card">
          <el-form :model="depositFilterForm" inline>
            <el-form-item label="企业">
              <CompanySelect v-model="depositFilterForm.company_id" />
            </el-form-item>
            <el-form-item label="员工">
              <el-input v-model="depositFilterForm.employee_name" placeholder="姓名/工号" clearable />
            </el-form-item>
            <el-form-item label="时间区间">
              <el-date-picker
                v-model="depositFilterForm.date_range"
                type="daterange"
                range-separator="至"
                start-placeholder="开始日期"
                end-placeholder="结束日期"
                format="YYYY-MM-DD"
                value-format="YYYY-MM-DD"
              />
            </el-form-item>
            <el-form-item>
              <el-button type="primary" @click="handleDepositSearch">查询</el-button>
              <el-button @click="handleDepositReset">重置</el-button>
            </el-form-item>
          </el-form>
        </el-card>

        <el-card>
          <div class="table-actions">
            <el-button
              type="primary"
              size="small"
              :disabled="!selectedDepositRows.length"
              @click="handleBatchPayDeposit"
            >批量发放押金</el-button>
          </div>
          <el-table v-loading="depositLoading" :data="depositTableData" stripe @selection-change="handleDepositSelectionChange">
            <el-table-column type="selection" width="50" />
            <el-table-column prop="employee_no" label="工号" width="120" />
            <el-table-column prop="employee_name" label="姓名" width="100" />
            <el-table-column prop="company_name" label="企业" min-width="150" />
            <el-table-column prop="job_name" label="岗位" min-width="140" />
            <el-table-column prop="work_date" label="工作日期" width="120" />
            <el-table-column prop="total_hours" label="工时" width="100" />
            <el-table-column prop="hourly_rate" label="时薪" width="100">
              <template #default="{ row }">¥{{ toFix(row.hourly_rate) }}</template>
            </el-table-column>
            <el-table-column prop="deposit_time" label="设为押金时间" width="160">
              <template #default="{ row }"><BeijingDateTime :value="(row as any).deposit_time" /></template>
            </el-table-column>
            <el-table-column label="增加时间" width="180">
              <template #default="{ row }">
                <BeijingDateTime :value="(row as any).created_at || (row as any).create_time || (row as any).createTime" />
              </template>
            </el-table-column>
            <el-table-column prop="salary_status" label="发放状态" width="100">
              <template #default="{ row }">
                <el-tag :type="row.salary_status === 'paid' ? 'success' : 'warning'">
                  {{ row.salary_status === 'paid' ? '已发放' : '待发放' }}
                </el-tag>
              </template>
            </el-table-column>
            <el-table-column label="操作" width="120" fixed="right">
              <template #default="{ row }">
                <el-button link type="info" @click="handleCancelDeposit(row)">取消押金</el-button>
              </template>
            </el-table-column>
          </el-table>

          <div class="pagination-wrapper">
            <el-pagination
              v-model:current-page="depositPagination.page"
              v-model:page-size="depositPagination.pageSize"
              :total="depositPagination.total"
              :page-sizes="[20, 50, 100, 200]"
              layout="total, sizes, prev, pager, next, jumper"
              @size-change="depositSizeChange"
              @current-change="depositPageChange"
            />
          </div>
        </el-card>
      </el-tab-pane>

      <el-tab-pane label="月结工时" name="monthly">
        <el-card class="filter-card">
          <el-form :model="monthlyFilterForm" inline>
            <el-form-item label="企业">
              <CompanySelect v-model="monthlyFilterForm.company_id" @change="loadMonthlyEmployees" />
            </el-form-item>
            <el-form-item label="员工">
              <el-input v-model="monthlyFilterForm.employee_name" placeholder="姓名/工号" clearable />
            </el-form-item>
            <el-form-item label="月份">
              <el-date-picker
                v-model="monthlyFilterForm.month"
                type="month"
                placeholder="选择月份"
                format="YYYY年MM月"
                value-format="YYYY-MM"
              />
            </el-form-item>
            <el-form-item>
              <el-button type="primary" @click="handleMonthlySearch">查询</el-button>
              <el-button @click="handleMonthlyReset">重置</el-button>
              <el-button type="success" :icon="Plus" @click="openCreateMonthly">新增工时</el-button>
              <el-button type="success" :icon="UploadFilled" @click="monthlyImportVisible = true">Excel导入</el-button>
              <el-button :icon="Download" @click="downloadMonthlyTemplate">下载模板</el-button>
            </el-form-item>
          </el-form>
        </el-card>

        <el-card>
          <div class="table-actions">
            <el-button
              type="primary"
              size="small"
              :disabled="!selectedMonthlyRows.length"
              @click="handleBatchApproveMonthly"
            >批量通过</el-button>
            <el-button
              type="danger"
              size="small"
              :disabled="!selectedMonthlyRows.length"
              @click="handleBatchRejectMonthly"
            >批量驳回</el-button>
          </div>
          <el-table
            v-loading="monthlyLoading"
            :data="monthlyTableData"
            stripe
            @selection-change="handleMonthlySelectionChange"
          >
            <el-table-column type="selection" width="50" />
            <el-table-column prop="employee_no" label="工号" width="120" />
            <el-table-column prop="employee_name" label="姓名" width="100" />
            <el-table-column prop="company_name" label="企业" min-width="150" />
            <el-table-column prop="job_name" label="岗位" min-width="140" />
            <el-table-column prop="year_month" label="月份" width="110" />
            <el-table-column prop="total_hours" label="总工时" width="100" />
            <el-table-column prop="total_days" label="总天数" width="100" />
            <el-table-column prop="night_hours" label="夜班工时" width="100" />
            <el-table-column prop="night_days" label="夜班天数" width="100" />
            <el-table-column prop="salary_amount" label="厂方核定应发" width="140">
              <template #default="{ row }">{{ Number(row.salary_amount || 0) > 0 ? `¥${toFix(row.salary_amount)}` : '-' }}</template>
            </el-table-column>
            <el-table-column label="在职状态" width="100">
              <template #default="{ row }">
                <StatusTag :status="row.employment_status" :map="EMPLOYMENT_STATUS_MAP" />
              </template>
            </el-table-column>
            <el-table-column prop="status" label="审核状态" width="100">
              <template #default="{ row }">
                <el-tag :type="getReviewStatusType(row.status)">{{ getReviewStatusText(row.status) }}</el-tag>
              </template>
            </el-table-column>
            <el-table-column label="增加时间" width="180">
              <template #default="{ row }">
                <BeijingDateTime :value="(row as any).created_at || (row as any).create_time || (row as any).createTime" />
              </template>
            </el-table-column>
            <el-table-column label="操作" width="160" fixed="right">
              <template #default="{ row }">
                <el-button link type="success" @click="handleApproveMonthly(row)" v-if="row.status === 'pending'">通过</el-button>
                <el-button link type="danger" @click="handleRejectMonthly(row)" v-if="row.status === 'pending'">驳回</el-button>
              </template>
            </el-table-column>
          </el-table>

          <div class="pagination-wrapper">
            <el-pagination
              v-model:current-page="monthlyPagination.page"
              v-model:page-size="monthlyPagination.pageSize"
              :total="monthlyPagination.total"
              :page-sizes="[20, 50, 100, 200]"
              layout="total, sizes, prev, pager, next, jumper"
              @size-change="monthlySizeChange"
              @current-change="monthlyPageChange"
            />
          </div>
        </el-card>
      </el-tab-pane>
    </el-tabs>

    <el-dialog v-model="monthlyImportVisible" title="导入月结工时" width="560px">
      <p class="import-tip">模板列：企业、工号、姓名、总工时、总天数、夜班工时、夜班天数、厂方核定应发总额、备注（可选）。导入会按 员工+企业+月份 覆盖更新。</p>
      <el-alert
        title="请先选择月份。厂方核定应发总额>0 时将直接作为应发工资（含夜班等补贴），不再额外叠加夜班补贴。"
        type="info"
        :closable="false"
        style="margin-bottom: 16px;"
      />
      <el-upload
        ref="monthlyImportUploadRef"
        drag
        accept=".xlsx"
        :auto-upload="false"
        :limit="1"
        :show-file-list="true"
        :on-change="handleMonthlyImportChange"
        :on-exceed="handleMonthlyImportExceed"
        :on-remove="handleMonthlyImportRemove"
      >
        <el-icon class="el-icon--upload"><UploadFilled /></el-icon>
        <div class="el-upload__text">拖拽文件到此或点击选择</div>
      </el-upload>
      <template #footer>
        <el-button @click="monthlyImportVisible = false">取消</el-button>
        <el-button type="primary" :loading="monthlyImporting" @click="confirmMonthlyImport">开始导入</el-button>
      </template>
    </el-dialog>

    <el-dialog v-model="createMonthlyVisible" title="新增月结工时" width="520px">
      <el-form :model="createMonthlyForm" label-width="100px">
        <el-form-item label="企业" required>
          <CompanySelect v-model="createMonthlyForm.company_id" @change="() => { createMonthlyForm.employee_id = ''; loadCreateMonthlyEmployees(); }" />
        </el-form-item>
        <el-form-item label="员工" required>
          <el-select
            v-model="createMonthlyForm.employee_id"
            placeholder="选择员工"
            filterable
            clearable
            :disabled="!createMonthlyForm.company_id"
          >
            <el-option
              v-for="e in createMonthlyEmployees"
              :key="e.employee_id || e._id"
              :label="`${e.name || '-'}（${e.employee_no || ''}）`"
              :value="e.employee_id || e._id"
            />
          </el-select>
        </el-form-item>
        <el-form-item label="月份" required>
          <el-date-picker
            v-model="createMonthlyForm.year_month"
            type="month"
            value-format="YYYY-MM"
            format="YYYY年MM月"
            placeholder="选择月份"
          />
        </el-form-item>
        <el-form-item label="总工时" required>
          <el-input-number v-model="createMonthlyForm.total_hours" :min="0" :max="744" :step="1" />
        </el-form-item>
        <el-form-item label="总天数" required>
          <el-input-number v-model="createMonthlyForm.total_days" :min="0" :max="31" :step="1" />
        </el-form-item>
        <el-form-item label="夜班工时">
          <el-input-number v-model="createMonthlyForm.night_hours" :min="0" :max="744" :step="1" />
        </el-form-item>
        <el-form-item label="夜班天数">
          <el-input-number v-model="createMonthlyForm.night_days" :min="0" :max="31" :step="1" />
        </el-form-item>
        <el-form-item label="厂方核定应发总额">
          <el-input-number v-model="createMonthlyForm.salary_amount" :min="0" :precision="2" :step="100" />
        </el-form-item>
        <el-form-item label="备注">
          <el-input v-model="createMonthlyForm.remark" placeholder="可填写备注" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="createMonthlyVisible = false">取消</el-button>
        <el-button type="primary" :loading="createMonthlySubmitting" @click="submitCreateMonthly">保存</el-button>
      </template>
    </el-dialog>

    <el-dialog v-model="createDailyVisible" title="新增日结工时" width="520px">
      <el-form :model="createDailyForm" label-width="90px">
        <el-form-item label="企业" required>
          <CompanySelect v-model="createDailyForm.company_id" @change="loadCreateEmployees" />
        </el-form-item>
        <el-form-item label="员工" required>
          <el-select
            v-model="createDailyForm.employee_id"
            placeholder="选择员工"
            filterable
            clearable
            :loading="createEmployeeLoading"
            :disabled="!createDailyForm.company_id"
          >
            <el-option
              v-for="e in createEmployeeOptions"
              :key="e.employee_id || e._id"
              :label="`${e.name || '-'}（${e.employee_no || ''}）`"
              :value="e.employee_id || e._id"
            />
          </el-select>
        </el-form-item>
        <el-form-item label="工作日期" required>
          <el-date-picker
            v-model="createDailyForm.work_date"
            type="date"
            value-format="YYYY-MM-DD"
            placeholder="选择日期"
          />
        </el-form-item>
        <el-form-item label="班次">
          <el-radio-group v-model="createDailyForm.shift">
            <el-radio label="day">白班</el-radio>
            <el-radio label="night">夜班</el-radio>
          </el-radio-group>
        </el-form-item>
        <el-form-item label="工时" required>
          <el-input-number v-model="createDailyForm.regular_hours" :min="0" :max="24" :step="0.5" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="createDailyVisible = false">取消</el-button>
        <el-button type="primary" :loading="createDailySubmitting" @click="submitCreateDaily">保存</el-button>
      </template>
    </el-dialog>

    <el-dialog v-model="depositPayVisible" title="确认发放押金" width="420px">
      <p>本次将发放 <strong>{{ selectedDepositRows.length }}</strong> 条押金记录</p>
      <el-form-item label="发放日期">
        <el-date-picker
          v-model="depositPayDate"
          type="date"
          value-format="YYYY-MM-DD"
          placeholder="选择发放日期"
        />
      </el-form-item>
      <template #footer>
        <el-button @click="depositPayVisible = false">取消</el-button>
        <el-button type="primary" :loading="depositPaying" @click="confirmBatchPayDeposit">确认发放</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { onMounted, reactive, ref, watch, computed } from 'vue';
import { ElMessage } from 'element-plus';
import { Download, UploadFilled, Plus } from '@element-plus/icons-vue';
import { companiesApi } from '@/api/modules/companies';
import { worktimeApi } from '@/api/modules/worktime';
import { salariesApi } from '@/api/modules/salaries';
import type { Company, WorktimeMonthlySummary, WorktimeRecord } from '@/api/types';
import { loadXlsx, readExcelRows } from '@/utils/loadXlsx';
import type { UploadFile, UploadFiles, UploadInstance, UploadRawFile } from 'element-plus';
import { EMPLOYMENT_STATUS_MAP } from '@/utils/status';
import { formatDate, getCurrentMonthBeijing, getTodayBeijing } from '@/utils/format';
import { usePagination } from '@/composables/usePagination';
import { useTableLoading } from '@/composables/useTableLoading';
import BeijingDateTime from '@/components/common/BeijingDateTime.vue';

const activeTab = ref<'daily' | 'monthly' | 'deposit'>('daily');
const companies = ref<Company[]>([]);
const monthlyImportVisible = ref(false);
const monthlyImporting = ref(false);
const monthlyImportUploadRef = ref<UploadInstance>();
const monthlyImportFile = ref<File | null>(null);

const { loading: dailyLoading, withLoading: withDailyLoading } = useTableLoading();
const { loading: monthlyLoading, withLoading: withMonthlyLoading } = useTableLoading();
const { loading: depositLoading, withLoading: withDepositLoading } = useTableLoading();
const dailyTableData = ref<WorktimeRecord[]>([]);
const monthlyTableData = ref<WorktimeMonthlySummary[]>([]);
const depositTableData = ref<WorktimeRecord[]>([]);
const monthlyFilterEmployees = ref<any[]>([]);
const createMonthlyEmployees = ref<any[]>([]);

const currentMonth = getCurrentMonthBeijing();
const today = new Date();

function getDefaultDailyRange(): [string, string] {
  const end = new Date(today);
  end.setDate(end.getDate() - 1);
  const start = new Date(end);
  start.setDate(start.getDate() - 6);
  return [formatDate(start), formatDate(end)];
}

const dailyFilterForm = reactive({
  company_id: '',
  employee_name: '',
  status: 'pending',
  date_range: getDefaultDailyRange() as [string, string]
});

const monthlyFilterForm = reactive({
  company_id: '',
  employee_name: '',
  month: currentMonth
});

const depositFilterForm = reactive({
  company_id: '',
  employee_name: '',
  date_range: getDefaultDailyRange() as [string, string]
});

const { pagination: dailyPagination, onSizeChange: dailySizeChange, onCurrentChange: dailyPageChange } = usePagination(loadDailyData, 50);
const { pagination: monthlyPagination, onSizeChange: monthlySizeChange, onCurrentChange: monthlyPageChange } = usePagination(loadMonthlyData, 50);
const { pagination: depositPagination, onSizeChange: depositSizeChange, onCurrentChange: depositPageChange } = usePagination(loadDepositData, 50);

const selectedDailyRows = ref<WorktimeRecord[]>([]);
const selectedMonthlyRows = ref<WorktimeMonthlySummary[]>([]);
const selectedDepositRows = ref<WorktimeRecord[]>([]);
const selectedDailyPending = computed(() =>
  selectedDailyRows.value.filter((item) => item.review_status === 'pending')
);
const selectedDailyApproved = computed(() =>
  selectedDailyRows.value.filter((item) => item.review_status === 'approved')
);
const selectedMonthlyPending = computed(() =>
  selectedMonthlyRows.value.filter((item) => item.status === 'pending')
);
const selectedDepositUnpaid = computed(() =>
  selectedDepositRows.value.filter((item) => item.salary_status !== 'paid')
);

const depositPayVisible = ref(false);
const depositPayDate = ref('');
const depositPaying = ref(false);

const createDailyVisible = ref(false);
const createDailySubmitting = ref(false);
const { loading: createEmployeeLoading, withLoading: withCreateEmployeeLoading } = useTableLoading();
const createEmployeeOptions = ref<any[]>([]);
const createDailyForm = reactive({
  company_id: '',
  employee_id: '',
  work_date: getTodayBeijing(),
  shift: 'day',
  regular_hours: 8
});

const createMonthlyVisible = ref(false);
const createMonthlySubmitting = ref(false);
const createMonthlyForm = reactive({
  company_id: '',
  employee_id: '',
  year_month: currentMonth,
  total_hours: 0,
  total_days: 0,
  night_hours: 0,
  night_days: 0,
  salary_amount: 0,
  remark: ''
});

watch(activeTab, (tab) => {
  if (tab === 'deposit') {
    loadDepositData();
  }
});

function toFix(value?: number) {
  return (Number(value) || 0).toFixed(2);
}

function parseExcelNumber(value: unknown) {
  if (typeof value === 'number') return value;
  const normalized = String(value ?? '').replace(/[¥,\s]/g, '');
  return Number(normalized) || 0;
}

function getReviewStatusText(status?: string) {
  const map: Record<string, string> = {
    pending: '待审核',
    approved: '已通过',
    rejected: '已驳回'
  };
  return map[status || ''] || '-';
}

function getReviewStatusType(status?: string): '' | 'success' | 'warning' | 'danger' {
  const map: Record<string, '' | 'success' | 'warning' | 'danger'> = {
    pending: 'warning',
    approved: 'success',
    rejected: 'danger'
  };
  return map[status || ''] || '';
}

async function loadCompanies() {
  const result = await companiesApi.getList({ page: 1, pageSize: 200 });
  companies.value = result.list || [];
}

async function loadDailyData() {
  await withDailyLoading(async () => {
    const result = await worktimeApi.getDailyList({
      ...dailyFilterForm,
      company_id: dailyFilterForm.company_id || undefined,
      employee_name: dailyFilterForm.employee_name || undefined,
      status: dailyFilterForm.status || undefined,
      start_date: dailyFilterForm.date_range?.[0] || undefined,
      end_date: dailyFilterForm.date_range?.[1] || undefined,
      page: dailyPagination.page,
      pageSize: dailyPagination.pageSize
    });
    dailyTableData.value = result.list;
    dailyPagination.total = result.total;
    selectedDailyRows.value = [];
  });
}

async function loadMonthlyData() {
  await withMonthlyLoading(async () => {
    const result = await worktimeApi.getMonthlyList({
      ...monthlyFilterForm,
      company_id: monthlyFilterForm.company_id || undefined,
      employee_name: monthlyFilterForm.employee_name || undefined,
      month: monthlyFilterForm.month || undefined,
      page: monthlyPagination.page,
      pageSize: monthlyPagination.pageSize
    });
    monthlyTableData.value = result.list;
    monthlyPagination.total = result.total;
    selectedMonthlyRows.value = [];
  });
}

async function loadMonthlyEmployees() {
  monthlyFilterEmployees.value = await worktimeApi.getCompanyEmployees(monthlyFilterForm.company_id || undefined, 'monthly');
}

async function loadCreateMonthlyEmployees() {
  createMonthlyEmployees.value = await worktimeApi.getCompanyEmployees(createMonthlyForm.company_id || undefined, 'monthly');
}

function handleDailySearch() {
  dailyPagination.page = 1;
  loadDailyData();
}

function handleDailyReset() {
  dailyFilterForm.company_id = '';
  dailyFilterForm.employee_name = '';
  dailyFilterForm.status = 'pending';
  dailyFilterForm.date_range = getDefaultDailyRange();
  handleDailySearch();
}

function handleMonthlySearch() {
  monthlyPagination.page = 1;
  loadMonthlyData();
}

async function handleMonthlyReset() {
  monthlyFilterForm.company_id = '';
  monthlyFilterForm.employee_name = '';
  monthlyFilterForm.month = currentMonth;
  monthlyFilterEmployees.value = [];
  handleMonthlySearch();
}

async function loadDepositData() {
  await withDepositLoading(async () => {
    const result = await worktimeApi.getDepositList({
      ...depositFilterForm,
      company_id: depositFilterForm.company_id || undefined,
      employee_name: depositFilterForm.employee_name || undefined,
      start_date: depositFilterForm.date_range?.[0] || undefined,
      end_date: depositFilterForm.date_range?.[1] || undefined,
      page: depositPagination.page,
      pageSize: depositPagination.pageSize
    });
    depositTableData.value = result.list;
    depositPagination.total = result.total;
    selectedDepositRows.value = [];
  });
}

function handleDepositSearch() {
  depositPagination.page = 1;
  loadDepositData();
}

function handleDepositReset() {
  depositFilterForm.company_id = '';
  depositFilterForm.employee_name = '';
  depositFilterForm.date_range = getDefaultDailyRange();
  handleDepositSearch();
}

function handleDailySelectionChange(rows: WorktimeRecord[]) {
  selectedDailyRows.value = rows || [];
}

function handleMonthlySelectionChange(rows: WorktimeMonthlySummary[]) {
  selectedMonthlyRows.value = rows || [];
}

function handleDepositSelectionChange(rows: WorktimeRecord[]) {
  selectedDepositRows.value = rows || [];
}

function openCreateDaily(prefillCompanyId?: string) {
  const safeCompanyId = typeof prefillCompanyId === 'string' ? prefillCompanyId : '';
  createDailyForm.company_id = safeCompanyId || dailyFilterForm.company_id || '';
  createDailyForm.work_date = getTodayBeijing();
  createDailyVisible.value = true;
  if (createDailyForm.company_id) {
    loadCreateEmployees();
  } else {
    createEmployeeOptions.value = [];
  }
}

async function loadCreateEmployees() {
  createDailyForm.employee_id = '';
  if (!createDailyForm.company_id) {
    createEmployeeOptions.value = [];
    return;
  }
  await withCreateEmployeeLoading(async () => {
    createEmployeeOptions.value = await worktimeApi.getCompanyEmployees(createDailyForm.company_id, 'daily');
  });
}

async function submitCreateDaily() {
  if (!createDailyForm.company_id || !createDailyForm.employee_id || !createDailyForm.work_date) {
    ElMessage.warning('请填写必填项');
    return;
  }
  createDailySubmitting.value = true;
  try {
    await worktimeApi.submitDaily({
      company_id: createDailyForm.company_id,
      employee_id: createDailyForm.employee_id,
      work_date: createDailyForm.work_date,
      shift: createDailyForm.shift as 'day' | 'night',
      regular_hours: Number(createDailyForm.regular_hours) || 0
    });
    ElMessage.success('新增工时成功');
    createDailyVisible.value = false;
    loadDailyData();
  } catch (err: any) {
    ElMessage.error(err.message || '新增工时失败');
  } finally {
    createDailySubmitting.value = false;
  }
}

function openCreateMonthly() {
  createMonthlyForm.company_id = monthlyFilterForm.company_id || '';
  createMonthlyForm.year_month = monthlyFilterForm.month || currentMonth;
  createMonthlyForm.employee_id = '';
  createMonthlyForm.total_hours = 0;
  createMonthlyForm.total_days = 0;
  createMonthlyForm.night_hours = 0;
  createMonthlyForm.night_days = 0;
  createMonthlyForm.salary_amount = 0;
  createMonthlyForm.remark = '';
  createMonthlyVisible.value = true;
  if (createMonthlyForm.company_id) {
    loadCreateMonthlyEmployees();
  } else {
    createMonthlyEmployees.value = [];
  }
}

async function submitCreateMonthly() {
  if (!createMonthlyForm.company_id || !createMonthlyForm.employee_id || !createMonthlyForm.year_month) {
    ElMessage.warning('请填写必填项');
    return;
  }
  createMonthlySubmitting.value = true;
  try {
    await worktimeApi.addMonthlySummary({
      company_id: createMonthlyForm.company_id,
      employee_id: createMonthlyForm.employee_id,
      year_month: createMonthlyForm.year_month,
      total_hours: Number(createMonthlyForm.total_hours) || 0,
      total_days: Number(createMonthlyForm.total_days) || 0,
      night_hours: Number(createMonthlyForm.night_hours) || 0,
      night_days: Number(createMonthlyForm.night_days) || 0,
      salary_amount: Number(createMonthlyForm.salary_amount) || 0,
      remark: createMonthlyForm.remark
    });
    ElMessage.success('新增月结工时成功');
    createMonthlyVisible.value = false;
    loadMonthlyData();
  } catch (err: any) {
    ElMessage.error(err.message || '新增月结工时失败');
  } finally {
    createMonthlySubmitting.value = false;
  }
}

async function handleApproveDaily(row: WorktimeRecord) {
  await worktimeApi.approveDaily(row._id);
  ElMessage.success('已通过');
  loadDailyData();
}

async function handleRejectDaily(row: WorktimeRecord) {
  await worktimeApi.rejectDaily(row._id);
  ElMessage.success('已驳回');
  loadDailyData();
}

async function handleSetDeposit(row: WorktimeRecord) {
  await worktimeApi.setDeposit(row._id, true);
  ElMessage.success('已设为押金');
  loadDailyData();
}

async function handleCancelDeposit(row: WorktimeRecord) {
  await worktimeApi.setDeposit(row._id, false);
  ElMessage.success('已取消押金');
  await Promise.all([loadDailyData(), loadDepositData()]);
}

function handleBatchPayDeposit() {
  if (!selectedDepositUnpaid.value.length) {
    ElMessage.warning('请选择待发放的押金记录');
    return;
  }
  depositPayDate.value = getTodayBeijing();
  depositPayVisible.value = true;
}

async function confirmBatchPayDeposit() {
  if (!depositPayDate.value) {
    ElMessage.warning('请选择发放日期');
    return;
  }
  depositPaying.value = true;
  try {
    await salariesApi.batchPayDeposit({
      worktimes: selectedDepositUnpaid.value,
      payDate: depositPayDate.value
    });
    ElMessage.success('押金发放成功');
    depositPayVisible.value = false;
    selectedDepositRows.value = [];
    await Promise.all([loadDepositData(), loadDailyData()]);
  } catch (err: any) {
    ElMessage.error(err.message || '押金发放失败');
  } finally {
    depositPaying.value = false;
  }
}

async function handleBatchApproveDaily() {
  const ids = selectedDailyPending.value.map((item) => item._id as string);
  if (!ids.length) {
    ElMessage.warning('请选择待审核的记录');
    return;
  }
  await worktimeApi.batchApproveDaily(ids);
  ElMessage.success(`批量通过 ${ids.length} 条`);
  selectedDailyRows.value = [];
  loadDailyData();
}

async function handleBatchRejectDaily() {
  const ids = selectedDailyPending.value.map((item) => item._id as string);
  if (!ids.length) {
    ElMessage.warning('请选择待审核的记录');
    return;
  }
  await worktimeApi.batchRejectDaily(ids);
  ElMessage.success(`批量驳回 ${ids.length} 条`);
  selectedDailyRows.value = [];
  loadDailyData();
}

async function handleBatchSetDeposit() {
  const ids = selectedDailyApproved.value.map((item) => item._id as string);
  if (!ids.length) {
    ElMessage.warning('请选择已通过的记录');
    return;
  }
  await worktimeApi.batchSetDeposit(ids, true);
  ElMessage.success(`批量设为押金 ${ids.length} 条`);
  selectedDailyRows.value = [];
  await Promise.all([loadDailyData(), loadDepositData()]);
}

async function handleApproveMonthly(row: WorktimeMonthlySummary) {
  await worktimeApi.approveMonthly(row._id);
  ElMessage.success('已通过');
  loadMonthlyData();
}

async function handleRejectMonthly(row: WorktimeMonthlySummary) {
  await worktimeApi.rejectMonthly(row._id);
  ElMessage.success('已驳回');
  loadMonthlyData();
}

async function handleBatchApproveMonthly() {
  const ids = selectedMonthlyPending.value.map((item) => item._id as string);
  if (!ids.length) {
    ElMessage.warning('请选择待审核的记录');
    return;
  }
  await worktimeApi.batchApproveMonthly(ids);
  ElMessage.success(`批量通过 ${ids.length} 条`);
  selectedMonthlyRows.value = [];
  loadMonthlyData();
}

async function handleBatchRejectMonthly() {
  const ids = selectedMonthlyPending.value.map((item) => item._id as string);
  if (!ids.length) {
    ElMessage.warning('请选择待审核的记录');
    return;
  }
  await worktimeApi.batchRejectMonthly(ids);
  ElMessage.success(`批量驳回 ${ids.length} 条`);
  selectedMonthlyRows.value = [];
  loadMonthlyData();
}

async function processMonthlyImport(file: File) {
  if (!monthlyFilterForm.month) {
    ElMessage.error('请先选择月份');
    return;
  }

  monthlyImporting.value = true;
  try {
    if (monthlyFilterForm.company_id && !monthlyFilterEmployees.value.length) {
      await loadMonthlyEmployees();
    }
    const companyByName = new Map(companies.value.map((item: any) => [String(item.name || '').trim(), item]));
    const employeeCache = new Map<string, any[]>();

    if (monthlyFilterForm.company_id) {
      employeeCache.set(monthlyFilterForm.company_id, monthlyFilterEmployees.value);
    }

    const rows = await readExcelRows(file);
    if (!rows.length) {
      ElMessage.warning('文件没有数据');
      return false;
    }

    const batchRecords: any[] = [];
    const errors: string[] = [];

    for (const row of rows) {
      const rowCompanyName = String(row['企业'] || row['企业名称'] || '').trim();
      const resolvedCompany = rowCompanyName
        ? companyByName.get(rowCompanyName)
        : companies.value.find((item) => item._id === monthlyFilterForm.company_id);
      const resolvedCompanyId = resolvedCompany?._id || monthlyFilterForm.company_id;
      if (!resolvedCompanyId) {
        errors.push(`${String(row['工号'] || row['姓名'] || '未知员工').trim()} 缺少企业归属`);
        continue;
      }

      let companyEmployees = employeeCache.get(resolvedCompanyId);
      if (!companyEmployees) {
        companyEmployees = await worktimeApi.getCompanyEmployees(resolvedCompanyId, 'monthly');
        employeeCache.set(resolvedCompanyId, companyEmployees);
      }
      const employeeByNo = new Map(companyEmployees.map((item: any) => [String(item.employee_no || '').trim(), item]));
      const employeeByName = new Map(companyEmployees.map((item: any) => [String(item.name || '').trim(), item]));
      const employeeNo = String(row['工号'] || row['员工工号'] || '').trim();
      const employeeName = String(row['姓名'] || row['员工姓名'] || '').trim();
      const employee = employeeByNo.get(employeeNo) || employeeByName.get(employeeName);
      if (!employee) {
        errors.push(`${employeeNo || employeeName || '未知员工'} 未找到 ${resolvedCompany?.name || '目标企业'} 下的月结员工`);
        continue;
      }

      // 验证入职离职时间范围
      const yearMonth = String(row['月份'] || monthlyFilterForm.month).slice(0, 7);
      const monthStart = `${yearMonth}-01`;
      const lastDay = new Date(Number(yearMonth.slice(0, 4)), Number(yearMonth.slice(5, 7)), 0).getDate();
      const monthEnd = `${yearMonth}-${String(lastDay).padStart(2, '0')}`;
      
      if (employee.join_date && employee.join_date > monthEnd) {
        errors.push(`${employeeNo || employeeName} 的入职日期(${employee.join_date})晚于${yearMonth}月，无法录入该月工时`);
        continue;
      }
      if (employee.leave_date && employee.leave_date < monthStart) {
        errors.push(`${employeeNo || employeeName} 的离职日期(${employee.leave_date})早于${yearMonth}月，无法录入该月工时`);
        continue;
      }

      batchRecords.push({
        employee_id: employee.employee_id || employee._id,
        employee_no: employeeNo,
        employee_name: employeeName || employee.name || '',
        company_id: resolvedCompanyId,
        year_month: String(row['月份'] || monthlyFilterForm.month).slice(0, 7),
        total_hours: parseExcelNumber(row['总工时'] || row['工时']),
        total_days: parseExcelNumber(row['总天数'] || row['天数']),
        night_hours: parseExcelNumber(row['夜班工时']),
        night_days: parseExcelNumber(row['夜班天数']),
        salary_amount: parseExcelNumber(row['厂方核定应发总额'] || row['金额'] || row['工资金额'] || row['应发金额'] || row['厂里核算金额']),
        source: 'import',
        remark: String(row['备注'] || '')
      });
    }

    if (!batchRecords.length) {
      ElMessage.warning(`可导入数据为 0 条，预校验失败 ${errors.length} 条`);
      return;
    }

    const batchResult = await worktimeApi.batchAddMonthlySummaries({ records: batchRecords });
    for (const item of batchResult.failedItems || []) {
      errors.push(`${item.employee_no || item.employee_name || item.employee_id || '未知员工'} 导入失败：${item.error}`);
    }

    monthlyImportVisible.value = false;
    monthlyImportFile.value = null;
    monthlyImportUploadRef.value?.clearFiles();
    await loadMonthlyData();
    if (errors.length) {
      ElMessage.warning(`导入 ${batchResult.imported} 条，${errors.length} 条失败`);
      console.warn('[月结工时导入失败]', errors);
    } else {
      ElMessage.success(`导入成功，共 ${batchResult.imported} 条`);
    }
  } catch (err: any) {
    console.error('导入月结工时失败:', err);
    ElMessage.error(err?.message || '导入失败');
  } finally {
    monthlyImporting.value = false;
  }
}

async function downloadMonthlyTemplate() {
  const XLSX = await loadXlsx();
  const rows = [
    {
      企业: companies.value.find((item) => item._id === monthlyFilterForm.company_id)?.name || '宿迁凯达塑业科技有限公司',
      工号: 'E10001',
      姓名: '张三',
      月份: monthlyFilterForm.month || currentMonth,
      总工时: 176,
      总天数: 22,
      夜班工时: 40,
      夜班天数: 5,
      厂方核定应发总额: '',
      备注: ''
    }
  ];
  const ws = XLSX.utils.json_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, '月结工时');
  XLSX.writeFile(wb, '月结工时导入模板.xlsx');
}

function handleMonthlyImportChange(uploadFile: UploadFile) {
  monthlyImportFile.value = (uploadFile.raw as File | undefined) || null;
}

function handleMonthlyImportExceed(files: UploadRawFile[], _uploadFiles: UploadFiles) {
  const nextFile = files[files.length - 1] as File | undefined;
  monthlyImportUploadRef.value?.clearFiles();
  if (!nextFile) return;
  monthlyImportFile.value = nextFile;
}

function handleMonthlyImportRemove() {
  monthlyImportFile.value = null;
}

async function confirmMonthlyImport() {
  if (!monthlyImportFile.value) {
    ElMessage.warning('请先选择 Excel 文件');
    return;
  }
  await processMonthlyImport(monthlyImportFile.value);
}

onMounted(async () => {
  await loadCompanies();
  await Promise.all([loadDailyData(), loadMonthlyData(), loadDepositData()]);
});
</script>

<style scoped lang="scss">
.worktime-page {
  .filter-card {
    margin-bottom: 16px;
  }

  .table-actions {
    margin-bottom: 8px;
    display: flex;
    gap: 8px;
  }

  .pagination-wrapper {
    margin-top: 16px;
    display: flex;
    justify-content: flex-end;
  }

  .import-tip {
    margin: 0 0 12px;
    color: #606266;
  }
}
</style>
