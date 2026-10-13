import { clean, fail, pageArgs } from '../http.js';
import { actorKeyOf, requireSpeaker } from '../auth.js';
import { serializeThread } from '../serialize.js';
import * as store from '../store.js';
import { notifyAboutPost } from '../notify.js';

const slugify = (name) => {
  const base = String(name)
    .trim()
    .toLowerCase()
    .replace(/[^\w\u4e00-\u9fa5-]+/g, '-')
    .replace(/[^\x00-\x7F]/g, '')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '');
  return base;
};

async function uniqueSlug(db, name) {
  let base = slugify(name) || `board-${Math.random().toString(16).slice(2, 6)}`;
  let slug = base;
  let i = 2;
  while (await store.slugTaken(db, slug)) slug = `${base}-${i++}`;
  return slug;
}

/** 板块信息附上版主列表与「我能不能管」 */
async function withBoardMeta(ctx, board) {
  const moderators = await store.boardModerators(ctx.db, board.id);
  const can_moderate = await store.canModerateBoard(ctx.db, ctx.actor, board.id);
  return { ...board, moderators, can_moderate };
}

async function boardOr404(ctx, slugOrId) {
  const board = await store.getBoard(ctx.db, slugOrId);
  if (!board) fail(404, '板块不存在');
  return board;
}

export function register(r) {
  r.get('/api/boards', async (ctx) => {
    ctx.json(200, { boards: await store.listBoards(ctx.db) });
  });

  r.post('/api/boards', async (ctx) => {
    const actor = requireSpeaker(ctx);
    const body = await ctx.jsonBody();
    const name = clean(body?.name, 30);
    const description = clean(body?.description, 200);
    if (name.length < 2) fail(400, '板块名称至少 2 个字');
    if (await store.findBoardByName(ctx.db, name)) fail(409, '同名板块已存在');

    const board = await store.createBoard(ctx.db, {
      slug: await uniqueSlug(ctx.db, name),
      name,
      description,
      ownerId: actor.type === 'user' ? actor.id : null,
      ownerName: actor.name,
    });
    ctx.json(201, { board });
  });

  r.get('/api/boards/:slug', async (ctx) => {
    ctx.json(200, { board: await withBoardMeta(ctx, await boardOr404(ctx, ctx.params.slug)) });
  });

  r.get('/api/boards/:slug/threads', async (ctx) => {
    const board = await boardOr404(ctx, ctx.params.slug);
    const { page, size, offset } = pageArgs(ctx.query, 50, 200);
    const q = clean(ctx.query.get('q'), 60);
    const sort = ctx.query.get('sort') ?? 'active';
    const { rows, total } = await store.listThreads(ctx.db, board.id, { page, size, offset, sort, q });
    const key = actorKeyOf(ctx.actor);
    ctx.json(200, {
      board: await withBoardMeta(ctx, board),
      threads: rows.map((t) => serializeThread(t, key)),
      pagination: { page, size, total, pages: Math.max(1, Math.ceil(total / size)) },
    });
  });

  r.post('/api/boards/:slug/threads', async (ctx) => {
    const board = await boardOr404(ctx, ctx.params.slug);
    const actor = requireSpeaker(ctx);
    const body = await ctx.jsonBody();
    const title = clean(body?.title, 80);
    const content = clean(body?.content, 20000);
    if (title.length < 2) fail(400, '标题太短啦，至少 2 个字');
    if (!content) fail(400, '还没写正文呢');

    const { threadId, postId } = await store.createThread(ctx.db, board, actor, actorKeyOf(actor), {
      title,
      content,
    });

    // 楼主正文里的 @某人
    await notifyAboutPost(ctx.db, {
      targets: [],
      content,
      actorName: actor.name,
      actorUserId: actor.type === 'user' ? actor.id : null,
      threadId,
      postId,
      boardSlug: board.slug,
      title,
    });

    ctx.json(201, { id: threadId, board_slug: board.slug });
  });
}
