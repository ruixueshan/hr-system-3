<template>
  <div class="salary-page">
    <el-tabs v-model="activeTab" type="card">
      <el-tab-pane label="日结薪资计算" name="daily">
        <el-card class="filter-card">
          <el-form :model="dailyForm" inline>
            <el-form-item label="企业">
              <CompanySelect v-model="dailyForm.company_id" />
            </el-form-item>
            <el-form-item label="开始日期">
              <el-date-picker 
                v-model="dailyForm.start_date" 
                type="date" 
                value-format="YYYY-MM-DD" 
                placeholder="不选则查所有"
                :disabled-date="disableBeforeYesterday"
              />
            </el-form-item>
            <el-form-item label="结束日期">
              <el-date-picker 
                v-model="dailyForm.end_date" 
                type="date" 
                value-format="YYYY-MM-DD" 
                placeholder="默认昨天"
                :disabled-date="disableTodayAndAfter"
              />
            </el-form-item>
            <el-form-item>
              <el-button type="primary" @click="handleDailySearch">查询</el-button>
              <el-button :icon="Download" @click="handleExportDaily" :disabled="!dailyPagination.total">导出</el-button>
            </el-form-item>
          </el-form>
        </el-card>

        <el-card>
          <div class="table-header">
            <el-button 
              type="primary" 
              :disabled="!selectedRows.length" 
              @click="handleCalculateSalary"
            >
              薪资计算 ({{ selectedRows.length }})
            </el-button>
            <span v-if="selectedRows.length" class="selected-info">
              已选 {{ selectedRows.length }} 条记录，应发合计: ¥{{ totalGrossPay.toFixed(2) }}
            </span>
          </div>
          <el-table 
            v-loading="dailyLoading" 
            :data="dailyRows" 
            stripe
            @selection-change="handleSelectionChange"
          >
            <el-table-column type="selection" width="50" />
            <el-table-column prop="employee_no" label="工号" width="120" />
            <el-table-column prop="employee_name" label="姓名" width="100" />
            <el-table-column prop="company_name" label="企业" min-width="150" />
            <el-table-column prop="job_name" label="岗位" min-width="140" />
            <el-table-column prop="work_date" label="日期" width="120" />
            <el-table-column prop="shift" label="班次" width="80">
              <template #default="{ row }">
                <el-tag :type="row.shift === 'night' ? 'warning' : 'info'" size="small">
                  {{ row.shift === 'night' ? '夜班' : '白班' }}
                </el-tag>
              </template>
            </el-table-column>
            <el-table-column prop="total_hours" label="工时" width="100" />
            <el-table-column prop="hourly_rate" label="时薪" width="100">
              <template #default="{ row }">¥{{ toFix(row.hourly_rate) }}</template>
            </el-table-column>
            <el-table-column prop="total_pay" label="应发" width="120">
              <template #default="{ row }">¥{{ toFix(row.total_pay) }}</template>
            </el-table-column>
            <el-table-column prop="salary_status" label="状态" width="100">
              <template #default="{ row }">
                <el-tag :type="row.is_paid ? 'success' : (row.total_pay > 0 ? 'success' : 'warning')">
                  {{ row.is_paid ? '已发薪' : (row.total_pay > 0 ? '核算完成' : '待核算') }}
                </el-tag>
              </template>
            </el-table-column>
          </el-table>
          <div class="table-pagination">
            <el-pagination
              v-model:current-page="dailyPagination.page"
              v-model:page-size="dailyPagination.pageSize"
              :total="dailyPagination.total"
              :page-sizes="[10, 20, 50, 100]"
              layout="total, sizes, prev, pager, next, jumper"
              background
              @size-change="handleDailyPageSizeChange"
              @current-change="handleDailyPageChange"
            />
          </div>
        </el-card>

        <el-dialog v-model="salaryDialogVisible" title="薪资计算预览" width="1200px">
          <div class="salary-dialog-header">
            <span>应发合计: ¥{{ salaryPreviewTotal.gross.toFixed(2) }}</span>
            <span>手工调节: ¥{{ salaryPreviewTotal.adjust.toFixed(2) }}</span>
            <span>实发合计: ¥{{ salaryPreviewTotal.net.toFixed(2) }}</span>
          </div>
          <el-table :data="salaryPreviewRows" stripe max-height="400">
            <el-table-column prop="employee_no" label="工号" width="100" />
            <el-table-column prop="employee_name" label="姓名" width="90" />
            <el-table-column prop="work_date" label="日期" width="110" />
            <el-table-column prop="shift" label="班次" width="80">
              <template #default="{ row }">
                <el-tag :type="row.shift === 'night' ? 'warning' : 'info'" size="small">
                  {{ row.shift === 'night' ? '夜班' : '白班' }}
                </el-tag>
              </template>
            </el-table-column>
            <el-table-column prop="total_hours" label="工时" width="70" />
            <el-table-column prop="hourly_rate" label="时薪" width="80">
              <template #default="{ row }">¥{{ toFix(row.hourly_rate) }}</template>
            </el-table-column>
            <el-table-column label="工时工资" width="100">
              <template #default="{ row }">
                ¥{{ toFix(Number(row.total_hours) * Number(row.hourly_rate)) }}
              </template>
            </el-table-column>
            <el-table-column prop="night_allowance" label="夜班补贴" width="100">
              <template #default="{ row }">¥{{ toFix(row.night_allowance) }}</template>
            </el-table-column>
            <el-table-column prop="insurance_deduct" label="保险扣减" width="90">
              <template #default="{ row }">¥{{ toFix(row.insurance_deduct) }}</template>
            </el-table-column>
            <el-table-column prop="gross_pay" label="应发工资" width="100">
              <template #default="{ row }">¥{{ toFix(row.gross_pay) }}</template>
            </el-table-column>
            <el-table-column label="手工调节" width="120">
              <template #default="{ row, $index }">
                <el-input-number 
                  v-model="row.manual_adjust" 
                  :step="10" 
                  :precision="2"
                  size="small"
                  @change="updateFinalPay($index)"
                />
              </template>
            </el-table-column>
            <el-table-column label="实发工资" width="100">
              <template #default="{ row }">
                <span :class="{ 'text-danger': row.manual_adjust !== 0 }">
                  ¥{{ toFix(row.final_pay) }}
                </span>
              </template>
            </el-table-column>
          </el-table>
          <template #footer>
            <el-button @click="salaryDialogVisible = false">取消</el-button>
            <el-button type="primary" @click="handleBatchPay">确认计算</el-button>
          </template>
        </el-dialog>

        <el-dialog v-model="payDialogVisible" title="确认薪资计算" width="400px">
          <p>本次将发放 <strong>{{ salaryPreviewRows.length }}</strong> 条薪资记录</p>
          <p>应发合计: <strong>¥{{ salaryPreviewTotal.gross.toFixed(2) }}</strong></p>
          <p>实发合计: <strong>¥{{ salaryPreviewTotal.net.toFixed(2) }}</strong></p>
          <el-form-item label="发放日期">
            <el-date-picker 
              v-model="payDate" 
              type="date" 
              value-format="YYYY-MM-DD" 
              placeholder="选择发放日期"
            />
          </el-form-item>
          <template #footer>
            <el-button @click="payDialogVisible = false">取消</el-button>
            <el-button type="primary" :loading="paying" @click="confirmBatchPay">确认计算</el-button>
          </template>
        </el-dialog>
      </el-tab-pane>

      <el-tab-pane label="日结薪资查询" name="daily-query">
        <el-card class="filter-card">
          <div class="filter-row">
            <el-form :model="dailyQueryForm" inline>
              <el-form-item label="企业">
                <CompanySelect v-model="dailyQueryForm.company_id" />
              </el-form-item>
              <el-form-item label="员工姓名">
                <el-input v-model="dailyQueryForm.employee_name" placeholder="请输入姓名" clearable style="width: 150px;" />
              </el-form-item>
              <el-form-item label="发放日期">
                <el-date-picker 
                  v-model="dailyQueryForm.pay_date" 
                  type="date" 
                  value-format="YYYY-MM-DD" 
                  placeholder="选择发放日期"
                />
              </el-form-item>
              <el-form-item label="工作日期">
                <el-date-picker
                  v-model="dailyQueryForm.work_date_range"
                  type="daterange"
                  value-format="YYYY-MM-DD"
                  start-placeholder="开始日期"
                  end-placeholder="结束日期"
                  range-separator="至"
                  unlink-panels
                  style="width: 260px;"
                />
              </el-form-item>
              <el-form-item label="来源">
                <el-select v-model="dailyQueryForm.source_type" placeholder="全部来源" clearable style="width: 180px;">
                  <el-option label="全部" value="" />
                  <el-option label="日结工资" value="salary_daily" />
                  <el-option label="押金发放" value="deposit" />
                  <el-option label="项目报销" value="project_reimbursement" />
                </el-select>
              </el-form-item>
              <el-form-item>
                <el-button type="primary" @click="handleDailyQuerySearch">查询</el-button>
                <el-button :icon="Download" @click="handleExportDailyQuery" :disabled="!dailyQueryPagination.total">导出</el-button>
              </el-form-item>
            </el-form>
            <div v-if="dailyQueryRows.length" class="summary-wrapper">
              <div class="summary-item total-count">
                <div class="label">总笔数</div>
                <div class="value">{{ dailyQueryRowCount }} 笔</div>
              </div>
              <div class="summary-divider" />
              <div class="summary-item total-hours">
                <div class="label">工时统计</div>
                <div class="value">{{ dailyQueryHoursTotal }} 小时</div>
              </div>
              <div class="summary-divider" />
              <div class="summary-item total-amount">
                <div class="label">实发合计</div>
                <div class="value">¥{{ dailyQueryNetPayTotal }}</div>
              </div>
            </div>
          </div>
        </el-card>

        <el-card>
          <el-table
            v-loading="dailyQueryLoading"
            :data="dailyQueryRows"
            stripe
            border
            :fit="false"
          >
            <el-table-column prop="employee_name" label="姓名" width="120" />
            <el-table-column label="企业" min-width="150">
              <template #default="{ row }">
                {{ row.company_display || row.company_name }}
              </template>
            </el-table-column>
            <el-table-column label="来源" width="110">
              <template #default="{ row }">
                <el-tag size="small" :type="row.source_type === 'deposit' ? 'warning' : 'info'">
                  {{ getSourceTypeText(row.source_type) }}
                </el-tag>
              </template>
            </el-table-column>
            <el-table-column prop="work_date" label="工作日期" width="120" />
            <el-table-column label="发薪方式" width="100">
              <template #default="{ row }">
                <el-tag v-if="row.salary_payment_method === 'WECHAT'" type="success" size="small">微信发薪</el-tag>
                <el-tag v-else-if="row.salary_payment_method === 'BANK'" type="primary" size="small">银行代发</el-tag>
                <span v-else style="color:#999;">-</span>
              </template>
            </el-table-column>
            <el-table-column prop="shift" label="班次" width="80">
              <template #default="{ row }">
                <el-tag :type="row.shift === 'night' ? 'warning' : 'info'" size="small">
                  {{ row.shift === 'night' ? '夜班' : '白班' }}
                </el-tag>
              </template>
            </el-table-column>
            <el-table-column prop="total_hours" label="工时" width="80" />
            <el-table-column prop="hourly_rate" label="时薪" width="80">
              <template #default="{ row }">¥{{ toFix(row.hourly_rate) }}</template>
            </el-table-column>
            <el-table-column label="工时工资" width="100">
              <template #default="{ row }">¥{{ toFix(Number(row.total_hours) * Number(row.hourly_rate)) }}</template>
            </el-table-column>
            <el-table-column prop="night_allowance" label="夜班补贴" width="100">
              <template #default="{ row }">¥{{ toFix(row.night_allowance) }}</template>
            </el-table-column>
            <el-table-column prop="insurance_deduct" label="保险扣减" width="90">
              <template #default="{ row }">¥{{ toFix(row.insurance_deduct) }}</template>
            </el-table-column>
            <el-table-column prop="gross_pay" label="应发工资" width="100">
              <template #default="{ row }">¥{{ toFix(row.gross_pay) }}</template>
            </el-table-column>
            <el-table-column label="手工调节" width="100">
              <template #default="{ row }">
                <span :class="{ 'text-danger': row.manual_adjust > 0, 'text-success': row.manual_adjust < 0 }">
                  {{ row.manual_adjust > 0 ? '+' : '' }}{{ toFix(row.manual_adjust) }}
                </span>
              </template>
            </el-table-column>
            <el-table-column prop="net_pay" label="实发工资" width="100">
              <template #default="{ row }">¥{{ toFix(row.net_pay) }}</template>
            </el-table-column>
            <el-table-column prop="pay_date" label="发放日期" width="120" />
          </el-table>
          <div class="table-pagination">
            <el-pagination
              v-model:current-page="dailyQueryPagination.page"
              v-model:page-size="dailyQueryPagination.pageSize"
              :total="dailyQueryPagination.total"
              :page-sizes="[10, 20, 50, 100]"
              layout="total, sizes, prev, pager, next, jumper"
              background
              @size-change="handleDailyQueryPageSizeChange"
              @current-change="handleDailyQueryPageChange"
            />
          </div>
        </el-card>
      </el-tab-pane>

      <MonthlySalaryTab />

      <el-tab-pane label="月结薪资查询" name="monthly-query">
        <el-card class="filter-card">
          <el-form :model="monthlyQueryForm" inline>
            <el-form-item label="企业">
              <CompanySelect v-model="monthlyQueryForm.company_id" />
            </el-form-item>
            <el-form-item label="员工姓名">
              <el-input v-model="monthlyQueryForm.employee_name" placeholder="请输入姓名" clearable style="width: 150px;" />
            </el-form-item>
            <el-form-item label="发放日期">
              <el-date-picker 
                v-model="monthlyQueryForm.pay_date" 
                type="date" 
                value-format="YYYY-MM-DD" 
                placeholder="选择发放日期"
              />
            </el-form-item>
            <el-form-item>
              <el-button type="primary" @click="handleMonthlyQuerySearch">查询</el-button>
              <el-button :icon="Download" @click="handleExportMonthlyQuery" :disabled="!monthlyQueryPagination.total">导出</el-button>
            </el-form-item>
          </el-form>
        </el-card>

        <el-card>
          <el-table v-loading="monthlyQueryLoading" :data="monthlyQueryRows" stripe>
            <el-table-column prop="employee_no" label="工号" width="120" />
            <el-table-column prop="employee_name" label="姓名" width="100" />
            <el-table-column prop="company_name" label="企业" min-width="150" />
            <el-table-column prop="job_name" label="岗位" min-width="140" />
            <el-table-column prop="year_month" label="月份" width="100" />
            <el-table-column prop="total_days" label="总天数" width="100" />
            <el-table-column prop="total_hours" label="总工时" width="100" />
            <el-table-column prop="hourly_rate" label="时薪" width="80">
              <template #default="{ row }">¥{{ toFix(row.hourly_rate) }}</template>
            </el-table-column>
            <el-table-column label="工时工资" width="100">
              <template #default="{ row }">¥{{ toFix(Number(row.total_hours) * Number(row.hourly_rate)) }}</template>
            </el-table-column>
            <el-table-column prop="night_allowance" label="夜班补贴" width="100">
              <template #default="{ row }">¥{{ toFix(row.night_allowance) }}</template>
            </el-table-column>
            <el-table-column prop="insurance_deduct" label="保险" width="80">
              <template #default="{ row }">¥{{ toFix(row.insurance_deduct) }}</template>
            </el-table-column>
            <el-table-column prop="tax" label="个税" width="80">
              <template #default="{ row }">¥{{ toFix(row.tax) }}</template>
            </el-table-column>
            <el-table-column prop="gross_pay" label="应发工资" width="100">
              <template #default="{ row }">¥{{ toFix(row.gross_pay) }}</template>
            </el-table-column>
            <el-table-column label="手工调节" width="100">
              <template #default="{ row }">
                <span :class="{ 'text-danger': row.manual_adjust > 0, 'text-success': row.manual_adjust < 0 }">
                  {{ row.manual_adjust > 0 ? '+' : '' }}{{ toFix(row.manual_adjust) }}
                </span>
              </template>
            </el-table-column>
            <el-table-column prop="net_pay" label="实发工资" width="100">
              <template #default="{ row }">¥{{ toFix(row.net_pay) }}</template>
            </el-table-column>
            <el-table-column prop="pay_date" label="发放日期" width="120" />
          </el-table>
          <div class="table-pagination">
            <el-pagination
              v-model:current-page="monthlyQueryPagination.page"
              v-model:page-size="monthlyQueryPagination.pageSize"
              :total="monthlyQueryPagination.total"
              :page-sizes="[10, 20, 50, 100]"
              layout="total, sizes, prev, pager, next, jumper"
              background
              @size-change="handleMonthlyQueryPageSizeChange"
              @current-change="handleMonthlyQueryPageChange"
            />
          </div>
        </el-card>
      </el-tab-pane>

    </el-tabs>
  </div>
