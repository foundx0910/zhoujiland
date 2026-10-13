/** 端到端验收：用真实 HTTP 请求跑一遍全部核心功能 */
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

function session(label) {
  const jar = new Map();
  const cookieHeader = () => [...jar.entries()].map(([k, v]) => `${k}=${v}`).join('; ');
  const req = async (method, path, body, contentType) => {
    const headers = { cookie: cookieHeader() };
    let payload;
    if (body instanceof Uint8Array) {
      payload = body;
      if (contentType) headers['content-type'] = contentType;
    } else if (body !== undefined) {
      headers['content-type'] = 'application/json';
      payload = JSON.stringify(body);
    }
    const res = await fetch(BASE + path, { method, headers, body: payload, redirect: 'manual' });
    for (const c of res.headers.getSetCookie?.() ?? []) {
      const [pair] = c.split(';');
      const idx = pair.indexOf('=');
      const name = pair.slice(0, idx).trim();
      const value = pair.slice(idx + 1).trim();
      if (value === '' || /Expires=Thu, 01 Jan 1970/i.test(c)) jar.delete(name);
      else jar.set(name, value);
    }
    const text = await res.text();
    let json = null;
    try {
      json = text ? JSON.parse(text) : null;
    } catch {
      json = { raw: text.slice(0, 200) };
    }
    return { status: res.status, body: json, headers: res.headers };
  };
  return {
    label,
    get: (p) => req('GET', p),
    post: (p, b, ct) => req('POST', p, b, ct),
    patch: (p, b) => req('PATCH', p, b),
    del: (p) => req('DELETE', p),
    raw: req,
    jar,
  };
}

const stamp = Date.now().toString().slice(-6);

/* ------------------------- 1. 匿名访客开新板块 ------------------------- */
const guest = session('guest');
await guest.post('/api/auth/guest', { name: '游客' + stamp });
const boardName = '验收板块' + stamp;
const boardRes = await guest.post('/api/boards', { name: boardName, description: '端到端验收用' });
check('匿名访客设置昵称并可新建板块', boardRes.status === 201, `板块 ${boardRes.body?.board?.slug}`);
const slug = boardRes.body.board.slug;
const boardId = boardRes.body.board.id;

/* ------------------------- 2. 注册 / 登录 ------------------------- */
const alice = session('alice');
const regA = await alice.post('/api/auth/register', { username: 'alice' + stamp, password: 'secret123' });
check('注册新用户', regA.status === 201, regA.body?.user?.username);
const meA = await alice.get('/api/auth/me');
check('注册后自动登录（Cookie 会话）', meA.body?.actor?.type === 'user', meA.body?.actor?.name);

const bob = session('bob');
await bob.post('/api/auth/register', { username: 'bob' + stamp, password: 'secret123' });
check('第二个用户注册为普通用户', (await bob.get('/api/auth/me')).body?.user?.role === 'user');

const badLogin = await session('x').post('/api/auth/login', { username: 'alice' + stamp, password: 'wrong' });
check('错误密码登录被拒绝', badLogin.status === 401);

/* ------------------------- 3. 发帖（1 楼） ------------------------- */
const threadRes = await alice.post(`/api/boards/${slug}/threads`, {
  title: '验收帖：楼层与楼中楼',
  content: '这是 **1 楼**（楼主）。\n\n- 支持列表\n- 支持 `代码`',
});
check('登录用户发新帖', threadRes.status === 201, `thread ${threadRes.body?.id}`);
const tid = threadRes.body.id;

const detail0 = await alice.get(`/api/threads/${tid}`);
check('1 楼自动生成且标记为楼主', detail0.body.floors[0].floor_no === 1 && detail0.body.floors[0].author.is_op === true);

