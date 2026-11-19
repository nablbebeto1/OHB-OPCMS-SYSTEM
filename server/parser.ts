import * as XLSX from 'xlsx';
import type { ParsedCampaignRow, ValidationIssue } from '../src/types/opcms.ts';
import {
  normalizeRegion,
  normalizeWoreda,
  normalizeZone,
  parseCampaignDay,
} from './normalize.ts';

export type CanonicalField =
  | 'serialNo'
  | 'region'
  | 'zone'
  | 'woreda'
  | 'campaignDay'
  | 'reportDate'
  | 'totalPlannedTarget'
  | 'dailyTarget'
  | 'vacc0_11Before'
  | 'vacc0_11NotBefore'
  | 'vacc12_59Before'
  | 'vacc12_59NotBefore'
  | 'vacc60_120Before'
  | 'vacc60_120NotBefore'
  | 'totalVaccinated0_59'
  | 'dailyCoveredPct'
  | 'coveredFromTotalPct'
  | 'nopv2VialsReceived'
  | 'nopv2VialsUsed'
  | 'nopv2VialsPartiallyUsed'
  | 'nopv2VialsReturnedUnusedGood'
  | 'nopv2VialsBroken'
  | 'nopv2VialsReturnedBad'
  | 'nopv2VialsLost'
  | 'nopv2WastageRatePct'
  | 'bopvVialsReceived'
  | 'bopvVialsUsed'
  | 'bopvVialsPartiallyUsed'
  | 'bopvVialsReturnedUnusedGood'
  | 'bopvVialsBroken'
  | 'bopvVialsReturnedBad'
  | 'bopvVialsLost'
  | 'bopvWastageRatePct'
  | 'afpAlertsCount'
  | 'aefiAlertsCount'
  | 'smHhsVisited'
  | 'smGroupDiscussions'
  | 'smIpcReached'
  | 'zdIdentifiedLinked'
  | 'zdVaccinated'
  | 'uvIdentifiedLinked'
  | 'uvVaccinated'
  | 'teamsTotal'
  | 'teamsReported'
  | 'remarks';

const STANDARD_44_POSITIONAL_FIELDS: CanonicalField[] = [
  'serialNo',
  'region',
  'zone',
  'woreda',
  'campaignDay',
  'totalPlannedTarget',
  'dailyTarget',
  'vacc0_11Before',
  'vacc0_11NotBefore',
  'vacc12_59Before',
  'vacc12_59NotBefore',
  'vacc60_120Before',
  'vacc60_120NotBefore',
  'totalVaccinated0_59',
  'dailyCoveredPct',
  'coveredFromTotalPct',
  'nopv2VialsReceived',
  'nopv2VialsUsed',
  'nopv2VialsPartiallyUsed',
  'nopv2VialsReturnedUnusedGood',
  'nopv2VialsBroken',
  'nopv2VialsReturnedBad',
  'nopv2VialsLost',
  'nopv2WastageRatePct',
  'bopvVialsReceived',
  'bopvVialsUsed',
  'bopvVialsPartiallyUsed',
  'bopvVialsReturnedUnusedGood',
  'bopvVialsBroken',
  'bopvVialsReturnedBad',
  'bopvVialsLost',
  'bopvWastageRatePct',
  'afpAlertsCount',
  'aefiAlertsCount',
  'smHhsVisited',
  'smGroupDiscussions',
  'smIpcReached',
  'zdIdentifiedLinked',
  'zdVaccinated',
  'uvIdentifiedLinked',
  'uvVaccinated',
  'teamsTotal',
  'teamsReported',
  'remarks',
];

