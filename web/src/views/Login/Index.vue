<template>
  <div class="login-container">
    <!-- 左侧品牌展示区域 -->
    <div class="brand-section">
      <div class="brand-overlay"></div>
      <div class="brand-content">
        <div class="brand-logo">
          <img :src="brandLogo" alt="展瑞logo" class="brand-logo-image" />
          <h1>展瑞人力资源</h1>
          <p class="brand-tagline">专业 · 高效 · 可信赖</p>
        </div>
        <div class="brand-features">
          <div class="feature">
            <i class="fas fa-shield-alt"></i>
            <div>
              <h3>安全可靠</h3>
              <p>企业级数据加密与权限控制</p>
            </div>
          </div>
          <div class="feature">
            <i class="fas fa-chart-line"></i>
            <div>
              <h3>智能分析</h3>
              <p>全方位人力资源数据洞察</p>
            </div>
          </div>
          <div class="feature">
            <i class="fas fa-mobile-alt"></i>
            <div>
              <h3>移动办公</h3>
              <p>随时随地处理人事事务</p>
            </div>
          </div>
        </div>
        <div class="brand-footer">
          <p>© 2026 展瑞科技 版权所有</p>
        </div>
      </div>
    </div>

    <!-- 右侧登录表单区域 -->
    <div class="form-section">
      <div class="form-container">
        <div class="form-header">
          <h2>欢迎回来</h2>
          <p>请使用您的账号登录系统</p>
        </div>

        <el-form
          ref="formRef"
          :model="form"
          :rules="rules"
          label-width="0"
          size="large"
          class="login-form"
        >
          <el-form-item prop="phone">
            <div class="input-with-icon">
              <i class="fas fa-phone"></i>
              <el-input
                v-model="form.phone"
                placeholder="请输入手机号"
                clearable
                maxlength="11"
              />
            </div>
          </el-form-item>

          <el-form-item prop="password">
            <div class="input-with-icon">
              <i class="fas fa-lock"></i>
              <el-input
                v-model="form.password"
                type="password"
                placeholder="请输入密码"
                clearable
                show-password
                maxlength="20"
              />
            </div>
          </el-form-item>

          <el-form-item class="agreement-item">
            <el-checkbox v-model="agreed">
              我已阅读并同意
              <a href="#" class="agreement-link">《用户协议》</a>
              和
              <a href="#" class="agreement-link">《隐私政策》</a>
            </el-checkbox>
          </el-form-item>

          <el-form-item class="remember-item">
            <el-checkbox v-model="rememberMe">
              记住我
            </el-checkbox>
            <div class="forgot-password">
              <a href="#" class="forgot-link">忘记密码？</a>
            </div>
          </el-form-item>

          <el-form-item>
            <el-button
              type="primary"
              :loading="logging"
              class="login-btn"
              @click="handleLogin"
            >
              <span v-if="!logging">登 录</span>
              <span v-else>登录中...</span>
            </el-button>
          </el-form-item>

          <div class="form-footer">
            <p class="support-info">
              <i class="fas fa-phone-alt"></i>
              客服电话：13815736023（工作日 9:00-18:00）
            </p>
            <p class="version-info">HR Management System 3.0</p>
          </div>
        </el-form>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import { useRouter, useRoute } from 'vue-router';
import { ElMessage, type FormInstance, type FormRules } from 'element-plus';
import { useAuthStore } from '@/stores/auth.store';
import brandLogo from '@/assets/brand/zhanrui-logo.png';

const router = useRouter();
const route = useRoute();
const authStore = useAuthStore();

const formRef = ref<FormInstance>();
const form = ref({
  phone: '',
  password: ''
});
const agreed = ref(false);
const rememberMe = ref(true);
const logging = ref(false);

const rules: FormRules = {
  phone: [
    { required: true, message: '请输入手机号', trigger: 'blur' },
    { pattern: /^1[3-9]\d{9}$/, message: '手机号格式错误', trigger: 'blur' }
  ],
  password: [
    { required: true, message: '请输入密码', trigger: 'blur' },
    { min: 6, message: '密码至少6位', trigger: 'blur' }
  ]
};

async function handleLogin() {
  if (!agreed.value) {
    ElMessage.warning('请先同意用户协议和隐私政策');
    return;
  }

  try {
    // 表单验证
    if (formRef.value) {
      const valid = await formRef.value.validate().catch(() => false);
      if (!valid) return;
    }

    logging.value = true;
    // 执行登录
    await authStore.login(form.value.phone, form.value.password, rememberMe.value);
    ElMessage.success('登录成功');

    const redirect = route.query.redirect as string;
    router.replace(redirect || '/dashboard');
  } catch (err: any) {
    ElMessage.error(err.message || '登录失败');
    logging.value = false;
  }
}
</script>

<style scoped lang="scss">
.login-container {
  min-height: 100vh;
  display: flex;
  font-family: 'Source Sans Pro', sans-serif;
  background-color: #f8f9fa;
}

