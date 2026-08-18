import { DurableObject } from "cloudflare:workers";
import Cap from "@cap.js/server";

// ============================================================
// 常量与配置（免费计划友好：限流使用边缘内存计数，不消耗 KV/DO 存储）
// ============================================================

const ERR_NOT_FOUND = "NOT_FOUND" as const;
const ERR_EXPIRED = "EXPIRED" as const;
const ERR_INVALID_TOKEN = "INVALID_TOKEN" as const;

const API_BASE = "/api";
const CHALLENGE_PATH = `${API_BASE}/challenge`;
const REDEEM_PATH = `${API_BASE}/redeem`;
const VALIDATE_PATH = `${API_BASE}/validate`;
const SITEVERIFY_PATH = `${API_BASE}/siteverify`;

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
} as const;

const CLEANUP_INTERVAL_MS = 60 * 1000; // alarm 清理周期（1 分钟）
const MAX_BODY_BYTES = 16 * 1024; // 请求体大小上限，防止超大 JSON
const MAX_SOLUTIONS = 512; // solutions 数量上限

// 每 (来源 IP, 动作) 的滑动窗口限流（每个 Worker 边缘 isolate 独立计数，best-effort）
const RATE_LIMITS = {
  challenge: { limit: 20, windowMs: 60_000 },
  redeem: { limit: 20, windowMs: 60_000 },
  validate: { limit: 30, windowMs: 60_000 },
  siteverify: { limit: 120, windowMs: 60_000 },
} as const;
type RateAction = keyof typeof RATE_LIMITS;

// Cap 颁发的 token 格式为 "<id>:<hex>"（id 为挑战 ID，冒号后为随机段）
const TOKEN_RE = /^[0-9a-fA-F]{1,64}:[0-9a-fA-F]{1,256}$/;

// ============================================================
// 工具函数
// ============================================================

/** 哈希 token：只哈希冒号后的随机段，id 段保留作为存储 key 前缀 */
async function hashToken(token: string): Promise<string> {
  if (!TOKEN_RE.test(token)) throw new Error(ERR_INVALID_TOKEN);
  const [id, rawToken] = token.split(":");
  const data = new TextEncoder().encode(rawToken as string);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hash = Array.from(new Uint8Array(hashBuffer))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  return `${id}:${hash}`;
}

/** 恒定时间字符串比较（避免 siteverify secret 校验的时序侧信道） */
function timingSafeEqual(a: string, b: string): boolean {
  const x = new TextEncoder().encode(a);
  const y = new TextEncoder().encode(b);
  const maxLen = Math.max(x.length, y.length);
  let diff = x.length ^ y.length;
  for (let i = 0; i < maxLen; i++) {
    const xi = x.length === 0 ? 0 : x[Math.min(i, x.length - 1)] ?? 0;
    const yi = y.length === 0 ? 0 : y[Math.min(i, y.length - 1)] ?? 0;
    diff |= xi ^ yi;
  }
  return diff === 0;
}

/** 读取并解析 JSON 请求体，限制体积防止滥用 */
async function readJsonBody(request: Request): Promise<unknown> {
  // 优先用 Content-Length 头提前拒绝超大请求，避免读取大体积 body
  const contentLength = request.headers.get("Content-Length");
  if (contentLength && Number(contentLength) > MAX_BODY_BYTES) {
    throw new Error("BODY_TOO_LARGE");
  }
  const text = await request.text();
  if (text.length > MAX_BODY_BYTES) throw new Error("BODY_TOO_LARGE");
  return text.length === 0 ? null : JSON.parse(text);
}

/** 统一 JSON 响应（自动带上 CORS 头） */
function jsonResponse(body: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...CORS_HEADERS, ...headers },
  });
}

/** 滑动窗口内存限流（每个 Worker isolate 独立，免费计划下零存储开销） */
const memoryRate = new Map<string, { count: number; windowStart: number }>();
function memoryRateLimit(
  key: string,
  limit: number,
  windowMs: number,
): { allowed: boolean; retryAfterSec: number } {
  const now = Date.now();
  let rec = memoryRate.get(key);
  if (!rec || now - rec.windowStart >= windowMs) {
    rec = { count: 0, windowStart: now };
    memoryRate.set(key, rec);
  }
  if (rec.count >= limit) {
    return {
      allowed: false,
      retryAfterSec: Math.max(1, Math.ceil((rec.windowStart + windowMs - now) / 1000)),
    };
  }
  rec.count++;
  return { allowed: true, retryAfterSec: 0 };
}

/** 防止内存限流 Map 无限增长：超过阈值整体清空（代价仅是一次重新计数） */
function pruneMemoryRate() {
  if (memoryRate.size > 10_000) memoryRate.clear();
}

