// File uploads: validated by content signature (not extension), size-limited,
// images re-encoded with sharp (strips metadata and any embedded payloads).
import { mkdirSync, writeFileSync, readFileSync, existsSync, unlinkSync } from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';
import type { Deps } from '../types.ts';
import { newId } from '../db/index.ts';
import { Errors } from '../lib/http.ts';

export type Purpose = 'avatar' | 'gallery' | 'book_cover' | 'book_document' | 'education' | 'chat' | 'branding';

export interface FileRow {
  id: string; owner_id: string | null; purpose: Purpose; storage_key: string; mime_type: string;
  size_bytes: number; width: number | null; height: number | null; original_name: string | null; created_at: string;
}

const IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif']);
const TEXT_EXT = new Set(['.txt', '.md', '.csv', '.json', '.py', '.js', '.ts', '.jsx', '.tsx', '.html', '.css', '.c', '.cpp', '.h', '.java', '.cs', '.go', '.rs', '.php', '.rb', '.sql', '.xml', '.yml', '.yaml', '.sh', '.kt', '.swift']);

/** Detect the real type from magic bytes. Returns null for anything not allowed. */
export function sniff(buf: Buffer, name: string): { mime: string; kind: 'image' | 'pdf' | 'text' } | null {
  if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return { mime: 'image/jpeg', kind: 'image' };
  if (buf.length >= 8 && buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return { mime: 'image/png', kind: 'image' };
  if (buf.length >= 12 && buf.toString('ascii', 0, 4) === 'RIFF' && buf.toString('ascii', 8, 12) === 'WEBP') return { mime: 'image/webp', kind: 'image' };
  if (buf.length >= 6 && (buf.toString('ascii', 0, 6) === 'GIF87a' || buf.toString('ascii', 0, 6) === 'GIF89a')) return { mime: 'image/gif', kind: 'image' };
  if (buf.length >= 5 && buf.toString('ascii', 0, 5) === '%PDF-') return { mime: 'application/pdf', kind: 'pdf' };
  const ext = path.extname(name).toLowerCase();
  if (TEXT_EXT.has(ext)) {
    // Must be valid UTF-8 without NUL bytes (rejects binaries renamed to .txt).
    if (buf.includes(0)) return null;
    try {
      new TextDecoder('utf-8', { fatal: true }).decode(buf);
    } catch {
      return null;
    }
    return { mime: 'text/plain', kind: 'text' };
  }
  return null;
}

function safeName(name: string) {
  return name.replace(/[\\/:*?"<>|\u0000-\u001F]/g, '_').slice(0, 120) || 'file';
}

export async function saveUpload(d: Deps, opts: { buf: Buffer; name: string; purpose: Purpose; ownerId: string | null; allow: ('image' | 'pdf' | 'text')[]; maxBytes: number }) {
  if (!opts.buf.length) throw Errors.badRequest('The file is empty.');
  if (opts.buf.length > opts.maxBytes) throw Errors.tooLarge(`Files must be ${Math.round(opts.maxBytes / 1024 / 1024)} MB or smaller.`);
  const t = sniff(opts.buf, opts.name);
  if (!t || !opts.allow.includes(t.kind)) {
    const allowed = opts.allow.map((k) => (k === 'image' ? 'JPG, PNG, WEBP' : k === 'pdf' ? 'PDF' : 'text/code files')).join(', ');
    throw Errors.unsupported(`This file type isn't allowed. Allowed: ${allowed}.`);
  }
  let data = opts.buf;
  let mime = t.mime;
  let width: number | null = null;
  let height: number | null = null;
  if (t.kind === 'image') {
    // Re-encode: validates the image fully, strips EXIF/GPS, bounds the size.
    try {
      const maxDim = opts.purpose === 'avatar' ? 512 : opts.purpose === 'chat' ? 2048 : 2400;
      const img = sharp(opts.buf, { limitInputPixels: 50_000_000, animated: false }).rotate().resize({ width: maxDim, height: maxDim, fit: 'inside', withoutEnlargement: true });
      const out = await img.webp({ quality: 84 }).toBuffer({ resolveWithObject: true });
      data = out.data;
      width = out.info.width;
      height = out.info.height;
      mime = 'image/webp';
    } catch {
      throw Errors.unsupported('This image could not be read. Please try a different file.');
    }
  }
  const id = newId('f_');
  const ext = mime === 'image/webp' ? '.webp' : mime === 'application/pdf' ? '.pdf' : '.txt';
  const now = new Date();
  const key = `${opts.purpose}/${now.getUTCFullYear()}/${String(now.getUTCMonth() + 1).padStart(2, '0')}/${id}${ext}`;
  const full = path.resolve(d.config.storage.uploadDir, key);
  mkdirSync(path.dirname(full), { recursive: true });
  writeFileSync(full, data);
  d.db.run(
    'INSERT INTO files (id, owner_id, purpose, storage_key, mime_type, size_bytes, width, height, original_name) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
    [id, opts.ownerId, opts.purpose, key, mime, data.length, width, height, safeName(opts.name)],
  );
  return { id, name: safeName(opts.name), mime, size: data.length, kind: t.kind, width, height };
}

export function getFile(d: Deps, id: string) {
  return d.db.get<FileRow>('SELECT * FROM files WHERE id = ?', [id]);
}

export function readFileData(d: Deps, f: FileRow): Buffer | null {
  const full = path.resolve(d.config.storage.uploadDir, f.storage_key);
  if (!full.startsWith(path.resolve(d.config.storage.uploadDir))) return null;
  return existsSync(full) ? readFileSync(full) : null;
}

export function deleteFile(d: Deps, f: FileRow) {
  const full = path.resolve(d.config.storage.uploadDir, f.storage_key);
  try { unlinkSync(full); } catch { /* already gone */ }
  d.db.run('DELETE FROM files WHERE id = ?', [f.id]);
}
