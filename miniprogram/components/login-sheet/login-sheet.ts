// components/login-sheet/login-sheet.ts
const api = require('../../utils/api');

Component({
  properties: {
    visible: {
      type: Boolean,
      value: false
    }
  },
  data: {
    loading: false,
    
  },
  methods: {
    noop() {},
    

    close() {
      this.triggerEvent('close');
    },

    async resolveReferralByCode(code: string, candidateId: string) {
      const referralCode = String(code || '').trim();
      if (!referralCode) return null;

      try {
        const scanResult = await api.callFunction('qrcode', 'scan', {
          code: referralCode,
          user_id: candidateId || ''
        }, {
          showLoading: false
        });

        const recommenderId = scanResult?.recommender_id || scanResult?.creator_id || '';
        const recommenderName = scanResult?.recommender_name || scanResult?.creator_name || '';
        if (!recommenderId) return null;
        return {
          code: referralCode,
          job_id: scanResult.job_id || '',
          recommender_id: recommenderId,
          recommender_name: recommenderName
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
            }, {
              showLoading: false
            });
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
            }, {
              showLoading: false
            });
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

    async onGetPhoneNumber(e: any) {

      if (e.detail.errMsg !== 'getPhoneNumber:ok') {
        wx.showToast({ title: '获取手机号失败', icon: 'none' });
        return;
      }

      this.setData({ loading: true });
      try {
        const cloudID = e.detail.cloudID;
        const result = await api.callFunction('auth', 'wechat-phone-login', {
          phoneCloudID: wx.cloud.CloudID(cloudID),
          user_type: 'candidate'
        });

        // 保存登录态
        wx.setStorageSync('token', result.token);
        wx.setStorageSync('userInfo', result.userInfo);
        const app = getApp();
        if (app) {
          app.globalData.userInfo = result.userInfo;
          app.globalData.isLoggedIn = true;
        }

        await this.bindPendingReferrals(result.userInfo);

        wx.showToast({ title: '登录成功', icon: 'success' });
        this.triggerEvent('login-success', { userInfo: result.userInfo });
        this.triggerEvent('close');
      } catch (err: any) {
        console.error('手机号登录失败:', err);
        wx.showToast({ title: err.message || '登录失败', icon: 'none' });
      } finally {
        this.setData({ loading: false });
      }
    }
  }
});

export {};
