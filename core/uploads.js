/* ------------------------------------------------------------------ *
 * 图片存储适配器                                                       *
 *   本地（Node）  -> data/uploads 目录                                  *
 *   线上（Worker）-> Cloudflare KV（免费额度 1GB / 每天 1000 次写入）    *
 * ------------------------------------------------------------------ */

const MIME_BY_EXT = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
};

export const safeKey = (key) =>
  typeof key === 'string' && /^[A-Za-z0-9][A-Za-z0-9._-]{0,120}$/.test(key) && !key.includes('..');

export function createFsUploads(dir, fsMod, pathMod) {
  return {
    kind: 'fs',
    async put(key, bytes) {
      fsMod.mkdirSync(dir, { recursive: true });
      fsMod.writeFileSync(pathMod.join(dir, key), bytes);
    },
    async get(key) {
      if (!safeKey(key)) return null;
      const file = pathMod.join(dir, key);
      if (!fsMod.existsSync(file)) return null;
      const ext = pathMod.extname(key).toLowerCase();
      return {
        bytes: fsMod.readFileSync(file),
        contentType: MIME_BY_EXT[ext] ?? 'application/octet-stream',
      };
    },
    async delete(key) {
      if (!safeKey(key)) return;
      const file = pathMod.join(dir, key);
      if (fsMod.existsSync(file)) fsMod.rmSync(file);
    },
  };
}

export function createKvUploads(kv) {
  return {
    kind: 'kv',
    async put(key, bytes, contentType) {
      await kv.put(key, bytes, { metadata: { contentType } });
    },
    async get(key) {
      if (!safeKey(key)) return null;
      const { value, metadata } = await kv.getWithMetadata(key, { type: 'arrayBuffer' });
      if (!value) return null;
      const ext = key.slice(key.lastIndexOf('.')).toLowerCase();
      return {
        bytes: value,
        contentType: metadata?.contentType ?? MIME_BY_EXT[ext] ?? 'application/octet-stream',
      };
    },
    async delete(key) {
      if (safeKey(key)) await kv.delete(key);
    },
  };
}

/** 空实现：没配置图片存储时给出明确报错 */
export function createNoopUploads() {
  return {
    kind: 'none',
    async put() {
      const err = new Error('当前部署没有配置图片存储（本地用 data/uploads，线上需要绑定 KV）');
      err.status = 501;
      throw err;
    },
    async get() {
      return null;
    },
    async delete() {},
  };
}
