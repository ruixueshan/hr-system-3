#!/usr/bin/env node
/**
 * CloudBase 初始化脚本 - 创建测试用户
 * 使用: tcb fn invoke init-users
 * 
 * 需要先安装 tcb-cli: npm i -g @cloudbase/cli
 */

const tcb = require('tcb-admin-node');

const ENV_ID = 'cloud1-5glojms9a83c3457';

async function initUsers() {
  // 初始化 TCB 连接（需要 tcb login 先认证）
  try {
    tcb.init({
      env: ENV_ID
    });
  } catch (e) {
    console.error('tcb 初始化失败，请先运行: tcb login');
    process.exit(1);
  }

  const db = tcb.database();

  // 测试用户数据
  const testUsers = [
    {
      phone: '13800138000',
      password: '123456',
      name: '测试HR',
      role: 'hr',
      status: 'normal',
      created_at: new Date(),
      updated_at: new Date()
    },
    {
      phone: '13900139000',
      password: '123456',
      name: '张三',
      role: 'candidate',
      status: 'normal',
      created_at: new Date(),
      updated_at: new Date()
    },
    {
      phone: '15800138001',
      password: '123456',
      name: '李四',
      role: 'employee',
      status: 'normal',
      created_at: new Date(),
      updated_at: new Date()
    }
  ];

  try {
    console.log('🚀 开始创建测试用户...');
    
    for (const user of testUsers) {
      try {
        // 检查用户是否存在
        const existing = await db.collection('users')
          .where({ phone: user.phone })
          .limit(1)
          .get();

        if (!existing.data || existing.data.length === 0) {
          // 创建新用户
          await db.collection('users').add(user);
          console.log(`✅ 创建用户: ${user.name} (${user.phone})`);
        } else {
          console.log(`⏭️ 用户已存在: ${user.name} (${user.phone})`);
        }
      } catch (err) {
        console.error(`❌ 创建用户 ${user.name} 失败:`, err.message);
      }
    }

    console.log('\n✅ 用户初始化完成！');
    console.log('📝 可用测试账号:');
    testUsers.forEach(u => {
      console.log(`  - ${u.phone} / 密码: ${u.password} (${u.name})`);
    });

  } catch (err) {
    console.error('❌ 初始化失败:', err);
    process.exit(1);
  }
}

initUsers().then(() => {
  console.log('\n👉 请刷新页面重新登录');
  process.exit(0);
}).catch(err => {
  console.error(err);
  process.exit(1);
});
