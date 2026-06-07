<template>
  <div class="project-reimbursements-page">
    <el-card class="search-card">
      <div class="search-toolbar">
        <el-form :model="searchForm" inline>
          <el-form-item label="企业">
            <el-select v-model="searchForm.company_id" clearable filterable placeholder="选择企业" style="width: 220px;">
              <el-option v-for="company in companies" :key="company._id" :label="company.name" :value="company._id" />
            </el-select>
          </el-form-item>
          <el-form-item label="岗位">
            <el-select v-model="searchForm.job_id" clearable filterable placeholder="选择岗位" style="width: 220px;">
              <el-option v-for="job in filteredJobs" :key="job._id" :label="job.position" :value="job._id" />
            </el-select>
          </el-form-item>
          <el-form-item label="状态">
            <el-select v-model="searchForm.status" clearable placeholder="选择状态" style="width: 160px;">
              <el-option label="待审批" value="pending" />
              <el-option label="已通过" value="approved" />
              <el-option label="已删除" value="deleted" />
            </el-select>
          </el-form-item>
          <el-form-item label="提报日期">
            <el-date-picker
              v-model="searchForm.reported_date"
              type="date"
              value-format="YYYY-MM-DD"
              placeholder="选择日期"
              clearable
            />
          </el-form-item>
          <el-form-item label="关键词">
            <el-input v-model="searchForm.keyword" clearable placeholder="企业 / 岗位 / 报销至 / 说明" style="width: 260px;" />
          </el-form-item>
          <el-form-item>
            <el-button type="primary" @click="handleSearch">查询</el-button>
            <el-button @click="handleReset">重置</el-button>
          </el-form-item>
        </el-form>
        <div v-if="tableData.length" class="summary-wrapper">
          <div class="summary-item total-count">
            <div class="label">总笔数</div>
            <div class="value">{{ tableData.length }} 笔</div>
          </div>
          <div class="summary-divider" />
          <div class="summary-item total-amount">
            <div class="label">报销总金额</div>
            <div class="value">¥{{ totalReimbursementAmount }}</div>
          </div>
        </div>
      </div>
    </el-card>

    <div class="toolbar">
      <el-button type="primary" :icon="Plus" @click="openCreateDialog">新增报销</el-button>
    </div>

    <el-card>
      <el-table v-loading="loading" :data="tableData" stripe>
        <el-table-column prop="company_name" label="企业" min-width="180" />
        <el-table-column prop="job_name" label="岗位" min-width="180" />
        <el-table-column label="工作日期" width="120">
          <template #default="{ row }">
            {{ row.work_date || row.period_start || '-' }}
          </template>
        </el-table-column>
        <el-table-column prop="work_quantity" label="工时/吨位" width="120">
          <template #default="{ row }">{{ formatNumber(row.work_quantity) }}</template>
        </el-table-column>
        <el-table-column prop="reimbursement_to_user_name" label="报销至" width="140" />
        <el-table-column prop="reimbursement_amount" label="报销金额" width="130">
          <template #default="{ row }">¥{{ formatMoney(row.reimbursement_amount) }}</template>
        </el-table-column>
        <el-table-column prop="created_at" label="提报时间" width="190">
          <template #default="{ row }">
            <BeijingDateTime :value="row.created_at" />
          </template>
        </el-table-column>
        <el-table-column prop="remark" label="其他说明" min-width="220" show-overflow-tooltip />
        <el-table-column label="状态" width="100">
          <template #default="{ row }">
            <StatusTag :status="row.status" :map="REIMBURSEMENT_STATUS_MAP" />
          </template>
        </el-table-column>
        <el-table-column label="操作" width="220" fixed="right">
          <template #default="{ row }">
            <el-button link type="primary" @click="openEditDialog(row)" v-if="row.status === 'pending'">编辑</el-button>
            <el-button link type="success" @click="handleApprove(row)" v-if="row.status === 'pending'">审批通过</el-button>
            <el-button link type="danger" @click="handleDelete(row)" v-if="row.status === 'pending'">软删除</el-button>
          </template>
        </el-table-column>
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

    <el-dialog v-model="dialogVisible" :title="isEdit ? '编辑项目报销' : '新增项目报销'" width="620px">
      <el-form ref="formRef" :model="form" :rules="rules" label-width="100px">
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
        <el-form-item label="工作日期" prop="work_date">
          <el-date-picker
            v-model="form.work_date"
            type="date"
            value-format="YYYY-MM-DD"
            placeholder="选择工作日期"
            style="width: 100%;"
          />
        </el-form-item>
        <el-form-item label="工时/吨位" prop="work_quantity">
          <el-input-number v-model="form.work_quantity" :min="0" :precision="2" style="width: 100%;" />
        </el-form-item>
        <el-form-item label="报销金额" prop="reimbursement_amount">
          <el-input-number v-model="form.reimbursement_amount" :min="0" :precision="2" style="width: 100%;" />
        </el-form-item>
        <el-form-item label="报销至" prop="reimbursement_to_user_id">
          <el-select v-model="form.reimbursement_to_user_id" filterable placeholder="选择用户" style="width: 100%;" @change="handleReimbursementUserChange">
            <el-option v-for="user in reimbursementUsers" :key="user._id" :label="user.real_name || user.name" :value="user._id" />
          </el-select>
        </el-form-item>
        <el-form-item label="其他说明">
          <el-input v-model="form.remark" type="textarea" :rows="3" placeholder="请输入其他说明" />
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
import { ElMessage, ElMessageBox, type FormInstance, type FormRules } from 'element-plus';
import { Plus } from '@element-plus/icons-vue';
import { companiesApi } from '@/api/modules/companies';
import { jobsApi } from '@/api/modules/jobs';
import { usersApi } from '@/api/modules/users';
import { projectReimbursementsApi } from '@/api/modules/projectReimbursements';
import type { Company, Job, ProjectReimbursement, UserInfo } from '@/api/types';
import { usePagination } from '@/composables/usePagination';
import { useTableLoading } from '@/composables/useTableLoading';
import { REIMBURSEMENT_STATUS_MAP } from '@/utils/status';
import { formatDate, getTodayBeijing } from '@/utils/format';
import BeijingDateTime from '@/components/common/BeijingDateTime.vue';

