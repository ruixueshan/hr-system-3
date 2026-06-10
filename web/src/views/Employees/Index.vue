<template>
  <div class="employees-page">
    <el-card class="search-card">
      <el-form :model="searchForm" inline>
        <el-form-item label="姓名/手机号">
          <el-input v-model="searchForm.name" placeholder="搜索姓名" clearable />
        </el-form-item>
        <el-form-item label="状态" style="min-width: 220px;">
          <el-select v-model="searchForm.status" placeholder="选择状态" clearable style="width: 180px;">
            <el-option label="在职" value="active" />
            <el-option label="待离职" value="pending_resign" />
            <el-option label="已离职" value="resigned" />
          </el-select>
        </el-form-item>
        <el-form-item label="企业" style="min-width: 260px;">
          <CompanySelect v-model="searchForm.company_id" width="220px" />
        </el-form-item>
        <el-form-item v-if="!isHrSpecialist" label="推荐人" style="min-width: 240px;">
          <el-select v-model="searchForm.referrer_id" placeholder="选择推荐人" clearable filterable style="width: 200px;">
            <el-option v-for="u in hrUsers" :key="u._id" :label="u.name || u.real_name || u.phone" :value="u._id" />
          </el-select>
        </el-form-item>
        <el-form-item label="签约" style="min-width: 180px;">
          <el-select v-model="searchForm.contract_status" placeholder="签约状态" clearable style="width: 140px;">
            <el-option label="已签约" value="signed" />
            <el-option label="未签约" value="unsigned" />
          </el-select>
        </el-form-item>
        <el-form-item>
          <el-button type="primary" @click="handleSearch">搜索</el-button>
          <el-button @click="handleReset">重置</el-button>
        </el-form-item>
      </el-form>
    </el-card>

    <div class="toolbar">
      <el-button type="primary" :icon="Plus" @click="openAdd">入职登记</el-button>
      <el-button type="success" :icon="UploadFilled" @click="importVisible = true">入职导入</el-button>
      <el-button type="danger" plain :disabled="selectedRows.length === 0" @click="openBatchResign">批量离职</el-button>
      <el-button v-if="!isHrSpecialist" type="warning" @click="openNoReferrer">无推荐人</el-button>
      <el-button :icon="Download" @click="handleExport">导出花名册</el-button>
    </div>

    <el-card>
  <el-table v-loading="loading" :data="tableData" stripe @selection-change="handleSelectionChange">
    <el-table-column type="selection" width="44" />
    <el-table-column prop="employee_no" label="工号" width="160" />
    <el-table-column prop="name" label="姓名" width="120" />
  <el-table-column prop="phone" label="手机号" width="140" />
  <el-table-column prop="id_card" label="身份证号" min-width="180" />
  <el-table-column prop="referrer_name" label="推荐人" min-width="120" />
  <el-table-column prop="job_name" label="岗位" min-width="150" />
  <el-table-column prop="company_name" label="所属企业" min-width="150" />
  <el-table-column prop="settlement_mode" label="结算方式" width="100">
    <template #default="{ row }">{{ getSettlementModeText(row.settlement_mode) }}</template>
  </el-table-column>
  <el-table-column prop="join_date" label="入职日期" width="140" />
        <el-table-column prop="leave_date" label="离职日期" width="140" />
        <el-table-column prop="contract_status" label="签约状态" width="100">
          <template #default="{ row }">
            <el-tag :type="getContractStatusType(row.contract_status)" size="small">
              {{ getContractStatusText(row.contract_status) }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="contract_no" label="合同编号" min-width="170" show-overflow-tooltip>
          <template #default="{ row }">{{ row.contract_no || '-' }}</template>
        </el-table-column>
        <el-table-column label="状态" width="100">
          <template #default="{ row }">
            <StatusTag :status="row.employment_status" :map="EMPLOYMENT_STATUS_MAP" />
          </template>
        </el-table-column>
        <el-table-column label="操作" width="230" fixed="right">
          <template #default="{ row }">
            <el-button link type="primary" @click="handleView(row)">详情</el-button>
            <el-button link type="primary" @click="handleEdit(row)">编辑</el-button>
            <el-button
              v-if="row.relation_id && row.contract_status !== 'signed'"
              link
              type="success"
              :loading="signingRelationId === (row.relation_id || row._id)"
              @click="handleSign(row)"
            >
              签约
            </el-button>
            <el-button link type="danger" @click="handleResign(row)">离职</el-button>
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

    <el-dialog v-model="detailVisible" title="在职详情" width="520px">
      <div class="detail-grid">
        <div><strong>姓名：</strong>{{ detailData.name || '-' }}</div>
        <div><strong>手机号：</strong>{{ detailData.phone || '-' }}</div>
        <div><strong>工号：</strong>{{ detailData.employee_no || '-' }}</div>
        <div><strong>身份证号：</strong>{{ detailData.id_card || '-' }}</div>
        <div><strong>推荐人：</strong>{{ detailData.referrer_name || '-' }}</div>
        <div><strong>企业：</strong>{{ detailData.company_name || '-' }}</div>
        <div><strong>岗位：</strong>{{ detailData.job_name || '-' }}</div>
        <div><strong>结算方式：</strong>{{ getSettlementModeText(detailData.settlement_mode) }}</div>
        <div><strong>入职日期：</strong>{{ detailData.join_date || '-' }}</div>
        <div><strong>离职日期：</strong>{{ detailData.leave_date || '-' }}</div>
        <div><strong>签约状态：</strong>{{ getContractStatusText(detailData.contract_status) }}</div>
        <div><strong>合同编号：</strong>{{ detailData.contract_no || '-' }}</div>
        <div><strong>状态：</strong>{{ getEmploymentStatusText(detailData.employment_status) }}</div>
      </div>
      <template #footer>
        <el-button @click="detailVisible = false">关闭</el-button>
      </template>
    </el-dialog>

    <el-dialog v-model="editVisible" title="编辑在职关系" width="520px">
      <el-form :model="editForm" label-width="100px">
        <el-form-item label="姓名">
          <el-input v-model="editForm.name" placeholder="请输入姓名" />
        </el-form-item>
        <el-form-item label="手机号">
          <el-input v-model="editForm.phone" placeholder="请输入手机号" />
        </el-form-item>
        <el-form-item label="身份证号">
          <el-input v-model="editForm.id_card" placeholder="请输入身份证号" />
        </el-form-item>
        <el-form-item label="所属企业">
          <CompanySelect v-model="editForm.company_id" @change="handleCompanyChange('edit')" />
        </el-form-item>
        <el-form-item label="岗位">
          <el-select v-model="editForm.job_id" placeholder="选择岗位" filterable clearable>
            <el-option v-for="j in editFilteredJobs" :key="j._id" :label="j.position" :value="j._id" />
          </el-select>
        </el-form-item>
        <el-form-item label="推荐人">
          <el-select v-model="editForm.referrer_id" placeholder="选择推荐人" filterable clearable @change="handleReferrerChange('edit')">
            <el-option v-for="u in hrUsers" :key="u._id" :label="u.name" :value="u._id" />
          </el-select>
        </el-form-item>
        <el-form-item label="工价方案">
          <el-select v-model="editForm.rate_plan_id" placeholder="选择工价方案" clearable filterable>
            <el-option v-for="plan in editFilteredRatePlans" :key="plan._id" :label="plan.name" :value="plan._id" />
          </el-select>
        </el-form-item>
        <el-form-item label="结算方式">
          <el-radio-group v-model="editForm.settlement_mode">
            <el-radio label="daily">日结</el-radio>
            <el-radio label="monthly">月结</el-radio>
          </el-radio-group>
        </el-form-item>
        <el-form-item label="入职日期">
          <el-date-picker v-model="editForm.join_date" type="date" value-format="YYYY-MM-DD" placeholder="选择入职日期" />
        </el-form-item>
        <el-form-item label="离职日期">
          <el-date-picker v-model="editForm.leave_date" type="date" value-format="YYYY-MM-DD" placeholder="选择离职日期" clearable />
        </el-form-item>
        <el-form-item label="状态">
          <el-select v-model="editForm.status" style="width: 160px;">
            <el-option label="试用期" value="probation" />
            <el-option label="正式员工" value="regular" />
            <el-option label="已离职" value="resigned" />
          </el-select>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button :disabled="editSaving" @click="editVisible = false">取消</el-button>
        <el-button type="primary" :loading="editSaving" @click="saveEdit">保存</el-button>
      </template>
    </el-dialog>

    <el-dialog v-model="resignVisible" title="办理离职" width="420px">
      <el-form :model="resignForm" label-width="100px">
        <el-form-item label="员工姓名">
          <el-input :model-value="resignForm.name" disabled />
        </el-form-item>
        <el-form-item label="离职日期">
          <el-date-picker
            v-model="resignForm.leave_date"
            type="date"
            value-format="YYYY-MM-DD"
            placeholder="选择离职日期"
          />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button :disabled="resignSaving" @click="resignVisible = false">取消</el-button>
        <el-button type="danger" :loading="resignSaving" @click="saveResign">保存</el-button>
      </template>
    </el-dialog>

    <el-dialog v-model="batchResignVisible" title="批量离职" width="460px">
      <el-form :model="batchResignForm" label-width="100px">
        <el-form-item label="已选人数">
          <el-input :model-value="`${selectedRows.length} 人`" disabled />
        </el-form-item>
        <el-form-item label="离职日期">
          <el-date-picker
            v-model="batchResignForm.leave_date"
            type="date"
            value-format="YYYY-MM-DD"
            placeholder="选择离职日期"
          />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button :disabled="batchResignSaving" @click="batchResignVisible = false">取消</el-button>
        <el-button type="danger" :loading="batchResignSaving" @click="saveBatchResign">确认批量离职</el-button>
      </template>
    </el-dialog>

    <el-dialog v-model="addVisible" title="入职登记" width="520px">
      <el-form :model="addForm" label-width="100px">
        <el-form-item label="姓名">
          <el-input v-model="addForm.name" placeholder="请输入姓名" />
        </el-form-item>
        <el-form-item label="手机号">
          <el-input v-model="addForm.phone" placeholder="请输入手机号" />
        </el-form-item>
        <el-form-item label="身份证号">
          <el-input v-model="addForm.id_card" placeholder="请输入身份证号" />
        </el-form-item>
        <el-form-item label="推荐人">
          <el-select v-model="addForm.referrer_id" placeholder="选择推荐人" filterable clearable @change="handleReferrerChange('add')">
            <el-option v-for="u in hrUsers" :key="u._id" :label="u.name" :value="u._id" />
          </el-select>
        </el-form-item>
        <el-form-item label="所属企业">
          <CompanySelect v-model="addForm.company_id" @change="handleCompanyChange('add')" />
        </el-form-item>
        <el-form-item label="岗位">
          <el-select v-model="addForm.job_id" placeholder="选择岗位" filterable clearable>
            <el-option v-for="j in filteredJobs" :key="j._id" :label="j.position" :value="j._id" />
          </el-select>
        </el-form-item>
        <el-form-item label="工价方案">
          <el-select v-model="addForm.rate_plan_id" placeholder="选择工价方案" filterable clearable>
            <el-option v-for="p in filteredRatePlans" :key="p._id" :label="p.name" :value="p._id" />
          </el-select>
        </el-form-item>
        <el-form-item label="结算方式">
          <el-radio-group v-model="addForm.settlement_mode">
            <el-radio label="daily">日结</el-radio>
            <el-radio label="monthly">月结</el-radio>
          </el-radio-group>
        </el-form-item>
        <el-form-item label="入职日期">
          <el-date-picker v-model="addForm.join_date" type="date" value-format="YYYY-MM-DD" placeholder="选择日期" />
        </el-form-item>
        <el-form-item label="状态">
          <el-select v-model="addForm.status" style="width: 160px;">
            <el-option label="试用期" value="probation" />
            <el-option label="正式员工" value="regular" />
          </el-select>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="addVisible = false">取消</el-button>
        <el-button type="primary" :loading="addSubmitting" @click="saveAdd">保存</el-button>
      </template>
    </el-dialog>

    <el-dialog v-model="importVisible" title="入职导入" width="720px" @closed="resetImportState">
      <p>支持 .xlsx。导入仅认稳定标识：企业编码/企业ID、岗位编码/岗位ID、推荐人ID/推荐人手机号；不再接受名称匹配。</p>
      <div class="import-actions">
        <el-button type="primary" link @click="downloadTemplate">下载模板</el-button>
        <el-button v-if="importErrors.length" type="danger" link @click="downloadImportErrors">下载错误清单</el-button>
      </div>
      <el-upload
        ref="importUploadRef"
        drag
        accept=".xlsx"
        :auto-upload="false"
        :limit="1"
        :on-change="handleImportChange"
        :on-exceed="handleImportExceed"
        :show-file-list="false"
      >
        <el-icon class="el-icon--upload"><UploadFilled /></el-icon>
        <div class="el-upload__text">上传文件后先校验，校验通过后再确认导入</div>
      </el-upload>
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
        <el-table-column prop="employee_name" label="姓名" width="120" />
        <el-table-column prop="employee_no" label="工号" width="160" />
        <el-table-column prop="reason" label="错误原因" min-width="280" />
      </el-table>
      <template #footer>
        <el-button @click="importVisible = false">关闭</el-button>
        <el-button
          type="primary"
          :disabled="!importValidated || !validatedImportRows.length"
          :loading="importing"
          @click="confirmImport"
        >
          确认导入有效数据
        </el-button>
      </template>
    </el-dialog>

    <el-dialog v-model="noReferrerVisible" title="无推荐人在职记录 - 批量绑定" width="900px">
      <div style="display: flex; align-items: center; gap: 12px; margin-bottom: 12px;">
        <CompanySelect v-model="noReferrerCompanyFilter" placeholder="筛选企业" width="220px" @change="loadNoReferrerData" />
        <el-select v-model="noReferrerStatusFilter" placeholder="在职状态" style="width: 140px;" @change="loadNoReferrerData">
          <el-option label="在职" value="active" />
          <el-option label="待离职" value="pending_resign" />
          <el-option label="已离职" value="resigned" />
        </el-select>
        <span style="color: #999; font-size: 13px;">共 {{ noReferrerTotal }} 条无推荐人关系，已选 {{ noReferrerSelection.length }} 条</span>
        <div style="flex: 1;" />
        <el-select v-model="batchReferrerId" placeholder="选择推荐人" filterable clearable style="width: 200px;">
          <el-option v-for="u in hrUsers" :key="u._id" :label="u.name" :value="u._id" />
        </el-select>
        <el-button type="primary" :disabled="!noReferrerSelection.length || !batchReferrerId" :loading="batchBinding" @click="batchBindReferrer">批量绑定</el-button>
      </div>
      <el-table v-loading="noReferrerLoading" :data="noReferrerList" stripe max-height="480" @selection-change="handleNoReferrerSelect">
        <el-table-column type="selection" width="45" />
        <el-table-column prop="employee_no" label="工号" width="160" />
        <el-table-column prop="name" label="姓名" width="100" />
        <el-table-column prop="phone" label="手机号" width="130" />
        <el-table-column prop="company_name" label="企业" min-width="140" />
        <el-table-column prop="job_name" label="岗位" min-width="130" />
        <el-table-column prop="join_date" label="入职日期" width="120">
          <template #default="{ row }">{{ formatDate(row.join_date || row.created_at) }}</template>
        </el-table-column>
        <el-table-column label="状态" width="90">
          <template #default="{ row }">
            <StatusTag :status="row.employment_status" :map="EMPLOYMENT_STATUS_MAP" size="small" />
          </template>
        </el-table-column>
      </el-table>
      <template #footer>
        <el-button @click="noReferrerVisible = false">关闭</el-button>
      </template>
    </el-dialog>

  </div>
</template>

<script setup lang="ts">
import { ref, reactive, onMounted, computed } from 'vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import type { UploadFile, UploadFiles, UploadInstance, UploadRawFile } from 'element-plus';
import { Plus, Download, UploadFilled } from '@element-plus/icons-vue';
import { getDatabase } from '@/api/cloud';
import { employeesApi } from '@/api/modules/employees';
import { companiesApi } from '@/api/modules/companies';
import { jobsApi } from '@/api/modules/jobs';
import { ratePlansApi } from '@/api/modules/ratePlans';
import { usersApi } from '@/api/modules/users';
import { useAuthStore } from '@/stores/auth.store';
import { useUserStore } from '@/stores/user.store';
import type { Employee, Company } from '@/api/types';
import { formatDate as formatDateUtil } from '@/utils/format';
import { loadXlsx, readExcelRows } from '@/utils/loadXlsx';
import { isValidReferrerUser, normalizeReferrerUsers } from '@/utils/referrerUsers';
import { getEmploymentStatusText, getEmploymentStatusType, EMPLOYMENT_STATUS_MAP } from '@/utils/status';
import { usePagination } from '@/composables/usePagination';
import { normalizeText, normalizePhone, normalizeIdCard, normalizeDate, fetchAllDocs } from '@/utils/db-helper';

const authStore = useAuthStore();
const userStore = useUserStore();
const loading = ref(false);
const signingRelationId = ref('');
const authReady = ref(false);
const companies = ref<Company[]>([]);
const jobs = ref<any[]>([]);
const hrUsers = ref<any[]>([]);
const tableData = ref<Employee[]>([]);
const selectedRows = ref<Employee[]>([]);
const detailVisible = ref(false);
const detailData = ref<Partial<Employee>>({});
const editVisible = ref(false);
const editSaving = ref(false);
const resignVisible = ref(false);
const resignSaving = ref(false);
const batchResignVisible = ref(false);
const batchResignSaving = ref(false);
const ratePlans = ref<any[]>([]);
const editForm = reactive<Partial<Employee>>({
  _id: '',
  relation_id: '',
  employee_id: '',
  name: '',
  phone: '',
  id_card: '',
  company_id: '',
  company_name: '',
  job_id: '',
  job_name: '',
  referrer_id: '',
  referrer_name: '',
  rate_plan_id: '',
  settlement_mode: 'daily',
  join_date: '',
  leave_date: '',
  status: 'probation'
});
const resignForm = reactive<{ _id: string; employee_id: string; relation_id: string; name: string; leave_date: string }>({
  _id: '',
  employee_id: '',
  relation_id: '',
  name: '',
  leave_date: ''
});
const batchResignForm = reactive<{ leave_date: string }>({
  leave_date: ''
});

const searchForm = reactive({
  name: '',
  status: '',
  company_id: '',
  referrer_id: '',
  contract_status: ''
});

// 入职登记表单
const addVisible = ref(false);
const addForm = reactive<Partial<Employee>>({
  name: '',
  phone: '',
  id_card: '',
  referrer_name: '',
  referrer_id: '',
  company_id: '',
  job_id: '',
  job_name: '',
  rate_plan_id: '',
  settlement_mode: 'daily',
  join_date: '',
  status: 'probation'
});
const addSubmitting = ref(false);

const filteredRatePlans = computed(() => {
  if (!addForm.company_id) return ratePlans.value;
  return ratePlans.value.filter(p => p.company_id === addForm.company_id);
});

const filteredJobs = computed(() => {
  if (!addForm.company_id) return jobs.value;
  return jobs.value.filter(j => j.company_id === addForm.company_id);
});

const editFilteredJobs = computed(() => {
  if (!editForm.company_id) return jobs.value;
  return jobs.value.filter(j => j.company_id === editForm.company_id);
});

const editFilteredRatePlans = computed(() => {
  if (!editForm.company_id) return ratePlans.value;
  return ratePlans.value.filter(p => p.company_id === editForm.company_id);
});

// 无推荐人批量绑定
const noReferrerVisible = ref(false);
const noReferrerLoading = ref(false);
const noReferrerList = ref<Employee[]>([]);
const noReferrerSelection = ref<Employee[]>([]);
const noReferrerTotal = ref(0);
const noReferrerCompanyFilter = ref('');
const noReferrerStatusFilter = ref<'active' | 'pending_resign' | 'resigned'>('active');
const batchReferrerId = ref('');
const batchBinding = ref(false);

// 导入
const importVisible = ref(false);
const importing = ref(false);
const importValidated = ref(false);
const importFileName = ref('');
const validatedImportRows = ref<any[]>([]);
const importErrors = ref<any[]>([]);
const importUploadRef = ref<UploadInstance>();

const { pagination, onSizeChange, onCurrentChange } = usePagination(loadData);

const isHrSpecialist = computed(() => {
  const role = normalizeText(authStore.userInfo?.role);
  const lowerRole = role.toLowerCase();
  return ['hr', 'hr_specialist', 'hr-specialist'].includes(lowerRole)
    || role === 'HR专员'
    || userStore.hasRole('hr')
    || userStore.hasRole('hr_specialist')
    || userStore.hasRole('HR专员');
});

const currentUserId = computed(() => normalizeText(authStore.userInfo?._id || authStore.userInfo?.id));

const visibleReferrerId = computed(() => (isHrSpecialist.value ? currentUserId.value : ''));

async function ensureAuthReady() {
  if (authReady.value) return true;
  if (!authStore.token) {
    authReady.value = true;
    return false;
  }

  const valid = await authStore.init();
  authReady.value = valid;
  return valid;
}
function normalizeCode(value?: string | number | null) {
  return normalizeText(value).toUpperCase();
}

function normalizeImportDate(value?: string | number | null) {
  if (value === null || value === undefined || value === '') return '';
  if (typeof value === 'number' && !Number.isNaN(value)) {
    const date = new Date(Math.round((value - 25569) * 86400 * 1000));
    return formatDateUtil(date, 'YYYY-MM-DD');
  }
  const text = normalizeText(value);
  const direct = text.match(/^(\d{4}-\d{2}-\d{2})/);
  if (direct) return direct[1];
  const slashDate = text.match(/^(\d{4})\/(\d{1,2})\/(\d{1,2})$/);
  if (slashDate) {
    return `${slashDate[1]}-${slashDate[2].padStart(2, '0')}-${slashDate[3].padStart(2, '0')}`;
  }
  const parsed = new Date(text);
  if (Number.isNaN(parsed.getTime())) return '';
  return formatDateUtil(parsed, 'YYYY-MM-DD');
}

function isEmployeeActiveForValidation(employee: any, leaveDate?: string) {
  const normalizedLeaveDate = normalizeImportDate(leaveDate ?? employee?.leave_date);
  if (normalizedLeaveDate) {
    return normalizedLeaveDate >= formatDateUtil(new Date(), 'YYYY-MM-DD');
  }
  return normalizeText(employee?.status) !== 'resigned';
}

async function loadCompanies() {
  try {
    const result = await companiesApi.getList({ page: 1, pageSize: 100 });
    companies.value = result.list;
  } catch (err) {
    console.error('加载企业列表失败:', err);
  }
}

async function loadData() {
  loading.value = true;
  try {
    const ready = await ensureAuthReady();
    if (!ready) {
      tableData.value = [];
      pagination.total = 0;
      return;
    }

    if (isHrSpecialist.value && !visibleReferrerId.value) {
      tableData.value = [];
      pagination.total = 0;
      ElMessage.error('当前HR账号缺少用户ID，已阻止加载全量在职数据');
      return;
    }

    const result = await employeesApi.getList({
      page: pagination.page,
      pageSize: pagination.pageSize,
      keyword: searchForm.name || undefined,
      status: searchForm.status || undefined,
      company_id: searchForm.company_id || undefined,
      contract_status: (searchForm.contract_status as 'signed' | 'unsigned') || undefined,
      referrer_id: visibleReferrerId.value || searchForm.referrer_id || undefined
    });
    const companyMap = new Map(companies.value.map(c => [c._id, c.name]));
    const jobMap = new Map(jobs.value.map(j => [j._id, j.position]));
    tableData.value = (result.list || []).map((item: any) => ({
      ...item,
      company_name: item.company_name || companyMap.get(item.company_id) || '',
      job_name: item.job_name || jobMap.get(item.job_id) || '',
      join_date: formatDate(item.join_date || item.created_at),
      leave_date: formatDate(item.leave_date)
    }));
    pagination.total = result.total;
  } catch (err) {
    console.error('加载员工列表失败:', err);
  } finally {
    loading.value = false;
  }
}

function formatDate(date?: string) {
  if (!date) return '-';
  return formatDateUtil(date, 'YYYY-MM-DD');
}

function normalizeRelationStatus(status: any): 'active' | 'pending_resign' | 'resigned' {
  const value = normalizeText(status).toLowerCase();
  if (value === 'resigned' || value === 'left') return 'resigned';
  if (value === 'pending_resign') return 'pending_resign';
  return 'active';
}

function getSettlementModeText(mode?: string) {
  return mode === 'monthly' ? '月结' : '日结';
}

function getContractStatusText(status?: string) {
  return status === 'signed' ? '已签约' : '未签约';
}

function getContractStatusType(status?: string): 'success' | 'warning' {
  return status === 'signed' ? 'success' : 'warning';
}

function handleSearch() {
  pagination.page = 1;
  loadData();
}

function handleReset() {
  searchForm.name = '';
  searchForm.status = '';
  searchForm.company_id = '';
  searchForm.referrer_id = '';
  searchForm.contract_status = '';
  handleSearch();
}

function handleView(row: Employee) {
  detailData.value = row;
  detailVisible.value = true;
}

function handleSelectionChange(rows: Employee[]) {
  selectedRows.value = rows;
}

async function handleEdit(row: Employee) {
  try {
    const detail = await employeesApi.getEditDetail(row.employee_id || row._id, row.relation_id || row._id);
    Object.assign(editForm, detail);
    editForm._id = detail.employee_id || detail._id;
    editForm.employee_id = detail.employee_id || detail._id;
    editForm.relation_id = detail.relation_id || row.relation_id || '';
    editForm.company_id = detail.company_id || '';
    editForm.company_name = detail.company_name || '';
    editForm.job_id = detail.job_id || '';
    editForm.job_name = detail.job_name || '';
    editForm.rate_plan_id = detail.rate_plan_id || '';
    editVisible.value = true;
  } catch (err: any) {
    ElMessage.error(err?.message || '加载编辑信息失败');
  }
}

function handleResign(row: Employee) {
  resignForm._id = row.employee_id || row._id || '';
  resignForm.employee_id = row.employee_id || row._id || '';
  resignForm.relation_id = row.relation_id || row._id || '';
  resignForm.name = row.name;
  resignForm.leave_date = formatDateUtil(new Date(), 'YYYY-MM-DD');
  resignVisible.value = true;
}

function openBatchResign() {
  if (!selectedRows.value.length) {
    ElMessage.warning('请先选择要离职的员工');
    return;
  }
  const invalid = selectedRows.value.filter((row: any) => !row.relation_id || row.employment_status === 'resigned');
  if (invalid.length) {
    ElMessage.warning(`已选人员中有 ${invalid.length} 条缺少在职关系或已离职，请重新选择`);
    return;
  }
  batchResignForm.leave_date = formatDateUtil(new Date(), 'YYYY-MM-DD');
  batchResignVisible.value = true;
}

async function saveBatchResign() {
  if (batchResignSaving.value) return;
  if (!selectedRows.value.length || !batchResignForm.leave_date) {
    ElMessage.error('请选择离职员工和离职日期');
    return;
  }

  try {
    await ElMessageBox.confirm(
      `确认将已选 ${selectedRows.value.length} 名员工统一设置为 ${batchResignForm.leave_date} 离职？系统离职会先完成，批量退保随后执行。`,
      '批量离职确认',
      { type: 'warning', confirmButtonText: '确认离职', cancelButtonText: '取消' }
    );
  } catch {
    return;
  }

  batchResignSaving.value = true;
  try {
    const result = await employeesApi.batchResign(selectedRows.value, batchResignForm.leave_date);
    batchResignVisible.value = false;
    selectedRows.value = [];
    await loadData();
    if (result.failed.length) {
      ElMessage.warning(`系统离职成功 ${result.success} 人，失败 ${result.failed.length} 人：${result.failed.slice(0, 3).map(item => `${item.name} ${item.message}`).join('；')}`);
      return;
    }
    ElMessage.success(`系统离职成功 ${result.success} 人，批量退保已开始后台提交`);
  } catch (err: any) {
    ElMessage.error(err?.message || '批量离职失败');
  } finally {
    batchResignSaving.value = false;
  }
}

async function saveResign() {
  if (resignSaving.value) return;
  if (!resignForm.employee_id || !resignForm.leave_date) {
    ElMessage.error('请选择离职日期');
    return;
  }
  resignSaving.value = true;
  try {
    await employeesApi.resign(resignForm.relation_id || resignForm.employee_id, resignForm.leave_date, resignForm.employee_id);
    ElMessage.success('离职操作成功');
    resignVisible.value = false;
    await loadData();
  } catch (err: any) {
    ElMessage.error(err?.message || '离职操作失败');
  } finally {
    resignSaving.value = false;
  }
}

async function handleSign(row: Employee) {
  const relationId = row.relation_id || row._id || '';
  if (!relationId) {
    ElMessage.error('缺少在职关系ID，无法签约');
    return;
  }

  try {
    await ElMessageBox.confirm(
      `确认将 ${row.name || '该员工'} 标记为已签约并生成合同编号？`,
      '签约确认',
      { type: 'warning', confirmButtonText: '确认签约', cancelButtonText: '取消' }
    );
  } catch {
    return;
  }

  signingRelationId.value = relationId;
  try {
    const result = await employeesApi.signContract(relationId);
    ElMessage.success(`签约成功，合同编号：${result.contract_no || '-'}`);
    await loadData();
  } catch (err: any) {
    ElMessage.error(err?.message || '签约失败');
  } finally {
    signingRelationId.value = '';
  }
}

async function saveEdit() {
  if (editSaving.value) return;
  if (!editForm.employee_id) return;
  if (!editForm.name || !editForm.phone || !editForm.company_id) {
    ElMessage.error('姓名、手机号、企业必填');
    return;
  }
  if (!editForm.relation_id) {
    ElMessage.error('缺少在职关系ID');
    return;
  }
  editSaving.value = true;
  try {
    const companyName = companies.value.find(c => c._id === editForm.company_id)?.name || editForm.company_name || '';
    const job = jobs.value.find(j => j._id === editForm.job_id);
    const referrerName = hrUsers.value.find(u => u._id === editForm.referrer_id)?.name || editForm.referrer_name;
    const result = await employeesApi.updateEmployment(editForm.employee_id, editForm.relation_id, {
      employee_id: editForm.employee_id,
      relation_id: editForm.relation_id,
      name: editForm.name,
      phone: editForm.phone,
      id_card: editForm.id_card,
      company_id: editForm.company_id,
      company_name: companyName,
      job_id: editForm.job_id,
      job_name: job?.position || editForm.job_name,
      referrer_id: editForm.referrer_id,
      referrer_name: referrerName,
      rate_plan_id: editForm.rate_plan_id,
      settlement_mode: editForm.settlement_mode,
      join_date: editForm.join_date,
      leave_date: editForm.leave_date,
      status: editForm.status
    });
    ElMessage.success('保存成功');
    const index = tableData.value.findIndex((item: any) => (item.relation_id || item._id) === editForm.relation_id);
    if (index >= 0) {
      tableData.value[index] = {
        ...tableData.value[index],
        ...result,
        company_name: companyName,
        job_name: job?.position || editForm.job_name,
        referrer_name: referrerName,
        join_date: formatDate(result.join_date),
        leave_date: formatDate(result.leave_date)
      } as Employee;
    }
    editVisible.value = false;
  } catch (err: any) {
    ElMessage.error(err?.message || '保存失败');
  } finally {
    editSaving.value = false;
  }
}

async function loadRatePlans() {
  try {
    const res = await ratePlansApi.getList({ page: 1, pageSize: 1000 });
    ratePlans.value = res.list || [];
  } catch (err) {
    console.error('加载工价方案失败:', err);
  }
}

async function loadJobs() {
  try {
    const res = await jobsApi.getList({ page: 1, pageSize: 200 });
    jobs.value = res.list || [];
  } catch (err) {
    console.error('加载岗位失败:', err);
  }
}

async function loadHrUsers() {
  try {
    const res = await usersApi.getList({ page: 1, pageSize: 500 });
    hrUsers.value = normalizeReferrerUsers(res.list || []);
  } catch (err) {
    console.error('加载HR用户失败:', err);
  }
}

function handleReferrerChange(mode: 'edit' | 'add') {
  if (mode === 'edit') {
    editForm.referrer_name = hrUsers.value.find((item) => item._id === editForm.referrer_id)?.name || '';
    return;
  }
  addForm.referrer_name = hrUsers.value.find((item) => item._id === addForm.referrer_id)?.name || '';
}

function handleCompanyChange(mode: 'edit' | 'add') {
  if (mode === 'edit') {
    editForm.job_id = '';
    editForm.job_name = '';
    return;
  }
  addForm.job_id = '';
  addForm.job_name = '';
}

function openAdd() {
  Object.assign(addForm, {
    name: '',
    phone: '',
    id_card: '',
    referrer_name: '',
    referrer_id: '',
    company_id: '',
    job_id: '',
    job_name: '',
    rate_plan_id: '',
    settlement_mode: 'daily',
    join_date: '',
    status: 'probation'
  });
  addVisible.value = true;
}

async function saveAdd() {
  if (!addForm.name || !addForm.phone || !addForm.id_card || !addForm.company_id) {
    ElMessage.error('姓名、手机号、身份证号、企业必填');
    return;
  }
  addSubmitting.value = true;
  try {
    const companyName = companies.value.find(c => c._id === addForm.company_id)?.name || '';
    const job = jobs.value.find(j => j._id === addForm.job_id);
    await employeesApi.create({
      ...addForm,
      referrer_name: hrUsers.value.find(u => u._id === addForm.referrer_id)?.name || addForm.referrer_name,
      company_name: companyName,
      job_name: job?.position || addForm.job_name,
      job_id: addForm.job_id || job?._id,
      rate_plan_id: addForm.rate_plan_id || job?.rate_plan_id || '',
      settlement_mode: addForm.settlement_mode || (job?.salary_type === 'monthly' ? 'monthly' : 'daily')
    });
    ElMessage.success('入职登记成功');
    addVisible.value = false;
    loadData();
  } catch (err: any) {
    ElMessage.error(err?.message || '入职失败');
  } finally {
    addSubmitting.value = false;
  }
}

async function handleExport() {
  try {
    const ready = await ensureAuthReady();
    if (!ready) {
      ElMessage.error('登录状态已失效，请重新登录');
      return;
    }
    if (isHrSpecialist.value && !visibleReferrerId.value) {
      ElMessage.error('当前HR账号缺少用户ID，已阻止导出全量在职数据');
      return;
    }

    const XLSX = await loadXlsx();
    const exportResult = await employeesApi.getList({
      page: 1,
      pageSize: 5000,
      keyword: searchForm.name || undefined,
      status: searchForm.status || undefined,
      company_id: searchForm.company_id || undefined,
      contract_status: (searchForm.contract_status as 'signed' | 'unsigned') || undefined,
      referrer_id: visibleReferrerId.value || searchForm.referrer_id || undefined
    });
    const exportRows = exportResult.list || [];

    if (!exportRows.length) {
      ElMessage.warning('当前筛选条件下暂无可导出数据');
      return;
    }

    const companyMap = new Map(companies.value.map(c => [c._id, c.name]));
    const jobMap = new Map(jobs.value.map(j => [j._id, j.position]));
    const data = exportRows.map((item) => ({
      姓名: item.name,
      手机号: item.phone,
      身份证号: item.id_card,
      推荐人: item.referrer_name,
      企业: item.company_name || companyMap.get(item.company_id || '') || '',
      岗位: item.job_name || jobMap.get(item.job_id || '') || '',
      入职日期: formatDate(item.join_date),
      离职日期: formatDate(item.leave_date),
      签约状态: getContractStatusText(item.contract_status),
      合同编号: item.contract_no || '-',
      状态: getEmploymentStatusText(item.employment_status),
      结算方式: getSettlementModeText(item.settlement_mode),
      工号: item.employee_no
    }));
    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, '花名册');
    XLSX.writeFile(wb, '花名册.xlsx');
  } catch (err) {
    console.error('导出失败', err);
    ElMessage.error('导出失败');
  }
}

