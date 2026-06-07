const api = require('../../utils/api');
const onboardQrCodeUtils = require('../../utils/qrcode');

function isValidDateStr(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(String(value || ''));
}

function normalizeName(value: string): string {
  return String(value || '').trim();
}

function isPlaceholderName(value: string): boolean {
  return /^候选人\d+$/u.test(normalizeName(value));
}

function isValidRealName(value: string): boolean {
  const name = normalizeName(value);
  return Boolean(name) && !/\d/u.test(name) && !isPlaceholderName(name);
}

Page({
  data: {
    code: '',
    qrInfo: null as any,
    loading: false,
    logging: false,
    submitting: false,
    isLoggedIn: false,
    form: {
      real_name: '',
      phone: '',
      id_card: '',
      join_date: '',
      settlement_mode: 'monthly'
    }
  },

  onLoad(options: any) {
    console.log('internal-onboard onLoad options:', options);
    
    const code = onboardQrCodeUtils.extractQrCodeFromOptions(options);
    
    if (!code) {
      wx.showToast({ title: '缺少入职码', icon: 'none' });
      setTimeout(() => wx.navigateBack(), 1200);
      return;
    }

    this.setData({
      code,
      isLoggedIn: !!wx.getStorageSync('token')
    });

    this.loadQrInfo();
    if (wx.getStorageSync('token')) {
      this.loadProfile();
    }
  },

  async loadQrInfo() {
    this.setData({ loading: true });
    try {
      console.log('loadQrInfo called with code:', this.data.code);
      
      const qrInfo = await api.callFunction('qrcode', 'scan', {
        code: this.data.code,
        user_id: getApp().globalData.userInfo?._id
      }, {
        loadingText: '识别入职码...'
      });

      console.log('qrInfo result:', qrInfo);

      if (!qrInfo) {
        throw new Error('入职码识别失败');
      }

      // qrInfo.type 是二维码类型，不是状态码
      if (qrInfo.type !== 'internal_onboard') {
        throw new Error('当前二维码不是内部入职码');
      }

      this.setData({
        qrInfo,
        'form.settlement_mode': 'monthly'
      });
    } catch (err: any) {
      console.error('loadQrInfo error:', err);
      wx.showToast({ title: err.message || '入职码识别失败', icon: 'none' });
      setTimeout(() => wx.navigateBack(), 2000);
    } finally {
      this.setData({ loading: false });
    }
  },

  async loadProfile() {
    try {
      const profile = await api.callFunction('users', 'get-profile', {}, {
        showLoading: false
      });

      this.setData({
        isLoggedIn: true,
        form: {
          ...this.data.form,
          real_name: isValidRealName(profile.real_name || profile.name) ? normalizeName(profile.real_name || profile.name) : '',
          phone: profile.phone || '',
          id_card: profile.id_card || ''
        }
      });

      const app = getApp();
      app.globalData.userInfo = profile;
      app.globalData.isLoggedIn = true;
    } catch (err) {
      console.error('加载资料失败:', err);
    }
  },

  onInput(e: any) {
    const field = e.currentTarget.dataset.field;
    this.setData({
      [`form.${field}`]: e.detail.value
    });
  },

  onJoinDateChange(e: any) {
    this.setData({
      'form.join_date': e.detail.value
    });
  },

  onSettlementModeChange(e: any) {
    this.setData({
      'form.settlement_mode': e.detail.value === 'daily' ? 'daily' : 'monthly'
    });
  },

  validateIdCard(idCard: string): boolean {
    return /^[1-9]\d{5}(19|20)\d{2}(0[1-9]|1[0-2])(0[1-9]|[12]\d|3[01])\d{3}[\dXx]$/.test(idCard);
  },

  validateForm() {
    const { form } = this.data;
    const realName = normalizeName(form.real_name);
    if (!realName) {
      wx.showToast({ title: '请输入真实姓名', icon: 'none' });
      return false;
    }
    if (!isValidRealName(realName)) {
      wx.showToast({ title: '姓名不能包含数字或候选人占位名', icon: 'none' });
      return false;
    }
    if (!/^1[3-9]\d{9}$/.test(form.phone)) {
      wx.showToast({ title: '请输入正确手机号', icon: 'none' });
      return false;
    }
    if (!this.validateIdCard(form.id_card)) {
      wx.showToast({ title: '请输入正确身份证号', icon: 'none' });
      return false;
    }
    if (!isValidDateStr(form.join_date)) {
      wx.showToast({ title: '请选择入职日期', icon: 'none' });
      return false;
    }
    if (form.settlement_mode === 'daily' && !this.data.qrInfo?.supports_daily) {
      wx.showToast({ title: '当前企业不支持日结', icon: 'none' });
      return false;
    }
    return true;
  },

  async onGetPhoneNumber(e: any) {
    if (e.detail.errMsg !== 'getPhoneNumber:ok') {
      wx.showToast({ title: '获取手机号失败', icon: 'none' });
      return;
    }

    this.setData({ logging: true });
    try {
      const result = await api.callFunction('auth', 'wechat-phone-login', {
        phoneCloudID: wx.cloud.CloudID(e.detail.cloudID),
        user_type: 'employee'
      }, {
        loadingText: '登录中...'
      });

      wx.setStorageSync('token', result.token);
      wx.setStorageSync('userInfo', result.userInfo);

      const app = getApp();
      app.globalData.userInfo = result.userInfo;
      app.globalData.isLoggedIn = true;

      this.setData({ isLoggedIn: true });
      await this.loadProfile();
      wx.showToast({ title: '登录成功', icon: 'success' });
    } catch (err: any) {
      wx.showToast({ title: err.message || '登录失败', icon: 'none' });
    } finally {
      this.setData({ logging: false });
    }
  },

  async handleSubmit() {
    if (!wx.getStorageSync('token')) {
      wx.showToast({ title: '请先登录后再入职登记', icon: 'none' });
      return;
    }
    if (!this.validateForm()) return;

    this.setData({ submitting: true });
    try {
      const result = await api.callFunction('qrcode', 'internal-onboard', {
        code: this.data.code,
        token: wx.getStorageSync('token'),
        ...this.data.form,
        real_name: normalizeName(this.data.form.real_name)
      }, {
        loadingText: '提交入职资料...'
      });

      wx.showModal({
        title: '入职登记完成',
        content: `企业：${result.company_name || this.data.qrInfo?.company_name || ''}\n岗位：${result.job_name || this.data.qrInfo?.job_name || ''}\n工号：${result.employee_no || '已生成'}`,
        showCancel: false,
        success: () => {
          wx.switchTab({ url: '/pages/my/my' });
        }
      });
    } catch (err: any) {
      wx.showToast({ title: err.message || '提交失败', icon: 'none' });
    } finally {
      this.setData({ submitting: false });
    }
  }
});

export {};
