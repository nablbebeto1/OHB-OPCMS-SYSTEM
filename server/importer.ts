import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { db, UPLOADS_DIR } from './db.ts';
import { savePermanentFile } from './files.ts';
import { parseCampaignSpreadsheet } from './parser.ts';
import { classifyLocationType } from './normalize.ts';
import { recordAuditLog } from './auth.ts';
import { broadcastEvent } from './sse.ts';
import type {
  ImportBatch,
  ImportMode,
  ImportPreviewPayload,
  ParsedCampaignRow,
  UserAccount,
} from '../src/types/opcms.ts';

interface StagedImport {
  stagingId: string;
  campaignId: number;
  originalFilename: string;
  storedPath: string;
  fileSizeBytes: number;
  fileFormat: 'xlsx' | 'csv';
  detectedTemplate: string;
  headerRowsDetected: number;
  unexpectedColumns: string[];
  totalSummaryRowsSkipped: number;
  rows: ParsedCampaignRow[];
  createdAt: number;
}

const stagedImports = new Map<string, StagedImport>();

// Clean up abandoned staged files older than 2 hours
setInterval(() => {
  const cutoff = Date.now() - 1000 * 60 * 60 * 2;
  for (const [id, item] of stagedImports.entries()) {
    if (item.createdAt < cutoff) {
      stagedImports.delete(id);
    }
  }
}, 1000 * 60 * 15);

function buildDedupKey(
  campaignId: number,
  dayNum: number | null,
  reportDate: string | null,
  zone: string,
  woreda: string
): string {
  return [
    campaignId,
    dayNum ?? 'x',
    (reportDate ?? '').trim().toLowerCase(),
    zone.trim().toLowerCase(),
    woreda.trim().toLowerCase(),
  ].join('|');
}

export function stageUploadedFile(params: {
  buffer: Buffer;
  originalFilename: string;
  campaignId: number;
  user: UserAccount;
}): ImportPreviewPayload {
  const ext = path.extname(params.originalFilename).toLowerCase();
  const fileFormat: 'xlsx' | 'csv' = ext === '.csv' ? 'csv' : 'xlsx';
  const stagingId = crypto.randomUUID();
  const safeName = params.originalFilename.replace(/[^a-zA-Z0-9._-]/g, '_');
  const storedPath = path.join(UPLOADS_DIR, `${stagingId}_${safeName}`);

  fs.writeFileSync(storedPath, params.buffer);

  const parsed = parseCampaignSpreadsheet(params.buffer, params.originalFilename);

  // Load existing active records for this campaign to detect duplicates
  const existingRows = db
    .prepare(
      `SELECT id, campaign_day_num, report_date, canonical_zone, canonical_woreda
       FROM campaign_daily_reports
       WHERE campaign_id = ? AND is_active = 1`
    )
    .all(params.campaignId) as Array<{
    id: number;
    campaign_day_num: number;
    report_date: string | null;
    canonical_zone: string;
    canonical_woreda: string;
  }>;

  const existingKeySet = new Set<string>();
  for (const er of existingRows) {
    existingKeySet.add(
      buildDedupKey(
        params.campaignId,
        er.campaign_day_num,
        er.report_date,
        er.canonical_zone,
        er.canonical_woreda
      )
    );
  }

  const seenInFile = new Set<string>();
  let validRowsCount = 0;
  let warningRowsCount = 0;
  let rejectedRowsCount = 0;
  let duplicateRowsCount = 0;
  let newRowsCount = 0;
  const detectedDaysSet = new Set<number>();

  for (const row of parsed.rows) {
    if (row.campaignDayNum) detectedDaysSet.add(row.campaignDayNum);
    const key = buildDedupKey(
      params.campaignId,
      row.campaignDayNum,
      row.reportDate,
      row.canonicalZone,
      row.canonicalWoreda
    );

    if (seenInFile.has(key)) {
      row.duplicateAction = 'duplicate_in_file';
      duplicateRowsCount++;
      row.issues.push({
        rowNumber: row.rowNumber,
        field: 'woreda',
        severity: 'warning',
        code: 'DUPLICATE_IN_FILE',
        message: `Duplicate record within same file for ${row.canonicalZone} / ${row.canonicalWoreda} (Day ${row.campaignDayNum}).`,
      });
      if (row.rowStatus === 'valid') row.rowStatus = 'warning';
    } else if (existingKeySet.has(key)) {
      row.duplicateAction = 'duplicate_existing';
      duplicateRowsCount++;
    } else {
      row.duplicateAction = 'new';
      newRowsCount++;
    }
    seenInFile.add(key);

    if (row.rowStatus === 'error') rejectedRowsCount++;
    else if (row.rowStatus === 'warning') warningRowsCount++;
    else validRowsCount++;
  }

  const validationStatus: ImportPreviewPayload['validationStatus'] =
    rejectedRowsCount > 0 && validRowsCount + warningRowsCount === 0
      ? 'failed'
      : warningRowsCount > 0 || rejectedRowsCount > 0 || parsed.unexpectedColumns.length > 0
        ? 'passed_with_warnings'
        : 'passed';

  stagedImports.set(stagingId, {
    stagingId,
    campaignId: params.campaignId,
    originalFilename: params.originalFilename,
    storedPath,
    fileSizeBytes: params.buffer.length,
    fileFormat,
    detectedTemplate: parsed.detectedTemplate,
    headerRowsDetected: parsed.headerRowsDetected,
    unexpectedColumns: parsed.unexpectedColumns,
    totalSummaryRowsSkipped: parsed.totalSummaryRowsSkipped,
    rows: parsed.rows,
    createdAt: Date.now(),
  });

  recordAuditLog({
    user: params.user,
    action: 'UPLOAD_STAGED',
    entityType: 'import_staging',
    entityId: stagingId,
    details: `Staged "${params.originalFilename}" (${parsed.rows.length} rows detected, ${duplicateRowsCount} duplicates, ${rejectedRowsCount} rejected)`,
  });

  return {
    stagingId,
    originalFilename: params.originalFilename,
    fileSizeBytes: params.buffer.length,
    fileFormat,
    detectedTemplate: parsed.detectedTemplate,
    headerRowsDetected: parsed.headerRowsDetected,
    unexpectedColumns: parsed.unexpectedColumns,
    totalRowsDetected: parsed.rows.length,
    totalSummaryRowsSkipped: parsed.totalSummaryRowsSkipped,
    validRowsCount,
    warningRowsCount,
    rejectedRowsCount,
    duplicateRowsCount,
    newRowsCount,
    validationStatus,
    issues: parsed.issues,
    previewRows: parsed.rows,
    detectedDays: Array.from(detectedDaysSet).sort((a, b) => a - b),
  };
}

