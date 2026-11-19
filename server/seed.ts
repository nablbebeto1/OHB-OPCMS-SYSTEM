import fs from 'node:fs';
import path from 'node:path';
import { db } from './db.ts';
import { hashPassword } from './auth.ts';
import { parseCampaignSpreadsheet } from './parser.ts';
import { classifyLocationType } from './normalize.ts';

const OFFICIAL_TEMPLATE_PATH = path.resolve(
  process.cwd(),
  'public/assets/aistudio/Oromia_Region___Round_1_nOPV2_and_bOPV2_SIA_Campaign_Daily_Administrative_Report___November_2026_4b46f787.csv'
);

export function getOfficialTemplatePath(): string {
  return OFFICIAL_TEMPLATE_PATH;
}

export function seedInitialData(): void {
  // 1. Seed default system settings if empty
  const defaultSettings: Record<string, string> = {
    coverageTargetPct: '95',
    coverageCriticalPct: '80',
    maxWastagePct: '15',
    overTargetAlertPct: '105',
    dailyDeviationPct: '35',
    expectedWoredasOverride: '',
    googleDriveSyncStatus: 'manual_upload_active',
    guestPublicOverviewEnabled: 'false',
    commandRoomAutoRotate: 'true',
    commandRoomIntervalSec: '15',
    commandRoomEnabledScreens: '1,2,3,4,5',
    commandRoomDefaultScreen: '1',
    commandRoomFullscreenStartup: 'false',
    commandRoomDataRefreshSec: '30',
    commandRoomDisplayTitle: 'Oromia Health Bureau – Polio Campaign Command Room',
  };

  const insertSetting = db.prepare(
    'INSERT OR IGNORE INTO system_settings (key, value) VALUES (?, ?)'
  );
  for (const [k, v] of Object.entries(defaultSettings)) {
    insertSetting.run(k, v);
  }

  // 2. Seed initial RBAC accounts if no users exist
  const userCount = (
    db.prepare('SELECT COUNT(*) AS cnt FROM users').get() as { cnt: number }
  ).cnt;
  if (userCount === 0) {
    const insertUser = db.prepare(
      `INSERT INTO users (username, full_name, email, password_hash, role, assigned_zone, assigned_woreda)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    );
    insertUser.run(
      'admin',
      'Dr. Tadesse Bekele (System Admin)',
      'admin@oromiahealth.gov.et',
      hashPassword('OhbAdmin#2026'),
      'system_admin',
      null,
      null
    );
    insertUser.run(
      'command',
      'Sifan Gemechu (Central Command)',
      'command@oromiahealth.gov.et',
      hashPassword('OhbCommand#2026'),
      'central_command',
      null,
      null
    );
    insertUser.run(
      'zone_eastshewa',
      'Bonsa Alemu (East Shewa Officer)',
      'eastshewa@oromiahealth.gov.et',
      hashPassword('OhbZone#2026'),
      'zone_officer',
      'East Shewa',
      null
    );
    insertUser.run(
      'woreda_adama',
      'Chaltu Regassa (Adama Woreda)',
      'adama@oromiahealth.gov.et',
      hashPassword('OhbWoreda#2026'),
      'woreda_officer',
      'East Shewa',
      'Adama'
    );
    insertUser.run(
      'viewer',
      'OHB Partner Observer',
      'viewer@oromiahealth.gov.et',
      hashPassword('OhbViewer#2026'),
      'viewer',
      null,
      null
    );
  }

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
