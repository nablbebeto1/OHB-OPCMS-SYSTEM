import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import JSZip from 'jszip';
import { BACKUPS_DIR, BRANDING_DIR, db, UPLOAD_ROOT } from './db.ts';
import { recordAuditLog } from './auth.ts';
import { getBrandingConfig } from './branding.ts';
import { getSystemSettings, invalidateAnalyticsCache } from './analytics.ts';
import { broadcastEvent } from './sse.ts';
import type {
  BackupArchiveInfo,
  BackupRestoreResult,
  UserAccount,
} from '../src/types/opcms.ts';

interface BackupManifest {
  format: 'ohb-opcms-backup-v1';
  sourceEngine: 'sqlite' | 'postgres';
  createdAt: string;
  createdByName: string;
  counts: {
    settings: number;
    brandingAssets: number;
    brandingFiles: number;
    storedFiles: number;
    dailyReports: number;
    importBatches: number;
  };
  fileChecksums: Record<string, string>;
}

function sha256(buf: Buffer): string {
  return crypto.createHash('sha256').update(buf).digest('hex');
}

function safeResolveUnder(rootDir: string, relPath: string): string {
  const normalizedRel = relPath.replace(/\\/g, '/').replace(/^\/+/, '');
  const resolved = path.resolve(rootDir, normalizedRel);
  const rootPrefix = rootDir.endsWith(path.sep) ? rootDir : rootDir + path.sep;
  if (resolved !== rootDir && !resolved.startsWith(rootPrefix)) {
    throw new Error(`Unsafe archive file path rejected: ${relPath}`);
  }
  return resolved;
}

function resolveExistingUserId(candidateId: unknown): number | null {
  if (candidateId === null || candidateId === undefined) return null;
  const num = Number(candidateId);
  if (!Number.isInteger(num) || num <= 0) return null;
  const row = db.prepare('SELECT id FROM users WHERE id = ?').get(num) as { id: number } | undefined;
  return row ? row.id : null;
}

