/**
 * 员工档案管理（最小可用）
 * 支持：创建、更新、查询、列表
 * 说明：文件上传/下载在正式环境需接入对象存储，这里仅占位返回 file_id/url
 */
const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();

function success(data = null, message = 'success') {
  return { code: 0, message, data };
}
function error(code = 1, message = 'error', data = null) {
  return { code, message, data };
}

exports.main = async (event, context) => {
  const { action } = event;
  try {
    switch (action) {
      case 'create':
        return await createArchive(event);
      case 'get':
        return await getArchive(event);
      case 'update':
        return await updateArchive(event);
      case 'list':
        return await listArchives(event);
      case 'upload-document':
        return await uploadDocument(event);
      case 'download-document':
        return await downloadDocument(event);
      case 'transfer':
        return await transferArchive(event);
      default:
        return error(400, 'unknown action');
    }
  } catch (err) {
    console.error('[archives] error:', err);
    return error(500, err.message || '服务器错误');
  }
};

async function createArchive(data) {
  const { employee_id, files = [], meta = {} } = data;
  if (!employee_id) return error(400, '缺少 employee_id');
  const res = await db.collection('archives').add({
    data: {
      employee_id,
      files,
      meta,
      status: 'active',
      created_at: db.serverDate(),
      updated_at: db.serverDate()
    }
  });
  return success({ id: res.id }, '档案创建成功');
}

async function getArchive({ id }) {
  if (!id) return error(400, '缺少档案ID');
  const res = await db.collection('archives').doc(id).get();
  if (!res.data) return error(404, '档案不存在');
  return success(res.data);
}

async function updateArchive({ id, meta, files }) {
  if (!id) return error(400, '缺少档案ID');
  const payload = { updated_at: db.serverDate() };
  if (meta) payload.meta = meta;
  if (files) payload.files = files;
  await db.collection('archives').doc(id).update({ data: payload });
  return success(null, '更新成功');
}

async function listArchives({ employee_id, page = 1, pageSize = 20 } = {}) {
  let query = db.collection('archives');
  if (employee_id) query = query.where({ employee_id });
  const skip = (page - 1) * pageSize;
  const [countRes, listRes] = await Promise.all([
    query.count(),
    query.orderBy('created_at', 'desc').skip(skip).limit(pageSize).get()
  ]);
  return success({ list: listRes.data || [], total: countRes.total || 0, page, pageSize });
}

// 占位：文件上传/下载需接入对象存储
async function uploadDocument({ archive_id, filename }) {
  if (!archive_id) return error(400, '缺少 archive_id');
  const fileId = `file_${Date.now()}`;
  await db.collection('archives').doc(archive_id).update({
    data: {
      files: db.command.push({ id: fileId, name: filename || 'document', uploaded_at: db.serverDate() }),
      updated_at: db.serverDate()
    }
  });
  return success({ file_id: fileId }, '上传记录已保存');
}

async function downloadDocument({ file_id }) {
  if (!file_id) return error(400, '缺少 file_id');
  // 返回占位下载链接
  return success({ url: `https://example.com/download/${file_id}` }, '已生成下载链接');
}

async function transferArchive({ id, status }) {
  if (!id) return error(400, '缺少档案ID');
  await db.collection('archives').doc(id).update({
    data: {
      status: status || 'archived',
      updated_at: db.serverDate()
    }
  });
  return success(null, '档案状态已更新');
}
