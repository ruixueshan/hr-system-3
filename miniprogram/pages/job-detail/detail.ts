// pages/job-detail/detail.ts
const api = require('../../utils/api');

// 缓存管理器
const CACHE_KEY_PREFIX = 'job_detail_cache_';
const CACHE_EXPIRE_TIME = 30 * 60 * 1000; // 30分钟缓存
const JOB_DETAIL_SHARE_IMAGE = '../../assets/share/job-detail-share.png';

const SHARE_POSTER_CANVAS_ID = 'sharePosterCanvas';
const SHARE_POSTER_WIDTH = 750;
const SHARE_POSTER_HEIGHT = 960;

const DETAIL_THEME = {
  manufacturing: {
    primary: '#285B1F',
    light: '#E9F4E2',
    accent: '#F4C739'
  },
  logistics: {
    primary: '#9B5D1C',
    light: '#FFF0DE',
    accent: '#F2B55D'
  },
  service: {
    primary: '#176F68',
    light: '#E7F8F5',
    accent: '#3CB8A3'
  },
  office: {
    primary: '#335EA8',
    light: '#ECF2FF',
    accent: '#7C9DF2'
  },
  general: {
    primary: '#285B1F',
    light: '#E9F4E2',
    accent: '#F4C739'
  }
} as const;

function compactText(value: any): string {
  return typeof value === 'string' ? value.trim().replace(/\s+/g, ' ') : '';
}

