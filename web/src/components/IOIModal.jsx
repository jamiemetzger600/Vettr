import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { crmAPI, userAPI } from '../utils/api';
import { generateIOIText, generateIOISubject, getBrokerEmailFromDeal } from '../utils/ioiGenerator';
import { scenarioDisplayName } from '../utils/dealCalculatorMath';
import { loadIoiDraft, saveIoiDraft } from '../utils/ioiDraftStorage';

const DEFAULT_TIMELINE = '30-45 days from accepted offer';

function initialSelected(scenarios, activeScenario, draft) {
  const fromDraft = Array.isArray(draft?.selectedIndices)
    ? draft.selectedIndices.filter((idx) => scenarios[idx])
    : [];
  if (fromDraft.length) return new Set(fromDraft);
  const init = new Set();
  if (scenarios[activeScenario]) init.add(activeScenario);
  return init;
}

/** Copy plain text for paste into email; uses Clipboard API with a focused textarea fallback. */
async function copyTextToClipboard(text) {
  if (!text) return false;

  if (navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch (err) {
      console.warn('[IOI] navigator.clipboard.writeText failed:', err);
    }
  }

  try {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.setAttribute('readonly', '');
    ta.style.position = 'fixed';
    ta.style.left = '-9999px';
    ta.style.top = '0';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.focus();
    ta.select();
    ta.setSelectionRange(0, text.length);
    const ok = document.execCommand('copy');
    document.body.removeChild(ta);
    return ok;
  } catch (err) {
    console.warn('[IOI] execCommand copy failed:', err);
    return false;
  }
}

