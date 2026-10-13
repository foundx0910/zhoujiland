import React, { useMemo } from 'react';
import { marked } from 'marked';
import DOMPurify from 'dompurify';

marked.setOptions({ gfm: true, breaks: true });

/** 把 Markdown 渲染成经过消毒的 HTML */
export default function Markdown({ text, className = '' }) {
  const html = useMemo(() => {
    try {
      const raw = marked.parse(text ?? '', { async: false });
      const clean = DOMPurify.sanitize(raw, { ADD_ATTR: ['target'] });
      // 图片懒加载：长帖子里没滚到的图片不占带宽
      return clean.replace(/<img /g, '<img loading="lazy" decoding="async" ');
    } catch {
      return '<p>（内容解析失败）</p>';
    }
  }, [text]);

  return <div className={`md ${className}`} dangerouslySetInnerHTML={{ __html: html }} />;
}

/** 列表用的纯文本摘要 */
export function plain(text, len = 120) {
  const s = String(text ?? '')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, '[图片]')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/[#>*`_~-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return s.length > len ? `${s.slice(0, len)}…` : s;
}
