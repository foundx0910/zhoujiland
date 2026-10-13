/**
 * 数据导出 / 搬家脚本（把线上 Cloudflare D1 的数据搬到本地或自建服务器）
 *
 *   node scripts/export-d1.mjs              # 从线上 D1 导出 SQL 到 backup/ 目录
 *   node scripts/export-d1.mjs --import     # 导出后顺便灌进本地 data/forum.db
 *
 * 典型用途：以后要把论坛搬到香港 VPS / 国内服务器时，
 *   1. 在装好 Cloudflare 账号的机器上跑一次导出
 *   2. 把 backup/*.sql 和 data 一起拷到新服务器
 *   3. 在新服务器上 npm run import-db（见下）
 */
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const BACKUP_DIR = path.join(ROOT, 'backup');
const DATA_DIR = process.env.FORUM_DATA_DIR || path.join(ROOT, 'data');
const DB_FILE = path.join(DATA_DIR, 'forum.db');

const stamp = new Date().toISOString().slice(0, 10).replace(/-/g, '');
const outFile = path.join(BACKUP_DIR, `forum-${stamp}.sql`);

fs.mkdirSync(BACKUP_DIR, { recursive: true });

console.log('⚠️  导出的 SQL 包含真实用户数据（含密码哈希），已被 .gitignore 忽略。');
console.log('⚠️  千万不要把它提交到 git 仓库，尤其是公开仓库。');
console.log('▶ 正在从线上 D1 导出数据（需要已登录 Cloudflare）…');
const res = spawnSync(
  process.execPath,
  ['node_modules/wrangler/bin/wrangler.js', 'd1', 'export', 'floor-forum', '--remote', `--output=${outFile}`],
  { cwd: ROOT, stdio: 'inherit' }
);

if (res.status !== 0) {
  console.error('❌ 导出失败。确认已经 `npx wrangler login`，且 wrangler.toml 里的 D1 配置正确。');
  process.exit(1);
}

const size = fs.statSync(outFile).size;
console.log(`✅ 已导出：${path.relative(ROOT, outFile)}（${(size / 1024).toFixed(1)} KB）`);

if (!process.argv.includes('--import')) {
  console.log('ℹ️ 想顺便灌进本地数据库，加参数 --import');
  process.exit(0);
}

console.log('▶ 正在导入本地 SQLite…');
const db = new DatabaseSync(DB_FILE);
db.exec('PRAGMA foreign_keys = OFF');
const sql = fs.readFileSync(outFile, 'utf8');
// D1 的导出文件里通常包含事务与 PRAGMA，逐条执行更稳
const statements = sql
  .split(/;\s*\n/)
  .map((s) => s.trim())
  .filter((s) => s && !/^PRAGMA|^BEGIN|^COMMIT/i.test(s));

db.exec('BEGIN');
let ok = 0;
for (const stmt of statements) {
  try {
    db.exec(stmt);
    ok++;
  } catch (err) {
    console.warn(`  ⚠️ 跳过一条语句：${err.message.slice(0, 80)}`);
  }
}
db.exec('COMMIT');
db.exec('PRAGMA foreign_keys = ON');
console.log(`✅ 已导入 ${ok} 条语句到 ${path.relative(ROOT, DB_FILE)}`);
console.log('   提示：导入前最好先 npm run reset-db，避免主键冲突。');
