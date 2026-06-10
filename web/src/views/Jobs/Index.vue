<template>
  <div class="jobs-page">
    <div v-if="setupError" style="padding: 20px; color: red;">
      加载错误: {{ setupError }}
      <el-button @click="reload">重试</el-button>
    </div>
    <template v-else>
    <el-card class="search-card">
      <el-form :model="searchForm" inline>
        <el-form-item label="岗位名称">
          <el-input v-model="searchForm.keyword" placeholder="搜索岗位" clearable />
        </el-form-item>
        <el-form-item label="企业">
          <CompanySelect v-model="searchForm.company_id" placeholder="选择企业" clearable width="220px" />
        </el-form-item>
        <el-form-item label="状态">
          <el-select v-model="searchForm.is_recruiting" placeholder="招聘状态" clearable style="width: 220px;">
            <el-option label="招聘中" :value="true" />
            <el-option label="已停止" :value="false" />
          </el-select>
        </el-form-item>
        <el-form-item>
          <el-button type="primary" @click="handleSearch">搜索</el-button>
          <el-button @click="handleReset">重置</el-button>
        </el-form-item>
      </el-form>
    </el-card>

    <div class="toolbar">
      <el-button type="primary" :icon="Plus" @click="handleAdd">发布岗位</el-button>
    </div>

    <el-card>
      <el-table v-loading="loading" :data="tableData" stripe>
        <el-table-column prop="sort_order" label="序号" width="90">
          <template #default="{ row }">
            <span>{{ row.sort_order || '-' }}</span>
          </template>
        </el-table-column>
        <el-table-column prop="job_code" label="岗位编码" width="140" />
        <el-table-column prop="position" label="岗位名称" min-width="150" />
        <el-table-column prop="company_name" label="企业" min-width="150" />
        <el-table-column prop="rate_plan_name" label="工价方案" min-width="150" />
        <el-table-column label="薪资标准" min-width="180">
          <template #default="{ row }">
            <div>日结: {{ row.hourly_rate_daily || '-' }} 元/时</div>
            <div style="color: #909399;">月结: {{ row.hourly_rate_monthly || '-' }} 元/时</div>
          </template>
        </el-table-column>
        <el-table-column label="日结" width="100">
          <template #default="{ row }">
            <el-tag :type="row.supports_daily ? 'success' : 'info'" size="small">
              {{ row.supports_daily ? '支持' : '仅月结' }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column label="薪资范围(元/月)" width="120">
          <template #default="{ row }">
            <span v-if="row.salary_min || row.salary_max">
              {{ row.salary_min || 0 }}-{{ row.salary_max || 0 }}
            </span>
            <span v-else>-</span>
          </template>
        </el-table-column>
        <el-table-column prop="recruited" label="已招" width="80" />
        <el-table-column prop="is_recruiting" label="状态" width="100">
          <template #default="{ row }">
            <el-tag :type="row.is_recruiting ? 'success' : 'info'">
              {{ row.is_recruiting ? '招聘中' : '已停止' }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="created_at" label="发布时间" width="190">
          <template #default="{ row }"><BeijingDateTime :value="row.created_at" /></template>
        </el-table-column>
        <el-table-column label="操作" width="180" fixed="right">
          <template #default="{ row }">
            <el-button link type="primary" @click="handleEdit(row)">编辑</el-button>
            <el-button link type="primary" @click="handleToggle(row)">
              {{ row.is_recruiting ? '停止' : '启动' }}
            </el-button>
            <el-button link type="danger" @click="handleDelete(row)">删除</el-button>
          </template>
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

    <el-dialog v-model="dialogVisible" :title="dialogTitle" width="640px">
      <el-form ref="formRef" :model="form" :rules="rules" label-width="100px">
        <el-form-item label="岗位名称" prop="position">
          <el-input v-model="form.position" placeholder="如：普工、操作工" />
        </el-form-item>
        <el-form-item label="岗位编码" prop="job_code">
          <el-input v-model="form.job_code" placeholder="留空自动生成，也可手动覆盖" />
        </el-form-item>
        <el-form-item label="排序序号">
          <div style="display: flex; align-items: center; gap: 8px; width: 100%;">
            <el-input-number v-model="form.sort_order" :min="1" :max="100" :step="1" :precision="0" style="width: 180px;" />
            <span style="color: #909399; font-size: 12px;">1-100，越小越靠前；留空排在已排序岗位后</span>
          </div>
        </el-form-item>
        <el-form-item label="企业" prop="company_id">
          <CompanySelect v-model="form.company_id" placeholder="选择企业" />
        </el-form-item>
        <el-form-item label="工价方案">
          <el-select v-model="form.rate_plan_id" placeholder="选择工价方案" clearable filterable @change="handlePlanChange">
            <el-option v-for="plan in filteredRatePlans" :key="plan._id" :label="plan.name" :value="plan._id" />
          </el-select>
        </el-form-item>
        <el-form-item label="日结工价" v-if="form.rate_plan_id">
          <span class="rate-display">¥ {{ selectedPlan?.hourly_rate_daily || '-' }} 元/时</span>
        </el-form-item>
        <el-form-item label="月结工价" v-if="form.rate_plan_id">
          <span class="rate-display">¥ {{ selectedPlan?.hourly_rate_monthly || '-' }} 元/时</span>
        </el-form-item>
        <el-form-item label="是否支持日结">
          <el-switch v-model="form.supports_daily" active-text="是" inactive-text="否" />
        </el-form-item>
        <el-form-item label="上班时间">
          <el-input v-model="form.work_time" placeholder="如 08:00-20:00 / 12小时" />
        </el-form-item>
        <el-form-item label="班制">
          <el-radio-group v-model="form.shift_type">
            <el-radio label="day">长白班</el-radio>
            <el-radio label="two_shift">两班倒</el-radio>
          </el-radio-group>
        </el-form-item>
        <el-form-item label="采购单价" prop="purchase_hourly_rate">
          <div style="display: flex; gap: 8px; align-items: center;">
            <el-input-number v-model="form.purchase_hourly_rate" :min="0" :precision="2" />
            <span style="white-space: nowrap;">计薪时长(小时)</span>
            <el-input-number v-model="form.bill_hours" :min="0" :precision="1" style="width: 120px;" />
          </div>
        </el-form-item>
        <el-divider content-position="left">企业结算方案</el-divider>
        <el-form-item label="结算模式">
          <el-radio-group v-model="form.billing_mode">
            <el-radio label="hourly_included">含工资工价</el-radio>
            <el-radio label="service_fee_monthly">服务费</el-radio>
          </el-radio-group>
        </el-form-item>
        <el-form-item label="工资成本归属">
          <el-radio-group v-model="form.salary_cost_bearing_mode">
            <el-radio label="platform_cost">平台承担</el-radio>
            <el-radio label="company_cost">企业承担</el-radio>
          </el-radio-group>
        </el-form-item>
        <el-form-item label="企业结算单价" v-if="form.billing_mode === 'hourly_included'">
          <el-input-number v-model="form.client_hourly_rate" :min="0" :precision="2" />
          <span style="margin-left: 8px; color: #909399;">元/小时</span>
        </el-form-item>
        <template v-else>
          <el-form-item label="服务费基数">
            <el-input-number v-model="form.service_fee_monthly" :min="0" :precision="2" />
            <span style="margin-left: 8px; color: #909399;">元/月</span>
          </el-form-item>
          <el-form-item>
            <span style="color: #909399;">按员工在职天数 / 当月天数 × 服务费基数核算实际费用。</span>
          </el-form-item>
        </template>
        <el-form-item label="计费工时规则">
          <el-radio-group v-model="form.bill_hours_rule">
            <el-radio label="actual_hours">按实际工时</el-radio>
            <el-radio label="fixed_daily_hours">按固定日工时</el-radio>
          </el-radio-group>
        </el-form-item>
        <el-form-item label="固定日计费工时" v-if="form.bill_hours_rule === 'fixed_daily_hours'">
          <el-input-number v-model="form.fixed_bill_hours" :min="0" :precision="1" />
          <span style="margin-left: 8px; color: #909399;">小时/天</span>
        </el-form-item>
        <el-form-item label="生效日期">
          <div style="display: flex; gap: 8px; align-items: center; width: 100%;">
            <el-date-picker v-model="form.finance_effective_from" type="date" value-format="YYYY-MM-DD" placeholder="开始日期" style="width: 180px;" />
            <span style="color: #909399;">至</span>
            <el-date-picker v-model="form.finance_effective_to" type="date" value-format="YYYY-MM-DD" placeholder="结束日期，可空" style="width: 180px;" />
          </div>
        </el-form-item>
        <el-form-item label="财务备注">
          <el-input v-model="form.finance_remark" type="textarea" :rows="2" placeholder="记录与企业结算相关的备注" />
        </el-form-item>
        <el-form-item label="名额" prop="vacancies">
          <el-input-number v-model="form.vacancies" :min="1" />
        </el-form-item>
        <el-form-item label="薪资范围(元/月)">
          <div style="display: flex; gap: 8px; align-items: center;">
            <el-input-number v-model="form.salary_min" :min="0" :precision="0" placeholder="最低" style="width: 120px;" />
            <span>-</span>
            <el-input-number v-model="form.salary_max" :min="0" :precision="0" placeholder="最高" style="width: 120px;" />
          </div>
        </el-form-item>
        <el-form-item label="描述" prop="description">
          <el-input v-model="form.description" type="textarea" :rows="3" />
        </el-form-item>
        <el-form-item label="岗位优势">
          <el-select
            v-model="form.benefits"
            multiple
            filterable
            allow-create
            default-first-option
            placeholder="输入并回车添加优势，如 五险一金/包吃住"
            style="width: 100%;"
          >
            <el-option
              v-for="item in form.benefits || []"
              :key="item"
              :label="item"
              :value="item"
            />
          </el-select>
        </el-form-item>
        <el-form-item label="状态">
          <el-switch v-model="form.is_recruiting" active-text="招聘中" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="dialogVisible = false">取消</el-button>
        <el-button type="primary" :loading="submitting" @click="handleSubmit">
          {{ submitting ? '提交中...' : '确定' }}
        </el-button>
      </template>
    </el-dialog>
    </template>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, computed, onMounted, onErrorCaptured, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { ElMessage, ElMessageBox, type FormInstance, type FormRules } from 'element-plus';
import { Plus } from '@element-plus/icons-vue';
import { jobsApi } from '@/api/modules/jobs';
import { companiesApi } from '@/api/modules/companies';
import { financeApi } from '@/api/modules/finance';
import { ratePlansApi } from '@/api/modules/ratePlans';
import type { Job, Company, FinanceBillingConfig } from '@/api/types';
import { formatDate } from '@/utils/format';
import BeijingDateTime from '@/components/common/BeijingDateTime.vue';
import { usePagination } from '@/composables/usePagination';
import { useTableLoading } from '@/composables/useTableLoading';

// Error tracking
const setupError = ref<string | null>(null);

function reload() {
  setupError.value = null;
  location.reload();
}

const { loading, withLoading } = useTableLoading();
const submitting = ref(false);
const dialogVisible = ref(false);
const isEditing = ref(false);
const formRef = ref<FormInstance | null>(null);
const companies = ref<Company[]>([]);
const ratePlans = ref<any[]>([]);
const billingConfigs = ref<FinanceBillingConfig[]>([]);

// Form must be defined BEFORE computed that use it
const form = reactive<any>({
  _id: '',
  finance_config_id: '',
  position: '',
  job_code: '',
  sort_order: undefined as number | undefined,
  company_id: '',
  rate_plan_id: '',
  hourly_rate_daily: 0,
  hourly_rate_monthly: 0,
  supports_daily: false,
  work_time: '',
  shift_type: 'day',
  purchase_hourly_rate: 0,
  bill_hours: 0,
  billing_mode: 'hourly_included',
  salary_cost_bearing_mode: 'platform_cost',
  client_hourly_rate: 0,
  service_fee_monthly: 0,
  service_fee_hourly: 0,
  bill_hours_rule: 'actual_hours',
  fixed_bill_hours: 0,
  finance_effective_from: '',
  finance_effective_to: '',
  finance_remark: '',
  vacancies: 1,
  salary_min: 0,
  salary_max: 0,
  description: '',
  benefits: [] as string[],
  is_recruiting: true
});

const filteredRatePlans = computed(() => {
  const plans = ratePlans.value || [];
  if (!form.company_id) return plans;
  return plans.filter(p => p.company_id === form.company_id);
});

const selectedPlan = computed(() => {
  const plans = ratePlans.value || [];
  if (!form.rate_plan_id) return null;
  return plans.find(p => p._id === form.rate_plan_id) || null;
});

const tableData = ref<any[]>([]);
const route = useRoute();
const router = useRouter();

const searchForm = reactive({
  keyword: '',
  company_id: '',
  is_recruiting: undefined as boolean | undefined
});

const { pagination, onSizeChange, onCurrentChange } = usePagination(loadData);

const dialogTitle = computed(() => (form._id ? '编辑岗位' : '发布岗位'));

defineExpose({
  form,
  tableData,
  formRef
});

const rules: FormRules = {
  position: [{ required: true, message: '请输入岗位名称', trigger: 'blur' }],
  job_code: [{ pattern: /^[A-Za-z0-9_-]*$/, message: '岗位编码仅支持字母、数字、下划线和短横线', trigger: 'blur' }],
  company_id: [{ required: true, message: '请选择企业', trigger: 'change' }]
};

async function loadCompanies() {
  try {
    const result = await companiesApi.getList({ page: 1, pageSize: 100 });
    companies.value = result.list;
  } catch (err) {
    console.error('加载企业列表失败:', err);
  }
}

async function loadRatePlans() {
  try {
    const res = await ratePlansApi.getList({ page: 1, pageSize: 200 });
    ratePlans.value = res.list || [];
  } catch (err) {
    console.error('加载工价方案失败:', err);
  }
}

async function loadBillingConfigs() {
  try {
    billingConfigs.value = await financeApi.listBillingConfigs({ status: 'active' });
  } catch (err) {
    console.error('加载财务配置失败:', err);
    billingConfigs.value = [];
  }
}

function resolveFinanceConfig(row: any) {
  const candidates = billingConfigs.value
    .filter(item => item.job_id === row._id || item.job_id === row.id)
    .sort((left, right) => String(right.effective_from || '').localeCompare(String(left.effective_from || '')));
  return candidates[0] || financeApi.buildDefaultBillingConfig(row);
}

async function loadData() {
  await withLoading(async () => {
    const result = await jobsApi.getList({
      page: pagination.page,
      pageSize: pagination.pageSize,
      ...searchForm
    });
    console.log('[Jobs] 原始返回:', result);
    const companyMap = new Map((companies.value || []).map(c => [c._id, c.name]));
    const ratePlanMap = new Map((ratePlans.value || []).map((p: any) => [p._id, p]));
    console.log('[Jobs] 表格数据条数:', result.list?.length, '总数:', result.total);
    tableData.value = (result.list || []).map((item: any) => {
      const _id = item._id || item.id;
      const plan = ratePlanMap.get(item.rate_plan_id);
      const financeConfig = resolveFinanceConfig({ ...item, _id });
      return {
        ...item,
        _id,
        id: _id,
        company_name: item.company_name || companyMap.get(item.company_id) || '',
        rate_plan_name: plan?.name || '',
        hourly_rate_daily: plan?.hourly_rate_daily,
        hourly_rate_monthly: plan?.hourly_rate_monthly,
        finance_config_id: financeConfig?._id || financeConfig?.id,
        billing_mode: financeConfig?.billing_mode || 'hourly_included',
        salary_cost_bearing_mode: financeConfig?.salary_cost_bearing_mode || 'platform_cost',
        client_hourly_rate: financeConfig?.client_hourly_rate || item.purchase_hourly_rate || 0,
        service_fee_monthly: financeConfig?.service_fee_monthly || financeConfig?.service_fee_hourly || 0,
        service_fee_hourly: financeConfig?.service_fee_hourly || 0,
        bill_hours_rule: financeConfig?.bill_hours_rule || (item.bill_hours ? 'fixed_daily_hours' : 'actual_hours'),
        fixed_bill_hours: financeConfig?.fixed_bill_hours || item.bill_hours || 0,
        finance_effective_from: financeConfig?.effective_from || '',
        finance_effective_to: financeConfig?.effective_to || '',
        finance_remark: financeConfig?.remark || ''
      };
    });
    pagination.total = result.total || 0;
  });
}

function handleSearch() {
  pagination.page = 1;
  loadData();
}

function handleReset() {
  searchForm.keyword = '';
  searchForm.company_id = '';
  searchForm.is_recruiting = undefined;
  handleSearch();
}

function resetForm() {
  form._id = '';
  form.finance_config_id = '';
  form.position = '';
  form.job_code = '';
  form.sort_order = undefined;
  form.company_id = '';
  form.rate_plan_id = '';
  form.hourly_rate_daily = 0;
  form.hourly_rate_monthly = 0;
  form.supports_daily = false;
  form.work_time = '';
  form.shift_type = 'day';
  form.purchase_hourly_rate = 0;
  form.bill_hours = 0;
  form.billing_mode = 'hourly_included';
  form.salary_cost_bearing_mode = 'platform_cost';
  form.client_hourly_rate = 0;
  form.service_fee_monthly = 0;
  form.service_fee_hourly = 0;
  form.bill_hours_rule = 'actual_hours';
  form.fixed_bill_hours = 0;
  form.finance_effective_from = formatDate(new Date(), 'YYYY-MM-DD');
  form.finance_effective_to = '';
  form.finance_remark = '';
  form.vacancies = 1;
  form.salary_min = 0;
  form.salary_max = 0;
  form.description = '';
  form.benefits = [];
  form.is_recruiting = true;
}

function handleAdd() {
  isEditing.value = false;
  resetForm();
  form.finance_effective_from = formatDate(new Date(), 'YYYY-MM-DD');
  dialogVisible.value = true;
}

function handleEdit(row: any) {
  const rowId = row._id || row.id;
  if (!rowId) {
    ElMessage.error('该岗位缺少ID，无法编辑');
    return;
  }
  isEditing.value = true;
  resetForm();
  Object.assign(form, {
    _id: rowId,
    id: rowId,
    finance_config_id: row.finance_config_id || '',
    position: row.position || '',
    job_code: row.job_code || '',
    sort_order: row.sort_order ?? undefined,
    company_id: row.company_id || '',
    rate_plan_id: row.rate_plan_id || '',
    hourly_rate_daily: row.hourly_rate_daily || 0,
    hourly_rate_monthly: row.hourly_rate_monthly || 0,
    supports_daily: row.supports_daily ?? false,
    work_time: row.work_time || '',
    shift_type: row.shift_type || 'day',
    purchase_hourly_rate: row.purchase_hourly_rate || 0,
    bill_hours: row.bill_hours || 0,
    billing_mode: row.billing_mode || 'hourly_included',
    salary_cost_bearing_mode: row.salary_cost_bearing_mode || 'platform_cost',
    client_hourly_rate: row.client_hourly_rate || row.purchase_hourly_rate || 0,
    service_fee_monthly: row.service_fee_monthly || row.service_fee_hourly || 0,
    service_fee_hourly: row.service_fee_hourly || 0,
    bill_hours_rule: row.bill_hours_rule || (row.bill_hours ? 'fixed_daily_hours' : 'actual_hours'),
    fixed_bill_hours: row.fixed_bill_hours || row.bill_hours || 0,
    finance_effective_from: row.finance_effective_from || formatDate(new Date(), 'YYYY-MM-DD'),
    finance_effective_to: row.finance_effective_to || '',
    finance_remark: row.finance_remark || '',
    vacancies: row.vacancies || 1,
    salary_min: row.salary_min || 0,
    salary_max: row.salary_max || 0,
    description: row.description || '',
    benefits: row.benefits || [],
    is_recruiting: row.is_recruiting ?? true
  });
  dialogVisible.value = true;
}

async function handleDelete(row: Job) {
  try {
    await ElMessageBox.confirm(`删除岗位「${row.position}」？`, '提示', { type: 'warning' });
    await jobsApi.delete(row._id || row.id);
    ElMessage.success('删除成功');
    loadData();
  } catch (err: any) {
    if (err !== 'cancel') {
      ElMessage.error(err?.message || '删除失败');
    }
  }
}

async function handleToggle(row: any) {
  try {
    const id = row._id || row.id;
    if (row.is_recruiting) {
      await jobsApi.stopRecruiting(id);
      ElMessage.success('已停止招聘');
    } else {
      await jobsApi.publish(id);
      ElMessage.success('已发布');
    }
    await loadData();
  } catch (err: any) {
    ElMessage.error(err?.message || '更新状态失败');
  }
}

async function handleSubmit() {
  if (!formRef.value) return;
  await formRef.value.validate(async (valid) => {
    if (!valid) return;
    submitting.value = true;
    try {
      const id = form._id || form.id;
      const companyName = companies.value.find(c => c._id === form.company_id)?.name || '';
      const payload = {
        position: form.position,
        job_code: form.job_code || undefined,
        sort_order: form.sort_order ?? undefined,
        company_id: form.company_id,
        company_name: companyName,
        job_name: form.position,
        rate_plan_id: form.rate_plan_id || undefined,
        hourly_rate_daily: form.hourly_rate_daily || 0,
        hourly_rate_monthly: form.hourly_rate_monthly || 0,
        supports_daily: form.supports_daily ?? false,
        work_time: form.work_time || '',
        shift_type: form.shift_type,
        purchase_hourly_rate: form.purchase_hourly_rate || 0,
        bill_hours: form.bill_hours || undefined,
        vacancies: form.vacancies || 1,
        salary_min: form.salary_min || undefined,
        salary_max: form.salary_max || undefined,
        description: form.description || '',
        benefits: form.benefits || [],
        is_recruiting: form.is_recruiting ?? true,
        recruited: 0
      };
      if (isEditing.value) {
        if (!id) throw new Error('缺少岗位ID，无法更新');
        await jobsApi.update(id, payload);
        await financeApi.saveBillingConfig({
          _id: form.finance_config_id || undefined,
          company_id: form.company_id,
          company_name: companyName,
          job_id: id,
          job_name: form.position,
          billing_mode: form.billing_mode,
          salary_cost_bearing_mode: form.salary_cost_bearing_mode,
          client_hourly_rate: form.billing_mode === 'hourly_included' ? (form.client_hourly_rate || form.purchase_hourly_rate || 0) : 0,
          service_fee_monthly: form.billing_mode === 'service_fee_monthly' ? (form.service_fee_monthly || 0) : 0,
          service_fee_hourly: 0,
          bill_hours_rule: form.bill_hours_rule,
          fixed_bill_hours: form.bill_hours_rule === 'fixed_daily_hours' ? (form.fixed_bill_hours || form.bill_hours || 0) : undefined,
          effective_from: form.finance_effective_from || formatDate(new Date(), 'YYYY-MM-DD'),
          effective_to: form.finance_effective_to || '',
          status: 'active',
          remark: form.finance_remark || '',
          source_job_purchase_hourly_rate: form.purchase_hourly_rate || 0,
          source_job_bill_hours: form.bill_hours || undefined
        });
      } else {
        const created = await jobsApi.create(payload);
        const createdId = created._id || (created as any).id;
        await financeApi.saveBillingConfig({
          company_id: form.company_id,
          company_name: companyName,
          job_id: createdId,
          job_name: form.position,
          billing_mode: form.billing_mode,
          salary_cost_bearing_mode: form.salary_cost_bearing_mode,
          client_hourly_rate: form.billing_mode === 'hourly_included' ? (form.client_hourly_rate || form.purchase_hourly_rate || 0) : 0,
          service_fee_monthly: form.billing_mode === 'service_fee_monthly' ? (form.service_fee_monthly || 0) : 0,
          service_fee_hourly: 0,
          bill_hours_rule: form.bill_hours_rule,
          fixed_bill_hours: form.bill_hours_rule === 'fixed_daily_hours' ? (form.fixed_bill_hours || form.bill_hours || 0) : undefined,
          effective_from: form.finance_effective_from || formatDate(new Date(), 'YYYY-MM-DD'),
          effective_to: form.finance_effective_to || '',
          status: 'active',
          remark: form.finance_remark || '',
          source_job_purchase_hourly_rate: form.purchase_hourly_rate || 0,
          source_job_bill_hours: form.bill_hours || undefined
        });
      }
      ElMessage.success('操作成功');
      dialogVisible.value = false;
      await loadBillingConfigs();
      loadData();
    } catch (err: any) {
      console.error('提交失败:', err);
      ElMessage.error(err?.message || '提交失败');
    } finally {
      submitting.value = false;
    }
  });
}

watch(() => form.company_id, (val) => {
  if (val && form.rate_plan_id) {
    const exists = ratePlans.value.find(p => p._id === form.rate_plan_id && p.company_id === val);
    if (!exists) form.rate_plan_id = '';
  }
});

function handlePlanChange(planId: string) {
  if (!planId) {
    form.hourly_rate_daily = 0;
    form.hourly_rate_monthly = 0;
    return;
  }
  const plan = ratePlans.value.find(p => p._id === planId);
  if (plan) {
    form.hourly_rate_daily = plan.hourly_rate_daily || 0;
    form.hourly_rate_monthly = plan.hourly_rate_monthly || 0;
  }
}

onMounted(async () => {
  try {
    await Promise.all([loadCompanies(), loadRatePlans(), loadBillingConfigs()]);
    await loadData();
  } catch (err: any) {
    console.error('初始化加载失败:', err);
    setupError.value = err?.message || '页面加载失败';
    ElMessage.error('页面加载失败，请刷新重试');
  }
  (window as any).jobsPage = { form, tableData, formRef };
  if (route.path.endsWith('/jobs/add')) {
    handleAdd();
    router.replace('/jobs');
  }
});

// Catch setup errors
onErrorCaptured((err, instance, info) => {
  console.error('[Jobs] Error captured:', err, info);
  setupError.value = err?.message || String(err);
  return false;
});
</script>

<style scoped lang="scss">
.jobs-page {
  .search-card {
    margin-bottom: 16px;
  }

  .toolbar {
    margin-bottom: 16px;
  }

  .pagination-wrapper {
    margin-top: 16px;
    display: flex;
    flex-shrink: 0;
    justify-content: flex-end;
  }

  .rate-display {
    color: #409eff;
    font-weight: 600;
    font-size: 15px;
  }
}
</style>
