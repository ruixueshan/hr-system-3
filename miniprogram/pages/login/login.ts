const api = require('../../utils/api');

Page({
  data: {
    logging: false,
    fromPage: ''
  },

  onLoad(options: any) {
    // 获取来源页面
    const fromPage = options.from || '';
    console.log('登录页来源:', fromPage);
    this.setData({ fromPage });
  },

  async resolveReferralByCode(code: string, candidateId: string) {
    const referralCode = String(code || '').trim();
    if (!referralCode) return null;

    try {
      const scanResult = await api.callFunction('qrcode', 'scan', {
        code: referralCode,
        user_id: candidateId || ''
      }, { showLoading: false });

      if (!scanResult?.recommender_id) return null;
      return {
        code: referralCode,
        job_id: scanResult.job_id || '',
        recommender_id: scanResult.recommender_id,
        recommender_name: scanResult.recommender_name || ''
      };
    } catch (err) {
      console.warn('扫码码值解析失败:', err);
      return null;
    }
  },

  async bindPendingReferrals(userInfo: any) {
    const candidateId = userInfo?.id || userInfo?._id || '';
    if (!candidateId) return;

    const pendingCandidateReferral = wx.getStorageSync('pendingCandidateReferral');
    if (pendingCandidateReferral && (pendingCandidateReferral.recommender_id || pendingCandidateReferral.code)) {
      try {
        let recommenderId = pendingCandidateReferral.recommender_id || '';
        let recommenderName = pendingCandidateReferral.recommender_name || '';
        let jobId = pendingCandidateReferral.job_id || '';

        if (!recommenderId && pendingCandidateReferral.code) {
          const resolvedReferral = await this.resolveReferralByCode(pendingCandidateReferral.code, candidateId);
          if (resolvedReferral?.recommender_id) {
            recommenderId = resolvedReferral.recommender_id;
            recommenderName = resolvedReferral.recommender_name || recommenderName;
            jobId = resolvedReferral.job_id || jobId;
          }
        }

        if (recommenderId) {
          await api.callFunction('candidates', 'bind-scan-referral', {
            candidate_id: candidateId,
            job_id: jobId,
            code: pendingCandidateReferral.code || '',
            recommender_id: recommenderId,
            recommender_name: recommenderName
          }, { showLoading: false });
        }
      } catch (bindErr) {
        console.warn('候选人扫码推荐人绑定失败:', bindErr);
      }
    }

    const pendingAgentReferral = wx.getStorageSync('pendingAgentReferral');
    if (pendingAgentReferral?.code) {
      let bindSuccess = false;
      try {
        const resolvedAgentReferral = await this.resolveReferralByCode(pendingAgentReferral.code, candidateId);
        if (resolvedAgentReferral?.recommender_id) {
          await api.callFunction('candidates', 'bind-scan-referral', {
            candidate_id: candidateId,
            code: pendingAgentReferral.code,
            recommender_id: resolvedAgentReferral.recommender_id,
            recommender_name: resolvedAgentReferral.recommender_name || ''
          }, { showLoading: false });
          bindSuccess = true;
        }
      } catch (bindErr) {
        console.warn('分销扫码推荐人绑定失败:', bindErr);
      } finally {
        if (bindSuccess) {
          wx.removeStorageSync('pendingAgentReferral');
        }
      }
    }
  },

  // 微信手机号快捷登录
  async onGetPhoneNumber(e: any) {
    console.log('微信手机号授权事件:', e);
    
    if (e.detail.errMsg !== 'getPhoneNumber:ok') {
      wx.showToast({ title: '获取手机号失败', icon: 'none' });
      return;
    }

    this.setData({ logging: true });

    try {
      const cloudID = e.detail.cloudID;
      
      // 调用云函数，传递 CloudID
      const result = await api.callFunction('auth', 'wechat-phone-login', {
        phoneCloudID: wx.cloud.CloudID(cloudID),
        user_type: 'candidate'
      });

      // 保存 token 和用户信息
      wx.setStorageSync('token', result.token);
      wx.setStorageSync('userInfo', result.userInfo);

      // 更新全局状态
      const app = getApp() as any;
      app.globalData.userInfo = result.userInfo;
      app.globalData.isLoggedIn = true;

      await this.bindPendingReferrals(result.userInfo);

      wx.showToast({ title: '登录成功', icon: 'success' });

      // 根据来源页面跳转
      setTimeout(() => {
        const { fromPage } = this.data;
        
        // 定义 tab 页列表（根据 app.json 配置）
        const tabPages = [
          '/pages/index/index',
          '/pages/my/my'
        ];
        
        if (fromPage && fromPage.trim() !== '') {
          // 判断是否为 tab 页
          const isTabPage = tabPages.some(tab => fromPage.startsWith(tab));
          if (isTabPage) {
            wx.switchTab({ url: fromPage });
          } else {
            wx.redirectTo({ url: fromPage });
          }
        } else {
          // 默认跳转到"我的"页面
          wx.switchTab({ url: '/pages/my/my' });
        }
      }, 1000);
    } catch (err) {
      console.error('微信手机号登录失败:', err);
      this.setData({ logging: false });
      wx.showToast({ 
        title: err.message || '登录失败', 
        icon: 'none' 
      });
    }
  }

});

export {};
