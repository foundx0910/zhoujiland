/**
 * 把 site.js 里的配色套到页面 CSS 变量上，并设置网页标题。
 * 一般不需要改这个文件——要改颜色请改 site.js。
 */
import { site } from './site.js';

const VAR_MAP = {
  accent: '--accent',
  accentSoft: '--accent-soft',
  bg: '--bg',
  card: '--bg-elevated',
  soft: '--bg-soft',
  border: '--border',
  borderStrong: '--border-strong',
  text: '--text',
  muted: '--text-muted',
};

export function applySiteTheme() {
  const media = window.matchMedia?.('(prefers-color-scheme: dark)');

  const apply = () => {
    const colors = media?.matches ? site.colors.dark : site.colors.light;
    const root = document.documentElement;
    for (const [key, cssVar] of Object.entries(VAR_MAP)) {
      const value = colors?.[key];
      if (value) root.style.setProperty(cssVar, value);
    }
    document.title = site.name;
  };

  apply();
  media?.addEventListener?.('change', apply);
}

export default applySiteTheme;
