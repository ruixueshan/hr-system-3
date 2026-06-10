<template>
  <div class="wallet-withdrawals-page">
    <el-tabs v-model="activeTab" class="page-tabs">
      <!-- ════════════ Tab 1：提现审核 ════════════ -->
      <el-tab-pane label="提现审核" name="withdraw">
        <el-card class="hero-card">
          <div class="hero-content">
            <div>
              <p class="eyebrow">微信发薪管理</p>
              <h2>微信发薪管理</h2>
              <p class="hero-desc">统一查看公司微信商户余额、员工钱包未提现余额，并跟踪微信零钱提现到账状态。</p>
            </div>
            <el-button type="primary" :loading="loading" @click="loadData">刷新列表</el-button>
          </div>
        </el-card>

        <div class="summary-grid">
          <el-card class="summary-card merchant">
            <div class="summary-label">公司账户余额</div>
            <div class="summary-value">暂不可用</div>
            <div class="summary-sub">
              <span>商户余额查询功能暂不可用</span>
            </div>
          </el-card>

          <el-card class="summary-card wallet">
            <div class="summary-label">钱包账户余额</div>
            <div class="summary-value">¥{{ walletSummary.wallet_unwithdrawn_amount_yuan }}</div>
            <div class="summary-sub">
              <span>所有员工发薪入钱包后未提现余额</span>
              <span>可提现 ¥{{ walletSummary.wallet_available_amount_yuan }}，冻结 ¥{{ walletSummary.wallet_frozen_amount_yuan }}</span>
            </div>
          </el-card>
        </div>

        <el-card class="filter-card">
          <el-form :model="searchForm" inline>
            <el-form-item label="状态">
              <el-select v-model="searchForm.status" placeholder="全部状态" clearable style="width: 220px;">
                <el-option label="需风控复核" value="RISK_REVIEW" />
                <el-option label="已审核待打款" value="APPROVED" />
                <el-option label="打款中" value="PAYING" />
                <el-option label="已到账" value="SUCCESS" />
                <el-option label="失败" value="FAILED" />
                <el-option label="已关闭" value="CLOSED" />
              </el-select>
            </el-form-item>
            <el-form-item>
              <el-button type="primary" @click="handleSearch">查询</el-button>
              <el-button @click="handleReset">重置</el-button>
            </el-form-item>
          </el-form>
        </el-card>

        <el-alert
          class="safety-alert"
          type="warning"
          show-icon
          :closable="false"
          title="支付安全提示"
          description="当前支付服务会拒绝未签名的外部请求；若微信商户参数未配置，触发打款会被延后，不会解冻员工余额。"
        />

        <el-card>
          <el-table v-loading="loading" :data="tableData" stripe>
            <el-table-column prop="withdraw_no" label="提现单号" min-width="180" show-overflow-tooltip />
            <el-table-column prop="employee_name" label="员工姓名" min-width="140" show-overflow-tooltip>
              <template #default="{ row }">{{ row.employee_name || '-' }}</template>
            </el-table-column>
            <el-table-column prop="real_name" label="提现实名" min-width="140" show-overflow-tooltip>
              <template #default="{ row }">{{ row.real_name || '-' }}</template>
            </el-table-column>
            <el-table-column prop="amount" label="提现金额" width="130">
              <template #default="{ row }">¥{{ formatFen(row.amount) }}</template>
            </el-table-column>
            <el-table-column prop="status" label="状态" width="130">
              <template #default="{ row }">
                <el-tag :type="statusType(row.status)">{{ statusText(row.status) }}</el-tag>
              </template>
            </el-table-column>
            <el-table-column prop="risk_reason" label="风控原因" min-width="180" show-overflow-tooltip>
              <template #default="{ row }">{{ row.risk_reason || '-' }}</template>
            </el-table-column>
            <el-table-column prop="fail_reason" label="失败原因" min-width="180" show-overflow-tooltip>
              <template #default="{ row }">{{ row.fail_reason || '-' }}</template>
            </el-table-column>
            <el-table-column prop="payment_last_query_error" label="异常原因" min-width="200" show-overflow-tooltip>
              <template #default="{ row }">{{ row.payment_last_query_error || row.payment_fail_reason || '-' }}</template>
            </el-table-column>
            <el-table-column prop="payment_last_query_at" label="最后查单时间" width="190">
              <template #default="{ row }">
                <BeijingDateTime v-if="row.payment_last_query_at" :value="row.payment_last_query_at" />
                <span v-else>-</span>
              </template>
            </el-table-column>
            <el-table-column prop="payment_query_fail_count" label="查单失败次数" width="130">
              <template #default="{ row }">{{ row.payment_query_fail_count || 0 }}</template>
            </el-table-column>
            <el-table-column prop="apply_time" label="申请时间" width="190">
              <template #default="{ row }"><BeijingDateTime :value="row.apply_time || row.created_at" /></template>
            </el-table-column>
            <el-table-column label="操作" width="280" fixed="right">
              <template #default="{ row }">
                <el-button v-if="canReview(row)" link type="success" @click="handleApprove(row)">通过</el-button>
                <el-button v-if="canReview(row)" link type="danger" @click="handleReject(row)">驳回</el-button>
                <el-button v-if="row.status === 'APPROVED'" link type="primary" @click="handleTriggerPayment(row)">触发打款</el-button>
                <el-button v-if="row.payment_order_id && ['PAYING', 'FAILED'].includes(row.status)" link type="warning" @click="handleSyncPayment(row)">查单</el-button>
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
      </el-tab-pane>

      <!-- ════════════ Tab 2：员工钱包 ════════════ -->
      <el-tab-pane label="员工钱包" name="wallets">
        <div class="wallet-summary-grid">
          <el-card class="summary-card wallet green">
            <div class="summary-label">已开通钱包</div>
            <div class="summary-value">{{ walletAccountSummary.account_count }}</div>
            <div class="summary-sub">位员工已开通微信钱包</div>
          </el-card>
          <el-card class="summary-card wallet blue">
            <div class="summary-label">钱包总余额</div>
            <div class="summary-value">¥{{ walletAccountSummary.total_available_yuan }}</div>
            <div class="summary-sub">所有员工钱包可用余额合计</div>
          </el-card>
          <el-card class="summary-card wallet orange">
            <div class="summary-label">冻结总金额</div>
            <div class="summary-value">¥{{ walletAccountSummary.total_frozen_yuan }}</div>
            <div class="summary-sub">提现冻结金额合计</div>
          </el-card>
        </div>

        <el-card class="filter-card">
          <el-form :model="walletSearchForm" inline>
            <el-form-item label="关键词">
              <el-input v-model="walletSearchForm.keyword" placeholder="姓名/工号/手机号" clearable style="width: 220px;" @keyup.enter="handleWalletSearch" />
            </el-form-item>
            <el-form-item label="钱包状态">
              <el-select v-model="walletSearchForm.status" placeholder="全部状态" clearable style="width: 160px;">
                <el-option label="正常" value="active" />
                <el-option label="已停用" value="deactivated" />
              </el-select>
            </el-form-item>
            <el-form-item>
              <el-button type="primary" @click="handleWalletSearch">查询</el-button>
              <el-button @click="handleWalletReset">重置</el-button>
            </el-form-item>
          </el-form>
        </el-card>

        <el-card>
          <el-table v-loading="walletLoading" :data="walletTableData" stripe @row-dblclick="handleViewLedger">
            <el-table-column prop="employee_name" label="员工姓名" min-width="130">
              <template #default="{ row }">{{ row.employee_name || '-' }}</template>
            </el-table-column>
            <el-table-column prop="employee_no" label="工号" width="130">
              <template #default="{ row }">{{ row.employee_no || '-' }}</template>
            </el-table-column>
            <el-table-column prop="phone" label="手机号" width="140">
              <template #default="{ row }">{{ row.phone || '-' }}</template>
            </el-table-column>
            <el-table-column prop="available_amount_yuan" label="钱包余额" width="130">
              <template #default="{ row }">¥{{ row.available_amount_yuan || '0.00' }}</template>
            </el-table-column>
            <el-table-column prop="frozen_amount_yuan" label="冻结金额" width="130">
              <template #default="{ row }">¥{{ row.frozen_amount_yuan || '0.00' }}</template>
            </el-table-column>
            <el-table-column prop="status" label="状态" width="100">
              <template #default="{ row }">
                <el-tag :type="row.status === 'active' ? 'success' : 'info'">
                  {{ row.status === 'active' ? '正常' : '已停用' }}
                </el-tag>
              </template>
            </el-table-column>
            <el-table-column label="操作" width="120" fixed="right">
              <template #default="{ row }">
                <el-button link type="primary" @click="handleViewLedger(row)">查看流水</el-button>
              </template>
            </el-table-column>
          </el-table>

          <div class="pagination-wrapper">
            <el-pagination
              v-model:current-page="walletPagination.page"
              v-model:page-size="walletPagination.pageSize"
              :total="walletPagination.total"
              :page-sizes="[10, 20, 50]"
              layout="total, sizes, prev, pager, next, jumper"
              @size-change="onWalletSizeChange"
              @current-change="onWalletCurrentChange"
            />
          </div>
        </el-card>
      </el-tab-pane>
    </el-tabs>

    <!-- ════════════ 钱包流水详情弹窗 ════════════ -->
    <el-dialog
      v-model="ledgerDialogVisible"
      :title="`钱包流水 — ${currentWalletName}`"
      width="800px"
      top="5vh"
      destroy-on-close
    >
      <div v-loading="ledgerLoading" class="ledger-list">
        <div v-for="item in ledgerList" :key="item._id" class="ledger-item">
          <div class="ledger-left">
            <div class="ledger-type">
              <span class="ledger-dot" :class="ledgerDotClass(item)"></span>
              {{ ledgerTypeText(item.ledger_type) }}
            </div>
            <div class="ledger-time"><BeijingDateTime :value="item.created_at" /></div>
            <div v-if="item.remark" class="ledger-remark">{{ item.remark }}</div>
          </div>
          <div class="ledger-right">
            <div class="ledger-amount" :class="ledgerAmountClass(item)">
              {{ ledgerAmountPrefix(item) }}¥{{ item.amount_yuan }}
            </div>
            <div class="ledger-balance">余额 ¥{{ item.balance_after_yuan || '0.00' }}</div>
          </div>
        </div>

        <div v-if="ledgerList.length === 0 && !ledgerLoading" class="ledger-empty">暂无流水记录</div>

        <div v-if="ledgerHasMore" class="ledger-load-more">
          <el-button link type="primary" :loading="ledgerLoadingMore" @click="handleLoadMoreLedgers">
            加载更多
          </el-button>
        </div>
      </div>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { onMounted, reactive, ref, computed } from 'vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import BeijingDateTime from '@/components/common/BeijingDateTime.vue';
