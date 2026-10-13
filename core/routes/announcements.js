import { clean, fail } from '../http.js';
import { requireAdmin } from '../auth.js';
import * as store from '../store.js';

const LEVELS = ['normal', 'important'];

function parseBody(body, { partial = false } = {}) {
  const out = {};

  if (body?.title !== undefined || !partial) {
    const title = clean(body?.title, 60);
    if (title.length < 2) fail(400, '标题至少 2 个字');
    out.title = title;
  }
  if (body?.content !== undefined || !partial) out.content = clean(body?.content, 5000) ?? '';
  if (body?.level !== undefined || !partial) {
    const level = String(body?.level ?? 'normal');
    if (!LEVELS.includes(level)) fail(400, '公告级别只能是 normal 或 important');
    out.level = level;
  }
  if (body?.linkUrl !== undefined || !partial) {
    const linkUrl = clean(body?.linkUrl, 300) ?? '';
    if (linkUrl && !/^(https?:\/\/|\/)/i.test(linkUrl)) fail(400, '链接要以 http(s):// 或 / 开头');
    out.linkUrl = linkUrl;
    out.linkText = clean(body?.linkText, 30) ?? '';
  }
  if (body?.active !== undefined || !partial) out.active = body?.active === undefined ? true : !!body.active;
  if (body?.sort !== undefined || !partial) {
    const sort = Number(body?.sort ?? 0);
    if (!Number.isFinite(sort)) fail(400, '排序值要是数字');
    out.sort = Math.trunc(sort);
  }
  return out;
}

export function register(r) {
  /** 前台：公告列表（游客也能看）。默认只给生效中的；?history=1 连已下架的一起给（历史页用） */
  r.get('/api/announcements', async (ctx) => {
    const history = ctx.query.get('history') === '1';
    const items = history
      ? await store.listAllAnnouncements(ctx.db)
      : await store.listActiveAnnouncements(ctx.db);
    ctx.json(200, { items });
  });

  /** 后台：全部公告（含已下架） */
  r.get('/api/announcements/all', async (ctx) => {
    requireAdmin(ctx);
    ctx.json(200, { items: await store.listAllAnnouncements(ctx.db) });
  });

  /** 新建公告 */
  r.post('/api/announcements', async (ctx) => {
    const me = requireAdmin(ctx);
    const body = await ctx.jsonBody();
    const data = parseBody(body);
    const { id } = await store.createAnnouncement(ctx.db, { ...data, createdBy: me.name });
    ctx.json(201, { id });
  });

  /** 编辑 / 上架 / 下架（只传要改的字段即可） */
  r.patch('/api/announcements/:id', async (ctx) => {
    requireAdmin(ctx);
    const id = Number(ctx.params.id);
    const item = await store.getAnnouncement(ctx.db, id);
    if (!item) fail(404, '公告不存在');

    const body = await ctx.jsonBody();
    await store.updateAnnouncement(ctx.db, id, parseBody(body, { partial: true }));
    ctx.json(200, { ok: true });
  });

  /** 删除公告 */
  r.del('/api/announcements/:id', async (ctx) => {
    requireAdmin(ctx);
    const id = Number(ctx.params.id);
    const item = await store.getAnnouncement(ctx.db, id);
    if (!item) fail(404, '公告不存在');
    await store.deleteAnnouncement(ctx.db, id);
    ctx.json(200, { ok: true });
  });
}
