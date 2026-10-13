import React, { useEffect, useState } from 'react';
import { api, timeAgo, fullTime } from '../api.js';
import { site } from '../site.js';
import Markdown from '../components/Markdown.jsx';

/** 公告历史：生效中的 + 已经下架的都能回看 */
export default function AnnouncementsPage() {
  const [items, setItems] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    api
      .get('/api/announcements?history=1')
      .then((d) => setItems(d.items ?? []))
      .catch((e) => setError(e.message));
  }, []);

  return (
    <div className="page narrow">
      <div className="page-head">
        <div>
          <h1>{site.announce.navLabel}</h1>
          <p className="muted">站里发布过的消息都在这儿，旧的也能翻。</p>
        </div>
      </div>

      {error && <div className="error">{error}</div>}
      {!items && <div className="muted">{site.text.loading}</div>}
      {items && items.length === 0 && <div className="empty card">{site.announce.none}</div>}

      <div className="anno-list">
        {(items ?? []).map((a) => (
          <article key={a.id} className={`card anno-item ${a.active ? '' : 'past'} ${a.level}`}>
            <div className="anno-head">
              <h2>{a.title}</h2>
              {a.level === 'important' && <span className="tag lock">{site.announce.levelImportant}</span>}
              {!a.active && <span className="tag">{site.announce.past}</span>}
            </div>
            <div className="muted small" title={fullTime(a.updated_at)}>
              {a.created_by ? `${a.created_by} · ` : ''}
              {timeAgo(a.updated_at)}
            </div>
            {a.content && (
              <div className="markdown anno-content">
                <Markdown text={a.content} />
              </div>
            )}
            {a.link_url && (
              <p>
                <a href={a.link_url} target="_blank" rel="noreferrer">
                  {a.link_text || a.link_url}
                </a>
              </p>
            )}
          </article>
        ))}
      </div>
    </div>
  );
}
