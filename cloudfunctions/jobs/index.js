/**
 * 岗位模块 - 仅加载岗位信息
 * 功能：分页查询岗位列表
 * Updated: 2026-03-17 14:10
 */
const cloud = require('wx-server-sdk');
cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
});

const db = cloud.database();

function normalizeSortOrder(value) {
  const num = Number(value);
  if (!Number.isInteger(num) || num < 1 || num > 100) return null;
  return num;
}

function sortJobsByOrder(list = []) {
  return [...list].sort((left, right) => {
    const leftOrder = normalizeSortOrder(left.sort_order);
    const rightOrder = normalizeSortOrder(right.sort_order);
    const leftHasOrder = leftOrder !== null;
    const rightHasOrder = rightOrder !== null;

    if (leftHasOrder !== rightHasOrder) {
      return leftHasOrder ? -1 : 1;
    }

    if (leftHasOrder && rightHasOrder && leftOrder !== rightOrder) {
      return leftOrder - rightOrder;
    }

    return new Date(right.created_at || 0).getTime() - new Date(left.created_at || 0).getTime();
  });
}

async function fetchAllJobsByCondition(finalCondition, total, batchSize = 100) {
  const rows = [];
  for (let skip = 0; skip < total; skip += batchSize) {
    const listRes = await db.collection('jobs')
      .where(finalCondition)
      .orderBy('created_at', 'desc')
      .skip(skip)
      .limit(Math.min(batchSize, total - skip))
      .get();
    rows.push(...(listRes.data || []));
  }
  return rows;
}

// 导入验证模块
const { verifyToken } = require('./auth');

// 内联响应函数
function success(data = null, message = 'success') {
  return {
    code: 0,
    message,
    data
  };
}

function error(code = 1, message = 'error', data = null) {
  return {
    code,
    message,
    data
  };
}

/**
 * 主入口
 */
exports.main = async (event, context) => {
  const { action, token } = event;

  console.log('jobs云函数调用:', { action, token: token ? '已携带' : '未携带', event });

  try {
    // 不需要登录的操作
    const publicActions = ['list', 'addIsDeletedField', 'get'];

    // 如果是公开操作，直接执行
    if (publicActions.includes(action)) {
      if (action === 'list') {
        return listJobs(event);
      }
      if (action === 'addIsDeletedField') {
        return addIsDeletedField();
      }
      if (action === 'get') {
        return getJob(event);
      }
    }

    // 需要登录的操作
    const authResult = await verifyToken(token, true);

    if (!authResult.valid) {
      return authResult.error;
    }

    const userInfo = authResult.userInfo;
    console.log('用户信息:', { id: userInfo._id, name: userInfo.name, phone: userInfo.phone });

    // 需要登录的操作
    if (action === 'delete') {
      return deleteJob(event, userInfo);
    }

    return error(400, '不支持的操作');
  } catch (err) {
    console.error('岗位模块错误:', err);
    return error(500, err.message || '服务器错误');
  }
};

/**
 * 分页查询岗位列表
 * 支持筛选：is_recruiting, company_id, location, keyword
 */
async function listJobs(params = {}) {
  console.log('listJobs params:', JSON.stringify(params, null, 2));

  // 确保params是一个对象
  params = params && typeof params === 'object' ? params : {};
  
  // 如果params中有data字段，使用data字段（兼容前端调用方式）
  const data = params.data || params;

  const {
    is_recruiting,
    company_id,
    location,
    keyword,
    salary_type,
    supports_daily,
    page = 1,
    pageSize = 20
  } = data;

  console.log('解构后的参数:', { is_recruiting, keyword, page, pageSize });
  console.log('keyword类型:', typeof keyword, '值:', keyword);

  // 构建复合查询条件
  const whereCondition = {};

  // 添加筛选条件
  if (is_recruiting !== undefined) {
    whereCondition.is_recruiting = is_recruiting;
  }
  if (company_id) {
    whereCondition.company_id = company_id;
  }
  if (location && !keyword) {
    // 如果有keyword，location会在or条件中处理
    whereCondition.location = location;
  }
  if (salary_type) {
    if (Array.isArray(salary_type)) {
      whereCondition.salary_type = db.command.in(salary_type);
    } else {
      whereCondition.salary_type = salary_type;
    }
  }
  if (supports_daily !== undefined) {
    whereCondition.supports_daily = !!supports_daily;
  }
  
  // 处理关键词搜索
  let finalCondition = whereCondition;
  
  if (keyword && typeof keyword === 'string' && keyword.trim() !== '') {
    const keywordStr = keyword.trim();
    console.log('开始关键词搜索，关键词:', keywordStr);
    
    // 创建or条件数组
    const orConditions = [
      { position: db.RegExp({ regexp: keywordStr, options: 'i' }) },
      { location: db.RegExp({ regexp: keywordStr, options: 'i' }) }
    ];
    
    console.log('OR条件:', JSON.stringify(orConditions, null, 2));
    
    // 如果有其他条件，需要将or条件与其他条件结合
    if (Object.keys(whereCondition).length > 0) {
      // 移除已存在的location条件（如果有）
      delete whereCondition.location;
      
      // 创建复合条件：必须满足基础条件，并且满足or条件之一
      finalCondition = db.command.and([
        whereCondition,
        db.command.or(orConditions)
      ]);
    } else {
      // 只有or条件
      finalCondition = db.command.or(orConditions);
    }
  } else {
    console.log('无有效关键词，使用基础查询条件');
  }

  console.log('构建的查询条件:', JSON.stringify(finalCondition, null, 2));

  try {
    // 获取总数
    const totalRes = await db.collection('jobs').where(finalCondition).count();
    const total = totalRes.total;

    const allRows = total > 0 ? await fetchAllJobsByCondition(finalCondition, total) : [];
    const sortedRows = sortJobsByOrder(allRows);
    const list = sortedRows.slice((page - 1) * pageSize, page * pageSize);

    console.log('查询结果:', {
      total,
      page,
      pageSize,
      count: list.length
    });

    return success({
      list,
      total,
      page,
      pageSize,
      hasMore: (page * pageSize) < total
    });
  } catch (err) {
    console.error('查询岗位列表失败:', err);
    throw err;
  }
}

