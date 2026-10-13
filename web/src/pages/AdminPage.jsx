import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, fullTime, qs } from '../api.js';
import { useAuth } from '../store.jsx';
import Pagination from '../components/Pagination.jsx';
import { site } from '../site.js';

export default function AdminPage() {
  const { isAdmin } = useAuth();
  const [overview, setOverview] = useState(null);
  const [threads, setThreads] = useState(null);
  const [boards, setBoards] = useState(null);
  const [reports, setReports] = useState(null);
  const [reportStatus, setReportStatus] = useState('open');
  const [modPick, setModPick] = useState({});
  const [annos, setAnnos] = useState(null);
  const [annoForm, setAnnoForm] = useState(null);
  const [page, setPage] = useState(1);
  const [error, setError] = useState('');

  const loadOverview = () => api.get('/api/admin/overview').then(setOverview).catch((e) => setError(e.message));
  const loadThreads = () => api.get(`/api/admin/threads${qs({ page })}`).then(setThreads).catch((e) => setError(e.message));
  const loadBoards = () => api.get('/api/admin/boards').then((d) => setBoards(d.boards)).catch((e) => setError(e.message));
  const loadAnnos = () =>
    api.get('/api/announcements/all').then((d) => setAnnos(d.items)).catch((e) => setError(e.message));
  const loadReports = () =>
    api
      .get(`/api/reports${qs({ status: reportStatus })}`)
      .then(setReports)
      .catch((e) => setError(e.message));

  useEffect(() => {
    if (isAdmin) loadOverview();
  }, [isAdmin]);
  useEffect(() => {
    if (isAdmin) loadThreads();
  }, [isAdmin, page]);
  useEffect(() => {
    if (isAdmin) loadBoards();
  }, [isAdmin]);
  useEffect(() => {
    if (isAdmin) loadReports();
  }, [isAdmin, reportStatus]);
  useEffect(() => {
    if (isAdmin) loadAnnos();
  }, [isAdmin]);

  if (!isAdmin) {
    return (
      <div className="page narrow">
        <div className="card">
          <h1>需要管理员权限</h1>
          <p className="muted">请用管理员账号登录后再访问此页面。</p>
          <Link to="/login">去登录</Link>
        </div>
      </div>
    );
  }

  const blankAnno = () => ({
    id: null,
    title: '',
    content: '',
    level: 'normal',
    linkUrl: '',
    linkText: '',
    sort: 0,
    active: true,
  });

  const saveAnno = async () => {
    try {
      setError('');
      const { id, ...data } = annoForm;
      if (id) await api.patch(`/api/announcements/${id}`, data);
      else await api.post('/api/announcements', data);
      setAnnoForm(null);
      loadAnnos();
    } catch (e) {
      setError(e.message);
    }
  };

  const annoAction = async (a, patch) => {
    try {
      setError('');
      await api.patch(`/api/announcements/${a.id}`, patch);
      loadAnnos();
    } catch (e) {
      setError(e.message);
    }
  };

  const annoRemove = async (a) => {
    if (!window.confirm(`删除公告「${a.title}」？删了就找不回来了`)) return;
    try {
      setError('');
      await api.del(`/api/announcements/${a.id}`);
      loadAnnos();
    } catch (e) {
      setError(e.message);
    }
  };

  const handleReport = async (report, action) => {
    try {
      setError('');
      await api.post(`/api/reports/${report.id}`, { action });
      loadReports();
      loadOverview();
    } catch (e) {
      setError(e.message);
    }
  };

  const modAction = async (board, action) => {
    const userId = Number(modPick[board.id]);
    if (!userId) return setError('先在上面选一个用户');
    try {
      setError('');
      await api.post(`/api/admin/boards/${board.id}/moderators`, { action, userId });
      loadBoards();
    } catch (e) {
      setError(e.message);
    }
  };

  const boardAction = async (board, action) => {
    if (action === 'delete') {
      const n = board.thread_count ?? 0;
      const ok = confirm(
        `确定删除板块「${board.name}」吗？\n\n` +
          `· 板块会从首页隐藏，${n} 个帖子（含所有楼层）也一并隐藏\n` +
          `· 数据不会真正删除，随时可以点「恢复」\n` +
          `· 指向该板块的链接会变成 404`
      );
      if (!ok) return;
    }
    try {
      setError('');
      await api.post(`/api/admin/boards/${board.id}`, { action });
      loadBoards();
      loadOverview();
    } catch (e) {
      setError(e.message);
    }
  };

  const userAction = async (user, action) => {
    if (action === 'ban' && !confirm(`确定封禁「${user.username}」吗？其登录状态会立即失效。`)) return;
    await api.post(`/api/admin/users/${user.id}`, { action });
    loadOverview();
  };

  return (
    <div className="page">
      <h1>管理后台</h1>
      {error && <div className="error">{error}</div>}

      {overview && (
        <div className="stat-grid">
          {[
            ['注册用户', overview.stats.users],
            ['被封禁', overview.stats.banned],
            ['板块', overview.stats.boards],
            ['帖子', overview.stats.threads],
            ['楼层/回复', overview.stats.posts],
            ['今日新回复', overview.stats.today_posts],
            ['已删除帖子', overview.stats.deleted_threads],
          ].map(([label, value]) => (
            <div className="stat" key={label}>
              <strong>{value}</strong>
              <span className="muted small">{label}</span>
            </div>
          ))}
        </div>
      )}

      <h2>{site.announce.sectionTitle}</h2>
      <div className="card">
        <div className="row gap" style={{ marginBottom: 10 }}>
          <button className="tiny" onClick={() => setAnnoForm(annoForm ? null : blankAnno())}>
            {annoForm ? site.announce.cancelNew : site.announce.newOne}
          </button>
          <button
            className="tiny"
            title="像访客第一次进站那样弹一次看看"
            onClick={() => window.dispatchEvent(new CustomEvent('zj:preview-anno'))}
          >
            预览弹窗
          </button>
          {annos && (
            <span className="muted small">
              {site.announce.statusOn} {annos.filter((a) => a.active).length} 条 / 共 {annos.length} 条
            </span>
          )}
        </div>

        {annoForm && (
          <div className="anno-form">
            <label>{site.announce.titleLabel}</label>
            <input
              value={annoForm.title}
              maxLength={60}
              placeholder={site.announce.titlePlaceholder}
              onChange={(e) => setAnnoForm({ ...annoForm, title: e.target.value })}
            />

            <label>{site.announce.contentLabel}</label>
            <textarea
              rows={5}
              value={annoForm.content}
              placeholder={site.announce.contentPlaceholder}
              onChange={(e) => setAnnoForm({ ...annoForm, content: e.target.value })}
            />

            <div className="row gap wrap">
              <label className="row gap">
                {site.announce.levelLabel}
                <select value={annoForm.level} onChange={(e) => setAnnoForm({ ...annoForm, level: e.target.value })}>
                  <option value="normal">{site.announce.levelNormal}</option>
                  <option value="important">{site.announce.levelImportant}</option>
                </select>
              </label>
              <label className="row gap">
                {site.announce.sortLabel}
                <input
                  type="number"
                  style={{ width: 80 }}
                  value={annoForm.sort}
                  onChange={(e) => setAnnoForm({ ...annoForm, sort: e.target.value })}
                />
              </label>
              <label className="row gap">
                <input
                  type="checkbox"
                  checked={annoForm.active}
                  onChange={(e) => setAnnoForm({ ...annoForm, active: e.target.checked })}
                />
                {site.announce.activeLabel}
              </label>
            </div>

            <div className="row gap wrap">
              <input
                value={annoForm.linkUrl}
                placeholder={site.announce.linkPlaceholder}
                onChange={(e) => setAnnoForm({ ...annoForm, linkUrl: e.target.value })}
              />
              <input
                style={{ maxWidth: 160 }}
                value={annoForm.linkText}
                placeholder={site.announce.linkTextLabel}
                onChange={(e) => setAnnoForm({ ...annoForm, linkText: e.target.value })}
              />
            </div>

            <div className="row gap end">
              <button onClick={() => setAnnoForm(null)}>取消</button>
              <button className="primary" onClick={saveAnno}>
                {site.announce.save}
              </button>
            </div>
          </div>
        )}

        {annos && annos.length === 0 && <div className="muted">{site.announce.empty}</div>}

        <ul className="report-list">
          {(annos ?? []).map((a) => (
            <li key={a.id} className={a.active ? '' : 'status-rejected'}>
              <div className="row gap wrap">
                <strong>{a.title}</strong>
                {a.level === 'important' && <span className="tag lock">{site.announce.levelImportant}</span>}
                <span className="tag">{a.active ? site.announce.statusOn : site.announce.statusOff}</span>
                <span className="muted small">
                  {a.created_by ? `${a.created_by} · ` : ''}
                  {fullTime(a.updated_at)}
                </span>
              </div>
              {a.content && <div className="muted small">“{a.content.slice(0, 70)}”</div>}
              <div className="row gap">
                <button className="tiny" onClick={() => setAnnoForm({ ...a })}>
                  编辑
                </button>
                <button className="tiny" onClick={() => annoAction(a, { active: !a.active })}>
                  {a.active ? site.announce.unpublish : site.announce.publish}
                </button>
                <button className="tiny danger" onClick={() => annoRemove(a)}>
                  {site.announce.remove}
                </button>
              </div>
            </li>
          ))}
        </ul>
      </div>

      <h2>
        举报处理
        {reports?.counts?.open > 0 && <span className="tag lock"> 待处理 {reports.counts.open}</span>}
      </h2>
      <div className="card">
        <div className="tabs">
          {[
            ['open', '待处理'],
            ['resolved', '已处理'],
            ['rejected', '已驳回'],
            ['all', '全部'],
          ].map(([k, label]) => (
            <button key={k} className={reportStatus === k ? 'on' : ''} onClick={() => setReportStatus(k)}>
              {label}
            </button>
          ))}
        </div>

        {!reports && <div className="muted">加载中…</div>}
        {reports && reports.items.length === 0 && (
          <div className="muted" style={{ padding: '12px 0' }}>
            这个分类下没有举报，清净。
          </div>
        )}

        <ul className="report-list">
          {(reports?.items ?? []).map((r) => (
            <li key={r.id} className={`status-${r.status}`}>
              <div className="row gap wrap">
                <span className="tag">{r.target_type === 'thread' ? '主题' : r.target_floor ? `${r.target_floor} 楼` : '楼层'}</span>
                <strong>{r.reason}</strong>
                {r.board_name && (
                  <Link className="muted small" to={`/b/${r.board_slug}`}>
                    {r.board_name}
                  </Link>
                )}
                <span className="muted small">
                  {r.reporter_name || '匿名'} 举报于 {fullTime(r.created_at)}
                </span>
                {r.status !== 'open' && (
                  <span className="muted small">
                    · {r.status === 'resolved' ? '已处理' : '已驳回'}
                    {r.handled_by ? ` by ${r.handled_by}` : ''}
                  </span>
                )}
              </div>

              <div className="report-target">
                {r.target_type === 'thread' ? (
                  <Link to={`/t/${r.thread_id}`}>《{r.thread_title || '帖子'}》{r.thread_deleted ? '（已删除）' : ''}</Link>
                ) : (
                  <Link to={`/t/${r.thread_id}#post-${r.target_id}`}>
                    《{r.thread_title || '帖子'}》 {r.target_floor ? `${r.target_floor} 楼` : '楼中楼'}
                    {r.target_deleted ? '（已删除）' : ''}
                  </Link>
                )}
                {r.target_excerpt && <div className="muted small">“{r.target_excerpt}”</div>}
                {r.detail && <div className="muted small">举报说明：{r.detail}</div>}
              </div>

              {r.status === 'open' && (
                <div className="row gap">
                  <button className="tiny" onClick={() => handleReport(r, 'resolve')}>
                    处理完毕
                  </button>
                  <button className="tiny" onClick={() => handleReport(r, 'reject')}>
                    驳回
                  </button>
                </div>
              )}
            </li>
          ))}
        </ul>
      </div>

      <h2>板块管理</h2>
      <div className="table-wrap card">
        <table>
          <thead>
            <tr>
              <th>ID</th>
              <th>板块名称</th>
              <th>标识</th>
              <th>帖数</th>
              <th>楼层/回复</th>
              <th>版主</th>
              <th>状态</th>
              <th>操作</th>
            </tr>
          </thead>
          <tbody>
            {(boards ?? []).map((b) => (
              <tr key={b.id} className={b.deleted ? 'row-deleted' : ''}>
                <td>{b.id}</td>
                <td>
                  {b.deleted ? b.name : <Link to={`/b/${b.slug}`}>{b.name}</Link>}
                </td>
                <td className="muted small">/{b.slug}</td>
                <td>{b.thread_count}</td>
                <td>{b.post_count}</td>
                <td className="muted small">
                  {b.moderators_text || '—'}
                  {(overview?.users ?? []).length > 0 && !b.deleted && (
                    <div className="row gap" style={{ marginTop: 4 }}>
                      <select
                        value={modPick[b.id] ?? ''}
                        onChange={(e) => setModPick({ ...modPick, [b.id]: e.target.value })}
                        title="选择用户"
                      >
                        <option value="">选用户…</option>
                        {(overview?.users ?? [])
                          .filter((u) => !u.banned)
                          .map((u) => (
                            <option key={u.id} value={u.id}>
                              {u.username}
                            </option>
                          ))}
                      </select>
                      <button className="tiny" onClick={() => modAction(b, 'add')}>
                        任命
                      </button>
                      <button className="tiny" onClick={() => modAction(b, 'remove')}>
                        撤销
                      </button>
                    </div>
                  )}
                </td>
                <td>{b.deleted ? <span className="danger-text">已删除</span> : '正常'}</td>
                <td className="row gap">
                  {b.deleted ? (
                    <button className="tiny" onClick={() => boardAction(b, 'restore')}>
                      恢复
                    </button>
                  ) : (
                    <button className="tiny danger" onClick={() => boardAction(b, 'delete')}>
                      删除板块
                    </button>
                  )}
                </td>
              </tr>
            ))}
            {boards && boards.length === 0 && (
              <tr>
                <td colSpan={7} className="muted">
                  还没有板块
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <h2>用户管理</h2>
      <div className="table-wrap card">
        <table>
          <thead>
            <tr>
              <th>ID</th>
              <th>用户名</th>
              <th>角色</th>
              <th>状态</th>
              <th>发帖</th>
              <th>回帖</th>
              <th>注册时间</th>
              <th>操作</th>
            </tr>
          </thead>
          <tbody>
            {overview?.users.map((u) => (
              <tr key={u.id}>
                <td>{u.id}</td>
                <td>{u.username}</td>
                <td>{u.role === 'admin' ? '🛡 管理员' : '普通用户'}</td>
                <td>{u.banned ? <span className="danger-text">已封禁</span> : '正常'}</td>
                <td>{u.thread_count}</td>
                <td>{u.post_count}</td>
                <td className="muted small">{fullTime(u.created_at)}</td>
                <td className="row gap">
                  <button className="tiny" onClick={() => userAction(u, u.banned ? 'unban' : 'ban')}>
                    {u.banned ? '解封' : '封禁'}
                  </button>
                  <button className="tiny" onClick={() => userAction(u, u.role === 'admin' ? 'demote' : 'promote')}>
                    {u.role === 'admin' ? '取消管理员' : '设为管理员'}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <h2>帖子管理</h2>
      <div className="table-wrap card">
        <table>
          <thead>
            <tr>
              <th>ID</th>
              <th>标题</th>
              <th>板块</th>
              <th>作者</th>
              <th>楼层</th>
              <th>版主</th>
              <th>状态</th>
              <th>操作</th>
            </tr>
          </thead>
          <tbody>
            {threads?.threads.map((t) => (
              <tr key={t.id} className={t.deleted ? 'row-deleted' : ''}>
                <td>{t.id}</td>
                <td>
                  <Link to={`/t/${t.id}`}>{t.title}</Link>
                </td>
                <td>{t.board_name}</td>
                <td>{t.author_name}</td>
                <td>{t.floor_count}</td>
                <td>
                  {t.deleted ? <span className="danger-text">已删除</span> : t.locked ? '已锁定' : '正常'}
                  {t.pinned ? ' · 置顶' : ''}
                </td>
                <td className="row gap">
                  {t.deleted ? (
                    <button
                      className="tiny"
                      onClick={async () => {
                        await api.post(`/api/admin/threads/${t.id}/restore`);
                        loadThreads();
                        loadOverview();
                      }}
                    >
                      恢复
                    </button>
                  ) : (
                    <button
                      className="tiny danger"
                      onClick={async () => {
                        if (!confirm(`删除帖子「${t.title}」？`)) return;
                        await api.del(`/api/threads/${t.id}`);
                        loadThreads();
                        loadOverview();
                      }}
                    >
                      删除
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {threads && (
        <Pagination
          page={threads.pagination.page}
          pages={threads.pagination.pages}
          total={threads.pagination.total}
          label="帖"
          onChange={setPage}
        />
      )}
    </div>
  );
}
