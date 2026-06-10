<template>
  <div class="advance-page">
    <el-card class="search-card">
      <el-form :model="searchForm" inline>
        <el-form-item label="员工">
          <el-input v-model="searchForm.employee_name" placeholder="搜索员工姓名" clearable />
        </el-form-item>
        <el-form-item label="状态">
          <el-select v-model="searchForm.status" placeholder="选择状态" clearable style="width: 220px;">
            <el-option label="待审核" value="pending" />
            <el-option label="已通过" value="approved" />
            <el-option label="已打款" value="paid" />
            <el-option label="已驳回" value="rejected" />
          </el-select>
        </el-form-item>
        <el-form-item>
          <el-button type="primary" @click="handleSearch">搜索</el-button>
          <el-button @click="handleReset">重置</el-button>
        </el-form-item>
      </el-form>
    </el-card>

    <div class="toolbar">
      <el-button type="primary" :icon="Plus" @click="handleAdd">新增申请</el-button>
    </div>

    <el-card>
      <el-table v-loading="loading" :data="tableData" stripe>
        <el-table-column prop="employee_name" label="员工" width="100" />
        <el-table-column prop="employee_no" label="工号" width="120" />
        <el-table-column prop="amount" label="预支金额" width="120">
          <template #default="{ row }">¥{{ row.amount?.toFixed(2) }}</template>
        </el-table-column>
        <el-table-column prop="apply_reason" label="申请原因" min-width="150" />
        <el-table-column prop="status" label="状态" width="100">
          <template #default="{ row }">
            <el-tag :type="getStatusType(row.status)">{{ getStatusText(row.status) }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="apply_time" label="申请时间" width="190">
          <template #default="{ row }"><BeijingDateTime :value="row.apply_time" /></template>
        </el-table-column>
        <el-table-column prop="pay_time" label="打款时间" width="190">
          <template #default="{ row }"><BeijingDateTime :value="row.pay_time" /></template>
        </el-table-column>
        <el-table-column label="操作" width="180" fixed="right">
          <template #default="{ row }">
            <el-button link type="primary" @click="handleView(row)">详情</el-button>
            <el-button link type="success" @click="handleApprove(row)" v-if="row.status === 'pending'">
              通过
            </el-button>
            <el-button link type="danger" @click="handleReject(row)" v-if="row.status === 'pending'">
              驳回
            </el-button>
            <el-button link type="primary" @click="handlePay(row)" v-if="row.status === 'approved'">
              打款
            </el-button>
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

    <!-- 新增申请对话框 -->
    <el-dialog v-model="dialogVisible" title="预支申请" width="500px">
      <el-form ref="formRef" :model="form" :rules="rules" label-width="100px">
        <el-form-item label="员工" prop="employee_id">
          <el-select v-model="form.employee_id" filterable placeholder="选择员工">
            <el-option v-for="emp in employees" :key="emp._id" :label="emp.name" :value="emp._id" />
          </el-select>
        </el-form-item>
        <el-form-item label="预支金额" prop="amount">
          <el-input-number v-model="form.amount" :min="1" :max="maxAmount" />
          <div class="form-tip">最高可预支 ¥{{ maxAmount }}</div>
        </el-form-item>
        <el-form-item label="申请原因" prop="reason">
          <el-input v-model="form.reason" type="textarea" :rows="3" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="dialogVisible = false">取消</el-button>
        <el-button type="primary" :loading="submitting" @click="handleSubmit">提交</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, computed, onMounted } from 'vue';
import { ElMessage, ElMessageBox, type FormInstance, type FormRules } from 'element-plus';
import { Plus } from '@element-plus/icons-vue';
import { advancesApi } from '@/api/modules/advances';
import { employeesApi } from '@/api/modules/employees';
import { getCurrentMonthBeijing, getStatusText, getStatusType, getTodayBeijing } from '@/utils/format';
import type { AdvanceRecord, Employee } from '@/api/types';
import { usePagination } from '@/composables/usePagination';
import { useTableLoading } from '@/composables/useTableLoading';
import BeijingDateTime from '@/components/common/BeijingDateTime.vue';

