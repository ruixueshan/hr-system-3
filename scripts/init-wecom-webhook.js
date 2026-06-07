const tcb = require('tcb-admin-node');

tcb.init({
  env: 'cloud1-5glojms9a83c3457'
});

const db = tcb.database();

(async () => {
  const existing = await db.collection('system_config').where({ key: 'wecom_webhook' }).get();
  if (existing.data && existing.data.length > 0) {
    console.log('wecom_webhook 配置已存在，更新中...');
    await db.collection('system_config').doc(existing.data[0]._id).update({
      value: 'https://qyapi.weixin.qq.com/cgi-bin/webhook/send?key=8825f3b8-2995-4d77-8790-0932735448be',
      updated_at: new Date()
    });
  } else {
    console.log('写入 wecom_webhook 配置...');
    await db.collection('system_config').add({
      category: 'notification',
      key: 'wecom_webhook',
      value: 'https://qyapi.weixin.qq.com/cgi-bin/webhook/send?key=8825f3b8-2995-4d77-8790-0932735448be',
      description: '企业微信群消息推送 webhook URL',
      status: 'active',
      created_at: new Date(),
      updated_at: new Date()
    });
  }
  console.log('✅ wecom_webhook 配置完成');
})().catch(err => console.error('❌ 错误:', err.message));
