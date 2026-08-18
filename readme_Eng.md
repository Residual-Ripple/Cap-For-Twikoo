# Cap-For-Twikoo | Cap Human Verification Service Adapted for Twikoo

[![Deploy to Cloudflare](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/qwq-YvYang/Cap-For-Twikoo)

> This project is based on [xyTom/cap-worker](https://github.com/xyTom/cap-worker), with the addition of the `/api/siteverify` endpoint to be compatible with the official Cap integration of the [Twikoo](https://twikoo.js.org/) comment system (v1.7.14+).

---

## 📋 Introduction

Cap-For-Twikoo is a Cap human verification service built on Cloudflare Workers, utilizing a SHA-256 Proof of Work (PoW) algorithm for robust bot protection.

Building on the original project, **Twikoo compatibility has been added**:
- New `POST /api/siteverify` endpoint, fully compatible with the official Cap verification interface specification
- Seamless integration with Twikoo v1.7.14+ (versions that support the official Cap adaptation)
- `CAP_SECRET_KEY` is securely stored via Cloudflare Secrets, **never exposed in the GitHub repository**

### 🚀 Features

- **Ultra-High Performance**: Deployed at the edge in 250+ cities worldwide, response time under 100ms
- **Proof of Work**: SHA-256 PoW algorithm for computational challenge verification
- **Developer Friendly**: RESTful API design with complete SDK
- **Global CDN**: Built on Cloudflare edge infrastructure
- **Privacy First**: No tracking, no data collection
- **Easy Integration**: 5-minute setup with minimal code changes
- **Twikoo Out of the Box**: One-click deployment and simple configuration for immediate use

### 🏗️ System Architecture Design

Cap-For-Twikoo leverages Cloudflare’s cutting-edge infrastructure to deliver a robust and scalable captcha solution:

#### Distributed Architecture
- **Durable Objects (DO)**: Challenge state management with strong consistency guarantees
- **Edge Workers**: Computational verification distributed across 250+ global locations
- **Auto-scaling**: Seamless horizontal scaling based on traffic demand

#### Performance & Concurrency Control
- **Conflict Prevention**: Durable Objects ensure atomic operations and prevent race conditions
- **Load Distribution**: Multiple Worker instances process verification workloads in parallel
- **Zero Cold Starts**: Edge-optimized deployment to minimize latency spikes

#### Proof of Work Pipeline
1. **Challenge Generation**: Cryptographically secure challenges created via Durable Objects
2. **Distributed Verification**: Auto-scaling Workers handle SHA-256 PoW computation
3. **State Synchronization**: Challenge lifecycle managed with strong consistency

### 🌐 Online Demo

Visit [https://cft.yvyang.qzz.io/](https://cft.yvyang.qzz.io/) to experience Cap-For-Twikoo and view the interactive documentation.

---

## 📦 Quick Start

### One-Click Deploy

[![Deploy to Cloudflare](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/qwq-YvYang/Cap-For-Twikoo)

Click the button above and follow the Cloudflare console instructions to complete the deployment.

### Post-Deployment Configuration

#### 1. Set CAP_SECRET_KEY (via Cloudflare Secrets, securely encrypted)

> ⚠️ **Warning**: Never write `CAP_SECRET_KEY` in `wrangler.jsonc` or any code files, otherwise it will be exposed in the GitHub repository.

**Method 1: Cloudflare Dashboard (Recommended)**

1. Log in to the [Cloudflare Dashboard](https://dash.cloudflare.com/)
2. Go to **Workers & Pages** → click on your Worker
3. Navigate to **Settings** → **Variables**
4. In the **Secrets** section, click **Add secret**
5. Fill in:
   - **Name**: `CAP_SECRET_KEY`
   - **Value**: Your strong secret key (a random string of at least 32 characters is recommended)
6. Click **Encrypt** to save
7. Save and deploy

**Method 2: Wrangler CLI**

```bash
# Generate a strong secret key
openssl rand -hex 32

# Set it as a Cloudflare Secret (will not be stored in wrangler.jsonc)
npx wrangler secret put CAP_SECRET_KEY
# Then paste your secret key value
```

#### 2. Configure in Twikoo Admin Panel

Log in to the Twikoo admin panel → **Comment Management → Configuration**, and add the following three environment variables:

| Setting | Value | Description |
|--------|-----|------|
| `CAPTCHA_PROVIDER` | `Cap` | Enable Cap captcha |
| `CAP_API_ENDPOINT` | `https://your-worker-domain/api/` | Cap service address (must end with `/api/`) |
| `CAP_SECRET_KEY` | Same as the key set in the previous step | Secret key used for server-side verification |

> 💡 Note: The `CAP_API_ENDPOINT` must include the `/api/` suffix so that the frontend widget can correctly call `/api/challenge` and `/api/redeem`, and the backend (Twikoo) can call `/api/siteverify`.

---

## 🔌 API Reference

### Generate Challenge
```http
POST /api/challenge
Content-Type: application/json
```

**Response:**
```json
{
  "token": "785975238a3c4f0c1b0c39ed75e6e4cc152436cc0d94363de6",
  "challenge": "{ \"c\": 50, \"s\": 32, \"d\": 4 }",
  "expires": 1753924498818
}
```

### Verify Solution
```http
POST /api/redeem
Content-Type: application/json

{
  "token": "c6bd7fd0bea728b5405f0e3637dca6d1b88aaf33589809a103",
  "solutions": [1, 3, 7]
}
```

**Response:**
```json
{
  "success": true,
  "token": "785975238a3c4f0c1b0c39:ed75e6e4cc152436cc0d94363de6"
}
```

### Validate Token
```http
POST /api/validate
Content-Type: application/json

{
  "token": "785975238a3c4f0c1b0c39:ed75e6e4cc152436cc0d94363de6",
  "keepToken": false
}
```

**Response:**
```json
{
  "success": true
}
```

### ✅ Twikoo-Compatible Verification Endpoint (Core Addition of This Project)
In the Twikoo system's frontend settings:
| Setting | Value | Description |
|--------|-----|------|
| `CAPTCHA_PROVIDER` | `Cap` | Enable Cap captcha |
| `CAP_API_ENDPOINT` | `https://your-worker-domain/api/` | Cap service address (with `/api/` suffix) |
| `CAP_SECRET_KEY` | `your-strong-key` | Must match the `CAP_SECRET_KEY` in the Worker |

> This endpoint is compatible with the official Cap `siteverify` specification. Twikoo 1.7.14+ calls this endpoint by default for server-side verification.
> Note that the workers.dev domain may have slower access speed in mainland China; it is recommended to bind a custom domain.

---

## 🛠️ Development Setup

### Requirements

- Node.js 18+
- Cloudflare account
- Wrangler CLI

### Installation Steps

1. Clone the repository:
```bash
git clone https://github.com/qwq-YvYang/Cap-For-Twikoo.git
cd Cap-For-Twikoo
```

2. Install dependencies:
```bash
npm install
```

3. Configure Wrangler:
```bash
npx wrangler auth login
```

4. Start the development server:
```bash
npm run dev
```

### Script Commands

- `npm run dev` - Start development server
- `npm run deploy` - Deploy to Cloudflare Workers
- `npm run start` - Alias for `dev` command
- `npm run cf-typegen` - Generate TypeScript types

---

## 📁 Project Structure

```
Cap-For-Twikoo/
├── src/
│   └── index.ts          # Main Worker script (contains /api/siteverify endpoint)
├── public/
│   └── index.html        # Documentation site
├── package.json          # Dependencies and scripts
├── wrangler.jsonc        # Cloudflare Workers configuration
├── tsconfig.json         # TypeScript configuration
└── README.md            # This file
```

### Main Differences from the Original

| Feature | xyTom/cap-worker (Original) | Cap-For-Twikoo (This Fork) |
|------|------------------------|----------------------|
| `/api/siteverify` endpoint | ❌ None | ✅ Added, Twikoo compatible |
| `CAP_SECRET_KEY` management | Written in `wrangler.jsonc` | Stored encrypted via Cloudflare Secrets |
| Twikoo integration | Requires custom adaptation | Out of the box |
| Demo site | `captcha.gurl.eu.org` | `cft.yvyang.qzz.io` |

---

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Commit your changes
4. Submit a Pull Request

---

## 📄 License

This project is licensed under the MIT License.

---

## 🔗 Related Links

- [Online Demo](https://cft.yvyang.qzz.io/)
- [GitHub Repository](https://github.com/qwq-YvYang/Cap-For-Twikoo)
- [Original Project xyTom/cap-worker](https://github.com/xyTom/cap-worker)
- [Twikoo Comment System](https://twikoo.js.org/)
- [Cloudflare Workers](https://workers.cloudflare.com/)
- [@cap.js/server](https://www.npmjs.com/package/@cap.js/server)
