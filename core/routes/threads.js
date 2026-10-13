import { clean, fail, pageArgs } from '../http.js';
import { actorKeyOf, requireSpeaker } from '../auth.js';
import { serializePost, serializeThread } from '../serialize.js';
import * as store from '../store.js';
import { notifyAboutPost, notifyLike } from '../notify.js';

async function threadOr404(ctx, id) {
  const thread = await store.getThread(ctx.db, id);
  if (!thread || thread.deleted) fail(404, '帖子不存在或已被删除');
  return thread;
}

export function register(r) {
  /** 帖子详情：楼层分页 + 楼中楼 */
  r.get('/api/threads/:id', async (ctx) => {
    const thread = await threadOr404(ctx, ctx.params.id);
    const { page, size, offset } = pageArgs(ctx.query, 50, 200);
    const order = ctx.query.get('order') === 'desc' ? 'desc' : 'asc';
    const key = actorKeyOf(ctx.actor);

    if (page === 1 && ctx.query.get('count') !== '0') {
      await store.bumpViews(ctx.db, thread.id);
      thread.views += 1;
    }

    const { floors, replies, liked } = await store.loadFloors(ctx.db, thread, key, {
      page,
      size,
      offset,
      order,
    });

    const byParent = new Map();
    for (const reply of replies) {
      if (!byParent.has(reply.parent_id)) byParent.set(reply.parent_id, []);
      byParent.get(reply.parent_id).push({ ...reply, liked: liked.has(reply.id) });
    }

    const canModerate = await store.canModerateBoard(ctx.db, ctx.actor, thread.board_id);

    ctx.json(200, {
      thread: { ...serializeThread(thread, key), can_moderate: canModerate },
      floors: floors.map((f) =>
        serializePost({ ...f, liked: liked.has(f.id) }, key, {
          replies: byParent.get(f.id) ?? [],
          opKey: thread.actor_key,
          isAdmin: ctx.actor.role === 'admin',
        })
      ),
      pagination: {
        page,
        size,
        total: thread.floor_count,
        pages: Math.max(1, Math.ceil(thread.floor_count / size)),
        order,
      },
    });
  });

  /** 盖楼 / 楼中楼 */
  r.post('/api/threads/:id/posts', async (ctx) => {
    const thread = await threadOr404(ctx, ctx.params.id);
    const actor = requireSpeaker(ctx);
    const body = await ctx.jsonBody();
    const content = clean(body?.content, 20000);
    if (!content) fail(400, '还没写内容呢');
    const canModerate = await store.canModerateBoard(ctx.db, actor, thread.board_id);
    if (thread.locked && !canModerate) fail(403, '该帖已锁定，无法回复');

    const key = actorKeyOf(actor);
    const parentId = body?.parentId ? Number(body.parentId) : null;

    if (!parentId) {
      const { postId } = await store.createFloor(ctx.db, thread, actor, key, content);
      const row = await store.getPostWithRole(ctx.db, postId);

      // 通知楼主：你的帖子多了一层楼
      await notifyAboutPost(ctx.db, {
        targets: thread.author_type === 'user' ? [{ userId: thread.author_id, type: 'thread_reply' }] : [],
        content,
        actorName: actor.name,
        actorUserId: actor.type === 'user' ? actor.id : null,
        threadId: thread.id,
        postId,
        boardSlug: thread.board_slug,
        title: thread.title,
      });

      ctx.json(201, {
        post: serializePost(row, key, { opKey: thread.actor_key, isAdmin: actor.role === 'admin' }),
        floor_no: row.floor_no,
        parent_id: null,
      });
      return;
    }

    const target = await store.getPost(ctx.db, parentId);
    if (!target || target.deleted || target.thread_id !== thread.id) fail(404, '要回复的楼层不存在');

    let parent;
    let quote;
    if (target.parent_id) {
      parent = await store.getPost(ctx.db, target.parent_id);
      quote = { floor_no: parent?.floor_no ?? null, author: target.author_name };
    } else {
      parent = target;
      quote = { floor_no: target.floor_no, author: target.author_name };
    }

    const { postId } = await store.createSubReply(ctx.db, thread, parent, quote, actor, key, content);
    const row = await store.getPostWithRole(ctx.db, postId);

    // 通知被回复的那一层作者
    await notifyAboutPost(ctx.db, {
      targets: target.author_type === 'user' ? [{ userId: target.author_id, type: 'reply' }] : [],
      content,
      actorName: actor.name,
      actorUserId: actor.type === 'user' ? actor.id : null,
      threadId: thread.id,
      postId,
      boardSlug: thread.board_slug,
      title: thread.title,
    });

    ctx.json(201, {
      post: serializePost(row, key, { opKey: thread.actor_key, isAdmin: actor.role === 'admin' }),
      floor_no: null,
      parent_id: parent.id,
    });
  });

  /** 给某一层点赞 / 取消 */
  r.post('/api/threads/:id/like', async (ctx) => {
    const thread = await threadOr404(ctx, ctx.params.id);
    const body = await ctx.jsonBody();
    const postId = Number(body?.postId);
    if (!postId) fail(400, '缺少 postId');
    const post = await store.getPost(ctx.db, postId);
    if (!post || post.thread_id !== thread.id) fail(404, '楼层不存在');

    const result = await store.toggleLike(ctx.db, 'post', postId, actorKeyOf(ctx.actor));
    if (result.liked && post.author_type === 'user') {
      await notifyLike(ctx.db, {
        userId: post.author_id,
        actorName: ctx.actor.name,
        actorUserId: ctx.actor.type === 'user' ? ctx.actor.id : null,
        threadId: thread.id,
        postId,
        boardSlug: thread.board_slug,
        title: thread.title,
        content: post.content,
      });
    }
    ctx.json(200, result);
  });

  /** 改标题 / 置顶 / 锁定 */
  r.patch('/api/threads/:id', async (ctx) => {
    const thread = await threadOr404(ctx, ctx.params.id);
    const actor = requireSpeaker(ctx);
    const isAdmin = actor.role === 'admin';
    const isOwner = thread.actor_key === actorKeyOf(actor);
    const isMod = await store.canModerateBoard(ctx.db, actor, thread.board_id);
    if (!isAdmin && !isOwner && !isMod) fail(403, '只有作者、版主或管理员可以修改');

    const body = await ctx.jsonBody();
    const fields = {};
    if (body?.title != null) {
      const title = clean(body.title, 80);
      if (title.length < 2) fail(400, '标题至少 2 个字');
      fields.title = title;
    }
    for (const f of ['pinned', 'locked']) {
      if (body?.[f] != null) {
        if (!isAdmin && !isMod) fail(403, '只有版主或管理员可以置顶或锁定');
        fields[f] = body[f] ? 1 : 0;
      }
    }
    if (!Object.keys(fields).length) fail(400, '没有需要修改的内容');
    await store.updateThread(ctx.db, thread.id, fields);
    ctx.json(200, { ok: true });
  });

  /** 删除整帖（软删除，管理员可恢复） */
  r.del('/api/threads/:id', async (ctx) => {
    const thread = await threadOr404(ctx, ctx.params.id);
    const actor = requireSpeaker(ctx);
    const isMod = await store.canModerateBoard(ctx.db, actor, thread.board_id);
    if (thread.actor_key !== actorKeyOf(actor) && actor.role !== 'admin' && !isMod) {
      fail(403, '只有作者、版主或管理员可以删除');
    }
    await store.softDeleteThread(ctx.db, thread.id);
    ctx.json(200, { ok: true });
  });
}
