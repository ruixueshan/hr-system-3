# AGENTS.md - HR System 3.0 开发规范

## ⚠️ CloudBase 操作强制使用 MCP

**后续所有涉及 CloudBase / 腾讯云开发的操作，必须优先且只使用 CloudBase MCP 工具完成。**

- 如果 MCP 工具能力不足，先说明阻塞点，再由用户决定是否临时改用控制台；不要自动回退到 `tcb`。
- 操作 CloudBase 前必须先确认登录与环境：
  - `auth(action="status")`
  - 如未绑定环境，使用 `auth(action="set_env", envId="cloud1-5glojms9a83c3457")`

### MCP 工具使用约定

- 静态网站托管发布：先在 `web/` 执行 `npm run build`，再使用 `uploadFiles` 上传 `web/dist` 到静态托管。
- 云函数查询/部署/调用：使用 `queryFunctions` / `manageFunctions`。
- 云托管服务：使用 `queryCloudRun` / `manageCloudRun`。
- NoSQL 数据库结构：使用 `readNoSqlDatabaseStructure` / `writeNoSqlDatabaseStructure`。
- NoSQL 数据库数据：使用 `readNoSqlDatabaseContent` / `writeNoSqlDatabaseContent`。
- SQL / MySQL：使用 `querySqlDatabase` / `manageSqlDatabase`。
- 权限与角色：使用 `queryPermissions` / `managePermissions`。
- 应用认证配置：使用 `queryAppAuth` / `manageAppAuth`。
- 静态托管域名与安全域名：使用 `domainManagement` / `envDomainManagement` / `envQuery`。
- CloudBase 知识、OpenAPI 或规则不确定时：使用 `searchKnowledgeBase` 查询官方知识库。

## 📁 项目结构

```
hr-system-3.0/
├── cloudfunctions/    # 云函数目录
│   ├── auth-login/    # 微信登录
│   ├── auth-web-login/ # Web登录
│   ├── auth-token-verify/ # Token验证
│   ├── users/         # 用户管理
│   ├── companies/     # 企业管理
│   ├── jobs/          # 岗位管理
│   └── ...
├── miniprogram/       # 小程序端
├── web/               # Web管理后台
└── database/          # 数据库设计
```

## 🔧 开发规范

### 云函数部署
- 使用 MCP：`manageFunctions(action="createFunction" | "updateFunctionCode", ...)`
- 部署前使用 MCP：`queryFunctions(action="getFunctionDetail" | "listFunctions", ...)`

### 数据库操作
- 集合结构使用 MCP：`readNoSqlDatabaseStructure` / `writeNoSqlDatabaseStructure`
- 数据读写使用 MCP：`readNoSqlDatabaseContent` / `writeNoSqlDatabaseContent`
- SQL/MySQL 使用 MCP：`querySqlDatabase` / `manageSqlDatabase`
- 不使用 `npx mcporter call cloudbase.database...`
- 不使用 `tcb` CLI

### API 调用
- 小程序：`wx.cloud.callFunction({ name: '<function-name>', data: {...} })`
- Web：通过代理调用云函数

## 📋 待完成任务

1. ⏳ 部署所有云函数到 cloud1-5glojms9a83c3457
2. ⏳ 创建数据库集合（20个）
3. ⏳ 测试 API 接口
