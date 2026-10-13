/* ------------------------------------------------------------------ *
 * 数据访问层：所有 SQL 都写在这里，只依赖 adapters 暴露的异步接口。      *
 * ------------------------------------------------------------------ */

import { hashPassword, randomToken } from './password.js';

export const now = () => new Date().toISOString();
export { randomToken as uid };

/** 重算某个主题的楼层数 / 回复数 / 最后回复时间（自愈式，不怕计数漂移） */
export function countersStatement(threadId, fallbackTs) {
  return {
    sql: `UPDATE threads SET
            floor_count   = (SELECT COUNT(*) FROM posts WHERE thread_id = ? AND parent_id IS NULL),
            reply_count   = (SELECT COUNT(*) FROM posts WHERE thread_id = ? AND parent_id IS NOT NULL AND deleted = 0),
            last_reply_at = COALESCE((SELECT MAX(created_at) FROM posts WHERE thread_id = ? AND deleted = 0), ?)
          WHERE id = ?`,
    params: [threadId, threadId, threadId, fallbackTs, threadId],
  };
}

/* ------------------------------- 板块 ------------------------------- */

const BOARD_STATS = `
  (SELECT COUNT(*) FROM threads t WHERE t.board_id = b.id AND t.deleted = 0) AS thread_count,
  (SELECT COUNT(*) FROM posts p JOIN threads t2 ON t2.id = p.thread_id
     WHERE t2.board_id = b.id AND t2.deleted = 0 AND p.deleted = 0) AS post_count,
  (SELECT MAX(t3.last_reply_at) FROM threads t3 WHERE t3.board_id = b.id AND t3.deleted = 0) AS last_active_at
`;

export const listBoards = (db) =>
  db.all(`SELECT b.*, ${BOARD_STATS} FROM boards b WHERE b.deleted = 0 ORDER BY b.id ASC`);

/** 正常访问：已删除的板块视为不存在 */
export const getBoard = (db, slugOrId) =>
  db.first('SELECT * FROM boards WHERE deleted = 0 AND (slug = ? OR CAST(id AS TEXT) = ?)', [
    slugOrId,
    slugOrId,
  ]);

/** 管理用：包含已删除的板块 */
export const getBoardAny = (db, idOrSlug) =>
  db.first('SELECT * FROM boards WHERE id = ? OR slug = ?', [
    Number.isFinite(Number(idOrSlug)) ? Number(idOrSlug) : -1,
    String(idOrSlug),
  ]);

export const softDeleteBoard = (db, id) => db.run('UPDATE boards SET deleted = 1 WHERE id = ?', [id]);
export const restoreBoard = (db, id) => db.run('UPDATE boards SET deleted = 0 WHERE id = ?', [id]);

/** 管理用：全部板块（含已删除） */
export const adminBoards = (db) =>
  db.all(
    `SELECT b.*, ${BOARD_STATS},
            (SELECT group_concat(u.username, '、') FROM board_moderators m JOIN users u ON u.id = m.user_id
              WHERE m.board_id = b.id) AS moderators_text
       FROM boards b ORDER BY b.deleted ASC, b.id ASC`
  );

export const findBoardByName = (db, name) => db.first('SELECT id FROM boards WHERE name = ?', [name]);

export const slugTaken = async (db, slug) =>
  !!(await db.first('SELECT 1 AS x FROM boards WHERE slug = ?', [slug]));

export async function createBoard(db, { slug, name, description, ownerId, ownerName }) {
  const ts = now();
  const res = await db.run(
    'INSERT INTO boards (slug, name, description, owner_id, owner_name, created_at) VALUES (?, ?, ?, ?, ?, ?)',
    [slug, name, description, ownerId ?? null, ownerName, ts]
  );
  return db.first('SELECT * FROM boards WHERE id = ?', [res.lastInsertRowid]);
}

/* ------------------------------- 主题帖 ------------------------------ */

const THREAD_SELECT = `
  SELECT t.*, b.slug AS board_slug, b.name AS board_name,
         (SELECT substr(p.content, 1, 160) FROM posts p WHERE p.thread_id = t.id AND p.floor_no = 1) AS excerpt
    FROM threads t JOIN boards b ON b.id = t.board_id AND b.deleted = 0
`;

export const getThread = (db, id) => db.first(`${THREAD_SELECT} WHERE t.id = ?`, [Number(id)]);

