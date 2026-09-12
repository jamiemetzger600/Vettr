/** Central config for guest vs logged-in capabilities (4.3.x). */
export const GUEST_ENTITLEMENTS = {
  canBrowseDeals: true, canConfigureBuyBox: true, canSearchSortFilter: true, canHideDeals: true, canUseDealCalculator: true,
  previewCharLimit: 120, blurOverflow: true, clickToUnlockCopy: 'Sign up here for full access',
  brokerContactVisible: false, listingLinkEnabled: false, canSaveToMyDeals: false, canSendIOI: false,
  canAccessSettings: false, canAccessBilling: false, signupPath: '/register',
};
export const LOGGED_IN_ENTITLEMENTS = {
  ...GUEST_ENTITLEMENTS, previewCharLimit: null, blurOverflow: false, brokerContactVisible: true,
  listingLinkEnabled: true, canSaveToMyDeals: true, canSendIOI: true, canAccessSettings: true, canAccessBilling: true,
};
export const SIGNUP_COPY_BY_REASON = {
  description_click: { title: 'Read the full listing', body: 'Create a free account to read the full description and broker details.' },
  broker_click: { title: 'View broker contact', body: 'Sign up to see broker name, email, and phone for this listing.' },
  listing: { title: 'Open original listing', body: 'Sign up to open the listing on the source site.' },
  save: { title: 'Save to Vettr CRM', body: 'Sign up to save deals, sync calculator inputs, and track your pipeline.' },
  off_market: { title: 'Open Off Market', body: 'Sign up to research verticals, send outreach from your Gmail, and promote willing sellers into CRM.' },
  ioi: { title: 'Send indication of interest', body: 'Sign up to generate and send IOI emails from Vettr.' },
  notifications: { title: 'Get match alerts', body: 'Sign up to get notified when new deals match your buy box.' },
  default: { title: 'Create a free account', body: 'Sign up for full access to descriptions, broker contact, and saved deals.' },
};
export function getEntitlementsForUser(user) { return user ? LOGGED_IN_ENTITLEMENTS : GUEST_ENTITLEMENTS; }
export function getSignupCopy(reason) { return SIGNUP_COPY_BY_REASON[reason] || SIGNUP_COPY_BY_REASON.default; }
