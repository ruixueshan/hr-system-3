#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const tcb = require('tcb-admin-node');

const ENV_ID = process.env.CLOUDBASE_ENV || 'cloud1-5glojms9a83c3457';
const credentialPath = path.join(process.env.HOME || '', '.tencentcloud', 'credentials.json');

try {
  if (fs.existsSync(credentialPath)) {
    const raw = JSON.parse(fs.readFileSync(credentialPath, 'utf8'));
    if (raw.secretId && raw.secretKey) {
      process.env.TENCENT_SECRET_ID = process.env.TENCENT_SECRET_ID || raw.secretId;
      process.env.TENCENT_SECRET_KEY = process.env.TENCENT_SECRET_KEY || raw.secretKey;
    }
  }
} catch (err) {
  console.warn('读取腾讯云凭证失败:', err.message || err);
}

if (!process.env.TENCENT_SECRET_ID || !process.env.TENCENT_SECRET_KEY) {
  console.error('缺少腾讯云凭证，请先配置 TENCENT_SECRET_ID / TENCENT_SECRET_KEY 或执行 tcb login。');
  process.exit(1);
}

const app = tcb.init({
  secretId: process.env.TENCENT_SECRET_ID,
  secretKey: process.env.TENCENT_SECRET_KEY,
  env: ENV_ID
});

const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const limitArg = args.find(arg => arg.startsWith('--limit='));
const limit = limitArg ? Number(limitArg.split('=')[1]) || 500 : 500;

async function main() {
  const res = await app.callFunction({
    name: 'interviews',
    data: {
      action: 'backfill-from-applications',
      dry_run: dryRun,
      limit
    }
  });
  const result = res.result || {};
  if (result.code !== 0) {
    throw new Error(result.message || '回填失败');
  }
  console.log(JSON.stringify(result.data || {}, null, 2));
}

main().catch((err) => {
  console.error('执行失败:', err.message || err);
  process.exit(1);
});