export async function listThreads(db, boardId, { page, size, offset, sort = 'active', q = '' }) {
  const where = ['t.board_id = ?', 't.deleted = 0'];
  const params = [boardId];
  if (q) {
    where.push(
      '(t.title LIKE ? OR EXISTS (SELECT 1 FROM posts p WHERE p.thread_id = t.id AND p.content LIKE ?))'
    );
    params.push(`%${q}%`, `%${q}%`);
  }
  const clause = where.join(' AND ');
  const order =
    sort === 'new'
      ? 't.pinned DESC, t.created_at DESC'
      : sort === 'hot'
        ? 't.pinned DESC, t.reply_count DESC, t.last_reply_at DESC'
        : 't.pinned DESC, t.last_reply_at DESC';

  const total = (await db.first(`SELECT COUNT(*) AS n FROM threads t WHERE ${clause}`, params)).n;
  const rows = await db.all(
    `SELECT t.*, b.slug AS board_slug, b.name AS board_name,
            (SELECT substr(p.content, 1, 160) FROM posts p WHERE p.thread_id = t.id AND p.floor_no = 1) AS excerpt
       FROM threads t JOIN boards b ON b.id = t.board_id
      WHERE ${clause}
      ORDER BY ${order}
      LIMIT ? OFFSET ?`,
    [...params, size, offset]
  );
  return { rows, total };
}

/** 发新帖：主题 + 1 楼（楼主）；两步之间有补偿删除，保证不会出现空主题 */
export async function createThread(db, board, actor, actorKey, { title, content }) {
  const ts = now();
  const thread = await db.run(
    `INSERT INTO threads (board_id, title, author_id, author_name, author_type, actor_key,
                          floor_count, reply_count, last_reply_at, created_at)
     VALUES (?, ?, ?, ?, ?, ?, 1, 0, ?, ?)`,
    [board.id, title, actor.type === 'user' ? actor.id : null, actor.name, actor.type, actorKey, ts, ts]
  );
  const threadId = thread.lastInsertRowid;
  try {
    const results = await db.batch([
      {
        sql: `INSERT INTO posts (thread_id, floor_no, parent_id, author_id, author_name, author_type,
                                 actor_key, content, created_at, updated_at)
              VALUES (?, 1, NULL, ?, ?, ?, ?, ?, ?, ?)`,
        params: [
          threadId,
          actor.type === 'user' ? actor.id : null,
          actor.name,
          actor.type,
          actorKey,
          content,
          ts,
          ts,
        ],
      },
      countersStatement(threadId, ts),
    ]);
    return { threadId, postId: results[0].lastInsertRowid };
  } catch (err) {
    await db.run('DELETE FROM threads WHERE id = ?', [threadId]).catch(() => {});
    throw err;
  }
}

export const updateThread = async (db, id, fields) => {
  const sets = [];
  const params = [];
  if (fields.title != null) {
    sets.push('title = ?');
    params.push(fields.title);
  }
  for (const f of ['pinned', 'locked']) {
    if (fields[f] != null) {
      sets.push(`${f} = ?`);
      params.push(fields[f] ? 1 : 0);
    }
  }
  if (!sets.length) return;
  await db.run(`UPDATE threads SET ${sets.join(', ')} WHERE id = ?`, [...params, id]);
};

export const softDeleteThread = (db, id) =>
  db.run('UPDATE threads SET deleted = 1 WHERE id = ?', [id]);

export const restoreThread = (db, id) =>
  db.run('UPDATE threads SET deleted = 0 WHERE id = ?', [id]);

export const bumpViews = (db, id) =>
  db.run('UPDATE threads SET views = views + 1 WHERE id = ?', [id]);

/* -------------------------------- 楼层 ------------------------------- */

export const getPost = (db, id) => db.first('SELECT * FROM posts WHERE id = ?', [Number(id)]);

export async function getPostWithRole(db, id) {
  return db.first(
    `SELECT p.*, u.role AS author_role, u.avatar AS author_avatar, u.bio AS author_bio
       FROM posts p LEFT JOIN users u ON u.id = p.author_id WHERE p.id = ?`,
    [Number(id)]
  );
}

