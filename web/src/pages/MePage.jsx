import React, { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, fullTime, timeAgo } from '../api.js';
import { useAuth } from '../store.jsx';
import Avatar from '../components/Avatar.jsx';
import UserContent from '../components/UserContent.jsx';
import { site } from '../site.js';

/** 我的个人中心：资料编辑（签名 / 头像）、统计、我的内容、改密码 */
export default function MePage() {
  const { actor, user, refresh, logout, setGuestName, notify } = useAuth();
  const [profile, setProfile] = useState(null);
  const [bio, setBio] = useState('');
  const [pw, setPw] = useState({ oldPassword: '', newPassword: '' });
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);
  const [guestMine, setGuestMine] = useState(null);
  const [nick, setNick] = useState('');
  const fileRef = useRef(null);

  const loadProfile = () => {
    if (!user) return;
    api
      .get(`/api/users/${user.id}`)
      .then((d) => {
        setProfile(d);
        setBio(d.user.bio ?? '');
      })
      .catch((e) => setMsg(e.message));
  };

  useEffect(() => {
    if (user) loadProfile();
    // 游客：用「我的发言」接口
    if (actor && !user) api.get('/api/auth/mine').then(setGuestMine).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id, actor?.name]);

  const saveProfile = async (fields, tip = '资料已保存') => {
    setBusy(true);
    setMsg('');
    try {
      await api.patch('/api/auth/profile', fields);
      await refresh();
      loadProfile();
      notify(tip, 'ok');
    } catch (e) {
      setMsg(e.message);
    } finally {
      setBusy(false);
    }
  };

  const uploadAvatar = async (file) => {
    if (!file) return;
    setBusy(true);
    setMsg('');
    try {
      const up = await api.upload(file);
      await saveProfile({ avatar: up.url }, '头像已更新');
    } catch (e) {
      setMsg(e.message);
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  /* ------------------------------ 游客视图 ------------------------------ */
  if (!user) {
    return (
      <div className="page narrow">
        <h1>{site.text.myGuestTitle}</h1>
        <div className="card">
          <h3>{site.text.guestIdentityTitle}</h3>
          <p className="muted small">
            {actor?.name ? `你现在的昵称是「${actor.name}」` : '你还没有设置昵称，设置后就能发帖、盖楼。'}
          </p>
          <div className="row gap">
            <input value={nick} onChange={(e) => setNick(e.target.value)} placeholder="设置/更换昵称（2-20 字）" />
            <button
              className="primary"
              disabled={nick.trim().length < 2}
              onClick={async () => {
                await setGuestName(nick.trim());
                notify('昵称已保存', 'ok');
                setNick('');
              }}
            >
              保存昵称
            </button>
          </div>
          <p className="muted small" style={{ marginTop: 10 }}>
            注册账号后会有<strong>个人主页</strong>（头像、签名、发帖统计），还能在任意设备登录：
            <Link to="/register"> 注册</Link> / <Link to="/login"> 登录</Link>
          </p>
        </div>

        <div className="card">
          <h3>{site.text.myThreadsTitle}</h3>
          {!guestMine ? (
            <div className="muted">加载中…</div>
          ) : guestMine.threads.length === 0 ? (
            <div className="muted">还没有发过帖子。</div>
          ) : (
            <ul className="plain-list">
              {guestMine.threads.map((t) => (
                <li key={t.id}>
                  <Link to={`/t/${t.id}`}>{t.title}</Link>
                  <span className="muted small">
                    {' '}
                    · {t.board_name} · {timeAgo(t.created_at)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="card">
          <h3>{site.text.myPostsTitle}</h3>
          {!guestMine ? (
            <div className="muted">加载中…</div>
          ) : guestMine.posts.length === 0 ? (
            <div className="muted">还没有回复记录。</div>
          ) : (
            <ul className="plain-list">
              {guestMine.posts.map((p) => (
                <li key={p.id}>
                  <Link to={`/t/${p.thread_id}#${p.floor_no ? `floor-${p.floor_no}` : `post-${p.id}`}`}>
                    {p.title}
                  </Link>
                  <span className="muted small">
                    {' '}
                    · {p.floor_no ? `${p.floor_no} 楼` : '楼中楼'} · {timeAgo(p.created_at)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    );
  }

  /* ------------------------------ 登录用户视图 ------------------------------ */
  const s = profile?.stats;

  return (
    <div className="page">
      <h1>{site.text.meTitle}</h1>
      {msg && <div className="error">{msg}</div>}

      <div className="card profile-head">
        <div className="avatar-wrap">
          <Avatar name={user.username} url={user.avatar} size={96} />
          <button className="tiny" onClick={() => fileRef.current?.click()} disabled={busy}>
            {site.text.avatarChange}
          </button>
          {user.avatar && (
            <button className="tiny danger" onClick={() => saveProfile({ avatar: '' }, '头像已移除')} disabled={busy}>
              {site.text.avatarRemove}
            </button>
          )}
        </div>
        <div className="profile-main">
          <h1 className="profile-name">
            {user.username}
            {user.role === 'admin' && <span className="tag admin">管理员</span>}
          </h1>
          <div className="muted small">注册于 {fullTime(user.created_at)}</div>
          <div className="row gap" style={{ marginTop: 8 }}>
            <Link className="btn-link" to={`/u/${user.id}`}>
              {site.text.viewPublicProfile}
            </Link>
            <button
              className="tiny"
              onClick={async () => {
                await logout();
                notify(site.text.logoutDone, 'ok');
              }}
            >
              退出登录
            </button>
          </div>
        </div>
      </div>

      {s && (
        <div className="stat-grid profile-stats">
          <div className="stat">
            <strong>{s.thread_count}</strong>
            <span className="muted small">主题帖</span>
          </div>
          <div className="stat">
            <strong>{s.post_count}</strong>
            <span className="muted small">回复</span>
          </div>
          <div className="stat">
            <strong>{s.like_count}</strong>
            <span className="muted small">获赞</span>
          </div>
        </div>
      )}

      <div className="card form">
        <h3>{site.text.signatureLabel}</h3>
        <p className="muted small">{site.text.signatureHint}</p>
        <textarea
          rows={2}
          maxLength={100}
          value={bio}
          onChange={(e) => setBio(e.target.value)}
          placeholder={site.text.signaturePlaceholder}
        />
        <div className="row gap end" style={{ marginTop: 8 }}>
          <span className="muted small">{bio.length} / 100</span>
          <button className="primary" disabled={busy} onClick={() => saveProfile({ bio })}>
            {site.text.signatureSave}
          </button>
        </div>
      </div>

      <div className="card form">
        <h3>{site.text.passwordTitle}</h3>
        <div className="row gap">
          <input
            type="password"
            value={pw.oldPassword}
            onChange={(e) => setPw({ ...pw, oldPassword: e.target.value })}
            placeholder={site.text.passwordOld}
          />
          <input
            type="password"
            value={pw.newPassword}
            onChange={(e) => setPw({ ...pw, newPassword: e.target.value })}
            placeholder={site.text.passwordNew}
          />
          <button
            disabled={busy}
            onClick={async () => {
              try {
                setMsg('');
                await api.post('/api/auth/password', pw);
                notify('密码已更新', 'ok');
                setPw({ oldPassword: '', newPassword: '' });
              } catch (e) {
                setMsg(e.message);
              }
            }}
          >
            {site.text.passwordSave}
          </button>
        </div>
      </div>

      <h2>{site.text.myContentTitle}</h2>
      <UserContent userId={user.id} showBoard />

      <input
        ref={fileRef}
        type="file"
        accept="image/png,image/jpeg,image/gif,image/webp"
        hidden
        onChange={(e) => uploadAvatar(e.target.files?.[0])}
      />
    </div>
  );
}