/* ------------------------- 4. 盖楼（楼层递增） ------------------------- */
const f2 = await bob.post(`/api/threads/${tid}/posts`, { content: '2 楼来自 bob' });
const f3 = await guest.post(`/api/threads/${tid}/posts`, { content: '3 楼来自游客' });
const f4 = await alice.post(`/api/threads/${tid}/posts`, { content: '4 楼来自 alice' });
check(
  '楼层号严格递增 2→3→4',
  f2.body.floor_no === 2 && f3.body.floor_no === 3 && f4.body.floor_no === 4,
  `${f2.body.floor_no}/${f3.body.floor_no}/${f4.body.floor_no}`
);

/* ------------------------- 5. 楼中楼 ------------------------- */
const sub1 = await alice.post(`/api/threads/${tid}/posts`, { content: '楼中楼：回复 2 楼', parentId: f2.body.post.id });
check(
  '楼中楼挂在主楼层下并带引用',
  sub1.body.post.parent_id === f2.body.post.id && sub1.body.post.quote?.floor_no === 2,
  `quote ${sub1.body.post.quote?.floor_no} 楼`
);
const sub2 = await bob.post(`/api/threads/${tid}/posts`, { content: '楼中楼里再回复', parentId: sub1.body.post.id });
check(
  '回复楼中楼时仍挂在主楼层、引用被回复者',
  sub2.body.post.parent_id === f2.body.post.id && sub2.body.post.quote?.author === `alice${stamp}`,
  `引用 @${sub2.body.post.quote?.author}`
);

const detail1 = await alice.get(`/api/threads/${tid}`);
const floor2 = detail1.body.floors.find((f) => f.floor_no === 2);
check('楼层详情正确嵌套 2 条楼中楼', floor2.replies.length === 2, `replies=${floor2.replies.length}`);
check('楼中楼不占用楼层号', detail1.body.pagination.total === 4, `总楼层=${detail1.body.pagination.total}`);

/* ------------------------- 6. 点赞 ------------------------- */
const like1 = await bob.post(`/api/threads/${tid}/like`, { postId: f4.body.post.id });
const like2 = await bob.post(`/api/threads/${tid}/like`, { postId: f4.body.post.id });
check('点赞可开关且计数正确', like1.body.liked === true && like1.body.likes === 1 && like2.body.liked === false && like2.body.likes === 0);

/* ------------------------- 7. 编辑 / 删除楼层 ------------------------- */
const edited = await alice.patch(`/api/posts/${f4.body.post.id}`, { content: '4 楼（已编辑）' });
const afterEdit = await alice.get(`/api/threads/${tid}`);
check(
  '作者可编辑自己的楼层',
  edited.status === 200 && afterEdit.body.floors.find((f) => f.floor_no === 4).content === '4 楼（已编辑）'
);

const forbidden = await bob.del(`/api/posts/${f4.body.post.id}`);
check('非作者删除他人楼层被拒绝（403）', forbidden.status === 403);

await alice.del(`/api/posts/${f4.body.post.id}`);
const afterDel = await alice.get(`/api/threads/${tid}`);
const delFloor = afterDel.body.floors.find((f) => f.floor_no === 4);
check('删除楼层后保留楼层号占位', !!delFloor && delFloor.deleted === true && delFloor.floor_no === 4);

/* ------------------------- 8. 分页 ------------------------- */
for (let i = 0; i < 18; i++) await bob.post(`/api/threads/${tid}/posts`, { content: `灌水第 ${i + 5} 层` });
const p1 = await alice.get(`/api/threads/${tid}?page=1&size=10`);
const p2 = await alice.get(`/api/threads/${tid}?page=2&size=10`);
check(
  '楼层分页正确',
  p1.body.floors.length === 10 && p2.body.floors.length > 0 && p1.body.pagination.pages === Math.ceil(p1.body.pagination.total / 10),
  `${p1.body.pagination.total} 层 / ${p1.body.pagination.pages} 页`
);

