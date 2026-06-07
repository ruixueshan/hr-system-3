// pages/qrcode-scan/scan.ts
const api = require('../../utils/api');
const scanQrCodeUtils = require('../../utils/qrcode');
const scanIdentityUtils = require('../../utils/identity');

Page({
  data: {
    jobInfo: null as any
  },

  onLoad() {
    this.startScan();
  },

  async startScan() {
    try {
      const res = await wx.scanCode({
        onlyFromCamera: false,
        scanType: ['qrCode']
      });

      const code = scanQrCodeUtils.extractQrCode(res.result);
      if (!code) {
        wx.showToast({ title: '无效二维码', icon: 'none' });
        return;
      }

      // 解析二维码信息（调用云函数验证）
      const appUserInfo = getApp().globalData.userInfo || {};
      const currentUserId = scanIdentityUtils.getUserId(appUserInfo);
      const scanResult = await api.callFunction('qrcode', 'scan', {
        code,
        user_id: currentUserId
      });

      if (scanResult.type === 'internal_onboard') {
        wx.navigateTo({
          url: `/pages/internal-onboard/index?code=${encodeURIComponent(scanResult.code || code)}`
        });
        return;
      }

      if (scanResult.type === 'interview_checkin') {
        wx.navigateTo({
          url: `/pages/interview-checkin/index?code=${encodeURIComponent(scanResult.code || code)}`
        });
        return;
      }

      wx.setStorageSync('pendingCandidateReferral', {
        code,
        job_id: scanResult.job_id,
        recommender_id: scanResult.recommender_id || scanResult.creator_id || '',
        recommender_name: scanResult.recommender_name || scanResult.creator_name || '',
        created_at: Date.now()
      });

      const recommenderId = scanResult.recommender_id || scanResult.creator_id || '';
      const recommenderName = scanResult.recommender_name || scanResult.creator_name || '';

      if (currentUserId && recommenderId) {
        await api.callFunction('candidates', 'bind-scan-referral', {
          candidate_id: currentUserId,
          job_id: scanResult.job_id,
          code,
          recommender_id: recommenderId,
          recommender_name: recommenderName
        }, {
          showLoading: false
        });
      }

      this.setData({ jobInfo: scanResult });
    } catch (err: any) {
      if (err.errMsg?.includes('cancel')) {
        // 用户取消，不做处理
      } else {
        wx.showToast({ title: err.message || '扫码失败', icon: 'none' });
      }
    }
  },

  scanAgain() {
    this.setData({ jobInfo: null });
    this.startScan();
  },

  goToApply() {
    const { jobInfo } = this.data;
    if (!jobInfo) return;

    if (jobInfo.type === 'internal_onboard') {
      wx.navigateTo({
        url: `/pages/internal-onboard/index?code=${encodeURIComponent(jobInfo.code || '')}`
      });
      return;
    }

    if (jobInfo.type === 'interview_checkin') {
      wx.navigateTo({
        url: `/pages/interview-checkin/index?code=${encodeURIComponent(jobInfo.code || '')}`
      });
      return;
    }

    if (jobInfo.type === 'job_apply') {
      wx.navigateTo({
        url: `/pages/job-apply/index?code=${encodeURIComponent(jobInfo.code || '')}`
      });
      return;
    }

    if (!jobInfo.job_id) {
      wx.navigateTo({
        url: `/pages/home/home?ref_code=${encodeURIComponent(jobInfo.code || '')}`
      });
      return;
    }

    wx.navigateTo({
      url: `/pages/apply/apply?jobId=${jobInfo.job_id}&code=${encodeURIComponent(jobInfo.code || '')}&recommender_id=${encodeURIComponent(jobInfo.recommender_id || '')}&recommender_name=${encodeURIComponent(jobInfo.recommender_name || '')}`
    });
  }
});

export {};
