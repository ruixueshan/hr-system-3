<template>
  <div class="report-config">
    <el-card header="报表推送配置">
      <el-form label-width="160px">
        <el-form-item label="统计推荐人名单">
          <el-select
            v-model="selectedNames"
            multiple
            filterable
            placeholder="请选择需要统计的推荐人"
            style="width: 100%"
            :loading="loadingUsers"
          >
            <el-option
              v-for="user in userOptions"
              :key="user._id"
              :label="formatUserLabel(user)"
              :value="user.name || user.real_name"
            />
          </el-select>
          <div class="form-tip">只统计选中人员的报表数据，未选中的推荐人不会出现在日报/月报中。留空则统计全部。</div>
        </el-form-item>
        <el-form-item>
          <el-button type="primary" :loading="saving" @click="handleSave">保存配置</el-button>
        </el-form-item>
      </el-form>
    </el-card>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { ElMessage } from 'element-plus';
import { callFunction, getDatabase } from '@/api/cloud';

const selectedNames = ref<string[]>([]);
const userOptions = ref<any[]>([]);
const loadingUsers = ref(false);
const saving = ref(false);

function formatUserLabel(user: any) {
  const name = user.name || user.real_name || '未知';
  const phone = user.phone ? ` (${user.phone})` : '';
  const roleMap: Record<string, string> = {
    gm: '总经理', deputy: '副总', hr: 'HR', external: '外协', finance: '财务'
  };
  const role = user.role ? ` - ${roleMap[user.role] || user.role}` : '';
  return `${name}${phone}${role}`;
}

async function loadUsers() {
  loadingUsers.value = true;
  try {
    const db = await getDatabase();
    const command = db.command;
    let all: any[] = [];
    let offset = 0;
    const limit = 100;
    // 只查询有明确员工/管理角色的用户，排除候选人和无角色用户
    const staffRoles = ['gm', 'deputy', 'hr', 'external', 'finance', 'employee'];
    while (true) {
      const res = await db.collection('users')
        .where({ role: command.in(staffRoles) })
        .skip(offset)
        .limit(limit)
        .get();
      all = all.concat(res.data || []);
      if (!res.data || res.data.length < limit) break;
      offset += limit;
    }
    userOptions.value = all;
  } catch (err) {
    console.error('加载用户列表失败', err);
  } finally {
    loadingUsers.value = false;
  }
}

async function loadConfig() {
  try {
    const config = await callFunction('system', 'get-config', { key: 'report_recommender_list' });
    if (config && config.report_recommender_list) {
      const val = config.report_recommender_list;
      selectedNames.value = Array.isArray(val) ? val : [];
    }
  } catch (err) {
    console.error('加载报表配置失败', err);
  }
}

async function handleSave() {
  saving.value = true;
  try {
    await callFunction('system', 'set-config', {
      key: 'report_recommender_list',
      value: selectedNames.value,
      category: 'report',
      description: '报表统计推荐人白名单'
    });
    ElMessage.success('报表配置已保存');
  } catch (err: any) {
    ElMessage.error('保存失败: ' + (err.message || err));
  } finally {
    saving.value = false;
  }
}

onMounted(() => {
  loadUsers();
  loadConfig();
});
</script>

<style scoped lang="scss">
.report-config {
  max-width: 800px;

  .form-tip {
    color: #909399;
    font-size: 12px;
    line-height: 1.5;
    margin-top: 4px;
  }
}
</style>
