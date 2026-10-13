# zhoujiland

一个自己搭的小论坛：**板块 → 主题帖 → 楼层 → 楼中楼**，带个人中心、消息通知、版主与举报。

---

## 🟢 当前上线状态（2026-10-12）

| 项目 | 值 |
| --- | --- |
| **正式网址** | <https://zhoujiland.dpdns.org> — 国内**不用 VPN** 可访问 |
| 备用网址 | `https://floor-forum.foundx128.workers.dev` — 国内需 VPN（免费域名万一出问题时用它兜底） |
| Cloudflare 账号 | `Foundx128@gmail.com's Account`（`8e374b988c8e95e5a774f341bbf76329`） |
| Worker 名 | `floor-forum`（自定义域名 + workers.dev 双入口） |
| D1 数据库 | `floor-forum`，id `c89200f1-4014-441f-a363-ba090d760cd9` |
| KV（图片） | id `d700c7829af6460a8997e3e529020e62` |
| 域名来源 | DigitalPlat FreeDomain 免费域名，有效期一年（可免费续期） |
| 平台侧 NS | `brenda.ns.cloudflare.com` / `kirk.ns.cloudflare.com` |
| 数据位置 | **全在 Cloudflare 云端**（帖子在 D1、图片在 KV），本机只是源码副本 |

**日常只做一件事**：改了代码/配置后跑 `./cf.sh deploy` 重新部署（约 1 分钟）。平时发帖、管用户、改密码都不用碰命令行。

**两个已知注意事项**：

1. **DigitalPlat 面板里的 NS 建议更新**为 `brenda.ns.cloudflare.com` + `kirk.ns.cloudflare.com`（当前填的还是旧 zone 的 `clarissa`/`corey`；实测两套都能解析，但换成平台侧新 NS 更规范）。
2. **本机浏览器打不开时先别慌**：域名刚生效那阵子，macOS 会把"域名不存在"缓存约 30 分钟（`dig` 能查到但浏览器查不到就是它）。清缓存：`sudo dscacheutil -flushcache; sudo killall -HUP mDNSResponder`，或换个设备/手机流量试。

---

同一份业务代码（`core/`）可以跑在两种地方，部署时二选一：

| | 本地 / 自建服务器 | Cloudflare（推荐，免费） |
| --- | --- | --- |
| 运行方式 | Node ≥ 22.5 + Express 无关的原生 http | Cloudflare Workers |
| 数据库 | `node:sqlite` 单文件（`data/forum.db`） | D1（免费 5GB） |
| 图片 | `data/uploads/` 目录 | KV（免费 1GB） |
| 启动 | `./start.sh` | `npm run cf:deploy` |
| 适合 | 自己电脑上玩、局域网、自己的服务器 | 想让所有人都能访问 |

---

## 🎨 想改文字或配色？只改这一个文件

`web/src/site.js` 是**站点配置**，站点名、标语、页脚、各页面文案、浅色/深色两套配色全在里面：

```js
export const site = {
  name: 'zhoujiland',                          // 站点名（浏览器标题、分享卡片也用它）
  tagline: '一块自己搭的小地方，随便聊聊',        // 副标题 / 分享描述
  footerNote: '帖子在 Cloudflare，图片在 KV',
  colors: {
    light: { accent: '#c2410c', bg: '#f6f3ee', text: '#23201d', /* … */ },
    dark:  { accent: '#fb923c', bg: '#1a1714', text: '#ece7e0', /* … */ },
  },
  nav:  { home: '逛逛', me: '我的', admin: '管理', searchPlaceholder: '搜点什么…' },
  text: { homeTitle: '逛逛板块', boardEmpty: '这儿还静悄悄的……', /* … */ },
};
```

改完执行（看到效果/上线）：

```bash
npm run build      # 只重新打包，本地预览生效
./cf.sh deploy     # 打包 + 发布到线上，一条命令
```

注意：只改引号里的内容，别删引号和逗号；颜色写 `#` 开头的十六进制。改完浏览器如果没变化，强制刷新一下（⌘ + Shift + R）。

