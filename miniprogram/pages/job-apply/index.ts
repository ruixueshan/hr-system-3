const api = require('../../utils/api');
const jobApplyQrCodeUtils = require('../../utils/qrcode');

Page({
  data: {
    code: '',
    qrInfo: null as any,
    loading: false,
    submitting: false,
    submitHint: '请填写报名信息后提交。',
    submitHintType: 'info',
    isLoggedIn: false,
    form: {
      real_name: '',
      phone: '',
      id_card: ''
    }
  },

  onLoad(options: any) {
    console.log('job-apply onLoad options:', options);
    
    const code = jobApplyQrCodeUtils.extractQrCodeFromOptions(options);
    
    if (!code) {
      wx.showToast({ title: '缺少报名码', icon: 'none' });
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
    this.setData({
      loading: true,
      submitHint: '正在识别报名码，请稍候...',
      submitHintType: 'info'
    });
    try {
      const qrInfo = await api.callFunction('qrcode', 'scan', {
        code: this.data.code,
        user_id: getApp().globalData.userInfo?._id
      }, {
        loadingText: '识别报名码...'
      });

      if (!qrInfo) {
        throw new Error('报名码识别失败');
      }

      if (qrInfo.type !== 'job_apply') {
        throw new Error('当前二维码不是报名码');
      }

      this.setData({
        qrInfo,
        submitHint: '报名信息已加载，请填写后提交。',
        submitHintType: 'success'
      });
    } catch (err: any) {
      console.error('loadQrInfo error:', err);
      const userMessage = api.getErrorMessage(err, '报名码识别失败，请重新扫码。');
      this.setData({
        submitHint: userMessage,
        submitHintType: 'error'
      });
      wx.showToast({ title: userMessage, icon: 'none' });
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
        'form.real_name': profile.real_name || '',
        'form.phone': profile.phone || '',
        'form.id_card': profile.id_card || ''
      });
    } catch (err) {
      console.error('加载个人资料失败:', err);
    }
  },

  onInput(e: any) {
    const field = e.currentTarget.dataset.field;
    this.setData({
      [`form.${field}`]: e.detail.value,
      submitHint: '信息已更新，确认无误后可直接提交。',
      submitHintType: 'info'
    });
  },

  setSubmitHint(message: string, type: 'info' | 'success' | 'error' = 'info') {
    this.setData({
      submitHint: message,
      submitHintType: type
    });
  },

  validateForm() {
    const { form, qrInfo, loading, submitting } = this.data;

    if (loading) {
      this.setSubmitHint('报名码还在识别中，请稍候再提交。', 'error');
      wx.showToast({ title: '报名码识别中', icon: 'none' });
      return false;
    }

    if (submitting) {
      this.setSubmitHint('报名正在提交，请勿重复点击。', 'info');
      wx.showToast({ title: '报名正在提交', icon: 'none' });
      return false;
    }

    if (!qrInfo?.job_id) {
      this.setSubmitHint('报名信息未加载完成，请稍后再试。', 'error');
      wx.showToast({ title: '报名信息未加载完成', icon: 'none' });
      return false;
    }

    if (!form.real_name || !String(form.real_name).trim()) {
      this.setSubmitHint('请先填写姓名。', 'error');
      wx.showToast({ title: '请输入姓名', icon: 'none' });
      return false;
    }

    const normalizedPhone = String(form.phone || '').replace(/\s+/g, '');
    if (!/^1[3-9]\d{9}$/.test(normalizedPhone)) {
      this.setSubmitHint('请输入正确的手机号。', 'error');
      wx.showToast({ title: '请输入正确的手机号', icon: 'none' });
      return false;
    }

    if (!String(form.id_card || '').trim()) {
      this.setSubmitHint('请先填写身份证号。', 'error');
      wx.showToast({ title: '请输入身份证号', icon: 'none' });
      return false;
    }

    this.setSubmitHint('信息校验通过，正在提交报名。', 'info');
    return true;
  },

  async handleSubmit() {
    const { form, code, qrInfo } = this.data;

    console.log('job-apply handleSubmit start:', {
      code,
      isLoggedIn: !!wx.getStorageSync('token'),
      hasQrInfo: !!qrInfo,
      jobId: qrInfo?.job_id || '',
      submitting: this.data.submitting
    });

    this.setSubmitHint('已收到提交请求，开始校验信息。', 'info');

    if (!this.validateForm()) {
      return;
    }

    this.setData({ submitting: true });
    this.setSubmitHint('报名提交中，请稍候...', 'info');
    try {
      const result = await api.callFunction('qrcode', 'job-apply', {
        code,
        real_name: String(form.real_name || '').trim(),
        phone: String(form.phone || '').replace(/\s+/g, ''),
        id_card: String(form.id_card || '').trim(),
        job_id: qrInfo?.job_id,
        company_id: qrInfo?.company_id,
        interview_time: qrInfo?.interview_time
      });

      console.log('job-apply handleSubmit success:', result);

      this.handleSubmitSuccess(result);
    } catch (err: any) {
      console.error('job-apply handleSubmit failed:', err);
      const detail = api.getErrorMessage(err, '报名失败，请稍后重试');
      this.setSubmitHint(detail, 'error');
      wx.showModal({
        title: '报名提交失败',
        content: detail,
        showCancel: false,
        confirmText: '我知道了'
      });
    } finally {
      this.setData({ submitting: false });
    }
  },

  handleSubmitSuccess(result: any) {
    const isLoggedIn = !!wx.getStorageSync('token');
    this.setSubmitHint('报名提交成功，正在为您处理后续页面。', 'success');
    wx.showToast({ title: '报名成功', icon: 'success' });

    setTimeout(() => {
      if (isLoggedIn) {
        wx.redirectTo({ url: '/pages/my/applications/applications' });
        return;
      }

      wx.showModal({
        title: '报名已提交',
        content: `岗位：${result?.job_name || this.data.qrInfo?.job_name || ''}\n企业：${result?.company_name || this.data.qrInfo?.company_name || ''}\n工作人员会尽快与您联系。`,
        showCancel: false,
        confirmText: '我知道了',
        success: () => {
          wx.switchTab({ url: '/pages/home/home' }).catch(() => {
            wx.navigateBack({ delta: 1 });
          });
        }
      });
    }, 1200);
  },

  async loadUserInfo() {
    try {
      const userInfo = await api.callFunction('users', 'get-profile', {}, {
        showLoading: false
      });
      
      this.setData({
        isLoggedIn: true,
        'form.real_name': userInfo.real_name || '',
        'form.phone': userInfo.phone || '',
        'form.id_card': userInfo.id_card || ''
      });
    } catch (err) {
      console.error('加载用户信息失败:', err);
    }
  }
});

export {};
