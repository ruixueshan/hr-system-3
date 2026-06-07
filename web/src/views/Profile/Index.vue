<template>
  <div class="profile-page">
    <div class="profile-card">
      <div class="profile-header">
        <el-avatar :size="80" :src="userInfo?.avatar">
          {{ (userInfo?.real_name || userInfo?.name || 'U').charAt(0) }}
        </el-avatar>
        <div class="profile-info">
          <h2>{{ userInfo?.real_name || userInfo?.name || '用户' }}</h2>
          <p>{{ roleText }}</p>
        </div>
      </div>

      <el-divider />

      <div class="profile-details">
        <div class="detail-item">
          <span class="label">手机号</span>
          <span class="value">{{ userInfo?.phone || '-' }}</span>
        </div>
        <div class="detail-item">
          <span class="label">用户名</span>
          <span class="value">{{ userInfo?.name || '-' }}</span>
        </div>
        <div class="detail-item">
          <span class="label">角色</span>
          <span class="value">{{ roleText }}</span>
        </div>
      </div>
    </div>

    <div class="password-card">
      <h3>修改密码</h3>
      <el-form
        ref="formRef"
        :model="form"
        :rules="rules"
        label-width="100px"
        class="password-form"
      >
        <el-form-item label="旧密码" prop="oldPassword">
          <el-input
            v-model="form.oldPassword"
            type="password"
            placeholder="请输入旧密码"
            show-password
          />
        </el-form-item>
        <el-form-item label="新密码" prop="newPassword">
          <el-input
            v-model="form.newPassword"
            type="password"
            placeholder="请输入新密码（至少6位）"
            show-password
          />
        </el-form-item>
        <el-form-item label="确认密码" prop="confirmPassword">
          <el-input
            v-model="form.confirmPassword"
            type="password"
            placeholder="请再次输入新密码"
            show-password
          />
        </el-form-item>
        <el-form-item>
          <el-button type="primary" :loading="loading" @click="handleSubmit">
            保存修改
          </el-button>
        </el-form-item>
      </el-form>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue';
import { ElMessage, FormInstance, FormRules } from 'element-plus';
import { useAuthStore } from '@/stores/auth.store';
import { usersApi } from '@/api/modules/users';
import { useTableLoading } from '@/composables/useTableLoading';

const authStore = useAuthStore();
const userInfo = computed(() => authStore.userInfo);

const formRef = ref<FormInstance>();
const { loading, withLoading } = useTableLoading();
const form = ref({
  oldPassword: '',
  newPassword: '',
  confirmPassword: ''
});

const roleMap: Record<string, string> = {
  gm: '总经理',
  deputy: '副总经理',
  hr: 'HR管理员',
  external: '外协',
  finance: '财务',
  manager: '部门经理',
  employee: '员工',
  candidate: '候选人'
};

const roleText = computed(() => {
  return roleMap[userInfo.value?.role || ''] || '用户';
});

const validateConfirmPassword = (rule: any, value: string, callback: any) => {
  if (value !== form.value.newPassword) {
    callback(new Error('两次输入的密码不一致'));
  } else {
    callback();
  }
};

const rules: FormRules = {
  oldPassword: [
    { required: true, message: '请输入旧密码', trigger: 'blur' }
  ],
  newPassword: [
    { required: true, message: '请输入新密码', trigger: 'blur' },
    { min: 6, message: '密码长度至少6位', trigger: 'blur' }
  ],
  confirmPassword: [
    { required: true, message: '请再次输入新密码', trigger: 'blur' },
    { validator: validateConfirmPassword, trigger: 'blur' }
  ]
};

async function handleSubmit() {
  if (!formRef.value) return;
  
  await formRef.value.validate(async (valid) => {
    if (!valid) return;

    const userId = userInfo.value?._id || userInfo.value?.id;
    if (!userId) {
      console.log('userInfo:', userInfo.value);
      ElMessage.error('用户信息错误');
      return;
    }

    await withLoading(async () => {
      await usersApi.changePassword(
        userId,
        form.value.oldPassword,
        form.value.newPassword
      );
      ElMessage.success('密码修改成功');
      form.value = {
        oldPassword: '',
        newPassword: '',
        confirmPassword: ''
      };
    });
  });
}
</script>

<style scoped lang="scss">
.profile-page {
  max-width: 800px;
  margin: 0 auto;
  padding: 20px;
}

.profile-card {
  background: #fff;
  border-radius: 8px;
  padding: 24px;
  margin-bottom: 20px;
  box-shadow: 0 2px 12px rgba(0, 0, 0, 0.1);
}

.profile-header {
  display: flex;
  align-items: center;
  gap: 20px;

  .profile-info {
    h2 {
      margin: 0 0 8px;
      font-size: 24px;
      color: var(--text-color);
    }

    p {
      margin: 0;
      color: var(--text-secondary);
      font-size: 14px;
    }
  }
}

.profile-details {
  .detail-item {
    display: flex;
    padding: 12px 0;
    border-bottom: 1px solid #f0f0f0;

    &:last-child {
      border-bottom: none;
    }

    .label {
      width: 100px;
      color: var(--text-secondary);
      font-size: 14px;
    }

    .value {
      flex: 1;
      color: var(--text-color);
      font-size: 14px;
    }
  }
}

.password-card {
  background: #fff;
  border-radius: 8px;
  padding: 24px;
  box-shadow: 0 2px 12px rgba(0, 0, 0, 0.1);

  h3 {
    margin: 0 0 20px;
    font-size: 18px;
    color: var(--text-color);
  }
}

.password-form {
  max-width: 400px;
}
</style>
