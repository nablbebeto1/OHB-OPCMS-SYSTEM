import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Check,
  CheckCircle2,
  Copy,
  Download,
  ExternalLink,
  Eye,
  FileSpreadsheet,
  FileText,
  FolderLock,
  Image as ImageIcon,
  Link2,
  Search,
  ShieldBan,
  UploadCloud,
  X,
} from 'lucide-react';
import { api } from '../../api/client';
import type {
  FilePreviewLinkRecord,
  StoredFileRecord,
  UserAccount,
} from '../../types/opcms';

interface DocumentVaultViewProps {
  currentUser: UserAccount;
  permissions: string[];
}

const CATEGORY_OPTIONS = [
  { value: 'campaign_reports', label: 'Campaign Reports' },
  { value: 'surveillance_docs', label: 'Surveillance & Investigation' },
  { value: 'sop_guidelines', label: 'SOPs & Guidelines' },
  { value: 'microplans', label: 'Microplans & Logistics' },
  { value: 'general', label: 'General Documents' },
];

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

function formatDateTimeEAT(iso: string): string {
  try {
    const dt = new Date(iso);
    return (
      new Intl.DateTimeFormat('en-GB', {
        timeZone: 'Africa/Addis_Ababa',
        year: 'numeric',
        month: 'short',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
      }).format(dt) + ' EAT'
    );
  } catch {
    return iso;
  }
}

function linkStatus(link: FilePreviewLinkRecord): 'active' | 'revoked' | 'expired' {
  if (link.isRevoked) return 'revoked';
  if (Date.now() >= new Date(link.expiresAt).getTime()) return 'expired';
  return 'active';
}

