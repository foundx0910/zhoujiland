import { fail, pageArgs, publicUser } from '../http.js';
import { requireAdmin } from '../auth.js';
import * as store from '../store.js';

export function register(r) {
  // 管理接口统一鉴权
  const admin = (handler) => async (ctx) => {
    requireAdmin(ctx);
    await handler(ctx);
  };

  r.get(
    '/api/admin/overview',
    admin(async (ctx) => {
      const { stats, users } = await store.adminOverview(ctx.db);
      stats.pending_reports = await store.openReportCount(ctx.db);
      ctx.json(200, {
        stats,
        users: users.map((u) => ({
          ...publicUser(u),
          thread_count: u.thread_count,
          post_count: u.post_count,
        })),
      });
    })
  );

  /** 用户管理：封禁 / 解封 / 设为管理员 / 取消管理员 */
  r.post(
    '/api/admin/users/:id',
    admin(async (ctx) => {
      const me = ctx.actor;
      const id = Number(ctx.params.id);
      const user = await store.findUserById(ctx.db, id);
      if (!user) fail(404, '用户不存在');

      const body = await ctx.jsonBody();
      const action = String(body?.action ?? '');
      if (action === 'ban' || action === 'unban') {
        if (id === me.id) fail(400, '不能封禁自己');
        await store.setUserBanned(ctx.db, id, action === 'ban');
        if (action === 'ban') await store.deleteUserSessions(ctx.db, id);
      } else if (action === 'promote' || action === 'demote') {
        if (id === me.id) fail(400, '不能修改自己的权限');
        if (action === 'demote' && user.role === 'admin' && (await store.countAdmins(ctx.db)) <= 1) {
          fail(400, '至少要保留一名管理员');
        }
        await store.setUserRole(ctx.db, id, action === 'promote' ? 'admin' : 'user');
      } else {
        fail(400, '不支持的操作');
      }
      ctx.json(200, { user: publicUser(await store.findUserById(ctx.db, id)) });
    })
  );

  /** 板块管理：列出全部（含已删除） */
  r.get(
    '/api/admin/boards',
    admin(async (ctx) => {
      ctx.json(200, { boards: await store.adminBoards(ctx.db) });
    })
  );

  /** 板块管理：删除 / 恢复（软删除，帖子数据保留） */
  r.post(
    '/api/admin/boards/:id',
    admin(async (ctx) => {
      const board = await store.getBoardAny(ctx.db, ctx.params.id);
      if (!board) fail(404, '板块不存在');
      const body = await ctx.jsonBody();
      const action = String(body?.action ?? '');
      if (action === 'delete') {
        await store.softDeleteBoard(ctx.db, board.id);
      } else if (action === 'restore') {
        await store.restoreBoard(ctx.db, board.id);
      } else {
        fail(400, '不支持的操作');
      }
      ctx.json(200, {
        ok: true,
        board: { id: board.id, name: board.name, deleted: action === 'delete' },
        thread_count: board.thread_count ?? undefined,
      });
    })
  );

  /** 任命 / 撤销板块版主 */
  r.post(
    '/api/admin/boards/:id/moderators',
    admin(async (ctx) => {
      const board = await store.getBoardAny(ctx.db, ctx.params.id);
      if (!board) fail(404, '板块不存在');

      const body = await ctx.jsonBody();
      const action = String(body?.action ?? '');
      const userId = Number(body?.userId);
      const user = await store.findUserById(ctx.db, userId);
      if (!user) fail(404, '用户不存在');

      if (action === 'add') {
        if (user.banned) fail(400, '被封禁的用户不能当版主');
        await store.addModerator(ctx.db, board.id, userId);
      } else if (action === 'remove') {
        await store.removeModerator(ctx.db, board.id, userId);
      } else {
        fail(400, '不支持的操作');
      }
      ctx.json(200, {
        ok: true,
        board: { id: board.id, name: board.name },
        moderators: await store.boardModerators(ctx.db, board.id),
      });
    })
  );

  /** 我正在管理的板块（管理员返回空数组，后台不需要） */
  r.get(
    '/api/admin/my-boards',
    admin(async (ctx) => {
      ctx.json(200, { boards: await store.moderatedBoards(ctx.db, ctx.actor.id) });
    })
  );

  /** 帖子管理（含已删除，可恢复） */
  r.get(
    '/api/admin/threads',
    admin(async (ctx) => {
      const { page, size, offset } = pageArgs(ctx.query, 20, 50);
      const { rows, total } = await store.adminThreads(ctx.db, { page, size, offset });
      ctx.json(200, {
        threads: rows,
        pagination: { page, size, total, pages: Math.max(1, Math.ceil(total / size)) },
      });
    })
  );

  r.post(
    '/api/admin/threads/:id/restore',
    admin(async (ctx) => {
      const id = Number(ctx.params.id);
      if (!(await store.getThread(ctx.db, id))) fail(404, '帖子不存在');
      await store.restoreThread(ctx.db, id);
      ctx.json(200, { ok: true });
    })
  );

  r.post(
    '/api/admin/posts/:id/restore',
    admin(async (ctx) => {
      const id = Number(ctx.params.id);
      const post = await store.getPost(ctx.db, id);
      if (!post) fail(404, '楼层不存在');
      await store.restorePost(ctx.db, id);
      await store.restoreThread(ctx.db, post.thread_id);
      ctx.json(200, { ok: true });
    })
  );
}
