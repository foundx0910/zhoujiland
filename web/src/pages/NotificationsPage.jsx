import React, { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { api, qs, timeAgo } from '../api.js';
import { useAuth } from '../store.jsx';
import { site } from '../site.js';
import Pagination from '../components/Pagination.jsx';

const ICON = {
  thread_reply: '💬',
  reply: '↩️',
  like: '👍',
  mention: '📣',
};

export default function NotificationsPage() {
  const { user, unread, setUnread, notify } = useAuth();
  const [sp, setSp] = useSearchParams();
  const page = Number(sp.get('page') || 1);
  const [data, setData] = useState(null);
  const [error, setError] = useState('');

  const load = () =>
    api
      .get(`/api/notifications${qs({ page })}`)
      .then((d) => {
        setData(d);
        setUnread(d.unread);
      })
      .catch((e) => setError(e.message));

  useEffect(() => {
    if (user) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id, page]);

  if (!user) {
    return (
      <div className="page narrow">
        <div className="card">
          <h1>{site.text.notifTitle}</h1>
          <p className="muted">登录之后，别人回复你、@你、给你点赞，都会在这里提醒你。</p>
          <Link to="/login">去登录</Link>
        </div>
      </div>
    );
  }

  const markAll = async () => {
    const r = await api.post('/api/notifications/read', {});
    setUnread(r.unread);
    notify(site.text.notifReadDone, 'ok');
    load();
  };

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>{site.text.notifTitle}</h1>
          <p className="muted">
            {unread > 0 ? `有 ${unread} 条还没看` : '暂时没有新消息，安静得很'}
          </p>
        </div>
        {unread > 0 && (
          <button onClick={markAll}>{site.text.notifAllRead}</button>
        )}
      </div>

      {error && <div className="error">{error}</div>}
      {!data && <div className="muted">{site.text.loading}</div>}

      {data && data.items.length === 0 && (
        <div className="empty card">
          {site.text.notifEmpty}
        </div>
      )}

      {data && data.items.length > 0 && (
        <ul className="notif-list">
          {data.items.map((n) => (
            <li key={n.id} className={n.read ? '' : 'unread'}>
              <span className="notif-icon">{ICON[n.type] ?? '🔔'}</span>
              <div className="notif-main">
                <div className="notif-line">
                  <strong>{n.actor_name || '有人'}</strong>
                  <span className="muted"> {n.type_label}</span>
                  {!n.read && <span className="tag new">新</span>}
                </div>
                {n.thread_id ? (
                  <Link className="notif-title" to={`/t/${n.thread_id}#post-${n.post_id ?? ''}`}>
                    《{n.title || '帖子'}》
                  </Link>
                ) : (
                  <span className="notif-title">《{n.title || '帖子'}》</span>
                )}
                {n.excerpt && <div className="muted small notif-excerpt">“{n.excerpt}”</div>}
                <div className="muted small">{timeAgo(n.created_at)}</div>
              </div>
            </li>
          ))}
        </ul>
      )}

      {data && (
        <Pagination
          page={data.pagination.page}
          pages={data.pagination.pages}
          total={data.pagination.total}
          label="条"
          onChange={(p) => setSp(qs({ page: p }))}
        />
      )}
    </div>
  );
}
