<template>
  <div class="bank-transfer-page">
    <!-- 发薪进度遮罩层 -->
    <transition name="fade">
      <div v-if="payOverlay.visible" class="pay-overlay">
        <div class="pay-overlay-card">
          <div class="pay-spinner"></div>
          <div class="pay-title">正在发薪中...</div>
          <div class="pay-count">共 {{ payOverlay.total }} 条</div>
          <div class="pay-progress-bar">
            <div class="pay-progress-fill" :style="{ width: payOverlay.percent + '%' }"></div>
          </div>
          <div class="pay-status" v-if="payOverlay.done">
            <template v-if="payOverlay.failCount > 0">
              ✅ 成功 {{ payOverlay.successCount }} 条
              ❌ 失败 {{ payOverlay.failCount }} 条
            </template>
            <template v-else>
              ✅ 全部 {{ payOverlay.successCount }} 条发薪成功
            </template>
          </div>
        </div>
      </div>
    </transition>

    <el-card class="filter-card">
      <div class="page-header">
        <div class="header-title">
          <h2>一键发薪</h2>
          <span class="header-subtitle">批量选择员工后一键发薪，微信发薪直入员工钱包，银行代发改发薪标记后导出</span>
        </div>
      </div>

      <div class="toolbar-row">
        <el-form :model="searchForm" inline class="filter-form">
          <el-form-item label="企业">
            <CompanySelect v-model="searchForm.company_id" style="width:180px" />
          </el-form-item>
          <el-form-item label="发放日期">
            <el-date-picker
              v-model="searchForm.date"
              type="date"
              value-format="YYYY-MM-DD"
              placeholder="选择日期"
            />
          </el-form-item>
          <el-form-item label="结算模式">
            <el-select v-model="searchForm.settlement_mode" style="width:120px">
              <el-option label="日结" value="daily" />
              <el-option label="月结" value="monthly" />
            </el-select>
          </el-form-item>
          <el-form-item label="发薪方式">
            <el-select v-model="searchForm.payment_method" placeholder="全部" clearable style="width:150px">
              <el-option label="全部" value="" />
              <el-option label="银行代发" value="BANK" />
              <el-option label="微信发薪" value="WECHAT" />
            </el-select>
          </el-form-item>
          <el-form-item label="发薪状态">
            <el-select v-model="searchForm.disbursement_status" placeholder="全部" clearable style="width:150px">
              <el-option label="全部" value="" />
              <el-option label="未发薪" value="PENDING" />
              <el-option label="已发薪" value="SUCCESS" />
            </el-select>
          </el-form-item>
          <el-form-item>
            <el-button type="primary" :loading="loading" @click="handleSearch">查询</el-button>
            <el-button @click="handleReset">重置</el-button>
          </el-form-item>
        </el-form>
      </div>
    </el-card>

    <el-card>
      <div class="action-bar">
        <div class="selection-info">
          <span v-if="selectedIds.length">已选择 <strong>{{ selectedIds.length }}</strong> 条记录</span>
          <span v-else>请勾选需要发薪的记录</span>
        </div>
        <div class="action-buttons">
          <el-button
            type="primary"
            :disabled="!selectedIds.length"
            :loading="batchPaying"
            @click="handleBatchPay"
          >
            一键发薪
          </el-button>
          <el-button :icon="Download" @click="handleExportBankTransfer" :disabled="!tableData.length">
            导出银行文件
          </el-button>
        </div>
      </div>

      <el-table
        v-loading="loading"
        :data="tableData"
        stripe
        max-height="650"
        @selection-change="onSelectionChange"
        row-key="salary_id"
      >
        <el-table-column type="selection" width="50" :selectable="(row: any) => row.salary_disbursement_status !== 'SUCCESS'" />
        <el-table-column prop="employee_no" label="工号" width="100" />
        <el-table-column prop="employee_name" label="姓名" width="100" />
        <el-table-column prop="company_name" label="企业" min-width="130" show-overflow-tooltip />
        <el-table-column prop="transaction_amount" label="金额" width="110">
          <template #default="{ row }">¥{{ toFix(row.transaction_amount) }}</template>
        </el-table-column>
        <el-table-column label="发薪方式" width="110">
          <template #default="{ row }">
            <el-tag v-if="row.salary_payment_method === 'WECHAT'" type="success" size="small">微信发薪</el-tag>
            <el-tag v-else type="primary" size="small">银行代发</el-tag>
          </template>
        </el-table-column>
        <el-table-column label="发薪状态" width="100">
          <template #default="{ row }">
            <el-tag v-if="row.salary_disbursement_status === 'SUCCESS'" type="success" size="small">已发薪</el-tag>
            <el-tag v-else type="warning" size="small">未发薪</el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="bank_name" label="银行名称" min-width="120" show-overflow-tooltip />
        <el-table-column prop="bank_account" label="收款账号" min-width="160" show-overflow-tooltip />
        <el-table-column prop="account_holder" label="收款户名" width="120" />
        <el-table-column label="操作" width="180" fixed="right">
          <template #default="{ row }">
            <el-button
              v-if="row.salary_disbursement_status !== 'SUCCESS'"
              link
              type="primary"
              size="small"
              @click="handleSinglePay(row)"
            >一键发薪</el-button>
            <span v-else style="color:#999;font-size:12px;">已发薪</span>
          </template>
        </el-table-column>
      </el-table>

      <div class="pagination-wrapper">
        <el-pagination
          v-model:current-page="pagination.page"
          v-model:page-size="pagination.pageSize"
          :total="pagination.total"
          :page-sizes="[20, 50, 100, 200]"
          layout="total, sizes, prev, pager, next, jumper"
          @size-change="onSizeChange"
          @current-change="onCurrentChange"
        />
      </div>
    </el-card>
  </div>
