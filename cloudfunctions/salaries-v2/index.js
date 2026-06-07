/**
 * salaries-v2 薪资发放模块入口
 * Action handlers live in actions/*; legacy business logic is preserved in services/legacy-service.js.
 */
const { error } = require('./common/response');
const actions = require('./actions');

exports.main = async (event = {}, context) => {
  const handler = actions[event.action];

  if (!handler) {
    return error(400, '未知操作');
  }

  try {
    return await handler(event, context);
  } catch (err) {
    console.error('[salaries-v2] error:', err);
    return error(500, err.message || '服务器错误');
  }
};
