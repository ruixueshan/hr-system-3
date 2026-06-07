import { callFunction } from '../cloud';

export interface WithdrawOrder {
  _id: string;
  withdraw_no: string;
  wallet_account_id: string;
  user_id: string;
  employee_id: string;
  employee_name?: string;
  employee_no?: string;
  real_name?: string;
  openid?: string;
  amount: number;
  amount_yuan?: string;
  status: string;
  risk_status?: string;
  risk_reason?: string;
  fail_reason?: string;
  payment_order_id?: string;
  payment_status?: string;
  payment_out_bill_no?: string;
  payment_fail_reason?: string;
  payment_last_query_error?: string;
  payment_last_query_at?: any;
  payment_query_fail_count?: number;
  apply_time?: any;
  created_at?: any;
  updated_at?: any;
  reviewed_at?: any;
  finished_at?: any;
}

export interface WalletAccountItem {
  wallet_account_id: string;
  employee_id: string;
  employee_name: string;
  employee_no: string;
  phone: string;
  status: string;
  available_amount: number;
  frozen_amount: number;
  available_amount_yuan: string;
  frozen_amount_yuan: string;
  created_at: any;
}

export interface LedgerRecord {
  _id: string;
  wallet_account_id: string;
  ledger_type: string;
  direction?: string;
  amount: number;
  balance_before?: number;
  balance_after?: number;
  frozen_before?: number;
  frozen_after?: number;
  amount_yuan: string;
  balance_before_yuan?: string;
  balance_after_yuan?: string;
  frozen_before_yuan?: string;
  frozen_after_yuan?: string;
  source?: string;
  source_id?: string;
  remark?: string;
  created_at: any;
}

export interface WalletManagementSummary {
  wallet_account_count: number;
  wallet_available_amount: number;
  wallet_frozen_amount: number;
  wallet_unwithdrawn_amount: number;
  wallet_available_amount_yuan: string;
  wallet_frozen_amount_yuan: string;
  wallet_unwithdrawn_amount_yuan: string;
}

export interface MerchantBalanceSummary {
  available_balance: number;
  pending_balance: number;
  total_balance: number;
  available_balance_yuan: string;
  pending_balance_yuan: string;
  total_balance_yuan: string;
}

export const walletApi = {
  async listWithdrawOrders(params: { page?: number; pageSize?: number; status?: string } = {}) {
    const data = await callFunction('wallet', 'list-withdraw-orders', {
      ...params,
      admin: true
    });
    return {
      list: (data?.list || []) as WithdrawOrder[],
      total: Number(data?.total || 0),
      page: Number(data?.page || params.page || 1),
      pageSize: Number(data?.pageSize || params.pageSize || 20)
    };
  },

  async getManagementSummary() {
    return callFunction('wallet', 'management-summary', {}) as Promise<WalletManagementSummary>;
  },

  async getMerchantBalance() {
    return callFunction('payment-proxy', 'get-merchant-balance', {}) as Promise<MerchantBalanceSummary>;
  },

  async listWalletAccounts(params: {
    keyword?: string;
    status?: string;
    page: number;
    pageSize: number;
  }) {
    const data = await callFunction('wallet', 'admin-list-wallet-accounts', params);
    return {
      list: (data?.list || []) as WalletAccountItem[],
      total: Number(data?.total || 0),
      page: Number(data?.page || params.page || 1),
      pageSize: Number(data?.pageSize || params.pageSize || 20)
    };
  },

  async listWalletLedgers(params: {
    wallet_account_id: string;
    ledger_types?: string[];
    page: number;
    pageSize: number;
  }) {
    const data = await callFunction('wallet', 'admin-list-ledgers', params);
    return {
      list: (data?.list || []) as LedgerRecord[],
      total: Number(data?.total || 0),
      page: Number(data?.page || params.page || 1),
      pageSize: Number(data?.pageSize || params.pageSize || 20)
    };
  },

  async approveWithdraw(id: string, remark = '') {
    return callFunction('wallet', 'approve-withdraw', {
      withdraw_order_id: id,
      remark
    });
  },

  async rejectWithdraw(id: string, remark = '') {
    return callFunction('wallet', 'reject-withdraw', {
      withdraw_order_id: id,
      remark
    });
  },

  async triggerPayment(id: string, remark = '工资提现', realName?: string) {
    const payload: any = {
      withdraw_order_id: id,
      remark
    };
    if (realName) payload.realName = realName;
    return callFunction('payment-proxy', 'create-payment', payload);
  },

  async syncPayment(paymentOrderId: string) {
    return callFunction('payment-proxy', 'sync-payment', {
      payment_order_id: paymentOrderId
    });
  }
};

// 钱包流水类型 → 中文标签
export const LEDGER_TYPE_MAP: Record<string, string> = {
  SALARY_CREDIT: '薪资入账',
  ADMIN_CREDIT: '手工入账',
  WITHDRAW_FREEZE: '提现冻结',
  WITHDRAW_SUCCESS_DEDUCT: '提现成功',
  WITHDRAW_FAILED_UNFREEZE: '提现失败',
  WITHDRAW_SUCCESS: '提现成功',
  WITHDRAW_REJECT_UNFREEZE: '提现驳回解冻',
  WITHDRAW_AUTO_FAILED_UNFREEZE: '自动打款失败解冻',
  WITHDRAW_EXTERNAL_UNFREEZE: '外部解冻',
  CREDIT: '入账',
  DEBIT: '出账'
};
