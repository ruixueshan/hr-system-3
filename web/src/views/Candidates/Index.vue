<template>
  <div class="candidates-page">
    <el-card class="search-card">
      <div class="toolbar-row">
        <el-radio-group v-model="scope" @change="handleSearch">
          <el-radio-button v-for="opt in filteredScopeOptions" :key="opt.value" :label="opt.value">{{ opt.label }}</el-radio-button>
        </el-radio-group>
        <div class="toolbar-actions">
          <el-button type="success" @click="openImport">导入候选人</el-button>
        </div>
      </div>
      <el-form :model="searchForm" inline>
        <el-form-item label="关键词">
          <el-input v-model="searchForm.keyword" placeholder="姓名 / 手机号" clearable style="width: 220px;" />
        </el-form-item>
        <el-form-item>
          <el-button type="primary" @click="handleSearch">搜索</el-button>
          <el-button @click="handleReset">重置</el-button>
        </el-form-item>
      </el-form>
    </el-card>

    <el-card>
      <el-table v-loading="loading" :data="tableData" stripe>
        <el-table-column prop="name" label="候选人" min-width="160">
          <template #default="{ row }">
            <div>{{ row.name }}</div>
            <div class="text-muted">{{ row.phone || '-' }}</div>
          </template>
        </el-table-column>
        <el-table-column prop="latest_job_name" label="当前岗位" min-width="220">
          <template #default="{ row }">
            <div>{{ row.latest_job_name || '-' }}</div>
            <div class="text-muted">{{ row.latest_company_name || '-' }}</div>
          </template>
        </el-table-column>
        <el-table-column prop="source" label="来源" width="100">
          <template #default="{ row }">{{ getSourceText(row.source || 'unknown') }}</template>
        </el-table-column>
        <el-table-column prop="owner_name" label="当前归属" width="150">
          <template #default="{ row }">
            <el-tag :type="row.ownership_status === 'public' ? 'info' : 'success'">
              {{ getOwnershipText(row) }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="business_status" label="业务阶段" width="120">
          <template #default="{ row }">
            <el-tag :type="getBusinessType(row.business_status)">{{ getBusinessText(row.business_status) }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="last_action_at" label="最后推进" width="190">
          <template #default="{ row }"><BeijingDateTime :value="row.last_action_at || row.created_at" format="YYYY-MM-DD HH:mm:ss" /></template>
        </el-table-column>
        <el-table-column prop="owner_expire_at" label="回收时间" width="190">
          <template #default="{ row }">
            <span v-if="row.ownership_status === 'public'">-</span>
            <BeijingDateTime v-else :value="row.owner_expire_at" format="YYYY-MM-DD HH:mm:ss" />
          </template>
        </el-table-column>
        <el-table-column label="操作" width="300" fixed="right">
          <template #default="{ row }">
            <el-button link type="primary" @click="handleView(row)">详情</el-button>
            <el-button link type="primary" @click="handleFollow(row)">跟进</el-button>
            <el-button link type="success" @click="handleInterview(row)">安排面试</el-button>
            <el-button v-if="row.ownership_status === 'public'" link type="warning" @click="handleClaim(row)">领取</el-button>
            <el-button v-else-if="row.owner_id === currentUser.id" link type="info" @click="handleMoveToPublic(row)">放回公海</el-button>
          </template>
        </el-table-column>
      </el-table>

      <div class="pagination-wrapper">
        <el-pagination
          v-model:current-page="pagination.page"
          v-model:page-size="pagination.pageSize"
          :total="pagination.total"
          :page-sizes="[10, 20, 50, 100]"
          layout="total, sizes, prev, pager, next, jumper"
          @size-change="onSizeChange"
          @current-change="onCurrentChange"
        />
      </div>
    </el-card>

    <el-dialog v-model="detailVisible" :title="`候选人详情 - ${detailData.profile?.name || ''}`" width="860px">
      <div class="detail-grid">
        <el-card shadow="never">
          <template #header>当前归属</template>
          <div class="detail-line"><span>手机号：</span>{{ detailData.profile?.phone || '-' }}</div>
          <div class="detail-line"><span>当前归属：</span>{{ getOwnershipText(detailData.profile) }}</div>
          <div class="detail-line"><span>推荐来源：</span>{{ detailData.profile?.source_referrer_name || '-' }}</div>
          <div class="detail-line"><span>最后推进：</span><BeijingDateTime :value="detailData.profile?.last_action_at" format="YYYY-MM-DD HH:mm:ss" /></div>
          <div class="detail-line">
            <span>回收时间：</span>
            <span v-if="detailData.profile?.ownership_status === 'public'">-</span>
            <BeijingDateTime v-else :value="detailData.profile?.owner_expire_at" format="YYYY-MM-DD HH:mm:ss" />
          </div>
        </el-card>

        <el-card shadow="never">
          <template #header>工人自填信息</template>
          <el-table :data="userInfoTableData" size="small" :show-header="false">
            <el-table-column prop="label" width="100">
              <template #default="{ row }"><span class="info-label">{{ row.label }}</span></template>
            </el-table-column>
            <el-table-column prop="value">
              <template #default="{ row }">{{ row.value || '-' }}</template>
            </el-table-column>
          </el-table>
        </el-card>
      </div>

      <el-card shadow="never" class="detail-section">
        <template #header>
          <div class="remark-header">
            <span>HR 备注</span>
            <el-button type="primary" link @click="openAddRemark">新增备注</el-button>
          </div>
        </template>
        <el-table :data="allRemarks" size="small" stripe>
          <el-table-column prop="category" label="分类" width="100">
            <template #default="{ row }">
              <el-tag size="small">{{ getCategoryLabel(row.category) }}</el-tag>
            </template>
          </el-table-column>
          <el-table-column prop="content" label="备注内容" min-width="200" />
          <el-table-column prop="created_by_name" label="创建人" width="100" />
          <el-table-column prop="created_at" label="创建时间" width="190">
            <template #default="{ row }"><BeijingDateTime :value="row.created_at" format="YYYY-MM-DD HH:mm:ss" /></template>
          </el-table-column>
          <el-table-column label="操作" width="80" fixed="right">
            <template #default="{ row }">
              <el-button link type="primary" size="small" @click="openEditRemark(row.category, row)">编辑</el-button>
            </template>
          </el-table-column>
        </el-table>
      </el-card>

      <el-card shadow="never" class="detail-section">
        <template #header>动作记录</template>
        <el-empty v-if="!detailData.action_logs.length" description="暂无动作记录" />
        <el-timeline v-else>
          <el-timeline-item v-for="item in detailData.action_logs" :key="item._id || item.created_at_ts" :timestamp="formatDate(item.created_at || item.created_at_ts || '-', 'YYYY-MM-DD HH:mm:ss')">
            <div>{{ getActionText(item.action_type) }}</div>
            <div class="text-muted">{{ item.remark || '-' }}</div>
            <div class="text-muted">{{ item.operator_name || '系统' }}</div>
          </el-timeline-item>
        </el-timeline>
      </el-card>

      <el-card shadow="never" class="detail-section">
        <template #header>报名记录</template>
        <el-table :data="detailData.applications" size="small" stripe>
          <el-table-column prop="created_at" label="报名时间" width="190">
            <template #default="{ row }"><BeijingDateTime :value="row.created_at || row.apply_time" format="YYYY-MM-DD HH:mm:ss" /></template>
          </el-table-column>
          <el-table-column prop="job_name" label="岗位" min-width="180" />
          <el-table-column prop="company_name" label="企业" min-width="160" />
          <el-table-column prop="status" label="状态" width="120">
            <template #default="{ row }">
              <el-tag :type="getApplicationType(row.status)">{{ getApplicationText(row.status) }}</el-tag>
            </template>
          </el-table-column>
          <el-table-column prop="source" label="来源" width="100">
            <template #default="{ row }">{{ getSourceText(row.source || 'unknown') }}</template>
          </el-table-column>
        </el-table>
      </el-card>
    </el-dialog>

    <el-dialog v-model="followVisible" title="新增跟进" width="520px">
      <el-form :model="followForm" label-width="90px">
        <el-form-item label="候选人">
          <span>{{ currentCandidate?.name || '-' }}</span>
        </el-form-item>
        <el-form-item label="联系内容" required>
          <el-input v-model="followForm.remark" type="textarea" :rows="5" placeholder="填写跟进内容、岗位推进、沟通结果" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="followVisible = false">取消</el-button>
        <el-button type="primary" :loading="followSubmitting" @click="submitFollow">保存</el-button>
      </template>
    </el-dialog>

    <el-dialog v-model="interviewVisible" title="安排面试" width="560px">
      <el-form :model="interviewForm" label-width="100px">
        <el-form-item label="候选人">
          <span>{{ currentCandidate?.name || '-' }}</span>
        </el-form-item>
        <el-form-item label="面试岗位">
          <el-select v-model="interviewForm.job_id" placeholder="选择岗位" filterable clearable>
            <el-option
              v-for="job in jobsOptions"
              :key="job._id"
              :label="`${job.position || job.job_name}（${job.company_name || '未分配企业'}）`"
              :value="job._id"
            />
          </el-select>
        </el-form-item>
        <el-form-item label="面试时间" required>
          <el-date-picker v-model="interviewForm.interview_time" type="datetime" value-format="YYYY-MM-DD HH:mm:ss" placeholder="选择面试时间" />
        </el-form-item>
        <el-form-item label="备注">
          <el-input v-model="interviewForm.remark" type="textarea" :rows="3" placeholder="地点、面试官、说明" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="interviewVisible = false">取消</el-button>
        <el-button type="primary" :loading="interviewSubmitting" @click="submitInterview">保存</el-button>
      </template>
    </el-dialog>

    <el-dialog v-model="importVisible" title="导入候选人" width="720px" @closed="resetImportState">
      <p>支持 .xlsx。手机号必填，其他字段可选。</p>
      <div class="import-actions">
        <el-button type="primary" link @click="downloadTemplate">下载模板</el-button>
        <el-button v-if="importErrors.length" type="danger" link @click="downloadImportErrors">下载错误清单</el-button>
      </div>
      <div class="import-upload-area">
        <input
          ref="fileInputRef"
          type="file"
          accept=".xlsx"
          style="display: none"
          @change="handleFileSelect"
        />
        <el-button type="primary" @click="fileInputRef?.click()">选择 Excel 文件</el-button>
        <div class="el-upload__tip">上传文件后先校验，校验通过后再确认导入</div>
      </div>
      <el-alert
        v-if="importFileName"
        class="mt-12"
        :title="`当前文件：${importFileName}`"
        type="info"
        :closable="false"
      />
      <el-alert
        v-if="importValidated"
        class="mt-12"
        :title="`校验完成：通过 ${validatedImportRows.length} 条，失败 ${importErrors.length} 条`"
        :type="importErrors.length ? 'warning' : 'success'"
        :closable="false"
      />
      <el-table v-if="importErrors.length" :data="importErrors.slice(0, 8)" class="mt-12" size="small" border>
        <el-table-column prop="row_no" label="行号" width="70" />
        <el-table-column prop="phone" label="手机号" width="140" />
        <el-table-column prop="name" label="姓名" width="120" />
        <el-table-column prop="reason" label="错误原因" min-width="280" />
      </el-table>
      <template #footer>
        <el-button @click="importVisible = false">关闭</el-button>
        <el-button
          type="primary"
          :disabled="!importValidated || !validatedImportRows.length || !!importErrors.length"
          :loading="importing"
          @click="confirmImport"
        >
          确认导入
        </el-button>
      </template>
    </el-dialog>

    <el-dialog v-model="remarkVisible" :title="editingRemark ? '编辑备注' : '新增备注'" width="480px">
      <el-form :model="remarkForm" label-width="80px">
        <el-form-item label="分类">
          <el-select v-model="remarkForm.category" placeholder="选择分类">
            <el-option v-for="cat in remarkCategoryList" :key="cat.key" :label="cat.label" :value="cat.key" />
          </el-select>
        </el-form-item>
        <el-form-item label="内容" required>
          <el-input v-model="remarkForm.content" type="textarea" :rows="4" placeholder="填写备注内容" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="remarkVisible = false">取消</el-button>
        <el-button type="primary" :loading="remarkSubmitting" @click="submitRemark">保存</el-button>
      </template>
    </el-dialog>

  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue';
import { ElMessage, ElMessageBox } from 'element-plus';

import { candidatesApi } from '@/api/modules/candidates';
import { jobsApi } from '@/api/modules/jobs';
import { interviewsApi } from '@/api/modules/interviews';
import type { Application, CandidateActionLog, CandidateDetail, CandidateRecord, Job } from '@/api/types';
import { formatDate, getSourceText } from '@/utils/format';
import BeijingDateTime from '@/components/common/BeijingDateTime.vue';
import { loadXlsx, readExcelRows } from '@/utils/loadXlsx';
import { usePagination } from '@/composables/usePagination';
import { useTableLoading } from '@/composables/useTableLoading';

const { loading, withLoading } = useTableLoading();
const tableData = ref<CandidateRecord[]>([]);
const detailVisible = ref(false);
const detailData = reactive<CandidateDetail>({
  profile: {} as CandidateRecord,
  user_info: undefined,
  remarks: {},
  applications: [],
  action_logs: [],
  owners: []
});
const followVisible = ref(false);
const followSubmitting = ref(false);
const interviewVisible = ref(false);
const interviewSubmitting = ref(false);
const currentCandidate = ref<CandidateRecord | null>(null);
const jobsOptions = ref<Job[]>([]);
const scope = ref<'mine' | 'public' | 'all'>('mine');
const scopeOptions = [
  { label: '我的候选人', value: 'mine' },
  { label: '公海候选人', value: 'public' },
  { label: '全部候选人', value: 'all' }
];

const searchForm = reactive({
  keyword: ''
});

const { pagination, onSizeChange, onCurrentChange } = usePagination(loadData);

const followForm = reactive({
  remark: ''
});

const interviewForm = reactive({
  application_id: '',
  job_id: '',
  interview_time: '',
  remark: ''
});

const remarkCategoryList = [
  { key: 'skill', label: '技能' },
  { key: 'residence_area', label: '住所地区' },
  { key: 'target_area', label: '意向地区' },
  { key: 'shift_demand', label: '班次诉求' }
];

const activeRemarkCollapse = ref<string[]>([]);
const remarkVisible = ref(false);
const remarkSubmitting = ref(false);
const editingRemark = ref<any>(null);
const remarkForm = reactive({
  category: 'skill' as 'skill' | 'residence_area' | 'target_area' | 'shift_demand',
  content: ''
});

const isUserInfoEmpty = computed(() => {
  const info = detailData.user_info;
  if (!info) return true;
  return !info.gender && !info.id_card && !info.birth_date && !info.education && 
         !info.work_years && !info.current_company && !info.current_position && 
         !info.expected_salary && !info.expected_location && !info.skills && !info.self_introduction;
});

const userInfoTableData = computed(() => {
  const info = detailData.user_info;
  return [
    { label: '性别', value: info?.gender || '' },
    { label: '出生日期', value: info?.birth_date || '' },
    { label: '学历', value: info?.education || '' },
    { label: '期望薪资', value: info?.expected_salary || '' },
    { label: '期望地点', value: info?.expected_location || '' },
    { label: '技能', value: info?.skills || '' }
  ];
});

const allRemarks = computed(() => {
  const remarks = detailData.remarks || {};
  const result: any[] = [];
  for (const category of remarkCategoryList) {
    const items = remarks[category.key] || [];
    for (const item of items) {
      result.push(item);
    }
  }
  if (result.length === 0) {
    return remarkCategoryList.map(cat => ({
      category: cat.key,
      content: '',
      created_by_name: '',
      created_at: ''
    }));
  }
  return result.sort((a, b) => new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime());
});

function getCategoryLabel(category: string) {
  const cat = remarkCategoryList.find(c => c.key === category);
  return cat?.label || category;
}

const importVisible = ref(false);
const importing = ref(false);
const importValidated = ref(false);
const importFileName = ref('');
const validatedImportRows = ref<any[]>([]);
const importErrors = ref<any[]>([]);
const uploadRef = ref();
const fileInputRef = ref<HTMLInputElement | null>(null);

const currentUser = computed(() => {
  try {
    const raw = JSON.parse(localStorage.getItem('hr3_user') || '{}');
    return {
      id: raw.id || raw._id || '',
      name: raw.real_name || raw.name || 'HR',
      role: raw.role || 'hr'
    };
  } catch {
    return { id: '', name: 'HR', role: 'hr' };
  }
});

const canViewAllCandidates = computed(() => {
  const role = currentUser.value.role;
  return role === 'gm' || role === 'deputy';
});

const filteredScopeOptions = computed(() => {
  if (canViewAllCandidates.value) {
    return [
      { label: '我的候选人', value: 'mine' },
      { label: '公海候选人', value: 'public' },
      { label: '全部候选人', value: 'all' }
    ];
  }
  return [
    { label: '我的候选人', value: 'mine' },
    { label: '公海候选人', value: 'public' }
  ];
});

function getOwnershipText(row?: Partial<CandidateRecord>) {
  if (!row) return '-';
  if (row.ownership_status === 'public' || row.owner_type === 'public') return '公海';
  if (row.owner_type === 'referrer') return row.owner_name ? `推荐人：${row.owner_name}` : '推荐人';
  return row.owner_name ? `HR：${row.owner_name}` : '已领取';
}

function getBusinessText(status?: CandidateRecord['business_status']) {
  const map: Record<string, string> = {
    registered: '已注册',
    applied: '已报名',
    interviewing: '面试中',
    passed: '待入职',
    rejected: '未通过',
    cancelled: '已取消',
    onboarded: '已入职'
  };
  return status ? map[status] || status : '-';
}

function getBusinessType(status?: CandidateRecord['business_status']) {
  const map: Record<string, '' | 'success' | 'warning' | 'info' | 'danger'> = {
    registered: 'info',
    applied: 'warning',
    interviewing: '',
    passed: 'success',
    rejected: 'danger',
    cancelled: 'info',
    onboarded: 'success'
  };
  return status ? map[status] || 'info' : 'info';
}

function getActionText(action?: string) {
  const map: Record<string, string> = {
    register: '注册进入系统',
    scan_bind: '扫码绑定推荐人',
    claim: '领取候选人',
    public_pool: '进入公海',
    job_apply: '报名岗位',
    follow_up: '人工跟进',
    interview_schedule: '安排面试',
    interview_result: '更新面试结果',
    onboard: '办理入职',
    application_status: '更新报名状态'
  };
  return map[action || ''] || action || '-';
}

function getApplicationText(status?: string) {
  const map: Record<string, string> = {
    pending: '待联系',
    contacted: '已联系',
    interview: '面试中',
    passed: '已通过',
    rejected: '未通过',
    cancelled: '已取消'
  };
  return status ? map[status] || status : '-';
}

function getApplicationType(status?: string) {
  const map: Record<string, '' | 'success' | 'warning' | 'info' | 'danger'> = {
    pending: 'warning',
    contacted: '',
    interview: '',
    passed: 'success',
    rejected: 'danger',
    cancelled: 'info'
  };
  return status ? map[status] || 'info' : 'info';
}

async function loadData() {
  await withLoading(async () => {
    const result = await candidatesApi.getList({
      scope: scope.value,
      owner_id: currentUser.value.id,
      keyword: searchForm.keyword || '',
      page: pagination.page,
      pageSize: pagination.pageSize
    });
    tableData.value = result.list || [];
    pagination.total = result.total || 0;
  });
}

async function loadJobsOptions() {
  try {
    const res = await jobsApi.getList({ page: 1, pageSize: 200, status: 'active' });
    jobsOptions.value = res.list || [];
  } catch (err) {
    console.warn('加载岗位失败:', err);
  }
}

function handleSearch() {
  pagination.page = 1;
  loadData();
}

function handleReset() {
  searchForm.keyword = '';
  handleSearch();
}

async function handleView(row: CandidateRecord) {
  currentCandidate.value = row;
  try {
    const detail = await candidatesApi.getDetail(row._id);
    detailData.profile = detail.profile;
    detailData.user_info = detail.user_info;
    detailData.remarks = detail.remarks || {};
    detailData.applications = detail.applications || [];
    detailData.action_logs = detail.action_logs || [];
    detailData.owners = detail.owners || [];
    detailVisible.value = true;
  } catch (err: any) {
    ElMessage.error(err?.message || '加载详情失败');
  }
}

function handleFollow(row: CandidateRecord) {
  currentCandidate.value = row;
  followForm.remark = '';
  followVisible.value = true;
}

function handleInterview(row: CandidateRecord) {
  currentCandidate.value = row;
  interviewForm.application_id = row.latest_application_id || '';
  interviewForm.job_id = row.latest_job_id || '';
  interviewForm.interview_time = '';
  interviewForm.remark = '';
  interviewVisible.value = true;
}

async function handleClaim(row: CandidateRecord) {
  try {
    await candidatesApi.claim(row._id, currentUser.value);
    ElMessage.success('领取成功');
    loadData();
  } catch (err: any) {
    ElMessage.error(err?.message || '领取失败');
  }
}

async function handleMoveToPublic(row: CandidateRecord) {
  try {
    await ElMessageBox.confirm('确认将该候选人放回公海？', '提示', { type: 'warning' });
    await candidatesApi.moveToPublic(row._id, currentUser.value);
    ElMessage.success('已放回公海');
    loadData();
  } catch (err: any) {
    if (err !== 'cancel') {
      ElMessage.error(err?.message || '操作失败');
    }
  }
}

async function submitFollow() {
  if (!currentCandidate.value?._id) return;
  if (!followForm.remark.trim()) {
    ElMessage.warning('请先填写跟进内容');
    return;
  }

  followSubmitting.value = true;
  try {
    await candidatesApi.recordAction({
      candidate_id: currentCandidate.value._id,
      action_type: 'follow_up',
      operator_id: currentUser.value.id,
      operator_name: currentUser.value.name,
      operator_role: currentUser.value.role,
      related_job_id: currentCandidate.value.latest_job_id || '',
      related_company_id: currentCandidate.value.latest_company_id || '',
      related_application_id: currentCandidate.value.latest_application_id || '',
      remark: followForm.remark.trim()
    } as CandidateActionLog);
    ElMessage.success('跟进已保存');
    followVisible.value = false;
    loadData();
  } catch (err: any) {
    ElMessage.error(err?.message || '保存失败');
  } finally {
    followSubmitting.value = false;
  }
}

async function submitInterview() {
  if (!currentCandidate.value?._id) return;
  if (!interviewForm.interview_time) {
    ElMessage.warning('请选择面试时间');
    return;
  }
  if (!interviewForm.job_id) {
    ElMessage.warning('请选择面试岗位');
    return;
  }

  interviewSubmitting.value = true;
  try {
    const job = jobsOptions.value.find(item => item._id === interviewForm.job_id);
    await interviewsApi.create({
      application_id: interviewForm.application_id || undefined,
      user_id: currentCandidate.value.user_id,
      candidate_name: currentCandidate.value.name,
      phone: currentCandidate.value.phone,
      job_id: interviewForm.job_id,
      company_id: job?.company_id || currentCandidate.value.latest_company_id,
      job_name: job?.position || currentCandidate.value.latest_job_name,
      company_name: job?.company_name || currentCandidate.value.latest_company_name,
      interview_time: interviewForm.interview_time,
      remark: interviewForm.remark,
      operator_id: currentUser.value.id,
      operator_name: currentUser.value.name,
      operator_role: currentUser.value.role
    } as any);
    ElMessage.success('面试已安排');
    interviewVisible.value = false;
    loadData();
  } catch (err: any) {
    ElMessage.error(err?.message || '安排失败');
  } finally {
    interviewSubmitting.value = false;
  }
}

function normalizePhone(value?: string | number | null) {
  return String(value ?? '').replace(/\D/g, '');
}

function openImport() {
  importVisible.value = true;
}

function openAddRemark() {
  editingRemark.value = null;
  remarkForm.category = 'skill';
  remarkForm.content = '';
  remarkVisible.value = true;
}

function openEditRemark(category: string, item: any) {
  if (!item.content) {
    openAddRemark();
    remarkForm.category = category as any;
    return;
  }
  editingRemark.value = item;
  remarkForm.category = category as any;
  remarkForm.content = item.content;
  remarkVisible.value = true;
}

async function submitRemark() {
  if (!currentCandidate.value?._id) return;
  if (!remarkForm.content.trim()) {
    ElMessage.warning('请填写备注内容');
    return;
  }

  remarkSubmitting.value = true;
  try {
    await candidatesApi.saveRemark({
      candidate_id: currentCandidate.value._id,
      category: remarkForm.category,
      content: remarkForm.content.trim(),
      remark_id: editingRemark.value?._id,
      operator_id: currentUser.value.id,
      operator_name: currentUser.value.name,
      operator_role: currentUser.value.role
    });
    ElMessage.success(editingRemark.value ? '备注已更新' : '备注已保存');
    remarkVisible.value = false;
    handleView(currentCandidate.value);
  } catch (err: any) {
    ElMessage.error(err?.message || '保存失败');
  } finally {
    remarkSubmitting.value = false;
  }
}

function resetImportState() {
  importFileName.value = '';
  importValidated.value = false;
  validatedImportRows.value = [];
  importErrors.value = [];
}

function validateImportRows(rows: any[]) {
  const errors: any[] = [];
  const validRows: any[] = [];
  const seenPhones = new Set<string>();
  const batchPhones = new Set<string>();

  rows.forEach((row, index) => {
    const rowNo = index + 2;
    const phone = normalizePhone(row['手机号'] || row['phone']);
    const name = String(row['姓名'] || row['name'] || '').trim();

    if (!phone) {
      errors.push({ row_no: rowNo, phone: row['手机号'] || '', name, reason: '手机号为空' });
      return;
    }

    if (batchPhones.has(phone)) {
      errors.push({ row_no: rowNo, phone, name, reason: '文件内手机号重复' });
      return;
    }
    batchPhones.add(phone);

    const genderValue = row['性别'] || row['gender'];
    let gender: number | undefined;
    if (genderValue !== undefined && genderValue !== null && genderValue !== '') {
      if (genderValue === '男' || genderValue === '1' || genderValue === 1) gender = 1;
      else if (genderValue === '女' || genderValue === '0' || genderValue === 0) gender = 0;
    }

    validRows.push({
      __row_no: rowNo,
      phone,
      name: name || undefined,
      gender,
      id_card: String(row['身份证号'] || row['id_card'] || '').trim() || undefined,
      education: String(row['学历'] || row['education'] || '').trim() || undefined
    });
  });

  return { validRows, errors };
}

function handleFileSelect(event: Event) {
  const target = event.target as HTMLInputElement;
  const file = target.files?.[0];
  if (file) {
    handleImportFile(file);
    target.value = '';
  }
}

async function handleImportFile(file: File) {
  importFileName.value = file.name;
  importValidated.value = false;
  validatedImportRows.value = [];
  importErrors.value = [];
  try {
    const rows = await readExcelRows(file);
    if (!rows.length) {
      ElMessage.warning('文件无数据');
      return false;
    }
    const result = validateImportRows(rows);
    validatedImportRows.value = result.validRows;
    importErrors.value = result.errors;
    importValidated.value = true;
    if (result.errors.length) {
      ElMessage.warning(`校验完成，通过 ${result.validRows.length} 条，失败 ${result.errors.length} 条`);
    } else {
      ElMessage.success(`校验通过，共 ${result.validRows.length} 条，可确认导入`);
    }
  } catch (err: any) {
    console.error('导入校验失败', err);
    ElMessage.error(err?.message || '导入校验失败，请检查模板');
  }
  return false;
}

async function confirmImport() {
  if (!importValidated.value || !validatedImportRows.value.length) {
    ElMessage.warning('请先上传并校验文件');
    return;
  }
  if (importErrors.value.length) {
    ElMessage.error('当前仍有校验失败的数据，请先修正');
    return;
  }

  importing.value = true;
  try {
    const candidates = validatedImportRows.value.map(row => {
      const { __row_no, ...rest } = row;
      return rest;
    });

    const result = await candidatesApi.importCandidates({
      scope: scope.value === 'public' ? 'public' : 'mine',
      owner_id: currentUser.value.id,
      owner_name: currentUser.value.name,
      candidates
    });

    const successCount = Number(result.created || 0) + Number(result.updated || 0);
    const hasErrors = Number(result.total_errors || 0) > 0;

    if (hasErrors) {
      importErrors.value = result.errors;
      ElMessage.warning(`导入完成：新增 ${result.created} 条，更新 ${result.updated} 条，失败 ${result.total_errors} 条`);
      if (successCount > 0) {
        importVisible.value = false;
        await loadData();
      }
    } else {
      ElMessage.success(`导入成功：新增 ${result.created} 条，更新 ${result.updated} 条`);
      importVisible.value = false;
      await loadData();
    }
  } catch (err: any) {
    ElMessage.error(err?.message || '导入失败');
  } finally {
    importing.value = false;
  }
}

async function downloadImportErrors() {
  if (!importErrors.value.length) {
    ElMessage.warning('当前没有错误清单');
    return;
  }
  const XLSX = await loadXlsx();
  const ws = XLSX.utils.json_to_sheet(importErrors.value.map((item) => ({
    行号: item.row_no,
    手机号: item.phone,
    姓名: item.name,
    错误原因: item.reason
  })));
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, '错误清单');
  XLSX.writeFile(wb, '候选人导入错误清单.xlsx');
}

async function downloadTemplate() {
  const XLSX = await loadXlsx();
  const headers = ['手机号', '姓名', '性别', '身份证号', '学历'];
  const example = [{
    手机号: '13800001111',
    姓名: '张三',
    性别: '男',
    身份证号: '110101199001011234',
    学历: '大专'
  }];
  const ws = XLSX.utils.json_to_sheet(example, { header: headers });
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, '模板');
  XLSX.writeFile(wb, '候选人导入模板.xlsx');
}

onMounted(() => {
  loadData();
  loadJobsOptions();
});
</script>

<style scoped lang="scss">
.candidates-page {
  .search-card {
    margin-bottom: 16px;
  }

  .toolbar-row {
    margin-bottom: 12px;
    display: flex;
    align-items: center;
    gap: 16px;
  }

  .toolbar-actions {
    margin-left: auto;
  }

  .pagination-wrapper {
    margin-top: 16px;
    display: flex;
    justify-content: flex-end;
  }

  .detail-grid {
    display: grid;
    grid-template-columns: 320px 1fr;
    gap: 16px;
    margin-bottom: 16px;
  }

  .detail-section {
    margin-top: 8px;
  }

  .detail-line {
    line-height: 28px;
  }

  .detail-line span {
    color: #909399;
  }

  .text-muted {
    color: #909399;
    font-size: 12px;
    margin-top: 4px;
  }
}

.import-actions {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 12px;
}

.import-upload-area {
  padding: 24px;
  border: 1px dashed #dcdfe6;
  border-radius: 8px;
  text-align: center;
  background: #fafafa;
}

.mt-12 {
  margin-top: 12px;
}

.remark-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.info-label {
  color: #909399;
}
</style>