</template>

<script setup lang="ts">
import { onMounted, reactive, ref, computed } from 'vue';
import { ElMessage } from 'element-plus';
import { Download } from '@element-plus/icons-vue';
import { companiesApi } from '@/api/modules/companies';
import { salariesApi } from '@/api/modules/salaries';
import { worktimeApi } from '@/api/modules/worktime';
import type { Company } from '@/api/types';
import { loadXlsx } from '@/utils/loadXlsx';
import { usePagination } from '@/composables/usePagination';
import { roundMoney } from '@/utils/db-helper';
import { useTableLoading } from '@/composables/useTableLoading';
import { getCurrentMonthBeijing, getTodayBeijing } from '@/utils/format';
import MonthlySalaryTab from './components/MonthlySalaryTab.vue';

const activeTab = ref<'daily' | 'monthly' | 'daily-query' | 'monthly-query'>('daily');
const companies = ref<Company[]>([]);
const companyShortNameMap = computed<Record<string, string>>(() => {
  const map: Record<string, string> = {};
  companies.value.forEach((c) => {
    map[c._id] = c.short_name || c.name || '';
  });
  return map;
});

const currentMonth = getCurrentMonthBeijing();
type DateRange = [string, string] | [] | null;

const { loading: dailyLoading, withLoading: withDailyLoading } = useTableLoading();
const dailyRows = ref<any[]>([]);
const { pagination: dailyPagination, onSizeChange: handleDailyPageSizeChange, onCurrentChange: handleDailyPageChange } = usePagination(loadDailyData);

