import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import type { Request } from 'express';
import * as XLSX from 'xlsx';
import { db, LEGACY_UPLOADS_DIR, UPLOAD_ROOT } from './db.ts';
import { recordAuditLog, resolvePreviewSigningSecret } from './auth.ts';
import { broadcastEvent } from './sse.ts';
import { getSystemSettings } from './analytics.ts';
import type {
  FilePreviewKind,
  FilePreviewLinkRecord,
  PublicFilePreviewInfo,
  SpreadsheetPreviewData,
  StoredFileRecord,
  UserAccount,
} from '../src/types/opcms.ts';

function getConfiguredMaxFileBytes(): number {
  try {
    const mb = getSystemSettings().maxUploadSizeMb;
    if (Number.isFinite(mb) && mb >= 1) return mb * 1024 * 1024;
  } catch {
    // fallback during early startup
  }
  return Number(process.env.MAX_UPLOAD_MB ?? 25) * 1024 * 1024;
}

export function getConfiguredPreviewTtlHours(): number {
  try {
    const hrs = getSystemSettings().previewLinkTtlHours;
    if (Number.isFinite(hrs) && hrs >= 1) return hrs;
  } catch {
    // fallback during early startup
  }
  return Number(process.env.PREVIEW_LINK_TTL_HOURS ?? 144);
}
export const PREVIEW_TTL_HOURS = Number(process.env.PREVIEW_LINK_TTL_HOURS ?? 144);

const ALLOWED_EXTENSIONS = new Set([
  '.pdf',
  '.png',
  '.jpg',
  '.jpeg',
  '.webp',
  '.gif',
  '.svg',
  '.xlsx',
  '.xls',
  '.csv',
  '.docx',
  '.doc',
  '.txt',
  '.json',
  '.zip',
]);

const BLOCKED_EXTENSIONS = new Set([
  '.exe',
  '.sh',
  '.bash',
  '.bat',
  '.cmd',
  '.msi',
  '.php',
  '.py',
  '.rb',
  '.pl',
  '.js',
  '.mjs',
  '.cjs',
  '.ts',
  '.html',
  '.htm',
  '.ps1',
  '.vbs',
  '.jar',
  '.dll',
  '.so',
  '.dylib',
  '.elf',
  '.bin',
]);

const EXT_DEFAULT_MIME: Record<string, string> = {
  '.pdf': 'application/pdf',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  '.xls': 'application/vnd.ms-excel',
  '.csv': 'text/csv',
  '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  '.doc': 'application/msword',
  '.txt': 'text/plain',
  '.json': 'application/json',
  '.zip': 'application/zip',
};

const ALLOWED_CATEGORIES = new Set([
  'campaign_reports',
  'surveillance_docs',
  'sop_guidelines',
  'microplans',
  'general',
]);

export class HttpStatusError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

function sanitizeFilename(rawName: string): string {
  const base = path.basename(rawName || 'file');
  const cleaned = base.replace(/[^a-zA-Z0-9._-]/g, '_').replace(/^[._]+|[._]+$/g, '');
  return (cleaned || 'document').slice(0, 180);
}

function sanitizeSegment(raw: string | undefined, fallback: string): string {
  const cleaned = (raw || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]/g, '_')
    .slice(0, 60);
  return cleaned || fallback;
}

export function detectPreviewKind(ext: string, mimeType: string): FilePreviewKind {
  const e = ext.toLowerCase();
  const m = (mimeType || '').toLowerCase();
  if (e === '.pdf' || m === 'application/pdf') return 'pdf';
  if (
    e === '.png' ||
    e === '.jpg' ||
    e === '.jpeg' ||
    e === '.webp' ||
    e === '.gif' ||
    e === '.svg' ||
    m.startsWith('image/')
  ) {
    return 'image';
  }
  if (e === '.csv' || e === '.xlsx' || e === '.xls') return 'spreadsheet';
  if (e === '.txt' || e === '.json') return 'text';
  return 'document';
}