.brand-section {
  flex: 0 0 60%;
  position: relative;
  background: linear-gradient(135deg, #1a365d 0%, #2d4a7a 100%);
  color: white;
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;

  .brand-overlay {
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background: url('data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100" viewBox="0 0 100 100"><rect width="100" height="100" fill="none"/><path d="M0,0 L100,100 M100,0 L0,100" stroke="rgba(255,255,255,0.03)" stroke-width="1"/></svg>');
    opacity: 0.3;
  }

  .brand-content {
    position: relative;
    z-index: 1;
    max-width: 600px;
    padding: 60px;
  }

  .brand-logo {
    margin-bottom: 80px;
    text-align: center;

    .brand-logo-image {
      width: 280px;
      max-width: 100%;
      display: inline-block;
      padding: 18px 24px;
      border-radius: 28px;
      background: rgba(255, 248, 238, 0.96);
      border: 1px solid rgba(255, 255, 255, 0.4);
      margin-bottom: 28px;
      box-shadow: 0 14px 34px rgba(9, 18, 31, 0.18);
    }

    h1 {
      font-family: 'Playfair Display', serif;
      font-size: 3.5rem;
      font-weight: 700;
      margin: 0 0 12px 0;
      letter-spacing: 1px;
    }

    .brand-tagline {
      font-size: 1.2rem;
      opacity: 0.9;
      letter-spacing: 2px;
      text-transform: uppercase;
    }
  }

  .brand-features {
    .feature {
      display: flex;
      align-items: center;
      margin-bottom: 36px;
      padding: 20px;
      background: rgba(255, 255, 255, 0.05);
      border-radius: 12px;
      border-left: 4px solid #d4af37;
      transition: all 0.3s ease;

      &:hover {
        background: rgba(255, 255, 255, 0.1);
        transform: translateX(8px);
      }

      i {
        font-size: 1.8rem;
        color: #d4af37;
        margin-right: 20px;
        width: 40px;
        text-align: center;
      }

      h3 {
        margin: 0 0 6px 0;
        font-size: 1.3rem;
        font-weight: 600;
      }

      p {
        margin: 0;
        opacity: 0.8;
        font-size: 0.95rem;
      }
    }
  }

  .brand-footer {
    margin-top: 80px;
    text-align: center;
    opacity: 0.7;
    font-size: 0.9rem;
  }
}

.form-section {
  flex: 0 0 40%;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 40px;
  background: white;

  .form-container {
    width: 100%;
    max-width: 420px;
  }

  .form-header {
    margin-bottom: 40px;
    text-align: center;

    h2 {
      font-family: 'Playfair Display', serif;
      font-size: 2.5rem;
      color: #1a365d;
      margin: 0 0 12px 0;
      font-weight: 700;
    }

    p {
      color: #718096;
      font-size: 1.1rem;
      margin: 0;
    }
  }

  .login-form {
    .input-with-icon {
      position: relative;
      display: flex;
      align-items: center;

      i {
        position: absolute;
        left: 16px;
        color: #a0aec0;
        font-size: 1.2rem;
        z-index: 2;
      }

      :deep(.el-input) {
        flex: 1;

        .el-input__wrapper {
          padding-left: 48px;
          border-radius: 12px;
          border: 2px solid #e2e8f0;
          background: #f8f9fa;
          box-shadow: none;
          transition: all 0.3s ease;

          &:hover {
            border-color: #cbd5e0;
          }

          &.is-focus {
            border-color: #38b2ac;
            box-shadow: 0 0 0 3px rgba(56, 178, 172, 0.1);
          }
        }
      }
    }

    .agreement-item {
      margin-top: 10px;

      :deep(.el-checkbox) {
        .el-checkbox__label {
          color: #4a5568;
          font-size: 0.95rem;
        }
      }

      .agreement-link {
        color: #38b2ac;
        text-decoration: none;
        font-weight: 600;

        &:hover {
          text-decoration: underline;
        }
      }
    }

    .login-btn {
      width: 100%;
      height: 56px;
      border-radius: 12px;
      background: linear-gradient(135deg, #1a365d 0%, #2d4a7a 100%);
      border: none;
      font-size: 1.2rem;
      font-weight: 600;
      letter-spacing: 1px;
      transition: all 0.3s ease;
      margin-top: 10px;

      &:hover {
        transform: translateY(-2px);
        box-shadow: 0 8px 20px rgba(26, 54, 93, 0.3);
      }

      &:active {
        transform: translateY(0);
      }

      :deep(.el-button__loading) {
        color: white;
      }
    }

    .form-footer {
      margin-top: 40px;
      text-align: center;

      .support-info {
        color: #718096;
        font-size: 0.95rem;
        margin: 0 0 20px 0;

        i {
          color: #38b2ac;
          margin-right: 8px;
        }
      }

      .version-info {
        color: #a0aec0;
        font-size: 0.9rem;
        letter-spacing: 1px;
        margin: 0;
      }
    }
  }
}

/* 响应式设计 */
@media (max-width: 992px) {
  .login-container {
    flex-direction: column;
  }

  .brand-section {
    flex: 0 0 auto;
    padding: 40px 20px;

    .brand-content {
      padding: 20px;
    }

    .brand-logo {
      margin-bottom: 40px;

      .brand-logo-image {
        width: 220px;
        padding: 14px 18px;
        border-radius: 22px;
        margin-bottom: 20px;
      }

      h1 {
        font-size: 2.5rem;
      }
    }

    .brand-features {
      .feature {
        margin-bottom: 20px;
        padding: 15px;
      }
    }
  }

  .form-section {
    flex: 0 0 auto;
    padding: 40px 20px;
  }
}
</style>