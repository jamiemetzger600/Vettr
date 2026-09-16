/** Only this account can see or open the scrape Sources admin. */
export const SCRAPE_ADMIN_EMAIL = 'jamiemetzger@gmail.com';

export function isScrapeAdminEmail(email) {
  return String(email || '').trim().toLowerCase() === SCRAPE_ADMIN_EMAIL;
}
