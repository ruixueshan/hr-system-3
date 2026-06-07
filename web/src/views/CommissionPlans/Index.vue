<template>
  <div class="commission-page">
    <el-card class="search-card">
      <el-form :model="searchForm" inline>
        <el-form-item label="方案名称">
          <el-input v-model="searchForm.keyword" placeholder="搜索方案" clearable />
        </el-form-item>
        <el-form-item label="企业">
          <CompanySelect v-model="searchForm.company_id" placeholder="全部企业" clearable width="200px" />
        </el-form-item>
        <el-form-item label="类型">
          <el-select v-model="searchForm.scope" placeholder="全部" clearable style="width: 140px;">
            <el-option label="模板" value="template" />
            <el-option label="个人" value="personal" />
          </el-select>
        </el-form-item>
        <el-form-item label="状态">
          <el-select v-model="searchForm.status" placeholder="全部" clearable style="width: 140px;">
            <el-option label="启用" value="active" />
            <el-option label="停用" value="inactive" />
          </el-select>
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
        <el-table-column prop="company_name" label="企业" min-width="150" />
        <el-table-column prop="job_name" label="岗位" min-width="140" />
        <el-table-column prop="scope" label="类型" width="100">
          <template #default="{ row }">
            <el-tag :type="row.scope === 'personal' ? 'warning' : 'info'">
              {{ row.scope === 'personal' ? '个人' : '模板' }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="mode" label="方式" width="140">
          <template #default="{ row }">
            <span v-if="row.mode === 'hour_amount'">时长 * 单价</span>
            <span v-else>出勤比例 * 月额</span>
          </template>
        </el-table-column>
        <el-table-column label="提成值" width="160">
          <template #default="{ row }">
            <span v-if="row.mode === 'hour_amount'">{{ row.hour_amount || 0 }} 元/小时</span>
            <span v-else>{{ row.monthly_amount || 0 }} 元/月</span>
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

    <el-dialog v-model="dialogVisible" :title="dialogTitle" width="620px">
      <el-form :model="form" :rules="rules" ref="formRef" label-width="110px">
        <el-form-item label="方案名称" prop="name">
          <el-input v-model="form.name" placeholder="如：普工提成模板" />
        </el-form-item>
        <el-form-item label="类型">
          <el-radio-group v-model="form.scope">
            <el-radio label="template">模板</el-radio>
            <el-radio label="personal">个人</el-radio>
          </el-radio-group>
        </el-form-item>
        <el-form-item label="企业" prop="company_id">
          <CompanySelect v-model="form.company_id" placeholder="选择企业" clearable @change="handleCompanyChange" />
        </el-form-item>
        <el-form-item label="岗位">
          <el-select v-model="form.job_id" placeholder="选择岗位" filterable clearable>
            <el-option v-for="j in filteredJobs" :key="j._id" :label="j.position" :value="j._id" />
          </el-select>
        </el-form-item>
        <el-form-item v-if="form.scope === 'personal'" label="人员姓名">
          <el-input v-model="form.employee_name" placeholder="填写员工姓名" />
        </el-form-item>
        <el-form-item label="提成方式">
          <el-radio-group v-model="form.mode">
            <el-radio label="hour_amount">时长 * 单价</el-radio>
            <el-radio label="attendance_prorate">出勤比例 * 月额</el-radio>
          </el-radio-group>
        </el-form-item>
        <el-form-item v-if="form.mode === 'hour_amount'" label="单价(元/小时)" prop="hour_amount">
          <el-input-number v-model="form.hour_amount" :min="0" :precision="2" />
        </el-form-item>
        <el-form-item v-else label="月额(元)" prop="monthly_amount">
          <el-input-number v-model="form.monthly_amount" :min="0" :precision="2" />
        </el-form-item>
        <el-form-item label="备注">
          <el-input v-model="form.remark" type="textarea" :rows="2" />
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
import { commissionPlansApi } from '@/api/modules/commissionPlans';
import { companiesApi } from '@/api/modules/companies';
import { jobsApi } from '@/api/modules/jobs';
import type { Company, Job } from '@/api/types';
import { usePagination } from '@/composables/usePagination';
import { useTableLoading } from '@/composables/useTableLoading';

const { loading, withLoading } = useTableLoading();
const tableData = ref<any[]>([]);
const companies = ref<Company[]>([]);
const jobs = ref<Job[]>([]);
const dialogVisible = ref(false);
const submitting = ref(false);
const formRef = ref<FormInstance>();
const form = reactive<any>({
  _id: '',
  name: '',
  scope: 'template',
  company_id: '',
  company_name: '',
  job_id: '',
  job_name: '',
  employee_name: '',
  mode: 'hour_amount',
  hour_amount: 5,
  monthly_amount: 0,
  remark: '',
  status: 'active'
});

const searchForm = reactive({
  keyword: '',
  company_id: '',
  scope: '',
  status: ''
});

const { pagination, onSizeChange, onCurrentChange } = usePagination(loadData);

const dialogTitle = computed(() => (form._id ? '编辑提成方案' : '新增提成方案'));
const filteredJobs = computed(() => {
  if (!form.company_id) return jobs.value;
  return jobs.value.filter(j => j.company_id === form.company_id);
});

const rules: FormRules = {
  name: [{ required: true, message: '请输入方案名称', trigger: 'blur' }],
  company_id: [{ required: false }],
  hour_amount: [{ required: () => form.mode === 'hour_amount', message: '请输入时长单价', trigger: 'blur' }],
  monthly_amount: [{ required: () => form.mode === 'attendance_prorate', message: '请输入月度金额', trigger: 'blur' }]
};

onMounted(() => {
  loadCompanies();
  loadJobs();
  loadData();
});

async function loadCompanies() {
  try {
    const res = await companiesApi.getList({ page: 1, pageSize: 200 });
    companies.value = res.list;
  } catch (err) {
    console.error('加载企业失败', err);
  }
}

async function loadJobs() {
  try {
    const res = await jobsApi.getList({ page: 1, pageSize: 500 });
    jobs.value = res.list as any;
  } catch (err) {
    console.error('加载岗位失败', err);
  }
}

async function loadData(resetPage = false) {
  if (resetPage) pagination.page = 1;
  await withLoading(async () => {
    const res = await commissionPlansApi.getList({
      page: pagination.page,
      pageSize: pagination.pageSize,
      keyword: searchForm.keyword || undefined,
      company_id: searchForm.company_id || undefined,
      scope: searchForm.scope || undefined,
      status: searchForm.status || undefined
    });
    const companyMap = new Map(companies.value.map(c => [c._id, c.name]));
    const jobMap = new Map(jobs.value.map(j => [j._id, j.position]));
    tableData.value = (res.list || []).map((item: any) => ({
      ...item,
      company_name: item.company_name || companyMap.get(item.company_id) || '',
      job_name: item.job_name || jobMap.get(item.job_id) || ''
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
  searchForm.scope = '';
  searchForm.status = '';
  handleSearch();
}

function openDialog(row?: any) {
  if (row) {
    Object.assign(form, row);
  } else {
    Object.assign(form, {
      _id: '',
      name: '',
      scope: 'template',
      company_id: '',
      company_name: '',
      job_id: '',
      job_name: '',
      employee_name: '',
      mode: 'hour_amount',
      hour_amount: 5,
      monthly_amount: 0,
      remark: '',
      status: 'active'
    });
  }
  dialogVisible.value = true;
}

function handleCompanyChange(val: string) {
  if (!val) {
    form.job_id = '';
    return;
  }
  // 如果已有岗位但不属于当前企业，清空
  const job = jobs.value.find(j => j._id === form.job_id);
  if (job && job.company_id !== val) form.job_id = '';
}

async function handleSubmit() {
  if (!formRef.value) return;
  await formRef.value.validate(async (valid) => {
    if (!valid) return;
    submitting.value = true;
    try {
      const companyName = companies.value.find(c => c._id === form.company_id)?.name || '';
      const job = jobs.value.find(j => j._id === form.job_id);
      const payload = {
        ...form,
        company_name: companyName,
        job_name: job?.position || form.job_name
      };
      if (form._id) {
        await commissionPlansApi.update(form._id, payload);
        ElMessage.success('更新成功');
      } else {
        await commissionPlansApi.create(payload);
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

function handleDelete(row: any) {
  ElMessageBox.confirm(`确定删除方案「${row.name}」吗？`, '提示', { type: 'warning' })
    .then(async () => {
      await commissionPlansApi.delete(row._id);
      ElMessage.success('删除成功');
      loadData();
    })
    .catch(() => {});
}
</script>

<style scoped lang="scss">
.commission-page {
  .search-card {
    margin-bottom: 16px;
  }

  .pagination-wrapper {
    margin-top: 16px;
    display: flex;
    justify-content: flex-end;
  }
}
</style>
