import { clean, fail, pageArgs } from '../http.js';
import { actorKeyOf, requireSpeaker, requireUser } from '../auth.js';
import * as store from '../store.js';

export const REPORT_REASONS = ['广告 / 推广', '人身攻击', '违法违规', '色情低俗', '垃圾刷屏', '其他'];

export function register(r) {
  /**
   * 提交举报：注册用户，或设了昵称的匿名访客都可以。
   * 同一个人对同一层只保留一条未处理的举报。
   */
  r.post('/api/reports', async (ctx) => {
    const actor = requireSpeaker(ctx);
    const body = await ctx.jsonBody();
    const targetType = body?.targetType === 'thread' ? 'thread' : 'post';
    const targetId = Number(body?.targetId);
    const reason = clean(body?.reason, 30);
    const detail = clean(body?.detail, 300);

    if (!Number.isFinite(targetId) || targetId <= 0) fail(400, '缺少举报对象');
    if (!reason) fail(400, '请选择一个举报原因');

    let threadId = null;
    let boardId = null;
    if (targetType === 'post') {
      const post = await store.getPost(ctx.db, targetId);
      if (!post || post.deleted) fail(404, '楼层不存在');
      threadId = post.thread_id;
      const t = await ctx.db.first('SELECT board_id FROM threads WHERE id = ?', [threadId]);
      boardId = t?.board_id ?? null;
    } else {
      const thread = await store.getThread(ctx.db, targetId);
      if (!thread) fail(404, '帖子不存在');
      threadId = thread.id;
      boardId = thread.board_id;
    }

    const res = await store.createReport(ctx.db, {
      targetType,
      targetId,
      threadId,
      boardId,
      reporterKey: actorKeyOf(actor),
      reporterName: actor.name,
      reason,
      detail,
    });
    if (res.duplicate) fail(409, '你已经举报过这一条了，我们会尽快处理');
    ctx.json(201, { ok: true, id: res.id });
  });

  /** 举报处理队列：管理员看全部，版主只看自己板块 */
  r.get('/api/reports', async (ctx) => {
    const me = requireUser(ctx);
    const { page, size, offset } = pageArgs(ctx.query, 20, 50);
    const status = ['open', 'resolved', 'rejected', 'all'].includes(ctx.query.get('status'))
      ? ctx.query.get('status')
      : 'open';

    let boardIds = null;
    if (me.role !== 'admin') {
      boardIds = await store.moderatedBoardIds(ctx.db, me.id);
      if (!boardIds.length) fail(403, '需要版主或管理员权限');
    }

    const { rows, total } = await store.listReports(ctx.db, { status, boardIds, size, offset });
    ctx.json(200, {
      items: rows,
      reasons: REPORT_REASONS,
      scope: boardIds === null ? 'all' : 'mine',
      my_boards: await store.moderatedBoards(ctx.db, me.id),
      counts: {
        open: await store.openReportCount(ctx.db, boardIds),
      },
      pagination: { page, size, total, pages: Math.max(1, Math.ceil(total / size)) },
    });
  });

  /** 处理举报：解决 / 驳回 */
  r.post('/api/reports/:id', async (ctx) => {
    const me = requireUser(ctx);
    const id = Number(ctx.params.id);
    const report = await ctx.db.first('SELECT * FROM reports WHERE id = ?', [id]);
    if (!report) fail(404, '举报不存在');

    if (me.role !== 'admin') {
      const ids = await store.moderatedBoardIds(ctx.db, me.id);
      if (!ids.includes(report.board_id)) fail(403, '只能处理自己板块的举报');
    }

    const body = await ctx.jsonBody();
    const action = body?.action === 'reject' ? 'rejected' : body?.action === 'resolve' ? 'resolved' : null;
    if (!action) fail(400, '不支持的操作');

    await store.handleReport(ctx.db, id, action, me.name);
    ctx.json(200, { ok: true, status: action });
  });
}
