/* ------------------------------------------------------------------ *
 * 口令哈希：WebCrypto PBKDF2-SHA256                                     *
 *                                                                      *
 * 为什么不用 bcrypt：Cloudflare Workers 免费版有 CPU 时间限制，          *
 * bcrypt 是纯 JS 实现、成本高；而 WebCrypto 是平台原生实现，既快又      *
 * 不占 JS CPU 配额。Node 24 也原生提供 globalThis.crypto.subtle，      *
 * 所以两边共用同一份实现。                                              *
 *                                                                      *
 * 存储格式：pbkdf2$<迭代次数>$<base64 salt>$<base64 hash>               *
 * ------------------------------------------------------------------ */

/**
 * 迭代次数说明（重要）：
 *   Cloudflare Workers 免费版每次请求只有 **10ms CPU**，而 PBKDF2 是纯 CPU 开销：
 *   实测 21 万次 ≈ 27ms（直接超限报错），5 万次 ≈ 6ms，2.5 万次 ≈ 3ms。
 *   因此免费版默认取 25000，保证登录/注册/初始化能正常完成。
 *   如果你升级到 Workers 付费版（CPU 上限 30 秒），可以把这里调到 600000（OWASP 建议值）。
 */
const ITERATIONS = 25_000;
const KEY_BITS = 256;
const SALT_BYTES = 16;

const enc = new TextEncoder();

function toBase64(bytes) {
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s);
}

function fromBase64(str) {
  const bin = atob(str);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

async function derive(password, salt, iterations) {
  const key = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt, iterations, hash: 'SHA-256' },
    key,
    KEY_BITS
  );
  return new Uint8Array(bits);
}

export async function hashPassword(password) {
  const salt = crypto.getRandomValues(new Uint8Array(SALT_BYTES));
  const hash = await derive(password, salt, ITERATIONS);
  return `pbkdf2$${ITERATIONS}$${toBase64(salt)}$${toBase64(hash)}`;
}

export async function verifyPassword(password, stored) {
  if (!stored) return false;
  const parts = String(stored).split('$');
  if (parts[0] !== 'pbkdf2' || parts.length !== 4) return false;
  const iterations = parseInt(parts[1], 10);
  if (!Number.isFinite(iterations) || iterations < 1000) return false;
  try {
    const salt = fromBase64(parts[2]);
    const expected = fromBase64(parts[3]);
    const actual = await derive(password, salt, iterations);
    if (actual.length !== expected.length) return false;
    // 定时安全比较
    let diff = 0;
    for (let i = 0; i < actual.length; i++) diff |= actual[i] ^ expected[i];
    return diff === 0;
  } catch {
    return false;
  }
}

/** 会话 token / 随机 ID */
export function randomToken(bytes = 24) {
  const buf = crypto.getRandomValues(new Uint8Array(bytes));
  return [...buf].map((b) => b.toString(16).padStart(2, '0')).join('');
}
