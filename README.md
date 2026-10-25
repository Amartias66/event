# 微光待办

需要 Node.js 24 或更新版本，无须安装第三方依赖。

在此目录打开终端运行：

```powershell
node server.js
```

浏览器访问 http://127.0.0.1:3000 。不要直接双击 HTML 文件：SQLite 和登录会话需要通过后端运行。

首次使用请注册。注册成功后回到登录选项卡，登录后进入 contet.html。添加任务后可勾选完成、删除，按状态和分类组合筛选。退出登录返回登录页。

- index.html / style.css：原登录注册页面。
- auth.js：注册和登录请求、成功后跳转。
- contet.html / contet.css / contet.js：独立待办页面、样式和交互。
- server.js：Node.js HTTP 后端与内置 SQLite。
- weiguang.sqlite：首次运行自动创建，保存账号、任务和会话；不要公开或提交此文件。

任务查询、更新和删除均使用当前登录会话中的 user_id；客户端不能指定其他用户。密码采用随机盐和 scrypt 哈希保存，会话使用 HttpOnly Cookie，24 小时到期。这是本地演示应用，默认仅监听 127.0.0.1；公开部署还需要 HTTPS、登录限流等部署配置。

截止日期按浏览器本地自然日计算，今天及未来两天为橙色提醒，早于今天为红色逾期，已完成任务不提醒。统计汇总当前账号全部任务，不随筛选变化。

验证后端流程：

```powershell
node --test server.test.js
```
