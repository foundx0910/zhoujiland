import React, { useEffect, useState } from 'react';
import { Link, NavLink, Navigate, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../store.jsx';
import { site } from '../site.js';
import Avatar from './Avatar.jsx';
import { hasEntered, resetEntered } from '../enter.js';
import ConfirmHost from './ConfirmDialog.jsx';
import AnnouncementBanner from './AnnouncementBanner.jsx';
import AnnouncementModal from './AnnouncementModal.jsx';

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
  const location = useLocation();

  const entered = hasEntered();

  /**
   * 站内链接改成"新标签页打开"。
   * 这里用全局事件代理，所以帖子正文里的 Markdown 链接也一并生效。
   * 想关掉：把 site.js 里的 linksOpenInNewTab 改成 false。
   * 个别链接想原地跳转：给它加 data-no-new-tab="true"。
   */
  useEffect(() => {
    if (!site.linksOpenInNewTab) return undefined;
    const onClick = (e) => {
      if (e.defaultPrevented || e.button !== 0) return;
      if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return; // 用户自己想开新标签
      const a = e.target?.closest?.('a');
      if (!a || a.target || a.hasAttribute('download')) return;
      if (a.dataset.noNewTab === 'true') return;
      const href = a.getAttribute('href');
      if (!href || href.startsWith('#')) return;

      let url;
      try {
        url = new URL(a.href, location.href);
      } catch {
        return;
      }
      if (url.origin !== location.origin) return; // 外链按原样处理
      // 同一页面的锚点（比如跳到 #floor-3）就交给浏览器滚动
      if (url.pathname === location.pathname && url.search === location.search) return;

      e.preventDefault();
      window.open(url.href, '_blank', 'noopener');
    };
    document.addEventListener('click', onClick);
    return () => document.removeEventListener('click', onClick);
  }, [location.pathname, location.search]);

  // 还没进过站：先去开始界面（显示频率由 site.js 的 welcome.show 决定）
  if (!entered) {
    return <Navigate to="/welcome" replace state={{ from: location }} />;
  }

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

      {user?.role === 'admin' && user?.default_pw && (
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

      <ConfirmHost />

      {site.announce.style !== 'modal' && <AnnouncementBanner />}
      {site.announce.style !== 'banner' && <AnnouncementModal />}

      <main className="main">
        <Outlet />
      </main>

      <footer className="foot">
        <span>{site.name} · {site.tagline}</span>
        <span className="muted small">
          <Link to="/announcements">{site.announce.navLabel}</Link> ·{' '}
          <button
            className="btn-link"
            onClick={() => {
              resetEntered();
              navigate('/welcome');
            }}
          >
            重看进入界面
          </button>{' '}
          · {site.footerNote} · <span title="当前前端版本">v{typeof __BUILD__ === 'undefined' ? 'dev' : __BUILD__}</span>
        </span>
      </footer>
    </div>
  );
}