function validateFileBuffer(
  buffer: Buffer,
  originalFilename: string,
  declaredMime?: string
): { ext: string; mimeType: string } {
  if (!buffer || buffer.length === 0) {
    throw new HttpStatusError(400, 'Uploaded file is empty.');
  }
  const maxFileBytes = getConfiguredMaxFileBytes();
  if (buffer.length > maxFileBytes) {
    throw new HttpStatusError(
      413,
      `File exceeds maximum size of ${Math.round(maxFileBytes / (1024 * 1024))} MB.`
    );
  }

  const safeBase = path.basename(originalFilename || '');
  const ext = path.extname(safeBase).toLowerCase();
  if (BLOCKED_EXTENSIONS.has(ext)) {
    throw new HttpStatusError(400, 'Executable or script files are strictly prohibited.');
  }
  if (!ALLOWED_EXTENSIONS.has(ext)) {
    throw new HttpStatusError(
      400,
      `Unsupported file format "${ext || 'unknown'}". Allowed: PDF, PNG, JPG, WebP, GIF, SVG, XLSX, XLS, CSV, DOCX, DOC, TXT, JSON, ZIP.`
    );
  }

  if (ext === '.pdf' && !buffer.subarray(0, 5).equals(Buffer.from('%PDF-'))) {
    throw new HttpStatusError(400, 'Invalid PDF signature (%PDF- header missing).');
  }
  if (
    ext === '.png' &&
    !buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
  ) {
    throw new HttpStatusError(400, 'Invalid PNG image signature.');
  }
  if ((ext === '.jpg' || ext === '.jpeg') && !(buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff)) {
    throw new HttpStatusError(400, 'Invalid JPEG image signature.');
  }
  if (
    ext === '.gif' &&
    !(buffer.subarray(0, 6).equals(Buffer.from('GIF87a')) || buffer.subarray(0, 6).equals(Buffer.from('GIF89a')))
  ) {
    throw new HttpStatusError(400, 'Invalid GIF image signature.');
  }
  if (
    ext === '.webp' &&
    !(
      buffer.length >= 12 &&
      buffer.toString('ascii', 0, 4) === 'RIFF' &&
      buffer.toString('ascii', 8, 12) === 'WEBP'
    )
  ) {
    throw new HttpStatusError(400, 'Invalid WebP image signature.');
  }
  if ((ext === '.xlsx' || ext === '.docx' || ext === '.zip') && !buffer.subarray(0, 2).equals(Buffer.from('PK'))) {
    throw new HttpStatusError(400, `Invalid ${ext.toUpperCase()} archive signature.`);
  }
  if (ext === '.svg') {
    const text = buffer.toString('utf8');
    if (!/<svg[\s>]/i.test(text) || !/<\/svg>/i.test(text)) {
      throw new HttpStatusError(400, 'Invalid SVG document.');
    }
    if (/<script[\s>]|<foreignObject[\s>]|javascript:|vbscript:|data:text\/html|\bon[a-z]+\s*=/i.test(text)) {
      throw new HttpStatusError(400, 'Rejected SVG: active scripts or event handlers are prohibited.');
    }
  }

  const normalizedMime =
    EXT_DEFAULT_MIME[ext] ||
    (declaredMime || 'application/octet-stream').split(';')[0].trim();

  return { ext, mimeType: normalizedMime };
}

