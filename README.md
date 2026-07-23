# Cap-For-Twikoo | 为 Twikoo 适配的 Cap 人机验证服务

[![Deploy to Cloudflare](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/qwq-YvYang/Cap-For-Twikoo)

> 本项目基于 [xyTom/cap-worker](https://github.com/xyTom/cap-worker) 修改，新增了 `/api/siteverify` 端点以兼容 [Twikoo](https://twikoo.js.org/) 评论系统 v1.7.14+ 的 Cap 验证码官方集成。

[**中文**](https://github.com/qwq-YvYang/Cap-For-Twikoo/blob/main/README.md) /
[**English**](https://github.com/qwq-YvYang/Cap-For-Twikoo/blob/main/readme_Eng.md)

---

## 📋 项目简介

Cap-For-Twikoo 是基于 Cloudflare Workers 构建的 Cap 人机验证服务，采用 SHA-256 工作量证明（PoW）算法实现强大的机器人防护。

在原项目基础上，**新增了 Twikoo 兼容支持**：
- 新增 `POST /api/siteverify` 端点，完全兼容官方 Cap 的验证接口规范
- 可直接与 Twikoo v1.7.14+（已适配 Cap 官方版本的 Twikoo）无缝对接
- `CAP_SECRET_KEY` 通过 Cloudflare Secrets 加密存储，**不会暴露在 GitHub 仓库中**

### 🚀 功能特性

- **超高性能**：在全球 250+ 个城市边缘部署，响应时间低于 100ms
- **工作量证明**：采用 SHA-256 PoW 算法进行计算挑战验证
- **开发者友好**：RESTful API 设计，提供完整的 SDK
- **全球 CDN**：基于 Cloudflare 边缘基础设施构建
- **隐私优先**：无跟踪，无数据收集
- **简易集成**：5 分钟设置，代码改动最少
- **Twikoo 开箱即用**：一键部署后简单配置即可接入

### 🏗️ 系统架构设计

Cap-For-Twikoo 基于 Cloudflare 尖端基础设施，提供稳健且可扩展的验证码解决方案：

#### 分布式架构
- **持久化对象（DO）**：挑战状态管理，具备强一致性保证
- **边缘 Workers**：计算验证分布在全球 250+ 个位置
- **自动扩缩容**：根据流量需求无缝水平扩展

#### 性能与并发控制
- **冲突防护**：持久化对象确保原子操作，防止竞态条件
- **负载分发**：多个 Worker 实例并行处理验证工作负载
- **零冷启动**：边缘优化部署，最小化延迟峰值

#### 工作量证明流水线
1. **挑战生成**：通过持久化对象创建密码学安全的挑战
2. **分布式验证**：自动扩展的 Workers 处理 SHA-256 PoW 计算
3. **状态同步**：通过强一致性管理挑战生命周期

### 🌐 在线演示

访问 [https://cft.yvyang.qzz.io/](https://cft.yvyang.qzz.io/) 体验 Cap-For-Twikoo 并查看交互式文档。

---

## 📦 快速开始

### 一键部署

[![Deploy to Cloudflare](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/qwq-YvYang/Cap-For-Twikoo)

点击上方按钮，按照 Cloudflare 控制台指引完成部署。

### 部署后配置

#### 1. 设置 CAP_SECRET_KEY（通过 Cloudflare Secrets，安全加密）

> ⚠️ **注意**：切勿将 `CAP_SECRET_KEY` 写在 `wrangler.jsonc` 或任何代码文件中，否则会泄露到 GitHub 仓库。

**方式一：Cloudflare Dashboard（推荐）**

1. 登录 [Cloudflare Dashboard](https://dash.cloudflare.com/)
2. 进入 **Workers & Pages** → 点击你的 Worker
3. 进入 **Settings** → **Variables**
4. 在 **Secrets** 区域，点击 **Add secret**
5. 填写：
   - **Name**：`CAP_SECRET_KEY`
   - **Value**：你的强密钥（建议 32 位以上随机字符串）
6. 点击 **Encrypt** 保存
7. 保存并部署

**方式二：Wrangler CLI**

```bash
# 生成强密钥
openssl rand -hex 32

# 设置为 Cloudflare Secret（不会存入 wrangler.jsonc）
npx wrangler secret put CAP_SECRET_KEY
# 然后粘贴你的密钥值
```

#### 2. 在 Twikoo 管理面板中配置

登录 Twikoo 管理面板 → **评论管理 → 配置**，添加以下三个环境变量：

| 配置项 | 值 | 说明 |
|--------|-----|------|
| `CAPTCHA_PROVIDER` | `Cap` | 启用 Cap 验证码 |
| `CAP_API_ENDPOINT` | `https://你的worker域名.workers.dev/api/` | Cap 服务地址（末尾带 `/api/`） |
| `CAP_SECRET_KEY` | 与上一步设置的密钥相同 | 用于服务端验证的密钥 |

> 💡 注意：`CAP_API_ENDPOINT` 要带 `/api/` 后缀，这样前端 widget 才能正确调用 `/api/challenge` 和 `/api/redeem`，后端（Twikoo）也能调用 `/api/siteverify`。



## 🔌 API 参考

### 生成挑战
```http
POST /api/challenge
Content-Type: application/json
```

**响应：**
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

**响应：**
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

**响应：**
```json
{
  "success": true
}
```

### ✅ 兼容 Twikoo 的验证接口（本项目的核心新增）
在Twikoo系统的前端设置：
| 配置项 | 值 | 说明 |
|--------|-----|------|
| `CAPTCHA_PROVIDER` | `Cap` | 启用 Cap 验证码 |
| `CAP_API_ENDPOINT` | `https://你的worker域名.workers.dev/api/` | Cap 服务地址（带 `/api/` 后缀） |
| `CAP_SECRET_KEY` | `你的强秘钥` | 与 worker 中 `CAP_SECRET_KEY` 一致 |


> 此接口兼容官方 Cap 的 `siteverify` 规范，Twikoo 1.7.14+ 默认调用此端点进行服务端验证。
> 注意workers域名在中国大陆访问速度可能较慢，建议绑定自定义域名

---

## 🛠️ 开发设置

### 环境要求

- Node.js 18+
- Cloudflare 账户
- Wrangler CLI

### 安装步骤

1. 克隆仓库：
```bash
git clone https://github.com/qwq-YvYang/Cap-For-Twikoo.git
cd Cap-For-Twikoo
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

## 📁 项目结构

```
Cap-For-Twikoo/
├── src/
│   └── index.ts          # 主 Worker 脚本（含 /api/siteverify 端点）
├── public/
│   └── index.html        # 文档站点
├── package.json          # 依赖和脚本
├── wrangler.jsonc        # Cloudflare Workers 配置
├── tsconfig.json         # TypeScript 配置
└── README.md            # 本文件
```

### 与原版的主要差异

| 项目 | xyTom/cap-worker（原版） | Cap-For-Twikoo（本版） |
|------|------------------------|----------------------|
| `/api/siteverify` 端点 | ❌ 无 | ✅ 新增，兼容 Twikoo |
| `CAP_SECRET_KEY` 管理 | 写在 `wrangler.jsonc` | 通过 Cloudflare Secrets 加密存储 |
| Twikoo 集成 | 需自行适配 | 开箱即用 |
| 演示站点 | `captcha.gurl.eu.org` | `cft.yvyang.qzz.io` |

---

## 🤝 贡献

1. Fork 仓库
2. 创建功能分支
3. 提交更改
4. 提交 Pull Request

---

## 📄 许可证

本项目基于 MIT License 许可。

---

## 🔗 相关链接

- [在线演示](https://cft.yvyang.qzz.io/)
- [GitHub 仓库](https://github.com/qwq-YvYang/Cap-For-Twikoo)
- [原项目 xyTom/cap-worker](https://github.com/xyTom/cap-worker)
- [Twikoo 评论系统](https://twikoo.js.org/)
- [Cloudflare Workers](https://workers.cloudflare.com/)
- [@cap.js/server](https://www.npmjs.com/package/@cap.js/server)
