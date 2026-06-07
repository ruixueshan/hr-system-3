// pages/my/my.ts
const api = require('../../utils/api');
const format = require('../../utils/format');

Page({
  data: {
    userInfo: {},
    maskedPhone: '',
    formattedSalary: '0',
    walletBalance: '0.00',
    showLoginSheet: false,
    pendingRefCode: ''
  },

  onLoad(options: any) {
    const referralCode = this.extractReferralCode(options);
    if (referralCode) {
      this.handleReferralBind(referralCode);
    }
    this.loadUserInfo();
  },

  onShow() {
    this.loadUserInfo();
  },

  async loadUserInfo() {
    try {
      const token = wx.getStorageSync('token');
      if (!token) {
        this.setData({ showLoginSheet: true, userInfo: {}, maskedPhone: '', formattedSalary: '0', walletBalance: '0.00' });
        return;
      }

      const [userInfo, walletSummary] = await Promise.all([
        api.callFunction('users', 'get-profile', {}),
        api.callFunction('wallet', 'get-summary', { limit: 1, withdraw_limit: 1 }, { showLoading: false }).catch(() => null)
      ]);
      const maskedPhone = format.formatPhone(userInfo.phone || '');

      const totalSalary = userInfo.total_salary || 0;
      const formattedSalary = totalSalary.toFixed ? totalSalary.toFixed(0) : Math.floor(totalSalary);
      const walletBalance = this.formatMoney(walletSummary?.available_amount_yuan);

      this.setData({
        userInfo,
        maskedPhone,
        formattedSalary,
        walletBalance
      });

      const app = getApp();
      app.globalData.userInfo = userInfo;
    } catch (err: any) {
      console.error('加载用户信息失败:', err);
      
      // 显示错误提示
      let errorMsg = '加载用户信息失败';
      
      // 检查云函数返回的错误码
      if (err.result && err.result.code) {
        const code = err.result.code;
        if (code === 401) {
          errorMsg = '登录状态失效，请重新登录';
        } else if (code === 404) {
          errorMsg = '用户信息不存在，请重新登录';
        } else if (code === 500) {
          errorMsg = '服务器错误，请稍后重试';
        }
      } else if (err.message && err.message.includes('用户不存在')) {
        errorMsg = '用户信息不存在，请重新登录';
      } else if (err.errCode === -1) {
        errorMsg = '网络错误，请检查网络连接';
      } else if (err.message?.includes('未授权')) {
        errorMsg = '登录已过期，请重新登录';
      }
      
      wx.showToast({ title: errorMsg, icon: 'none' });
    }
  },

  goToProfile() {
    if (!this.ensureLogin()) return;
    wx.navigateTo({ url: '/pages/my/profile/profile' });
  },

  goToPage(e: any) {
    if (!this.ensureLogin()) return;
    const url = e.currentTarget.dataset.url;
    wx.navigateTo({ url });
  },

  onJoinGroupStart() {
    console.log('[joinGroup] 用户点击入群按钮');
  },

  onJoinGroupComplete(e: any) {
    const { errcode, notifytype } = e.detail || {};
    if (errcode === 0) {
      wx.showToast({ title: '加入群聊成功', icon: 'success' });
    } else if (errcode === -3006) {
      if (notifytype !== 1) wx.showToast({ title: '您已在群聊中', icon: 'none' });
    } else if (errcode === -3009) {
      wx.showToast({ title: '群聊已满员', icon: 'none' });
    } else if (errcode === -3010) {
      wx.showToast({ title: '群聊已解散', icon: 'none' });
    } else if (errcode) {
      wx.showToast({ title: '入群失败，请稍后重试', icon: 'none' });
    }
  },

  handleFeedback() {
    wx.showToast({ title: '意见反馈功能开发中', icon: 'none' });
  },

  handleLogout() {
    wx.showModal({
      title: '提示',
      content: '确定要退出登录吗？',
      success: (res) => {
        if (res.confirm) {
          const app = getApp();
          app.logout();
          this.setData({ showLoginSheet: true, userInfo: {}, maskedPhone: '', formattedSalary: '0', walletBalance: '0.00' });
        }
      }
    });
  },

  onLoginClose() {
    this.setData({ showLoginSheet: false });
  },

  onLoginSuccess() {
    this.setData({ showLoginSheet: false });
    this.loadUserInfo();

    const pendingRefCode = this.data.pendingRefCode || wx.getStorageSync('pendingAgentReferral')?.code || '';
    if (pendingRefCode) {
      this.handleReferralBind(pendingRefCode);
    }
  },

  extractReferralCode(options: any): string {
    const safeDecode = (value: any) => {
      try {
        return decodeURIComponent(String(value || ''));
      } catch (err) {
        return String(value || '');
      }
    };

    const normalizeCode = (raw: string) => {
      const value = String(raw || '').trim();
      if (!value) return '';

      if (!value.includes('=')) {
        return value;
      }

      const pairs = value.split('&');
      for (const pair of pairs) {
        const [key, val = ''] = pair.split('=');
        if (key === 'ref_code' || key === 'code' || key === 'scene') {
          return safeDecode(val).trim();
        }
      }

      return value;
    };

    const sceneCode = normalizeCode(safeDecode(options?.scene));
    if (sceneCode) return sceneCode;

    return normalizeCode(safeDecode(options?.ref_code));
  },

  async handleReferralBind(refCode: string) {
    const code = this.extractReferralCode({ scene: refCode });
    if (!code) return;

    try {
      const token = wx.getStorageSync('token');
      if (!token) {
        wx.setStorageSync('pendingAgentReferral', {
          code,
          created_at: Date.now()
        });
        this.setData({ pendingRefCode: code, showLoginSheet: true });
        return;
      }

      const localUserInfo = wx.getStorageSync('userInfo') || {};
      const currentUserInfo = this.data.userInfo as any;
      const candidateId = currentUserInfo?.id || currentUserInfo?._id || localUserInfo.id || localUserInfo._id || '';

      const scanResult = await api.callFunction('qrcode', 'scan', {
        code,
        user_id: candidateId
      }, { showLoading: false });

      if (!scanResult?.recommender_id) {
        return;
      }

      await api.callFunction('candidates', 'bind-scan-referral', {
        candidate_id: candidateId,
        code,
        recommender_id: scanResult.recommender_id,
        recommender_name: scanResult.recommender_name || ''
      }, { showLoading: false });

      wx.removeStorageSync('pendingAgentReferral');
      this.setData({ pendingRefCode: '' });
      wx.showToast({ title: '绑定成功', icon: 'success' });
    } catch (err) {
      console.error('绑定分销关系失败:', err);
    }
  },

  ensureLogin(): boolean {
    const token = wx.getStorageSync('token');
    if (!token) {
      wx.showToast({ title: '请先登录', icon: 'none' });
      this.setData({ showLoginSheet: true });
      return false;
    }
    return true;
  },

  formatMoney(value: any): string {
    if (value === undefined || value === null || value === '') return '0.00';
    const num = Number(value);
    return Number.isFinite(num) ? num.toFixed(2) : '0.00';
  }
});

export {};