---

## 一、本地运行（几分钟）

```bash
cd forum
./start.sh          # 自动找 Node → 装依赖 → 构建前端 → 启动
```

打开 <http://127.0.0.1:3000>。手动等价命令：

```bash
npm install
npm run build       # 构建前端到 dist/
npm start           # 启动，默认 127.0.0.1:3000
```

> 本机原本没装 Node.js，所以便携版 Node 24.21.0 放在 **`../.tools/node`**（`Desktop/ai/.tools/node`），
> `start.sh` 会自动使用它；只要 PATH 里有 ≥ 22.5 的 `node` 也可以。

想灌一批演示数据：`npm run demo`（先停服务更稳妥），会创建 `小明 / 阿强 / 李华`，密码都是 `demo1234`。

---

## 二、部署到 Cloudflare（免费、公网可访问）

需要一个 Cloudflare 账号（免费注册，**不需要信用卡**）。

### 推荐：用 `./cf.sh` 助手（不用记命令、不用手改配置）

```bash
cd forum
npm install                 # 1. 装依赖（含 wrangler）
./cf.sh login               # 2. 浏览器里点一下「允许」授权
./cf.sh create-db           # 3. 创建 D1 数据库，自动把 database_id 写进 wrangler.toml
./cf.sh create-kv           # 4. 创建 KV（存图片），自动把 id 写进 wrangler.toml
./cf.sh deploy              # 5. 构建前端 + 部署上线（会打印访问地址）
```

其它常用：`./cf.sh dev`（本地跑 Worker）、`./cf.sh tail`（看线上日志）、`./cf.sh init-db`（手动建表）、
`./cf.sh whoami`（看登录状态）。

### 或者手动执行原生命令

```bash
npm install
npx wrangler login
npm run cf:create-db        # 把输出的 database_id 填进 wrangler.toml
npm run cf:create-kv        # 把输出的 id 填进 wrangler.toml
npm run cf:deploy
```

部署成功后会打印形如 `https://floor-forum.<你的子域>.workers.dev` 的地址，打开即可。
数据表会在**第一次访问时自动创建**（也可以在部署后手动执行 `npm run cf:init-db`）。

首次登录：`admin` / `admin123` —— **请在「我的 → 修改密码」里立刻改掉**（页面顶部会一直提醒你）。

### ⚠️ 一定要绑自己的域名

Cloudflare 默认送的 `*.workers.dev` 域名**在中国大陆基本打不开**。要让别人（尤其是国内的人）访问，请在
Cloudflare 控制台：`Workers & Pages → 选中 floor-forum → Settings → Domains & Routes → Add custom domain`，
绑一个你自己的域名（域名可以在 Cloudflare 注册，也可以用别处买的，把 NS 交给 Cloudflare 即可，免费套餐够用）。

绑定自定义域名后 HTTPS 由 Cloudflare 自动签发，不需要自己配证书。

### 之后的日常

```bash
npm run cf:deploy     # 改完代码重新部署（会自动重新构建前端）
npm run cf:tail       # 实时看线上日志
npm run cf:dev        # 本地跑 Worker（本地模拟 D1/KV，不碰线上数据）http://127.0.0.1:8787
```

### 用 GitHub 自动部署（已配置好，推荐）

仓库里的构建配置已经写好，连上之后**推代码就自动上线**：

1. GitHub 新建一个空仓库（Private 也行），拿到 `git@github.com:你的名字/仓库名.git`
2. 本地加远端并推送：`git remote add origin <上面的地址> && git push -u origin main`
3. Cloudflare 控制台 → **Workers & Pages → floor-forum → Settings → Builds → Connect**
   - 选你的 GitHub 仓库
   - **Build command**：`npm run build`
   - **Deploy command**：`npx wrangler deploy`
4. 之后每次 `git push` 都会自动构建 + 部署，不用再手动跑 `./cf.sh deploy`

### 手动用 GitHub 上的代码部署（备选）

