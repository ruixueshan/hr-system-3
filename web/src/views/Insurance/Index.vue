<template>
  <div class="insurance-page">
    <div class="page-header">
      <div>
        <h2>保险管理</h2>
        <p>云工保保单同步、岗位映射、在保减保与未承保投保</p>
      </div>
      <div class="header-actions">
        <el-button :loading="loading.overview" @click="loadAll">刷新</el-button>
      </div>
    </div>

    <el-row :gutter="12" class="stat-grid">
      <el-col :xs="12" :md="6" :xl="3" v-for="item in stats" :key="item.label">
        <div class="stat-card" :class="`stat-card--${item.tone}`">
          <span>{{ item.label }}</span>
          <strong>{{ item.value }}</strong>
        </div>
      </el-col>
    </el-row>

    <el-tabs v-model="activeTab" class="main-tabs" @tab-change="handleTabChange">
      <el-tab-pane label="在保人员清单" name="covered">
        <section class="panel">
          <div class="toolbar">
            <el-select v-model="selectedPolicyId" filterable placeholder="选择保单" class="wide-select">
              <el-option
                v-for="policy in activePolicies"
                :key="policy.policy_id"
                :label="`${policy.plan_name || policy.policy_id} / ${policy.policy_id}`"
                :value="policy.policy_id"
              />
            </el-select>
            <el-input
              v-model="recordsNameKeyword"
              clearable
              placeholder="筛选姓名"
              class="small-filter"
              @keyup.enter="handleRecordsFilterChange"
              @clear="handleRecordsFilterChange"
            />
            <el-input
              v-model="recordsWorkCompanyKeyword"
              clearable
              placeholder="筛选派遣单位"
              class="wide-select"
              @keyup.enter="handleRecordsFilterChange"
              @clear="handleRecordsFilterChange"
            />
            <el-button @click="handleRecordsFilterChange">筛选</el-button>
            <el-button :disabled="!selectedPolicyId" :loading="loading.syncRelated" @click="syncSelectedPolicyPersons">同步当前保单人员</el-button>
            <el-button type="primary" :disabled="activePolicies.length === 0" :loading="loading.syncAllPersons" @click="syncAllActivePolicyPersons">同步全部可操作人员</el-button>
            <el-button type="danger" :disabled="selectedCoveredRows.length === 0" :loading="loading.offSelected" @click="openBatchOffDialog">批量减保</el-button>
            <span class="hint inline-hint">在保明细共 {{ recordsTotal }} 人</span>
          </div>
          <el-table :data="records" height="460" stripe empty-text="暂无在保人员" @selection-change="handleCoveredSelectionChange">
            <el-table-column type="selection" width="44" />
            <el-table-column prop="name_snapshot" label="姓名" width="120" />
            <el-table-column label="身份证" width="180">
              <template #default="{ row }">{{ row.idcard || row.idcard_masked || '-' }}</template>
            </el-table-column>
            <el-table-column label="保单" min-width="170">
              <template #default="{ row }">{{ resolvePolicyName(row) }}</template>
            </el-table-column>
            <el-table-column prop="work_company" label="派遣单位" min-width="180" />
            <el-table-column prop="occupation_name" label="工种" min-width="180" />
            <el-table-column prop="status" label="状态" width="110" />
            <el-table-column label="开始" width="170">
              <template #default="{ row }"><BeijingDateTime :value="row.start_date" format="YYYY-MM-DD" /></template>
            </el-table-column>
            <el-table-column label="结束" width="170">
              <template #default="{ row }"><BeijingDateTime :value="row.end_date" format="YYYY-MM-DD" /></template>
            </el-table-column>
            <el-table-column label="操作" width="100" fixed="right">
              <template #default="{ row }">
                <el-button size="small" type="danger" plain @click="openSingleOffDialog(row)">减保</el-button>
              </template>
            </el-table-column>
          </el-table>
          <el-pagination
            class="table-pagination"
            layout="prev, pager, next, jumper, total"
            :total="recordsTotal"
            :page-size="recordsPageSize"
            v-model:current-page="recordsPage"
            @current-change="loadInsuranceRecords"
          />
        </section>
      </el-tab-pane>

      <el-tab-pane label="未承保人员清单" name="uninsured">
        <section class="panel">
          <div class="toolbar">
            <CompanySelect v-model="uninsuredCompanyId" placeholder="筛选企业" width="320px" @change="handleUninsuredFilterChange" />
            <el-input
              v-model="uninsuredNameKeyword"
              clearable
              placeholder="筛选姓名"
              class="small-filter"
              @keyup.enter="handleUninsuredFilterChange"
              @clear="handleUninsuredFilterChange"
            />
            <el-button @click="handleUninsuredFilterChange">筛选</el-button>
            <el-button type="primary" :loading="loading.uninsured" @click="loadUninsuredEmployees">刷新清单</el-button>
            <el-button type="success" :disabled="selectedUninsuredRows.length === 0" :loading="loading.addSelected" @click="openBatchAddDialog">批量投保</el-button>
            <span class="hint inline-hint">在职未承保 {{ uninsuredTotal }} 人</span>
          </div>
          <el-table :data="uninsuredRows" height="460" stripe empty-text="暂无未承保人员" @selection-change="handleUninsuredSelectionChange">
            <el-table-column type="selection" width="44" />
            <el-table-column prop="employee_no" label="工号" width="150" />
            <el-table-column prop="name" label="姓名" width="120" />
            <el-table-column prop="id_card" label="身份证号" min-width="180" />
            <el-table-column prop="company_name" label="企业" min-width="170" />
            <el-table-column prop="job_name" label="岗位" min-width="150" />
            <el-table-column label="入职日期" width="130">
              <template #default="{ row }"><BeijingDateTime :value="row.join_date" format="YYYY-MM-DD" /></template>
            </el-table-column>
            <el-table-column prop="uninsured_reason" label="原因" min-width="180" />
            <el-table-column label="操作" width="100" fixed="right">
              <template #default="{ row }">
                <el-button size="small" type="success" plain @click="openSingleAddDialog(row)">投保</el-button>
              </template>
            </el-table-column>
          </el-table>
          <el-pagination
            class="table-pagination"
            layout="prev, pager, next, jumper, total"
            :total="uninsuredTotal"
            :page-size="uninsuredPageSize"
            v-model:current-page="uninsuredPage"
            @current-change="loadUninsuredEmployees"
          />
        </section>
      </el-tab-pane>

      <el-tab-pane label="投保变更记录" name="pending">
        <section class="panel">
          <div class="toolbar">
            <el-select v-model="pendingStatusFilter" class="small-select" @change="handlePendingFilterChange">
              <el-option label="全部" value="all" />
              <el-option label="加保" value="add" />
              <el-option label="减保" value="off" />
            </el-select>
            <el-input
              v-model="pendingNameKeyword"
              clearable
              placeholder="筛选保单/方案/备注"
              class="wide-select"
              @keyup.enter="handlePendingFilterChange"
              @clear="handlePendingFilterChange"
            />
            <el-button @click="handlePendingFilterChange">筛选</el-button>
            <el-button type="primary" :loading="loading.pending" @click="loadPendingInsuranceChanges">刷新</el-button>
            <span class="hint inline-hint">云工保变更记录 {{ pendingTotal }} 条</span>
          </div>
          <el-table :data="pendingRows" height="460" stripe empty-text="暂无投保变更记录">
            <el-table-column prop="policy_change_id" label="变更单" width="110" />
            <el-table-column label="类型" width="90">
              <template #default="{ row }">
                <el-tag :type="row.operation_type === 'add' ? 'success' : 'warning'">
                  {{ row.type_text || row.type || '-' }}
                </el-tag>
              </template>
            </el-table-column>
            <el-table-column prop="plan" label="方案" min-width="180" />
            <el-table-column prop="policy_id" label="保单ID" width="100" />
            <el-table-column prop="person_count" label="人数" width="80" />
            <el-table-column label="保费" width="100">
              <template #default="{ row }">{{ formatProviderMoney(row.premium) }}</template>
            </el-table-column>
            <el-table-column label="生效时间" width="170">
              <template #default="{ row }"><BeijingDateTime :value="row.start_date" format="YYYY-MM-DD" /></template>
            </el-table-column>
            <el-table-column label="保障结束" width="170">
              <template #default="{ row }"><BeijingDateTime :value="row.end_date" format="YYYY-MM-DD" /></template>
            </el-table-column>
            <el-table-column prop="source" label="来源" width="120" />
            <el-table-column label="状态" width="130">
              <template #default="{ row }">{{ formatProviderChangeStatus(row) }}</template>
            </el-table-column>
            <el-table-column label="提交时间" width="190">
              <template #default="{ row }"><BeijingDateTime :value="row.create_time || row.created_at" /></template>
            </el-table-column>
            <el-table-column label="操作" width="100" fixed="right">
              <template #default="{ row }">
                <el-button size="small" type="primary" plain @click="openProviderChangeDetail(row)">详情</el-button>
              </template>
            </el-table-column>
          </el-table>
          <el-pagination
            class="table-pagination"
            layout="prev, pager, next, jumper, total"
            :total="pendingTotal"
            :page-size="pendingPageSize"
            v-model:current-page="pendingPage"
            @current-change="loadPendingInsuranceChanges"
          />
        </section>
      </el-tab-pane>

      <el-tab-pane label="异常队列" name="exceptions">
        <section class="panel">
          <div class="toolbar">
            <el-button :loading="loading.exceptions" @click="loadExceptions">刷新</el-button>
            <span class="hint inline-hint">异常队列共 {{ exceptionsTotal }} 条，当前显示最近 {{ exceptionsPageSize }} 条</span>
          </div>
          <el-table v-loading="loading.exceptions" :data="exceptions" height="460" stripe empty-text="暂无异常记录">
            <el-table-column prop="name_snapshot" label="姓名" width="120" />
            <el-table-column prop="policy_id" label="保单" width="110" />
            <el-table-column prop="status" label="状态" width="120" />
            <el-table-column prop="last_error" label="异常原因" min-width="240" />
            <el-table-column label="同步时间" width="180">
              <template #default="{ row }"><BeijingDateTime :value="row.last_synced_at || row.updated_at || row.created_at" /></template>
            </el-table-column>
          </el-table>
          <el-pagination
            class="table-pagination"
            layout="prev, pager, next, jumper, total"
            :total="exceptionsTotal"
            :page-size="exceptionsPageSize"
            v-model:current-page="exceptionsPage"
            @current-change="loadExceptions"
          />
        </section>
      </el-tab-pane>

      <el-tab-pane label="企业岗位映射" name="mapping">
        <section class="panel">
          <div class="toolbar">
            <CompanySelect v-model="mappingFilterCompanyId" placeholder="按企业筛选" width="320px" />
            <el-button type="primary" @click="openCreateJobMappingDialog">新增映射</el-button>
            <span class="hint inline-hint">已保存完整映射 {{ filteredJobMappings.length }} 条</span>
          </div>
          <el-table :data="filteredJobMappings" height="460" stripe empty-text="暂无岗位映射">
            <el-table-column label="本地企业" min-width="160">
              <template #default="{ row }">{{ resolveCompanyName(row) }}</template>
            </el-table-column>
            <el-table-column prop="job_name_snapshot" label="本地岗位" min-width="150" />
            <el-table-column prop="work_company_name" label="保险企业" min-width="180" />
            <el-table-column prop="occupation_name" label="保险工种" min-width="190" />
            <el-table-column label="保单" min-width="170">
              <template #default="{ row }">{{ resolvePolicyName(row) }}</template>
            </el-table-column>
            <el-table-column prop="mapping_status" label="状态" width="90" />
            <el-table-column label="操作" width="100" fixed="right">
              <template #default="{ row }">
                <el-button size="small" type="primary" plain @click="openEditJobMappingDialog(row)">编辑</el-button>
              </template>
            </el-table-column>
          </el-table>
        </section>
      </el-tab-pane>

      <el-tab-pane label="保单管理" name="policies">
        <section class="panel">
          <div class="toolbar">
            <el-button type="primary" :loading="loading.syncPolicies" @click="syncPolicies">同步完整保单</el-button>
            <el-button :loading="loading.syncActive" @click="syncActivePolicies">同步可操作保单</el-button>
            <el-select v-model="selectedPolicyId" filterable placeholder="选择保单" class="wide-select">
              <el-option
                v-for="policy in activePolicies"
                :key="policy.policy_id"
                :label="`${policy.plan_name || policy.policy_id} / ${policy.policy_id}`"
                :value="policy.policy_id"
              />
            </el-select>
            <el-button :disabled="!selectedPolicyId" :loading="loading.syncRelated" @click="syncSelectedPolicyData">同步该保单单位/工种/人员</el-button>
          </div>
          <el-table :data="policies" stripe height="430">
            <el-table-column prop="policy_id" label="保单ID" width="100" />
            <el-table-column prop="plan_name" label="方案" min-width="190" />
            <el-table-column prop="series" label="Series" width="100" />
            <el-table-column prop="price" label="价格" width="90" />
            <el-table-column label="开始" width="120">
              <template #default="{ row }"><BeijingDateTime :value="row.start_date" format="YYYY-MM-DD" /></template>
            </el-table-column>
            <el-table-column label="结束" width="120">
              <template #default="{ row }"><BeijingDateTime :value="row.end_date" format="YYYY-MM-DD" /></template>
            </el-table-column>
            <el-table-column prop="active_count" label="在保" width="80" />
            <el-table-column prop="total_person_count" label="总人数" width="90" />
            <el-table-column prop="is_active" label="生效" width="80">
              <template #default="{ row }"><el-tag :type="Number(row.is_active) ? 'success' : 'info'">{{ Number(row.is_active) ? '是' : '否' }}</el-tag></template>
            </el-table-column>
          </el-table>
        </section>
      </el-tab-pane>
    </el-tabs>

    <el-dialog v-model="offDialogVisible" title="确认减保" width="420px">
      <el-form label-width="90px">
        <el-form-item label="失效日期">
          <el-date-picker
            v-model="offEffectiveDate"
            value-format="YYYY-MM-DD"
            type="date"
            :disabled-date="disableBeforeToday"
            class="full"
          />
        </el-form-item>
      </el-form>
      <div class="hint">将对 {{ offTargetRows.length }} 名在保人员提交减保，最早可选择今天。</div>
      <template #footer>
        <el-button @click="offDialogVisible = false">取消</el-button>
        <el-button type="danger" :loading="loading.offSelected" @click="submitSelectedOff">确定减保</el-button>
      </template>
    </el-dialog>

    <el-dialog v-model="addDialogVisible" title="确认投保" width="420px">
      <el-form label-width="90px">
        <el-form-item label="生效日期">
          <el-date-picker
            v-model="addEffectiveDate"
            value-format="YYYY-MM-DD"
            type="date"
            :disabled-date="disableBeforeTomorrow"
            class="full"
          />
        </el-form-item>
      </el-form>
      <div class="hint">将对 {{ addTargetRows.length }} 名未承保人员按岗位映射投保；没有有效映射的人员会自动跳过。</div>
      <template #footer>
        <el-button @click="addDialogVisible = false">取消</el-button>
        <el-button type="success" :loading="loading.addSelected" @click="submitSelectedAdd">确定投保</el-button>
      </template>
    </el-dialog>

    <el-dialog v-model="providerChangeDetailVisible" title="投保变更详情" width="960px">
      <el-descriptions :column="2" border>
        <el-descriptions-item label="变更单">{{ providerChangeDetail.policy_change_id || '-' }}</el-descriptions-item>
        <el-descriptions-item label="类型">{{ providerChangeDetail.type_text || providerChangeDetail.type || '-' }}</el-descriptions-item>
        <el-descriptions-item label="方案">{{ providerChangeDetail.plan || '-' }}</el-descriptions-item>
        <el-descriptions-item label="人数">{{ providerChangeDetail.person_count || 0 }}</el-descriptions-item>
        <el-descriptions-item label="保费">{{ formatProviderMoney(providerChangeDetail.premium) }}</el-descriptions-item>
        <el-descriptions-item label="状态">{{ formatProviderChangeStatus(providerChangeDetail) }}</el-descriptions-item>
        <el-descriptions-item label="生效时间"><BeijingDateTime :value="providerChangeDetail.start_date" /></el-descriptions-item>
        <el-descriptions-item label="提交时间"><BeijingDateTime :value="providerChangeDetail.create_time || providerChangeDetail.created_at" /></el-descriptions-item>
        <el-descriptions-item label="备注" :span="2">{{ providerChangeDetail.remark || '-' }}</el-descriptions-item>
      </el-descriptions>
      <el-table
        v-if="(providerChangeDetail.work_company || []).length"
        class="detail-table"
        :data="providerChangeDetail.work_company"
        stripe
      >
        <el-table-column prop="work_company" label="派遣单位" min-width="220" />
        <el-table-column prop="count" label="人数" width="100" />
      </el-table>
      <div class="detail-section-title">人员明细（{{ providerChangeDetail.persons_total || (providerChangeDetail.persons || []).length || 0 }} 人）</div>
      <el-table
        class="detail-table"
        :data="providerChangeDetail.persons || []"
        max-height="360"
        stripe
        empty-text="暂无人员明细"
      >
        <el-table-column prop="name" label="姓名" width="110" />
        <el-table-column prop="idcard" label="身份证" width="180" />
        <el-table-column prop="work_company" label="派遣单位" min-width="220" />
        <el-table-column prop="occupation_name" label="工种" min-width="220" />
        <el-table-column prop="occupation_category" label="类别" width="80" />
        <el-table-column prop="operation" label="操作" width="90" />
        <el-table-column prop="employee_id" label="云工保员工ID" width="130" />
      </el-table>
    </el-dialog>

    <el-dialog v-model="mappingDialogVisible" :title="mappingDialogTitle" width="860px">
      <el-form label-width="110px" :model="jobMappingForm">
        <div class="mapping-grid">
          <div>
            <div class="sub-title">本地信息</div>
            <el-form-item label="HR企业">
              <CompanySelect v-model="jobMappingForm.company_id" width="100%" @change="onJobCompanyChange" />
            </el-form-item>
            <el-form-item label="岗位">
              <el-select v-model="jobMappingForm.job_id" filterable class="full" @change="fillJobName">
                <el-option v-for="job in jobs" :key="job._id" :label="job.position" :value="job._id" />
              </el-select>
            </el-form-item>
          </div>
          <div>
            <div class="sub-title">保险信息</div>
            <el-form-item label="保单">
              <el-select v-model="jobMappingForm.policy_id" filterable class="full" @change="loadPolicyOptions">
                <el-option v-for="policy in activePolicies" :key="policy.policy_id" :label="`${policy.plan_name} / ${policy.policy_id}`" :value="policy.policy_id" />
              </el-select>
            </el-form-item>
            <el-form-item label="派遣单位">
              <el-select v-model="jobMappingForm.work_company_id" filterable class="full" @change="fillJobWorkCompany">
                <el-option v-for="company in workCompanies" :key="company.work_company_id" :label="company.name" :value="company.work_company_id" />
              </el-select>
            </el-form-item>
            <el-form-item label="工种">
              <el-select v-model="jobMappingForm.occupation_id" filterable class="full" @change="fillOccupation">
                <el-option
                  v-for="occupation in filteredJobOccupations"
                  :key="occupation.occupation_id"
                  :label="`${occupation.show_name || occupation.name} / ${occupation.occupation_id}`"
                  :value="occupation.occupation_id"
                />
              </el-select>
            </el-form-item>
          </div>
        </div>
      </el-form>
      <template #footer>
        <el-button @click="mappingDialogVisible = false">取消</el-button>
        <el-button type="primary" :loading="loading.mapping" @click="saveJobMapping">保存映射</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, reactive, ref } from 'vue';
