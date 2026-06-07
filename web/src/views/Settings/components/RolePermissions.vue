<template>
  <div class="role-permissions">
    <div class="toolbar">
      <el-button type="primary" :icon="Plus" @click="openDialog()">新增角色</el-button>
    </div>

    <el-table v-loading="loading" :data="roles" stripe>
      <el-table-column prop="name" label="角色名称" width="150" />
      <el-table-column prop="description" label="描述" />
      <el-table-column prop="permissions" label="权限列表" min-width="300">
        <template #default="{ row }">
          <el-tag v-for="perm in row.permissions" :key="perm" size="small" class="mr-4">
            {{ perm }}
          </el-tag>
        </template>
      </el-table-column>
      <el-table-column label="操作" width="150">
        <template #default="{ row }">
          <el-button link type="primary" @click="openDialog(row)">编辑</el-button>
          <el-button link type="danger" @click="handleDelete(row)">删除</el-button>
        </template>
      </el-table-column>
    </el-table>

    <el-dialog v-model="dialogVisible" :title="dialogTitle" width="520px">
      <el-form :model="form" :rules="rules" ref="formRef" label-width="90px">
        <el-form-item label="标识" prop="name">
          <el-input v-model="form.name" placeholder="如 hr / finance" :disabled="!!form._id" />
        </el-form-item>
        <el-form-item label="描述">
          <el-input v-model="form.description" placeholder="角色描述" />
        </el-form-item>
        <el-form-item label="权限" prop="permissions">
          <el-select
            v-model="form.permissions"
            multiple
            filterable
            allow-create
            default-first-option
            placeholder="选择或输入权限"
          >
            <el-option v-for="p in permOptions" :key="p" :label="p" :value="p" />
          </el-select>
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
import { Plus } from '@element-plus/icons-vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import type { FormInstance, FormRules } from 'element-plus';
import { rolesApi } from '@/api/modules/roles';

const loading = ref(false);
const roles = ref<any[]>([]);
const dialogVisible = ref(false);
const submitting = ref(false);
const formRef = ref<FormInstance>();
const form = reactive<any>({
  _id: '',
  name: '',
  description: '',
  permissions: [],
  status: 'active'
});

const dialogTitle = computed(() => (form._id ? '编辑角色' : '新增角色'));
const permOptions = [
  '*',
  'dashboard:view',
  'companies:manage',
  'companies:view',
  'jobs:manage',
  'candidates:view',
  'interviews:manage',
  'employees:manage',
  'employees:view',
  'salary:manage',
  'insurance:view',
  'insurance:sync',
  'insurance:mapping_manage',
  'insurance:add',
  'insurance:off',
  'insurance:batch_add',
  'insurance:batch_off',
  'worktime:manage',
  'worktime:view',
  'bonus:manage',
  'advance:manage',
  'rateplans:manage',
  'rateplans:view',
  'commission:manage',
  'commission:view',
  'reports:view',
  'settings:manage'
];

const rules: FormRules = {
  name: [{ required: true, message: '请输入角色标识', trigger: 'blur' }],
  permissions: [{ required: true, message: '请选择权限', trigger: 'change' }]
};

onMounted(() => {
  loadData();
});

async function loadData() {
  loading.value = true;
  try {
    const res = await rolesApi.getList({ page: 1, pageSize: 100 });
    roles.value = res.list;
  } catch (err) {
    console.error('加载角色失败', err);
  } finally {
    loading.value = false;
  }
}

function openDialog(row?: any) {
  if (row) {
    Object.assign(form, row);
  } else {
    Object.assign(form, {
      _id: '',
      name: '',
      description: '',
      permissions: [],
      status: 'active'
    });
  }
  dialogVisible.value = true;
}

function handleDelete(row: any) {
  ElMessageBox.confirm(`删除角色「${row.name}」吗？`, '提示', { type: 'warning' })
    .then(async () => {
      await rolesApi.delete(row._id);
      ElMessage.success('删除成功');
      loadData();
    })
    .catch(() => {});
}

async function handleSubmit() {
  if (!formRef.value) return;
  await formRef.value.validate(async (valid) => {
    if (!valid) return;
    submitting.value = true;
    try {
      if (form._id) {
        await rolesApi.update(form._id, form);
        ElMessage.success('更新成功');
      } else {
        await rolesApi.create(form);
        ElMessage.success('创建成功');
      }
      dialogVisible.value = false;
      loadData();
    } catch (err: any) {
      ElMessage.error(err?.message || '保存失败');
    } finally {
      submitting.value = false;
    }
  });
}
</script>

<style scoped lang="scss">
.role-permissions {
  .toolbar {
    margin-bottom: 16px;
  }

  .mr-4 {
    margin-right: 4px;
    margin-bottom: 4px;
  }
}
</style>
