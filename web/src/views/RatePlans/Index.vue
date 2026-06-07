<template>
  <div class="rate-plans-page">
    <el-card class="search-card">
      <el-form :model="searchForm" inline>
        <el-form-item label="方案名称">
          <el-input v-model="searchForm.keyword" placeholder="搜索方案名称" clearable />
        </el-form-item>
        <el-form-item label="企业">
          <CompanySelect v-model="searchForm.company_id" placeholder="全部企业" clearable width="200px" />
        </el-form-item>
        <el-form-item>
          <el-button type="primary" @click="handleSearch">搜索</el-button>
          <el-button @click="handleReset">重置</el-button>
          <el-button type="success" @click="openDialog()">新增方案</el-button>
        </el-form-item>
      </el-form>
    </el-card>

    <el-card>
      <el-table v-loading="loading" :data="tableData" stripe>
        <el-table-column prop="name" label="方案名称" min-width="160" />
        <el-table-column prop="company_name" label="企业" min-width="160" />
        <el-table-column label="日结时薪" width="100">
          <template #default="{ row }">
            <span>{{ row.hourly_rate_daily || '-' }}</span>
          </template>
        </el-table-column>
        <el-table-column label="月结时薪" width="100">
          <template #default="{ row }">
            <span>{{ row.hourly_rate_monthly || '-' }}</span>
          </template>
        </el-table-column>
        <el-table-column label="夜班补贴" min-width="150">
          <template #default="{ row }">
            <div>按小时：{{ row.night_hourly_rate || 0 }} 元/小时</div>
            <div class="text-muted">按天：{{ row.night_daily_rate || 0 }} 元/天</div>
          </template>
        </el-table-column>
        <el-table-column label="保险扣除" min-width="150">
          <template #default="{ row }">
            <div>按天：{{ row.insurance_daily_deduct || 0 }} 元/天</div>
            <div class="text-muted">按月：{{ row.insurance_monthly_deduct || 0 }} 元/月</div>
          </template>
        </el-table-column>
        <el-table-column prop="effective_from" label="生效时间" width="180">
          <template #default="{ row }">
            {{ row.effective_from || '-' }}<br />
            <span class="text-muted" style="font-size: 12px;">至 {{ row.effective_to || '长期' }}</span>
          </template>
        </el-table-column>
        <el-table-column prop="status" label="状态" width="100">
          <template #default="{ row }">
            <el-tag :type="row.status === 'active' ? 'success' : 'info'">{{ row.status === 'active' ? '启用' : '停用' }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column label="操作" width="180" fixed="right">
          <template #default="{ row }">
            <el-button link type="primary" @click="openDialog(row)">编辑</el-button>
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

    <el-dialog v-model="dialogVisible" :title="dialogTitle" width="680px">
      <el-form :model="form" :rules="rules" ref="formRef" label-width="100px">
        <el-form-item label="方案名称" prop="name">
          <el-input v-model="form.name" placeholder="如：通用工价方案" />
        </el-form-item>
        <el-form-item label="企业" prop="company_id">
          <CompanySelect v-model="form.company_id" placeholder="选择企业" />
        </el-form-item>

        <el-divider content-position="left">日结参数</el-divider>
        <div class="section-fields">
          <el-form-item label="时薪" prop="hourly_rate_daily">
            <el-input-number v-model="form.hourly_rate_daily" :min="0" :precision="2" placeholder="元/小时" />
          </el-form-item>
          <el-form-item label="日薪">
            <el-input-number v-model="form.daily_rate_daily" :min="0" :precision="2" placeholder="元/天" />
          </el-form-item>
          <el-form-item label="计薪时长">
            <el-input-number v-model="form.pay_hours_daily" :min="0" :precision="2" placeholder="小时/天" />
          </el-form-item>
          <el-form-item label="夜班补贴">
            <div class="inline-inputs">
              <el-input-number v-model="form.night_hourly_rate_daily" :min="0" :precision="2" placeholder="元/小时" />
              <span class="input-suffix">元/小时</span>
              <el-input-number v-model="form.night_daily_rate_daily" :min="0" :precision="2" placeholder="元/天" />
              <span class="input-suffix">元/天</span>
            </div>
          </el-form-item>
        </div>

        <el-divider content-position="left">月结参数</el-divider>
        <div class="section-fields">
          <el-form-item label="时薪" prop="hourly_rate_monthly">
            <el-input-number v-model="form.hourly_rate_monthly" :min="0" :precision="2" placeholder="元/小时" />
          </el-form-item>
          <el-form-item label="日薪">
            <el-input-number v-model="form.daily_rate_monthly" :min="0" :precision="2" placeholder="元/天" />
          </el-form-item>
          <el-form-item label="计薪时长">
            <el-input-number v-model="form.pay_hours_monthly" :min="0" :precision="2" placeholder="小时/天" />
          </el-form-item>
          <el-form-item label="夜班补贴">
            <div class="inline-inputs">
              <el-input-number v-model="form.night_hourly_rate_monthly" :min="0" :precision="2" placeholder="元/小时" />
              <span class="input-suffix">元/小时</span>
              <el-input-number v-model="form.night_daily_rate_monthly" :min="0" :precision="2" placeholder="元/天" />
              <span class="input-suffix">元/天</span>
            </div>
          </el-form-item>
        </div>

        <el-divider content-position="left">保险扣除（共享）</el-divider>
        <div class="section-fields">
          <el-form-item label="按天扣除">
            <el-input-number v-model="form.insurance_daily_deduct" :min="0" :precision="2" placeholder="元/天" />
          </el-form-item>
          <el-form-item label="按月扣除">
            <el-input-number v-model="form.insurance_monthly_deduct" :min="0" :precision="2" placeholder="元/月" />
          </el-form-item>
        </div>

        <el-divider content-position="left">有效期与状态</el-divider>
        <el-form-item label="有效期">
          <el-date-picker
            v-model="dateRange"
            type="daterange"
            range-separator="至"
            start-placeholder="开始日期"
            end-placeholder="结束日期"
            value-format="YYYY-MM-DD"
          />
        </el-form-item>
        <el-form-item label="状态">
          <el-radio-group v-model="form.status">
            <el-radio label="active">启用</el-radio>
            <el-radio label="inactive">停用</el-radio>
          </el-radio-group>
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
import { ref, reactive, computed, onMounted } from 'vue';
import { ElMessage, ElMessageBox, type FormInstance, type FormRules } from 'element-plus';
import { ratePlansApi } from '@/api/modules/ratePlans';
import { companiesApi } from '@/api/modules/companies';
import type { RatePlan, Company } from '@/api/types';
import { usePagination } from '@/composables/usePagination';
import { useTableLoading } from '@/composables/useTableLoading';

const { loading, withLoading } = useTableLoading();
const tableData = ref<RatePlan[]>([]);
const companies = ref<Company[]>([]);
const dialogVisible = ref(false);
const submitting = ref(false);
const formRef = ref<FormInstance>();
const form = reactive<Partial<RatePlan>>({
  _id: '',
  name: '',
  company_id: '',
  hourly_rate_daily: 0,
  daily_rate_daily: 0,
  pay_hours_daily: 8,
  night_hourly_rate_daily: 0,
  night_daily_rate_daily: 0,
  hourly_rate_monthly: 0,
  daily_rate_monthly: 0,
  pay_hours_monthly: 8,
  night_hourly_rate_monthly: 0,
  night_daily_rate_monthly: 0,
  insurance_daily_deduct: 0,
  insurance_monthly_deduct: 0,
  status: 'active'
});
const dateRange = ref<string[] | null>(null);

const dialogTitle = computed(() => (form._id ? '编辑工价方案' : '新增工价方案'));

const searchForm = reactive({
  keyword: '',
  company_id: ''
});

const { pagination, onSizeChange, onCurrentChange } = usePagination(loadData);

const rules: FormRules = {
  name: [{ required: true, message: '请输入方案名称', trigger: 'blur' }],
  company_id: [{ required: true, message: '请选择企业', trigger: 'change' }]
};

onMounted(async () => {
  await loadCompanies();
  await loadData();
});

async function loadCompanies() {
  try {
    const res = await companiesApi.getList({ page: 1, pageSize: 200 });
    companies.value = res.list;
  } catch (err) {
    console.error('加载企业失败', err);
  }
}

async function loadData(resetPage = false) {
  if (resetPage) pagination.page = 1;
  await withLoading(async () => {
    const res = await ratePlansApi.getList({
      page: pagination.page,
      pageSize: pagination.pageSize,
      keyword: searchForm.keyword || undefined,
      company_id: searchForm.company_id || undefined,
      status: 'active'
    } as any);
    const companyMap = new Map(companies.value.map(c => [c._id, c.name]));
    tableData.value = (res.list || []).map((item: any) => ({
      ...item,
      company_name: item.company_name || companyMap.get(item.company_id) || ''
    }));
    pagination.total = res.total;
  });
}

function handleSearch() {
  pagination.page = 1;
  loadData();
}

function handleReset() {
  searchForm.keyword = '';
  searchForm.company_id = '';
  handleSearch();
}

function openDialog(row?: RatePlan) {
  if (row) {
    Object.assign(form, {
      _id: row._id,
      name: row.name,
      company_id: row.company_id,
      hourly_rate_daily: row.hourly_rate_daily ?? 0,
      daily_rate_daily: row.daily_rate_daily ?? 0,
      pay_hours_daily: row.pay_hours_daily ?? 8,
      night_hourly_rate_daily: row.night_hourly_rate_daily ?? 0,
      night_daily_rate_daily: row.night_daily_rate_daily ?? 0,
      hourly_rate_monthly: row.hourly_rate_monthly ?? 0,
      daily_rate_monthly: row.daily_rate_monthly ?? 0,
      pay_hours_monthly: row.pay_hours_monthly ?? 8,
      night_hourly_rate_monthly: row.night_hourly_rate_monthly ?? 0,
      night_daily_rate_monthly: row.night_daily_rate_monthly ?? 0,
      insurance_daily_deduct: row.insurance_daily_deduct ?? 0,
      insurance_monthly_deduct: row.insurance_monthly_deduct ?? 0,
      status: row.status ?? 'active'
    });
    dateRange.value = row.effective_from || row.effective_to ? [row.effective_from || '', row.effective_to || ''] : null;
  } else {
    Object.assign(form, {
      _id: '',
      name: '',
      company_id: '',
      hourly_rate_daily: 0,
      daily_rate_daily: 0,
      pay_hours_daily: 8,
      night_hourly_rate_daily: 0,
      night_daily_rate_daily: 0,
      hourly_rate_monthly: 0,
      daily_rate_monthly: 0,
      pay_hours_monthly: 8,
      night_hourly_rate_monthly: 0,
      night_daily_rate_monthly: 0,
      insurance_daily_deduct: 0,
      insurance_monthly_deduct: 0,
      status: 'active'
    });
    dateRange.value = null;
  }
  dialogVisible.value = true;
}

async function handleSubmit() {
  if (!formRef.value) return;
  await formRef.value.validate(async (valid) => {
    if (!valid) return;
    submitting.value = true;
    try {
      const payload = {
        ...form,
        effective_from: dateRange.value?.[0],
        effective_to: dateRange.value?.[1]
      };
      if (form._id) {
        await ratePlansApi.update(form._id, payload);
        ElMessage.success('更新成功');
      } else {
        await ratePlansApi.create(payload);
        ElMessage.success('创建成功');
      }
      dialogVisible.value = false;
      loadData(true);
    } catch (err: any) {
      ElMessage.error(err?.message || '保存失败');
    } finally {
      submitting.value = false;
    }
  });
}

function handleDelete(row: RatePlan) {
  ElMessageBox.confirm(`确定删除方案「${row.name}」吗？`, '提示', { type: 'warning' })
    .then(async () => {
      await ratePlansApi.delete(row._id!);
      ElMessage.success('删除成功');
      loadData();
    })
    .catch(() => {});
}
</script>

<style scoped lang="scss">
.rate-plans-page {
  .search-card {
    margin-bottom: 16px;
  }

  .pagination-wrapper {
    margin-top: 16px;
    display: flex;
    justify-content: flex-end;
  }

  .section-fields {
    display: grid;
    grid-template-columns: repeat(2, 1fr);
    gap: 0 16px;
  }

  .inline-inputs {
    display: flex;
    align-items: center;
    gap: 8px;
    flex-wrap: wrap;
  }

  .input-suffix {
    color: #909399;
    font-size: 12px;
    white-space: nowrap;
  }
}
</style>
