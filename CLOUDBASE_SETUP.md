# CloudBase 接入完整指南

## 🎯 当前状态
- ✅ Web 应用已配置 CloudBase SDK
- ✅ 环境 ID: `cloud1-5glojms9a83c3457`
- ✅ 区域: `ap-shanghai`
- ✅ 数据库集合已创建

## 🔗 接入步骤

### 1. 本地测试（推荐先做）

#### 第一步：诊断连接

1. **启动开发服务器**
```bash
cd /Users/zhanrui/Documents/hr-system-3.0/web
npx vite --port 3000
```

2. **打开浏览器，访问**: `http://localhost:3000/login`

3. **打开浏览器控制台** (F12 → Console)

4. **运行诊断命令**：
```javascript
window.diagnoseCloudBase()
```

5. **查看输出**：应该看到集合名称和数据统计

#### 第二步：创建测试数据

**方式 A：UI 界面（推荐）**
1. 访问: `http://localhost:3000/devtools`
2. 点击 "✅ 创建所有测试数据"
3. 选择数据量（默认：5 企业、10 岗位、20 应聘、15 员工）

**方式 B：控制台命令**
```javascript
// 创建所有测试数据
window.seedTestData.createAll()
```

#### 第三步：测试登录和数据查询

1. **测试账号**：
   - 手机: `13800138000`
   - 密码: `123456`
   - 角色: `hr`（人力资源）

2. **登录后**：
   - 仪表盘应显示统计数据
   - 企业、岗位等页面应显示列表

### 2. 云端真实数据接入

#### 前提条件
- ✅ 数据已在 CloudBase 数据库中
- ✅ 已配置或调整了安全规则

#### 步骤

**第一步：验证 CloudBase 权限**

进入腾讯云开发控制台：
```
https://console.cloud.tencent.com/tcb
-> 选择环境: cloud1-5glojms9a83c3457
-> 数据库 -> 安全规则
```

**第二步：检查或修改安全规则**

当前的安全规则可能需要认证。如果想快速测试，可以临时开放读权限：

```javascript
// 临时规则（开发用，生产环境不要用）
{
  "collections": {
    "companies": {
      "read": true,  // 允许读取
      "write": "auth.uid != null"  // 需要认证才能写
    },
    "jobs": {
      "read": true,  // 允许读取
      "write": "auth.uid != null"
    },
    "applications": {
      "read": true,  // 允许读取
      "write": "auth.uid != null"
    },
    "employees": {
      "read": true,  // 允许读取
      "write": "auth.uid != null"
    }
  }
}
```

**第三步：在 CloudBase 创建用户**

使用腾讯云 CLI 工具或云函数创建测试用户：

```bash
# 安装 CLI
npm install -g @cloudbase/cli

# 登录
tcb login

# 运行初始化脚本
node /Users/zhanrui/Documents/hr-system-3.0/scripts/init-cloud-users.js
```

**第四步：使用云端数据**

1. 在本地重新运行 `npm run dev`
2. 用刚刚创建的账号登录
3. 仪表盘和各页面应该显示真实云端数据

### 3. 常见问题排查

#### 问题 1：诊断显示集合为空
**原因**：没有数据或权限不足
**解决**：
```javascript
// 创建测试数据
window.seedTestData.createAll()
```

#### 问题 2：登录失败 "用户不存在"
**原因**：CloudBase 中没有该用户
**解决**：
```bash
# 使用 init 脚本创建用户
node scripts/init-cloud-users.js
```

#### 问题 3：成功登录但数据显示为 0
**原因**：数据库中确实没有数据或权限不足
**解决**：
1. 检查安全规则是否允许读取
2. 检查该用户是否有数据创建权限
3. 运行 `window.diagnoseCloudBase()` 检查

#### 问题 4：控制台显示 "Cannot read properties of null"
**原因**：CloudBase 初始化失败
**解决**：
1. 检查环境 ID 和区域配置
2. 检查网络连接
3. 查看浏览器控制台其他错误信息

## 📋 关键配置文件

### `.env.production`
```
VITE_CLOUDBASE_ENV=cloud1-5glojms9a83c3457
VITE_CLOUDBASE_REGION=ap-shanghai
```

### `src/api/cloud.ts`
- `getDatabase()` - 获取数据库实例
- `loginDirect()` - 用户登录认证

### 安全规则位置
```
https://console.cloud.tencent.com/tcb
-> 数据库 -> 安全规则
```

## 🚀 快速命令参考

| 用途 | 命令 |
|------|------|
| 诊断连接 | `window.diagnoseCloudBase()` |
| 创建测试数据 | `window.seedTestData.createAll()` |
| 清空测试数据 | `window.seedTestData.clearAll()` |
| 创建云端用户 | `node scripts/init-cloud-users.js` |

## ✅ 成功标志

- ✅ 诊断显示集合有数据
- ✅ 能用测试账号登录
- ✅ 仪表盘显示数字而不是 0
- ✅ 企业、岗位列表有数据
- ✅ 控制台没有红色错误

## 📞 需要帮助？

1. 查看浏览器控制台错误信息
2. 运行 `window.diagnoseCloudBase()` 获取详细诊断
3. 检查 CloudBase 控制台数据库状态
4. 验证安全规则配置

---

**更新时间**: 2026-03-18  
**应用**: HR 管理系统 3.0  
**环境**: CloudBase (cloud1-5glojms9a83c3457)
