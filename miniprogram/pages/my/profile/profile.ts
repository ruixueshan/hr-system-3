// pages/my/profile/profile.ts
const api = require('../../../utils/api');


function normalizeBankAccount(value: string): string {
  return String(value || '').replace(/\s+/g, '');
}

Page({
  data: {
    userInfo: {} as any,
    loading: false,
    form: {
      real_name: '',
      gender: '',
      phone: '',
      id_card: '',
      birth_date: '',
      education: '',
      work_years: '',
      current_company: '',
      current_position: '',
      expected_salary: '',
      expected_location: '',
      skills: '',
      self_introduction: '',
      salary_payment_method: 'WECHAT',
      // 银行卡信息
      bank_name: '',
      bank_account: '',
      bank_account_name: ''
    }
  },

  onLoad() {
    this.loadUserInfo();
  },

  async loadUserInfo() {
    console.log('loadUserInfo: 开始加载用户信息');
    this.setData({ loading: true });
    try {
      const userInfo = await api.callFunction('users', 'get-profile', {});
      console.log('loadUserInfo: 获取到的用户信息:', JSON.stringify(userInfo, null, 2));

      this.setData({
        userInfo,
        form: {
          real_name: userInfo.real_name || '',
          gender: userInfo.gender || '',
          phone: userInfo.phone || '',
          id_card: userInfo.id_card || '',
          birth_date: userInfo.birth_date || '',
          education: userInfo.education || '',
          work_years: userInfo.work_years || '',
          current_company: userInfo.current_company || '',
          current_position: userInfo.current_position || '',
          expected_salary: userInfo.expected_salary || '',
          expected_location: userInfo.expected_location || '',
          skills: userInfo.skills || '',
          self_introduction: userInfo.self_introduction || '',
          salary_payment_method: userInfo.salary_payment_method || 'WECHAT',
          // 银行卡信息
          bank_name: userInfo.bank_name || '',
          bank_account: normalizeBankAccount(userInfo.bank_account || ''),
          bank_account_name: userInfo.bank_account_name || ''
        }
      });
    } catch (err) {
      console.error('加载用户信息失败:', err);
    } finally {
      this.setData({ loading: false });
    }
  },

  onInput(e: any) {
    const field = e.currentTarget.dataset.field;
    let value = e.detail.value;
    if (field === 'bank_account') {
      value = normalizeBankAccount(value);
    }
    this.setData({
      [`form.${field}`]: value
    });
    return value;
  },

  onGenderChange(e: any) {
    // 性别已锁定，不允许修改
    wx.showToast({ title: '性别根据身份证号自动生成，不可修改', icon: 'none' });
  },

  onEducationChange(e: any) {
    this.setData({
      'form.education': e.detail.value
    });
  },

  onBirthDateChange(e: any) {
    // 出生日期已锁定，不允许修改
    wx.showToast({ title: '出生日期根据身份证号自动生成，不可修改', icon: 'none' });
  },

  onPaymentMethodSelect(e: any) {
    const method = e.currentTarget.dataset.method || 'WECHAT';
    this.setData({ 'form.salary_payment_method': method });
  },

  // 身份证号输入监听，自动解析性别和出生日期
  onIdCardInput(e: any) {
    const idCard = e.detail.value;
    this.setData({ 'form.id_card': idCard });

    // 当输入完整的18位身份证号时，自动解析
    if (idCard.length === 18) {
      this.parseIdCard(idCard);
    }
  },

  // 解析身份证号，提取性别和出生日期
  parseIdCard(idCard: string) {
    // 验证身份证号格式
    if (!this.validateIdCard(idCard)) {
      wx.showToast({ title: '身份证号格式不正确', icon: 'none' });
      return;
    }

    try {
      // 提取出生日期（第7-14位）
      const birthYear = idCard.substring(6, 10);
      const birthMonth = idCard.substring(10, 12);
      const birthDay = idCard.substring(12, 14);
      const birthDate = `${birthYear}-${birthMonth}-${birthDay}`;

      // 提取性别（第17位，奇数男性，偶数女性）
      const genderCode = parseInt(idCard.substring(16, 17));
      const gender = genderCode % 2 === 1 ? '男' : '女';

      this.setData({
        'form.birth_date': birthDate,
        'form.gender': gender
      });

      wx.showToast({ title: '已自动填充性别和出生日期', icon: 'success' });
    } catch (err) {
      console.error('解析身份证号失败:', err);
      wx.showToast({ title: '身份证号解析失败', icon: 'none' });
    }
  },

  // 验证身份证号（国家标准规则）
  validateIdCard(idCard: string): boolean {
    // 18位身份证号正则
    const reg = /^[1-9]\d{5}(19|20)\d{2}(0[1-9]|1[0-2])(0[1-9]|[12]\d|3[01])\d{3}[\dXx]$/;

    if (!reg.test(idCard)) {
      return false;
    }

    // 验证校验码
    const weights = [7, 9, 10, 5, 8, 4, 2, 1, 6, 3, 7, 9, 10, 5, 8, 4, 2];
    const checkCodes = ['1', '0', 'X', '9', '8', '7', '6', '5', '4', '3', '2'];

    let sum = 0;
    for (let i = 0; i < 17; i++) {
      sum += parseInt(idCard.charAt(i)) * weights[i];
    }

    const checkCode = checkCodes[sum % 11];
    return idCard.charAt(17).toUpperCase() === checkCode;
  },

  // 验证银行卡号（Luhn算法）
  validateBankCard(cardNumber: string): boolean {
    const normalizedCardNumber = normalizeBankAccount(cardNumber);
    if (!normalizedCardNumber || normalizedCardNumber.length < 13 || normalizedCardNumber.length > 19) {
      return false;
    }

    // Luhn算法验证
    const digits = normalizedCardNumber.split('').map(Number);
    let sum = 0;
    let isEven = false;

    for (let i = digits.length - 1; i >= 0; i--) {
      let digit = digits[i];

      if (isEven) {
        digit *= 2;
        if (digit > 9) {
          digit -= 9;
        }
      }

      sum += digit;
      isEven = !isEven;
    }

    return sum % 10 === 0;
  },

  async handleSave() {
    const { form } = this.data;
    const cleanForm = {
      ...form,
      bank_account: normalizeBankAccount(form.bank_account)
    };
    console.log('handleSave: 表单数据:', JSON.stringify(cleanForm, null, 2));

    // 表单验证
    if (!cleanForm.real_name) {
      wx.showToast({ title: '请输入姓名', icon: 'none' });
      return;
    }

    if (!cleanForm.phone) {
      wx.showToast({ title: '请输入手机号', icon: 'none' });
      return;
    }

    // 手机号格式验证
    if (!/^1[3-9]\d{9}$/.test(cleanForm.phone)) {
      wx.showToast({ title: '手机号格式不正确', icon: 'none' });
      return;
    }

    // 身份证号验证（如果填写了）
    if (cleanForm.salary_payment_method === 'WECHAT' && !cleanForm.id_card) {
      wx.showToast({ title: '请输入身份证号', icon: 'none' });
      return;
    }

    if (cleanForm.id_card && !this.validateIdCard(cleanForm.id_card)) {
      wx.showToast({ title: '身份证号格式不正确', icon: 'none' });
      return;
    }

    if (cleanForm.salary_payment_method === 'BANK') {
      if (!cleanForm.bank_name) {
        wx.showToast({ title: '请输入开户行', icon: 'none' });
        return;
      }
      if (!cleanForm.bank_account) {
        wx.showToast({ title: '请输入银行卡号', icon: 'none' });
        return;
      }
      if (!cleanForm.bank_account_name) {
        wx.showToast({ title: '请输入持卡人姓名', icon: 'none' });
        return;
      }
      if (!this.validateBankCard(cleanForm.bank_account)) {
        wx.showToast({ title: '银行卡号格式不正确', icon: 'none' });
        return;
      }
    }

    this.setData({ loading: true });

    try {
      // 不再加密，直接使用明文
      const encryptedForm = cleanForm;
      console.log('handleSave: 调用云函数 update-profile，数据:', JSON.stringify(encryptedForm, null, 2));

      await api.callFunction('users', 'update-profile', encryptedForm);
      console.log('handleSave: 云函数调用成功');
      wx.showToast({ title: '保存成功', icon: 'success' });
      setTimeout(() => {
        wx.navigateBack();
      }, 1000);
    } catch (err) {
      console.error('保存失败:', err);
      wx.showToast({ title: '保存失败', icon: 'none' });
    } finally {
      this.setData({ loading: false });
    }
  }
});

export {};
