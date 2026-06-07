#!/usr/bin/env node

/**
 * CloudBase Web 构建检查脚本
 * 用法: node scripts/deploy.js [--force] [--no-build]
 *
 * CloudBase 发布必须通过 MCP 工具完成：
 * 1. auth(action="status")，必要时 auth(action="set_env", envId="zhanrui-02140214-6f4e9jcb7c96a25")
 * 2. manageHosting(action="upload", localPath="/Volumes/sige/Documents/hr-system-3.0/web/dist", cloudPath="/")
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const readline = require('readline');

// 配置
const ENV_ID = 'zhanrui-02140214-6f4e9jcb7c96a25';
const REGION = 'ap-shanghai';
const DIST_DIR = path.join(__dirname, '../web/dist');
const PROJECT_ROOT = path.join(__dirname, '..');

// 颜色输出
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

function runCommand(cmd, options = {}) {
  try {
    const result = execSync(cmd, {
      cwd: PROJECT_ROOT,
      stdio: options.silent ? 'pipe' : 'inherit',
      encoding: 'utf-8'
    });
    return { success: true, output: result };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

async function question(prompt) {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return new Promise((resolve) => {
    rl.question(prompt, (answer) => {
      rl.close();
      resolve(answer);
    });
  });
}

async function main() {
  log('blue', '========================================');
  log('blue', '   CloudBase 部署脚本');
  log('blue', '========================================\n');

  // 解析命令行参数
  const args = process.argv.slice(2);
  const force = args.includes('--force');
  const skipBuild = args.includes('--no-build');

  try {
    // 1. 检查环境变量文件
    log('cyan', '✓ 检查环境配置...');
    const envFiles = ['.env.production', '.env.local'];
    for (const file of envFiles) {
      const filePath = path.join(PROJECT_ROOT, 'web', file);
      if (fs.existsSync(filePath)) {
        log('green', `✓ 找到 ${file}`);
      }
    }
    log('');

    // 2. 清理老的构建
    if (fs.existsSync(DIST_DIR)) {
      log('cyan', '✓ 清理旧构建产物...');
      execSync(`rm -rf ${DIST_DIR}`, { stdio: 'pipe' });
      log('green', '✓ 清理完成\n');
    }

    // 3. 构建应用
    if (!skipBuild) {
      log('cyan', '✓ 开始构建应用...');
      log('yellow', '  此过程可能需要 30-60 秒\n');
      
      const buildCmd = 'cd web && npm run build';
      const buildResult = runCommand(buildCmd);
      
      if (!buildResult.success) {
        log('red', '✗ 构建失败');
        log('red', buildResult.error);
        process.exit(1);
      }
      log('green', '✓ 构建成功\n');
    } else {
      log('yellow', '⊘ 跳过构建（使用已有产物）\n');
    }

    // 4. 验证构建产物
    log('cyan', '✓ 验证构建产物...');
    if (!fs.existsSync(DIST_DIR)) {
      log('red', '✗ dist 目录不存在');
      process.exit(1);
    }

    const indexPath = path.join(DIST_DIR, 'index.html');
    if (!fs.existsSync(indexPath)) {
      log('red', '✗ index.html 不存在');
      process.exit(1);
    }

    // 计算大小
    const distSize = execSync(`du -sh ${DIST_DIR}`, { encoding: 'utf-8' }).split('\t')[0];
    const fileCount = execSync(`find ${DIST_DIR} -type f | wc -l`, { encoding: 'utf-8' }).trim();
    
    log('green', `✓ 构建产物完整`);
    log('green', `  大小: ${distSize}`);
    log('green', `  文件数: ${fileCount}\n`);

    // 5. 显示部署信息
    log('cyan', '部署信息:');
    log('blue', `  环境 ID: ${ENV_ID}`);
    log('blue', `  地区: ${REGION}`);
    log('blue', `  源目录: ${DIST_DIR}`);
    log('blue', `  部署类型: 静态网站\n`);

    // 6. 确认发布意图
    if (!force) {
      const answer = await question(`${colors.yellow}确认部署到 CloudBase? (yes/no): ${colors.reset}`);
      if (answer.toLowerCase() !== 'yes' && answer.toLowerCase() !== 'y') {
        log('yellow', '已取消部署');
        process.exit(0);
      }
    }

    // 7. MCP 发布提示
    log('yellow', '已完成构建与产物校验。CloudBase 发布请使用 MCP 工具 manageHosting(action="upload")。');
    log('yellow', `localPath: ${DIST_DIR}`);
    log('yellow', 'cloudPath: /\n');

    // 8. 显示访问信息
    log('blue', '========================================');
    log('green', '应用已准备好通过 CloudBase MCP 发布');
    log('blue', '========================================\n');
    log('cyan', '访问地址:');
    log('green', `  https://${ENV_ID}.cloudbaseapp.com\n`);
    log('cyan', '发布工具:');
    log('yellow', '  manageHosting(action="upload", localPath="<web/dist>", cloudPath="/")\n');

  } catch (error) {
    log('red', `\n✗ 发生错误: ${error.message}`);
    process.exit(1);
  }
}

main();
