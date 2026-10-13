import { clean, fail } from '../http.js';
import { actorKeyOf, requireSpeaker } from '../auth.js';
import * as store from '../store.js';

async function postOr404(ctx, id) {
  const post = await store.getPost(ctx.db, id);
  if (!post || post.deleted) fail(404, '楼层不存在或已被删除');
  return post;
}

async function assertCanEdit(ctx, post) {
  const actor = requireSpeaker(ctx);
  if (post.actor_key === actorKeyOf(actor) || actor.role === 'admin') return actor;
  // 版主也能管理自己板块里的楼层
  const thread = await ctx.db.first('SELECT board_id FROM threads WHERE id = ?', [post.thread_id]);
  if (thread && (await store.canModerateBoard(ctx.db, actor, thread.board_id))) return actor;
  fail(403, '只有作者、版主或管理员可以操作这一层');
}

export function register(r) {
  /** 编辑某一层的内容 */
  r.patch('/api/posts/:id', async (ctx) => {
    const post = await postOr404(ctx, ctx.params.id);
    await assertCanEdit(ctx, post);
    const body = await ctx.jsonBody();
    const content = clean(body?.content, 20000);
    if (!content) fail(400, '还没写内容呢');
    await store.updatePost(ctx.db, post.id, content);
    ctx.json(200, { ok: true });
  });

  /** 删除某一层（软删除，楼层号保留占位） */
  r.del('/api/posts/:id', async (ctx) => {
    const post = await postOr404(ctx, ctx.params.id);
    const actor = await assertCanEdit(ctx, post);
    await store.softDeletePost(ctx.db, post);
    ctx.json(200, { ok: true, by_admin: actor.role === 'admin' });
  });
}
