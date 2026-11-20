from datetime import datetime
from typing import Any, Dict, List, Optional
from sqlalchemy.orm import Session

from .models import (
    AdminLocation,
    Campaign,
    CampaignDailyReport,
    ImportBatch,
    SurveillanceAlert,
    SystemSetting,
)


import re

HEX_COLOR_RE = re.compile(r"^#[0-9a-fA-F]{6}$")
CORE_ADMIN_MODULES = {"system_settings", "branding_appearance", "user_management"}

DEFAULT_SYSTEM_SETTINGS_MAP: Dict[str, str] = {
    "coverageTargetPct": "95",
    "coverageCriticalPct": "80",
    "maxWastagePct": "15",
    "overTargetAlertPct": "105",
    "dailyDeviationPct": "35",
    "expectedWoredasOverride": "",
    "googleDriveSyncStatus": "manual_upload_active",
    "guestPublicOverviewEnabled": "false",
    "appName": "Oromia Polio Campaign Management System (OHB-OPCMS)",
    "appShortName": "OHB-OPCMS",
    "organizationName": "Oromia Health Bureau",
    "appTagline": "Central Command Center – nOPV2 and bOPV2 Supplementary Immunization Activities",
    "footerText": "Oromia Health Bureau (OHB) · Self-Hosted Polio Campaign Management System",
    "timezone": "Africa/Addis_Ababa",
    "dateFormat": "YYYY-MM-DD",
    "supportContact": "phem@oromiahealth.gov.et",
    "primaryColor": "#485EA9",
    "secondaryColor": "#3A99CF",
    "accentColor": "#D29441",
    "surfaceColor": "#F8FAFC",
    "displayFont": "Plus Jakarta Sans",
    "bodyFont": "DM Sans",
    "fontScale": "standard",
    "loginTheme": "clean_light",
    "defaultLanguage": "en",
    "allowUserLanguageSwitch": "true",
    "defaultCampaignId": "1",
    "dashboardAutoRefreshSec": "30",
    "showDataQualityBanner": "true",
    "defaultLandingPage": "live_command_center",
    "disabledModules": "",
    "sidebarCollapsedDefault": "false",
    "showFooterBranding": "true",
    "uiDensity": "comfortable",
    "tableRowsPerPage": "25",
    "showAnimations": "true",
    "highContrastMode": "false",
    "commandRoomAutoRotate": "true",
    "commandRoomIntervalSec": "15",
    "commandRoomEnabledScreens": "1,2,3,4,5",
    "commandRoomDefaultScreen": "1",
    "commandRoomFullscreenStartup": "false",
    "commandRoomDataRefreshSec": "30",
    "commandRoomDisplayTitle": "Oromia Health Bureau – Polio Campaign Command Room",
    "liveCommandAutoRefresh": "true",
    "liveCommandShowTicker": "true",
    "maxUploadSizeMb": "25",
    "previewLinkTtlHours": "144",
    "requireImportConfirmation": "true",
    "retainArchivedBrandingAssets": "true",
}

ALLOWED_SETTING_KEYS = [k for k in DEFAULT_SYSTEM_SETTINGS_MAP.keys() if k != "googleDriveSyncStatus"]


def _safe_hex(val: Optional[str], fallback: str) -> str:
    t = (val or "").strip()
    return t.upper() if HEX_COLOR_RE.match(t) else fallback


def _to_int(val: str, default: int, lo: Optional[int] = None, hi: Optional[int] = None) -> int:
    try:
        n = int(float(val))
    except (TypeError, ValueError):
        n = default
    if lo is not None:
        n = max(lo, n)
    if hi is not None:
        n = min(hi, n)
    return n


