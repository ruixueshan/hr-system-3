# CLAUDE.md - HR System 3.0 开发规范

## ⚠️ CloudBase Skills 必须激活

**You MUST read the cloudbase-skills skill FIRST when working with CloudBase projects.**

当使用 CloudBase（腾讯云开发）相关功能时，必须先读取 Skills 规范。

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
- 使用 CloudBase CLI: `tcb fn deploy <function-name> -e <env-id>`
- 或微信开发者工具：右键 cloudfunctions 目录 → 上传并部署

### 数据库操作
- 通过 MCP 工具调用：`npx mcporter call cloudbase.database...`
- 或手动在 CloudBase 控制台创建

### API 调用
- 小程序：`wx.cloud.callFunction({ name: '<function-name>', data: {...} })`
- Web：通过代理调用云函数

## 📋 待完成任务

1. ⏳ 部署所有云函数到 cloud1-5glojms9a83c3457
2. ⏳ 创建数据库集合（20个）
3. ⏳ 测试 API 接口
