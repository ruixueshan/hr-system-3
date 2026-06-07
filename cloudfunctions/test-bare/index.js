/**
 * 裸测试云函数 - 不依赖任何SDK
 */
exports.main = async (event, context) => {
  console.log('裸测试云函数被调用:', event);
  return {
    code: 0,
    message: '裸测试成功',
    data: event
  };
};