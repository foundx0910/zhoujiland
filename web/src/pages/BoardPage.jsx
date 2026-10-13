import React, { useEffect, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { api, loadWithCache, prefetch, timeAgo, qs } from '../api.js';
import { useAuth } from '../store.jsx';
import { site } from '../site.js';
import Editor from '../components/Editor.jsx';
import Pagination from '../components/Pagination.jsx';
import { plain } from '../components/Markdown.jsx';

const SORTS = [
  { key: 'active', label: site.text.sortActive },
  { key: 'new', label: site.text.sortNew },
  { key: 'hot', label: site.text.sortHot },
];

export default function BoardPage() {
  const { slug } = useParams();
  const [sp, setSp] = useSearchParams();
  const page = Number(sp.get('page') || 1);
  const sort = sp.get('sort') || 'active';
  const q = sp.get('q') || '';
  const size = Number(sp.get('size') || 50); // 每页显示多少个帖子

  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [posting, setPosting] = useState(false);
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [busy, setBusy] = useState(false);
  const { canSpeak, notify } = useAuth();
  const navigate = useNavigate();

  const patch = (next) => {
    const merged = { sort, q, size: String(size), page: String(page), ...next };
    setSp(qs(merged));
  };

  useEffect(() => {
    let alive = true;
    loadWithCache(`/api/boards/${slug}/threads${qs({ page, sort, q, size })}`, (d) => alive && setData(d), {
      ttl: 20000,
    }).catch((e) => alive && setError(e.message));
    return () => {
      alive = false;
    };
  }, [slug, page, sort, q, size]);

  const publish = async () => {
    if (!title.trim() || !content.trim()) return;
    setBusy(true);
    try {
      const d = await api.post(`/api/boards/${slug}/threads`, { title, content });
      api.invalidate(`/api/boards/${slug}/threads`);
      notify(site.text.publishOk, 'ok');
      navigate(`/t/${d.id}`);
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  if (error && !data) return <div className="error">{error}</div>;
  if (!data) return <div className="muted">加载中…</div>;

  const { board, threads, pagination } = data;

  return (
    <div className="page">
      <div className="crumbs muted small">
        <Link to="/">板块</Link> / <span>{board.name}</span>
      </div>

      <div className="page-head">
        <div>
          <h1>{board.name}</h1>
          <p className="muted">{board.description || '还没写简介'}</p>
        </div>
        <button className="primary" onClick={() => setPosting((v) => !v)} disabled={!canSpeak}>
          {posting ? site.text.newThreadCancel : site.text.newThread}
        </button>
      </div>

      {!canSpeak && (
        <div className="notice">{site.text.boardNotice}</div>
      )}

      {posting && (
        <div className="card form">
          <h3>{site.text.newThreadTitle}</h3>
          <label>
            {site.text.newThreadTitleLabel}
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder={site.text.newThreadTitlePlaceholder}
              maxLength={80}
            />
          </label>
          <label>{site.text.newThreadBodyLabel}</label>
          <Editor value={content} onChange={setContent} submitLabel={busy ? '…' : site.text.newThreadSubmit} onSubmit={publish} />
          <div className="row gap end">
            <button onClick={() => setPosting(false)}>取消</button>
          </div>
        </div>
      )}

      <div className="toolbar">
        <div className="tabs">
          {SORTS.map((s) => (
            <button
              key={s.key}
              className={sort === s.key ? 'on' : ''}
              onClick={() => patch({ sort: s.key, page: 1 })}
            >
              {s.label}
            </button>
          ))}
        </div>
        <div className="row gap">
          <span className="muted small">每页</span>
          <select
            value={size}
            onChange={(e) => patch({ size: e.target.value, page: 1 })}
            title="每页显示多少个帖子"
          >
            <option value={20}>20 帖</option>
            <option value={50}>50 帖</option>
            <option value={100}>100 帖</option>
            <option value={200}>200 帖</option>
          </select>
          <form
            className="inline-search"
            onSubmit={(e) => {
              e.preventDefault();
              patch({ q: e.target.q.value, page: 1 });
            }}
          >
            <input name="q" defaultValue={q} placeholder={site.text.boardSearchPlaceholder} />
            <button type="submit">搜索</button>
            {q && (
              <button type="button" onClick={() => patch({ q: '', page: 1 })}>
                清除
              </button>
            )}
          </form>
        </div>
      </div>

      {threads.length === 0 ? (
        <div className="empty card">{site.text.boardEmpty}</div>
      ) : (
        <ul className="thread-list">
          {threads.map((t) => (
            <li key={t.id} className={t.pinned ? 'pinned' : ''}>
              <div className="thread-main">
                <div className="thread-title">
                  {t.pinned && <span className="tag pin">置顶</span>}
                  {t.locked && <span className="tag lock">已锁定</span>}
                  <Link
                    to={`/t/${t.id}`}
                    onMouseEnter={() => prefetch(`/api/threads/${t.id}?page=1&order=asc&size=50`)}
                  >
                    {t.title}
                  </Link>
                </div>
                <div className="muted small excerpt">{plain(t.excerpt, 110)}</div>
                <div className="muted small thread-meta">
                  {t.author.type === 'user' ? '👤' : '🎭'} {t.author.name} · 发布于 {timeAgo(t.created_at)} · {t.views} 次浏览
                </div>
              </div>
              <div className="thread-stats">
                <div>
                  <strong>{t.floor_count}</strong>
                  <span className="muted small">楼层</span>
                </div>
                <div className="muted small">最后回复 {timeAgo(t.last_reply_at)}</div>
              </div>
            </li>
          ))}
        </ul>
      )}

      <Pagination page={pagination.page} pages={pagination.pages} total={pagination.total} label="帖" onChange={(p) => patch({ page: p })} />
    </div>
  );
}
