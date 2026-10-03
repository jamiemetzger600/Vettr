export const CLOUD_PROVIDERS = ['google', 'dropbox', 'onedrive'];

export const QA_CATEGORIES = [
  'Financial',
  'HR',
  'SOP',
  'Legal',
  'Tax',
  'Operations',
  'Customers'
];

export const QA_SOURCES = ['seller', 'broker', 'internal'];

export function sanitizeCloudName(name, fallback = 'Deal') {
  const cleaned = String(name || '')
    .replace(/[\\/:*?"<>|]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 80);
  return cleaned || fallback;
}

export function normalizeQaCategory(value, groupName = '') {
  const raw = String(value || groupName || '').trim();
  const known = QA_CATEGORIES.find((category) => category.toLowerCase() === raw.toLowerCase());
  if (known) return known;
  const fromGroup = sanitizeCloudName(raw, '');
  return fromGroup || 'Operations';
}

export function normalizeQaSource(value) {
  const raw = String(value || 'seller').trim().toLowerCase();
  return QA_SOURCES.includes(raw) ? raw : 'seller';
}
