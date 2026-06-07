/**
 * 测试云函数 - 最小化版本
 */
const cloud = require('wx-server-sdk');
cloud.init({
  env: process.env.TCB_ENV || 'cloud1-5glojms9a83c3457'
});

exports.main = async (event, context) => {
  console.log('测试云函数被调用:', event);
  return {
    code: 0,
    message: '测试成功',
    data: event
  };
};
