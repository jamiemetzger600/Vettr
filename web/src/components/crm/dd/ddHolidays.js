/**
 * US closure days for the diligence Gantt.
 * Federal Reserve holidays, plus religious and business days when banks,
 * law firms, courts, or businesses are commonly closed.
 * Saturday federal holidays are observed Friday; Sunday federal holidays Monday.
 * Religious dates stay on their own weekday — a weekend observance is omitted
 * so it is not drawn on the adjacent Friday.
 */

const DAY = 24 * 60 * 60 * 1000;

const BANK_WIDE = 'Banks, courts, and most businesses closed';
const BANK_FEDERAL = 'Banks and federal offices closed; many businesses stay open';
const MARKETS = 'Markets closed; many banks and law firms closed';
const BUSINESSES = 'Many businesses and law firms closed; banks usually open';
const LAW_FIRMS = 'Many law firms closed; banks open. Legal work can slip.';
const SOME_BUSINESSES = 'Some businesses closed. Local observance can fall a day earlier or later. Banks and most law firms stay open.';

const HEBREW_CLOSURES = new Map([
  ['tishri-1', 'Rosh Hashanah'],
  ['tishri-2', 'Rosh Hashanah'],
  ['tishri-10', 'Yom Kippur'],
  ['tishri-15', 'Sukkot'],
  ['tishri-16', 'Sukkot'],
  ['tishri-22', 'Shemini Atzeret'],
  ['tishri-23', 'Simchat Torah'],
  ['nisan-15', 'Passover'],
  ['nisan-16', 'Passover'],
  ['nisan-21', 'Passover'],
  ['nisan-22', 'Passover'],
  ['sivan-6', 'Shavuot'],
  ['sivan-7', 'Shavuot']
]);

const HEBREW_MONTH_NUMBER = {
  1: 'nisan',
  3: 'sivan',
  7: 'tishri'
};

const closureCache = new Map();
let hebrewFmt = null;
let islamicFmt = null;

function at(year, monthIndex, day) {
  return new Date(year, monthIndex, day).getTime();
}

function addCalendarDays(ms, days) {
  const date = new Date(ms);
  date.setDate(date.getDate() + days);
  return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
}

function nthWeekday(year, monthIndex, weekday, n) {
  const first = new Date(year, monthIndex, 1);
  const delta = (weekday - first.getDay() + 7) % 7;
  return at(year, monthIndex, 1 + delta + (n - 1) * 7);
}

function lastWeekday(year, monthIndex, weekday) {
  const last = new Date(year, monthIndex + 1, 0);
  const delta = (last.getDay() - weekday + 7) % 7;
  return at(year, monthIndex, last.getDate() - delta);
}

function observed(ms) {
  const date = new Date(ms);
  const day = date.getDay();
  if (day === 6) return ms - DAY;
  if (day === 0) return ms + DAY;
  return ms;
}

function holiday(name, ms, { note = '', weight = 'full', observeWeekend = true } = {}) {
  const date = new Date(ms);
  const weekday = date.getDay();
  if (!observeWeekend && (weekday === 0 || weekday === 6)) return null;
  const observedMs = observeWeekend ? observed(ms) : new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
  const shown = new Date(observedMs);
  const month = String(shown.getMonth() + 1).padStart(2, '0');
  const day = String(shown.getDate()).padStart(2, '0');
  return {
    name,
    note,
    weight,
    observedMs,
    observedOn: `${shown.getFullYear()}-${month}-${day}`
  };
}

/** Bank closings whose observed date falls in `year`, plus New Year's observed in the prior December. */
export function usBankHolidays(year) {
  const y = Number(year);
  return [
    holiday("New Year's Day", at(y, 0, 1), { note: BANK_WIDE }),
    holiday('Martin Luther King Jr. Day', nthWeekday(y, 0, 1, 3), { note: BANK_WIDE }),
    holiday("Presidents' Day", nthWeekday(y, 1, 1, 3), { note: BANK_FEDERAL }),
    holiday('Memorial Day', lastWeekday(y, 4, 1), { note: BANK_WIDE }),
    holiday('Juneteenth', at(y, 5, 19), { note: BANK_WIDE }),
    holiday('Independence Day', at(y, 6, 4), { note: BANK_WIDE }),
    holiday('Labor Day', nthWeekday(y, 8, 1, 1), { note: BANK_WIDE }),
    holiday('Columbus Day', nthWeekday(y, 9, 1, 2), { note: BANK_FEDERAL }),
    holiday('Veterans Day', at(y, 10, 11), { note: BANK_FEDERAL }),
    holiday('Thanksgiving', nthWeekday(y, 10, 4, 4), { note: BANK_WIDE }),
    holiday('Christmas Day', at(y, 11, 25), { note: BANK_WIDE })
  ];
}

