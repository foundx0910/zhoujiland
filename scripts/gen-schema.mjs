/**
 * 由 core/schema.js 生成 worker/schema.sql，供 `npm run cf:init-db` 使用。
 * （Worker 首次请求时也会自动建表，这个文件只是给 CLI 用的显式版本。）
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { SCHEMA_SQL } from '../core/schema.js';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const out = path.join(ROOT, 'worker', 'schema.sql');
const body = `-- 由 scripts/gen-schema.mjs 从 core/schema.js 生成，请勿手改\n${SCHEMA_SQL.trim()}\n`;
fs.writeFileSync(out, body);
console.log(`已生成 ${path.relative(ROOT, out)}（${body.length} 字节）`);
