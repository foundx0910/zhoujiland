/* ------------------------------------------------------------------ *
 * 身份：登录用户 / 匿名访客（带昵称的游客）                             *
 * ------------------------------------------------------------------ */

import { fail } from './http.js';
import { randomToken } from './password.js';
import * as store from './store.js';

export const SESSION_COOKIE = 'forum_sid';
export const GUEST_ID_COOKIE = 'forum_gid';
export const GUEST_NAME_COOKIE = 'forum_gname';
export const SESSION_DAYS = 30;
const YEAR_MS = 365 * 864e5;

export const actorKeyOf = (actor) =>
  actor.type === 'user' ? `user:${actor.id}` : `guest:${actor.gid}`;

function cookieOpts(ctx, maxAgeMs) {
  return {
    path: '/',
    httpOnly: true,
    sameSite: 'Lax',
    secure: ctx.isSecure(),
    maxAge: Math.floor(maxAgeMs / 1000),
  };
}

/** 解析请求身份，挂在 ctx.actor 上（必要时下发访客 ID Cookie） */
export async function resolveActor(ctx) {
  const db = ctx.db;
  const token = ctx.cookies[SESSION_COOKIE];
  let user = null;

  if (token) {
    const row = await store.findSessionUser(db, token);
    if (row) {
      if (new Date(row.expires_at).getTime() < Date.now()) {
        await store.deleteSession(db, token);
      } else {
        user = row;
      }
    }
  }

  let gid = ctx.cookies[GUEST_ID_COOKIE];
  if (!gid || !/^[a-f0-9]{16,64}$/.test(gid)) {
    gid = randomToken(16);
    ctx.setCookie(GUEST_ID_COOKIE, gid, cookieOpts(ctx, YEAR_MS));
  }
  const guestName = String(ctx.cookies[GUEST_NAME_COOKIE] ?? '').slice(0, 24);

  if (user && user.banned) {
    await store.deleteSession(db, token);
    ctx.clearCookie(SESSION_COOKIE, { path: '/' });
    ctx.actor = { type: 'guest', id: null, name: guestName, gid, role: 'guest', banned: true };
    return ctx.actor;
  }

  ctx.actor = user
    ? { type: 'user', id: user.id, name: user.username, role: user.role, gid, defaultPw: !!user.default_pw }
    : { type: 'guest', id: null, name: guestName, gid, role: 'guest' };
  return ctx.actor;
}

export async function startSession(ctx, userId) {
  const token = randomToken(24);
  const created = new Date();
  const expires = new Date(created.getTime() + SESSION_DAYS * 864e5);
  await store.createSession(ctx.db, token, userId, {
    createdAt: created.toISOString(),
    expiresAt: expires.toISOString(),
  });
  ctx.setCookie(SESSION_COOKIE, token, cookieOpts(ctx, SESSION_DAYS * 864e5));
  return token;
}

export async function endSession(ctx) {
  const token = ctx.cookies[SESSION_COOKIE];
  if (token) await store.deleteSession(ctx.db, token);
  ctx.clearCookie(SESSION_COOKIE, { path: '/' });
}

export function setGuestName(ctx, name) {
  ctx.setCookie(GUEST_NAME_COOKIE, name, cookieOpts(ctx, YEAR_MS));
}

/* ------------------------------- 权限 -------------------------------- */

/** 需要能发言：登录用户，或设置了昵称的匿名访客 */
export function requireSpeaker(ctx) {
  const a = ctx.actor;
  if (a.type === 'user') return a;
  if (!a.name) fail(401, '先起个昵称（或登录）就能说话了');
  return a;
}

export function requireUser(ctx) {
  if (ctx.actor.type !== 'user') fail(401, '该操作需要登录');
  return ctx.actor;
}

export function requireAdmin(ctx) {
  const a = requireUser(ctx);
  if (a.role !== 'admin') fail(403, '需要管理员权限');
  return a;
}
