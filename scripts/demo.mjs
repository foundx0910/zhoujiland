/**
 * 可选：灌入一批演示数据（新板块、多楼层、楼中楼、点赞）。
 * 用法：npm run demo —— 会走与线上完全相同的 core/store 代码路径。
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';

import { createNodeDb } from '../core/adapters.js';
import { SCHEMA_SQL } from '../core/schema.js';
import { hashPassword } from '../core/password.js';
import { actorKeyOf } from '../core/auth.js';
import * as store from '../core/store.js';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const DATA_DIR = process.env.FORUM_DATA_DIR || path.join(ROOT, 'data');
fs.mkdirSync(DATA_DIR, { recursive: true });

const db = createNodeDb(DatabaseSync, path.join(DATA_DIR, 'forum.db'));
await store.ensureReady(db, { schemaSql: SCHEMA_SQL, log: (m) => console.log(`[forum] ${m}`) });

async function ensureUser(username, password, role = 'user') {
  const found = await store.findUserByName(db, username);
  if (found) return found;
  return store.createUser(db, { username, passwordHash: await hashPassword(password), role });
}

async function ensureBoard(name, description, owner) {
  const existing = await db.first('SELECT * FROM boards WHERE name = ?', [name]);
  if (existing) return existing;
  const slugBase = /^[\w-]+$/.test(name) ? name.toLowerCase() : `board-${Math.random().toString(16).slice(2, 6)}`;
  return store.createBoard(db, {
    slug: slugBase,
    name,
    description,
    ownerId: owner?.id ?? null,
    ownerName: owner?.username ?? '系统',
  });
}

/** floors: [{ author, content, likes?, quoteFloor? }] —— 第一层是楼主 */
async function ensureThread(board, title, floors, { pinned = false, views = 0 } = {}) {
  const existing = await db.first('SELECT id FROM threads WHERE title = ? AND board_id = ?', [title, board.id]);
  if (existing) return existing.id;

  const op = floors[0].author;
  const opActor = { type: 'user', id: op.id, name: op.username };
  const { threadId } = await store.createThread(db, board, opActor, actorKeyOf(opActor), {
    title,
    content: floors[0].content,
  });

  const floorIds = { 1: await db.first('SELECT id FROM posts WHERE thread_id = ? AND floor_no = 1', [threadId]).then((r) => r.id) };
  const created = [floorIds[1]];

  for (const floor of floors.slice(1)) {
    const actor = { type: 'user', id: floor.author.id, name: floor.author.username };
    const key = actorKeyOf(actor);
    if (floor.quoteFloor) {
      const parentId = floorIds[floor.quoteFloor];
      const parent = await store.getPost(db, parentId);
      const { postId } = await store.createSubReply(
        db,
        { id: threadId },
        parent,
        { floor_no: parent.floor_no, author: parent.author_name },
        actor,
        key,
        floor.content
      );
      created.push(postId);
      if (floor.likes) await db.run('UPDATE posts SET likes = ? WHERE id = ?', [floor.likes, postId]);
    } else {
      const { postId, floorNo } = await store.createFloor(db, { id: threadId }, actor, key, floor.content);
      const no = floorNo ?? (await store.floorNoOf(db, postId));
      floorIds[no] = postId;
      created.push(postId);
      if (floor.likes) await db.run('UPDATE posts SET likes = ? WHERE id = ?', [floor.likes, postId]);
    }
  }

  await db.run('UPDATE threads SET pinned = ?, views = ? WHERE id = ?', [pinned ? 1 : 0, views, threadId]);
  return { threadId, created };
}

const xiaoming = await ensureUser('小明', 'demo1234');
const aqiang = await ensureUser('阿强', 'demo1234');
const lihua = await ensureUser('李华', 'demo1234');