export function confirmStagedImport(params: {
  stagingId: string;
  importMode: ImportMode;
  sourceSubmittedAt: string | null;
  notes: string | null;
  user: UserAccount;
}): ImportBatch {
  const staged = stagedImports.get(params.stagingId);
  if (!staged) {
    throw new Error(
      'Staging session expired or not found. Please re-upload the file.'
    );
  }

  // Enforce zone/woreda scope if officer is restricted
  if (params.user.role === 'zone_officer' && params.user.assignedZone) {
    const outOfScope = staged.rows.filter(
      (r) =>
        r.rowStatus !== 'error' &&
        r.canonicalZone.toLowerCase() !== params.user.assignedZone!.toLowerCase()
    );
    if (outOfScope.length > 0 && outOfScope.length === staged.rows.length) {
      throw new Error(
        `Zone officer "${params.user.assignedZone}" cannot import records solely outside their assigned zone.`
      );
    }
  }

  const nowIso = new Date().toISOString();
  const validRows = staged.rows.filter((r) => r.rowStatus !== 'error');
  const rejectedCount = staged.rows.length - validRows.length;

  let importedCount = 0;
  let updatedCount = 0;
  let skippedCount = 0;

  db.exec('BEGIN');
  try {
    const batchRes = db
      .prepare(
        `INSERT INTO import_batches (
          campaign_id, original_filename, stored_path, file_size_bytes,
          file_format, detected_template, import_mode, validation_status,
          detected_records, uploaded_by_user_id, uploaded_by_name,
          uploaded_at, confirmed_at, status, notes
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'confirmed', ?)`
      )
      .run(
        staged.campaignId,
        staged.originalFilename,
        staged.storedPath,
        staged.fileSizeBytes,
        staged.fileFormat,
        staged.detectedTemplate,
        params.importMode,
        rejectedCount > 0 ? 'passed_with_warnings' : 'passed',
        staged.rows.length,
        params.user.id,
        params.user.fullName,
        nowIso,
        nowIso,
        params.notes ?? null
      );

    const batchId = Number(batchRes.lastInsertRowid);

    // Also register confirmed import file in permanent stored_files catalog
    if (fs.existsSync(staged.storedPath)) {
      const fileBuf = fs.readFileSync(staged.storedPath);
      const mime =
        staged.fileFormat === 'csv'
          ? 'text/csv'
          : 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
      const perm = savePermanentFile({
        buffer: fileBuf,
        originalFilename: staged.originalFilename,
        mimeType: mime,
        user: params.user,
        module: 'imports',
        category: 'campaign_reports',
        description:
          params.notes ?? `Confirmed campaign import batch #${batchId}`,
        associatedRecordType: 'import_batch',
        associatedRecordId: batchId,
        recordAudit: false,
      });
      db.prepare('UPDATE import_batches SET stored_file_id = ? WHERE id = ?').run(
        perm.id,
        batchId
      );
    }

    // If replace_period, deactivate existing active records matching campaign + detected days (+ date if specified)
    if (params.importMode === 'replace_period') {
      const dayNums = Array.from(
        new Set(validRows.map((r) => r.campaignDayNum).filter(Boolean))
      ) as number[];
      for (const dayNum of dayNums) {
        const deactivated = db
          .prepare(
            `SELECT id FROM campaign_daily_reports
             WHERE campaign_id = ? AND campaign_day_num = ? AND is_active = 1`
          )
          .all(staged.campaignId, dayNum) as Array<{ id: number }>;

        if (deactivated.length > 0) {
          db.prepare(
            `UPDATE campaign_daily_reports
             SET is_active = 0, superseded_by_import_id = ?
             WHERE campaign_id = ? AND campaign_day_num = ? AND is_active = 1`
          ).run(batchId, staged.campaignId, dayNum);

          db.prepare(
            `UPDATE surveillance_alerts
             SET is_active = 0
             WHERE report_id IN (
               SELECT id FROM campaign_daily_reports WHERE superseded_by_import_id = ?
             )`
          ).run(batchId);
        }
      }
    }

    const insertReportStmt = db.prepare(
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
        ?, ?, ?, ?, 1
      )`
    );

    const ensureAdminLocStmt = db.prepare(
      `INSERT OR IGNORE INTO admin_locations (
        serial_no, raw_region, raw_zone, raw_woreda,
        canonical_region, canonical_zone, canonical_woreda,
        location_type, planned_target, daily_target
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    );

    const insertAlertStmt = db.prepare(
      `INSERT OR IGNORE INTO surveillance_alerts (
        campaign_id, report_id, alert_type, canonical_zone, canonical_woreda,
        campaign_day_num, report_date, administrative_alert_count, source_remarks
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    );

    const seenKeys = new Set<string>();

    for (const row of validRows) {
      if (!row.campaignDayNum) {
        skippedCount++;
        continue;
      }

      const key = buildDedupKey(
        staged.campaignId,
        row.campaignDayNum,
        row.reportDate,
        row.canonicalZone,
        row.canonicalWoreda
      );
      if (seenKeys.has(key)) {
        skippedCount++;
        continue;
      }
      seenKeys.add(key);

      // Register any new woreda encountered in admin_locations (never assumes fixed 275!)
      ensureAdminLocStmt.run(
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

      // Check existing active row for this (campaign, day, date, zone, woreda)
      const existing = db
        .prepare(
          `SELECT id, version FROM campaign_daily_reports
           WHERE campaign_id = ? AND campaign_day_num = ?
             AND COALESCE(report_date, '') = COALESCE(?, '')
             AND lower(canonical_zone) = lower(?)
             AND lower(canonical_woreda) = lower(?)
             AND is_active = 1`
        )
        .get(
          staged.campaignId,
          row.campaignDayNum,
          row.reportDate ?? '',
          row.canonicalZone,
          row.canonicalWoreda
        ) as { id: number; version: number } | undefined;

      let nextVersion = 1;
      if (existing) {
        if (params.importMode === 'incremental_skip') {
          skippedCount++;
          continue;
        }
        // incremental_update: supersede existing version without deleting
        nextVersion = existing.version + 1;
        db.prepare(
          `UPDATE campaign_daily_reports
           SET is_active = 0, superseded_by_import_id = ?
           WHERE id = ?`
        ).run(batchId, existing.id);
        db.prepare(
          `UPDATE surveillance_alerts SET is_active = 0 WHERE report_id = ?`
        ).run(existing.id);
        updatedCount++;
      } else {
        importedCount++;
      }

      const computedDailyPct =
        row.dailyCoveredPct !== null
          ? row.dailyCoveredPct
          : row.dailyTarget > 0
            ? Math.round((row.totalVaccinated0_59 / row.dailyTarget) * 10000) / 100
            : 0;
      const computedTotalPct =
        row.coveredFromTotalPct !== null
          ? row.coveredFromTotalPct
          : row.totalPlannedTarget > 0
            ? Math.round((row.totalVaccinated0_59 / row.totalPlannedTarget) * 10000) / 100
            : 0;

      const repRes = insertReportStmt.run(
        staged.campaignId,
        batchId,
        row.serialNo,
        row.rawRegion,
        row.rawZone,
        row.rawWoreda,
        row.canonicalRegion,
        row.canonicalZone,
        row.canonicalWoreda,
        row.campaignDayLabel,
        row.campaignDayNum,
        row.reportDate,
        row.totalPlannedTarget,
        row.dailyTarget,
        row.vacc0_11Before,
        row.vacc0_11NotBefore,
        row.vacc12_59Before,
        row.vacc12_59NotBefore,
        row.vacc60_120Before,
        row.vacc60_120NotBefore,
        row.totalVaccinated0_59,
        computedDailyPct,
        computedTotalPct,
        row.nopv2VialsReceived,
        row.nopv2VialsUsed,
        row.nopv2VialsPartiallyUsed,
        row.nopv2VialsReturnedUnusedGood,
        row.nopv2VialsBroken,
        row.nopv2VialsReturnedBad,
        row.nopv2VialsLost,
        row.nopv2WastageRatePct,
        row.bopvVialsReceived,
        row.bopvVialsUsed,
        row.bopvVialsPartiallyUsed,
        row.bopvVialsReturnedUnusedGood,
        row.bopvVialsBroken,
        row.bopvVialsReturnedBad,
        row.bopvVialsLost,
        row.bopvWastageRatePct,
        row.afpAlertsCount,
        row.aefiAlertsCount,
        row.smHhsVisited,
        row.smGroupDiscussions,
        row.smIpcReached,
        row.zdIdentifiedLinked,
        row.zdVaccinated,
        row.uvIdentifiedLinked,
        row.uvVaccinated,
        row.teamsTotal,
        row.teamsReported,
        row.remarks,
        row.hasReportedActivity ? 1 : 0,
        params.sourceSubmittedAt,
        nowIso,
        nextVersion
      );

      const reportId = Number(repRes.lastInsertRowid);

      if (row.afpAlertsCount > 0) {
        insertAlertStmt.run(
          staged.campaignId,
          reportId,
          'AFP',
          row.canonicalZone,
          row.canonicalWoreda,
          row.campaignDayNum,
          row.reportDate,
          row.afpAlertsCount,
          row.remarks
        );
      }
      if (row.aefiAlertsCount > 0) {
        insertAlertStmt.run(
          staged.campaignId,
          reportId,
          'AEFI',
          row.canonicalZone,
          row.canonicalWoreda,
          row.campaignDayNum,
          row.reportDate,
          row.aefiAlertsCount,
          row.remarks
        );
      }
    }

    db.prepare(
      `UPDATE import_batches
       SET imported_records = ?, updated_records = ?, skipped_records = ?, rejected_records = ?
       WHERE id = ?`
    ).run(importedCount, updatedCount, skippedCount, rejectedCount, batchId);

    db.exec('COMMIT');
    stagedImports.delete(params.stagingId);

    const createdBatch = getImportBatchById(batchId)!;

    recordAuditLog({
      user: params.user,
      action: 'IMPORT_CONFIRMED',
      entityType: 'import_batch',
      entityId: batchId,
      details: `Confirmed import "${staged.originalFilename}" (${params.importMode}): ${importedCount} inserted, ${updatedCount} updated, ${skippedCount} skipped, ${rejectedCount} rejected.`,
    });

    broadcastEvent({
      type: 'import:confirmed',
      actor: params.user.fullName,
      message: `New report imported: ${staged.originalFilename} (${importedCount} new, ${updatedCount} updated)`,
      meta: {
        batchId,
        importedCount,
        updatedCount,
        skippedCount,
      },
    });

    return createdBatch;
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }
}

export function rollbackImportBatch(
  batchId: number,
  user: UserAccount
): ImportBatch {
  const batch = getImportBatchById(batchId);
  if (!batch) {
    throw new Error(`Import batch #${batchId} not found.`);
  }
  if (batch.status === 'rolled_back') {
    throw new Error(`Import batch #${batchId} has already been rolled back.`);
  }

  const nowIso = new Date().toISOString();

  db.exec('BEGIN');
  try {
    // Deactivate surveillance alerts & daily reports introduced by this batch
    db.prepare(
      `UPDATE surveillance_alerts
       SET is_active = 0
       WHERE report_id IN (
         SELECT id FROM campaign_daily_reports WHERE import_batch_id = ?
       )`
    ).run(batchId);

    db.prepare(
      `UPDATE campaign_daily_reports
       SET is_active = 0
       WHERE import_batch_id = ?`
    ).run(batchId);

    // Restore records that were superseded by this batch
    db.prepare(
      `UPDATE campaign_daily_reports
       SET is_active = 1, superseded_by_import_id = NULL
       WHERE superseded_by_import_id = ?`
    ).run(batchId);

    db.prepare(
      `UPDATE surveillance_alerts
       SET is_active = 1
       WHERE report_id IN (
         SELECT id FROM campaign_daily_reports
         WHERE is_active = 1 AND import_batch_id != ?
       )`
    ).run(batchId);

    db.prepare(
      `UPDATE import_batches
       SET status = 'rolled_back', rolled_back_at = ?, rolled_back_by_name = ?
       WHERE id = ?`
    ).run(nowIso, user.fullName, batchId);

    db.exec('COMMIT');

    recordAuditLog({
      user,
      action: 'IMPORT_ROLLED_BACK',
      entityType: 'import_batch',
      entityId: batchId,
      details: `Rolled back import batch #${batchId} ("${batch.originalFilename}") and restored prior active records.`,
    });

    broadcastEvent({
      type: 'import:rolled_back',
      actor: user.fullName,
      message: `Import #${batchId} (${batch.originalFilename}) was safely rolled back.`,
      meta: { batchId },
    });

    return getImportBatchById(batchId)!;
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }
}

export function mapImportBatchRow(row: Record<string, unknown>): ImportBatch {
  return {
    id: Number(row.id),
    campaignId: Number(row.campaign_id),
    originalFilename: String(row.original_filename),
    storedPath: String(row.stored_path),
    storedFileId:
      row.stored_file_id !== null && row.stored_file_id !== undefined
        ? Number(row.stored_file_id)
        : null,
    fileSizeBytes: Number(row.file_size_bytes),
    fileFormat: String(row.file_format),
    detectedTemplate: String(row.detected_template),
    importMode: row.import_mode as ImportMode,
    validationStatus: String(row.validation_status),
    detectedRecords: Number(row.detected_records),
    importedRecords: Number(row.imported_records),
    updatedRecords: Number(row.updated_records),
    skippedRecords: Number(row.skipped_records),
    rejectedRecords: Number(row.rejected_records),
    uploadedByUserId: Number(row.uploaded_by_user_id),
    uploadedByName: String(row.uploaded_by_name),
    uploadedAt: String(row.uploaded_at),
    confirmedAt: row.confirmed_at ? String(row.confirmed_at) : null,
    status: row.status as 'confirmed' | 'rolled_back',
    rolledBackAt: row.rolled_back_at ? String(row.rolled_back_at) : null,
    rolledBackByName: row.rolled_back_by_name
      ? String(row.rolled_back_by_name)
      : null,
    notes: row.notes ? String(row.notes) : null,
  };
}

export function getImportBatchById(id: number): ImportBatch | null {
  const row = db
    .prepare('SELECT * FROM import_batches WHERE id = ?')
    .get(id) as Record<string, unknown> | undefined;
  return row ? mapImportBatchRow(row) : null;
}

export function listImportBatches(campaignId?: number): ImportBatch[] {
  const rows = campaignId
    ? (db
        .prepare(
          'SELECT * FROM import_batches WHERE campaign_id = ? ORDER BY id DESC'
        )
        .all(campaignId) as Array<Record<string, unknown>>)
    : (db
        .prepare('SELECT * FROM import_batches ORDER BY id DESC')
        .all() as Array<Record<string, unknown>>);
  return rows.map(mapImportBatchRow);
}
