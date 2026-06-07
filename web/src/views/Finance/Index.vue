<template>
  <div class="finance-page">
    <el-row :gutter="20" class="page-top">
      <el-col :xs="24" :xl="16">
        <el-card class="hero-card">
          <div class="hero-content">
            <div>
              <div class="hero-title">财务管理</div>
              <div class="hero-desc">这里集中查看企业结算配置、月度核算结果，以及缺少配置的岗位异常。</div>
            </div>
            <div class="hero-actions">
              <el-button type="primary" @click="openCreateDialog">新增结算配置</el-button>
              <el-button @click="goToJobs">去岗位管理</el-button>
            </div>
          </div>
        </el-card>
      </el-col>
      <el-col :xs="24" :sm="8" :xl="2">
        <el-card class="summary-card">
          <div class="summary-value">{{ configSummary.total }}</div>
          <div class="summary-label">配置总数</div>
        </el-card>
      </el-col>
      <el-col :xs="24" :sm="8" :xl="3">
        <el-card class="summary-card">
          <div class="summary-value text-primary">{{ configSummary.active }}</div>
          <div class="summary-label">启用配置</div>
        </el-card>
      </el-col>
      <el-col :xs="24" :sm="8" :xl="3">
        <el-card class="summary-card">
          <div class="summary-value" :class="financeSummary.missingConfigs > 0 ? 'text-danger' : 'text-success'">{{ financeSummary.missingConfigs }}</div>
          <div class="summary-label">缺配置岗位</div>
        </el-card>
      </el-col>
    </el-row>

    <el-card>
      <el-tabs v-model="activeTab">
        <el-tab-pane label="结算配置" name="configs">
          <el-form :inline="true" :model="configFilters" class="filter-form">
            <el-form-item label="企业">
              <el-select v-model="configFilters.company_id" clearable filterable placeholder="全部企业" style="width: 220px;">
                <el-option v-for="company in companies" :key="company._id" :label="company.name" :value="company._id" />
              </el-select>
            </el-form-item>
            <el-form-item label="状态">
              <el-select v-model="configFilters.status" clearable placeholder="全部状态" style="width: 160px;">
                <el-option label="启用" value="active" />
                <el-option label="停用" value="disabled" />
              </el-select>
            </el-form-item>
            <el-form-item>
              <el-button type="primary" :loading="configLoading" @click="loadBillingConfigs">查询</el-button>
              <el-button @click="resetConfigFilters">重置</el-button>
            </el-form-item>
          </el-form>

          <el-table v-loading="configLoading" :data="configTableData" stripe>
            <el-table-column prop="company_name" label="企业" min-width="160" />
            <el-table-column prop="job_name" label="岗位" min-width="180" />
            <el-table-column label="结算模式" width="140">
              <template #default="{ row }">{{ formatBillingMode(row.billing_mode) }}</template>
            </el-table-column>
            <el-table-column label="工资归属" width="120">
              <template #default="{ row }">{{ formatCostMode(row.salary_cost_bearing_mode) }}</template>
            </el-table-column>
            <el-table-column label="单价" min-width="180">
              <template #default="{ row }">
                <span v-if="row.billing_mode === 'hourly_included'">企业结算 {{ formatMoney(row.client_hourly_rate) }} 元/小时</span>
                <span v-else>服务费基数 {{ formatMoney(resolveServiceFeeMonthly(row)) }} 元/月</span>
              </template>
            </el-table-column>
            <el-table-column label="计费规则" min-width="150">
              <template #default="{ row }">
                <span v-if="row.bill_hours_rule === 'fixed_daily_hours'">固定 {{ formatHours(row.fixed_bill_hours) }} 小时/天</span>
                <span v-else>按实际工时</span>
              </template>
            </el-table-column>
            <el-table-column label="生效区间" min-width="200">
              <template #default="{ row }">{{ row.effective_from || '-' }} 至 {{ row.effective_to || '长期' }}</template>
            </el-table-column>
            <el-table-column label="状态" width="100">
              <template #default="{ row }">
                <el-tag :type="row.status === 'active' ? 'success' : 'info'">{{ row.status === 'active' ? '启用' : '停用' }}</el-tag>
              </template>
            </el-table-column>
            <el-table-column prop="remark" label="备注" min-width="220" show-overflow-tooltip />
            <el-table-column label="操作" width="120" fixed="right">
              <template #default="{ row }">
                <el-button link type="primary" @click="openEditDialog(row)">编辑</el-button>
              </template>
            </el-table-column>
          </el-table>
        </el-tab-pane>

        <el-tab-pane label="月度核算" name="results">
          <el-form :inline="true" :model="resultFilters" class="filter-form">
            <el-form-item label="月份">
              <el-date-picker v-model="resultFilters.month" type="month" value-format="YYYY-MM" placeholder="选择月份" style="width: 160px;" />
            </el-form-item>
            <el-form-item label="企业">
              <el-select v-model="resultFilters.company_id" clearable filterable placeholder="全部企业" style="width: 220px;">
                <el-option v-for="company in companies" :key="company._id" :label="company.name" :value="company._id" />
              </el-select>
            </el-form-item>
            <el-form-item>
              <el-button type="primary" :loading="resultLoading" @click="loadMonthlyResults">重新核算</el-button>
              <el-button @click="resetResultFilters">重置</el-button>
            </el-form-item>
          </el-form>

          <el-row :gutter="16" class="result-summary-row">
            <el-col :xs="24" :sm="12" :xl="6">
              <div class="result-box">
                <div class="result-value text-primary">¥{{ formatMoney(financeSummary.totalRevenue) }}</div>
                <div class="result-label">月度营收</div>
              </div>
            </el-col>
            <el-col :xs="24" :sm="12" :xl="6">
              <div class="result-box">
                <div class="result-value text-warning">¥{{ formatMoney(financeSummary.totalSalaryCost) }}</div>
                <div class="result-label">工资成本</div>
              </div>
            </el-col>
            <el-col :xs="24" :sm="12" :xl="6">
              <div class="result-box">
                <div class="result-value text-danger">¥{{ formatMoney(financeSummary.totalOtherCost) }}</div>
                <div class="result-label">其他成本</div>
              </div>
            </el-col>
            <el-col :xs="24" :sm="12" :xl="6">
              <div class="result-box">
                <div class="result-value" :class="financeSummary.totalProfit >= 0 ? 'text-success' : 'text-danger'">¥{{ formatMoney(financeSummary.totalProfit) }}</div>
                <div class="result-label">净利润</div>
              </div>
            </el-col>
          </el-row>

          <el-alert
            v-if="financeSummary.missingConfigs > 0"
            class="mt-16"
            type="warning"
            :closable="false"
            show-icon
            :title="`当前核算中有 ${financeSummary.missingConfigs} 条岗位缺少财务配置，系统已按岗位采购单价兼容计算。`"
          />

          <el-table v-loading="resultLoading" :data="resultTableData" stripe class="mt-16">
            <el-table-column prop="company_name" label="企业" min-width="150" />
            <el-table-column prop="job_name" label="岗位" min-width="160" />
            <el-table-column label="结算模式" width="120">
              <template #default="{ row }">{{ formatBillingMode(row.billing_mode) }}</template>
            </el-table-column>
            <el-table-column prop="billable_headcount" label="计费人数" width="100" />
            <el-table-column label="计费口径" min-width="150">
              <template #default="{ row }">
                <span v-if="row.billing_mode === 'hourly_included'">{{ formatHours(row.billable_hours) }} 小时</span>
                <span v-else>{{ formatDays(row.service_days) }} / {{ row.month_days || 0 }} 天</span>
              </template>
            </el-table-column>
            <el-table-column prop="revenue_amount" label="营收" width="120">
              <template #default="{ row }">¥{{ formatMoney(row.revenue_amount) }}</template>
            </el-table-column>
            <el-table-column prop="salary_cost_amount" label="工资成本" width="120">
              <template #default="{ row }">¥{{ formatMoney(row.salary_cost_amount) }}</template>
            </el-table-column>
            <el-table-column prop="other_cost_amount" label="其他成本" width="120">
              <template #default="{ row }">¥{{ formatMoney(row.other_cost_amount) }}</template>
            </el-table-column>
            <el-table-column prop="net_profit" label="净利润" width="120">
              <template #default="{ row }">¥{{ formatMoney(row.net_profit) }}</template>
            </el-table-column>
            <el-table-column label="核算状态" width="120">
              <template #default="{ row }">
                <el-tag :type="row.status === 'missing_config' ? 'warning' : 'success'">{{ row.status === 'missing_config' ? '缺少配置' : '已生成' }}</el-tag>
              </template>
            </el-table-column>
            <el-table-column label="异常说明" min-width="220">
              <template #default="{ row }">{{ formatAnomalies(row.details) }}</template>
            </el-table-column>
          </el-table>
        </el-tab-pane>
      </el-tabs>
    </el-card>

    <el-dialog v-model="dialogVisible" :title="editingId ? '编辑结算配置' : '新增结算配置'" width="680px">
      <el-form ref="formRef" :model="form" :rules="rules" label-width="110px">
        <el-form-item label="企业" prop="company_id">
          <el-select v-model="form.company_id" filterable placeholder="选择企业" style="width: 100%;" @change="handleCompanyChange">
            <el-option v-for="company in companies" :key="company._id" :label="company.name" :value="company._id" />
          </el-select>
        </el-form-item>
        <el-form-item label="岗位" prop="job_id">
          <el-select v-model="form.job_id" filterable placeholder="选择岗位" style="width: 100%;" @change="handleJobChange">
            <el-option v-for="job in dialogJobs" :key="job._id" :label="job.position" :value="job._id" />
          </el-select>
        </el-form-item>
        <el-form-item label="结算模式" prop="billing_mode">
          <el-radio-group v-model="form.billing_mode">
            <el-radio label="hourly_included">含工资工价</el-radio>
            <el-radio label="service_fee_monthly">服务费</el-radio>
          </el-radio-group>
        </el-form-item>
        <el-form-item label="工资成本归属" prop="salary_cost_bearing_mode">
          <el-radio-group v-model="form.salary_cost_bearing_mode">
            <el-radio label="platform_cost">平台承担</el-radio>
            <el-radio label="company_cost">企业承担</el-radio>
          </el-radio-group>
        </el-form-item>
        <el-form-item label="企业结算单价" v-if="form.billing_mode === 'hourly_included'">
          <el-input-number v-model="form.client_hourly_rate" :min="0" :precision="2" style="width: 220px;" />
          <span class="unit-text">元/小时</span>
        </el-form-item>
        <template v-else>
          <el-form-item label="服务费基数">
            <el-input-number v-model="form.service_fee_monthly" :min="0" :precision="2" style="width: 220px;" />
            <span class="unit-text">元/月</span>
          </el-form-item>
          <el-form-item>
            <div class="form-tip">实际营收按在职天数 / 当月天数 × 服务费基数计算。</div>
          </el-form-item>
        </template>
        <el-form-item label="计费规则" prop="bill_hours_rule">
          <el-radio-group v-model="form.bill_hours_rule">
            <el-radio label="actual_hours">按实际工时</el-radio>
            <el-radio label="fixed_daily_hours">按固定日工时</el-radio>
          </el-radio-group>
        </el-form-item>
        <el-form-item label="固定日工时" v-if="form.bill_hours_rule === 'fixed_daily_hours'">
          <el-input-number v-model="form.fixed_bill_hours" :min="0" :precision="1" style="width: 220px;" />
          <span class="unit-text">小时/天</span>
        </el-form-item>
        <el-form-item label="生效开始" prop="effective_from">
          <el-date-picker v-model="form.effective_from" type="date" value-format="YYYY-MM-DD" placeholder="开始日期" style="width: 220px;" />
        </el-form-item>
        <el-form-item label="生效结束">
          <el-date-picker v-model="form.effective_to" type="date" value-format="YYYY-MM-DD" placeholder="结束日期，可空" style="width: 220px;" />
        </el-form-item>
        <el-form-item label="状态" prop="status">
          <el-radio-group v-model="form.status">
            <el-radio label="active">启用</el-radio>
            <el-radio label="disabled">停用</el-radio>
          </el-radio-group>
        </el-form-item>
        <el-form-item label="备注">
          <el-input v-model="form.remark" type="textarea" :rows="3" placeholder="记录结算备注" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="dialogVisible = false">取消</el-button>
        <el-button type="primary" :loading="submitting" @click="handleSubmit">保存</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue';
