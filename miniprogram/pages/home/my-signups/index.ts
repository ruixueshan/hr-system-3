const api = require('../../../utils/api');
const permissionUtils = require('../../../utils/permissions');

const PAGE_SIZE = 20;
const RESULT_OPTIONS = [
  { label: '待面试', value: 'pending' },
  { label: '已通过', value: 'passed' },
  { label: '未通过', value: 'rejected' },
  { label: '未参加', value: 'noshow' }
];

function formatDateTime(value = ''): string {
  const text = String(value || '').trim();
  if (!text) return '-';
  return text.replace('T', ' ').slice(0, 16);
}

function buildResultInfo(result = 'pending') {
  const map: Record<string, { text: string; color: string }> = {
    pending: { text: '待面试', color: '#f59e0b' },
    passed: { text: '已通过', color: '#10b981' },
    rejected: { text: '未通过', color: '#ef4444' },
    noshow: { text: '未参加', color: '#94a3b8' },
    hired: { text: '已入职', color: '#22c55e' }
  };

  return map[result] || { text: result || '未知', color: '#94a3b8' };
}

function normalizeJobItem(item: any) {
  const jobName = item.position || item.job_name || item.jobName || '未命名岗位';
  const companyName = item.company_name || item.companyName || '未分配企业';
  return {
    ...item,
    label: `${jobName} · ${companyName}`,
    job_name: jobName,
    company_name: companyName
  };
}

