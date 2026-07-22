# CAP Worker — Twikoo 适配版 | CAP 验证码服务

[![Deploy to Cloudflare](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/xyTom/cap-worker)

> 📌 **本仓库 Fork 自 [xyTom/cap-worker](https://github.com/xyTom/cap-worker)**，在原版基础上新增了 `/api/siteverify` 接口以兼容 **Twikoo 评论系统**（v1.7.14+）的 Cap 验证码功能。

---

## 📋 目录

- [项目说明](#-项目说明)
- [新增功能](#-新增功能)
- [功能特性](#-功能特性)
- [系统架构设计](#-系统架构设计)
- [在线演示](#-在线演示)
- [快速开始](#-快速开始)
- [API 参考](#-api-参考)
- [Twikoo 集成指南](#-twikoo-集成指南)
- [开发设置](#-开发设置)
- [部署](#-部署)
- [安全配置](#-安全配置)
- [项目结构](#-项目结构)
- [贡献](#-贡献)
- [许可](#-许可)
- [相关链接](#-相关链接)

---

## 📖 项目说明

本项目是基于 [xyTom/cap-worker](https://github.com/xyTom/cap-worker) 的社区增强版。原项目是一个优秀的基于 Cloudflare Workers + Durable Objects 构建的 Cap 人机验证服务，采用 SHA-256 工作量证明（PoW）算法。

### 与原版的区别

| 特性 | 原版 xyTom/cap-worker | 本增强版 |
|------|----------------------|---------|
| `/api/challenge` | ✅ | ✅ |
| `/api/redeem` | ✅ | ✅ |
| `/api/validate` | ✅ | ✅ |
| **`/api/siteverify`** | ❌ 缺失 | ✅ **新增** |
| 兼容 Twikoo Cap 验证 | ❌ 不兼容 | ✅ **完全兼容** |
| `CAP_SECRET_KEY` 环境变量 | ❌ | ✅ 通过 Cloudflare Secret 加密存储 |

### 为什么要新增 `/api/siteverify`？

Twikoo 评论系统（v1.7.14+）内置了对 Cap 验证码的支持，但其后端验证逻辑调用的是 **`POST /api/siteverify`** 接口（与官方 Cap 服务一致的接口规范），而社区版原项目未实现此端点。本增强版补全了这个接口，使得自部署的 Cap Worker 能够完美对接 Twikoo。

---

## ✨ 新增功能

- **`POST /api/siteverify`** — 兼容官方 Cap 的验证接口，接收 `{ secret, response }` 参数，返回 `{ success: true/false }`
- **`CAP_SECRET_KEY` 支持** — 通过 Cloudflare Secret 机制加密存储，安全可靠，不会泄露到代码仓库
- **与 Twikoo v1.7.14+ 无缝集成** — 配置即用

---

## 🚀 功能特性

- **超高性能**: 在全球 250+ 个城市边缘部署，响应时间低于 100ms
- **工作量证明**: 采用 SHA-256 PoW 算法进行计算挑战验证
- **开发者友好**: RESTful API 设计
- **全球 CDN**: 基于 Cloudflare 边缘基础设施构建
- **隐私优先**: 无跟踪，无数据收集
- **简易集成**: 5 分钟设置，代码改动最少
- **Twikoo 兼容**: 开箱即用，完美对接 Twikoo 评论系统

---

## 🏗️ 系统架构设计

CAP Worker 基于 Cloudflare 尖端基础设施，提供稳健且可扩展的验证码解决方案：

### 分布式架构

- **持久化对象 (DO)**: 挑战状态管理，具备强一致性保证
- **边缘 Workers**: 计算验证分布在全球 250+ 个位置
- **自动扩缩容**: 根据流量需求无缝水平扩展

### 性能与并发控制

- **冲突防护**: 持久化对象确保原子操作，防止竞态条件
- **负载分发**: 多个 Worker 实例并行处理验证工作负载
- **零冷启动**: 边缘优化部署，最小化延迟峰值

### 工作量证明流水线

1. **挑战生成**: 通过持久化对象创建密码学安全的挑战
2. **分布式验证**: 自动扩展的 Workers 处理 SHA-256 PoW 计算
3. **状态同步**: 通过强一致性管理挑战生命周期

### Twikoo 验证流程

```
用户浏览器                    Cap Worker                   Twikoo 后端 (Vercel)
    │                            │                              │
    ├── 请求 challenge ────────►│                              │
    │◄── 返回 challenge 数据 ────┤                              │
    │                            │                              │
    │  计算 PoW 并提交解答 ────►│                              │
    │◄── 返回 token ────────────┤                              │
    │                            │                              │
    │  提交评论（含 token） ──────────────────────────────────►│
    │                            │                              │
    │                            │◄── POST /api/siteverify ────┤
    │                            │      { secret, response }    │
    │                            ├── 验证 secret & token ──────►│
    │                            │◄── { success: true } ───────┤
    │                            │                              │
    │◄── 评论发表成功 ──────────────────────────────────────────┤
```

---

## 🌐 在线演示

访问 [https://captcha.gurl.eu.org/](https://captcha.gurl.eu.org/) 体验 CAP Worker 并查看交互式文档。

---

## 📦 快速开始

### 1. 安装

在您的 HTML 中添加 CAP Worker 脚本：

```html
<script src="https://你的域名/cap.min.js"></script>
```

### 2. HTML 设置

在表单中添加验证码组件：

```html
<cap-widget 
  id="cap" 
  data-cap-api-endpoint="https://你的worker域名.workers.dev/api/">
</cap-widget>
```

### 3. JavaScript 集成

处理验证码事件：

```javascript
const widget = document.querySelector("#cap");

widget.addEventListener("solve", async function (e) {
  const token = e.detail.token;
  
  // 服务端验证令牌
  const result = await fetch('https://你的worker域名.workers.dev/api/validate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ 
      token: token, 
      keepToken: false 
    })
  });
  
  const validation = await result.json();
  if (validation.success) {
    console.log("验证码通过！");
  }
});
```

### 4. 服务端验证

Node.js 服务端验证示例：

```javascript
app.post('/protected-endpoint', async (req, res) => {
  const { captchaToken } = req.body;
  
  try {
    const validation = await fetch('https://你的worker域名.workers.dev/api/validate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ 
        token: captchaToken,
        keepToken: false
      })
    });
    
    const result = await validation.json();
    
    if (result.success) {
      res.json({ message: '访问授权' });
    } else {
      res.status(400).json({ error: '验证码验证失败' });
    }
  } catch (error) {
    res.status(500).json({ error: '验证错误' });
  }
});
```

---

## 🔌 API 参考

### 生成挑战

```http
POST /api/challenge
Content-Type: application/json
```

**响应:**

```json
{
  "token": "785975238a3c4f0c1b0c39ed75e6e4cc152436cc0d94363de6",
  "challenge": "{ \"c\": 50, \"s\": 32, \"d\": 4 }",
  "expires": 1753924498818
}
```

### 验证解答

```http
POST /api/redeem
Content-Type: application/json

{
  "token": "c6bd7fd0bea728b5405f0e3637dca6d1b88aaf33589809a103",
  "solutions": [1, 3, 7]
}
```

**响应:**

```json
{
  "success": true,
  "token": "785975238a3c4f0c1b0c39:ed75e6e4cc152436cc0d94363de6"
}
```

### 验证令牌

```http
POST /api/validate
Content-Type: application/json

{
  "token": "785975238a3c4f0c1b0c39:ed75e6e4cc152436cc0d94363de6",
  "keepToken": false
}
```

**响应:**

```json
{
  "success": true
}
```

### 🔥 新增：兼容 Twikoo 的 siteverify 接口

```http
POST /api/siteverify
Content-Type: application/json

{
  "secret": "你设置的CAP_SECRET_KEY",
  "response": "用户完成验证后获得的token"
}
```

**成功响应:**

```json
{
  "success": true
}
```

**失败响应（密钥错误）:**

```json
{
  "success": false,
  "error": "Invalid secret"
}
```

**失败响应（token 无效）:**

```json
{
  "success": false,
  "error": "NOT_FOUND"
}
```

**失败响应（token 已过期）:**

```json
{
  "success": false,
  "error": "EXPIRED"
}
```

---

## 🔗 Twikoo 集成指南

### 前提条件

- Twikoo 评论系统已部署到 Vercel，版本 **≥ 1.7.14**
- Cap Worker 已成功部署到 Cloudflare Workers

### 步骤一：配置 Cap Worker 的 Secret 密钥

> ⚠️ **安全提示**：`CAP_SECRET_KEY` 不要写在 `wrangler.jsonc` 中，应通过 Cloudflare Secret 机制加密设置。

**方式一：Cloudflare Dashboard（推荐）**

1. 登录 [Cloudflare Dashboard](https://dash.cloudflare.com/)
2. 进入 **Workers & Pages** → 点击你的 **cap-worker**
3. 进入 **Settings** → **Variables**
4. 在 **Secrets** 区域，点击 **Add secret**
5. 填写：
   - **Name**: `CAP_SECRET_KEY`
   - **Value**: 一个强密钥（建议 32 位以上随机字符串，可用 `openssl rand -hex 32` 生成）
6. 点击 **Encrypt** 保存
7. 重新部署 Worker 使 Secret 生效

**方式二：Wrangler CLI**

```bash
# 生成强密钥
openssl rand -hex 32

# 设置为 Cloudflare Secret（不会存入 wrangler.jsonc）
npx wrangler secret put CAP_SECRET_KEY

# 根据提示输入你的密钥值
# 然后重新部署
npm run deploy
```

### 步骤二：确认 wrangler.jsonc 中无密钥明文

确保 `wrangler.jsonc` 的 `vars` 部分如下（**不含** `CAP_SECRET_KEY`）：

```json
"vars": {}
```

### 步骤三：配置 Twikoo 管理面板

登录 Twikoo 管理面板 → **评论管理 → 配置**，添加以下环境变量：

| 配置项 | 值 | 说明 |
|--------|-----|------|
| `CAPTCHA_PROVIDER` | `Cap` | 启用 Cap 验证码 |
| `CAP_API_ENDPOINT` | `https://你的worker域名.workers.dev/api` | Cap Worker 的 API 地址（**必须带 `/api` 后缀**） |
| `CAP_SECRET_KEY` | 与上一步设置的密钥 **完全一致** | 用于验证的密钥 |

### 步骤四：验证集成

1. 打开你的博客页面
2. 评论区应该出现 Cap 人机验证组件（一个 checkbox 或拼图）
3. 勾选完成验证
4. 填写评论内容并提交
5. 评论应该成功发布，无需再次验证码

---

## 🛠️ 开发设置

### 环境要求

- Node.js 18+
- Cloudflare 账户
- Wrangler CLI

### 安装步骤

1. 克隆仓库：

```bash
git clone https://github.com/你的用户名/cap-worker.git
cd cap-worker
```

2. 安装依赖：

```bash
npm install
```

3. 配置 Wrangler：

```bash
npx wrangler auth login
```

4. 启动开发服务器：

```bash
npm run dev
```

### 脚本命令

- `npm run dev` - 启动开发服务器
- `npm run deploy` - 部署到 Cloudflare Workers
- `npm run start` - dev 命令的别名
- `npm run cf-typegen` - 生成 TypeScript 类型

---

## 🚀 部署

1. 在 `wrangler.jsonc` 中更新您的域名（可选）：

```json
{
  "route": "your-domain.com/*"
}
```

2. 设置 CAP_SECRET_KEY（如果尚未设置）：

```bash
npx wrangler secret put CAP_SECRET_KEY
```

3. 部署到 Cloudflare Workers：

```bash
npm run deploy
```

---

## 🔒 安全配置

### Secret 与 vars 的区别

| 方式 | 配置文件位置 | 是否提交到 Git | 安全性 |
|------|-------------|---------------|--------|
| `vars` 普通变量 | `wrangler.jsonc` | ✅ 会提交 | ❌ 不安全，密钥泄露 |
| `secrets` 加密密钥 | Cloudflare Dashboard / CLI | ❌ 不在代码中 | ✅ 安全，加密存储 |

### 最佳实践

- ✅ 将 `CAP_SECRET_KEY` 设为强密码（建议 32 位以上随机十六进制字符串）
- ✅ 使用 `npx wrangler secret put` 或 Dashboard 设置
- ❌ 不要将密钥写在 `wrangler.jsonc` 中并提交到 GitHub
- ✅ Twikoo 配置中的 `CAP_SECRET_KEY` 与 Worker 中的 Secret **必须一致**
- ✅ 定期更换密钥

---

## 📁 项目结构

```
cap-worker/
├── src/
│   └── index.ts          # 主 Worker 脚本（含新增的 siteverify 端点）
├── public/
│   └── index.html        # 文档站点
├── package.json          # 依赖和脚本
├── wrangler.jsonc        # Cloudflare Workers 配置
├── tsconfig.json         # TypeScript 配置
└── README.md             # 本文件
```

---

## 🤝 贡献

1. Fork 本仓库
2. 创建功能分支 (`git checkout -b feature/amazing-feature`)
3. 提交更改 (`git commit -m '添加新功能'`)
4. 推送分支 (`git push origin feature/amazing-feature`)
5. 提交 Pull Request

---

## 📄 许可

本项目基于 MIT 许可证开源。

---

## 🔗 相关链接

- [原项目 xyTom/cap-worker](https://github.com/xyTom/cap-worker)
- [在线演示](https://captcha.gurl.eu.org/)
- [Cloudflare Workers](https://workers.cloudflare.com/)
- [@cap.js/server](https://www.npmjs.com/package/@cap.js/server)
- [Twikoo 评论系统](https://github.com/twikoojs/twikoo)
- [Cap 官方文档](https://trycap.dev)
