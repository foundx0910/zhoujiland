import { clean, pageArgs } from '../http.js';
import { actorKeyOf } from '../auth.js';
import { serializeThread } from '../serialize.js';
import * as store from '../store.js';

export function register(r) {
  /** 全站搜索：标题 + 楼层正文 */
  r.get('/api/search', async (ctx) => {
    const q = clean(ctx.query.get('q'), 60);
    const { page, size, offset } = pageArgs(ctx.query, 50, 200);
    if (!q) {
      ctx.json(200, {
        threads: [],
        posts: [],
        pagination: { page, size, total: 0, pages: 1 },
      });
      return;
    }
    const { threads, posts, total } = await store.search(ctx.db, q, { page, size, offset });
    const key = actorKeyOf(ctx.actor);
    ctx.json(200, {
      threads: threads.map((t) => serializeThread(t, key)),
      posts,
      pagination: { page, size, total, pages: Math.max(1, Math.ceil(total / size)) },
    });
  });
}