function cleanHeaderToken(val: unknown): string {
  return String(val ?? '')
    .replace(/\r?\n/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

function forwardFillRow(row: unknown[], width: number): string[] {
  const out: string[] = [];
  let last = '';
  for (let i = 0; i < width; i++) {
    const raw = cleanHeaderToken(row[i]);
    if (raw) {
      last = raw;
      out.push(raw);
    } else {
      out.push(last);
    }
  }
  return out;
}

function detectHeaderStructure(matrix: unknown[][]): {
  dataStartRow: number;
  headerRowsCount: number;
  detectedTemplate: string;
  colMap: Map<number, CanonicalField>;
  unexpectedColumns: string[];
} {
  let snRowIdx = -1;
  for (let r = 0; r < Math.min(matrix.length, 15); r++) {
    const row = matrix[r] ?? [];
    const firstFew = row.slice(0, 6).map(cleanHeaderToken);
    if (
      firstFew.some((t) => t === 's/n' || t === 'sn' || t === 'serial no') &&
      firstFew.some((t) => t.includes('woreda') || t.includes('zone'))
    ) {
      snRowIdx = r;
      break;
    }
  }

  if (snRowIdx === -1) {
    throw new Error(
      'Unable to locate reporting header row containing S/N, Zone, and Woreda columns.'
    );
  }

  // Determine how many header rows follow snRowIdx (usually 3 total: group row, subheader row, leaf row)
  let headerEndRow = snRowIdx;
  for (let r = snRowIdx + 1; r < Math.min(matrix.length, snRowIdx + 5); r++) {
    const row = matrix[r] ?? [];
    const c0 = cleanHeaderToken(row[0]);
    const c3 = cleanHeaderToken(row[3]);
    const joined = row.map(cleanHeaderToken).join(' ');
    const looksLikeData =
      (/^\d+$/.test(c0) && c3.length > 0) ||
      (c0 === '' && c3 === '' && cleanHeaderToken(row[1]) === 'total');
    if (looksLikeData) {
      break;
    }
    if (
      joined.includes('vaccinated before') ||
      joined.includes('total planned target') ||
      joined.includes('vials') ||
      joined.includes('hhs visited') ||
      joined.includes('zero dose')
    ) {
      headerEndRow = r;
    }
  }

  const headerRowsCount = headerEndRow - snRowIdx + 1;
  const maxCols = Math.max(
    ...matrix
      .slice(snRowIdx, headerEndRow + 1)
      .map((r) => (Array.isArray(r) ? r.length : 0)),
    44
  );

  // Build composite header descriptors per column
  const topGroupRow = forwardFillRow(matrix[snRowIdx] ?? [], maxCols);
  const subRow =
    headerRowsCount >= 2
      ? forwardFillRow(matrix[snRowIdx + 1] ?? [], maxCols)
      : new Array(maxCols).fill('');
  const leafRowRaw =
    headerRowsCount >= 3
      ? (matrix[snRowIdx + 2] ?? []).map(cleanHeaderToken)
      : (matrix[headerEndRow] ?? []).map(cleanHeaderToken);

  const colMap = new Map<number, CanonicalField>();
  const unexpectedColumns: string[] = [];

  for (let c = 0; c < maxCols; c++) {
    const top = cleanHeaderToken((matrix[snRowIdx] ?? [])[c]);
    const topFilled = topGroupRow[c] || '';
    const mid = cleanHeaderToken((matrix[snRowIdx + 1] ?? [])[c]);
    const midFilled = subRow[c] || '';
    const leaf = leafRowRaw[c] || '';
    const combined = `${topFilled} | ${midFilled} | ${leaf}`;
    const rawExact = `${top} ${mid} ${leaf}`.trim();

    let matched: CanonicalField | null = null;

    if (top === 's/n' || top === 'sn' || leaf === 's/n') matched = 'serialNo';
    else if (top === 'region' || leaf === 'region') matched = 'region';
    else if (top === 'zone' || leaf === 'zone') matched = 'zone';
    else if (top === 'woreda' || leaf === 'woreda') matched = 'woreda';
    else if (top.includes('campaign date') || leaf.includes('campaign date') || leaf === 'campaign day')
      matched = 'campaignDay';
    else if (rawExact === 'reporting date' || rawExact === 'report date')
      matched = 'reportDate';
    else if (combined.includes('total planned target')) matched = 'totalPlannedTarget';
    else if (combined.includes('daily target')) matched = 'dailyTarget';
    else if (midFilled.includes('0-11') && leaf.includes('not vaccinated'))
      matched = 'vacc0_11NotBefore';
    else if (midFilled.includes('0-11') && leaf.includes('vaccinated before'))
      matched = 'vacc0_11Before';
    else if (midFilled.includes('12-59') && leaf.includes('not vaccinated'))
      matched = 'vacc12_59NotBefore';
    else if (midFilled.includes('12-59') && leaf.includes('vaccinated before'))
      matched = 'vacc12_59Before';
    else if (midFilled.includes('60-120') && leaf.includes('not vaccinated'))
      matched = 'vacc60_120NotBefore';
    else if (midFilled.includes('60-120') && leaf.includes('vaccinated before'))
      matched = 'vacc60_120Before';
    else if (combined.includes('total vaccinated') && combined.includes('0-59'))
      matched = 'totalVaccinated0_59';
    else if (combined.includes('daily covered')) matched = 'dailyCoveredPct';
    else if (combined.includes('coverd from total') || combined.includes('covered from total'))
      matched = 'coveredFromTotalPct';
    else if (combined.includes('nopv2')) {
      if (combined.includes('recieved') || combined.includes('received'))
        matched = 'nopv2VialsReceived';
      else if (combined.includes('partially used')) matched = 'nopv2VialsPartiallyUsed';
      else if (combined.includes('vials used')) matched = 'nopv2VialsUsed';
      else if (combined.includes('unused')) matched = 'nopv2VialsReturnedUnusedGood';
      else if (combined.includes('broken')) matched = 'nopv2VialsBroken';
      else if (combined.includes('bad condition')) matched = 'nopv2VialsReturnedBad';
      else if (combined.includes('lost')) matched = 'nopv2VialsLost';
      else if (combined.includes('wastage rate')) matched = 'nopv2WastageRatePct';
    } else if (combined.includes('bopv')) {
      if (combined.includes('recieved') || combined.includes('received'))
        matched = 'bopvVialsReceived';
      else if (combined.includes('partially used')) matched = 'bopvVialsPartiallyUsed';
      else if (combined.includes('vials used')) matched = 'bopvVialsUsed';
      else if (combined.includes('unused')) matched = 'bopvVialsReturnedUnusedGood';
      else if (combined.includes('broken')) matched = 'bopvVialsBroken';
      else if (combined.includes('bad condition')) matched = 'bopvVialsReturnedBad';
      else if (combined.includes('lost')) matched = 'bopvVialsLost';
      else if (combined.includes('wastage rate')) matched = 'bopvWastageRatePct';
    } else if (
      (topFilled.includes('nopv2') || midFilled.includes('nopv2')) &&
      (mid.includes('wastage') || leaf.includes('wastage'))
    ) {
      matched = 'nopv2WastageRatePct';
    } else if (
      (topFilled.includes('bopv') || midFilled.includes('bopv')) &&
      (mid.includes('wastage') || leaf.includes('wastage'))
    ) {
      matched = 'bopvWastageRatePct';
    } else if (combined.includes('afp')) matched = 'afpAlertsCount';
    else if (combined.includes('aefi')) matched = 'aefiAlertsCount';
    else if (combined.includes('hhs visited') || combined.includes('households visited'))
      matched = 'smHhsVisited';
    else if (combined.includes('group discussion') || combined.includes('community meetings'))
      matched = 'smGroupDiscussions';
    else if (combined.includes('home to home') || combined.includes('interpersonal'))
      matched = 'smIpcReached';
    else if (combined.includes('zero dose') && combined.includes('identified'))
      matched = 'zdIdentifiedLinked';
    else if (combined.includes('zero dose') && combined.includes('vaccinated'))
      matched = 'zdVaccinated';
    else if (combined.includes('under vaccinated') && combined.includes('identified'))
      matched = 'uvIdentifiedLinked';
    else if (combined.includes('under vaccinated') && combined.includes('vaccinated'))
      matched = 'uvVaccinated';
    else if (combined.includes('vaccination team') && combined.includes('reported'))
      matched = 'teamsReported';
    else if (combined.includes('vaccination team')) matched = 'teamsTotal';
    else if (top.includes('remark') || leaf.includes('remark')) matched = 'remarks';

    // Handle flattened CSV headers
    if (!matched && headerRowsCount === 1) {
      if (top.includes('0-11') && top.includes('not')) matched = 'vacc0_11NotBefore';
      else if (top.includes('0-11') && top.includes('before')) matched = 'vacc0_11Before';
      else if (top.includes('12-59') && top.includes('not')) matched = 'vacc12_59NotBefore';
      else if (top.includes('12-59') && top.includes('before')) matched = 'vacc12_59Before';
      else if (top.includes('60-120') && top.includes('not')) matched = 'vacc60_120NotBefore';
      else if (top.includes('60-120') && top.includes('before')) matched = 'vacc60_120Before';
    }

    // Fallback positional mapping if this matches the exact 44-column Oromia template
    if (!matched && c < STANDARD_44_POSITIONAL_FIELDS.length && maxCols >= 43) {
      const candidate = STANDARD_44_POSITIONAL_FIELDS[c];
      if (!Array.from(colMap.values()).includes(candidate)) {
        matched = candidate;
      }
    }

    if (matched) {
      colMap.set(c, matched);
    } else if (rawExact.length > 0) {
      unexpectedColumns.push(rawExact);
    }
  }

  // Ensure wastage columns after nOPV2 and bOPV are assigned cleanly
  if (colMap.size >= 43 && !Array.from(colMap.values()).includes('nopv2WastageRatePct')) {
    colMap.set(23, 'nopv2WastageRatePct');
  }
  if (colMap.size >= 43 && !Array.from(colMap.values()).includes('bopvWastageRatePct')) {
    colMap.set(31, 'bopvWastageRatePct');
  }

  const titleBanner = cleanHeaderToken((matrix[0] ?? []).join(' '));
  const detectedTemplate =
    titleBanner.includes('nopv2') || titleBanner.includes('bopv')
      ? 'Oromia Region Round 1 nOPV2 & bOPV2 SIA Daily Administrative Report'
      : headerRowsCount >= 3
        ? 'Oromia Multi-Row SIA Daily Administrative Template'
        : 'Oromia Flattened SIA Administrative CSV/Excel';

  return {
    dataStartRow: headerEndRow + 1,
    headerRowsCount,
    detectedTemplate,
    colMap,
    unexpectedColumns,
  };
}

function parseIntCell(
  val: unknown,
  rowNumber: number,
  field: string,
  issues: ValidationIssue[],
  nullable = false
): number | null {
  if (val === null || val === undefined) return nullable ? null : 0;
  const s = String(val).trim();
  if (s === '' || s === '-' || s === 'N/A' || s === 'NA') {
    return nullable ? null : 0;
  }
  const cleaned = s.replace(/,/g, '').replace(/\s+/g, '');
  if (!/^-?\d+(\.\d+)?$/.test(cleaned)) {
    issues.push({
      rowNumber,
      field,
      severity: 'error',
      code: 'INVALID_NUMBER',
      message: `Invalid numeric value "${s}" in ${field}.`,
    });
    return nullable ? null : 0;
  }
  const num = Math.round(Number(cleaned));
  if (num < 0) {
    issues.push({
      rowNumber,
      field,
      severity: 'error',
      code: 'NEGATIVE_VALUE',
      message: `Negative value (${num}) is not permitted in ${field}.`,
    });
  }
  return num;
}

function parsePctCell(
  val: unknown,
  rowNumber: number,
  field: string,
  issues: ValidationIssue[]
): number | null {
  if (val === null || val === undefined) return null;
  const s = String(val).trim();
  if (s === '' || s === '-' || s === '#DIV/0!' || s === 'N/A') return null;
  const cleaned = s.replace(/%/g, '').replace(/,/g, '').trim();
  if (!/^-?\d+(\.\d+)?$/.test(cleaned)) {
    issues.push({
      rowNumber,
      field,
      severity: 'warning',
      code: 'INVALID_PERCENT',
      message: `Non-numeric percentage "${s}" in ${field}; will recalculate from counts.`,
    });
    return null;
  }
  let num = Number(cleaned);
  // Excel percentages stored as decimals (e.g., 0.85 for 85%)
  if (typeof val === 'number' && val > 0 && val <= 1 && !s.includes('%')) {
    num = Math.round(val * 10000) / 100;
  }
  return Math.round(num * 100) / 100;
}

export interface ParseResult {
  detectedTemplate: string;
  headerRowsDetected: number;
  unexpectedColumns: string[];
  totalSummaryRowsSkipped: number;
  rows: ParsedCampaignRow[];
  issues: ValidationIssue[];
}

export function parseCampaignSpreadsheet(
  buffer: Buffer,
  filename: string
): ParseResult {
  const wb = XLSX.read(buffer, { type: 'buffer', raw: false });
  const sheetName = wb.SheetNames[0];
  if (!sheetName) {
    throw new Error(`Uploaded file "${filename}" contains no worksheets.`);
  }
  const sheet = wb.Sheets[sheetName];
  const matrix = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
    header: 1,
    defval: '',
    blankrows: false,
  });

  if (matrix.length < 2) {
    throw new Error(`Uploaded file "${filename}" does not contain enough rows.`);
  }

  const {
    dataStartRow,
    headerRowsCount,
    detectedTemplate,
    colMap,
    unexpectedColumns,
  } = detectHeaderStructure(matrix);

  // Build reverse map from CanonicalField -> column index
  const fieldToCol = new Map<CanonicalField, number>();
  for (const [colIdx, field] of colMap.entries()) {
    if (!fieldToCol.has(field)) {
      fieldToCol.set(field, colIdx);
    }
  }

  const getCell = (row: unknown[], field: CanonicalField): unknown => {
    const idx = fieldToCol.get(field);
    return idx !== undefined ? row[idx] : '';
  };

  const parsedRows: ParsedCampaignRow[] = [];
  const allIssues: ValidationIssue[] = [];
  let totalSummaryRowsSkipped = 0;
  let lastCarriedZone = '';
  let lastCarriedRegion = 'Oromia';

  for (let r = dataStartRow; r < matrix.length; r++) {
    const row = matrix[r] ?? [];
    const excelRowNum = r + 1;

    const nonEmptyCount = row.filter((c) => String(c ?? '').trim() !== '').length;
    if (nonEmptyCount === 0) continue;

    const rawSerial = String(getCell(row, 'serialNo') ?? '').trim();
    const rawRegion = String(getCell(row, 'region') ?? '').trim();
    const rawZone = String(getCell(row, 'zone') ?? '').trim();
    const rawWoreda = String(getCell(row, 'woreda') ?? '').trim();

    // Detect and skip Total / Grand Total summary rows
    const isTotalRow =
      rawRegion.toLowerCase() === 'total' ||
      rawRegion.toLowerCase() === 'grand total' ||
      rawZone.toLowerCase() === 'total' ||
      rawWoreda.toLowerCase() === 'total' ||
      rawSerial.toLowerCase() === 'total' ||
      (rawSerial === '' && rawWoreda === '' && rawZone === '' && nonEmptyCount > 1);

    if (isTotalRow) {
      totalSummaryRowsSkipped++;
      continue;
    }

    const rowIssues: ValidationIssue[] = [];

    // Carry forward Zone & Region if blank within reporting group
    const effectiveRawRegion = rawRegion || lastCarriedRegion;
    if (rawRegion) lastCarriedRegion = rawRegion;

    const effectiveRawZone = rawZone || lastCarriedZone;
    if (rawZone) lastCarriedZone = rawZone;

    const canonicalRegion = normalizeRegion(effectiveRawRegion);
    const canonicalZone = normalizeZone(effectiveRawZone);
    const canonicalWoreda = normalizeWoreda(rawWoreda);

    if (!canonicalZone) {
      rowIssues.push({
        rowNumber: excelRowNum,
        field: 'zone',
        severity: 'error',
        code: 'MISSING_ZONE',
        message: 'Zone is missing and could not be carried forward from previous row.',
      });
    }
    if (!canonicalWoreda) {
      rowIssues.push({
        rowNumber: excelRowNum,
        field: 'woreda',
        severity: 'error',
        code: 'MISSING_WOREDA',
        message: 'Woreda / Town Administration name is missing.',
      });
    }

    const rawDay = String(getCell(row, 'campaignDay') ?? '').trim();
    const parsedDay = parseCampaignDay(rawDay);
    if (!parsedDay.dayNum) {
      rowIssues.push({
        rowNumber: excelRowNum,
        field: 'campaignDay',
        severity: 'error',
        code: 'MISSING_OR_INVALID_DAY',
        message: `Campaign Date/Day "${rawDay || '(blank)'}" must specify day number (e.g. 1st day, 2nd day, 3rd day, 4th day).`,
      });
    }

    const rawReportDate = String(getCell(row, 'reportDate') ?? '').trim() || null;

    const serialNo = rawSerial && /^\d+$/.test(rawSerial) ? parseInt(rawSerial, 10) : null;

    const totalPlannedTarget = parseIntCell(getCell(row, 'totalPlannedTarget'), excelRowNum, 'totalPlannedTarget', rowIssues) ?? 0;
    const dailyTarget = parseIntCell(getCell(row, 'dailyTarget'), excelRowNum, 'dailyTarget', rowIssues) ?? 0;
    const vacc0_11Before = parseIntCell(getCell(row, 'vacc0_11Before'), excelRowNum, 'vacc0_11Before', rowIssues) ?? 0;
    const vacc0_11NotBefore = parseIntCell(getCell(row, 'vacc0_11NotBefore'), excelRowNum, 'vacc0_11NotBefore', rowIssues) ?? 0;
    const vacc12_59Before = parseIntCell(getCell(row, 'vacc12_59Before'), excelRowNum, 'vacc12_59Before', rowIssues) ?? 0;
    const vacc12_59NotBefore = parseIntCell(getCell(row, 'vacc12_59NotBefore'), excelRowNum, 'vacc12_59NotBefore', rowIssues) ?? 0;
    const vacc60_120Before = parseIntCell(getCell(row, 'vacc60_120Before'), excelRowNum, 'vacc60_120Before', rowIssues) ?? 0;
    const vacc60_120NotBefore = parseIntCell(getCell(row, 'vacc60_120NotBefore'), excelRowNum, 'vacc60_120NotBefore', rowIssues) ?? 0;

    const rawTotal0_59 = parseIntCell(getCell(row, 'totalVaccinated0_59'), excelRowNum, 'totalVaccinated0_59', rowIssues) ?? 0;
    const computed0_59 = vacc0_11Before + vacc0_11NotBefore + vacc12_59Before + vacc12_59NotBefore;
    if (rawTotal0_59 > 0 && computed0_59 > 0 && rawTotal0_59 !== computed0_59) {
      rowIssues.push({
        rowNumber: excelRowNum,
        field: 'totalVaccinated0_59',
        severity: 'warning',
        code: 'TOTAL_MISMATCH_0_59',
        message: `Reported 0-59m total (${rawTotal0_59}) differs from age-group sum (${computed0_59}). Preserving source figure and flagging.`,
      });
    }
    const totalVaccinated0_59 = rawTotal0_59 > 0 ? rawTotal0_59 : computed0_59;

    const dailyCoveredPct = parsePctCell(getCell(row, 'dailyCoveredPct'), excelRowNum, 'dailyCoveredPct', rowIssues);
    const coveredFromTotalPct = parsePctCell(getCell(row, 'coveredFromTotalPct'), excelRowNum, 'coveredFromTotalPct', rowIssues);

    // nOPV2 utilization (nullable to distinguish missing stock info from explicit 0)
    const nopv2VialsReceived = parseIntCell(getCell(row, 'nopv2VialsReceived'), excelRowNum, 'nopv2VialsReceived', rowIssues, true);
    const nopv2VialsUsed = parseIntCell(getCell(row, 'nopv2VialsUsed'), excelRowNum, 'nopv2VialsUsed', rowIssues, true);
    const nopv2VialsPartiallyUsed = parseIntCell(getCell(row, 'nopv2VialsPartiallyUsed'), excelRowNum, 'nopv2VialsPartiallyUsed', rowIssues, true);
    const nopv2VialsReturnedUnusedGood = parseIntCell(getCell(row, 'nopv2VialsReturnedUnusedGood'), excelRowNum, 'nopv2VialsReturnedUnusedGood', rowIssues, true);
    const nopv2VialsBroken = parseIntCell(getCell(row, 'nopv2VialsBroken'), excelRowNum, 'nopv2VialsBroken', rowIssues, true);
    const nopv2VialsReturnedBad = parseIntCell(getCell(row, 'nopv2VialsReturnedBad'), excelRowNum, 'nopv2VialsReturnedBad', rowIssues, true);
    const nopv2VialsLost = parseIntCell(getCell(row, 'nopv2VialsLost'), excelRowNum, 'nopv2VialsLost', rowIssues, true);
    const nopv2WastageRatePct = parsePctCell(getCell(row, 'nopv2WastageRatePct'), excelRowNum, 'nopv2WastageRatePct', rowIssues);

    // bOPV utilization
    const bopvVialsReceived = parseIntCell(getCell(row, 'bopvVialsReceived'), excelRowNum, 'bopvVialsReceived', rowIssues, true);
    const bopvVialsUsed = parseIntCell(getCell(row, 'bopvVialsUsed'), excelRowNum, 'bopvVialsUsed', rowIssues, true);
    const bopvVialsPartiallyUsed = parseIntCell(getCell(row, 'bopvVialsPartiallyUsed'), excelRowNum, 'bopvVialsPartiallyUsed', rowIssues, true);
    const bopvVialsReturnedUnusedGood = parseIntCell(getCell(row, 'bopvVialsReturnedUnusedGood'), excelRowNum, 'bopvVialsReturnedUnusedGood', rowIssues, true);
    const bopvVialsBroken = parseIntCell(getCell(row, 'bopvVialsBroken'), excelRowNum, 'bopvVialsBroken', rowIssues, true);
    const bopvVialsReturnedBad = parseIntCell(getCell(row, 'bopvVialsReturnedBad'), excelRowNum, 'bopvVialsReturnedBad', rowIssues, true);
    const bopvVialsLost = parseIntCell(getCell(row, 'bopvVialsLost'), excelRowNum, 'bopvVialsLost', rowIssues, true);
    const bopvWastageRatePct = parsePctCell(getCell(row, 'bopvWastageRatePct'), excelRowNum, 'bopvWastageRatePct', rowIssues);

    const afpAlertsCount = parseIntCell(getCell(row, 'afpAlertsCount'), excelRowNum, 'afpAlertsCount', rowIssues) ?? 0;
    const aefiAlertsCount = parseIntCell(getCell(row, 'aefiAlertsCount'), excelRowNum, 'aefiAlertsCount', rowIssues) ?? 0;

    const smHhsVisited = parseIntCell(getCell(row, 'smHhsVisited'), excelRowNum, 'smHhsVisited', rowIssues) ?? 0;
    const smGroupDiscussions = parseIntCell(getCell(row, 'smGroupDiscussions'), excelRowNum, 'smGroupDiscussions', rowIssues) ?? 0;
    const smIpcReached = parseIntCell(getCell(row, 'smIpcReached'), excelRowNum, 'smIpcReached', rowIssues) ?? 0;

    const zdIdentifiedLinked = parseIntCell(getCell(row, 'zdIdentifiedLinked'), excelRowNum, 'zdIdentifiedLinked', rowIssues) ?? 0;
    const zdVaccinated = parseIntCell(getCell(row, 'zdVaccinated'), excelRowNum, 'zdVaccinated', rowIssues) ?? 0;

    const uvIdentifiedLinked = parseIntCell(getCell(row, 'uvIdentifiedLinked'), excelRowNum, 'uvIdentifiedLinked', rowIssues) ?? 0;
    const uvVaccinated = parseIntCell(getCell(row, 'uvVaccinated'), excelRowNum, 'uvVaccinated', rowIssues) ?? 0;

    const teamsTotal = parseIntCell(getCell(row, 'teamsTotal'), excelRowNum, 'teamsTotal', rowIssues) ?? 0;
    const teamsReported = parseIntCell(getCell(row, 'teamsReported'), excelRowNum, 'teamsReported', rowIssues) ?? 0;
    const remarks = String(getCell(row, 'remarks') ?? '').trim();

    if (totalPlannedTarget > 0 && totalVaccinated0_59 > totalPlannedTarget) {
      rowIssues.push({
        rowNumber: excelRowNum,
        field: 'totalVaccinated0_59',
        severity: 'warning',
        code: 'EXCEEDS_PLANNED_TARGET',
        message: `Vaccinated 0-59m (${totalVaccinated0_59}) exceeds planned target (${totalPlannedTarget}).`,
      });
    }
    if (zdVaccinated > zdIdentifiedLinked && zdIdentifiedLinked > 0) {
      rowIssues.push({
        rowNumber: excelRowNum,
        field: 'zdVaccinated',
        severity: 'warning',
        code: 'ZD_VACC_EXCEEDS_IDENTIFIED',
        message: `Zero-dose vaccinated (${zdVaccinated}) exceeds identified (${zdIdentifiedLinked}).`,
      });
    }
    if (teamsTotal > 0 && teamsReported > teamsTotal) {
      rowIssues.push({
        rowNumber: excelRowNum,
        field: 'teamsReported',
        severity: 'warning',
        code: 'TEAMS_REPORTED_EXCEEDS_TOTAL',
        message: `Teams reported (${teamsReported}) exceeds total teams (${teamsTotal}).`,
      });
    }

    const hasReportedActivity =
      totalVaccinated0_59 > 0 ||
      vacc60_120Before + vacc60_120NotBefore > 0 ||
      (nopv2VialsUsed ?? 0) > 0 ||
      (bopvVialsUsed ?? 0) > 0 ||
      (nopv2VialsReceived ?? 0) > 0 ||
      (bopvVialsReceived ?? 0) > 0 ||
      teamsReported > 0 ||
      smHhsVisited > 0 ||
      smGroupDiscussions > 0 ||
      smIpcReached > 0 ||
      afpAlertsCount > 0 ||
      aefiAlertsCount > 0 ||
      zdIdentifiedLinked > 0 ||
      uvIdentifiedLinked > 0;

    const hasError = rowIssues.some((i) => i.severity === 'error');
    const hasWarning = rowIssues.some((i) => i.severity === 'warning');

    allIssues.push(...rowIssues);

    parsedRows.push({
      rowNumber: excelRowNum,
      serialNo,
      rawRegion: effectiveRawRegion || 'Oromia',
      rawZone: effectiveRawZone,
      rawWoreda,
      canonicalRegion,
      canonicalZone,
      canonicalWoreda,
      campaignDayLabel: parsedDay.label || rawDay,
      campaignDayNum: parsedDay.dayNum,
      reportDate: rawReportDate,
      totalPlannedTarget,
      dailyTarget,
      vacc0_11Before,
      vacc0_11NotBefore,
      vacc12_59Before,
      vacc12_59NotBefore,
      vacc60_120Before,
      vacc60_120NotBefore,
      totalVaccinated0_59,
      dailyCoveredPct,
      coveredFromTotalPct,
      nopv2VialsReceived,
      nopv2VialsUsed,
      nopv2VialsPartiallyUsed,
      nopv2VialsReturnedUnusedGood,
      nopv2VialsBroken,
      nopv2VialsReturnedBad,
      nopv2VialsLost,
      nopv2WastageRatePct,
      bopvVialsReceived,
      bopvVialsUsed,
      bopvVialsPartiallyUsed,
      bopvVialsReturnedUnusedGood,
      bopvVialsBroken,
      bopvVialsReturnedBad,
      bopvVialsLost,
      bopvWastageRatePct,
      afpAlertsCount,
      aefiAlertsCount,
      smHhsVisited,
      smGroupDiscussions,
      smIpcReached,
      zdIdentifiedLinked,
      zdVaccinated,
      uvIdentifiedLinked,
      uvVaccinated,
      teamsTotal,
      teamsReported,
      remarks,
      hasReportedActivity,
      rowStatus: hasError ? 'error' : hasWarning ? 'warning' : 'valid',
      issues: rowIssues,
    });
  }

  return {
    detectedTemplate,
    headerRowsDetected: headerRowsCount,
    unexpectedColumns,
    totalSummaryRowsSkipped,
    rows: parsedRows,
    issues: allIssues,
  };
}
