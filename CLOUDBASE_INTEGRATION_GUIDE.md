# CloudBase 正确接入指南

## ✅ 当前状态

**环境**: `cloud1-5glojms9a83c3457` (ap-shanghai)  
**开发服务器**: http://localhost:3000 ✅ 运行中  
**应用状态**: Vue 3 + Vite + CloudBase SDK 完全集成

## 🚀 快速开始

### 1️⃣ 应用已开启，访问首页

```
http://localhost:3000
```

### 2️⃣ 使用测试账号登录

**推荐账号**（本地测试）:
- **手机号**: `13800138000`
- **密码**: `123456`
- **角色**: HR 管理员

**其他测试账号**:
- `13900139000` / `123456` (候选人身份)

### 3️⃣ 确保 CloudBase 数据库中有真实用户

您需要验证云数据库中是否有用户数据：

#### 选项 A: 在 CloudBase 控制台创建用户

1. 打开 CloudBase 控制台：https://console.cloud.tencent.com/tcb
2. 进入环境 `cloud1-5glojms9a83c3457`
3. 数据库 → collections → `users` 集合
4. 手动创建文档，字段示例：
   ```json
   {
     "phone": "13800138000",
     "password": "123456",
     "name": "测试用户",
     "role": "hr",
     "status": "normal",
     "email": "test@example.com",
     "department": "人力资源部"
   }
   ```

#### 选项 B: 使用脚本批量导入

```bash
# 运行初始化脚本
node scripts/init-cloud-users.js
```

#### 选项 C: 使用开发工具页面（本地生成）

访问: http://localhost:3000/devtools

- 点击"创建所有测试数据"按钮
- 自动生成测试公司、岗位、应聘者、员工
- 或在浏览器控制台运行:
  ```javascript
  window.seedTestData.createAll()
  ```

## 📱 应用功能模块

所有模块已转换为使用 CloudBase SDK 直接访问数据库：

| 模块 | 功能 | 状态 |
|------|------|------|
| 仪表板 | 统计信息、最新应聘 | ✅ |
| 企业管理 | 企业列表、详情、创建、编辑 | ✅ |
| 岗位管理 | 招聘中、归档岗位管理 | ✅ |
| 应聘管理 | 应聘者跟踪、状态管理 | ✅ |
| 面试管理 | 面试安排、反馈记录 | ✅ |
| 员工管理 | 入职、转正、离职、归档 | ✅ |
| 薪资管理 | 薪资计算、审批流程 | ✅ |
| 其他 | 奖励、提前、工时、统计、归档 | ✅ |

## 🔧 技术配置

### CloudBase 连接信息

```typescript
// src/api/cloud.ts 自动配置
const cloud = cloudbase.init({
  env: 'cloud1-5glojms9a83c3457',
  region: 'ap-shanghai'
});
```

### 错误处理和降级

- 如果 CloudBase 连接失败，应用自动降级到本地测试数据
- 所有 API 调用都有异常捕获，返回安全的默认值
- 不会因为数据库错误导致页面崩溃

### 数据库集合列表

应用使用以下集合（请确保存在）:

```
✓ users           - 用户账号
✓ companies       - 公司信息
✓ jobs            - 岗位信息
✓ applications    - 应聘记录
✓ employees       - 员工信息
✓ interviews      - 面试记录
✓ salaries        - 薪资信息
✓ bonus           - 奖励信息
✓ advances        - 提前支付
✓ worktime        - 工时记录
✓ stats           - 统计数据
✓ archives        - 归档文件
✓ qrcode          - 二维码数据
```

## 🧪 诊断和测试

### 方式 1: 开发工具页面

访问: http://localhost:3000/devtools

功能:
- 创建/清除测试数据
- 查看数据统计
- 控制台命令参考

### 方式 2: 浏览器控制台

```javascript
// 创建测试数据
window.seedTestData.createAll()

// 诊断 CloudBase 连接
window.diagnoseCloudBase()

// 清除测试数据
window.seedTestData.clearAll()
```

### 输出示例

```
CloudBase 诊断结果:
users           → 25 条记录
companies       → 5 条记录
jobs            → 10 条记录
applications    → 20 条记录
employees       → 15 条记录
...
```

## 📦 生产部署到 CloudBase 静态托管

### Step 1: 构建应用

```bash
cd web
npm run build
```

输出文件夹: `dist/`

### Step 2: 部署到 CloudBase 静态托管

```bash
# 安装 CloudBase CLI
npm install -g @cloudbase/cli@latest

# 登录腾讯云
tcb login

# 部署应用
tcb deploy --root dist/ -e cloud1-5glojms9a83c3457 -p
```

### Step 3: 获取访问地址

部署完成后，CloudBase 控制台会显示访问地址:

```
https://cloud1-5glojms9a83c3457.web.tcloudbase.com
```

## ⚠️ 常见问题

### Q: 登录失败，提示"用户不存在"

**答**: 检查 CloudBase 数据库中是否有对应手机号的用户记录。

**解决方案**:
1. 登录 CloudBase 控制台
2. 在 `users` 集合中创建用户
3. 或运行 `window.seedTestData.createAll()` 创建测试数据

### Q: 页面显示"数据为空"

**答**: 这可能是正常的 - 如果数据库中确实没有数据。

**解决方案**:
1. 通过开发工具页面创建测试数据
2. 或在 CloudBase 控制台手动创建数据
3. 使用诊断工具检查: `window.diagnoseCloudBase()`

### Q: 连接超时或网络错误

**答**: 可能是网络连接或 CloudBase 服务故障。

**解决方案**:
1. 检查网络连接
2. 检查环境 ID 是否正确: `cloud1-5glojms9a83c3457`
3. 验证 CloudBase 服务是否在线
4. 应用会自动降级到本地测试数据

### Q: 如何验证 CloudBase 连接?

**答**: 在浏览器控制台运行:

```javascript
window.diagnoseCloudBase()
```

查看输出，确认各个集合的数据计数。

## 🎯 下一步

1. **创建生产数据**: 通过 CloudBase 控制台或脚本导入真实的企业、岗位、员工数据
2. **配置用户**: 创建实际的 HR、招聘、员工用户账号
3. **自定义品牌**: 修改应用名称、图标、主题色等
4. **部署应用**: 使用生产构建和 CloudBase 静态托管发布
5. **配置域名**: 绑定自定义域名（可选）

## 📞 支持

如有问题，请查看以下资源:

- CloudBase 官方文档: https://docs.cloudbase.net/
- 项目文档: CLOUDBASE_SETUP.md
- 控制台: https://console.cloud.tencent.com/tcb

---

✅ **应用已完全就绪，可以开始使用腾讯云开发的 HR 管理系统！**
