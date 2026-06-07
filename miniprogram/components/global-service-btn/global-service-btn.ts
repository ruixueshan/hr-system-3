// components/global-service-btn/global-service-btn.ts
Component({
  /**
   * 组件的属性列表
   */
  properties: {
    // 是否显示组件
    show: {
      type: Boolean,
      value: true
    },
    // 是否显示标签
    showLabel: {
      type: Boolean,
      value: true
    },
    // 初始位置 - 顶部距离
    initTop: {
      type: Number,
      value: 500
    },
    // 初始位置 - 左侧距离
    initLeft: {
      type: Number,
      value: 300
    },
    // 客服链接
    serviceUrl: {
      type: String,
      value: 'https://work.weixin.qq.com/kfid/kfc4f915df03d80651d'
    },
    // 企业微信 CorpId
    corpId: {
      type: String,
      value: 'ww55f445641354ff8b'
    }
  },

  /**
   * 组件的初始数据
   */
  data: {
    top: 500,
    left: 20
  },

  lifetimes: {
    attached() {
      wx.nextTick(() => {
        this.initPosition();
      });
    },
    detached() {
      this.savePositionToGlobal();
    }
  },

  /**
   * 组件的方法列表
   */
  methods: {
    // 初始化位置
    initPosition() {
      // 尝试从全局存储获取位置
      const app = getApp();
      if (app && app.globalData && app.globalData.serviceBtnPosition) {
        const { top, left } = app.globalData.serviceBtnPosition;
        const nextTop = top || this.data.initTop;
        const nextLeft = left || this.data.initLeft;
        if (nextTop !== this.data.top || nextLeft !== this.data.left) {
          this.setData({
            top: nextTop,
            left: nextLeft
          });
        }
        console.log('从全局存储加载浮动按钮位置:', { top, left });
      } else {
        // 使用初始位置
        const nextTop = this.data.initTop;
        const nextLeft = this.data.initLeft;
        if (nextTop !== this.data.top || nextLeft !== this.data.left) {
          this.setData({
            top: nextTop,
            left: nextLeft
          });
        }
      }
    },

    // 保存位置到全局存储
    savePositionToGlobal() {
      const app = getApp();
      if (app) {
        app.globalData.serviceBtnPosition = {
          top: this.data.top,
          left: this.data.left
        };
        console.log('保存浮动按钮位置到全局:', {
          top: this.data.top,
          left: this.data.left
        });
      }
    },

    // 点击事件
    onTap() {
      console.log('浮动按钮点击');
      this.triggerEvent('tap');
      
      // 如果没有绑定自定义事件，执行默认客服跳转
      this.navigateToService();
    },

    // 跳转到客服页面
    navigateToService() {
      const { corpId, serviceUrl } = this.data;
      
      if (!corpId) {
        wx.showToast({ title: '客服 CorpId 未配置', icon: 'none' });
        return;
      }

      // 使用微信客服 API
      wx.openCustomerServiceChat({
        extInfo: { url: serviceUrl},
        corpId: corpId,
        showMessageCard: true,
        sendMessageTitle: '展瑞人力资源-在线咨询',
        sendMessagePath: '/pages/index/index',
        success: (res) => {
          console.log('打开客服聊天成功', res);
        },
        fail: (err) => {
          console.error('打开客服聊天失败:', err);
        }
      });
    },

    // 触摸移动事件
    onTouchMove(e: any) {
      const touch = e.touches[0];
      const { clientX, clientY } = touch;
      
      // 获取窗口尺寸
      wx.getSystemInfo({
        success: (res) => {
          const { windowWidth, windowHeight } = res;
          const btnWidth = 76;
          const btnHeight = 84;
          
          // 计算边界
          let left = clientX - btnWidth / 2;
          let top = clientY - btnHeight / 2;
          
          // 限制边界
          if (left < 0) left = 0;
          if (left > windowWidth - btnWidth) left = windowWidth - btnWidth;
          if (top < 0) top = 0;
          if (top > windowHeight - btnHeight) top = windowHeight - btnHeight;
          
          this.setData({
            left,
            top
          });
        }
      });
    },

    // 设置位置（外部调用）
    setPosition(top: number, left: number) {
      this.setData({ top, left });
    },

    // 获取当前位置
    getPosition() {
      return {
        top: this.data.top,
        left: this.data.left
      };
    }
  }
});

export {};