/* 给演示账号写点个性签名，个人主页看起来更像样 */
const bios = {
  小明: '折腾使人快乐，白天写 bug，晚上修 bug。',
  阿强: '技术宅 / 摄影爱好者，楼下的猫是我的模特。',
  李华: '先潜水，再冒泡。',
};
for (const [name, bio] of Object.entries(bios)) {
  await db.run("UPDATE users SET bio = ? WHERE username = ? AND (bio IS NULL OR bio = '')", [bio, name]);
}

const general = await ensureBoard('综合讨论区', '什么都能聊，先来这里打个招呼吧。', null);
const tech = await ensureBoard('技术交流', '编程、工具、踩坑与折腾记录。', null);
const photo = await ensureBoard('摄影交流', '器材、构图、后期，随手拍也欢迎。', xiaoming);

const t1 = await ensureThread(
  general,
  '论坛第一帖：来报个到吧，说说你从哪来',
  [
    { author: xiaoming, content: '欢迎来到**楼层论坛**！\n\n这里是 1 楼（楼主），下面的每一层都可以单独回复，也可以点「回复本层」在楼里继续聊。', likes: 3 },
    { author: aqiang, content: '2 楼打卡 🙋 这个楼层编号看着很舒服。', likes: 1 },
    { author: lihua, content: '借个楼问一句：支持 Markdown 吗？' },
    { author: xiaoming, content: '支持的，`**加粗**`、列表、代码块、图片都行。', quoteFloor: 3, likes: 2 },
    { author: aqiang, content: '楼中楼也能套，👆 像这样。', quoteFloor: 2, likes: 1 },
  ],
  { pinned: true, views: 128 }
);

const t2 = await ensureThread(
  tech,
  'SQLite 够用吗？聊聊本地优先的小论坛架构',
  [
    { author: aqiang, content: '我们的楼层论坛本地用 Node 24 自带的 `node:sqlite`，线上用 Cloudflare D1，业务代码完全共用一套。\n\n```js\nconst db = createNodeDb(DatabaseSync, "data/forum.db");\n```', likes: 4 },
    { author: lihua, content: '并发写会不会有问题？', likes: 0 },
    { author: aqiang, content: '单机用 `BEGIN IMMEDIATE` 包一层；D1 单库单线程，天然串行。楼层号都是 SQL 里原子生成，不会撞号。', quoteFloor: 2, likes: 2 },
  ],
  { views: 76 }
);

const t3 = await ensureThread(
  photo,
  '随手拍：楼下的猫（附参数）',
  [
    { author: xiaoming, content: 'f/2.0 · 1/250s · ISO 400，傍晚的散射光最柔和。', likes: 2 },
    { author: lihua, content: '这眼神绝了，收藏当壁纸。', likes: 1 },
  ],
  { views: 41 }
);

/* 把时间往前铺开，看起来像真实积累的帖子 */
const backdate = async (threadId, minutes) => {
  await db.run('UPDATE threads SET created_at = ?, last_reply_at = ? WHERE id = ?', [
    new Date(Date.now() - minutes * 60000).toISOString(),
    new Date(Date.now() - Math.max(1, minutes - 90) * 60000).toISOString(),
    threadId,
  ]);
  const posts = await db.all('SELECT id, floor_no FROM posts WHERE thread_id = ? ORDER BY id', [threadId]);
  for (const [i, p] of posts.entries()) {
    const ts = new Date(Date.now() - (minutes - i * 7) * 60000).toISOString();
    await db.run('UPDATE posts SET created_at = ?, updated_at = ? WHERE id = ?', [ts, ts, p.id]);
  }
};

await backdate(Number(t1.threadId ?? t1), 180);
await backdate(Number(t2.threadId ?? t2), 95);
await backdate(Number(t3.threadId ?? t3), 40);

console.log('[demo] 演示数据已写入。');
console.log('[demo] 演示账号：小明 / 阿强 / 李华，密码均为 demo1234');
console.log('[demo] 管理员账号：admin / admin123（请尽快修改密码）');
await db.close();
