import React, { useEffect, useRef, useState } from 'react';
import Markdown from './Markdown.jsx';
import { api } from '../api.js';
import { normalizeImage } from '../imageUtils.js';
import { site } from '../site.js';

const EMOJIS = ['😀', '😄', '😁', '😂', '🤣', '😊', '😉', '😍', '🤔', '😅', '😭', '😡', '👍', '👎', '🙏', '👏', '🎉', '🔥', '💯', '❤️', '✨', '🤝', '🐶', '🐱', '🍜', '☕️', '🚀', '⚠️', '✅', '❌'];

/**
 * Markdown 编辑器：支持图片上传、表情、实时预览，Ctrl/Cmd + Enter 提交。
 */
export default function Editor({
  value,
  onChange,
  onSubmit,
  submitLabel = '发布',
  placeholder = site.text.editorPlaceholder,
  disabled = false,
  disabledHint = '',
  minRows = 5,
  compact = false,
  extra,
}) {
  const areaRef = useRef(null);
  const fileRef = useRef(null);
  const [tab, setTab] = useState('write');
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');
  const [showEmoji, setShowEmoji] = useState(false);
  // 图片列表：每项都带一个本地 objectURL，选完图立刻就能看到，不等上传完成
  const [shots, setShots] = useState([]);
  const shotsRef = useRef([]);
  shotsRef.current = shots;

  // 卸载时释放本地预览地址，避免内存泄漏
  useEffect(
    () => () => {
      shotsRef.current.forEach((s) => s.localUrl && URL.revokeObjectURL(s.localUrl));
    },
    []
  );

  const insert = (snippet, selectOffset) => {
    const el = areaRef.current;
    const text = value ?? '';
    if (!el) {
      onChange(text + snippet);
      return;
    }
    const start = el.selectionStart ?? text.length;
    const end = el.selectionEnd ?? text.length;
    const next = text.slice(0, start) + snippet + text.slice(end);
    onChange(next);
    requestAnimationFrame(() => {
      el.focus();
      const pos = start + (selectOffset ?? snippet.length);
      el.setSelectionRange(pos, pos);
    });
  };

  const uploadImage = async (file) => {
    if (!file) return;
    setError('');
    setUploading(true);

    // ① 本地预览：用 objectURL 立刻显示，上传/传播都还没完成也能看见
    const id = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
    const localUrl = URL.createObjectURL(file);
    setShots((prev) => [{ id, localUrl, name: file.name, status: 'uploading', note: '' }, ...prev].slice(0, 4));

    const patch = (fields) =>
      setShots((prev) => prev.map((s) => (s.id === id ? { ...s, ...fields } : s)));

    try {
      // ② 归一化：手机 HEIC 原图 / 超大图会被转成 JPEG 并压缩
      const { blob, name, converted, note } = await normalizeImage(file);
      patch({ name, note: converted && note ? note : '正在上传…' });
      // ③ 真正上传
      const d = await api.upload(blob, name);
      insert(`\n![${name}](${d.url})\n`);
      patch({ status: 'done', url: d.url, note: converted && note ? note : '' });
    } catch (e) {
      setError(e.message);
      patch({ status: 'error', error: e.message, note: '' });
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  const onPaste = (e) => {
    const item = [...(e.clipboardData?.items ?? [])].find((i) => i.type.startsWith('image/'));
    if (item) {
      e.preventDefault();
      uploadImage(item.getAsFile());
    }
  };

  return (
    <div className={`editor ${compact ? 'editor-compact' : ''}`}>
      <div className="editor-tabs">
        <button type="button" className={tab === 'write' ? 'on' : ''} onClick={() => setTab('write')}>
          编辑
        </button>
        <button type="button" className={tab === 'preview' ? 'on' : ''} onClick={() => setTab('preview')}>
          预览
        </button>
        <div className="editor-tools">
          <button type="button" title="插入图片" onClick={() => fileRef.current?.click()} disabled={disabled || uploading}>
            {uploading ? '上传中…' : '🖼 图片'}
          </button>
          <button type="button" title="表情" onClick={() => setShowEmoji((v) => !v)} disabled={disabled}>
            😊 表情
          </button>
          <button type="button" title="加粗" onClick={() => insert('**加粗文字**', 2)} disabled={disabled}>
            B
          </button>
          <button type="button" title="引用" onClick={() => insert('\n> 引用内容\n')} disabled={disabled}>
            ❝
          </button>
          <button type="button" title="代码块" onClick={() => insert('\n```\n代码\n```\n')} disabled={disabled}>
            {'</>'}
          </button>
        </div>
      </div>

      {showEmoji && (
        <div className="emoji-pop">
          {EMOJIS.map((e) => (
            <button key={e} type="button" onClick={() => insert(e)}>
              {e}
            </button>
          ))}
        </div>
      )}

      {tab === 'write' ? (
        <textarea
          ref={areaRef}
          value={value}
          rows={minRows}
          placeholder={placeholder}
          disabled={disabled}
          onChange={(e) => onChange(e.target.value)}
          onPaste={onPaste}
          onKeyDown={(e) => {
            if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
              e.preventDefault();
              if (!disabled) onSubmit?.();
            }
          }}
        />
      ) : (
        <div className="editor-preview">
          {value?.trim() ? <Markdown text={value} /> : <p className="muted">（暂无内容）</p>}
        </div>
      )}

      <input
        ref={fileRef}
        type="file"
        accept="image/png,image/jpeg,image/gif,image/webp"
        hidden
        onChange={(e) => uploadImage(e.target.files?.[0])}
      />

      {shots.length > 0 && (
        <div className="shot-strip">
          <span className="muted small">图片预览：</span>
          {shots.map((s) => (
            <span key={s.id} className={`shot ${s.status}`}>
              {s.url ? (
                <a href={s.url} target="_blank" rel="noreferrer" title={`${s.name}（点击查看原图）`}>
                  <img src={s.localUrl} alt={s.name} />
                </a>
              ) : (
                <img src={s.localUrl} alt={s.name} />
              )}
              <i className="shot-badge">
                {s.status === 'uploading' ? '上传中…' : s.status === 'done' ? '✓ 已上传' : '✗ 失败'}
              </i>
            </span>
          ))}
          <span className="muted small">
            {shots.some((s) => s.status === 'uploading') && '本地预览马上就能看到；'}
            {shots.some((s) => s.status === 'done') && '上传成功的图大约 1 分钟内对其他人可见；'}
            {shots.find((s) => s.status === 'error')?.error ? `失败原因：${shots.find((s) => s.status === 'error').error}` : ''}
          </span>
        </div>
      )}

      {error && <div className="error small">{error}</div>}
      {disabled && disabledHint && <div className="muted small">{disabledHint}</div>}

      {onSubmit && (
        <div className="editor-foot">
          <span className="muted small">{site.text.editorHint}</span>
          <div className="row gap">
            {extra}
            <button className="primary" type="button" onClick={onSubmit} disabled={disabled || uploading}>
              {submitLabel}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
