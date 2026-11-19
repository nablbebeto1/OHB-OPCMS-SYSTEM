import 'dotenv/config';
import express from 'express';
import fs from 'node:fs';
import path from 'node:path';
import multer from 'multer';
import shp from 'shpjs';
import { createServer as createViteServer } from 'vite';
import { db, initDatabase } from './server/db.ts';
import { seedInitialData, getOfficialTemplatePath } from './server/seed.ts';
import {
  attachSessionUser,
  buildAuthContext,
  hashPassword,
  mapUserRow,
  recordAuditLog,
  requirePermission,
  signSessionToken,
  verifyPassword,
  type AuthenticatedRequest,
} from './server/auth.ts';
import {
  DEFAULT_OHB_FAVICON_SVG,
  getActiveBrandingFile,
  getBrandingConfig,
  removeBrandingAsset,
  restoreBrandingAsset,
  saveBrandingAsset,
} from './server/branding.ts';
import { broadcastEvent, registerSseClient } from './server/sse.ts';
import {
  confirmStagedImport,
  listImportBatches,
  rollbackImportBatch,
  stageUploadedFile,
} from './server/importer.ts';
import {
  computeAdvancedAnalytics,
  computeDashboardSummary,
  getActiveAlerts,
  getCommandRoomState,
  getFilteredLocations,
  getFilteredReports,
  getPaginatedWoredaStatuses,
  getSystemSettings,
  invalidateAnalyticsCache,
  type AnalyticsFilter,
} from './server/analytics.ts';
import {
  generateExportBuffer,
  type ExportFormat,
  type ReportType,
} from './server/exports.ts';
import type {
  ClinicalCaseStatus,
  ImportMode,
  UserRole,
} from './src/types/opcms.ts';
import * as XLSX from 'xlsx';

initDatabase();
seedInitialData();

const app = express();
const PORT = Number(process.env.PORT ?? 3000);
const MAX_UPLOAD_MB = Number(process.env.MAX_UPLOAD_MB ?? 25);

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_UPLOAD_MB * 1024 * 1024 },
});

app.use(express.json({ limit: '15mb' }));
app.use(attachSessionUser);

function parseFilter(req: express.Request): AnalyticsFilter {
  const q = req.query;
  const campaignId = q.campaignId ? Number(q.campaignId) : undefined;
  const dayNum = q.dayNum ? Number(q.dayNum) : null;
  const reportDate = q.reportDate ? String(q.reportDate) : null;
  const zone = q.zone ? String(q.zone) : null;
  const woreda = q.woreda ? String(q.woreda) : null;
  const vaccineType =
    q.vaccineType === 'nopv2' || q.vaccineType === 'bopv'
      ? q.vaccineType
      : 'all';
  return { campaignId, dayNum, reportDate, zone, woreda, vaccineType };
}

// ---------- Health & Public Branding ----------
app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', service: 'ohb-opcms', timestamp: new Date().toISOString() });
});

app.get('/api/branding', (req: AuthenticatedRequest, res) => {
  const isAdmin = req.currentUser?.role === 'system_admin';
  res.json(getBrandingConfig(isAdmin));
});

app.get('/api/branding/logo', (_req, res) => {
  const asset = getActiveBrandingFile('logo');
  if (!asset) {
    res.status(404).json({ error: 'No custom system logo is currently active.' });
    return;
  }
  res.setHeader('Content-Type', asset.mimeType);
  res.setHeader('X-Content-Type-Options', 'nosniff');
  if (asset.mimeType === 'image/svg+xml') {
    res.setHeader('Content-Security-Policy', 'sandbox');
  }
  res.setHeader('Cache-Control', 'public, max-age=300');
  res.sendFile(asset.filePath);
});

app.get('/api/branding/favicon', (_req, res) => {
  const asset = getActiveBrandingFile('favicon');
  if (!asset) {
    res.setHeader('Content-Type', 'image/svg+xml');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Cache-Control', 'no-cache');
    res.send(DEFAULT_OHB_FAVICON_SVG);
    return;
  }
  res.setHeader('Content-Type', asset.mimeType);
  res.setHeader('X-Content-Type-Options', 'nosniff');
  if (asset.mimeType === 'image/svg+xml') {
    res.setHeader('Content-Security-Policy', 'sandbox');
  }
  res.setHeader('Cache-Control', 'public, max-age=300');
  res.sendFile(asset.filePath);
});

// Admin Branding Management (System Admin ONLY)
app.post(
  '/api/admin/branding/logo',
  requirePermission('manage_branding'),
  upload.single('file'),
  (req: AuthenticatedRequest, res) => {
    try {
      if (!req.file) {
        res.status(400).json({ error: 'Please attach a system logo image file.' });
        return;
      }
      const cfg = saveBrandingAsset({
        assetType: 'logo',
        buffer: req.file.buffer,
        originalFilename: req.file.originalname,
        mimeType: req.file.mimetype,
        user: req.currentUser!,
        ipAddress: req.ip,
      });
      res.status(201).json(cfg);
    } catch (err) {
      res.status(400).json({ error: (err as Error).message });
    }
  }
);

