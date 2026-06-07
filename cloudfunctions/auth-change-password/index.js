/**
 * 修改密码云函数
 * 支持用户自主修改密码
 */
const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();

function success(data = null, message = 'success') {
  return { code: 0, message, data };
}

function error(code = 1, message = 'error') {
  return { code, message, data: null };
}

exports.main = async (event, context) => {
  const { action, userId, oldPassword, newPassword } = event;

  try {
    switch (action) {
      case 'changePassword':
        return await changePassword(userId, oldPassword, newPassword);
      default:
        return error(400, '不支持的操作');
    }
  } catch (err) {
    console.error('修改密码错误:', err);
    return error(500, err.message || '操作失败');
  }
};

async function changePassword(userId, oldPassword, newPassword) {
  if (!userId) {
    return error(400, '用户ID不能为空');
  }
  if (!oldPassword) {
    return error(400, '请输入旧密码');
  }
  if (!newPassword) {
    return error(400, '请输入新密码');
  }
  if (newPassword.length < 6) {
    return error(400, '新密码长度不能少于6位');
  }
  if (oldPassword === newPassword) {
    return error(400, '新密码不能与旧密码相同');
  }

  const users = await db.collection('users').doc(userId).get();

  if (!users.data || users.data.length === 0) {
    return error(404, '用户不存在');
  }

  const user = users.data;

  if (user.password !== oldPassword) {
    return error(400, '旧密码错误');
  }

  await db.collection('users').doc(userId).update({
    data: {
      password: newPassword,
      update_time: db.serverDate()
    }
  });

  return success(null, '密码修改成功');
}
