<template>
  <div class="operation-logs">
    <el-form :model="searchForm" inline class="mb-16">
      <el-form-item label="操作人">
        <el-input v-model="searchForm.operator" placeholder="搜索操作人" clearable />
      </el-form-item>
      <el-form-item label="操作类型">
        <el-select v-model="searchForm.action" placeholder="选择操作类型" clearable>
          <el-option label="登录" value="login" />
          <el-option label="创建" value="create" />
          <el-option label="更新" value="update" />
          <el-option label="删除" value="delete" />
        </el-select>
      </el-form-item>
      <el-form-item label="时间范围">
        <el-date-picker
          v-model="searchForm.dateRange"
          type="daterange"
          range-separator="至"
          start-placeholder="开始日期"
          end-placeholder="结束日期"
          value-format="YYYY-MM-DD"
        />
      </el-form-item>
      <el-form-item>
        <el-button type="primary" @click="handleSearch">搜索</el-button>
        <el-button @click="handleReset">重置</el-button>
        <el-button @click="handleExport">导出</el-button>
      </el-form-item>
    </el-form>

    <el-table v-loading="loading" :data="tableData" stripe>
      <el-table-column prop="operator_name" label="操作人" width="100" />
      <el-table-column prop="action" label="操作类型" width="100" />
      <el-table-column prop="resource" label="操作对象" width="150" />
      <el-table-column prop="details" label="操作详情" min-width="200" />
      <el-table-column prop="ip" label="IP地址" width="140" />
      <el-table-column prop="created_at" label="操作时间" width="190">
        <template #default="{ row }"><BeijingDateTime :value="row.created_at" /></template>
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
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, onMounted } from 'vue';
import { ElMessage } from 'element-plus';
import { operationLogsApi } from '@/api/modules/operationLogs';
import { loadXlsx } from '@/utils/loadXlsx';
import { usePagination } from '@/composables/usePagination';
import { useTableLoading } from '@/composables/useTableLoading';
import { formatDate } from '@/utils/format';
import BeijingDateTime from '@/components/common/BeijingDateTime.vue';

const { loading, withLoading } = useTableLoading();
const tableData = ref<any[]>([]);

const searchForm = reactive({
  operator: '',
  action: '',
  dateRange: []
});

const { pagination, onSizeChange, onCurrentChange } = usePagination(loadData, 50);

onMounted(() => {
  loadData();
});

async function loadData() {
  await withLoading(async () => {
    const res = await operationLogsApi.getList({
      page: pagination.page,
      pageSize: pagination.pageSize,
      operator: searchForm.operator || undefined,
      action: searchForm.action || undefined,
      start_date: searchForm.dateRange?.[0],
      end_date: searchForm.dateRange?.[1]
    });
    tableData.value = res.list;
    pagination.total = res.total;
  });
}

function handleSearch() {
  pagination.page = 1;
  loadData();
}

function handleReset() {
  searchForm.operator = '';
  searchForm.action = '';
  searchForm.dateRange = [];
  handleSearch();
}

async function handleExport() {
  try {
    const XLSX = await loadXlsx();
    const data = tableData.value.map((item) => ({
      操作人: item.operator_name,
      操作类型: item.action,
      操作对象: item.resource,
      详情: item.details,
      IP: item.ip,
      时间: formatDate(item.created_at, 'YYYY-MM-DD HH:mm:ss')
    }));
    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, '操作日志');
    XLSX.writeFile(wb, '操作日志.xlsx');
  } catch (err) {
    console.error('导出失败', err);
    ElMessage.error('导出失败');
  }
}
</script>

<style scoped lang="scss">
.operation-logs {
  .mb-16 {
    margin-bottom: 16px;
  }

  .pagination-wrapper {
    margin-top: 16px;
    display: flex;
    justify-content: flex-end;
  }
}
</style>
