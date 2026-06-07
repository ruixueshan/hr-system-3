// pages/my/wallet/wallet.ts
// 员工钱包页：只调用业务云函数，不直接触达 CloudRun 支付服务。
const api = require('../../../utils/api');

const WITHDRAW_STATUS_TEXT: Record<string, string> = {
  APPLIED: '已申请',
  RISK_REVIEW: '待审核',
  APPROVED: '已通过',
  PAYING: '打款中',
  SUCCESS: '已到账',
  FAILED: '失败已退回',
  CLOSED: '已关闭'
};

const LEDGER_TYPE_TEXT: Record<string, string> = {
  SALARY_CREDIT: '薪资入账',
  INCOME: '薪资入账',
  WITHDRAW_FREEZE: '提现冻结',
  WITHDRAW_SUCCESS_DEDUCT: '提现到账扣减',
  WITHDRAW_SUCCESS: '提现成功',
  WITHDRAW_FAILED_UNFREEZE: '退回入账',
  WITHDRAW_REJECT_UNFREEZE: '退回入账',
  MANUAL_ADJUST: '人工调整',
  ADJUST: '人工调整'
};

const VISIBLE_WITHDRAW_STATUSES = ['APPLIED', 'RISK_REVIEW', 'APPROVED', 'PAYING', 'SUCCESS', 'FAILED'];
// 最近入账：只展示资金流入的钱包流水
const VISIBLE_CREDIT_LEDGER_TYPES = [
  'SALARY_CREDIT',
  'INCOME',
  'WITHDRAW_FAILED_UNFREEZE',
  'WITHDRAW_REJECT_UNFREEZE',
  'MANUAL_ADJUST',
  'ADJUST'
];
const AUTO_PAYMENT_LIMIT_YUAN = 10000;
const WECHAT_WITHDRAW_SINGLE_LIMIT_YUAN = 5000;
const WECHAT_WITHDRAW_DAILY_LIMIT_YUAN = 10000;
const POPUP_PAGE_SIZE = 10; // 弹窗每页加载数量
const WITHDRAW_REQUEST_CACHE_KEY = 'wallet_withdraw_request_draft';
const WITHDRAW_REQUEST_TTL_MS = 10 * 60 * 1000;

function money(value: any): string {
  if (value === undefined || value === null || value === '') return '0.00';
  const num = Number(value);
  return Number.isFinite(num) ? num.toFixed(2) : '0.00';
}

