// pages/home/home.ts - 分销团队首页
const api = require('../../utils/api');
const permissionUtils = require('../../utils/permissions');
const homeQrCodeUtils = require('../../utils/qrcode');
const homeIdentityUtils = require('../../utils/identity');

function hasAgentIdentity(userInfo: any): boolean {
  return userInfo?.role === 'agent'
    || userInfo?.user_type === 'agent'
    || userInfo?.agent_status === 'approved';
}

function getChinaDateTimeParts() {
  const date = new Date(Date.now() + 8 * 60 * 60 * 1000);
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, '0');
  const day = String(date.getUTCDate()).padStart(2, '0');
  const hour = String(date.getUTCHours()).padStart(2, '0');
  const minute = String(date.getUTCMinutes()).padStart(2, '0');
  return {
    date: `${year}-${month}-${day}`,
    time: `${hour}:${minute}`
  };
}

Page({
  data: {
    loading: true,
    userInfo: null as any,
    isAgent: false,
    rolePermissions: [] as string[],
    canManageInterviews: false,
    canEnterManage: false,
    applicationStatus: 'none',
    agentQr: null as any,
    generatingQr: false,
    referralTip: '',
    showManageContent: false,
    showBack: false,
    showLoginSheet: false,
    showOnboardModal: false,
    showAgentQrModal: false,
    showCheckinModal: false,
    onboardCompanies: [] as any[],
    onboardJobs: [] as any[],
    selectedCompanyId: '',
    selectedJobId: '',
    selectedCompanyName: '',
    selectedJobName: '',
    generatedOnboardQr: null as any,
    onboardQrLoading: false,
    onboardModalLoading: false,
    onboardJobsLoading: false,
    showApplyModal: false,
    applyCompanies: [] as any[],
    applyJobs: [] as any[],
    selectedApplyCompanyId: '',
    selectedApplyJobId: '',
    selectedApplyCompanyName: '',
    selectedApplyJobName: '',
    selectedApplyDate: '',
    selectedApplyTime: '',
    generatedApplyQr: null as any,
    applyQrLoading: false,
    applyModalLoading: false,
    applyJobsLoading: false,
    checkinCompanies: [] as any[],
    checkinJobs: [] as any[],
    selectedCheckinCompanyId: '',
    selectedCheckinJobId: '',
    selectedCheckinCompanyName: '',
    selectedCheckinJobName: '',
    selectedCheckinDate: '',
    selectedCheckinLocation: '',
    generatedCheckinQr: null as any,
    checkinQrLoading: false,
    checkinModalLoading: false,
    checkinJobsLoading: false
  },

  onLoad(options: any) {
    const refCode = this.extractReferralCode(options);
    if (refCode) {
      wx.setStorageSync('pendingAgentReferral', {
        code: refCode,
        created_at: Date.now()
      });
    }
  },

  extractReferralCode(options: any): string {
    const normalizeCode = (raw: string) => {
      const value = String(raw || '').trim();
      if (!value) return '';
      return value;
    };

    return normalizeCode(homeQrCodeUtils.extractQrCodeFromOptions(options, ['scene', 'ref_code', 'code']));
  },

  onShow() {
    this.loadUserInfo();
  },

  async loadUserInfo() {
    const currentTask = (this as any)._loadUserInfoTask;
    if (currentTask) {
      return currentTask;
    }

    const task = (async () => {
      this.setData({ loading: true });

      try {
        const loginRes = await this.checkLogin();
        if (!loginRes) {
          this.setData({
            userInfo: null,
            isAgent: false,
            rolePermissions: [],
            canManageInterviews: false,
            canEnterManage: false,
            applicationStatus: 'none',
            loading: false,
            showManageContent: false,
            showBack: false,
            showLoginSheet: false,
            agentQr: null
          });
          return;
        }

        const userInfo = await this.getUserProfile();
        if (!userInfo) {
          this.setData({ userInfo: null, loading: false });
          return;
        }

        const rolePermissions = await this.loadRolePermissions(userInfo.role);
        const isAgent = hasAgentIdentity(userInfo);
        const canEnterManage = isAgent || ['hr', 'gm', 'deputy'].includes(userInfo.role);
        const canManageInterviews = permissionUtils.hasPermission(
          rolePermissions,
          permissionUtils.INTERVIEWS_MANAGE_PERMISSION
        );
        const fallbackApplicationStatus = isAgent ? 'approved' : (userInfo.agent_status || 'none');

        this.setData({
          userInfo,
          isAgent,
          rolePermissions,
          canManageInterviews,
          canEnterManage,
          applicationStatus: fallbackApplicationStatus,
          loading: false,
          showManageContent: canEnterManage,
          showBack: false
        });

        const applicationStatusTask = this.getAgentApplicationStatus(userInfo);

        if (isAgent) {
          void this.loadAgentQr();
        }

        void this.consumePendingReferral(userInfo);

        const applicationStatus = await applicationStatusTask;

        const resolvedIsAgent = isAgent || applicationStatus === 'approved';
        if (resolvedIsAgent && !isAgent) {
          void this.loadAgentQr();
        } else if (!resolvedIsAgent && this.data.agentQr) {
          this.setData({ agentQr: null });
        }

        const resolvedCanEnterManage = canEnterManage || resolvedIsAgent;
        this.setData({
          applicationStatus,
          isAgent: resolvedIsAgent,
          canEnterManage: resolvedCanEnterManage,
          showManageContent: resolvedCanEnterManage
        });
      } catch (err: any) {
        console.error('加载用户信息失败:', err);
        this.setData({
          userInfo: null,
          rolePermissions: [],
          canManageInterviews: false,
          loading: false
        });
      }
    })();

    (this as any)._loadUserInfoTask = task;
    try {
      await task;
    } finally {
      (this as any)._loadUserInfoTask = null;
    }
  },

  async consumePendingReferral(userInfo: any) {
    const pendingReferral = wx.getStorageSync('pendingAgentReferral');
    const userId = homeIdentityUtils.getUserId(userInfo);
    if (!pendingReferral?.code || !userId) return;

    try {
      const scanResult = await api.callFunction('qrcode', 'scan', {
        code: pendingReferral.code,
        user_id: userId
      }, { showLoading: false });

      if (scanResult?.recommender_id) {
        await api.callFunction('candidates', 'bind-scan-referral', {
          candidate_id: userId,
          code: pendingReferral.code,
          recommender_id: scanResult.recommender_id,
          recommender_name: scanResult.recommender_name || ''
        }, { showLoading: false });

        this.setData({
          referralTip: `已绑定分销人：${scanResult.recommender_name || '未命名推荐人'}`
        });
        wx.showToast({ title: '已绑定分销人', icon: 'success' });
      }
    } catch (err) {
      console.warn('处理分销二维码失败:', err);
    } finally {
      wx.removeStorageSync('pendingAgentReferral');
    }
  },

  async checkLogin(): Promise<boolean> {
    try {
      const token = wx.getStorageSync('token');
      if (!token) return false;
      await api.callFunction('auth', 'verify-token', {}, { showLoading: false });
      return true;
    } catch (err) {
      console.error('检查登录状态失败:', err);
      return false;
    }
  },

  async getUserProfile(): Promise<any> {
    try {
      return await api.callFunction('users', 'get-profile', {}, { showLoading: false });
    } catch (err) {
      console.error('调用用户云函数失败:', err);
      return null;
    }
  },

  async getAgentApplicationStatus(userInfo: any): Promise<string> {
    try {
      if (hasAgentIdentity(userInfo)) {
        return 'approved';
      }
      const result = await api.callFunction('applications', 'get-agent-application', {
        user_id: homeIdentityUtils.getUserId(userInfo)
      }, { showLoading: false });
      if (result) return result.status || 'none';
      return userInfo.agent_status || 'none';
    } catch (err) {
      console.error('获取代理申请状态失败:', err);
      return userInfo.agent_status || 'none';
    }
  },

  async loadRolePermissions(roleName: string): Promise<string[]> {
    return permissionUtils.loadRolePermissions(roleName || '');
  },

  async applyForAgent() {
    if (!this.data.userInfo) {
      wx.showModal({
        title: '请先登录',
        content: '登录后即可申请成为分销代理，享受高额佣金和专属权益。',
        confirmText: '去登录',
        cancelText: '稍后再说',
        success: (res) => { if (res.confirm) this.navigateToLogin(); }
      });
      return;
    }

    if (this.data.applicationStatus === 'pending') {
      wx.showToast({ title: '申请审核中，请耐心等待', icon: 'none' });
      return;
    }

    if (this.data.isAgent) {
      wx.showToast({ title: '您已经是认证代理', icon: 'none' });
      return;
    }

    wx.showModal({
      title: '确认申请',
      content: '确定要申请成为分销代理吗？申请将自动审批通过，立即生效。',
      success: async (res) => { if (res.confirm) await this.submitAgentApplication(); }
    });
  },

  navigateToLogin() {
    this.setData({ showLoginSheet: true });
  },

  async submitAgentApplication() {
    wx.showLoading({ title: '提交中...' });
    try {
      await api.callFunction('applications', 'apply-for-agent', {
        user_info: this.data.userInfo
      }, { showLoading: false });
      wx.hideLoading();

      const currentRole = this.data.userInfo?.role || '';
      const rolePermissions = await this.loadRolePermissions(currentRole || 'agent');
      const canManageInterviews = permissionUtils.hasPermission(
        rolePermissions,
        permissionUtils.INTERVIEWS_MANAGE_PERMISSION
      );
      wx.showToast({ title: '申请已自动审批通过', icon: 'success' });
      this.setData({
        applicationStatus: 'approved',
        isAgent: true,
        rolePermissions,
        canManageInterviews,
        canEnterManage: true,
        userInfo: { ...this.data.userInfo, agent_status: 'approved' }
      });
      void this.loadAgentQr();
    } catch (err: any) {
      wx.hideLoading();
      console.error('提交代理申请失败:', err);
      wx.showToast({ title: '申请失败，请重试', icon: 'none' });
    }
  },

  goToRecruitmentHub() {
    if (!this.data.canEnterManage) {
      wx.showToast({ title: '您没有管理权限', icon: 'none' });
      return;
    }
    this.switchToManageView();
  },

  goToMySignups() {
    if (!this.data.canManageInterviews) {
      wx.showToast({ title: '您没有面试管理权限', icon: 'none' });
      return;
    }

    wx.navigateTo({ url: '/pages/home/my-signups/index' });
  },

  switchToManageView() {
    this.setData({ showManageContent: true, showBack: true });
  },

  switchToHomeView() {
    this.setData({ showManageContent: false, showBack: false });
  },

  goBack() {
    this.switchToHomeView();
  },

  openAgentQrModal() {
    this.setData({ showAgentQrModal: true });
    this.loadAgentQr();
  },

  closeAgentQrModal() {
    this.setData({ showAgentQrModal: false });
  },

  normalizeCompanies(list: any[] = []) {
    return list.map((item: any) => ({
      ...item,
      display_name: item.name || item.company_name || item.companyName || ''
    }));
  },

  normalizeJobs(list: any[] = []) {
    return list.map((item: any) => ({
      ...item,
      display_name: item.position || item.job_name || item.jobName || ''
    }));
  },

  async loadAgentQr() {
    const userId = homeIdentityUtils.getUserId(this.data.userInfo);
    if (!this.data.canEnterManage || !userId) return;
    try {
      const list = await api.callFunction('qrcode', 'list', {
        recommender_id: userId,
        type: 'agent_referral',
        status: 'active'
      }, { showLoading: false });

      if (Array.isArray(list) && list.length) {
        this.setData({ agentQr: list[0] });
      }
    } catch (err) {
      console.warn('加载分销二维码失败:', err);
    }
  },

  async generateAgentQr() {
    const userId = homeIdentityUtils.getUserId(this.data.userInfo);
    if (!this.data.canEnterManage || !userId) {
      wx.showToast({ title: '您没有权限', icon: 'none' });
      return;
    }

    this.setData({ generatingQr: true });
    try {
      const qrInfo = await api.callFunction('qrcode', 'generate', {
        type: 'agent_referral',
        recommender_id: userId
      }, { loadingText: '生成二维码中...' });

      this.setData({
        agentQr: {
          _id: qrInfo.id,
          code: qrInfo.code,
          type: qrInfo.type,
          qr_url: qrInfo.qrUrl,
          landing_page: qrInfo.landing_page,
          recommender_name: qrInfo.recommender_name
        }
      });
      wx.showToast({ title: '推广二维码已生成', icon: 'success' });
    } catch (err: any) {
      wx.showToast({ title: err.message || '生成失败', icon: 'none' });
    } finally {
      this.setData({ generatingQr: false });
    }
  },

  previewAgentQr() {
    if (!this.data.agentQr?.qr_url) return;
    wx.previewImage({ urls: [this.data.agentQr.qr_url], current: this.data.agentQr.qr_url });
  },

  copyReferralCode() {
    if (!this.data.agentQr?.code) return;
    wx.setClipboardData({
      data: this.data.agentQr.code,
      success: () => wx.showToast({ title: '推广码已复制', icon: 'success' })
    });
  },

  saveAgentQrImage() {
    const { agentQr } = this.data;
    if (!agentQr?.qr_url) {
      wx.showToast({ title: '请先生成二维码', icon: 'none' });
      return;
    }

    wx.showLoading({ title: '保存中...' });
    wx.downloadFile({
      url: agentQr.qr_url,
      success: (res) => {
        if (res.statusCode === 200) {
          wx.saveImageToPhotosAlbum({
            filePath: res.tempFilePath,
            success: () => {
              wx.hideLoading();
              wx.showToast({ title: '保存成功', icon: 'success' });
            },
            fail: (err) => {
              wx.hideLoading();
              if (err.errMsg.includes('auth deny')) {
                wx.showToast({ title: '请授权保存图片', icon: 'none' });
              } else {
                wx.showToast({ title: '保存失败', icon: 'none' });
              }
            }
          });
        } else {
          wx.hideLoading();
          wx.showToast({ title: '下载失败', icon: 'none' });
        }
      },
      fail: () => {
        wx.hideLoading();
        wx.showToast({ title: '下载失败', icon: 'none' });
      }
    });
  },

  async goToOnboard() {
    if (!this.data.canEnterManage) {
      wx.showToast({ title: '您没有扫码入职权限', icon: 'none' });
      return;
    }

    this.setData({
      showOnboardModal: true,
      onboardModalLoading: true,
      selectedCompanyId: '',
      selectedJobId: '',
      selectedCompanyName: '',
      selectedJobName: '',
      generatedOnboardQr: null,
      onboardCompanies: [],
      onboardJobs: [],
      onboardJobsLoading: false
    });
    
    this.loadOnboardCompanies();
  },

  async loadOnboardCompanies() {
    try {
      const result = await api.callFunction('companies', 'list', { page: 1, pageSize: 100 }, { showLoading: false });
      const companies = this.normalizeCompanies(result?.list || []);
      this.setData({
        onboardCompanies: companies,
        onboardModalLoading: false
      });
    } catch (err) {
      console.error('获取企业列表失败:', err);
      wx.showToast({ title: '获取企业列表失败', icon: 'none' });
      this.setData({ onboardModalLoading: false });
    }
  },

  onCompanyChange(e: any) {
    const index = parseInt(e.detail.value);
    const companies = this.data.onboardCompanies;
    
    if (index >= 0 && index < companies.length) {
      const company = companies[index];
      this.setData({
        selectedCompanyId: company._id,
        selectedCompanyName: company.display_name || company.name || company.company_name || company.companyName || '企业',
        selectedJobId: '',
        selectedJobName: '',
        onboardJobs: [],
        onboardJobsLoading: false
      });
      this.loadOnboardJobs(company._id);
    } else {
      this.setData({
        selectedCompanyId: '',
        selectedCompanyName: '',
        selectedJobId: '',
        selectedJobName: '',
        onboardJobs: [],
        onboardJobsLoading: false
      });
    }
  },

  async loadOnboardJobs(companyId: string) {
    this.setData({ onboardJobsLoading: true, onboardJobs: [] });
    try {
      const result = await api.callFunction('jobs', 'list', { page: 1, pageSize: 200, company_id: companyId }, { showLoading: false });
      const jobs = this.normalizeJobs(result?.list || []);
      this.setData({ onboardJobs: jobs, onboardJobsLoading: false });
    } catch (err) {
      console.error('获取岗位列表失败:', err);
      this.setData({ onboardJobsLoading: false });
    }
  },

  onJobChange(e: any) {
    const index = parseInt(e.detail.value);
    const jobs = this.data.onboardJobs;
    
    if (index >= 0 && index < jobs.length) {
      const job = jobs[index];
      this.setData({
        selectedJobId: job._id,
        selectedJobName: job.position || job.job_name || job.jobName || '岗位'
      });
    } else {
      this.setData({ selectedJobId: '', selectedJobName: '' });
    }
  },

  async generateOnboardQr() {
    const { selectedCompanyId, selectedJobId, userInfo, selectedCompanyName, selectedJobName } = this.data;

    if (!selectedCompanyId) {
      wx.showToast({ title: '请选择企业', icon: 'none' });
      return;
    }
    if (!selectedJobId) {
      wx.showToast({ title: '请选择岗位', icon: 'none' });
      return;
    }

    this.setData({ onboardQrLoading: true });
    try {
      const result = await api.callFunction('qrcode', 'generate', {
        type: 'internal_onboard',
        company_id: selectedCompanyId,
        job_id: selectedJobId,
        creator_id: homeIdentityUtils.getUserId(userInfo)
      });

      this.setData({
        generatedOnboardQr: {
          ...result,
          company_name: selectedCompanyName,
          job_name: selectedJobName
        }
      });
      wx.showToast({ title: '二维码生成成功', icon: 'success' });
    } catch (err: any) {
      wx.showToast({ title: err.message || '生成失败', icon: 'none' });
    } finally {
      this.setData({ onboardQrLoading: false });
    }
  },

  saveOnboardQrImage() {
    const { generatedOnboardQr } = this.data;
    if (!generatedOnboardQr?.qrUrl) {
      wx.showToast({ title: '请先生成二维码', icon: 'none' });
      return;
    }

    wx.showLoading({ title: '保存中...' });
    wx.downloadFile({
      url: generatedOnboardQr.qrUrl,
      success: (res) => {
        if (res.statusCode === 200) {
          wx.saveImageToPhotosAlbum({
            filePath: res.tempFilePath,
            success: () => {
              wx.hideLoading();
              wx.showToast({ title: '保存成功', icon: 'success' });
            },
            fail: (err) => {
              wx.hideLoading();
              if (err.errMsg.includes('auth deny')) {
                wx.showToast({ title: '请授权保存图片', icon: 'none' });
              } else {
                wx.showToast({ title: '保存失败', icon: 'none' });
              }
            }
          });
        } else {
          wx.hideLoading();
          wx.showToast({ title: '下载失败', icon: 'none' });
        }
      },
      fail: () => {
        wx.hideLoading();
        wx.showToast({ title: '下载失败', icon: 'none' });
      }
    });
  },

  closeOnboardModal() {
    this.setData({ showOnboardModal: false });
  },

  closeApplyModal() {
    this.setData({ showApplyModal: false });
  },

  closeCheckinModal() {
    this.setData({ showCheckinModal: false });
  },

  async goToApply() {
    if (!this.data.canEnterManage) {
      wx.showToast({ title: '您没有权限', icon: 'none' });
      return;
    }

    this.setData({
      showApplyModal: true,
      applyModalLoading: true,
      selectedApplyCompanyId: '',
      selectedApplyJobId: '',
      selectedApplyCompanyName: '',
      selectedApplyJobName: '',
      selectedApplyDate: getChinaDateTimeParts().date,
      selectedApplyTime: getChinaDateTimeParts().time,
      generatedApplyQr: null,
      applyCompanies: [],
      applyJobs: [],
      applyJobsLoading: false
    });
    
    this.loadApplyCompanies();
  },

  async loadApplyCompanies() {
    try {
      const result = await api.callFunction('companies', 'list', { page: 1, pageSize: 100 }, { showLoading: false });
      const companies = this.normalizeCompanies(result?.list || []);
      this.setData({
        applyCompanies: companies,
        applyModalLoading: false
      });
    } catch (err) {
      console.error('获取企业列表失败:', err);
      this.setData({ applyModalLoading: false });
    }
  },

  onApplyCompanyChange(e: any) {
    const index = parseInt(e.detail.value);
    const companies = this.data.applyCompanies;
    
    if (index >= 0 && index < companies.length) {
      const company = companies[index];
      this.setData({
        selectedApplyCompanyId: company._id,
        selectedApplyCompanyName: company.display_name || company.name || company.company_name || company.companyName || '企业',
        selectedApplyJobId: '',
        selectedApplyJobName: '',
        selectedApplyDate: getChinaDateTimeParts().date,
        selectedApplyTime: getChinaDateTimeParts().time,
        applyJobs: [],
        applyJobsLoading: false
      });
      this.loadApplyJobs(company._id);
    } else {
      this.setData({
        selectedApplyCompanyId: '',
        selectedApplyCompanyName: '',
        selectedApplyJobId: '',
        selectedApplyJobName: '',
        selectedApplyDate: getChinaDateTimeParts().date,
        selectedApplyTime: getChinaDateTimeParts().time,
        applyJobs: [],
        applyJobsLoading: false
      });
    }
  },

  async loadApplyJobs(companyId: string) {
    this.setData({ applyJobsLoading: true, applyJobs: [] });
    try {
      const result = await api.callFunction('jobs', 'list', { page: 1, pageSize: 200, company_id: companyId }, { showLoading: false });
      const jobs = this.normalizeJobs(result?.list || []);
      this.setData({ applyJobs: jobs, applyJobsLoading: false });
    } catch (err) {
      console.error('获取岗位列表失败:', err);
      this.setData({ applyJobsLoading: false });
    }
  },

  onApplyJobChange(e: any) {
    const index = parseInt(e.detail.value);
    const jobs = this.data.applyJobs;
    
    if (index >= 0 && index < jobs.length) {
      const job = jobs[index];
      this.setData({
        selectedApplyJobId: job._id,
        selectedApplyJobName: job.position || job.job_name || job.jobName || '岗位',
        selectedApplyDate: this.data.selectedApplyDate || getChinaDateTimeParts().date,
        selectedApplyTime: this.data.selectedApplyTime || getChinaDateTimeParts().time
      });
    } else {
      this.setData({
        selectedApplyJobId: '',
        selectedApplyJobName: '',
        selectedApplyDate: getChinaDateTimeParts().date,
        selectedApplyTime: getChinaDateTimeParts().time
      });
    }
  },

  onApplyDateChange(e: any) {
    this.setData({ selectedApplyDate: e.detail.value });
  },

  onApplyTimeChange(e: any) {
    this.setData({ selectedApplyTime: e.detail.value });
  },

  async generateApplyQr() {
    const { selectedApplyCompanyId, selectedApplyJobId, userInfo, selectedApplyCompanyName, selectedApplyJobName, selectedApplyDate, selectedApplyTime } = this.data;

    if (!selectedApplyCompanyId) {
      wx.showToast({ title: '请选择企业', icon: 'none' });
      return;
    }
    if (!selectedApplyJobId) {
      wx.showToast({ title: '请选择岗位', icon: 'none' });
      return;
    }
    if (!selectedApplyDate || !selectedApplyTime) {
      wx.showToast({ title: '请选择面试时间', icon: 'none' });
      return;
    }

    const interviewTime = `${selectedApplyDate} ${selectedApplyTime}`;
    
    this.setData({ applyQrLoading: true });
    try {
      const result = await api.callFunction('qrcode', 'generate', {
        type: 'job_apply',
        job_id: selectedApplyJobId,
        interview_time: interviewTime,
        creator_id: homeIdentityUtils.getUserId(userInfo)
      });

      const generatedApplyQr = {
        ...result,
        company_name: selectedApplyCompanyName,
        job_name: selectedApplyJobName,
        interview_time: result?.interview_time || interviewTime,
        qrLocalPath: ''
      };

      this.setData({
        generatedApplyQr: {
          ...generatedApplyQr
        }
      });
      await this.prepareApplyQrImage();
      wx.showToast({ title: '二维码生成成功', icon: 'success' });
    } catch (err: any) {
      wx.showToast({ title: err.message || '生成失败', icon: 'none' });
    } finally {
      this.setData({ applyQrLoading: false });
    }
  },

  getApplyQrFileID(qr: any): string {
    return String(qr?.qrFileID || qr?.qr_file_id || qr?.fileID || '').trim();
  },

  downloadCloudFile(fileID: string): Promise<string> {
    return new Promise((resolve, reject) => {
      wx.cloud.downloadFile({
        fileID,
        success: (res: any) => resolve(res.tempFilePath || ''),
        fail: reject
      });
    });
  },

  downloadRemoteFile(url: string): Promise<string> {
    return new Promise((resolve, reject) => {
      wx.downloadFile({
        url,
        success: (res: any) => {
          if (res.statusCode === 200 && res.tempFilePath) {
            resolve(res.tempFilePath);
          } else {
            reject(new Error('下载失败'));
          }
        },
        fail: reject
      });
    });
  },

  saveImageToAlbum(filePath: string): Promise<void> {
    return new Promise((resolve, reject) => {
      wx.saveImageToPhotosAlbum({
        filePath,
        success: () => resolve(),
        fail: reject
      });
    });
  },

  async prepareApplyQrImage() {
    const { generatedApplyQr } = this.data;
    if (!generatedApplyQr) return;

    const fileID = this.getApplyQrFileID(generatedApplyQr);
    try {
      const qrLocalPath = fileID
        ? await this.downloadCloudFile(fileID)
        : (generatedApplyQr.qrUrl ? await this.downloadRemoteFile(generatedApplyQr.qrUrl) : '');
      if (qrLocalPath) {
        this.setData({ 'generatedApplyQr.qrLocalPath': qrLocalPath });
      }
    } catch (err) {
      console.warn('报名二维码预下载失败，将保留远程地址展示:', err);
    }
  },

  async saveApplyQrImage() {
    const { generatedApplyQr } = this.data;
    const fileID = this.getApplyQrFileID(generatedApplyQr);
    const remoteUrl = String(generatedApplyQr?.qrUrl || '').trim();
    const existingLocalPath = String(generatedApplyQr?.qrLocalPath || '').trim();

    if (!existingLocalPath && !fileID && !remoteUrl) {
      wx.showToast({ title: '请先生成二维码', icon: 'none' });
      return;
    }

    wx.showLoading({ title: '保存中...' });
    try {
      const filePath = existingLocalPath
        || (fileID ? await this.downloadCloudFile(fileID) : '')
        || (remoteUrl ? await this.downloadRemoteFile(remoteUrl) : '');

      if (!filePath) throw new Error('下载失败');
      if (!existingLocalPath) this.setData({ 'generatedApplyQr.qrLocalPath': filePath });

      await this.saveImageToAlbum(filePath);
      wx.hideLoading();
      wx.showToast({ title: '保存成功', icon: 'success' });
    } catch (err: any) {
      wx.hideLoading();
      const errMsg = String(err?.errMsg || err?.message || '');
      if (errMsg.includes('auth deny') || errMsg.includes('authorize')) {
        wx.showToast({ title: '请授权保存图片', icon: 'none' });
      } else {
        wx.showToast({ title: '下载失败', icon: 'none' });
      }
    }
  },

  async goToCheckin() {
    if (!this.data.canEnterManage) {
      wx.showToast({ title: '您没有权限', icon: 'none' });
      return;
    }

    this.setData({
      showCheckinModal: true,
      checkinModalLoading: true,
      selectedCheckinCompanyId: '',
      selectedCheckinJobId: '',
      selectedCheckinCompanyName: '',
      selectedCheckinJobName: '',
      selectedCheckinDate: '',
      selectedCheckinLocation: '',
      generatedCheckinQr: null,
      checkinCompanies: [],
      checkinJobs: [],
      checkinJobsLoading: false
    });

    this.loadCheckinCompanies();
  },

  async loadCheckinCompanies() {
    try {
      const result = await api.callFunction('companies', 'list', { page: 1, pageSize: 100 }, { showLoading: false });
      const companies = this.normalizeCompanies(result?.list || []);
      this.setData({
        checkinCompanies: companies,
        checkinModalLoading: false
      });
    } catch (err) {
      console.error('获取企业列表失败:', err);
      wx.showToast({ title: '获取企业列表失败', icon: 'none' });
      this.setData({ checkinModalLoading: false });
    }
  },

  onCheckinCompanyChange(e: any) {
    const index = parseInt(e.detail.value);
    const companies = this.data.checkinCompanies;

    if (index >= 0 && index < companies.length) {
      const company = companies[index];
      this.setData({
        selectedCheckinCompanyId: company._id,
        selectedCheckinCompanyName: company.display_name || company.name || company.company_name || company.companyName || '企业',
        selectedCheckinJobId: '',
        selectedCheckinJobName: '',
        selectedCheckinDate: '',
        selectedCheckinLocation: '',
        checkinJobs: [],
        checkinJobsLoading: false
      });
      this.loadCheckinJobs(company._id);
    } else {
      this.setData({
        selectedCheckinCompanyId: '',
        selectedCheckinCompanyName: '',
        selectedCheckinJobId: '',
        selectedCheckinJobName: '',
        selectedCheckinDate: '',
        selectedCheckinLocation: '',
        checkinJobs: [],
        checkinJobsLoading: false
      });
    }
  },

  async loadCheckinJobs(companyId: string) {
    this.setData({ checkinJobsLoading: true, checkinJobs: [] });
    try {
      const result = await api.callFunction('jobs', 'list', { page: 1, pageSize: 200, company_id: companyId }, { showLoading: false });
      const jobs = this.normalizeJobs(result?.list || []);
      this.setData({ checkinJobs: jobs, checkinJobsLoading: false });
    } catch (err) {
      console.error('获取岗位列表失败:', err);
      this.setData({ checkinJobsLoading: false });
    }
  },

  onCheckinJobChange(e: any) {
    const index = parseInt(e.detail.value);
    const jobs = this.data.checkinJobs;

    if (index >= 0 && index < jobs.length) {
      const job = jobs[index];
      this.setData({
        selectedCheckinJobId: job._id,
        selectedCheckinJobName: job.position || job.job_name || job.jobName || '岗位',
        selectedCheckinDate: ''
      });
    } else {
      this.setData({ selectedCheckinJobId: '', selectedCheckinJobName: '', selectedCheckinDate: '' });
    }
  },

  onCheckinDateChange(e: any) {
    this.setData({ selectedCheckinDate: e.detail.value });
  },

  onCheckinLocationInput(e: any) {
    this.setData({ selectedCheckinLocation: e.detail.value });
  },

  async generateCheckinQr() {
    const {
      selectedCheckinCompanyId,
      selectedCheckinJobId,
      selectedCheckinCompanyName,
      selectedCheckinJobName,
      selectedCheckinDate,
      selectedCheckinLocation,
      userInfo
    } = this.data;

    if (!selectedCheckinCompanyId) {
      wx.showToast({ title: '请选择企业', icon: 'none' });
      return;
    }
    if (!selectedCheckinJobId) {
      wx.showToast({ title: '请选择岗位', icon: 'none' });
      return;
    }
    if (!selectedCheckinDate) {
      wx.showToast({ title: '请选择面试日期', icon: 'none' });
      return;
    }

    this.setData({ checkinQrLoading: true });
    try {
      const result = await api.callFunction('qrcode', 'generate', {
        type: 'interview_checkin',
        company_id: selectedCheckinCompanyId,
        job_id: selectedCheckinJobId,
        interview_date: selectedCheckinDate,
        location: String(selectedCheckinLocation || '').trim(),
        creator_id: homeIdentityUtils.getUserId(userInfo)
      });

      this.setData({
        generatedCheckinQr: {
          ...result,
          company_name: selectedCheckinCompanyName,
          job_name: selectedCheckinJobName,
          interview_date: selectedCheckinDate,
          location: String(selectedCheckinLocation || '').trim()
        }
      });
      wx.showToast({ title: '二维码生成成功', icon: 'success' });
    } catch (err: any) {
      wx.showToast({ title: err.message || '生成失败', icon: 'none' });
    } finally {
      this.setData({ checkinQrLoading: false });
    }
  },

  saveCheckinQrImage() {
    const { generatedCheckinQr } = this.data;
    if (!generatedCheckinQr?.qrUrl) {
      wx.showToast({ title: '请先生成二维码', icon: 'none' });
      return;
    }

    wx.showLoading({ title: '保存中...' });
    wx.downloadFile({
      url: generatedCheckinQr.qrUrl,
      success: (res) => {
        if (res.statusCode === 200) {
          wx.saveImageToPhotosAlbum({
            filePath: res.tempFilePath,
            success: () => {
              wx.hideLoading();
              wx.showToast({ title: '保存成功', icon: 'success' });
            },
            fail: (err) => {
              wx.hideLoading();
              if (err.errMsg.includes('auth deny')) {
                wx.showToast({ title: '请授权保存图片', icon: 'none' });
              } else {
                wx.showToast({ title: '保存失败', icon: 'none' });
              }
            }
          });
        } else {
          wx.hideLoading();
          wx.showToast({ title: '下载失败', icon: 'none' });
        }
      },
      fail: () => {
        wx.hideLoading();
        wx.showToast({ title: '下载失败', icon: 'none' });
      }
    });
  },

  onLoginClose() {
    this.setData({ showLoginSheet: false });
  },

  onLoginSuccess() {
    this.setData({ showLoginSheet: false });
    this.loadUserInfo();
  },

  onPullDownRefresh() {
    this.loadUserInfo().then(() => wx.stopPullDownRefresh());
  },

  onShareAppMessage() {
    const sharePath = this.data.isAgent && this.data.agentQr?.code
      ? `/pages/home/home?ref_code=${encodeURIComponent(this.data.agentQr.code)}`
      : '/pages/home/home';
    return { title: '加入展瑞分销团队，开启高薪事业', path: sharePath };
  }
});

export {};