const dailyForm = reactive({
  company_id: '',
  start_date: '',
  end_date: ''
});

const dailyQueryForm = reactive<{
  company_id: string;
  employee_name: string;
  pay_date: string;
  work_date_range: DateRange;
  source_type: string;
}>({
  company_id: '',
  employee_name: '',
  pay_date: '',
  work_date_range: getDefaultCurrentMonthRange(),
  source_type: ''
});

const monthlyQueryForm = reactive({
  company_id: '',
  employee_name: '',
  pay_date: ''
});

const { pagination: dailyQueryPagination, onSizeChange: handleDailyQueryPageSizeChange, onCurrentChange: handleDailyQueryPageChange } = usePagination(loadDailyQueryData);

const dailyQuerySummary = reactive({
  total_hours: 0,
  net_pay: 0
});

const dailyQueryRowCount = computed(() => dailyQueryPagination.total);
const dailyQueryHoursTotal = computed(() => toFix(dailyQuerySummary.total_hours));
const dailyQueryNetPayTotal = computed(() => toFix(dailyQuerySummary.net_pay));

const { loading: dailyQueryLoading, withLoading: withDailyQueryLoading } = useTableLoading();
const dailyQueryRows = ref<any[]>([]);
const { loading: monthlyQueryLoading, withLoading: withMonthlyQueryLoading } = useTableLoading();
const monthlyQueryRows = ref<any[]>([]);
const { pagination: monthlyQueryPagination, onSizeChange: handleMonthlyQueryPageSizeChange, onCurrentChange: handleMonthlyQueryPageChange } = usePagination(loadMonthlyQueryData);

