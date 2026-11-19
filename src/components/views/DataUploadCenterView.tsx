import React, { useRef, useState } from 'react';
import {
  UploadCloud,
  FileSpreadsheet,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Download,
  RotateCcw,
} from 'lucide-react';
import { api } from '../../api/client';
import type {
  ImportBatch,
  ImportMode,
  ImportPreviewPayload,
  UserAccount,
} from '../../types/opcms';

interface DataUploadCenterViewProps {
  campaignId: number;
  currentUser: UserAccount;
  authenticated: boolean;
  imports: ImportBatch[];
  onRequireAuth: () => void;
  onImportSuccess: () => void;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

export const DataUploadCenterView: React.FC<DataUploadCenterViewProps> = ({
  campaignId,
  currentUser,
  authenticated,
  imports,
  onRequireAuth,
  onImportSuccess,
}) => {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [dragging, setDragging] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);
  const [preview, setPreview] = useState<ImportPreviewPayload | null>(null);
  const [importMode, setImportMode] = useState<ImportMode>('incremental_skip');
  const [sourceSubmittedAt, setSourceSubmittedAt] = useState('');
  const [notes, setNotes] = useState('');
  const [confirming, setConfirming] = useState(false);
  const [rollingBackId, setRollingBackId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  const canUpload = authenticated && currentUser.role === 'system_admin';
  const canRollback = authenticated && currentUser.role === 'system_admin';

  async function processFile(file: File) {
    if (!canUpload) {
      onRequireAuth();
      return;
    }
    setError(null);
    setSuccessMsg(null);
    setPreview(null);
    setUploadProgress(0);
    try {
      const result = await api.stageImportFile(file, campaignId, (pct) => {
        setUploadProgress(pct);
      });
      setPreview(result);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setUploadProgress(null);
    }
  }

  async function handleConfirmImport() {
    if (!preview) return;
    setConfirming(true);
    setError(null);
    try {
      const batch = await api.confirmImport({
        stagingId: preview.stagingId,
        importMode,
        sourceSubmittedAt: sourceSubmittedAt.trim() || null,
        notes: notes.trim() || null,
      });
      setSuccessMsg(
        `Import #${batch.id} confirmed: ${batch.importedRecords} inserted, ${batch.updatedRecords} updated, ${batch.skippedRecords} skipped, ${batch.rejectedRecords} rejected.`
      );
      setPreview(null);
      setSourceSubmittedAt('');
      setNotes('');
      onImportSuccess();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setConfirming(false);
    }
  }

  async function handleRollback(batchId: number) {
    setRollingBackId(batchId);
    setError(null);
    setSuccessMsg(null);
    try {
      await api.rollbackImport(batchId);
      setSuccessMsg(`Import batch #${batchId} safely rolled back and prior records restored.`);
      onImportSuccess();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setRollingBackId(null);
    }
  }

  return (
    <div className="space-y-6">
      {/* Top Action & Template Download Bar */}
      <div className="bg-white border border-slate-200 rounded-lg p-5 flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h2 className="text-base font-semibold text-slate-900">
            Data Upload &amp; Import Center
          </h2>
          <p className="text-xs text-slate-600 mt-1">
            Upload Oromia SIA Daily Administrative Reports (.xlsx or .csv). Multi-row grouped headers, blank zone carry-forward, Total row exclusion, and duplicate detection run automatically before saving to the database.
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <a
            href="/api/templates/official?format=xlsx"
            className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium border border-slate-300 text-slate-700 hover:bg-slate-50 rounded-lg"
          >
            <Download className="w-3.5 h-3.5" />
            Template (.xlsx)
          </a>
          <a
            href="/api/templates/official?format=csv"
            className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium border border-slate-300 text-slate-700 hover:bg-slate-50 rounded-lg"
          >
            <Download className="w-3.5 h-3.5" />
            Template (.csv)
          </a>
        </div>
      </div>

      {!canUpload ? (
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div className="text-xs text-amber-900">
            <strong>System Administrator Access Required:</strong> Currently viewing as{' '}
            <span className="font-mono">{currentUser.role}</span>. Excel and CSV campaign report ingestion is strictly restricted to the System Administrator role.
          </div>
          <button
            type="button"
            onClick={onRequireAuth}
            className="px-3.5 py-2 text-xs font-medium text-white bg-[#485EA9] hover:bg-[#3a4d8f] rounded-lg shrink-0"
          >
            Sign In as System Admin
          </button>
        </div>
      ) : null}

      {error ? (
        <div className="p-3.5 text-xs text-red-800 bg-red-50 border border-red-200 rounded-lg">
          {error}
        </div>
      ) : null}

      {successMsg ? (
        <div className="p-3.5 text-xs text-emerald-800 bg-emerald-50 border border-emerald-200 rounded-lg flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 shrink-0" />
          <span>{successMsg}</span>
        </div>
      ) : null}

      {/* Drag and Drop Upload Zone */}
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          const file = e.dataTransfer.files?.[0];
          if (file) processFile(file);
        }}
        className={`bg-white border-2 border-dashed rounded-lg p-8 text-center transition-colors ${
          dragging ? 'border-[#3A99CF] bg-sky-50/40' : 'border-slate-300'
        }`}
      >
        <UploadCloud className="w-10 h-10 text-[#3A99CF] mx-auto mb-3" />
        <h3 className="text-sm font-semibold text-slate-900">
          Drag and drop Oromia SIA Excel (.xlsx) or CSV (.csv) file here
        </h3>
        <p className="text-xs text-slate-500 mt-1">
          Supports the 3-row grouped Oromia template and flattened CSV format · Max 25 MB
        </p>

