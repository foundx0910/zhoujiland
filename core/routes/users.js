import { fail, pageArgs, publicUser } from '../http.js';
import { serializeThread } from '../serialize.js';
import * as store from '../store.js';

/** 头像地址只允许指向本站上传出来的图片 */
export const isLocalUpload = (url) => /^\/uploads\/[A-Za-z0-9._-]+$/.test(String(url));

export function register(r) {
  /**
   * 公开个人主页：
   *   GET /api/users/:id?tab=threads|posts&page=&size=
   * 返回基本资料、统计，以及该用户的主题帖或回复（分页）。
   */
  r.get('/api/users/:id', async (ctx) => {
    const id = Number(ctx.params.id);
    if (!Number.isFinite(id) || id <= 0) fail(404, '用户不存在');

    const profile = await store.userProfile(ctx.db, id);
    if (!profile) fail(404, '用户不存在');

    const { page, size, offset } = pageArgs(ctx.query, 20, 100);
    const tab = ctx.query.get('tab') === 'posts' ? 'posts' : 'threads';

    let items = [];
    let total = 0;
    if (tab === 'threads') {
      const res = await store.userThreads(ctx.db, id, { size, offset });
      // 个人主页不显示「我」的标记，actorKey 传 null
      items = res.rows.map((t) => serializeThread(t, null));
      total = res.total;
    } else {
      const res = await store.userPosts(ctx.db, id, { size, offset });
      items = res.rows;
      total = res.total;
    }

    ctx.json(200, {
      user: publicUser(profile.user),
      stats: profile.stats,
      tab,
      items,
      pagination: { page, size, total, pages: Math.max(1, Math.ceil(total / size)) },
    });
  });

  /** 我的个人中心用的简写：直接拿自己和上面一样的结构 */
  r.get('/api/users/me/profile', async (ctx) => {
    if (ctx.actor.type !== 'user') fail(401, '请先登录');
    ctx.redirect(`/api/users/${ctx.actor.id}`);
  });
}
