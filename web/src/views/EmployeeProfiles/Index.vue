<template>
  <div class="employee-profiles-page">
    <el-card class="search-card">
      <el-form :model="searchForm" inline>
        <el-form-item label="姓名/手机号/工号">
          <el-input v-model="searchForm.keyword" placeholder="搜索员工主档" clearable />
        </el-form-item>
        <el-form-item label="主档状态">
          <el-select v-model="searchForm.status" placeholder="选择状态" clearable style="width: 180px;">
            <el-option label="试用期" value="probation" />
            <el-option label="正式员工" value="regular" />
            <el-option label="已离职" value="resigned" />
          </el-select>
        </el-form-item>
        <el-form-item>
          <el-button type="primary" @click="handleSearch">搜索</el-button>
          <el-button @click="handleReset">重置</el-button>
        </el-form-item>
      </el-form>
    </el-card>

    <el-alert
      class="profile-hint"
      title="这里维护 Employee 员工主档；企业、岗位、工价方案、入职/离职关系请到“在职管理”处理。"
      type="info"
      :closable="false"
      show-icon
    />

    <el-card>
      <el-table v-loading="loading" :data="tableData" stripe>
        <el-table-column prop="employee_no" label="工号" width="160" />
        <el-table-column prop="name" label="姓名" width="120" />
        <el-table-column prop="phone" label="手机号" width="140" />
        <el-table-column prop="id_card" label="身份证号" min-width="180" show-overflow-tooltip />
        <el-table-column prop="active_company_names" label="当前在职企业" min-width="180" show-overflow-tooltip>
          <template #default="{ row }">{{ row.active_company_names || '-' }}</template>
        </el-table-column>
        <el-table-column prop="salary_payment_method" label="发薪方式" width="120">
          <template #default="{ row }">
            <el-tag v-if="row.salary_payment_method === 'WECHAT'" type="success" size="small">微信发薪</el-tag>
            <el-tag v-else-if="row.salary_payment_method === 'BANK'" type="primary" size="small">银行代发</el-tag>
            <span v-else>-</span>
          </template>
        </el-table-column>
        <el-table-column prop="bank_name" label="开户行" min-width="140" show-overflow-tooltip>
          <template #default="{ row }">{{ row.bank_name || '-' }}</template>
        </el-table-column>
        <el-table-column prop="bank_account" label="银行卡号" min-width="180" show-overflow-tooltip>
          <template #default="{ row }">{{ row.bank_account || '-' }}</template>
        </el-table-column>
        <el-table-column prop="bank_account_name" label="持卡人姓名" width="120">
          <template #default="{ row }">{{ row.bank_account_name || '-' }}</template>
        </el-table-column>
        <el-table-column prop="relation_count" label="入职次数" width="100" />
        <el-table-column prop="created_at" label="创建时间" width="190">
          <template #default="{ row }"><BeijingDateTime :value="row.created_at" /></template>
        </el-table-column>
        <el-table-column label="操作" width="120" fixed="right">
          <template #default="{ row }">
            <el-button link type="primary" @click="openEdit(row)">编辑主档</el-button>
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

    <el-dialog v-model="editVisible" title="编辑员工主档" width="560px">
      <el-form :model="editForm" label-width="110px">
        <el-form-item label="工号">
          <el-input v-model="editForm.employee_no" placeholder="请输入工号" />
        </el-form-item>
        <el-form-item label="姓名">
          <el-input v-model="editForm.name" placeholder="请输入姓名" />
        </el-form-item>
        <el-form-item label="手机号">
          <el-input v-model="editForm.phone" placeholder="请输入手机号" />
        </el-form-item>
        <el-form-item label="身份证号">
          <el-input v-model="editForm.id_card" placeholder="请输入身份证号" />
        </el-form-item>
        <el-form-item label="性别">
          <el-radio-group v-model="editForm.gender">
            <el-radio :label="1">男</el-radio>
            <el-radio :label="0">女</el-radio>
          </el-radio-group>
        </el-form-item>
        <el-form-item label="紧急联系人">
          <el-input v-model="editForm.emergency_contact" placeholder="请输入紧急联系人" />
        </el-form-item>
        <el-form-item label="紧急联系电话">
          <el-input v-model="editForm.emergency_phone" placeholder="请输入紧急联系电话" />
        </el-form-item>
        <el-form-item label="银行卡开户行">
          <el-input v-model="editForm.bank_name" placeholder="请输入开户行" />
        </el-form-item>
        <el-form-item label="银行卡号">
          <el-input v-model="editForm.bank_account" placeholder="请输入银行卡号" />
        </el-form-item>
        <el-form-item label="持卡人姓名">
          <el-input v-model="editForm.bank_account_name" placeholder="请输入持卡人姓名" />
        </el-form-item>
        <el-form-item label="主档状态">
          <el-select v-model="editForm.status" style="width: 180px;">
            <el-option label="试用期" value="probation" />
            <el-option label="正式员工" value="regular" />
            <el-option label="已离职" value="resigned" />
          </el-select>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="editVisible = false">取消</el-button>
        <el-button type="primary" :loading="saving" @click="saveEdit">保存</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { reactive, ref, onMounted } from 'vue';