import { useRouter } from 'vue-router';
import { ElMessage, type FormInstance, type FormRules } from 'element-plus';
import { companiesApi } from '@/api/modules/companies';
import { jobsApi } from '@/api/modules/jobs';
import { financeApi } from '@/api/modules/finance';
import type { Company, FinanceBillingConfig, FinanceMonthlyResult, Job } from '@/api/types';
import { useTableLoading } from '@/composables/useTableLoading';

const router = useRouter();
const activeTab = ref<'configs' | 'results'>('configs');
const { loading: configLoading, withLoading: withConfigLoading } = useTableLoading();
const { loading: resultLoading, withLoading: withResultLoading } = useTableLoading();
const dialogVisible = ref(false);
const submitting = ref(false);
const editingId = ref('');
const formRef = ref<FormInstance>();

const companies = ref<Company[]>([]);
const jobs = ref<Job[]>([]);
const configTableData = ref<FinanceBillingConfig[]>([]);
const resultTableData = ref<FinanceMonthlyResult[]>([]);

const configFilters = reactive({
  company_id: '',
  status: 'active'
});

const resultFilters = reactive({
  month: getCurrentMonth(),
  company_id: ''
});

const configSummary = reactive({
  total: 0,
  active: 0
});

const financeSummary = reactive({
  totalRevenue: 0,
  totalSalaryCost: 0,
  totalOtherCost: 0,
  totalProfit: 0,
  missingConfigs: 0
});

