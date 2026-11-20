import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';

function resolvePermanentUploadRoot(): string {
  const candidates = [
    process.env.UPLOAD_DIR?.trim(),
    '/var/lib/ohb-opcms/uploads',
    path.resolve(process.cwd(), 'uploads'),
  ].filter(Boolean) as string[];

  for (const candidate of candidates) {
    try {
      const resolved = path.resolve(candidate);
      for (const sub of ['imports', 'branding', 'documents', 'geo', 'staging', 'backups']) {
        fs.mkdirSync(path.join(resolved, sub), { recursive: true });
      }
      fs.accessSync(resolved, fs.constants.R_OK | fs.constants.W_OK);
      return resolved;
    } catch {
      // try next fallback if permission is restricted
    }
  }
  const fallback = path.resolve(process.cwd(), 'uploads');
  fs.mkdirSync(fallback, { recursive: true });
  return fallback;
}

const DATA_DIR = path.resolve(process.cwd(), 'data');
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

export const UPLOAD_ROOT = resolvePermanentUploadRoot();
export const LEGACY_UPLOADS_DIR = path.resolve(process.cwd(), 'uploads');
export const DB_PATH = path.join(DATA_DIR, 'opcms.db');
export const UPLOADS_DIR = path.join(UPLOAD_ROOT, 'imports');
export const BRANDING_DIR = path.join(UPLOAD_ROOT, 'branding');
export const DOCUMENTS_DIR = path.join(UPLOAD_ROOT, 'documents');
export const BACKUPS_DIR = path.join(UPLOAD_ROOT, 'backups');

export const db = new DatabaseSync(DB_PATH);

