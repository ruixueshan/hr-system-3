<template>
  <div class="user-management">
    <div class="toolbar">
      <el-input
        v-model="searchKeyword"
        placeholder="搜索姓名、手机号"
        clearable
        style="width: 240px"
        @keyup.enter="handleSearch"
      >
        <template #append>
          <el-button :icon="Search" @click="handleSearch" />
        </template>
      </el-input>
      <el-button type="primary" :icon="Plus" @click="openDialog()">新增用户</el-button>
      <el-button :icon="Refresh" @click="syncHrUsers">同步HR用户</el-button>
    </div>

    <el-table v-loading="loading" :data="tableData" stripe>
      <el-table-column prop="name" label="姓名" width="100" />
      <el-table-column prop="phone" label="手机号" width="120" />
      <el-table-column prop="role" label="角色" width="120">
        <template #default="{ row }">{{ getRoleText(row.role) }}</template>
      </el-table-column>
      <el-table-column prop="status" label="状态" width="100">
        <template #default="{ row }">
          <el-tag :type="row.status === 'normal' ? 'success' : 'danger'">
            {{ row.status === 'normal' ? '正常' : '禁用' }}
          </el-tag>
        </template>
      </el-table-column>
      <el-table-column label="创建时间" width="190">
        <template #default="{ row }">
          <BeijingDateTime :value="row.created_at || row.create_time || row.createTime" format="YYYY-MM-DD" />
        </template>
      </el-table-column>
      <el-table-column label="操作" width="120" fixed="right">
        <template #default="{ row }">
          <el-button link type="primary" @click="openDialog(row)">编辑</el-button>
          <el-button link type="primary" @click="resetPassword(row)">重置密码</el-button>
        </template>
      </el-table-column>
    </el-table>

    <div class="pagination-wrapper">
      <el-pagination
        v-model:current-page="pagination.page"
        v-model:page-size="pagination.pageSize"
        :total="pagination.total"
        layout="total, sizes, prev, pager, next, jumper"
        @current-change="onCurrentChange"
        @size-change="onSizeChange"
      />
    </div>

    <el-dialog v-model="dialogVisible" :title="isEdit ? '编辑用户' : '新增用户'" width="480px">
      <el-form :model="form" :rules="rules" ref="formRef" label-width="90px">
        <el-form-item label="姓名" prop="name">
          <el-input v-model="form.name" placeholder="请输入姓名" />
        </el-form-item>
        <el-form-item label="手机号" prop="phone">
          <el-input v-model="form.phone" placeholder="请输入手机号" />
        </el-form-item>
        <el-form-item label="角色" prop="role">
          <el-select v-model="form.role" placeholder="选择角色">
            <el-option label="总经理" value="gm" />
            <el-option label="副总经理" value="deputy" />
            <el-option label="HR专员" value="hr" />
            <el-option label="候选人" value="candidate" />
            <el-option label="外协" value="external" />
            <el-option label="财务" value="finance" />
          </el-select>
        </el-form-item>
        <el-form-item label="用户类型" prop="user_type">
          <el-select v-model="form.user_type" placeholder="选择类型">
            <el-option label="管理员" value="admin" />
            <el-option label="员工" value="employee" />
            <el-option label="候选人" value="candidate" />
          </el-select>
        </el-form-item>
        <el-form-item label="状态">
          <el-radio-group v-model="form.status">
            <el-radio label="normal">正常</el-radio>
            <el-radio label="disabled">禁用</el-radio>
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
import { ref, reactive, onMounted } from 'vue';
import { Plus, Refresh, Search } from '@element-plus/icons-vue';
import type { FormInstance, FormRules } from 'element-plus';
import { ElMessage } from 'element-plus';
import { usersApi } from '@/api/modules/users';
import type { UserInfo } from '@/api/types';
import { usePagination } from '@/composables/usePagination';
import { useTableLoading } from '@/composables/useTableLoading';
import BeijingDateTime from '@/components/common/BeijingDateTime.vue';

