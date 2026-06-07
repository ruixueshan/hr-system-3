// app.ts
const api = require('./utils/api');

interface GlobalData {
  isLoggedIn: boolean;
  userInfo: any | null;
  envId: string;
  serviceBtnPosition: {
    top: number;
    left: number;
  } | null;
}

App({
  globalData: {
    isLoggedIn: false,
    userInfo: null,
    envId: 'cloud1-5glojms9a83c3457',
    serviceBtnPosition: null
  },

  onLaunch() {
    this.initCloud();
    this.checkLogin();
  },

  async initCloud() {
    try {
      wx.cloud.init({
        env: 'cloud1-5glojms9a83c3457',
        traceUser: true
      });

      this.globalData.envId = 'cloud1-5glojms9a83c3457';

      // 确保用户登录状态，获取 openid
      await new Promise<void>((resolve, reject) => {
        wx.login({
          success: (res) => {
            console.log('wx.login 成功，code:', res.code);
            resolve();
          },
          fail: (err) => {
            console.error('wx.login 失败:', err);
            reject(err);
          }
        });
      });
    } catch (err) {
      console.error('云开发初始化失败:', err);
    }
  },

  async checkLogin() {
    const token = wx.getStorageSync('token');
    if (!token) {
      this.globalData.isLoggedIn = false;
      return;
    }

    try {
      const result = await api.callFunction('auth', 'verify-token', { token });
      this.globalData.userInfo = result.userInfo;
      this.globalData.isLoggedIn = true;
    } catch (err) {
      wx.removeStorageSync('token');
      this.globalData.isLoggedIn = false;
    }
  },

  logout() {
    wx.removeStorageSync('token');
    this.globalData.isLoggedIn = false;
    this.globalData.userInfo = null;
    wx.showToast({ title: '已退出', icon: 'none' });
  }
});

export {};