function pickDetailTheme(job: any): keyof typeof DETAIL_THEME {
  const samples = [job?.title, job?.company_name, job?.company, job?.description, job?.work_content]
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

function createBulletItems(job: any): string[] {
  const items = [] as string[];
  const company = compactText(job?.company_name || job?.company);
  const location = compactText(job?.location || job?.address);
  const workTime = compactText(job?.work_time);
  const education = compactText(job?.education);
  const experience = compactText(job?.experience);

  if (company) {
    items.push(`企业：${company}`);
  }
  if (location) {
    items.push(`地点：${location}`);
  }
  if (workTime) {
    items.push(`时间：${workTime}`);
  }
  if (education && education !== '不限') {
    items.push(`学历：${education}`);
  }
  if (experience && experience !== '不限' && experience !== '经验不限') {
    items.push(`经验：${experience}`);
  }

  return items.slice(0, 4);
}

function createBenefitText(job: any): string {
  const benefits = Array.isArray(job?.benefits) ? job.benefits.filter(Boolean).slice(0, 4) : [];
  if (benefits.length > 0) {
    return benefits.join(' / ');
  }
  return '福利待遇以面试沟通为准';
}

function createRequirementText(job: any): string {
  const parts = [] as string[];
  if (job?.age_min && job?.age_max) {
    parts.push(`${job.age_min}-${job.age_max}岁`);
  } else if (job?.age_min) {
    parts.push(`${job.age_min}岁以上`);
  }

  const education = compactText(job?.education);
  if (education && education !== '不限') {
    parts.push(education);
  }

  const experience = compactText(job?.experience);
  if (experience && experience !== '不限') {
    parts.push(experience);
  }

  if (parts.length === 0) {
    return '条件友好，具体要求见详情页';
  }
  return parts.join(' / ');
}

function createSummaryText(job: any): string {
  const raw = compactText(job?.description || job?.work_content || '');
  if (!raw) {
    return '打开小程序查看岗位详情、报名要求和申请入口';
  }

  const summary = raw
    .replace(/岗位职责[:：]?/g, '')
    .replace(/任职要求[:：]?/g, '')
    .split(/[。；\n]/)
    .map((item) => compactText(item))
    .filter(Boolean)[0] || raw;

  return summary.length > 38 ? `${summary.slice(0, 38)}...` : summary;
}

function wrapText(ctx: WechatMiniprogram.CanvasContext, text: string, maxWidth: number, maxLines: number) {
  const lines = [] as string[];
  let current = '';

  for (const char of text) {
    const next = current + char;
    if (ctx.measureText(next).width > maxWidth && current) {
      lines.push(current);
      current = char;
      if (lines.length === maxLines - 1) {
        break;
      }
    } else {
      current = next;
    }
  }

  if (current && lines.length < maxLines) {
    lines.push(current);
  }

  if (lines.length === maxLines) {
    let last = lines[maxLines - 1];
    while (ctx.measureText(`${last}...`).width > maxWidth && last.length > 0) {
      last = last.slice(0, -1);
    }
    lines[maxLines - 1] = `${last}...`;
  }

  return lines;
}

function roundRect(ctx: WechatMiniprogram.CanvasContext, x: number, y: number, width: number, height: number, radius: number) {
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.lineTo(x + width - radius, y);
  ctx.arcTo(x + width, y, x + width, y + radius, radius);
  ctx.lineTo(x + width, y + height - radius);
  ctx.arcTo(x + width, y + height, x + width - radius, y + height, radius);
  ctx.lineTo(x + radius, y + height);
  ctx.arcTo(x, y + height, x, y + height - radius, radius);
  ctx.lineTo(x, y + radius);
  ctx.arcTo(x, y, x + radius, y, radius);
  ctx.closePath();
}

function buildJobShareTitle(job: any): string {
  const title = job?.title || '热门岗位招聘中';
  const salary = job?.salary_range || '';
  if (salary) {
    return `${title}｜${salary}`;
  }
  return title;
}

Page({
  data: {
    jobId: '',
    job: {} as any,
    loading: true,
    applied: false,
    expectedInterviewTime: '',
    showDatePicker: false,
    startDate: '',
    endDate: '',
    currentUserId: '',
    showLoginSheet: false,
    shareImageUrl: '',
    shareImageReady: false
  },

  onLoad(options: any) {
    console.log('=== onLoad 开始 ===');
    console.log('页面参数 options:', options);
    console.log('options.id:', options.id);

    const { id, recommender_id } = options;

    // 存储分享人参数
    if (recommender_id) {
      wx.setStorageSync('pendingRecommender', {
        recommender_id,
        created_at: Date.now()
      });
    }

    console.log('解构后的 id:', id);

    if (id) {
      console.log('设置 jobId:', id);
      this.setData({ jobId: id });
      console.log('setData 后的 this.data.jobId:', this.data.jobId);

      this.loadJobDetail();
      this.checkApplied();
    } else {
      console.error('id 参数不存在！');
      wx.showToast({ title: '岗位不存在', icon: 'none' });
      setTimeout(() => {
        wx.navigateBack();
      }, 1500);
    }

    // 设置日期选择器的范围
    const today = new Date();
    const todayStr = this.formatDateForPicker(today);
    
    // 设置最大可选日期为未来3个月
    const maxDate = new Date();
    maxDate.setMonth(maxDate.getMonth() + 3);
    const maxDateStr = this.formatDateForPicker(maxDate);
    
    this.setData({
      startDate: todayStr,
      endDate: maxDateStr
    });

    console.log('=== onLoad 结束 ===');
  },

  async loadJobDetail() {
    console.log('=== loadJobDetail 开始 ===');
    console.log('当前 jobId:', this.data.jobId);
    console.log('当前页面 data:', this.data);

    if (!this.data.jobId) {
      console.error('jobId 为空！无法加载岗位详情');
      wx.showToast({ title: '岗位ID不能为空', icon: 'none' });
      setTimeout(() => {
        wx.navigateBack();
      }, 1500);
      return;
    }

    this.setData({ loading: true });
    const cacheKey = CACHE_KEY_PREFIX + this.data.jobId;

    try {
      // 暂时禁用缓存以便调试
      // const cachedData = this.getCache(cacheKey);
      // if (cachedData) {
      //   console.log('从缓存加载岗位详情');
      //   this.setData({ job: cachedData });
      //   // 后台刷新缓存（不等待）
      //   this.refreshJobDetail(cacheKey);
      //   return;
      // }

      // 缓存不存在，调用云函数获取岗位详情
      console.log('准备调用云函数，jobId:', this.data.jobId);
      const requestData = { id: this.data.jobId };
      console.log('请求数据:', requestData);

      const jobData = await api.callFunction('jobs', 'get', requestData);

      console.log('云函数返回数据:', jobData);

      if (!jobData) {
        wx.showToast({ title: '岗位不存在', icon: 'none' });
        setTimeout(() => {
          wx.navigateBack();
        }, 1500);
        return;
      }

      // 格式化数据，适配页面显示
      const dailyHours = jobData.bill_hours || jobData.daily_hours || 8;
      let salaryRange = jobData.salary_range;
      if ((!salaryRange || salaryRange === '面议') && jobData.hourly_rate) {
        const min = Math.round(jobData.hourly_rate * dailyHours * 26);
        const max = Math.round(jobData.hourly_rate * dailyHours * 31);
        salaryRange = `${min}-${max}`;
      } else if (!salaryRange && jobData.salary_min && jobData.salary_max) {
        salaryRange = `${jobData.salary_min}-${jobData.salary_max}`;
      }
      const job = {
        id: jobData._id || this.data.jobId,
        title: jobData.position || '未知职位',
        company: jobData.company_short_name || jobData.company_name || '未知公司',
        company_id: jobData.company_id,
        salary_min: jobData.salary_min,
        salary_max: jobData.salary_max,
        hourly_rate: jobData.hourly_rate,
        salary_type: jobData.salary_type,
        salary_remark: jobData.salary_remark,
        job_type: this.getJobType(jobData),
        work_location: jobData.location,
        education: jobData.education || '不限',
        experience: jobData.experience || '不限',
        tags: jobData.benefits || [],
        description: jobData.description || '暂无描述',
        work_content: jobData.work_content,
        work_time: jobData.work_time || '',
        vacancies: jobData.vacancies || 0,
        recruited: jobData.recruited || 0,
        gender: jobData.gender || '不限',
        age_min: jobData.age_min,
        age_max: jobData.age_max,
        department: jobData.department,
        is_recruiting: jobData.is_recruiting,
        status: jobData.status,
        created_at: this.formatDate(jobData.created_at),
        // 新增字段用于页面展示
        company_name: jobData.company_name || '',
        company_short_name: jobData.company_short_name || '',
        company_address: jobData.company_address || '',
        contact_person: jobData.company_contact || jobData.contact_person || 'HR',
        contact_phone: jobData.company_phone || jobData.contact_phone || '请联系HR',
        address: jobData.location || jobData.company_address || '',
        salary_range: salaryRange || this.formatSalaryRange(jobData),
        shift_type: jobData.shift_type || '',
        bill_hours: dailyHours,
        location: jobData.location || '',
        recruit_count: jobData.vacancies || 0,
        benefits: jobData.benefits || [],
        requirements: jobData.requirements || ''
      };

      this.setData({ job });
      this.generateSharePoster(job);

      // 缓存数据
      this.setCache(cacheKey, job);
    } catch (err: any) {
      console.error('加载岗位详情失败:', err);
      console.error('错误详情:', {
        message: err.message,
        code: err.code,
        result: err.result
      });

      // 如果是404错误，提示岗位不存在
      if (err.code === 404 || (err.result && err.result.code === 404)) {
        wx.showToast({ title: '岗位不存在或已被删除', icon: 'none' });
        setTimeout(() => {
          wx.navigateBack();
        }, 1500);
      } else {
        wx.showToast({ title: err.message || '加载失败', icon: 'none' });
      }
    } finally {
      this.setData({ loading: false });
      console.log('=== loadJobDetail 结束 ===');
    }
  },

  // 后台刷新缓存
  async refreshJobDetail(cacheKey: string) {
    console.log('=== refreshJobDetail 开始 ===');
    console.log('当前 jobId:', this.data.jobId);

    if (!this.data.jobId) {
      console.error('refreshJobDetail: jobId 为空，无法刷新');
      return;
    }

    try {
      const jobData = await api.callFunction('jobs', 'get', {
        id: this.data.jobId
      });

      if (jobData) {
        const job = {
          id: jobData._id || this.data.jobId,
          title: jobData.position || '未知职位',
          company: jobData.company_short_name || jobData.company_name || '未知公司',
          company_id: jobData.company_id,
          salary_min: jobData.salary_min,
          salary_max: jobData.salary_max,
          hourly_rate: jobData.hourly_rate,
          salary_type: jobData.salary_type,
          salary_remark: jobData.salary_remark,
          job_type: this.getJobType(jobData),
          work_location: jobData.location,
          education: jobData.education || '不限',
          experience: jobData.experience || '不限',
          tags: jobData.benefits || [],
          description: jobData.description || '暂无描述',
          work_content: jobData.work_content,
          work_time: jobData.work_time,
          vacancies: jobData.vacancies || 0,
          recruited: jobData.recruited || 0,
          gender: jobData.gender || '不限',
          age_min: jobData.age_min,
          age_max: jobData.age_max,
          department: jobData.department,
          is_recruiting: jobData.is_recruiting,
          status: jobData.status,
          created_at: this.formatDate(jobData.created_at),
          company_name: jobData.company_name || '',
          company_short_name: jobData.company_short_name || '',
          company_address: jobData.company_address || '',
          contact_person: jobData.company_contact || jobData.contact_person || 'HR',
          contact_phone: jobData.company_phone || jobData.contact_phone || '请联系HR',
          address: jobData.location || jobData.company_address || '',
          salary_range: this.formatSalaryRange(jobData),
          location: jobData.location || '',
          recruit_count: jobData.vacancies || 0,
          benefits: jobData.benefits || [],
          requirements: jobData.requirements || ''
        };

        this.setData({ job });
        this.generateSharePoster(job);
        this.setCache(cacheKey, job);
      }
    } catch (err) {
      console.error('刷新缓存失败:', err);
    }
    console.log('=== refreshJobDetail 结束 ===');
  },

  // 获取缓存
  getCache(key: string): any {
    try {
      const cached = wx.getStorageSync(key);
      if (!cached) return null;

      const now = Date.now();
      if (now - cached.timestamp > CACHE_EXPIRE_TIME) {
        // 缓存过期，删除
        wx.removeStorageSync(key);
        return null;
      }

      return cached.data;
    } catch (err) {
      console.error('读取缓存失败:', err);
      return null;
    }
  },

  // 设置缓存
  setCache(key: string, data: any): void {
    try {
      wx.setStorageSync(key, {
        data: data,
        timestamp: Date.now()
      });
    } catch (err) {
      console.error('写入缓存失败:', err);
    }
  },

  async generateSharePoster(job: any) {
    if (!job || !job.id) {
      return;
    }

    this.setData({ shareImageReady: false });

    const themeKey = pickDetailTheme(job);
    const theme = DETAIL_THEME[themeKey];
    const ctx = wx.createCanvasContext(SHARE_POSTER_CANVAS_ID, this);
    const title = compactText(job.title || '热门岗位招聘中');
    const salary = compactText(job.salary_range || '薪资面议');
    const typeLabel = compactText(job.job_type || '岗位详情');
    const bullets = createBulletItems(job);
    const benefitText = createBenefitText(job);
    const requirementText = createRequirementText(job);
    const summaryText = createSummaryText(job);

    ctx.setFillStyle('#F7F4ED');
    ctx.fillRect(0, 0, SHARE_POSTER_WIDTH, SHARE_POSTER_HEIGHT);

    ctx.setFillStyle('#EAF3E4');
    ctx.beginPath();
    ctx.arc(640, 120, 120, 0, Math.PI * 2);
    ctx.fill();

    ctx.setFillStyle('#ECE3D1');
    ctx.beginPath();
    ctx.arc(96, 844, 110, 0, Math.PI * 2);
    ctx.fill();

    ctx.setFillStyle(theme.primary);
    ctx.setFontSize(30);
    ctx.fillText('展瑞招聘', 54, 74);
    ctx.setFillStyle('#889580');
    ctx.setFontSize(22);
    ctx.fillText('岗位详情分享海报', 54, 112);

    ctx.setFillStyle(theme.light);
    roundRect(ctx, 54, 144, 168, 48, 24);
    ctx.fill();
    ctx.setFillStyle(theme.primary);
    ctx.setFontSize(24);
    ctx.fillText(typeLabel || '岗位详情', 86, 175);

    ctx.setFillStyle(theme.primary);
    ctx.setFontSize(68);
    const titleLines = wrapText(ctx, title, 480, 2);
    titleLines.forEach((line, index) => {
      ctx.fillText(line, 54, 264 + index * 84);
    });

    const titleBottom = 264 + (titleLines.length - 1) * 84;

    ctx.setFillStyle('#12BC58');
    roundRect(ctx, 54, titleBottom + 48, 292, 78, 24);
    ctx.fill();
    ctx.setFillStyle('#FFFFFF');
    ctx.setFontSize(38);
    ctx.fillText(salary, 84, titleBottom + 99);

    ctx.setFillStyle('#FFFFFF');
    roundRect(ctx, 54, titleBottom + 154, 642, 246, 28);
    ctx.setShadow(0, 8, 24, 'rgba(35, 65, 28, 0.06)');
    ctx.fill();
    ctx.setShadow(0, 0, 0, 'rgba(0,0,0,0)');

    ctx.setFillStyle('#2A2A2A');
    ctx.setFontSize(28);
    bullets.forEach((line, index) => {
      ctx.fillText(line, 84, titleBottom + 214 + index * 46);
    });

    ctx.setFillStyle('#FFFFFF');
    roundRect(ctx, 54, titleBottom + 426, 642, 176, 28);
    ctx.setShadow(0, 8, 24, 'rgba(35, 65, 28, 0.06)');
    ctx.fill();
    ctx.setShadow(0, 0, 0, 'rgba(0,0,0,0)');

    ctx.setFillStyle(theme.primary);
    ctx.setFontSize(26);
    ctx.fillText('报考条件', 84, titleBottom + 484);
    ctx.fillText('福利待遇', 84, titleBottom + 558);
    ctx.fillText('岗位说明', 84, titleBottom + 632);

    ctx.setFillStyle('#4A4A4A');
    ctx.setFontSize(24);
    const requirementLines = wrapText(ctx, requirementText, 460, 1);
    const benefitLines = wrapText(ctx, benefitText, 460, 1);
    const summaryLines = wrapText(ctx, summaryText, 460, 1);
    ctx.fillText(requirementLines[0] || '', 196, titleBottom + 484);
    ctx.fillText(benefitLines[0] || '', 196, titleBottom + 558);
    ctx.fillText(summaryLines[0] || '', 196, titleBottom + 632);

    ctx.setFillStyle(theme.primary);
    ctx.beginPath();
    ctx.arc(610, titleBottom + 512, 52, 0, Math.PI * 2);
    ctx.fill();
    ctx.setFillStyle('#FFFFFF');
    ctx.setFontSize(24);
    ctx.fillText('薪资', 586, titleBottom + 522);

    ctx.setFillStyle('#F6C83F');
    ctx.beginPath();
    ctx.arc(610, titleBottom + 462, 18, 0, Math.PI * 2);
    ctx.fill();
    ctx.setStrokeStyle('#83AE43');
    ctx.setLineWidth(6);
    ctx.beginPath();
    ctx.moveTo(610, titleBottom + 646);
    ctx.lineTo(594, titleBottom + 550);
    ctx.stroke();

    ctx.setStrokeStyle('#B8B8B8');
    ctx.setLineWidth(3);
    const petalStartY = titleBottom + 462;
    const petalLines = [
      [610, petalStartY - 42],
      [646, petalStartY - 24],
      [664, petalStartY + 10],
      [660, petalStartY + 46],
      [640, petalStartY + 78],
      [610, petalStartY + 92],
      [580, petalStartY + 78],
      [560, petalStartY + 46],
      [556, petalStartY + 10],
      [574, petalStartY - 24]
    ];
    petalLines.forEach(([x, y]) => {
      ctx.beginPath();
      ctx.moveTo(610, petalStartY);
      ctx.lineTo(x, y);
      ctx.stroke();
    });

    ctx.setFillStyle('#12BC58');
    roundRect(ctx, 54, SHARE_POSTER_HEIGHT - 118, 244, 72, 20);
    ctx.fill();
    ctx.setFillStyle('#FFFFFF');
    ctx.setFontSize(32);
    ctx.fillText('打开查看详情', 96, SHARE_POSTER_HEIGHT - 72);

    ctx.setFillStyle('#7F8878');
    ctx.setFontSize(22);
    ctx.fillText('分享后可直接查看岗位详情与申请入口', 354, SHARE_POSTER_HEIGHT - 72);

    ctx.draw(false, () => {
      wx.canvasToTempFilePath({
        canvasId: SHARE_POSTER_CANVAS_ID,
        width: SHARE_POSTER_WIDTH,
        height: SHARE_POSTER_HEIGHT,
        destWidth: SHARE_POSTER_WIDTH,
        destHeight: SHARE_POSTER_HEIGHT,
        fileType: 'png',
        quality: 1,
        success: (res) => {
          this.setData({
            shareImageUrl: res.tempFilePath,
            shareImageReady: true
          });
        },
        fail: (err) => {
          console.error('生成分享海报失败:', err);
          this.setData({ shareImageReady: false });
        }
      }, this);
    });
  },

  // 检查是否已申请
  async checkApplied() {
    try {
      const token = wx.getStorageSync('token');
      if (!token) {
        this.setData({ applied: false });
        return;
      }

      const result = await api.callFunction(
        'applications',
        'check-status',
        { job_id: this.data.jobId },
        { showLoading: false }
      );

      this.setData({ applied: !!result?.has_application && !result?.can_reapply });
    } catch (err) {
      console.error('检查申请状态失败:', err);
      this.setData({ applied: false });
    }
  },

  // 根据薪资类型判断工作类型
  getJobType(job: any): string {
    if (job.salary_type === 'monthly') return '全职';
    if (job.salary_type === 'daily') return '兼职';
    if (job.salary_type === 'hourly') return '时薪';
    return '全职';
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

  // 格式化薪资范围
  formatSalaryRange(job: any): string {
    const { salary_type, salary_min, salary_max, hourly_rate, salary_remark } = job;
    
    if (salary_type === 'monthly') {
      if (salary_min && salary_max) {
        return `${salary_min}K-${salary_max}K/月`;
      } else if (salary_min) {
        return `${salary_min}K以上/月`;
      } else if (salary_max) {
        return `${salary_max}K以下/月`;
      }
    } else if (salary_type === 'daily') {
      if (salary_min && salary_max) {
        return `${salary_min}-${salary_max}元/天`;
      } else if (salary_min) {
        return `${salary_min}元以上/天`;
      }
    } else if (salary_type === 'hourly') {
      if (hourly_rate) {
        return `${hourly_rate}元/小时`;
      }
    }
    
    return salary_remark || '薪资面议';
  },

  async handleApply() {
    const token = wx.getStorageSync('token');
    console.log('申请按钮点击，token:', token ? '存在' : '不存在');
    
    if (!token) {
      this.setData({ showLoginSheet: true });
      return;
    }

    // 获取用户ID，优先从全局数据获取，如果不存在则重新验证token
    const app = getApp() as any;
    console.log('全局数据:', {
      hasUserInfo: !!app.globalData?.userInfo,
      userInfo: app.globalData?.userInfo,
      isLoggedIn: app.globalData?.isLoggedIn
    });
    
    let userId = app.globalData?.userInfo?._id;
    
    if (!userId) {
      console.log('全局数据中没有用户信息，重新验证token');
      try {
        // 调用auth云函数验证token并获取用户信息
        console.log('调用auth云函数验证token...');
        const userInfo = await api.callFunction('auth', 'verify-token', { token });
        console.log('verify-token返回:', userInfo);
        
        if (userInfo && userInfo._id) {
          userId = userInfo._id;
          // 更新全局数据
          app.globalData.userInfo = userInfo;
          app.globalData.isLoggedIn = true;
          console.log('用户信息更新成功，userId:', userId);
        } else {
          console.error('verify-token返回的用户信息无效:', userInfo);
          wx.showToast({ title: '用户信息异常，请重新登录', icon: 'none' });
          wx.removeStorageSync('token');
          app.globalData.isLoggedIn = false;
          app.globalData.userInfo = null;
          return;
        }
      } catch (err: any) {
        console.error('验证token失败:', err);
        wx.showToast({ title: '登录已过期，请重新登录', icon: 'none' });
        wx.removeStorageSync('token');
        app.globalData.isLoggedIn = false;
        app.globalData.userInfo = null;
        return;
      }
    } else {
      console.log('从全局数据获取到userId:', userId);
    }

    // 显示申请表单，包含期望面试时间
    this.showApplyForm(userId);
  },

  // 显示申请表单
  showApplyForm(userId: string) {
    // 保存用户ID，供确认申请时使用
    this.setData({ 
      currentUserId: userId,
      showDatePicker: true 
    });
  },

  // 隐藏申请表单
  hideApplyForm() {
    this.setData({ showDatePicker: false });
  },

  // 日期选择器变化事件
  onDateChange(e: any) {
    const date = e.detail.value;
    this.setData({ expectedInterviewTime: date });
  },

  // 确认申请
  async confirmApply() {
    const { currentUserId, expectedInterviewTime, jobId } = this.data;
    
    // 验证日期格式
    if (!expectedInterviewTime || !this.isValidDate(expectedInterviewTime)) {
      wx.showToast({ title: '请输入有效的日期格式(YYYY-MM-DD)', icon: 'none' });
      return;
    }

    // 确保日期不是过去的时间
    const selectedDate = new Date(expectedInterviewTime);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    if (selectedDate < today) {
      wx.showToast({ title: '请选择今天或未来的日期', icon: 'none' });
      return;
    }

    try {
      // 读取分享人参数（7天内有效）
      let recommender_id = '';
      try {
        const pending = wx.getStorageSync('pendingRecommender');
        if (pending?.recommender_id && (Date.now() - pending.created_at < 7 * 24 * 60 * 60 * 1000)) {
          recommender_id = pending.recommender_id;
        }
      } catch (e) {}

      const applyData: any = {
        user_id: currentUserId,
        job_id: jobId,
        source: 'miniprogram',
        expected_interview_time: expectedInterviewTime
      };
      if (recommender_id) {
        applyData.recommender_id = recommender_id;
      }
      await api.callFunction('applications', 'apply', applyData);
      wx.showToast({ title: '申请成功', icon: 'success' });
      this.setData({ 
        applied: true,
        showDatePicker: false 
      });
    } catch (err: any) {
      console.error('申请失败:', err);
      wx.showToast({
        title: err.message || '申请失败',
        icon: 'none'
      });
    }
  },

  // 格式化日期为YYYY-MM-DD（用于picker）
  formatDateForPicker(date: Date): string {
    const year = date.getFullYear();
    const month = (date.getMonth() + 1).toString().padStart(2, '0');
    const day = date.getDate().toString().padStart(2, '0');
    return `${year}-${month}-${day}`;
  },

  // 验证日期格式 YYYY-MM-DD
  isValidDate(dateString: string): boolean {
    const regex = /^\d{4}-\d{2}-\d{2}$/;
    if (!regex.test(dateString)) return false;
    
    const date = new Date(dateString);
    if (isNaN(date.getTime())) return false;
    
    // 检查格式是否匹配
    const [year, month, day] = dateString.split('-').map(Number);
    return date.getFullYear() === year && 
           date.getMonth() + 1 === month && 
           date.getDate() === day;
  },

  onShareAppMessage() {
    const { job } = this.data;
    const app = getApp() as any;
    const userId = app.globalData?.userInfo?._id;
    let path = `/pages/job-detail/detail?id=${job.id}`;
    if (userId) {
      path += `&recommender_id=${userId}`;
    }
    return {
      title: buildJobShareTitle(job),
      path,
      imageUrl: this.data.shareImageUrl || JOB_DETAIL_SHARE_IMAGE
    };
  },

  onShareTimeline() {
    const { job } = this.data;
    const app = getApp() as any;
    const userId = app.globalData?.userInfo?._id;
    let query = `id=${job.id}`;
    if (userId) {
      query += `&recommender_id=${userId}`;
    }
    return {
      title: buildJobShareTitle(job),
      query
    };
  },

  handleContact() {
    this.consultCustomerService();
  },

  // 咨询客服
  consultCustomerService() {
    // 使用微信客服 API
    wx.openCustomerServiceChat({
      extInfo: { url: 'https://work.weixin.qq.com/kfid/kfc4f915df03d80651d'
      },
      corpId: 'ww55f445641354ff8b',
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

  onLoginClose() {
    this.setData({ showLoginSheet: false });
  },

  onLoginSuccess() {
    this.setData({ showLoginSheet: false });
    this.checkApplied();
  }
});

export {};
