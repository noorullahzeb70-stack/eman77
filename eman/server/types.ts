// Shared dependencies passed to every route module.
import type { Config } from './config/env.ts';
import type { Database } from './db/index.ts';
import type { RateLimiter } from './lib/ratelimit.ts';

export interface Deps {
  config: Config;
  db: Database;
  limiter: RateLimiter;
}

export type Role = 'user' | 'editor' | 'admin';

export interface UserRow {
  id: string;
  email: string;
  password_hash: string;
  name: string;
  role: Role;
  status: 'active' | 'suspended';
  email_verified_at: string | null;
  avatar_file_id: string | null;
  bio: string | null;
  language: string;
  theme: 'light' | 'dark' | 'system';
  preferences: string;
  last_login_at: string | null;
  created_at: string;
}

/** Public shape of a user — never includes the password hash. */
export function publicUser(u: UserRow) {
  return {
    id: u.id,
    email: u.email,
    name: u.name,
    role: u.role,
    status: u.status,
    emailVerified: !!u.email_verified_at,
    avatarUrl: u.avatar_file_id ? `/api/files/${u.avatar_file_id}` : null,
    bio: u.bio ?? '',
    language: u.language,
    theme: u.theme,
    createdAt: u.created_at,
  };
}