import { ElMessage } from 'element-plus';
import { insuranceApi } from '@/api/modules/insurance';
import { companiesApi } from '@/api/modules/companies';
import { jobsApi } from '@/api/modules/jobs';
import BeijingDateTime from '@/components/common/BeijingDateTime.vue';

const activeTab = ref('covered');
const selectedPolicyId = ref('');
const overview = ref<any>({});
const jobMappingForm = reactive<any>({ company_id: '', job_id: '', job_name_snapshot: '', rate_plan_id: '', policy_id: '', work_company_id: '', work_company_name: '', occupation_id: '', occupation_name: '', occupation_category: 0, series: '' });

const loading = reactive<Record<string, boolean>>({});
const policies = ref<any[]>([]);
const activePolicies = ref<any[]>([]);
const workCompanies = ref<any[]>([]);
const occupations = ref<any[]>([]);
const records = ref<any[]>([]);
const recordsTotal = ref(0);
const recordsPage = ref(1);
const recordsPageSize = 20;
const recordsNameKeyword = ref('');
const recordsWorkCompanyKeyword = ref('');
const uninsuredRows = ref<any[]>([]);
const uninsuredTotal = ref(0);
const uninsuredPage = ref(1);
const uninsuredPageSize = 20;
const uninsuredCompanyId = ref('');
const uninsuredNameKeyword = ref('');
const pendingRows = ref<any[]>([]);
const pendingTotal = ref(0);
const pendingPage = ref(1);
const pendingPageSize = 15;
const pendingStatusFilter = ref('all');
const pendingNameKeyword = ref('');
const exceptions = ref<any[]>([]);
const exceptionsTotal = ref(0);
const exceptionsPage = ref(1);
const exceptionsPageSize = 20;
const jobMappings = ref<any[]>([]);
const mappingFilterCompanyId = ref('');
const mappingDialogVisible = ref(false);
const mappingDialogMode = ref<'create' | 'edit'>('create');
const companies = ref<any[]>([]);
const jobs = ref<any[]>([]);
const selectedCoveredRows = ref<any[]>([]);
const selectedUninsuredRows = ref<any[]>([]);
const offTargetRows = ref<any[]>([]);
const addTargetRows = ref<any[]>([]);
const offDialogVisible = ref(false);
const addDialogVisible = ref(false);
const providerChangeDetailVisible = ref(false);
const providerChangeDetail = ref<any>({});
const offEffectiveDate = ref(getTodayStr());
const addEffectiveDate = ref(getTomorrowStr());

