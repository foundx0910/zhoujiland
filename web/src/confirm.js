/**
 * 站内确认框（替代浏览器原生 confirm）
 *
 * 为什么不用原生 confirm：
 *  - Chrome/Edge 勾过「禁止此页面弹出更多对话框」后，confirm() 会直接返回 false
 *  - 微信 / QQ / 部分 App 内嵌浏览器里原生弹框根本不显示
 *  这两种情况下 `if (!confirm(...)) return` 会让按钮看起来"点了没反应"。
 *
 * 用法：const ok = await askConfirm({ title, message, confirmText, danger });
 */

let handler = null;

/** ConfirmHost 挂载时注册自己；卸载时传 null */
export function setConfirmHandler(fn) {
  handler = typeof fn === 'function' ? fn : null;
}

export function askConfirm(opts = {}) {
  if (handler) return handler(opts);
  // 兜底：宿主没挂载时退回原生（至少不会静默什么都不做）
  if (typeof window !== 'undefined' && typeof window.confirm === 'function') {
    return Promise.resolve(window.confirm(opts.message ?? ''));
  }
  return Promise.resolve(false);
}
