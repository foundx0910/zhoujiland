import { pageArgs } from '../http.js';
import { requireUser } from '../auth.js';
import * as store from '../store.js';

const TYPE_LABEL = {
  thread_reply: '在你的帖子里回了一层',
  reply: '回复了你的楼层',
  like: '赞了你的楼层',
  mention: '在帖子里提到了你',
};

export function register(r) {
  /** 通知列表（未读数一并返回，方便直接更新铃铛） */
  r.get('/api/notifications', async (ctx) => {
    const me = requireUser(ctx);
    const { page, size, offset } = pageArgs(ctx.query, 20, 50);
    const { rows, total } = await store.listNotifications(ctx.db, me.id, { size, offset });
    ctx.json(200, {
      items: rows.map((n) => ({ ...n, type_label: TYPE_LABEL[n.type] ?? '有新消息' })),
      unread: await store.unreadNotificationCount(ctx.db, me.id),
      pagination: { page, size, total, pages: Math.max(1, Math.ceil(total / size)) },
    });
  });

  /** 标记已读：不传 ids 就是全部标记 */
  r.post('/api/notifications/read', async (ctx) => {
    const me = requireUser(ctx);
    const body = await ctx.jsonBody();
    const ids = Array.isArray(body?.ids) ? body.ids.map(Number).filter(Number.isFinite).slice(0, 200) : null;
    await store.markNotificationsRead(ctx.db, me.id, ids);
    ctx.json(200, { ok: true, unread: await store.unreadNotificationCount(ctx.db, me.id) });
  });

  /** 只取未读数（轮询用） */
  r.get('/api/notifications/count', async (ctx) => {
    if (ctx.actor.type !== 'user') return ctx.json(200, { unread: 0 });
    ctx.json(200, { unread: await store.unreadNotificationCount(ctx.db, ctx.actor.id) });
  });
}