const selectedRows = ref<any[]>([]);
const salaryDialogVisible = ref(false);
const salaryPreviewRows = ref<any[]>([]);
const payDialogVisible = ref(false);
const payDate = ref('');
const paying = ref(false);

function disableTodayAndAfter(date: Date) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return date >= today;
}

function disableBeforeYesterday(date: Date) {
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  yesterday.setHours(0, 0, 0, 0);
  return date > yesterday;
}

function getYesterday(): string {
  const date = new Date();
  date.setDate(date.getDate() - 1);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function formatLocalDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function getDefaultCurrentMonthRange(): [string, string] {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), 1);
  const end = new Date(now.getFullYear(), now.getMonth() + 1, 0);
  return [formatLocalDate(start), formatLocalDate(end)];
}

function getDateRangeBounds(range: DateRange) {
  const [start, end] = Array.isArray(range) ? range : [];
  if (start && end && start > end) {
    return { startDate: end, endDate: start };
  }
  return {
    startDate: start || undefined,
    endDate: end || undefined
  };
}

function normalizeDateText(value: unknown): string {
  if (!value) return '';
  const text = String(value);
  const match = text.match(/^(\d{4}-\d{2}-\d{2})/);
  return match ? match[1] : '';
}

function isWithinDateRange(value: unknown, startDate?: string, endDate?: string) {
  const dateText = normalizeDateText(value);
  if (!dateText) return false;
  if (startDate && dateText < startDate) return false;
  if (endDate && dateText > endDate) return false;
  return true;
}

