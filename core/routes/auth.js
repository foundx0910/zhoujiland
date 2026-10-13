import { clean, fail, pageArgs, publicUser } from '../http.js';
import { hashPassword, verifyPassword } from '../password.js';
import {
  actorKeyOf,
  endSession,
  requireUser,
  setGuestName,
  startSession,
} from '../auth.js';
import * as store from '../store.js';

const NAME_RE = /^[\w\u4e00-\u9fa5.-]{2,20}$/;

export function register(r) {
  r.get('/api/health', async (ctx) => {
    ctx.json(200, { ok: true, runtime: ctx.db.kind });
  });

  r.post('/api/auth/register', async (ctx) => {
    const body = await ctx.jsonBody();
    const username = clean(body?.username, 20);
    const password = String(body?.password ?? '');

    if (!NAME_RE.test(username)) fail(400, '用户名需为 2-20 位中文、字母、数字、下划线或短横线');
    if (password.length < 6) fail(400, '密码至少 6 位');
    if (await store.findUserByName(ctx.db, username)) fail(409, '用户名已被占用');

    const isFirst = (await store.countUsers(ctx.db)) === 0;
    const user = await store.createUser(ctx.db, {
      username,
      passwordHash: await hashPassword(password),
      role: isFirst ? 'admin' : 'user',
    });
    await startSession(ctx, user.id);
    ctx.json(201, { user: publicUser(user) });
  });

  r.post('/api/auth/login', async (ctx) => {
    const body = await ctx.jsonBody();
    const username = clean(body?.username, 20);
    const password = String(body?.password ?? '');
    const user = await store.findUserByName(ctx.db, username);
    if (!user || !(await verifyPassword(password, user.password_hash))) {
      fail(401, '用户名或密码错误');
    }
    if (user.banned) fail(403, '该账号已被封禁');
    await startSession(ctx, user.id);
    ctx.json(200, { user: publicUser(user) });
  });

  r.post('/api/auth/logout', async (ctx) => {
    await endSession(ctx);
    ctx.json(200, { ok: true });
  });

  r.get('/api/auth/me', async (ctx) => {
    const a = ctx.actor;
    if (a.type === 'user') {
      const user = await store.findUserById(ctx.db, a.id);
      const unread = await store.unreadNotificationCount(ctx.db, a.id);
      const pending =
        a.role === 'admin'
          ? await store.openReportCount(ctx.db)
          : await store.openReportCount(ctx.db, await store.moderatedBoardIds(ctx.db, a.id));
      ctx.json(200, {
        actor: { type: 'user', name: a.name, role: a.role, default_pw: !!user?.default_pw },
        user: publicUser(user),
        unread_notifications: unread,
        pending_reports: pending,
      });
    } else {
      ctx.json(200, {
        actor: { type: 'guest', name: a.name, role: 'guest' },
        user: null,
        unread_notifications: 0,
        pending_reports: 0,
      });
    }
  });

  /** 设置/更换匿名昵称：匿名也能发言的基础 */
  r.post('/api/auth/guest', async (ctx) => {
    const body = await ctx.jsonBody();
    const name = clean(body?.name, 24);
    if (!NAME_RE.test(name)) fail(400, '昵称需为 2-20 位中文、字母、数字、下划线或短横线');
    setGuestName(ctx, name);
    ctx.json(200, { actor: { type: 'guest', name, role: 'guest' } });
  });

  r.post('/api/auth/password', async (ctx) => {
    const me = requireUser(ctx);
    const body = await ctx.jsonBody();
    const oldPwd = String(body?.oldPassword ?? '');
    const newPwd = String(body?.newPassword ?? '');
    const user = await store.findUserById(ctx.db, me.id);
    if (!user || !(await verifyPassword(oldPwd, user.password_hash))) fail(400, '原密码不正确');
    if (newPwd.length < 6) fail(400, '新密码至少 6 位');
    await store.updatePassword(ctx.db, me.id, await hashPassword(newPwd));
    ctx.json(200, { ok: true });
  });

  /** 修改个人资料：个性签名 / 头像 */
  r.patch('/api/auth/profile', async (ctx) => {
    const me = requireUser(ctx);
    const body = await ctx.jsonBody();
    const fields = {};

    if (body?.bio != null) fields.bio = clean(body.bio, 100);

    if (body?.avatar != null) {
      const avatar = clean(body.avatar, 300);
      // 只允许指向本站上传出来的图片，避免被塞外链/脚本地址
      if (avatar && !/^\/uploads\/[A-Za-z0-9._-]+$/.test(avatar)) fail(400, '头像地址不合法');
      fields.avatar = avatar;
    }

    if (!Object.keys(fields).length) fail(400, '没有需要修改的内容');
    await store.updateProfile(ctx.db, me.id, fields);
    ctx.json(200, { user: publicUser(await store.findUserById(ctx.db, me.id)) });
  });

  r.get('/api/auth/mine', async (ctx) => {
    ctx.json(200, await store.myContent(ctx.db, actorKeyOf(ctx.actor)));
  });
}
