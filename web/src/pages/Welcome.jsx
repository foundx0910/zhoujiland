import React, { useEffect, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { site } from '../site.js';
import { useAuth } from '../store.jsx';

import { markEntered } from '../enter.js';

/** 开始界面：图标 + 昵称 + 进入按钮 */
export default function Welcome() {
  const { actor, user, setGuestName, refresh, notify } = useAuth();
  const [nick, setNick] = useState(actor?.name ?? '');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const navigate = useNavigate();
  const location = useLocation();

  // 从哪来的，进去之后回哪去（比如别人分享的帖子链接）
  const from = location.state?.from?.pathname
    ? `${location.state.from.pathname}${location.state.from.search ?? ''}`
    : '/';

  useEffect(() => {
    setNick((n) => n || actor?.name || '');
  }, [actor?.name]);

  // 已经登录的人（换了新浏览器也会看到本页）直接放行，不用再起昵称
  useEffect(() => {
    if (user) {
      markEntered();
      navigate(from, { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  const enter = async () => {
    const name = nick.trim();
    if (name.length < 2) {
      setErr('昵称至少 2 个字');
      return;
    }
    setBusy(true);
    setErr('');
    try {
      const me = await fetch('/api/auth/me', { credentials: 'same-origin' }).then((r) => r.json());
      // 已登录用户直接进，不用再设昵称
      if (me?.actor?.type !== 'user') {
        await setGuestName(name);
      }
      markEntered();
      await refresh();
      notify(`欢迎，${name}`, 'ok');
      navigate(from, { replace: true });
    } catch (e) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="welcome">
      <div className="welcome-card">
        <div className="welcome-icon">
          <img src={site.welcome.icon} alt={site.welcome.title} />
        </div>

        <h1 className="welcome-title">{site.welcome.title}</h1>
        <p className="welcome-sub">{site.welcome.subtitle}</p>

        <label className="welcome-label" htmlFor="welcome-nick">
          {site.welcome.nicknameLabel}
        </label>
        <input
          id="welcome-nick"
          className="welcome-input"
          value={nick}
          maxLength={20}
          placeholder={site.welcome.nicknamePlaceholder}
          onChange={(e) => setNick(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && enter()}
          autoFocus
        />

        {err && <div className="error small">{err}</div>}

        <button className="welcome-btn" onClick={enter} disabled={busy || nick.trim().length < 2}>
          {busy ? '…' : site.welcome.button}
        </button>

        <p className="welcome-hint">{site.welcome.hint}</p>

        <div className="welcome-foot">
          <button
            className="link"
            onClick={() => {
              markEntered();
              navigate(from, { replace: true });
            }}
          >
            {site.welcome.back}
          </button>
          <span className="muted small">
            {site.welcome.hasAccount} <Link to="/login">{site.welcome.login}</Link>
          </span>
        </div>
      </div>
    </div>
  );
}