const totalGrossPay = computed(() => {
  return selectedRows.value.reduce((sum, row) => sum + (Number(row.total_pay) || 0), 0);
});

const salaryPreviewTotal = computed(() => {
  const gross = salaryPreviewRows.value.reduce((sum, row) => sum + (Number(row.gross_pay) || 0), 0);
  const adjust = salaryPreviewRows.value.reduce((sum, row) => sum + (Number(row.manual_adjust) || 0), 0);
  const net = salaryPreviewRows.value.reduce((sum, row) => sum + (Number(row.final_pay) || 0), 0);
  return { gross, adjust, net };
});

function handleSelectionChange(rows: any[]) {
  selectedRows.value = rows;
}

function updateFinalPay(index: number) {
  const row = salaryPreviewRows.value[index];
  row.final_pay = roundMoney(Number(row.gross_pay) + Number(row.manual_adjust || 0));
}

function toFix(value?: number) {
  return (Number(value) || 0).toFixed(2);
}

function getSourceTypeText(sourceType?: string) {
  const normalizedType = normalizeSourceType(sourceType) || sourceType || '';
  const map: Record<string, string> = {
    salary_daily: '日结工资',
    salary_monthly: '月结工资',
    deposit: '押金发放',
    project_reimbursement: '项目报销'
  };
  return map[normalizedType] || (normalizedType || '其他');
}

async function loadCompanies() {
  const result = await companiesApi.getList({ page: 1, pageSize: 200 });
  companies.value = result.list || [];
}

async function loadDailyData() {
  selectedRows.value = [];
  await withDailyLoading(async () => {
    const endDate = dailyForm.end_date || getYesterday();
    const result = await worktimeApi.getUnpaidDailyWorktimes({
      company_id: dailyForm.company_id || undefined,
      start_date: dailyForm.start_date || undefined,
      end_date: endDate,
      page: dailyPagination.page,
      pageSize: dailyPagination.pageSize
    });
    dailyRows.value = result.list || [];
    dailyPagination.total = result.total || 0;
    dailyPagination.page = result.page || dailyPagination.page;
    dailyPagination.pageSize = result.pageSize || dailyPagination.pageSize;
  });
}

function handleDailySearch() {
  dailyPagination.page = 1;
  loadDailyData();
}

async function handleCalculateSalary() {
  if (!selectedRows.value.length) {
    ElMessage.warning('请先选择要计算薪资的记录');
    return;
  }

  const invalidRows = selectedRows.value.filter((item: any) => {
    const worktimeId = item.worktime_id || item._id;
    return !worktimeId || !item.employee_id || !item.company_id || !item.work_date;
  });

  if (invalidRows.length) {
    salaryPreviewRows.value = [];
    ElMessage.error(`已选记录中有 ${invalidRows.length} 条关键字段缺失，无法计算薪资`);
    return;
  }

  try {
    const previewRows = await salariesApi.calculateDailyPreview(selectedRows.value);
    if (!previewRows.length) {
      salaryPreviewRows.value = [];
      ElMessage.warning(`已选 ${selectedRows.value.length} 条，但薪资预览返回 0 条，请继续检查云函数取数链路`);
      return;
    }

    if (previewRows.length !== selectedRows.value.length) {
      ElMessage.warning(`已选 ${selectedRows.value.length} 条，实际生成 ${previewRows.length} 条预览，请检查是否存在脏数据或已发记录`);
    }

    salaryPreviewRows.value = previewRows.map((item: any) => ({
      ...item,
      manual_adjust: Number(item.manual_adjust || 0),
      final_pay: roundMoney(Number((item.final_pay ?? item.net_pay ?? item.gross_pay) || 0))
    }));
    salaryDialogVisible.value = true;
  } catch (err: any) {
    salaryPreviewRows.value = [];
    ElMessage.error(err.message || '计算日结薪资失败');
  }
}