/* ------------------------- 9. 搜索 ------------------------- */
const search = await alice.get(`/api/search?q=${encodeURIComponent('验收帖')}`);
const searchFloor = await alice.get(`/api/search?q=${encodeURIComponent('灌水第 7 层')}`);
check('搜索命中帖子标题', search.body.threads.some((t) => t.id === tid));
check('搜索命中楼层正文', searchFloor.body.posts.length > 0, `${searchFloor.body.posts.length} 条楼层命中`);

/* ------------------------- 10. 图片上传 ------------------------- */
const png = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFAAH/q842iQAAAABJRU5ErkJggg==',
  'base64'
);
const up = await alice.post('/api/upload', new Uint8Array(png), 'image/png');
check('图片上传返回可访问 URL', up.status === 201 && up.body?.url?.startsWith('/uploads/'), up.body?.url);
const fetched = await alice.get(up.body.url);
check('上传的图片可通过 URL 访问', fetched.status === 200 && fetched.headers.get('content-type')?.includes('image/png'));

/* ------------------------- 11. 锁定与权限 ------------------------- */
const admin = session('admin');
const adminLogin = await admin.post('/api/auth/login', { username: 'admin', password: 'admin123' });
check('管理员账号可登录', adminLogin.status === 200 && adminLogin.body.user.role === 'admin');

const lockRes = await admin.patch(`/api/threads/${tid}`, { locked: true });
const lockedReply = await bob.post(`/api/threads/${tid}/posts`, { content: '锁定后还想回' });
check('管理员可锁定帖子', lockRes.status === 200);
check('锁定后普通用户无法回复（403）', lockedReply.status === 403);
const adminReply = await admin.post(`/api/threads/${tid}/posts`, { content: '管理员不受锁定限制' });
check('管理员在锁定帖中仍可回复', adminReply.status === 201);
await admin.patch(`/api/threads/${tid}`, { locked: false });

const pinRes = await admin.patch(`/api/threads/${tid}`, { pinned: true });
const list = await alice.get(`/api/boards/${slug}/threads`);
check('管理员可置顶且置顶帖排在最前', pinRes.status === 200 && list.body.threads[0].id === tid && list.body.threads[0].pinned);

const nonAdminPin = await bob.patch(`/api/threads/${tid}`, { pinned: false });
check('普通用户无权置顶（403）', nonAdminPin.status === 403);

/* ------------------------- 12. 封禁 ------------------------- */
const banRes = await admin.post(`/api/admin/users/${(await bob.get('/api/auth/me')).body.user.id}`, { action: 'ban' });
const bobAfterBan = await bob.get('/api/auth/me');
check('管理员可封禁用户', banRes.status === 200 && banRes.body.user.banned === true);
check('被封禁用户的会话立即失效', bobAfterBan.body.actor.type === 'guest');
const bobPostBanned = await bob.post(`/api/threads/${tid}/posts`, { content: '封禁后发言' });
check('被封禁用户无法再发言', bobPostBanned.status === 401);

/* ------------------------- 13. 删除与恢复 ------------------------- */
const delThread = await admin.del(`/api/threads/${tid}`);
const gone = await alice.get(`/api/threads/${tid}`);
check('管理员删除帖子后不可访问', delThread.status === 200 && gone.status === 404);
await admin.post(`/api/admin/threads/${tid}/restore`);
check('管理员可恢复被删帖子', (await alice.get(`/api/threads/${tid}`)).status === 200);

/* ------------------------- 14. 校验与异常 ------------------------- */
const shortPwd = await session('y').post('/api/auth/register', { username: 'zz' + stamp, password: '123' });
check('密码过短被拒绝（400）', shortPwd.status === 400);
const emptyThread = await alice.post(`/api/boards/${slug}/threads`, { title: '只有标题', content: '' });
check('空正文发帖被拒绝（400）', emptyThread.status === 400);
const noNick = await session('n').post(`/api/boards/${slug}/threads`, { title: '匿名没昵称', content: 'x' });
check('未设昵称的访客不能发言（401）', noNick.status === 401);
const dupBoard = await alice.post('/api/boards', { name: boardName });
check('同名板块被拒绝（409）', dupBoard.status === 409);
const ghost = await alice.get('/api/threads/99999999');
check('不存在的帖子返回 404', ghost.status === 404);