/** 取来源 IP（由 Cloudflare 注入，可信） */
function clientIp(request: Request): string {
  return request.headers.get("CF-Connecting-IP") ?? "unknown";
}

/** 按动作对当前请求做限流；未超限返回 null，超限返回 429 响应 */
function applyRateLimit(action: RateAction, request: Request): Response | null {
  const { limit, windowMs } = RATE_LIMITS[action];
  const key = `${clientIp(request)}:${action}`;
  const result = memoryRateLimit(key, limit, windowMs);
  if (!result.allowed) {
    return jsonResponse(
      { success: false, error: "Too many requests" },
      429,
      { "Retry-After": String(result.retryAfterSec) },
    );
  }
  return null;
}

interface Challenge {
  challenge: {
    c: number;
    s: number;
    d: number;
  };
  token: string;
  expires: number;
}

interface StoredToken {
  expires: number;
}

// ============================================================
// Storage Durable Object：挑战 / 令牌存储（SQLite，单实例强一致）
// ============================================================

export class CapStorageDurableObject extends DurableObject {
  private initializing: Promise<void>;

  constructor(private readonly state: DurableObjectState, env: Env) {
    super(state, env);

    this.initializing = (async () => {
      // 设置周期清理 alarm（每 1 分钟）
      const existingAlarm = await this.state.storage.getAlarm();
      if (!existingAlarm) {
        await this.state.storage.setAlarm(Date.now() + CLEANUP_INTERVAL_MS);
      }
    })();
  }

  async alarm() {
    try {
      const now = Date.now();
      await this.cleanupExpired(now, "challenge:");
      await this.cleanupExpired(now, "token:");
      await this.state.storage.setAlarm(Date.now() + CLEANUP_INTERVAL_MS);
    } catch (error) {
      console.error("Storage cleanup failed:", error);
      await this.state.storage.setAlarm(Date.now() + CLEANUP_INTERVAL_MS);
    }
  }

  /**
   * 分页清理过期数据。
   * storage.list 默认每页最多返回 1000 条，超出部分必须用 cursor 翻页，
   * 否则数据量增长后过期条目会永久残留（配合存储级 TTL 双保险）。
   */
  private async cleanupExpired(now: number, prefix: string) {
    let cursor: string | undefined;
    do {
      const page = await this.state.storage.list<{ expires: number }>({
        prefix,
        limit: 1000,
        cursor,
      });
      for (const [key, item] of page) {
        if (item.expires < now) {
          await this.state.storage.delete(key);
        }
      }
      cursor = (page as unknown as { cursor?: string }).cursor;
    } while (cursor);
  }

  // Storage methods

  /** 存储挑战，带存储级 TTL（不依赖 alarm 也能自动过期；SQLite 后端支持） */
  async storeChallenge(token: string, challengeData: Challenge, ttlSec: number) {
    await this.state.storage.put(`challenge:${token}`, challengeData, {
      expirationTtl: ttlSec,
    } as DurableObjectPutOptions);
  }

  async getChallenge(token: string): Promise<Challenge | undefined> {
    return await this.state.storage.get<Challenge>(`challenge:${token}`);
  }

  /**
   * 原子删除已兑换的挑战并持久化对应 token。
   * 保证并发请求无法重复兑换同一挑战；token 同样带存储级 TTL。
   */
  async finalizeRedeem(token: string, tokenHash: string, tokenData: StoredToken) {
    await this.state.storage.transaction(async (txn: DurableObjectTransaction) => {
      const existing = await txn.get<Challenge>(`challenge:${token}`);
      if (!existing) {
        throw new Error(ERR_NOT_FOUND);
      }

      const now = Date.now();
      if (existing.expires < now) {
        // 清理过期挑战
        await txn.delete(`challenge:${token}`);
        throw new Error(ERR_EXPIRED);
      }
      // 确保挑战恰好删除一次（幂等删除）
      await txn.delete(`challenge:${token}`);

      // token 设置存储级 TTL（上限 1 天，与 widget 的过期重置逻辑一致）
      const ttlSec = Math.min(86400, Math.max(60, Math.ceil((tokenData.expires - now) / 1000)));
      await txn.put(`token:${tokenHash}`, tokenData, {
        expirationTtl: ttlSec,
      } as DurableObjectPutOptions);
    });
  }

  /**
   * 原子验证 token，可选择保留（不消耗）。
   * 有效返回 true，否则抛出字符串错误。
   */
  async validateAndConsumeToken(tokenHash: string, keepToken?: boolean) {
    await this.state.storage.transaction(async (txn: DurableObjectTransaction) => {
      const tokenData = await txn.get<StoredToken>(`token:${tokenHash}`);
      if (!tokenData) throw new Error(ERR_NOT_FOUND);

      const now = Date.now();
      if (tokenData.expires < now) {
        await txn.delete(`token:${tokenHash}`);
        throw new Error(ERR_EXPIRED);
      }

      if (!keepToken) {
        await txn.delete(`token:${tokenHash}`);
      }
    });
  }
}