export function resolvePublicBaseUrl(req?: Request): string {
  const configured = (process.env.PUBLIC_APP_URL || process.env.APP_DOMAIN || '').trim().replace(/\/+$/, '');
  if (configured && !configured.includes('localhost') && !configured.includes('127.0.0.1')) {
    if (req) {
      const reqHost = (req.headers['x-forwarded-host'] || req.headers.host || '').toString().split(',')[0].trim();
      // If running inside AI Studio preview host, prefer the active preview HTTPS URL so the test link works directly
      if (reqHost && reqHost.includes('.run.app')) {
        return `https://${reqHost}`;
      }
      if (reqHost && !reqHost.startsWith('127.0.0.1') && !reqHost.startsWith('localhost')) {
        const xfProto = (req.headers['x-forwarded-proto'] || '').toString().split(',')[0].trim();
        return `${xfProto === 'http' ? 'http' : 'https'}://${reqHost}`;
      }
    }
    return configured;
  }

  if (process.env.APP_URL && process.env.APP_URL !== 'MY_APP_URL') {
    return process.env.APP_URL.trim().replace(/\/+$/, '');
  }

  if (req) {
    const xfProto = (req.headers['x-forwarded-proto'] || '').toString().split(',')[0].trim().toLowerCase();
    const host = (req.headers['x-forwarded-host'] || req.headers.host || '').toString().split(',')[0].trim();
    if (host) {
      const isLocal = host.startsWith('127.0.0.1') || host.startsWith('localhost');
      const scheme = xfProto === 'http' || xfProto === 'https' ? xfProto : isLocal ? 'http' : 'https';
      return `${scheme}://${host}`.replace(/\/+$/, '');
    }
  }

  return 'https://polio.orhb.gov.et';
}

function signPreviewMessage(tokenId: string, fileId: number, expUnix: number): string {
  const secret = resolvePreviewSigningSecret();
  const msg = `${tokenId}:${fileId}:${expUnix}:readonly`;
  return crypto.createHmac('sha256', secret).update(msg).digest('base64url');
}

function formatPreviewToken(tokenId: string, fileId: number, expUnix: number, sig: string): string {
  return `${tokenId}.${fileId}.${expUnix}.${sig}`;
}

function mapPreviewLinkRow(
  row: Record<string, unknown>,
  baseUrl: string
): FilePreviewLinkRecord {
  const fileId = Number(row.file_id);
  const tokenId = String(row.token_id);
  const sig = String(row.signature_hmac);
  const expiresAt = String(row.expires_at);
  const expUnix = Math.floor(new Date(expiresAt).getTime() / 1000);
  const token = formatPreviewToken(tokenId, fileId, expUnix, sig);

  return {
    id: Number(row.id),
    fileId,
    tokenId,
    token,
    previewUrl: `${baseUrl}/preview/${token}`,
    contentUrl: `${baseUrl}/api/files/preview/${token}/content`,
    expiresAt,
    ttlHours: getConfiguredPreviewTtlHours(),
    isRevoked: Number(row.is_revoked) === 1,
    revokedAt: row.revoked_at ? String(row.revoked_at) : null,
    revokedByName: row.revoked_by_name ? String(row.revoked_by_name) : null,
    revokeReason: row.revoke_reason ? String(row.revoke_reason) : null,
    createdByName: String(row.created_by_name),
    createdAt: String(row.created_at),
    lastAccessedAt: row.last_accessed_at ? String(row.last_accessed_at) : null,
    accessCount: Number(row.access_count ?? 0),
  };
}

function mapStoredFileRow(
  row: Record<string, unknown>,
  links: FilePreviewLinkRecord[]
): StoredFileRecord {
  const nowMs = Date.now();
  const activeCount = links.filter(
    (l) => !l.isRevoked && new Date(l.expiresAt).getTime() > nowMs
  ).length;
  const ext = String(row.extension);
  const mimeType = String(row.mime_type);

  return {
    id: Number(row.id),
    fileUuid: String(row.file_uuid),
    originalFilename: String(row.original_filename),
    storedFilename: String(row.stored_filename),
    extension: ext,
    mimeType,
    fileSizeBytes: Number(row.file_size_bytes),
    sha256Checksum: row.sha256_checksum ? String(row.sha256_checksum) : null,
    module: String(row.module),
    category: String(row.category),
    associatedRecordType: row.associated_record_type
      ? String(row.associated_record_type)
      : null,
    associatedRecordId:
      row.associated_record_id !== null && row.associated_record_id !== undefined
        ? Number(row.associated_record_id)
        : null,
    description: String(row.description ?? ''),
    uploadedByName: String(row.uploaded_by_name),
    uploadedAt: String(row.uploaded_at),
    previewKind: detectPreviewKind(ext, mimeType),
    activePreviewLinksCount: activeCount,
    previewLinks: links,
  };
}

