#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

const modulesDir = path.join(__dirname, 'web/src/api/modules');

const files = [
  'companies.ts', 'employees.ts', 'jobs.ts', 'applications.ts',
  'salaries.ts', 'interviews.ts', 'qrcode.ts', 'archives.ts',
  'bonus.ts', 'worktime.ts', 'advances.ts'
];

console.log('🔧 开始修复 API 模块...\n');

files.forEach(filename => {
  const filepath = path.join(modulesDir, filename);
  
  if (!fs.existsSync(filepath)) {
    console.log(`⚠️  文件不存在: ${filename}`);
    return;
  }
  
  let content = fs.readFileSync(filepath, 'utf-8');
  
  // 计数器
  let removed = 0;
  let replaced = 0;
  
  // 移除 function getDb() { ... }
  const prevLen1 = content.length;
  content = content.replace(/function getDb\(\)\s*\{\s*return getDatabase\(\);\s*\}\s*\n*/g, '');
  if (content.length < prevLen1) removed++;
  
  // 移除 const getDb = () => ...
  const prevLen2 = content.length;
  content = content.replace(/const getDb = \(\) => getDatabase\(\);\s*\n*/g, '');
  if (content.length < prevLen2) removed++;
  
  // 替换所有调用
  const prevContent = content;
  content = content.replace(/const db = getDb\(\);/g, 'const db = await getDatabase();');
  replaced = (prevContent.match(/const db = getDb\(\);/g) || []).length;
  
  // 写回文件
  fs.writeFileSync(filepath, content, 'utf-8');
  
  const status = removed > 0 || replaced > 0 ? '✅' : '⚠️ ';
  console.log(`${status} ${filename} (移除 ${removed} 个, 替换 ${replaced} 个)`);
});

console.log('\n✅ 所有文件修复完成！');