async function handleBatchPay() {
  payDialogVisible.value = true;
  payDate.value = getTodayBeijing();
}

async function confirmBatchPay() {
  if (!payDate.value) {
    ElMessage.warning('请选择发放日期');
    return;
  }
  paying.value = true;
  try {
    await salariesApi.batchPayDaily({
      worktimes: salaryPreviewRows.value,
      payDate: payDate.value
    });
    ElMessage.success('薪资计算完成');
    payDialogVisible.value = false;
    salaryDialogVisible.value = false;
    await loadDailyData();
  } catch (err: any) {
    ElMessage.error(err.message || '发薪失败');
  } finally {
    paying.value = false;
  }
}

const sourceTypeAliasMap: Record<string, string> = {
  salary_daily: 'salary_daily',
  daily_salary: 'salary_daily',
  daily: 'salary_daily',
  '日结工资': 'salary_daily',
  '日结薪资': 'salary_daily',
  salary_monthly: 'salary_monthly',
  monthly_salary: 'salary_monthly',
  monthly: 'salary_monthly',
  '月结工资': 'salary_monthly',
  '月结薪资': 'salary_monthly',
  deposit: 'deposit',
  '押金发放': 'deposit',
  '押金返还': 'deposit',
  project_reimbursement: 'project_reimbursement',
  reimbursement: 'project_reimbursement',
  '项目报销': 'project_reimbursement'
};

function normalizeSourceType(sourceType?: string) {
  const raw = String(sourceType || '').trim();
  if (!raw) return '';
  return sourceTypeAliasMap[raw] || sourceTypeAliasMap[raw.toLowerCase()] || '';
}

function parseSalaryDetails(details: unknown): Record<string, any> {
  if (!details) return {};
  if (typeof details === 'object') return details as Record<string, any>;
  if (typeof details !== 'string') return {};
  try {
    return JSON.parse(details) as Record<string, any>;
  } catch {
    return {};
  }
}

function inferSalarySourceType(row: any) {
  const explicitType = normalizeSourceType(row?.source_type || row?.sourceType);
  if (explicitType) return explicitType;

  const sourceId = String(row?.source_id || row?.sourceId || '').trim();
  if (sourceId.startsWith('salary_daily:')) return 'salary_daily';
  if (sourceId.startsWith('salary_monthly:')) return 'salary_monthly';
  if (sourceId.startsWith('deposit:')) return 'deposit';
  if (sourceId.startsWith('project_reimbursement:')) return 'project_reimbursement';

  const details = parseSalaryDetails(row?.details);
  const detailsSourceType = normalizeSourceType(details.source_type || details.sourceType);
  if (detailsSourceType) return detailsSourceType;
  if (details.reimbursement_to_user_id || details.reimbursement_to_user_name || details.period_start || details.period_end) {
    return 'project_reimbursement';
  }
  if (details.worktime_id || details.worktimeId || row?.worktime_id || row?.work_date || Array.isArray(details.salaryDetails)) {
    return 'salary_daily';
  }
  if (row?.source_summary_id || details.source_summary_id || details.sourceSummaryId) {
    return 'salary_monthly';
  }

  const remarkText = [row?.pay_remark, row?.remark, row?.source, details.original_remark, details.remark]
    .map((value) => String(value || '').trim())
    .join(' ');
  if (remarkText.includes('项目报销')) return 'project_reimbursement';
  if (remarkText.includes('押金')) return 'deposit';
  if (remarkText.includes('日结')) return 'salary_daily';
  if (remarkText.includes('月结')) return 'salary_monthly';

  if (row?.settlement_mode === 'daily') return 'salary_daily';
  if (row?.settlement_mode === 'monthly') return 'salary_monthly';
  return '';
}

function normalizeSalaryQueryRow(row: any) {
  const source_type = inferSalarySourceType(row);
  // 兜底：历史记录可能没有顶层 shift 字段，从 details 中解析
  let shift = row?.shift;
  if (!shift && row?.details) {
    try {
      const d = typeof row.details === 'string' ? JSON.parse(row.details) : row.details;
      shift = d?.shift;
    } catch { /* ignore */ }
  }
  return {
    ...row,
    shift: shift || 'day',
    source_type: source_type || row?.source_type || ''
  };
}

