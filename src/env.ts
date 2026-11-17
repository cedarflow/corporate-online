import type { Context } from 'hono';
import type { User } from './lib/types.ts';

export interface Bindings { DB: D1Database; SESSION_SECRET: string; SETUP_TOKEN?: string }
export interface Variables { user: User; flash: { kind: 'ok' | 'error'; msg: string } | null; overdue: number }
export type AppEnv = { Bindings: Bindings; Variables: Variables };
export type Ctx = Context<AppEnv>;
