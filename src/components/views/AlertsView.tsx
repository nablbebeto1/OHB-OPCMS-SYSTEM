import React, { useMemo, useState } from 'react';
import { ShieldAlert, ClipboardCheck, X } from 'lucide-react';
import { api } from '../../api/client';
import type {
  ClinicalCaseStatus,
  SurveillanceAlert,
  UserRole,
} from '../../types/opcms';

interface AlertsViewProps {
  alerts: SurveillanceAlert[];
  userRole: UserRole;
  onRefresh: () => void;
}

const STATUS_LABELS: Record<ClinicalCaseStatus, string> = {
  reported_pending: 'Reported (Pending Investigation)',
  under_investigation: 'Under Field Investigation',
  sample_collected: 'Stool / Clinical Sample Collected',
  verified_confirmed: 'Verified Clinical Case',
  discarded: 'Discarded / Not Confirmed',
};

export const AlertsView: React.FC<AlertsViewProps> = ({
  alerts,
  userRole,
  onRefresh,
}) => {
  const [typeFilter, setTypeFilter] = useState<'ALL' | 'AFP' | 'AEFI'>('ALL');
  const [selected, setSelected] = useState<SurveillanceAlert | null>(null);
  const [clinicalStatus, setClinicalStatus] =
    useState<ClinicalCaseStatus>('reported_pending');
  const [verifiedCases, setVerifiedCases] = useState(0);
  const [investigator, setInvestigator] = useState('');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canManageAlerts =
    userRole === 'system_admin' ||
    userRole === 'command_center' ||
    userRole === 'central_command' ||
    userRole === 'zone_officer';

  const filtered = useMemo(() => {
    return alerts.filter((a) =>
      typeFilter === 'ALL' ? true : a.alertType === typeFilter
    );
  }, [alerts, typeFilter]);

  const totals = useMemo(() => {
    const afpAdmin = alerts
      .filter((a) => a.alertType === 'AFP')
      .reduce((s, a) => s + a.administrativeAlertCount, 0);
    const afpVerified = alerts
      .filter((a) => a.alertType === 'AFP')
      .reduce((s, a) => s + a.verifiedClinicalCases, 0);
    const aefiAdmin = alerts
      .filter((a) => a.alertType === 'AEFI')
      .reduce((s, a) => s + a.administrativeAlertCount, 0);
    const aefiVerified = alerts
      .filter((a) => a.alertType === 'AEFI')
      .reduce((s, a) => s + a.verifiedClinicalCases, 0);
    return { afpAdmin, afpVerified, aefiAdmin, aefiVerified };
  }, [alerts]);

  function openFollowUp(a: SurveillanceAlert) {
    setSelected(a);
    setClinicalStatus(a.clinicalStatus);
    setVerifiedCases(a.verifiedClinicalCases);
    setInvestigator(a.assignedInvestigator);
    setNotes(a.followUpNotes);
    setError(null);
  }

  async function submitFollowUp(e: React.FormEvent) {
    e.preventDefault();
    if (!selected) return;
    setSaving(true);
    setError(null);
    try {
      await api.updateAlert(selected.id, {
        clinicalStatus,
        verifiedClinicalCases: verifiedCases,
        assignedInvestigator: investigator,
        followUpNotes: notes,
      });
      setSelected(null);
      onRefresh();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-6">
      {/* Separation Notice + KPI Summary */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
        <div className="bg-white border border-slate-200 rounded-lg p-4">
          <div className="text-xs text-slate-500">AFP Administrative Alerts</div>
          <div className="mt-2 text-2xl font-semibold tabular-nums text-red-700">
            {totals.afpAdmin}
          </div>
          <div className="mt-1 text-xs text-slate-500">
            Raw daily tally sheet alerts
          </div>
        </div>
        <div className="bg-white border border-slate-200 rounded-lg p-4">
          <div className="text-xs text-slate-500">AFP Verified Clinical Cases</div>
          <div className="mt-2 text-2xl font-semibold tabular-nums text-slate-900">
            {totals.afpVerified}
          </div>
          <div className="mt-1 text-xs text-slate-500">
            Confirmed after field verification
          </div>
        </div>
        <div className="bg-white border border-slate-200 rounded-lg p-4">
          <div className="text-xs text-slate-500">AEFI Administrative Alerts</div>
          <div className="mt-2 text-2xl font-semibold tabular-nums text-[#D29441]">
            {totals.aefiAdmin}
          </div>
          <div className="mt-1 text-xs text-slate-500">
            Raw daily tally sheet alerts
          </div>
        </div>
        <div className="bg-white border border-slate-200 rounded-lg p-4">
          <div className="text-xs text-slate-500">AEFI Verified Clinical Cases</div>
          <div className="mt-2 text-2xl font-semibold tabular-nums text-slate-900">
            {totals.aefiVerified}
          </div>
          <div className="mt-1 text-xs text-slate-500">
            Confirmed after clinical review
          </div>
        </div>
      </div>

      {/* Alert Center Table */}
      <div className="bg-white border border-slate-200 rounded-lg">
        <div className="px-5 py-4 border-b border-slate-200 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div className="flex items-center gap-2">
            <ShieldAlert className="w-4 h-4 text-red-600" />
            <div>
              <h2 className="text-sm font-semibold text-slate-900">
                AFP &amp; AEFI Surveillance Alert Center ({filtered.length})
              </h2>
              <p className="text-xs text-slate-500">
                Administrative alerts remain pending until investigated and classified by authorized surveillance officers.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-lg">
            {(['ALL', 'AFP', 'AEFI'] as const).map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setTypeFilter(t)}
                className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
                  typeFilter === t
                    ? 'bg-white text-slate-900 shadow-sm'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {t}
              </button>
            ))}
          </div>
        </div>

        {filtered.length === 0 ? (
          <div className="p-8 text-center text-xs text-slate-500">
            No AFP or AEFI alerts recorded in active campaign reports.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="bg-slate-50 border-b border-slate-200 text-slate-600">
                <tr>
                  <th className="text-left font-medium px-4 py-2.5">Type</th>
                  <th className="text-left font-medium px-3 py-2.5">Zone</th>
                  <th className="text-left font-medium px-3 py-2.5">Woreda</th>
                  <th className="text-left font-medium px-3 py-2.5">Day</th>
                  <th className="text-right font-medium px-3 py-2.5">Admin Alerts</th>
                  <th className="text-right font-medium px-3 py-2.5">Verified Cases</th>
                  <th className="text-left font-medium px-3 py-2.5">Clinical Status</th>
                  <th className="text-left font-medium px-3 py-2.5">Remarks / Follow-up</th>
                  {canManageAlerts ? (
                    <th className="text-right font-medium px-4 py-2.5">Action</th>
                  ) : null}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filtered.map((a) => (
                  <tr key={a.id} className="hover:bg-slate-50">
                    <td className="px-4 py-2.5 font-semibold">
                      <span
                        className={
                          a.alertType === 'AFP' ? 'text-red-700' : 'text-[#D29441]'
                        }
                      >
                        {a.alertType}
                      </span>
                    </td>
                    <td className="px-3 py-2.5 text-slate-700">{a.canonicalZone}</td>
                    <td className="px-3 py-2.5 font-medium text-slate-900">
                      {a.canonicalWoreda}
                    </td>
                    <td className="px-3 py-2.5 text-slate-600">Day {a.campaignDayNum}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums font-semibold">
                      {a.administrativeAlertCount}
                    </td>
                    <td className="px-3 py-2.5 text-right tabular-nums">
                      {a.verifiedClinicalCases}
                    </td>
                    <td className="px-3 py-2.5 text-slate-700">
                      {STATUS_LABELS[a.clinicalStatus]}
                    </td>
                    <td className="px-3 py-2.5 text-slate-600 max-w-xs truncate">
                      {a.followUpNotes || a.sourceRemarks || '—'}
                    </td>
                    {canManageAlerts ? (
                      <td className="px-4 py-2.5 text-right">
                        <button
                          type="button"
                          onClick={() => openFollowUp(a)}
                          className="inline-flex items-center gap-1 text-xs font-medium text-[#485EA9] hover:underline"
                        >
                          <ClipboardCheck className="w-3.5 h-3.5" />
                          Update Follow-up
                        </button>
                      </td>
                    ) : null}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Follow-up Modal */}
      {selected ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4">
          <div className="w-full max-w-md bg-white border border-slate-200 rounded-xl shadow-lg overflow-hidden">
            <div className="flex items-center justify-between px-5 py-3.5 border-b border-slate-200 bg-slate-50">
              <h3 className="text-sm font-semibold text-slate-900">
                {selected.alertType} Alert Follow-up · {selected.canonicalWoreda}
              </h3>
              <button
                type="button"
                onClick={() => setSelected(null)}
                className="p-1 text-slate-500 hover:text-slate-900"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <form onSubmit={submitFollowUp} className="p-5 space-y-3.5 text-xs">
              {error ? (
                <div className="p-2.5 bg-red-50 border border-red-200 text-red-700 rounded">
                  {error}
                </div>
              ) : null}
              <div className="p-3 bg-slate-50 rounded-lg text-slate-700">
                Administrative Tally Count: <strong>{selected.administrativeAlertCount}</strong> · Day {selected.campaignDayNum} ({selected.canonicalZone})
              </div>
              <div>
                <label className="block font-medium text-slate-700 mb-1">
                  Clinical Investigation Status
                </label>
                <select
                  value={clinicalStatus}
                  onChange={(e) =>
                    setClinicalStatus(e.target.value as ClinicalCaseStatus)
                  }
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg bg-white"
                >
                  {Object.entries(STATUS_LABELS).map(([k, lbl]) => (
                    <option key={k} value={k}>
                      {lbl}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block font-medium text-slate-700 mb-1">
                  Verified Clinical Cases Count
                </label>
                <input
                  type="number"
                  min={0}
                  max={selected.administrativeAlertCount + 10}
                  value={verifiedCases}
                  onChange={(e) => setVerifiedCases(Number(e.target.value))}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg tabular-nums"
                />
              </div>
              <div>
                <label className="block font-medium text-slate-700 mb-1">
                  Assigned Surveillance Officer / Investigator
                </label>
                <input
                  type="text"
                  value={investigator}
                  onChange={(e) => setInvestigator(e.target.value)}
                  placeholder="Officer name & contact"
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg"
                />
              </div>
              <div>
                <label className="block font-medium text-slate-700 mb-1">
                  Investigation &amp; Clinical Notes
                </label>
                <textarea
                  rows={3}
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Document field verification findings, specimen ID, or follow-up action..."
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg"
                />
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setSelected(null)}
                  className="px-3.5 py-2 border border-slate-300 rounded-lg text-slate-700"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="px-4 py-2 bg-[#485EA9] text-white rounded-lg hover:bg-[#3a4d8f]"
                >
                  {saving ? 'Saving...' : 'Save Follow-up'}
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </div>
  );
};
