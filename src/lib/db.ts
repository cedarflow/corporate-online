// Thin helpers over the Cloudflare D1 API.
type Param = string | number | null | undefined | boolean;

const clean = (p: Param[]) => p.map((v) => (v === undefined || v === '' ? null : typeof v === 'boolean' ? (v ? 1 : 0) : v));

export const newId = (): string => crypto.randomUUID();

export function stmt(db: D1Database, sql: string, ...params: Param[]): D1PreparedStatement {
  return db.prepare(sql).bind(...clean(params));
}
export async function all<T>(db: D1Database, sql: string, ...params: Param[]): Promise<T[]> {
  return (await stmt(db, sql, ...params).all<T>()).results;
}
export async function first<T>(db: D1Database, sql: string, ...params: Param[]): Promise<T | null> {
  return await stmt(db, sql, ...params).first<T>();
}
export async function run(db: D1Database, sql: string, ...params: Param[]): Promise<number> {
  const r = await stmt(db, sql, ...params).run();
  return r.meta.changes ?? 0;
}
/** Run statements atomically (D1 batches are executed as a single transaction). */
export async function batch(db: D1Database, statements: D1PreparedStatement[]): Promise<void> {
  if (statements.length) await db.batch(statements);
}
export function logStmt(db: D1Database, userId: string | null, message: string, refs: { companyId?: string | null; clientId?: string | null } = {}) {
  return stmt(db, 'INSERT INTO activity (id, user_id, company_id, client_id, message) VALUES (?,?,?,?,?)', newId(), userId, refs.companyId, refs.clientId, message);
}
