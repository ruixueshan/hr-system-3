// pages/my/applications/applications.ts
const api = require('../../../utils/api');

Page({
  data: {
    list: [],
    loading: true,
    empty: false,
    statusMap: {
      'pending': { text: '待联系', color: '#faad14' },
      'contacted': { text: '已联系', color: '#1890ff' },
      'interview': { text: '已面试', color: '#722ed1' },
      'passed': { text: '已通过', color: '#52c41a' },
      'rejected': { text: '未通过', color: '#ff4d4f' },
      'cancelled': { text: '已取消', color: '#999' }
    }
  },

  onLoad() {
    this.loadList();
  },

  onShow() {
    if (this.data.list.length > 0) {
      this.loadList();
    }
  },

  onPullDownRefresh() {
    this.loadList().finally(() => {
      wx.stopPullDownRefresh();
    });
  },

  async loadList() {
    this.setData({ loading: true });
    
    try {
      const result = await api.callFunction('applications', 'my-list', {});

      const list = result.list || result || [];
      
      this.setData({ 
        list: list.map((item: any) => ({
          ...item,
          apply_time: this.formatDate(item.created_at),
          // 安全的状态信息，防止不存在的状态导致页面报错
          statusInfo: this.getStatusInfo(item.status)
        })),
        empty: list.length === 0
      });
    } catch (err) {
      console.error('加载申请记录失败:', err);
      wx.showToast({ title: '加载失败', icon: 'none' });
    } finally {
      this.setData({ loading: false });
    }
  },

  formatDate(dateStr: string): string {
    if (!dateStr) return '';
    const date = new Date(dateStr);
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));

    if (days === 0) return '今天';
    if (days === 1) return '昨天';
    if (days < 7) return `${days}天前`;

    return date.toLocaleDateString('zh-CN', {
      month: '2-digit',
      day: '2-digit'
    });
  },

  getStatusInfo(status: string): { text: string, color: string } {
    // 默认状态
    const defaultStatus = { text: '未知', color: '#999' };
    if (!status) return defaultStatus;
    
    const statusMap = this.data.statusMap;
    return statusMap[status] || defaultStatus;
  },

  goToDetail(e: any) {
    const id = e.currentTarget.dataset.id;
    wx.navigateTo({
      url: `/pages/job-detail/detail?id=${id}`
    });
  },

  goToIndex() {
    wx.switchTab({
      url: '/pages/index/index'
    });
  },

  handleCancel(e: any) {
    const { id } = e.currentTarget.dataset;
    wx.showModal({
      title: '确认取消',
      content: '确定要取消这个申请吗？',
      success: async (res) => {
        if (res.confirm) {
          try {
            await api.callFunction('applications', 'update-status', { 
              application_id: id, 
              status: 'cancelled' 
            });
            wx.showToast({ title: '已取消', icon: 'success' });
            this.loadList();
          } catch (err) {
            console.error('取消申请失败:', err);
            wx.showToast({ title: '操作失败', icon: 'none' });
          }
        }
      }
    });
  }
});

export {};
