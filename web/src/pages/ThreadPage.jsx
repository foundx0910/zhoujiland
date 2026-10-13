import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { api, loadWithCache, timeAgo, qs, fullTime } from '../api.js';
import { useAuth } from '../store.jsx';
import { site } from '../site.js';
import Editor from '../components/Editor.jsx';
import Pagination from '../components/Pagination.jsx';
import FloorCard from '../components/FloorCard.jsx';
import ReportDialog from '../components/ReportDialog.jsx';
import { askConfirm } from '../confirm.js';

export default function ThreadPage() {
  const { id } = useParams();
  const [sp, setSp] = useSearchParams();
  const page = Number(sp.get('page') || 1);
  const order = sp.get('order') === 'desc' ? 'desc' : 'asc';
  const size = Number(sp.get('size') || 50); // 每页显示多少层楼

  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [reply, setReply] = useState(null); // 正在回复的目标楼层
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const [reporting, setReporting] = useState(null); // 正在举报的目标（楼层或主题）
  const { canSpeak, isAdmin, actor, notify } = useAuth();
  const scrollTo = useRef(null);
  const editorRef = useRef(null);

  const patch = (next) => setSp(qs({ page: String(page), order, size: String(size), ...next }));

  const load = useCallback(
    async (force = false) => {
      try {
        // ttl 很短：悬停预取过的会立刻显示，同时后台拉最新（浏览数、新楼层都不会滞后）
        await loadWithCache(`/api/threads/${id}${qs({ page, order, size })}`, setData, { ttl: 1500, force });
      } catch (e) {
        setError(e.message);
      }
    },
    [id, page, order, size]
  );

  useEffect(() => {
    setData(null);
    load();
  }, [load]);

  useEffect(() => {
    if (data && scrollTo.current) {
      const el = document.getElementById(scrollTo.current);
      scrollTo.current = null;
      if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }, [data]);

  const submitReply = async () => {
    if (!draft.trim()) return;
    setBusy(true);
    setError('');
    try {
      const body = { content: draft };
      if (reply) body.parentId = reply.parent_id ?? reply.id;
      const res = await api.post(`/api/threads/${id}/posts`, body);
      setDraft('');
      setReply(null);
      notify(res.floor_no ? `已发布 ${res.floor_no} 楼` : '楼中楼回复成功', 'ok');

      const isNewFloor = !!res.floor_no;
      if (isNewFloor) scrollTo.current = `floor-${res.floor_no}`;
      else scrollTo.current = `post-${res.post.id}`;

      const total = data.thread.floor_count + (isNewFloor ? 1 : 0);
      const pages = Math.max(1, Math.ceil(total / data.pagination.size));
      const targetPage = order === 'asc' ? pages : 1;
      if (targetPage !== page) {
        patch({ page: targetPage });
      } else {
        await load(true); // 强制刷新，保证能看到刚发的楼层
      }
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  const onLike = async (post) => {
    const d = await api.post(`/api/threads/${id}/like`, { postId: post.id });
    setData((prev) => ({
      ...prev,
      floors: prev.floors.map((f) => {
        if (f.id === post.id) return { ...f, liked: d.liked, likes: d.likes };
        return {
          ...f,
          replies: f.replies.map((r) => (r.id === post.id ? { ...r, liked: d.liked, likes: d.likes } : r)),
        };
      }),
    }));
  };

  const onDelete = async (post) => {
    const ok = await askConfirm({
      title: post.floor_no ? `删除 ${post.floor_no} 楼` : '删除这条回复',
      message: post.floor_no
        ? `确定删除 ${post.floor_no} 楼吗？`
        : '确定删除这条楼中楼回复吗？',
      hint: post.floor_no ? '楼中楼回复会保留，楼层号会留一个占位。' : '',
      confirmText: '删除',
      danger: true,
    });
    if (!ok) return;
    try {
      await api.del(`/api/posts/${post.id}`);
      notify('已删除', 'ok');
      load(true);
    } catch (e) {
      notify(e.message || '删除失败，请稍后再试', 'error');
    }
  };

  const onEdit = async (post, content) => {
    try {
      await api.patch(`/api/posts/${post.id}`, { content });
      notify('已保存修改', 'ok');
      load(true);
    } catch (e) {
      notify(e.message || '保存失败，请稍后再试', 'error');
    }
  };

  const onReply = (post) => {
    setReply(post);
    const el = document.getElementById('reply-box');
    el?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    setTimeout(() => editorRef.current?.querySelector('textarea')?.focus(), 250);
  };

  const threadAction = async (payload, label) => {
    await api.patch(`/api/threads/${id}`, payload);
    notify(label, 'ok');
    load(true);
  };

  const deleteThread = async () => {
    const ok = await askConfirm({
      title: '删除整个帖子',
      message: '确定删除整个帖子吗？',
      hint: '帖子连同下面所有楼层都会消失（管理员仍可恢复）。',
      confirmText: '删除本帖',
      danger: true,
    });
    if (!ok) return;
    try {
      await api.del(`/api/threads/${id}`);
      notify('帖子已删除', 'ok');
      window.location.href = '/';
    } catch (e) {
      notify(e.message || '删除失败，请稍后再试', 'error');
    }
  };

  if (error && !data) return <div className="error">{error}</div>;
  if (!data) return <div className="muted">加载中…</div>;

  const { thread, floors, pagination } = data;
  const replyToName = reply?.author?.name ?? '';
  const replyToLabel = reply?.floor_no ? `${reply.floor_no} 楼` : '楼中楼';

  return (
    <div className="page">
      <div className="crumbs muted small">
        <Link to="/">板块</Link> / <Link to={`/b/${thread.board_slug}`}>{thread.board_name}</Link> / <span>帖子</span>
      </div>

      <div className="thread-head card">
        <h1>
          {thread.pinned && <span className="tag pin">置顶</span>}
          {thread.locked && <span className="tag lock">已锁定</span>}
          {thread.title}
        </h1>
        <div className="muted small row wrap gap">
          <span>{thread.author.type === 'user' ? '👤' : '🎭'} {thread.author.name}</span>
          <span>发布于 {fullTime(thread.created_at)}</span>
          <span>{thread.views} 次浏览</span>
          <span>{thread.floor_count} 层楼</span>
          <span>{thread.reply_count} 条回复</span>
        </div>
        <div className="actions">
          <button onClick={() => patch({ order: order === 'asc' ? 'desc' : 'asc' })}>
            {order === 'asc' ? site.text.orderAsc : site.text.orderDesc}
          </button>
          <span className="muted small">每页</span>
          <select
            value={size}
            onChange={(e) => patch({ size: e.target.value, page: 1 })}
            title="每页显示多少层楼"
          >
            <option value={20}>20 层</option>
            <option value={50}>50 层</option>
            <option value={100}>100 层</option>
            <option value={200}>200 层</option>
          </select>
          {(isAdmin || thread.can_moderate) && (
            <>
              <button onClick={() => threadAction({ pinned: !thread.pinned }, thread.pinned ? '已取消置顶' : '已置顶')}>
                {thread.pinned ? '取消置顶' : '📌 置顶'}
              </button>
              <button onClick={() => threadAction({ locked: !thread.locked }, thread.locked ? '已解锁' : '已锁定')}>
                {thread.locked ? '🔓 解锁' : '🔒 锁定'}
              </button>
            </>
          )}
          {(isAdmin || thread.can_moderate || thread.author.is_me) && (
            <button className="danger" onClick={deleteThread}>
              🗑 删除本帖
            </button>
          )}
          <button onClick={() => setReporting({ targetType: 'thread', targetId: thread.id })}>{site.text.reportThreadButton}</button>
        </div>
      </div>

      {error && <div className="error">{error}</div>}

      <div className="floors">
        {floors.map((f) => (
          <FloorCard
            key={f.id}
            floor={f}
            onReply={onReply}
            onLike={onLike}
            onDelete={onDelete}
            onEdit={onEdit}
            onReport={(f) => setReporting({ targetType: 'post', targetId: f.id })}
          />
        ))}
      </div>

      <Pagination
        page={pagination.page}
        pages={pagination.pages}
        total={pagination.total}
        label="层"
        onChange={(p) => patch({ page: p })}
      />

      <div className="card reply-box" id="reply-box" ref={editorRef}>
        <div className="row between">
          <h3>{reply ? `回复 ${replyToLabel}${replyToName ? ` · @${replyToName}` : ''}` : site.text.replyTitle}</h3>
          {reply && (
            <button className="tiny" onClick={() => setReply(null)}>
              {site.text.replyCancel}
            </button>
          )}
        </div>

        <Editor
          value={draft}
          onChange={setDraft}
          onSubmit={submitReply}
          submitLabel={busy ? '…' : reply ? site.text.replySubSubmit : site.text.replySubmit}
          disabled={!canSpeak || (thread.locked && !(isAdmin || thread.can_moderate))}
          disabledHint={
            !canSpeak
              ? site.text.needIdentity
              : thread.locked && !(isAdmin || thread.can_moderate)
                ? site.text.lockedHint
                : ''
          }
        />
        {reply && (
          <div className="quote-hint muted small">
            将显示为「回复 {replyToLabel}」{actor?.name ? ` · 回复人：${actor.name}` : ''}
          </div>
        )}
      </div>

      <div className="muted small center">
        <Link to={`/b/${thread.board_slug}`}>← 返回「{thread.board_name}」</Link>
      </div>

      {reporting && (
        <ReportDialog
          targetType={reporting.targetType}
          targetId={reporting.targetId}
          onClose={() => setReporting(null)}
        />
      )}
    </div>
  );
}
