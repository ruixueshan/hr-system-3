<template>
  <div class="dev-tools-page">
    <el-card class="dev-tools-card">
      <template #header>
        <div class="card-header">
          <span>🛠️ 开发者工具 - 测试数据管理</span>
          <el-button type="primary" link @click="dialogVisible = false">关闭</el-button>
        </div>
      </template>

      <el-alert
        title="⚠️ 注意"
        type="warning"
        description="此工具仅用于开发和测试环境。点击下方按钮将向 CloudBase 数据库添加测试数据。"
        show-icon
        :closable="false"
        class="mb-20"
      />

      <el-divider />

      <div class="tools-section">
        <h3>创建测试数据</h3>
        <p class="text-muted">一键创建完整的测试场景数据（企业、岗位、应聘、员工）</p>
        <el-button
          type="success"
          size="large"
          :loading="loading.create"
          @click="createAllData"
          class="tool-btn"
        >
          ✅ 创建所有测试数据
        </el-button>
        <p class="text-muted mt-10">将创建：5个企业、10个岗位、20个应聘、15个员工</p>
      </div>

      <el-divider />

      <div class="tools-section">
        <h3>清空测试数据</h3>
        <p class="text-muted">删除所有通过此工具创建的数据</p>
        <el-button
          type="danger"
          size="large"
          :loading="loading.clear"
          @click="clearAllData"
          class="tool-btn"
        >
          🗑️ 清空所有测试数据
        </el-button>
      </div>

      <el-divider />

      <div class="tools-section">
        <h3>查看数据统计</h3>
        <el-button type="info" size="large" @click="showStats" class="tool-btn">
          📊 查看当前数据统计
        </el-button>
        <div v-if="stats" class="stats-box mt-20">
          <el-row :gutter="20">
            <el-col :xs="24" :sm="12" :lg="6">
              <div class="stat-item">
                <div class="stat-label">企业总数</div>
                <div class="stat-value">{{ stats.companies }}</div>
              </div>
            </el-col>
            <el-col :xs="24" :sm="12" :lg="6">
              <div class="stat-item">
                <div class="stat-label">岗位总数</div>
                <div class="stat-value">{{ stats.jobs }}</div>
              </div>
            </el-col>
            <el-col :xs="24" :sm="12" :lg="6">
              <div class="stat-item">
                <div class="stat-label">应聘总数</div>
                <div class="stat-value">{{ stats.applications }}</div>
              </div>
            </el-col>
            <el-col :xs="24" :sm="12" :lg="6">
              <div class="stat-item">
                <div class="stat-label">员工总数</div>
                <div class="stat-value">{{ stats.employees }}</div>
              </div>
            </el-col>
          </el-row>
        </div>
      </div>

      <el-divider />

      <div class="tools-section">
        <h3>快速命令</h3>
        <p class="text-muted">你也可以在浏览器控制台直接运行这些命令：</p>
        <div class="command-box">
          <code>// 创建所有测试数据</code><br />
          <code>window.seedTestData.createAll()</code><br />
          <br />
          <code>// 清空所有测试数据</code><br />
          <code>window.seedTestData.clearAll()</code><br />
        </div>
      </div>

      <el-divider />

      <div class="mt-20 text-center">
        <el-button type="primary" @click="navigateToDashboard">
          👉 回到仪表盘查看数据
        </el-button>
      </div>
    </el-card>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import { ElMessage, ElMessageBox } from 'element-plus';
import { getDatabase } from '@/api/cloud';

const router = useRouter();

const loading = ref({
  create: false,
  clear: false
});

const stats = ref<any>(null);

async function exposeGlobals() {
  // 将表格数据等暴露到 window 便于调试
  (window as any).$vm = {
    jobsTable: null,
    companiesTable: null
  };
}

async function createAllData() {
  try {
    loading.value.create = true;
    await ElMessageBox.confirm(
      '确定要创建测试数据吗？此操作会向数据库添加约 50 条记录。',
      '确认',
      { confirmButtonText: '确定', cancelButtonText: '取消', type: 'warning' }
    );

    const result = await (window as any).seedTestData.createAll();
    if (result) {
      ElMessage.success('✅ 测试数据创建成功！');
      // 刷新统计
      setTimeout(() => showStats(), 1000);
    }
  } catch (err: any) {
    if (err.message !== 'cancel') {
      ElMessage.error('❌ 创建失败：' + (err.message || '未知错误'));
    }
  } finally {
    loading.value.create = false;
  }
}

async function clearAllData() {
  try {
    loading.value.clear = true;
    await ElMessageBox.confirm(
      '确定要清空所有测试数据吗？此操作不可恢复。',
      '危险操作',
      { confirmButtonText: '确定', cancelButtonText: '取消', type: 'error' }
    );

    const result = await (window as any).seedTestData.clearAll();
    if (result) {
      ElMessage.success('✅ 数据已清空！');
      stats.value = null;
    }
  } catch (err: any) {
    if (err.message !== 'cancel') {
      ElMessage.error('❌ 清空失败：' + (err.message || '未知错误'));
    }
  } finally {
    loading.value.clear = false;
  }
}

onMounted(() => {
  exposeGlobals();
});

async function showStats() {
  try {
    const db = await getDatabase();

    const companiesCount = await db.collection('companies').count();
    const jobsCount = await db.collection('jobs').count();
    const applicationsCount = await db.collection('applications').count();
    const employeesCount = await db.collection('employees').count();

    stats.value = {
      companies: companiesCount.total || 0,
      jobs: jobsCount.total || 0,
      applications: applicationsCount.total || 0,
      employees: employeesCount.total || 0
    };

    ElMessage.success('📊 数据统计已更新');
  } catch (err: any) {
    ElMessage.error('❌ 获取统计失败');
  }
}

function navigateToDashboard() {
  router.push('/dashboard');
}
</script>

<style scoped lang="scss">
.dev-tools-page {
  padding: 20px;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  min-height: 100vh;

  .dev-tools-card {
    max-width: 900px;
    margin: 0 auto;

    .card-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      font-size: 20px;
      font-weight: bold;
    }

    .tools-section {
      margin: 20px 0;

      h3 {
        font-size: 18px;
        font-weight: 600;
        margin-bottom: 12px;
        color: #333;
      }

      .text-muted {
        color: #999;
        font-size: 14px;
        margin-bottom: 16px;
      }

      .tool-btn {
        width: 100%;
        height: 44px;
        font-size: 16px;
        font-weight: bold;
      }

      .command-box {
        background: #f5f7fa;
        border: 1px solid #e4e7eb;
        border-radius: 4px;
        padding: 16px;
        font-family: 'Monaco', 'Menlo', 'Ubuntu Mono', monospace;
        font-size: 13px;
        line-height: 1.8;
        color: #333;
        overflow-x: auto;

        code {
          color: #d63384;
        }
      }

      .stats-box {
        .stat-item {
          background: #f0f9ff;
          border-left: 4px solid #3b82f6;
          padding: 16px;
          border-radius: 4px;
          text-align: center;

          .stat-label {
            color: #666;
            font-size: 14px;
            margin-bottom: 8px;
          }

          .stat-value {
            font-size: 32px;
            font-weight: bold;
            color: #3b82f6;
          }
        }
      }
    }

    .mt-20 {
      margin-top: 20px;
    }

    .mb-20 {
      margin-bottom: 20px;
    }

    .mt-10 {
      margin-top: 10px;
    }

    .text-center {
      text-align: center;
    }
  }
}
</style>