export function savePermanentFile(params: {
  buffer: Buffer;
  originalFilename: string;
  mimeType?: string;
  user: UserAccount;
  module?: string;
  category?: string;
  description?: string;
  associatedRecordType?: string | null;
  associatedRecordId?: number | null;
  ipAddress?: string;
  recordAudit?: boolean;
  emitSse?: boolean;
  baseUrl?: string;
}): StoredFileRecord {
  const { ext, mimeType } = validateFileBuffer(
    params.buffer,
    params.originalFilename,
    params.mimeType
  );

  const safeModule = sanitizeSegment(params.module, 'documents');
  let safeCategory = sanitizeSegment(params.category, 'general');
  if (safeModule === 'documents' && !ALLOWED_CATEGORIES.has(safeCategory)) {
    safeCategory = 'general';
  }

  const now = new Date();
  const year = String(now.getUTCFullYear());
  const month = String(now.getUTCMonth() + 1).padStart(2, '0');
  const subParts =
    safeModule === 'documents'
      ? [safeModule, safeCategory, year, month]
      : [safeModule, year, month];

  const realRoot = fs.realpathSync(UPLOAD_ROOT);
  const targetDir = path.resolve(realRoot, ...subParts);
  if (!targetDir.startsWith(realRoot + path.sep)) {
    throw new HttpStatusError(400, 'Invalid storage subdirectory.');
  }
  fs.mkdirSync(targetDir, { recursive: true });

  const fileUuid = crypto.randomUUID();
  const baseNoExt = sanitizeFilename(
    path.basename(params.originalFilename, path.extname(params.originalFilename))
  );
  const storedFilename = `${fileUuid}_${baseNoExt}${ext}`;
  const absPath = path.resolve(targetDir, storedFilename);
  if (!absPath.startsWith(realRoot + path.sep)) {
    throw new HttpStatusError(400, 'Invalid storage path.');
  }

  fs.writeFileSync(absPath, params.buffer);
  const sha256 = crypto.createHash('sha256').update(params.buffer).digest('hex');
  const relPath = path.relative(realRoot, absPath).replace(/\\/g, '/');
  const nowIso = now.toISOString();

  const ins = db
    .prepare(
      `INSERT INTO stored_files (
        file_uuid, original_filename, stored_filename, extension, mime_type,
        file_size_bytes, sha256_checksum, module, category,
        associated_record_type, associated_record_id, description,
        relative_path, storage_path, uploaded_by_user_id, uploaded_by_name,
        uploaded_at, is_active
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)`
    )
    .run(
      fileUuid,
      path.basename(params.originalFilename).slice(0, 300),
      storedFilename,
      ext,
      mimeType,
      params.buffer.length,
      sha256,
      safeModule,
      safeCategory,
      params.associatedRecordType ?? null,
      params.associatedRecordId ?? null,
      (params.description ?? '').trim(),
      relPath,
      absPath,
      params.user.id,
      params.user.fullName,
      nowIso
    );

  const fileId = Number(ins.lastInsertRowid);

  if (params.recordAudit !== false) {
    recordAuditLog({
      user: params.user,
      action: 'PERMANENT_FILE_UPLOADED',
      entityType: 'stored_file',
      entityId: fileId,
      details: `Uploaded "${path.basename(params.originalFilename)}" (${params.buffer.length} bytes) to permanent path ${relPath}.`,
      ipAddress: params.ipAddress,
    });
  }

  if (params.emitSse) {
    broadcastEvent({
      type: 'file:uploaded',
      actor: params.user.fullName,
      message: `Uploaded file ${path.basename(params.originalFilename)}`,
    });
  }

  return getStoredFileById(fileId, params.baseUrl ?? '')!;
}