const { loading, withLoading } = useTableLoading();
const submitting = ref(false);
const dialogVisible = ref(false);
const formRef = ref<FormInstance>();
const employees = ref<Employee[]>([]);
const tableData = ref<AdvanceRecord[]>([]);
const systemConfig = ref({
  advance_limit_percent: 50,
  advance_max_amount: 5000,
  advance_monthly_times: 2,
  advance_allow_cross_month: false
});

const searchForm = reactive({
  employee_name: '',
  status: ''
});

const { pagination, onSizeChange, onCurrentChange } = usePagination(loadData);

const form = reactive({
  employee_id: '',
  amount: 0,
  amount_approved: 0,
  reason: ''
});

const maxAmount = computed(() => {
  return systemConfig.value.advance_max_amount || 5000;
});

const rules: FormRules = {
  employee_id: [{ required: true, message: '请选择员工', trigger: 'change' }],
  amount: [{ required: true, message: '请输入预支金额', trigger: 'blur' }]
};

async function loadEmployees() {
  try {
    const result = await employeesApi.getList({ page: 1, pageSize: 100 });
    employees.value = result.list;
  } catch (err) {
    console.error('加载员工列表失败:', err);
  }
}

async function loadData() {
  await withLoading(async () => {
    const result = await advancesApi.getList({
      ...searchForm,
      page: pagination.page,
      pageSize: pagination.pageSize
    });
    tableData.value = (result.list || []).map((item: any) => ({
      ...item,
      amount: item.amount ?? item.apply_amount
    }));
    pagination.total = result.total;
  });
}

function handleSearch() {
  pagination.page = 1;
  loadData();
}

function handleReset() {
  searchForm.employee_name = '';
  searchForm.status = '';
  handleSearch();
}

function handleAdd() {
  form.employee_id = '';
  form.amount = 0;
  form.reason = '';
  dialogVisible.value = true;
}

function handleView(row: any) {
  ElMessage.info(`查看预支详情: ${row._id}`);
}

async function handleApprove(row: any) {
  try {
    await ElMessageBox.confirm('审核通过该预支申请？', '提示', { type: 'success' });
    await advancesApi.approve(row._id, true);
    ElMessage.success('审核通过');
    loadData();
  } catch {}
}

async function handleReject(row: any) {
  try {
    await ElMessageBox.confirm('驳回该预支申请？', '提示', { type: 'warning' });
    await advancesApi.reject(row._id, '驳回');
    ElMessage.success('已驳回');
    loadData();
  } catch {}
}

async function handlePay(row: any) {
  try {
    await ElMessageBox.confirm('确认已打款？', '提示', { type: 'success' });
    await advancesApi.pay(row._id, { pay_date: getTodayBeijing() });
    ElMessage.success('打款成功');
    loadData();
  } catch {}
}

async function handleSubmit() {
  if (!formRef.value) return;
  await formRef.value.validate(async (valid) => {
    if (!valid) return;
    // 次数校验
    const currentMonth = getCurrentMonthBeijing();
    const timesThisMonth = tableData.value.filter((item: any) =>
      item.employee_id === form.employee_id &&
      item.created_at?.startsWith(currentMonth) &&
      item.status !== 'rejected'
    ).length;
    if (timesThisMonth >= (systemConfig.value.advance_monthly_times || 2)) {
      ElMessage.error(`本月预支次数已达上限(${systemConfig.value.advance_monthly_times}次)`);
      return;
    }
    if (form.amount > maxAmount.value) {
      ElMessage.error(`金额超出上限（¥${maxAmount.value}）`);
      return;
    }
    submitting.value = true;
    try {
      await advancesApi.apply(form);
      ElMessage.success('申请提交成功');
      dialogVisible.value = false;
      loadData();
    } catch (err) {
      console.error('提交失败:', err);
    } finally {
      submitting.value = false;
    }
  });
}

onMounted(() => {
  loadConfig();
  loadEmployees();
  loadData();
});

function loadConfig() {
  try {
    const saved = localStorage.getItem('hr3_system_config');
    if (saved) {
      Object.assign(systemConfig.value, JSON.parse(saved));
    }
  } catch (err) {
    console.warn('读取系统配置失败', err);
  }
}
</script>

<style scoped lang="scss">
.advance-page {
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

  .form-tip {
    font-size: 12px;
    color: #999;
    margin-top: 4px;
  }
}
</style>