想让「改代码 → 推 GitHub → 自动上线」，把仓库推上去后在 Cloudflare 控制台
`Workers & Pages → floor-forum → Settings → Builds → Connect`，选择你的 GitHub 仓库，填：

- Build command：`npm run build`
- Deploy command：`npx wrangler deploy`

之后每次 push 都会自动构建部署。注意：**GitHub Pages 不能用来跑这个项目**（它只能托管静态文件，
没有服务端和数据库，发帖、登录、上传都会失效）；GitHub 在这里的作用是存代码 + 触发部署。

---

## 三、免费额度与限制（2026 年 10 月查证）

| 项目 | 免费额度 | 超了会怎样 |
| --- | --- | --- |
| Workers 请求 | 约 10 万次/天，单次 10ms CPU | 当天报错，次日 00:00 UTC 恢复（[定价](https://developers.cloudflare.com/workers/platform/pricing/)） |
| D1 读 | 500 万行/天 | 当天查询报错，次日恢复（[定价](https://developers.cloudflare.com/d1/platform/pricing/index.md)） |
| D1 写 | 10 万行/天 | 同上 |
| D1 存储 | 5 GB | 需要清理旧数据 |
| KV 读 | 10 万次/天 | 当天读不到图片 |
| KV 写 | 1000 次/天 | 当天上传不了新图片（[限制](https://developers.cloudflare.com/kv/platform/limits/index.md)） |
| 出网流量 | 不限（D1 不计流量费） | — |

对个人/小圈子论坛来说这些额度非常宽裕：一次打开帖子页约读几百行，一天几千次浏览也远没到上限。
真正容易先到顶的是 **KV 每天 1000 次写入（= 每天最多约 1000 张新图）**，图片多了可以换成 R2（免费 10GB），
把 `core/uploads.js` 里的 KV 适配器换成 R2 适配器即可（接口只有 `put/get/delete` 三个方法）。

### ⚠️ 免费版最大的坑：10ms CPU 预算

Workers 免费版**每次请求只有 10ms CPU**，而密码哈希是纯 CPU 开销，实测数据：

| PBKDF2 迭代数 | 耗时 | 结果 |
| --- | --- | --- |
| 210,000 | 27.5 ms | ❌ 超限，请求抛异常 → 页面报「服务器内部错误」 |
| 100,000 | 12.5 ms | ❌ 仍然超限 |
| **25,000（当前默认）** | **3.3 ms** | ✅ 安全 |

所以 `core/password.js` 里默认取 `ITERATIONS = 25_000`。**如果你升级到 Workers 付费版**（CPU 上限 30 秒），
把这一行调回 `600_000`（OWASP 建议值）即可，存储格式自带迭代数，新旧密码都还能验证。

同类陷阱：任何放在请求路径里的重计算（大循环、复杂正则、图片处理）都可能触发同样的 500。
排查时把 `wrangler.toml` 里的 `FORUM_DEBUG` 设为 `"1"`，500 响应会带上真实异常信息（稳定后可删掉）。

---

## 四、数据、备份与迁移

> ⚠️ **纪律**：导出的数据文件（`backup/*.sql`）、数据库文件一律**不要提交到 git**。
> 仓库里已经配了 `.gitignore` 规则和 `.githooks/pre-commit` 钩子来自动拦截；
> 换机器后记得执行一次 `git config core.hooksPath .githooks` 启用钩子。

- **Cloudflare**：`npx wrangler d1 export floor-forum --remote --output=backup.sql` 导出全部帖子数据；
  KV 里的图片用 `wrangler kv key list/get` 或控制台下载。恢复用 `wrangler d1 execute --remote --file=backup.sql`。
- **本地**：直接拷 `data/forum.db`（连同 `data/uploads/`）。
- **线上 → 本地 / 自己的服务器**：`npm run export-db`（导出线上 D1 到 `backup/*.sql`），
  加 `--import` 会顺便灌进本地 `data/forum.db`：`npm run export-db:import`。搬去 VPS 时连 `data/uploads/` 一起拷。
- **本地 → 线上**：先在本地 `npx wrangler d1 export`（或直接把 `data/forum.db` 用 `sqlite3 .dump` 导出成 SQL），
  再 `npx wrangler d1 execute floor-forum --remote --file=你的备份.sql`。

---

## 五、上线前的安全清单

1. **改掉 `admin` 的默认密码**（最高优先级，README 里写着这个密码，等于公开）。
2. 建议关掉公开注册：删掉/注释 `core/routes/auth.js` 里的 `register` 路由，或改成需要邀请码。
3. 图片上限 5MB、只允许 PNG/JPG/GIF/WebP（已在 `core/routes/upload.js` 里限制）。
4. 只用 HTTPS 访问（绑定自定义域名后 Cloudflare 会自动提供）；Cookie 在 HTTPS 下会自动带 `Secure`。
5. 需要更严的防刷：在 Cloudflare 控制台给 `/api/auth/register`、`/api/threads/*/posts` 加 Rate Limiting 规则（免费套餐有基础额度）。

---

## 六、功能

- **板块**：列表、任意用户（含匿名）新建板块、简介、帖数/回复数/最近活动。
- **主题帖**：发帖（自动生成 1 楼＝楼主）、置顶、锁定、三种排序、板块内搜索、分页、浏览计数；**每页 50 帖**（可在工具栏切换 20 / 50 / 100 / 200）。
- **楼层**：独立编号（楼主 / 2 楼 / 3 楼…），**楼层号永久保留**，删楼只留占位不塌号；**每页 50 层**（可切换 20 / 50 / 100 / 200）。
- **楼中楼**：点「回复本层」在该层下嵌套，显示「回复 N 楼 @某人」；回复楼中楼也归到同一主楼层，不占楼层号。
- **内容**：Markdown（列表/引用/代码块/表格/链接）、图片上传与粘贴、表情面板、编辑/预览、⌘+Enter 提交。
- **个人中心**：每位注册用户有公开主页 `/u/:id`（头像、角色、注册时间、个性签名、主题帖/回复/获赞统计、可翻页的主题帖与回复列表）；
  `/me` 是个人中心，可改签名、上传头像、改密码、看自己的内容。头像支持首字母彩色兜底（没传头像也有辨识度）。
- **互动**：点赞（可取消）、编辑自己的楼层、删除自己的楼层或帖子、倒序看帖、我的发帖/盖楼记录。
- **搜索**：标题 + 楼层正文全站搜索，**每页 50 条**。
- **消息通知**：别人回复你的帖子 / 回复你的楼层 / 点赞 / `@你` 时，会在顶栏铃铛亮起未读数；通知中心可翻页、一键已读。只发给注册用户（游客没有账号）。同一次操作里同一人只收一条，且 `@提及` 优先于「帖子里有人回复」。
- **版主**：管理员可以为每个板块任命/撤销版主。版主能置顶、锁定、删除本板块的帖子与楼层，并处理本板块的举报；管不到别的板块。
- **举报**：楼层和主题都能举报（6 种常见理由 + 补充说明），同一个人对同一目标只留一条未处理记录；管理员看全部队列，版主只看自己板块。
- **站内公告**：管理员在后台发布/编辑/下架，前台顶部横幅显示（重要级更醒目），可展开看 Markdown 正文、可点 ✕ 不再显示这一条；`/announcements` 能看到历史公告（含已下架的）。下架即"取消发布"，删除即彻底移除。
- **管理后台** `/admin`：数据总览、**举报处理队列**、**板块与版主任命**、删除/恢复板块、用户封禁/解封、设为/取消管理员、删除/恢复帖子与楼层。

### 身份与权限

| 身份 | 能做什么 |
| --- | --- |
| 访客（没设昵称） | 浏览、搜索 |
| 匿名访客（设了昵称） | 发帖、回帖、开板块、点赞（昵称只存在本机 Cookie） |
| 注册用户 | 同上，发言带固定用户名 |
| **版主**（按板块任命） | 置顶/锁定/删除**本板块**帖子与楼层、处理本板块举报 |
| 管理员 | 上述全部 + 任意板块、封禁用户、任命版主、恢复内容 |

---

## 七、目录结构

```
forum/
├── core/                     ← 与运行时无关的全部业务逻辑
│   ├── router.js             微型路由 + 应用装配（Node / Workers 共用）
│   ├── http.js               上下文、Cookie、错误
│   ├── auth.js               身份解析（登录 / 匿名）与权限
│   ├── password.js           WebCrypto PBKDF2 口令哈希
│   ├── store.js              所有 SQL（建表、帖子、楼层、点赞、搜索、管理）
│   ├── schema.js             表结构（唯一来源）
│   ├── serialize.js          出参结构
│   ├── uploads.js            图片存储适配器（本地目录 / KV）
│   ├── adapters.js           数据库适配器（node:sqlite / D1）
│   └── routes/               auth / boards / threads / posts / search / admin / upload
├── server/index.js           Node 入口（node:http + 静态资源）
├── worker/index.js           Cloudflare Workers 入口（D1 + KV + 静态资源）
├── worker/schema.sql         由 core/schema.js 生成，供 cf:init-db 用
├── wrangler.toml             Cloudflare 部署配置（要填两个 ID）
├── web/                      React 前端源码（Vite）
├── scripts/                  demo 演示数据 / reset 重置 / gen-schema
├── build.mjs                 前端构建与开发服务器
├── start.sh                  本地一键启动
└── data/                     本地运行时生成：forum.db + uploads/（已 gitignore）
```

### 数据模型

```
boards ──< threads ──< posts ──< posts (parent_id 自关联 = 楼中楼)
   │              └──< likes (target_type/target_id + actor_key)
   ├──< board_moderators >── users          （板块版主）
   └──< reports (target_type/target_id)     （举报）
users ──< sessions
      └──< notifications                    （消息通知）
```

- `posts.floor_no`：主楼层序号（楼主 = 1）；楼中楼为 `NULL`，不占楼层号。
- `posts.quote_floor_no / quote_author`：楼中楼引用的「N 楼 @某人」。
- `posts.actor_key`：`user:<id>` 或 `guest:<访客ID>`，用于判断「是不是我发的」。
- `users.bio` / `users.avatar`：个性签名（最多 100 字，显示在楼层下方）与头像（指向本站 `/uploads/...`，未设置时前端用首字母彩色头像兜底）。
- 删除一律是软删除（`deleted = 1`）：板块、帖子、楼层都只是隐藏，数据与楼层号保留，管理员在 `/admin` 一键恢复。
- 板块被删除后：首页不显示、板块内帖子与搜索结果的链接返回 404，但后台仍能看到它的统计。
- 楼层号由单条 SQL 原子生成（`SELECT MAX(floor_no)+1` 内联在 INSERT 里），Node 侧多语句写操作走
  `BEGIN IMMEDIATE` 事务，D1 侧走原生 `batch()`，两边都不会撞号。

---

## 八、常用命令

```bash
# 本地
npm start          # 启动（需先 build）
npm run build      # 构建前端到 dist/
npm run dev:web    # 前端开发服务器 :5173（代理 /api 到 :3000）
npm run demo       # 灌演示数据
npm run reset-db   # 清空本地数据库与图片

# Cloudflare
npm run cf:dev         # 本地跑 Worker（本地 D1/KV）:8787
npm run cf:create-db   # 创建 D1
npm run cf:create-kv   # 创建 KV
npm run cf:init-db     # 手动建表（首次访问也会自动建）
npm run cf:deploy      # 构建 + 部署
npm run cf:tail        # 看线上日志
```

环境变量（仅本地 / 自建服务器）：`PORT`（默认 3000）、`HOST`（默认 127.0.0.1，局域网共享用 `0.0.0.0`）、
`FORUM_DATA_DIR`（默认 `./data`）。

---

## 九、接口速览

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| GET | `/api/boards` | 板块列表 |
| POST | `/api/boards` | 新建板块 |
| GET | `/api/boards/:slug/threads` | 板块内帖子（`page` `size` `sort` `q`） |
| POST | `/api/boards/:slug/threads` | 发新帖（自动生成 1 楼） |
| GET | `/api/threads/:id` | 帖子详情 + 楼层（`page` `size` `order=asc\|desc`） |
| POST | `/api/threads/:id/posts` | 盖楼；带 `parentId` 则是楼中楼 |
| POST | `/api/threads/:id/like` | 给某层点赞/取消（`postId`） |
| PATCH / DELETE | `/api/posts/:id` | 编辑 / 删除楼层 |
| PATCH / DELETE | `/api/threads/:id` | 改标题、置顶、锁定 / 删除整帖 |
| GET | `/api/search?q=` | 全站搜索 |
| GET | `/api/users/:id` | 公开个人主页（`tab=threads\|posts`、`page`、`size`）：资料 + 统计 + 内容 |
| GET | `/api/notifications` | 我的消息通知（含未读数，`page`、`size`） |
| POST | `/api/notifications/read` | 标记已读（`ids` 可选，不传=全部） |
| POST | `/api/reports` | 举报楼层/主题（`targetType`、`targetId`、`reason`、`detail`） |
| GET | `/api/reports` | 举报处理队列（管理员全部 / 版主本板块，`status`） |
| POST | `/api/reports/:id` | 处理举报（`action` = `resolve` \| `reject`） |
| GET | `/api/announcements` | 公告列表（默认只给生效中的；`?history=1` 含已下架） |
| GET | `/api/announcements/all` | 后台：全部公告（管理员） |
| POST | `/api/announcements` | 发布公告（管理员） |
| PATCH | `/api/announcements/:id` | 编辑 / 上架 / 下架（管理员，只传要改的字段） |
| DELETE | `/api/announcements/:id` | 删除公告（管理员） |
| POST | `/api/admin/boards/:id/moderators` | 任命/撤销版主（`action` = `add` \| `remove`、`userId`） |
| PATCH | `/api/auth/profile` | 修改个人资料（`bio` 签名、`avatar` 头像，仅登录用户） |
| POST | `/api/upload` | 上传图片：**请求体是图片原始字节**，`Content-Type: image/*` |
| GET | `/uploads/:key` | 读取图片 |
| POST | `/api/auth/register\|login\|logout\|guest\|password` | 注册 / 登录 / 退出 / 匿名昵称 / 改密 |
| GET | `/api/auth/me` `\|/api/auth/mine` | 当前身份 / 我的发言 |
| GET | `/api/admin/overview`、`/api/admin/threads` | 管理总览、帖子管理 |
| GET | `/api/admin/boards` | 板块管理列表（含已删除） |
| POST | `/api/admin/boards/:id` | 删除 / 恢复板块（action 取 delete 或 restore） |
| POST | `/api/admin/users/:id`、`/api/admin/threads/:id/restore`、`/api/admin/posts/:id/restore` | 封禁/授权、恢复内容 |

---

## 十、常见问题

**Q：`wrangler deploy` 报找不到数据库？**
A：`wrangler.toml` 里的 `database_id` / KV `id` 还是占位符，按上面第 3、4 步替换成真实 ID。

**Q：打开 `xxx.workers.dev` 打不开 / 很慢？**
A：该域名在国内经常无法直连，绑定自己的域名即可（见上文）。

**Q：上传图片报 501？**
A：没有绑定 KV。执行 `npm run cf:create-kv` 并把 `id` 填进 `wrangler.toml`，重新部署。

**Q：D1 报 "exceeded free tier daily row read limit"？**
A：当天读行数超了，次日 00:00 UTC 自动恢复；也可以在 `wrangler.toml` 里把 `[observability]` 打开后查看哪些查询扫得最多，或给常用筛选字段加索引。

**Q：本地数据库密码算法换了，旧数据还能用吗？**
A：v2 起改用 PBKDF2（原因见上文）。旧版 bcrypt 哈希无法验证，只需 `npm run reset-db && npm run demo` 重建本地数据即可（线上是全新库，不受影响）。