// ============================================================
// Cap 实例
// ============================================================

function createCapInstance() {
  return new Cap({
    noFSState: true,
  });
}

/**
 * 创建挑战。可传入 { c, s, d } 覆盖 PoW 难度
 * （通过环境变量 CAP_POW_C / CAP_POW_S / CAP_POW_D 配置）。
 */
function createChallenge(options?: any) {
  const cap = createCapInstance();
  return cap.createChallenge(options);
}

async function verifyChallengeSolution(challenge: Challenge, solutions: number[]) {
  const cap = createCapInstance();
  cap.config.state = {
    challengesList: {
      [challenge.token]: {
        ...challenge,
        expires: challenge.expires,
      },
    },
    tokensList: {},
  };

  return await cap.redeemChallenge({
    token: challenge.token,
    solutions,
  });
}

// ============================================================
// 环境绑定
// ============================================================

interface Env extends Cloudflare.Env {
  /** 由 `wrangler secret put CAP_SECRET_KEY` 提供；未配置时 siteverify 返回 503 */
  CAP_SECRET_KEY?: string;
  /** 可选：覆盖 PoW 默认难度（不设置时使用 @cap.js/server 库默认值） */
  CAP_POW_C?: number;
  CAP_POW_S?: number;
  CAP_POW_D?: number;
}

// ============================================================
// 路由处理
// ============================================================

