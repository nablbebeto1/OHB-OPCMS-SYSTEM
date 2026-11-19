import io
import re
from typing import Any, Dict, List, Optional, Tuple
import openpyxl
import pandas as pd


ZONE_SYNONYMS = {
    "south west shewa": "South West Shewa",
    "north shoa": "North Shewa",
    "north shewa": "North Shewa",
    "east shewa": "East Shewa",
    "west shewa": "West Shewa",
    "arsi zone": "Arsi Zone",
    "west arsi": "West Arsi",
    "east wollega": "East Wollega",
    "horro guduru wallaga": "Horro Guduru Wallaga",
    "buno bedele": "Buno Bedele",
    "jimma zone": "Jimma Zone",
    "guji": "Guji",
    "shaggar city": "Shaggar City",
    "adama city": "Adama City",
    "shashemene city": "Shashemene City",
    "bishoftu city": "Bishoftu City",
    "holeta town": "Holeta Town",
    "ambotown": "Ambo Town",
    "ambo town": "Ambo Town",
    "asella": "Asella Town",
}

REGION_SYNONYMS = {"oromia": "Oromia", "oromiya": "Oromia"}


def normalize_zone(raw: Optional[str]) -> str:
    cleaned = re.sub(r"\s+", " ", (raw or "").strip())
    if not cleaned:
        return ""
    return ZONE_SYNONYMS.get(cleaned.lower(), cleaned.title())


def normalize_woreda(raw: Optional[str]) -> str:
    cleaned = re.sub(r"\s+", " ", (raw or "").strip())
    if not cleaned:
        return ""
    if cleaned.lower() == "ambotown":
        return "Ambo Town"
    if cleaned.lower() == "dodola r":
        return "Dodola Rural"
    return cleaned.title()


def parse_campaign_day(raw: Optional[str]) -> Tuple[str, Optional[int]]:
    cleaned = (raw or "").strip()
    m = re.search(r"(\d+)", cleaned)
    if m:
        n = int(m.group(1))
        if 1 <= n <= 14:
            suffix = {1: "st", 2: "nd", 3: "rd"}.get(n, "th")
            return f"{n}{suffix} day", n
    return cleaned, None


def _to_int(val: Any, nullable: bool = False) -> Optional[int]:
    if val is None or (isinstance(val, float) and pd.isna(val)):
        return None if nullable else 0
    s = str(val).strip().replace(",", "")
    if s in ("", "-", "N/A", "NA"):
        return None if nullable else 0
    return int(round(float(s)))


def _to_pct(val: Any) -> Optional[float]:
    if val is None or (isinstance(val, float) and pd.isna(val)):
        return None
    s = str(val).strip().replace("%", "").replace(",", "")
    if s in ("", "-", "#DIV/0!", "N/A"):
        return None
    num = float(s)
    if isinstance(val, float) and 0 < val <= 1 and "%" not in str(val):
        num = num * 100.0
    return round(num, 2)


