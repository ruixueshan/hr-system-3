/**
 * 工具函数云函数
 * 提供员工工号生成、日期格式化、深拷贝等工具函数
 */

const cloud = require('wx-server-sdk');
cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
});

/**
 * 工具函数
 */

// 生成员工工号
function generateEmployeeNo() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  const random = Math.floor(Math.random() * 10000);
  return `EP${year}${month}${day}${String(random).padStart(4, '0')}`;
}

// 格式化日期 YYYY-MM-DD
function formatDate(date) {
  const d = new Date(date);
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

// 计算两个日期之间的天数
function daysBetween(start, end) {
  const oneDay = 24 * 60 * 60 * 1000;
  return Math.round(Math.abs((new Date(end) - new Date(start)) / oneDay));
}

// 深拷贝
function deepClone(obj) {
  return JSON.parse(JSON.stringify(obj));
}

/**
 * 主入口
 */
exports.main = async (event, context) => {
  const { action, params = {} } = event;
  
  try {
    switch (action) {
      case 'generateEmployeeNo':
        // 生成员工工号
        const employeeNo = generateEmployeeNo();
        return {
          code: 0,
          message: 'success',
          data: employeeNo
        };
        
      case 'formatDate':
        // 格式化日期
        const { date } = params;
        if (!date) {
          return {
            code: 400,
            message: '缺少参数: date',
            data: null
          };
        }
        const formattedDate = formatDate(date);
        return {
          code: 0,
          message: 'success',
          data: formattedDate
        };
        
      case 'daysBetween':
        // 计算两个日期之间的天数
        const { start, end } = params;
        if (!start || !end) {
          return {
            code: 400,
            message: '缺少参数: start, end',
            data: null
          };
        }
        const days = daysBetween(start, end);
        return {
          code: 0,
          message: 'success',
          data: days
        };
        
      case 'deepClone':
        // 深拷贝对象
        const { object } = params;
        if (!object) {
          return {
            code: 400,
            message: '缺少参数: object',
            data: null
          };
        }
        const clonedObject = deepClone(object);
        return {
          code: 0,
          message: 'success',
          data: clonedObject
        };
        
      default:
        return {
          code: 400,
          message: `未知操作: ${action}`,
          data: null
        };
    }
  } catch (error) {
    console.error('工具云函数错误:', error);
    return {
      code: error.code || 500,
      message: error.message || 'internal error',
      data: null
    };
  }
};