export const DocumentVaultView: React.FC<DocumentVaultViewProps> = ({
  permissions,
}) => {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [files, setFiles] = useState<StoredFileRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [moduleFilter, setModuleFilter] = useState('all');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [search, setSearch] = useState('');

  const [uploadCategory, setUploadCategory] = useState('campaign_reports');
  const [uploadDescription, setUploadDescription] = useState('');
  const [uploading, setUploading] = useState(false);

  const [busyFileId, setBusyFileId] = useState<number | null>(null);
  const [busyLinkId, setBusyLinkId] = useState<number | null>(null);
  const [copiedLinkId, setCopiedLinkId] = useState<number | null>(null);
  const [expandedFileId, setExpandedFileId] = useState<number | null>(null);
  const [previewModalFile, setPreviewModalFile] = useState<StoredFileRecord | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  const canUpload = permissions.includes('upload_files');
  const canRevoke = permissions.includes('manage_preview_links');

  const fetchFiles = useCallback(async () => {
    setLoading(true);
    try {
      const list = await api.listStoredFiles({
        module: moduleFilter,
        category: categoryFilter,
        search,
      });
      setFiles(list);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }, [moduleFilter, categoryFilter, search]);

  useEffect(() => {
    fetchFiles();
  }, [fetchFiles]);

  async function handleUploadFile(file: File) {
    setError(null);
    setSuccessMsg(null);
    setUploading(true);
    try {
      const created = await api.uploadPermanentFile({
        file,
        module: 'documents',
        category: uploadCategory,
        description: uploadDescription.trim(),
      });
      setSuccessMsg(
        `Saved "${created.originalFilename}" to permanent storage (${formatBytes(created.fileSizeBytes)}).`
      );
      setUploadDescription('');
      setExpandedFileId(created.id);
      await fetchFiles();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  }

  async function handleGenerateLink(file: StoredFileRecord) {
    setError(null);
    setSuccessMsg(null);
    setBusyFileId(file.id);
    try {
      const created = await api.generatePreviewLink(file.id);
      setExpandedFileId(file.id);
      setSuccessMsg(
        `Generated 6-day (144-hour) live preview link for "${file.originalFilename}". Expires ${formatDateTimeEAT(created.expiresAt)}.`
      );
      await fetchFiles();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusyFileId(null);
    }
  }

  async function handleRevokeLink(link: FilePreviewLinkRecord) {
    setError(null);
    setSuccessMsg(null);
    setBusyLinkId(link.id);
    try {
      await api.revokePreviewLink(link.id, 'Revoked via Document & File Vault');
      setSuccessMsg(`Preview link #${link.id} revoked immediately.`);
      await fetchFiles();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusyLinkId(null);
    }
  }

  async function handleCopyUrl(link: FilePreviewLinkRecord) {
    try {
      await navigator.clipboard.writeText(link.previewUrl);
      setCopiedLinkId(link.id);
      setTimeout(() => setCopiedLinkId(null), 2500);
    } catch {
      setError('Clipboard copy was blocked by browser permissions. Please copy the URL manually.');
    }
  }

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <div className="bg-white border border-slate-200 rounded-lg p-5 flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <FolderLock className="w-5 h-5 text-[#485EA9]" />
            <h2 className="text-base font-semibold text-slate-900">
              Document &amp; File Vault (Permanent Storage)
            </h2>
          </div>
          <p className="text-xs text-slate-600 mt-1">
            All uploaded documents, PDFs, images, and campaign spreadsheets persist across restarts and redeployments. Generate read-only cryptographically signed Live Preview URLs valid for exactly 6 days (144 hours).
          </p>
        </div>
        <div className="text-xs bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-slate-700 shrink-0">
          <div className="font-semibold text-slate-900">Signed Preview TTL</div>
          <div>6 Days (144 Hours) · Read-Only HMAC</div>
        </div>
      </div>

      {error ? (
        <div className="p-3 text-xs text-red-700 bg-red-50 border border-red-200 rounded-lg">
          {error}
        </div>
      ) : null}

      {successMsg ? (
        <div className="p-3 text-xs text-emerald-800 bg-emerald-50 border border-emerald-200 rounded-lg flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 shrink-0" />
          <span>{successMsg}</span>
        </div>
      ) : null}

      {/* Upload Section */}
      {canUpload ? (
        <div className="bg-white border border-slate-200 rounded-lg p-5 space-y-4">
          <div className="text-sm font-semibold text-slate-900">
            Upload File to Permanent Storage
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                Document Category
              </label>
              <select
                value={uploadCategory}
                onChange={(e) => setUploadCategory(e.target.value)}
                className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg bg-white text-slate-800"
              >
                {CATEGORY_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="md:col-span-2">
              <label className="block text-xs font-medium text-slate-700 mb-1">
                Description / Reference Notes (Optional)
              </label>
              <input
                type="text"
                value={uploadDescription}
                onChange={(e) => setUploadDescription(e.target.value)}
                placeholder="e.g. Round 1 Oromia SIA microplan / AFP verification dossier"
                className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg text-slate-800"
              />
            </div>
          </div>

          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 border-2 border-dashed border-slate-300 rounded-lg bg-slate-50">
            <div className="text-xs text-slate-600">
              <span className="font-medium text-slate-800">
                Supported formats:
              </span>{' '}
              PDF, PNG, JPG, WebP, GIF, SVG, XLSX, XLS, CSV, DOCX, DOC, TXT, JSON, ZIP (max 25 MB).
            </div>
            <input
              ref={fileInputRef}
              type="file"
              accept=".pdf,.png,.jpg,.jpeg,.webp,.gif,.svg,.xlsx,.xls,.csv,.docx,.doc,.txt,.json,.zip"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) handleUploadFile(f);
              }}
            />
            <button
              type="button"
              disabled={uploading}
              onClick={() => fileInputRef.current?.click()}
              className="inline-flex items-center justify-center gap-2 px-4 py-2 text-xs font-semibold text-white bg-[#485EA9] hover:bg-[#3a4d8f] rounded-lg disabled:opacity-60 shrink-0"
            >
              <UploadCloud className="w-4 h-4" />
              {uploading ? 'Uploading to Storage...' : 'Upload File'}
            </button>
          </div>
        </div>
      ) : null}

      {/* Search & Filter Bar */}
      <div className="bg-white border border-slate-200 rounded-lg p-4 flex flex-col md:flex-row md:items-center gap-3">
        <div className="relative flex-1">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by filename, description, or uploader..."
            className="w-full pl-9 pr-3 py-2 text-xs border border-slate-300 rounded-lg"
          />
        </div>
        <select
          value={moduleFilter}
          onChange={(e) => setModuleFilter(e.target.value)}
          className="px-3 py-2 text-xs border border-slate-300 rounded-lg bg-white"
        >
          <option value="all">All Modules</option>
          <option value="documents">Document Vault</option>
          <option value="imports">Campaign Imports</option>
        </select>
        <select
          value={categoryFilter}
          onChange={(e) => setCategoryFilter(e.target.value)}
          className="px-3 py-2 text-xs border border-slate-300 rounded-lg bg-white"
        >
          <option value="all">All Categories</option>
          {CATEGORY_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      </div>

      {/* Files List */}
      <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
        <div className="px-5 py-3.5 border-b border-slate-200 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-slate-900">
            Stored Files ({files.length})
          </h3>
          <button
            type="button"
            onClick={fetchFiles}
            className="text-xs font-medium text-[#3A99CF] hover:underline"
          >
            Refresh List
          </button>
        </div>

        {loading ? (
          <div className="p-8 text-center text-xs text-slate-500">
            Loading permanent file repository...
          </div>
        ) : files.length === 0 ? (
          <div className="p-8 text-center text-xs text-slate-500">
            No stored files match the current filter. Upload a document above or confirm a campaign import.
          </div>
        ) : (
          <div className="divide-y divide-slate-200">
            {files.map((f) => {
              const isExpanded = expandedFileId === f.id;
              return (
                <div key={f.id} className="p-4 sm:p-5 space-y-3">
                  <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3">
                    <div className="flex items-start gap-3 min-w-0">
                      <div className="w-10 h-10 rounded-lg bg-slate-100 border border-slate-200 flex items-center justify-center shrink-0">
                        {f.previewKind === 'image' ? (
                          <ImageIcon className="w-5 h-5 text-[#485EA9]" />
                        ) : f.previewKind === 'spreadsheet' ? (
                          <FileSpreadsheet className="w-5 h-5 text-emerald-700" />
                        ) : (
                          <FileText className="w-5 h-5 text-[#485EA9]" />
                        )}
                      </div>
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-sm font-semibold text-slate-900 break-all">
                            {f.originalFilename}
                          </span>
                          <span className="px-2 py-0.5 text-[11px] font-mono bg-slate-100 text-slate-700 rounded border border-slate-200">
                            {f.extension.toUpperCase()}
                          </span>
                          <span className="px-2 py-0.5 text-[11px] bg-blue-50 text-[#485EA9] rounded border border-blue-200">
                            {f.module} / {f.category}
                          </span>
                        </div>
                        {f.description ? (
                          <p className="text-xs text-slate-600 mt-0.5">{f.description}</p>
                        ) : null}
                        <div className="text-[11px] text-slate-500 mt-1 flex flex-wrap gap-x-3 gap-y-1">
                          <span>Size: {formatBytes(f.fileSizeBytes)}</span>
                          <span>Uploaded by: {f.uploadedByName}</span>
                          <span>Uploaded: {formatDateTimeEAT(f.uploadedAt)}</span>
                          {f.sha256Checksum ? (
                            <span className="font-mono">
                              SHA-256: {f.sha256Checksum.slice(0, 12)}...
                            </span>
                          ) : null}
                        </div>
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-2 shrink-0">
                      <button
                        type="button"
                        onClick={() => setPreviewModalFile(f)}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium border border-slate-300 text-slate-700 hover:bg-slate-50 rounded-lg"
                      >
                        <Eye className="w-3.5 h-3.5" />
                        View
                      </button>
                      <a
                        href={api.getFileDownloadUrl(f.id)}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium border border-slate-300 text-slate-700 hover:bg-slate-50 rounded-lg"
                      >
                        <Download className="w-3.5 h-3.5" />
                        Download
                      </a>
                      {canUpload ? (
                        <button
                          type="button"
                          disabled={busyFileId === f.id}
                          onClick={() => handleGenerateLink(f)}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-white bg-[#485EA9] hover:bg-[#3a4d8f] rounded-lg disabled:opacity-60"
                        >
                          <Link2 className="w-3.5 h-3.5" />
                          {busyFileId === f.id
                            ? 'Generating...'
                            : 'Generate Live Preview Link'}
                        </button>
                      ) : null}
                      {f.previewLinks.length > 0 ? (
                        <button
                          type="button"
                          onClick={() =>
                            setExpandedFileId(isExpanded ? null : f.id)
                          }
                          className="px-2.5 py-1.5 text-xs font-medium text-[#3A99CF] hover:underline"
                        >
                          {isExpanded
                            ? 'Hide Links'
                            : `Links (${f.activePreviewLinksCount} active / ${f.previewLinks.length} total)`}
                        </button>
                      ) : null}
                    </div>
                  </div>

                  {/* Signed Preview Links Panel */}
                  {isExpanded && f.previewLinks.length > 0 ? (
                    <div className="bg-slate-50 border border-slate-200 rounded-lg p-3.5 space-y-2.5">
                      <div className="text-xs font-semibold text-slate-800">
                        6-Day Signed Read-Only Preview URLs
                      </div>
                      {f.previewLinks.map((lnk) => {
                        const status = linkStatus(lnk);
                        return (
                          <div
                            key={lnk.id}
                            className="bg-white border border-slate-200 rounded-lg p-3 flex flex-col lg:flex-row lg:items-center lg:justify-between gap-2.5"
                          >
                            <div className="min-w-0 space-y-1">
                              <div className="flex flex-wrap items-center gap-2">
                                <span
                                  className={
                                    status === 'active'
                                      ? 'px-2 py-0.5 text-[11px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200 rounded'
                                      : status === 'revoked'
                                        ? 'px-2 py-0.5 text-[11px] font-semibold bg-red-50 text-red-700 border border-red-200 rounded'
                                        : 'px-2 py-0.5 text-[11px] font-semibold bg-amber-50 text-amber-800 border border-amber-200 rounded'
                                  }
                                >
                                  {status === 'active'
                                    ? 'ACTIVE (144h)'
                                    : status === 'revoked'
                                      ? 'REVOKED'
                                      : 'EXPIRED'}
                                </span>
                                <span className="text-[11px] text-slate-600">
                                  Expires:{' '}
                                  <strong className="text-slate-900">
                                    {formatDateTimeEAT(lnk.expiresAt)}
                                  </strong>{' '}
                                  <span className="font-mono text-slate-500">
                                    ({lnk.expiresAt})
                                  </span>
                                </span>
                                <span className="text-[11px] text-slate-500">
                                  Views: {lnk.accessCount}
                                </span>
                              </div>
                              <div className="text-[11px] font-mono text-slate-700 bg-slate-50 px-2.5 py-1.5 rounded border border-slate-200 break-all">
                                {lnk.previewUrl}
                              </div>
                              <div className="text-[11px] text-slate-500">
                                Created by {lnk.createdByName} on{' '}
                                {formatDateTimeEAT(lnk.createdAt)}
                                {lnk.isRevoked && lnk.revokedByName
                                  ? ` · Revoked by ${lnk.revokedByName}`
                                  : ''}
                              </div>
                            </div>

                            <div className="flex flex-wrap items-center gap-2 shrink-0">
                              <button
                                type="button"
                                onClick={() => handleCopyUrl(lnk)}
                                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium border border-slate-300 text-slate-800 hover:bg-slate-50 rounded-lg"
                              >
                                {copiedLinkId === lnk.id ? (
                                  <>
                                    <Check className="w-3.5 h-3.5 text-emerald-700" />
                                    Copied
                                  </>
                                ) : (
                                  <>
                                    <Copy className="w-3.5 h-3.5" />
                                    Copy Link
                                  </>
                                )}
                              </button>
                              {status === 'active' ? (
                                <a
                                  href={lnk.previewUrl}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium border border-[#3A99CF] text-[#3A99CF] hover:bg-blue-50 rounded-lg"
                                >
                                  <ExternalLink className="w-3.5 h-3.5" />
                                  Open
                                </a>
                              ) : null}
                              {canRevoke && status === 'active' ? (
                                <button
                                  type="button"
                                  disabled={busyLinkId === lnk.id}
                                  onClick={() => handleRevokeLink(lnk)}
                                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-red-700 border border-red-200 hover:bg-red-50 rounded-lg disabled:opacity-60"
                                >
                                  <ShieldBan className="w-3.5 h-3.5" />
                                  {busyLinkId === lnk.id ? 'Revoking...' : 'Revoke'}
                                </button>
                              ) : null}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Authenticated File View Modal */}
      {previewModalFile ? (
        <div className="fixed inset-0 z-50 bg-slate-900/60 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl border border-slate-200 shadow-2xl w-full max-w-5xl max-h-[90vh] flex flex-col overflow-hidden">
            <div className="px-5 py-3.5 border-b border-slate-200 flex items-center justify-between gap-3">
              <div className="min-w-0">
                <div className="text-sm font-semibold text-slate-900 truncate">
                  {previewModalFile.originalFilename}
                </div>
                <div className="text-xs text-slate-500">
                  {previewModalFile.mimeType} · {formatBytes(previewModalFile.fileSizeBytes)}
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <a
                  href={api.getFileDownloadUrl(previewModalFile.id)}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium border border-slate-300 rounded-lg text-slate-700 hover:bg-slate-50"
                >
                  <Download className="w-3.5 h-3.5" />
                  Download
                </a>
                <button
                  type="button"
                  onClick={() => setPreviewModalFile(null)}
                  className="p-1.5 rounded-lg text-slate-500 hover:bg-slate-100"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>
            <div className="flex-1 bg-slate-100 p-4 overflow-auto min-h-[420px] flex items-center justify-center">
              {previewModalFile.previewKind === 'image' ? (
                <img
                  src={api.getFileViewUrl(previewModalFile.id)}
                  alt={previewModalFile.originalFilename}
                  className="max-w-full max-h-[72vh] object-contain rounded border border-slate-200 bg-white"
                />
              ) : previewModalFile.previewKind === 'pdf' || previewModalFile.previewKind === 'text' ? (
                <iframe
                  title={previewModalFile.originalFilename}
                  src={api.getFileViewUrl(previewModalFile.id)}
                  className="w-full h-[72vh] bg-white rounded border border-slate-200"
                />
              ) : (
                <div className="bg-white border border-slate-200 rounded-lg p-6 text-center max-w-md space-y-3">
                  <FileSpreadsheet className="w-10 h-10 text-[#485EA9] mx-auto" />
                  <div className="text-sm font-semibold text-slate-900">
                    {previewModalFile.originalFilename}
                  </div>
                  <p className="text-xs text-slate-600">
                    Generate a 6-day Live Preview Link to inspect spreadsheets directly in-browser, or download the stored file below.
                  </p>
                  <a
                    href={api.getFileDownloadUrl(previewModalFile.id)}
                    className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-[#485EA9] rounded-lg hover:bg-[#3a4d8f]"
                  >
                    <Download className="w-4 h-4" />
                    Download Stored File
                  </a>
                </div>
              )}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
};
