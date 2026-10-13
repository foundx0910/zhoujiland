/**
 * 功能验收：个人中心 / 消息通知 / 版主 / 举报 / 公告
 *
 *   npm run verify:features                 # 跑本地 http://127.0.0.1:3000
 *   node scripts/verify-features.mjs https://zhoujiland.dpdns.org
 *
 * 前置：数据库里要有默认管理员（npm run reset-db && npm run demo，或线上本来就有的 admin）。
 */
const BASE = process.argv[2] || process.env.FORUM_BASE || 'http://127.0.0.1:3000';

let pass = 0;
let failed = 0;
const results = [];

function check(name, ok, extra = '') {
  if (ok) {
    pass++;
    results.push(`  ✅ ${name}${extra ? ` — ${extra}` : ''}`);
  } else {
    failed++;
    results.push(`  ❌ ${name}${extra ? ` — ${extra}` : ''}`);
  }
}

/** 带 cookie 罐的会话 */
function session() {
  const jar = new Map();
  return async (method, path, body) => {
    const headers = {};
    if (jar.size) headers.cookie = [...jar.entries()].map(([k, v]) => `${k}=${v}`).join('; ');
    let payload;
    if (body !== undefined) {
      headers['content-type'] = 'application/json';
      payload = JSON.stringify(body);
    }
    const res = await fetch(BASE + path, { method, headers, body: payload, redirect: 'manual' });
    for (const c of res.headers.getSetCookie?.() ?? []) {
      const [pair] = c.split(';');
      const i = pair.indexOf('=');
      jar.set(pair.slice(0, i).trim(), pair.slice(i + 1).trim());
    }
    const text = await res.text();
    let json = null;
    try {
      json = text ? JSON.parse(text) : null;
    } catch {
      json = { raw: text.slice(0, 120) };
    }
    return { status: res.status, body: json };
  };
}

const mk = () => {
  const s = session();
  return {
    get: (p) => s('GET', p),
    post: (p, b) => s('POST', p, b),
    patch: (p, b) => s('PATCH', p, b),
    del: (p) => s('DELETE', p),
  };
};

const stamp = Date.now().toString().slice(-5);
const uA = mk();
const uB = mk();
const uC = mk();
const adm = mk();

for (const [u, n] of [
  [uA, 'jia'],
  [uB, 'yi'],
  [uC, 'bing'],
]) {
  await u.post('/api/auth/register', { username: `${n}${stamp}`, password: 'secret123' });
}
const adminLogin = await adm.post('/api/auth/login', { username: 'admin', password: 'admin123' });
if (adminLogin.status !== 200) {
  console.error(
    '\n❌ 无法用 admin / admin123 登录。先跑 `npm run reset-db && npm run demo` 造出默认管理员，' +
      '或确认没有别的套件把管理员密码改掉了（verify:core 结束时会还原）。\n',
  );
  process.exit(1);
}

const meA = await uA.get('/api/auth/me');
const meB = await uB.get('/api/auth/me');
const idB = meB.body?.user?.id;

/* ============================ 个人中心 ============================ */
{
  const anon = session();
  check('未登录改资料被拦（401）', (await anon('PATCH', '/api/auth/profile', { bio: 'x' })).status === 401);

  const ok = await uA.patch('/api/auth/profile', { bio: '折腾使人快乐' });
  check('登录后可以改个性签名', ok.status === 200);
  check('签名能在 /me 里读回', (await uA.get('/api/auth/me')).body?.user?.bio === '折腾使人快乐');

  check('外链头像被拒（400）', (await uA.patch('/api/auth/profile', { avatar: 'https://evil.com/a.png' })).status === 400);
  const localAvatar = await uA.patch('/api/auth/profile', { avatar: '/uploads/abc123.jpeg' });
  check('站内上传的头像可以通过', localAvatar.status === 200);

  const idA = meA.body?.user?.id;
  const pub = await uB.get(`/api/users/${idA}`);
  check('公开个人主页可读（资料 + 统计）', pub.status === 200 && pub.body?.user?.username?.startsWith('jia'));
  check('个人主页带分页内容', !!pub.body?.pagination && Array.isArray(pub.body?.items), `tab=${pub.body?.tab}`);
  check('个人主页能切到回复标签', (await uB.get(`/api/users/${idA}?tab=posts`)).body?.tab === 'posts');
  check('不存在的用户 404', (await uB.get('/api/users/999999')).status === 404);
}