export default function IOIModal({
  deal,
  scenarios,
  activeScenario = 0,
  qualityPrefs = {},
  settings = null,
  onClose,
  onIOISent = null,
  onIOIPrefsSaved = null
}) {
  /** Account: signature, company, default timeline. Per listing: broker email, notes, scenarios, preview edits. */
  const prefs = settings?.preferences || {};
  const dealKey = deal?.id ?? deal?.dbId ?? null;
  const draft = useMemo(() => loadIoiDraft(dealKey), [dealKey]);
  const [selected, setSelected] = useState(() => initialSelected(scenarios, activeScenario, draft));
  const [timeline, setTimeline] = useState(
    () => draft?.timeline || prefs.ioiTimeline || DEFAULT_TIMELINE
  );
  const [closingNotes, setClosingNotes] = useState(() => draft?.closingNotes || '');
  const [signature, setSignature] = useState(() => prefs.ioiSignature || '');
  const [companyName, setCompanyName] = useState(() => prefs.ioiCompanyName || '');
  const parsedBrokerEmail = useMemo(() => getBrokerEmailFromDeal(deal), [deal]);
  const [brokerEmail, setBrokerEmail] = useState(
    () => draft?.brokerEmail || parsedBrokerEmail || ''
  );
  const brokerEmailTouchedRef = useRef(Boolean(draft?.brokerEmail));
  const [previewText, setPreviewText] = useState(() => (
    draft?.previewEdited && draft?.previewText ? draft.previewText : ''
  ));
  const skipGeneratedPreviewRef = useRef(Boolean(draft?.previewEdited && draft?.previewText));
  const previewEditedRef = useRef(Boolean(draft?.previewEdited && draft?.previewText));
  const accountHydratedRef = useRef(Boolean(prefs.ioiSignature || prefs.ioiCompanyName || prefs.ioiTimeline));
  const [copied, setCopied] = useState(false);
  const [sent, setSent] = useState(false);
  const [gmailStatus, setGmailStatus] = useState(null);
  const [sendingGmail, setSendingGmail] = useState(false);
  const [gmailError, setGmailError] = useState(null);
  const [gmailSent, setGmailSent] = useState(false);

  useEffect(() => {
    let cancelled = false;
    crmAPI.getCalendarStatus()
      .then((status) => {
        if (!cancelled) setGmailStatus(status);
      })
      .catch((err) => {
        console.warn('[IOI] Google status failed', err);
        if (!cancelled) setGmailStatus({ connected: false, gmail: false });
      });
    return () => { cancelled = true; };
  }, []);

  /** Autofill listing broker email unless the user (or a saved draft) already set one. */
  useEffect(() => {
    if (brokerEmailTouchedRef.current || !parsedBrokerEmail) return;
    setBrokerEmail(parsedBrokerEmail);
  }, [parsedBrokerEmail]);

  useEffect(() => {
    if (accountHydratedRef.current) return;
    if (!prefs.ioiSignature && !prefs.ioiCompanyName && !prefs.ioiTimeline) return;
    accountHydratedRef.current = true;
    if (prefs.ioiSignature) setSignature((s) => s || prefs.ioiSignature);
    if (prefs.ioiCompanyName) setCompanyName((c) => c || prefs.ioiCompanyName);
    if (prefs.ioiTimeline && !draft?.timeline) setTimeline((t) => (t === DEFAULT_TIMELINE ? prefs.ioiTimeline : t));
  }, [prefs.ioiSignature, prefs.ioiCompanyName, prefs.ioiTimeline, draft?.timeline]);

  const selectedIndices = useMemo(
    () => Array.from(selected).sort((a, b) => a - b),
    [selected]
  );

  const toggleScenario = useCallback((idx) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(idx)) next.delete(idx);
      else next.add(idx);
      return next;
    });
  }, []);

  const latestDraftRef = useRef({});
  latestDraftRef.current = {
    signature,
    companyName,
    timeline,
    closingNotes,
    brokerEmail,
    selectedIndices,
    previewText
  };
  const debounceSaveRef = useRef(null);
  const skipDebouncedSaveRef = useRef(true);

  const persistIoiInputs = useCallback(async () => {
    const cur = latestDraftRef.current;
    const generated = cur.selectedIndices.length
      ? generateIOIText({
          deal,
          scenarios,
          selectedIndices: cur.selectedIndices,
          qualityPrefs,
          timeline: cur.timeline,
          closingNotes: cur.closingNotes,
          signature: cur.signature,
          companyName: cur.companyName
        })
      : '';
    const previewEdited = Boolean(cur.previewText) && cur.previewText !== generated;
    previewEditedRef.current = previewEdited;

    saveIoiDraft(dealKey, {
      brokerEmail: String(cur.brokerEmail || '').trim(),
      closingNotes: cur.closingNotes || '',
      timeline: cur.timeline || DEFAULT_TIMELINE,
      selectedIndices: cur.selectedIndices,
      previewText: cur.previewText || '',
      previewEdited,
      savedAt: new Date().toISOString()
    });
    console.log('[IOI] saved inputs', {
      dealKey,
      previewEdited,
      hasBroker: Boolean(String(cur.brokerEmail || '').trim()),
      scenarios: cur.selectedIndices.length
    });

    try {
      await userAPI.updateSettings({
        preferences: {
          ioiSignature: String(cur.signature || '').trim(),
          ioiCompanyName: String(cur.companyName || '').trim(),
          ioiTimeline: String(cur.timeline || '').trim() || DEFAULT_TIMELINE
        }
      });
      onIOIPrefsSaved?.();
    } catch (e) {
      console.error('[IOI] Failed to save account IOI preferences', e);
    }
  }, [deal, dealKey, onIOIPrefsSaved, qualityPrefs, scenarios]);

  const schedulePersist = useCallback(() => {
    if (debounceSaveRef.current) clearTimeout(debounceSaveRef.current);
    debounceSaveRef.current = setTimeout(() => {
      debounceSaveRef.current = null;
      void persistIoiInputs();
    }, 450);
  }, [persistIoiInputs]);

  const persistIoiInputsNow = useCallback(async () => {
    if (debounceSaveRef.current) {
      clearTimeout(debounceSaveRef.current);
      debounceSaveRef.current = null;
    }
    await persistIoiInputs();
  }, [persistIoiInputs]);

  useEffect(() => {
    if (skipDebouncedSaveRef.current) {
      skipDebouncedSaveRef.current = false;
      return;
    }
    schedulePersist();
  }, [signature, companyName, timeline, closingNotes, brokerEmail, selectedIndices, previewText, schedulePersist]);

  const onIOIPrefsSavedRef = useRef(onIOIPrefsSaved);
  onIOIPrefsSavedRef.current = onIOIPrefsSaved;

  useEffect(() => {
    return () => {
      if (debounceSaveRef.current) {
        clearTimeout(debounceSaveRef.current);
        debounceSaveRef.current = null;
      }
      const cur = latestDraftRef.current;
      saveIoiDraft(dealKey, {
        brokerEmail: String(cur.brokerEmail || '').trim(),
        closingNotes: cur.closingNotes || '',
        timeline: cur.timeline || DEFAULT_TIMELINE,
        selectedIndices: cur.selectedIndices || [],
        previewText: cur.previewText || '',
        previewEdited: previewEditedRef.current,
        savedAt: new Date().toISOString()
      });
      void userAPI
        .updateSettings({
          preferences: {
            ioiSignature: String(cur.signature || '').trim(),
            ioiCompanyName: String(cur.companyName || '').trim(),
            ioiTimeline: String(cur.timeline || '').trim() || DEFAULT_TIMELINE
          }
        })
        .then(() => onIOIPrefsSavedRef.current?.())
        .catch((e) => console.error('[IOI] Failed to flush IOI inputs on close', e));
    };
  }, [dealKey]);

  const generatedText = useMemo(() => {
    if (selectedIndices.length === 0) return '';
    return generateIOIText({
      deal,
      scenarios,
      selectedIndices,
      qualityPrefs,
      timeline,
      closingNotes,
      signature,
      companyName
    });
  }, [deal, scenarios, selectedIndices, qualityPrefs, timeline, closingNotes, signature, companyName]);

  useEffect(() => {
    if (skipGeneratedPreviewRef.current) {
      skipGeneratedPreviewRef.current = false;
      return;
    }
    previewEditedRef.current = false;
    setPreviewText(generatedText);
  }, [generatedText]);

  useEffect(() => {
    const handleKey = (e) => {
      if (e.key === 'Escape') {
        e.stopImmediatePropagation();
        onClose();
      }
    };
    window.addEventListener('keydown', handleKey, true);
    return () => window.removeEventListener('keydown', handleKey, true);
  }, [onClose]);

  const recordIOI = useCallback((text) => {
    if (onIOISent) onIOISent(text);
  }, [onIOISent]);

  /** Gmail web compose — reliable in a new tab; mailto + window.open often yields a blank tab. */
  const openGmailCompose = useCallback((to, subject, body) => {
    const maxLen = 7500;
    let bodyUse = body;
    const build = () => {
      const p = new URLSearchParams();
      p.set('view', 'cm');
      p.set('fs', '1');
      if (to) p.set('to', to);
      p.set('su', subject);
      p.set('body', bodyUse);
      return `https://mail.google.com/mail/?${p.toString()}`;
    };
    let url = build();
    if (url.length > maxLen) {
      const note = '\n\n[... truncated for link length — use Copy to Clipboard for the full IOI.]';
      while (url.length > maxLen && bodyUse.length > note.length + 50) {
        bodyUse = bodyUse.slice(0, bodyUse.length - 120) + note;
        url = build();
      }
    }
    window.open(url, '_blank', 'noopener,noreferrer');
  }, []);

  /** Fallback for desktop mail apps (avoids blank mailto tabs in some browsers). */
  const openMailtoViaAnchor = useCallback((mailtoHref) => {
    const a = document.createElement('a');
    a.href = mailtoHref;
    a.target = '_blank';
    a.rel = 'noopener';
    document.body.appendChild(a);
    a.click();
    a.remove();
  }, []);

  const handleSendEmail = async () => {
    await persistIoiInputsNow();
    const subject = generateIOISubject(deal);
    const to = brokerEmail.trim();
    openGmailCompose(to, subject, previewText);
    setSent(true);
    recordIOI(previewText);
  };

  const handleSendMailApp = useCallback(async () => {
    await persistIoiInputsNow();
    const subject = encodeURIComponent(generateIOISubject(deal));
    const body = encodeURIComponent(previewText);
    const to = brokerEmail.trim();
    const href = to
      ? `mailto:${encodeURIComponent(to)}?subject=${subject}&body=${body}`
      : `mailto:?subject=${subject}&body=${body}`;
    openMailtoViaAnchor(href);
    setSent(true);
    recordIOI(previewText);
  }, [brokerEmail, deal, openMailtoViaAnchor, previewText, recordIOI, persistIoiInputsNow]);

  const handleCopy = () => {
    const text = previewText.trim();
    if (!text) return;

    // Copy in the same user gesture — awaiting save first drops transient activation and breaks clipboard API.
    void copyTextToClipboard(text).then((ok) => {
      if (!ok) {
        console.error('[IOI] copy to clipboard failed');
        window.alert(
          'Could not copy to the clipboard. Select the email preview text and use Cmd+C (Mac) or Ctrl+C (Windows).'
        );
        return;
      }
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
      recordIOI(previewText);
      void persistIoiInputsNow();
    });
  };

  const canSend = selectedIndices.length > 0 && previewText.trim().length > 0;
  const canSendGmail = canSend && Boolean(brokerEmail.trim());
  const gmailReady = Boolean(gmailStatus?.gmail);

  const handleSendFromGmail = async () => {
    if (!canSendGmail) return;
    setGmailError(null);
    setSendingGmail(true);
    await persistIoiInputsNow();
    try {
      await crmAPI.sendGmail({
        to: brokerEmail.trim(),
        subject: generateIOISubject(deal),
        text: previewText
      });
      setGmailSent(true);
      recordIOI(previewText);
    } catch (err) {
      console.error('[IOI] Gmail send failed', err);
      setGmailError(err.message || 'Gmail send failed');
    } finally {
      setSendingGmail(false);
    }
  };

  return (
    <div className="modal-overlay ioi-modal-overlay" onClick={(e) => { e.stopPropagation(); if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal-card ioi-modal" onClick={(e) => e.stopPropagation()}>
        <div className="ioi-modal-header">
          <h2>Quick IOI</h2>
          <button type="button" className="deal-details-close" onClick={onClose}>×</button>
        </div>

        <div className="ioi-modal-body">
          {/* Scenario selector */}
          <div className="ioi-section">
            <label className="ioi-section-label">Include Scenarios</label>
            <div className="ioi-scenario-selector">
              {scenarios.map((scenario, idx) => (
                <label key={idx} className="ioi-scenario-check">
                  <input
                    type="checkbox"
                    checked={selected.has(idx)}
                    onChange={() => toggleScenario(idx)}
                  />
                  <span>
                    {scenarioDisplayName(scenario, idx)}
                    {idx === activeScenario ? ' (active)' : ''}
                  </span>
                </label>
              ))}
            </div>
            {selectedIndices.length === 0 && (
              <p className="ioi-warn">Select at least one scenario to generate the IOI.</p>
            )}
          </div>

          {/* Broker email */}
          <div className="ioi-section">
            <label className="ioi-section-label" htmlFor="ioi-broker-email">Broker or Seller Email</label>
            <input
              id="ioi-broker-email"
              type="email"
              className="ioi-input"
              value={brokerEmail}
              onChange={(e) => {
                brokerEmailTouchedRef.current = true;
                setBrokerEmail(e.target.value);
              }}
              onBlur={persistIoiInputsNow}
              placeholder="broker@example.com"
            />
            <p className="ioi-hint">Saved for this listing. Required to send from Gmail.</p>
          </div>

          {/* Buyer company + signature (saved for next time) */}
          <div className="ioi-section">
            <label className="ioi-section-label" htmlFor="ioi-company">Your Company (Buyer)</label>
            <input
              id="ioi-company"
              type="text"
              className="ioi-input"
              value={companyName}
              onChange={(e) => setCompanyName(e.target.value)}
              onBlur={persistIoiInputsNow}
              placeholder="e.g. Acme Acquisitions LLC"
            />
            <p className="ioi-hint">Shown in the email closing. Saved to your account and reused on every IOI.</p>
          </div>

          <div className="ioi-field-row">
            <div className="ioi-section ioi-section-half">
              <label className="ioi-section-label" htmlFor="ioi-timeline">Timeline to Close</label>
              <input
                id="ioi-timeline"
                type="text"
                className="ioi-input"
                value={timeline}
                onChange={(e) => setTimeline(e.target.value)}
                onBlur={persistIoiInputsNow}
              />
            </div>
            <div className="ioi-section ioi-section-half">
              <label className="ioi-section-label" htmlFor="ioi-signature">Signature</label>
              <input
                id="ioi-signature"
                type="text"
                className="ioi-input"
                value={signature}
                onChange={(e) => setSignature(e.target.value)}
                onBlur={persistIoiInputsNow}
                placeholder="Your Name"
              />
            </div>
          </div>
          <p className="ioi-hint ioi-hint-inline">Signature and close timeline are saved to your account and reused on every IOI.</p>

          <div className="ioi-section">
            <label className="ioi-section-label" htmlFor="ioi-closing">Closing Notes (optional)</label>
            <textarea
              id="ioi-closing"
              className="ioi-textarea"
              rows={2}
              value={closingNotes}
              onChange={(e) => setClosingNotes(e.target.value)}
              onBlur={persistIoiInputsNow}
              placeholder="Any additional notes for the broker..."
            />
          </div>

          {/* Preview */}
          <div className="ioi-section">
            <label className="ioi-section-label">Email Preview</label>
            <div className="ioi-preview-subject">
              Subject: {generateIOISubject(deal)}
            </div>
            <textarea
              className="ioi-preview"
              rows={16}
              value={previewText}
              onChange={(e) => {
                previewEditedRef.current = true;
                setPreviewText(e.target.value);
              }}
            />
            <p className="ioi-hint">Edits here are saved for this listing. Changing scenarios, timeline, or notes regenerates the draft.</p>
          </div>
        </div>

        <div className="ioi-modal-footer">
          {gmailSent && <span className="ioi-success">Sent from Gmail.</span>}
          {sent && <span className="ioi-success">Opened — check for a new tab (Gmail) or your mail app.</span>}
          {copied && <span className="ioi-success">Copied to clipboard</span>}
          {gmailError && <span className="ioi-warn">{gmailError}</span>}
          {!gmailReady && gmailStatus && (
            <p className="ioi-hint ioi-gmail-connect">
              <Link to="/settings">Connect Google in Settings</Link> to send this IOI from your Gmail without a compose tab.
            </p>
          )}
          {gmailReady && !brokerEmail.trim() && canSend && (
            <p className="ioi-warn">Add a broker or seller email to send from Gmail.</p>
          )}
          <button type="button" className="btn-secondary" onClick={handleCopy} disabled={!canSend}>
            Copy to Clipboard
          </button>
          {gmailReady ? (
            <button
              type="button"
              className="btn-primary"
              onClick={handleSendFromGmail}
              disabled={!canSendGmail || sendingGmail}
            >
              {sendingGmail ? 'Sending…' : `Send from Gmail${gmailStatus?.googleEmail ? ` (${gmailStatus.googleEmail})` : ''}`}
            </button>
          ) : null}
          <button type="button" className={gmailReady ? 'btn-secondary' : 'btn-primary'} onClick={handleSendEmail} disabled={!canSend}>
            Open in Gmail
          </button>
          <button type="button" className="btn-secondary ioi-mailapp-btn" onClick={() => handleSendMailApp()} disabled={!canSend}>
            Default mail app
          </button>
          <button type="button" className="btn-secondary" onClick={onClose}>Cancel</button>
        </div>
      </div>
    </div>
  );
}