const form = reactive<FinanceBillingConfig>({
  company_id: '',
  company_name: '',
  job_id: '',
  job_name: '',
  billing_mode: 'hourly_included',
  salary_cost_bearing_mode: 'platform_cost',
  client_hourly_rate: 0,
  service_fee_monthly: 0,
  service_fee_hourly: 0,
  bill_hours_rule: 'actual_hours',
  fixed_bill_hours: 0,
  effective_from: getCurrentDate(),
  effective_to: '',
  status: 'active',
  remark: ''
});

const rules: FormRules = {
  company_id: [{ required: true, message: '请选择企业', trigger: 'change' }],
  job_id: [{ required: true, message: '请选择岗位', trigger: 'change' }],
  billing_mode: [{ required: true, message: '请选择结算模式', trigger: 'change' }],
  salary_cost_bearing_mode: [{ required: true, message: '请选择工资成本归属', trigger: 'change' }],
  bill_hours_rule: [{ required: true, message: '请选择计费规则', trigger: 'change' }],
  effective_from: [{ required: true, message: '请选择生效开始日期', trigger: 'change' }],
  status: [{ required: true, message: '请选择状态', trigger: 'change' }]
};

const dialogJobs = computed(() => {
  if (!form.company_id) return jobs.value;
  return jobs.value.filter((job) => job.company_id === form.company_id);
});

