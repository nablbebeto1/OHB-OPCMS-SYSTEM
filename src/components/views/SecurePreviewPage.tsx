import React, { useEffect, useState } from 'react';
import {
  AlertTriangle,
  Clock,
  Download,
  FileSpreadsheet,
  FileText,
  Lock,
  ShieldCheck,
} from 'lucide-react';
import { api } from '../../api/client';
import { BrandLogo } from '../BrandLogo';
import type {
  BrandingConfig,
  PublicFilePreviewInfo,
  SpreadsheetPreviewData,
} from '../../types/opcms';

interface SecurePreviewPageProps {
  token: string;
  branding: BrandingConfig | null;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

function formatDateTimeEAT(iso: string): string {
  try {
    return (
      new Intl.DateTimeFormat('en-GB', {
        timeZone: 'Africa/Addis_Ababa',
        year: 'numeric',
        month: 'short',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false,
      }).format(new Date(iso)) + ' EAT'
    );
  } catch {
    return iso;
  }
}

function formatRemaining(iso: string): string {
  const diffMs = new Date(iso).getTime() - Date.now();
  if (diffMs <= 0) return 'Expired';
  const totalHours = Math.floor(diffMs / 3600000);
  const days = Math.floor(totalHours / 24);
  const hours = totalHours % 24;
  return `${days}d ${hours}h remaining`;
}

export const SecurePreviewPage: React.FC<SecurePreviewPageProps> = ({
  token,
  branding,
}) => {
  const [info, setInfo] = useState<PublicFilePreviewInfo | null>(null);
  const [sheetData, setSheetData] = useState<SpreadsheetPreviewData | null>(null);
  const [activeSheetIdx, setActiveSheetIdx] = useState(0);
  const [textContent, setTextContent] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(null);
    setInfo(null);
    setSheetData(null);
    setTextContent(null);

    api
      .getPublicPreviewInfo(token)
      .then(async (meta) => {
        if (!active) return;
        setInfo(meta);
        if (meta.previewKind === 'spreadsheet' && meta.sheetPreviewUrl) {
          try {
            const data = await api.getPublicPreviewSheet(token);
            if (active) setSheetData(data);
          } catch {
            // fallback to download card
          }
        } else if (meta.previewKind === 'text') {
          try {
            const res = await fetch(meta.contentUrl);
            if (res.ok && active) {
              const txt = await res.text();
              setTextContent(txt.slice(0, 200000));
            }
          } catch {
            // fallback
          }
        }
      })
      .catch((err) => {
        if (active) setError((err as Error).message);
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [token]);

  return (
    <div className="min-h-screen bg-slate-100 flex flex-col">
      {/* Header */}
      <header className="bg-white border-b border-slate-200 px-4 sm:px-6 py-3">
        <div className="max-w-6xl mx-auto flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div className="flex items-center gap-3">
            <BrandLogo branding={branding} variant="header" />
            <div>
              <div className="text-sm font-bold text-slate-900">
                OHB-OPCMS · Secure Read-Only Document Preview
              </div>
              <div className="text-xs text-slate-500">
                Oromia Health Bureau Polio Campaign Management System
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2 text-xs">
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded bg-blue-50 text-[#485EA9] border border-blue-200 font-semibold">
              <Lock className="w-3.5 h-3.5" />
              READ-ONLY SIGNED LINK
            </span>
          </div>
        </div>
      </header>

      <main className="flex-1 max-w-6xl w-full mx-auto p-4 sm:p-6 space-y-4">
        {loading ? (
          <div className="bg-white border border-slate-200 rounded-xl p-10 text-center text-sm text-slate-600">
            Verifying cryptographic signature and expiration...
          </div>
        ) : error || !info ? (
          <div className="bg-white border border-red-200 rounded-xl p-8 max-w-xl mx-auto text-center space-y-3">
            <div className="w-12 h-12 rounded-full bg-red-50 text-red-700 flex items-center justify-center mx-auto">
              <AlertTriangle className="w-6 h-6" />
            </div>
            <h1 className="text-base font-bold text-slate-900">
              Preview Link Unavailable
            </h1>
            <p className="text-xs text-red-700 leading-relaxed">
              {error || 'This preview link could not be verified.'}
            </p>
            <p className="text-[11px] text-slate-500">
              Signed preview links automatically expire after 6 days (144 hours) or when revoked by an administrator. Request a fresh link from an authorized OHB officer if needed.
            </p>
          </div>
        ) : (
          <>
            {/* File & Expiration Metadata Banner */}
            <div className="bg-white border border-slate-200 rounded-xl p-4 sm:p-5 flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
              <div className="space-y-1 min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <ShieldCheck className="w-4 h-4 text-emerald-700 shrink-0" />
                  <h1 className="text-base font-bold text-slate-900 break-all">
                    {info.originalFilename}
                  </h1>
                  <span className="px-2 py-0.5 text-[11px] font-mono bg-slate-100 text-slate-700 rounded border border-slate-200">
                    {info.extension.toUpperCase()}
                  </span>
                </div>
                {info.description ? (
                  <p className="text-xs text-slate-600">{info.description}</p>
                ) : null}
                <div className="text-xs text-slate-500 flex flex-wrap gap-x-4 gap-y-1">
                  <span>Size: {formatBytes(info.fileSizeBytes)}</span>
                  <span>Category: {info.module} / {info.category}</span>
                  <span>Uploaded by: {info.uploadedByName}</span>
                  <span>Uploaded: {formatDateTimeEAT(info.uploadedAt)}</span>
                </div>
              </div>

              <div className="flex flex-col sm:flex-row sm:items-center gap-3 shrink-0">
                <div className="bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 text-xs text-amber-900">
                  <div className="flex items-center gap-1.5 font-semibold">
                    <Clock className="w-3.5 h-3.5" />
                    Expires {formatRemaining(info.expiresAt)}
                  </div>
                  <div className="text-[11px] mt-0.5">
                    {formatDateTimeEAT(info.expiresAt)}
                  </div>
                </div>
                <a
                  href={info.downloadReadOnlyUrl}
                  className="inline-flex items-center justify-center gap-1.5 px-4 py-2.5 text-xs font-semibold text-white bg-[#485EA9] hover:bg-[#3a4d8f] rounded-lg"
                >
                  <Download className="w-4 h-4" />
                  Download Copy
                </a>
              </div>
            </div>

            {/* Live Preview Canvas */}
            <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
              {info.previewKind === 'image' ? (
                <div className="p-6 bg-slate-50 flex items-center justify-center min-h-[420px]">
                  <img
                    src={info.contentUrl}
                    alt={info.originalFilename}
                    className="max-w-full max-h-[75vh] object-contain rounded border border-slate-200 bg-white shadow-sm"
                  />
                </div>
              ) : info.previewKind === 'pdf' ? (
                <iframe
                  title={info.originalFilename}
                  src={info.contentUrl}
                  className="w-full h-[78vh] bg-white"
                />
              ) : info.previewKind === 'spreadsheet' && sheetData ? (
                <div className="space-y-0">
                  {sheetData.sheets.length > 1 ? (
                    <div className="px-4 py-2 border-b border-slate-200 bg-slate-50 flex flex-wrap gap-2">
                      {sheetData.sheets.map((s, idx) => (
                        <button
                          key={s.name}
                          type="button"
                          onClick={() => setActiveSheetIdx(idx)}
                          className={`px-3 py-1 text-xs rounded-md font-medium ${
                            idx === activeSheetIdx
                              ? 'bg-[#485EA9] text-white'
                              : 'bg-white border border-slate-200 text-slate-700'
                          }`}
                        >
                          {s.name}
                        </button>
                      ))}
                    </div>
                  ) : null}
                  {(() => {
                    const sheet = sheetData.sheets[activeSheetIdx] || sheetData.sheets[0];
                    if (!sheet || sheet.rows.length === 0) {
                      return (
                        <div className="p-8 text-center text-xs text-slate-500">
                          Spreadsheet contains no previewable rows.
                        </div>
                      );
                    }
                    return (
                      <div className="overflow-auto max-h-[72vh]">
                        <table className="min-w-full text-xs border-collapse">
                          <tbody>
                            {sheet.rows.map((r, rIdx) => (
                              <tr
                                key={rIdx}
                                className={
                                  rIdx === 0
                                    ? 'bg-slate-100 font-semibold text-slate-800 border-b border-slate-300'
                                    : 'border-b border-slate-100 hover:bg-slate-50'
                                }
                              >
                                <td className="px-2.5 py-1.5 text-[11px] font-mono text-slate-400 border-r border-slate-200 bg-slate-50">
                                  {rIdx + 1}
                                </td>
                                {r.map((cell, cIdx) => (
                                  <td
                                    key={cIdx}
                                    className="px-3 py-1.5 border-r border-slate-100 whitespace-nowrap max-w-[260px] truncate"
                                    title={cell}
                                  >
                                    {cell}
                                  </td>
                                ))}
                              </tr>
                            ))}
                          </tbody>
                        </table>
                        {sheet.truncated ? (
                          <div className="p-3 text-center text-[11px] text-slate-500 bg-slate-50 border-t border-slate-200">
                            Showing first 120 rows for fast read-only preview. Use Download Copy for the full workbook.
                          </div>
                        ) : null}
                      </div>
                    );
                  })()}
                </div>
              ) : info.previewKind === 'text' && textContent !== null ? (
                <pre className="p-5 text-xs font-mono text-slate-800 bg-slate-50 overflow-auto max-h-[75vh] whitespace-pre-wrap">
                  {textContent}
                </pre>
              ) : (
                <div className="p-10 text-center space-y-3">
                  {info.previewKind === 'spreadsheet' ? (
                    <FileSpreadsheet className="w-10 h-10 text-emerald-700 mx-auto" />
                  ) : (
                    <FileText className="w-10 h-10 text-[#485EA9] mx-auto" />
                  )}
                  <div className="text-sm font-semibold text-slate-900">
                    {info.originalFilename}
                  </div>
                  <p className="text-xs text-slate-600 max-w-md mx-auto">
                    In-browser inline rendering is not supported for {info.extension.toUpperCase()} binaries. Use Download Copy to inspect this read-only document locally.
                  </p>
                  <a
                    href={info.downloadReadOnlyUrl}
                    className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-[#485EA9] rounded-lg hover:bg-[#3a4d8f]"
                  >
                    <Download className="w-4 h-4" />
                    Download Read-Only Copy
                  </a>
                </div>
              )}
            </div>
          </>
        )}
      </main>
    </div>
  );
};