def get_system_settings(db: Session) -> Dict[str, Any]:
    rows = {s.key: s.value for s in db.query(SystemSetting).all()}

    def get(k: str) -> str:
        return rows.get(k, DEFAULT_SYSTEM_SETTINGS_MAP.get(k, ""))

    enabled_screens = [
        int(x)
        for x in (get("commandRoomEnabledScreens") or "1,2,3,4,5").split(",")
        if x.strip().isdigit() and 1 <= int(x.strip()) <= 5
    ] or [1, 2, 3, 4, 5]
    default_screen = _to_int(get("commandRoomDefaultScreen"), 1)
    if default_screen not in enabled_screens:
        default_screen = enabled_screens[0]

    df_raw = get("dateFormat")
    date_format = df_raw if df_raw in ("DD/MM/YYYY", "MMM DD, YYYY") else "YYYY-MM-DD"

    disp_raw = get("displayFont")
    display_font = disp_raw if disp_raw in ("DM Sans", "Inter", "System Sans") else "Plus Jakarta Sans"

    body_raw = get("bodyFont")
    body_font = body_raw if body_raw in ("Plus Jakarta Sans", "Inter", "System Sans") else "DM Sans"

    fs_raw = get("fontScale")
    font_scale = fs_raw if fs_raw in ("compact", "comfortable") else "standard"

    login_theme = "institutional_gradient" if get("loginTheme") == "institutional_gradient" else "clean_light"

    lang_raw = get("defaultLanguage")
    default_lang = lang_raw if lang_raw in ("om", "am") else "en"

    land_raw = get("defaultLandingPage")
    default_landing = (
        land_raw if land_raw in ("command_center", "campaign_overview") else "live_command_center"
    )

    disabled_modules = [
        s.strip()
        for s in get("disabledModules").split(",")
        if s.strip() and s.strip() not in CORE_ADMIN_MODULES
    ]

    default_camp_raw = get("defaultCampaignId").strip()

    return {
        "coverageTargetPct": float(get("coverageTargetPct") or 95),
        "coverageCriticalPct": float(get("coverageCriticalPct") or 80),
        "maxWastagePct": float(get("maxWastagePct") or 15),
        "overTargetAlertPct": float(get("overTargetAlertPct") or 105),
        "dailyDeviationPct": float(get("dailyDeviationPct") or 35),
        "expectedWoredasOverride": int(get("expectedWoredasOverride").strip())
        if get("expectedWoredasOverride").strip().isdigit()
        else None,
        "googleDriveSyncStatus": "manual_upload_active",
        "guestPublicOverviewEnabled": get("guestPublicOverviewEnabled") == "true",
        "appName": get("appName") or DEFAULT_SYSTEM_SETTINGS_MAP["appName"],
        "appShortName": get("appShortName") or DEFAULT_SYSTEM_SETTINGS_MAP["appShortName"],
        "organizationName": get("organizationName") or DEFAULT_SYSTEM_SETTINGS_MAP["organizationName"],
        "appTagline": get("appTagline") or DEFAULT_SYSTEM_SETTINGS_MAP["appTagline"],
        "footerText": get("footerText") or DEFAULT_SYSTEM_SETTINGS_MAP["footerText"],
        "timezone": get("timezone") or "Africa/Addis_Ababa",
        "dateFormat": date_format,
        "supportContact": get("supportContact"),
        "primaryColor": _safe_hex(get("primaryColor"), "#485EA9"),
        "secondaryColor": _safe_hex(get("secondaryColor"), "#3A99CF"),
        "accentColor": _safe_hex(get("accentColor"), "#D29441"),
        "surfaceColor": _safe_hex(get("surfaceColor"), "#F8FAFC"),
        "displayFont": display_font,
        "bodyFont": body_font,
        "fontScale": font_scale,
        "loginTheme": login_theme,
        "defaultLanguage": default_lang,
        "allowUserLanguageSwitch": get("allowUserLanguageSwitch") != "false",
        "defaultCampaignId": int(default_camp_raw) if default_camp_raw.isdigit() else 1,
        "dashboardAutoRefreshSec": _to_int(get("dashboardAutoRefreshSec"), 30, 10, 300),
        "showDataQualityBanner": get("showDataQualityBanner") != "false",
        "defaultLandingPage": default_landing,
        "disabledModules": disabled_modules,
        "sidebarCollapsedDefault": get("sidebarCollapsedDefault") == "true",
        "showFooterBranding": get("showFooterBranding") != "false",
        "uiDensity": "compact" if get("uiDensity") == "compact" else "comfortable",
        "tableRowsPerPage": _to_int(get("tableRowsPerPage"), 25, 10, 200),
        "showAnimations": get("showAnimations") != "false",
        "highContrastMode": get("highContrastMode") == "true",
        "commandRoomAutoRotate": get("commandRoomAutoRotate") != "false",
        "commandRoomIntervalSec": _to_int(get("commandRoomIntervalSec"), 15, 5, 120),
        "commandRoomEnabledScreens": enabled_screens,
        "commandRoomDefaultScreen": default_screen,
        "commandRoomFullscreenStartup": get("commandRoomFullscreenStartup") == "true",
        "commandRoomDataRefreshSec": _to_int(get("commandRoomDataRefreshSec"), 30, 10, 300),
        "commandRoomDisplayTitle": get("commandRoomDisplayTitle")
        or DEFAULT_SYSTEM_SETTINGS_MAP["commandRoomDisplayTitle"],
        "liveCommandAutoRefresh": get("liveCommandAutoRefresh") != "false",
        "liveCommandShowTicker": get("liveCommandShowTicker") != "false",
        "maxUploadSizeMb": _to_int(get("maxUploadSizeMb"), 25, 1, 100),
        "previewLinkTtlHours": _to_int(get("previewLinkTtlHours"), 144, 1, 720),
        "requireImportConfirmation": get("requireImportConfirmation") != "false",
        "retainArchivedBrandingAssets": get("retainArchivedBrandingAssets") != "false",
    }