/* ------------------------- 15. 默认密码标记 ------------------------- */
const meAdmin = await admin.get('/api/auth/me');
check('初始管理员带「默认密码」标记', meAdmin.body.user.default_pw === true);
await admin.post('/api/auth/password', { oldPassword: 'admin123', newPassword: 'admin12345' });
const afterPw = await admin.get('/api/auth/me');
check('改过密码后标记清除', afterPw.body.user.default_pw === false);
const relogin = await session('adm2').post('/api/auth/login', { username: 'admin', password: 'admin12345' });
check('新密码可登录', relogin.status === 200);
const oldPwLogin = await session('adm3').post('/api/auth/login', { username: 'admin', password: 'admin123' });
check('旧密码已失效', oldPwLogin.status === 401);

/* ------------------------- 16. 最后一名管理员保护 ------------------------- */
const selfDemote = await admin.post(`/api/admin/users/${meAdmin.body.user.id}`, { action: 'demote' });
check('不能取消自己的管理员权限（400）', selfDemote.status === 400);

/* ------------------------- 17. 上传类型限制 ------------------------- */
const badUpload = await alice.post('/api/upload', new Uint8Array([1, 2, 3]), 'text/plain');
check('非图片类型上传被拒绝（400）', badUpload.status === 400);

/* ------------------------- 18. 板块删除 / 恢复（管理员） ------------------------- */
const boardNoPerm = await alice.post(`/api/admin/boards/${boardId}`, { action: 'delete' });
check('普通用户不能删除板块（403）', boardNoPerm.status === 403);

const delBoard = await admin.post(`/api/admin/boards/${boardId}`, { action: 'delete' });
check('管理员可删除板块（软删除）', delBoard.status === 200 && delBoard.body.board.deleted === true);

const boardsAfter = await alice.get('/api/boards');
check('已删除板块不再出现在板块列表', !boardsAfter.body.boards.some((b) => b.id === boardId));

const listGone = await alice.get(`/api/boards/${slug}/threads`);
check('已删除板块的帖子列表不可访问（404）', listGone.status === 404);

const threadGone = await alice.get(`/api/threads/${tid}`);
check('已删除板块下的帖子详情不可访问（404）', threadGone.status === 404);

const searchGone = await alice.get(`/api/search?q=${encodeURIComponent('验收帖')}`);
check('搜索不再返回已删除板块的内容', !searchGone.body.threads.some((t) => t.id === tid));

const adminBoardsList = await admin.get('/api/admin/boards');
const deletedBoard = adminBoardsList.body.boards.find((b) => b.id === boardId);
check('管理后台仍能看到已删除板块及统计', !!deletedBoard && !!deletedBoard.deleted && deletedBoard.thread_count > 0);

await admin.post(`/api/admin/boards/${boardId}`, { action: 'restore' });
const boardsBack = await alice.get('/api/boards');
check('恢复后板块重新出现', boardsBack.body.boards.some((b) => b.id === boardId));
check('恢复后板块内帖子重新可访问', (await alice.get(`/api/threads/${tid}`)).status === 200);
check('恢复后搜索也能搜到', (await alice.get(`/api/search?q=${encodeURIComponent('验收帖')}`)).body.threads.some((t) => t.id === tid));

const badAction = await admin.post(`/api/admin/boards/${boardId}`, { action: 'nuke' });
check('不支持的板块操作被拒绝（400）', badAction.status === 400);
const ghostBoard = await admin.post('/api/admin/boards/999999', { action: 'delete' });
check('删除不存在的板块返回 404', ghostBoard.status === 404);

console.log(`\n端到端验收结果：${pass} 通过 / ${failed} 失败\n`);
console.log(results.join('\n'));
process.exit(failed ? 1 : 0);