function buildClientRequestId(): string {
  return `wd_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

function getWithdrawClientRequestId(amountFen: number): string {
  const now = Date.now();
  const draft = wx.getStorageSync(WITHDRAW_REQUEST_CACHE_KEY) || {};
  if (
    draft.amount_fen === amountFen
    && draft.client_request_id
    && now - Number(draft.created_at || 0) < WITHDRAW_REQUEST_TTL_MS
  ) {
    return draft.client_request_id;
  }

  const clientRequestId = buildClientRequestId();
  wx.setStorageSync(WITHDRAW_REQUEST_CACHE_KEY, {
    amount_fen: amountFen,
    client_request_id: clientRequestId,
    created_at: now
  });
  return clientRequestId;
}

function clearWithdrawClientRequestId(clientRequestId: string) {
  const draft = wx.getStorageSync(WITHDRAW_REQUEST_CACHE_KEY) || {};
  if (draft.client_request_id === clientRequestId) {
    wx.removeStorageSync(WITHDRAW_REQUEST_CACHE_KEY);
  }
}

// UTC 时间 → 北京时间（UTC+8）
function toBeijingTime(isoString: string): { date: string; time: string } {
  if (!isoString) return { date: '', time: '' };
  const d = new Date(isoString);
  if (isNaN(d.getTime())) return { date: '', time: '' };
  const bj = new Date(d.getTime() + 8 * 60 * 60 * 1000);
  const y = bj.getUTCFullYear();
  const m = String(bj.getUTCMonth() + 1).padStart(2, '0');
  const day = String(bj.getUTCDate()).padStart(2, '0');
  const h = String(bj.getUTCHours()).padStart(2, '0');
  const min = String(bj.getUTCMinutes()).padStart(2, '0');
  return { date: `${y}-${m}-${day}`, time: `${h}:${min}` };
}

function formatWithdrawOrder(order: any) {
  const status = order && order.status ? String(order.status) : '';
  const bj = toBeijingTime(order && order.created_at);
  return {
    ...order,
    amount_yuan: money(order && order.amount_yuan),
    status_text: WITHDRAW_STATUS_TEXT[status] || status || '未知状态',
    created_date: bj.date,
    created_time: bj.time
  };
}

function formatLedger(ledger: any) {
  const ledgerType = ledger && ledger.ledger_type ? String(ledger.ledger_type) : '';
  const bj = toBeijingTime(ledger && ledger.created_at);
  return {
    ...ledger,
    amount_yuan: money(ledger && ledger.amount_yuan),
    ledger_type_text: LEDGER_TYPE_TEXT[ledgerType] || ledgerType || '钱包流水',
    created_date: bj.date,
    created_time: bj.time
  };
}

Page({
  walletLoadAt: 0,

  data: {
    loading: true,
    submitting: false,
    walletEnabled: false,
    balance: '0.00',
    frozenAmount: '0.00',
    totalIncome: '0.00',
    totalWithdrawn: '0.00',
    transferAuthStatus: 'NONE',
    transferAuthText: '未开通免确认收款授权',
    todayWithdrawn: '0.00',
    todayRemaining: WECHAT_WITHDRAW_DAILY_LIMIT_YUAN.toFixed(2),
    withdrawAmount: '',
    transactions: [] as any[],
    withdrawOrders: [] as any[],

    // === 弹窗状态 ===
    showWithdrawPopup: false,
    showTransactionPopup: false,
    popupWithdrawOrders: [] as any[],
    popupTransactions: [] as any[],
    withdrawPage: 1,
    transactionPage: 1,
    withdrawHasMore: true,
    transactionHasMore: true,
    withdrawLoadingMore: false,
    transactionLoadingMore: false,
  },

  onLoad() {
    this.loadWallet({ force: true });
  },

  onShow() {
    this.loadWallet();
  },

  onPullDownRefresh() {
    this.loadWallet({ force: true }).finally(() => wx.stopPullDownRefresh());
  },

  async loadWallet(options: { force?: boolean } = {}) {
    const now = Date.now();
    if (!options.force && this.walletLoadAt && now - this.walletLoadAt < 30000) {
      return;
    }

    this.walletLoadAt = now;
    this.setData({ loading: true });

    try {
      // 获取钱包摘要：传入 ledger_types 让服务端只返回入账流水，避免被提现记录淹没
      const summary = await api.callFunction('wallet', 'get-summary', {
        limit: 3,
        withdraw_limit: 10,
        ledger_types: VISIBLE_CREDIT_LEDGER_TYPES
      }, { showLoading: false });

      const orderList = Array.isArray(summary.withdraw_orders) ? summary.withdraw_orders : [];
      // 服务端已按 ledger_types 过滤，前端直接取前 3 条（兜底再过滤一次）
      const recentLedgers = Array.isArray(summary.ledgers)
        ? summary.ledgers
          .filter((item: any) => VISIBLE_CREDIT_LEDGER_TYPES.includes(String(item.ledger_type || '')))
          .slice(0, 3)
          .map(formatLedger)
        : [];
      const recentOrders = orderList
        .filter((item: any) => VISIBLE_WITHDRAW_STATUSES.includes(String(item.status || '')))
        .slice(0, 3)
        .map(formatWithdrawOrder);
      const authStatus = summary.transfer_auth_status || (summary.wechat_transfer_authorized ? 'TAKING_EFFECT' : 'NONE');

      this.setData({
        loading: false,
        walletEnabled: Boolean(summary.wallet_enabled),
        balance: money(summary.available_amount_yuan),
        frozenAmount: money(summary.frozen_amount_yuan),
        totalIncome: money(summary.total_income_yuan),
        totalWithdrawn: money(summary.total_withdrawn_yuan),
        todayWithdrawn: money(summary.today_withdrawn_yuan),
        todayRemaining: money(summary.today_remaining_yuan),
        transferAuthStatus: authStatus,
        transferAuthText: summary.transfer_auth_text || this.authStatusText(authStatus),
        transactions: recentLedgers,
        withdrawOrders: recentOrders
      });
    } catch (err) {
      console.error('[wallet] load failed:', err);
      this.setData({ loading: false });
    }
  },

  authStatusText(status: string) {
    const map: Record<string, string> = {
      NONE: '未开通免确认收款授权',
      WAIT_USER_CONFIRM: '待微信确认授权',
      TAKING_EFFECT: '已开通免确认收款授权',
      CLOSED: '授权已关闭',
      FAILED: '授权失败'
    };
    return map[status] || status || '未知授权状态';
  },

  async onAuthorizeTransfer() {
    if (!wx.canIUse || !wx.canIUse('requestMerchantTransfer')) {
      wx.showModal({ title: '微信版本过低', content: '请升级微信后再开通免确认收款授权。', showCancel: false });
      return;
    }

    try {
      const result = await api.callFunction('payment-proxy', 'create-authorization', {}, {
        showLoading: true,
        loadingText: '申请授权中...'
      });

      if (!result.package_info) {
        wx.showToast({ title: '授权参数缺失', icon: 'none' });
        return;
      }

      wx.requestMerchantTransfer({
        mchId: result.mch_id,
        appId: result.app_id || wx.getAccountInfoSync().miniProgram.appId,
        package: result.package_info,
        success: async () => {
          wx.showLoading({ title: '同步授权中...', mask: true });
          await api.callFunction('payment-proxy', 'query-authorization', {
            out_authorization_no: result.out_authorization_no
          }, { showLoading: false }).catch(() => null);
          wx.hideLoading();
          wx.showToast({ title: '授权已返回', icon: 'success' });
          await this.loadWallet({ force: true });
        },
        fail: (err: any) => {
          console.error('[wallet] requestMerchantTransfer failed:', err);
          wx.showToast({ title: '授权未完成', icon: 'none' });
        }
      });
    } catch (err) {
      console.error('[wallet] create authorization failed:', err);
    }
  },

  onAmountInput(e: any) {
    this.setData({ withdrawAmount: e.detail.value });
  },

  goToApply() {
    wx.navigateTo({ url: '/pages/my/wallet-apply/wallet-apply' });
  },

  async onWithdraw() {
    if (!this.data.walletEnabled) {
      wx.showToast({ title: '请先开通钱包', icon: 'none' });
      return;
    }

    if (this.data.transferAuthStatus !== 'TAKING_EFFECT') {
      wx.showToast({ title: '请先开通免确认收款授权', icon: 'none' });
      return;
    }

    const amount = Number(this.data.withdrawAmount);
    if (!Number.isFinite(amount) || amount <= 0) {
      wx.showToast({ title: '请输入提现金额', icon: 'none' });
      return;
    }

    if (amount > WECHAT_WITHDRAW_SINGLE_LIMIT_YUAN) {
      wx.showToast({ title: '单笔提现不能超过5000元', icon: 'none' });
      return;
    }

    const todayWithdrawn = Number(this.data.todayWithdrawn || 0);
    const todayRemaining = Math.max(0, WECHAT_WITHDRAW_DAILY_LIMIT_YUAN - todayWithdrawn);
    if (amount > todayRemaining) {
      wx.showToast({ title: `今日剩余额度¥${todayRemaining.toFixed(2)}`, icon: 'none' });
      return;
    }

    const available = Number(this.data.balance || 0);
    if (amount > available) {
      wx.showToast({ title: '余额不足', icon: 'none' });
      return;
    }

    wx.showModal({
      title: '确认提现',
      content: `本次提现 ¥${amount.toFixed(2)}，提交后会先冻结余额并进入打款队列，系统将在后台自动发起微信零钱打款。`,
      success: async (res) => {
        if (!res.confirm) return;
        this.setData({ submitting: true });
        try {
          const amountFen = Math.round(amount * 100);
          const clientRequestId = getWithdrawClientRequestId(amountFen);
          const result = await api.callFunction('withdraw', 'apply-withdraw', {
            amount_fen: amountFen,
            client_request_id: clientRequestId
          }, { showLoading: true, loadingText: '提交中...' });

          if (['APPROVED', 'PAYING'].includes(String(result.status || '')) && amount < AUTO_PAYMENT_LIMIT_YUAN) {
            wx.showToast({
              title: result.auto_payment_status === 'queued' ? '已提交打款' : '打款处理中',
              icon: 'success'
            });
          } else {
            wx.showToast({ title: '待人工审核', icon: 'success' });
          }

          this.setData({ withdrawAmount: '' });
          clearWithdrawClientRequestId(clientRequestId);
          await this.loadWallet({ force: true });
          setTimeout(() => this.loadWallet({ force: true }), 5000);
        } catch (err) {
          console.error('[wallet] apply withdraw failed:', err);
        } finally {
          this.setData({ submitting: false });
        }
      }
    });
  },

  statusText(status: string) {
    return WITHDRAW_STATUS_TEXT[status] || status || '未知';
  },

  // ============ 弹窗逻辑 ============

  /** 打开提现记录弹窗 */
  async onShowRecentWithdrawals() {
    // 重置分页
    this.setData({
      showWithdrawPopup: true,
      popupWithdrawOrders: [],
      withdrawPage: 1,
      withdrawHasMore: true,
      withdrawLoadingMore: false
    });
    await this._loadWithdrawPage(1);
  },

  /** 关闭提现记录弹窗 */
  closeWithdrawPopup() {
    this.setData({ showWithdrawPopup: false });
  },

  /** 上拉加载更多提现记录 */
  async loadMoreWithdrawals() {
    if (!this.data.withdrawHasMore || this.data.withdrawLoadingMore) return;
    const nextPage = this.data.withdrawPage + 1;
    await this._loadWithdrawPage(nextPage);
  },

  /** 加载指定页的提现记录 */
  async _loadWithdrawPage(page: number) {
    this.setData({ withdrawLoadingMore: true });
    try {
      const PAGE_SIZE = POPUP_PAGE_SIZE;
      const result = await api.callFunction('wallet', 'list-withdraw-orders', {
        page,
        pageSize: PAGE_SIZE,
        status: undefined // 显示所有状态的提现
      }, { showLoading: false });

      const list = Array.isArray(result.list) ? result.list.map(formatWithdrawOrder) : [];
      const total = result.total || 0;
      const loadedCount = (page - 1) * PAGE_SIZE + list.length;
      const hasMore = loadedCount < total;

      this.setData({
        popupWithdrawOrders: page === 1 ? list : [...this.data.popupWithdrawOrders, ...list],
        withdrawPage: page,
        withdrawHasMore: hasMore,
        withdrawLoadingMore: false
      });
    } catch (err) {
      console.error('[wallet] load withdrawals page failed:', err);
      this.setData({ withdrawLoadingMore: false });
    }
  },

  /** 打开入账记录弹窗 */
  async onShowRecentTransactions() {
    // 重置分页
    this.setData({
      showTransactionPopup: true,
      popupTransactions: [],
      transactionPage: 1,
      transactionHasMore: true,
      transactionLoadingMore: false
    });
    await this._loadTransactionPage(1);
  },

  /** 关闭入账记录弹窗 */
  closeTransactionPopup() {
    this.setData({ showTransactionPopup: false });
  },

  /** 上拉加载更多入账记录 */
  async loadMoreTransactions() {
    if (!this.data.transactionHasMore || this.data.transactionLoadingMore) return;
    const nextPage = this.data.transactionPage + 1;
    await this._loadTransactionPage(nextPage);
  },

  /** 加载指定页的入账记录 */
  async _loadTransactionPage(page: number) {
    this.setData({ transactionLoadingMore: true });
    try {
      const PAGE_SIZE = POPUP_PAGE_SIZE;
      const result = await api.callFunction('wallet', 'list-ledgers', {
        page,
        pageSize: PAGE_SIZE,
        ledger_types: VISIBLE_CREDIT_LEDGER_TYPES
      }, { showLoading: false });

      const list = Array.isArray(result.list) ? result.list.map(formatLedger) : [];
      const total = result.total || 0;
      const loadedCount = (page - 1) * PAGE_SIZE + list.length;
      const hasMore = loadedCount < total;

      this.setData({
        popupTransactions: page === 1 ? list : [...this.data.popupTransactions, ...list],
        transactionPage: page,
        transactionHasMore: hasMore,
        transactionLoadingMore: false
      });
    } catch (err) {
      console.error('[wallet] load ledgers page failed:', err);
      this.setData({ transactionLoadingMore: false });
    }
  }
});

export {};