def persist_system_settings(db: Session, payload: Dict[str, Any]) -> Dict[str, Any]:
    for k in ALLOWED_SETTING_KEYS:
        if k not in payload:
            continue
        raw = payload[k]
        if k == "commandRoomEnabledScreens" and isinstance(raw, list):
            val = ",".join(str(x) for x in raw)
        elif k == "disabledModules" and isinstance(raw, list):
            val = ",".join(
                str(x).strip()
                for x in raw
                if str(x).strip() and str(x).strip() not in CORE_ADMIN_MODULES
            )
        elif raw is None:
            val = ""
        elif isinstance(raw, bool):
            val = "true" if raw else "false"
        else:
            val = str(raw)

        row = db.query(SystemSetting).filter(SystemSetting.key == k).first()
        if row:
            row.value = val
            row.updated_at = datetime.utcnow()
        else:
            db.add(SystemSetting(key=k, value=val, updated_at=datetime.utcnow()))

    db.flush()
    return get_system_settings(db)


def _round1(val: float) -> float:
    return round(val * 10) / 10


def _round2(val: float) -> float:
    return round(val * 100) / 100


def _wastage_pct(used: Optional[int], received: Optional[int]) -> Optional[float]:
    if not received or received <= 0 or used is None:
        return None
    return _round2(max(0.0, ((received - used) / received) * 100.0))


def _latest_import_meta(db: Session, campaign_id: int) -> Optional[Dict[str, Any]]:
    b = (
        db.query(ImportBatch)
        .filter(ImportBatch.campaign_id == campaign_id, ImportBatch.status == "confirmed")
        .order_by(ImportBatch.confirmed_at.desc(), ImportBatch.id.desc())
        .first()
    )
    if not b:
        return None
    return {
        "id": b.id,
        "originalFilename": b.original_filename,
        "uploadedByName": b.uploaded_by_name,
        "confirmedAt": (b.confirmed_at or b.uploaded_at).isoformat() + "Z",
        "importedRecords": b.imported_records,
        "updatedRecords": b.updated_records,
        "importMode": b.import_mode,
    }


def _base_reports_and_locations(
    db: Session,
    campaign_id: int = 1,
    day_num: Optional[int] = None,
    report_date: Optional[str] = None,
    zone: Optional[str] = None,
    woreda: Optional[str] = None,
):
    q = db.query(CampaignDailyReport).filter(
        CampaignDailyReport.campaign_id == campaign_id,
        CampaignDailyReport.is_active == True,
    )
    if day_num:
        q = q.filter(CampaignDailyReport.campaign_day_num == day_num)
    if report_date:
        q = q.filter(CampaignDailyReport.report_date == report_date)
    if zone:
        q = q.filter(CampaignDailyReport.canonical_zone == zone)
    if woreda:
        q = q.filter(CampaignDailyReport.canonical_woreda == woreda)
    rows = q.all()

    lq = db.query(AdminLocation).filter(AdminLocation.is_active == True)
    if zone:
        lq = lq.filter(AdminLocation.canonical_zone == zone)
    if woreda:
        lq = lq.filter(AdminLocation.canonical_woreda == woreda)
    locs = lq.all()
    return rows, locs


