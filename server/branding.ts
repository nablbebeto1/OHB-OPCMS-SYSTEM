import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { BRANDING_DIR, db } from './db.ts';
import { recordAuditLog } from './auth.ts';
import { getSystemSettings, persistSystemSettings } from './analytics.ts';
import { broadcastEvent } from './sse.ts';
import type {
  BrandingAssetMeta,
  BrandingAssetType,
  BrandingConfig,
  BrandingSlotStatus,
  UserAccount,
} from '../src/types/opcms.ts';

export const ALL_BRANDING_ASSET_TYPES: BrandingAssetType[] = [
  'logo',
  'app_logo',
  'command_center_logo',
  'login_logo',
  'header_logo',
  'footer_logo',
  'favicon',
  'login_background',
  'visual_asset',
];

const MAX_LOGO_BYTES = 5 * 1024 * 1024; // 5 MB
const MAX_BACKGROUND_BYTES = 10 * 1024 * 1024; // 10 MB for background banners
const MAX_FAVICON_BYTES = 2 * 1024 * 1024; // 2 MB

const ALLOWED_IMAGE_EXTS = new Set(['.png', '.jpg', '.jpeg', '.svg', '.webp']);
const ALLOWED_FAVICON_EXTS = new Set(['.ico', '.png', '.svg']);

const ALLOWED_IMAGE_MIMES = new Set([
  'image/png',
  'image/jpeg',
  'image/jpg',
  'image/svg+xml',
  'image/webp',
]);

const ALLOWED_FAVICON_MIMES = new Set([
  'image/x-icon',
  'image/vnd.microsoft.icon',
  'image/ico',
  'image/png',
  'image/svg+xml',
]);

export const DEFAULT_OHB_FAVICON_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 40">
  <rect width="40" height="40" rx="8" fill="#485EA9"/>
  <path d="M11 21h4.5l3-7 4 12 3-5H29" fill="none" stroke="#FFFFFF" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>
  <circle cx="20" cy="20" r="3" fill="#D29441"/>
