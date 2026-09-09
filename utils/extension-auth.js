(function (global) {
  'use strict';

  var DEFAULT_WEB_APP = (typeof VettrConfig !== 'undefined' && VettrConfig.getDefaultWebAppUrl)
    ? VettrConfig.getDefaultWebAppUrl()
    : 'http://localhost:5173';
  var DEFAULT_API = (typeof VettrConfig !== 'undefined' && VettrConfig.getDefaultApiBaseUrl)
    ? VettrConfig.getDefaultApiBaseUrl()
    : 'http://localhost:3001/api';

  function normalizeApiBaseUrl(input) {
    var u = (input || '').trim().replace(/\/+$/, '');
    if (!u) return '';
    if (!/\/api$/i.test(u)) u += '/api';
    return u;
  }

  function login(email, password, apiBaseUrl) {
    var base = normalizeApiBaseUrl(apiBaseUrl || DEFAULT_API);
    return fetch(base + '/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: email, password: password })
    }).then(function (res) {
      return res.json().then(function (data) {
        if (!res.ok) throw new Error((data && data.error) || 'Login failed');
        return { token: data.token, user: data.user, apiBaseUrl: base };
      });
    });
  }

  function saveSession(payload) {
    return new Promise(function (resolve) {
      chrome.storage.local.set(
        {
          vettrAuthToken: payload.token,
          vettrApiBaseUrl: payload.apiBaseUrl,
          vettrUserEmail: payload.user && payload.user.email ? payload.user.email : '',
          vettrWebAppUrl: payload.webAppUrl || DEFAULT_WEB_APP
        },
        resolve
      );
    });
  }

  function clearSession() {
    return new Promise(function (resolve) {
      chrome.storage.local.remove(['vettrAuthToken', 'vettrUserEmail', 'vettrTeamId'], resolve);
    });
  }

  function getSession() {
    return new Promise(function (resolve) {
      chrome.storage.local.get(
        ['vettrAuthToken', 'vettrApiBaseUrl', 'vettrUserEmail', 'vettrWebAppUrl'],
        resolve
      );
    });
  }

  global.VettrExtensionAuth = {
    DEFAULT_WEB_APP: DEFAULT_WEB_APP,
    DEFAULT_API: DEFAULT_API,
    normalizeApiBaseUrl: normalizeApiBaseUrl,
    login: login,
    saveSession: saveSession,
    clearSession: clearSession,
    getSession: getSession
  };
})(typeof globalThis !== 'undefined' ? globalThis : typeof self !== 'undefined' ? self : window);
