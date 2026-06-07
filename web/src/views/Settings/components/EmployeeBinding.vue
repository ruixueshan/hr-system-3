<template>
  <div class="employee-binding">
    <div class="toolbar mb-16">
      <el-button type="primary" :loading="bindingLoading" @click="loadData">刷新列表</el-button>
      <el-text type="info" class="ml-12">
        自动绑定优先按身份证号+姓名匹配，其次按手机号+姓名匹配；多条或未命中需人工选择。
      </el-text>
    </div>

    <el-table v-loading="bindingLoading" :data="pendingBindings" border empty-text="暂无待绑定员工">
      <el-table-column prop="employee_no" label="工号" width="100" />
      <el-table-column prop="name" label="姓名" width="110" />
      <el-table-column prop="phone" label="在职手机" width="130" />
      <el-table-column prop="id_card" label="身份证号" min-width="170" />
      <el-table-column label="系统建议" min-width="260">
        <template #default="{ row }">
          <template v-if="row.suggestions?.length">
            <div
              v-for="item in row.suggestions"
              :key="item._id"
              class="suggestion-row"
            >
              <span class="suggestion-info">{{ item.name || '未命名账号' }} / {{ item.phone || '-' }}</span>
              <el-tag size="small" class="mx-4">
                {{ item.match_rule === 'id_card_name' ? '身份证+姓名' : item.match_rule === 'phone_name' ? '手机+姓名' : '手机号' }}
              </el-tag>
            </div>
          </template>
          <el-text v-else type="info" size="small">暂无建议</el-text>
        </template>
      </el-table-column>
      <el-table-column label="人工绑定" min-width="300">
        <template #default="{ row }">
          <div class="binding-actions">
            <el-select
              v-model="bindingSelections[row._id]"
              filterable
              clearable
              placeholder="从未绑定账号中选择"
              style="width: 210px;"
            >
              <el-option
                v-for="user in availableUsers"
                :key="user._id"
                :label="formatUser(user)"
                :value="user._id"
              />
            </el-select>
            <el-button
              type="primary"
              :loading="bindingSubmitting[row._id]"
              class="ml-8"
              @click="handleBind(row)"
            >绑定</el-button>
          </div>
        </template>
      </el-table-column>
    </el-table>
    <div class="pagination-wrapper">
      <el-pagination
        v-model:current-page="pagination.page"
        v-model:page-size="pagination.pageSize"
        :total="pagination.total"
        :page-sizes="[20, 50, 100, 200]"
        background
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
import { employeesApi } from '@/api/modules/employees';
import { usePagination } from '@/composables/usePagination';
import { useTableLoading } from '@/composables/useTableLoading';

const { loading: bindingLoading, withLoading: withBindingLoading } = useTableLoading();
const pendingBindings = ref<any[]>([]);
// 从后端 getPendingBindings 一并返回的已过滤可用账号列表（已排除所有已绑定账号）
const availableUsers = ref<{ _id: string; name: string; phone: string; user_type: string }[]>([]);
const bindingSelections = reactive<Record<string, string>>({});
const bindingSubmitting = reactive<Record<string, boolean>>({});
const { pagination, onSizeChange, onCurrentChange } = usePagination(loadData);

function formatUser(user: { name: string; phone: string }) {
  return `${user.name || '未命名账号'} / ${user.phone || '-'}`;
}

async function loadData() {
  await withBindingLoading(async () => {
    const result = await employeesApi.getPendingBindings({
      page: pagination.page,
      pageSize: pagination.pageSize
    });
    const nextTotal = Number(result.total || 0);
    if (!result.list?.length && nextTotal > 0 && pagination.page > 1) {
      pagination.page = Math.max(1, Math.ceil(nextTotal / pagination.pageSize));
      await loadData();
      return;
    }
    pendingBindings.value = result.list || [];
    pagination.total = nextTotal;
    availableUsers.value = result.availableUsers || [];

    // 预填：先把所有 key 初始化为 ''，再对单条命中的自动选中
    Object.keys(bindingSelections).forEach((k) => delete bindingSelections[k]);
    pendingBindings.value.forEach((item: any) => {
      bindingSelections[item._id] = item.suggestions?.length === 1 ? item.suggestions[0]._id : '';
    });
  });
}

async function handleBind(row: any) {
  const userId = bindingSelections[row._id];
  if (!userId) {
    ElMessage.error('请先选择要绑定的账号');
    return;
  }
  bindingSubmitting[row._id] = true;
  try {
    await employeesApi.bindUser(row._id, userId);
    ElMessage.success('绑定成功');
    await loadData();
  } catch (err: any) {
    ElMessage.error(err?.message || '绑定失败');
  } finally {
    bindingSubmitting[row._id] = false;
  }
}

onMounted(loadData);
</script>

<style scoped lang="scss">
.employee-binding {
  .suggestion-row {
    display: flex;
    align-items: center;
    line-height: 2;
    .suggestion-info {
      flex: 1;
      font-size: 13px;
    }
  }
  .binding-actions {
    display: flex;
    align-items: center;
  }
  .pagination-wrapper {
    margin-top: 16px;
    display: flex;
    justify-content: flex-end;
  }
}
</style>