export async function createApplicationBackup(params: {
  user: UserAccount;
  ipAddress?: string;
}): Promise<BackupArchiveInfo> {
  fs.mkdirSync(BACKUPS_DIR, { recursive: true });
  const zip = new JSZip();
  const fileChecksums: Record<string, string> = {};

  const systemSettings = db.prepare('SELECT key, value, updated_at FROM system_settings ORDER BY key ASC').all();
  const brandingAssets = db.prepare('SELECT * FROM branding_assets ORDER BY id ASC').all() as Array<Record<string, unknown>>;
  const campaigns = db.prepare('SELECT * FROM campaigns ORDER BY id ASC').all();
  const adminLocations = db.prepare('SELECT * FROM admin_locations ORDER BY id ASC').all();
  const importBatches = db.prepare('SELECT * FROM import_batches ORDER BY id ASC').all();
  const dailyReports = db.prepare('SELECT * FROM campaign_daily_reports ORDER BY id ASC').all();
  const surveillanceAlerts = db.prepare('SELECT * FROM surveillance_alerts ORDER BY id ASC').all();
  const geoBoundaries = db.prepare('SELECT * FROM geo_boundaries ORDER BY id ASC').all();
  const storedFiles = db.prepare('SELECT * FROM stored_files ORDER BY id ASC').all() as Array<Record<string, unknown>>;
  const previewLinks = db.prepare('SELECT * FROM file_preview_links ORDER BY id ASC').all();

  zip.file('data/system_settings.json', JSON.stringify(systemSettings, null, 2));
  zip.file('data/branding_assets.json', JSON.stringify(brandingAssets, null, 2));
  zip.file('data/campaigns.json', JSON.stringify(campaigns, null, 2));
  zip.file('data/admin_locations.json', JSON.stringify(adminLocations, null, 2));
  zip.file('data/import_batches.json', JSON.stringify(importBatches, null, 2));
  zip.file('data/campaign_daily_reports.json', JSON.stringify(dailyReports, null, 2));
  zip.file('data/surveillance_alerts.json', JSON.stringify(surveillanceAlerts, null, 2));
  zip.file('data/geo_boundaries.json', JSON.stringify(geoBoundaries, null, 2));
  zip.file('data/stored_files.json', JSON.stringify(storedFiles, null, 2));
  zip.file('data/file_preview_links.json', JSON.stringify(previewLinks, null, 2));

  let brandingFilesCount = 0;
  for (const asset of brandingAssets) {
    const storedName = path.basename(String(asset.stored_filename || ''));
    if (!storedName) continue;
    const candidatePath = path.resolve(BRANDING_DIR, storedName);
    const fallbackPath = asset.stored_path ? path.resolve(String(asset.stored_path)) : '';
    const sourcePath = fs.existsSync(candidatePath)
      ? candidatePath
      : fallbackPath && fs.existsSync(fallbackPath)
        ? fallbackPath
        : null;
    if (sourcePath) {
      const buf = fs.readFileSync(sourcePath);
      const archiveRel = `files/branding/${storedName}`;
      zip.file(archiveRel, buf);
      fileChecksums[archiveRel] = sha256(buf);
      brandingFilesCount += 1;
    }
  }

  let storedVaultFilesCount = 0;
  for (const sf of storedFiles) {
    const relPath = String(sf.relative_path || '').replace(/\\/g, '/').replace(/^\/+/, '');
    if (!relPath) continue;
    let sourcePath: string | null = null;
    try {
      const underRoot = safeResolveUnder(UPLOAD_ROOT, relPath);
      if (fs.existsSync(underRoot)) sourcePath = underRoot;
    } catch {
      sourcePath = null;
    }
    if (!sourcePath && sf.storage_path && fs.existsSync(String(sf.storage_path))) {
      sourcePath = String(sf.storage_path);
    }
    if (sourcePath) {
      const buf = fs.readFileSync(sourcePath);
      const archiveRel = `files/vault/${relPath}`;
      zip.file(archiveRel, buf);
      fileChecksums[archiveRel] = sha256(buf);
      storedVaultFilesCount += 1;
    }
  }

  const createdAt = new Date().toISOString();
  const manifest: BackupManifest = {
    format: 'ohb-opcms-backup-v1',
    sourceEngine: 'sqlite',
    createdAt,
    createdByName: params.user.fullName,
    counts: {
      settings: systemSettings.length,
      brandingAssets: brandingAssets.length,
      brandingFiles: brandingFilesCount,
      storedFiles: storedVaultFilesCount,
      dailyReports: dailyReports.length,
      importBatches: importBatches.length,
    },
    fileChecksums,
  };

  zip.file('manifest.json', JSON.stringify(manifest, null, 2));

  const zipBuffer = await zip.generateAsync({
    type: 'nodebuffer',
    compression: 'DEFLATE',
    compressionOptions: { level: 6 },
  });

  const stamp = createdAt.replace(/[:.]/g, '-').slice(0, 19);
  const filename = `ohb-opcms-backup-${stamp}-${crypto.randomUUID().slice(0, 6)}.zip`;
  const targetPath = safeResolveUnder(BACKUPS_DIR, filename);
  fs.writeFileSync(targetPath, zipBuffer);

  const archiveChecksum = sha256(zipBuffer);

  recordAuditLog({
    user: params.user,
    action: 'BACKUP_CREATED',
    entityType: 'backup_archive',
    entityId: filename,
    details: `Created full backup "${filename}" (${systemSettings.length} settings, ${brandingAssets.length} branding metadata, ${brandingFilesCount} branding files, ${storedVaultFilesCount} vault files, ${dailyReports.length} daily reports).`,
    ipAddress: params.ipAddress,
  });

  return {
    filename,
    fileSizeBytes: zipBuffer.length,
    sha256Checksum: archiveChecksum,
    createdAt,
    createdByName: params.user.fullName,
    sourceEngine: 'sqlite',
    counts: manifest.counts,
  };
}

