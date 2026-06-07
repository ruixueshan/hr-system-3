// pages/my/wallet-apply/wallet-apply.ts
const api = require('../../../utils/api');

Page({
  data: {
    step: 1,
    inputName: '',
    loading: false,
  },

  onStartApply() {
    this.setData({ step: 2 });
  },

  onNameInput(e: any) {
    this.setData({ inputName: e.detail.value });
  },

  async onSubmit() {
    const name = String(this.data.inputName || '').trim();
    if (!name) {
      wx.showToast({ title: '请输入姓名', icon: 'none' });
      return;
    }

    this.setData({ step: 3, loading: true });

    try {
      await api.callFunction('wallet', 'bind', { realName: name }, { showLoading: false });
      this.setData({ step: 4, loading: false });
      setTimeout(() => {
        wx.redirectTo({ url: '/pages/my/wallet/wallet' });
      }, 1000);
    } catch (err: any) {
      console.error('[bindWallet]', err);
      this.setData({ step: 2, loading: false });
    }
  },
});

export {};
