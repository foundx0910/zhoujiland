import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, timeAgo } from '../api.js';
import { site } from '../site.js';
import Markdown from './Markdown.jsx';

/** 用户关闭过的公告（同一条公告被编辑后会重新弹出） */
const closedKey = (a) => `zj_anno_closed_${a.id}_${a.updated_at}`;

function isClosed(a) {
  try {
    return localStorage.getItem(closedKey(a)) === '1';
  } catch {
    return false;
  }
}

function markClosed(list) {
  try {
    list.forEach((a) => localStorage.setItem(closedKey(a), '1'));
  } catch {
    /* 隐私模式写不了，忽略 */
  }
}

/**
 * 公告弹窗：进站时如果有没有关闭过的公告，就弹出来。
 * 关闭按钮在右下角；按 Esc 或点遮罩也能关。
 * 想改回顶部横幅：把 site.js 里 announce.style 改成 'banner'（'both' = 两个都要）。
 */
export default function AnnouncementModal() {
  const [items, setItems] = useState([]);
  const [preview, setPreview] = useState(false);

  const load = (ignoreClosed = false) =>
    api
      .get('/api/announcements')
      .then((d) => setItems((d.items ?? []).filter((a) => ignoreClosed || !isClosed(a))))
      .catch(() => {});

  useEffect(() => {
    load();
    // 后台「预览弹窗」按钮：不管有没有关过，直接弹出来看效果（关闭时不会记成"已读"）
    const onPreview = () => {
      setPreview(true);
      load(true);
    };
    window.addEventListener('zj:preview-anno', onPreview);
    return () => window.removeEventListener('zj:preview-anno', onPreview);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const close = () => {
    if (!preview) markClosed(items); // 预览模式下关闭，不记"已读"
    setPreview(false);
    setItems([]);
  };

  useEffect(() => {
    if (!items.length) return undefined;
    const onKey = (e) => {
      if (e.key === 'Escape') close();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items]);

  if (!items.length) return null;

  return (
    <div className="modal-mask" onClick={close}>
      <div className="modal anno-modal" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true">
        <div className="anno-modal-head">
          <span className="anno-icon" aria-hidden="true">
            📣
          </span>
          <h3>{site.announce.modalTitle}</h3>
        </div>

        <div className="anno-modal-body">
          {items.map((a) => (
            <article key={a.id} className={`anno-block ${a.level}`}>
              <div className="anno-head">
                <strong>{a.title}</strong>
                {a.level === 'important' && <span className="tag lock">{site.announce.levelImportant}</span>}
                <span className="muted small">{timeAgo(a.created_at)}</span>
              </div>
              {a.content && (
                <div className="markdown anno-content">
                  <Markdown text={a.content} />
                </div>
              )}
              {a.link_url && (
                <p>
                  <a href={a.link_url} target="_blank" rel="noreferrer">
                    {a.link_text || a.link_url}
                  </a>
                </p>
              )}
            </article>
          ))}
        </div>

        {/* 关闭按钮固定在右下角 */}
        <div className="modal-foot">
          <Link className="muted small" to="/announcements" onClick={close}>
            {site.announce.all}
          </Link>
          <button className="primary anno-close-btn" onClick={close} autoFocus>
            {site.announce.close}
          </button>
        </div>
      </div>
    </div>
  );
}
