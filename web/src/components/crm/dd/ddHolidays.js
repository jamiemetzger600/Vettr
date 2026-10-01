/**
 * US bank holidays: Federal Reserve closings.
 * Saturday holidays are observed Friday; Sunday holidays are observed Monday.
 */

const DAY = 24 * 60 * 60 * 1000;

function at(year, monthIndex, day) {
  return new Date(year, monthIndex, day).getTime();
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

function holiday(name, ms) {
  const observedMs = observed(ms);
  const date = new Date(observedMs);
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return {
    name,
    observedMs,
    observedOn: `${date.getFullYear()}-${month}-${day}`
  };
}

/** Bank closings whose observed date falls in `year`, plus New Year's observed in the prior December. */
export function usBankHolidays(year) {
  const y = Number(year);
  return [
    holiday("New Year's Day", at(y, 0, 1)),
    holiday('Martin Luther King Jr. Day', nthWeekday(y, 0, 1, 3)),
    holiday("Presidents' Day", nthWeekday(y, 1, 1, 3)),
    holiday('Memorial Day', lastWeekday(y, 4, 1)),
    holiday('Juneteenth', at(y, 5, 19)),
    holiday('Independence Day', at(y, 6, 4)),
    holiday('Labor Day', nthWeekday(y, 8, 1, 1)),
    holiday('Columbus Day', nthWeekday(y, 9, 1, 2)),
    holiday('Veterans Day', at(y, 10, 11)),
    holiday('Thanksgiving', nthWeekday(y, 10, 4, 4)),
    holiday('Christmas Day', at(y, 11, 25))
  ];
}