app.post(
  '/api/admin/branding/favicon',
  requirePermission('manage_branding'),
  upload.single('file'),
  (req: AuthenticatedRequest, res) => {
    try {
      if (!req.file) {
        res.status(400).json({ error: 'Please attach a favicon file (.ico, .png, or .svg).' });
        return;
      }
      const cfg = saveBrandingAsset({
        assetType: 'favicon',
        buffer: req.file.buffer,
        originalFilename: req.file.originalname,
        mimeType: req.file.mimetype,
        user: req.currentUser!,
        ipAddress: req.ip,
      });
      res.status(201).json(cfg);
    } catch (err) {
      res.status(400).json({ error: (err as Error).message });
    }
  }
);

app.delete(
  '/api/admin/branding/logo',
  requirePermission('manage_branding'),
  (req: AuthenticatedRequest, res) => {
    const cfg = removeBrandingAsset({
      assetType: 'logo',
      user: req.currentUser!,
      ipAddress: req.ip,
    });
    res.json(cfg);
  }
);

app.delete(
  '/api/admin/branding/favicon',
  requirePermission('manage_branding'),
  (req: AuthenticatedRequest, res) => {
    const cfg = removeBrandingAsset({
      assetType: 'favicon',
      user: req.currentUser!,
      ipAddress: req.ip,
    });
    res.json(cfg);
  }
);

app.post(
  '/api/admin/branding/restore/:id',
  requirePermission('manage_branding'),
  (req: AuthenticatedRequest, res) => {
    try {
      const cfg = restoreBrandingAsset({
        id: Number(req.params.id),
        user: req.currentUser!,
        ipAddress: req.ip,
      });
      res.json(cfg);
    } catch (err) {
      res.status(400).json({ error: (err as Error).message });
    }
  }
);

// Live Events (Authenticated Users Only)
app.get('/api/events', requirePermission('view_command_room'), (_req, res) => {
  registerSseClient(res);
});

// ---------- Authentication & RBAC ----------
app.get('/api/auth/me', (req: AuthenticatedRequest, res) => {
  const settings = getSystemSettings();
  res.json(buildAuthContext(req.currentUser, settings.guestPublicOverviewEnabled));
});

app.post('/api/auth/login', (req: AuthenticatedRequest, res) => {
  const { username, password } = req.body ?? {};
  if (!username || !password) {
    res.status(400).json({ error: 'Username/email and password are required.' });
    return;
  }

  const row = db
    .prepare(
      `SELECT * FROM users WHERE (lower(username) = lower(?) OR lower(email) = lower(?)) AND is_active = 1`
    )
    .get(String(username).trim(), String(username).trim()) as
    | Record<string, unknown>
    | undefined;

  if (!row || !verifyPassword(String(password), String(row.password_hash))) {
    recordAuditLog({
      action: 'LOGIN_FAILED',
      entityType: 'user',
      entityId: String(username),
      details: `Failed login attempt for "${username}".`,
      ipAddress: req.ip,
    });
    res.status(401).json({ error: 'Invalid username or password.' });
    return;
  }

  const user = mapUserRow(row);
  const nowIso = new Date().toISOString();
  db.prepare('UPDATE users SET last_login_at = ? WHERE id = ?').run(nowIso, user.id);

  const token = signSessionToken({
    id: user.id,
    username: user.username,
    role: user.role,
  });

  res.cookie('opcms_token', token, {
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    maxAge: 1000 * 60 * 60 * 24 * 7,
  });

  recordAuditLog({
    user,
    action: 'LOGIN_SUCCESS',
    entityType: 'user',
    entityId: user.id,
    details: `User "${user.username}" (${user.role}) signed in.`,
    ipAddress: req.ip,
  });

  const settings = getSystemSettings();
  res.json({
    token,
    ...buildAuthContext(
      { ...user, lastLoginAt: nowIso },
      settings.guestPublicOverviewEnabled
    ),
  });
});

app.post('/api/auth/logout', (req: AuthenticatedRequest, res) => {
  if (req.currentUser) {
    recordAuditLog({
      user: req.currentUser,
      action: 'LOGOUT',
      entityType: 'user',
      entityId: req.currentUser.id,
      details: `User "${req.currentUser.username}" signed out.`,
      ipAddress: req.ip,
    });
  }
  res.clearCookie('opcms_token', { path: '/' });
  res.json({ ok: true });
});

