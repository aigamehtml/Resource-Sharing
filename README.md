# 私密分享站 · Cloudflare Workers 版（纯静态 HTML）

密码保护的内容分享网站（访客输入访问密码查看文字，独立管理后台增删内容、改密码）。
本项目已**去掉 Next.js / React / Node 构建**：前端是普通 HTML，后端是一个 Cloudflare Worker，存储用 Cloudflare D1（免费 SQLite）。部署只需一条 `wrangler deploy`，无需 `npm install`、无需 `next build`。

## ✨ 功能

- 访客流程：首页 `/` 选资源账号（边玩边赚公众号 / 得劲滋润爽的B站）→ 访问密码页 `/login.html?resource=1|2` → 已授权内容页 `/content.html?resource=1|2` 查看分享内容。两个资源各自独立。
- 管理后台：登录页 `/admin/login.html` → 仪表台 `/admin/`（管理密码登录后，按资源分别管理：增删内容、改访客密码、改全局管理密码）。
- 数据存 **Cloudflare D1**，无需外部数据库、无需 KV 审批，免费额度足够。

## 🛠️ 技术栈（极简）

- 前端：纯 HTML + 原生 JS（Tailwind / 图标走 CDN，无任何本地依赖、无构建步骤）
- 后端：单个 Cloudflare Worker（`worker.js`，Web Standards）
- 存储：Cloudflare D1（SQLite，绑定名 `DB`，单表 `kv(k, v)`）

## 🔑 默认密码（部署后请立即修改）

| 用途 | 默认值 |
|------|--------|
| 访客访问密码 | `888888` |
| 管理密码 | `admin888` |

登录 `/admin/login.html` → 仪表台「密码设置」即可修改。

## 🚀 部署到 Cloudflare

> 前置：已安装 Node.js（仅用于运行 wrangler 部署工具，不需要装任何前端依赖）。

```bash
# 1. 登录 Cloudflare（首次，浏览器授权）
npx wrangler login

# 2. 创建 D1 数据库，记下输出的 database_id
npx wrangler d1 create password-share

# 3. 把上一步的 database_id 填进 wrangler.toml 的 database_id 字段
#    （当前为占位符 REPLACE_WITH_YOUR_D1_ID）

# 4. 执行迁移，建表 + 预置管理密码
npx wrangler d1 migrations apply password-share --remote

# 5. 部署（上传 worker.js + public/ 静态资源）
npx wrangler deploy
```

> 不想全局装 wrangler？上面的命令用 `npx wrangler ...` 即可，无需 `npm install`。
> 若本地放了 `package.json`，也可 `npm install`（只装 wrangler 一个包）后用 `npm run deploy` / `npm run migrate`。

部署完成后访问分配的 `*.workers.dev` 域名即可；自定义域名在 Workers & Pages → 项目 → Settings → Triggers 中绑定。

## 💻 本地预览

```bash
npx wrangler dev          # 同时托管前端与 /api，默认 http://localhost:8787
```
首次本地运行请先建本地库并迁移：
```bash
npx wrangler d1 migrations apply password-share --local
```

## 📁 项目结构

```
password-share-cf/
├── worker.js                 # Cloudflare Worker 入口：处理 /api/* + 托管静态资源
├── wrangler.toml            # Workers 配置（assets 指向 public/、D1 绑定）
├── migrations/
│   └── 0001_init.sql         # D1 建表 + 预置管理密码
├── public/
│   ├── index.html            # 首页：选择资源账号
│   ├── login.html            # 访客访问密码页（?resource=1|2）
│   ├── content.html          # 访客已授权内容页（?resource=1|2）
│   ├── common.js             # 前后台公共函数（主题色 / 转义 / 复制 / URL 参数解析）
│   ├── admin/
│   │   ├── login.html        # 后台登录页
│   │   └── index.html        # 后台仪表台
│   └── *.png                 # 二维码等图片
└── package.json              # 仅含 wrangler 与 deploy/migrate 脚本（可选）
```

## 📄 页面路由

前端按页面拆分为独立 HTML，状态通过 URL 参数 `?resource=` 与 `sessionStorage` 共享（公共 `common.js` 提供主题色、转义、复制等公共函数）。

| 页面 | 路径 | 说明 |
|------|------|------|
| 首页 | `/` 或 `/index.html` | 选择资源账号（1=边玩边赚公众号 / 2=得劲滋润爽的B站），点击后跳 `/login.html?resource=<id>` |
| 访客密码页 | `/login.html?resource=1\|2` | 输入访问密码；校验通过后写入 `sessionStorage.share_access`，跳 `/content.html?resource=<id>` |
| 访客内容页 | `/content.html?resource=1\|2` | 校验 `sessionStorage.share_access` + 请求头 `X-Access-Code`；分页每页 10 条、最新在前、按资源应用主题色（公众号=微信绿 / B站=粉） |
| 后台登录页 | `/admin/login.html` | 输入管理密码；校验通过后写入 `sessionStorage.admin_code`，跳 `/admin/index.html` |
| 后台仪表台 | `/admin/` 或 `/admin/index.html` | 校验 `sessionStorage.admin_code`，无令牌则跳登录页；按资源增删内容、改密码 |

> 资源编号约定：`1` = 边玩边赚公众号（微信绿 `#07C160`），`2` = 得劲滋润爽的B站（B站粉 `#FB7299`）；公共页面保持中性主题。

## 🎯 API 一览（与原版一致）

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | /api/auth/visitor | 校验访客密码（需传 `resource`） |
| POST | /api/auth/admin | 校验管理密码 |
| GET | /api/content?resource=1 | 获取内容（需 `X-Access-Code` 或 `X-Admin-Code` 头） |
| POST | /api/admin/content | 添加内容（需 `X-Admin-Code` + `resource`） |
| POST | /api/admin/content/delete | 删除内容（需 `X-Admin-Code` + `resource`） |
| POST | /api/admin/password | 改访客/管理密码（需 `X-Admin-Code`） |

## ⚠️ 说明

- 纯静态前端用 Tailwind Play CDN 还原了原版深色 UI，**无需构建**。若上生产想去掉运行时 CDN，把用到的 Tailwind 类编译成一份 `styles.css` 内联即可（不影响功能）。
- 数据为轻量密码门方案，密码以明文存入 D1、请求头透传，适合非敏感内容的私密分享；请勿用于高安全场景。
