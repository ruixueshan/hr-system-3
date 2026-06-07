/**
 * 修正候选人时间字段的时区问题
 * 
 * 问题：toDateTimeStr 使用 date.getHours() 等方法在云函数(UTC)服务器上输出了 UTC 时间，
 *       但字符串被当作北京时间存储和解析，导致时间偏差 8 小时。
 * 
 * 修正策略：
 * 1. users 表：用 _ts 时间戳字段重新生成正确的字符串
 * 2. candidate_owners 表：用 _ts 时间戳字段重新生成正确的字符串
 * 
 * 用法：node scripts/fix-candidate-timezone.js
 * 需要环境：需要在有 tcb 环境的情况下运行，或部署为云函数执行
 */

const tcb = require('tcb-admin-node');
const fs = require('fs');

const ENV_ID = 'cloud1-5glojms9a83c3457';

// 尝试从 tcb CLI 的 auth 文件读取临时凭证
const authPath = require('path').join(require('os').homedir(), '.config/.cloudbase/auth.json');
let secretId, secretKey, token;

try {
  const auth = JSON.parse(fs.readFileSync(authPath, 'utf8'));
  const cred = auth.credential;
  if (cred && cred.tmpSecretId && cred.tmpSecretKey) {
    secretId = cred.tmpSecretId;
    secretKey = cred.tmpSecretKey;
    token = cred.tmpToken;
  }
} catch (e) {}

if (!secretId || !secretKey) {
  console.error('请先运行 tcb login 登录');
  process.exit(1);
}

tcb.init({
  secretId,
  secretKey,
  sessionToken: token,
  env: ENV_ID
});

const db = tcb.database();
const _ = db.command;

function tsToShanghaiStr(ts) {
  if (!ts || typeof ts !== 'number') return null;
  const date = new Date(ts);
  if (isNaN(date.getTime())) return null;
  const formatter = new Intl.DateTimeFormat('zh-CN', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
    hour12: false
  });
  const parts = formatter.formatToParts(date);
  const get = type => parts.find(p => p.type === type).value;
  return `${get('year')}-${get('month')}-${get('day')} ${get('hour')}:${get('minute')}:${get('second')}`;
}

async function getAllDocs(collection, filter = {}) {
  const countRes = await db.collection(collection).where(filter).count();
  const total = countRes.total;
  const batchSize = 100;
  const docs = [];
  for (let i = 0; i < total; i += batchSize) {
    const res = await db.collection(collection).where(filter).skip(i).limit(batchSize).get();
    docs.push(...res.data);
  }
  return docs;
}

async function fixUsersTable() {
  console.log('=== 修正 users 表 ===');
  
  // 查找有 candidate_last_action_at_ts 的用户
  const users = await getAllDocs('users', {
    candidate_last_action_at_ts: _.gt(0)
  });
  
  console.log(`找到 ${users.length} 条需要检查的用户记录`);
  
  let fixedCount = 0;
  for (const user of users) {
    const update = {};
    
    // 修正 candidate_last_action_at
    if (user.candidate_last_action_at_ts && user.candidate_last_action_at) {
      const correctStr = tsToShanghaiStr(user.candidate_last_action_at_ts);
      if (correctStr && correctStr !== user.candidate_last_action_at) {
        update.candidate_last_action_at = correctStr;
      }
    }
    
    // 修正 candidate_owner_bind_at (用 candidate_owner_bind_at_ts)
    if (user.candidate_owner_bind_at_ts && user.candidate_owner_bind_at) {
      const correctStr = tsToShanghaiStr(user.candidate_owner_bind_at_ts);
      if (correctStr && correctStr !== user.candidate_owner_bind_at) {
        update.candidate_owner_bind_at = correctStr;
      }
    }
    
    // 修正 candidate_owner_expire_at (用 candidate_owner_expire_at_ts)
    if (user.candidate_owner_expire_at_ts && user.candidate_owner_expire_at) {
      const correctStr = tsToShanghaiStr(user.candidate_owner_expire_at_ts);
      if (correctStr && correctStr !== user.candidate_owner_expire_at) {
        update.candidate_owner_expire_at = correctStr;
      }
    }
    
    // 修正 candidate_public_pool_at (用 candidate_public_pool_at_ts)
    if (user.candidate_public_pool_at_ts && user.candidate_public_pool_at) {
      const correctStr = tsToShanghaiStr(user.candidate_public_pool_at_ts);
      if (correctStr && correctStr !== user.candidate_public_pool_at) {
        update.candidate_public_pool_at = correctStr;
      }
    }
    
    if (Object.keys(update).length > 0) {
      await db.collection('users').doc(user._id).update({ data: update });
      fixedCount++;
      console.log(`修正用户 ${user._id}: ${JSON.stringify(update)}`);
    }
  }
  
  console.log(`users 表共修正 ${fixedCount} 条记录`);
}

async function fixCandidateOwnersTable() {
  console.log('\n=== 修正 candidate_owners 表 ===');
  
  const records = await getAllDocs('candidate_owners');
  console.log(`找到 ${records.length} 条 candidate_owners 记录`);
  
  let fixedCount = 0;
  for (const record of records) {
    const update = {};
    
    // 修正 bind_at (用 bind_at_ts)
    if (record.bind_at_ts && record.bind_at) {
      const correctStr = tsToShanghaiStr(record.bind_at_ts);
      if (correctStr && correctStr !== record.bind_at) {
        update.bind_at = correctStr;
      }
    }
    
    // 修正 expire_at (用 expire_at_ts)
    if (record.expire_at_ts && record.expire_at) {
      const correctStr = tsToShanghaiStr(record.expire_at_ts);
      if (correctStr && correctStr !== record.expire_at) {
        update.expire_at = correctStr;
      }
    }
    
    // 修正 released_at (用 released_at_ts)
    if (record.released_at_ts && record.released_at) {
      const correctStr = tsToShanghaiStr(record.released_at_ts);
      if (correctStr && correctStr !== record.released_at) {
        update.released_at = correctStr;
      }
    }
    
    if (Object.keys(update).length > 0) {
      await db.collection('candidate_owners').doc(record._id).update({ data: update });
      fixedCount++;
      console.log(`修正 candidate_owners ${record._id}: ${JSON.stringify(update)}`);
    }
  }
  
  console.log(`candidate_owners 表共修正 ${fixedCount} 条记录`);
}

async function main() {
  try {
    console.log('开始修正候选人时间字段时区问题...\n');
    await fixUsersTable();
    await fixCandidateOwnersTable();
    console.log('\n修正完成！');
  } catch (err) {
    console.error('修正失败:', err);
  }
}

main();
