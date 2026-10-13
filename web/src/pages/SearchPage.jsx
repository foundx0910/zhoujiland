import React, { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { api, qs, timeAgo } from '../api.js';
import Pagination from '../components/Pagination.jsx';
import { plain } from '../components/Markdown.jsx';
import { site } from '../site.js';

export default function SearchPage() {
  const [sp, setSp] = useSearchParams();
  const q = sp.get('q') || '';
  const page = Number(sp.get('page') || 1);
  const size = Number(sp.get('size') || 50); // 搜索结果每页 50 条
  const [data, setData] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!q) return;
    setError('');
    api
      .get(`/api/search${qs({ q, page, size })}`)
      .then(setData)
      .catch((e) => setError(e.message));
  }, [q, page, size]);

  return (
    <div className="page">
      <h1>{site.text.searchTitle}「{q}」</h1>
      {error && <div className="error">{error}</div>}
      {!data && <div className="muted">{site.text.searching}</div>}
      {data && (
        <>
          {data.threads.length === 0 && <div className="empty card">{site.text.searchEmpty}</div>}
          {data.threads.length > 0 && (
            <>
              <h3 className="muted small">相关帖子（{data.pagination.total}）</h3>
              <ul className="thread-list">
                {data.threads.map((t) => (
                  <li key={t.id}>
                    <div className="thread-main">
                      <div className="thread-title">
                        <Link to={`/t/${t.id}`}>{t.title}</Link>
                      </div>
                      <div className="muted small excerpt">{plain(t.excerpt, 110)}</div>
                      <div className="muted small">
                        <Link to={`/b/${t.board_slug}`}>{t.board_name}</Link> · {t.author.name} · {timeAgo(t.last_reply_at)}
                      </div>
                    </div>
                    <div className="thread-stats">
                      <div>
                        <strong>{t.floor_count}</strong>
                        <span className="muted small">楼层</span>
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            </>
          )}

          {data.posts.length > 0 && (
            <>
              <h3 className="muted small">相关楼层</h3>
              <ul className="post-hits">
                {data.posts.map((p) => (
                  <li key={p.id}>
                    <Link to={`/t/${p.thread_id}?page=1#post-${p.id}`}>
                      {p.floor_no ? `${p.floor_no} 楼` : '楼中楼'}
                    </Link>{' '}
                    <span className="muted small">
                      {p.author_name} · {plain(p.snippet, 60)}
                    </span>
                  </li>
                ))}
              </ul>
            </>
          )}

          <Pagination
            page={data.pagination.page}
            pages={data.pagination.pages}
            total={data.pagination.total}
            label="帖"
            onChange={(p) => setSp(qs({ q, page: p, size }))}
          />
        </>
      )}
    </div>
  );
}
