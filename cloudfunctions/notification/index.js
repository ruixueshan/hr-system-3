/**
 * 通知模块
 * 小程序订阅消息、企业微信消息
 */
const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

function success(data = null, message = 'success') {
  return { code: 0, message, data };
}

function error(code = 1, message = 'error', data = null) {
  return { code, message, data };
}
const db = cloud.database();

function normalizeText(value) {
  return String(value || '').trim();
}

function formatChinaDateTime(value = new Date()) {
  if (!value) return '';
  if (typeof value === 'string') {
    const text = value.trim().replace('T', ' ');
    const local = text.match(/^(\d{4}-\d{2}-\d{2})\s+(\d{2}:\d{2})(?::\d{2})?/);
    if (local) return `${local[1]} ${local[2]}`;
    if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return `${text} 00:00`;
  }
  if (typeof value === 'object') {
    if (value.$date) return formatChinaDateTime(value.$date);
    if (value.seconds) return formatChinaDateTime(new Date(Number(value.seconds) * 1000));
    if (value._seconds) return formatChinaDateTime(new Date(Number(value._seconds) * 1000));
    if (value.milliseconds) return formatChinaDateTime(new Date(Number(value.milliseconds)));
    if (value._milliseconds) return formatChinaDateTime(new Date(Number(value._milliseconds)));
  }
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const chinaDate = new Date(date.getTime() + 8 * 60 * 60 * 1000);
  const year = chinaDate.getUTCFullYear();
  const month = String(chinaDate.getUTCMonth() + 1).padStart(2, '0');
  const day = String(chinaDate.getUTCDate()).padStart(2, '0');
  const hours = String(chinaDate.getUTCHours()).padStart(2, '0');
  const minutes = String(chinaDate.getUTCMinutes()).padStart(2, '0');
  return `${year}-${month}-${day} ${hours}:${minutes}`;
}

exports.main = async (event, context) => {
  const { action, token } = event;

  try {
    switch (action) {
      case 'send-subscribe':
        return sendSubscribe(event);
      case 'send-wecom':
        return sendWecom(event);
      case 'send-wecom-apply':
        return sendWecomApply(event);
      case 'init-wecom-webhook':
        return initWecomWebhook(event);
      case 'render-template':
        return renderTemplate(event);
      default:
        return error(400, '不支持的操作');
    }
  } catch (err) {
    console.error('通知模块错误:', err);
    return error(500, err.message);
  }
};

/**
 * 发送小程序订阅消息
 */
async function sendSubscribe(data) {
  const { user_id, template_id, page, data: templateData } = data;

  // 1. 获取用户 openid
  const userDoc = await db.collection('users').doc(user_id).get();
  if (!userDoc.data) {
    return error(404, '用户不存在');
  }

  // 2. 渲染模板变量
  const rendered = await renderTemplate(templateData);

  // 3. 调用微信订阅消息接口
  // https://developers.weixin.qq.com/miniprogram/dev/api-backend/open-api/subscribe-message/wx.requestSubscribeMessage.html
  // 这里的实现需要调用微信服务端 API，需要先获取 access_token
  // 简化：仅记录发送日志

  await db.collection('notification_logs').add({
    data: {
      user_id,
      type: 'subscribe',
      template_id,
      page,
      content: rendered,
      status: 'sent', // pending/sent/failed
      created_at: db.serverDate()
    }
  });

  return success(null, '订阅消息已记录（实际发送需配置微信模板）');
}

/**
 * 发送企业微信消息（通用）
 */