async function handleRequest(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);

  // 获取存储实例（单实例强一致）
  const storageId = env.CAP_STORAGE.idFromName("cap-storage");
  const storageStub = env.CAP_STORAGE.get(storageId) as unknown as CapStorageDurableObject;

  // 处理 CORS 预检
  if (request.method === "OPTIONS") {
    return new Response(null, { headers: CORS_HEADERS });
  }

  // Route: POST /api/challenge
  if (request.method === "POST" && url.pathname === CHALLENGE_PATH) {
    const limited = applyRateLimit("challenge", request);
    if (limited) return limited;

    // PoW 难度（仅传入已配置且为合法数字的环境变量，其余使用库默认）
    // 注意：Cloudflare 控制台中的 Variables 均为字符串，需显式数值化并校验
    const powOptions: { c?: number; s?: number; d?: number } = {};
    const powC = env.CAP_POW_C == null ? NaN : Number(env.CAP_POW_C);
    if (Number.isFinite(powC) && powC > 0) powOptions.c = powC;
    const powS = env.CAP_POW_S == null ? NaN : Number(env.CAP_POW_S);
    if (Number.isFinite(powS) && powS > 0) powOptions.s = powS;
    const powD = env.CAP_POW_D == null ? NaN : Number(env.CAP_POW_D);
    if (Number.isFinite(powD) && powD > 0) powOptions.d = powD;

    const challenge = createChallenge(Object.keys(powOptions).length > 0 ? powOptions : undefined);

    // 存储挑战（带存储级 TTL，防止无 alarm 时残留；expires 异常时兜底 5 分钟）
    if (challenge.token) {
      const expiresInSec = Math.ceil((challenge.expires - Date.now()) / 1000);
      const ttlSec = Number.isFinite(expiresInSec) ? Math.min(3600, Math.max(60, expiresInSec)) : 300;
      await storageStub.storeChallenge(challenge.token, challenge as Challenge, ttlSec);
    }

    return jsonResponse(challenge);
  }

  // Route: POST /api/redeem
  if (request.method === "POST" && url.pathname === REDEEM_PATH) {
    const limited = applyRateLimit("redeem", request);
    if (limited) return limited;

    let body: unknown;
    try {
      body = await readJsonBody(request);
    } catch {
      return jsonResponse({ success: false, error: "Invalid request body" }, 400);
    }

    const { token, solutions } = (body ?? {}) as { token?: unknown; solutions?: unknown };
    if (
      typeof token !== "string" || !token ||
      !Array.isArray(solutions) || solutions.length === 0 || solutions.length > MAX_SOLUTIONS ||
      solutions.some((s) => typeof s !== "number" || !Number.isFinite(s))
    ) {
      return jsonResponse({ success: false, error: "Missing or invalid token/solutions" }, 400);
    }

    // 从存储获取挑战
    const challenge = await storageStub.getChallenge(token);
    if (!challenge) {
      return jsonResponse({ success: false, error: "Challenge not found" }, 404);
    }

    // 在 Worker 边缘验证 PoW 解答
    const result = await verifyChallengeSolution(challenge, solutions as number[]);

    if (result.success && result.token && result.expires) {
      let tokenHash: string;
      try {
        tokenHash = await hashToken(result.token);
      } catch {
        console.error("Cap returned an invalid token format:", result.token);
        return jsonResponse({ success: false, error: "Internal error" }, 500);
      }

      // 事务：确保原子性（挑战恰好兑换一次）
      try {
        await storageStub.finalizeRedeem(token, tokenHash, {
          expires: result.expires,
        });
      } catch (err: unknown) {
        if (err instanceof Error && err.message === ERR_EXPIRED) {
          return jsonResponse({ success: false, error: "Challenge expired" }, 410);
        }
        // 其余错误（含 ERR_NOT_FOUND）视为并发请求已兑换
        return jsonResponse({ success: false, error: "Challenge already redeemed" }, 409);
      }
    }

    return jsonResponse(result);
  }

  // Route: POST /api/validate
  if (request.method === "POST" && url.pathname === VALIDATE_PATH) {
    const limited = applyRateLimit("validate", request);
    if (limited) return limited;

    let body: unknown;
    try {
      body = await readJsonBody(request);
    } catch {
      return jsonResponse({ success: false, error: "Invalid request body" }, 400);
    }

    const { token, keepToken } = (body ?? {}) as { token?: unknown; keepToken?: unknown };
    if (typeof token !== "string" || !token) {
      return jsonResponse({ success: false, error: "Missing token" }, 400);
    }

    // 哈希 token 并在 DO 内原子验证/消费
    let tokenHash: string;
    try {
      tokenHash = await hashToken(token);
    } catch {
      return jsonResponse({ success: false, error: "Invalid token" }, 400);
    }

    try {
      await storageStub.validateAndConsumeToken(tokenHash, keepToken === true);
      return jsonResponse({ success: true });
    } catch (err: unknown) {
      if (err instanceof Error) {
        if (err.message === ERR_NOT_FOUND) {
          return jsonResponse({ success: false, error: "Token not found" }, 404);
        }
        if (err.message === ERR_EXPIRED) {
          return jsonResponse({ success: false, error: "Token expired" }, 410);
        }
      }
      return jsonResponse({ success: false, error: "Token already consumed" }, 409);
    }
  }

  // Route: POST /api/siteverify（兼容官方 Cap 的验证接口，供 Twikoo 后端调用）
  if (request.method === "POST" && url.pathname === SITEVERIFY_PATH) {
    const limited = applyRateLimit("siteverify", request);
    if (limited) return limited;

    // 部署检查：CAP_SECRET_KEY 未配置时明确报错，避免静默全拒
    if (!env.CAP_SECRET_KEY) {
      console.error("CAP_SECRET_KEY is not configured; refusing siteverify requests.");
      return jsonResponse({ success: false, error: "Server misconfigured" }, 503);
    }

    let body: unknown;
    try {
      body = await readJsonBody(request);
    } catch {
      return jsonResponse({ success: false, error: "Invalid request body" }, 400);
    }

    const { secret, response: token } = (body ?? {}) as { secret?: unknown; response?: unknown };
    if (typeof secret !== "string" || !secret || typeof token !== "string" || !token) {
      return jsonResponse({ success: false, error: "Missing secret or response" }, 400);
    }

    // 恒定时间比较 secret，避免时序侧信道
    if (!timingSafeEqual(secret, env.CAP_SECRET_KEY)) {
      return jsonResponse({ success: false, error: "Invalid secret" }, 403);
    }

    let tokenHash: string;
    try {
      tokenHash = await hashToken(token);
    } catch {
      return jsonResponse({ success: false, error: "Invalid token" }, 400);
    }

    // 验证并消费 token（不保留）
    try {
      await storageStub.validateAndConsumeToken(tokenHash, false);
      return jsonResponse({ success: true });
    } catch (err: unknown) {
      if (err instanceof Error) {
        if (err.message === ERR_NOT_FOUND) {
          return jsonResponse({ success: false, error: "Token not found" }, 404);
        }
        if (err.message === ERR_EXPIRED) {
          return jsonResponse({ success: false, error: "Token expired" }, 410);
        }
      }
      return jsonResponse({ success: false, error: "Token invalid" }, 400);
    }
  }

  return jsonResponse({ success: false, error: "Not Found" }, 404);
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    try {
      pruneMemoryRate();
      return await handleRequest(request, env);
    } catch (err) {
      // 兜底：任何未捕获异常都返回结构化 500，而不是裸露的服务器错误
      console.error("Unhandled error:", err);
      return jsonResponse({ success: false, error: "Internal server error" }, 500);
    }
  },
} satisfies ExportedHandler<Env>;