/**
 * 获取岗位详情
 */
async function getJob(param) {
  // 支持字符串或对象参数
  const id = typeof param === 'string' ? param : (param && param.id);

  if (!id) {
    return error(400, '岗位ID不能为空');
  }

  console.log('getJob 函数接收到的 id:', id);

  try {
    const res = await db.collection('jobs').doc(id).get();

    if (!res.data) {
      return error(404, '岗位不存在');
    }

    // 检查是否已被删除
    if (res.data.is_deleted) {
      return error(404, '岗位不存在或已被删除');
    }

    // 关联企业信息
    let company_name = '';
    let company_short_name = '';
    let company_address = '';
    let company_contact = '';
    let company_phone = '';

    if (res.data.company_id) {
      try {
        const companyDoc = await db.collection('companies')
          .doc(res.data.company_id)
          .get();

        if (companyDoc.data) {
          company_name = companyDoc.data.name || '';
          company_short_name = companyDoc.data.short_name || '';
          company_address = companyDoc.data.address || '';
          company_contact = companyDoc.data.contact_person || '';
          company_phone = companyDoc.data.contact_phone || '';
        }
      } catch (companyErr) {
        console.warn('获取公司信息失败:', companyErr);
        // 继续执行，使用空的公司信息
      }
    }

    const jobData = {
      ...res.data,
      company_name,
      company_short_name,
      company_address,
      company_contact,
      company_phone
    };

    return success(jobData);
  } catch (err) {
    console.error('获取岗位详情失败:', err);
    throw err;
  }
}

/**
 * 创建岗位（已注释）
 */
// async function createJob(data, userInfo) {
//   const {
//     company_id,
//     position,
//     location,
//     department,
//     age_min,
//     age_max,
//     gender,
//     education,
//     experience,
//     salary_type,
//     hourly_rate,
//     salary_min,
//     salary_max,
//     salary_remark,
//     purchase_hourly_rate,
//     benefits,
//     vacancies,
//     description,
//     work_content,
//     work_time,
//     sort_order
//   } = data;
//
//   // 必填字段验证
//   if (!company_id || !position || !hourly_rate) {
//     return error(400, '企业ID、岗位名称、时薪为必填字段');
//   }
//
//   // 验证企业是否存在
//   const companyDoc = await db.collection('companies').doc(company_id).get();
//   if (!companyDoc.data) {
//     return error(404, '企业不存在');
//   }
//
//   // 验证时薪合理性
//   if (hourly_rate < 15 || hourly_rate > 100) {
//     return error(400, '时薪应在 15-100 元之间');
//   }
//
//   try {
//     const result = await db.collection('jobs').add({
//       data: {
//         company_id,
//         position,
//         location: location || '',
//         department: department || '',
//         age_min: age_min || 16,
//         age_max: age_max || 60,
//         gender: gender || '',
//         education: education || '',
//         experience: experience || '',
//         salary_type: salary_type || 'hourly',
//         hourly_rate,
//         salary_min: salary_min || hourly_rate * 176,
//         salary_max: salary_max || hourly_rate * 240,
//         salary_remark: salary_remark || '',
//         purchase_hourly_rate: purchase_hourly_rate || hourly_rate,
//         benefits: benefits || [],
//         vacancies: vacancies || 0,
//         recruited: 0,
//         is_recruiting: true,
//         status: 'active',
//         description: description || '',
//         work_content: work_content || '',
//         work_time: work_time || '',
//         sort_order: sort_order || 0,
//         created_by: userInfo._id,
//         created_at: db.serverDate(),
//         updated_at: db.serverDate(),
//         is_deleted: false
//       }
//     });
//
//     return success({ id: result.id }, '岗位创建成功');
//   } catch (err) {
//     console.error('创建岗位失败:', err);
//     return error(500, '创建失败，请重试');
//   }
// }