app.post('/api/auth/change-password', (req: AuthenticatedRequest, res) => {
  if (!req.currentUser) {
    res.status(401).json({ error: 'Authentication required.' });
    return;
  }
  const { currentPassword, newPassword } = req.body ?? {};
  if (!currentPassword || !newPassword) {
    res.status(400).json({ error: 'Current password and new password are required.' });
    return;
  }
  const nextPw = String(newPassword);
  if (nextPw.length < 10 || !/[A-Za-z]/.test(nextPw) || !/[0-9!@#$%^&*]/.test(nextPw)) {
    res.status(400).json({
      error: 'New password must be at least 10 characters and include letters plus numbers or symbols.',
    });
    return;
  }

  const row = db
    .prepare('SELECT password_hash FROM users WHERE id = ? AND is_active = 1')
    .get(req.currentUser.id) as { password_hash: string } | undefined;
  if (!row || !verifyPassword(String(currentPassword), row.password_hash)) {
    res.status(400).json({ error: 'Current password is incorrect.' });
    return;
  }

  db.prepare(
    'UPDATE users SET password_hash = ?, must_change_password = 0 WHERE id = ?'
  ).run(hashPassword(nextPw), req.currentUser.id);

  recordAuditLog({
    user: req.currentUser,
    action: 'PASSWORD_CHANGED',
    entityType: 'user',
    entityId: req.currentUser.id,
    details: `User "${req.currentUser.username}" changed password.`,
    ipAddress: req.ip,
  });

  res.json({ ok: true, user: { ...req.currentUser, mustChangePassword: false } });
});

// ---------- Public Regional Overview (Only when explicitly enabled by System Admin) ----------
app.get('/api/public/overview', (req: AuthenticatedRequest, res) => {
  const settings = getSystemSettings();
  if (!settings.guestPublicOverviewEnabled && !req.currentUser) {
    res.status(401).json({
      error: 'Authentication required. Public overview is currently disabled by System Administrator.',
    });
    return;
  }
  const campRow = db
    .prepare('SELECT name, round_code FROM campaigns ORDER BY id ASC LIMIT 1')
    .get() as { name?: string; round_code?: string } | undefined;
  const summary = computeDashboardSummary({ campaignId: 1 });
  res.json({
    campaignName:
      campRow?.name ?? 'Oromia Region – Polio SIA Campaign',
    roundCode: campRow?.round_code ?? 'R1-NOV-2026',
    totalPlannedTarget: summary.kpis.totalPlannedTarget,
    totalChildrenVaccinated0_59: summary.kpis.totalChildrenVaccinated0_59,
    overallVaccinationCoveragePct: summary.kpis.overallVaccinationCoveragePct,
    expectedReportingWoredas: summary.kpis.expectedReportingWoredas,
    submittedWoredas: summary.kpis.submittedWoredas,
    serverTimestamp: summary.serverTimestamp,
  });
});

// ---------- Campaigns ----------
app.get('/api/campaigns', requirePermission('view_command_room'), (_req, res) => {
  const rows = db
    .prepare('SELECT * FROM campaigns ORDER BY id ASC')
    .all() as Array<Record<string, unknown>>;
  res.json(
    rows.map((r) => ({
      id: Number(r.id),
      name: String(r.name),
      roundCode: String(r.round_code),
      vaccines: String(r.vaccines),
      startDate: String(r.start_date),
      endDate: String(r.end_date),
      expectedDays: Number(r.expected_days),
      status: r.status,
      createdAt: String(r.created_at),
    }))
  );
});

app.post(
  '/api/campaigns',
  requirePermission('manage_settings'),
  (req: AuthenticatedRequest, res) => {
    const { name, roundCode, vaccines, startDate, endDate, expectedDays } =
      req.body ?? {};
    if (!name || !roundCode || !startDate || !endDate) {
      res.status(400).json({ error: 'Name, round code, start date, and end date are required.' });
      return;
    }
    const result = db
      .prepare(
        `INSERT INTO campaigns (name, round_code, vaccines, start_date, end_date, expected_days, status)
         VALUES (?, ?, ?, ?, ?, ?, 'active')`
      )
      .run(
        String(name),
        String(roundCode),
        String(vaccines ?? 'nOPV2 & bOPV2'),
        String(startDate),
        String(endDate),
        Number(expectedDays ?? 4)
      );

    recordAuditLog({
      user: req.currentUser,
      action: 'CAMPAIGN_CREATED',
      entityType: 'campaign',
      entityId: Number(result.lastInsertRowid),
      details: `Created campaign "${name}" (${roundCode}).`,
      ipAddress: req.ip,
    });

    invalidateAnalyticsCache();
    broadcastEvent({
      type: 'settings:updated',
      actor: req.currentUser!.fullName,
      message: `Campaign round "${roundCode}" created.`,
    });

    res.status(201).json({ id: Number(result.lastInsertRowid) });
  }
);

// ---------- Command Room (Cached Large-Screen Aggregates) ----------
app.get(
  '/api/command-room/state',
  requirePermission('view_command_room'),
  (req, res) => {
    try {
      const filter = parseFilter(req);
      const data = getCommandRoomState(filter);
      res.json(data);
    } catch (err) {
      res.status(500).json({ error: (err as Error).message });
    }
  }
);

app.get(
  '/api/command-room/woredas',
  requirePermission('view_command_room'),
  (req, res) => {
    try {
      const filter = parseFilter(req);
      const page = req.query.page ? Number(req.query.page) : 1;
      const pageSize = req.query.pageSize ? Number(req.query.pageSize) : 25;
      const status = req.query.status ? String(req.query.status) : undefined;
      res.json(getPaginatedWoredaStatuses({ filter, page, pageSize, status }));
    } catch (err) {
      res.status(500).json({ error: (err as Error).message });
    }
  }
);

// ---------- Dashboard & Analytics ----------
app.get(
  '/api/dashboard/summary',
  requirePermission('view_dashboard'),
  (req, res) => {
    try {
      const filter = parseFilter(req);
      const data = computeDashboardSummary(filter);
      res.json(data);
    } catch (err) {
      res.status(500).json({ error: (err as Error).message });
    }
  }
);

app.get(
  '/api/analytics/advanced',
  requirePermission('view_dashboard'),
  (req, res) => {
    try {
      const filter = parseFilter(req);
      const data = computeAdvancedAnalytics(filter);
      res.json(data);
    } catch (err) {
      res.status(500).json({ error: (err as Error).message });
    }
  }
);

app.get('/api/locations', requirePermission('view_dashboard'), (req, res) => {
  const filter = parseFilter(req);
  res.json(getFilteredLocations(filter));
});

app.get('/api/reports/daily', requirePermission('view_dashboard'), (req, res) => {
  const filter = parseFilter(req);
  res.json(getFilteredReports(filter));
});

// Explicit record correction workflow (audited, versioned, never silent overwrite)
app.patch(
  '/api/reports/daily/:id/correct',
  requirePermission('correct_data'),
  (req: AuthenticatedRequest, res) => {
    const id = Number(req.params.id);
    const existing = db
      .prepare('SELECT * FROM campaign_daily_reports WHERE id = ? AND is_active = 1')
      .get(id) as Record<string, unknown> | undefined;

    if (!existing) {
      res.status(404).json({ error: 'Active campaign report record not found.' });
      return;
    }

    const patch = req.body ?? {};
    const fields = [
      'vacc_0_11_before',
      'vacc_0_11_not_before',
      'vacc_12_59_before',
      'vacc_12_59_not_before',
      'vacc_60_120_before',
      'vacc_60_120_not_before',
      'total_vaccinated_0_59',
      'nopv2_vials_received',
      'nopv2_vials_used',
      'bopv_vials_received',
      'bopv_vials_used',
      'afp_alerts_count',
      'aefi_alerts_count',
      'sm_hhs_visited',
      'sm_group_discussions',
      'sm_ipc_reached',
      'zd_identified_linked',
      'zd_vaccinated',
      'uv_identified_linked',
      'uv_vaccinated',
      'teams_total',
      'teams_reported',
      'remarks',
    ];

    const camelToSnake: Record<string, string> = {
      vacc0_11Before: 'vacc_0_11_before',
      vacc0_11NotBefore: 'vacc_0_11_not_before',
      vacc12_59Before: 'vacc_12_59_before',
      vacc12_59NotBefore: 'vacc_12_59_not_before',
      vacc60_120Before: 'vacc_60_120_before',
      vacc60_120NotBefore: 'vacc_60_120_not_before',
      totalVaccinated0_59: 'total_vaccinated_0_59',
      nopv2VialsReceived: 'nopv2_vials_received',
      nopv2VialsUsed: 'nopv2_vials_used',
      bopvVialsReceived: 'bopv_vials_received',
      bopvVialsUsed: 'bopv_vials_used',
      afpAlertsCount: 'afp_alerts_count',
      aefiAlertsCount: 'aefi_alerts_count',
      smHhsVisited: 'sm_hhs_visited',
      smGroupDiscussions: 'sm_group_discussions',
      smIpcReached: 'sm_ipc_reached',
      zdIdentifiedLinked: 'zd_identified_linked',
      zdVaccinated: 'zd_vaccinated',
      uvIdentifiedLinked: 'uv_identified_linked',
      uvVaccinated: 'uv_vaccinated',
      teamsTotal: 'teams_total',
      teamsReported: 'teams_reported',
      remarks: 'remarks',
    };

    const updatedValues: Record<string, string | number | null> = {};
    for (const [k, v] of Object.entries(existing)) {
      updatedValues[k] =
        v === null || v === undefined
          ? null
          : typeof v === 'number' || typeof v === 'string'
            ? v
            : String(v);
    }
    for (const [camel, snake] of Object.entries(camelToSnake)) {
      if (patch[camel] !== undefined && fields.includes(snake)) {
        const val = patch[camel];
        updatedValues[snake] =
          val === null || val === undefined
            ? null
            : typeof val === 'number'
              ? val
              : String(val);
      }
    }

    const total0_59 = Number(updatedValues.total_vaccinated_0_59 ?? 0);
    const dailyTarget = Number(existing.daily_target ?? 0);
    const plannedTarget = Number(existing.total_planned_target ?? 0);
    const dailyPct =
      dailyTarget > 0 ? Math.round((total0_59 / dailyTarget) * 10000) / 100 : 0;
    const totalPct =
      plannedTarget > 0
        ? Math.round((total0_59 / plannedTarget) * 10000) / 100
        : 0;

    db.exec('BEGIN');
    try {
      db.prepare('UPDATE campaign_daily_reports SET is_active = 0 WHERE id = ?').run(
        id
      );

      const ins = db
        .prepare(
          `INSERT INTO campaign_daily_reports (
            campaign_id, import_batch_id, serial_no,
            raw_region, raw_zone, raw_woreda, canonical_region, canonical_zone, canonical_woreda,
            campaign_day_label, campaign_day_num, report_date,
            total_planned_target, daily_target,
            vacc_0_11_before, vacc_0_11_not_before,
            vacc_12_59_before, vacc_12_59_not_before,
            vacc_60_120_before, vacc_60_120_not_before,
            total_vaccinated_0_59, daily_covered_pct, covered_from_total_pct,
            nopv2_vials_received, nopv2_vials_used, nopv2_vials_partially_used,
            nopv2_vials_returned_unused_good, nopv2_vials_broken, nopv2_vials_returned_bad,
            nopv2_vials_lost, nopv2_wastage_rate_pct,
            bopv_vials_received, bopv_vials_used, bopv_vials_partially_used,
            bopv_vials_returned_unused_good, bopv_vials_broken, bopv_vials_returned_bad,
            bopv_vials_lost, bopv_wastage_rate_pct,
            afp_alerts_count, aefi_alerts_count,
            sm_hhs_visited, sm_group_discussions, sm_ipc_reached,
            zd_identified_linked, zd_vaccinated,
            uv_identified_linked, uv_vaccinated,
            teams_total, teams_reported, remarks,
            has_reported_activity, source_submitted_at, uploaded_at, version, is_active
          ) VALUES (
            ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?,
            ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?,
            ?, ?, ?, ?, ?, ?, ?, ?,
            ?, ?, ?, ?, ?, ?, ?, ?,
            ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?,
            1, ?, ?, ?, 1
          )`
        )
        .run(
          updatedValues.campaign_id,
          updatedValues.import_batch_id,
          updatedValues.serial_no,
          updatedValues.raw_region,
          updatedValues.raw_zone,
          updatedValues.raw_woreda,
          updatedValues.canonical_region,
          updatedValues.canonical_zone,
          updatedValues.canonical_woreda,
          updatedValues.campaign_day_label,
          updatedValues.campaign_day_num,
          updatedValues.report_date,
          plannedTarget,
          dailyTarget,
          updatedValues.vacc_0_11_before,
          updatedValues.vacc_0_11_not_before,
          updatedValues.vacc_12_59_before,
          updatedValues.vacc_12_59_not_before,
          updatedValues.vacc_60_120_before,
          updatedValues.vacc_60_120_not_before,
          total0_59,
          dailyPct,
          totalPct,
          updatedValues.nopv2_vials_received,
          updatedValues.nopv2_vials_used,
          updatedValues.nopv2_vials_partially_used,
          updatedValues.nopv2_vials_returned_unused_good,
          updatedValues.nopv2_vials_broken,
          updatedValues.nopv2_vials_returned_bad,
          updatedValues.nopv2_vials_lost,
          updatedValues.nopv2_wastage_rate_pct,
          updatedValues.bopv_vials_received,
          updatedValues.bopv_vials_used,
          updatedValues.bopv_vials_partially_used,
          updatedValues.bopv_vials_returned_unused_good,
          updatedValues.bopv_vials_broken,
          updatedValues.bopv_vials_returned_bad,
          updatedValues.bopv_vials_lost,
          updatedValues.bopv_wastage_rate_pct,
          updatedValues.afp_alerts_count,
          updatedValues.aefi_alerts_count,
          updatedValues.sm_hhs_visited,
          updatedValues.sm_group_discussions,
          updatedValues.sm_ipc_reached,
          updatedValues.zd_identified_linked,
          updatedValues.zd_vaccinated,
          updatedValues.uv_identified_linked,
          updatedValues.uv_vaccinated,
          updatedValues.teams_total,
          updatedValues.teams_reported,
          updatedValues.remarks,
          updatedValues.source_submitted_at,
          new Date().toISOString(),
          Number(existing.version) + 1
        );

      db.exec('COMMIT');
      invalidateAnalyticsCache();

      const newId = Number(ins.lastInsertRowid);
      recordAuditLog({
        user: req.currentUser,
        action: 'RECORD_CORRECTED',
        entityType: 'campaign_daily_report',
        entityId: newId,
        details: `Corrected record #${id} -> v${Number(existing.version) + 1} (#${newId}) for ${existing.canonical_zone} / ${existing.canonical_woreda}. Reason: ${patch.correctionReason ?? 'Data verification update'}`,
        ipAddress: req.ip,
      });

      broadcastEvent({
        type: 'record:corrected',
        actor: req.currentUser!.fullName,
        message: `Report corrected for ${existing.canonical_woreda} (${existing.canonical_zone})`,
      });

      res.json({ ok: true, id: newId });
    } catch (err) {
      db.exec('ROLLBACK');
      res.status(500).json({ error: (err as Error).message });
    }
  }
);

// ---------- Data Upload & Import Center ----------
app.post(
  '/api/imports/stage',
  requirePermission('upload_data'),
  upload.single('file'),
  (req: AuthenticatedRequest, res) => {
    try {
      if (!req.file) {
        res.status(400).json({ error: 'No file uploaded.' });
        return;
      }
      const ext = path.extname(req.file.originalname).toLowerCase();
      if (ext !== '.xlsx' && ext !== '.csv') {
        res.status(400).json({
          error: 'Unsupported file format. Only .xlsx and .csv files are accepted.',
        });
        return;
      }
      const campaignId = Number(req.body?.campaignId ?? 1);
      const preview = stageUploadedFile({
        buffer: req.file.buffer,
        originalFilename: req.file.originalname,
        campaignId,
        user: req.currentUser!,
      });
      res.json(preview);
    } catch (err) {
      res.status(400).json({ error: (err as Error).message });
    }
  }
);

app.post(
  '/api/imports/confirm',
  requirePermission('confirm_import'),
  (req: AuthenticatedRequest, res) => {
    try {
      const { stagingId, importMode, sourceSubmittedAt, notes } = req.body ?? {};
      if (!stagingId) {
        res.status(400).json({ error: 'stagingId is required.' });
        return;
      }
      const mode: ImportMode =
        importMode === 'incremental_update' || importMode === 'replace_period'
          ? importMode
          : 'incremental_skip';

      const batch = confirmStagedImport({
        stagingId: String(stagingId),
        importMode: mode,
        sourceSubmittedAt: sourceSubmittedAt ? String(sourceSubmittedAt) : null,
        notes: notes ? String(notes) : null,
        user: req.currentUser!,
      });
      invalidateAnalyticsCache();
      res.status(201).json(batch);
    } catch (err) {
      res.status(400).json({ error: (err as Error).message });
    }
  }
);

app.get('/api/imports/history', requirePermission('upload_data'), (req, res) => {
  const campaignId = req.query.campaignId ? Number(req.query.campaignId) : undefined;
  res.json(listImportBatches(campaignId));
});

app.get('/api/imports/:id/download', requirePermission('upload_data'), (req, res) => {
  const id = Number(req.params.id);
  const row = db
    .prepare('SELECT original_filename, stored_path FROM import_batches WHERE id = ?')
    .get(id) as { original_filename: string; stored_path: string } | undefined;

  if (!row || !fs.existsSync(row.stored_path)) {
    res.status(404).json({ error: 'Original uploaded file not found on server.' });
    return;
  }
  res.download(row.stored_path, row.original_filename);
});

app.post(
  '/api/imports/:id/rollback',
  requirePermission('rollback_import'),
  (req: AuthenticatedRequest, res) => {
    try {
      const id = Number(req.params.id);
      const batch = rollbackImportBatch(id, req.currentUser!);
      invalidateAnalyticsCache();
      res.json(batch);
    } catch (err) {
      res.status(400).json({ error: (err as Error).message });
    }
  }
);

// Download official reporting template (.csv or .xlsx)
app.get('/api/templates/official', requirePermission('upload_data'), (req, res) => {
  const format = req.query.format === 'xlsx' ? 'xlsx' : 'csv';
  const csvPath = getOfficialTemplatePath();
  if (!fs.existsSync(csvPath)) {
    res.status(404).json({ error: 'Official reporting template file not found.' });
    return;
  }
  if (format === 'csv') {
    res.download(
      csvPath,
      'Oromia_Region_Round1_nOPV2_bOPV2_SIA_Daily_Admin_Template.csv'
    );
    return;
  }
  const buf = fs.readFileSync(csvPath);
  const wb = XLSX.read(buf, { type: 'buffer' });
  const out = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Buffer;
  res.setHeader(
    'Content-Disposition',
    'attachment; filename="Oromia_Region_Round1_nOPV2_bOPV2_SIA_Daily_Admin_Template.xlsx"'
  );
  res.setHeader(
    'Content-Type',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  );
  res.send(out);
});

// ---------- AFP & AEFI Surveillance Alerts ----------
app.get('/api/alerts', requirePermission('view_dashboard'), (req, res) => {
  const filter = parseFilter(req);
  res.json(getActiveAlerts(filter));
});

app.patch(
  '/api/alerts/:id',
  requirePermission('manage_alerts'),
  (req: AuthenticatedRequest, res) => {
    const id = Number(req.params.id);
    const existing = db
      .prepare('SELECT * FROM surveillance_alerts WHERE id = ? AND is_active = 1')
      .get(id) as Record<string, unknown> | undefined;
    if (!existing) {
      res.status(404).json({ error: 'Surveillance alert not found.' });
      return;
    }

    const {
      clinicalStatus,
      verifiedClinicalCases,
      followUpNotes,
      assignedInvestigator,
    } = req.body ?? {};

    const validStatuses: ClinicalCaseStatus[] = [
      'reported_pending',
      'under_investigation',
      'sample_collected',
      'verified_confirmed',
      'discarded',
    ];
    const nextStatus = validStatuses.includes(clinicalStatus)
      ? clinicalStatus
      : String(existing.clinical_status);

    const nextVerified =
      verifiedClinicalCases !== undefined
        ? Math.max(0, Number(verifiedClinicalCases))
        : Number(existing.verified_clinical_cases);

    const nowIso = new Date().toISOString();
    db.prepare(
      `UPDATE surveillance_alerts
       SET clinical_status = ?, verified_clinical_cases = ?, follow_up_notes = ?,
           assigned_investigator = ?, updated_by_name = ?, updated_at = ?
       WHERE id = ?`
    ).run(
      nextStatus,
      nextVerified,
      followUpNotes !== undefined
        ? String(followUpNotes)
        : String(existing.follow_up_notes),
      assignedInvestigator !== undefined
        ? String(assignedInvestigator)
        : String(existing.assigned_investigator),
      req.currentUser!.fullName,
      nowIso,
      id
    );

    recordAuditLog({
      user: req.currentUser,
      action: 'ALERT_FOLLOWUP_UPDATED',
      entityType: 'surveillance_alert',
      entityId: id,
      details: `Updated ${existing.alert_type} alert #${id} (${existing.canonical_zone} / ${existing.canonical_woreda}) to status "${nextStatus}", verified cases=${nextVerified}.`,
      ipAddress: req.ip,
    });

    invalidateAnalyticsCache();
    broadcastEvent({
      type: 'alert:updated',
      actor: req.currentUser!.fullName,
      message: `${existing.alert_type} alert follow-up updated for ${existing.canonical_woreda}`,
    });

    res.json({ ok: true });
  }
);

// ---------- Geographic Boundaries (GeoJSON & Shapefile .zip) ----------
app.get('/api/geo/boundaries', requirePermission('view_command_room'), (_req, res) => {
  const rows = db
    .prepare('SELECT * FROM geo_boundaries ORDER BY id DESC')
    .all() as Array<Record<string, unknown>>;
  res.json(
    rows.map((r) => ({
      id: Number(r.id),
      level: r.level,
      nameField: String(r.name_field),
      featureCount: Number(r.feature_count),
      uploadedByName: String(r.uploaded_by_name),
      uploadedAt: String(r.uploaded_at),
      geojson: JSON.parse(String(r.geojson_text)),
    }))
  );
});

app.post(
  '/api/geo/boundaries',
  requirePermission('upload_geo'),
  upload.single('file'),
  async (req: AuthenticatedRequest, res) => {
    try {
      if (!req.file) {
        res.status(400).json({ error: 'Please attach a .geojson, .json, or zipped Shapefile (.zip).' });
        return;
      }
      const ext = path.extname(req.file.originalname).toLowerCase();
      let geojson: GeoJSON.FeatureCollection;

      if (ext === '.zip') {
        const converted = await shp(req.file.buffer);
        geojson = Array.isArray(converted)
          ? (converted[0] as GeoJSON.FeatureCollection)
          : (converted as GeoJSON.FeatureCollection);
      } else if (ext === '.geojson' || ext === '.json') {
        geojson = JSON.parse(req.file.buffer.toString('utf8'));
      } else {
        res.status(400).json({
          error: 'Unsupported boundary format. Upload .geojson, .json, or .zip (Shapefile).',
        });
        return;
      }

      if (!geojson || !Array.isArray(geojson.features) || geojson.features.length === 0) {
        res.status(400).json({ error: 'Uploaded boundary file contains no valid GeoJSON features.' });
        return;
      }

      const level = req.body?.level === 'zone' ? 'zone' : 'woreda';
      const firstProps = geojson.features[0]?.properties ?? {};
      const guessedField =
        req.body?.nameField ||
        Object.keys(firstProps).find((k) =>
          /woreda|adm3|adm2|zone|name/i.test(k)
        ) ||
        Object.keys(firstProps)[0] ||
        'NAME';

      // Replace existing boundary for same level
      db.prepare('DELETE FROM geo_boundaries WHERE level = ?').run(level);
      const ins = db
        .prepare(
          `INSERT INTO geo_boundaries (level, name_field, feature_count, geojson_text, uploaded_by_name)
           VALUES (?, ?, ?, ?, ?)`
        )
        .run(
          level,
          guessedField,
          geojson.features.length,
          JSON.stringify(geojson),
          req.currentUser!.fullName
        );

      recordAuditLog({
        user: req.currentUser,
        action: 'GEO_BOUNDARY_IMPORTED',
        entityType: 'geo_boundary',
        entityId: Number(ins.lastInsertRowid),
        details: `Imported ${geojson.features.length} ${level} boundary features from "${req.file.originalname}".`,
        ipAddress: req.ip,
      });

      invalidateAnalyticsCache();
      broadcastEvent({
        type: 'geo:updated',
        actor: req.currentUser!.fullName,
        message: `Uploaded ${level} geographic boundaries (${geojson.features.length} features).`,
      });

      res.status(201).json({
        id: Number(ins.lastInsertRowid),
        level,
        nameField: guessedField,
        featureCount: geojson.features.length,
      });
    } catch (err) {
      res.status(400).json({ error: (err as Error).message });
    }
  }
);

// ---------- Reports Export (.xlsx / .csv / .pdf) ----------
app.get('/api/exports/:reportType', requirePermission('export_reports'), (req: AuthenticatedRequest, res) => {
  try {
    const reportType = req.params.reportType as ReportType;
    const format: ExportFormat =
      req.query.format === 'xlsx'
        ? 'xlsx'
        : req.query.format === 'pdf'
          ? 'pdf'
          : 'csv';
    const filter = parseFilter(req);

    const { buffer, mimeType, filename } = generateExportBuffer({
      reportType,
      format,
      filter,
    });

    recordAuditLog({
      user: req.currentUser,
      action: 'REPORT_EXPORTED',
      entityType: 'report',
      entityId: reportType,
      details: `Exported ${reportType} as ${format.toUpperCase()}.`,
      ipAddress: req.ip,
    });

    res.setHeader('Content-Type', mimeType);
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(buffer);
  } catch (err) {
    res.status(400).json({ error: (err as Error).message });
  }
});

// ---------- User Management & Audit Logs ----------
app.get(
  '/api/users',
  requirePermission('manage_users'),
  (_req, res) => {
    const rows = db
      .prepare('SELECT * FROM users ORDER BY id ASC')
      .all() as Array<Record<string, unknown>>;
    res.json(rows.map(mapUserRow));
  }
);

app.post(
  '/api/users',
  requirePermission('manage_users'),
  (req: AuthenticatedRequest, res) => {
    const {
      username,
      fullName,
      email,
      password,
      role,
      assignedZone,
      assignedWoreda,
      mustChangePassword,
    } = req.body ?? {};
    if (!username || !fullName || !email || !password || !role) {
      res.status(400).json({ error: 'All required user fields must be provided.' });
      return;
    }
    const rawPw = String(password);
    if (
      String(role) === 'command_room_viewer' &&
      (rawPw.length < 10 || !/[A-Za-z]/.test(rawPw) || !/[0-9!@#$%^&*]/.test(rawPw))
    ) {
      res.status(400).json({
        error:
          'COMMAND_ROOM_VIEWER initial password must be at least 10 characters with letters and numbers/symbols.',
      });
      return;
    }

    const forceChange =
      mustChangePassword !== undefined
        ? Boolean(mustChangePassword)
        : String(role) === 'command_room_viewer';

    try {
      const ins = db
        .prepare(
          `INSERT INTO users (username, full_name, email, password_hash, role, assigned_zone, assigned_woreda, must_change_password)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
        )
        .run(
          String(username).trim(),
          String(fullName).trim(),
          String(email).trim(),
          hashPassword(rawPw),
          String(role),
          assignedZone ? String(assignedZone) : null,
          assignedWoreda ? String(assignedWoreda) : null,
          forceChange ? 1 : 0
        );

      recordAuditLog({
        user: req.currentUser,
        action: 'USER_CREATED',
        entityType: 'user',
        entityId: Number(ins.lastInsertRowid),
        details: `Created user "${username}" with role "${role}".`,
        ipAddress: req.ip,
      });

      res.status(201).json({ id: Number(ins.lastInsertRowid) });
    } catch (err) {
      res.status(400).json({ error: (err as Error).message });
    }
  }
);

app.patch(
  '/api/users/:id',
  requirePermission('manage_users'),
  (req: AuthenticatedRequest, res) => {
    const id = Number(req.params.id);
    const { role, isActive, assignedZone, assignedWoreda, newPassword, mustChangePassword } =
      req.body ?? {};
    const existing = db
      .prepare('SELECT * FROM users WHERE id = ?')
      .get(id) as Record<string, unknown> | undefined;
    if (!existing) {
      res.status(404).json({ error: 'User not found.' });
      return;
    }

    if (newPassword) {
      const pw = String(newPassword);
      const targetRole = role ? String(role) : String(existing.role);
      if (
        targetRole === 'command_room_viewer' &&
        (pw.length < 10 || !/[A-Za-z]/.test(pw) || !/[0-9!@#$%^&*]/.test(pw))
      ) {
        res.status(400).json({
          error:
            'Reset password for COMMAND_ROOM_VIEWER must be at least 10 characters with letters and numbers/symbols.',
        });
        return;
      }
    }

    db.prepare(
      `UPDATE users SET role = ?, is_active = ?, assigned_zone = ?, assigned_woreda = ?, must_change_password = ? WHERE id = ?`
    ).run(
      role ? String(role) : String(existing.role),
      isActive !== undefined ? (isActive ? 1 : 0) : Number(existing.is_active),
      assignedZone !== undefined
        ? assignedZone || null
        : existing.assigned_zone,
      assignedWoreda !== undefined
        ? assignedWoreda || null
        : existing.assigned_woreda,
      mustChangePassword !== undefined
        ? mustChangePassword
          ? 1
          : 0
        : newPassword
          ? 1
          : Number(existing.must_change_password ?? 0),
      id
    );

    if (newPassword) {
      db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(
        hashPassword(String(newPassword)),
        id
      );
    }

    recordAuditLog({
      user: req.currentUser,
      action: 'USER_UPDATED',
      entityType: 'user',
      entityId: id,
      details: `Updated user #${id} (${existing.username}).`,
      ipAddress: req.ip,
    });

    res.json({ ok: true });
  }
);

app.get(
  '/api/audit-logs',
  requirePermission('view_audit_logs'),
  (_req, res) => {
    const rows = db
      .prepare('SELECT * FROM audit_logs ORDER BY id DESC LIMIT 250')
      .all() as Array<Record<string, unknown>>;
    res.json(
      rows.map((r) => ({
        id: Number(r.id),
        userId: r.user_id !== null ? Number(r.user_id) : null,
        username: String(r.username),
        userRole: String(r.user_role),
        action: String(r.action),
        entityType: String(r.entity_type),
        entityId: String(r.entity_id),
        details: String(r.details),
        ipAddress: String(r.ip_address),
        createdAt: String(r.created_at),
      }))
    );
  }
);

// ---------- System Settings ----------
app.get('/api/settings', requirePermission('manage_settings'), (_req, res) => {
  res.json(getSystemSettings());
});

app.put(
  '/api/settings',
  requirePermission('manage_settings'),
  (req: AuthenticatedRequest, res) => {
    const body = req.body ?? {};
    const allowedKeys = [
      'coverageTargetPct',
      'coverageCriticalPct',
      'maxWastagePct',
      'overTargetAlertPct',
      'dailyDeviationPct',
      'expectedWoredasOverride',
      'guestPublicOverviewEnabled',
      'commandRoomAutoRotate',
      'commandRoomIntervalSec',
      'commandRoomEnabledScreens',
      'commandRoomDefaultScreen',
      'commandRoomFullscreenStartup',
      'commandRoomDataRefreshSec',
      'commandRoomDisplayTitle',
    ];
    const upsert = db.prepare(
      `INSERT INTO system_settings (key, value, updated_at)
       VALUES (?, ?, datetime('now'))
       ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`
    );

    for (const k of allowedKeys) {
      if (body[k] !== undefined) {
        if (k === 'commandRoomEnabledScreens' && Array.isArray(body[k])) {
          upsert.run(k, body[k].join(','));
        } else {
          upsert.run(k, body[k] === null ? '' : String(body[k]));
        }
      }
    }

    invalidateAnalyticsCache();

    recordAuditLog({
      user: req.currentUser,
      action: 'SETTINGS_UPDATED',
      entityType: 'system_settings',
      entityId: 'global',
      details: `Updated settings: ${JSON.stringify(body)}`,
      ipAddress: req.ip,
    });

    broadcastEvent({
      type: 'settings:updated',
      actor: req.currentUser!.fullName,
      message: 'Campaign & Command Room settings updated.',
    });

    res.json(getSystemSettings());
  }
);

// ---------- Vite Dev Middleware or Static Production Build ----------
async function startServer() {
  if (process.env.NODE_ENV === 'production') {
    const distDir = path.resolve(process.cwd(), 'dist');
    app.use(express.static(distDir));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  } else {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(
      `OHB-OPCMS server running at http://0.0.0.0:${PORT} (NODE_ENV=${process.env.NODE_ENV ?? 'development'})`
    );
  });
}

startServer();
