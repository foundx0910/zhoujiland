/**
 * 重置本地数据库与上传文件。
 * 用法：npm run reset-db（会先停掉服务更稳妥）
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const DATA_DIR = process.env.FORUM_DATA_DIR || path.join(ROOT, 'data');

let removed = 0;
for (const name of ['forum.db', 'forum.db-wal', 'forum.db-shm']) {
  const p = path.join(DATA_DIR, name);
  if (fs.existsSync(p)) {
    fs.rmSync(p);
    removed++;
    console.log('已删除', p);
  }
}

const uploads = path.join(DATA_DIR, 'uploads');
if (fs.existsSync(uploads)) {
  for (const f of fs.readdirSync(uploads)) fs.rmSync(path.join(uploads, f));
  console.log('已清空上传目录');
}

console.log(removed ? '数据库已重置，下次启动会重新初始化。' : '没有找到数据库文件，无需重置。');