function resetImportState() {
  importFileName.value = '';
  importValidated.value = false;
  validatedImportRows.value = [];
  importErrors.value = [];
  importUploadRef.value?.clearFiles();
}

async function validateImportRows(rows: any[]) {
  const db = await getDatabase();
  const [companiesData, jobsData, usersData, employeesData, employeeCompaniesData] = await Promise.all([
    fetchAllDocs(db, 'companies'),
    fetchAllDocs(db, 'jobs'),
    fetchAllDocs(db, 'users'),
    fetchAllDocs(db, 'employees'),
    fetchAllDocs(db, 'employee_companies')
  ]);

  const companyById = new Map<string, any>();
  const companyByCode = new Map<string, any>();
  (companiesData || []).forEach((item: any) => {
    const id = item._id || item.id;
    if (id) companyById.set(id, item);
    if (item.company_code) companyByCode.set(normalizeCode(item.company_code), item);
  });

  const jobById = new Map<string, any>();
  const jobByCode = new Map<string, any>();
  (jobsData || []).forEach((item: any) => {
    const id = item._id || item.id;
    if (id) jobById.set(id, item);
    if (item.job_code) jobByCode.set(normalizeCode(item.job_code), item);
  });

  const usersById = new Map<string, any>();
  const usersByPhone = new Map<string, any[]>();
  (usersData || []).forEach((item: any) => {
    if (!isValidReferrerUser(item)) return;
    usersById.set(item._id, item);
    const phone = normalizePhone(item.phone);
    if (!phone) return;
    const list = usersByPhone.get(phone) || [];
    list.push(item);
    usersByPhone.set(phone, list);
  });

  const employeeById = new Map<string, any>();
  const employeeByNo = new Map<string, any>();
  const employeeByIdCard = new Map<string, any[]>();
  const employeeByPhoneName = new Map<string, any[]>();
  (employeesData || []).forEach((item: any) => {
    const employeeId = item._id || item.id;
    if (employeeId) employeeById.set(employeeId, item);
    const employeeNo = normalizeText(item.employee_no);
    if (employeeNo) employeeByNo.set(employeeNo, item);
    const idCard = normalizeIdCard(item.id_card);
    if (idCard) {
      const list = employeeByIdCard.get(idCard) || [];
      list.push(item);
      employeeByIdCard.set(idCard, list);
    }
    const phoneNameKey = `${normalizePhone(item.phone)}::${normalizeText(item.name).replace(/\s+/g, '')}`;
    if (normalizePhone(item.phone) && normalizeText(item.name)) {
      const list = employeeByPhoneName.get(phoneNameKey) || [];
      list.push(item);
      employeeByPhoneName.set(phoneNameKey, list);
    }
  });

  const activeRelationKeys = new Set<string>();
  (employeeCompaniesData || []).forEach((item: any) => {
    const employee = employeeById.get(item.employee_id);
    const companyId = normalizeText(item.company_id);
    const phone = normalizePhone(employee?.phone);
    if (!companyId || !phone || !isEmployeeActiveForValidation(employee || {}, item.leave_date)) return;
    activeRelationKeys.add(`${companyId}::${phone}`);
  });

  const batchEmployeeNos = new Set<string>();
  const batchPhoneCompanyKeys = new Set<string>();
  const batchIdCards = new Set<string>();
  const validRows: any[] = [];
  const errors: any[] = [];

  rows.forEach((row, index) => {
    const rowNo = index + 2;
    const employeeNo = normalizeText(row['工号'] || row['员工编码'] || row['employee_no']);
    const name = normalizeText(row['姓名'] || row['名字']);
    const phone = normalizePhone(row['在职手机号'] || row['手机号'] || row['电话'] || row['phone']);
    const idCard = normalizeIdCard(row['身份证号'] || row['身份证'] || row['id_card']);
    const companyIdInput = normalizeText(row['企业ID'] || row['company_id']);
    const companyCodeInput = normalizeCode(row['企业编码'] || row['company_code']);
    const companyNameInput = normalizeText(row['企业'] || row['公司']);
    const jobIdInput = normalizeText(row['岗位ID'] || row['job_id']);
    const jobCodeInput = normalizeCode(row['岗位编码'] || row['job_code']);
    const jobNameInput = normalizeText(row['岗位'] || row['job_name']);
    const referrerIdInput = normalizeText(row['推荐人ID'] || row['referrer_user_id']);
    const referrerPhoneInput = normalizePhone(row['推荐人手机号'] || row['referrer_phone']);
    const referrerNameInput = normalizeText(row['推荐人'] || row['referrer_name']);
    const joinDate = normalizeImportDate(row['入职日期'] || row['join_date']);
    const settlementText = normalizeText(row['结算方式'] || row['settlement_mode']);
    const statusText = normalizeText(row['状态'] || row['status']);
    const rowErrors: string[] = [];

    if (!name) rowErrors.push('姓名不能为空');
    if (!phone) rowErrors.push('在职手机号不能为空');
    if (!idCard) rowErrors.push('身份证号不能为空');
    if (!joinDate) rowErrors.push('入职日期不能为空');

    let company = null;
    if (companyIdInput) company = companyById.get(companyIdInput);
    else if (companyCodeInput) company = companyByCode.get(companyCodeInput);
    else if (companyNameInput) rowErrors.push('企业名称匹配已禁用，请改填企业编码或企业ID');
    else rowErrors.push('缺少企业编码或企业ID');
    if ((companyIdInput || companyCodeInput) && !company) rowErrors.push('企业标识未匹配到有效企业');

    let job = null;
    if (jobIdInput) job = jobById.get(jobIdInput);
    else if (jobCodeInput) job = jobByCode.get(jobCodeInput);
    else if (jobNameInput) rowErrors.push('岗位名称匹配已禁用，请改填岗位编码或岗位ID');
    else rowErrors.push('缺少岗位编码或岗位ID');
    if ((jobIdInput || jobCodeInput) && !job) rowErrors.push('岗位标识未匹配到有效岗位');

    if (company && job && (job.company_id || '') !== (company._id || company.id || '')) {
      rowErrors.push('岗位不属于所填企业');
    }

    const reusableByIdCard = idCard
      ? (employeeByIdCard.get(idCard) || []).filter((item: any) => !normalizeText(item.merged_into_employee_id))
      : [];
    const reusableByPhoneName = phone && name
      ? (employeeByPhoneName.get(`${phone}::${name.replace(/\s+/g, '')}`) || []).filter((item: any) => !normalizeText(item.merged_into_employee_id))
      : [];
    const reusableMatches = reusableByIdCard.length ? reusableByIdCard : reusableByPhoneName;
    const reusableEmployee = reusableMatches.length === 1 ? reusableMatches[0] : null;
    if (reusableMatches.length > 1) {
      rowErrors.push('匹配到多个历史员工主档，请先人工清理重复员工数据');
    }

    let referrer = null;
    if (referrerIdInput) {
      referrer = usersById.get(referrerIdInput);
      if (!referrer) rowErrors.push('推荐人ID未匹配到有效账号');
    } else if (referrerPhoneInput) {
      const matches = (usersByPhone.get(referrerPhoneInput) || []).filter((item: any) => isValidReferrerUser(item));
      if (matches.length === 1) referrer = matches[0];
      else if (matches.length > 1) rowErrors.push('推荐人手机号匹配到多个账号');
      else rowErrors.push('推荐人手机号未匹配到有效账号');
    } else if (referrerNameInput) {
      rowErrors.push('推荐人名称匹配已禁用，请改填推荐人ID或推荐人手机号');
    }

    if (employeeNo) {
      const employeeWithSameNo = employeeByNo.get(employeeNo);
      if (employeeWithSameNo && (!reusableEmployee || (employeeWithSameNo._id || employeeWithSameNo.id) !== (reusableEmployee._id || reusableEmployee.id))) {
        rowErrors.push('工号已被其他员工使用');
      }
      if (batchEmployeeNos.has(employeeNo)) rowErrors.push('文件内工号重复');
    }
    if (phone) {
      const companyId = company?._id || company?.id || '';
      const phoneCompanyKey = companyId ? `${companyId}::${phone}` : '';
      if (phoneCompanyKey && activeRelationKeys.has(phoneCompanyKey)) rowErrors.push('同企业下在职手机号已存在');
      if (phoneCompanyKey && batchPhoneCompanyKeys.has(phoneCompanyKey)) rowErrors.push('文件内同企业下在职手机号重复');
    }
    if (idCard && batchIdCards.has(idCard)) rowErrors.push('文件内身份证号重复');

    if (rowErrors.length) {
      errors.push({
        row_no: rowNo,
        employee_no: employeeNo,
        employee_name: name,
        reason: rowErrors.join('；')
      });
      return;
    }

    if (employeeNo) batchEmployeeNos.add(employeeNo);
    if (company && phone) {
      batchPhoneCompanyKeys.add(`${company._id || company.id}::${phone}`);
    }
    batchIdCards.add(idCard);

    validRows.push({
      __row_no: rowNo,
      employee_no: employeeNo || undefined,
      name,
      phone,
      id_card: idCard,
      referrer_id: referrer?._id || '',
      referrer_name: referrer?.real_name || referrer?.name || '',
      company_id: company._id || company.id,
      company_name: company.name || '',
      job_id: job._id || job.id,
      job_name: job.position || job.job_name || '',
      settlement_mode: settlementText === '月结' || settlementText.toLowerCase() === 'monthly' ? 'monthly' : 'daily',
      join_date: joinDate,
      status: statusText === '正式员工' || statusText === '正式' || statusText.toLowerCase() === 'regular' ? 'regular' : 'probation'
    });
  });

  return {
    validRows,
    errors
  };
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
    const result = await validateImportRows(rows);
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

function handleImportChange(uploadFile: UploadFile) {
  const rawFile = uploadFile.raw as File | undefined;
  if (!rawFile) {
    ElMessage.error('未读取到上传文件');
    return;
  }
  void handleImportFile(rawFile).finally(() => {
    importUploadRef.value?.clearFiles();
  });
}

function handleImportExceed(files: UploadRawFile[], _uploadFiles: UploadFiles) {
  const nextFile = files[files.length - 1] as File | undefined;
  if (!nextFile) return;
  importUploadRef.value?.clearFiles();
  void handleImportFile(nextFile).finally(() => {
    importUploadRef.value?.clearFiles();
  });
}

async function confirmImport() {
  if (!importValidated.value || !validatedImportRows.value.length) {
    ElMessage.warning('请先上传并校验文件');
    return;
  }

  importing.value = true;
  const runtimeErrors: any[] = [];
  const validationErrors = [...importErrors.value];
  let imported = 0;
  try {
    for (let index = 0; index < validatedImportRows.value.length; index += 1) {
      const row = validatedImportRows.value[index];
      try {
        const { __row_no, ...payload } = row;
        await employeesApi.create(payload);
        imported += 1;
      } catch (err: any) {
        runtimeErrors.push({
          row_no: row.__row_no || index + 2,
          employee_no: row.employee_no || '',
          employee_name: row.name || '',
          reason: err?.message || '创建失败'
        });
      }
    }

    importErrors.value = [...validationErrors, ...runtimeErrors];

    if (importErrors.value.length) {
      ElMessage.warning(`容错导入完成，成功 ${imported} 条，跳过 ${importErrors.value.length} 条`);
    } else {
      ElMessage.success(`导入成功，共 ${imported} 条`);
      importVisible.value = false;
      resetImportState();
    }

    await loadData();
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
    工号: item.employee_no,
    姓名: item.employee_name,
    错误原因: item.reason
  })));
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, '错误清单');
  XLSX.writeFile(wb, '入职导入错误清单.xlsx');
}

