/** Guest vs free-account vs Pro. Guests browse; signup unlocks CRM/IOI/daily alerts; Pro is instant. */
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
  save: { title: 'Save to Vettr CRM', body: 'Sign up to save deals, run the calculator on saved listings, and track your pipeline.' },
  ioi: { title: 'Send indication of interest', body: 'Sign up to generate and send IOI emails from Vettr.' },
  notifications: { title: 'Get match alerts', body: 'Sign up for a daily email when new deals match your buy box. Instant alerts are Vettr Pro.' },
  default: { title: 'Create a free account', body: 'Sign up for full listings, broker contact, CRM, IOI, and daily match email.' },
};
export function getEntitlementsForUser(user) { return user ? LOGGED_IN_ENTITLEMENTS : GUEST_ENTITLEMENTS; }
export function getSignupCopy(reason) { return SIGNUP_COPY_BY_REASON[reason] || SIGNUP_COPY_BY_REASON.default; }
