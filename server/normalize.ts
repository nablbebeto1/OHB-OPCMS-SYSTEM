const ZONE_SYNONYMS: Record<string, string> = {
  'south west shewa': 'South West Shewa',
  'north shoa': 'North Shewa',
  'north shewa': 'North Shewa',
  'east shewa': 'East Shewa',
  'west shewa': 'West Shewa',
  'arsi zone': 'Arsi Zone',
  'west arsi': 'West Arsi',
  'east wollega': 'East Wollega',
  'horro guduru wallaga': 'Horro Guduru Wallaga',
  'buno bedele': 'Buno Bedele',
  'jimma zone': 'Jimma Zone',
  'guji': 'Guji',
  'shaggar city': 'Shaggar City',
  'adama city': 'Adama City',
  'shashemene city': 'Shashemene City',
  'bishoftu city': 'Bishoftu City',
  'holeta town': 'Holeta Town',
  'ambotown': 'Ambo Town',
  'ambo town': 'Ambo Town',
  'sheno town': 'Sheno Town',
  'dodola town': 'Dodola Town',
  'jimma town': 'Jimma Town',
  'batu town': 'Batu Town',
  'asella': 'Asella Town',
  'asella town': 'Asella Town',
  'shakiso town': 'Shakiso Town',
  'agaro town': 'Agaro Town',
  'sendafa beke town': 'Sendafa Beke Town',
  'woliso town': 'Woliso Town',
  'modjo town': 'Modjo Town',
  'nekemte town': 'Nekemte Town',
};

const REGION_SYNONYMS: Record<string, string> = {
  oromia: 'Oromia',
  oromiya: 'Oromia',
};

export function normalizeRegion(raw: string | null | undefined): string {
  const cleaned = String(raw ?? '').trim();
  if (!cleaned) return 'Oromia';
  const key = cleaned.toLowerCase().replace(/\s+/g, ' ');
  return REGION_SYNONYMS[key] ?? titleCase(cleaned);
}

export function normalizeZone(raw: string | null | undefined): string {
  const cleaned = String(raw ?? '').trim();
  if (!cleaned) return '';
  const key = cleaned.toLowerCase().replace(/\s+/g, ' ');
  return ZONE_SYNONYMS[key] ?? titleCase(cleaned);
}

export function normalizeWoreda(raw: string | null | undefined): string {
  const cleaned = String(raw ?? '').trim().replace(/\s+/g, ' ');
  if (!cleaned) return '';
  const key = cleaned.toLowerCase();
  if (key === 'ambotown') return 'Ambo Town';
  if (key === 'dodola r') return 'Dodola Rural';
  return titleCase(cleaned);
}

function titleCase(str: string): string {
  return str
    .split(' ')
    .filter(Boolean)
    .map((word) => {
      if (word.includes("'")) {
        return word
          .split("'")
          .map((p) => (p ? p.charAt(0).toUpperCase() + p.slice(1) : ''))
          .join("'");
      }
      return word.charAt(0).toUpperCase() + word.slice(1);
    })
    .join(' ');
}

export function parseCampaignDay(raw: string | null | undefined): {
  label: string;
  dayNum: number | null;
} {
  const cleaned = String(raw ?? '').trim();
  if (!cleaned) return { label: '', dayNum: null };

  const match = cleaned.match(/(\d+)/);
  if (match) {
    const n = parseInt(match[1], 10);
    if (n >= 1 && n <= 14) {
      const suffix = n === 1 ? 'st' : n === 2 ? 'nd' : n === 3 ? 'rd' : 'th';
      return { label: `${n}${suffix} day`, dayNum: n };
    }
  }
  return { label: cleaned, dayNum: null };
}

export function classifyLocationType(
  canonicalZone: string
): 'Zone Woreda' | 'Town Administration' | 'City Sub-City' {
  const lower = canonicalZone.toLowerCase();
  if (lower.includes('city')) return 'City Sub-City';
  if (lower.includes('town')) return 'Town Administration';
  return 'Zone Woreda';
}
