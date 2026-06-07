// pages/index/index.ts

// 轮播图数据
const banners = [
  { id: 1, image: 'https://images.unsplash.com/photo-1552664730-d307ca884978?w=800', link: '' },
  { id: 2, image: 'https://images.unsplash.com/photo-1486406146926-c627a92ad1ab?w=800', link: '' },
  { id: 3, image: 'https://images.unsplash.com/photo-1497215728101-856f4ea42174?w=800', link: '' }
];

const POSTER_YEAR = '2026';
const DEFAULT_ILLUSTRATION = '../../assets/job-posters/general.svg';
const INDEX_SHARE_IMAGE = '/assets/share/index-share.png';

const THEME_CONFIG = {
  manufacturing: {
    label: '制造热招',
    accent: 'green',
    image: '../../assets/job-posters/manufacturing.svg'
  },
  logistics: {
    label: '物流热招',
    accent: 'orange',
    image: '../../assets/job-posters/logistics.svg'
  },
  service: {
    label: '服务热招',
    accent: 'teal',
    image: '../../assets/job-posters/service.svg'
  },
  office: {
    label: '职场热招',
    accent: 'blue',
    image: '../../assets/job-posters/office.svg'
  },
  general: {
    label: '精选岗位',
    accent: 'green',
    image: DEFAULT_ILLUSTRATION
  }
} as const;

function compactText(value: any): string {
  return typeof value === 'string' ? value.trim().replace(/\s+/g, ' ') : '';
}

function formatSalaryDisplay(job: any, salaryRange: string): string {
  if (salaryRange) {
    if (salaryRange.includes('元/')) {
      return salaryRange;
    }
    return `${salaryRange}元/月`;
  }

  if (job.salary_min && job.salary_max) {
    return `${job.salary_min}-${job.salary_max}元/月`;
  }

  if (job.hourly_rate) {
    return `${job.hourly_rate}元/时`;
  }

  return '薪资面议';
}

function pickThemeKey(job: any): keyof typeof THEME_CONFIG {
  const samples = [job.position, job.category, job.company_name, job.company_short_name, job.description]
    .filter(Boolean)
    .join(' ');

  if (/(物流|仓|分拣|快递|配送|装卸|司机)/.test(samples)) {
    return 'logistics';
  }
  if (/(客服|保安|酒店|餐饮|服务|收银|导购|家政|社工|护理)/.test(samples)) {
    return 'service';
  }
  if (/(文员|行政|财务|人事|运营|销售|招商主管|采购)/.test(samples)) {
    return 'office';
  }
  if (/(厂|操作工|普工|技工|焊工|装配|电子|食品|包装|生产|车间|质检)/.test(samples)) {
    return 'manufacturing';
  }
  return 'general';
}

function buildAgeText(job: any): string {
  if (job.age_min && job.age_max) {
    return `${job.age_min}-${job.age_max}周岁均可报名`;
  }
  if (job.age_min) {
    return `${job.age_min}周岁以上可报名`;
  }
  if (job.age_max) {
    return `${job.age_max}周岁以内可报名`;
  }
  return '年龄要求以企业通知为准';
}

function buildEducationText(job: any): string {
  const education = compactText(job.education);
  if (education && education !== '不限') {
    return `${education}及以上学历优先`;
  }
  return '学历要求宽松，经验合适即可';
}

function buildBenefitText(job: any): string {
  const benefits = Array.isArray(job.benefits) ? job.benefits.filter(Boolean) : [];
  if (benefits.length > 0) {
    return benefits.slice(0, 3).join('、');
  }

  const workTime = compactText(job.work_time || job.work_schedule);
  if (workTime) {
    return `${workTime}，岗位安排稳定`;
  }

  return '就近安排，具体福利以面试为准';
}

function buildDescriptionText(job: any): string {
  const description = compactText(job.description);
  if (!description) {
    return '报名政策已出，具体时间以企业通知为准';
  }

  const normalized = description
    .replace(/岗位职责[:：]?/g, '')
    .replace(/任职要求[:：]?/g, '')
    .split(/[。；\n]/)
    .map((item) => compactText(item))
    .filter(Boolean);

  if (normalized.length > 0) {
    return normalized[0];
  }

  return '报名政策已出，具体时间以企业通知为准';
}

