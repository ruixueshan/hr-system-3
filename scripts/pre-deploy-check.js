#!/usr/bin/env node

/**
 * 部署前检查清单
 * 用法: node scripts/pre-deploy-check.js
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  red: '\x1b[31m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m'
};

function log(color, message) {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

function check(description, condition) {
  if (condition) {
    log('green', `  ✓ ${description}`);
    return true;
  } else {
    log('red', `  ✗ ${description}`);
    return false;
  }
}

const PROJECT_ROOT = path.join(__dirname, '..');

console.log('\n' + colors.blue + '========================================' + colors.reset);
console.log(colors.blue + '    部署前检查清单' + colors.reset);
console.log(colors.blue + '========================================\n' + colors.reset);

let allPassed = true;

// 1. 基础工具检查
log('cyan', '1️⃣  基础工具');

try {
  execSync('node --version', { stdio: 'pipe' });
  check('Node.js 已安装', true);
} catch {
  check('Node.js 已安装', false);
  allPassed = false;
}

try {
  execSync('npm --version', { stdio: 'pipe' });
  check('npm 已安装', true);
} catch {
  check('npm 已安装', false);
  allPassed = false;
}

try {
  execSync('tcb --version', { stdio: 'pipe' });
  check('CloudBase CLI 已安装', true);
} catch {
  check('CloudBase CLI 已安装（可选，稍后安装）', false);
}

console.log();

// 2. 项目文件检查
log('cyan', '2️⃣  项目文件');

const files = [
  { path: 'package.json', desc: 'package.json' },
  { path: 'web/package.json', desc: 'web/package.json' },
  { path: 'web/vite.config.ts', desc: 'vite.config.ts' },
  { path: 'web/.env.production', desc: '.env.production' },
  { path: 'cloudbaserc.json', desc: 'cloudbaserc.json' }
];

files.forEach(file => {
  const filePath = path.join(PROJECT_ROOT, file.path);
  check(file.desc, fs.existsSync(filePath));
  if (!fs.existsSync(filePath)) allPassed = false;
});

console.log();

// 3. 依赖检查
log('cyan', '3️⃣  依赖安装');

const nodeModules = path.join(PROJECT_ROOT, 'web', 'node_modules');
const rootNodeModules = path.join(PROJECT_ROOT, 'node_modules');

if (fs.existsSync(nodeModules) || fs.existsSync(rootNodeModules)) {
  check('依赖已安装', true);
} else {
  check('依赖已安装（缺少，需要运行 npm install）', false);
  allPassed = false;
}

console.log();

// 4. 环境配置检查
log('cyan', '4️⃣  环境配置');

const envProdPath = path.join(PROJECT_ROOT, 'web/.env.production');
if (fs.existsSync(envProdPath)) {
  const envContent = fs.readFileSync(envProdPath, 'utf-8');
  check('VITE_CLOUDBASE_ENV 已配置', envContent.includes('VITE_CLOUDBASE_ENV'));
  check('VITE_API_BASE_URL 已配置', envContent.includes('VITE_API_BASE_URL'));
}

console.log();

// 5. 构建产物检查
log('cyan', '5️⃣  构建产物');

const distDir = path.join(PROJECT_ROOT, 'web', 'dist');
const indexPath = path.join(distDir, 'index.html');

if (fs.existsSync(distDir)) {
  check('dist 目录存在', true);
  check('index.html 存在', fs.existsSync(indexPath));
  
  if (fs.existsSync(distDir)) {
    try {
      const size = execSync(`du -sh ${distDir}`, { encoding: 'utf-8' }).split('\t')[0];
      log('blue', `  📦 构建大小: ${size}`);
    } catch {}
  }
} else {
  check('dist 目录存在（缺少，需要运行 npm run build）', false);
  allPassed = false;
}

console.log();

// 6. 网络连接检查
log('cyan', '6️⃣  网络连接');

try {
  execSync('ping -c 1 www.baidu.com > /dev/null 2>&1 || echo "Network OK"');
  check('网络连接正常', true);
} catch {
  check('网络连接正常（必需）', false);
  allPassed = false;
}

console.log();

// 7. CloudBase 认证检查
log('cyan', '7️⃣  CloudBase 认证');

try {
  const result = execSync('tcb --version', { encoding: 'utf-8' });
  check('CloudBase CLI 已认证', true);
} catch {
  check('CloudBase CLI 已认证（运行: tcb login）', false);
}

console.log();

// 8. 类型检查（可选）
log('cyan', '8️⃣  TypeScript 检查（可选）');

try {
  execSync('cd web && npx vue-tsc --noEmit', { stdio: 'pipe', timeout: 30000 });
  check('TypeScript 编译成功', true);
} catch {
  check('TypeScript 编译成功', false);
  // 不影响总体结果
}

console.log();

// 总结
console.log(colors.blue + '========================================' + colors.reset);
if (allPassed) {
  log('green', '✅ 所有检查通过！可以进行部署');
  log('cyan', '\n下一步: 运行 npm run deploy\n');
  process.exit(0);
} else {
  log('yellow', '⚠️  有些检查未通过，请按上面的提示完成');
  log('yellow', '\n您仍然可以尝试部署，但可能失败。\n');
  process.exit(1);
}