export function resolveSafeStoragePath(row: Record<string, unknown>): string {
  const realRoot = fs.realpathSync(UPLOAD_ROOT);
  const rawStorage = String(row.storage_path || '');
  const relPath = String(row.relative_path || '').replace(/^\/+/, '');

  const candidates = [
    rawStorage,
    relPath ? path.resolve(realRoot, relPath) : '',
    LEGACY_UPLOADS_DIR && relPath ? path.resolve(LEGACY_UPLOADS_DIR, relPath) : '',
  ].filter(Boolean);

  for (const cand of candidates) {
    try {
      if (!fs.existsSync(cand)) continue;
      const realCand = fs.realpathSync(cand);
      const allowedRoots = [realRoot];
      if (fs.existsSync(LEGACY_UPLOADS_DIR)) {
        allowedRoots.push(fs.realpathSync(LEGACY_UPLOADS_DIR));
      }
      if (allowedRoots.some((r) => realCand.startsWith(r + path.sep))) {
        const stat = fs.statSync(realCand);
        if (stat.isFile()) return realCand;
      }
    } catch {
      // continue
    }
  }
  throw new HttpStatusError(404, 'Stored file is missing from permanent storage.');
}

export function listStoredFiles(params: {
  module?: string;
  category?: string;
  search?: string;
  baseUrl: string;
}): StoredFileRecord[] {
  const clauses = ['is_active = 1'];
  const args: Array<string> = [];
  if (params.module && params.module !== 'all') {
    clauses.push('module = ?');
    args.push(params.module);
  }
  if (params.category && params.category !== 'all') {
    clauses.push('category = ?');
    args.push(params.category);
  }
  if (params.search && params.search.trim()) {
    const q = `%${params.search.trim().toLowerCase()}%`;
    clauses.push(
      '(lower(original_filename) LIKE ? OR lower(description) LIKE ? OR lower(uploaded_by_name) LIKE ?)'
    );
    args.push(q, q, q);
  }

  const rows = db
    .prepare(
      `SELECT * FROM stored_files WHERE ${clauses.join(' AND ')} ORDER BY id DESC LIMIT 200`
    )
    .all(...args) as Array<Record<string, unknown>>;

  return rows.map((row) => {
    const links = listPreviewLinksForFile(Number(row.id), params.baseUrl);
    return mapStoredFileRow(row, links);
  });
}

export function getStoredFileRawRow(fileId: number): Record<string, unknown> | undefined {
  return db
    .prepare('SELECT * FROM stored_files WHERE id = ? AND is_active = 1')
    .get(fileId) as Record<string, unknown> | undefined;
}

export function getStoredFileById(
  fileId: number,
  baseUrl: string
): StoredFileRecord | null {
  const row = getStoredFileRawRow(fileId);
  if (!row) return null;
  const links = listPreviewLinksForFile(fileId, baseUrl);
  return mapStoredFileRow(row, links);
}

export function listPreviewLinksForFile(
  fileId: number,
  baseUrl: string
): FilePreviewLinkRecord[] {
  const rows = db
    .prepare('SELECT * FROM file_preview_links WHERE file_id = ? ORDER BY id DESC')
    .all(fileId) as Array<Record<string, unknown>>;
  return rows.map((r) => mapPreviewLinkRow(r, baseUrl));
}