function getCurrentDate() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function getCurrentMonth() {
  return getCurrentDate().slice(0, 7);
}

function formatMoney(value?: number) {
  return (Number(value) || 0).toFixed(2);
}

function formatHours(value?: number) {
  return (Number(value) || 0).toFixed(2);
}

function formatDays(value?: number) {
  return (Number(value) || 0).toFixed(0);
}

function formatBillingMode(mode?: string) {
  return mode === 'service_fee_monthly' || mode === 'service_fee_hourly' ? '服务费' : '含工资工价';
}

function resolveServiceFeeMonthly(row?: Partial<FinanceBillingConfig>) {
  return Number(row?.service_fee_monthly ?? row?.service_fee_hourly ?? 0);
}

function formatCostMode(mode?: string) {
  return mode === 'company_cost' ? '企业承担' : '平台承担';
}

function formatAnomalies(details?: string) {
  try {
    const parsed = JSON.parse(String(details || '{}'));
    const anomalies = Array.isArray(parsed.anomalies) ? parsed.anomalies : [];
    if (!anomalies.length) return '-';
    return anomalies.map((item: string) => item === 'missing_billing_config' ? '缺少结算配置，已按岗位采购单价兼容' : item).join('；');
  } catch {
    return '-';
  }
}

function resetFinanceSummary() {
  financeSummary.totalRevenue = 0;
  financeSummary.totalSalaryCost = 0;
  financeSummary.totalOtherCost = 0;
  financeSummary.totalProfit = 0;
  financeSummary.missingConfigs = 0;
}

