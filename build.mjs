/**
 * 构建 / 开发脚本。
 * 说明：本机环境下 vite 读取独立配置文件时会卡住（配置文件打包流程问题），
 * 因此这里改用 Vite 的 JS API 传入内联配置，效果与 vite.config.js 完全一致。
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { build, createServer } from 'vite';
import react from '@vitejs/plugin-react';
import { site } from './web/src/site.js';

/** 把 web/src/site.js 里的站点名与标语注入到 index.html（浏览器标签、分享卡片都用它） */
const siteConfigPlugin = () => ({
  name: 'site-config-html',
  transformIndexHtml(html) {
    return html
      .replace(/%SITE_NAME%/g, site.name)
      .replace(/%SITE_TAGLINE%/g, site.tagline);
  },
});

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const mode = process.argv[2] || 'build';

const inlineConfig = {
  root: path.join(__dirname, 'web'),
  plugins: [react(), siteConfigPlugin()],
  build: {
    outDir: path.join(__dirname, 'dist'),
    emptyOutDir: true,
    // 降到 ES2019 / Safari 13：老款手机浏览器不会因为看不懂新语法而整页白屏
    target: ['es2019', 'safari13', 'chrome79', 'firefox72', 'edge79'],
    cssTarget: 'safari13',
  },
  server: {
    port: 5173,
    proxy: {
      '/api': 'http://127.0.0.1:3000',
      '/uploads': 'http://127.0.0.1:3000',
    },
  },
};

if (mode === 'dev') {
  const server = await createServer({ ...inlineConfig, configFile: false });
  await server.listen();
  server.printUrls();
} else {
  await build({ ...inlineConfig, configFile: false });
  console.log('[forum] 前端已构建到 dist/，运行 npm start 启动服务。');
}