        <input
          ref={fileInputRef}
          type="file"
          accept=".xlsx,.csv"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) processFile(f);
            e.target.value = '';
          }}
          className="hidden"
        />

        <div className="mt-4">
          <button
            type="button"
            onClick={() => {
              if (!canUpload) onRequireAuth();
              else fileInputRef.current?.click();
            }}
            className="px-4 py-2 text-xs font-medium text-white bg-[#3A99CF] hover:bg-[#2f86b8] rounded-lg transition-colors"
          >
            Browse Computer
          </button>
        </div>

        {uploadProgress !== null ? (
          <div className="mt-5 max-w-md mx-auto">
            <div className="flex justify-between text-xs text-slate-600 mb-1">
              <span>Uploading and parsing reporting template...</span>
              <span className="tabular-nums">{uploadProgress}%</span>
            </div>
            <div className="w-full h-2 bg-slate-200 rounded-full overflow-hidden">
              <div
                className="h-full bg-[#3A99CF] transition-all"
                style={{ width: `${uploadProgress}%` }}
              />
            </div>
          </div>
        ) : null}
      </div>

      {/* Validation Report & Import Preview */}
      {preview ? (
        <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-200 bg-slate-50 flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3">
            <div>
              <div className="flex items-center gap-2">
                <FileSpreadsheet className="w-4 h-4 text-[#485EA9]" />
                <h3 className="text-sm font-semibold text-slate-900">
                  Import Validation &amp; Preview · {preview.originalFilename}
                </h3>
              </div>
              <p className="text-xs text-slate-500 mt-0.5">
                {formatBytes(preview.fileSizeBytes)} · Format:{' '}
                {preview.fileFormat.toUpperCase()} · Detected Template:{' '}
                {preview.detectedTemplate} ({preview.headerRowsDetected} header rows,{' '}
                {preview.totalSummaryRowsSkipped} Total row skipped)
              </p>
            </div>
            <div className="text-xs font-medium">
              Validation Status:{' '}
              <span
                className={
                  preview.validationStatus === 'passed'
                    ? 'text-emerald-700'
                    : preview.validationStatus === 'passed_with_warnings'
                      ? 'text-[#D29441]'
                      : 'text-red-700'
                }
              >
                {preview.validationStatus.replace(/_/g, ' ').toUpperCase()}
              </span>
            </div>
          </div>

          <div className="p-5 space-y-5">
            {/* Summary Counts */}
            <div className="grid grid-cols-2 sm:grid-cols-6 gap-3 text-xs">
              <div className="p-3 border border-slate-200 rounded-lg">
                <div className="text-slate-500">Detected Records</div>
                <div className="mt-1 text-lg font-semibold tabular-nums">
                  {preview.totalRowsDetected}
                </div>
              </div>
              <div className="p-3 border border-slate-200 rounded-lg">
                <div className="text-slate-500">New Records</div>
                <div className="mt-1 text-lg font-semibold tabular-nums text-[#3A99CF]">
                  {preview.newRowsCount}
                </div>
              </div>
              <div className="p-3 border border-slate-200 rounded-lg">
                <div className="text-slate-500">Duplicates Found</div>
                <div className="mt-1 text-lg font-semibold tabular-nums text-[#485EA9]">
                  {preview.duplicateRowsCount}
                </div>
              </div>
              <div className="p-3 border border-slate-200 rounded-lg">
                <div className="text-slate-500">Valid (Clean)</div>
                <div className="mt-1 text-lg font-semibold tabular-nums text-emerald-700">
                  {preview.validRowsCount}
                </div>
              </div>
              <div className="p-3 border border-slate-200 rounded-lg">
                <div className="text-slate-500">With Warnings</div>
                <div className="mt-1 text-lg font-semibold tabular-nums text-[#D29441]">
                  {preview.warningRowsCount}
                </div>
              </div>
              <div className="p-3 border border-slate-200 rounded-lg">
                <div className="text-slate-500">Rejected (Errors)</div>
                <div className="mt-1 text-lg font-semibold tabular-nums text-red-700">
                  {preview.rejectedRowsCount}
                </div>
              </div>
            </div>

            {preview.unexpectedColumns.length > 0 ? (
              <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-900">
                <strong>Unexpected Columns Detected:</strong>{' '}
                {preview.unexpectedColumns.join(', ')}
              </div>
            ) : null}

            {/* Issues List */}
            {preview.issues.length > 0 ? (
              <div className="border border-slate-200 rounded-lg overflow-hidden">
                <div className="px-4 py-2.5 bg-slate-50 border-b border-slate-200 text-xs font-semibold text-slate-800">
                  Validation Findings ({preview.issues.length})
                </div>
                <div className="max-h-40 overflow-y-auto divide-y divide-slate-100 text-xs">
                  {preview.issues.slice(0, 50).map((iss, idx) => (
                    <div key={idx} className="px-4 py-2 flex items-center gap-2.5">
                      {iss.severity === 'error' ? (
                        <XCircle className="w-3.5 h-3.5 text-red-600 shrink-0" />
                      ) : (
                        <AlertTriangle className="w-3.5 h-3.5 text-[#D29441] shrink-0" />
                      )}
                      <span className="font-mono text-slate-500 shrink-0">
                        Row {iss.rowNumber}
                      </span>
                      <span className="text-slate-800">{iss.message}</span>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}

            {/* Preview Table */}
            <div className="border border-slate-200 rounded-lg overflow-hidden">
              <div className="px-4 py-2.5 bg-slate-50 border-b border-slate-200 text-xs font-semibold text-slate-800">
                Extracted Reporting Records Preview (Showing first 40 of{' '}
                {preview.previewRows.length})
              </div>
              <div className="overflow-x-auto max-h-64">
                <table className="w-full text-xs">
                  <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 sticky top-0">
                    <tr>
                      <th className="text-left font-medium px-3 py-2">Row</th>
                      <th className="text-left font-medium px-3 py-2">Zone (Normalized)</th>
                      <th className="text-left font-medium px-3 py-2">Woreda</th>
                      <th className="text-left font-medium px-3 py-2">Day</th>
                      <th className="text-right font-medium px-3 py-2">Target</th>
                      <th className="text-right font-medium px-3 py-2">Vacc. 0–59m</th>
                      <th className="text-right font-medium px-3 py-2">AFP / AEFI</th>
                      <th className="text-left font-medium px-3 py-2">Duplicate Check</th>
                      <th className="text-left font-medium px-3 py-2">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {preview.previewRows.slice(0, 40).map((r) => (
                      <tr key={r.rowNumber} className="hover:bg-slate-50">
                        <td className="px-3 py-1.5 font-mono text-slate-500">
                          {r.rowNumber}
                        </td>
                        <td className="px-3 py-1.5 text-slate-700">{r.canonicalZone}</td>
                        <td className="px-3 py-1.5 font-medium text-slate-900">
                          {r.canonicalWoreda}
                        </td>
                        <td className="px-3 py-1.5">{r.campaignDayLabel}</td>
                        <td className="px-3 py-1.5 text-right tabular-nums">
                          {r.totalPlannedTarget.toLocaleString()}
                        </td>
                        <td className="px-3 py-1.5 text-right tabular-nums font-medium">
                          {r.totalVaccinated0_59.toLocaleString()}
                        </td>
                        <td className="px-3 py-1.5 text-right tabular-nums">
                          {r.afpAlertsCount} / {r.aefiAlertsCount}
                        </td>
                        <td className="px-3 py-1.5 text-slate-600">
                          {r.duplicateAction === 'duplicate_existing'
                            ? 'Exists in DB'
                            : r.duplicateAction === 'duplicate_in_file'
                              ? 'Duplicate in file'
                              : 'New'}
                        </td>
                        <td className="px-3 py-1.5">
                          <span
                            className={
                              r.rowStatus === 'error'
                                ? 'text-red-700 font-medium'
                                : r.rowStatus === 'warning'
                                  ? 'text-[#D29441] font-medium'
                                  : 'text-emerald-700 font-medium'
                            }
                          >
                            {r.rowStatus}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Import Mode & Confirmation Controls */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-2 border-t border-slate-200 text-xs">
              <div>
                <label className="block font-medium text-slate-700 mb-1">
                  Duplicate &amp; Period Handling Mode
                </label>
                <select
                  value={importMode}
                  onChange={(e) => setImportMode(e.target.value as ImportMode)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg bg-white"
                >
                  <option value="incremental_skip">
                    Incremental Import (Skip Existing Duplicates)
                  </option>
                  <option value="incremental_update">
                    Explicit Correction / Update (Create New Version)
                  </option>
                  <option value="replace_period">
                    Full-Period Replacement for Day(s): {preview.detectedDays.join(', ')}
                  </option>
                </select>
              </div>
              <div>
                <label className="block font-medium text-slate-700 mb-1">
                  Source Submission Timestamp (Optional)
                </label>
                <input
                  type="datetime-local"
                  value={sourceSubmittedAt}
                  onChange={(e) => setSourceSubmittedAt(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg"
                />
              </div>
              <div>
                <label className="block font-medium text-slate-700 mb-1">
                  Import Audit Notes (Optional)
                </label>
                <input
                  type="text"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="e.g. Day 1 consolidated 17:00 EAT submission"
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg"
                />
              </div>
            </div>

            <div className="flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={() => setPreview(null)}
                className="px-4 py-2 text-xs font-medium border border-slate-300 text-slate-700 rounded-lg hover:bg-slate-50"
              >
                Discard Preview
              </button>
              <button
                type="button"
                disabled={
                  confirming ||
                  preview.validRowsCount + preview.warningRowsCount === 0
                }
                onClick={handleConfirmImport}
                className="px-5 py-2 text-xs font-medium text-white bg-[#485EA9] hover:bg-[#3a4d8f] disabled:opacity-50 rounded-lg transition-colors"
              >
                {confirming
                  ? 'Saving to Database & Broadcasting...'
                  : `Confirm Import (${preview.validRowsCount + preview.warningRowsCount} Records)`}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {/* Complete Import History */}
      <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-200">
          <h3 className="text-sm font-semibold text-slate-900">
            Import History &amp; Audit Trail ({imports.length})
          </h3>
          <p className="text-xs text-slate-500">
            Original uploaded files are preserved on local server storage. Administrators can safely roll back an import batch at any time.
          </p>
        </div>
        {imports.length === 0 ? (
          <div className="p-8 text-center text-xs text-slate-500">
            No import batches recorded yet.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="bg-slate-50 border-b border-slate-200 text-slate-600">
                <tr>
                  <th className="text-left font-medium px-4 py-2.5">Batch</th>
                  <th className="text-left font-medium px-3 py-2.5">File Name &amp; Size</th>
                  <th className="text-left font-medium px-3 py-2.5">Uploaded By &amp; Time</th>
                  <th className="text-left font-medium px-3 py-2.5">Mode</th>
                  <th className="text-right font-medium px-3 py-2.5">Detected</th>
                  <th className="text-right font-medium px-3 py-2.5">Imported</th>
                  <th className="text-right font-medium px-3 py-2.5">Updated</th>
                  <th className="text-right font-medium px-3 py-2.5">Rejected</th>
                  <th className="text-left font-medium px-3 py-2.5">Status</th>
                  <th className="text-right font-medium px-4 py-2.5">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {imports.map((b) => (
                  <tr key={b.id} className="hover:bg-slate-50">
                    <td className="px-4 py-2.5 font-mono text-slate-600">#{b.id}</td>
                    <td className="px-3 py-2.5">
                      <div className="font-medium text-slate-900 max-w-[220px] truncate">
                        {b.originalFilename}
                      </div>
                      <div className="text-[11px] text-slate-500">
                        {formatBytes(b.fileSizeBytes)} · {b.fileFormat.toUpperCase()}
                      </div>
                    </td>
                    <td className="px-3 py-2.5">
                      <div className="text-slate-800">{b.uploadedByName}</div>
                      <div className="text-[11px] text-slate-500 font-mono">
                        {new Date(b.uploadedAt).toLocaleString()}
                      </div>
                    </td>
                    <td className="px-3 py-2.5 text-slate-600">
                      {b.importMode.replace(/_/g, ' ')}
                    </td>
                    <td className="px-3 py-2.5 text-right tabular-nums">
                      {b.detectedRecords}
                    </td>
                    <td className="px-3 py-2.5 text-right tabular-nums font-medium text-emerald-700">
                      {b.importedRecords}
                    </td>
                    <td className="px-3 py-2.5 text-right tabular-nums text-[#3A99CF]">
                      {b.updatedRecords}
                    </td>
                    <td className="px-3 py-2.5 text-right tabular-nums text-red-700">
                      {b.rejectedRecords}
                    </td>
                    <td className="px-3 py-2.5">
                      <span
                        className={
                          b.status === 'confirmed'
                            ? 'text-emerald-700 font-medium'
                            : 'text-slate-500 line-through'
                        }
                      >
                        {b.status === 'confirmed' ? 'Active' : 'Rolled Back'}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 text-right whitespace-nowrap space-x-2">
                      <a
                        href={`/api/imports/${b.id}/download`}
                        className="text-[#3A99CF] hover:underline font-medium"
                      >
                        Original
                      </a>
                      {canRollback && b.status === 'confirmed' ? (
                        <button
                          type="button"
                          disabled={rollingBackId === b.id}
                          onClick={() => handleRollback(b.id)}
                          className="inline-flex items-center gap-1 text-red-700 hover:underline font-medium"
                        >
                          <RotateCcw className="w-3 h-3" />
                          {rollingBackId === b.id ? 'Rolling back...' : 'Rollback'}
                        </button>
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};