/**
 * 更新岗位（已注释）
 */
// async function updateJob(data, userInfo) {
//   const { id, ...updateData } = data;
//
//   if (!id) {
//     return error(400, '岗位ID不能为空');
//   }
//
//   // 检查岗位是否存在
//   const jobDoc = await db.collection('jobs').doc(id).get();
//   if (!jobDoc.data) {
//     return error(404, '岗位不存在');
//   }
//
//   try {
//     await db.collection('jobs').doc(id).update({
//       data: {
//         ...updateData,
//         updated_at: db.serverDate()
//       }
//     });
//
//     return success(null, '岗位更新成功');
//   } catch (err) {
//     console.error('更新岗位失败:', err);
//     return error(500, '更新失败，请重试');
//   }
// }

/**
 * 删除岗位（已注释）
 */
// async function deleteJob(data, userInfo) {
//   const { id } = data;
//
//   if (!id) {
//     return error(400, '岗位ID不能为空');
//   }
//
//   try {
//     await db.collection('jobs').doc(id).update({
//       data: {
//         is_deleted: true,
//         updated_at: db.serverDate()
//       }
//     });
//
//     return success(null, '岗位已删除');
//   } catch (err) {
//     console.error('删除岗位失败:', err);
//     return error(500, '删除失败，请重试');
//   }
// }

/**
 * 切换招聘状态（已注释）
 */
// async function toggleRecruit(data, userInfo) {
//   const { id, is_recruiting } = data;
//
//   if (!id || is_recruiting === undefined) {
//     return error(400, '参数不完整');
//   }
//
//   try {
//     await db.collection('jobs').doc(id).update({
//       data: {
//         is_recruiting: !!is_recruiting,
//         updated_at: db.serverDate()
//       }
//     });
//
//     return success(null, is_recruiting ? '已开启招聘' : '已暂停招聘');
//   } catch (err) {
//     console.error('切换招聘状态失败:', err);
//     return error(500, '操作失败，请重试');
//   }
// }

/**
 * 批量添加 is_deleted 字段
 * 临时功能，用于修正测试数据
 */
async function addIsDeletedField() {
  const MAX_UPDATE_PER_REQUEST = 20;
  const BATCH_SIZE = 100;

  try {
    console.log('开始批量添加 is_deleted 字段...');

    // 第一次查询获取总数
    const firstResult = await db.collection('jobs')
      .field({ _id: true })
      .limit(1)
      .get();

    const total = firstResult.data.length === 0 ? 0 : (await db.collection('jobs').count()).total;
    console.log(`总共需要更新 ${total} 条记录`);

    let updatedCount = 0;
    let skip = 0;

    while (skip < total) {
      // 每次批量查询记录
      const result = await db.collection('jobs')
        .field({ _id: true })
        .skip(skip)
        .limit(BATCH_SIZE)
        .get();

      const records = result.data;
      console.log(`获取到 ${records.length} 条记录`);

      // 分批更新（每次最多20条并发）
      for (let i = 0; i < records.length; i += MAX_UPDATE_PER_REQUEST) {
        const batch = records.slice(i, i + MAX_UPDATE_PER_REQUEST);
        const updatePromises = batch.map(record => {
          return db.collection('jobs').doc(record._id).update({
            data: {
              is_deleted: false
            }
          });
        });

        await Promise.all(updatePromises);
        updatedCount += batch.length;
        console.log(`已更新 ${updatedCount}/${total} 条记录`);
      }

      skip += BATCH_SIZE;
    }

    console.log(`批量更新完成，共更新 ${updatedCount} 条记录`);
    return success({ updatedCount }, 'is_deleted 字段添加完成');
  } catch (err) {
    console.error('批量添加 is_deleted 字段失败:', err);
    return error(500, err.message || '批量更新失败');
  }
}

/**
 * 软删除岗位（测试功能）
 * 只将 is_deleted 设置为 true
 * @param {Object} data - 请求数据 { id }
 * @param {Object} userInfo - 用户信息
 */
async function deleteJob(data, userInfo) {
  const { id } = data;

  if (!id) {
    return error(400, '岗位ID不能为空');
  }

  console.log(`用户 ${userInfo.name} (${userInfo._id}) 尝试删除岗位 ${id}`);

  try {
    // 检查用户权限（只有管理员可以删除）
    if (userInfo.role !== 'admin' && userInfo.role !== 'hr') {
      return error(403, '无权限执行此操作');
    }

    await db.collection('jobs').doc(id).update({
      data: {
        is_deleted: true,
        updated_at: db.serverDate(),
        deleted_by: userInfo._id,
        deleted_by_name: userInfo.name
      }
    });

    console.log(`岗位 ${id} 已被 ${userInfo.name} 删除`);
    return success(null, '岗位已删除');
  } catch (err) {
    console.error('删除岗位失败:', err);
    return error(500, '删除失败，请重试');
  }
}