import { ElMessage } from 'element-plus';
import { employeesApi } from '@/api/modules/employees';
import type { Employee } from '@/api/types';
import { formatDate as formatDateUtil } from '@/utils/format';
import BeijingDateTime from '@/components/common/BeijingDateTime.vue';
import { usePagination } from '@/composables/usePagination';
import { useTableLoading } from '@/composables/useTableLoading';

const { loading, withLoading } = useTableLoading();
const saving = ref(false);
const editVisible = ref(false);
const tableData = ref<Array<Employee & Record<string, any>>>([]);

const searchForm = reactive({
  keyword: '',
  status: ''
});

const { pagination, onSizeChange, onCurrentChange } = usePagination(loadData);

const editForm = reactive<Partial<Employee>>({
  _id: '',
  employee_no: '',
  name: '',
  phone: '',
  id_card: '',
  gender: 1,
  emergency_contact: '',
  emergency_phone: '',
  bank_name: '',
  bank_account: '',
  bank_account_name: '',
  status: 'probation'
});

function formatDate(date?: string) {
  if (!date) return '-';
  return formatDateUtil(date, 'YYYY-MM-DD HH:mm');
}

async function loadData() {
  await withLoading(async () => {
    const result = await employeesApi.getProfileList({
      page: pagination.page,
      pageSize: pagination.pageSize,
      keyword: searchForm.keyword || undefined,
      status: searchForm.status || undefined
    });
    tableData.value = result.list || [];
    pagination.total = result.total;
  });
}

function handleSearch() {
  pagination.page = 1;
  loadData();
}

function handleReset() {
  searchForm.keyword = '';
  searchForm.status = '';
  handleSearch();
}

function openEdit(row: Employee) {
  Object.assign(editForm, {
    _id: row._id,
    employee_no: row.employee_no || '',
    name: row.name || '',
    phone: row.phone || '',
    id_card: row.id_card || '',
    gender: row.gender ?? 1,
    emergency_contact: row.emergency_contact || '',
    emergency_phone: row.emergency_phone || '',
    bank_name: row.bank_name || '',
    bank_account: row.bank_account || '',
    bank_account_name: row.bank_account_name || '',
    status: row.status || 'probation'
  });
  editVisible.value = true;
}

async function saveEdit() {
  if (!editForm._id || !editForm.name) {
    ElMessage.error('姓名不能为空');
    return;
  }
  saving.value = true;
  try {
    await employeesApi.updateProfile(editForm._id, {
      employee_no: editForm.employee_no,
      name: editForm.name,
      phone: editForm.phone,
      id_card: editForm.id_card,
      gender: editForm.gender,
      emergency_contact: editForm.emergency_contact,
      emergency_phone: editForm.emergency_phone,
      bank_name: editForm.bank_name,
      bank_account: editForm.bank_account,
      bank_account_name: editForm.bank_account_name,
      status: editForm.status
    });
    ElMessage.success('员工主档已保存');
    editVisible.value = false;
    await loadData();
  } catch (err: any) {
    ElMessage.error(err?.message || '保存失败');
  } finally {
    saving.value = false;
  }
}

onMounted(loadData);
</script>

<style scoped lang="scss">
.employee-profiles-page {
  .search-card,
  .profile-hint {
    margin-bottom: 16px;
  }

  .pagination-wrapper {
    margin-top: 16px;
    display: flex;
    justify-content: flex-end;
  }
}
</style>