/** 取一页主楼层 + 各自的楼中楼 + 当前身份的点赞状态 */
export async function loadFloors(db, thread, actorKey, { page, size, offset, order = 'asc' }) {
  const dir = order === 'desc' ? 'DESC' : 'ASC';
  const floors = await db.all(
    `SELECT p.*, u.role AS author_role, u.avatar AS author_avatar, u.bio AS author_bio
       FROM posts p LEFT JOIN users u ON u.id = p.author_id
      WHERE p.thread_id = ? AND p.parent_id IS NULL
      ORDER BY p.floor_no ${dir}
      LIMIT ? OFFSET ?`,
    [thread.id, size, offset]
  );

  const ids = floors.map((f) => f.id);
  let replies = [];
  if (ids.length) {
    replies = await db.all(
      `SELECT p.*, u.role AS author_role, u.avatar AS author_avatar, u.bio AS author_bio
         FROM posts p LEFT JOIN users u ON u.id = p.author_id
        WHERE p.parent_id IN (${ids.map(() => '?').join(',')})
        ORDER BY p.id ASC`,
      ids
    );
  }

  const allIds = [...ids, ...replies.map((r) => r.id)];
  const liked = new Set();
  if (allIds.length) {
    const rows = await db.all(
      `SELECT target_id FROM likes
        WHERE target_type = 'post' AND actor_key = ?
          AND target_id IN (${allIds.map(() => '?').join(',')})`,
      [actorKey, ...allIds]
    );
    rows.forEach((r) => liked.add(r.target_id));
  }
  return { floors, replies, liked };
}

/** 盖一层新楼：楼层号由 SQL 原子生成（单语句 + 事务计数） */
export async function createFloor(db, thread, actor, actorKey, content) {
  const ts = now();
  const results = await db.batch([
    {
      sql: `INSERT INTO posts (thread_id, floor_no, parent_id, author_id, author_name, author_type,
                               actor_key, content, created_at, updated_at)
            VALUES (?, (SELECT COALESCE(MAX(floor_no), 1) + 1 FROM posts WHERE thread_id = ?), NULL,
                    ?, ?, ?, ?, ?, ?, ?)`,
      params: [
        thread.id,
        thread.id,
        actor.type === 'user' ? actor.id : null,
        actor.name,
        actor.type,
        actorKey,
        content,
        ts,
        ts,
      ],
    },
    countersStatement(thread.id, ts),
  ]);
  return { postId: results[0].lastInsertRowid, floorNo: null, ts };
}