// 下载导入模板
async function downloadTemplate() {
  const XLSX = await loadXlsx();
  const headers = ['工号', '姓名', '在职手机号', '身份证号', '推荐人ID', '推荐人手机号', '企业编码', '企业ID', '岗位编码', '岗位ID', '结算方式', '入职日期', '状态'];
  const example = [{
    工号: 'E20260001',
    姓名: '张三',
    在职手机号: '13800001111',
    身份证号: '110101199001011234',
    推荐人ID: 'user_hr_001',
    推荐人手机号: '',
    企业编码: 'COMP_SZ001',
    企业ID: '',
    岗位编码: 'JOB_SZ001',
    岗位ID: '',
    结算方式: '日结',
    入职日期: '2024-01-01',
    状态: '试用期'
  }];
  const ws = XLSX.utils.json_to_sheet(example, { header: headers });
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, '模板');
  XLSX.writeFile(wb, '入职导入模板.xlsx');
}

async function openNoReferrer() {
  if (isHrSpecialist.value) return;
  noReferrerVisible.value = true;
  batchReferrerId.value = '';
  noReferrerStatusFilter.value = 'active';
  noReferrerSelection.value = [];
  await loadNoReferrerData();
}

async function loadNoReferrerData() {
  if (isHrSpecialist.value) {
    noReferrerList.value = [];
    noReferrerTotal.value = 0;
    return;
  }
  noReferrerLoading.value = true;
  try {
    const db = await getDatabase();
    const _ = db.command;
    const today = formatDateUtil(new Date(), 'YYYY-MM-DD');
    const emptyField = (field: string) => _.or([
      { [field]: _.exists(false) },
      { [field]: '' },
      { [field]: null }
    ]);
    const noRefCond = emptyField('referrer_id');
    const whereCondition = noReferrerCompanyFilter.value
      ? _.and([noRefCond, { company_id: noReferrerCompanyFilter.value }, { employee_id: _.exists(true) }])
      : _.and([noRefCond, { employee_id: _.exists(true) }]);

    const countRes = await db.collection('employee_companies').where(whereCondition).count();
    const total = countRes.total || 0;
    const relationRows: any[] = [];
    const batchSize = 100;
    for (let i = 0; i < total; i += batchSize) {
      const res = await db.collection('employee_companies').where(whereCondition).skip(i).limit(batchSize).get();
      relationRows.push(...(res.data || []));
    }

    const employeeIds = [...new Set(relationRows.map((item: any) => String(item.employee_id || '')).filter(Boolean))];
    const employeeMap = new Map<string, any>();
    for (let i = 0; i < employeeIds.length; i += batchSize) {
      const chunk = employeeIds.slice(i, i + batchSize);
      const empRes = await db.collection('employees').where({ _id: _.in(chunk) }).get();
      (empRes.data || []).forEach((item: any) => {
        employeeMap.set(String(item._id || item.id || ''), item);
      });
    }

    const companyMap = new Map(companies.value.map(c => [c._id, c.name]));
    const jobMap = new Map(jobs.value.map(j => [j._id, j.position]));
    const mappedRows = relationRows.map((relation: any) => {
      const employee = employeeMap.get(String(relation.employee_id || '')) || {};
      const employmentStatus = normalizeRelationStatus(relation?.status);
      return {
        ...employee,
        ...relation,
        _id: relation._id || relation.id || '',
        relation_id: relation._id || relation.id || '',
        employee_id: relation.employee_id || employee._id || employee.id || '',
        employee_no: employee.employee_no || '',
        name: employee.name || '',
        phone: employee.phone || '',
        company_name: relation.company_name || companyMap.get(relation.company_id) || '',
        job_name: relation.job_name || jobMap.get(relation.job_id) || '',
        employment_status: employmentStatus
      };
    });
    noReferrerList.value = mappedRows.filter((item: any) => item.employment_status === noReferrerStatusFilter.value);
    noReferrerTotal.value = noReferrerList.value.length;
  } catch (err) {
    console.error('加载无推荐人员工失败:', err);
    ElMessage.error('加载失败');
  } finally {
    noReferrerLoading.value = false;
  }
}