const { loading, withLoading } = useTableLoading();
const searchKeyword = ref('');
const tableData = ref<any[]>([]);
const dialogVisible = ref(false);
const submitting = ref(false);
const formRef = ref<FormInstance>();
const isEdit = ref(false);
const editingId = ref('');
const form = reactive<Partial<UserInfo>>({
  name: '',
  phone: '',
  role: 'hr',
  user_type: 'admin',
  status: 'normal'
});

const { pagination, onSizeChange, onCurrentChange } = usePagination(loadData);

const rules: FormRules = {
  name: [{ required: true, message: '请输入姓名', trigger: 'blur' }],
  phone: [{ required: true, message: '请输入手机号', trigger: 'blur' }],
  role: [{ required: true, message: '请选择角色', trigger: 'change' }],
  user_type: [{ required: true, message: '请选择类型', trigger: 'change' }]
};

function getRoleText(role: string) {
  const roleMap: Record<string, string> = {
    'gm': '总经理',
    'deputy': '副总经理',
    'hr': 'HR专员',
    'candidate': '候选人',
    'external': '外协',
    'finance': '财务'
  };
  return roleMap[role] || role;
}

onMounted(() => {
  loadData();
});

async function loadData() {
  await withLoading(async () => {
    const res = await usersApi.getList({ 
      page: pagination.page, 
      pageSize: pagination.pageSize,
      keyword: searchKeyword.value 
    });
    tableData.value = res.list;
    pagination.total = res.total;
  });
}

function handleSearch() {
  pagination.page = 1;
  loadData();
}

function openDialog(row?: any) {
  // 避免按钮点击事件对象被误当成“编辑行数据”
  if (row && typeof row === 'object' && !('target' in row)) {
    isEdit.value = true;
    editingId.value = row._id || row.id;
    Object.assign(form, {
      name: row.name || '',
      phone: row.phone || '',
      role: row.role || 'hr',
      user_type: row.user_type || 'admin',
      status: row.status || 'normal'
    });
  } else {
    isEdit.value = false;
    editingId.value = '';
    Object.assign(form, {
      name: '',
      phone: '',
      role: 'hr',
      user_type: 'admin',
      status: 'normal'
    });
  }
  dialogVisible.value = true;
}

async function handleSubmit() {
  if (!formRef.value) return;
  await formRef.value.validate(async (valid) => {
    if (!valid) return;
    submitting.value = true;
    try {
      if (isEdit.value) {
        await usersApi.update(editingId.value, form);
        ElMessage.success('更新成功');
      } else {
        await usersApi.create(form);
        ElMessage.success('创建成功');
      }
      dialogVisible.value = false;
      loadData();
    } catch (err: any) {
      ElMessage.error(err?.message || '操作失败');
    } finally {
      submitting.value = false;
    }
  });
}

async function resetPassword(row: any) {
  try {
    const newPassword = 'sqzr' + (row.phone || '').slice(-4);
    await usersApi.resetPassword(row._id || row.id, row.phone);
    ElMessage.success(`密码已重置为 ${newPassword}`);
  } catch (err: any) {
    ElMessage.error(err?.message || '重置密码失败');
  }
}

async function syncHrUsers() {
  loading.value = true;
  try {
    const res = await usersApi.getList({ page: 1, pageSize: 500, role: 'hr' });
    tableData.value = res.list;
    pagination.total = res.total;
    ElMessage.success('HR用户已同步');
  } catch (err) {
    console.error('同步HR失败', err);
    ElMessage.error('同步HR失败');
  } finally {
    loading.value = false;
  }
}
</script>

<style scoped lang="scss">
.user-management {
  .toolbar {
    margin-bottom: 16px;
    display: flex;
    gap: 8px;
  }

  .pagination-wrapper {
    margin-top: 16px;
    display: flex;
    justify-content: flex-end;
  }
}
</style>
