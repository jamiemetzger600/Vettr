const HEADER_MAP = {
  company: 'company_name',
  company_name: 'company_name',
  business: 'company_name',
  name: 'company_name',
  owner: 'owner_name',
  owner_name: 'owner_name',
  contact: 'owner_name',
  email: 'email',
  title: 'title',
  role: 'title',
  location: 'location',
  city: 'location',
  notes: 'notes',
  note: 'notes',
  url: 'source_url',
  source_url: 'source_url',
  website: 'source_url'
};

function splitCsvLine(line) {
  const out = [];
  let cur = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"') {
        if (line[i + 1] === '"') {
          cur += '"';
          i += 1;
        } else {
          inQuotes = false;
        }
      } else {
        cur += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ',') {
      out.push(cur.trim());
      cur = '';
    } else {
      cur += ch;
    }
  }
  out.push(cur.trim());
  return out;
}

export function parseProspectCsv(text) {
  const raw = String(text || '').replace(/^\uFEFF/, '');
  const lines = raw.split(/\r?\n/).filter((l) => l.trim());
  if (lines.length < 2) return [];
  const headers = splitCsvLine(lines[0]).map((h) => HEADER_MAP[h.toLowerCase().replace(/\s+/g, '_')] || null);
  const rows = [];
  for (let i = 1; i < lines.length; i += 1) {
    const cols = splitCsvLine(lines[i]);
    const row = {};
    headers.forEach((key, idx) => {
      if (!key) return;
      const val = cols[idx] || '';
      if (val) row[key] = val;
    });
    if (row.company_name) rows.push(row);
  }
  return rows;
}

export function firstNameFrom(ownerName) {
  const part = String(ownerName || '').trim().split(/\s+/)[0] || '';
  return part;
}

export function mergeTemplate(template, vars) {
  return String(template || '').replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (_, key) => {
    const v = vars[key];
    return v == null ? '' : String(v);
  });
}

export function normalizeEmail(value) {
  const email = String(value || '').trim().toLowerCase();
  if (!email || !email.includes('@')) return null;
  return email;
}

export const DEFAULT_SEQUENCE_STEPS = [
  {
    delayDays: 0,
    subject: 'Quick question about {{company}}',
    bodyText:
      'Hi {{first_name}},\n\n'
      + 'I am researching {{vertical}} businesses{{geography_clause}} and {{company}} stood out.\n\n'
      + 'Would you be open to a short conversation about a potential acquisition?\n\n'
      + 'If you would rather not hear from me, reply STOP and I will not contact you again.\n\n'
      + '{{sender_name}}'
  }
];
