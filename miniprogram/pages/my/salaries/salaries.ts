// pages/my/salaries/salaries.ts
const api = require('../../../utils/api');

Page({
  data: {
    list: [],
    loading: true,
    empty: false,
    totalStats: {
      totalAmount: 0,
      monthCount: 0,
      paidCount: 0
    },
    totalAmountText: '0.00',
    statusMap: {
      'pending': { text: '待计算', color: '#faad14' },
      'calculated': { text: '已计算', color: '#1890ff' },
      'approved': { text: '已审核', color: '#722ed1' },
      'paid': { text: '已发放', color: '#52c41a' }
    },
    expandedIndex: -1
  },
  salaryLoadPromise: null as Promise<void> | null,

  onLoad() {
    this.loadSalaries();
  },

  onShow() {
    this.loadSalaries();
  },

  onPullDownRefresh() {
    this.loadSalaries().finally(() => {
      wx.stopPullDownRefresh();
    });
  },

  async loadSalaries() {
    if (this.salaryLoadPromise) {
      return this.salaryLoadPromise;
    }

    this.setData({ loading: true });

    this.salaryLoadPromise = (async () => {
      try {
        const list = await api.callFunction('salaries-v2', 'my-list', {}, { showLoading: false });

        // 计算统计
        const totalAmount = list.reduce((sum: number, item: any) => {
          return sum + (item.net_pay || 0);
        }, 0);

        const paidCount = list.filter((item: any) => item.status === 'paid').length;
        const monthCount = list.length;

        // 处理日期格式化
        const processedList = list.map((item: any) => ({
          ...item,
          payDate: item.pay_date ? this.formatDate(item.pay_date) : ''
        }));

        this.setData({
          list: processedList,
          totalStats: {
            totalAmount: Math.round(totalAmount * 100) / 100,
            monthCount,
            paidCount
          },
          totalAmountText: (Math.round(totalAmount * 100) / 100).toFixed(2),
          empty: processedList.length === 0
        });
      } catch (err) {
        console.error('加载工资条失败:', err);
        wx.showToast({ title: '加载失败', icon: 'none' });
      } finally {
        this.setData({ loading: false });
        this.salaryLoadPromise = null;
      }
    })();

    return this.salaryLoadPromise;
  },

  formatDate(dateStr: string): string {
    if (!dateStr) return '';
    const date = new Date(dateStr);
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
  },

  formatMoney(amount: any): string {
    if (amount === undefined || amount === null) return '0.00';
    const num = Number(amount);
    if (isNaN(num)) return '0.00';
    return num.toFixed(2);
  },

  toggleDetail(e: any) {
    const index = e.currentTarget.dataset.index;
    this.setData({
      expandedIndex: this.data.expandedIndex === index ? -1 : index
    });
  },

  handleShare(e: any) {
    wx.showToast({ title: '分享功能开发中', icon: 'none' });
  }
});

export {};