function buildPosterHighlights(job: any): string[] {
  const tags = Array.isArray(job.benefits) ? job.benefits.filter(Boolean) : [];
  const highlights = tags.slice(0, 3);

  if (highlights.length < 3 && compactText(job.work_time)) {
    highlights.push(compactText(job.work_time));
  }
  if (highlights.length < 3 && compactText(job.location)) {
    highlights.push(compactText(job.location));
  }
  if (highlights.length < 3) {
    highlights.push('快速上岗');
  }

  return highlights.slice(0, 3);
}

function buildPosterBody(job: any) {
  return [
    {
      label: '报考条件',
      value: buildEducationText(job)
    },
    {
      label: '福利待遇',
      value: buildBenefitText(job)
    },
    {
      label: '岗位说明',
      value: buildDescriptionText(job)
    }
  ];
}

Page({
  data: {
    jobs: [],
    banners: [],
    page: 1,
    pageSize: 20,
    hasMore: true,
    loading: false,
    loadingMore: false,
    keyword: '',
    filterType: '',
    jobTypes: ['日结'],
    showLoginSheet: false,
    // 入群插件：企业微信加入群聊地址
    joinGroupUrl: 'https://work.weixin.qq.com/gm/f2b9884aaf7959b498c7784567437809'
  },

  searchTimer: undefined as any,

  onLoad(options: any) {
    this.setData({ banners });
    this.loadJobs(true);

    // 存储分享人参数
    if (options?.recommender_id) {
      wx.setStorageSync('pendingRecommender', {
        recommender_id: options.recommender_id,
        created_at: Date.now()
      });
    }
  },

  onShow() {
    if (this.data.jobs.length > 0) {
      this.refresh();
    }
  },

  onReachBottom() {
    if (this.data.hasMore && !this.data.loading && !this.data.loadingMore) {
      this.setData({ page: this.data.page + 1 });
      this.loadJobs(false);
    }
  },

  onPullDownRefresh() {
    this.refresh();
  },

  async refresh() {
    this.setData({ page: 1, jobs: [], hasMore: true });
    await this.loadJobs(true);
    wx.stopPullDownRefresh();
  },

  // 从云函数加载职位
  async loadJobs(isRefresh = false) {
    const { page, pageSize, keyword, filterType } = this.data;
    const isLoadMore = !isRefresh && page > 1;
    this.setData(isLoadMore ? { loadingMore: true } : { loading: true });

    const supportsDaily = filterType === 'daily' ? true : undefined;

    try {
      // 通过云函数调用获取岗位列表
      const requestData: any = {
        page,
        pageSize,
        is_recruiting: true,
        keyword: keyword && keyword.trim() ? keyword.trim() : undefined
      };
      
      if (supportsDaily !== undefined) {
        requestData.supports_daily = supportsDaily;
      }

      console.log('搜索请求参数:', { page, pageSize, keyword, filterType, supportsDaily, requestData });

      const res = await wx.cloud.callFunction({
        name: 'jobs',
        data: {
          action: 'list',
          data: requestData
        }
      });

      const result = res.result as any;

      if (result.code !== 0) {
        throw new Error(result.message || '加载失败');
      }

      console.log('搜索返回结果:', { total: result.data?.total, count: result.data?.list?.length, hasMore: result.data?.hasMore });

      const jobList = result.data.list || [];

      // 处理数据，格式化为前端需要的格式
      const jobs = jobList.map((job: any) => {
        const dailyHours = job.bill_hours || job.daily_hours || 8;
        let salaryRange = job.salary_range;
        if ((!salaryRange || salaryRange === '面议') && job.hourly_rate) {
          const min = Math.round(job.hourly_rate * dailyHours * 26);
          const max = Math.round(job.hourly_rate * dailyHours * 31);
          salaryRange = `${min}-${max}`;
        } else if (!salaryRange && job.salary_min && job.salary_max) {
          salaryRange = `${job.salary_min}-${job.salary_max}`;
        }
        const themeKey = pickThemeKey(job);
        const theme = THEME_CONFIG[themeKey];
        const posterBody = buildPosterBody(job);
        const jobType = this.getJobType(job);
        return {
          id: job._id,
          title: job.position,
          company: job.company_short_name || job.company_name || '未知公司',
          company_id: job.company_id,
          salary_min: job.salary_min,
          salary_max: job.salary_max,
          hourly_rate: job.hourly_rate,
          salary_type: job.salary_type,
          job_type: this.getJobType(job),
          work_location: job.location || '',
          education: job.education || '',
          experience: job.experience || '',
          tags: job.benefits || [],
          work_time: job.work_time || '',
          shift_type: job.shift_type || '',
          bill_hours: dailyHours,
          salary_range: salaryRange,
          description: job.description,
          vacancies: job.vacancies || 0,
          gender: job.gender || '不限',
          age_min: job.age_min,
          age_max: job.age_max,
          is_recruiting: job.is_recruiting,
          created_at: this.formatDate(job.created_at),
          salary_display: formatSalaryDisplay(job, salaryRange),
          poster_year: POSTER_YEAR,
          poster_theme: themeKey,
          poster_theme_label: theme.label,
          poster_theme_accent: theme.accent,
          poster_image: theme.image || DEFAULT_ILLUSTRATION,
          poster_badge: '薪资',
          poster_subtitle: `${jobType}岗位信息`,
          poster_body: posterBody,
          poster_highlights: buildPosterHighlights(job),
          poster_primary_highlight: posterBody[2].value,
          poster_button_text: '查看详情'
        };
      });

      this.setData({
        jobs: page === 1 ? jobs : this.data.jobs.concat(jobs),
        hasMore: result.data.hasMore || false,
        loading: false,
        loadingMore: false
      });
    } catch (err) {
      console.error('加载职位失败:', err);
      this.setData({ loading: false, loadingMore: false });
      wx.showToast({
        title: '加载失败，请重试',
        icon: 'none'
      });
    }
  },

  // 根据薪资类型判断工作类型
  getJobType(job: any): string {
    if (job.supports_daily) return '日结';
    if (job.salary_type === 'monthly') return '月结';
    if (job.salary_type === 'hourly') return '时薪';
    return '岗位';
  },

  // 格式化日期
  formatDate(date: any): string {
    if (!date) return '';
    const d = new Date(date.$date || date);
    return d.toLocaleDateString('zh-CN', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit'
    });
  },

  onBannerTap(e: any) {
    const banner = e.currentTarget.dataset.banner;
    if (banner?.link) {
      wx.navigateTo({
        url: banner.link
      });
    }
  },

  handleFilter(e: any) {
    const filterType = e.currentTarget.dataset.type;
    this.setData({ filterType });
    this.refresh();
  },

  onSearchInput(e: any) {
    const keyword = e.detail.value;
    this.setData({ keyword });

    if (this.searchTimer) {
      clearTimeout(this.searchTimer);
    }

    this.searchTimer = setTimeout(() => {
      this.refresh();
    }, 500);
  },

  handleSearch() {
    this.refresh();
  },

  goToDetail(e: any) {
    const id = e.currentTarget.dataset.id;
    wx.navigateTo({
      url: `/pages/job-detail/detail?id=${id}`
    });
  },

  ensureLogin(): boolean {
    const token = wx.getStorageSync('token');
    if (!token) {
      this.setData({ showLoginSheet: true });
      return false;
    }
    return true;
  },

  onShareAppMessage() {
    const app = getApp() as any;
    const userId = app.globalData?.userInfo?._id;
    let path = '/pages/index/index';
    if (userId) {
      path += `?recommender_id=${userId}`;
    }
    return {
      title: '展瑞人力 - 热门岗位招聘中',
      path,
      imageUrl: INDEX_SHARE_IMAGE
    };
  },

  onShareTimeline() {
    const app = getApp() as any;
    const userId = app.globalData?.userInfo?._id;
    return {
      title: '展瑞人力 - 热门岗位招聘中',
      query: userId ? `recommender_id=${userId}` : ''
    };
  },

  onLoginClose() {
    this.setData({ showLoginSheet: false });
  },

  onLoginSuccess() {
    this.setData({ showLoginSheet: false });
    this.refresh();
  },

  // 入群插件：按钮点击开始回调
  onJoinGroupStart() {
    console.log('[joinGroup] 用户点击入群按钮');
  },

  // 入群插件：按钮点击完成回调
  onJoinGroupComplete(e: any) {
    const { errcode, notifytype } = e.detail || {};
    if (errcode === 0) {
      wx.showToast({ title: '加入群聊成功', icon: 'success' });
    } else if (errcode === -3006) {
      if (notifytype === 1) {
        // 群已满，但仍展示二维码，不做额外提示
      } else {
        wx.showToast({ title: '您已在群聊中', icon: 'none' });
      }
    } else if (errcode === -3009) {
      wx.showToast({ title: '群聊已满员', icon: 'none' });
    } else if (errcode === -3010) {
      wx.showToast({ title: '群聊已解散', icon: 'none' });
    } else if (errcode) {
      wx.showToast({ title: '入群失败，请稍后重试', icon: 'none' });
    }
    console.log('[joinGroup] 完成回调', e.detail);
  }
});

export {};
