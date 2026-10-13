import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../api.js';
import { useAuth } from '../store.jsx';
import { site } from '../site.js';

function AuthForm({ mode }) {
  const isLogin = mode === 'login';
  const [form, setForm] = useState({ username: '', password: '', confirm: '' });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const { refresh, notify, setGuestName } = useAuth();
  const [nick, setNick] = useState('');
  const navigate = useNavigate();

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    if (!isLogin && form.password !== form.confirm) {
      setError('两次输入的密码不一致');
      return;
    }
    setBusy(true);
    try {
      await api.post(`/api/auth/${isLogin ? 'login' : 'register'}`, {
        username: form.username,
        password: form.password,
      });
      await refresh();
      notify(isLogin ? '登录成功' : '注册成功，欢迎加入', 'ok');
      navigate('/');
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="page narrow">
      <div className="card form">
        <h1>{isLogin ? site.text.loginTitle : site.text.registerTitle}</h1>
        <p className="muted">
          {isLogin ? site.text.loginSubtitle : site.text.registerSubtitle}
        </p>
        <form onSubmit={submit}>
          <label>
            用户名
            <input
              value={form.username}
              onChange={(e) => setForm({ ...form, username: e.target.value })}
              autoComplete="username"
              placeholder="2-20 位中文、字母、数字、_ 或 -"
            />
          </label>
          <label>
            密码
            <input
              type="password"
              value={form.password}
              onChange={(e) => setForm({ ...form, password: e.target.value })}
              autoComplete={isLogin ? 'current-password' : 'new-password'}
              placeholder="至少 6 位"
            />
          </label>
          {!isLogin && (
            <label>
              确认密码
              <input
                type="password"
                value={form.confirm}
                onChange={(e) => setForm({ ...form, confirm: e.target.value })}
                autoComplete="new-password"
              />
            </label>
          )}
          {error && <div className="error">{error}</div>}
          <button className="primary block" type="submit" disabled={busy}>
            {busy ? '…' : isLogin ? site.text.loginSubmit : site.text.registerSubmit}
          </button>
        </form>
        <div className="muted small">
          {isLogin ? (
            <>
              还没有账号？<Link to="/register">立即注册</Link>
            </>
          ) : (
            <>
              已有账号？<Link to="/login">去登录</Link>
            </>
          )}
        </div>
      </div>

      <div className="card form">
        <h3>{site.text.guestSectionTitle}</h3>
        <p className="muted small">{site.text.guestSectionHint}</p>
        <div className="row gap">
          <input value={nick} onChange={(e) => setNick(e.target.value)} placeholder="昵称（2-20 字）" />
          <button
            onClick={async () => {
              try {
                await setGuestName(nick.trim());
                notify('昵称已保存', 'ok');
                navigate('/');
              } catch (err) {
                setError(err.message);
              }
            }}
            disabled={nick.trim().length < 2}
          >
            {site.text.guestUseName}
          </button>
        </div>
      </div>
    </div>
  );
}

export const Login = () => <AuthForm mode="login" />;
export const Register = () => <AuthForm mode="register" />;