/* ============================ 消息通知 ============================ */
{
  const t = await uA.post('/api/boards/general/threads', {
    title: `通知测试帖 ${stamp}`,
    content: '我是楼主，来聊聊。',
  });
  const tid = t.body.id;
  const firstFloor = (await uA.get(`/api/threads/${tid}`)).body.floors[0];

  const r1 = await uB.post(`/api/threads/${tid}/posts`, { content: '路过看看' });
  check('乙回复主题帖成功', r1.status === 201);
  check('甲回复乙的楼层成功', (await uA.post(`/api/threads/${tid}/posts`, { content: '欢迎欢迎', parentId: r1.body.post.id })).status === 201);
  await uB.post(`/api/threads/${tid}/like`, { postId: firstFloor.id });
  await uC.post(`/api/threads/${tid}/posts`, { content: `@jia${stamp} 你好呀` });

  const nA = await uA.get('/api/notifications');
  const types = (nA.body?.items ?? []).map((i) => i.type);
  check('能读到通知列表', nA.status === 200 && types.length > 0, `共 ${types.length} 条`);
  check('收到「帖子里有人回复」通知', types.includes('thread_reply'));
  check('收到「被点赞」通知', types.includes('like'));
  check('收到「被 @」通知', types.includes('mention'));
  check('未读数是数字', typeof nA.body?.unread === 'number' && nA.body.unread > 0, `未读 ${nA.body?.unread}`);

  const nB = await uB.get('/api/notifications');
  check('乙收到「楼层被回复」通知', (nB.body?.items ?? []).some((i) => i.type === 'reply'));
  check('未登录看不到通知（401）', (await session()('GET', '/api/notifications')).status === 401);

  const read = await uA.post('/api/notifications/read', {});
  check('可以一键标记已读', read.status === 200 && read.body?.unread === 0);
}

/* ============================== 版主 ============================== */
{
  const t = await uA.post('/api/boards/general/threads', { title: `版主测试帖 ${stamp}`, content: '测试用' });
  const tid = t.body.id;
  const board = (await uA.get('/api/boards/general')).body.board;

  check('普通用户不能置顶（403）', (await uB.patch(`/api/threads/${tid}`, { pinned: true })).status === 403);
  check('板块信息带版主字段', Array.isArray(board.moderators) && board.can_moderate === false);

  const add = await adm.post(`/api/admin/boards/${board.id}/moderators`, { action: 'add', userId: idB });
  check('管理员可以任命版主', add.status === 200 && add.body.moderators.some((m) => m.id === idB));
  check('版主在自己的板块 can_moderate = true', (await uB.get('/api/boards/general')).body.board.can_moderate === true);

  check('版主可以置顶本板块帖子', (await uB.patch(`/api/threads/${tid}`, { pinned: true })).status === 200);
  check('版主可以锁定本板块帖子', (await uB.patch(`/api/threads/${tid}`, { locked: true })).status === 200);
  await uB.patch(`/api/threads/${tid}`, { pinned: false, locked: false });

  await uA.post(`/api/threads/${tid}/posts`, { content: '垫一层，用来测试版主删楼' });
  const floors = (await uA.get(`/api/threads/${tid}`)).body.floors;
  const target = floors[floors.length - 1];
  check('版主可以删除本板块楼层', (await uB.del(`/api/posts/${target.id}`)).status === 200);

  const tech = await uA.post('/api/boards/tech/threads', { title: `跨板块测试 ${stamp}`, content: '技术区的帖子' });
  check('版主管不了别的板块（置顶 403）', (await uB.patch(`/api/threads/${tech.body.id}`, { pinned: true })).status === 403);
  check('版主删不掉别的板块的帖子（403）', (await uB.del(`/api/threads/${tech.body.id}`)).status === 403);
  check('版主能看本板块举报队列', (await uB.get('/api/reports')).body?.scope === 'mine');

  const remove = await adm.post(`/api/admin/boards/${board.id}/moderators`, { action: 'remove', userId: idB });
  check('管理员可以撤销版主', remove.status === 200 && !remove.body.moderators.some((m) => m.id === idB));
  check('撤销后不再有权限（403）', (await uB.patch(`/api/threads/${tid}`, { pinned: true })).status === 403);
}

