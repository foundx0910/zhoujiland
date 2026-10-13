/* ------------------------------------------------------------------ *
 * 数据访问适配器：统一成异步接口，屏蔽 node:sqlite 与 D1 的差异          *
 *                                                                      *
 * 约定（两条运行时都必须遵守）：                                         *
 *   all(sql, params)   -> 行数组                                        *
 *   first(sql, params) -> 行对象 | null                                 *
 *   run(sql, params)   -> { changes, lastInsertRowid }                  *
 *   batch([{sql,params}]) -> 同一事务内顺序执行，返回与语句一一对应的结果  *
 *   exec(sql)          -> 执行多条语句（建表用）                         *
 *                                                                      *
 * 需要原子性的多语句操作一律走 batch：Node 侧用 BEGIN IMMEDIATE 包住，   *
 * D1 侧用原生 batch（单库单线程，天然串行）。                            *
 * ------------------------------------------------------------------ */

export function createNodeDb(DatabaseSync, filePath) {
  const db = new DatabaseSync(filePath);
  db.exec('PRAGMA journal_mode = WAL');
  db.exec('PRAGMA foreign_keys = ON');
  db.exec('PRAGMA busy_timeout = 5000');

  const runSync = (sql, params = []) => {
    const stmt = db.prepare(sql);
    const r = params.length ? stmt.run(...params) : stmt.run();
    return { changes: Number(r.changes ?? 0), lastInsertRowid: Number(r.lastInsertRowid ?? 0) };
  };

  return {
    kind: 'node-sqlite',
    async all(sql, params = []) {
      const stmt = db.prepare(sql);
      return params.length ? stmt.all(...params) : stmt.all();
    },
    async first(sql, params = []) {
      const stmt = db.prepare(sql);
      const row = params.length ? stmt.get(...params) : stmt.get();
      return row ?? null;
    },
    async run(sql, params = []) {
      return runSync(sql, params);
    },
    /** 真正的同步事务：内部不允许 await，保证不会与其它请求交错 */
    async batch(statements) {
      const results = [];
      db.exec('BEGIN IMMEDIATE');
      try {
        for (const s of statements) results.push(runSync(s.sql, s.params ?? []));
        db.exec('COMMIT');
      } catch (err) {
        try {
          db.exec('ROLLBACK');
        } catch {
          /* 忽略回滚失败 */
        }
        throw err;
      }
      return results;
    },
    async exec(sql) {
      db.exec(sql);
    },
    async close() {
      db.close();
    },
  };
}

export function createD1Db(d1) {
  const prepared = (sql, params = []) => d1.prepare(sql).bind(...params);

  return {
    kind: 'd1',
    async all(sql, params = []) {
      const res = await prepared(sql, params).all();
      return res.results ?? [];
    },
    async first(sql, params = []) {
      const row = await prepared(sql, params).first();
      return row ?? null;
    },
    async run(sql, params = []) {
      const res = await prepared(sql, params).run();
      return {
        changes: Number(res.meta?.changes ?? 0),
        lastInsertRowid: Number(res.meta?.last_row_id ?? 0),
      };
    },
    async batch(statements) {
      const stmts = statements.map((s) => prepared(s.sql, s.params ?? []));
      const res = await d1.batch(stmts);
      return res.map((r) => ({
        changes: Number(r.meta?.changes ?? 0),
        lastInsertRowid: Number(r.meta?.last_row_id ?? 0),
      }));
    },
    async exec(sql) {
      await d1.exec(sql);
    },
  };
}
