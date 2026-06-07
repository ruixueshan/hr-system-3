/**
 * 通用薪资查询模块
 * 统一薪资查询逻辑，确保 users 和 salaries 云函数数据一致性
 */

const cloud = require('wx-server-sdk');
let db = null;

/**
 * 初始化云开发（懒加载）
 */
function getDatabase() {
  if (!db) {
    cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
    db = cloud.database();
  }
  return db;
}

function normalizeText(value) {
  return String(value || '').trim();
}

function pickPreferredEmployee(list = []) {
  const candidates = (Array.isArray(list) ? list : []).filter(Boolean);
  if (!candidates.length) return null;

  const score = (item) => {
    const status = normalizeText(item.status).toLowerCase();
    const merged = normalizeText(item.merged_into_employee_id);
    const activeScore = ['regular', 'probation'].includes(status) ? 100 : 0;
    const mergedScore = merged ? -1000 : 0;
    const updatedAt = new Date(item.updated_at || item.created_at || 0).getTime() || 0;
    return activeScore + mergedScore + updatedAt / 1e13;
  };

  return [...candidates].sort((a, b) => score(b) - score(a))[0];
}

/**
 * 统一查询员工薪资记录
 * @param {Object} options - 查询选项
 * @param {Object} options.user - 用户对象（必须包含 _id 和 phone）
 * @param {number} options.limit - 返回记录数限制，默认 50
 * @param {boolean} options.orderBy - 是否按年月排序，默认 true
 * @returns {Promise<Array>} 薪资记录列表
 */
async function getEmployeeSalaries(options = {}) {
  const database = getDatabase();
  const { user, limit = 50, orderBy = true } = options;
  const cmd = database.command;
  
  if (!user || !user._id) {
    console.warn('[salary-query] 用户信息不完整，无法查询薪资');
    return [];
  }
  
  console.log('[salary-query] 开始查询薪资，用户ID:', user._id, '手机号:', user.phone);
  
  const employeeIds = [];
  if (user.employee_id) {
    employeeIds.push(user.employee_id);
  }
  
  // Step 1: 通过 user_id 查询 employees
  try {
    const empByUserId = await database.collection('employees')
      .where({ user_id: user._id })
      .limit(10)
      .get();
    
    if (empByUserId.data?.length) {
      const candidates = (empByUserId.data || []).filter((item) => !normalizeText(item.merged_into_employee_id));
      candidates.forEach((e) => {
        if (e._id) employeeIds.push(e._id);
      });
      const preferred = pickPreferredEmployee(candidates);
      if (preferred?._id) employeeIds.unshift(preferred._id);
      console.log('[salary-query] 通过 user_id 查询到员工:', candidates.length, '人');
    }
  } catch (err) {
    console.warn('[salary-query] 通过 user_id 查询员工失败:', err.message);
  }
  
  // Step 2: 通过 phone 查询 employees（可能存在手机号不同步的情况）
  if (user.phone) {
    try {
      const empByPhone = await database.collection('employees')
        .where({ phone: user.phone })
        .limit(10)
        .get();
      
      if (empByPhone.data?.length) {
        const candidates = (empByPhone.data || []).filter((item) => !normalizeText(item.merged_into_employee_id));
        candidates.forEach((e) => {
          if (e._id) employeeIds.push(e._id);
        });
        const preferred = pickPreferredEmployee(candidates);
        if (preferred?._id) employeeIds.unshift(preferred._id);
        console.log('[salary-query] 通过 phone 查询到员工:', candidates.length, '人');
      }
    } catch (err) {
      console.warn('[salary-query] 通过 phone 查询员工失败:', err.message);
    }
  }
  
  // Step 3: 也尝试直接用 user._id 作为 employee_id 查询（兼容某些场景）
  if (!employeeIds.length && !employeeIds.includes(user._id)) {
    employeeIds.push(user._id);
  }
  
  // 去重
  const uniqueEmpIds = [...new Set(employeeIds.map((item) => normalizeText(item)).filter(Boolean))];
  console.log('[salary-query] 唯一员工ID列表:', uniqueEmpIds);
  
  if (uniqueEmpIds.length === 0) {
    console.log('[salary-query] 未找到关联员工，返回空列表');
    return [];
  }
  
  // Step 4: 查询薪资记录
  let query = database.collection('salaries')
    .where({ employee_id: cmd.in(uniqueEmpIds) });
  
  if (orderBy) {
    query = query.orderBy('year', 'desc').orderBy('month', 'desc');
  }
  
  const salaryRes = await query.limit(limit).get();
  const salaryList = salaryRes.data || [];
  
  console.log('[salary-query] 查询到薪资记录:', salaryList.length, '条');
  
  return salaryList;
}

/**
 * 计算薪资总收入
 * @param {Array} salaryList - 薪资记录列表
 * @param {string} field - 计算字段，默认 'net_pay'
 * @returns {number} 总收入
 */
function calculateTotalIncome(salaryList, field = 'net_pay') {
  if (!salaryList || !Array.isArray(salaryList)) {
    return 0;
  }
  
  const total = salaryList.reduce((sum, salary) => {
    return sum + (salary[field] || 0);
  }, 0);
  
  return Math.round(total * 100) / 100;
}

/**
 * 按年月分组薪资记录
 * @param {Array} salaryList - 薪资记录列表
 * @returns {Array} 分组后的薪资列表
 */
function groupSalariesByMonth(salaryList) {
  if (!salaryList || !Array.isArray(salaryList)) {
    return [];
  }
  
  const groupedMap = new Map();
  
  salaryList.forEach(item => {
    const key = `${item.year}-${item.month}`;
    if (!groupedMap.has(key)) {
      groupedMap.set(key, {
        ...item,
        key,
        monthText: `${item.year}年${item.month}月`
      });
    } else {
      const existing = groupedMap.get(key);
      existing.net_pay = (existing.net_pay || 0) + (item.net_pay || 0);
      existing.base_salary = (existing.base_salary || 0) + (item.base_salary || 0);
      existing.overtime_pay = (existing.overtime_pay || 0) + (item.overtime_pay || 0);
      existing.bonus = (existing.bonus || 0) + (item.bonus || 0);
      existing.subsidy = (existing.subsidy || 0) + (item.subsidy || 0);
      existing.social_security = (existing.social_security || 0) + (item.social_security || 0);
      existing.provident_fund = (existing.provident_fund || 0) + (item.provident_fund || 0);
      existing.tax = (existing.tax || 0) + (item.tax || 0);
      existing.deduction = (existing.deduction || 0) + (item.deduction || 0);
      existing.gross_pay = (existing.gross_pay || 0) + (item.gross_pay || 0);
    }
  });
  
  return Array.from(groupedMap.values()).sort((a, b) => b.key.localeCompare(a.key));
}

module.exports = {
  getEmployeeSalaries,
  calculateTotalIncome,
  groupSalariesByMonth,
  getDatabase
};