export async function listBackupArchives(): Promise<BackupArchiveInfo[]> {
  fs.mkdirSync(BACKUPS_DIR, { recursive: true });
  const entries = fs.readdirSync(BACKUPS_DIR).filter((f) => f.endsWith('.zip'));
  const results: BackupArchiveInfo[] = [];

  for (const filename of entries) {
    try {
      const fullPath = safeResolveUnder(BACKUPS_DIR, filename);
      const stat = fs.statSync(fullPath);
      const buf = fs.readFileSync(fullPath);
      const zip = await JSZip.loadAsync(buf);
      const manifestEntry = zip.file('manifest.json');
      if (!manifestEntry) continue;
      const manifest = JSON.parse(await manifestEntry.async('string')) as BackupManifest;
      results.push({
        filename,
        fileSizeBytes: stat.size,
        sha256Checksum: sha256(buf),
        createdAt: manifest.createdAt || stat.mtime.toISOString(),
        createdByName: manifest.createdByName || 'System Administrator',
        sourceEngine: manifest.sourceEngine || 'sqlite',
        counts: manifest.counts || {
          settings: 0,
          brandingAssets: 0,
          brandingFiles: 0,
          storedFiles: 0,
          dailyReports: 0,
          importBatches: 0,
        },
      });
    } catch {
      // ignore corrupted non-manifest archives
    }
  }

  return results.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export function getBackupArchivePath(filename: string): string {
  const safeName = path.basename(filename || '');
  if (!safeName.endsWith('.zip')) {
    throw new Error('Invalid backup archive filename.');
  }
  const resolved = safeResolveUnder(BACKUPS_DIR, safeName);
  if (!fs.existsSync(resolved)) {
    throw new Error('Backup archive not found on server.');
  }
  return resolved;
}

export async function restoreApplicationBackup(params: {
  zipBuffer: Buffer;
  restoreScope?: 'full' | 'branding_and_settings';
  user: UserAccount;
  ipAddress?: string;
}): Promise<BackupRestoreResult> {
  const restoreScope =
    params.restoreScope === 'branding_and_settings' ? 'branding_and_settings' : 'full';
  const zip = await JSZip.loadAsync(params.zipBuffer);
  const manifestFile = zip.file('manifest.json');
  if (!manifestFile) {
    throw new Error('Invalid backup archive: manifest.json is missing.');
  }
  const manifest = JSON.parse(await manifestFile.async('string')) as BackupManifest;
  if (manifest.format !== 'ohb-opcms-backup-v1') {
    throw new Error(`Unsupported backup manifest format: ${String(manifest.format)}`);
  }

  // Verify embedded file checksums before mutating any state
  for (const [archiveRel, expectedHash] of Object.entries(manifest.fileChecksums || {})) {
    const entry = zip.file(archiveRel);
    if (!entry) {
      throw new Error(`Backup integrity check failed: missing "${archiveRel}".`);
    }
    const buf = await entry.async('nodebuffer');
    if (sha256(buf) !== expectedHash) {
      throw new Error(`Backup checksum mismatch for "${archiveRel}".`);
    }
  }

  const readJsonArray = async (entryName: string): Promise<Array<Record<string, unknown>>> => {
    const entry = zip.file(entryName);
    if (!entry) return [];
    const parsed = JSON.parse(await entry.async('string'));
    return Array.isArray(parsed) ? parsed : [];
  };

  const settingsRows = await readJsonArray('data/system_settings.json');
  const brandingRows = await readJsonArray('data/branding_assets.json');
  const campaignsRows = await readJsonArray('data/campaigns.json');
  const locationsRows = await readJsonArray('data/admin_locations.json');
  const storedFilesRows = await readJsonArray('data/stored_files.json');
  const previewLinksRows = await readJsonArray('data/file_preview_links.json');
  const batchesRows = await readJsonArray('data/import_batches.json');
  const reportsRows = await readJsonArray('data/campaign_daily_reports.json');
  const alertsRows = await readJsonArray('data/surveillance_alerts.json');
  const geoRows = await readJsonArray('data/geo_boundaries.json');

  // 1. Restore branding binary files to BRANDING_DIR
  fs.mkdirSync(BRANDING_DIR, { recursive: true });
  let restoredBrandingFiles = 0;
  for (const asset of brandingRows) {
    const storedName = path.basename(String(asset.stored_filename || ''));
    if (!storedName) continue;
    const entry = zip.file(`files/branding/${storedName}`);
    if (entry) {
      const buf = await entry.async('nodebuffer');
      const targetPath = safeResolveUnder(BRANDING_DIR, storedName);
      fs.writeFileSync(targetPath, buf);
      restoredBrandingFiles += 1;
    }
  }

  // 2. Restore vault files to UPLOAD_ROOT if full restore
  let restoredStoredFilesCount = 0;
  if (restoreScope === 'full') {
    for (const sf of storedFilesRows) {
      const relPath = String(sf.relative_path || '').replace(/\\/g, '/').replace(/^\/+/, '');
      if (!relPath) continue;
      const entry = zip.file(`files/vault/${relPath}`);
      if (entry) {
        const buf = await entry.async('nodebuffer');
        const targetPath = safeResolveUnder(UPLOAD_ROOT, relPath);
        fs.mkdirSync(path.dirname(targetPath), { recursive: true });
        fs.writeFileSync(targetPath, buf);
        restoredStoredFilesCount += 1;
      }
    }
  }

  let restoredSettingsCount = 0;
  let restoredBrandingAssetsCount = 0;
  let restoredReportsCount = 0;

  db.exec('PRAGMA foreign_keys = OFF; BEGIN;');
  try {
    // Upsert all backed-up system settings
    if (settingsRows.length > 0) {
      const upsertSetting = db.prepare(
        `INSERT INTO system_settings (key, value, updated_at)
         VALUES (?, ?, ?)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`
      );
      for (const row of settingsRows) {
        if (!row.key) continue;
        upsertSetting.run(
          String(row.key),
          String(row.value ?? ''),
          String(row.updated_at ?? new Date().toISOString())
        );
        restoredSettingsCount += 1;
      }
    }

    // Restore branding_assets metadata cleanly (portable local stored_path)
    if (brandingRows.length > 0) {
      db.prepare('DELETE FROM branding_assets').run();
      const insBranding = db.prepare(
        `INSERT INTO branding_assets (
          id, asset_type, original_filename, stored_filename, stored_path,
          mime_type, file_size_bytes, sha256_checksum, width, height, is_active,
          uploaded_by_user_id, uploaded_by_name, uploaded_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      );
      for (const b of brandingRows) {
        const storedName = path.basename(String(b.stored_filename || ''));
        const localPath = safeResolveUnder(BRANDING_DIR, storedName);
        insBranding.run(
          Number(b.id),
          String(b.asset_type),
          String(b.original_filename),
          storedName,
          localPath,
          String(b.mime_type),
          Number(b.file_size_bytes ?? 0),
          b.sha256_checksum ? String(b.sha256_checksum) : null,
          b.width !== null && b.width !== undefined ? Number(b.width) : null,
          b.height !== null && b.height !== undefined ? Number(b.height) : null,
          b.is_active === true || Number(b.is_active) === 1 ? 1 : 0,
          resolveExistingUserId(b.uploaded_by_user_id),
          String(b.uploaded_by_name ?? params.user.fullName),
          String(b.uploaded_at ?? new Date().toISOString())
        );
        restoredBrandingAssetsCount += 1;
      }
    }

    if (restoreScope === 'full') {
      db.prepare('DELETE FROM surveillance_alerts').run();
      db.prepare('DELETE FROM campaign_daily_reports').run();
      db.prepare('DELETE FROM import_batches').run();
      db.prepare('DELETE FROM file_preview_links').run();
      db.prepare('DELETE FROM stored_files').run();
      db.prepare('DELETE FROM geo_boundaries').run();

      if (campaignsRows.length > 0) {
        db.prepare('DELETE FROM campaigns').run();
        const insCamp = db.prepare(
          `INSERT INTO campaigns (id, name, round_code, vaccines, start_date, end_date, expected_days, status, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
        );
        for (const c of campaignsRows) {
          insCamp.run(
            Number(c.id),
            String(c.name),
            String(c.round_code),
            String(c.vaccines ?? 'nOPV2 & bOPV2'),
            String(c.start_date),
            String(c.end_date),
            Number(c.expected_days ?? 4),
            String(c.status ?? 'active'),
            String(c.created_at ?? new Date().toISOString())
          );
        }
      }

      if (locationsRows.length > 0) {
        db.prepare('DELETE FROM admin_locations').run();
        const insLoc = db.prepare(
          `INSERT INTO admin_locations (id, serial_no, raw_region, raw_zone, raw_woreda, canonical_region, canonical_zone, canonical_woreda, location_type, planned_target, daily_target, is_active)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        );
        for (const l of locationsRows) {
          insLoc.run(
            Number(l.id),
            l.serial_no !== null && l.serial_no !== undefined ? Number(l.serial_no) : null,
            String(l.raw_region),
            String(l.raw_zone),
            String(l.raw_woreda),
            String(l.canonical_region ?? 'Oromia'),
            String(l.canonical_zone),
            String(l.canonical_woreda),
            String(l.location_type ?? 'Zone Woreda'),
            Number(l.planned_target ?? 0),
            Number(l.daily_target ?? 0),
            l.is_active === false || Number(l.is_active) === 0 ? 0 : 1
          );
        }
      }

      const insFile = db.prepare(
        `INSERT INTO stored_files (id, file_uuid, original_filename, stored_filename, extension, mime_type, file_size_bytes, sha256_checksum, module, category, associated_record_type, associated_record_id, description, relative_path, storage_path, uploaded_by_user_id, uploaded_by_name, uploaded_at, is_active)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      );
      for (const sf of storedFilesRows) {
        const relPath = String(sf.relative_path || '').replace(/\\/g, '/').replace(/^\/+/, '');
        const localStoragePath = safeResolveUnder(UPLOAD_ROOT, relPath);
        insFile.run(
          Number(sf.id),
          String(sf.file_uuid),
          String(sf.original_filename),
          String(sf.stored_filename),
          String(sf.extension),
          String(sf.mime_type),
          Number(sf.file_size_bytes ?? 0),
          sf.sha256_checksum ? String(sf.sha256_checksum) : null,
          String(sf.module ?? 'documents'),
          String(sf.category ?? 'general'),
          sf.associated_record_type ? String(sf.associated_record_type) : null,
          sf.associated_record_id !== null && sf.associated_record_id !== undefined
            ? Number(sf.associated_record_id)
            : null,
          String(sf.description ?? ''),
          relPath,
          localStoragePath,
          resolveExistingUserId(sf.uploaded_by_user_id),
          String(sf.uploaded_by_name ?? params.user.fullName),
          String(sf.uploaded_at ?? new Date().toISOString()),
          sf.is_active === false || Number(sf.is_active) === 0 ? 0 : 1
        );
      }

      const insLink = db.prepare(
        `INSERT INTO file_preview_links (id, file_id, token_id, signature_hmac, expires_at, is_revoked, revoked_at, revoked_by_user_id, revoked_by_name, revoke_reason, created_by_user_id, created_by_name, created_at, last_accessed_at, access_count)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      );
      for (const pl of previewLinksRows) {
        insLink.run(
          Number(pl.id),
          Number(pl.file_id),
          String(pl.token_id),
          String(pl.signature_hmac),
          String(pl.expires_at),
          pl.is_revoked === true || Number(pl.is_revoked) === 1 ? 1 : 0,
          pl.revoked_at ? String(pl.revoked_at) : null,
          resolveExistingUserId(pl.revoked_by_user_id),
          pl.revoked_by_name ? String(pl.revoked_by_name) : null,
          pl.revoke_reason ? String(pl.revoke_reason) : null,
          resolveExistingUserId(pl.created_by_user_id),
          String(pl.created_by_name ?? params.user.fullName),
          String(pl.created_at ?? new Date().toISOString()),
          pl.last_accessed_at ? String(pl.last_accessed_at) : null,
          Number(pl.access_count ?? 0)
        );
      }

      const insBatch = db.prepare(
        `INSERT INTO import_batches (id, campaign_id, original_filename, stored_path, stored_file_id, file_size_bytes, file_format, detected_template, import_mode, validation_status, detected_records, imported_records, updated_records, skipped_records, rejected_records, uploaded_by_user_id, uploaded_by_name, uploaded_at, confirmed_at, status, rolled_back_at, rolled_back_by_name, notes)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      );
      for (const b of batchesRows) {
        insBatch.run(
          Number(b.id),
          Number(b.campaign_id),
          String(b.original_filename),
          String(b.stored_path ?? ''),
          b.stored_file_id !== null && b.stored_file_id !== undefined ? Number(b.stored_file_id) : null,
          Number(b.file_size_bytes ?? 0),
          String(b.file_format ?? 'csv'),
          String(b.detected_template ?? ''),
          String(b.import_mode ?? 'incremental_skip'),
          String(b.validation_status ?? 'passed'),
          Number(b.detected_records ?? 0),
          Number(b.imported_records ?? 0),
          Number(b.updated_records ?? 0),
          Number(b.skipped_records ?? 0),
          Number(b.rejected_records ?? 0),
          resolveExistingUserId(b.uploaded_by_user_id),
          String(b.uploaded_by_name ?? params.user.fullName),
          String(b.uploaded_at ?? new Date().toISOString()),
          b.confirmed_at ? String(b.confirmed_at) : null,
          String(b.status ?? 'confirmed'),
          b.rolled_back_at ? String(b.rolled_back_at) : null,
          b.rolled_back_by_name ? String(b.rolled_back_by_name) : null,
          b.notes ? String(b.notes) : null
        );
      }

      const insReport = db.prepare(
        `INSERT INTO campaign_daily_reports (
          id, campaign_id, import_batch_id, serial_no,
          raw_region, raw_zone, raw_woreda, canonical_region, canonical_zone, canonical_woreda,
          campaign_day_label, campaign_day_num, report_date,
          total_planned_target, daily_target,
          vacc_0_11_before, vacc_0_11_not_before, vacc_12_59_before, vacc_12_59_not_before, vacc_60_120_before, vacc_60_120_not_before,
          total_vaccinated_0_59, daily_covered_pct, covered_from_total_pct,
          nopv2_vials_received, nopv2_vials_used, nopv2_vials_partially_used, nopv2_vials_returned_unused_good, nopv2_vials_broken, nopv2_vials_returned_bad, nopv2_vials_lost, nopv2_wastage_rate_pct,
          bopv_vials_received, bopv_vials_used, bopv_vials_partially_used, bopv_vials_returned_unused_good, bopv_vials_broken, bopv_vials_returned_bad, bopv_vials_lost, bopv_wastage_rate_pct,
          afp_alerts_count, aefi_alerts_count,
          sm_hhs_visited, sm_group_discussions, sm_ipc_reached,
          zd_identified_linked, zd_vaccinated, uv_identified_linked, uv_vaccinated,
          teams_total, teams_reported, remarks,
          has_reported_activity, source_submitted_at, uploaded_at, version, is_active, superseded_by_import_id
        ) VALUES (
          ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?,
          ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?,
          ?, ?, ?, ?, ?, ?, ?, ?,
          ?, ?, ?, ?, ?, ?, ?, ?,
          ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?,
          ?, ?, ?, ?, ?, ?
        )`
      );
      for (const r of reportsRows) {
        insReport.run(
          Number(r.id),
          Number(r.campaign_id),
          Number(r.import_batch_id),
          r.serial_no !== null && r.serial_no !== undefined ? Number(r.serial_no) : null,
          String(r.raw_region),
          String(r.raw_zone),
          String(r.raw_woreda),
          String(r.canonical_region ?? 'Oromia'),
          String(r.canonical_zone),
          String(r.canonical_woreda),
          String(r.campaign_day_label),
          Number(r.campaign_day_num),
          r.report_date ? String(r.report_date) : null,
          Number(r.total_planned_target ?? 0),
          Number(r.daily_target ?? 0),
          Number(r.vacc_0_11_before ?? 0),
          Number(r.vacc_0_11_not_before ?? 0),
          Number(r.vacc_12_59_before ?? 0),
          Number(r.vacc_12_59_not_before ?? 0),
          Number(r.vacc_60_120_before ?? 0),
          Number(r.vacc_60_120_not_before ?? 0),
          Number(r.total_vaccinated_0_59 ?? 0),
          Number(r.daily_covered_pct ?? 0),
          Number(r.covered_from_total_pct ?? 0),
          r.nopv2_vials_received !== null && r.nopv2_vials_received !== undefined ? Number(r.nopv2_vials_received) : null,
          r.nopv2_vials_used !== null && r.nopv2_vials_used !== undefined ? Number(r.nopv2_vials_used) : null,
          r.nopv2_vials_partially_used !== null && r.nopv2_vials_partially_used !== undefined ? Number(r.nopv2_vials_partially_used) : null,
          r.nopv2_vials_returned_unused_good !== null && r.nopv2_vials_returned_unused_good !== undefined ? Number(r.nopv2_vials_returned_unused_good) : null,
          r.nopv2_vials_broken !== null && r.nopv2_vials_broken !== undefined ? Number(r.nopv2_vials_broken) : null,
          r.nopv2_vials_returned_bad !== null && r.nopv2_vials_returned_bad !== undefined ? Number(r.nopv2_vials_returned_bad) : null,
          r.nopv2_vials_lost !== null && r.nopv2_vials_lost !== undefined ? Number(r.nopv2_vials_lost) : null,
          r.nopv2_wastage_rate_pct !== null && r.nopv2_wastage_rate_pct !== undefined ? Number(r.nopv2_wastage_rate_pct) : null,
          r.bopv_vials_received !== null && r.bopv_vials_received !== undefined ? Number(r.bopv_vials_received) : null,
          r.bopv_vials_used !== null && r.bopv_vials_used !== undefined ? Number(r.bopv_vials_used) : null,
          r.bopv_vials_partially_used !== null && r.bopv_vials_partially_used !== undefined ? Number(r.bopv_vials_partially_used) : null,
          r.bopv_vials_returned_unused_good !== null && r.bopv_vials_returned_unused_good !== undefined ? Number(r.bopv_vials_returned_unused_good) : null,
          r.bopv_vials_broken !== null && r.bopv_vials_broken !== undefined ? Number(r.bopv_vials_broken) : null,
          r.bopv_vials_returned_bad !== null && r.bopv_vials_returned_bad !== undefined ? Number(r.bopv_vials_returned_bad) : null,
          r.bopv_vials_lost !== null && r.bopv_vials_lost !== undefined ? Number(r.bopv_vials_lost) : null,
          r.bopv_wastage_rate_pct !== null && r.bopv_wastage_rate_pct !== undefined ? Number(r.bopv_wastage_rate_pct) : null,
          Number(r.afp_alerts_count ?? 0),
          Number(r.aefi_alerts_count ?? 0),
          Number(r.sm_hhs_visited ?? 0),
          Number(r.sm_group_discussions ?? 0),
          Number(r.sm_ipc_reached ?? 0),
          Number(r.zd_identified_linked ?? 0),
          Number(r.zd_vaccinated ?? 0),
          Number(r.uv_identified_linked ?? 0),
          Number(r.uv_vaccinated ?? 0),
          Number(r.teams_total ?? 0),
          Number(r.teams_reported ?? 0),
          String(r.remarks ?? ''),
          r.has_reported_activity === true || Number(r.has_reported_activity) === 1 ? 1 : 0,
          r.source_submitted_at ? String(r.source_submitted_at) : null,
          String(r.uploaded_at ?? new Date().toISOString()),
          Number(r.version ?? 1),
          r.is_active === false || Number(r.is_active) === 0 ? 0 : 1,
          r.superseded_by_import_id !== null && r.superseded_by_import_id !== undefined
            ? Number(r.superseded_by_import_id)
            : null
        );
        restoredReportsCount += 1;
      }

      const insAlert = db.prepare(
        `INSERT INTO surveillance_alerts (id, campaign_id, report_id, alert_type, canonical_zone, canonical_woreda, campaign_day_num, report_date, administrative_alert_count, verified_clinical_cases, clinical_status, source_remarks, follow_up_notes, assigned_investigator, updated_by_name, is_active, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      );
      for (const a of alertsRows) {
        insAlert.run(
          Number(a.id),
          Number(a.campaign_id),
          Number(a.report_id),
          String(a.alert_type),
          String(a.canonical_zone),
          String(a.canonical_woreda),
          Number(a.campaign_day_num),
          a.report_date ? String(a.report_date) : null,
          Number(a.administrative_alert_count ?? 0),
          Number(a.verified_clinical_cases ?? 0),
          String(a.clinical_status ?? 'reported_pending'),
          String(a.source_remarks ?? ''),
          String(a.follow_up_notes ?? ''),
          String(a.assigned_investigator ?? ''),
          a.updated_by_name ? String(a.updated_by_name) : null,
          a.is_active === false || Number(a.is_active) === 0 ? 0 : 1,
          String(a.created_at ?? new Date().toISOString()),
          String(a.updated_at ?? new Date().toISOString())
        );
      }

      const insGeo = db.prepare(
        `INSERT INTO geo_boundaries (id, level, name_field, feature_count, geojson_text, uploaded_by_name, uploaded_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`
      );
      for (const g of geoRows) {
        insGeo.run(
          Number(g.id),
          String(g.level),
          String(g.name_field),
          Number(g.feature_count),
          String(g.geojson_text),
          String(g.uploaded_by_name ?? params.user.fullName),
          String(g.uploaded_at ?? new Date().toISOString())
        );
      }
    }

    db.exec('COMMIT');
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  } finally {
    db.exec('PRAGMA foreign_keys = ON;');
  }

  invalidateAnalyticsCache();
  recordAuditLog({
    user: params.user,
    action: 'BACKUP_RESTORED',
    entityType: 'backup_archive',
    entityId: restoreScope,
    details: `Restored backup (${restoreScope}): ${restoredSettingsCount} settings, ${restoredBrandingAssetsCount} branding records, ${restoredBrandingFiles} branding files, ${restoredStoredFilesCount} vault files, ${restoredReportsCount} campaign reports.`,
    ipAddress: params.ipAddress,
  });

  broadcastEvent({
    type: 'branding:updated',
    actor: params.user.fullName,
    message: 'Branding & appearance restored from backup.',
  });
  broadcastEvent({
    type: 'settings:updated',
    actor: params.user.fullName,
    message: 'System backup restored successfully.',
  });

  return {
    ok: true,
    restoreScope,
    restoredSettings: restoredSettingsCount,
    restoredBrandingAssets: restoredBrandingAssetsCount,
    restoredBrandingFiles,
    restoredStoredFiles: restoredStoredFilesCount,
    restoredReports: restoredReportsCount,
    branding: getBrandingConfig(true),
    settings: getSystemSettings(),
    message: 'Backup restored successfully including branding assets, logos, and system settings.',
  };
}

export function performOperationalDataReset(params: {
  confirmationText: string;
  scope?: 'campaign_reports_only' | 'all_operational_data';
  clearStoredVaultFiles?: boolean;
  user: UserAccount;
  ipAddress?: string;
}): {
  ok: boolean;
  deletedReports: number;
  deletedAlerts: number;
  deletedBatches: number;
  deletedVaultFiles: number;
  brandingPreserved: boolean;
  settingsPreserved: boolean;
  preservedBrandingAssets: number;
  preservedSettings: number;
  message: string;
} {
  if ((params.confirmationText || '').trim() !== 'RESET OPERATIONAL DATA') {
    throw new Error('Explicit confirmation phrase "RESET OPERATIONAL DATA" is required.');
  }

  const clearVault =
    Boolean(params.clearStoredVaultFiles) || params.scope === 'all_operational_data';
  const scope = clearVault ? 'all_operational_data' : 'campaign_reports_only';

  const alertsCnt = (db.prepare('SELECT COUNT(*) AS cnt FROM surveillance_alerts').get() as { cnt: number }).cnt;
  const reportsCnt = (db.prepare('SELECT COUNT(*) AS cnt FROM campaign_daily_reports').get() as { cnt: number }).cnt;
  const batchesCnt = (db.prepare('SELECT COUNT(*) AS cnt FROM import_batches').get() as { cnt: number }).cnt;
  let deletedVaultFiles = 0;

  db.exec('BEGIN');
  try {
    // Strictly operational campaign data only — NEVER touch branding_assets, system_settings, users, campaigns, admin_locations
    db.prepare('DELETE FROM surveillance_alerts').run();
    db.prepare('DELETE FROM campaign_daily_reports').run();
    db.prepare('DELETE FROM import_batches').run();

    if (clearVault) {
      deletedVaultFiles = (
        db.prepare(`SELECT COUNT(*) AS cnt FROM stored_files WHERE module != 'branding'`).get() as {
          cnt: number;
        }
      ).cnt;
      db.prepare(
        `UPDATE file_preview_links
         SET is_revoked = 1, revoked_at = datetime('now'), revoke_reason = 'Operational reset'
         WHERE file_id IN (SELECT id FROM stored_files WHERE module != 'branding')`
      ).run();
      db.prepare(`DELETE FROM file_preview_links WHERE file_id IN (SELECT id FROM stored_files WHERE module != 'branding')`).run();
      db.prepare(`DELETE FROM stored_files WHERE module != 'branding'`).run();
    }

    db.exec('COMMIT');
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }

  invalidateAnalyticsCache();

  const preservedBranding = (
    db.prepare('SELECT COUNT(*) AS cnt FROM branding_assets WHERE is_active = 1').get() as {
      cnt: number;
    }
  ).cnt;
  const preservedSettings = (
    db.prepare('SELECT COUNT(*) AS cnt FROM system_settings').get() as { cnt: number }
  ).cnt;

  recordAuditLog({
    user: params.user,
    action: 'OPERATIONAL_DATA_RESET',
    entityType: 'operational_data',
    entityId: scope,
    details: `Operational data reset (${scope}): cleared ${reportsCnt} reports, ${batchesCnt} batches, ${alertsCnt} alerts, ${deletedVaultFiles} vault files. Preserved ${preservedBranding} active branding assets & ${preservedSettings} system settings.`,
    ipAddress: params.ipAddress,
  });

  broadcastEvent({
    type: 'import:rolled_back',
    actor: params.user.fullName,
    message: 'Operational campaign data reset (branding and system settings preserved).',
  });

  return {
    ok: true,
    deletedReports: reportsCnt,
    deletedAlerts: alertsCnt,
    deletedBatches: batchesCnt,
    deletedVaultFiles,
    brandingPreserved: true,
    settingsPreserved: true,
    preservedBrandingAssets: preservedBranding,
    preservedSettings,
    message:
      'Operational campaign data cleared. All uploaded logos, branding assets, and application settings remain intact.',
  };
}
