<template>
  <div class="dashboard-page">
    <!-- 统计卡片 -->
    <el-row :gutter="20" class="stats-row">
      <el-col :xs="24" :sm="8" :lg="8">
        <el-card shadow="hover" class="stat-card">
          <div class="stat-content">
            <div class="stat-icon" style="background: #d1fae5; color: #10b981">
              <User />
            </div>
            <div class="stat-info">
              <div class="stat-value">{{ stats.totalCandidates }}</div>
              <div class="stat-label">总候选人</div>
            </div>
          </div>
        </el-card>
      </el-col>

      <el-col :xs="24" :sm="8" :lg="8">
        <el-card shadow="hover" class="stat-card">
          <div class="stat-content">
            <div class="stat-icon" style="background: #dbeafe; color: #3b82f6">
              <UserFilled />
            </div>
            <div class="stat-info">
              <div class="stat-value">{{ stats.onJobEmployees }}</div>
              <div class="stat-label">在职员工</div>
            </div>
          </div>
        </el-card>
      </el-col>

      <el-col :xs="24" :sm="8" :lg="8">
        <el-card shadow="hover" class="stat-card">
          <div class="stat-content">
            <div class="stat-icon" style="background: #fef3c7; color: #f59e0b">
              <Calendar />
            </div>
            <div class="stat-info">
              <div class="stat-value">{{ stats.todayApplications }}</div>
              <div class="stat-label">今日报名</div>
            </div>
          </div>
        </el-card>
      </el-col>
    </el-row>

    <!-- 快捷操作 -->
    <el-row :gutter="20" class="mt-20">
      <el-col :xs="24">
        <el-card>
          <template #header>
            <span>快捷操作</span>
          </template>
          <div class="quick-actions">
            <el-button type="primary" :icon="Plus" @click="$router.push('/jobs')">发布岗位</el-button>
            <el-button :icon="Upload" @click="$router.push('/worktime')">导入工时</el-button>
            <el-button type="success" :icon="Money" @click="$router.push('/salary')">计算薪资</el-button>
            <el-button :icon="Document" @click="$router.push('/reports')">查看报表</el-button>
          </div>
        </el-card>
      </el-col>
    </el-row>

    <!-- 最近报名 -->
    <el-row :gutter="20" class="mt-20">
      <el-col :xs="24">
        <el-card>
          <template #header>
            <div class="flex-between">
              <span>最近报名</span>
              <el-button type="primary" link @click="$router.push('/candidates')">查看全部</el-button>
            </div>
          </template>
          <el-table :data="recentApplications" stripe :show-header="true" style="width: 100%">
            <el-table-column prop="job_name" label="岗位名称" min-width="150">
              <template #default="{ row }">
                {{ row.job_name || row.job_id || '未知' }}
              </template>
            </el-table-column>
            <el-table-column prop="user_name" label="申请人" width="120">
              <template #default="{ row }">
                {{ row.user_name || '未知' }}
              </template>
            </el-table-column>
            <el-table-column prop="phone" label="手机号" width="130">
              <template #default="{ row }">
                {{ row.phone ? maskPhone(row.phone) : '未知' }}
              </template>
            </el-table-column>
            <el-table-column prop="source" label="来源" width="100">
              <template #default="{ row }">
                <el-tag type="info" size="small">{{ getSourceText(row.source) }}</el-tag>
              </template>
            </el-table-column>
            <el-table-column prop="apply_time" label="申请时间" min-width="190">
              <template #default="{ row }">
                <BeijingDateTime :value="row.apply_time" empty-text="未知" format="YYYY-MM-DD HH:mm:ss" />
              </template>
            </el-table-column>
            <el-table-column prop="status" label="状态" width="100" fixed="right">
              <template #default="{ row }">
                <el-tag :type="getStatusTagType(row.status)" size="small">
                  {{ getStatusText(row.status) }}
                </el-tag>
              </template>
            </el-table-column>
          </el-table>
        </el-card>
      </el-col>
    </el-row>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { ElCard, ElRow, ElCol, ElTable, ElTableColumn, ElButton, ElTag, ElMessage } from 'element-plus';
import { User, UserFilled, Calendar, Plus, Upload, Money, Document } from '@element-plus/icons-vue';
import { useTableLoading } from '@/composables/useTableLoading';
import { statsApi } from '@/api';
import { getStatusText, getStatusTagType, getSourceText, maskPhone } from '@/utils/format';
import BeijingDateTime from '@/components/common/BeijingDateTime.vue';

interface DashboardStats {
  totalCandidates: number;
  onJobEmployees: number;
  todayApplications: number;
}

const stats = ref<DashboardStats>({
  totalCandidates: 0,
  onJobEmployees: 0,
  todayApplications: 0
});

const recentApplications = ref<any[]>([]);
const { loading, withLoading } = useTableLoading();

async function loadDashboardData() {
  try {
    const result = await statsApi.dashboardOverview();
    stats.value = {
      totalCandidates: result.totalCandidates,
      onJobEmployees: result.onJobEmployees,
      todayApplications: result.todayApplications
    };
    recentApplications.value = result.recentApplications || [];
  } catch (err: any) {
    console.error('加载仪表盘数据失败:', err);
    ElMessage.warning('仪表盘数据加载失败，请稍后重试');
  }
}

onMounted(async () => {
  await withLoading(async () => {
    await loadDashboardData();
  });
});
</script>

<style scoped lang="scss">
.dashboard-page {
  .stats-row {
    margin-bottom: 20px;

    .stat-card {
      .stat-content {
        display: flex;
        align-items: center;
        gap: 16px;

        .stat-icon {
          width: 56px;
          height: 56px;
          border-radius: 12px;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 24px;
        }

        .stat-info {
          display: flex;
          flex-direction: column;

          .stat-value {
            font-size: 28px;
            font-weight: 600;
            color: var(--text-color);
          }

          .stat-label {
            font-size: 14px;
            color: var(--text-muted);
          }
        }
      }
    }
  }

  .quick-actions {
    display: flex;
    flex-direction: row;
    gap: 12px;

    .el-button {
      justify-content: flex-start;
      padding-left: 16px;
    }
  }

  // 表格填满卡片
  :deep(.el-card__body) {
    padding: 16px;
  }
}
</style>