/** Anonymous Gregorian computus. Returns local midnight of Easter Sunday. */
function easterSunday(year) {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return at(year, month - 1, day);
}

function businessClosures(year) {
  const y = Number(year);
  const thanksgiving = nthWeekday(y, 10, 4, 4);
  return [
    holiday('Good Friday', addCalendarDays(easterSunday(y), -2), { note: MARKETS }),
    holiday('Day after Thanksgiving', addCalendarDays(thanksgiving, 1), { note: BUSINESSES }),
    holiday('Christmas Eve', at(y, 11, 24), { note: BUSINESSES, observeWeekend: false }),
    holiday("New Year's Eve", at(y, 11, 31), { note: BUSINESSES, observeWeekend: false })
  ].filter(Boolean);
}

function formatter(calendar) {
  try {
    if (!Intl.supportedValuesOf('calendar').includes(calendar)) return null;
    return new Intl.DateTimeFormat(`en-u-ca-${calendar}`, {
      timeZone: 'UTC',
      year: 'numeric',
      month: 'numeric',
      day: 'numeric'
    });
  } catch (err) {
    console.warn('[ddHolidays] calendar unavailable', calendar, err);
    return null;
  }
}

function partsOf(fmt, utcMs) {
  const bag = {};
  for (const part of fmt.formatToParts(new Date(utcMs))) {
    if (part.type === 'month' || part.type === 'day' || part.type === 'year') bag[part.type] = part.value;
  }
  return bag;
}

function hebrewMonthKey(month) {
  const numeric = Number(month);
  if (Number.isFinite(numeric) && HEBREW_MONTH_NUMBER[numeric]) return HEBREW_MONTH_NUMBER[numeric];
  const name = String(month || '').toLowerCase().replace(/[^a-z]/g, '');
  if (name.startsWith('tishr')) return 'tishri';
  if (name.startsWith('nisan') || name.startsWith('nissan')) return 'nisan';
  if (name.startsWith('sivan') || name.startsWith('siwan')) return 'sivan';
  return '';
}

function islamicMonthNumber(month) {
  const numeric = Number(month);
  if (Number.isFinite(numeric) && numeric >= 1 && numeric <= 12) return numeric;
  const name = String(month || '').toLowerCase().replace(/[^a-z]/g, '');
  if (name.includes('shaw')) return 10;
  if (name.includes('hij')) return 12;
  return 0;
}

function religiousClosures(year) {
  const y = Number(year);
  if (!hebrewFmt) hebrewFmt = formatter('hebrew');
  if (!islamicFmt) islamicFmt = formatter('islamic-umalqura');
  if (!hebrewFmt && !islamicFmt) return [];

  const found = [];
  const start = Date.UTC(y, 0, 1);
  const end = Date.UTC(y + 1, 0, 1);
  for (let utc = start; utc < end; utc += DAY) {
    const stamp = new Date(utc);
    const monthIndex = stamp.getUTCMonth();
    const dayOfMonth = stamp.getUTCDate();
    const localMs = at(y, monthIndex, dayOfMonth);

    if (hebrewFmt) {
      const parts = partsOf(hebrewFmt, utc);
      const name = HEBREW_CLOSURES.get(`${hebrewMonthKey(parts.month)}-${Number(parts.day)}`);
      if (name) {
        const entry = holiday(name, localMs, { note: LAW_FIRMS, weight: 'partial', observeWeekend: false });
        if (entry) found.push(entry);
      }
    }

    if (islamicFmt) {
      const parts = partsOf(islamicFmt, utc);
      const islamicMonth = islamicMonthNumber(parts.month);
      const islamicDay = Number(parts.day);
      const name = (islamicMonth === 10 && islamicDay === 1) || (islamicMonth === 12 && islamicDay === 10)
        ? (islamicMonth === 10 ? 'Eid al-Fitr' : 'Eid al-Adha')
        : '';
      if (name) {
        const entry = holiday(name, localMs, { note: SOME_BUSINESSES, weight: 'partial', observeWeekend: false });
        if (entry) found.push(entry);
      }
    }
  }

  if (!found.length) console.warn('[ddHolidays] no religious closures found for', y);
  return found;
}

/** Federal, business, and religious closure days that fall in `year`. */
export function usClosureHolidays(year) {
  const y = Number(year);
  if (closureCache.has(y)) return closureCache.get(y);
  const list = [
    ...usBankHolidays(y),
    ...businessClosures(y),
    ...religiousClosures(y)
  ];
  closureCache.set(y, list);
  console.log('[ddHolidays] closures', y, list.map((entry) => `${entry.name} ${entry.observedOn} ${entry.weight}`));
  return list;
}
