<template>
  <div class="companies-page">
    <!-- 搜索栏 -->
    <el-card class="search-card">
      <el-form :model="searchForm" inline>
        <el-form-item label="企业名称">
          <el-input
            v-model="searchForm.keyword"
            placeholder="搜索企业名称"
            clearable
            @keyup.enter="handleSearch"
          />
        </el-form-item>
        <el-form-item label="状态">
          <el-select v-model="searchForm.status" placeholder="全部状态" clearable style="width: 220px;">
            <el-option label="合作中" value="active" />
            <el-option label="暂停合作" value="paused" />
            <el-option label="终止合作" value="terminated" />
          </el-select>
        </el-form-item>
        <el-form-item>
          <el-button type="primary" @click="handleSearch">
            <el-icon><Search /></el-icon>
            搜索
          </el-button>
          <el-button @click="handleReset">
            <el-icon><Refresh /></el-icon>
            重置
          </el-button>
        </el-form-item>
      </el-form>
    </el-card>

    <!-- 操作栏 -->
    <div class="toolbar">
      <el-button type="primary" :icon="Plus" @click="handleAdd">新增企业</el-button>
      <el-button
        :icon="Delete"
        :disabled="!selectedRows.length"
        @click="handleBatchDelete"
      >
        批量删除 ({{ selectedRows.length }})
      </el-button>
    </div>

    <!-- 数据表格 -->
    <el-card>
      <el-table
        ref="tableRef"
        v-loading="loading"
        :data="tableData"
        stripe
        @selection-change="handleSelectionChange"
      >
        <el-table-column type="selection" width="55" />
        <el-table-column prop="name" label="企业名称" min-width="180">
          <template #default="{ row }">
            <div class="company-name">
              <span>{{ row.name }}</span>
              <el-tag v-if="row.short_name" size="small" class="ml-4">{{ row.short_name }}</el-tag>
            </div>
          </template>
        </el-table-column>
        <el-table-column prop="company_code" label="企业编码" width="140" />
        <el-table-column prop="industry" label="行业" width="120" />
        <el-table-column prop="contact_person" label="联系人" width="100" />
        <el-table-column prop="contact_phone" label="联系电话" width="120">
          <template #default="{ row }">
            {{ maskPhone(row.contact_phone) }}
          </template>
        </el-table-column>
        <el-table-column prop="status" label="状态" width="100">
          <template #default="{ row }">
            <el-tag :type="getStatusType(row.status)">
              {{ getStatusText(row.status) }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="created_at" label="创建时间" width="190">
          <template #default="{ row }">
            <BeijingDateTime :value="row.created_at" />
          </template>
        </el-table-column>
        <el-table-column label="操作" width="200" fixed="right">
          <template #default="{ row }">
            <el-button link type="primary" @click="handleEdit(row)">编辑</el-button>
            <el-button link type="primary" @click="handleView(row)">详情</el-button>
            <el-button link type="danger" @click="handleDelete(row)">删除</el-button>
          </template>
        </el-table-column>
      </el-table>

      <!-- 分页 -->
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

    <!-- 新增/编辑对话框 -->
    <el-dialog
      v-model="dialogVisible"
      :title="dialogTitle"
      width="600px"
      :close-on-click-modal="false"
    >
      <el-form
        ref="formRef"
        :model="form"
        :rules="rules"
        label-width="100px"
      >
        <el-form-item label="企业名称" prop="name">
          <el-input v-model="form.name" placeholder="请输入企业全称" />
        </el-form-item>

        <el-form-item label="简称" prop="short_name">
          <el-input v-model="form.short_name" placeholder="请输入企业简称" />
        </el-form-item>

        <el-form-item label="企业编码" prop="company_code">
          <el-input v-model="form.company_code" placeholder="留空自动生成，也可手动覆盖" />
        </el-form-item>

        <el-row :gutter="20">
          <el-col :span="12">
            <el-form-item label="联系人" prop="contact_person">
              <el-input v-model="form.contact_person" placeholder="请输入联系人姓名" />
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="联系电话" prop="contact_phone">
              <el-input v-model="form.contact_phone" placeholder="请输入联系电话" />
            </el-form-item>
          </el-col>
        </el-row>

        <el-form-item label="行业" prop="industry">
          <el-input v-model="form.industry" placeholder="请输入所属行业" />
        </el-form-item>

        <el-form-item label="地址" prop="address">
          <el-input v-model="form.address" placeholder="请输入企业地址" />
        </el-form-item>

        <el-form-item label="经营范围" prop="business_scope">
          <el-input
            v-model="form.business_scope"
            type="textarea"
            :rows="3"
            placeholder="请输入经营范围"
          />
        </el-form-item>

        <el-form-item label="标签" prop="tags">
          <el-select
            v-model="form.tags"
            multiple
            filterable
            allow-create
            placeholder="输入标签后回车"
          />
        </el-form-item>

        <el-form-item label="状态" prop="status">
          <el-radio-group v-model="form.status">
            <el-radio label="active">合作中</el-radio>
            <el-radio label="paused">暂停合作</el-radio>
            <el-radio label="terminated">终止合作</el-radio>
          </el-radio-group>
        </el-form-item>
      </el-form>

      <template #footer>
        <el-button @click="dialogVisible = false">取消</el-button>
        <el-button type="primary" :loading="submitting" @click="handleSubmit">
          {{ submitting ? '提交中...' : '确定' }}
        </el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, computed, onMounted, defineExpose } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { ElMessage, ElMessageBox, type FormInstance, type FormRules } from 'element-plus';
