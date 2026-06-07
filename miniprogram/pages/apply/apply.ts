// pages/apply/apply.ts
const api = require('../../utils/api');

Page({
  data: {
    job: {} as any,
    referral: {
      code: '',
      recommender_id: '',
      recommender_name: ''
    },
    form: {
      name: '',
      phone: '',
      email: '',
      current_company: '',
      current_position: '',
      experience_years: '',
      education: '',
      self_introduction: ''
    },
    loading: false,
    submitting: false,
    // 新增字段
    existingApplication: null as any,
    canReapply: false,
    showConsult: true,
    showGlobalServiceBtn: true,
    serviceBtnTop: 300, // 初始位置
    serviceBtnLeft: 20,
    showLoginSheet: false
  },

  onLoad(options: any) {
    const referral = {
      code: options.code ? decodeURIComponent(options.code) : '',
      recommender_id: options.recommender_id ? decodeURIComponent(options.recommender_id) : '',
      recommender_name: options.recommender_name ? decodeURIComponent(options.recommender_name) : ''
    };
    this.setData({ referral });

    if (options.jobData) {
      try {
        const job = JSON.parse(decodeURIComponent(options.jobData));
        this.setData({ job });
        this.prefillUserInfo();
        this.checkApplicationStatus(); // 检查申请状态
      } catch (err) {
        console.error('解析岗位数据失败:', err);
        wx.showToast({ title: '数据错误', icon: 'none' });
        setTimeout(() => {
          wx.navigateBack();
        }, 1500);
      }
      return;
    }

    if (options.jobId) {
      this.loadJobById(options.jobId);
    }
  },

  async loadJobById(jobId: string) {
    try {
      const jobData = await api.callFunction('jobs', 'get', { id: jobId });
      const dailyHours = jobData.bill_hours || jobData.daily_hours || 8;
      let salaryRange = jobData.salary_range;
      if ((!salaryRange || salaryRange === '面议') && jobData.hourly_rate) {
        const min = Math.round(jobData.hourly_rate * dailyHours * 26);
        const max = Math.round(jobData.hourly_rate * dailyHours * 31);
        salaryRange = `${min}-${max}`;
      }

      this.setData({
        job: {
          id: jobData._id || jobId,
          title: jobData.position || '未知职位',
          company: jobData.company_short_name || jobData.company_name || '未知公司',
          company_id: jobData.company_id,
          salary_range: salaryRange || '面议',
          location: jobData.location || '',
          experience: jobData.experience || '经验不限'
        }
      });
      this.prefillUserInfo();
      this.checkApplicationStatus();
    } catch (err: any) {
      console.error('加载岗位失败:', err);
      wx.showToast({ title: err.message || '岗位加载失败', icon: 'none' });
      setTimeout(() => wx.navigateBack(), 1500);
    }
  },

  async prefillUserInfo() {
    const token = wx.getStorageSync('token');
    if (!token) return;
    try {
      const userInfo = await api.callFunction('users', 'get-profile', {});
      this.setData({
        'form.name': userInfo.real_name || '',
        'form.phone': userInfo.phone || '',
        'form.email': userInfo.email || '',
        'form.current_company': userInfo.current_company || '',
        'form.current_position': userInfo.current_position || '',
        'form.education': userInfo.education || ''
      });
    } catch (err) {
      console.error('获取用户信息失败:', err);
    }
  },

  // 检查申请状态
  async checkApplicationStatus() {
    const token = wx.getStorageSync('token');
    if (!token) return;
    try {
      const result = await api.callFunction('applications', 'check-status', {
        job_id: this.data.job.id
      });
      
      console.log('checkApplicationStatus 结果:', result);
      
      this.setData({
        existingApplication: result.has_application ? result.application : null,
        canReapply: result.can_reapply || false
      });
      
      // 如果已有申请且可以重新申请，显示提示
      if (result.has_application && result.can_reapply) {
        wx.showModal({
          title: '提示',
          content: `您之前申请该岗位的状态为：${result.application.status}，可以重新提交申请。`,
          showCancel: false,
          confirmText: '我知道了'
        });
      }
      
      // 如果已有申请且不能重新申请，显示状态并禁用提交按钮
      if (result.has_application && !result.can_reapply) {
        wx.showModal({
          title: '提示',
          content: `您已申请该岗位，当前状态为：${result.application.status}，请等待处理结果。`,
          showCancel: false,
          confirmText: '我知道了'
        });
      }
      
    } catch (err) {
      console.error('检查申请状态失败:', err);
      // 如果 check-status 不存在（旧版本），忽略错误
    }
  },

  onInput(e: any) {
    const field = e.currentTarget.dataset.field;
    const value = e.detail.value;
    this.setData({
      [`form.${field}`]: value
    });
  },

  onEducationChange(e: any) {
    const educations = ['高中', '大专', '本科', '硕士', '博士', '其他'];
    this.setData({
      'form.education': educations[e.detail.value]
    });
  },

  validateForm() {
    const { form } = this.data;

    if (!form.name) {
      wx.showToast({ title: '请输入姓名', icon: 'none' });
      return false;
    }

    if (!form.phone || !/^1[3-9]\d{9}$/.test(form.phone)) {
      wx.showToast({ title: '请输入正确的手机号', icon: 'none' });
      return false;
    }

    if (!form.self_introduction || form.self_introduction.trim().length < 10) {
      wx.showToast({ title: '请输入至少10字的自我介绍', icon: 'none' });
      return false;
    }

    return true;
  },

  async handleSubmit() {
    const token = wx.getStorageSync('token');
    if (!token) {
      this.setData({ showLoginSheet: true });
      return;
    }
    if (!this.validateForm()) {
      return;
    }

    // 检查是否存在非终态申请
    if (this.data.existingApplication && !this.data.canReapply) {
      wx.showModal({
        title: '提示',
        content: `您已申请该岗位，当前状态为：${this.data.existingApplication.status}，无法重复提交。`,
        showCancel: false,
        confirmText: '我知道了'
      });
      return;
    }

    this.setData({ submitting: true });

    try {
      await api.callFunction('applications', 'create', {
        job_id: this.data.job.id,
        recommender_id: this.data.referral.recommender_id || '',
        recommender_name: this.data.referral.recommender_name || '',
        code: this.data.referral.code || '',
        ...this.data.form
      });

      wx.showToast({ title: '申请成功', icon: 'success' });

      // 更新本地状态，标记为已申请
      this.setData({
        existingApplication: { status: 'pending' },
        canReapply: false
      });

      setTimeout(() => {
        wx.removeStorageSync('pendingCandidateReferral');
        wx.navigateBack();
      }, 1500);
    } catch (err: any) {
      console.error('提交申请失败:', err);
      
      // 处理重复申请错误
      if (err.message && err.message.includes('已申请该岗位')) {
        wx.showModal({
          title: '提示',
          content: err.message,
          showCancel: false,
          confirmText: '我知道了'
        });
        // 刷新申请状态
        this.checkApplicationStatus();
      } else {
        wx.showToast({ title: err.message || '提交失败', icon: 'none' });
      }
    } finally {
      this.setData({ submitting: false });
    }
  },

  handleCancel() {
    wx.showModal({
      title: '提示',
      content: '确定要放弃申请吗？已填写的信息将不会保存',
      success: (res) => {
        if (res.confirm) {
          wx.navigateBack();
        }
      }
    });
  },

  // 咨询客服
  consultCustomerService() {
    // 使用微信客服 API
    wx.openCustomerServiceChat({
      extInfo: { url: '' },
      corpId: 'ww55f445641354ff8b',
      success: (res) => {
        console.log('打开客服聊天成功', res);
      },
      fail: (err) => {
        console.error('打开客服聊天失败:', err);
        // 如果微信客服 API 失败，回退到 WebView 方式
        const serviceUrl = 'https://work.weixin.qq.com/kfid/kfc4f915df03d80651d';
        wx.navigateTo({
          url: `/pages/webview/webview?url=${encodeURIComponent(serviceUrl)}`
        }).catch((navErr) => {
          console.error('跳转客服页面失败:', navErr);
          // 跳转失败，复制链接到剪贴板
          wx.setClipboardData({
            data: serviceUrl,
            success: () => {
              wx.showModal({
                title: '提示',
                content: '客服功能暂时不可用，链接已复制到剪贴板。您可以粘贴到浏览器中打开。',
                showCancel: false,
                confirmText: '我知道了'
              });
            },
            fail: () => {
              wx.showModal({
                title: '提示',
                content: `客服链接：${serviceUrl}，请手动复制打开。`,
                showCancel: false,
                confirmText: '我知道了'
              });
            }
          });
        });
      }
    });
  },

  // 全局客服按钮点击
  onServiceBtnTap() {
    this.consultCustomerService();
  },

  // 全局客服按钮触摸移动（已由组件处理）
  // onServiceBtnTouchMove 方法已移除，由全局客服按钮组件内部处理拖拽逻辑

  // 页面卸载时记录按钮位置，供全局使用
  onUnload() {
    // 可以将按钮位置存储到全局，其他页面读取
    const app = getApp();
    if (app) {
      app.globalData.serviceBtnPosition = {
        top: this.data.serviceBtnTop,
        left: this.data.serviceBtnLeft
      };
    }
  },

  onLoginClose() {
    this.setData({ showLoginSheet: false });
  },

  onLoginSuccess() {
    this.setData({ showLoginSheet: false });
    this.prefillUserInfo();
    this.checkApplicationStatus();
    
    const pendingReferral = wx.getStorageSync('pendingCandidateReferral');
    if (pendingReferral?.recommender_id) {
      const userInfo = wx.getStorageSync('userInfo');
      if (userInfo?.id) {
        api.callFunction('candidates', 'bind-scan-referral', {
          candidate_id: userInfo.id,
          job_id: pendingReferral.job_id || '',
          code: pendingReferral.code || '',
          recommender_id: pendingReferral.recommender_id,
          recommender_name: pendingReferral.recommender_name || ''
        }, { showLoading: false });
      }
    }
  }
});

export {};
