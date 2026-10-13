/**
 * 「进站标记」：决定开始界面什么时候再出现。
 * 显示频率由 site.js 的 welcome.show 控制：
 *   'once'    只显示一次（默认，记在 localStorage）
 *   'session' 每个浏览器会话显示一次（关掉浏览器再打开会再看到）
 *   'always'  每次重新打开/刷新页面都显示（应用内跳转不重复弹）
 */
import { site } from './site.js';

export const ENTERED_KEY = 'zj_entered';

/** 'always' 模式用的内存标记：刷新页面就没了，所以每次打开都会看到 */
let memoryEntered = false;

function mode() {
  return site.welcome?.show ?? 'once';
}

export function hasEntered() {
  if (memoryEntered) return true;
  if (mode() === 'always') return false;
  try {
    const box = mode() === 'session' ? window.sessionStorage : window.localStorage;
    return box.getItem(ENTERED_KEY) === '1';
  } catch {
    // 隐私模式等读写异常时不要拦着人
    return true;
  }
}

export function markEntered() {
  memoryEntered = true;
  if (mode() === 'always') return;
  try {
    const box = mode() === 'session' ? window.sessionStorage : window.localStorage;
    box.setItem(ENTERED_KEY, '1');
  } catch {
    /* 忽略 */
  }
}

/** 让开始界面再出现一次（个人中心/页脚里的「重看进入界面」用） */
export function resetEntered() {
  memoryEntered = false;
  try {
    window.localStorage.removeItem(ENTERED_KEY);
    window.sessionStorage.removeItem(ENTERED_KEY);
  } catch {
    /* 忽略 */
  }
}
