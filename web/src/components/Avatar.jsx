import React from 'react';

const COLORS = ['#2563eb', '#7c3aed', '#db2777', '#ea580c', '#0891b2', '#16a34a', '#ca8a04', '#4f46e5'];

/** 由用户名生成一个稳定的颜色（同一个名字永远同色） */
export function avatarColor(name = '') {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) % 9973;
  return COLORS[h % COLORS.length];
}

/**
 * 头像：有上传过就显示图片，否则显示「名字首字 + 稳定配色」的字母头像。
 */
export default function Avatar({ name = '', url = '', size = 40, title, className = '' }) {
  const box = { width: size, height: size, fontSize: Math.max(11, Math.round(size * 0.44)) };
  if (url) {
    return (
      <img
        className={`avatar ${className}`}
        src={url}
        alt={name}
        title={title ?? name}
        style={box}
        loading="lazy"
      />
    );
  }
  const ch = (name || '?').trim().slice(0, 1).toUpperCase() || '?';
  return (
    <span
      className={`avatar avatar-letter ${className}`}
      style={{ ...box, background: avatarColor(name) }}
      title={title ?? name}
      aria-hidden="true"
    >
      {ch}
    </span>
  );
}