async function sendWecom(data) {
  const { to_userid, content, msg_type = 'text', webhook_key = 'wecom_webhook' } = data;

  // 1. 从 system_config 获取企业微信 webhook
  const configDoc = await db.collection('system_config')
    .where({ key: webhook_key })
    .get();

  if (!configDoc.data || configDoc.data.length === 0) {
    return error(500, `未配置企业微信 webhook (${webhook_key})`);
  }

  const webhook = configDoc.data[0].value;

  // 2. 构建消息体
  let payload;
  if (msg_type === 'text') {
    payload = {
      msgtype: 'text',
      text: { content, mentioned_list: to_userid ? [to_userid] : [] }
    };
  } else if (msg_type === 'markdown') {
    payload = {
      msgtype: 'markdown',
      markdown: { content }
    };
  } else if (msg_type === 'markdown_v2') {
    payload = {
      msgtype: 'markdown_v2',
      markdown_v2: { content }
    };
  } else {
    return error(400, '不支持的消息类型');
  }

  // 3. 发送 HTTP POST 请求到企业微信 webhook
  let sendStatus = 'sent';
  let sendError = '';
  try {
    const result = await httpsPost(webhook, payload);
    if (result.errcode !== 0) {
      sendStatus = 'failed';
      sendError = result.errmsg || '发送失败';
      console.error('企业微信发送失败:', result);
    }
  } catch (err) {
    sendStatus = 'failed';
    sendError = err.message || '网络请求失败';
    console.error('企业微信请求异常:', err);
  }

  // 4. 记录发送日志
  try {
    await db.collection('notification_logs').add({
      data: {
        to_userid: to_userid || '',
        type: 'wecom',
        msg_type,
        content,
        status: sendStatus,
        error: sendError,
        created_at: db.serverDate()
      }
    });
  } catch (logErr) {
    console.warn('记录通知日志失败:', logErr.message);
  }

  if (sendStatus === 'failed') {
    return error(500, `企业微信发送失败: ${sendError}`);
  }
  return success(null, '企业微信消息已发送');
}

/**
 * 报名成功推送企业微信群消息
 */
async function sendWecomApply(data) {
  let {
    applicant_name = '',
    applicant_phone = '',
    applicant_id_card = '',
    job_name = '',
    company_name = '',
    source = '',
    recommender_name = '',
    interview_time = '',
    application_id = '',
    user_id = ''
  } = data;

  if (application_id) {
    try {
      const applicationDoc = await db.collection('applications').doc(application_id).get();
      const application = applicationDoc.data || null;

      if (application) {
        source = source || (application.recommender_id ? '扫码报名' : '小程序申请');
        recommender_name = application.recommender_name || application.referrer_name || recommender_name || '';
        applicant_name = application.applicant_name || application.candidate_name || applicant_name || '';
        applicant_phone = application.applicant_phone || application.phone || applicant_phone || '';
        applicant_id_card = application.applicant_id_card || application.id_card || applicant_id_card || '';
        job_name = application.job_name || job_name || '';
        company_name = application.company_name || company_name || '';
        interview_time = application.interview_time || application.expected_interview_time || interview_time || '';

        if ((!job_name || !company_name) && application.job_id) {
          const jobDoc = await db.collection('jobs').doc(application.job_id).get().catch(() => ({ data: null }));
          const job = jobDoc.data || {};
          job_name = job_name || job.position || job.job_name || job.name || '';
          company_name = company_name || job.company_name || '';
        }

        if (!company_name && application.company_id) {
          const companyDoc = await db.collection('companies').doc(application.company_id).get().catch(() => ({ data: null }));
          const company = companyDoc.data || {};
          company_name = company.name || company.company_name || company.short_name || '';
        }
      }
    } catch (err) {
      console.warn('根据 application_id 组装报名通知失败，回退到调用参数:', err.message || err);
    }
  } else if (user_id && (!applicant_name || !applicant_phone)) {
    try {
      const userDoc = await db.collection('users').doc(user_id).get();
      const applicant = userDoc.data || {};
      applicant_name = applicant.real_name || applicant.name || applicant_name || '';
      applicant_phone = applicant.phone || applicant.account_phone || applicant_phone || '';
    } catch (err) {
      console.warn('根据 user_id 补充报名通知失败:', err.message || err);
    }
  }

  const timeStr = formatChinaDateTime(new Date());
  const interviewTimeText = formatChinaDateTime(interview_time) || '未设置';
  applicant_name = normalizeText(applicant_name);
  applicant_phone = normalizeText(applicant_phone);
  applicant_id_card = normalizeText(applicant_id_card);
  job_name = normalizeText(job_name);
  company_name = normalizeText(company_name);
  recommender_name = normalizeText(recommender_name);

  const content = `**📋 新报名通知**
>姓名: <font color="info">${applicant_name}</font>
>手机: <font color="info">${applicant_phone}</font>
>身份证号: <font color="info">${applicant_id_card || '未填写'}</font>
>岗位: <font color="info">${job_name}</font>
>企业: <font color="info">${company_name}</font>
>面试时间: <font color="info">${interviewTimeText}</font>
>来源: <font color="comment">${source}</font>
>推荐人: <font color="comment">${recommender_name || '无'}</font>
>时间: <font color="comment">${timeStr}</font>`;

  // 需求要求身份证不脱敏；内外部群统一使用 applications 组装出的完整内容。
  await Promise.all([
    sendWecom({ content, msg_type: 'markdown' }),
    sendWecom({ content, msg_type: 'markdown', webhook_key: 'wecom_webhook_external' })
  ]);

  return { code: 0, message: '报名通知已推送', data: null };
}

