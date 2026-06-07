// pages/my/worktime/worktime.ts
const api = require('../../../utils/api');

Page({
  data: {
    currentMonth: '',
    maxMonth: '',
    today: '',
    companies: [],
    companyIndex: 0,
    records: [],
    loading: true,
    empty: false,
    totalHours: 0,
    weekHeaders: ['日', '一', '二', '三', '四', '五', '六'],
    calendarDays: [],
    selectedDate: '',
    selectedDayRecords: [],
    showAddSheet: false,
    canReport: true,
    reportDisabledReason: '',
    addForm: {
      work_date: '',
      hours: '',
      shift: 'day',
      employee_company_id: '',
      company_id: '',
      company_entry: '',
      company_leave: ''
    },
    submitting: false,
    employeeInfo: null as any,
    initialized: false,
    loadRecordsSeq: 0,
    keyboardHeight: 0
  },
  _keyboardHeightListener: null as any,
  keyboardHeightScale: 0.9,

  normalizeSettlementMode(value: any): string {
    const text = String(value || '').trim().toLowerCase();
    if (!text) return '';
    if (text === 'daily' || text === '日结') return 'daily';
    if (text === 'monthly' || text === '月结') return 'monthly';
    return text;
  },

  normalizeRecordStatus(value: any): string {
    const text = String(value || '').trim().toLowerCase();
    if (!text) return 'pending';
    if (['approved', 'pass', 'passed', 'success', 'done', 'ok', '通过', '已通过', '已审核', '已审核通过'].includes(text)) return 'approved';
    if (['rejected', 'reject', 'failed', 'refused', '驳回', '拒绝', '未通过'].includes(text)) return 'rejected';
    return 'pending';
  },

  getReportableCompanies(list: any[] = []) {
    return (Array.isArray(list) ? list : [])
      .map((item: any) => {
        const relationId = String(item?.employee_company_id || item?._id || '').trim();
        const companyId = String(item?.company_id || '').trim();
        if (!relationId || !companyId) return null;
        const settlementMode = this.normalizeSettlementMode(item?.settlement_mode || item?.salary_type);
        const status = String(item?.status || '').trim().toLowerCase();
        if (status === 'cancelled' || status === 'inactive' || status === 'disabled' || status === 'archived' || status === 'deleted') return null;
        return {
          ...item,
          _id: relationId,
          employee_company_id: relationId,
          company_id: companyId,
          settlement_mode: settlementMode || 'daily',
          join_date: this.toDateStr(item?.join_date),
          leave_date: this.toDateStr(item?.leave_date)
        };
      })
      .filter(Boolean);
  },

  applyCompanies(list: any[] = []) {
    const normalized = this.getReportableCompanies(list);
    const first = normalized[0];
    const canReport = normalized.length > 0;
    const reportDisabledReason = canReport ? '' : '暂无可填报企业，请先联系管理员确认在职关系';

    this.setData({
      companies: normalized,
      companyIndex: 0,
      canReport,
      reportDisabledReason,
      'addForm.employee_company_id': first?.employee_company_id || first?._id || '',
      'addForm.company_id': first?.company_id || '',
      'addForm.company_entry': first?.join_date || '',
      'addForm.company_leave': first?.leave_date || ''
    });
    this._validateCompanyForDate(this.data.addForm.work_date || this.data.selectedDate || this.data.today);
  },

  onLoad() {
    this.initMonth();
    this.loadProfileAndRecords();
  },

  onUnload() {
    this.clearKeyboardWatch();
  },

  onShow() {
    if (this.data.initialized && wx.getStorageSync('token')) {
      this.loadProfileAndRecords();
    }
  },

  onPullDownRefresh() {
    this.loadRecords().finally(() => wx.stopPullDownRefresh());
  },

  initMonth() {
    const today = this.toDateStr(new Date());
    const currentMonth = today.slice(0, 7);
    this.setData({ currentMonth, maxMonth: currentMonth, today, selectedDate: today, 'addForm.work_date': today });
  },

  async loadProfileAndRecords() {
    try {
      const profile = await api.callFunction('users', 'get-profile', {});
      this.setData({ employeeInfo: profile });
      await this.loadCompanies(profile);
    } catch (err) {
      console.warn('获取用户信息失败，可能未登录', err);
      this.setData({ employeeInfo: null });
    } finally {
      this.setData({ initialized: true });
      this.loadRecords();
    }
  },

  async loadCompanies(profile: any) {
    let apiCompanies: any[] = [];
    try {
      apiCompanies = await api.callFunction('worktime', 'list-companies', {
        employee_id: profile?.employee_id
      }, { showLoading: false }) || [];
    } catch (err) {
      console.warn('加载企业列表失败', err);
    }

    this.applyCompanies(apiCompanies);
  },

  onMonthChange(e: any) {
    const value = (e.detail.value || '').slice(0, 7); // 规范成 YYYY-MM
    this.setData({ currentMonth: value });
    this.loadRecords();
  },

  onCompanyChange(e: any) {
    const idx = Number(e.detail.value);
    const company = this.data.companies[idx];
    this.setData({
      companyIndex: idx,
      'addForm.employee_company_id': company?.employee_company_id || company?._id || '',
      'addForm.company_id': company?.company_id || '',
      'addForm.company_entry': company?.join_date || '',
      'addForm.company_leave': company?.leave_date || ''
    });
    this._validateCompanyForDate(this.data.addForm.work_date || this.data.selectedDate || this.data.today);
    this.loadRecords();
  },

  async loadRecords() {
    const seq = this.data.loadRecordsSeq + 1;
    this.setData({ loading: true, loadRecordsSeq: seq });

    const { currentMonth, addForm } = this.data;
    const [year, month] = this.parseYearMonth(currentMonth);
    if (!year || !month) {
      this.setData({ loading: false });
      return;
    }
    try {
      const result = await api.callFunction('worktime', 'list', {
        year,
        month,
        employee_id: this.data.employeeInfo?.employee_id || ''
      });
      if (seq !== this.data.loadRecordsSeq) return;
      const records = (result.list || result || []).map((item: any) => {
        const workDate = this.toDateStr(item.work_date);
        return {
          ...item,
          work_date: workDate,
          display_date: this.formatDate(workDate),
          weekday: this.getWeekdayText(workDate),
          total_hours: Number(item.total_hours ?? item.hours ?? 0),
          company_name: item.company_name || item.company || '',
          status: this.normalizeRecordStatus(item.status || item.audit_status || item.review_status || item.approval_status)
        };
      }).sort((a: any, b: any) => this.dateStrToTimestamp(a.work_date) - this.dateStrToTimestamp(b.work_date));

      const totalHours = records.reduce((sum: number, item: any) => sum + (item.total_hours || 0), 0);
      let calendarDays = this.buildCalendarDays(year, month, records);
      const selectedDate = this.resolveSelectedDate(calendarDays, records);
      calendarDays = calendarDays.map((item: any) => ({
        ...item,
        isSelected: item.date === selectedDate
      }));
      const selectedDayRecords = this.getRecordsByDate(records, selectedDate);

      this.setData({
        records,
        totalHours,
        calendarDays,
        selectedDate,
        selectedDayRecords,
        empty: records.length === 0
      });
    } catch (err) {
      console.error('加载工时记录失败:', err);
      if (seq !== this.data.loadRecordsSeq) return;
      wx.showToast({ title: err.message || '加载失败', icon: 'none', duration: 3000 });
      this.setData({ empty: true, records: [] });
    } finally {
      this.setData({ loading: false });
    }
  },

  formatDate(dateStr: string): string {
    const normalized = this.toDateStr(dateStr);
    if (!normalized) return '';
    const [, month, day] = normalized.split('-');
    return `${Number(month)}/${Number(day)}`;
  },

  getWeekdayText(dateStr: string): string {
    const normalized = this.toDateStr(dateStr);
    if (!normalized) return '';
    const day = new Date(normalized).getDay();
    return `周${this.data.weekHeaders[day] || ''}`;
  },

  buildCalendarDays(year: number, month: number, records: any[] = []) {
    const firstDay = new Date(year, month - 1, 1);
    const daysInMonth = new Date(year, month, 0).getDate();
    const leadingCount = firstDay.getDay();
    const totalCells = Math.ceil((leadingCount + daysInMonth) / 7) * 7;
    const recordMap = records.reduce((map: Record<string, any[]>, item: any) => {
      const date = this.toDateStr(item.work_date);
      if (!date) return map;
      if (!map[date]) map[date] = [];
      map[date].push(item);
      return map;
    }, {});
    const today = this.data.today || this.toDateStr(new Date());
    const days: any[] = [];

    for (let index = 0; index < totalCells; index += 1) {
      const dayNumber = index - leadingCount + 1;
      if (dayNumber < 1 || dayNumber > daysInMonth) {
        days.push({
          key: `blank-${index}`,
          day: '',
          date: '',
          inMonth: false,
          hasRecord: false,
          hoursText: '',
          shiftText: ''
        });
        continue;
      }

      const date = `${year}-${String(month).padStart(2, '0')}-${String(dayNumber).padStart(2, '0')}`;
      const dayRecords = recordMap[date] || [];
      const dayHours = dayRecords.reduce((sum: number, item: any) => sum + (Number(item.total_hours || item.hours) || 0), 0);
      const shifts = Array.from(new Set(dayRecords.map((item: any) => item.shift === 'night' ? '夜' : '白')));
      const hasApproved = dayRecords.some((item: any) => this.normalizeRecordStatus(item.status || item.audit_status || item.review_status || item.approval_status) === 'approved');

      days.push({
        key: date,
        day: dayNumber,
        date,
        inMonth: true,
        isToday: date === today,
        isSelected: date === this.data.selectedDate,
        hasRecord: dayRecords.length > 0,
        hasApproved,
        hours: dayHours,
        hoursText: dayRecords.length ? `${this.trimNumber(dayHours)}h` : '',
        recordCount: dayRecords.length,
        shiftText: shifts.join('/')
      });
    }

    return days;
  },

  resolveSelectedDate(calendarDays: any[] = [], records: any[] = []) {
    const { selectedDate, today, currentMonth } = this.data;
    const selectableDates = calendarDays.filter((item: any) => item.inMonth).map((item: any) => item.date);
    if (selectedDate && selectableDates.includes(selectedDate)) return selectedDate;
    if (today && today.startsWith(currentMonth) && selectableDates.includes(today)) return today;
    if (records[0]?.work_date && selectableDates.includes(records[0].work_date)) return records[0].work_date;
    return selectableDates[0] || '';
  },

  refreshCalendarSelection(selectedDate: string) {
    const calendarDays = (this.data.calendarDays || []).map((item: any) => ({
      ...item,
      isSelected: item.date === selectedDate
    }));
    this.setData({
      selectedDate,
      calendarDays,
      selectedDayRecords: this.getRecordsByDate(this.data.records, selectedDate)
    });
  },

  getRecordsByDate(records: any[] = [], date: string) {
    if (!date) return [];
    return records.filter((item: any) => this.toDateStr(item.work_date) === date);
  },

  trimNumber(value: number) {
    const num = Number(value) || 0;
    return Number.isInteger(num) ? String(num) : String(Number(num.toFixed(2)));
  },

  parseYearMonth(value: string): [number, number] {
    if (!value) return [0, 0];
    const parts = value.slice(0, 7).split('-');
    const year = Number(parts[0]);
    const month = Number(parts[1]);
    return [year, month];
  },

  toDateStr(value: any): string {
    if (!value) return '';
    if (typeof value === 'string') {
      const match = value.trim().match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})/);
      if (match) {
        const year = match[1];
        const month = String(Number(match[2])).padStart(2, '0');
        const day = String(Number(match[3])).padStart(2, '0');
        return `${year}-${month}-${day}`;
      }
      if (/^\d{10}$/.test(value.trim())) {
        value = Number(value.trim()) * 1000;
      } else if (/^\d{13}$/.test(value.trim())) {
        value = Number(value.trim());
      }
    } else if (typeof value === 'number' && String(value).length === 10) {
      value = value * 1000;
    }
    const date = new Date(value);
    if (isNaN(date.getTime())) return '';
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  },

  // 安全的日期字符串比较（转换为时间戳）
  dateStrToTimestamp(dateStr: string): number {
    const normalized = this.toDateStr(dateStr);
    if (!normalized) return 0;
    return new Date(normalized).getTime();
  },

  isDateBefore(date1: string, date2: string): boolean {
    const ts1 = this.dateStrToTimestamp(date1);
    const ts2 = this.dateStrToTimestamp(date2);
    return ts1 < ts2;
  },

  isDateAfter(date1: string, date2: string): boolean {
    const ts1 = this.dateStrToTimestamp(date1);
    const ts2 = this.dateStrToTimestamp(date2);
    return ts1 > ts2;
  },

  handleViewDetail() {
    // 详情入口已移除，保留空实现以防绑定报错
  },

  onCalendarDayTap(e: any) {
    const date = e.currentTarget.dataset.date;
    if (!date) return;
    this.refreshCalendarSelection(date);
  },

  openAddSheetForSelectedDate() {
    this.openAddSheet(this.data.selectedDate);
  },

  openAddSheet(date?: string) {
    if (!this.data.canReport || !this.data.addForm.company_id) {
      wx.showToast({ title: this.data.reportDisabledReason || '暂无可填报企业', icon: 'none' });
      return;
    }
    const today = this.data.today || this.toDateStr(new Date());
    const workDate = this.toDateStr(date) || today;
    this.setData({
      showAddSheet: true,
      keyboardHeight: 0,
      addForm: {
        work_date: workDate,
        hours: '',
        shift: 'day',
        employee_company_id: this.data.addForm.employee_company_id || '',
        company_id: this.data.addForm.company_id || '',
        company_entry: this.data.addForm.company_entry || '',
        company_leave: this.data.addForm.company_leave || ''
      }
    });
    this._validateCompanyForDate(workDate);
    this.setupKeyboardWatch();
  },

  closeAddSheet() {
    this.clearKeyboardWatch();
    wx.hideKeyboard({
      complete: () => this.setData({ showAddSheet: false, keyboardHeight: 0 })
    });
  },

  noop() {
    // 空白事件处理，用于阻止事件冒泡
  },

  onDateChange(e: any) {
    const newDate = e.detail.value;
    this.setData({ 'addForm.work_date': newDate });
    this._validateCompanyForDate(newDate);
  },

  onInput(e: any) {
    const field = e.currentTarget.dataset.field;
    this.setData({ [`addForm.${field}`]: e.detail.value });
  },

  onInputFocus(e: any) {
    const focusHeight = Number(e?.detail?.height || 0);
    if (focusHeight > 0) {
      this.setData({ keyboardHeight: Math.round(focusHeight * this.keyboardHeightScale) });
    }
  },

  onInputBlur() {
    this.setData({ keyboardHeight: 0 });
  },

  onCompanyPickerTap() {
    wx.hideKeyboard();
    if (this.data.keyboardHeight !== 0) this.setData({ keyboardHeight: 0 });
  },

  setupKeyboardWatch() {
    if (this._keyboardHeightListener) return;
    this._keyboardHeightListener = (res: any) => {
      if (!this.data.showAddSheet) return;
      const keyboardHeight = Number(res?.height || 0);
      this.setData({ keyboardHeight: Math.round(keyboardHeight * this.keyboardHeightScale) });
    };
    wx.onKeyboardHeightChange(this._keyboardHeightListener);
  },

  clearKeyboardWatch() {
    if (!this._keyboardHeightListener) return;
    wx.offKeyboardHeightChange(this._keyboardHeightListener);
    this._keyboardHeightListener = null;
  },

  onShiftChange(e: any) {
    const shift = e.currentTarget.dataset.shift;
    this.setData({ 'addForm.shift': shift });
  },

  _validateCompanyForDate(workDate: string) {
    const wd = this.toDateStr(workDate || '');
    if (!wd) return;
    if (!this.data.addForm.employee_company_id || !this.data.addForm.company_id) {
      this.setData({ canReport: false, reportDisabledReason: '请先选择有效企业关系' });
      return;
    }
    const companyEntry = this.toDateStr(this.data.addForm.company_entry);
    const companyLeave = this.toDateStr(this.data.addForm.company_leave);
    if (companyEntry && this.isDateBefore(wd, companyEntry)) {
      this.setData({ canReport: false, reportDisabledReason: '该日期早于入职时间，无法填报' });
      return;
    }
    if (companyLeave && this.isDateAfter(wd, companyLeave)) {
      this.setData({ canReport: false, reportDisabledReason: '该日期晚于离职时间，无法填报' });
      return;
    }
    this.setData({ canReport: true, reportDisabledReason: '' });
  },

  async submitWorktime() {
    const { addForm, employeeInfo } = this.data;
    const employeeId = String(employeeInfo?.employee_id || '').trim();
    const loggedIn = !!employeeId;
    const phone = String(employeeInfo?.phone || employeeInfo?.mobile || '').trim();
    if (!addForm.work_date) {
      wx.showToast({ title: '请选择日期', icon: 'none' });
      return;
    }
    const hours = Number(addForm.hours) || 0;
    if (hours <= 0) {
      wx.showToast({ title: '请输入工时（小时）', icon: 'none' });
      return;
    }
    if (!this.data.canReport || !addForm.company_id || !addForm.employee_company_id) {
      wx.showToast({ title: this.data.reportDisabledReason || '暂无可填报企业', icon: 'none' });
      return;
    }
    if (!loggedIn) {
      wx.showToast({ title: '请先登录', icon: 'none' });
      this.setData({ showAddSheet: false });
      return;
    }

    // 校验入离职时间
    const entry = this.data.addForm.company_entry || '';
    const leave = this.data.addForm.company_leave || '';
    const workDate = this.toDateStr(addForm.work_date);
    const today = this.data.today || this.toDateStr(new Date());
    
    if (entry && this.isDateBefore(workDate, entry)) {
      wx.showToast({ title: '日期早于入职时间', icon: 'none' });
      return;
    }
    if (leave && this.isDateAfter(workDate, leave)) {
      wx.showToast({ title: '日期晚于离职时间', icon: 'none' });
      return;
    }
    if (today && this.isDateAfter(workDate, today)) {
      wx.showToast({ title: '日期不能晚于今天', icon: 'none' });
      return;
    }

    this.setData({ submitting: true });
    try {
      await api.callFunction('worktime', 'submit', {
        employee_id: employeeId,
        employee_company_id: addForm.employee_company_id,
        phone,
        company_id: addForm.company_id,
        work_date: addForm.work_date,
        shift: addForm.shift || 'day',
        regular_hours: hours
      });
      wx.showToast({ title: '提交成功，待审核', icon: 'success' });
      this.setData({ showAddSheet: false });
      this.loadRecords();
    } catch (err: any) {
      console.error('提交工时失败:', err);
      wx.showToast({ title: err.message || '提交失败', icon: 'none' });
    } finally {
      this.setData({ submitting: false });
    }
  }
});

export {};