export function createPreviewLink(params: {
  fileId: number;
  user: UserAccount;
  baseUrl: string;
  ipAddress?: string;
}): FilePreviewLinkRecord {
  const fileRow = getStoredFileRawRow(params.fileId);
  if (!fileRow) {
    throw new HttpStatusError(404, 'Stored file not found.');
  }
  resolveSafeStoragePath(fileRow);

  const ttlHours = getConfiguredPreviewTtlHours();
  const nowMs = Date.now();
  const expMs = nowMs + ttlHours * 3600 * 1000;
  const expUnix = Math.floor(expMs / 1000);
  const createdAtIso = new Date(nowMs).toISOString();
  const expiresAtIso = new Date(expUnix * 1000).toISOString();
  const tokenId = crypto.randomBytes(16).toString('hex');
  const sig = signPreviewMessage(tokenId, params.fileId, expUnix);

  const ins = db
    .prepare(
      `INSERT INTO file_preview_links (
        file_id, token_id, signature_hmac, expires_at, is_revoked,
        created_by_user_id, created_by_name, created_at, access_count
      ) VALUES (?, ?, ?, ?, 0, ?, ?, ?, 0)`
    )
    .run(
      params.fileId,
      tokenId,
      sig,
      expiresAtIso,
      params.user.id,
      params.user.fullName,
      createdAtIso
    );

  const linkId = Number(ins.lastInsertRowid);
  const row = db
    .prepare('SELECT * FROM file_preview_links WHERE id = ?')
    .get(linkId) as Record<string, unknown>;

  recordAuditLog({
    user: params.user,
    action: 'PREVIEW_LINK_CREATED',
    entityType: 'file_preview_link',
    entityId: linkId,
    details: `Generated ${ttlHours}h signed live preview link for file #${params.fileId} ("${fileRow.original_filename}"), expires ${expiresAtIso}.`,
    ipAddress: params.ipAddress,
  });

  return mapPreviewLinkRow(row, params.baseUrl);
}

export function revokePreviewLink(params: {
  linkId: number;
  reason?: string;
  user: UserAccount;
  ipAddress?: string;
}): { ok: boolean; id: number; isRevoked: boolean } {
  const row = db
    .prepare('SELECT * FROM file_preview_links WHERE id = ?')
    .get(params.linkId) as Record<string, unknown> | undefined;
  if (!row) {
    throw new HttpStatusError(404, 'Preview link not found.');
  }

  const nowIso = new Date().toISOString();
  db.prepare(
    `UPDATE file_preview_links
     SET is_revoked = 1, revoked_at = ?, revoked_by_user_id = ?, revoked_by_name = ?, revoke_reason = ?
     WHERE id = ?`
  ).run(
    nowIso,
    params.user.id,
    params.user.fullName,
    (params.reason || 'Revoked by authorized administrator').slice(0, 300),
    params.linkId
  );

  recordAuditLog({
    user: params.user,
    action: 'PREVIEW_LINK_REVOKED',
    entityType: 'file_preview_link',
    entityId: params.linkId,
    details: `Revoked preview link #${params.linkId} for file #${row.file_id}.`,
    ipAddress: params.ipAddress,
  });

  return { ok: true, id: params.linkId, isRevoked: true };
}

