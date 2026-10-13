/**
 * 消息通知：谁触发了什么，通知给谁。
 *
 * 规则：
 *   - 只通知注册用户（游客没有账号，收不到）
 *   - 自己操作自己不发通知
 *   - 同一次操作里，同一个人只收一条（比如既被回复又被 @ 时，只算回复那条）
 */
import { now } from './store.js';

const USERNAME_RE = /@([\w\u4e00-\u9fa5.-]{2,20})/g;

/** 把 Markdown 正文压成一句话摘要，用于通知列表 */
export function excerptOf(text, len = 80) {
  const s = String(text ?? '')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, '[图片]')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/[#>*`_~]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  return s.length > len ? `${s.slice(0, len)}…` : s;
}

/** 提取正文里的 @某人 */
export function extractMentions(text) {
  const out = new Set();
  let m;
  const re = new RegExp(USERNAME_RE.source, 'g');
  while ((m = re.exec(String(text ?? '')))) out.add(m[1]);
  return [...out];
}

/** 写一条通知（内部函数，已做去重与自我保护） */
async function insert(db, { userId, type, actorName, actorUserId, threadId, postId, boardSlug, title, excerpt }) {
  if (!userId) return;
  if (actorUserId && Number(actorUserId) === Number(userId)) return;
  await db.run(
    `INSERT INTO notifications (user_id, type, actor_name, thread_id, post_id, board_slug, title, excerpt, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      userId,
      type,
      actorName ?? '',
      threadId ?? null,
      postId ?? null,
      boardSlug ?? '',
      title ?? '',
      excerpt ?? '',
      now(),
    ]
  );
}

/**
 * 一次发帖/回帖引发的全部通知。
 * targets: [{ userId, type }]  —— 按优先级排好，同一个人只取第一条
 */
export async function notifyAboutPost(db, { targets = [], content, actorName, actorUserId, threadId, postId, boardSlug, title }) {
  const excerpt = excerptOf(content);
  const done = new Set();

  // 先处理 @提及：它比「你帖子里有人回复」更具体，优先级更高
  for (const name of extractMentions(content)) {
    const u = await db.first('SELECT id, banned FROM users WHERE username = ?', [name]);
    if (!u || u.banned || done.has(Number(u.id))) continue;
    if (actorUserId && Number(actorUserId) === Number(u.id)) continue;
    done.add(Number(u.id));
    await insert(db, {
      userId: u.id,
      type: 'mention',
      actorName,
      actorUserId,
      threadId,
      postId,
      boardSlug,
      title,
      excerpt,
    });
  }

  // 再处理回复类通知：同一个人已经因为 @ 收到过就不再重复打扰
  for (const t of targets) {
    if (!t?.userId || done.has(Number(t.userId))) continue;
    done.add(Number(t.userId));
    await insert(db, {
      userId: t.userId,
      type: t.type,
      actorName,
      actorUserId,
      threadId,
      postId,
      boardSlug,
      title,
      excerpt,
    });
  }
}

/** 点赞通知（只在点赞时发，取消点赞不发） */
export async function notifyLike(db, { userId, actorName, actorUserId, threadId, postId, boardSlug, title, content }) {
  await insert(db, {
    userId,
    type: 'like',
    actorName,
    actorUserId,
    threadId,
    postId,
    boardSlug,
    title,
    excerpt: excerptOf(content),
  });
}
