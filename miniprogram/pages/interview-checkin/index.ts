const api = require('../../utils/api');
const checkinQrCodeUtils = require('../../utils/qrcode');

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
    statusText: '请确认面试信息并填写签到资料。',
    statusType: 'info',
    form: {
      real_name: '',
      phone: ''
    }
  },

  onLoad(options: any) {
    const code = checkinQrCodeUtils.extractQrCodeFromOptions(options);
    if (!code) {
      wx.showToast({ title: '缺少签到码', icon: 'none' });
      setTimeout(() => wx.navigateBack(), 1200);
      return;
    }

    this.setData({
      code,
      isLoggedIn: !!wx.getStorageSync('token')
    });

    this.loadCheckinInfo();
  },

  async loadCheckinInfo() {
    this.setData({ loading: true, statusText: '正在识别签到码...', statusType: 'info' });
    try {
      const qrInfo = await api.callFunction('qrcode', 'checkin-preview', {
        code: this.data.code
      }, {
        loadingText: '识别签到码...'
      });

      if (!qrInfo || qrInfo.type !== 'interview_checkin') {
        throw new Error('当前二维码不是面试签到码');
      }

      const statusText = qrInfo.expired
        ? '该面试签到码已过期。'
        : (qrInfo.not_started ? '未到面试日期，暂不能签到。' : '签到码识别成功，请填写信息。');

      this.setData({
        qrInfo,
        statusText,
        statusType: qrInfo.expired || qrInfo.not_started ? 'error' : 'success',
        'form.real_name': isValidRealName(qrInfo.default_name || '') ? normalizeName(qrInfo.default_name) : this.data.form.real_name,
        'form.phone': qrInfo.default_phone || this.data.form.phone
      });

      if (wx.getStorageSync('token')) {
        await this.loadProfile();
      }
    } catch (err: any) {
      const message = api.getErrorMessage(err, '签到码识别失败，请重新扫码。');
      this.setData({ statusText: message, statusType: 'error' });
      wx.showToast({ title: message, icon: 'none' });
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
        'form.real_name': isValidRealName(profile.real_name || profile.name) ? normalizeName(profile.real_name || profile.name) : this.data.form.real_name,
        'form.phone': profile.phone || profile.account_phone || this.data.form.phone
      });

      const app = getApp();
      app.globalData.userInfo = profile;
      app.globalData.isLoggedIn = true;
    } catch (err) {
      console.error('加载用户资料失败:', err);
    }
  },

  onInput(e: any) {
    const field = e.currentTarget.dataset.field;
    this.setData({
      [`form.${field}`]: e.detail.value,
      statusText: '信息已更新，确认无误后可提交签到。',
      statusType: 'info'
    });
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
        user_type: 'candidate'
      }, {
        loadingText: '登录中...'
      });

      wx.setStorageSync('token', result.token);
      wx.setStorageSync('userInfo', result.userInfo);

      const app = getApp();
      app.globalData.userInfo = result.userInfo;
      app.globalData.isLoggedIn = true;

      this.setData({
        isLoggedIn: true,
        'form.phone': result.userInfo?.phone || result.userInfo?.account_phone || this.data.form.phone
      });
      await this.loadProfile();
      wx.showToast({ title: '登录成功', icon: 'success' });
    } catch (err: any) {
      wx.showToast({ title: err.message || '登录失败', icon: 'none' });
    } finally {
      this.setData({ logging: false });
    }
  },

  validateForm() {
    const { form, qrInfo, loading, submitting } = this.data;
    if (loading) {
      wx.showToast({ title: '签到码识别中', icon: 'none' });
      return false;
    }
    if (submitting) {
      wx.showToast({ title: '正在签到，请稍候', icon: 'none' });
      return false;
    }
    if (!qrInfo || qrInfo.expired || qrInfo.not_started) {
      wx.showToast({ title: '签到码当前不可用', icon: 'none' });
      return false;
    }
    if (!wx.getStorageSync('token')) {
      wx.showToast({ title: '请先登录后签到', icon: 'none' });
      return false;
    }
    if (!isValidRealName(form.real_name)) {
      wx.showToast({ title: '请输入真实姓名', icon: 'none' });
      return false;
    }
    const phone = String(form.phone || '').replace(/\s+/g, '');
    if (!/^1[3-9]\d{9}$/.test(phone)) {
      wx.showToast({ title: '请输入正确手机号', icon: 'none' });
      return false;
    }
    return true;
  },

  async handleSubmit() {
    if (!this.validateForm()) return;

    const { form, code, qrInfo } = this.data;
    this.setData({ submitting: true, statusText: '正在提交签到...', statusType: 'info' });
    try {
      const result = await api.callFunction('qrcode', 'interview-checkin', {
        code,
        real_name: normalizeName(form.real_name),
        phone: String(form.phone || '').replace(/\s+/g, '')
      }, {
        loadingText: '签到中...'
      });

      this.setData({
        statusText: result?.matched_existing_application ? '签到成功，已更新到面状态。' : '签到成功，已创建报名和面试记录。',
        statusType: 'success'
      });

      wx.showModal({
        title: '签到成功',
        content: `企业：${result?.company_name || qrInfo?.company_name || ''}\n岗位：${result?.job_name || qrInfo?.job_name || ''}\n面试日期：${result?.interview_date || qrInfo?.interview_date || ''}`,
        showCancel: false,
        confirmText: '我知道了',
        success: () => {
          wx.switchTab({ url: '/pages/my/my' });
        }
      });
    } catch (err: any) {
      const message = api.getErrorMessage(err, '签到失败，请稍后重试');
      this.setData({ statusText: message, statusType: 'error' });
      wx.showModal({
        title: '签到失败',
        content: message,
        showCancel: false,
        confirmText: '我知道了'
      });
    } finally {
      this.setData({ submitting: false });
    }
  }
});

export {};
