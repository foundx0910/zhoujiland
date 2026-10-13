import React from 'react';

export default function Pagination({ page, pages, total, onChange, label = '条' }) {
  if (!pages || pages <= 1) {
    return total ? <div className="muted small center">共 {total} {label}</div> : null;
  }
  const nums = [];
  const push = (n) => nums.push(n);
  const from = Math.max(1, page - 2);
  const to = Math.min(pages, from + 4);
  for (let i = from; i <= to; i++) push(i);
  if (from > 1) nums.unshift(1, '…');
  if (to < pages) nums.push('…', pages);

  return (
    <nav className="pagination">
      <button type="button" disabled={page <= 1} onClick={() => onChange(page - 1)}>
        上一页
      </button>
      {nums.map((n, i) =>
        n === '…' ? (
          <span key={`e${i}`} className="muted">
            …
          </span>
        ) : (
          <button
            key={n}
            type="button"
            className={n === page ? 'on' : ''}
            onClick={() => n !== page && onChange(n)}
          >
            {n}
          </button>
        )
      )}
      <button type="button" disabled={page >= pages} onClick={() => onChange(page + 1)}>
        下一页
      </button>
      <span className="muted small">
        第 {page} / {pages} 页 · 共 {total} {label}
      </span>
    </nav>
  );
}