</svg>`;

export function isValidBrandingAssetType(value: string): value is BrandingAssetType {
  return ALL_BRANDING_ASSET_TYPES.includes(value as BrandingAssetType);
}

function mapAssetRow(row: Record<string, unknown>): BrandingAssetMeta {
  return {
    id: Number(row.id),
    assetType: row.asset_type as BrandingAssetType,
    originalFilename: String(row.original_filename),
    storedFilename: String(row.stored_filename),
    mimeType: String(row.mime_type),
    fileSizeBytes: Number(row.file_size_bytes),
    sha256Checksum: row.sha256_checksum ? String(row.sha256_checksum) : null,
    width: row.width !== null && row.width !== undefined ? Number(row.width) : null,
    height: row.height !== null && row.height !== undefined ? Number(row.height) : null,
    isActive: Number(row.is_active) === 1,
    uploadedByName: String(row.uploaded_by_name),
    uploadedAt: String(row.uploaded_at),
  };
}

function parsePngDimensions(buf: Buffer): { width: number; height: number } | null {
  if (buf.length < 24) return null;
  const sig = buf.subarray(0, 8);
  const expected = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  if (!sig.equals(expected)) return null;
  const width = buf.readUInt32BE(16);
  const height = buf.readUInt32BE(20);
  if (width <= 0 || height <= 0 || width > 8192 || height > 8192) return null;
  return { width, height };
}

function parseJpegDimensions(buf: Buffer): { width: number; height: number } | null {
  if (buf.length < 4 || buf[0] !== 0xff || buf[1] !== 0xd8 || buf[2] !== 0xff) {
    return null;
  }
  let offset = 2;
  while (offset + 9 < buf.length) {
    if (buf[offset] !== 0xff) {
      offset += 1;
      continue;
    }
    const marker = buf[offset + 1];
    if (
      marker >= 0xc0 &&
      marker <= 0xcf &&
      marker !== 0xc4 &&
      marker !== 0xc8 &&
      marker !== 0xcc
    ) {
      const height = buf.readUInt16BE(offset + 5);
      const width = buf.readUInt16BE(offset + 7);
      if (width <= 0 || height <= 0 || width > 8192 || height > 8192) return null;
      return { width, height };
    }
    const segLen = buf.readUInt16BE(offset + 2);
    if (segLen < 2) break;
    offset += 2 + segLen;
  }
  return null;
}

function parseWebpDimensions(buf: Buffer): { width: number; height: number } | null {
  if (
    buf.length < 30 ||
    buf.toString('ascii', 0, 4) !== 'RIFF' ||
    buf.toString('ascii', 8, 12) !== 'WEBP'
  ) {
    return null;
  }
  const chunk = buf.toString('ascii', 12, 16);
  if (chunk === 'VP8X' && buf.length >= 30) {
    const wMinus1 = buf[24] | (buf[25] << 8) | (buf[26] << 16);
    const hMinus1 = buf[27] | (buf[28] << 8) | (buf[29] << 16);
    return { width: wMinus1 + 1, height: hMinus1 + 1 };
  }
  if (chunk === 'VP8 ' && buf.length >= 30) {
    const width = buf.readUInt16LE(26) & 0x3fff;
    const height = buf.readUInt16LE(28) & 0x3fff;
    return width > 0 && height > 0 ? { width, height } : null;
  }
  if (chunk === 'VP8L' && buf.length >= 25) {
    const bits = buf.readUInt32LE(21);
    const width = (bits & 0x3fff) + 1;
    const height = ((bits >> 14) & 0x3fff) + 1;
    return width > 0 && height > 0 ? { width, height } : null;
  }
  return null;
}

function parseIcoDimensions(buf: Buffer): { width: number; height: number } | null {
  if (buf.length < 22) return null;
  const reserved = buf.readUInt16LE(0);
  const type = buf.readUInt16LE(2);
  const count = buf.readUInt16LE(4);
  if (reserved !== 0 || type !== 1 || count < 1 || buf.length < 6 + count * 16) {
    return null;
  }
  let maxW = 0;
  let maxH = 0;
  for (let i = 0; i < count; i++) {
    const entryOffset = 6 + i * 16;
    const w = buf[entryOffset] === 0 ? 256 : buf[entryOffset];
    const h = buf[entryOffset + 1] === 0 ? 256 : buf[entryOffset + 1];
    if (w > maxW) maxW = w;
    if (h > maxH) maxH = h;
  }
  return maxW > 0 && maxH > 0 ? { width: maxW, height: maxH } : null;
}

function validateAndParseSvg(buf: Buffer): { width: number | null; height: number | null } {
  const text = buf.toString('utf8');
  if (!/<svg[\s>]/i.test(text) || !/<\/svg>/i.test(text)) {
    throw new Error('Invalid SVG document: missing <svg> root element.');
  }
  const dangerous =
    /<script[\s>]|<foreignObject[\s>]|javascript:|vbscript:|data:text\/html|\bon[a-z]+\s*=/i;
  if (dangerous.test(text)) {
    throw new Error('Rejected SVG: embedded scripts or event handlers are prohibited.');
  }

  let width: number | null = null;
  let height: number | null = null;
  const vbMatch = text.match(/viewBox\s*=\s*["']\s*[\d.-]+\s+[\d.-]+\s+([\d.]+)\s+([\d.]+)\s*["']/i);
  if (vbMatch) {
    width = Math.round(Number(vbMatch[1]));
    height = Math.round(Number(vbMatch[2]));
  } else {
    const wMatch = text.match(/\bwidth\s*=\s*["']\s*([\d.]+)(?:px)?\s*["']/i);
    const hMatch = text.match(/\bheight\s*=\s*["']\s*([\d.]+)(?:px)?\s*["']/i);
    if (wMatch) width = Math.round(Number(wMatch[1]));
    if (hMatch) height = Math.round(Number(hMatch[1]));
  }
  return { width, height };
}

function validateAssetBuffer(params: {
  assetType: BrandingAssetType;
  buffer: Buffer;
  originalFilename: string;
  mimeType: string;
}): {
  ext: string;
  normalizedMime: string;
  width: number | null;
  height: number | null;
} {
  const { assetType, buffer, originalFilename, mimeType } = params;
  const safeName = path.basename(originalFilename || '');
  const ext = path.extname(safeName).toLowerCase();
  const normalizedInputMime = (mimeType || '').toLowerCase().split(';')[0].trim();

  if (!buffer || buffer.length === 0) {
    throw new Error('Uploaded image file is empty.');
  }

  if (assetType === 'favicon') {
    if (buffer.length > MAX_FAVICON_BYTES) {
      throw new Error('Favicon exceeds maximum allowed size of 2 MB.');
    }
    if (!ALLOWED_FAVICON_EXTS.has(ext)) {
      throw new Error('Unsupported favicon file format. Allowed: ICO, PNG, SVG.');
    }
    if (normalizedInputMime && !ALLOWED_FAVICON_MIMES.has(normalizedInputMime)) {
      throw new Error(`Unsupported favicon MIME type: ${normalizedInputMime}.`);
    }
  } else {
    const maxBytes =
      assetType === 'login_background' || assetType === 'visual_asset'
        ? MAX_BACKGROUND_BYTES
        : MAX_LOGO_BYTES;
    if (buffer.length > maxBytes) {
      throw new Error(
        `Image exceeds maximum allowed size of ${Math.round(maxBytes / (1024 * 1024))} MB.`
      );
    }
    if (!ALLOWED_IMAGE_EXTS.has(ext)) {
      throw new Error('Unsupported image format. Allowed: PNG, JPG, JPEG, SVG, WebP.');
    }
    if (normalizedInputMime && !ALLOWED_IMAGE_MIMES.has(normalizedInputMime)) {
      throw new Error(`Unsupported image MIME type: ${normalizedInputMime}.`);
    }
  }

  if (ext === '.png') {
    const dims = parsePngDimensions(buffer);
    if (!dims) throw new Error('Invalid or corrupted PNG image file.');
    return { ext, normalizedMime: 'image/png', width: dims.width, height: dims.height };
  }
  if (ext === '.jpg' || ext === '.jpeg') {
    const dims = parseJpegDimensions(buffer);
    if (!dims) throw new Error('Invalid or corrupted JPEG image file.');
    return { ext, normalizedMime: 'image/jpeg', width: dims.width, height: dims.height };
  }
  if (ext === '.webp') {
    const dims = parseWebpDimensions(buffer);
    if (!dims) throw new Error('Invalid or corrupted WebP image file.');
    return { ext, normalizedMime: 'image/webp', width: dims.width, height: dims.height };
  }
  if (ext === '.ico') {
    const dims = parseIcoDimensions(buffer);
    if (!dims) throw new Error('Invalid or corrupted ICO favicon file.');
    return { ext, normalizedMime: 'image/x-icon', width: dims.width, height: dims.height };
  }
  if (ext === '.svg') {
    const dims = validateAndParseSvg(buffer);
    return { ext, normalizedMime: 'image/svg+xml', width: dims.width, height: dims.height };
  }

  throw new Error('Unsupported branding asset file type.');
}

function assetEndpointUrl(assetType: BrandingAssetType, id: number): string {
  if (assetType === 'logo') return `/api/branding/logo?v=${id}`;
  if (assetType === 'favicon') return `/api/branding/favicon?v=${id}`;
  return `/api/branding/asset/${assetType}?v=${id}`;
}

export function getBrandingConfig(includeHistory = false): BrandingConfig {
  const activeRows = db
    .prepare(`SELECT * FROM branding_assets WHERE is_active = 1 ORDER BY id DESC`)
    .all() as Array<Record<string, unknown>>;

  const byType = new Map<BrandingAssetType, BrandingAssetMeta>();
  for (const row of activeRows) {
    const mapped = mapAssetRow(row);
    if (!byType.has(mapped.assetType)) {
      byType.set(mapped.assetType, mapped);
    }
  }

  const assets: Partial<Record<BrandingAssetType, BrandingSlotStatus>> = {};
  for (const t of ALL_BRANDING_ASSET_TYPES) {
    const meta = byType.get(t) ?? null;
    assets[t] = {
      url: meta ? assetEndpointUrl(t, meta.id) : null,
      hasCustom: Boolean(meta),
      meta,
    };
  }

  const logoMeta = byType.get('logo') ?? null;
  const faviconMeta = byType.get('favicon') ?? null;

  const latestRow = db
    .prepare(`SELECT uploaded_at FROM branding_assets ORDER BY id DESC LIMIT 1`)
    .get() as { uploaded_at?: string } | undefined;

  const latestSettingsRow = db
    .prepare(
      `SELECT updated_at FROM system_settings
       WHERE key IN ('appName', 'appShortName', 'organizationName', 'appTagline', 'footerText', 'primaryColor', 'secondaryColor', 'accentColor', 'surfaceColor', 'displayFont', 'bodyFont', 'fontScale', 'loginTheme', 'defaultLanguage', 'showFooterBranding')
       ORDER BY updated_at DESC LIMIT 1`
    )
    .get() as { updated_at?: string } | undefined;

  const updatedAt =
    logoMeta?.uploadedAt ??
    faviconMeta?.uploadedAt ??
    latestRow?.uploaded_at ??
    latestSettingsRow?.updated_at ??
    new Date(0).toISOString();

  const history = includeHistory
    ? (
        db
          .prepare(`SELECT * FROM branding_assets ORDER BY id DESC LIMIT 50`)
          .all() as Array<Record<string, unknown>>
      ).map(mapAssetRow)
    : undefined;

  const settings = getSystemSettings();

  return {
    logoUrl: logoMeta ? `/api/branding/logo?v=${logoMeta.id}` : null,
    faviconUrl: faviconMeta ? `/api/branding/favicon?v=${faviconMeta.id}` : null,
    hasCustomLogo: Boolean(logoMeta),
    hasCustomFavicon: Boolean(faviconMeta),
    logoMeta,
    faviconMeta,
    assets,
    identity: {
      appName: settings.appName,
      appShortName: settings.appShortName,
      organizationName: settings.organizationName,
      appTagline: settings.appTagline,
      footerText: settings.footerText,
      showFooterBranding: settings.showFooterBranding,
      defaultLanguage: settings.defaultLanguage,
    },
    theme: {
      primaryColor: settings.primaryColor,
      secondaryColor: settings.secondaryColor,
      accentColor: settings.accentColor,
      surfaceColor: settings.surfaceColor,
      displayFont: settings.displayFont,
      bodyFont: settings.bodyFont,
      fontScale: settings.fontScale,
      loginTheme: settings.loginTheme,
    },
    history,
    updatedAt,
  };
}

export function getActiveBrandingFile(assetType: BrandingAssetType): {
  filePath: string;
  mimeType: string;
  filename: string;
} | null {
  const row = db
    .prepare(
      `SELECT stored_path, stored_filename, mime_type, original_filename FROM branding_assets
       WHERE asset_type = ? AND is_active = 1 ORDER BY id DESC LIMIT 1`
    )
    .get(assetType) as
    | {
        stored_path: string;
        stored_filename: string;
        mime_type: string;
        original_filename: string;
      }
    | undefined;

  if (!row) return null;
  const safeResolved = path.resolve(BRANDING_DIR, path.basename(row.stored_filename));
  if (!safeResolved.startsWith(BRANDING_DIR + path.sep)) return null;
  if (!fs.existsSync(safeResolved)) return null;

  return {
    filePath: safeResolved,
    mimeType: row.mime_type,
    filename: row.original_filename,
  };
}

export function saveBrandingAsset(params: {
  assetType: BrandingAssetType;
  buffer: Buffer;
  originalFilename: string;
  mimeType: string;
  user: UserAccount;
  ipAddress?: string;
}): BrandingConfig {
  const { assetType, buffer, originalFilename, mimeType, user, ipAddress } = params;
  const { ext, normalizedMime, width, height } = validateAssetBuffer({
    assetType,
    buffer,
    originalFilename,
    mimeType,
  });

  const sha256Checksum = crypto.createHash('sha256').update(buffer).digest('hex');
  const uniqueFilename = `${assetType}_${Date.now()}_${crypto.randomUUID().slice(0, 8)}${ext}`;
  const targetPath = path.resolve(BRANDING_DIR, path.basename(uniqueFilename));
  if (!targetPath.startsWith(BRANDING_DIR + path.sep)) {
    throw new Error('Invalid branding storage path.');
  }

  fs.mkdirSync(BRANDING_DIR, { recursive: true });
  fs.writeFileSync(targetPath, buffer);
  const nowIso = new Date().toISOString();

  db.exec('BEGIN');
  try {
    db.prepare(
      `UPDATE branding_assets SET is_active = 0 WHERE asset_type = ? AND is_active = 1`
    ).run(assetType);

    const ins = db
      .prepare(
        `INSERT INTO branding_assets (
          asset_type, original_filename, stored_filename, stored_path,
          mime_type, file_size_bytes, sha256_checksum, width, height, is_active,
          uploaded_by_user_id, uploaded_by_name, uploaded_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?)`
      )
      .run(
        assetType,
        path.basename(originalFilename),
        uniqueFilename,
        targetPath,
        normalizedMime,
        buffer.length,
        sha256Checksum,
        width,
        height,
        user.id,
        user.fullName,
        nowIso
      );

    db.exec('COMMIT');

    recordAuditLog({
      user,
      action: `BRANDING_${assetType.toUpperCase()}_UPDATED`,
      entityType: 'branding_asset',
      entityId: Number(ins.lastInsertRowid),
      details: `Uploaded ${assetType} "${path.basename(originalFilename)}" (${normalizedMime}, ${width ?? '?'}x${height ?? '?'}, sha256=${sha256Checksum.slice(0, 12)}). Previous assets retained for recovery.`,
      ipAddress,
    });
  } catch (err) {
    db.exec('ROLLBACK');
    if (fs.existsSync(targetPath)) {
      fs.unlinkSync(targetPath);
    }
    throw err;
  }

  broadcastEvent({
    type: 'branding:updated',
    actor: user.fullName,
    message: `Branding asset (${assetType}) updated.`,
  });

  return getBrandingConfig(true);
}

export function removeBrandingAsset(params: {
  assetType: BrandingAssetType;
  user: UserAccount;
  ipAddress?: string;
}): BrandingConfig {
  const { assetType, user, ipAddress } = params;
  db.prepare(
    `UPDATE branding_assets SET is_active = 0 WHERE asset_type = ? AND is_active = 1`
  ).run(assetType);

  recordAuditLog({
    user,
    action: `BRANDING_${assetType.toUpperCase()}_REMOVED`,
    entityType: 'branding_asset',
    entityId: assetType,
    details: `Deactivated active ${assetType} (archived file retained in permanent storage for recovery).`,
    ipAddress,
  });

  broadcastEvent({
    type: 'branding:updated',
    actor: user.fullName,
    message: `Branding asset (${assetType}) deactivated.`,
  });

  return getBrandingConfig(true);
}

export function restoreBrandingAsset(params: {
  id: number;
  user: UserAccount;
  ipAddress?: string;
}): BrandingConfig {
  const row = db
    .prepare('SELECT * FROM branding_assets WHERE id = ?')
    .get(params.id) as Record<string, unknown> | undefined;

  if (!row) {
    throw new Error('Historical branding asset not found.');
  }
  const safePath = path.resolve(BRANDING_DIR, path.basename(String(row.stored_filename)));
  if (!safePath.startsWith(BRANDING_DIR + path.sep) || !fs.existsSync(safePath)) {
    throw new Error('Archived branding file is missing from server storage.');
  }

  const assetType = row.asset_type as BrandingAssetType;
  db.exec('BEGIN');
  try {
    db.prepare(`UPDATE branding_assets SET is_active = 0 WHERE asset_type = ?`).run(
      assetType
    );
    db.prepare(`UPDATE branding_assets SET is_active = 1 WHERE id = ?`).run(params.id);
    db.exec('COMMIT');
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }

  recordAuditLog({
    user: params.user,
    action: 'BRANDING_ASSET_RESTORED',
    entityType: 'branding_asset',
    entityId: params.id,
    details: `Restored ${assetType} "${row.original_filename}".`,
    ipAddress: params.ipAddress,
  });

  broadcastEvent({
    type: 'branding:updated',
    actor: params.user.fullName,
    message: `Restored previous ${assetType}.`,
  });

  return getBrandingConfig(true);
}

export function resetAllBrandingAndAppearance(params: {
  user: UserAccount;
  ipAddress?: string;
}): BrandingConfig {
  db.prepare(`UPDATE branding_assets SET is_active = 0 WHERE is_active = 1`).run();
  persistSystemSettings({
    appName: 'Oromia Polio Campaign Management System (OHB-OPCMS)',
    appShortName: 'OHB-OPCMS',
    organizationName: 'Oromia Health Bureau',
    appTagline: 'Central Command Center – nOPV2 and bOPV2 Supplementary Immunization Activities',
    footerText: 'Oromia Health Bureau (OHB) · Self-Hosted Polio Campaign Management System',
    primaryColor: '#485EA9',
    secondaryColor: '#3A99CF',
    accentColor: '#D29441',
    surfaceColor: '#F8FAFC',
    displayFont: 'Plus Jakarta Sans',
    bodyFont: 'DM Sans',
    fontScale: 'standard',
    loginTheme: 'clean_light',
    showFooterBranding: true,
  });

  recordAuditLog({
    user: params.user,
    action: 'BRANDING_EXPLICIT_RESET',
    entityType: 'branding_asset',
    entityId: 'all',
    details: 'Administrator explicitly reset active branding & appearance settings to OHB institutional defaults (retained files remain recoverable).',
    ipAddress: params.ipAddress,
  });

  broadcastEvent({
    type: 'branding:updated',
    actor: params.user.fullName,
    message: 'Branding & appearance reset to institutional defaults.',
  });
  broadcastEvent({
    type: 'settings:updated',
    actor: params.user.fullName,
    message: 'Appearance settings reset to defaults.',
  });

  return getBrandingConfig(true);
}