const { loading, withLoading } = useTableLoading();
const submitting = ref(false);
const dialogVisible = ref(false);
const isEdit = ref(false);
const editingId = ref('');
const formRef = ref<FormInstance>();

const companies = ref<Company[]>([]);
const jobs = ref<Job[]>([]);
const reimbursementUsers = ref<UserInfo[]>([]);
const tableData = ref<ProjectReimbursement[]>([]);

const searchForm = reactive({
  company_id: '',
  job_id: '',
  status: '',
  keyword: '',
  reported_date: getTodayBeijing()
});

const { pagination, onSizeChange, onCurrentChange } = usePagination(loadData);

const form = reactive({
  company_id: '',
  company_name: '',
  job_id: '',
  job_name: '',
  work_date: '',
  work_quantity: 0,
  reimbursement_amount: 0,
  reimbursement_to_user_id: '',
  reimbursement_to_user_name: '',
  remark: ''
});

const rules: FormRules = {
  company_id: [{ required: true, message: '请选择企业', trigger: 'change' }],
  job_id: [{ required: true, message: '请选择岗位', trigger: 'change' }],
  work_date: [{ required: true, message: '请选择工作日期', trigger: 'change' }],
  work_quantity: [{ required: true, message: '请输入工时/吨位', trigger: 'blur' }],
  reimbursement_amount: [{ required: true, message: '请输入报销金额', trigger: 'blur' }],
  reimbursement_to_user_id: [{ required: true, message: '请选择报销至', trigger: 'change' }]
};

const filteredJobs = computed(() => {
  if (!searchForm.company_id) return jobs.value;
  return jobs.value.filter((job) => job.company_id === searchForm.company_id);
});

const dialogJobs = computed(() => {
  if (!form.company_id) return jobs.value;
  return jobs.value.filter((job) => job.company_id === form.company_id);
});

function formatMoney(value?: number) {
  return (Number(value) || 0).toFixed(2);
}

function formatNumber(value?: number) {
  return (Number(value) || 0).toFixed(2);
}

const totalReimbursementAmount = computed(() => {
  return tableData.value.reduce((sum, row) => sum + (Number(row.reimbursement_amount) || 0), 0).toFixed(2);
});

async function loadCompanies() {
  const result = await companiesApi.getList({ page: 1, pageSize: 500 });
  companies.value = result.list || [];
}

async function loadJobs() {
  const result = await jobsApi.getList({ page: 1, pageSize: 1000 });
  jobs.value = result.list || [];
}

async function loadReimbursementUsers() {
  const result = await usersApi.getList({ page: 1, pageSize: 1000 });
  reimbursementUsers.value = (result.list || []).filter((user) => user.user_type !== 'candidate' && user.role !== 'external' && user.role !== 'candidate' && user.role !== 'employee');
}

async function loadData() {
  await withLoading(async () => {
    const result = await projectReimbursementsApi.getList({
      page: pagination.page,
      pageSize: 1000
    });
    let list = result.list || [];

    if (searchForm.company_id) {
      list = list.filter((item: any) => item.company_id === searchForm.company_id);
    }

    if (searchForm.job_id) {
      list = list.filter((item: any) => item.job_id === searchForm.job_id);
    }

    if (searchForm.status) {
      list = list.filter((item: any) => item.status === searchForm.status);
    } else {
      list = list.filter((item: any) => item.status !== 'deleted');
    }

    if (searchForm.keyword) {
      const keyword = searchForm.keyword.trim().toLowerCase();
      list = list.filter((item: any) => [
        item.company_name,
        item.job_name,
        item.reimbursement_to_user_name,
        item.remark
      ].some((field) => String(field || '').toLowerCase().includes(keyword)));
    }

    if (searchForm.reported_date) {
      const targetDate = searchForm.reported_date;
      list = list.filter((item: any) => {
        if (!item.created_at) return false;
        const dateStr = formatDate(item.created_at, 'YYYY-MM-DD');
        return dateStr === targetDate;
      });
    }

    pagination.total = list.length;
    const start = (pagination.page - 1) * pagination.pageSize;
    tableData.value = list.slice(start, start + pagination.pageSize);
  });
}