export function verifyPreviewToken(
  token: string,
  incrementAccess = false
): {
  fileRow: Record<string, unknown>;
  linkRow: Record<string, unknown>;
  safePath: string;
} {
  const parts = (token || '').trim().split('.');
  if (parts.length !== 4) {
    throw new HttpStatusError(401, 'Invalid preview link token format.');
  }
  const [tokenId, fileIdStr, expStr, sig] = parts;
  const fileId = Number(fileIdStr);
  const expUnix = Number(expStr);
  if (!tokenId || !Number.isInteger(fileId) || !Number.isInteger(expUnix)) {
    throw new HttpStatusError(401, 'Malformed preview link parameters.');
  }

  const expectedSig = signPreviewMessage(tokenId, fileId, expUnix);
  const sigBuf = Buffer.from(sig);
  const expectedBuf = Buffer.from(expectedSig);
  if (sigBuf.length !== expectedBuf.length || !crypto.timingSafeEqual(sigBuf, expectedBuf)) {
    throw new HttpStatusError(401, 'Preview link signature verification failed.');
  }

  const nowUnix = Math.floor(Date.now() / 1000);
  if (nowUnix >= expUnix) {
    throw new HttpStatusError(410, 'This 6-day (144-hour) live preview link has expired.');
  }

  const linkRow = db
    .prepare('SELECT * FROM file_preview_links WHERE token_id = ? AND file_id = ?')
    .get(tokenId, fileId) as Record<string, unknown> | undefined;

  if (!linkRow) {
    throw new HttpStatusError(401, 'Preview link record could not be verified.');
  }

  const storedSigBuf = Buffer.from(String(linkRow.signature_hmac));
  if (storedSigBuf.length !== sigBuf.length || !crypto.timingSafeEqual(storedSigBuf, sigBuf)) {
    throw new HttpStatusError(401, 'Preview link signature mismatch.');
  }

  if (Number(linkRow.is_revoked) === 1) {
    throw new HttpStatusError(403, 'This preview link has been revoked by an administrator.');
  }

  if (Date.now() >= new Date(String(linkRow.expires_at)).getTime()) {
    throw new HttpStatusError(410, 'This 6-day (144-hour) live preview link has expired.');
  }

  const fileRow = getStoredFileRawRow(fileId);
  if (!fileRow) {
    throw new HttpStatusError(404, 'Associated file is no longer available.');
  }

  const safePath = resolveSafeStoragePath(fileRow);

  if (incrementAccess) {
    db.prepare(
      `UPDATE file_preview_links
       SET access_count = access_count + 1, last_accessed_at = ?
       WHERE id = ?`
    ).run(new Date().toISOString(), Number(linkRow.id));
  }

  return { fileRow, linkRow, safePath };
}

export function buildPublicPreviewInfo(
  token: string,
  baseUrl: string
): PublicFilePreviewInfo {
  const { fileRow, linkRow } = verifyPreviewToken(token, false);
  const ext = String(fileRow.extension);
  const mimeType = String(fileRow.mime_type);
  const previewKind = detectPreviewKind(ext, mimeType);

  return {
    readOnly: true,
    fileId: Number(fileRow.id),
    originalFilename: String(fileRow.original_filename),
    extension: ext,
    mimeType,
    fileSizeBytes: Number(fileRow.file_size_bytes),
    module: String(fileRow.module),
    category: String(fileRow.category),
    description: String(fileRow.description ?? ''),
    uploadedByName: String(fileRow.uploaded_by_name),
    uploadedAt: String(fileRow.uploaded_at),
    previewKind,
    expiresAt: String(linkRow.expires_at),
    ttlHours: getConfiguredPreviewTtlHours(),
    contentUrl: `${baseUrl}/api/files/preview/${token}/content`,
    downloadReadOnlyUrl: `${baseUrl}/api/files/preview/${token}/content?download=1`,
    sheetPreviewUrl:
      ext === '.csv' || ext === '.xlsx' || ext === '.xls'
        ? `${baseUrl}/api/files/preview/${token}/sheet`
        : null,
  };
}

export function extractSpreadsheetPreview(
  filePath: string,
  _ext: string,
  maxRows = 120,
  maxCols = 40
): SpreadsheetPreviewData {
  const buf = fs.readFileSync(filePath);
  const wb = XLSX.read(buf, { type: 'buffer' });
  const sheets = wb.SheetNames.slice(0, 5).map((name) => {
    const ws = wb.Sheets[name];
    const matrix = XLSX.utils.sheet_to_json(ws, {
      header: 1,
      defval: '',
    }) as Array<Array<unknown>>;
    const sliced = matrix.slice(0, maxRows).map((r) =>
      r.slice(0, maxCols).map((cell) => String(cell ?? '').slice(0, 200))
    );
    return {
      name,
      rows: sliced,
      truncated: matrix.length > maxRows,
    };
  });
  return { sheets };
}