function resetForm() {
  editingId.value = '';
  form._id = undefined;
  form.id = undefined;
  form.company_id = '';
  form.company_name = '';
  form.job_id = '';
  form.job_name = '';
  form.billing_mode = 'hourly_included';
  form.salary_cost_bearing_mode = 'platform_cost';
  form.client_hourly_rate = 0;
  form.service_fee_monthly = 0;
  form.service_fee_hourly = 0;
  form.bill_hours_rule = 'actual_hours';
  form.fixed_bill_hours = 0;
  form.effective_from = getCurrentDate();
  form.effective_to = '';
  form.status = 'active';
  form.remark = '';
}

async function loadCompanies() {
  const result = await companiesApi.getList({ page: 1, pageSize: 500 });
  companies.value = result.list || [];
}

async function loadJobs() {
  const result = await jobsApi.getList({ page: 1, pageSize: 5000 });
  jobs.value = result.list || [];
}

async function loadBillingConfigs() {
  await withConfigLoading(async () => {
    const rows = await financeApi.listBillingConfigs({
      company_id: configFilters.company_id || undefined,
      status: configFilters.status || undefined
    });
    configTableData.value = rows
      .map((item) => ({
        ...item,
        company_name: item.company_name || companies.value.find((company) => company._id === item.company_id)?.name || item.company_id,
        job_name: item.job_name || jobs.value.find((job) => job._id === item.job_id)?.position || item.job_id
      }))
      .sort((left, right) => String(right.effective_from || '').localeCompare(String(left.effective_from || '')));
    configSummary.total = configTableData.value.length;
    configSummary.active = configTableData.value.filter((item) => item.status === 'active').length;
  });
}

async function loadMonthlyResults() {
  resetFinanceSummary();
  await withResultLoading(async () => {
    const [yearText, monthText] = String(resultFilters.month || getCurrentMonth()).split('-');
    const rows = await financeApi.calculateMonthlyResults({
      year: Number(yearText),
      month: Number(monthText),
      company_id: resultFilters.company_id || undefined
    });
    resultTableData.value = rows.sort((left, right) => Number(right.net_profit || 0) - Number(left.net_profit || 0));
    financeSummary.totalRevenue = resultTableData.value.reduce((sum, item) => sum + Number(item.revenue_amount || 0), 0);
    financeSummary.totalSalaryCost = resultTableData.value.reduce((sum, item) => sum + Number(item.salary_cost_amount || 0), 0);
    financeSummary.totalOtherCost = resultTableData.value.reduce((sum, item) => sum + Number(item.other_cost_amount || 0), 0);
    financeSummary.totalProfit = resultTableData.value.reduce((sum, item) => sum + Number(item.net_profit || 0), 0);
    financeSummary.missingConfigs = resultTableData.value.filter((item) => item.status === 'missing_config').length;
  });
}

function resetConfigFilters() {
  configFilters.company_id = '';
  configFilters.status = 'active';
  loadBillingConfigs();
}

function resetResultFilters() {
  resultFilters.month = getCurrentMonth();
  resultFilters.company_id = '';
  loadMonthlyResults();
}

function handleCompanyChange() {
  form.job_id = '';
  form.job_name = '';
  form.company_name = companies.value.find((company) => company._id === form.company_id)?.name || '';
}

function handleJobChange() {
  form.job_name = jobs.value.find((job) => job._id === form.job_id)?.position || '';
}

function openCreateDialog() {
  resetForm();
  dialogVisible.value = true;
}

