/* ------------------------------------------------------------------ *
 * 运行时无关的基础设施：错误、Cookie、响应构造                          *
 * 同一份代码同时跑在 Node（node:sqlite）和 Cloudflare Workers（D1）。   *
 * ------------------------------------------------------------------ */

export class ApiError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

export const fail = (status, message) => {
  throw new ApiError(status, message);
};

/* ------------------------------- Cookie ------------------------------- */

export function parseCookies(header) {
  const out = Object.create(null);
  if (!header) return out;
  for (const part of String(header).split(';')) {
    const idx = part.indexOf('=');
    if (idx < 0) continue;
    const name = part.slice(0, idx).trim();
    const value = part.slice(idx + 1).trim();
    if (!name) continue;
    try {
      out[name] = decodeURIComponent(value);
    } catch {
      out[name] = value;
    }
  }
  return out;
}

export function serializeCookie(name, value, opts = {}) {
  const parts = [`${name}=${encodeURIComponent(value ?? '')}`];
  if (opts.maxAge != null) parts.push(`Max-Age=${Math.floor(opts.maxAge)}`);
  if (opts.expires) parts.push(`Expires=${new Date(opts.expires).toUTCString()}`);
  parts.push(`Path=${opts.path ?? '/'}`);
  if (opts.httpOnly !== false) parts.push('HttpOnly');
  parts.push(`SameSite=${opts.sameSite ?? 'Lax'}`);
  if (opts.secure) parts.push('Secure');
  return parts.join('; ');
}

/* -------------------------------- 校验 -------------------------------- */

export function clean(text, max = 20000) {
  return String(text ?? '').replace(/\r\n/g, '\n').trim().slice(0, max);
}

export function pageArgs(query, defaultSize = 20, maxSize = 100) {
  // 注意：不能用 query.size 兜底 —— URLSearchParams 的 .size 是「参数个数」，
  // 之前就是因为这个，导致只要网址带参数、又没写 size，每页条数就变成了参数个数。
  const raw = (name) => {
    if (!query) return undefined;
    if (typeof query.get === 'function') {
      const v = query.get(name);
      return v == null ? undefined : v;
    }
    return query[name];
  };
  const page = Math.max(1, parseInt(raw('page'), 10) || 1);
  const size = Math.min(maxSize, Math.max(1, parseInt(raw('size'), 10) || defaultSize));
  return { page, size, offset: (page - 1) * size };
}

export function publicUser(u) {
  if (!u) return null;
  return {
    id: u.id,
    username: u.username,
    role: u.role,
    banned: !!u.banned,
    default_pw: !!u.default_pw,
    bio: u.bio ?? '',
    avatar: u.avatar ?? '',
    created_at: u.created_at,
  };
}

/* ------------------------------ 请求上下文 ----------------------------- */

export function createContext({ method, url, headers, bodyBytes, env }) {
  const u = url instanceof URL ? url : new URL(url);
  const ctx = {
    method: method.toUpperCase(),
    url: u,
    path: u.pathname,
    query: u.searchParams,
    headers,
    bodyBytes: bodyBytes ?? null,
    cookies: parseCookies(headers.get?.('cookie') ?? headers.cookie),
    env: env ?? {},
    params: {},
    actor: null,
    db: null,
    uploads: null,
    _status: 200,
    _headers: [],
    _body: null,
    _contentType: null,
    _json: undefined,
  };

  ctx.header = (name, value) => ctx._headers.push([name, String(value)]);
  ctx.setCookie = (name, value, opts = {}) => ctx.header('Set-Cookie', serializeCookie(name, value, opts));
  ctx.clearCookie = (name, opts = {}) => ctx.setCookie(name, '', { ...opts, maxAge: 0 });

  ctx.json = (status, data) => {
    ctx._status = status;
    ctx._contentType = 'application/json; charset=utf-8';
    ctx._body = JSON.stringify(data ?? null);
  };
  ctx.text = (status, text, contentType = 'text/plain; charset=utf-8') => {
    ctx._status = status;
    ctx._contentType = contentType;
    ctx._body = String(text);
  };
  ctx.binary = (status, bytes, contentType = 'application/octet-stream', extra = {}) => {
    ctx._status = status;
    ctx._contentType = contentType;
    ctx._body = bytes;
    ctx.binaryExtra = extra;
  };
  ctx.redirect = (location, status = 302) => {
    ctx._status = status;
    ctx.header('Location', location);
    ctx._body = '';
    ctx._contentType = 'text/plain; charset=utf-8';
  };

  /** 解析 JSON 请求体（最多读一次） */
  ctx.jsonBody = async () => {
    if (ctx._json !== undefined) return ctx._json;
    if (!ctx.bodyBytes || ctx.bodyBytes.length === 0) {
      ctx._json = null;
      return null;
    }
    try {
      ctx._json = JSON.parse(new TextDecoder().decode(ctx.bodyBytes));
    } catch {
      fail(400, '请求体不是合法的 JSON');
    }
    return ctx._json;
  };

  ctx.rawBytes = () => ctx.bodyBytes ?? new Uint8Array(0);
  ctx.clientIp = () => headers.get?.('cf-connecting-ip') ?? headers.get?.('x-forwarded-for') ?? '';
  ctx.isSecure = () => u.protocol === 'https:';

  return ctx;
}
