#!/usr/bin/env node

/**
 * 测试 companies 云函数（通过 tcb CLI）
 * 使用方法:
 *  1. 确保已登录: tcb login
 *  2. 已部署 companies 云函数
 *  3. 运行: node test-companies.js
 */

const { execSync } = require('child_process');
const fs = require('fs');

function tcbInvoke(action, data = {}) {
  const payload = JSON.stringify({ action, data });
  try {
    // 使用 --params 传入 JSON
    const result = execSync(`tcb functions:invoke companies --params '${payload}'`, {
      encoding: 'utf-8',
      stdio: ['ignore', 'pipe', 'pipe']
    });
    // tcb 输出可能包含多行，找最后一行的 JSON
    const lines = result.split('\n').filter(line => {
      try { JSON.parse(line);        return true; } catch { return false; }
    });
    return JSON.parse(lines[lines.length - 1] || '{}');
  } catch (err) {
    console.error('调用失败:', err.stdout || err.message);
    return null;
  }
}

async function runTests() {
  console.log('🚀 开始测试 companies 云函数\n');

  // 1. list（空数据或初始数据）
  console.log('1️⃣ 测试 list（列表查询）');
  let res = tcbInvoke('list', { page: 1, pageSize: 5 });
  console.log('结果:', JSON.stringify(res, null, 2));
  console.log('');

  // 2. create（创建企业）
  console.log('2️⃣ 测试 create（创建企业）');
  const testCompany = {
    name: '测试企业-' + Date.now(),
    unified_code: '91321391MA' + Math.random().toString(36).substr(2, 6).toUpperCase(),
    contact_name: '测试联系人',
    contact_phone: '13800138000',
    address: '江苏省宿迁市',
    status: 'active'
  };
  res = tcbInvoke('create', testCompany);
  console.log('创建结果:', JSON.stringify(res, null, 2));
  let companyId = res?.data?.id;
  console.log('');

  if (!companyId) {
    console.log('❌ 创建失败，停止后续测试');
    return;
  }

  // 3. get（获取单个企业）
  console.log('3️⃣ 测试 get（获取企业详情）');
  res = tcbInvoke('get', { id: companyId });
  console.log('详情:', JSON.stringify(res, null, 2));
  console.log('');

  // 4. list（带关键词搜索）
  console.log('4️⃣ 测试 list（关键词搜索: ' + testCompany.name + ')');
  res = tcbInvoke('list', { page: 1, pageSize: 10, keyword: testCompany.name });
  console.log(`搜索到 ${res?.data?.pagination?.total || 0} 条结果`);
  console.log('');

  // 5. update（更新企业）
  console.log('5️⃣ 测试 update（更新企业）');
  res = tcbInvoke('update', {
    id: companyId,
    contact_name: '新联系人',
    address: '江苏省南京市'
  });
  console.log('更新结果:', JSON.stringify(res, null, 2));
  console.log('');

  // 6. toggleStatus（切换状态）
  console.log('6️⃣ 测试 toggleStatus（切换状态为 paused）');
  res = tcbInvoke('toggleStatus', { id: companyId, status: 'paused' });
  console.log('切换结果:', JSON.stringify(res, null, 2));
  console.log('');

  // 7. getStats（获取统计）
  console.log('7️⃣ 测试 getStats（企业统计）');
  res = tcbInvoke('getStats', { id: companyId });
  console.log('统计:', JSON.stringify(res, null, 2));
  console.log('');

  // 8. delete（软删除）
  console.log('8️⃣ 测试 delete（软删除）');
  res = tcbInvoke('delete', { id: companyId });
  console.log('删除结果:', JSON.stringify(res, null, 2));
  console.log('');

  // 9. 验证删除：再次查询应不可见
  console.log('9️⃣ 验证删除（list 不应包含该企业）');
  res = tcbInvoke('list', { page: 1, pageSize: 10 });
  const exists = res?.data?.list?.some(item => item._id === companyId);
  console.log(`企业是否还在列表中: ${exists ? '❌ 是' : '✅ 否'}`);
  console.log('');

  console.log('✅ 所有测试完成！');
}

// 执行
runTests().catch(err => {
  console.error('测试异常:', err);
  process.exit(1);
});
