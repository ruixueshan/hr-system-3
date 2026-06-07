/**
 * 工时管理模块入口
 * Action handlers live in actions/*; legacy business logic is preserved in services/legacy-service.js.
 */
const { error } = require('./common/response');
const actions = require('./actions');

exports.main = async (event = {}, context) => {
  const handler = actions[event.action];

  if (!handler) {
    return error(400, '不支持的操作');
  }

  try {
    return await handler(event, context);
  } catch (err) {
    console.error('工时模块错误:', err);
    return error(500, err.message);
  }
};
