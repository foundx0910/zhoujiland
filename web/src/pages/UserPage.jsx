import React, { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api, fullTime, timeAgo } from '../api.js';
import Avatar from '../components/Avatar.jsx';
import UserContent from '../components/UserContent.jsx';
import { useAuth } from '../store.jsx';
import { site } from '../site.js';

/** 公开个人主页：/u/:id */
export default function UserPage() {
  const { id } = useParams();
  const { user: me } = useAuth();
  const [data, setData] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    let alive = true;
    setData(null);
    setError('');
    api
      .get(`/api/users/${id}`)
      .then((d) => alive && setData(d))
      .catch((e) => alive && setError(e.message));
    return () => {
      alive = false;
    };
  }, [id]);

  if (error) {
    return (
      <div className="page narrow">
        <div className="card">
          <h1>{site.text.notFoundUserTitle}</h1>
          <p className="muted">{error}</p>
          <Link to="/">返回首页</Link>
        </div>
      </div>
    );
  }

  if (!data) return <div className="page muted">加载中…</div>;

  const u = data.user;
  const s = data.stats;
  const isMe = me && me.id === u.id;

  return (
    <div className="page">
      <div className="crumbs muted small">
        <Link to="/">板块</Link> / <span>{u.username} 的个人主页</span>
      </div>

      <div className="card profile-head">
        <Avatar name={u.username} url={u.avatar} size={96} />
        <div className="profile-main">
          <h1 className="profile-name">
            {u.username}
            {u.role === 'admin' && <span className="tag admin">{site.nav.admin}</span>}
            {u.banned && <span className="tag lock">已封禁</span>}
            {isMe && <span className="tag me">这是你</span>}
          </h1>
          <div className="muted small">
            {site.text.joinedAt} {fullTime(u.created_at)}
            {s.last_active_at && <> · {site.text.lastActive} {timeAgo(s.last_active_at)}</>}
          </div>
          {u.bio ? (
            <div className="profile-bio">{u.bio}</div>
          ) : (
            <div className="muted small">{site.text.profileFallbackBio}</div>
          )}
          {isMe && (
            <div className="row gap" style={{ marginTop: 10 }}>
              <Link className="btn-link primary" to="/me">
                {site.text.profileEdit}
              </Link>
            </div>
          )}
        </div>
      </div>

      <div className="stat-grid profile-stats">
        <div className="stat">
          <strong>{s.thread_count}</strong>
          <span className="muted small">{site.text.statThreads}</span>
        </div>
        <div className="stat">
          <strong>{s.post_count}</strong>
          <span className="muted small">{site.text.statReplies}</span>
        </div>
        <div className="stat">
          <strong>{s.like_count}</strong>
          <span className="muted small">{site.text.statLikes}</span>
        </div>
      </div>

      <UserContent userId={u.id} showBoard />
    </div>
  );
}