const stats = computed(() => [
  { label: '账户余额', value: formatBalance(overview.value.account_balance), tone: 'money' },
  { label: '完整保单', value: overview.value.policy_count || 0, tone: 'policy' },
  { label: '可操作保单', value: overview.value.active_policy_count || 0, tone: 'active' },
  { label: '在保人数', value: overview.value.active_count || 0, tone: 'covered' },
  { label: '变更记录', value: overview.value.provider_change_count || 0, tone: 'add' },
  { label: '本地在保', value: overview.value.local_active_count || 0, tone: 'off' },
  { label: '失败', value: overview.value.failed_count || 0, tone: 'failed' },
  { label: '异常', value: overview.value.exception_count || 0, tone: 'exception' }
]);

function formatBalance(value: any) {
  if (value === null || value === undefined || value === '') return '未返回';
  const num = Number(value);
  if (!Number.isFinite(num)) return String(value);
  return `¥${num.toFixed(2)}`;
}

function formatProviderMoney(value: any) {
  const num = Number(value || 0);
  if (!Number.isFinite(num)) return '-';
  return `¥${num.toFixed(2)}`;
}

function formatProviderChangeStatus(row: any) {
  const status = row?.status_code ?? row?.status;
  const progress = row?.progress_status_code ?? row?.progress_status;
  const remark = normalizeText(row?.progress_remark);
  return remark || `状态 ${status ?? '-'} / 进度 ${progress ?? '-'}`;
}