def compute_dashboard_summary(
    db: Session,
    campaign_id: int = 1,
    day_num: Optional[int] = None,
    report_date: Optional[str] = None,
    zone: Optional[str] = None,
    woreda: Optional[str] = None,
) -> Dict[str, Any]:
    settings = get_system_settings(db)
    rows, locs = _base_reports_and_locations(db, campaign_id, day_num, report_date, zone, woreda)
    all_campaign_rows = (
        db.query(CampaignDailyReport)
        .filter(CampaignDailyReport.campaign_id == campaign_id, CampaignDailyReport.is_active == True)
        .all()
    )

    available_days = sorted({r.campaign_day_num for r in all_campaign_rows if r.campaign_day_num})
    available_dates = sorted({r.report_date for r in all_campaign_rows if r.report_date})

    expected_woredas = len(locs) if locs else len({(r.canonical_zone, r.canonical_woreda) for r in rows})
    if not zone and not woreda and settings["expectedWoredasOverride"]:
        expected_woredas = settings["expectedWoredasOverride"]

    total_planned_target = sum(l.planned_target for l in locs) if locs else sum(r.total_planned_target for r in rows)
    total_daily_target = sum(l.daily_target for l in locs) if locs else sum(r.daily_target for r in rows)

    submitted_pairs = {(r.canonical_zone, r.canonical_woreda) for r in rows if r.has_reported_activity}
    submitted_woredas = len(submitted_pairs)
    pending_woredas = max(0, expected_woredas - submitted_woredas)

    total_0_59 = sum(r.total_vaccinated_0_59 for r in rows)
    total_60_120 = sum(r.vacc_60_120_before + r.vacc_60_120_not_before for r in rows)
    overall_cov = _round1((total_0_59 / total_planned_target) * 100) if total_planned_target > 0 else 0.0
    daily_cov = _round1((total_0_59 / total_daily_target) * 100) if total_daily_target > 0 else 0.0

    nopv2_rec = sum(r.nopv2_vials_received or 0 for r in rows)
    nopv2_used = sum(r.nopv2_vials_used or 0 for r in rows)
    bopv_rec = sum(r.bopv_vials_received or 0 for r in rows)
    bopv_used = sum(r.bopv_vials_used or 0 for r in rows)

    alerts = (
        db.query(SurveillanceAlert)
        .filter(SurveillanceAlert.campaign_id == campaign_id, SurveillanceAlert.is_active == True)
        .all()
    )
    afp_verified = sum(a.verified_clinical_cases for a in alerts if a.alert_type == "AFP")
    aefi_verified = sum(a.verified_clinical_cases for a in alerts if a.alert_type == "AEFI")

    sm_hh = sum(r.sm_hhs_visited for r in rows)
    sm_gd = sum(r.sm_group_discussions for r in rows)
    sm_ipc = sum(r.sm_ipc_reached for r in rows)

    kpis = {
        "totalPlannedTarget": total_planned_target,
        "totalDailyTarget": total_daily_target,
        "totalChildrenVaccinated0_59": total_0_59,
        "totalChildrenVaccinated60_120": total_60_120,
        "overallVaccinationCoveragePct": overall_cov,
        "dailyVaccinationCoveragePct": daily_cov,
        "expectedReportingWoredas": expected_woredas,
        "submittedWoredas": submitted_woredas,
        "pendingWoredas": pending_woredas,
        "totalVaccinationTeams": sum(r.teams_total for r in rows),
        "reportingVaccinationTeams": sum(r.teams_reported for r in rows),
        "nopv2VialsReceived": nopv2_rec,
        "nopv2VialsUsed": nopv2_used,
        "nopv2WastageRatePct": _wastage_pct(nopv2_used, nopv2_rec),
        "bopvVialsReceived": bopv_rec,
        "bopvVialsUsed": bopv_used,
        "bopvWastageRatePct": _wastage_pct(bopv_used, bopv_rec),
        "zeroDoseIdentified": sum(r.zd_identified_linked for r in rows),
        "zeroDoseVaccinated": sum(r.zd_vaccinated for r in rows),
        "underVaccinatedIdentified": sum(r.uv_identified_linked for r in rows),
        "underVaccinatedVaccinated": sum(r.uv_vaccinated for r in rows),
        "afpAlertsTotal": sum(r.afp_alerts_count for r in rows),
        "aefiAlertsTotal": sum(r.aefi_alerts_count for r in rows),
        "afpVerifiedCasesTotal": afp_verified,
        "aefiVerifiedCasesTotal": aefi_verified,
        "smHhsVisited": sm_hh,
        "smGroupDiscussions": sm_gd,
        "smIpcReached": sm_ipc,
        "smTotalActivities": sm_hh + sm_gd + sm_ipc,
    }

    # Zone summaries
    zone_map: Dict[str, Dict[str, Any]] = {}
    for l in locs:
        zm = zone_map.setdefault(
            l.canonical_zone,
            {
                "zone": l.canonical_zone,
                "woredaSet": set(),
                "submittedSet": set(),
                "plannedTarget": 0,
                "dailyTarget": 0,
                "vaccinated0_59": 0,
                "vaccinated60_120": 0,
                "nopv2Received": 0,
                "nopv2Used": 0,
                "bopvReceived": 0,
                "bopvUsed": 0,
                "afpAlerts": 0,
                "aefiAlerts": 0,
                "zdIdentified": 0,
                "zdVaccinated": 0,
                "uvIdentified": 0,
                "uvVaccinated": 0,
                "teamsTotal": 0,
                "teamsReported": 0,
            },
        )
        zm["woredaSet"].add(l.canonical_woreda)
        zm["plannedTarget"] += l.planned_target
        zm["dailyTarget"] += l.daily_target

    for r in rows:
        zm = zone_map.setdefault(
            r.canonical_zone,
            {
                "zone": r.canonical_zone,
                "woredaSet": set(),
                "submittedSet": set(),
                "plannedTarget": 0,
                "dailyTarget": 0,
                "vaccinated0_59": 0,
                "vaccinated60_120": 0,
                "nopv2Received": 0,
                "nopv2Used": 0,
                "bopvReceived": 0,
                "bopvUsed": 0,
                "afpAlerts": 0,
                "aefiAlerts": 0,
                "zdIdentified": 0,
                "zdVaccinated": 0,
                "uvIdentified": 0,
                "uvVaccinated": 0,
                "teamsTotal": 0,
                "teamsReported": 0,
            },
        )
        zm["woredaSet"].add(r.canonical_woreda)
        if r.has_reported_activity:
            zm["submittedSet"].add(r.canonical_woreda)
        zm["vaccinated0_59"] += r.total_vaccinated_0_59
        zm["vaccinated60_120"] += r.vacc_60_120_before + r.vacc_60_120_not_before
        zm["nopv2Received"] += r.nopv2_vials_received or 0
        zm["nopv2Used"] += r.nopv2_vials_used or 0
        zm["bopvReceived"] += r.bopv_vials_received or 0
        zm["bopvUsed"] += r.bopv_vials_used or 0
        zm["afpAlerts"] += r.afp_alerts_count
        zm["aefiAlerts"] += r.aefi_alerts_count
        zm["zdIdentified"] += r.zd_identified_linked
        zm["zdVaccinated"] += r.zd_vaccinated
        zm["uvIdentified"] += r.uv_identified_linked
        zm["uvVaccinated"] += r.uv_vaccinated
        zm["teamsTotal"] += r.teams_total
        zm["teamsReported"] += r.teams_reported

    zones: List[Dict[str, Any]] = []
    for zname in sorted(zone_map.keys()):
        zm = zone_map[zname]
        wc = len(zm["woredaSet"])
        sc = len(zm["submittedSet"])
        pt = zm["plannedTarget"]
        dt = zm["dailyTarget"]
        v0 = zm["vaccinated0_59"]
        cov = _round1((v0 / pt) * 100) if pt > 0 else 0.0
        dcov = _round1((v0 / dt) * 100) if dt > 0 else 0.0
        comp = _round1((sc / wc) * 100) if wc > 0 else 0.0
        if sc == 0:
            status_cat = "no_report"
        elif zm["afpAlerts"] > 0 or cov < settings["coverageCriticalPct"]:
            status_cat = "critical_alert"
        elif cov < settings["coverageTargetPct"]:
            status_cat = "below_target"
        else:
            status_cat = "on_target"

        zones.append(
            {
                "zone": zname,
                "woredaCount": wc,
                "submittedWoredas": sc,
                "pendingWoredas": max(0, wc - sc),
                "completenessPct": comp,
                "plannedTarget": pt,
                "dailyTarget": dt,
                "vaccinated0_59": v0,
                "vaccinated60_120": zm["vaccinated60_120"],
                "overallCoveragePct": cov,
                "dailyCoveragePct": dcov,
                "nopv2Received": zm["nopv2Received"],
                "nopv2Used": zm["nopv2Used"],
                "bopvReceived": zm["bopvReceived"],
                "bopvUsed": zm["bopvUsed"],
                "afpAlerts": zm["afpAlerts"],
                "aefiAlerts": zm["aefiAlerts"],
                "zdIdentified": zm["zdIdentified"],
                "zdVaccinated": zm["zdVaccinated"],
                "uvIdentified": zm["uvIdentified"],
                "uvVaccinated": zm["uvVaccinated"],
                "teamsTotal": zm["teamsTotal"],
                "teamsReported": zm["teamsReported"],
                "statusCategory": status_cat,
            }
        )

    # Daily trends
    day_groups: Dict[int, List[CampaignDailyReport]] = {}
    for r in rows:
        day_groups.setdefault(r.campaign_day_num, []).append(r)

    daily_trends: List[Dict[str, Any]] = []
    cum_vacc = 0
    for d in sorted(day_groups.keys()):
        drows = day_groups[d]
        dv = sum(r.total_vaccinated_0_59 for r in drows)
        cum_vacc += dv
        dt_sum = sum(r.daily_target for r in drows) or total_daily_target
        pt_sum = total_planned_target or sum(r.total_planned_target for r in drows)
        sub_d = len({(r.canonical_zone, r.canonical_woreda) for r in drows if r.has_reported_activity})
        nv_rec = sum(r.nopv2_vials_received or 0 for r in drows)
        nv_used = sum(r.nopv2_vials_used or 0 for r in drows)
        bv_rec = sum(r.bopv_vials_received or 0 for r in drows)
        bv_used = sum(r.bopv_vials_used or 0 for r in drows)
        daily_trends.append(
            {
                "campaignDayNum": d,
                "campaignDayLabel": drows[0].campaign_day_label,
                "reportDate": drows[0].report_date,
                "dailyTarget": dt_sum,
                "plannedTarget": pt_sum,
                "vaccinated0_59": dv,
                "cumulativeVaccinated0_59": cum_vacc,
                "dailyCoveragePct": _round1((dv / dt_sum) * 100) if dt_sum > 0 else 0.0,
                "cumulativeCoveragePct": _round1((cum_vacc / pt_sum) * 100) if pt_sum > 0 else 0.0,
                "vacc0_11": sum(r.vacc_0_11_before + r.vacc_0_11_not_before for r in drows),
                "vacc12_59": sum(r.vacc_12_59_before + r.vacc_12_59_not_before for r in drows),
                "vacc60_120": sum(r.vacc_60_120_before + r.vacc_60_120_not_before for r in drows),
                "vaccinatedBefore": sum(r.vacc_0_11_before + r.vacc_12_59_before for r in drows),
                "notVaccinatedBefore": sum(r.vacc_0_11_not_before + r.vacc_12_59_not_before for r in drows),
                "nopv2Used": nv_used,
                "bopvUsed": bv_used,
                "nopv2WastagePct": _wastage_pct(nv_used, nv_rec),
                "bopvWastagePct": _wastage_pct(bv_used, bv_rec),
                "teamsTotal": sum(r.teams_total for r in drows),
                "teamsReported": sum(r.teams_reported for r in drows),
                "submittedWoredas": sub_d,
                "expectedWoredas": expected_woredas,
                "completenessPct": _round1((sub_d / expected_woredas) * 100) if expected_woredas > 0 else 0.0,
            }
        )

    warnings: List[Dict[str, Any]] = []
    for z in zones:
        if z["submittedWoredas"] > 0 and z["overallCoveragePct"] < settings["coverageCriticalPct"]:
            warnings.append(
                {
                    "id": f"low_cov_{z['zone']}",
                    "category": "low_coverage",
                    "severity": "critical",
                    "zone": z["zone"],
                    "woreda": "Zone Aggregate",
                    "campaignDayNum": day_num,
                    "metricValue": f"{z['overallCoveragePct']}%",
                    "thresholdValue": f"{settings['coverageCriticalPct']}%",
                    "description": f"{z['zone']} coverage is {z['overallCoveragePct']}% (below critical threshold).",
                }
            )
        if z["afpAlerts"] > 0:
            warnings.append(
                {
                    "id": f"afp_{z['zone']}",
                    "category": "inconsistent_totals",
                    "severity": "critical",
                    "zone": z["zone"],
                    "woreda": "Multiple",
                    "campaignDayNum": day_num,
                    "metricValue": f"{z['afpAlerts']} AFP",
                    "thresholdValue": "0",
                    "description": f"{z['afpAlerts']} AFP surveillance alert(s) reported in {z['zone']}.",
                }
            )

    return {
        "kpis": kpis,
        "zones": zones,
        "dailyTrends": daily_trends,
        "dataQualityWarnings": warnings[:100],
        "settings": settings,
        "availableDays": available_days,
        "availableDates": available_dates,
        "latestImport": _latest_import_meta(db, campaign_id),
        "serverTimestamp": datetime.utcnow().isoformat() + "Z",
    }