function handleSearch() {
  pagination.page = 1;
  loadData();
}

function handleReset() {
  searchForm.company_id = '';
  searchForm.job_id = '';
  searchForm.status = '';
  searchForm.keyword = '';
  searchForm.reported_date = getTodayBeijing();
  handleSearch();
}

function resetForm() {
  Object.assign(form, {
    company_id: '',
    company_name: '',
    job_id: '',
    job_name: '',
    work_date: '',
    work_quantity: 0,
    reimbursement_amount: 0,
    reimbursement_to_user_id: '',
    reimbursement_to_user_name: '',
    remark: ''
  });
}

function handleCompanyChange() {
  form.job_id = '';
  form.job_name = '';
  form.company_name = companies.value.find((item) => item._id === form.company_id)?.name || '';
}

function handleJobChange() {
  form.job_name = jobs.value.find((item) => item._id === form.job_id)?.position || '';
}

function handleReimbursementUserChange() {
  const user = reimbursementUsers.value.find((item) => item._id === form.reimbursement_to_user_id);
  form.reimbursement_to_user_name = user?.real_name || user?.name || '';
}

function openCreateDialog() {
  isEdit.value = false;
  editingId.value = '';
  resetForm();
  dialogVisible.value = true;
}

function openEditDialog(row: ProjectReimbursement) {
  if (row.status === 'approved') {
    ElMessage.warning('审核通过的数据禁止修改');
    return;
  }
  if (row.status === 'deleted') {
    ElMessage.warning('已删除的数据不能编辑');
    return;
  }

  isEdit.value = true;
  editingId.value = row._id;
  Object.assign(form, {
    company_id: row.company_id,
    company_name: row.company_name || '',
    job_id: row.job_id || '',
    job_name: row.job_name || '',
    work_date: row.work_date || row.period_start || '',
    work_quantity: Number(row.work_quantity) || 0,
    reimbursement_amount: Number(row.reimbursement_amount) || 0,
    reimbursement_to_user_id: row.reimbursement_to_user_id,
    reimbursement_to_user_name: row.reimbursement_to_user_name || '',
    remark: row.remark || ''
  });
  dialogVisible.value = true;
}

async function handleSubmit() {
  if (!formRef.value) return;
  await formRef.value.validate(async (valid) => {
    if (!valid) return;
    submitting.value = true;
    try {
      const payload = {
        company_id: form.company_id,
        company_name: form.company_name,
        job_id: form.job_id,
        job_name: form.job_name,
        work_date: form.work_date,
        period_start: form.work_date,
        period_end: form.work_date,
        work_quantity: form.work_quantity,
        reimbursement_amount: form.reimbursement_amount,
        reimbursement_to_user_id: form.reimbursement_to_user_id,
        reimbursement_to_user_name: form.reimbursement_to_user_name,
        remark: form.remark
      };

      if (isEdit.value) {
        await projectReimbursementsApi.update(editingId.value, payload);
        ElMessage.success('更新成功');
      } else {
        await projectReimbursementsApi.create(payload);
        ElMessage.success('创建成功');
      }

      dialogVisible.value = false;
      await loadData();
    } catch (err: any) {
      ElMessage.error(err?.message || '保存失败');
    } finally {
      submitting.value = false;
    }
  });
}

async function handleApprove(row: ProjectReimbursement) {
  try {
    await ElMessageBox.confirm('确认审批通过这条项目报销记录？', '提示', { type: 'success' });
    await projectReimbursementsApi.approve(row._id);
    ElMessage.success('审批通过');
    await loadData();
  } catch {}
}

async function handleDelete(row: ProjectReimbursement) {
  try {
    await ElMessageBox.confirm('确认软删除这条项目报销记录？', '提示', { type: 'warning' });
    await projectReimbursementsApi.softDelete(row._id);
    ElMessage.success('删除成功');
    await loadData();
  } catch {}
}

onMounted(async () => {
  await Promise.all([
    loadCompanies(),
    loadJobs(),
    loadReimbursementUsers()
  ]);
  await loadData();
});
</script>

<style scoped lang="scss">
.project-reimbursements-page {
  .search-card {
    margin-bottom: 16px;
  }

  .toolbar {
    margin-bottom: 16px;
    display: flex;
    justify-content: flex-end;
  }

  .search-toolbar {
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

    &.total-amount .value {
      color: #f56c6c;
    }
  }

  .summary-divider {
    width: 1px;
    height: 38px;
    background: #e4e7ed;
  }

  @media (max-width: 960px) {
    .search-toolbar {
      flex-direction: column;
      align-items: flex-start;
    }

    .summary-wrapper {
      align-self: stretch;
      width: 100%;
      justify-content: flex-start;
    }
  }

  .pagination-wrapper {
    margin-top: 16px;
    display: flex;
    justify-content: flex-end;
  }
}
</style>