/** 楼中楼：统一挂到主楼层下，引用的可能是某一层楼中楼 */
export async function createSubReply(db, thread, parent, quote, actor, actorKey, content) {
  const ts = now();
  const results = await db.batch([
    {
      sql: `INSERT INTO posts (thread_id, floor_no, parent_id, quote_floor_no, quote_author,
                               author_id, author_name, author_type, actor_key, content, created_at, updated_at)
            VALUES (?, NULL, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      params: [
        thread.id,
        parent.id,
        quote.floor_no ?? null,
        quote.author ?? null,
        actor.type === 'user' ? actor.id : null,
        actor.name,
        actor.type,
        actorKey,
        content,
        ts,
        ts,
      ],
    },
    countersStatement(thread.id, ts),
  ]);
  return { postId: results[0].lastInsertRowid, ts };
}

/** 读取刚插入楼层的楼层号（D1/Node 都不依赖连接态，用 id 查） */
export const floorNoOf = async (db, postId) =>
  (await db.first('SELECT floor_no FROM posts WHERE id = ?', [postId]))?.floor_no ?? null;

export const updatePost = (db, id, content) =>
  db.run('UPDATE posts SET content = ?, updated_at = ? WHERE id = ?', [content, now(), id]);

export async function softDeletePost(db, post) {
  const ts = now();
  const thread = await db.first('SELECT * FROM threads WHERE id = ?', [post.thread_id]);
  const results = await db.batch([
    { sql: 'UPDATE posts SET deleted = 1, content = ? WHERE id = ?', params: ['', post.id] },
    countersStatement(post.thread_id, thread?.created_at ?? ts),
  ]);
  const remaining = await db.first(
    'SELECT COUNT(*) AS n FROM posts WHERE thread_id = ? AND deleted = 0',
    [post.thread_id]
  );
  if (remaining.n === 0) await softDeleteThread(db, post.thread_id);
  return results;
}

export const restorePost = (db, id) => db.run('UPDATE posts SET deleted = 0 WHERE id = ?', [id]);

export const getLike = (db, type, id, actorKey) =>
  db.first('SELECT id FROM likes WHERE target_type = ? AND target_id = ? AND actor_key = ?', [
    type,
    id,
    actorKey,
  ]);

/* -------------------------------- 点赞 ------------------------------- */

export async function toggleLike(db, type, id, actorKey) {
  const existing = await getLike(db, type, id, actorKey);
  const statements = [];
  if (existing) {
    statements.push({ sql: 'DELETE FROM likes WHERE id = ?', params: [existing.id] });
  } else {
    statements.push({
      sql: 'INSERT OR IGNORE INTO likes (target_type, target_id, actor_key, created_at) VALUES (?, ?, ?, ?)',
      params: [type, id, actorKey, now()],
    });
  }
  if (type === 'post') {
    statements.push({
      sql: 'UPDATE posts SET likes = (SELECT COUNT(*) FROM likes WHERE target_type = ? AND target_id = ?) WHERE id = ?',
      params: [type, id, id],
    });
  }
  await db.batch(statements);
  const likes =
    type === 'post'
      ? (await db.first('SELECT likes FROM posts WHERE id = ?', [id]))?.likes ?? 0
      : (await db.first('SELECT COUNT(*) AS n FROM likes WHERE target_type = ? AND target_id = ?', [type, id])).n;
  return { liked: !existing, likes };
}

/* -------------------------------- 搜索 ------------------------------- */

export async function search(db, q, { page, size, offset }) {
  const like = `%${q}%`;
  const total = (
    await db.first(
      `SELECT COUNT(*) AS n FROM threads t JOIN boards b ON b.id = t.board_id AND b.deleted = 0
        WHERE t.deleted = 0 AND (t.title LIKE ? OR EXISTS (
          SELECT 1 FROM posts p WHERE p.thread_id = t.id AND p.deleted = 0 AND p.content LIKE ?))`,
      [like, like]
    )
  ).n;

  const threads = await db.all(
    `SELECT t.*, b.slug AS board_slug, b.name AS board_name,
            (SELECT substr(p.content, 1, 160) FROM posts p WHERE p.thread_id = t.id AND p.floor_no = 1) AS excerpt
       FROM threads t JOIN boards b ON b.id = t.board_id AND b.deleted = 0
      WHERE t.deleted = 0 AND (t.title LIKE ? OR EXISTS (
        SELECT 1 FROM posts p WHERE p.thread_id = t.id AND p.deleted = 0 AND p.content LIKE ?))
      ORDER BY t.pinned DESC, t.last_reply_at DESC
      LIMIT ? OFFSET ?`,
    [like, like, size, offset]
  );

  const posts = await db.all(
    `SELECT p.id, p.thread_id, p.floor_no, p.author_name, p.created_at,
            substr(p.content, 1, 120) AS snippet, t.title, b.slug AS board_slug
       FROM posts p JOIN threads t ON t.id = p.thread_id JOIN boards b ON b.id = t.board_id
      WHERE p.deleted = 0 AND t.deleted = 0 AND b.deleted = 0 AND p.content LIKE ?
      ORDER BY p.id DESC LIMIT 20`,
    [like]
  );

  return { threads, posts, total };
}

/* ------------------------------ 用户与会话 ---------------------------- */

export const findUserByName = (db, username) =>
  db.first('SELECT * FROM users WHERE username = ?', [username]);

export const findUserById = (db, id) => db.first('SELECT * FROM users WHERE id = ?', [Number(id)]);

export const countUsers = async (db) => (await db.first('SELECT COUNT(*) AS n FROM users')).n;

export async function createUser(db, { username, passwordHash, role = 'user', defaultPw = 0 }) {
  const res = await db.run(
    'INSERT INTO users (username, password_hash, role, default_pw, created_at) VALUES (?, ?, ?, ?, ?)',
    [username, passwordHash, role, defaultPw, now()]
  );
  return findUserById(db, res.lastInsertRowid);
}

export const updatePassword = (db, id, passwordHash) =>
  db.run('UPDATE users SET password_hash = ?, default_pw = 0 WHERE id = ?', [passwordHash, id]);

export const setUserBanned = (db, id, banned) =>
  db.run('UPDATE users SET banned = ? WHERE id = ?', [banned ? 1 : 0, id]);

export const setUserRole = (db, id, role) =>
  db.run('UPDATE users SET role = ? WHERE id = ?', [role, id]);

export async function createSession(db, token, userId, { createdAt, expiresAt }) {
  await db.run('INSERT INTO sessions (token, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)', [
    token,
    userId,
    createdAt,
    expiresAt,
  ]);
}

export const findSessionUser = (db, token) =>
  db.first(
    `SELECT u.id, u.username, u.role, u.banned, u.default_pw, u.bio, u.avatar, s.expires_at
       FROM sessions s JOIN users u ON u.id = s.user_id
      WHERE s.token = ?`,
    [token]
  );

export const deleteSession = (db, token) => db.run('DELETE FROM sessions WHERE token = ?', [token]);

export const deleteUserSessions = (db, userId) =>
  db.run('DELETE FROM sessions WHERE user_id = ?', [userId]);

export const countAdmins = async (db) =>
  (await db.first("SELECT COUNT(*) AS n FROM users WHERE role = 'admin'")).n;

/* -------------------------------- 管理 ------------------------------- */

export async function adminOverview(db) {
  const one = async (sql, params = []) => (await db.first(sql, params)).n;
  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);

  const stats = {
    users: await one('SELECT COUNT(*) AS n FROM users'),
    banned: await one('SELECT COUNT(*) AS n FROM users WHERE banned = 1'),
    boards: await one('SELECT COUNT(*) AS n FROM boards'),
    threads: await one('SELECT COUNT(*) AS n FROM threads WHERE deleted = 0'),
    posts: await one('SELECT COUNT(*) AS n FROM posts WHERE deleted = 0'),
    deleted_threads: await one('SELECT COUNT(*) AS n FROM threads WHERE deleted = 1'),
    today_posts: await one('SELECT COUNT(*) AS n FROM posts WHERE created_at >= ?', [startOfDay.toISOString()]),
    db: db.kind,
  };

  const users = await db.all(
    `SELECT u.*,
            (SELECT COUNT(*) FROM threads t WHERE t.author_id = u.id AND t.deleted = 0) AS thread_count,
            (SELECT COUNT(*) FROM posts p WHERE p.author_id = u.id AND p.deleted = 0) AS post_count
       FROM users u ORDER BY u.id ASC`
  );

  return { stats, users };
}

export async function adminThreads(db, { page, size, offset }) {
  const rows = await db.all(
    `SELECT t.*, b.slug AS board_slug, b.name AS board_name
       FROM threads t JOIN boards b ON b.id = t.board_id
      ORDER BY t.id DESC LIMIT ? OFFSET ?`,
    [size, offset]
  );
  const total = (await db.first('SELECT COUNT(*) AS n FROM threads')).n;
  return { rows, total };
}

/* ------------------------------ 消息通知 ------------------------------ */

export async function listNotifications(db, userId, { size, offset }) {
  const total = (await db.first('SELECT COUNT(*) AS n FROM notifications WHERE user_id = ?', [userId])).n;
  const rows = await db.all(
    'SELECT * FROM notifications WHERE user_id = ? ORDER BY id DESC LIMIT ? OFFSET ?',
    [userId, size, offset]
  );
  return { rows, total };
}

export const unreadNotificationCount = async (db, userId) =>
  (await db.first('SELECT COUNT(*) AS n FROM notifications WHERE user_id = ? AND read = 0', [userId])).n;

/** 传 ids 只标记这些；不传则全部标为已读 */
export const markNotificationsRead = (db, userId, ids) => {
  if (ids && ids.length) {
    return db.run(
      `UPDATE notifications SET read = 1 WHERE user_id = ? AND id IN (${ids.map(() => '?').join(',')})`,
      [userId, ...ids]
    );
  }
  return db.run('UPDATE notifications SET read = 1 WHERE user_id = ? AND read = 0', [userId]);
};

export const deleteNotification = (db, userId, id) =>
  db.run('DELETE FROM notifications WHERE user_id = ? AND id = ?', [userId, id]);

/* -------------------------------- 版主 -------------------------------- */

export const isModerator = async (db, userId, boardId) =>
  !!(await db.first('SELECT 1 AS x FROM board_moderators WHERE user_id = ? AND board_id = ?', [userId, boardId]));

export const boardModerators = (db, boardId) =>
  db.all(
    `SELECT u.id, u.username, u.avatar, m.created_at
       FROM board_moderators m JOIN users u ON u.id = m.user_id
      WHERE m.board_id = ? ORDER BY m.created_at ASC, u.id ASC`,
    [boardId]
  );

/** 判断某人能否管理这个板块（管理员或该板块版主） */
export async function canModerateBoard(db, actor, boardId) {
  if (!actor || actor.type !== 'user') return false;
  if (actor.role === 'admin') return true;
  return isModerator(db, actor.id, boardId);
}

export const addModerator = (db, boardId, userId) =>
  db.run('INSERT OR IGNORE INTO board_moderators (board_id, user_id, created_at) VALUES (?, ?, ?)', [
    boardId,
    userId,
    now(),
  ]);

export const removeModerator = (db, boardId, userId) =>
  db.run('DELETE FROM board_moderators WHERE board_id = ? AND user_id = ?', [boardId, userId]);

export const moderatedBoards = (db, userId) =>
  db.all(
    `SELECT b.id, b.slug, b.name FROM board_moderators m JOIN boards b ON b.id = m.board_id
      WHERE m.user_id = ? ORDER BY b.id ASC`,
    [userId]
  );

export const moderatedBoardIds = async (db, userId) =>
  (await db.all('SELECT board_id FROM board_moderators WHERE user_id = ?', [userId])).map((r) => r.board_id);

/* -------------------------------- 举报 -------------------------------- */

/** 同一身份对同一目标只保留一条未处理的举报 */
export async function createReport(db, report) {
  const dup = await db.first(
    "SELECT id FROM reports WHERE reporter_key = ? AND target_type = ? AND target_id = ? AND status = 'open'",
    [report.reporterKey, report.targetType, report.targetId]
  );
  if (dup) return { duplicate: true, id: dup.id };
  const res = await db.run(
    `INSERT INTO reports (target_type, target_id, thread_id, board_id, reporter_key, reporter_name,
                          reason, detail, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      report.targetType,
      report.targetId,
      report.threadId ?? null,
      report.boardId ?? null,
      report.reporterKey,
      report.reporterName,
      report.reason,
      report.detail ?? '',
      now(),
    ]
  );
  return { duplicate: false, id: res.lastInsertRowid };
}

/** boardIds 传 null = 管理员看全部；传数组 = 只看这些板块 */
export async function listReports(db, { status = 'open', boardIds = null, size = 20, offset = 0 }) {
  const where = [];
  const params = [];
  if (status && status !== 'all') {
    where.push('r.status = ?');
    params.push(status);
  }
  if (Array.isArray(boardIds)) {
    if (!boardIds.length) return { rows: [], total: 0 };
    where.push(`r.board_id IN (${boardIds.map(() => '?').join(',')})`);
    params.push(...boardIds);
  }
  const clause = where.length ? `WHERE ${where.join(' AND ')}` : '';

  const total = (await db.first(`SELECT COUNT(*) AS n FROM reports r ${clause}`, params)).n;
  const rows = await db.all(
    `SELECT r.*, b.name AS board_name, b.slug AS board_slug, t.title AS thread_title, t.deleted AS thread_deleted,
            (SELECT substr(p.content, 1, 200) FROM posts p WHERE p.id = r.target_id AND r.target_type = 'post') AS target_excerpt,
            (SELECT p.floor_no FROM posts p WHERE p.id = r.target_id AND r.target_type = 'post') AS target_floor,
            (SELECT p.deleted FROM posts p WHERE p.id = r.target_id AND r.target_type = 'post') AS target_deleted
       FROM reports r
       LEFT JOIN boards b ON b.id = r.board_id
       LEFT JOIN threads t ON t.id = r.thread_id
      ${clause}
      ORDER BY r.id DESC LIMIT ? OFFSET ?`,
    [...params, size, offset]
  );
  return { rows, total };
}

export const handleReport = (db, id, status, handledBy) =>
  db.run('UPDATE reports SET status = ?, handled_by = ?, handled_at = ? WHERE id = ?', [
    status,
    handledBy,
    now(),
    id,
  ]);

export async function openReportCount(db, boardIds = null) {
  if (Array.isArray(boardIds)) {
    if (!boardIds.length) return 0;
    return (
      await db.first(
        `SELECT COUNT(*) AS n FROM reports WHERE status = 'open' AND board_id IN (${boardIds
          .map(() => '?')
          .join(',')})`,
        boardIds
      )
    ).n;
  }
  return (await db.first("SELECT COUNT(*) AS n FROM reports WHERE status = 'open'")).n;
}

/* ------------------------------ 个人主页 ------------------------------ */

/** 用户资料 + 统计（发帖数 / 回帖数 / 获赞数 / 最后活跃） */
export async function userProfile(db, id) {
  const user = await db.first('SELECT * FROM users WHERE id = ?', [Number(id)]);
  if (!user) return null;
  const one = async (sql, params = []) => (await db.first(sql, params)).n;
  const visible =
    'JOIN boards b ON b.id = t.board_id AND b.deleted = 0 WHERE t.deleted = 0 AND t.author_id = ?';
  const visiblePosts =
    'JOIN threads t ON t.id = p.thread_id JOIN boards b ON b.id = t.board_id AND b.deleted = 0 ' +
    'WHERE p.deleted = 0 AND t.deleted = 0 AND p.author_id = ?';
  return {
    user,
    stats: {
      thread_count: await one(`SELECT COUNT(*) AS n FROM threads t ${visible}`, [user.id]),
      post_count: await one(`SELECT COUNT(*) AS n FROM posts p ${visiblePosts}`, [user.id]),
      like_count: await one(`SELECT COALESCE(SUM(p.likes), 0) AS n FROM posts p ${visiblePosts}`, [user.id]),
      last_active_at:
        (await db.first('SELECT MAX(created_at) AS t FROM posts WHERE author_id = ? AND deleted = 0', [
          user.id,
        ]))?.t ?? null,
    },
  };
}

/** 某人发过的主题帖（分页） */
export async function userThreads(db, userId, { size, offset }) {
  const where = 't.author_id = ? AND t.deleted = 0 AND b.deleted = 0';
  const total = (
    await db.first(`SELECT COUNT(*) AS n FROM threads t JOIN boards b ON b.id = t.board_id WHERE ${where}`, [userId])
  ).n;
  const rows = await db.all(
    `SELECT t.*, b.slug AS board_slug, b.name AS board_name,
            (SELECT substr(p.content, 1, 160) FROM posts p WHERE p.thread_id = t.id AND p.floor_no = 1) AS excerpt
       FROM threads t JOIN boards b ON b.id = t.board_id
      WHERE ${where}
      ORDER BY t.id DESC LIMIT ? OFFSET ?`,
    [userId, size, offset]
  );
  return { rows, total };
}

/** 某人回复过的楼层（分页） */
export async function userPosts(db, userId, { size, offset }) {
  const where = 'p.author_id = ? AND p.deleted = 0 AND t.deleted = 0 AND b.deleted = 0';
  const total = (
    await db.first(
      `SELECT COUNT(*) AS n FROM posts p JOIN threads t ON t.id = p.thread_id
         JOIN boards b ON b.id = t.board_id WHERE ${where}`,
      [userId]
    )
  ).n;
  const rows = await db.all(
    `SELECT p.id, p.thread_id, p.floor_no, p.parent_id, p.created_at, p.likes,
            substr(p.content, 1, 200) AS snippet, t.title, b.slug AS board_slug, b.name AS board_name
       FROM posts p JOIN threads t ON t.id = p.thread_id JOIN boards b ON b.id = t.board_id
      WHERE ${where}
      ORDER BY p.id DESC LIMIT ? OFFSET ?`,
    [userId, size, offset]
  );
  return { rows, total };
}

/** 更新个人资料（签名 / 头像） */
export async function updateProfile(db, id, { bio, avatar }) {
  const sets = [];
  const params = [];
  if (bio != null) {
    sets.push('bio = ?');
    params.push(bio);
  }
  if (avatar != null) {
    sets.push('avatar = ?');
    params.push(avatar);
  }
  if (!sets.length) return;
  await db.run(`UPDATE users SET ${sets.join(', ')} WHERE id = ?`, [...params, id]);
}

/* ------------------------------ 我的发言 ------------------------------ */

export async function myContent(db, actorKey) {
  const threads = await db.all(
    `SELECT t.id, t.title, t.created_at, b.slug AS board_slug, b.name AS board_name
       FROM threads t JOIN boards b ON b.id = t.board_id AND b.deleted = 0
      WHERE t.actor_key = ? AND t.deleted = 0
      ORDER BY t.id DESC LIMIT 50`,
    [actorKey]
  );
  const posts = await db.all(
    `SELECT p.id, p.thread_id, p.floor_no, p.created_at, t.title
       FROM posts p JOIN threads t ON t.id = p.thread_id
      WHERE p.actor_key = ? AND p.deleted = 0
      ORDER BY p.id DESC LIMIT 50`,
    [actorKey]
  );
  return { threads, posts };
}

/* -------------------------------- 初始化 ------------------------------ */

let bootstrapped = false;

/** 数据结构版本：以后加表/加列时把这个数字 +1，老库会自动重新走一遍升级 */
export const SCHEMA_VERSION = '4';

/** 把建表 SQL 拆成单条语句（D1 的 exec 不支持多行 DDL，batch 才可靠） */
export const splitStatements = (sql) =>
  String(sql)
    .split(';')
    .map((s) => s.trim())
    .filter((s) => s.length > 0);

/**
 * 建表 + 迁移 + 初始数据。幂等。
 *
 * 性能考虑：Worker 实例会被频繁重建，而这里的检查原先每次冷启动要串行跑 7 次
 * 数据库往返（查表、查列、查数量），是所有接口"第一次访问特别慢"的元凶。
 * 现在改成：先用一次查询读 meta.ready —— 命中就直接返回，什么都不做。
 */
export async function ensureReady(db, { schemaSql, log = () => {} }) {
  if (bootstrapped) return;

  // ---- 快路径：一次查询确认已初始化过 ----
  try {
    const row = await db.first("SELECT value FROM meta WHERE key = 'ready'");
    if (row?.value === SCHEMA_VERSION) {
      bootstrapped = true;
      return;
    }
  } catch {
    // meta 表还不存在（全新库或老库），走下面的完整初始化
  }

  // ---- 完整初始化（只在第一次访问 / 版本升级时执行）----
  const table = await db.first("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'users'");
  const statements = splitStatements(schemaSql).map((sql) => ({ sql }));
  // 建表语句全是 IF NOT EXISTS，重复执行是安全的
  for (let i = 0; i < statements.length; i += 20) {
    await db.batch(statements.slice(i, i + 20));
  }
  if (!table) log('已创建数据表');

  // 轻量迁移：老版本数据库缺的列在这里补上
  const migrations = [
    ['boards', 'deleted', 'ALTER TABLE boards ADD COLUMN deleted INTEGER NOT NULL DEFAULT 0'],
    ['users', 'bio', "ALTER TABLE users ADD COLUMN bio TEXT NOT NULL DEFAULT ''"],
    ['users', 'avatar', "ALTER TABLE users ADD COLUMN avatar TEXT NOT NULL DEFAULT ''"],
  ];
  for (const [tbl, col, ddl] of migrations) {
    const has = await db.first(`SELECT COUNT(*) AS n FROM pragma_table_info('${tbl}') WHERE name = ?`, [col]);
    if (!has?.n) {
      await db.run(ddl);
      log(`已升级数据表：${tbl}.${col}`);
    }
  }

  // 初始管理员
  if ((await countUsers(db)) === 0) {
    const hash = await hashPassword('admin123');
    await createUser(db, { username: 'admin', passwordHash: hash, role: 'admin', defaultPw: 1 });
    log('已创建默认管理员账号：admin / admin123（请尽快修改密码）');
  }

  // 示例板块
  const boardCount = (await db.first('SELECT COUNT(*) AS n FROM boards')).n;
  if (boardCount === 0) {
    await db.batch([
      {
        sql: 'INSERT INTO boards (slug, name, description, owner_name, created_at) VALUES (?, ?, ?, ?, ?)',
        params: ['general', '综合讨论区', '什么都能聊，先来这里打个招呼吧。', '系统', now()],
      },
      {
        sql: 'INSERT INTO boards (slug, name, description, owner_name, created_at) VALUES (?, ?, ?, ?, ?)',
        params: ['tech', '技术交流', '编程、工具、踩坑与折腾记录。', '系统', now()],
      },
      {
        sql: 'INSERT INTO boards (slug, name, description, owner_name, created_at) VALUES (?, ?, ?, ?, ?)',
        params: ['feedback', '站务与反馈', '对新板块、新功能的建议和问题反馈。', '系统', now()],
      },
    ]);
    log('已初始化 3 个示例板块');
  }

  // 记下版本号，下次冷启动一次查询就过
  await db.run("INSERT OR REPLACE INTO meta (key, value) VALUES ('ready', ?)", [SCHEMA_VERSION]);
  bootstrapped = true;
}
