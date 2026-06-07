# VR版本：小程序页面数据来源与落库矩阵（接口审计/测试用）

> 更新时间：2026-05-18  
> 适用范围：`miniprogram/app.json` 已注册页面 + 仓库内存在但未注册页面  
> 口径说明：  
> - “读表/写表”基于当前云函数实现代码静态分析（`cloudfunctions/*`）。  
> - “本地存储”指小程序 `wx.setStorageSync/getStorageSync/removeStorageSync`。  
> - 仅列核心业务集合，日志或低风险辅助字段不展开。

## 1) 页面 -> 云函数 action -> 读写表矩阵（TSV，可直接粘贴 Excel）

```tsv
页面	页面路径	云函数	动作(action)	用途	读表(集合)	写表(集合)	本地存储Key	前端关键校验
岗位列表	/pages/index/index	jobs	list	加载岗位列表	jobs,companies	-	pendingRecommender(可选)	关键词/筛选参数基础校验
岗位详情	/pages/job-detail/detail	jobs	get	加载岗位详情	jobs,companies	-	-	岗位ID存在校验
岗位详情	/pages/job-detail/detail	applications	check-status	查询是否已申请	applications	-	-	登录态校验
岗位详情	/pages/job-detail/detail	applications	apply	提交申请	applications,jobs,users,interviews,companies	qr_codes(可能),applications,interviews,users,candidate_owners,candidate_action_logs	读取pendingRecommender	日期格式YYYY-MM-DD,日期>=今天,防重复申请
在线申请	/pages/apply/apply	jobs	get	加载岗位	jobs,companies	-	-	-
在线申请	/pages/apply/apply	users	get-profile	回填个人信息	users,employees,applications,interviews,employee_companies,companies	-	token,userInfo	登录态
在线申请	/pages/apply/apply	applications	check-status	检查申请状态	applications	-	-	-
在线申请	/pages/apply/apply	applications	create	提交申请	applications,jobs,users,interviews,companies	applications,interviews,users,candidate_owners,candidate_action_logs	读取/清理pendingCandidateReferral	姓名必填,手机号正则,自我介绍>=10字,防重复申请
在线申请	/pages/apply/apply	candidates	bind-scan-referral	绑定推荐关系	users,candidate_owners	candidate_owners,candidate_action_logs,users	pendingCandidateReferral	登录态
我的	/pages/my/my	users	get-profile	加载我的信息	users,employees,applications,interviews,employee_companies,companies	-	token,userInfo	登录态
我的	/pages/my/my	qrcode	scan	识别推荐码	qr_codes,jobs,companies	qr_codes(扫描计数)	pendingAgentReferral	二维码有效性
我的	/pages/my/my	candidates	bind-scan-referral	绑定推荐关系	users,candidate_owners	candidate_owners,candidate_action_logs,users	pendingAgentReferral	登录态
我的资料	/pages/my/profile/profile	users	get-profile	加载资料	users,employees,applications,interviews,employee_companies,companies	-	token,userInfo	-
我的资料	/pages/my/profile/profile	users	update-profile	保存资料	users,employees	users,employees	-	姓名必填,手机号正则,身份证规则+校验位,银行卡Luhn+三要素完整
我的申请	/pages/my/applications/applications	applications	my-list	加载我的申请	applications,jobs	-	token	-
我的申请	/pages/my/applications/applications	applications	update-status	取消申请	applications	applications	-	操作确认
我的工时	/pages/my/worktime/worktime	users	get-profile	获取员工身份	users,employees,applications,interviews,employee_companies,companies	-	token	-
我的工时	/pages/my/worktime/worktime	worktime	list-companies	可填报企业列表	employees,employee_companies,users,companies	-	-	-
我的工时	/pages/my/worktime/worktime	worktime	list	工时记录列表	worktimes,employees,employee_companies,users,companies	-	-	年月参数
我的工时	/pages/my/worktime/worktime	worktime	submit	提交工时	worktimes,employees,employee_companies,companies,jobs,rate_plans	worktimes(同日更新或新增)	-	日期必填,工时必填,登录态,不得早于入职/晚于离职/晚于今天,已审核不可改
我的工资	/pages/my/salaries/salaries	salaries-v2	my-list	加载工资条	employees,salaries	(可能补字段时更新salaries)	token	-
招聘之家	/pages/home/home	auth	verify-token	校验登录	login_tokens,users	-	token	登录态
招聘之家	/pages/home/home	users	get-profile	加载当前用户	users,employees,applications,interviews,employee_companies,companies	-	token,userInfo	-
招聘之家	/pages/home/home	applications	get-agent-application	查询代理申请	agent_applications	-	-	-
招聘之家	/pages/home/home	applications	apply-for-agent	申请代理	agent_applications,users	agent_applications,users	-	确认弹窗
招聘之家	/pages/home/home	qrcode	list	查询二维码	qr_codes	-	-	权限校验
招聘之家	/pages/home/home	qrcode	generate	生成推广/报名/签到/入职码	users,jobs,companies	qr_codes	-	企业/岗位/日期等必填
招聘之家	/pages/home/home	companies	list	企业下拉	companies	-	-	-
招聘之家	/pages/home/home	jobs	list	岗位下拉	jobs,companies	-	-	-
招聘之家	/pages/home/home	qrcode	scan	解析推荐码	qr_codes,jobs,companies	qr_codes(扫描计数)	pendingAgentReferral	二维码有效性
招聘之家	/pages/home/home	candidates	bind-scan-referral	绑定推荐关系	users,candidate_owners	candidate_owners,candidate_action_logs,users	pendingAgentReferral	登录态
我的报名管理	/pages/home/my-signups/index	users	get-profile	身份与权限	users,employees,applications,interviews,employee_companies,companies	-	token	登录态
我的报名管理	/pages/home/my-signups/index	jobs	list	岗位候选列表	jobs,companies	-	-	-
我的报名管理	/pages/home/my-signups/index	interviews	list	面试列表	interviews,applications,users,jobs,companies	interviews(字段补齐时同步更新)	-	筛选参数
我的报名管理	/pages/home/my-signups/index	interviews	create	新建面试	interviews,applications	interviews,applications	-	姓名/手机号/岗位/面试时间必填
我的报名管理	/pages/home/my-signups/index	interviews	update	编辑面试	interviews,applications	interviews,applications	-	同上
我的报名管理	/pages/home/my-signups/index	interviews	update-result	更新面试结果	interviews,applications	interviews,applications,(缺勤超阈值时)blacklists	-	需先选中记录
我的报名管理	/pages/home/my-signups/index	employees	onboard	办理入职	users,applications,jobs,employees,employee_companies	employees,employee_companies,users,applications	-	需先选中记录
扫码入口	/pages/qrcode-scan/scan	qrcode	scan	识别二维码	qr_codes,jobs,companies	qr_codes(扫描计数)	pendingCandidateReferral	二维码合法性
扫码入口	/pages/qrcode-scan/scan	candidates	bind-scan-referral	绑定推荐关系	users,candidate_owners	candidate_owners,candidate_action_logs,users	pendingCandidateReferral	-
报名码页面	/pages/job-apply/index	qrcode	scan	报名码预览	qr_codes,jobs,companies	qr_codes(扫描计数)	token,userInfo	二维码类型必须job_apply
报名码页面	/pages/job-apply/index	users	get-profile	回填资料	users,employees,applications,interviews,employee_companies,companies	-	token,userInfo	-
报名码页面	/pages/job-apply/index	qrcode	job-apply	扫码报名	users,applications,interviews,jobs,companies,qr_codes	applications,interviews,users,qr_codes,candidate_action_logs	-	姓名必填,手机号正则,身份证必填,防重复点击
面试签到	/pages/interview-checkin/index	qrcode	checkin-preview	签到码预检	qr_codes,jobs,companies,interviews,applications	-	token,userInfo	二维码类型/有效期/生效日
面试签到	/pages/interview-checkin/index	users	get-profile	回填资料	users,employees,applications,interviews,employee_companies,companies	-	token,userInfo	-
面试签到	/pages/interview-checkin/index	auth	wechat-phone-login	手机号快捷登录	(对应auth函数内部集合)login_tokens,users,employees,employee_companies	(对应auth函数内部写入)login_tokens,users	token,userInfo	手机号授权成功
面试签到	/pages/interview-checkin/index	qrcode	interview-checkin	提交签到	qr_codes,jobs,applications,interviews,users	applications,interviews,users,qr_codes,candidate_action_logs	-	登录态,真实姓名规则,手机号正则
内部入职	/pages/internal-onboard/index	qrcode	scan	入职码预览	qr_codes,jobs,companies	qr_codes(扫描计数)	token,userInfo	二维码类型必须internal_onboard
内部入职	/pages/internal-onboard/index	users	get-profile	回填资料	users,employees,applications,interviews,employee_companies,companies	-	token,userInfo	-
内部入职	/pages/internal-onboard/index	auth	wechat-phone-login	手机号快捷登录	(对应auth函数内部集合)login_tokens,users,employees,employee_companies	(对应auth函数内部写入)login_tokens,users	token,userInfo	手机号授权成功
内部入职	/pages/internal-onboard/index	qrcode	internal-onboard	提交入职	users,jobs,companies,employees,employee_companies,applications,interviews,qr_codes	employees,employee_companies,users,applications,interviews,qr_codes,candidate_action_logs	-	真实姓名规则,手机号正则,身份证校验,入职日期,日结能力校验
未注册登录页(源码存在)	/pages/login/login	qrcode	scan	扫码识别	qr_codes,jobs,companies	qr_codes(扫描计数)	pendingCandidateReferral,pendingAgentReferral	-
未注册登录页(源码存在)	/pages/login/login	auth	wechat-phone-login	手机号登录	(对应auth函数内部集合)login_tokens,users,employees,employee_companies	(对应auth函数内部写入)login_tokens,users	token,userInfo	手机号授权成功
未注册登录页(源码存在)	/pages/login/login	candidates	bind-scan-referral	绑定推荐关系	users,candidate_owners	candidate_owners,candidate_action_logs,users	pendingCandidateReferral,pendingAgentReferral	-
```

## 2) 接口审计重点（建议测试用例优先覆盖）

1. 重复申请与终态重投：`applications/create|apply` + `check-status` 的状态一致性。  
2. 扫码链路幂等：`qrcode/job-apply`、`qrcode/interview-checkin`、`qrcode/internal-onboard` 重复提交是否重复建单。  
3. 招聘流程联动：签到后 `applications/interviews` 状态联动；入职后 `applications/interviews/employees/employee_companies/users` 联动。  
4. 身份绑定一致性：`users.employee_id` 与 `employees.user_id` 双向绑定一致；冲突时错误信息可读。  
5. 时间边界：工时提交与签到、入职日期边界（跨时区、当天 00:00 边界）。  
6. 本地缓存时效：`pendingCandidateReferral`、`pendingAgentReferral` 过期处理和清理路径。

