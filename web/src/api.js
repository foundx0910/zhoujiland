/** 极简 API 客户端：同源 + Cookie 会话 */
async function request(method, url, body) {
  const opts = { method, credentials: 'same-origin', headers: {} };
  if (body !== undefined) {
    opts.headers['Content-Type'] = 'application/json';
    opts.body = JSON.stringify(body);
  }
  const res = await fetch(url, opts);
  const text = await res.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = { error: text };
  }
  if (!res.ok) {
    const err = new Error(data?.error || `请求失败（${res.status}）`);
    err.status = res.status;
    throw err;
  }
  return data;
}

/* ------------------------------------------------------------------ *
 * 轻量内存缓存：让「返回上一页 / 再看一次」瞬间出内容，同时后台悄悄刷新
 * （stale-while-revalidate）。只缓存列表类数据，帖子详情不长期缓存。
 * ------------------------------------------------------------------ */
const memCache = new Map();
const MAX_ENTRIES = 60;

function remember(url, data) {
  memCache.set(url, { data, at: Date.now() });
  if (memCache.size > MAX_ENTRIES) {
    // 淘汰最旧的一条
    const oldest = [...memCache.entries()].sort((a, b) => a[1].at - b[1].at)[0];
    if (oldest) memCache.delete(oldest[0]);
  }
}

/**
 * 先用缓存里的旧数据渲染（如果有），需要时再请求最新数据。
 * @param {string} url
 * @param {(data:any)=>void} onData 拿到数据就回调（可能被调用两次：缓存 + 最新）
 * @param {{ttl?:number, force?:boolean}} opts ttl 内直接用缓存不再请求；force 表示强制刷新
 */
export async function loadWithCache(url, onData, opts = {}) {
  const { ttl = 30000, force = false } = opts;
  const hit = memCache.get(url);
  if (hit) onData(hit.data);
  if (hit && !force && Date.now() - hit.at < ttl) return hit.data;
  const fresh = await request('GET', url);
  remember(url, fresh);
  onData(fresh);
  return fresh;
}

/** 预取：鼠标悬停链接时先把数据拿回来，点进去就是秒开 */
export function prefetch(url) {
  if (!url || memCache.has(url)) return;
  request('GET', url).then((data) => remember(url, data)).catch(() => {});
}

export const api = {
  get: (url) => request('GET', url),
  post: (url, body) => request('POST', url, body),
  patch: (url, body) => request('PATCH', url, body),
  del: (url) => request('DELETE', url),
  /** 把已经拿到的数据塞进缓存（首页内联抢跑用） */
  prime: (url, data) => remember(url, data),
  /** 清掉某些缓存（比如发完帖后让板块列表刷新） */
  invalidate: (prefix) => {
    for (const key of [...memCache.keys()]) {
      if (!prefix || key.startsWith(prefix)) memCache.delete(key);
    }
  },
  /** 上传图片：请求体就是文件原始字节（本地与 Cloudflare 版通用） */
  upload: async (file) => {
    const res = await fetch('/api/upload', {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'Content-Type': file.type || 'application/octet-stream' },
      body: file,
    });
    const data = await res.json().catch(() => null);
    if (!res.ok) {
      const err = new Error(data?.error || `上传失败（${res.status}）`);
      err.status = res.status;
      throw err;
    }
    return data;
  },
};

export const qs = (params) => {
  const sp = new URLSearchParams();
  Object.entries(params).forEach(([k, v]) => {
    if (v !== undefined && v !== null && v !== '') sp.set(k, v);
  });
  const s = sp.toString();
  return s ? `?${s}` : '';
};

/* ------------------------------ 展示工具 ------------------------------ */

export function timeAgo(iso) {
  if (!iso) return '';
  const t = new Date(iso).getTime();
  const diff = Date.now() - t;
  if (Number.isNaN(t)) return '';
  if (diff < 60e3) return '刚刚';
  if (diff < 3600e3) return `${Math.floor(diff / 60e3)} 分钟前`;
  if (diff < 86400e3) return `${Math.floor(diff / 3600e3)} 小时前`;
  if (diff < 30 * 86400e3) return `${Math.floor(diff / 86400e3)} 天前`;
  const d = new Date(iso);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function fullTime(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

export function floorLabel(n) {
  return n == null ? '楼中楼' : `${n} 楼`;
}
