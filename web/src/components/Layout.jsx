import React, { useState } from 'react';
import { Link, NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useAuth } from '../store.jsx';
import { site } from '../site.js';
import Avatar from './Avatar.jsx';

function IdentityBar() {
  const { actor, setGuestName, notify } = useAuth();
  const [name, setName] = useState('');
  const [err, setErr] = useState('');
  const [open, setOpen] = useState(false);

  if (!actor || actor.type === 'user' || actor.name) return null;

  const save = async () => {
    try {
      setErr('');
      await setGuestName(name.trim());
      notify('昵称已保存，现在可以发帖和回帖了', 'ok');
      setOpen(false);
    } catch (e) {
      setErr(e.message);
    }
  };

  return (
    <div className="identity-bar">
      <span>👋 {site.text.guestHint}</span>
      {open ? (
        <span className="row gap">
          <input
            className="tiny"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="输入昵称（2-20 字）"
            onKeyDown={(e) => e.key === 'Enter' && save()}
            autoFocus
          />
          <button className="primary tiny" onClick={save}>
            保存
          </button>
          {err && <span className="error small">{err}</span>}
        </span>
      ) : (
        <button className="tiny" onClick={() => setOpen(true)}>
          {site.text.setNickname}
        </button>
      )}
    </div>
  );
}

export default function Layout() {
  const { actor, user, isAdmin, unread, pendingReports, logout, flash, dismissFlash } = useAuth();
  const [q, setQ] = useState('');
  const navigate = useNavigate();

  const search = (e) => {
    e.preventDefault();
    if (!q.trim()) return;
    navigate(`/search?q=${encodeURIComponent(q.trim())}`);
  };

  return (
    <div className="app">
      <header className="topbar">
        <div className="topbar-inner">
          <Link to="/" className="brand" title="回首页">
            <span className="brand-mark" aria-hidden="true">
              <svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M4 20h16" />
                <path d="M6 20V9l6-4 6 4v11" />
                <path d="M10 20v-5h4v5" />
              </svg>
            </span>
            <span className="brand-text">{site.name}</span>
          </Link>

          <nav className="nav">
            <NavLink to="/" end>
              {site.nav.home}
            </NavLink>
            <NavLink to="/me">{site.nav.me}</NavLink>
            {(isAdmin || pendingReports > 0) && (
              <NavLink to="/admin">
                {site.nav.admin}
                {pendingReports > 0 && <span className="dot-badge">{pendingReports}</span>}
              </NavLink>
            )}
          </nav>

          <form className="search" onSubmit={search}>
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder={site.nav.searchPlaceholder}
              aria-label="搜索"
            />
            <button type="submit">搜索</button>
          </form>

          <div className="account">
            {actor?.type === 'user' && (
              <NavLink to="/notifications" className="bell" title={unread > 0 ? `${unread} 条未读消息` : '消息通知'}>
                <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M18 8a6 6 0 1 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" />
                  <path d="M13.7 21a2 2 0 0 1-3.4 0" />
                </svg>
                {unread > 0 && <span className="dot-badge">{unread > 99 ? '99+' : unread}</span>}
              </NavLink>
            )}
            {actor?.type === 'user' ? (
              <>
                <NavLink to="/me" className="user-chip" title="进入个人中心">
                  <Avatar name={actor.name} url={user?.avatar} size={22} />
                  {user?.role === 'admin' ? '🛡 ' : ''}
                  {actor.name}
                </NavLink>
                <button
                  className="link"
                  onClick={async () => {
                    await logout();
                    navigate('/');
                  }}
                >
                  {site.nav.logout}
                </button>
              </>
            ) : actor?.name ? (
              <span className="user-chip guest" title="匿名访客">🎭 {actor.name}</span>
            ) : (
              <>
                <Link className="link" to="/login">
                  {site.nav.login}
                </Link>
                <Link className="link" to="/register">
                  {site.nav.register}
                </Link>
              </>
            )}
          </div>
        </div>
        <IdentityBar />
      </header>

      {user?.default_pw && (
        <div className="identity-bar warn-bar">
          <span>⚠️ 你正在使用默认管理员密码，公网上线前请务必修改。</span>
          <Link className="tiny-link" to="/me">
            去修改密码
          </Link>
        </div>
      )}

      {flash && (
        <div className={`flash ${flash.kind}`} onClick={dismissFlash}>
          {flash.message}
        </div>
      )}

      <main className="main">
        <Outlet />
      </main>

      <footer className="foot">
        <span>{site.name} · {site.tagline}</span>
        <span className="muted small">{site.footerNote}</span>
      </footer>
    </div>
  );
}