async function handleExportDaily() {
  const endDate = dailyForm.end_date || getYesterday();
  const exportResult = await worktimeApi.getUnpaidDailyWorktimes({
    company_id: dailyForm.company_id || undefined,
    start_date: dailyForm.start_date || undefined,
    end_date: endDate,
    page: 1,
    pageSize: Math.max(dailyPagination.total || dailyPagination.pageSize, dailyPagination.pageSize)
  });
  const XLSX = await loadXlsx();
  const rows = (exportResult.list || []).map((item) => ({
    工号: item.employee_no,
    姓名: item.employee_name,
    企业: item.company_name,
    岗位: item.job_name,
    日期: item.work_date,
    工时: item.total_hours,
    时薪: item.hourly_rate,
    应发: item.total_pay,
    状态: item.is_paid ? '已发薪' : (item.total_pay > 0 ? '核算完成' : '待核算')
  }));
  const ws = XLSX.utils.json_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, '日结工时');
  const dateStr = dailyForm.end_date || getYesterday();
  XLSX.writeFile(wb, `日结工时_${dateStr}.xlsx`);
}

async function loadDailyQueryData() {
  await withDailyQueryLoading(async () => {
    const { startDate, endDate } = getDateRangeBounds(dailyQueryForm.work_date_range);
    const result = await salariesApi.getList({
      company_id: dailyQueryForm.company_id || undefined,
      employee_name: dailyQueryForm.employee_name || undefined,
      settlement_mode: 'daily',
      source_type: dailyQueryForm.source_type || undefined,
      pay_date: dailyQueryForm.pay_date || undefined,
      start_date: startDate,
      end_date: endDate,
      page: dailyQueryPagination.page,
      pageSize: dailyQueryPagination.pageSize,
      include_summary: true
    });
    
    let rows = (result.list || []).map((item: any) => normalizeSalaryQueryRow(item));

    // 前端兜底过滤 source_type（避免云函数未更新）
    if (dailyQueryForm.source_type) {
      rows = rows.filter((item: any) => normalizeSourceType(item.source_type) === dailyQueryForm.source_type);
    }

    if (startDate || endDate) {
      rows = rows.filter((item: any) => isWithinDateRange(item.work_date, startDate, endDate));
    }

    dailyQueryRows.value = rows.map((item: any) => ({
      ...item,
      company_display: companyShortNameMap.value[item.company_id] || item.company_short_name || item.company_name
    }));
    dailyQueryPagination.total = result.total || 0;
    dailyQueryPagination.page = result.page || dailyQueryPagination.page;
    dailyQueryPagination.pageSize = result.pageSize || dailyQueryPagination.pageSize;
    dailyQuerySummary.total_hours = Number(result.summary?.total_hours || rows.reduce((sum, row) => sum + (Number(row.total_hours) || 0), 0));
    dailyQuerySummary.net_pay = Number(result.summary?.net_pay || rows.reduce((sum, row) => sum + (Number(row.net_pay) || 0), 0));
  });
}

function handleDailyQuerySearch() {
  dailyQueryPagination.page = 1;
  loadDailyQueryData();
}

async function loadMonthlyQueryData() {
  console.log('[loadMonthlyQueryData] settlement_mode:', monthlyQueryForm.company_id);
  await withMonthlyQueryLoading(async () => {
    const params: Parameters<typeof salariesApi.getList>[0] = {
      company_id: monthlyQueryForm.company_id || undefined,
      employee_name: monthlyQueryForm.employee_name || undefined,
      settlement_mode: 'monthly',
      pay_date: monthlyQueryForm.pay_date || undefined,
      page: monthlyQueryPagination.page,
      pageSize: monthlyQueryPagination.pageSize
    };
    console.log('[loadMonthlyQueryData] 请求参数:', params);
    const result = await salariesApi.getList(params);
    
    monthlyQueryRows.value = result.list || [];
    monthlyQueryPagination.total = result.total || 0;
    monthlyQueryPagination.page = result.page || monthlyQueryPagination.page;
    monthlyQueryPagination.pageSize = result.pageSize || monthlyQueryPagination.pageSize;
  });
}

function handleMonthlyQuerySearch() {
  monthlyQueryPagination.page = 1;
  loadMonthlyQueryData();
}

async function handleExportDailyQuery() {
  const { startDate, endDate } = getDateRangeBounds(dailyQueryForm.work_date_range);
  const exportResult = await salariesApi.getList({
    company_id: dailyQueryForm.company_id || undefined,
    employee_name: dailyQueryForm.employee_name || undefined,
    settlement_mode: 'daily',
    source_type: dailyQueryForm.source_type || undefined,
    pay_date: dailyQueryForm.pay_date || undefined,
    start_date: startDate,
    end_date: endDate,
    page: 1,
    pageSize: Math.max(dailyQueryPagination.total || dailyQueryPagination.pageSize, dailyQueryPagination.pageSize)
  });
  const XLSX = await loadXlsx();
  const rows = (exportResult.list || [])
    .map((item: any) => ({
      ...normalizeSalaryQueryRow(item),
      company_display: companyShortNameMap.value[item.company_id] || item.company_short_name || item.company_name
    }))
    .map((item: any) => ({
    姓名: item.employee_name,
    企业: item.company_display || item.company_name,
    来源: getSourceTypeText(item.source_type),
    发薪方式: item.salary_payment_method === 'WECHAT' ? '微信发薪' : (item.salary_payment_method === 'BANK' ? '银行代发' : '-'),
    工作日期: item.work_date,
    工时: item.total_hours,
    时薪: item.hourly_rate,
    工时工资: Number(item.total_hours) * Number(item.hourly_rate),
    夜班补贴: item.night_allowance,
    保险: item.insurance_deduct,
    应发工资: item.gross_pay,
    手工调节: item.manual_adjust,
    实发工资: item.net_pay,
    发放日期: item.pay_date
  }));
  const ws = XLSX.utils.json_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, '日结薪资查询');
  const dateText = dailyQueryForm.pay_date || (startDate && endDate ? `${startDate}_${endDate}` : currentMonth);
  XLSX.writeFile(wb, `日结薪资查询_${dateText}.xlsx`);
}

