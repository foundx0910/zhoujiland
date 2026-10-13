/**
 * Cloudflare Workers 入口
 *   - 数据：D1（绑定名 DB）
 *   - 图片：KV（绑定名 UPLOADS，可选；没绑定时上传接口会明确报错）
 *   - 前端：静态资源绑定 ASSETS（dist/ 目录，SPA 回退）
 * 业务逻辑全部来自 core/，与本地 Node 版完全一致。
 */
import { createD1Db } from '../core/adapters.js';
import { createKvUploads, createNoopUploads } from '../core/uploads.js';
import { createApp } from '../core/router.js';
import { SCHEMA_SQL } from '../core/schema.js';

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const isApi = url.pathname.startsWith('/api/') || url.pathname.startsWith('/uploads/');

    if (!isApi) {
      return serveAssets(request, env, url);
    }

    if (!env.DB) {
      return json({ error: '未绑定 D1 数据库（wrangler.toml 里的 d1_databases / binding = "DB"）' }, 500);
    }

    const app = createApp({
      db: createD1Db(env.DB),
      uploads: env.UPLOADS ? createKvUploads(env.UPLOADS) : createNoopUploads(),
      schemaSql: SCHEMA_SQL,
      log: (msg) => console.log(`[forum] ${msg}`),
    });

    let bodyBytes = null;
    if (request.method !== 'GET' && request.method !== 'HEAD') {
      const buf = await request.arrayBuffer();
      if (buf.byteLength > 6 * 1024 * 1024) {
        return json({ error: '请求体过大（上限 5MB）' }, 413);
      }
      bodyBytes = new Uint8Array(buf);
    }

    const ctx = await app.handle({
      method: request.method,
      url,
      headers: request.headers,
      bodyBytes,
      env,
    });

    const headers = new Headers();
    for (const [k, v] of ctx._headers) headers.append(k, v);
    if (ctx._contentType) headers.set('Content-Type', ctx._contentType);
    const body = ctx.method === 'HEAD' ? null : (ctx._body ?? '');
    return new Response(body, { status: ctx._status, headers });
  },
};

/** 静态资源 + 单页应用回退 */
async function serveAssets(request, env, url) {
  if (!env.ASSETS) {
    return json({ error: '未绑定静态资源（wrangler.toml 里的 [assets] directory = "./dist"）' }, 500);
  }
  const res = await env.ASSETS.fetch(request);
  if (res.status !== 404) return res;
  const indexUrl = new URL('/index.html', url);
  return env.ASSETS.fetch(new Request(indexUrl, { method: 'GET', headers: request.headers }));
}

const json = (data, status) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
  });
