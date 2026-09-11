import {
  isAllowedCorsOrigin,
  isVettrPagesOrigin,
  isVettrPagesPreviewOrigin,
  VETTR_PAGES_PROD_ORIGIN
} from './corsAllow.js';

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

const localOrigins = [
  'http://localhost:5173',
  'http://localhost:3000',
  'http://127.0.0.1:5173',
  'http://127.0.0.1:3000'
];

assert(isVettrPagesOrigin(VETTR_PAGES_PROD_ORIGIN), 'prod pages origin');
assert(!isVettrPagesPreviewOrigin(VETTR_PAGES_PROD_ORIGIN), 'prod is not a preview subdomain');

assert(isVettrPagesPreviewOrigin('https://staging.vettr.pages.dev'), 'staging preview');
assert(isVettrPagesPreviewOrigin('https://a1b2c3d4.vettr.pages.dev'), 'hash preview');
assert(
  isVettrPagesPreviewOrigin('https://cursor-p0-mobile-fixes-5781.vettr.pages.dev'),
  'named branch preview'
);
assert(!isVettrPagesPreviewOrigin('https://evil.com'), 'evil host not preview');
assert(!isVettrPagesPreviewOrigin('https://vettr.pages.dev.evil.com'), 'suffix attack');
assert(!isVettrPagesPreviewOrigin('http://staging.vettr.pages.dev'), 'http preview rejected');

assert(
  isAllowedCorsOrigin('https://vettr.pages.dev', { allowedOrigins: [] }),
  'prod allowed without WEB_APP_URL list'
);
assert(
  isAllowedCorsOrigin('https://staging.vettr.pages.dev', { allowedOrigins: [] }),
  'staging allowed'
);
assert(
  isAllowedCorsOrigin('https://deadbeef.vettr.pages.dev', { allowedOrigins: [] }),
  'hash preview allowed'
);
assert(
  isAllowedCorsOrigin('https://feature-mobile.vettr.pages.dev', { allowedOrigins: [] }),
  'named branch allowed'
);

for (const o of localOrigins) {
  assert(
    isAllowedCorsOrigin(o, { allowedOrigins: localOrigins }),
    `localhost allowed via list: ${o}`
  );
  assert(
    !isAllowedCorsOrigin(o, { allowedOrigins: [] }),
    `localhost denied without list: ${o}`
  );
}

assert(isAllowedCorsOrigin(null), 'missing origin allowed (non-browser)');
assert(isAllowedCorsOrigin(undefined), 'undefined origin allowed');
assert(
  isAllowedCorsOrigin('chrome-extension://abcdefghijklmnop'),
  'chrome extension allowed by default'
);
assert(
  !isAllowedCorsOrigin('chrome-extension://abcdefghijklmnop', { allowChromeExtension: false }),
  'chrome extension can be disabled'
);

assert(!isAllowedCorsOrigin('https://evil.com', { allowedOrigins: localOrigins }), 'evil.com denied');
assert(!isAllowedCorsOrigin('https://pages.dev', { allowedOrigins: [] }), 'bare pages.dev denied');
assert(
  !isAllowedCorsOrigin('https://not-vettr.pages.dev', { allowedOrigins: [] }),
  'other pages project denied'
);
assert(
  !isAllowedCorsOrigin('https://staging.vettr.pages.dev.attacker.test', { allowedOrigins: [] }),
  'spoofed suffix denied'
);

console.log('corsAllow ok');
