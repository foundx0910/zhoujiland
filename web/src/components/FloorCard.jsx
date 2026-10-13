import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import Markdown from './Markdown.jsx';
import Editor from './Editor.jsx';
import Avatar from './Avatar.jsx';
import { fullTime, timeAgo } from '../api.js';
import { site } from '../site.js';

function AuthorTag({ author }) {
  const name = author.type === 'user' ? '👤' : '🎭';
  return (
    <>
      <span className={`author ${author.type === 'user' ? 'reg' : 'anon'}`}>
        {author.user_id ? (
          <Link to={`/u/${author.user_id}`} title={`${author.name} 的个人主页`}>
            {author.name}
          </Link>
        ) : (
          <>
            {name} {author.name}
          </>
        )}
      </span>
      {author.is_admin && <span className="tag admin">管理员</span>}
      {author.is_op && <span className="tag op">楼主</span>}
      {author.is_me && <span className="tag me">我</span>}
    </>
  );
}

/** 楼层左侧的头像（只有注册用户有） */
function FloorAvatar({ author, size = 46 }) {
  if (author.type !== 'user') {
    return <Avatar name={author.name} size={size} className="avatar-anon" />;
  }
  return <Avatar name={author.name} url={author.avatar} size={size} />;
}

function ReplyItem({ reply, onReply, onLike, onDelete, onEdit, onReport }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(reply.content);

  return (
    <div className={`subreply ${reply.deleted ? 'deleted' : ''}`} id={`post-${reply.id}`}>
      <div className="subreply-head">
        <AuthorTag author={reply.author} />
        {reply.quote && (
          <span className="quote-ref">
            回复 {reply.quote.floor_no ? `${reply.quote.floor_no} 楼` : '楼中楼'}
            {reply.quote.author ? ` @${reply.quote.author}` : ''}
          </span>
        )}
        <time title={fullTime(reply.created_at)}>{timeAgo(reply.created_at)}</time>
      </div>

      {reply.deleted ? (
        <div className="muted small">该回复已被删除</div>
      ) : editing ? (
        <div>
          <Editor value={draft} onChange={setDraft} minRows={3} compact />
          <div className="row gap end">
            <button className="tiny" onClick={() => setEditing(false)}>
              取消
            </button>
            <button
              className="primary tiny"
              onClick={async () => {
                await onEdit(reply, draft);
                setEditing(false);
              }}
              disabled={!draft.trim()}
            >
              保存
            </button>
          </div>
        </div>
      ) : (
        <Markdown text={reply.content} />
      )}

      {!reply.deleted && !editing && (
        <div className="actions small">
          <button className={reply.liked ? 'liked' : ''} onClick={() => onLike(reply)}>
            👍 {reply.likes || ''}
          </button>
          <button onClick={() => onReply(reply)}>回复</button>
          {reply.author.is_me && <button onClick={() => setEditing(true)}>编辑</button>}
          {reply.can_delete && <button className="danger" onClick={() => onDelete(reply)}>删除</button>}
          {!reply.author.is_me && <button onClick={() => onReport(reply)}>{site.text.reportButton}</button>}
        </div>
      )}
    </div>
  );
}

export default function FloorCard({ floor, onReply, onLike, onDelete, onEdit, onReport }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(floor.content);

  return (
    <article className={`floor ${floor.deleted ? 'deleted' : ''}`} id={`floor-${floor.floor_no}`}>
      <span id={`post-${floor.id}`} className="anchor" />
      <div className="floor-side">
        <div className={`floor-no ${floor.floor_no === 1 ? 'first' : ''}`}>
          {floor.floor_no === 1 ? '楼主' : `${floor.floor_no} 楼`}
        </div>
        {floor.author.type === 'user' && (
          <Link to={`/u/${floor.author.user_id}`} className="floor-avatar">
            <FloorAvatar author={floor.author} />
          </Link>
        )}
        <div className="floor-author">
          <AuthorTag author={floor.author} />
        </div>
        <time className="muted small" title={fullTime(floor.created_at)}>
          {timeAgo(floor.created_at)}
        </time>
      </div>

      <div className="floor-body">
        {floor.deleted ? (
          <div className="muted">该楼层已被删除（楼层号仍保留）</div>
        ) : editing ? (
          <div>
            <Editor value={draft} onChange={setDraft} minRows={4} compact />
            <div className="row gap end">
              <button className="tiny" onClick={() => setEditing(false)}>
                取消
              </button>
              <button
                className="primary tiny"
                onClick={async () => {
                  await onEdit(floor, draft);
                  setEditing(false);
                }}
                disabled={!draft.trim()}
              >
                保存修改
              </button>
            </div>
          </div>
        ) : (
          <>
            <Markdown text={floor.content} />
            {floor.updated_at !== floor.created_at && <div className="muted small">（已编辑）</div>}
            {floor.author.type === 'user' && floor.author.bio && (
              <div className="signature">{floor.author.bio}</div>
            )}
          </>
        )}

        {!floor.deleted && !editing && (
          <div className="actions">
            <button className={floor.liked ? 'liked' : ''} onClick={() => onLike(floor)}>
              👍 赞 {floor.likes ? `(${floor.likes})` : ''}
            </button>
            <button onClick={() => onReply(floor)}>💬 回复本层</button>
            {floor.author.is_me && <button onClick={() => setEditing(true)}>✏️ 编辑</button>}
            {floor.can_delete && (
              <button className="danger" onClick={() => onDelete(floor)}>
                🗑 删除
              </button>
            )}
            {!floor.author.is_me && <button onClick={() => onReport(floor)}>{site.text.reportButton}</button>}
            <span className="muted small">#{floor.id}</span>
          </div>
        )}

        {floor.replies?.length > 0 && (
          <div className="subreplies">
            <div className="subreplies-title muted small">
              楼中楼 · {floor.replies.filter((r) => !r.deleted).length} 条回复
            </div>
            {floor.replies.map((r) => (
              <ReplyItem
                key={r.id}
                reply={r}
                onReply={onReply}
                onLike={onLike}
                onDelete={onDelete}
                onEdit={onEdit}
                onReport={onReport}
              />
            ))}
          </div>
        )}
      </div>
    </article>
  );
}
