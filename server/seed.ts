import fs from 'node:fs';
import path from 'node:path';
import { db } from './db.ts';
import { hashPassword } from './auth.ts';
import { DEFAULT_SYSTEM_SETTINGS_MAP } from './analytics.ts';
import { parseCampaignSpreadsheet } from './parser.ts';
import { classifyLocationType } from './normalize.ts';

const OFFICIAL_TEMPLATE_PATH = path.resolve(
  process.cwd(),
  'public/assets/aistudio/Oromia_Region___Round_1_nOPV2_and_bOPV2_SIA_Campaign_Daily_Administrative_Report___November_2026_4b46f787.csv'
);

export function getOfficialTemplatePath(): string {
  return OFFICIAL_TEMPLATE_PATH;
}

interface ProvisionSpec {
  username: string;
  fullName: string;
  email: string;
  password: string;
  role: 'system_admin' | 'command_center';
}

export function provisionConfiguredAccounts(options?: {
  forceSync?: boolean;
}): { adminStatus: string; commandStatus: string } {
  const forceSync =
    options?.forceSync ?? process.env.OPCMS_FORCE_SYNC_INIT_ACCOUNTS === 'true';

  const specs: ProvisionSpec[] = [
    {
      username: (process.env.OPCMS_INIT_ADMIN_USERNAME || 'Admin').trim(),
      fullName: 'OHB System Administrator',
      email: (process.env.OPCMS_INIT_ADMIN_EMAIL || 'admin@oromiahealth.gov.et').trim(),
      password: process.env.OPCMS_INIT_ADMIN_PASSWORD || '',
      role: 'system_admin',
    },
    {
      username: (process.env.OPCMS_INIT_COMMAND_USERNAME || 'OHBPHEM').trim(),
      fullName: 'Oromia PHEM Central Command Center',
      email: (process.env.OPCMS_INIT_COMMAND_EMAIL || 'ohbphem@oromiahealth.gov.et').trim(),
      password: process.env.OPCMS_INIT_COMMAND_PASSWORD || '',
      role: 'command_center',
    },
  ];

  const results: string[] = [];

  for (const spec of specs) {
    const existing = db
      .prepare(
        `SELECT id, username, role, must_change_password FROM users WHERE lower(username) = lower(?)`
      )
      .get(spec.username) as
      | {
          id: number;
          username: string;
          role: string;
          must_change_password: number;
        }
      | undefined;

    if (existing) {
      const shouldSyncPassword =
        Boolean(spec.password) &&
        (forceSync ||
          (spec.role === 'system_admin' && existing.username !== spec.username));

      if (shouldSyncPassword) {
        db.prepare(
          `UPDATE users
           SET username = ?, role = ?, is_active = 1,
               password_hash = ?, must_change_password = 1,
               token_version = token_version + 1
           WHERE id = ?`
        ).run(
          spec.username,
          spec.role,
          hashPassword(spec.password),
          existing.id
        );
        results.push(`${spec.username}:updated_credentials_and_role`);
      } else {
        db.prepare(
          `UPDATE users SET username = ?, role = ?, is_active = 1 WHERE id = ?`
        ).run(spec.username, spec.role, existing.id);
        results.push(`${spec.username}:preserved`);
      }
      continue;
    }

    if (!spec.password) {
      console.warn(
        `[OHB-OPCMS] Initial password env var not set for "${spec.username}"; skipping creation.`
      );
      results.push(`${spec.username}:skipped_no_env_password`);
      continue;
    }

    db.prepare(
      `INSERT INTO users (username, full_name, email, password_hash, role, assigned_zone, assigned_woreda, is_active, must_change_password, token_version)
       VALUES (?, ?, ?, ?, ?, NULL, NULL, 1, 1, 1)`
    ).run(
      spec.username,
      spec.fullName,
      spec.email,
      hashPassword(spec.password),
      spec.role
    );
    results.push(`${spec.username}:created`);
  }

  return {
    adminStatus: results[0] ?? 'unknown',
    commandStatus: results[1] ?? 'unknown',
  };
}

export function seedInitialData(): void {
  // 1. Seed default system settings if missing in a single transaction (never overwrites administrator-saved settings)
  const insertSetting = db.prepare(
    'INSERT OR IGNORE INTO system_settings (key, value) VALUES (?, ?)'
  );
  db.exec('BEGIN');
  try {
    for (const [k, v] of Object.entries(DEFAULT_SYSTEM_SETTINGS_MAP)) {
      insertSetting.run(k, v);
    }
    db.exec('COMMIT');
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }

  // 2. Provision configured accounts safely from environment variables (without hardcoding secrets)
  provisionConfiguredAccounts();

  // 3. Seed Round 1 campaign if empty
  const campaignCount = (
    db.prepare('SELECT COUNT(*) AS cnt FROM campaigns').get() as { cnt: number }
  ).cnt;
  if (campaignCount === 0) {
    db.prepare(
      `INSERT INTO campaigns (name, round_code, vaccines, start_date, end_date, expected_days, status)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    ).run(
      'Oromia Region – Round 1 nOPV2 & bOPV2 SIA Campaign (November 2026)',
      'R1-NOV-2026',
      'nOPV2 & bOPV2',
      '2026-11-18',
      '2026-11-21',
      4,
      'active'
    );
  }

  // 4. Seed baseline 275 administrative locations & targets from authoritative attached CSV
  const locCount = (
    db.prepare('SELECT COUNT(*) AS cnt FROM admin_locations').get() as {
      cnt: number;
    }
  ).cnt;

  if (locCount === 0 && fs.existsSync(OFFICIAL_TEMPLATE_PATH)) {
    const buffer = fs.readFileSync(OFFICIAL_TEMPLATE_PATH);
    const parsed = parseCampaignSpreadsheet(
      buffer,
      path.basename(OFFICIAL_TEMPLATE_PATH)
    );

    const insertLoc = db.prepare(
      `INSERT OR IGNORE INTO admin_locations (
        serial_no, raw_region, raw_zone, raw_woreda,
        canonical_region, canonical_zone, canonical_woreda,
        location_type, planned_target, daily_target
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    );

    db.exec('BEGIN');
    try {
      for (const row of parsed.rows) {
        if (!row.canonicalZone || !row.canonicalWoreda) continue;
        insertLoc.run(
          row.serialNo,
          row.rawRegion,
          row.rawZone,
          row.rawWoreda,
          row.canonicalRegion,
          row.canonicalZone,
          row.canonicalWoreda,
          classifyLocationType(row.canonicalZone),
          row.totalPlannedTarget,
          row.dailyTarget
        );
      }
      db.exec('COMMIT');
    } catch (err) {
      db.exec('ROLLBACK');
      throw err;
    }
  }
}
