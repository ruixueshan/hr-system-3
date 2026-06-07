// pages/webview/webview.js
Page({
  data: {
    url: '',
    loading: true,
    error: ''
  },

  onLoad(options) {
    console.log('webview onLoad options:', options);
    
    if (options.url) {
      const url = decodeURIComponent(options.url);
      console.log('加载URL:', url);
      
      this.setData({
        url,
        loading: true,
        error: ''
      });
    } else {
      this.setData({
        error: '缺少页面地址',
        loading: false
      });
    }
  },

  onWebViewLoad(e) {
    console.log('webview加载完成', e);
    this.setData({ loading: false });
  },

  onError(e) {
    console.error('webview加载失败', e);
    let errorMsg = '页面加载失败';
    if (e.detail && e.detail.errMsg) {
      errorMsg += ': ' + e.detail.errMsg;
    }
    this.setData({
      error: errorMsg,
      loading: false
    });
  },

  onMessage(e) {
    console.log('webview消息:', e);
  },

  onRetry() {
    const url = this.data.url;
    this.setData({ loading: true, error: '' });
    // 重新加载webview
    this.setData({ url: '' });
    setTimeout(() => {
      this.setData({ url });
    }, 100);
  },

  onCopy() {
    const url = this.data.url;
    wx.setClipboardData({
      data: url,
      success: () => {
        wx.showToast({ title: '链接已复制', icon: 'success' });
      }
    });
  },

  onUnload() {
    // 页面卸载
  }
});