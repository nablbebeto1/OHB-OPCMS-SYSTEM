import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';

const DATA_DIR = path.resolve(process.cwd(), 'data');
const UPLOAD_DIR = path.resolve(process.cwd(), 'uploads', 'imports');
const BRANDING_UPLOAD_DIR = path.resolve(process.cwd(), 'uploads', 'branding');

if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}
if (!fs.existsSync(UPLOAD_DIR)) {
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
}
if (!fs.existsSync(BRANDING_UPLOAD_DIR)) {
  fs.mkdirSync(BRANDING_UPLOAD_DIR, { recursive: true });
}

export const DB_PATH = path.join(DATA_DIR, 'opcms.db');
export const UPLOADS_DIR = UPLOAD_DIR;
export const BRANDING_DIR = BRANDING_UPLOAD_DIR;

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
      role TEXT NOT NULL CHECK(role IN ('system_admin', 'central_command', 'zone_officer', 'woreda_officer', 'viewer', 'command_room_viewer')),
      assigned_zone TEXT,
      assigned_woreda TEXT,
      is_active INTEGER NOT NULL DEFAULT 1,
      must_change_password INTEGER NOT NULL DEFAULT 0,
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
      asset_type TEXT NOT NULL CHECK(asset_type IN ('logo', 'favicon')),
      original_filename TEXT NOT NULL,
      stored_filename TEXT NOT NULL UNIQUE,
      stored_path TEXT NOT NULL,
      mime_type TEXT NOT NULL,
      file_size_bytes INTEGER NOT NULL,
      width INTEGER,
      height INTEGER,
      is_active INTEGER NOT NULL DEFAULT 1,
      uploaded_by_user_id INTEGER REFERENCES users(id),
      uploaded_by_name TEXT NOT NULL,
      uploaded_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);

  // Idempotent migration: upgrade existing users table if command_room_viewer or must_change_password is absent
  const usersMeta = db
    .prepare(`SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'users'`)
    .get() as { sql?: string } | undefined;
  const usersSql = usersMeta?.sql ?? '';
  if (
    usersSql &&
    (!usersSql.includes('command_room_viewer') ||
      !usersSql.includes('must_change_password'))
  ) {
    const hasMustChange = usersSql.includes('must_change_password');
    db.exec('PRAGMA foreign_keys = OFF; BEGIN;');
    try {
      db.exec(`
        CREATE TABLE users_migrated (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          username TEXT NOT NULL UNIQUE,
          full_name TEXT NOT NULL,
          email TEXT NOT NULL UNIQUE,
          password_hash TEXT NOT NULL,
          role TEXT NOT NULL CHECK(role IN ('system_admin', 'central_command', 'zone_officer', 'woreda_officer', 'viewer', 'command_room_viewer')),
          assigned_zone TEXT,
          assigned_woreda TEXT,
          is_active INTEGER NOT NULL DEFAULT 1,
          must_change_password INTEGER NOT NULL DEFAULT 0,
          created_at TEXT NOT NULL DEFAULT (datetime('now')),
          last_login_at TEXT
        );
        INSERT INTO users_migrated (
          id, username, full_name, email, password_hash, role,
          assigned_zone, assigned_woreda, is_active, must_change_password,
          created_at, last_login_at
        )
        SELECT
          id, username, full_name, email, password_hash, role,
          assigned_zone, assigned_woreda, is_active, ${
            hasMustChange ? 'must_change_password' : '0'
          },
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
}