function handleNoReferrerSelect(selection: Employee[]) {
  noReferrerSelection.value = selection;
}

async function batchBindReferrer() {
  if (!noReferrerSelection.value.length || !batchReferrerId.value) return;
  const referrer = hrUsers.value.find(u => u._id === batchReferrerId.value);
  if (!referrer) {
    ElMessage.error('推荐人无效');
    return;
  }
  batchBinding.value = true;
  let success = 0;
  let fail = 0;
  try {
    for (const emp of noReferrerSelection.value) {
      try {
        const relationId = emp.relation_id || emp._id || '';
        await employeesApi.bindReferrerForRelation(relationId, {
          referrer_id: batchReferrerId.value,
          referrer_name: referrer.name || referrer.real_name || ''
        });
        success++;
      } catch {
        fail++;
      }
    }
    if (fail) {
      ElMessage.warning(`绑定完成：成功 ${success}，失败 ${fail}`);
    } else {
      ElMessage.success(`批量绑定成功，共 ${success} 人`);
    }
    await loadNoReferrerData();
    noReferrerSelection.value = [];
    loadData();
  } finally {
    batchBinding.value = false;
  }
}

onMounted(async () => {
  await ensureAuthReady();
  await Promise.all([loadCompanies(), loadRatePlans(), loadJobs(), loadHrUsers()]);
  await loadData();
});
</script>

<style scoped lang="scss">
.employees-page {
  .search-card {
    margin-bottom: 16px;
  }

  .toolbar {
    margin-bottom: 16px;
    display: flex;
    gap: 8px;
  }

  .pagination-wrapper {
    margin-top: 16px;
    display: flex;
    flex-shrink: 0;
    justify-content: flex-end;
  }
}

.detail-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 8px 12px;
  line-height: 1.6;
}

.import-actions,
.binding-actions {
  display: flex;
  align-items: center;
  gap: 8px;
}

.binding-suggestions {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.mt-12 {
  margin-top: 12px;
}
</style>