</template>

<script setup lang="ts">
import { reactive, ref, onMounted } from 'vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import { Download } from '@element-plus/icons-vue';
import { salariesApi } from '@/api/modules/salaries';
import { loadXlsx } from '@/utils/loadXlsx';
import { useTableLoading } from '@/composables/useTableLoading';

const { loading, withLoading } = useTableLoading();
const batchPaying = ref(false);

const tableData = ref<any[]>([]);
const selectedIds = ref<string[]>([]);

const pagination = reactive({ page: 1, pageSize: 50, total: 0 });

const searchForm = reactive({
  company_id: '',
  date: todayStr(),
  settlement_mode: 'daily', // 默认日结
  payment_method: '',
  disbursement_status: 'PENDING' // 默认显示待发薪
});

// 发薪进度遮罩层
const payOverlay = reactive({
  visible: false,
  total: 0,
  done: false,
  successCount: 0,
  failCount: 0,
  percent: 0
});

function todayStr() {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function toFix(value?: number) {
  return (Number(value) || 0).toFixed(2);
}

function normalizeTransferRemark(value?: string) {
  return String(value || '').replace(/\s+/g, '');
}

function normalizeBankAccount(value?: string | number) {
  return String(value || '').replace(/\s+/g, '');
}

function onSelectionChange(rows: any[]) {
  selectedIds.value = rows.map(r => r.salary_id);
}

async function loadData() {
  await withLoading(async () => {
    const params: any = {
      page: pagination.page,
      pageSize: pagination.pageSize
    };
    if (searchForm.company_id) params.company_id = searchForm.company_id;
    if (searchForm.date) params.date = searchForm.date;
    if (searchForm.settlement_mode) params.settlement_mode = searchForm.settlement_mode;
    if (searchForm.payment_method) params.payment_method = searchForm.payment_method;
    if (searchForm.disbursement_status) {
      params.disbursement_status = searchForm.disbursement_status;
    }
    // 一键发薪页：默认查全部 + 前端发薪状态过滤
    params.include_all = true;

    const result = await salariesApi.getBankTransferData(params);
    tableData.value = (result.list || []).map((item: any) => ({
      ...item,
      remark: normalizeTransferRemark(item.remark)
    }));
    pagination.total = result.total;

    if (!tableData.value.length) {
      ElMessage.info('未查询到数据');
    }
  });
}

function handleSearch() {
  pagination.page = 1;
  loadData();
}

function handleReset() {
  searchForm.company_id = '';
  searchForm.date = todayStr();
  searchForm.settlement_mode = 'daily';
  searchForm.payment_method = '';
  searchForm.disbursement_status = 'PENDING';
  pagination.page = 1;
  loadData();
}

function onSizeChange(size: number) {
  pagination.pageSize = size;
  pagination.page = 1;
  loadData();
}

function onCurrentChange(page: number) {
  pagination.page = page;
  loadData();
}

async function handleSinglePay(row: any) {
  const isWechat = row.salary_payment_method === 'WECHAT';
  const actionText = isWechat ? '入账员工钱包' : '标记已发薪';
  await ElMessageBox.confirm(
    `确认对 ${row.employee_name}（¥${toFix(row.transaction_amount)}）一键发薪？<br/>${actionText}`,
    '一键发薪',
    { dangerouslyUseHTMLString: true, type: 'warning', confirmButtonText: '确认发薪', cancelButtonText: '取消' }
  );
  batchPaying.value = true;
  try {
    if (isWechat) {
      await salariesApi.disburseToWallet([row.salary_id]);
    } else {
      const payDate = searchForm.date || todayStr();
      await salariesApi.markDisbursed([row.salary_id], payDate);
    }
    ElMessage.success(`发薪成功：${row.employee_name}`);
  } catch (err: any) {
    ElMessage.error(err?.message || '发薪失败');
  } finally {
    batchPaying.value = false;
    await loadData();
  }
}

async function handleBatchPay() {
  if (!selectedIds.value.length) {
    ElMessage.warning('请先勾选需要发薪的记录');
    return;
  }

  // 按发薪方式分组
  const selectedRows = tableData.value.filter((r: any) => selectedIds.value.includes(r.salary_id));
  const wechatRows = selectedRows.filter((r: any) => r.salary_payment_method === 'WECHAT');
  const bankRows = selectedRows.filter((r: any) => r.salary_payment_method !== 'WECHAT');

  let confirmMsg = `确认一键发薪 <strong>${selectedIds.value.length}</strong> 条记录？`;
  if (wechatRows.length && bankRows.length) {
    confirmMsg += `<br/>微信发薪 <strong>${wechatRows.length}</strong> 条（入员工钱包），银行代发 <strong>${bankRows.length}</strong> 条（标记已发薪）`;
  } else if (wechatRows.length) {
    confirmMsg += `<br/>全部 <strong>${wechatRows.length}</strong> 条为微信发薪，将入账到员工钱包`;
  } else {
    confirmMsg += `<br/>全部 <strong>${bankRows.length}</strong> 条为银行代发，将标记为已发薪`;
  }

  await ElMessageBox.confirm(
    confirmMsg,
    '一键发薪',
    { dangerouslyUseHTMLString: true, type: 'warning', confirmButtonText: '确认发薪', cancelButtonText: '取消' }
  );

  // 打开遮罩层
  const total = selectedIds.value.length;
  payOverlay.visible = true;
  payOverlay.total = total;
  payOverlay.done = false;
  payOverlay.successCount = 0;
  payOverlay.failCount = 0;
  payOverlay.percent = 10; // 初始进度
  batchPaying.value = true;

  try {
    // 进度条动画：从 10% 到 60%，表示处理中
    payOverlay.percent = 30;
    // 小延迟让遮罩层渲染完毕，提升视觉流畅度
    await new Promise(r => setTimeout(r, 100));
    payOverlay.percent = 50;

    const result = await salariesApi.disburse(selectedIds.value);
    const successCount = result.successCount || 0;
    const failCount = result.failCount || 0;

    payOverlay.percent = 100;
    payOverlay.done = true;
    payOverlay.successCount = successCount;
    payOverlay.failCount = failCount;

    if (failCount > 0) {
      ElMessage.warning(`一键发薪完成：成功 ${successCount} 条，失败 ${failCount} 条`);
    } else {
      ElMessage.success(`一键发薪成功 ${successCount} 条`);
    }

    // 自动关闭遮罩层（慢一点让用户看到结果）
    setTimeout(() => {
      payOverlay.visible = false;
    }, 2000);
  } catch (err: any) {
    payOverlay.done = true;
    payOverlay.failCount = payOverlay.total;
    payOverlay.percent = 100;
    ElMessage.error(err?.message || '一键发薪失败');

    setTimeout(() => {
      payOverlay.visible = false;
    }, 2000);
  } finally {
    batchPaying.value = false;
    await loadData();
  }
}

async function handleExportBankTransfer() {
  // 严格限制：只导出发薪方式为银行代发的记录，微信发薪数据禁止导出
  const exportRows = tableData.value.filter(
    (r: any) => r.salary_payment_method === 'BANK' && r.bank_account
  );
  if (!exportRows.length) {
    ElMessage.warning('没有可导出的银行代发记录（微信发薪数据不参与银行导出）');
    return;
  }

  const XLSX = await loadXlsx();
  const rows = exportRows.map((item: any) => ({
    代发序号: '',
    收款行号: '',
    收款账号: normalizeBankAccount(item.bank_account),
    收款户名: item.account_holder,
    交易金额: item.transaction_amount,
    交易备注: normalizeTransferRemark(item.remark),
    跨行标志: '是',
    个人标志: '是'
  }));

  const ws = XLSX.utils.json_to_sheet(rows, {
    textColumns: ['收款账号']
  });
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, '报送银行');

  XLSX.writeFile(wb, `薪资报送银行_${searchForm.date || '全部'}.xls`, {
    bookType: 'xls'
  });
}