async function handleExportMonthlyQuery() {
  const exportResult = await salariesApi.getList({
    company_id: monthlyQueryForm.company_id || undefined,
    employee_name: monthlyQueryForm.employee_name || undefined,
    settlement_mode: 'monthly',
    pay_date: monthlyQueryForm.pay_date || undefined,
    page: 1,
    pageSize: Math.max(monthlyQueryPagination.total || monthlyQueryPagination.pageSize, monthlyQueryPagination.pageSize)
  });
  const XLSX = await loadXlsx();
  const rows = (exportResult.list || []).map((item: any) => ({
    工号: item.employee_no,
    姓名: item.employee_name,
    企业: item.company_name,
    岗位: item.job_name,
    月份: item.year_month,
    总天数: item.total_days,
    总工时: item.total_hours,
    时薪: item.hourly_rate,
    工时工资: Number(item.total_hours) * Number(item.hourly_rate),
    夜班补贴: item.night_allowance,
    保险: item.insurance_deduct,
    个税: item.tax,
    应发工资: item.gross_pay,
    手工调节: item.manual_adjust,
    实发工资: item.net_pay,
    发放日期: item.pay_date
  }));
  const ws = XLSX.utils.json_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, '月结薪资查询');
  XLSX.writeFile(wb, `月结薪资查询_${monthlyQueryForm.pay_date || currentMonth}.xlsx`);
}

async function loadInitialSalaryPageData() {
  const tasks = [
    { name: '日结薪资计算数据', load: loadDailyData },
    { name: '日结薪资查询', load: loadDailyQueryData },
    { name: '月结薪资查询', load: loadMonthlyQueryData }
  ];

  const results = await Promise.allSettled(tasks.map((task) => task.load()));
  const failedTasks = results
    .map((result, index) => ({ result, task: tasks[index] }))
    .filter((item): item is { result: PromiseRejectedResult; task: typeof tasks[number] } => item.result.status === 'rejected');

  if (failedTasks.length) {
    console.error('[Salary] 初始化部分数据失败:', failedTasks.map((item) => ({
      name: item.task.name,
      reason: item.result.reason
    })));
    ElMessage.warning(`薪资页部分数据加载失败：${failedTasks.map((item) => item.task.name).join('、')}`);
  }
}

onMounted(async () => {
  try {
    await loadCompanies();
  } catch (err: any) {
    console.error('[Salary] 企业列表加载失败:', err);
    ElMessage.error(err?.message || '企业列表加载失败');
  }

  await loadInitialSalaryPageData();
});

</script>

<style scoped lang="scss">
.salary-page {
  .filter-card {
    margin-bottom: 16px;
  }

  .filter-row {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 12px;
    flex-wrap: wrap;
  }

  .summary-wrapper {
    display: flex;
    align-items: center;
    gap: 16px;
    padding: 10px 16px;
    background: #f5f9ff;
    border: 1px solid #d8e8ff;
    border-radius: 8px;
    box-shadow: 0 2px 6px rgba(64, 158, 255, 0.12);
    white-space: nowrap;
  }

  .summary-item {
    text-align: right;

    .label {
      font-size: 12px;
      color: #7a8ba0;
      letter-spacing: 0.5px;
      margin-bottom: 2px;
    }

    .value {
      font-size: 24px;
      font-weight: 700;
      line-height: 1.1;
    }

    &.total-count .value {
      color: #409eff;
    }

    &.total-hours .value {
      color: #67c23a;
    }

    &.total-amount .value {
      color: #f56c6c;
    }
  }

  .summary-divider {
    width: 1px;
    height: 38px;
    background: #e4e7ed;
  }
  
  .table-header {
    margin-bottom: 16px;
    display: flex;
    align-items: center;
    gap: 16px;
    
    .selected-info {
      color: #409eff;
      font-size: 14px;
    }
  }

  .table-pagination {
    display: flex;
  flex-shrink: 0;
    justify-content: flex-end;
    padding-top: 16px;
  }
  
  .salary-dialog-header {
    margin-bottom: 16px;
    padding: 12px;
    background: #f5f7fa;
    border-radius: 4px;
    display: flex;
    justify-content: space-around;
    font-size: 16px;
    font-weight: bold;
  }
  
  .text-danger {
    color: #f56c6c;
    font-weight: bold;
  }

}
</style>