def compute_advanced_analytics(
    db: Session,
    campaign_id: int = 1,
    day_num: Optional[int] = None,
    report_date: Optional[str] = None,
    zone: Optional[str] = None,
    woreda: Optional[str] = None,
) -> Dict[str, Any]:
    summary = compute_dashboard_summary(db, campaign_id, day_num, report_date, zone, woreda)
    rows, locs = _base_reports_and_locations(db, campaign_id, day_num, report_date, zone, woreda)
    kpis = summary["kpis"]
    settings = summary["settings"]

    v0_11_b = sum(r.vacc_0_11_before for r in rows)
    v0_11_nb = sum(r.vacc_0_11_not_before for r in rows)
    v12_59_b = sum(r.vacc_12_59_before for r in rows)
    v12_59_nb = sum(r.vacc_12_59_not_before for r in rows)
    v60_120_b = sum(r.vacc_60_120_before for r in rows)
    v60_120_nb = sum(r.vacc_60_120_not_before for r in rows)

    total_before = v0_11_b + v12_59_b + v60_120_b
    total_not_before = v0_11_nb + v12_59_nb + v60_120_nb

    woreda_agg: Dict[tuple, Dict[str, Any]] = {}
    for l in locs:
        woreda_agg[(l.canonical_zone, l.canonical_woreda)] = {
            "zone": l.canonical_zone,
            "woreda": l.canonical_woreda,
            "plannedTarget": l.planned_target,
            "dailyTarget": l.daily_target,
            "vaccinated0_59": 0,
            "afpAlerts": 0,
            "aefiAlerts": 0,
            "submitted": False,
        }
    for r in rows:
        key = (r.canonical_zone, r.canonical_woreda)
        item = woreda_agg.setdefault(
            key,
            {
                "zone": r.canonical_zone,
                "woreda": r.canonical_woreda,
                "plannedTarget": r.total_planned_target,
                "dailyTarget": r.daily_target,
                "vaccinated0_59": 0,
                "afpAlerts": 0,
                "aefiAlerts": 0,
                "submitted": False,
            },
        )
        item["vaccinated0_59"] += r.total_vaccinated_0_59
        item["afpAlerts"] += r.afp_alerts_count
        item["aefiAlerts"] += r.aefi_alerts_count
        if r.has_reported_activity:
            item["submitted"] = True

    all_woredas: List[Dict[str, Any]] = []
    for item in woreda_agg.values():
        pt = item["plannedTarget"]
        cov = _round1((item["vaccinated0_59"] / pt) * 100) if pt > 0 else 0.0
        if not item["submitted"]:
            st = "no_report"
        elif item["afpAlerts"] > 0 or cov < settings["coverageCriticalPct"]:
            st = "critical_alert"
        elif cov < settings["coverageTargetPct"]:
            st = "below_target"
        else:
            st = "on_target"
        all_woredas.append({**item, "coveragePct": cov, "statusCategory": st})

    submitted_woredas = sorted(
        [w for w in all_woredas if w["submitted"]],
        key=lambda x: x["coveragePct"],
        reverse=True,
    )

    zone_analytics = []
    for z in summary["zones"]:
        zrows = [r for r in rows if r.canonical_zone == z["zone"]]
        vb = sum(r.vacc_0_11_before + r.vacc_12_59_before for r in zrows)
        vnb = sum(r.vacc_0_11_not_before + r.vacc_12_59_not_before for r in zrows)
        tot_b = vb + vnb
        zone_analytics.append(
            {
                **z,
                "age0_11": sum(r.vacc_0_11_before + r.vacc_0_11_not_before for r in zrows),
                "age12_59": sum(r.vacc_12_59_before + r.vacc_12_59_not_before for r in zrows),
                "vaccinatedBefore": vb,
                "notVaccinatedBefore": vnb,
                "priorVaccinatedSharePct": _round1((vb / tot_b) * 100) if tot_b > 0 else 0.0,
                "zdConversionPct": _round1((z["zdVaccinated"] / z["zdIdentified"]) * 100)
                if z["zdIdentified"] > 0
                else 0.0,
                "uvConversionPct": _round1((z["uvVaccinated"] / z["uvIdentified"]) * 100)
                if z["uvIdentified"] > 0
                else 0.0,
                "nopv2WastageRatePct": _wastage_pct(z["nopv2Used"], z["nopv2Received"]),
                "bopvWastageRatePct": _wastage_pct(z["bopvUsed"], z["bopvReceived"]),
                "targetGap": max(0, z["plannedTarget"] - z["vaccinated0_59"]),
            }
        )

    zd_id = kpis["zeroDoseIdentified"]
    zd_v = kpis["zeroDoseVaccinated"]
    uv_id = kpis["underVaccinatedIdentified"]
    uv_v = kpis["underVaccinatedVaccinated"]
    teams_tot = kpis["totalVaccinationTeams"]
    teams_rep = kpis["reportingVaccinationTeams"]

    return {
        "serverTimestamp": summary["serverTimestamp"],
        "latestImport": summary["latestImport"],
        "vaccinationPerformance": {
            "totalPlannedTarget": kpis["totalPlannedTarget"],
            "totalDailyTarget": kpis["totalDailyTarget"],
            "totalVaccinated0_59": kpis["totalChildrenVaccinated0_59"],
            "totalVaccinated60_120": kpis["totalChildrenVaccinated60_120"],
            "dailyVaccinationCoveragePct": kpis["dailyVaccinationCoveragePct"],
            "cumulativeVaccinationCoveragePct": kpis["overallVaccinationCoveragePct"],
            "targetAchievementPct": kpis["overallVaccinationCoveragePct"],
            "remainingTarget": max(0, kpis["totalPlannedTarget"] - kpis["totalChildrenVaccinated0_59"]),
        },
        "ageGroups": {
            "age0_11Before": v0_11_b,
            "age0_11NotBefore": v0_11_nb,
            "age0_11Total": v0_11_b + v0_11_nb,
            "age12_59Before": v12_59_b,
            "age12_59NotBefore": v12_59_nb,
            "age12_59Total": v12_59_b + v12_59_nb,
            "age60_120Before": v60_120_b,
            "age60_120NotBefore": v60_120_nb,
            "age60_120Total": v60_120_b + v60_120_nb,
            "totalVaccinatedBefore": total_before,
            "totalNotVaccinatedBefore": total_not_before,
        },
        "zoneAnalytics": zone_analytics,
        "topWoredas": submitted_woredas[:10],
        "criticalWoredas": list(reversed(submitted_woredas[-10:])),
        "allWoredas": all_woredas,
        "vaccineAccountability": {
            "nopv2": {
                "received": kpis["nopv2VialsReceived"],
                "used": kpis["nopv2VialsUsed"],
                "partiallyUsed": sum(r.nopv2_vials_partially_used or 0 for r in rows),
                "returnedGood": sum(r.nopv2_vials_returned_unused_good or 0 for r in rows),
                "broken": sum(r.nopv2_vials_broken or 0 for r in rows),
                "returnedBad": sum(r.nopv2_vials_returned_bad or 0 for r in rows),
                "lost": sum(r.nopv2_vials_lost or 0 for r in rows),
                "wastagePct": kpis["nopv2WastageRatePct"],
            },
            "bopv": {
                "received": kpis["bopvVialsReceived"],
                "used": kpis["bopvVialsUsed"],
                "partiallyUsed": sum(r.bopv_vials_partially_used or 0 for r in rows),
                "returnedGood": sum(r.bopv_vials_returned_unused_good or 0 for r in rows),
                "broken": sum(r.bopv_vials_broken or 0 for r in rows),
                "returnedBad": sum(r.bopv_vials_returned_bad or 0 for r in rows),
                "lost": sum(r.bopv_vials_lost or 0 for r in rows),
                "wastagePct": kpis["bopvWastageRatePct"],
            },
        },
        "integrationMetrics": {
            "zdIdentified": zd_id,
            "zdVaccinated": zd_v,
            "zdConversionPct": _round1((zd_v / zd_id) * 100) if zd_id > 0 else 0.0,
            "uvIdentified": uv_id,
            "uvVaccinated": uv_v,
            "uvConversionPct": _round1((uv_v / uv_id) * 100) if uv_id > 0 else 0.0,
            "smHhsVisited": kpis["smHhsVisited"],
            "smGroupDiscussions": kpis["smGroupDiscussions"],
            "smIpcReached": kpis["smIpcReached"],
            "teamsTotal": teams_tot,
            "teamsReported": teams_rep,
            "teamsReportingPct": _round1((teams_rep / teams_tot) * 100) if teams_tot > 0 else 0.0,
        },
    }


