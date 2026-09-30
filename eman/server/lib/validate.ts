// Lightweight input validation. Returns clean values or throws a 422 with per-field messages.
import { Errors } from './http.ts';

type Rule<T> = (v: unknown, field: string) => T;

export class Validator {
  errors: Record<string, string> = {};

  check<T>(field: string, value: unknown, rule: Rule<T>): T {
    try {
      return rule(value, field);
    } catch (e) {
      if (!this.errors[field]) this.errors[field] = (e as Error).message;
      return undefined as T;
    }
  }

  done() {
    if (Object.keys(this.errors).length) throw Errors.validation(this.errors);
  }
}

const fail = (msg: string): never => { throw new Error(msg); };

export const rules = {
  string(opts: { min?: number; max?: number; label?: string; optional?: boolean; trim?: boolean; multiline?: boolean } = {}): Rule<string> {
    return (v) => {
      const label = opts.label ?? 'This field';
      if (v === undefined || v === null || v === '') {
        if (opts.optional) return '';
        fail(`${label} is required.`);
      }
      if (typeof v !== 'string') fail(`${label} must be text.`);
      let s = opts.trim === false ? (v as string) : (v as string).trim();
      // Strip control characters (keep newlines/tabs for multiline fields).
      s = opts.multiline ? s.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '') : s.replace(/[\u0000-\u001F\u007F]/g, '');
      if (!s && !opts.optional) fail(`${label} is required.`);
      if (opts.min && s.length < opts.min) fail(`${label} must be at least ${opts.min} characters.`);
      if (opts.max && s.length > opts.max) fail(`${label} must be at most ${opts.max} characters.`);
      return s;
    };
  },
  email(): Rule<string> {
    return (v) => {
      if (typeof v !== 'string' || !v.trim()) fail('Email is required.');
      const s = (v as string).trim().toLowerCase();
      if (s.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(s)) fail('Enter a valid email address.');
      return s;
    };
  },
  password(): Rule<string> {
    return (v) => {
      if (typeof v !== 'string' || !v) fail('Password is required.');
      const s = v as string;
      if (s.length < 8) fail('Password must be at least 8 characters.');
      if (s.length > 200) fail('Password is too long.');
      if (!/[A-Za-z]/.test(s) || !/[0-9]/.test(s)) fail('Use at least one letter and one number.');
      return s;
    };
  },
  bool(): Rule<boolean> {
    return (v) => v === true || v === 'true' || v === 1;
  },
  oneOf<T extends string>(values: readonly T[], label = 'Value'): Rule<T> {
    return (v) => {
      if (!values.includes(v as T)) fail(`${label} is not valid.`);
      return v as T;
    };
  },
  int(opts: { min?: number; max?: number; label?: string } = {}): Rule<number> {
    return (v) => {
      const n = typeof v === 'number' ? v : Number(v);
      if (!Number.isInteger(n)) fail(`${opts.label ?? 'Value'} must be a whole number.`);
      if (opts.min !== undefined && n < opts.min) fail(`${opts.label ?? 'Value'} must be at least ${opts.min}.`);
      if (opts.max !== undefined && n > opts.max) fail(`${opts.label ?? 'Value'} must be at most ${opts.max}.`);
      return n;
    };
  },
  url(opts: { optional?: boolean } = {}): Rule<string> {
    return (v) => {
      if (!v) {
        if (opts.optional) return '';
        fail('URL is required.');
      }
      try {
        const u = new URL(String(v).trim());
        if (u.protocol !== 'https:' && u.protocol !== 'http:') throw new Error();
        return u.toString().replace(/\/$/, '');
      } catch {
        return fail('Enter a valid URL starting with https://');
      }
    };
  },
};

/** Clamp pagination params. */
export function paging(q: URLSearchParams, maxLimit = 50) {
  const limit = Math.min(maxLimit, Math.max(1, Number(q.get('limit')) || 20));
  const page = Math.max(1, Number(q.get('page')) || 1);
  return { limit, offset: (page - 1) * limit, page };
}