import { walletApi, type WalletManagementSummary, type WithdrawOrder, type WalletAccountItem, type LedgerRecord, LEDGER_TYPE_MAP } from '@/api/modules/wallet';

// ─── Tab ───
const activeTab = ref('withdraw');

// ════════════ Tab 1：提现审核 ════════════
const loading = ref(false);
const tableData = ref<WithdrawOrder[]>([]);
const searchForm = reactive({ status: '' });
const pagination = reactive({ page: 1, pageSize: 20, total: 0 });
const walletSummary = reactive<WalletManagementSummary>({
  wallet_account_count: 0,
  wallet_available_amount: 0,
  wallet_frozen_amount: 0,
  wallet_unwithdrawn_amount: 0,
  wallet_available_amount_yuan: '0.00',
  wallet_frozen_amount_yuan: '0.00',
  wallet_unwithdrawn_amount_yuan: '0.00'
});

function formatFen(value: number) {
  return (Number(value || 0) / 100).toFixed(2);
}

function statusText(status: string) {
  const map: Record<string, string> = {
    APPLIED: '已申请',
    RISK_REVIEW: '待复核',
    APPROVED: '待打款',
    PAYING: '打款中',
    SUCCESS: '已到账',
    FAILED: '失败',
    CLOSED: '已关闭'
  };
  return map[status] || status || '-';
}

