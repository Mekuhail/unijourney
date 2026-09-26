import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import multer from 'multer';
import type { Request } from 'express';
import type { DocumentMeta, User } from '../../shared/types.ts';
import { config } from './config.ts';
import { db, j, pj } from './db.ts';
import { newId } from './ids.ts';
import { nowIso } from './clock.ts';
import { bad, forbidden, notFound } from './http.ts';

export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;

const ALLOWED: Record<string, { ext: string; magic: (b: Buffer) => boolean }> = {
  'application/pdf': { ext: 'pdf', magic: (b) => b.subarray(0, 4).toString('latin1') === '%PDF' },
  'image/png': { ext: 'png', magic: (b) => b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47 },
  'image/jpeg': { ext: 'jpg', magic: (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff },
  'text/plain': { ext: 'txt', magic: (b) => !b.subarray(0, 512).includes(0) }
};

export const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_UPLOAD_BYTES, files: 1 }
});

export type DocKind = DocumentMeta['kind'];

function uploadsDir() {
  return path.join(config.dataDir, 'uploads');
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function rowToDoc(r: any): DocumentMeta {
  return {
    id: r.id,
    owner_id: r.owner_id,
    kind: r.kind,
    filename: r.filename,
    mime: r.mime,
    size: r.size,
    sha256: r.sha256,
    label: r.label ?? null,
    meta: pj(r.meta, {}),
    created_at: r.created_at
  };
}

/** Validates type by declared mime AND magic bytes, rejects executables, stores privately, records metadata. */
export function createDocument(owner: User, kind: DocKind, file: { originalname: string; mimetype: string; buffer: Buffer }, label?: string, meta: Record<string, unknown> = {}): DocumentMeta {
  const spec = ALLOWED[file.mimetype];
  if (!spec) throw bad(`Unsupported file type ${file.mimetype}. Allowed: PDF, PNG, JPEG, plain text.`);
  if (!spec.magic(file.buffer)) throw bad('File content does not match its declared type.');
  if (/\.(exe|sh|bat|cmd|js|msi|dmg|app|scr|com|ps1)$/i.test(file.originalname)) throw bad('Executable files are rejected.');
  if (file.buffer.length === 0) throw bad('Empty file.');
  if (file.buffer.length > MAX_UPLOAD_BYTES) throw bad('File exceeds 10 MB.');
  const id = newId('doc');
  const sha = createHash('sha256').update(file.buffer).digest('hex');
  const storagePath = path.join(uploadsDir(), `${id}.${spec.ext}`);
  fs.mkdirSync(uploadsDir(), { recursive: true });
  fs.writeFileSync(storagePath, file.buffer);
  const row = {
    id,
    owner_id: owner.id,
    kind,
    filename: path.basename(file.originalname).slice(0, 180),
    mime: file.mimetype,
    size: file.buffer.length,
    sha256: sha,
    storage_path: storagePath,
    label: label ?? null,
    meta: j(meta),
    created_at: nowIso()
  };
  db().insert('documents', row);
  return rowToDoc(row);
}

/** Creates a document from an in-memory buffer (seed data). */
export function createDocumentFromBuffer(ownerId: string, kind: DocKind, filename: string, mime: string, buffer: Buffer, label?: string, meta: Record<string, unknown> = {}): DocumentMeta {
  const owner = { id: ownerId } as User;
  return createDocument(owner, kind, { originalname: filename, mimetype: mime, buffer }, label, meta);
}

export function getDocumentRow(id: string) {
  return db().get('SELECT * FROM documents WHERE id = ?', id);
}

export function getDocument(id: string): DocumentMeta | null {
  const r = getDocumentRow(id);
  return r ? rowToDoc(r) : null;
}

/**
 * Access rule: the owner always; otherwise only when the calling module grants access
 * (e.g. a reviewer assigned to a request that references the document). Modules register grants.
 */
export type DocumentGrant = (doc: DocumentMeta, user: User) => boolean;
const grants: DocumentGrant[] = [];
export function registerDocumentGrant(g: DocumentGrant) {
  grants.push(g);
}

export function assertDocumentAccess(doc: DocumentMeta, user: User) {
  if (doc.owner_id === user.id) return;
  if (grants.some((g) => g(doc, user))) return;
  throw forbidden('You cannot access this document');
}

export function readDocumentFile(id: string, user: User): { doc: DocumentMeta; filePath: string } {
  const row = getDocumentRow(id);
  if (!row) throw notFound('Document not found');
  const doc = rowToDoc(row);
  assertDocumentAccess(doc, user);
  const filePath = row.storage_path as string;
  if (!fs.existsSync(filePath)) throw notFound('Stored file is missing');
  return { doc, filePath };
}

export function readDocumentBuffer(id: string): Buffer | null {
  const row = getDocumentRow(id);
  if (!row) return null;
  const p = row.storage_path as string;
  return fs.existsSync(p) ? fs.readFileSync(p) : null;
}

export function documentsOwnedBy(userId: string, kind?: DocKind): DocumentMeta[] {
  const rows = kind
    ? db().all('SELECT * FROM documents WHERE owner_id = ? AND kind = ? ORDER BY created_at DESC', userId, kind)
    : db().all('SELECT * FROM documents WHERE owner_id = ? ORDER BY created_at DESC', userId);
  return rows.map(rowToDoc);
}

export function fileFromRequest(req: Request): { originalname: string; mimetype: string; buffer: Buffer } {
  const f = (req as Request & { file?: Express.Multer.File }).file;
  if (!f) throw bad('No file uploaded (field name: file)');
  return { originalname: f.originalname, mimetype: f.mimetype, buffer: f.buffer };
}

export function clearUploads() {
  const dir = uploadsDir();
  if (fs.existsSync(dir)) for (const f of fs.readdirSync(dir)) fs.rmSync(path.join(dir, f), { force: true });
}
