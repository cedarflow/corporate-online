import { setCookie } from 'hono/cookie';
import type { Ctx } from './env.ts';

export type FormData = Record<string, string | File | (string | File)[]>;

export async function readForm(c: Ctx): Promise<FormData> {
  return (await c.req.parseBody({ all: true })) as FormData;
}
/** First value of a form field as a trimmed string. */
export function s(v: unknown): string {
  const x = Array.isArray(v) ? v[0] : v;
  return typeof x === 'string' ? x.trim() : '';
}
/** All values of a repeated form field. */
export function arr(v: unknown): string[] {
  if (v === undefined) return [];
  return (Array.isArray(v) ? v : [v]).map((x) => (typeof x === 'string' ? x.trim() : ''));
}
export function int(v: unknown): number | null {
  const n = Number(s(v).replace(/,/g, ''));
  return s(v) !== '' && Number.isFinite(n) ? n : null;
}
export function setFlash(c: Ctx, kind: 'ok' | 'error', msg: string) {
  setCookie(c, 'flash', JSON.stringify({ kind, msg }), { path: '/', httpOnly: true, sameSite: 'Lax', maxAge: 60, secure: new URL(c.req.url).protocol === 'https:' });
}
export function redirect(c: Ctx, url: string, kind?: 'ok' | 'error', msg?: string) {
  if (kind && msg) setFlash(c, kind, msg);
  return c.redirect(url, 303);
}
/** Only allow same-site relative redirect targets. */
export function safeBack(v: unknown, fallback: string): string {
  const u = s(v);
  return u.startsWith('/') && !u.startsWith('//') ? u : fallback;
}