function statusType(status: string) {
  const map: Record<string, 'success' | 'warning' | 'info' | 'danger' | 'primary'> = {
    RISK_REVIEW: 'warning',
    APPROVED: 'primary',
    PAYING: 'warning',
    SUCCESS: 'success',
    FAILED: 'danger',
    CLOSED: 'info'
  };
  return map[status] || 'info';
}

function canReview(row: WithdrawOrder) {
  return ['APPLIED', 'RISK_REVIEW'].includes(row.status);
}

async function loadData() {
  loading.value = true;
  try {
    const [result, summary] = await Promise.all([
      walletApi.listWithdrawOrders({
        page: pagination.page,
        pageSize: pagination.pageSize,
        status: searchForm.status || undefined
      }),
      walletApi.getManagementSummary()
    ]);
    tableData.value = result.list;
    pagination.total = result.total;
    Object.assign(walletSummary, summary || {});
  } catch (err: any) {
    ElMessage.error(err?.message || '微信发薪管理数据加载失败');
  } finally {
    loading.value = false;
  }
}

function handleSearch() {
  pagination.page = 1;
  loadData();
}

function handleReset() {
  searchForm.status = '';
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

async function handleApprove(row: WithdrawOrder) {
  const { value } = await ElMessageBox.prompt('请输入审核备注（可选）', '通过提现审核', {
    inputType: 'textarea',
    confirmButtonText: '通过',
    cancelButtonText: '取消'
  });
  await walletApi.approveWithdraw(row._id, value || '');
  ElMessage.success('提现审核已通过');
  await loadData();
}

async function handleReject(row: WithdrawOrder) {
  const { value } = await ElMessageBox.prompt('请输入驳回原因', '驳回提现申请', {
    inputType: 'textarea',
    inputValidator: (val) => !!String(val || '').trim() || '请填写驳回原因',
    confirmButtonText: '驳回并解冻',
    cancelButtonText: '取消',
    type: 'warning'
  });
  await walletApi.rejectWithdraw(row._id, value || '审核驳回');
  ElMessage.success('已驳回，冻结余额已解冻');
  await loadData();
}

async function handleTriggerPayment(row: WithdrawOrder) {
  await ElMessageBox.confirm(
    `确认对提现单 ${row.withdraw_no} 发起微信零钱打款？金额 ¥${formatFen(row.amount)}`,
    '触发微信打款',
    { type: 'warning', confirmButtonText: '确认打款', cancelButtonText: '取消' }
  );
  await walletApi.triggerPayment(row._id, '工资提现', row.real_name || row.employee_name);
  ElMessage.success('支付请求已提交');
  await loadData();
}

async function handleSyncPayment(row: WithdrawOrder) {
  if (!row.payment_order_id) return;
  await walletApi.syncPayment(row.payment_order_id);
  ElMessage.success('查单完成，状态已同步');
  await loadData();
}

// ════════════ Tab 2：员工钱包 ════════════
const walletLoading = ref(false);
const walletTableData = ref<WalletAccountItem[]>([]);
const walletSearchForm = reactive({ keyword: '', status: '' });
const walletPagination = reactive({ page: 1, pageSize: 20, total: 0 });
const walletAccountSummary = reactive({
  account_count: 0,
  total_available_yuan: '0.00',
  total_frozen_yuan: '0.00'
});

// 流水弹窗
const ledgerDialogVisible = ref(false);
const ledgerLoading = ref(false);
const ledgerLoadingMore = ref(false);
const currentWalletName = ref('');
const currentWalletId = ref('');
const ledgerList = ref<LedgerRecord[]>([]);
const ledgerPagination = reactive({ page: 1, pageSize: 10, total: 0 });

const ledgerHasMore = computed(() => {
  return ledgerList.value.length < ledgerPagination.total;
});

async function loadWalletList() {
  walletLoading.value = true;
  try {
    const result = await walletApi.listWalletAccounts({
      keyword: walletSearchForm.keyword || undefined,
      status: walletSearchForm.status || undefined,
      page: walletPagination.page,
      pageSize: walletPagination.pageSize
    });
    walletTableData.value = result.list;
    walletPagination.total = result.total;

    // 汇总数据从管理端 summary 获取
    const summary = await walletApi.getManagementSummary();
    walletAccountSummary.account_count = summary?.wallet_account_count || 0;
    walletAccountSummary.total_available_yuan = summary?.wallet_available_amount_yuan || '0.00';
    walletAccountSummary.total_frozen_yuan = summary?.wallet_frozen_amount_yuan || '0.00';
  } catch (err: any) {
    ElMessage.error(err?.message || '员工钱包列表加载失败');
  } finally {
    walletLoading.value = false;
  }
}

function handleWalletSearch() {
  walletPagination.page = 1;
  loadWalletList();
}

function handleWalletReset() {
  walletSearchForm.keyword = '';
  walletSearchForm.status = '';
  walletPagination.page = 1;
  loadWalletList();
}

function onWalletSizeChange(size: number) {
  walletPagination.pageSize = size;
  walletPagination.page = 1;
  loadWalletList();
}

function onWalletCurrentChange(page: number) {
  walletPagination.page = page;
  loadWalletList();
}

// 弹窗流水只展示两种终态：入账 / 提现成功
const SUMMARY_LEDGER_TYPES = ['SALARY_CREDIT', 'WITHDRAW_SUCCESS_DEDUCT'];

function ledgerDotClass(item: LedgerRecord) {
  if (item.ledger_type === 'SALARY_CREDIT') return 'dot-success';
  if (item.ledger_type === 'WITHDRAW_SUCCESS_DEDUCT') return 'dot-default';
  return 'dot-default';
}

function ledgerTypeText(type: string) {
  return LEDGER_TYPE_MAP[type] || type || '-';
}

// 收入型：余额增加；支出型：余额减少
function isIncomeType(ledgerType: string) {
  return ledgerType === 'SALARY_CREDIT';
}

function ledgerAmountClass(item: LedgerRecord) {
  return isIncomeType(item.ledger_type) ? 'amount-positive' : 'amount-negative';
}

function ledgerAmountPrefix(item: LedgerRecord) {
  return isIncomeType(item.ledger_type) ? '+' : '-';
}

async function handleViewLedger(row: WalletAccountItem) {
  currentWalletName.value = row.employee_name || `(${row.employee_no || row.wallet_account_id?.slice(-6)})`;
  currentWalletId.value = row.wallet_account_id;
  ledgerList.value = [];
  ledgerPagination.page = 1;
  ledgerPagination.total = 0;
  ledgerDialogVisible.value = true;
  await loadLedgerData();
}

async function loadLedgerData() {
  if (!currentWalletId.value) return;
  ledgerLoading.value = true;
  try {
    const result = await walletApi.listWalletLedgers({
      wallet_account_id: currentWalletId.value,
      ledger_types: SUMMARY_LEDGER_TYPES,
      page: ledgerPagination.page,
      pageSize: ledgerPagination.pageSize
    });
    if (ledgerPagination.page === 1) {
      ledgerList.value = result.list;
    } else {
      ledgerList.value = [...ledgerList.value, ...result.list];
    }
    ledgerPagination.total = result.total;
  } catch (err: any) {
    ElMessage.error(err?.message || '钱包流水加载失败');
  } finally {
    ledgerLoading.value = false;
    ledgerLoadingMore.value = false;
  }
}

async function handleLoadMoreLedgers() {
  if (ledgerLoadingMore.value) return;
  ledgerLoadingMore.value = true;
  ledgerPagination.page += 1;
  await loadLedgerData();
}

// ─── 初始化 ───
onMounted(loadData);
</script>

<style scoped lang="scss">
.wallet-withdrawals-page {
  .page-tabs {
    :deep(.el-tabs__header) {
      margin-bottom: 16px;
    }
  }

  .hero-card {
    margin-bottom: 16px;
    background: linear-gradient(135deg, #f5fbf7 0%, #e8f4ff 52%, #fff7e8 100%);
    border: none;
  }

  .hero-content {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 18px;
  }

  .eyebrow {
    margin: 0 0 6px;
    color: #16784c;
    font-size: 13px;
    font-weight: 700;
    letter-spacing: 0.08em;
  }

  h2 {
    margin: 0;
    color: #1f2d3d;
    font-size: 24px;
  }

  .hero-desc {
    margin: 8px 0 0;
    color: #667085;
  }

  .filter-card,
  .safety-alert {
    margin-bottom: 16px;
  }

  .summary-grid,
  .wallet-summary-grid {
    display: grid;
    gap: 16px;
    margin-bottom: 16px;
  }

  .summary-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .wallet-summary-grid {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }

  .summary-card {
    border: none;

    &.merchant {
      background: linear-gradient(135deg, #0f6b57 0%, #2fa36d 58%, #f0c15f 100%);
      color: #fff;
    }

    &.wallet {
      background: linear-gradient(135deg, #f8fafc 0%, #eff6ff 50%, #fff7ed 100%);

      &.green {
        background: linear-gradient(135deg, #e8f5e9 0%, #c8e6c9 100%);
        color: #1b5e20;
      }

      &.blue {
        background: linear-gradient(135deg, #e3f2fd 0%, #bbdefb 100%);
        color: #0d47a1;
      }

      &.orange {
        background: linear-gradient(135deg, #fff3e0 0%, #ffe0b2 100%);
        color: #e65100;
      }
    }
  }

  .summary-label {
    font-size: 14px;
    font-weight: 700;
    opacity: 0.82;
  }

  .summary-value {
    margin-top: 12px;
    font-size: 34px;
    font-weight: 800;
    letter-spacing: -0.03em;
  }

  .summary-sub {
    display: flex;
    justify-content: space-between;
    gap: 12px;
    margin-top: 12px;
    color: inherit;
    font-size: 13px;
    opacity: 0.78;
  }

  .pagination-wrapper {
    display: flex;
    flex-shrink: 0;
    justify-content: flex-end;
    margin-top: 18px;
  }
}

// ─── 钱包流水弹窗 ───
.ledger-list {
  max-height: 500px;
  overflow-y: auto;
}

.ledger-item {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  padding: 14px 0;
  border-bottom: 1px solid #f0f0f0;
  gap: 16px;

  &:last-child {
    border-bottom: none;
  }
}

.ledger-left {
  flex: 1;
  min-width: 0;
}

.ledger-type {
  font-size: 15px;
  font-weight: 600;
  color: #1f2d3d;
  display: flex;
  align-items: center;
  gap: 8px;
}

.ledger-dot {
  display: inline-block;
  width: 8px;
  height: 8px;
  border-radius: 50%;
  flex-shrink: 0;

  &.dot-success { background: #67c23a; }
  &.dot-warning { background: #e6a23c; }
  &.dot-info { background: #909399; }
  &.dot-default { background: #409eff; }
}

.ledger-time {
  font-size: 12px;
  color: #909399;
  margin-top: 4px;
}

.ledger-remark {
  font-size: 12px;
  color: #909399;
  margin-top: 2px;
}

.ledger-right {
  text-align: right;
  flex-shrink: 0;
}

.ledger-amount {
  font-size: 16px;
  font-weight: 700;
  font-variant-numeric: tabular-nums;

  &.amount-positive { color: #67c23a; }
  &.amount-negative { color: #f56c6c; }
}

.ledger-balance {
  font-size: 12px;
  color: #909399;
  margin-top: 4px;
}

.ledger-empty {
  text-align: center;
  padding: 40px 0;
  color: #909399;
}

.ledger-load-more {
  text-align: center;
  padding: 16px 0 8px;
}

@media (max-width: 768px) {
  .wallet-withdrawals-page {
    .hero-content {
      align-items: flex-start;
      flex-direction: column;
    }

    .summary-grid {
      grid-template-columns: 1fr;
    }

    .wallet-summary-grid {
      grid-template-columns: 1fr;
    }

    .summary-sub {
      flex-direction: column;
    }
  }
}
</style>