def get_command_room_state(
    db: Session,
    campaign_id: int = 1,
    day_num: Optional[int] = None,
    report_date: Optional[str] = None,
    zone: Optional[str] = None,
    woreda: Optional[str] = None,
) -> Dict[str, Any]:
    summary = compute_dashboard_summary(db, campaign_id, day_num, report_date, zone, woreda)
    adv = compute_advanced_analytics(db, campaign_id, day_num, report_date, zone, woreda)
    camp = db.query(Campaign).filter(Campaign.id == campaign_id).first()
    active_campaign = (
        {
            "id": camp.id,
            "name": camp.name,
            "roundCode": camp.round_code,
            "vaccines": camp.vaccines,
            "startDate": camp.start_date,
            "endDate": camp.end_date,
            "expectedDays": camp.expected_days,
            "status": camp.status,
            "createdAt": camp.created_at.isoformat() + "Z",
        }
        if camp
        else None
    )

    surveillance_locs = []
    for w in adv["allWoredas"]:
        if w["afpAlerts"] > 0 or w["aefiAlerts"] > 0:
            sev = "critical" if w["afpAlerts"] > 0 else "high"
            surveillance_locs.append(
                {
                    "zone": w["zone"],
                    "woreda": w["woreda"],
                    "afpAlerts": w["afpAlerts"],
                    "aefiAlerts": w["aefiAlerts"],
                    "zdGap": 0,
                    "uvGap": 0,
                    "severity": sev,
                    "latestDay": max(summary["availableDays"]) if summary["availableDays"] else None,
                }
            )

    return {
        "serverTimestamp": summary["serverTimestamp"],
        "cacheVersion": int(datetime.utcnow().timestamp()),
        "activeCampaign": active_campaign,
        "latestImport": summary["latestImport"],
        "availableDays": summary["availableDays"],
        "latestReportingDay": max(summary["availableDays"]) if summary["availableDays"] else None,
        "settings": summary["settings"],
        "kpis": summary["kpis"],
        "zones": summary["zones"],
        "dailyTrends": summary["dailyTrends"],
        "vaccinationPerformance": adv["vaccinationPerformance"],
        "ageGroups": adv["ageGroups"],
        "vaccineAccountability": adv["vaccineAccountability"],
        "integrationMetrics": adv["integrationMetrics"],
        "top10Woredas": adv["topWoredas"][:10],
        "bottom10Woredas": adv["criticalWoredas"][:10],
        "zoneVaccines": [
            {
                "zone": z["zone"],
                "nopv2Received": z["nopv2Received"],
                "nopv2Used": z["nopv2Used"],
                "nopv2WastagePct": _wastage_pct(z["nopv2Used"], z["nopv2Received"]),
                "bopvReceived": z["bopvReceived"],
                "bopvUsed": z["bopvUsed"],
                "bopvWastagePct": _wastage_pct(z["bopvUsed"], z["bopvReceived"]),
            }
            for z in summary["zones"]
        ],
        "surveillanceLocations": surveillance_locs,
        "woredaStatuses": [
            {
                "zone": w["zone"],
                "woreda": w["woreda"],
                "coveragePct": w["coveragePct"],
                "submitted": w["submitted"],
                "afpAlerts": w["afpAlerts"],
                "aefiAlerts": w["aefiAlerts"],
                "statusCategory": w["statusCategory"],
            }
            for w in adv["allWoredas"]
        ],
    }
