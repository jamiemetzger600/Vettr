import { useState, useEffect, useMemo } from 'react';
import { ddPublicAPI } from '../utils/api';
import { formatDate } from '../utils/normalizeDeal';

function storageKey(token) {
  return `vettr-dd-portal:${token}`;
}

function loadGuest(token) {
  try {
    const raw = localStorage.getItem(storageKey(token));
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function saveGuest(token, guest) {
  localStorage.setItem(storageKey(token), JSON.stringify(guest));
}

function newSessionId() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
  return `g_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

export default function DdPortalPage() {
  const token = window.location.pathname.split('/dd/')[1]?.split('/')[0] || '';
  const storedGuest = token ? loadGuest(token) : null;

  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [needsPassword, setNeedsPassword] = useState(false);
  const [password, setPassword] = useState('');
  const [passwordDraft, setPasswordDraft] = useState('');
  const [guestReady, setGuestReady] = useState(Boolean(storedGuest?.guestName));
  const [authorName, setAuthorName] = useState(storedGuest?.guestName || '');
  const [authorEmail, setAuthorEmail] = useState(storedGuest?.guestEmail || '');
  const [guestSessionId] = useState(storedGuest?.guestSessionId || newSessionId());
  const [commentDrafts, setCommentDrafts] = useState({});
  const [reloadKey, setReloadKey] = useState(0);

  const guestHeaders = useMemo(
    () => ({
      password: password || undefined,
      guestName: authorName.trim() || undefined,
      guestEmail: authorEmail.trim() || undefined,
      guestSessionId: guestSessionId || undefined
    }),
    [password, authorName, authorEmail, guestSessionId]
  );

  useEffect(() => {
    if (!token) {
      setError('Invalid link');
      setLoading(false);
      return undefined;
    }

    let cancelled = false;
    const load = async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await ddPublicAPI.getPortal(token, {
          password: password || undefined,
          guestName: authorName.trim() || undefined,
          guestEmail: authorEmail.trim() || undefined,
          guestSessionId
        });
        if (cancelled) return;
        setNeedsPassword(false);
        setData(res);
      } catch (err) {
        if (cancelled) return;
        if (err.requiresPassword || err.status === 401) {
          setNeedsPassword(true);
          setData(null);
          setError(err.message === 'Incorrect password' ? err.message : null);
        } else {
          setError(err.message);
          setData(null);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    load();
    return () => {
      cancelled = true;
    };
  }, [token, password, reloadKey, guestSessionId]);

  const handleUnlock = (e) => {
    e.preventDefault();
    setPassword(passwordDraft);
    setNeedsPassword(false);
  };

  const handleIdentity = (e) => {
    e.preventDefault();
    const name = authorName.trim();
    if (!name) {
      alert('Please enter your name');
      return;
    }
    saveGuest(token, {
      guestName: name,
      guestEmail: authorEmail.trim() || null,
      guestSessionId
    });
    setGuestReady(true);
    setReloadKey((k) => k + 1);
  };

  const handleStatus = async (itemId, status) => {
    if (data?.mode !== 'collaborative') return;
    try {
      const res = await ddPublicAPI.patchItem(token, itemId, { status }, guestHeaders);
      setData((prev) => ({ ...prev, checklist: res.checklist }));
    } catch (err) {
      alert(err.message);
    }
  };

  const handleComment = async (itemId) => {
    const body = (commentDrafts[itemId] || '').trim();
    if (!body) return;
    try {
      const res = await ddPublicAPI.addComment(
        token,
        itemId,
        {
          body,
          authorName: authorName.trim(),
          authorEmail: authorEmail.trim() || undefined
        },
        guestHeaders
      );
      setData((prev) => ({ ...prev, checklist: res.checklist }));
      setCommentDrafts((d) => ({ ...d, [itemId]: '' }));
    } catch (err) {
      alert(err.message);
    }
  };

  const handleDocument = async (itemId) => {
    const filename = window.prompt('Document name');
    if (!filename?.trim()) return;
    const docKey = window.prompt('URL or reference') || filename;
    try {
      const res = await ddPublicAPI.addDocument(
        token,
        itemId,
        {
          filename: filename.trim(),
          storageKey: docKey,
          authorName: authorName.trim(),
          authorEmail: authorEmail.trim() || undefined
        },
        guestHeaders
      );
      setData((prev) => ({ ...prev, checklist: res.checklist }));
    } catch (err) {
      alert(err.message);
    }
  };

  if (!token) return <div className="dd-portal"><p>Invalid link</p></div>;

  if (needsPassword && !password) {
    return (
      <div className="dd-portal">
        <header className="dd-portal__header">
          <img src="/vettr-logo.png" alt="Vettr" className="dd-portal__logo" width={160} height={46} />
          <h1>Due Diligence</h1>
          <p className="dd-portal__mode">This link is password protected</p>
        </header>
        <form className="dd-portal-gate" onSubmit={handleUnlock}>
          <label>
            Password
            <input
              type="password"
              className="modal-input"
              value={passwordDraft}
              onChange={(e) => setPasswordDraft(e.target.value)}
              autoFocus
              required
            />
          </label>
          {error ? <p className="crm-panel--error">{error}</p> : null}
          <button type="submit" className="btn-primary">Continue</button>
        </form>
      </div>
    );
  }

  if (loading) return <div className="dd-portal"><p>Loading…</p></div>;
  if (error && !data) return <div className="dd-portal"><p>{error}</p></div>;

  if (data?.requiresGuestIdentity && !guestReady) {
    return (
      <div className="dd-portal">
        <header className="dd-portal__header">
          <img src="/vettr-logo.png" alt="Vettr" className="dd-portal__logo" width={160} height={46} />
          <h1>{data.dealName}</h1>
          <p className="dd-portal__mode">
            Collaborate{data.label ? ` · ${data.label}` : ''}
          </p>
        </header>
        <form className="dd-portal-gate" onSubmit={handleIdentity}>
          <p className="dd-portal-gate__intro">Enter your details once — they stamp comments and uploads.</p>
          <label>
            Your name
            <input
              type="text"
              className="modal-input"
              value={authorName}
              onChange={(e) => setAuthorName(e.target.value)}
              placeholder="e.g. Alex (Seller attorney)"
              required
              autoFocus
            />
          </label>
          <label>
            Email (optional)
            <input
              type="email"
              className="modal-input"
              value={authorEmail}
              onChange={(e) => setAuthorEmail(e.target.value)}
              placeholder="you@firm.com"
            />
          </label>
          <button type="submit" className="btn-primary">Continue to checklist</button>
        </form>
      </div>
    );
  }

  const checklist = data?.checklist;
  const progress = checklist?.progress || {};
  const groups = checklist?.groups || [];

  return (
    <div className="dd-portal dd-portal--board">
      <header className="dd-portal__header">
        <img src="/vettr-logo.png" alt="Vettr" className="dd-portal__logo" width={160} height={46} />
        <h1>{data.dealName}</h1>
        <p className="dd-portal__mode">
          {data.mode === 'collaborative' ? 'Collaborate' : 'View only'}
          {data.label ? ` · ${data.label}` : ''}
          {authorName ? ` · ${authorName}` : ''}
        </p>
        <p className="dd-portal__progress">{progress.percent ?? 0}% complete</p>
        {data.scopedGroupCount > 0 ? (
          <p className="crm-muted">
            Showing {data.scopedGroupCount} shared section{data.scopedGroupCount === 1 ? '' : 's'}
          </p>
        ) : null}
      </header>

      <main className="dd-portal-board" aria-label="Due diligence checklist board">
        {groups.map((group) => {
          const items = group.items || [];
          const complete = items.filter((item) => item.status === 'complete').length;
          return (
            <section key={group.id} className="dd-portal-column">
              <header className="dd-portal-column__header">
                <h2>{group.name}</h2>
                <span>{complete}/{items.length}</span>
              </header>
              <ul className="dd-portal-column__cards">
                {items.map((item) => (
                  <li
                    key={item.id}
                    className="dd-portal-card"
                    data-status={item.status}
                  >
                    <div className="dd-portal-card__top">
                      <strong>{item.title}</strong>
                      {item.requests_document ? <span className="dd-item__badge">Document</span> : null}
                    </div>
                    {item.due_at ? <span className="dd-item__due">Due {formatDate(item.due_at)}</span> : null}
                    {data.mode === 'collaborative' ? (
                      <>
                        <select
                          value={item.status}
                          onChange={(e) => handleStatus(item.id, e.target.value)}
                          className="modal-input"
                          aria-label={`Status for ${item.title}`}
                        >
                          <option value="not_started">Not started</option>
                          <option value="in_progress">In progress</option>
                          <option value="complete">Complete</option>
                          <option value="waiting_on_other">Waiting</option>
                        </select>
                        {item.requests_document ? (
                          <button type="button" className="btn-secondary" onClick={() => handleDocument(item.id)}>
                            Add document
                          </button>
                        ) : null}
                        {(item.comments || []).length > 0 ? (
                          <ul className="dd-item__comments">
                            {item.comments.map((comment) => (
                              <li key={comment.id} className="dd-item__comment dd-item__comment--external">
                                <span className="dd-item__comment-meta">
                                  {comment.authorName || 'Guest'}
                                  {comment.createdAt ? ` · ${formatDate(comment.createdAt)}` : ''}
                                </span>
                                <p className="dd-item__comment-body">{comment.body}</p>
                              </li>
                            ))}
                          </ul>
                        ) : null}
                        <div className="dd-portal-comment">
                          <input
                            className="modal-input"
                            placeholder="Add comment"
                            value={commentDrafts[item.id] || ''}
                            onChange={(e) => setCommentDrafts((d) => ({ ...d, [item.id]: e.target.value }))}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') handleComment(item.id);
                            }}
                          />
                          <button type="button" className="btn-secondary" onClick={() => handleComment(item.id)}>
                            Post
                          </button>
                        </div>
                      </>
                    ) : (
                      <>
                        <span className="dd-item__status-readonly">{item.status.replace(/_/g, ' ')}</span>
                        {(item.comments || []).length > 0 ? (
                          <ul className="dd-item__comments">
                            {item.comments.map((comment) => (
                              <li key={comment.id} className="dd-item__comment">
                                <span className="dd-item__comment-meta">
                                  {comment.authorName || 'Guest'}
                                  {comment.createdAt ? ` · ${formatDate(comment.createdAt)}` : ''}
                                </span>
                                <p className="dd-item__comment-body">{comment.body}</p>
                              </li>
                            ))}
                          </ul>
                        ) : null}
                      </>
                    )}
                  </li>
                ))}
              </ul>
            </section>
          );
        })}
      </main>
    </div>
  );
}
