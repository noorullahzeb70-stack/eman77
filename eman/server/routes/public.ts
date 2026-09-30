// Public content endpoints: contact form, categories, books & gallery listings.
import type { Router } from '../lib/router.ts';
import type { Deps } from '../types.ts';
import { Validator, rules, paging } from '../lib/validate.ts';
import { newId } from '../db/index.ts';
import { notify } from '../services/audit.ts';

export function publicRoutes(api: Router, d: Deps) {
  api.post('/api/contact', async (ctx) => {
    d.limiter.hit(`contact:${ctx.ip}`, 5, 60 * 60 * 1000, 'You have sent several messages recently. Please try again later.');
    const b = await ctx.json(64 * 1024);
    // Honeypot: real users never fill this hidden field.
    if (typeof b.website === 'string' && b.website) return { received: true };
    const v = new Validator();
    const name = v.check('name', b.name, rules.string({ min: 2, max: 80, label: 'Name' }));
    const email = v.check('email', b.email, rules.email());
    const subject = v.check('subject', b.subject, rules.string({ min: 3, max: 140, label: 'Subject' }));
    const message = v.check('message', b.message, rules.string({ min: 10, max: 5000, label: 'Message', multiline: true }));
    v.done();
    d.db.run('INSERT INTO contact_messages (id, name, email, subject, message, user_id) VALUES (?, ?, ?, ?, ?, ?)', [
      newId('msg_'), name, email, subject, message, ctx.user?.id ?? null,
    ]);
    for (const a of d.db.all<{ id: string }>("SELECT id FROM users WHERE role = 'admin' AND status = 'active'")) {
      notify(d.db, a.id, { type: 'system', title: `New contact message: ${subject.slice(0, 60)}`, body: `From ${name}`, link: '/admin' });
    }
    return { received: true };
  });

  api.get('/api/categories', (ctx) => {
    const type = ctx.query.get('type');
    if (type && !['book', 'gallery', 'education'].includes(type)) return { items: [] };
    const items = type
      ? d.db.all('SELECT id, type, name, slug, description, icon FROM categories WHERE type = ? ORDER BY sort_order, name', [type])
      : d.db.all('SELECT id, type, name, slug, description, icon FROM categories ORDER BY type, sort_order, name');
    return { items };
  });

  api.get('/api/books', (ctx) => {
    const { limit, offset, page } = paging(ctx.query, 48);
    const cat = ctx.query.get('category');
    const q = (ctx.query.get('q') ?? '').trim().slice(0, 100);
    const featured = ctx.query.get('featured') === '1';
    const where = ['b.published = 1'];
    const params: (string | number)[] = [];
    if (cat) { where.push('c.slug = ?'); params.push(cat); }
    if (featured) where.push('b.featured = 1');
    if (q) { where.push('(b.title LIKE ? OR b.author LIKE ?)'); params.push(`%${q}%`, `%${q}%`); }
    const sqlWhere = where.join(' AND ');
    const items = d.db.all(
      `SELECT b.id, b.title, b.author, b.description, b.language, b.pages, b.featured, c.name AS category, c.slug AS category_slug,
        CASE WHEN b.cover_file_id IS NOT NULL THEN '/api/files/' || b.cover_file_id END AS cover_url
       FROM books b LEFT JOIN categories c ON c.id = b.category_id WHERE ${sqlWhere} ORDER BY b.featured DESC, b.created_at DESC LIMIT ? OFFSET ?`,
      [...params, limit, offset]);
    const total = d.db.get<{ n: number }>(`SELECT COUNT(*) n FROM books b LEFT JOIN categories c ON c.id = b.category_id WHERE ${sqlWhere}`, params)!.n;
    return { items, total, page, limit };
  });

  api.get('/api/gallery', (ctx) => {
    const { limit, offset, page } = paging(ctx.query, 60);
    const cat = ctx.query.get('category');
    const params: (string | number)[] = [];
    let where = 'g.published = 1';
    if (cat) { where += ' AND c.slug = ?'; params.push(cat); }
    const items = d.db.all(
      `SELECT g.id, g.title, g.alt_text, g.description, c.name AS category, '/api/files/' || g.file_id AS url, f.width, f.height
       FROM gallery_items g JOIN files f ON f.id = g.file_id LEFT JOIN categories c ON c.id = g.category_id
       WHERE ${where} ORDER BY g.created_at DESC LIMIT ? OFFSET ?`, [...params, limit, offset]);
    const total = d.db.get<{ n: number }>(`SELECT COUNT(*) n FROM gallery_items g LEFT JOIN categories c ON c.id = g.category_id WHERE ${where}`, params)!.n;
    return { items, total, page, limit };
  });

  api.get('/api/education', () => {
    const subjects = d.db.all<{ id: string; name: string; slug: string; description: string; icon: string }>(
      "SELECT id, name, slug, description, icon FROM categories WHERE type = 'education' ORDER BY sort_order");
    const counts = d.db.all<{ category_id: string; n: number }>('SELECT category_id, COUNT(*) n FROM education_resources WHERE published = 1 GROUP BY category_id');
    const map = new Map(counts.map((c) => [c.category_id, c.n]));
    return { subjects: subjects.map((s) => ({ ...s, resources: map.get(s.id) ?? 0 })) };
  });
}