/**
 * HTTPS POST 请求工具函数
 */
function httpsPost(url, data) {
  return new Promise((resolve, reject) => {
    const https = require('https');
    const urlObj = new URL(url);
    const postData = JSON.stringify(data);

    const options = {
      hostname: urlObj.hostname,
      port: 443,
      path: urlObj.pathname + urlObj.search,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(postData)
      }
    };

    const req = https.request(options, (res) => {
      let body = '';
      res.on('data', (chunk) => { body += chunk; });
      res.on('end', () => {
        try {
          resolve(JSON.parse(body));
        } catch (e) {
          reject(new Error(`响应解析失败: ${body}`));
        }
      });
    });

    req.on('error', reject);
    req.setTimeout(10000, () => {
      req.destroy(new Error('请求超时'));
    });
    req.write(postData);
    req.end();
  });
}

/**
 * 初始化/更新企业微信 webhook 配置（一次性使用）
 */
async function initWecomWebhook(data) {
  const { webhook_url, webhook_key = 'wecom_webhook', description = '企业微信群消息推送 webhook URL' } = data;
  if (!webhook_url) return error(400, '缺少 webhook_url');

  // 确保 notification_logs 集合存在
  try { await db.createCollection('notification_logs'); } catch (e) { /* already exists */ }

  const existing = await db.collection('system_config').where({ key: webhook_key }).get();
  if (existing.data && existing.data.length > 0) {
    await db.collection('system_config').doc(existing.data[0]._id).update({
      data: { value: webhook_url, updated_at: db.serverDate() }
    });
    return success(null, `webhook (${webhook_key}) 已更新`);
  }
  await db.collection('system_config').add({
    data: {
      category: 'notification',
      key: webhook_key,
      value: webhook_url,
      description,
      status: 'active',
      created_at: db.serverDate(),
      updated_at: db.serverDate()
    }
  });
  return success(null, `webhook (${webhook_key}) 已写入`);
}

/**
 * 渲染模板（变量替换）
 */
async function renderTemplate(data) {
  const { template_id, variables } = data;

  // 1. 获取模板内容
  const templateDoc = await db.collection('notification_templates')
    .doc(template_id)
    .get();

  if (!templateDoc.data) {
    throw new Error('模板不存在');
  }

  const template = templateDoc.data;
  let content = template.content;

  // 2. 替换变量
  for (const [key, value] of Object.entries(variables)) {
    const placeholder = `{${key}}`;
    content = content.replace(new RegExp(placeholder, 'g'), value);
  }

  return content;
}
