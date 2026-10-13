import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, timeAgo } from '../api.js';
import { site } from '../site.js';
import Markdown from './Markdown.jsx';

/** 用户手动关闭过的公告（换一条/编辑过会重新出现） */
const closedKey = (a) => `zj_anno_closed_${a.id}_${a.updated_at}`;

function isClosed(a) {
  try {
    return localStorage.getItem(closedKey(a)) === '1';
  } catch {
    return false;
  }
}

/** 首页顶部公告横幅：管理员在后台发布，这里只负责显示 */
export default function AnnouncementBanner() {
  const [items, setItems] = useState([]);
  const [openId, setOpenId] = useState(null);

  useEffect(() => {
    let alive = true;
    api
      .get('/api/announcements')
      .then((d) => {
        if (!alive) return;
        setItems((d.items ?? []).filter((a) => !isClosed(a)));
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);

  if (!items.length) return null;

  const close = (a) => {
    try {
      localStorage.setItem(closedKey(a), '1');
    } catch {
      /* 隐私模式下写不了，忽略 */
    }
    setItems((list) => list.filter((x) => x.id !== a.id));
  };

  return (
    <div className="anno-wrap">
      {items.map((a) => (
        <div key={a.id} className={`anno anno-${a.level}`}>
          <span className="anno-icon" aria-hidden="true">
            {a.level === 'important' ? '📣' : '📢'}
          </span>

          <div className="anno-body">
            <div className="anno-head">
              <strong>{a.title}</strong>
              {a.level === 'important' && <span className="tag lock">{site.announce.levelImportant}</span>}
              <span className="muted small">{timeAgo(a.created_at)}</span>
              {a.link_url && (
                <a href={a.link_url} target="_blank" rel="noreferrer">
                  {a.link_text || site.announce.more}
                </a>
              )}
              {a.content && (
                <button className="btn-link" onClick={() => setOpenId(openId === a.id ? null : a.id)}>
                  {openId === a.id ? site.announce.collapse : site.announce.expand}
                </button>
              )}
            </div>
            {openId === a.id && a.content && (
              <div className="anno-content markdown">
                <Markdown text={a.content} />
              </div>
            )}
          </div>

          <button className="anno-close" title={site.announce.dismiss} onClick={() => close(a)}>
            ✕
          </button>
        </div>
      ))}

      <div className="anno-foot">
        <Link to="/announcements">{site.announce.all}</Link>
      </div>
    </div>
  );
}