function formatLocalDateString(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function getTomorrowStr() {
  const date = new Date();
  date.setDate(date.getDate() + 1);
  return formatLocalDateString(date);
}

function disableBeforeTomorrow(time: Date) {
  const tomorrow = new Date(getTomorrowStr());
  tomorrow.setHours(0, 0, 0, 0);
  return time.getTime() < tomorrow.getTime();
}

function disableBeforeToday(time: Date) {
  const today = new Date(getTodayStr());
  today.setHours(0, 0, 0, 0);
  return time.getTime() < today.getTime();
}

function normalizeText(value: any) {
  return String(value || '').trim();
}

function getTodayStr() {
  return formatLocalDateString(new Date());
}

const filteredJobOccupations = computed(() => {
  const company = workCompanies.value.find((item) => item.work_company_id === jobMappingForm.work_company_id);
  const allowed = String(company?.occupation_ids || '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
  if (!allowed.length) return occupations.value;
  return occupations.value.filter((occupation) => allowed.includes(String(occupation.occupation_id)));
});

const filteredJobMappings = computed(() => {
  if (!mappingFilterCompanyId.value) return jobMappings.value;
  return jobMappings.value.filter((mapping) => sameId(mapping.company_id, mappingFilterCompanyId.value));
});

const mappingDialogTitle = computed(() => mappingDialogMode.value === 'edit' ? '编辑企业岗位映射' : '新增企业岗位映射');

function sameId(left: any, right: any) {
  return String(left || '') === String(right || '');
}

function resolveCompanyName(row: any) {
  return row.company_name_snapshot || companies.value.find((company) => sameId(company._id, row.company_id))?.name || row.company_id || '-';
}

function resolvePolicyName(row: any) {
  return row.policy_name || row.plan_name || activePolicies.value.find((policy) => sameId(policy.policy_id, row.policy_id))?.plan_name || row.policy_id || '-';
}

function resetJobMappingForm() {
  Object.assign(jobMappingForm, {
    _id: '',
    company_id: '',
    company_name_snapshot: '',
    job_id: '',
    job_name_snapshot: '',
    rate_plan_id: '',
    policy_id: '',
    policy_name: '',
    work_company_id: '',
    work_company_name: '',
    occupation_id: '',
    occupation_name: '',
    occupation_category: 0,
    series: '',
    mapping_status: 'active'
  });
  jobs.value = [];
  workCompanies.value = [];
  occupations.value = [];
}

function setLoading(key: string, value: boolean) {
  loading[key] = value;
}

async function run(key: string, fn: () => Promise<void>, successText?: string) {
  setLoading(key, true);
  try {
    await fn();
    if (successText) ElMessage.success(successText);
  } catch (err: any) {
    ElMessage.error(err?.message || '操作失败');
  } finally {
    setLoading(key, false);
  }
}

async function loadPolicies() {
  const [full, active] = await Promise.all([
    insuranceApi.listPolicies({ page: 1, pageSize: 100 }),
    insuranceApi.listActivePolicies({ page: 1, pageSize: 100 })
  ]);
  policies.value = full?.list || [];
  activePolicies.value = active?.list || [];
  if (!selectedPolicyId.value && activePolicies.value.length) selectedPolicyId.value = activePolicies.value[0].policy_id;
}

async function loadOverview() {
  overview.value = await insuranceApi.getOverview() || {};
}

async function refreshProviderAccount() {
  await insuranceApi.login();
}

async function loadAuxiliary() {
  const [jobMappingRes, companyRes] = await Promise.all([
    insuranceApi.listJobMappings({ page: 1, pageSize: 100 }),
    companiesApi.getList({ page: 1, pageSize: 100 })
  ]);
  jobMappings.value = jobMappingRes?.list || [];
  companies.value = companyRes?.list || [];
  await loadInsuranceRecords();
}

async function loadExceptions() {
  await run('exceptions', async () => {
    const res = await insuranceApi.listExceptions({
      page: exceptionsPage.value,
      pageSize: exceptionsPageSize,
      orderBy: 'updated_at',
      order: 'desc'
    });
    exceptions.value = res?.list || [];
    exceptionsTotal.value = res?.total || 0;
  });
}

async function loadInsuranceRecords() {
  const allRecords = await fetchAllInsuranceRecords({ status: 'active' });
  const nameKeyword = normalizeText(recordsNameKeyword.value);
  const workCompanyKeyword = normalizeText(recordsWorkCompanyKeyword.value);
  const filtered = allRecords.filter((record) => {
    const nameMatched = !nameKeyword || normalizeText(record.name_snapshot || record.name).includes(nameKeyword);
    const companyMatched = !workCompanyKeyword || normalizeText(record.work_company).includes(workCompanyKeyword);
    return nameMatched && companyMatched;
  });
  recordsTotal.value = filtered.length;
  const start = (recordsPage.value - 1) * recordsPageSize;
  records.value = filtered.slice(start, start + recordsPageSize);
}

async function fetchAllInsuranceRecords(where: Record<string, any>) {
  const pageSize = 100;
  let page = 1;
  let totalPages = 1;
  const list: any[] = [];
  do {
    const res = await insuranceApi.listInsuranceRecords({ page, pageSize, where });
    list.push(...(res?.list || []));
    totalPages = res?.totalPages || 1;
    page += 1;
  } while (page <= totalPages);
  return list;
}

async function loadUninsuredEmployees() {
  await run('uninsured', async () => {
    const res = await insuranceApi.listUninsuredEmployees({
      page: uninsuredPage.value,
      pageSize: uninsuredPageSize,
      company_id: uninsuredCompanyId.value || undefined,
      name: normalizeText(uninsuredNameKeyword.value) || undefined
    });
    uninsuredRows.value = res?.list || [];
    uninsuredTotal.value = res?.total || 0;
  });
}

function handleUninsuredFilterChange() {
  uninsuredPage.value = 1;
  void loadUninsuredEmployees();
}

function handleRecordsFilterChange() {
  recordsPage.value = 1;
  void loadInsuranceRecords();
}

async function loadPendingInsuranceChanges() {
  await run('pending', async () => {
    const res = await insuranceApi.listProviderChangeRecords({
      page: pendingPage.value,
      pageSize: pendingPageSize,
      type: pendingStatusFilter.value === 'all' ? '' : pendingStatusFilter.value,
      keyword: normalizeText(pendingNameKeyword.value)
    });
    pendingRows.value = res?.list || [];
    pendingTotal.value = res?.total || 0;
  });
}

function handlePendingFilterChange() {
  pendingPage.value = 1;
  void loadPendingInsuranceChanges();
}

async function openProviderChangeDetail(row: any) {
  await run('changeDetail', async () => {
    const id = row.policy_change_id || row.provider_change_id;
    if (!id) throw new Error('缺少云工保变更单ID');
    providerChangeDetail.value = await insuranceApi.getProviderChangeDetail(String(id)) || {};
    providerChangeDetailVisible.value = true;
  });
}

async function loadAll() {
  if (loading.overview) return;
  await run('overview', async () => {
    await refreshProviderAccount();
    await Promise.all([loadOverview(), loadPolicies(), loadAuxiliary()]);
    if (activeTab.value === 'exceptions') await loadExceptions();
  });
}

function handleInsuranceMenuEnter() {
  void loadAll();
}

function handleTabChange(name: string | number) {
  if (name === 'covered' && records.value.length === 0) {
    recordsPage.value = 1;
    void loadInsuranceRecords();
  }
  if (name === 'uninsured' && uninsuredRows.value.length === 0) {
    uninsuredPage.value = 1;
    void loadUninsuredEmployees();
  }
  if (name === 'pending' && pendingRows.value.length === 0) {
    pendingPage.value = 1;
    void loadPendingInsuranceChanges();
  }
  if (name === 'exceptions' && exceptions.value.length === 0) {
    exceptionsPage.value = 1;
    void loadExceptions();
  }
}

async function syncPolicies() {
  await run('syncPolicies', async () => {
    await insuranceApi.syncPolicies();
    await loadPolicies();
    await loadOverview();
  }, '完整保单已同步');
}

async function syncActivePolicies() {
  await run('syncActive', async () => {
    await insuranceApi.syncActivePolicies();
    await loadPolicies();
    await loadOverview();
  }, '可操作保单已同步');
}

async function loadPolicyOptions(policyId?: string) {
  const id = policyId || jobMappingForm.policy_id || selectedPolicyId.value;
  if (!id) return;
  let [companyRes, occupationRes] = await Promise.all([
    insuranceApi.listWorkCompanies({ page: 1, pageSize: 100, where: { policy_id: id } }),
    insuranceApi.listOccupations({ page: 1, pageSize: 100, where: { policy_id: id } })
  ]);
  if (!(companyRes?.list || []).length) {
    await insuranceApi.syncWorkCompanies(id);
    companyRes = await insuranceApi.listWorkCompanies({ page: 1, pageSize: 100, where: { policy_id: id } });
    occupationRes = await insuranceApi.listOccupations({ page: 1, pageSize: 100, where: { policy_id: id } });
  }
  if (!(occupationRes?.list || []).length) {
    await insuranceApi.syncWorkCompanies(id);
    occupationRes = await insuranceApi.listOccupations({ page: 1, pageSize: 100, where: { policy_id: id } });
  }
  workCompanies.value = companyRes?.list || [];
  occupations.value = occupationRes?.list || [];
}

async function syncSelectedPolicyData() {
  if (!selectedPolicyId.value) return;
  await run('syncRelated', async () => {
    await insuranceApi.syncWorkCompanies(selectedPolicyId.value);
    await insuranceApi.syncOccupations(selectedPolicyId.value);
    await insuranceApi.syncPolicyPersons(selectedPolicyId.value);
    await loadPolicyOptions(selectedPolicyId.value);
    await loadAuxiliary();
  }, '保单相关数据已同步');
}

async function syncSelectedPolicyPersons() {
  if (!selectedPolicyId.value) return;
  await run('syncRelated', async () => {
    await insuranceApi.syncPolicyPersons(selectedPolicyId.value);
    recordsPage.value = 1;
    await loadOverview();
    await loadAuxiliary();
  }, '保单人员已同步');
}

async function syncAllActivePolicyPersons() {
  await run('syncAllPersons', async () => {
    for (const policy of activePolicies.value) {
      await insuranceApi.syncPolicyPersons(policy.policy_id);
    }
    recordsPage.value = 1;
    await loadOverview();
    await loadAuxiliary();
  }, `已同步 ${activePolicies.value.length} 张可操作保单的在保人员`);
}

async function onJobCompanyChange(companyId: string) {
  const company = companies.value.find((item) => item._id === companyId);
  jobMappingForm.company_name_snapshot = company?.name || '';
  jobMappingForm.job_id = '';
  jobMappingForm.job_name_snapshot = '';
  jobMappingForm.rate_plan_id = '';
  await loadJobsForCompany(companyId);
}

async function loadJobsForCompany(companyId: string) {
  if (!companyId) {
    jobs.value = [];
    return;
  }
  const res = await jobsApi.getList({ page: 1, pageSize: 500, company_id: companyId });
  const list = res.list || [];
  jobs.value = list.filter((job: any) => sameId(job.company_id || job.companyId, companyId));
}

function fillJobName(id: string) {
  const job = jobs.value.find((item) => item._id === id);
  jobMappingForm.job_name_snapshot = job?.position || '';
  jobMappingForm.rate_plan_id = job?.rate_plan_id || '';
}

function fillPolicyName() {
  const policy = activePolicies.value.find((item) => sameId(item.policy_id, jobMappingForm.policy_id));
  jobMappingForm.policy_name = policy?.plan_name || policy?.plan || '';
}

function fillJobWorkCompany(id: string) {
  const item = workCompanies.value.find((company) => company.work_company_id === id);
  jobMappingForm.work_company_name = item?.name || '';
  if (jobMappingForm.occupation_id && !filteredJobOccupations.value.some((occupation) => occupation.occupation_id === jobMappingForm.occupation_id)) {
    jobMappingForm.occupation_id = '';
    jobMappingForm.occupation_name = '';
    jobMappingForm.occupation_category = 0;
    jobMappingForm.series = '';
  }
}

function fillOccupation(id: string) {
  const item = occupations.value.find((occupation) => occupation.occupation_id === id);
  jobMappingForm.occupation_name = item?.show_name || item?.name || '';
  jobMappingForm.occupation_category = item?.category || 0;
  jobMappingForm.series = item?.series || '';
}

async function saveJobMapping() {
  await run('mapping', async () => {
    const missing = [
      !jobMappingForm.company_id && 'HR企业',
      !jobMappingForm.job_id && '岗位',
      !jobMappingForm.policy_id && '保单',
      !jobMappingForm.work_company_id && '派遣单位',
      !jobMappingForm.occupation_id && '工种'
    ].filter(Boolean);
    if (missing.length) throw new Error(`请先选择${missing.join('、')}`);
    fillPolicyName();
    await insuranceApi.saveCompanyMapping({
      company_id: jobMappingForm.company_id,
      company_name_snapshot: jobMappingForm.company_name_snapshot,
      policy_id: jobMappingForm.policy_id,
      work_company_id: jobMappingForm.work_company_id,
      work_company_name: jobMappingForm.work_company_name
    });
    await insuranceApi.saveJobMapping({
      ...jobMappingForm,
      company_name_snapshot: resolveCompanyName(jobMappingForm),
      policy_name: resolvePolicyName(jobMappingForm)
    });
    mappingDialogVisible.value = false;
    await loadAuxiliary();
  }, '完整映射已保存');
}

function openCreateJobMappingDialog() {
  mappingDialogMode.value = 'create';
  resetJobMappingForm();
  mappingDialogVisible.value = true;
}

async function openEditJobMappingDialog(row: any) {
  mappingDialogMode.value = 'edit';
  resetJobMappingForm();
  Object.assign(jobMappingForm, {
    ...row,
    company_id: row.company_id || '',
    company_name_snapshot: resolveCompanyName(row),
    job_id: row.job_id || '',
    job_name_snapshot: row.job_name_snapshot || '',
    rate_plan_id: row.rate_plan_id || '',
    policy_id: row.policy_id || '',
    policy_name: resolvePolicyName(row),
    work_company_id: row.work_company_id || '',
    work_company_name: row.work_company_name || '',
    occupation_id: row.occupation_id || '',
    occupation_name: row.occupation_name || '',
    occupation_category: row.occupation_category || 0,
    series: row.series || '',
    mapping_status: row.mapping_status || 'active'
  });
  mappingDialogVisible.value = true;
  if (jobMappingForm.company_id) await loadJobsForCompany(jobMappingForm.company_id);
  if (jobMappingForm.policy_id) await loadPolicyOptions(jobMappingForm.policy_id);
}

function handleCoveredSelectionChange(rows: any[]) {
  selectedCoveredRows.value = rows;
}

function handleUninsuredSelectionChange(rows: any[]) {
  selectedUninsuredRows.value = rows;
}

function openSingleOffDialog(row: any) {
  offTargetRows.value = [row];
  offEffectiveDate.value = getTodayStr();
  offDialogVisible.value = true;
}

function openBatchOffDialog() {
  if (!selectedCoveredRows.value.length) {
    ElMessage.warning('请先选择要减保的人员');
    return;
  }
  offTargetRows.value = [...selectedCoveredRows.value];
  offEffectiveDate.value = getTodayStr();
  offDialogVisible.value = true;
}

function openSingleAddDialog(row: any) {
  addTargetRows.value = [row];
  addEffectiveDate.value = getTomorrowStr();
  addDialogVisible.value = true;
}

function openBatchAddDialog() {
  if (!selectedUninsuredRows.value.length) {
    ElMessage.warning('请先选择要投保的人员');
    return;
  }
  addTargetRows.value = [...selectedUninsuredRows.value];
  addEffectiveDate.value = getTomorrowStr();
  addDialogVisible.value = true;
}

function ensureFutureDate(value: string, label: string) {
  if (!value) throw new Error(`请选择${label}`);
  if (value < getTomorrowStr()) throw new Error(`${label}最早只能选择明天`);
}

function ensureTodayOrFutureDate(value: string, label: string) {
  if (!value) throw new Error(`请选择${label}`);
  if (value < getTodayStr()) throw new Error(`${label}最早只能选择今天`);
}

function findOffCandidate(row: any, candidates: any[]) {
  return candidates.find((item) => sameId(item.policy_person_id, row.policy_person_id)) ||
    candidates.find((item) => sameId(item.employee_id, row.employee_id) && normalizeText(item.name) === normalizeText(row.name_snapshot)) ||
    candidates.find((item) => normalizeText(item.name) === normalizeText(row.name_snapshot) && normalizeText(item.work_company) === normalizeText(row.work_company));
}

async function buildOffPerson(row: any, candidateCache: Map<string, any[]>) {
  if (!row.policy_id) throw new Error(`${row.name_snapshot || '人员'}缺少保单ID`);
  const policyId = String(row.policy_id);
  if (!candidateCache.has(policyId)) {
    const res = await insuranceApi.syncOffEmployees(policyId);
    candidateCache.set(policyId, res?.list || []);
  }
  const candidate = findOffCandidate(row, candidateCache.get(policyId) || []);
  if (!candidate?.idcard && !row.idcard) throw new Error(`${row.name_snapshot || '人员'}未在可减保列表中匹配到完整身份证`);
  return {
    policy_id: row.policy_id,
    person: {
      policy_person_id: candidate?.policy_person_id || row.policy_person_id,
      employee_id: candidate?.employee_id || row.employee_id,
      name: candidate?.name || row.name_snapshot,
      idcard: candidate?.idcard || row.idcard
    }
  };
}

async function submitSelectedOff() {
  await run('offSelected', async () => {
    ensureTodayOrFutureDate(offEffectiveDate.value, '失效日期');
    const rows = offTargetRows.value;
    if (!rows.length) throw new Error('请选择要减保的人员');
    let success = 0;
    const failed: string[] = [];
    const candidateCache = new Map<string, any[]>();
    const groupedPayloads = new Map<string, Array<{ row: any; person: any }>>();

    for (const row of rows) {
      try {
        const payload = await buildOffPerson(row, candidateCache);
        const policyId = String(payload.policy_id || '');
        if (!groupedPayloads.has(policyId)) groupedPayloads.set(policyId, []);
        groupedPayloads.get(policyId)!.push({ row, person: payload.person });
      } catch (err: any) {
        failed.push(`${row.name_snapshot || row.name || '未知人员'}：${err?.message || '减保失败'}`);
      }
    }

    for (const [policyId, payloads] of groupedPayloads.entries()) {
      try {
        await insuranceApi.offInsurance({
          policy_id: policyId,
          start_date: offEffectiveDate.value,
          persons: payloads.map((item) => item.person)
        });
        success += payloads.length;
      } catch (err: any) {
        payloads.forEach(({ row }) => {
          failed.push(`${row.name_snapshot || row.name || '未知人员'}：${err?.message || '减保失败'}`);
        });
      }
    }

    offDialogVisible.value = false;
    selectedCoveredRows.value = [];
    recordsPage.value = 1;
    await loadOverview();
    await loadInsuranceRecords();
    if (failed.length) {
      ElMessage.warning(`减保成功 ${success} 人，失败 ${failed.length} 人：${failed.slice(0, 3).join('；')}`);
      return;
    }
    ElMessage.success(`减保已提交 ${success} 人`);
  });
}

function findLocalJobMapping(employee: any) {
  const companyId = normalizeText(employee.company_id);
  const jobId = normalizeText(employee.job_id);
  const ratePlanId = normalizeText(employee.rate_plan_id);
  return jobMappings.value.find((mapping) =>
    normalizeText(mapping.mapping_status) === 'active' &&
    sameId(mapping.company_id, companyId) &&
    (
      (jobId && sameId(mapping.job_id, jobId)) ||
      (ratePlanId && sameId(mapping.rate_plan_id, ratePlanId))
    )
  );
}

async function findActiveJobMapping(employee: any) {
  const local = findLocalJobMapping(employee);
  if (local) return local;
  const companyId = normalizeText(employee.company_id);
  const jobId = normalizeText(employee.job_id);
  const ratePlanId = normalizeText(employee.rate_plan_id);
  const candidates = [
    jobId ? { company_id: companyId, job_id: jobId, mapping_status: 'active' } : null,
    ratePlanId ? { company_id: companyId, rate_plan_id: ratePlanId, mapping_status: 'active' } : null
  ].filter(Boolean) as Record<string, any>[];
  for (const where of candidates) {
    const res = await insuranceApi.listJobMappings({ page: 1, pageSize: 1, where });
    if (res?.list?.length) return res.list[0];
  }
  return null;
}

function groupByAddPayload(items: any[]) {
  const map = new Map<string, { policy_id: string; persons: any[] }>();
  for (const item of items) {
    const key = [item.mapping.policy_id, item.mapping.work_company_name, item.mapping.occupation_id].join('|');
    const current = map.get(key) || { policy_id: item.mapping.policy_id, persons: [] };
    current.persons.push({
      name: item.employee.name,
      idcard: item.employee.id_card,
      work_company: item.mapping.work_company_name,
      occupation_id: item.mapping.occupation_id,
      employee_id: item.employee.employee_id || item.employee._id || item.employee.id,
      employee_company_id: item.employee.relation_id || item.employee._id || ''
    });
    map.set(key, current);
  }
  return [...map.values()];
}

async function submitSelectedAdd() {
  await run('addSelected', async () => {
    ensureFutureDate(addEffectiveDate.value, '生效日期');
    const rows = addTargetRows.value;
    if (!rows.length) throw new Error('请选择要投保的人员');
    const ready: any[] = [];
    const skipped: string[] = [];
    for (const employee of rows) {
      const mapping = await findActiveJobMapping(employee);
      if (!mapping) {
        skipped.push(`${employee.name || '未知人员'}：岗位没有对应的保险映射`);
        continue;
      }
      if (!employee.id_card) {
        skipped.push(`${employee.name || '未知人员'}：缺少身份证`);
        continue;
      }
      ready.push({ employee, mapping });
    }
    if (!ready.length) {
      throw new Error(skipped.length ? skipped.slice(0, 3).join('；') : '没有可投保人员');
    }
    let success = 0;
    const failed: string[] = [];
    for (const group of groupByAddPayload(ready)) {
      try {
        const check = await insuranceApi.precheckAddInsurance({
          policy_id: group.policy_id,
          start_date: addEffectiveDate.value,
          persons: group.persons
        });
        if (check && check.valid === false) throw new Error((check.errors || []).join('；') || '投保预校验失败');
        await insuranceApi.addInsurance({
          policy_id: group.policy_id,
          start_date: addEffectiveDate.value,
          persons: group.persons
        });
        success += group.persons.length;
      } catch (err: any) {
        failed.push(...group.persons.map((person: any) => `${person.name}：${err?.message || '投保失败'}`));
      }
    }
    addDialogVisible.value = false;
    selectedUninsuredRows.value = [];
    uninsuredPage.value = 1;
    await loadOverview();
    await loadUninsuredEmployees();
    const skippedText = skipped.length ? `，跳过 ${skipped.length} 人` : '';
    if (failed.length || skipped.length) {
      ElMessage.warning(`投保成功 ${success} 人${skippedText}，失败 ${failed.length} 人：${[...skipped, ...failed].slice(0, 3).join('；')}`);
      return;
    }
    ElMessage.success(`投保已提交 ${success} 人`);
  });
}

onMounted(() => {
  window.addEventListener('insurance-menu-enter', handleInsuranceMenuEnter);
  void loadAll();
});

onBeforeUnmount(() => {
  window.removeEventListener('insurance-menu-enter', handleInsuranceMenuEnter);
});
</script>

<style scoped lang="scss">
.insurance-page {
  padding: 16px;
}

.page-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 16px;
  margin-bottom: 14px;

  h2 {
    margin: 0 0 4px;
    font-size: 22px;
    font-weight: 650;
  }

  p {
    margin: 0;
    color: #667085;
  }
}

.header-actions,
.toolbar {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  align-items: center;
}

.stat-grid {
  margin-bottom: 14px;
}

.stat-card {
  position: relative;
  overflow: hidden;
  min-height: 74px;
  padding: 14px;
  border: 1px solid var(--stat-border, #e5e7eb);
  border-radius: 8px;
  background: linear-gradient(135deg, var(--stat-bg-start, #fff), var(--stat-bg-end, #fff));
  box-shadow: 0 8px 18px rgb(16 24 40 / 5%);

  &::after {
    position: absolute;
    top: 10px;
    right: 10px;
    width: 34px;
    height: 34px;
    border-radius: 8px;
    background: var(--stat-mark, rgb(255 255 255 / 55%));
    content: '';
  }

  span {
    position: relative;
    z-index: 1;
    display: block;
    color: var(--stat-muted, #667085);
    font-size: 13px;
  }

  strong {
    position: relative;
    z-index: 1;
    display: block;
    margin-top: 8px;
    color: var(--stat-text, #101828);
    font-size: 24px;
    line-height: 1;
  }
}

.stat-card--money {
  --stat-bg-start: #ecfdf3;
  --stat-bg-end: #d1fadf;
  --stat-border: #abefc6;
  --stat-mark: rgb(18 183 106 / 14%);
  --stat-muted: #067647;
  --stat-text: #085d3a;
}

.stat-card--policy {
  --stat-bg-start: #eff8ff;
  --stat-bg-end: #d1e9ff;
  --stat-border: #b2ddff;
  --stat-mark: rgb(46 144 250 / 15%);
  --stat-muted: #175cd3;
  --stat-text: #1849a9;
}

.stat-card--active {
  --stat-bg-start: #eef4ff;
  --stat-bg-end: #d9e6ff;
  --stat-border: #c7d7fe;
  --stat-mark: rgb(68 76 231 / 14%);
  --stat-muted: #3538cd;
  --stat-text: #2d31a6;
}

.stat-card--covered {
  --stat-bg-start: #f0fdf9;
  --stat-bg-end: #ccfbef;
  --stat-border: #99f6e0;
  --stat-mark: rgb(20 184 166 / 14%);
  --stat-muted: #0f766e;
  --stat-text: #115e59;
}

.stat-card--add {
  --stat-bg-start: #fefce8;
  --stat-bg-end: #fef3c7;
  --stat-border: #fde68a;
  --stat-mark: rgb(245 158 11 / 16%);
  --stat-muted: #a16207;
  --stat-text: #854d0e;
}

.stat-card--off {
  --stat-bg-start: #fff7ed;
  --stat-bg-end: #ffedd5;
  --stat-border: #fed7aa;
  --stat-mark: rgb(249 115 22 / 14%);
  --stat-muted: #c2410c;
  --stat-text: #9a3412;
}

.stat-card--failed {
  --stat-bg-start: #fff1f3;
  --stat-bg-end: #ffe4e8;
  --stat-border: #fecdd6;
  --stat-mark: rgb(244 63 94 / 14%);
  --stat-muted: #be123c;
  --stat-text: #9f1239;
}

.stat-card--exception {
  --stat-bg-start: #fdf4ff;
  --stat-bg-end: #fae8ff;
  --stat-border: #f5d0fe;
  --stat-mark: rgb(192 38 211 / 12%);
  --stat-muted: #a21caf;
  --stat-text: #86198f;
}

.main-tabs {
  background: #fff;
  border: 1px solid #e5e7eb;
  border-radius: 8px;
  padding: 0 14px 14px;
}

.panel {
  padding: 14px 0;
}

.panel-title {
  margin-bottom: 12px;
  font-size: 15px;
  font-weight: 650;
}

.two-column {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
  gap: 18px;
}

.mapping-grid {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
  gap: 18px;
}

.sub-title {
  margin: 0 0 12px 110px;
  color: #667085;
  font-size: 13px;
  font-weight: 600;
}

.form-panel {
  max-width: 720px;
}

.full {
  width: 100%;
}

.wide-select {
  width: 320px;
}

.small-filter {
  width: 180px;
}

.small-select {
  width: 140px;
}

.hint {
  margin-top: 8px;
  color: #667085;
  font-size: 13px;
}

.inline-hint {
  margin-top: 0;
  line-height: 32px;
}

.table-pagination {
  margin-top: 12px;
  display: flex;
  justify-content: flex-end;
  flex-shrink: 0;
}

.detail-table {
  margin-top: 14px;
}

.detail-section-title {
  margin-top: 18px;
  color: #344054;
  font-size: 14px;
  font-weight: 650;
}

@media (max-width: 920px) {
  .page-header,
  .two-column,
  .mapping-grid {
    display: block;
  }

  .sub-title {
    margin-left: 0;
  }

  .header-actions {
    margin-top: 12px;
  }

  .wide-select,
  .small-filter {
    width: 100%;
  }
}
</style>