/* ============================== 举报 ============================== */
{
  const t = await uA.post('/api/boards/general/threads', { title: `举报测试帖 ${stamp}`, content: '待举报内容' });
  const post = (await uA.get(`/api/threads/${t.body.id}`)).body.floors[0];

  const rep = await uB.post('/api/reports', { targetType: 'post', targetId: post.id, reason: '广告 / 推广', detail: '看着像广告' });
  check('可以举报楼层', rep.status === 201, `#${rep.body?.id}`);
  check('重复举报被拦（409）', (await uB.post('/api/reports', { targetType: 'post', targetId: post.id, reason: '广告 / 推广' })).status === 409);
  check('不填原因被拒（400）', (await uB.post('/api/reports', { targetType: 'post', targetId: post.id, reason: '' })).status === 400);
  check('举报不存在的楼层 404', (await uB.post('/api/reports', { targetType: 'post', targetId: 99999999, reason: '其他' })).status === 404);
  check('普通用户看不到处理队列（403）', (await uB.get('/api/reports')).status === 403);

  const guest = session();
  await guest('POST', '/api/auth/guest', { name: `路人${stamp}` });
  check('匿名访客也能举报', (await guest('POST', '/api/reports', { targetType: 'post', targetId: post.id, reason: '垃圾刷屏' })).status === 201);

  const queue = await adm.get('/api/reports');
  const queueItems = queue.body?.items ?? [];
  check('管理员能看到举报队列', queue.status === 200 && queueItems.length >= 2, `待处理 ${queue.body?.counts?.open}`);
  check('队列带目标内容与板块', !!queueItems[0]?.board_name && 'target_excerpt' in queueItems[0]);
  check('管理员可以处理举报', (await adm.post(`/api/reports/${rep.body.id}`, { action: 'resolve' })).status === 200);
}

/* ============================== 公告 ============================== */
{
  check('公告列表可读（公开）', (await session()('GET', '/api/announcements')).status === 200);

  const created = await adm.post('/api/announcements', {
    title: `维护通知 ${stamp}`,
    content: '**今晚 23:00** 维护。',
    level: 'important',
    linkUrl: 'https://example.com/notice',
    linkText: '详情',
    active: true,
    sort: 5,
  });
  check('管理员可以发布公告', created.status === 201 && created.body.id > 0, `#${created.body?.id}`);
  const annoId = created.body.id;

  const pub = await uA.get('/api/announcements');
  const item = (pub.body?.items ?? []).find((a) => a.id === annoId);
  check('前台能看到生效中的公告', !!item);
  check('公告字段完整（级别/链接/时间）', !!item && item.level === 'important' && item.link_url === 'https://example.com/notice' && !!item.updated_at);

  check('普通用户不能发公告（403）', (await uB.post('/api/announcements', { title: '我不是管理员' })).status === 403);
  check('未登录不能发公告（401）', (await session()('POST', '/api/announcements', { title: '匿名也想发' })).status === 401);
  check('标题太短被拒（400）', (await adm.post('/api/announcements', { title: 'x' })).status === 400);
  check('非法级别被拒（400）', (await adm.post('/api/announcements', { title: '测试公告', level: 'hacker' })).status === 400);
  check('危险链接被拒（400）', (await adm.post('/api/announcements', { title: '测试公告', linkUrl: 'javascript:alert(1)' })).status === 400);

  check('管理员可以下架公告', (await adm.patch(`/api/announcements/${annoId}`, { active: false })).status === 200);
  check('下架后前台不再显示', !((await uA.get('/api/announcements')).body?.items ?? []).some((a) => a.id === annoId));
  check('历史页仍能回看已下架', ((await uA.get('/api/announcements?history=1')).body?.items ?? []).some((a) => a.id === annoId && a.active === 0));

  check('编辑公告成功', (await adm.patch(`/api/announcements/${annoId}`, { title: `维护通知（改）${stamp}`, active: true })).status === 200);
  check('改完重新上架立刻可见', ((await uA.get('/api/announcements')).body?.items ?? []).some((a) => a.title === `维护通知（改）${stamp}`));

  check('后台能看全部公告', ((await adm.get('/api/announcements/all')).body?.items ?? []).length >= 1);
  check('普通用户看不到后台列表（403）', (await uB.get('/api/announcements/all')).status === 403);
  check('编辑不存在的公告 404', (await adm.patch('/api/announcements/999999', { active: false })).status === 404);
  check('管理员可以删除公告', (await adm.del(`/api/announcements/${annoId}`)).status === 200);
  check('删除后列表里没有了', !((await adm.get('/api/announcements/all')).body?.items ?? []).some((a) => a.id === annoId));
}

console.log(results.join('\n'));
console.log(`\n功能验收结果：${pass} 通过 / ${failed} 失败\n`);
process.exit(failed ? 1 : 0);
