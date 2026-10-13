import React, { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { api, qs, timeAgo } from '../api.js';
import Pagination from './Pagination.jsx';
import { plain } from './Markdown.jsx';

const TABS = [
  { key: 'threads', label: '主题帖' },
  { key: 'posts', label: '回复' },
];

/**
 * 某用户的内容列表（主题帖 / 回复），自带标签页与分页。
 * 个人主页和个人中心共用这一个组件。
 */
export default function UserContent({ userId, showBoard = true }) {
  const [sp, setSp] = useSearchParams();
  const tab = sp.get('tab') === 'posts' ? 'posts' : 'threads';
  const page = Number(sp.get('page') || 1);
  const [data, setData] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!userId) return;
    let alive = true;
    setData(null);
    setError('');
    api
      .get(`/api/users/${userId}${qs({ tab, page })}`)
      .then((d) => alive && setData(d))
      .catch((e) => alive && setError(e.message));
    return () => {
      alive = false;
    };
  }, [userId, tab, page]);

  const patch = (next) => setSp(qs({ tab, page: String(page), ...next }));

  const items = data?.items ?? [];
  const pg = data?.pagination;

  return (
    <div className="card user-content">
      <div className="tabs">
        {TABS.map((t) => (
          <button key={t.key} className={tab === t.key ? 'on' : ''} onClick={() => patch({ tab: t.key, page: 1 })}>
            {t.label}
            {data && tab === t.key ? ` (${pg.total})` : ''}
          </button>
        ))}
      </div>

      {error && <div className="error">{error}</div>}
      {!data && <div className="muted">加载中…</div>}

      {data && items.length === 0 && (
        <div className="muted" style={{ padding: '16px 0' }}>
          {tab === 'threads' ? '还没有发过主题帖。' : '还没有回复过。'}
        </div>
      )}

      {data && items.length > 0 && tab === 'threads' && (
        <ul className="thread-list bare">
          {items.map((t) => (
            <li key={t.id}>
              <div className="thread-main">
                <div className="thread-title">
                  {t.pinned && <span className="tag pin">置顶</span>}
                  {t.locked && <span className="tag lock">已锁定</span>}
                  <Link to={`/t/${t.id}`}>{t.title}</Link>
                </div>
                <div className="muted small excerpt">{plain(t.excerpt, 110)}</div>
                <div className="muted small">
                  {showBoard && (
                    <>
                      来自 <Link to={`/b/${t.board_slug}`}>{t.board_name}</Link> ·{' '}
                    </>
                  )}
                  {timeAgo(t.created_at)} · {t.floor_count} 层 · {t.views} 次浏览
                </div>
              </div>
              <div className="thread-stats">
                <div>
                  <strong>{t.reply_count}</strong>
                  <span className="muted small">回复</span>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}

      {data && items.length > 0 && tab === 'posts' && (
        <ul className="post-list">
          {items.map((p) => (
            <li key={p.id}>
              <div className="muted small">
                <Link to={`/t/${p.thread_id}${p.floor_no ? `?page=1#floor-${p.floor_no}` : `#post-${p.id}`}`}>
                  {p.thread_id ? `《${p.title}》` : ''}
                </Link>
                <span className="tag">{p.floor_no ? `${p.floor_no} 楼` : '楼中楼'}</span>
                {showBoard && (
                  <Link className="muted" to={`/b/${p.board_slug}`}>
                    {' '}
                    {p.board_name}
                  </Link>
                )}
                <span className="muted"> · {timeAgo(p.created_at)}</span>
                {p.likes > 0 && <span className="muted"> · 👍 {p.likes}</span>}
              </div>
              <div className="post-list-body">{plain(p.snippet, 160)}</div>
            </li>
          ))}
        </ul>
      )}

      {pg && (
        <Pagination
          page={pg.page}
          pages={pg.pages}
          total={pg.total}
          label={tab === 'threads' ? '帖' : '条'}
          onChange={(p) => patch({ page: p })}
        />
      )}
    </div>
  );
}