onMounted(loadData);
</script>

<style scoped lang="scss">
.bank-transfer-page {
  .filter-card {
    margin-bottom: 16px;
  }

  .page-header {
    margin-bottom: 16px;

    h2 {
      margin: 0;
      font-size: 20px;
      color: #1f2d3d;
    }

    .header-subtitle {
      margin-top: 4px;
      font-size: 13px;
      color: #909399;
    }
  }

  .filter-form {
    display: flex;
    flex-wrap: wrap;
    gap: 8px 16px;
    align-items: center;
    margin-bottom: 0;

    :deep(.el-form-item) {
      margin-bottom: 0;
    }
  }

  .action-bar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 14px;
    flex-wrap: wrap;
    gap: 10px;
  }

  .selection-info {
    font-size: 14px;
    color: #606266;

    strong {
      color: #409eff;
      font-size: 16px;
    }
  }

  .action-buttons {
    display: flex;
    gap: 8px;
    flex-wrap: wrap;
  }

  .pagination-wrapper {
    display: flex;
    flex-shrink: 0;
    justify-content: flex-end;
    margin-top: 18px;
  }
}

/* 发薪进度遮罩层 */
.pay-overlay {
  position: fixed;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  background: rgba(0, 0, 0, 0.55);
  z-index: 9999;
  display: flex;
  align-items: center;
  justify-content: center;
}

.pay-overlay-card {
  width: 360px;
  padding: 48px 40px 40px;
  background: #fff;
  border-radius: 16px;
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
  text-align: center;
}

.pay-spinner {
  width: 48px;
  height: 48px;
  margin: 0 auto 24px;
  border: 4px solid #e8ecf1;
  border-top-color: #409eff;
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

.pay-title {
  font-size: 20px;
  font-weight: 700;
  color: #1f2d3d;
  margin-bottom: 8px;
}

.pay-count {
  font-size: 14px;
  color: #909399;
  margin-bottom: 24px;
}

.pay-progress-bar {
  width: 100%;
  height: 8px;
  background: #e8ecf1;
  border-radius: 4px;
  overflow: hidden;
  margin-bottom: 20px;
}

.pay-progress-fill {
  height: 100%;
  background: linear-gradient(90deg, #409eff, #66b1ff);
  border-radius: 4px;
  transition: width 0.5s ease;
}

.pay-status {
  font-size: 15px;
  font-weight: 600;
  color: #1f2d3d;
  line-height: 1.6;
}

/* 遮罩层入场/退场动画 */
.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.3s ease;
}
.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}
</style>