Page({
  data: {
    bootstrapping: true,
    loading: false,
    loadingMore: false,
    submitting: false,
    hasPermission: false,
    userInfo: null as any,
    permissions: [] as string[],
    list: [] as any[],
    page: 1,
    pageSize: PAGE_SIZE,
    total: 0,
    hasMore: false,
    candidateName: '',
    jobName: '',
    selectedResult: 'pending',
    resultOptions: [{ label: '全部', value: '' }, ...RESULT_OPTIONS],
    resultOptionIndex: 1,
    currentResultLabel: '待面试',
    dateFrom: '',
    dateTo: '',
    selectedIds: [] as string[],
    jobsOptions: [] as any[],
    jobsLoading: false,
    selectedJobIndex: -1,
    selectedJobLabel: '',
    showEditor: false,
    editorTitle: '安排面试',
    form: {
      _id: '',
      candidate_name: '',
      phone: '',
      job_id: '',
      job_name: '',
      company_name: '',
      interview_type: 'offline',
      interviewer: '',
      remark: '',
      result: 'pending',
      status: 'scheduled'
    },
    formDate: '',
    formTime: ''
  },

  onLoad() {
    void this.bootstrap();
  },

  onShow() {
    if (this.data.hasPermission && !this.data.showEditor && !this.data.bootstrapping) {
      void this.loadList(true);
    }
  },

  onPullDownRefresh() {
    this.loadList(true).finally(() => wx.stopPullDownRefresh());
  },

  onReachBottom() {
    if (this.data.hasMore && !this.data.loadingMore && !this.data.loading) {
      void this.loadList(false);
    }
  },

  async bootstrap() {
    const token = wx.getStorageSync('token');
    if (!token) {
      this.setData({ bootstrapping: false, hasPermission: false });
      wx.showToast({ title: '请先登录', icon: 'none' });
      return;
    }

    try {
      const userInfo = await api.callFunction('users', 'get-profile', {}, { showLoading: false });
      const permissions = await permissionUtils.loadRolePermissions(userInfo.role || '');
      const hasPermission = permissionUtils.hasPermission(
        permissions,
        permissionUtils.INTERVIEWS_MANAGE_PERMISSION
      );

      this.setData({
        userInfo,
        permissions,
        hasPermission,
        bootstrapping: false
      });

      if (!hasPermission) {
        return;
      }

      await Promise.all([this.loadJobs(), this.loadList(true)]);
    } catch (err) {
      console.error('初始化我的报名页面失败:', err);
      this.setData({ bootstrapping: false, hasPermission: false });
    }
  },

  async loadJobs() {
    this.setData({ jobsLoading: true });
    try {
      const res = await wx.cloud.callFunction({
        name: 'jobs',
        data: { action: 'list', page: 1, pageSize: 200, status: 'active' }
      });
      const result = res.result as any;
      const jobs = (result.code === 0 ? result.data?.list : []) || [];
      this.setData({
        jobsOptions: jobs.map(normalizeJobItem),
        jobsLoading: false
      });
    } catch (err) {
      console.error('加载岗位失败:', err);
      this.setData({ jobsLoading: false });
    }
  },

  normalizeInterviewItem(item: any) {
    return {
      ...item,
      _id: item._id || item.id,
      checked: false,
      resultInfo: buildResultInfo(item.result || 'pending'),
      interviewTypeText: item.interview_type === 'online' ? '线上面试' : '现场面试',
      displayInterviewTime: formatDateTime(item.interview_time)
    };
  },

  syncCheckedState(list: any[] = [], selectedIds: string[] = []) {
    const selectedSet = new Set(selectedIds);
    return list.map((item: any) => ({
      ...item,
      checked: selectedSet.has(item._id)
    }));
  },

  async loadList(reset = false) {
    if (!this.data.hasPermission || !this.data.userInfo?.id) {
      return;
    }

    const nextPage = reset ? 1 : this.data.page + 1;
    this.setData(reset ? { loading: true } : { loadingMore: true });

    try {
      const result = await api.callFunction('interviews', 'list', {
        page: nextPage,
        pageSize: this.data.pageSize,
        user_id: this.data.userInfo.id,
        user_role: this.data.userInfo.role || '',
        candidate_name: this.data.candidateName || undefined,
        job_name: this.data.jobName || undefined,
        result: this.data.selectedResult || undefined,
        date_from: this.data.dateFrom || undefined,
        date_to: this.data.dateTo || undefined
      }, { showLoading: false });

      const incoming = (result.list || []).map((item: any) => this.normalizeInterviewItem(item));
      const mergedList = reset ? incoming : this.data.list.concat(incoming);
      const mergedIds = new Set(mergedList.map((item: any) => item._id));

      const selectedIds = this.data.selectedIds.filter((id: string) => mergedIds.has(id));

      this.setData({
        list: this.syncCheckedState(mergedList, selectedIds),
        page: nextPage,
        total: result.total || 0,
        hasMore: nextPage < (result.totalPages || 0),
        selectedIds
      });
    } catch (err) {
      console.error('加载面试列表失败:', err);
    } finally {
      this.setData({ loading: false, loadingMore: false });
    }
  },

  onCandidateNameChange(e: any) {
    this.setData({ candidateName: e.detail.value });
  },

  onJobNameChange(e: any) {
    this.setData({ jobName: e.detail.value });
  },

  onResultChange(e: any) {
    const index = Number(e.detail.value || 0);
    const option = this.data.resultOptions[index] || this.data.resultOptions[0];
    this.setData({
      resultOptionIndex: index,
      selectedResult: option.value,
      currentResultLabel: option.label
    });
  },

  onDateFromChange(e: any) {
    this.setData({ dateFrom: e.detail.value });
  },

  onDateToChange(e: any) {
    this.setData({ dateTo: e.detail.value });
  },

  handleSearch() {
    void this.loadList(true);
  },

  handleReset() {
    this.setData({
      candidateName: '',
      jobName: '',
      selectedResult: 'pending',
      resultOptionIndex: 1,
      currentResultLabel: '待面试',
      dateFrom: '',
      dateTo: ''
    });
    void this.loadList(true);
  },

  callPhone(e: any) {
    const phone = String(e.currentTarget.dataset.phone || '').trim();
    if (!phone || phone === '-') {
      wx.showToast({ title: '暂无联系电话', icon: 'none' });
      return;
    }

    wx.makePhoneCall({
      phoneNumber: phone,
      fail: (err) => {
        console.error('拨打电话失败:', err);
        wx.showToast({ title: '拨打失败', icon: 'none' });
      }
    });
  },

  loadMore() {
    if (this.data.hasMore && !this.data.loadingMore && !this.data.loading) {
      void this.loadList(false);
    }
  },

  toggleSelect(e: any) {
    const id = e.currentTarget.dataset.id;
    if (!id) return;

    const selectedIds = [...this.data.selectedIds];
    const index = selectedIds.indexOf(id);
    if (index >= 0) {
      selectedIds.splice(index, 1);
    } else {
      selectedIds.push(id);
    }

    this.setData({
      selectedIds,
      list: this.syncCheckedState(this.data.list, selectedIds)
    });
  },

  toggleSelectAll() {
    const ids = this.data.list.map((item: any) => item._id).filter(Boolean);
    const allSelected = ids.length > 0 && ids.every((id: string) => this.data.selectedIds.includes(id));
    const selectedIds = allSelected ? [] : ids;
    this.setData({
      selectedIds,
      list: this.syncCheckedState(this.data.list, selectedIds)
    });
  },

  getSelectedRows() {
    const selectedSet = new Set(this.data.selectedIds);
    return this.data.list.filter((item: any) => selectedSet.has(item._id));
  },

  getResultActionText(result: string) {
    const map: Record<string, string> = {
      passed: '通过',
      rejected: '不通过',
      noshow: '未参加',
      hired: '入职'
    };
    return map[result] || '更新';
  },

  async onboardEmployee(interview: any) {
    if (!interview.user_id || !interview.job_id) {
      throw new Error('当前记录缺少候选人或岗位信息，无法办理入职');
    }

    await api.callFunction('employees', 'onboard', {
      user_id: interview.user_id,
      job_id: interview.job_id,
      join_date: new Date().toISOString().slice(0, 10),
      referrer_id: interview.recommender_id || '',
      referrer_name: interview.recommender_name || '',
      operator_id: this.data.userInfo.id,
      operator_name: this.data.userInfo.real_name || this.data.userInfo.name || '',
      operator_role: this.data.userInfo.role || ''
    }, { showLoading: false });
  },

  async processResultUpdate(rows: any[], result: string) {
    if (!rows.length) {
      wx.showToast({ title: '请先选择记录', icon: 'none' });
      return;
    }

    wx.showLoading({ title: '处理中...', mask: true });
    try {
      for (const row of rows) {
        if (result === 'hired') {
          await this.onboardEmployee(row);
        }
        await api.callFunction('interviews', 'update-result', {
          interview_id: row._id,
          result,
          operator_id: this.data.userInfo.id,
          operator_name: this.data.userInfo.real_name || this.data.userInfo.name || '',
          operator_role: this.data.userInfo.role || ''
        }, { showLoading: false });
      }

      wx.hideLoading();
      wx.showToast({ title: '操作成功', icon: 'success' });
      this.setData({ selectedIds: [] });
      await this.loadList(true);
    } catch (err: any) {
      wx.hideLoading();
      console.error('更新面试结果失败:', err);
      wx.showToast({ title: err.message || '操作失败', icon: 'none' });
    }
  },

  handleRowResult(e: any) {
    const { id, result } = e.currentTarget.dataset;
    const row = this.data.list.find((item: any) => item._id === id);
    if (!row) return;

    wx.showModal({
      title: '确认操作',
      content: `确认将该记录标记为${this.getResultActionText(result)}吗？`,
      success: async (res) => {
        if (res.confirm) {
          await this.processResultUpdate([row], result);
        }
      }
    });
  },

  handleBatchResult(e: any) {
    const { result } = e.currentTarget.dataset;
    const rows = this.getSelectedRows();
    if (!rows.length) {
      wx.showToast({ title: '请先选择记录', icon: 'none' });
      return;
    }

    wx.showModal({
      title: '批量操作确认',
      content: `确认批量标记为${this.getResultActionText(result)}吗？`,
      success: async (res) => {
        if (res.confirm) {
          await this.processResultUpdate(rows, result);
        }
      }
    });
  },

  resetForm() {
    this.setData({
      form: {
        _id: '',
        candidate_name: '',
        phone: '',
        job_id: '',
        job_name: '',
        company_name: '',
        interview_type: 'offline',
        interviewer: '',
        remark: '',
        result: 'pending',
        status: 'scheduled'
      },
      formDate: '',
      formTime: '',
      selectedJobIndex: -1,
      selectedJobLabel: ''
    });
  },

  openCreateEditor() {
    this.resetForm();
    this.setData({ showEditor: true, editorTitle: '安排面试' });
  },

  openEditEditor(e: any) {
    const id = e.currentTarget.dataset.id;
    const row = this.data.list.find((item: any) => item._id === id);
    if (!row) return;

    const interviewTime = String(row.interview_time || '');
    const [formDate = '', rawTime = ''] = interviewTime.split(' ');
    const formTime = rawTime.slice(0, 5);
    const selectedJobIndex = this.data.jobsOptions.findIndex((item: any) => item._id === row.job_id);

    this.setData({
      showEditor: true,
      editorTitle: '修改面试',
      selectedJobIndex,
      selectedJobLabel: selectedJobIndex > -1
        ? this.data.jobsOptions[selectedJobIndex].label
        : `${row.job_name || '未命名岗位'} · ${row.company_name || '未分配企业'}`,
      formDate,
      formTime,
      form: {
        _id: row._id,
        candidate_name: row.candidate_name || '',
        phone: row.phone || '',
        job_id: row.job_id || '',
        job_name: row.job_name || '',
        company_name: row.company_name || '',
        interview_type: row.interview_type || 'offline',
        interviewer: row.interviewer || '',
        remark: row.remark || '',
        result: row.result || 'pending',
        status: row.status || 'scheduled'
      }
    });
  },

  closeEditor() {
    this.setData({ showEditor: false });
  },

  onFormInput(e: any) {
    const field = e.currentTarget.dataset.field;
    if (!field) return;
    this.setData({ [`form.${field}`]: e.detail.value });
  },

  onJobPickerChange(e: any) {
    const index = Number(e.detail.value || -1);
    const job = this.data.jobsOptions[index];
    if (!job) return;

    this.setData({
      selectedJobIndex: index,
      selectedJobLabel: job.label,
      'form.job_id': job._id,
      'form.job_name': job.job_name,
      'form.company_name': job.company_name
    });
  },

  onFormDateChange(e: any) {
    this.setData({ formDate: e.detail.value });
  },

  onFormTimeChange(e: any) {
    this.setData({ formTime: e.detail.value });
  },

  onInterviewTypeChange(e: any) {
    const value = e.currentTarget.dataset.value;
    if (!value) return;
    this.setData({ 'form.interview_type': value });
  },

  async submitEditor() {
    const { form, formDate, formTime, userInfo } = this.data;
    if (!form.candidate_name) {
      wx.showToast({ title: '请输入候选人姓名', icon: 'none' });
      return;
    }
    if (!form.phone) {
      wx.showToast({ title: '请输入手机号', icon: 'none' });
      return;
    }
    if (!form.job_id) {
      wx.showToast({ title: '请选择岗位', icon: 'none' });
      return;
    }
    if (!formDate || !formTime) {
      wx.showToast({ title: '请选择面试时间', icon: 'none' });
      return;
    }

    const interviewTime = `${formDate} ${formTime}:00`;
    const payload = {
      interview_id: form._id,
      candidate_name: form.candidate_name,
      phone: form.phone,
      job_id: form.job_id,
      job_name: form.job_name,
      company_name: form.company_name,
      interview_time: interviewTime,
      interview_date: formDate,
      interview_type: form.interview_type,
      interviewer: form.interviewer,
      remark: form.remark,
      result: form.result,
      status: form.status,
      operator_id: userInfo.id,
      operator_name: userInfo.real_name || userInfo.name || '',
      operator_role: userInfo.role || ''
    };

    this.setData({ submitting: true });
    try {
      await api.callFunction('interviews', form._id ? 'update' : 'create', payload, {
        loadingText: form._id ? '保存中...' : '安排中...'
      });
      wx.showToast({ title: '保存成功', icon: 'success' });
      this.setData({ showEditor: false });
      await this.loadList(true);
    } catch (err: any) {
      console.error('保存面试失败:', err);
      wx.showToast({ title: err.message || '保存失败', icon: 'none' });
    } finally {
      this.setData({ submitting: false });
    }
  }
});

export {};
