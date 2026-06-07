/**
 * 微信手机号快捷登录云函数
 * 通过 open-type="getPhoneNumber" 获取的 cloudID 进行登录
 * 云开发环境自动解密手机号
 */
const cloud = require('wx-server-sdk');
cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
});
const db = cloud.database();
const _ = db.command;
const { ensureCandidateProfile } = require('./candidateOwnership');
const { ensureUserEmployeeBinding } = require('./employeeBinding');

function success(data, message) {
  message = message || 'success';
  return { code: 0, message: message, data: data };
}

function error(code, message, data) {
  code = code || 1;
  message = message || 'error';
  data = data || null;
  return { code: code, message: message, data: data };
}

// 生成随机 token
function generateToken() {
  return Date.now() + '_' + Math.random().toString(36).substr(2, 15);
}

exports.main = async (event, context) => {
  console.log('微信手机号登录云函数被调用:', event);
  const wxContext = cloud.getWXContext();
  
  const user_type = event && event.user_type ? event.user_type : 'candidate';
  const cloudIDData = event && event.phoneCloudID ? event.phoneCloudID.data : null;
  
  console.log('微信手机号登录参数:', { 
    user_type: user_type, 
    openid: wxContext.OPENID,
    hasPhoneData: !!cloudIDData
  });
  
  if (!cloudIDData) {
    return error(400, '缺少手机号授权信息');
  }

  try {
    // 1. 从 cloudID 数据中获取手机号
    console.log('开始获取解密后的手机号');
    const phoneNumber = cloudIDData?.phoneNumber || '';
    const purePhoneNumber = cloudIDData.purePhoneNumber || '';
    const countryCode = cloudIDData.countryCode || '+86';
    
    console.log('手机号解密成功:', { 
      phoneNumber, 
      purePhoneNumber, 
      countryCode 
    });
    
    if (!purePhoneNumber) {
      return error(400, '未获取到手机号');
    }
    
    // 2. 查询或创建用户
    let users = await db.collection('users')
      .where(_.or([
        { account_phone: purePhoneNumber },
        { phone: purePhoneNumber }
      ]))
      .get();
    
    let user;
    if (users.data && users.data.length > 0) {
      user = users.data[0];
      
      // 更新用户信息
      const openid = wxContext.OPENID || user.openid;
      const unionid = wxContext.UNIONID || user.unionid;
      
      await db.collection('users').doc(user._id).update({
        data: {
          account_phone: user.account_phone || purePhoneNumber,
          openid: openid,
          unionid: unionid,
          country_code: countryCode,
          update_time: db.serverDate()
        }
      });
    } else {
      // 新用户自动注册
      const openid = wxContext.OPENID || '';
      const unionid = wxContext.UNIONID || '';
      
      const result = await db.collection('users').add({
        data: {
          openid: openid,
          unionid: unionid,
          account_phone: purePhoneNumber,
          phone: purePhoneNumber,
          country_code: countryCode,
          name: '候选人' + purePhoneNumber.substr(-4),
          role: 'candidate',
          user_type: user_type,
          status: 'active',
          create_time: db.serverDate(),
          update_time: db.serverDate()
        }
      });
      
      const newUser = await db.collection('users').doc(result._id).get();
      user = newUser.data;
    }

    if ((user.user_type || user_type || 'candidate') === 'candidate') {
      await ensureCandidateProfile(user._id, {
        bind_reason: 'register'
      });
    }

    await ensureUserEmployeeBinding(db, user);

    const latestUser = await db.collection('users').doc(user._id).get();
    user = latestUser.data || user;
    
    // 3. 生成登录 token
    const loginToken = generateToken();
    const expireTime = Date.now() + 7 * 24 * 60 * 60 * 1000; // 7天
    
    // 4. 存储登录态
    const openid = wxContext.OPENID || '';
    
    await db.collection('login_tokens').add({
      data: {
        token: loginToken,
        type: 'wechat-phone',
        user_id: user._id,
        openid: openid,
        phone: purePhoneNumber,
        status: 'logged',
        expire_time: expireTime,
        create_time: db.serverDate()
      }
    });
    
    // 5. 返回登录信息
    const name = user.name ? user.name : '';
    const phone = user.phone ? user.phone : '';
    const avatar = user.avatar ? user.avatar : '';
    const role = user.role ? user.role : 'candidate';
    const userType = user.user_type ? user.user_type : 'candidate';
    const userOpenid = user.openid ? user.openid : '';
    
    return success({
      token: loginToken,
      userInfo: {
        id: user._id,
        name: name,
        phone: phone,
        avatar: avatar,
        role: role,
        user_type: userType,
        openid: userOpenid
      }
    }, '登录成功');
    
  } catch (err) {
    console.error('微信手机号登录失败:', err);
    const errMsg = err.message || '登录失败';
    return error(500, errMsg);
  }
};