import { Search, Refresh, Plus, Delete } from '@element-plus/icons-vue';
import { companiesApi } from '@/api/modules/companies';
import type { Company } from '@/api/types';
import { formatDate, maskPhone, getStatusText, getStatusType } from '@/utils/format';
import BeijingDateTime from '@/components/common/BeijingDateTime.vue';
import { usePagination } from '@/composables/usePagination';
import { useTableLoading } from '@/composables/useTableLoading';

const tableRef = ref();
const formRef = ref<FormInstance>();
const { loading, withLoading } = useTableLoading();
const submitting = ref(false);
const dialogVisible = ref(false);
const isEdit = ref(false);
const selectedRows = ref<Company[]>([]);
const tableData = ref<Company[]>([]);
const route = useRoute();
const router = useRouter();

const searchForm = reactive({
  keyword: '',
  status: ''
});

const { pagination, onSizeChange, onCurrentChange } = usePagination(loadData);

const form = reactive<Partial<Company>>({
  name: '',
  company_code: '',
  short_name: '',
  contact_person: '',
  contact_phone: '',
  industry: '',
  address: '',
  business_scope: '',
  tags: [],
  status: 'active'
});

const dialogTitle = computed(() => isEdit.value ? '编辑企业' : '新增企业');

const rules: FormRules = {
  name: [
    { required: true, message: '请输入企业名称', trigger: 'blur' },
    { min: 2, max: 100, message: '长度在 2 到 100 个字符', trigger: 'blur' }
  ],
  company_code: [
    { pattern: /^[A-Za-z0-9_-]*$/, message: '企业编码仅支持字母、数字、下划线和短横线', trigger: 'blur' }
  ],
  contact_phone: [
    { pattern: /^1[3-9]\d{9}$/, message: '请输入正确的手机号', trigger: 'blur' }
  ]
};

async function loadData() {
  await withLoading(async () => {
    const result = await companiesApi.getList({
      page: pagination.page,
      pageSize: pagination.pageSize,
      keyword: searchForm.keyword,
      status: searchForm.status
    });
    tableData.value = result.list.map((item: any) => ({
      ...item,
      _id: item._id || item.id,
      id: item._id || item.id
    }));
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

function handleSelectionChange(rows: Company[]) {
  selectedRows.value = rows;
}

function handleAdd() {
  isEdit.value = false;
  resetForm();
  dialogVisible.value = true;
}

function handleEdit(row: Company) {
  isEdit.value = true;
  Object.assign(form, { ...row, _id: row._id || (row as any).id });
  dialogVisible.value = true;
}

function handleView(row: Company) {
  // TODO: 跳转详情页或打开详情对话框
  ElMessage.info(`查看企业详情: ${row.name}`);
}

async function handleDelete(row: Company) {
  try {
    await ElMessageBox.confirm(`确定要删除企业「${row.name}」吗？`, '提示', {
      confirmButtonText: '确定',
      cancelButtonText: '取消',
      type: 'warning'
    });
    await companiesApi.delete(row._id);
    ElMessage.success('删除成功');
    loadData();
  } catch (err: any) {
    if (err !== 'cancel') {
      ElMessage.error(err?.message || '删除失败');
    }
  }
}

async function handleBatchDelete() {
  const count = selectedRows.value.length;
  try {
    await ElMessageBox.confirm(`确定要删除选中的 ${count} 家企业吗？`, '提示', {
      confirmButtonText: '确定',
      cancelButtonText: '取消',
      type: 'warning'
    });
    await companiesApi.batchDelete(selectedRows.value.map(r => r._id));
    ElMessage.success('批量删除成功');
    loadData();
  } catch (err: any) {
    if (err !== 'cancel') {
      ElMessage.error(err?.message || '批量删除失败');
    }
  }
}

function resetForm() {
  Object.assign(form, {
    name: '',
    company_code: '',
    short_name: '',
    contact_person: '',
    contact_phone: '',
    industry: '',
    address: '',
    business_scope: '',
    tags: [],
    status: 'active'
  });
  formRef.value?.resetFields();
}

async function handleSubmit() {
  if (!formRef.value) return;
  await formRef.value.validate(async (valid) => {
    if (!valid) return;

    submitting.value = true;
    try {
      if (isEdit.value) {
        const id = form._id || (form as any).id;
        if (!id) throw new Error('企业ID缺失');
        await companiesApi.update(id, form);
        ElMessage.success('更新成功');
      } else {
        await companiesApi.create(form);
        ElMessage.success('创建成功');
      }
      dialogVisible.value = false;
      loadData();
    } catch (err: any) {
      console.error('提交失败:', err);
      ElMessage.error(err?.message || '提交失败');
    } finally {
      submitting.value = false;
    }
  });
}

function handleSizeChange(size: number) {
  pagination.pageSize = size;
  loadData();
}

function handlePageChange(page: number) {
  pagination.page = page;
  loadData();
}

onMounted(() => {
  loadData();
  (window as any).companiesPage = { form, tableData, formRef };
  // 如果路径为 /companies/add 则直接打开新增弹窗
  if (route.path.endsWith('/companies/add')) {
    handleAdd();
    // 将路由切回列表，避免刷新再次触发
    router.replace('/companies');
  }
});
</script>

<style scoped lang="scss">
.companies-page {
  .search-card {
    margin-bottom: 16px;
  }

  .toolbar {
    margin-bottom: 16px;
    display: flex;
    gap: 8px;
  }

  .company-name {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .ml-4 {
    margin-left: 4px;
  }

  .pagination-wrapper {
    margin-top: 16px;
    display: flex;
    justify-content: flex-end;
  }
}
</style>
