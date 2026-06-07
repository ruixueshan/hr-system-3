/**
 * 企业模块
 * CRUD 操作 + 高级查询
 */
const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();

function normalizeText(value) {
  return String(value || '').trim();
}

function toDateStr(value) {
  if (!value) return '';
  if (typeof value === 'string') {
    const match = value.match(/^(\d{4}-\d{2}-\d{2})/);
    if (match) return match[1];
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function isActiveRelation(item, today = toDateStr(new Date())) {
  const status = normalizeText(item?.status).toLowerCase();
  if (!item?.company_id) return false;
  if (['left', 'resigned', 'inactive', 'disabled', 'archived'].includes(status)) return false;
  const joinDate = toDateStr(item?.join_date);
  const leaveDate = toDateStr(item?.leave_date);
  if (joinDate && joinDate > today) return false;
  if (leaveDate && leaveDate < today) return false;
  return true;
}

async function countCompanyEmployees(companyId, { activeOnly = false } = {}) {
  if (!companyId) return 0;
  const res = await db.collection('employee_companies').where({ company_id: companyId }).get();
  const today = toDateStr(new Date());
  const relationMap = new Map();

  (res.data || []).forEach((item) => {
    if (activeOnly && !isActiveRelation(item, today)) return;
    if (!activeOnly && !item?.employee_id) return;
    const key = item.employee_id;
    const current = relationMap.get(key);
    const currentUpdated = new Date(current?.updated_at || current?.created_at || 0).getTime() || 0;
    const nextUpdated = new Date(item.updated_at || item.created_at || 0).getTime() || 0;
    if (!current || nextUpdated >= currentUpdated) {
      relationMap.set(key, item);
    }
  });

  return relationMap.size;
}

// 统一响应格式
function success(data = null, message = 'success') {
  return { code: 0, message, data };
}

function error(code = 1, message = 'error', data = null) {
  return { code, message, data };
}

// 主入口
exports.main = async (event, context) => {
  const { action, token } = event;

  try {
    switch (action) {
      case 'list':
        return await listCompanies(event);
      case 'get':
        return await getCompany(event.id);
      case 'create':
        return await createCompany(event);
      case 'update':
        return await updateCompany(event);
      case 'delete':
        return await deleteCompany(event);
      case 'toggleStatus':
        return await toggleCompanyStatus(event);
      case 'getStats':
        return await getCompanyStats(event.id);
      default:
        return error(400, '不支持的操作');
    }
  } catch (err) {
    console.error('企业模块错误:', err);
    return error(500, err.message);
  }
};

// 列表查询（支持分页、搜索）
async function listCompanies({ page = 1, pageSize = 100 } = {}) {
  const skip = (page - 1) * pageSize;
  
  const res = await db.collection('companies')
    .orderBy('created_at', 'desc')
    .skip(skip)
    .limit(pageSize)
    .get();
  
  const countRes = await db.collection('companies').count();
  const total = countRes.total;
  
  return success({
    list: res.data,
    pagination: {
      page,
      pageSize,
      total,
      totalPages: Math.ceil(total / pageSize)
    }
  });
}

// 获取单个企业详情（含关联统计）
async function getCompany(id) {
  const res = await db.collection('companies').doc(id).get();
  
  if (!res.data) {
    return error(404, '企业不存在');
  }
  
  // 获取关联统计
  const [jobsCountRes, employeeCount] = await Promise.all([
    db.collection('jobs').where({ company_id: id }).count(),
    countCompanyEmployees(id, { activeOnly: true })
  ]);
  
  const company = {
    ...res.data,
    job_count: jobsCountRes.total,
    employee_count: employeeCount
  };
  
  return success(company);
}

// 创建企业（查重 + 验证）
async function createCompany(data) {
  const { name, unified_code, contact_name, contact_phone, address, status = 'active' } = data;
  
  // 必填字段验证
  if (!name || !unified_code) {
    return error(400, '企业名称和统一社会信用代码为必填项');
  }
  
  // 统一社会信用代码查重（忽略大小写）
  const existing = await db.collection('companies')
    .where({
      unified_code: db.RegExp({
        regexp: unified_code,
        options: 'i'
      }),
      is_deleted: false
    })
    .count();
  
  if (existing.total > 0) {
    return error(400, '该统一社会信用代码已存在');
  }
  
  // 电话格式验证（简单验证）
  if (contact_phone && !/^1[3-9]\d{9}$/.test(contact_phone.replace(/\s/g, ''))) {
    return error(400, '手机号格式不正确');
  }
  
  // 插入数据
  const result = await db.collection('companies').add({
    data: {
      name,
      unified_code: unified_code.toUpperCase(),
      contact_name,
      contact_phone: contact_phone ? contact_phone.replace(/\s/g, '') : '',
      address,
      status,
      job_count: 0,
      employee_count: 0,
      is_deleted: false,
      created_at: db.serverDate(),
      updated_at: db.serverDate()
    }
  });
  
  return success({ id: result.id }, '创建成功');
}

// 更新企业（防止修改统一代码冲突）
async function updateCompany(data) {
  const { id, name, unified_code, contact_name, contact_phone, address, status } = data;
  
  if (!id) {
    return error(400, '企业ID不能为空');
  }
  
  // 检查企业是否存在
  const existing = await db.collection('companies').doc(id).get();
  if (!existing.data) {
    return error(404, '企业不存在');
  }
  
  const updateData = {
    updated_at: db.serverDate()
  };
  
  if (name !== undefined) updateData.name = name;
  if (contact_name !== undefined) updateData.contact_name = contact_name;
  if (contact_phone !== undefined) updateData.contact_phone = contact_phone.replace(/\s/g, '');
  if (address !== undefined) updateData.address = address;
  if (status !== undefined) updateData.status = status;
  
  // 统一社会信用代码修改时需要查重
  if (unified_code && unified_code !== existing.data.unified_code) {
    const duplicate = await db.collection('companies')
      .where({
        unified_code: db.RegExp({
          regexp: unified_code,
          options: 'i'
        }),
        is_deleted: false,
        _id: db.command.notEqual(id)
      })
      .count();
    
    if (duplicate.total > 0) {
      return error(400, '该统一社会信用代码已被其他企业使用');
    }
    
    updateData.unified_code = unified_code.toUpperCase();
  }
  
  await db.collection('companies').doc(id).update({
    data: updateData
  });
  
  return success(null, '更新成功');
}

// 软删除企业
async function deleteCompany(data) {
  const { id } = data;
  
  if (!id) {
    return error(400, '企业ID不能为空');
  }
  
  await db.collection('companies').doc(id).update({
    data: {
      is_deleted: true,
      deleted_at: db.serverDate(),
      updated_at: db.serverDate()
    }
  });
  
  return success(null, '删除成功');
}

// 切换企业状态（启用/停用）
async function toggleCompanyStatus(data) {
  const { id, status } = data;
  
  if (!id || !status) {
    return error(400, '企业ID和状态不能为空');
  }
  
  if (!['active', 'paused', 'terminated'].includes(status)) {
    return error(400, '状态值不合法');
  }
  
  await db.collection('companies').doc(id).update({
    data: {
      status,
      updated_at: db.serverDate()
    }
  });
  
  return success(null, `企业状态已更新为${status === 'active' ? '合作中' : status === 'paused' ? '暂停合作' : '终止合作'}`);
}

// 获取企业统计信息
async function getCompanyStats(id) {
  const [jobsCount, employeeCount, applicationsCount] = await Promise.all([
    db.collection('jobs').where({ company_id: id, is_deleted: false }).count(),
    countCompanyEmployees(id, { activeOnly: false }),
    db.collection('applications').where({ company_id: id }).count()
  ]);
  
  return success({
    jobs: jobsCount.total,
    employees: employeeCount,
    applications: applicationsCount.total
  });
}