function openEditDialog(row: FinanceBillingConfig) {
  editingId.value = row._id || row.id || '';
  form._id = row._id;
  form.id = row.id;
  form.company_id = row.company_id;
  form.company_name = row.company_name || '';
  form.job_id = row.job_id;
  form.job_name = row.job_name || '';
  form.billing_mode = row.billing_mode;
  form.salary_cost_bearing_mode = row.salary_cost_bearing_mode;
  form.client_hourly_rate = row.client_hourly_rate || 0;
  form.service_fee_monthly = resolveServiceFeeMonthly(row);
  form.service_fee_hourly = row.service_fee_hourly || 0;
  form.bill_hours_rule = row.bill_hours_rule;
  form.fixed_bill_hours = row.fixed_bill_hours || 0;
  form.effective_from = row.effective_from;
  form.effective_to = row.effective_to || '';
  form.status = row.status;
  form.remark = row.remark || '';
  dialogVisible.value = true;
}

async function handleSubmit() {
  if (!formRef.value) return;
  await formRef.value.validate(async (valid) => {
    if (!valid) return;
    submitting.value = true;
    try {
      await financeApi.saveBillingConfig({
        _id: editingId.value || undefined,
        company_id: form.company_id,
        company_name: form.company_name,
        job_id: form.job_id,
        job_name: form.job_name,
        billing_mode: form.billing_mode,
        salary_cost_bearing_mode: form.salary_cost_bearing_mode,
        client_hourly_rate: form.billing_mode === 'hourly_included' ? Number(form.client_hourly_rate || 0) : 0,
        service_fee_monthly: form.billing_mode === 'service_fee_monthly' ? Number(form.service_fee_monthly || 0) : 0,
        service_fee_hourly: 0,
        bill_hours_rule: form.bill_hours_rule,
        fixed_bill_hours: form.bill_hours_rule === 'fixed_daily_hours' ? Number(form.fixed_bill_hours || 0) : undefined,
        effective_from: form.effective_from,
        effective_to: form.effective_to || '',
        status: form.status,
        remark: form.remark || ''
      });
      ElMessage.success(editingId.value ? '结算配置已更新' : '结算配置已创建');
      dialogVisible.value = false;
      await loadBillingConfigs();
      await loadMonthlyResults();
    } catch (err: any) {
      ElMessage.error(err?.message || '保存结算配置失败');
    } finally {
      submitting.value = false;
    }
  });
}

function goToJobs() {
  router.push('/jobs');
}

onMounted(async () => {
  await Promise.all([loadCompanies(), loadJobs()]);
  await Promise.all([loadBillingConfigs(), loadMonthlyResults()]);
});
</script>

<style scoped lang="scss">
.finance-page {
  .page-top {
    margin-bottom: 20px;
  }

  .hero-card {
    height: 100%;
  }

  .hero-content {
    display: flex;
    justify-content: space-between;
    gap: 16px;
    align-items: center;
    min-height: 96px;
  }

  .hero-title {
    font-size: 24px;
    font-weight: 700;
    color: #1f2937;
  }

  .hero-desc {
    margin-top: 8px;
    color: #6b7280;
    line-height: 1.6;
  }

  .hero-actions {
    display: flex;
    gap: 12px;
    flex-wrap: wrap;
    justify-content: flex-end;
  }

  .summary-card,
  .result-box {
    text-align: center;
  }

  .summary-card {
    height: 100%;
  }

  .summary-value,
  .result-value {
    font-size: 28px;
    font-weight: 700;
    line-height: 1.2;
  }

  .summary-label,
  .result-label {
    margin-top: 8px;
    color: #6b7280;
    font-size: 13px;
  }

  .filter-form {
    margin-bottom: 16px;
  }

  .result-summary-row {
    margin-bottom: 4px;
  }

  .form-tip {
    color: #909399;
    line-height: 1.6;
  }

  .result-box {
    background: #f8fafc;
    border-radius: 10px;
    padding: 20px 12px;
  }

  .mt-16 {
    margin-top: 16px;
  }

  .text-primary {
    color: #2563eb;
  }

  .text-success {
    color: #16a34a;
  }

  .text-warning {
    color: #d97706;
  }

  .text-danger {
    color: #dc2626;
  }

  .unit-text {
    margin-left: 8px;
    color: #6b7280;
  }
}
</style>