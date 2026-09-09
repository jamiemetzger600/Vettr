/**
 * Production defaults for Vettr cloud sync (extension login + API).
 * Dev overrides via web session push or localhost in extension-auth.
 */
(function (global) {
  'use strict';

  var PROD_WEB_APP_URL = 'https://vettr.pages.dev';
  // Stable Worker proxy (Pages VITE_API_URL). Never bake a trycloudflare.com URL here.
  var PROD_API_BASE_URL = 'https://vettr-api.metzgerbuildsthings.workers.dev/api';
  var DEV_WEB_APP_URL = 'http://localhost:5173';
  var DEV_API_BASE_URL = 'http://localhost:3001/api';

  function normalizeApiBaseUrl(input) {
    var u = (input || '').trim().replace(/\/+$/, '');
    if (!u) return '';
    if (!/\/api$/i.test(u)) u += '/api';
    return u;
  }

  global.VettrConfig = {
    PROD_WEB_APP_URL: PROD_WEB_APP_URL,
    PROD_API_BASE_URL: PROD_API_BASE_URL,
    DEV_WEB_APP_URL: DEV_WEB_APP_URL,
    DEV_API_BASE_URL: DEV_API_BASE_URL,
    getDefaultWebAppUrl: function () {
      return PROD_WEB_APP_URL;
    },
    getDefaultApiBaseUrl: function () {
      return PROD_API_BASE_URL;
    },
    normalizeApiBaseUrl: normalizeApiBaseUrl
  };
})(typeof globalThis !== 'undefined' ? globalThis : typeof self !== 'undefined' ? self : window);
