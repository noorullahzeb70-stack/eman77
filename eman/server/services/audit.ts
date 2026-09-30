import type { Database } from '../db/index.ts';
import { newId } from '../db/index.ts';

/** Record an admin/security-relevant action in the audit log. */
export function audit(db: Database, actorId: string | null | undefined, action: string, target?: { type?: string; id?: string }, meta: Record<string, unknown> = {}, ip?: string) {
  db.run('INSERT INTO admin_logs (id, actor_id, action, target_type, target_id, meta, ip) VALUES (?, ?, ?, ?, ?, ?, ?)', [
    newId('log_'),
    actorId ?? null,
    action,
    target?.type ?? null,
    target?.id ?? null,
    JSON.stringify(meta),
    ip ?? null,
  ]);
}

export function notify(db: Database, userId: string, n: { type: 'system' | 'account' | 'resource' | 'announcement'; title: string; body?: string; link?: string }) {
  db.run('INSERT INTO notifications (id, user_id, type, title, body, link) VALUES (?, ?, ?, ?, ?, ?)', [
    newId('n_'), userId, n.type, n.title, n.body ?? null, n.link ?? null,
  ]);
}
