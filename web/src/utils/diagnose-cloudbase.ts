/**
 * CloudBase 数据库连接诊断工具
 * 在浏览器控制台运行: window.diagnoseCloudBase()
 */

import { getDatabase, cloud } from '@/api/cloud';

export async function diagnoseCloudBase() {
  console.log('🔍 开始诊断 CloudBase 连接...\n');

  const results: any = {
    database: false,
    collections: {},
    samples: {}
  };

  try {
    // 1. 测试数据库连接
    console.log('1️⃣ 测试数据库连接...');
    const db = await getDatabase();
    console.log('✅ 数据库连接成功');
    results.database = true;

    // 2. 检查主要集合
    const collections = ['companies', 'jobs', 'applications', 'employees', 'users'];

    for (const col of collections) {
      try {
        console.log(`\n2️⃣ 检查集合: ${col}`);
        const count = await db.collection(col).count();
        const total = count.total || 0;

        results.collections[col] = total;
        
        if (total > 0) {
          console.log(`  ✅ 包含 ${total} 条记录`);
          
          // 获取样本数据
          const sample = await db.collection(col).limit(1).get();
          if (sample.data && sample.data.length > 0) {
            results.samples[col] = sample.data[0];
            console.log('  📄 样本数据:', sample.data[0]);
          }
        } else {
          console.log(`  ⚠️ 集合为空`);
        }
      } catch (err: any) {
        console.warn(`  ❌ 集合 ${col} 访问失败:`, err.message);
        results.collections[col] = `Error: ${err.message}`;
      }
    }

    // 3. 汇总结果
    console.log('\n📊 诊断结果总结:');
    console.log('─'.repeat(50));
    console.table(results.collections);
    console.log('─'.repeat(50));

    // 4. 建议
    console.log('\n💡 建议:');
    let hasData = false;
    for (const [_col, count] of Object.entries(results.collections)) {
      if (typeof count === 'number' && count > 0) {
        hasData = true;
      }
    }

    if (!hasData) {
      console.log('⚠️ 数据库中没有数据。请运行以下步骤:');
      console.log('  1. 使用正式环境工具页创建数据: https://cloud1-5glojms9a83c3457.service.tcloudbase.com/devtools');
      console.log('  2. 或运行命令: window.seedTestData.createAll()');
    } else {
      console.log('✅ 数据库连接正常，检测到数据。您可以开始使用应用了！');
    }

    console.log('\n📋 完整结果:', results);
    return results;

  } catch (err: any) {
    console.error('❌ 诊断失败:', err);
    return results;
  }
}

// 暴露到全局作用域
(window as any).diagnoseCloudBase = diagnoseCloudBase;

/**
 * 授权状态与写权限自检
 * 浏览器控制台运行: window.checkCloudAuth()
 */
export async function checkCloudAuth() {
  const result: any = {
    loginState: null,
    anonymousLogin: false,
    writeTest: null,
    error: null
  };

  try {
    const auth = cloud.auth({ persistence: 'local' });
    let loginState = await auth.getLoginState();
    result.loginState = loginState;

    if (!loginState) {
      console.log('⚠️ 未登录，尝试匿名登录...');
      await auth.signInAnonymously();
      loginState = await auth.getLoginState();
      result.loginState = loginState;
      result.anonymousLogin = true;
      console.log('✅ 匿名登录成功，uid:', loginState?.user?.uid);
    } else {
      console.log('✅ 已登录，uid:', loginState.user?.uid, 'loginType:', loginState.loginType);
    }

    const db = await getDatabase();
    console.log('🧪 写入测试集合 auth_checks ...');
    const addRes = await db.collection('auth_checks').add({
      uid: loginState?.user?.uid || 'unknown',
      loginType: loginState?.loginType || 'unknown',
      timestamp: new Date(),
      note: 'frontend auth connectivity test'
    });
    result.writeTest = { ok: true, id: addRes.id || addRes._id };
    console.log('✅ 写入成功，doc id:', addRes.id || addRes._id);
  } catch (err: any) {
    result.error = err?.message || err;
    console.error('❌ Auth/写入检查失败:', err?.message || err);
  }

  console.log('📋 检查结果:', result);
  return result;
}

(window as any).checkCloudAuth = checkCloudAuth;

/**
 * 尝试对 jobs 集合执行一次安全的写入，确认岗位更新权限
 * 会找到第一条岗位记录，在其上打一个诊断时间戳，不会改业务字段
 * 浏览器控制台运行: window.checkJobsWrite()
 */
export async function checkJobsWrite() {
  const res: any = { ok: false, error: null, jobId: null, updateResult: null, jobOwner: null, currentUid: null };
  try {
    const db = await getDatabase();
    const list = await db.collection('jobs').limit(1).get();
    const job = list.data?.[0];
    if (!job) {
      console.warn('⚠️ jobs 集合没有数据，无法测试写入');
      res.error = 'no jobs data';
      return res;
    }
    const id = job._id || job.id;
    res.jobId = id;
    res.jobOwner = job._openid || job.create_by || job.created_by || job.createdBy;

    // 获取当前登录 uid
    const auth = cloud.auth({ persistence: 'local' });
    const loginState = await auth.getLoginState();
    res.currentUid = loginState?.user?.uid || null;

    console.log('🧪 尝试更新岗位:', id, job.position || job.title || job.job_name || '');
    const update = await db.collection('jobs').doc(id).update({
      diagnose_touched_at: new Date()
    });
    res.ok = true;
    res.updateResult = update;
    console.log('✅ jobs 写入成功:', update);
    return res;
  } catch (err: any) {
    res.error = err?.message || err;
    console.error('❌ jobs 写入失败:', err?.message || err);
    return res;
  }
}

(window as any).checkJobsWrite = checkJobsWrite;

/**
 * 尝试对 companies 集合执行一次安全的写入，确认企业更新权限
 * 浏览器控制台运行: window.checkCompaniesWrite()
 */
export async function checkCompaniesWrite() {
  const res: any = { ok: false, error: null, companyId: null, updateResult: null, companyOwner: null, currentUid: null };
  try {
    const db = await getDatabase();
    const list = await db.collection('companies').limit(1).get();
    const company = list.data?.[0];
    if (!company) {
      res.error = 'no companies data';
      console.warn('⚠️ companies 集合没有数据，无法测试写入');
      return res;
    }
    const id = company._id || company.id;
    res.companyId = id;
    res.companyOwner = company._openid || company.create_by || company.created_by || company.createdBy;

    const auth = cloud.auth({ persistence: 'local' });
    const loginState = await auth.getLoginState();
    res.currentUid = loginState?.user?.uid || null;

    console.log('🧪 尝试更新企业:', id, company.name || company.short_name || '');
    const update = await db.collection('companies').doc(id).update({
      diagnose_touched_at: new Date()
    });
    res.ok = true;
    res.updateResult = update;
    console.log('✅ companies 写入尝试返回:', update);
    return res;
  } catch (err: any) {
    res.error = err?.message || err;
    console.error('❌ companies 写入失败:', err?.message || err);
    return res;
  }
}

(window as any).checkCompaniesWrite = checkCompaniesWrite;
