/**
 * Shared Vettr account UI helpers (dashboard + overlay settings).
 */
(function (global) {
  'use strict';

  function sendMessage(msg) {
    return new Promise(function (resolve) {
      if (!chrome || !chrome.runtime || !chrome.runtime.sendMessage) {
        resolve({ ok: false, error: 'Extension runtime unavailable' });
        return;
      }
      chrome.runtime.sendMessage(msg, function (res) {
        if (chrome.runtime.lastError) {
          resolve({ ok: false, error: chrome.runtime.lastError.message });
          return;
        }
        resolve(res || { ok: false });
      });
    });
  }

  function getLinkStatus() {
    return sendMessage({ type: 'VETTR_LINK_STATUS' });
  }

  function signIn(email, password) {
    var apiBase = (typeof VettrConfig !== 'undefined' && VettrConfig.getDefaultApiBaseUrl) ? VettrConfig.getDefaultApiBaseUrl() : '';
    var webUrl = (typeof VettrConfig !== 'undefined' && VettrConfig.getDefaultWebAppUrl) ? VettrConfig.getDefaultWebAppUrl() : 'http://localhost:5173';
    return sendMessage({
      type: 'VETTR_LOGIN',
      email: email,
      password: password,
      apiBaseUrl: apiBase,
      webAppUrl: webUrl
    });
  }

  function signOut() {
    return sendMessage({ type: 'VETTR_SIGN_OUT' });
  }

  function runFullSync() {
    return sendMessage({ type: 'VETTR_FULL_SYNC' });
  }

  function getWebAppUrl(status) {
    if (status && status.webAppUrl) return status.webAppUrl;
    if (typeof VettrConfig !== 'undefined' && VettrConfig.getDefaultWebAppUrl) return VettrConfig.getDefaultWebAppUrl();
    return 'http://localhost:5173';
  }

  function formatLastSync(ts) {
    if (!ts) return '';
    var d = new Date(typeof ts === 'number' ? ts : Date.parse(ts));
    if (isNaN(d.getTime())) return '';
    try {
      return d.toLocaleString(undefined, {
        month: 'short',
        day: 'numeric',
        hour: 'numeric',
        minute: '2-digit'
      });
    } catch (e) {
      return d.toISOString();
    }
  }

  function updateAccountBar(root, status, options) {
    if (!root) return;
    options = options || {};
    var linkedEl = root.querySelector('[data-vettr-linked]');
    var signinEl = root.querySelector('[data-vettr-signin]');
    var emailEl = root.querySelector('[data-vettr-email]');
    var statusEl = root.querySelector('[data-vettr-status]');
    var errorEl = root.querySelector('[data-vettr-error]');
    var lastSyncEl = root.querySelector('[data-vettr-last-sync]');

    if (errorEl) {
      errorEl.style.display = 'none';
      errorEl.textContent = '';
    }

    if (status && status.linked) {
      if (linkedEl) linkedEl.style.display = options.compactLinked ? 'flex' : 'block';
      if (signinEl) signinEl.style.display = 'none';
      if (emailEl) emailEl.textContent = status.email || 'your account';
      if (statusEl) {
        statusEl.textContent = 'Synced as ' + (status.email || 'your account');
        statusEl.style.display = linkedEl ? 'none' : 'block';
      }
      if (lastSyncEl) {
        var when = formatLastSync(status.lastSyncAt);
        lastSyncEl.textContent = when ? ('Last sync: ' + when) : 'Syncing…';
        lastSyncEl.style.display = 'block';
      }
    } else {
      if (linkedEl) linkedEl.style.display = 'none';
      if (signinEl) signinEl.style.display = 'block';
      if (statusEl) {
        statusEl.style.display = 'block';
        statusEl.textContent = options.statusText || 'Sign in to sync My Deals with Vettr';
      }
      if (lastSyncEl) {
        lastSyncEl.textContent = '';
        lastSyncEl.style.display = 'none';
      }
    }
  }

  function bindAccountForm(root, callbacks) {
    if (!root || root.dataset.vettrBound === '1') return;
    root.dataset.vettrBound = '1';
    callbacks = callbacks || {};

    var emailInput = root.querySelector('[data-vettr-email-input]');
    var passInput = root.querySelector('[data-vettr-password-input]');
    var loginBtn = root.querySelector('[data-vettr-login-btn]');
    var signoutBtn = root.querySelector('[data-vettr-signout-btn]');
    var openWebLink = root.querySelector('[data-vettr-open-web]');
    var signupLink = root.querySelector('[data-vettr-signup]');
    var errorEl = root.querySelector('[data-vettr-error]');

    function showError(msg) {
      if (!errorEl) return;
      errorEl.textContent = msg;
      errorEl.style.display = msg ? 'block' : 'none';
    }

    function refresh() {
      return getLinkStatus().then(function (status) {
        updateAccountBar(root, status, callbacks);
        if (typeof callbacks.onStatus === 'function') callbacks.onStatus(status);
        return status;
      });
    }

    if (loginBtn) {
      loginBtn.addEventListener('click', function () {
        var email = emailInput ? emailInput.value.trim() : '';
        var password = passInput ? passInput.value : '';
        if (!email || !password) {
          showError('Email and password are required');
          return;
        }
        showError('');
        loginBtn.disabled = true;
        var prevText = loginBtn.textContent;
        loginBtn.textContent = 'Signing in…';
        signIn(email, password).then(function (res) {
          if (!res || !res.ok) {
            loginBtn.disabled = false;
            loginBtn.textContent = prevText;
            showError((res && res.error) || 'Sign in failed');
            return;
          }
          if (passInput) passInput.value = '';
          if (typeof callbacks.onSignedIn === 'function') callbacks.onSignedIn(res);
          // Background already schedules sync on login; wait for it then refresh UI
          runFullSync()
            .then(function () {
              return refresh();
            })
            .catch(function () {
              return refresh();
            })
            .finally(function () {
              loginBtn.disabled = false;
              loginBtn.textContent = prevText;
            });
        });
      });
    }

    if (signoutBtn) {
      signoutBtn.addEventListener('click', function () {
        signOut().then(function () {
          if (typeof callbacks.onSignedOut === 'function') callbacks.onSignedOut();
          refresh();
        });
      });
    }

    if (openWebLink) {
      openWebLink.addEventListener('click', function (e) {
        e.preventDefault();
        getLinkStatus().then(function (status) {
          var url = getWebAppUrl(status) + '/login?from=extension';
          window.open(url, '_blank', 'noopener');
        });
      });
    }

    if (signupLink) {
      signupLink.addEventListener('click', function (e) {
        e.preventDefault();
        getLinkStatus().then(function (status) {
          var url = getWebAppUrl(status) + '/register?from=extension';
          window.open(url, '_blank', 'noopener');
        });
      });
    }

    if (chrome.storage && chrome.storage.onChanged) {
      chrome.storage.onChanged.addListener(function (changes, area) {
        if (area === 'local' && (changes.vettrAuthToken || changes.vettrUserEmail || changes.vettrLastSyncAt)) {
          refresh();
        }
      });
    }

    refresh();
    return { refresh: refresh };
  }

  global.VettrAccountUI = {
    getLinkStatus: getLinkStatus,
    signIn: signIn,
    signOut: signOut,
    runFullSync: runFullSync,
    updateAccountBar: updateAccountBar,
    bindAccountForm: bindAccountForm,
    getWebAppUrl: getWebAppUrl,
    formatLastSync: formatLastSync
  };
})(typeof globalThis !== 'undefined' ? globalThis : typeof self !== 'undefined' ? self : window);