export function initDatabase(): void {
  db.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA foreign_keys = ON;

    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT NOT NULL UNIQUE,
      full_name TEXT NOT NULL,
      email TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL CHECK(role IN ('system_admin', 'command_center', 'central_command', 'zone_officer', 'woreda_officer', 'viewer', 'command_room_viewer')),
      assigned_zone TEXT,
      assigned_woreda TEXT,
      is_active INTEGER NOT NULL DEFAULT 1,
      must_change_password INTEGER NOT NULL DEFAULT 0,
      token_version INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      last_login_at TEXT
    );

    CREATE TABLE IF NOT EXISTS campaigns (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      round_code TEXT NOT NULL UNIQUE,
      vaccines TEXT NOT NULL DEFAULT 'nOPV2 & bOPV2',
      start_date TEXT NOT NULL,
      end_date TEXT NOT NULL,
      expected_days INTEGER NOT NULL DEFAULT 4,
      status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active', 'completed', 'planned')),
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS admin_locations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      serial_no INTEGER,
      raw_region TEXT NOT NULL,
      raw_zone TEXT NOT NULL,
      raw_woreda TEXT NOT NULL,
      canonical_region TEXT NOT NULL,
      canonical_zone TEXT NOT NULL,
      canonical_woreda TEXT NOT NULL,
      location_type TEXT NOT NULL DEFAULT 'Zone Woreda',
      planned_target INTEGER NOT NULL DEFAULT 0,
      daily_target INTEGER NOT NULL DEFAULT 0,
      is_active INTEGER NOT NULL DEFAULT 1,
      UNIQUE(canonical_zone, canonical_woreda)
    );

    CREATE TABLE IF NOT EXISTS import_batches (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      campaign_id INTEGER NOT NULL REFERENCES campaigns(id),
      original_filename TEXT NOT NULL,
      stored_path TEXT NOT NULL,
      file_size_bytes INTEGER NOT NULL,
      file_format TEXT NOT NULL,
      detected_template TEXT NOT NULL,
      import_mode TEXT NOT NULL CHECK(import_mode IN ('incremental_skip', 'incremental_update', 'replace_period')),
      validation_status TEXT NOT NULL,
      detected_records INTEGER NOT NULL DEFAULT 0,
      imported_records INTEGER NOT NULL DEFAULT 0,
      updated_records INTEGER NOT NULL DEFAULT 0,
      skipped_records INTEGER NOT NULL DEFAULT 0,
      rejected_records INTEGER NOT NULL DEFAULT 0,
      uploaded_by_user_id INTEGER REFERENCES users(id),
      uploaded_by_name TEXT NOT NULL,
      uploaded_at TEXT NOT NULL DEFAULT (datetime('now')),
      confirmed_at TEXT,
      status TEXT NOT NULL DEFAULT 'confirmed' CHECK(status IN ('confirmed', 'rolled_back')),
      rolled_back_at TEXT,
      rolled_back_by_name TEXT,
      notes TEXT
    );

    CREATE TABLE IF NOT EXISTS campaign_daily_reports (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      campaign_id INTEGER NOT NULL REFERENCES campaigns(id),
      import_batch_id INTEGER NOT NULL REFERENCES import_batches(id),
      serial_no INTEGER,
      raw_region TEXT NOT NULL,
      raw_zone TEXT NOT NULL,
      raw_woreda TEXT NOT NULL,
      canonical_region TEXT NOT NULL DEFAULT 'Oromia',
      canonical_zone TEXT NOT NULL,
      canonical_woreda TEXT NOT NULL,
      campaign_day_label TEXT NOT NULL,
      campaign_day_num INTEGER NOT NULL,
      report_date TEXT,

      total_planned_target INTEGER NOT NULL DEFAULT 0,
      daily_target INTEGER NOT NULL DEFAULT 0,
      vacc_0_11_before INTEGER NOT NULL DEFAULT 0,
      vacc_0_11_not_before INTEGER NOT NULL DEFAULT 0,
      vacc_12_59_before INTEGER NOT NULL DEFAULT 0,
      vacc_12_59_not_before INTEGER NOT NULL DEFAULT 0,
      vacc_60_120_before INTEGER NOT NULL DEFAULT 0,
      vacc_60_120_not_before INTEGER NOT NULL DEFAULT 0,
      total_vaccinated_0_59 INTEGER NOT NULL DEFAULT 0,
      daily_covered_pct REAL NOT NULL DEFAULT 0,
      covered_from_total_pct REAL NOT NULL DEFAULT 0,

      nopv2_vials_received INTEGER,
      nopv2_vials_used INTEGER,
      nopv2_vials_partially_used INTEGER,
      nopv2_vials_returned_unused_good INTEGER,
      nopv2_vials_broken INTEGER,
      nopv2_vials_returned_bad INTEGER,
      nopv2_vials_lost INTEGER,
      nopv2_wastage_rate_pct REAL,

      bopv_vials_received INTEGER,
      bopv_vials_used INTEGER,
      bopv_vials_partially_used INTEGER,
      bopv_vials_returned_unused_good INTEGER,
      bopv_vials_broken INTEGER,
      bopv_vials_returned_bad INTEGER,
      bopv_vials_lost INTEGER,
      bopv_wastage_rate_pct REAL,

      afp_alerts_count INTEGER NOT NULL DEFAULT 0,
      aefi_alerts_count INTEGER NOT NULL DEFAULT 0,

      sm_hhs_visited INTEGER NOT NULL DEFAULT 0,
      sm_group_discussions INTEGER NOT NULL DEFAULT 0,
      sm_ipc_reached INTEGER NOT NULL DEFAULT 0,

      zd_identified_linked INTEGER NOT NULL DEFAULT 0,
      zd_vaccinated INTEGER NOT NULL DEFAULT 0,

      uv_identified_linked INTEGER NOT NULL DEFAULT 0,
      uv_vaccinated INTEGER NOT NULL DEFAULT 0,

      teams_total INTEGER NOT NULL DEFAULT 0,
      teams_reported INTEGER NOT NULL DEFAULT 0,
      remarks TEXT NOT NULL DEFAULT '',

      has_reported_activity INTEGER NOT NULL DEFAULT 0,
      source_submitted_at TEXT,
      uploaded_at TEXT NOT NULL DEFAULT (datetime('now')),
      version INTEGER NOT NULL DEFAULT 1,
      is_active INTEGER NOT NULL DEFAULT 1,
      superseded_by_import_id INTEGER
    );

    CREATE INDEX IF NOT EXISTS idx_reports_active_lookup
      ON campaign_daily_reports (campaign_id, is_active, campaign_day_num, canonical_zone, canonical_woreda);

    CREATE INDEX IF NOT EXISTS idx_reports_batch
      ON campaign_daily_reports (import_batch_id);

    CREATE TABLE IF NOT EXISTS surveillance_alerts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      campaign_id INTEGER NOT NULL REFERENCES campaigns(id),
      report_id INTEGER NOT NULL REFERENCES campaign_daily_reports(id),
      alert_type TEXT NOT NULL CHECK(alert_type IN ('AFP', 'AEFI')),
      canonical_zone TEXT NOT NULL,
      canonical_woreda TEXT NOT NULL,
      campaign_day_num INTEGER NOT NULL,
      report_date TEXT,
      administrative_alert_count INTEGER NOT NULL DEFAULT 0,
      verified_clinical_cases INTEGER NOT NULL DEFAULT 0,
      clinical_status TEXT NOT NULL DEFAULT 'reported_pending'
        CHECK(clinical_status IN ('reported_pending', 'under_investigation', 'sample_collected', 'verified_confirmed', 'discarded')),
      source_remarks TEXT NOT NULL DEFAULT '',
      follow_up_notes TEXT NOT NULL DEFAULT '',
      assigned_investigator TEXT NOT NULL DEFAULT '',
      updated_by_name TEXT,
      is_active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(report_id, alert_type)
    );

    CREATE TABLE IF NOT EXISTS geo_boundaries (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      level TEXT NOT NULL CHECK(level IN ('zone', 'woreda')),
      name_field TEXT NOT NULL,
      feature_count INTEGER NOT NULL,
      geojson_text TEXT NOT NULL,
      uploaded_by_name TEXT NOT NULL,
      uploaded_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS system_settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS audit_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER,
      username TEXT NOT NULL,
      user_role TEXT NOT NULL,
      action TEXT NOT NULL,
      entity_type TEXT NOT NULL,
      entity_id TEXT NOT NULL,
      details TEXT NOT NULL,
      ip_address TEXT NOT NULL DEFAULT '127.0.0.1',
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS branding_assets (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      asset_type TEXT NOT NULL CHECK(asset_type IN ('logo', 'app_logo', 'command_center_logo', 'login_logo', 'header_logo', 'footer_logo', 'favicon', 'login_background', 'visual_asset')),
      original_filename TEXT NOT NULL,
      stored_filename TEXT NOT NULL UNIQUE,
      stored_path TEXT NOT NULL,
      mime_type TEXT NOT NULL,
      file_size_bytes INTEGER NOT NULL,
      sha256_checksum TEXT,
      width INTEGER,
      height INTEGER,
      is_active INTEGER NOT NULL DEFAULT 1,
      uploaded_by_user_id INTEGER REFERENCES users(id),
      uploaded_by_name TEXT NOT NULL,
      uploaded_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS stored_files (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      file_uuid TEXT NOT NULL UNIQUE,
      original_filename TEXT NOT NULL,
      stored_filename TEXT NOT NULL UNIQUE,
      extension TEXT NOT NULL,
      mime_type TEXT NOT NULL,
      file_size_bytes INTEGER NOT NULL,
      sha256_checksum TEXT,
      module TEXT NOT NULL DEFAULT 'documents',
      category TEXT NOT NULL DEFAULT 'general',
      associated_record_type TEXT,
      associated_record_id INTEGER,
      description TEXT NOT NULL DEFAULT '',
      relative_path TEXT NOT NULL,
      storage_path TEXT NOT NULL,
      uploaded_by_user_id INTEGER REFERENCES users(id),
      uploaded_by_name TEXT NOT NULL,
      uploaded_at TEXT NOT NULL DEFAULT (datetime('now')),
      is_active INTEGER NOT NULL DEFAULT 1
    );

    CREATE INDEX IF NOT EXISTS idx_stored_files_module ON stored_files (module, category, is_active);

    CREATE TABLE IF NOT EXISTS file_preview_links (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      file_id INTEGER NOT NULL REFERENCES stored_files(id),
      token_id TEXT NOT NULL UNIQUE,
      signature_hmac TEXT NOT NULL,
      expires_at TEXT NOT NULL,
      is_revoked INTEGER NOT NULL DEFAULT 0,
      revoked_at TEXT,
      revoked_by_user_id INTEGER REFERENCES users(id),
      revoked_by_name TEXT,
      revoke_reason TEXT,
      created_by_user_id INTEGER REFERENCES users(id),
      created_by_name TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      last_accessed_at TEXT,
      access_count INTEGER NOT NULL DEFAULT 0
    );

    CREATE INDEX IF NOT EXISTS idx_preview_links_file ON file_preview_links (file_id, is_revoked);
    CREATE INDEX IF NOT EXISTS idx_preview_links_token ON file_preview_links (token_id);
  `);

  // Idempotent migration: upgrade existing users table if command_center, command_room_viewer, or must_change_password is absent
  const usersMeta = db
    .prepare(`SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'users'`)
    .get() as { sql?: string } | undefined;
  const usersSql = usersMeta?.sql ?? '';
  if (
    usersSql &&
    (!usersSql.includes('command_center') ||
      !usersSql.includes('command_room_viewer') ||
      !usersSql.includes('must_change_password'))
  ) {
    const hasMustChange = usersSql.includes('must_change_password');
    const hasTokenVersion = usersSql.includes('token_version');
    db.exec('PRAGMA foreign_keys = OFF; BEGIN;');
    try {
      db.exec(`
        CREATE TABLE users_migrated (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          username TEXT NOT NULL UNIQUE,
          full_name TEXT NOT NULL,
          email TEXT NOT NULL UNIQUE,
          password_hash TEXT NOT NULL,
          role TEXT NOT NULL CHECK(role IN ('system_admin', 'command_center', 'central_command', 'zone_officer', 'woreda_officer', 'viewer', 'command_room_viewer')),
          assigned_zone TEXT,
          assigned_woreda TEXT,
          is_active INTEGER NOT NULL DEFAULT 1,
          must_change_password INTEGER NOT NULL DEFAULT 0,
          token_version INTEGER NOT NULL DEFAULT 1,
          created_at TEXT NOT NULL DEFAULT (datetime('now')),
          last_login_at TEXT
        );
        INSERT INTO users_migrated (
          id, username, full_name, email, password_hash, role,
          assigned_zone, assigned_woreda, is_active, must_change_password, token_version,
          created_at, last_login_at
        )
        SELECT
          id, username, full_name, email, password_hash, role,
          assigned_zone, assigned_woreda, is_active,
          ${hasMustChange ? 'must_change_password' : '0'},
          ${hasTokenVersion ? 'token_version' : '1'},
          created_at, last_login_at
        FROM users;
        DROP TABLE users;
        ALTER TABLE users_migrated RENAME TO users;
        COMMIT;
      `);
    } catch (err) {
      db.exec('ROLLBACK;');
      throw err;
    } finally {
      db.exec('PRAGMA foreign_keys = ON;');
    }
  }

  // Idempotent migration: add token_version column if absent
  const cols = db.prepare(`PRAGMA table_info(users)`).all() as Array<{ name: string }>;
  if (!cols.some((c) => c.name === 'token_version')) {
    db.exec(`ALTER TABLE users ADD COLUMN token_version INTEGER NOT NULL DEFAULT 1;`);
  }

  // Case-insensitive unique indexes prevent duplicate accounts across case variations
  try {
    db.exec(`
      CREATE UNIQUE INDEX IF NOT EXISTS idx_users_username_lower ON users (lower(username));
      CREATE UNIQUE INDEX IF NOT EXISTS idx_users_email_lower ON users (lower(email));
    `);
  } catch {
    // preserve existing table if legacy case collision exists
  }

  // Idempotent migration: add stored_file_id to import_batches if absent
  const batchCols = db.prepare(`PRAGMA table_info(import_batches)`).all() as Array<{ name: string }>;
  if (!batchCols.some((c) => c.name === 'stored_file_id')) {
    db.exec(`ALTER TABLE import_batches ADD COLUMN stored_file_id INTEGER;`);
  }

  // Idempotent migration: expand branding_assets asset_type CHECK constraint & add sha256_checksum
  const brandingMeta = db
    .prepare(`SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'branding_assets'`)
    .get() as { sql?: string } | undefined;
  const brandingSql = brandingMeta?.sql ?? '';
  if (
    brandingSql &&
    (!brandingSql.includes('command_center_logo') || !brandingSql.includes('sha256_checksum'))
  ) {
    const hasChecksum = brandingSql.includes('sha256_checksum');
    db.exec('PRAGMA foreign_keys = OFF; BEGIN;');
    try {
      db.exec(`
        CREATE TABLE branding_assets_migrated (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          asset_type TEXT NOT NULL CHECK(asset_type IN ('logo', 'app_logo', 'command_center_logo', 'login_logo', 'header_logo', 'footer_logo', 'favicon', 'login_background', 'visual_asset')),
          original_filename TEXT NOT NULL,
          stored_filename TEXT NOT NULL UNIQUE,
          stored_path TEXT NOT NULL,
          mime_type TEXT NOT NULL,
          file_size_bytes INTEGER NOT NULL,
          sha256_checksum TEXT,
          width INTEGER,
          height INTEGER,
          is_active INTEGER NOT NULL DEFAULT 1,
          uploaded_by_user_id INTEGER REFERENCES users(id),
          uploaded_by_name TEXT NOT NULL,
          uploaded_at TEXT NOT NULL DEFAULT (datetime('now'))
        );
        INSERT INTO branding_assets_migrated (
          id, asset_type, original_filename, stored_filename, stored_path,
          mime_type, file_size_bytes, sha256_checksum, width, height, is_active,
          uploaded_by_user_id, uploaded_by_name, uploaded_at
        )
        SELECT
          id, asset_type, original_filename, stored_filename, stored_path,
          mime_type, file_size_bytes,
          ${hasChecksum ? 'sha256_checksum' : 'NULL'},
          width, height, is_active,
          uploaded_by_user_id, uploaded_by_name, uploaded_at
        FROM branding_assets;
        DROP TABLE branding_assets;
        ALTER TABLE branding_assets_migrated RENAME TO branding_assets;
        COMMIT;
      `);
    } catch (err) {
      db.exec('ROLLBACK;');
      throw err;
    } finally {
      db.exec('PRAGMA foreign_keys = ON;');
    }
  }
}
