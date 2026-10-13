import React, { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api, loadWithCache, timeAgo } from '../api.js';
import { useAuth } from '../store.jsx';
import { site } from '../site.js';

export default function Boards() {
  const [boards, setBoards] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ name: '', description: '' });
  const { canSpeak, notify } = useAuth();
  const navigate = useNavigate();

  const load = async (force = false) => {
    try {
      // 有缓存先秒出，再后台刷新
      await loadWithCache('/api/boards', (d) => setBoards(d.boards), { ttl: 30000, force });
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    let alive = true;
    // HTML 里的抢跑请求（和 JS 下载并行），拿到就直接渲染并塞进缓存
    const boot = typeof window !== 'undefined' ? window.__BOARDS__ : null;
    const start = async () => {
      if (boot) {
        try {
          const d = await boot;
          if (alive && d?.boards) {
            setBoards(d.boards);
            setLoading(false);
            api.prime('/api/boards', d); // 后面的 load() 直接用这份，不再多发一次请求
          }
        } catch {
          /* 抢跑失败就走正常加载 */
        }
      }
      if (alive) load();
    };
    start();
    return () => {
      alive = false;
    };
  }, []);

  const create = async (e) => {
    e.preventDefault();
    try {
      setError('');
      const d = await api.post('/api/boards', form);
      notify(`板块「${d.board.name}」已创建`, 'ok');
      navigate(`/b/${d.board.slug}`);
    } catch (err) {
      setError(err.message);
    }
  };

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>{site.text.homeTitle}</h1>
          <p className="muted">{site.text.homeSubtitle}</p>
        </div>
        <button className="primary" onClick={() => setShowForm((v) => !v)}>
          {showForm ? site.text.newBoardCancel : site.text.newBoard}
        </button>
      </div>

      {showForm && (
        <form className="card form" onSubmit={create}>
          <h3>{site.text.newBoardTitle}</h3>
          <label>
            {site.text.newBoardNameLabel}
            <input
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder={site.text.newBoardNamePlaceholder}
              maxLength={30}
            />
          </label>
          <label>
            {site.text.newBoardDescLabel}
            <input
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              placeholder={site.text.newBoardDescPlaceholder}
              maxLength={200}
            />
          </label>
          {!canSpeak && <div className="muted small">{site.text.newBoardNeedIdentity}</div>}
          <div className="row gap end">
            <button type="button" onClick={() => setShowForm(false)}>
              取消
            </button>
            <button className="primary" type="submit" disabled={!canSpeak || form.name.trim().length < 2}>
              开张！
            </button>
          </div>
        </form>
      )}

      {error && <div className="error">{error}</div>}
      {loading ? (
        <div className="muted">加载中…</div>
      ) : (
        <div className="board-grid">
          {boards.map((b) => (
            <Link className="board-card" key={b.id} to={`/b/${b.slug}`}>
              <div className="board-card-head">
                <h3>{b.name}</h3>
                <span className="badge">{b.thread_count} 帖</span>
              </div>
              <p className="muted">{b.description || '还没写简介'}</p>
              <div className="board-card-foot muted small">
                <span>{b.post_count} 层回复</span>
                <span>最近活动：{b.last_active_at ? timeAgo(b.last_active_at) : '暂无'}</span>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