def parse_campaign_file(content: bytes, filename: str) -> Dict[str, Any]:
    """Parses Oromia Round 1 nOPV2/bOPV2 multi-row header Excel (.xlsx) or CSV (.csv)."""
    ext = filename.lower().rsplit(".", 1)[-1]
    matrix: List[List[Any]] = []

    if ext == "xlsx":
        wb = openpyxl.load_workbook(io.BytesIO(content), data_only=True)
        ws = wb.active
        for row in ws.iter_rows(values_only=True):
            matrix.append(list(row))
    elif ext == "csv":
        df = pd.read_csv(io.BytesIO(content), header=None, keep_default_na=False)
        matrix = df.values.tolist()
    else:
        raise ValueError("Unsupported file format. Upload .xlsx or .csv.")

    # Locate S/N header row
    sn_idx = -1
    for i, row in enumerate(matrix[:15]):
        tokens = [str(c or "").strip().lower() for c in row[:6]]
        if any(t in ("s/n", "sn", "serial no") for t in tokens) and any(
            "woreda" in t or "zone" in t for t in tokens
        ):
            sn_idx = i
            break

    if sn_idx == -1:
        raise ValueError("Unable to locate S/N, Zone, and Woreda header row.")

    data_start = sn_idx + 1
    for r in range(sn_idx + 1, min(len(matrix), sn_idx + 5)):
        c0 = str(matrix[r][0] or "").strip()
        c3 = str(matrix[r][3] if len(matrix[r]) > 3 else "").strip()
        if c0.isdigit() and c3:
            data_start = r
            break
        data_start = r + 1

    rows: List[Dict[str, Any]] = []
    issues: List[Dict[str, Any]] = []
    skipped_total_rows = 0
    last_zone = ""
    last_region = "Oromia"

    for idx in range(data_start, len(matrix)):
        row = matrix[idx]
        if not any(str(c or "").strip() for c in row):
            continue

        def col(i: int) -> Any:
            return row[i] if i < len(row) else None

        raw_sn = str(col(0) or "").strip()
        raw_region = str(col(1) or "").strip()
        raw_zone = str(col(2) or "").strip()
        raw_woreda = str(col(3) or "").strip()

        if (
            raw_region.lower() in ("total", "grand total")
            or raw_zone.lower() == "total"
            or raw_woreda.lower() == "total"
            or (not raw_sn and not raw_woreda and not raw_zone)
        ):
            skipped_total_rows += 1
            continue

        if raw_region:
            last_region = raw_region
        else:
            raw_region = last_region

        if raw_zone:
            last_zone = raw_zone
        else:
            raw_zone = last_zone

        canon_zone = normalize_zone(raw_zone)
        canon_woreda = normalize_woreda(raw_woreda)
        day_label, day_num = parse_campaign_day(str(col(4) or ""))

        if not canon_zone or not canon_woreda or not day_num:
            issues.append(
                {
                    "row_number": idx + 1,
                    "severity": "error",
                    "message": "Missing Zone, Woreda, or valid Campaign Day.",
                }
            )
            continue

        total_0_59 = _to_int(col(13)) or 0
        computed_0_59 = (
            (_to_int(col(7)) or 0)
            + (_to_int(col(8)) or 0)
            + (_to_int(col(9)) or 0)
            + (_to_int(col(10)) or 0)
        )
        if total_0_59 == 0 and computed_0_59 > 0:
            total_0_59 = computed_0_59

        rows.append(
            {
                "row_number": idx + 1,
                "serial_no": int(raw_sn) if raw_sn.isdigit() else None,
                "raw_region": raw_region,
                "raw_zone": raw_zone,
                "raw_woreda": raw_woreda,
                "canonical_region": REGION_SYNONYMS.get(raw_region.lower(), "Oromia"),
                "canonical_zone": canon_zone,
                "canonical_woreda": canon_woreda,
                "campaign_day_label": day_label,
                "campaign_day_num": day_num,
                "total_planned_target": _to_int(col(5)) or 0,
                "daily_target": _to_int(col(6)) or 0,
                "vacc_0_11_before": _to_int(col(7)) or 0,
                "vacc_0_11_not_before": _to_int(col(8)) or 0,
                "vacc_12_59_before": _to_int(col(9)) or 0,
                "vacc_12_59_not_before": _to_int(col(10)) or 0,
                "vacc_60_120_before": _to_int(col(11)) or 0,
                "vacc_60_120_not_before": _to_int(col(12)) or 0,
                "total_vaccinated_0_59": total_0_59,
                "daily_covered_pct": _to_pct(col(14)) or 0.0,
                "covered_from_total_pct": _to_pct(col(15)) or 0.0,
                "nopv2_vials_received": _to_int(col(16), nullable=True),
                "nopv2_vials_used": _to_int(col(17), nullable=True),
                "nopv2_vials_partially_used": _to_int(col(18), nullable=True),
                "nopv2_vials_returned_unused_good": _to_int(col(19), nullable=True),
                "nopv2_vials_broken": _to_int(col(20), nullable=True),
                "nopv2_vials_returned_bad": _to_int(col(21), nullable=True),
                "nopv2_vials_lost": _to_int(col(22), nullable=True),
                "nopv2_wastage_rate_pct": _to_pct(col(23)),
                "bopv_vials_received": _to_int(col(24), nullable=True),
                "bopv_vials_used": _to_int(col(25), nullable=True),
                "bopv_vials_partially_used": _to_int(col(26), nullable=True),
                "bopv_vials_returned_unused_good": _to_int(col(27), nullable=True),
                "bopv_vials_broken": _to_int(col(28), nullable=True),
                "bopv_vials_returned_bad": _to_int(col(29), nullable=True),
                "bopv_vials_lost": _to_int(col(30), nullable=True),
                "bopv_wastage_rate_pct": _to_pct(col(31)),
                "afp_alerts_count": _to_int(col(32)) or 0,
                "aefi_alerts_count": _to_int(col(33)) or 0,
                "sm_hhs_visited": _to_int(col(34)) or 0,
                "sm_group_discussions": _to_int(col(35)) or 0,
                "sm_ipc_reached": _to_int(col(36)) or 0,
                "zd_identified_linked": _to_int(col(37)) or 0,
                "zd_vaccinated": _to_int(col(38)) or 0,
                "uv_identified_linked": _to_int(col(39)) or 0,
                "uv_vaccinated": _to_int(col(40)) or 0,
                "teams_total": _to_int(col(41)) or 0,
                "teams_reported": _to_int(col(42)) or 0,
                "remarks": str(col(43) or "").strip(),
            }
        )

    return {
        "header_rows_detected": data_start - sn_idx,
        "total_summary_rows_skipped": skipped_total_rows,
        "rows": rows,
        "issues": issues,
    }
