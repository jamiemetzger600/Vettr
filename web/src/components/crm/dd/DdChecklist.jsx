import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { crmAPI } from '../../../utils/api';
import { formatDate } from '../../../utils/normalizeDeal';
import { applyClickSelection } from './ddSelection.js';
import useDdMarquee from './useDdMarquee.js';
import { DdFolderIcon, DdIconCard, DdListHead } from './DdItemViews.jsx';

const DEFAULT_MILESTONES = [
  { title: 'Request data room / remaining docs', dueAt: '' },
  { title: 'First diligence review', dueAt: '' },
  { title: 'Go / no-go decision', dueAt: '' }
];

const DD_STATUSES = [
  { value: 'not_started', label: 'Not started' },
  { value: 'in_progress', label: 'In progress' },
  { value: 'waiting_on_other', label: 'Waiting' },
  { value: 'complete', label: 'Complete' },
  { value: 'blocked', label: 'Blocked' },
  { value: 'na', label: 'N/A' }
];

const VIEW_KEY = 'vettr.ddChecklist.view';

function displayNameFromEmail(email) {
  const local = String(email || '').split('@')[0] || 'Member';
  return local
    .replace(/[._-]+/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase())
    .trim() || 'Member';
}

function defaultShareExpiryDate() {
  const d = new Date();
  d.setDate(d.getDate() + 14);
  return d.toISOString().slice(0, 10);
}

function modeLabel(mode) {
  return mode === 'collaborative' ? 'Collaborate' : 'View only';
}

function readStoredView() {
  try {
    const v = localStorage.getItem(VIEW_KEY);
    return v === 'list' || v === 'cards' ? v : 'cards';
  } catch {
    return 'cards';
  }
}

function dueToIso(dateStr) {
  if (!dateStr) return null;
  const d = new Date(`${dateStr}T12:00:00`);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

function iconMeta(item, assigneeLabel) {
  const name = assigneeLabel(item.assignees?.[0]) || 'Unassigned';
  const due = item.due_at ? formatDate(item.due_at) : '';
  return due ? `${name.split(' ')[0]} · ${due}` : name.split(' ')[0];
}

export default function DdChecklist({ dealId, onRefresh, canWrite = true }) {
  const [checklist, setChecklist] = useState(null);
  const [members, setMembers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [starting, setStarting] = useState(false);
  const [shareUrl, setShareUrl] = useState(null);
  const [error, setError] = useState(null);
  const [templateOptions, setTemplateOptions] = useState([]);
  const [selectedTemplateId, setSelectedTemplateId] = useState('');
  const [targetDate, setTargetDate] = useState('');
  const [milestones, setMilestones] = useState(DEFAULT_MILESTONES);
  const [suggestedLabel, setSuggestedLabel] = useState('');
  const [dealIndustry, setDealIndustry] = useState('');
  const [newGroupName, setNewGroupName] = useState('');
  const [showAddGroup, setShowAddGroup] = useState(false);
  const [addingGroup, setAddingGroup] = useState(false);
  const [addingItemGroupId, setAddingItemGroupId] = useState(null);
  const [newItemTitle, setNewItemTitle] = useState('');
  const [addingItem, setAddingItem] = useState(false);
  const [shareForm, setShareForm] = useState({
    open: false,
    mode: 'view_only',
    label: '',
    password: '',
    expiresAt: defaultShareExpiryDate(),
    selectedGroupIds: []
  });
  const [showShareLinks, setShowShareLinks] = useState(false);
  const [view, setView] = useState(readStoredView);
  const [selected, setSelected] = useState(() => new Set());
  const [anchorId, setAnchorId] = useState(null);
  const [bulkDue, setBulkDue] = useState('');
  const [bulkAssignee, setBulkAssignee] = useState('');
  const [bulkStatus, setBulkStatus] = useState('');
  const [bulkSaving, setBulkSaving] = useState(false);
  const workspaceRef = useRef(null);

  const load = useCallback(async () => {
    if (!dealId) return;
    setLoading(true);
    setError(null);
    try {
      const [data, mem] = await Promise.all([
        crmAPI.getDealDd(dealId),
        crmAPI.getThreadMembers(dealId).catch(() => ({ members: [] }))
      ]);
      setChecklist(data.checklist);
      setMembers(mem.members || []);

      if (!data.checklist) {
        try {
          const suggestion = await crmAPI.getDealDdTemplates(dealId);
          setTemplateOptions(suggestion.templates || []);
          setSuggestedLabel(suggestion.suggestedLabel || '');
          setDealIndustry(suggestion.dealIndustry || '');
          const sid = suggestion.suggestedTemplateId
            ? String(suggestion.suggestedTemplateId)
            : '';
          setSelectedTemplateId(sid);
          console.log('[DdChecklist] template suggestion', {
            dealId,
            industry: suggestion.dealIndustry,
            key: suggestion.suggestedIndustryKey,
            templateId: sid
          });
        } catch (tplErr) {
          console.warn('[DdChecklist] templates load failed', tplErr.message);
          setTemplateOptions([]);
        }
      }
    } catch (err) {
      setError(err.message);
      setChecklist(null);
    } finally {
      setLoading(false);
    }
  }, [dealId]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    setSelected(new Set());
    setAnchorId(null);
    setBulkDue('');
    setBulkAssignee('');
    setBulkStatus('');
  }, [dealId]);

  const allItemIds = useMemo(() => {
    const ids = [];
    for (const group of checklist?.groups || []) {
      for (const item of group.items || []) ids.push(String(item.id));
    }
    return ids;
  }, [checklist]);

  const handleViewChange = (next) => {
    setView(next);
    try { localStorage.setItem(VIEW_KEY, next); } catch { /* ignore */ }
    console.log('[DdChecklist] view', next);
  };

  const handleSelectionChange = useCallback((next, nextAnchor) => {
    setSelected(next);
    if (nextAnchor !== undefined) setAnchorId(nextAnchor);
  }, []);

  const handleItemClick = useCallback((id, { shift, meta }) => {
    setSelected((prev) => {
      const next = applyClickSelection(prev, allItemIds, id, { shift, meta, anchorId });
      console.log('[DdChecklist] item click', { id, shift, meta, count: next.size });
      return next;
    });
    if (!shift) setAnchorId(String(id));
  }, [allItemIds, anchorId]);

  const { marquee, onPointerDown, onPointerMove, onPointerUp, onPointerCancel } = useDdMarquee({
    containerRef: workspaceRef,
    selected,
    onSelectionChange: handleSelectionChange,
    onItemClick: handleItemClick,
    enabled: true
  });

  useEffect(() => {
    const onKey = (e) => {
      if (!checklist) return;
      const tag = e.target?.tagName;
      const typing = tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT';
      if (e.key === 'Escape' && !typing) {
        setSelected(new Set());
        setAnchorId(null);
        return;
      }
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'a' && !typing) {
        const root = workspaceRef.current;
        if (!root) return;
        if (!root.contains(e.target) && selected.size === 0) return;
        e.preventDefault();
        setSelected(new Set(allItemIds));
        console.log('[DdChecklist] select all', allItemIds.length);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [checklist, allItemIds, selected.size]);

  const handleStart = async () => {
    if (!dealId || starting) return;
    setStarting(true);
    try {
      const payload = {
        ...(selectedTemplateId ? { templateId: Number(selectedTemplateId) } : {}),
        ...(targetDate ? { targetDate } : {}),
        milestones: milestones.filter((m) => m.title.trim() && m.dueAt)
      };
      console.log('[DdChecklist] starting DD', { dealId, ...payload });
      const data = await crmAPI.startDealDd(dealId, payload);
      setChecklist(data.checklist);
      onRefresh?.();
    } catch (err) {
      alert('Failed to start DD: ' + err.message);
    } finally {
      setStarting(false);
    }
  };

  const handleStatusChange = async (itemId, status) => {
    try {
      const data = await crmAPI.patchDdItem(dealId, itemId, { status });
      setChecklist(data.checklist);
      onRefresh?.();
    } catch (err) {
      alert('Failed to update item: ' + err.message);
    }
  };

  const handleDueChange = async (itemId, dueAt) => {
    try {
      const data = await crmAPI.patchDdItem(dealId, itemId, { dueAt: dueAt || null });
      setChecklist(data.checklist);
    } catch (err) {
      alert('Failed to set due date: ' + err.message);
    }
  };

  const handleAssigneeChange = async (itemId, memberId) => {
    if (!canWrite) return;
    try {
      if (!memberId) {
        const data = await crmAPI.patchDdItem(dealId, itemId, { assignee: null });
        setChecklist(data.checklist);
        console.log('[DdChecklist] cleared assignee item', itemId);
        return;
      }
      const member = members.find((m) => String(m.id) === String(memberId));
      if (!member?.email) return;
      const displayName = member.displayName || displayNameFromEmail(member.email);
      const data = await crmAPI.patchDdItem(dealId, itemId, {
        assignee: {
          email: member.email,
          name: displayName,
          roleLabel: member.role || null
        }
      });
      setChecklist(data.checklist);
      console.log('[DdChecklist] assigned item', itemId, 'to', displayName);
    } catch (err) {
      alert('Failed to assign: ' + err.message);
    }
  };

  const memberIdForEmail = (email) => {
    if (!email) return '';
    const hit = members.find((m) => String(m.email).toLowerCase() === String(email).toLowerCase());
    return hit ? String(hit.id) : '';
  };

  const assigneeLabel = (assignee) => {
    if (!assignee) return '';
    if (assignee.name) return assignee.name;
    return displayNameFromEmail(assignee.email);
  };

  const toggleGroupSelected = (group) => {
    const ids = (group.items || []).map((i) => String(i.id));
    if (!ids.length) return;
    const allOn = ids.every((id) => selected.has(id));
    const next = new Set(selected);
    if (allOn) ids.forEach((id) => next.delete(id));
    else ids.forEach((id) => next.add(id));
    setSelected(next);
    setAnchorId(ids[0]);
    console.log('[DdChecklist] group select', group.name, { allOn: !allOn, count: next.size });
  };

  const handleBulkApply = async () => {
    if (!canWrite || selected.size === 0 || bulkSaving) return;
    const itemIds = [...selected].map(Number).filter((n) => Number.isInteger(n) && n > 0);
    const payload = { itemIds };
    if (bulkDue) payload.dueAt = dueToIso(bulkDue);
    if (bulkAssignee === '__unassign__') payload.assignee = null;
    else if (bulkAssignee) {
      const member = members.find((m) => String(m.id) === String(bulkAssignee));
      if (!member?.email) {
        alert('Pick a team member');
        return;
      }
      payload.assignee = {
        email: member.email,
        name: member.displayName || displayNameFromEmail(member.email),
        roleLabel: member.role || null
      };
    }
    if (bulkStatus) payload.status = bulkStatus;
    if (payload.dueAt === undefined && payload.assignee === undefined && !payload.status) {
      alert('Choose a date, person, or status to apply to the selected items.');
      return;
    }
    setBulkSaving(true);
    try {
      console.log('[DdChecklist] bulk apply', {
        count: itemIds.length,
        dueAt: payload.dueAt || null,
        assignee: payload.assignee?.email || (payload.assignee === null ? 'cleared' : null),
        status: payload.status || null
      });
      const data = await crmAPI.patchDdItemsBulk(dealId, payload);
      setChecklist(data.checklist);
      onRefresh?.();
    } catch (err) {
      alert('Failed to update items: ' + err.message);
    } finally {
      setBulkSaving(false);
    }
  };

  const handleAddGroup = () => {
    if (showAddGroup) {
      setShowAddGroup(false);
      setNewGroupName('');
      return;
    }
    setShowAddGroup(true);
    setNewGroupName('');
  };

  const handleAddGroupSubmit = async () => {
    const name = newGroupName.trim();
    if (!name || addingGroup) return;
    setAddingGroup(true);
    try {
      const data = await crmAPI.addDdGroup(dealId, name);
      setChecklist(data.checklist);
      setNewGroupName('');
      setShowAddGroup(false);
      onRefresh?.();
    } catch (err) {
      alert('Failed to add group: ' + err.message);
    } finally {
      setAddingGroup(false);
    }
  };

  const cancelAddGroup = () => {
    setShowAddGroup(false);
    setNewGroupName('');
  };

  const handleAddItem = (groupId) => {
    if (addingItemGroupId === groupId) {
      setAddingItemGroupId(null);
      setNewItemTitle('');
      return;
    }
    setAddingItemGroupId(groupId);
    setNewItemTitle('');
  };

  const handleAddItemSubmit = async (groupId) => {
    const title = newItemTitle.trim();
    if (!title || addingItem) return;
    setAddingItem(true);
    try {
      const data = await crmAPI.addDdItem(dealId, groupId, { title });
      setChecklist(data.checklist);
      setAddingItemGroupId(null);
      setNewItemTitle('');
      onRefresh?.();
    } catch (err) {
      alert('Failed to add item: ' + err.message);
    } finally {
      setAddingItem(false);
    }
  };

  const cancelAddItem = () => {
    setAddingItemGroupId(null);
    setNewItemTitle('');
  };

  const handleDocLink = async (itemId) => {
    const filename = window.prompt('Document name or link label');
    if (!filename?.trim()) return;
    const storageKey = window.prompt('URL or file reference (optional)') || filename;
    try {
      const data = await crmAPI.addDdItemDocument(dealId, itemId, { filename: filename.trim(), storageKey });
      setChecklist(data.checklist);
    } catch (err) {
      alert('Failed to add document: ' + err.message);
    }
  };

  const openShareForm = (mode = 'view_only') => {
    const allIds = (checklist?.groups || []).map((g) => g.id);
    setShareForm({
      open: true,
      mode,
      label: '',
      password: '',
      expiresAt: defaultShareExpiryDate(),
      selectedGroupIds: allIds
    });
  };

  const toggleShareGroup = (groupId) => {
    setShareForm((f) => {
      const id = Number(groupId);
      const has = f.selectedGroupIds.map(Number).includes(id);
      const selectedGroupIds = has
        ? f.selectedGroupIds.filter((g) => Number(g) !== id)
        : [...f.selectedGroupIds, id];
      return { ...f, selectedGroupIds };
    });
  };

  const handleShareSubmit = async () => {
    const allIds = (checklist?.groups || []).map((g) => Number(g.id));
    const selectedGroups = shareForm.selectedGroupIds.map(Number);
    const scoped =
      selectedGroups.length > 0 && selectedGroups.length < allIds.length ? selectedGroups : null;
    try {
      const data = await crmAPI.createDdShareLink(dealId, {
        label: shareForm.label || modeLabel(shareForm.mode),
        mode: shareForm.mode,
        password: shareForm.password || undefined,
        expiresAt: shareForm.expiresAt || undefined,
        groupIds: scoped
      });
      const url = `${window.location.origin}/dd/${data.link.token}`;
      setShareUrl(url);
      setShowShareLinks(true);
      await navigator.clipboard.writeText(url);
      alert('Share link copied to clipboard');
      setShareForm((f) => ({ ...f, open: false }));
      await load();
    } catch (err) {
      alert('Failed to create share link: ' + err.message);
    }
  };

  const handleRevokeLink = async (linkId) => {
    if (!window.confirm('Revoke this share link?')) return;
    try {
      await crmAPI.revokeDdShareLink(dealId, linkId);
      await load();
    } catch (err) {
      alert('Failed to revoke: ' + err.message);
    }
  };

  const renderAssigneeSelect = (item, className) => {
    const currentEmail = item.assignees?.[0]?.email || '';
    const memberId = memberIdForEmail(currentEmail);
    const selectValue = memberId || (currentEmail ? '__external__' : '');
    return (
      <select
        className={className}
        value={selectValue}
        onChange={(e) => {
          const v = e.target.value;
          if (v === '__external__') return;
          handleAssigneeChange(item.id, v);
        }}
        disabled={!canWrite || (members.length === 0 && !currentEmail)}
        aria-label={`Assignee for ${item.title}`}
        title={
          members.length === 0
            ? 'Team members appear when this deal is on a team workspace'
            : 'Assign a Vettr team member'
        }
      >
        <option value="">
          {members.length === 0 ? 'No team members' : 'Unassigned'}
        </option>
        {members.map((m) => (
          <option key={m.id} value={m.id}>
            {m.displayName || displayNameFromEmail(m.email)}
          </option>
        ))}
        {currentEmail && !memberId ? (
          <option value="__external__">
            {assigneeLabel(item.assignees[0])} (external)
          </option>
        ) : null}
      </select>
    );
  };

  const renderItemExtras = (item) => (
    <>
      {(item.comments || []).length > 0 ? (
        <ul className="dd-item__comments">
          {item.comments.map((comment) => (
            <li
              key={comment.id}
              className={`dd-item__comment${comment.isExternal ? ' dd-item__comment--external' : ''}`}
            >
              <span className="dd-item__comment-meta">
                {comment.authorName || comment.authorEmail || 'Unknown'}
                {comment.isExternal ? ' · portal' : ''}
                {comment.createdAt ? ` · ${formatDate(comment.createdAt)}` : ''}
              </span>
              <p className="dd-item__comment-body">{comment.body}</p>
            </li>
          ))}
        </ul>
      ) : null}
      {(item.documents || []).length > 0 ? (
        <ul className="dd-item__comments">
          {item.documents.map((doc) => (
            <li key={doc.id} className="dd-item__comment">
              <span className="dd-item__comment-meta">
                Document · {doc.filename}
                {doc.isExternal ? ' · external' : ''}
              </span>
              {doc.storageKey && doc.storageKey !== doc.filename ? (
                <p className="dd-item__comment-body">{doc.storageKey}</p>
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}
    </>
  );

  if (loading) return <p>Loading due diligence…</p>;
  if (error) return <p className="crm-panel--error">{error}</p>;

  if (!checklist) {
    const selectedTpl = templateOptions.find((t) => String(t.id) === String(selectedTemplateId));
    return (
      <div className="dd-start-prompt">
        <h3>Due Diligence</h3>
        <p>
          Start a checklist matched to this deal’s industry. You can change the template before starting.
        </p>
        {dealIndustry ? (
          <p className="crm-muted dd-start-prompt__hint">
            Deal industry: <strong>{dealIndustry}</strong>
            {suggestedLabel ? ` · suggested ${suggestedLabel}` : ''}
          </p>
        ) : (
          <p className="crm-muted dd-start-prompt__hint">
            No industry on this deal — defaulting to Generic Business Acquisition.
          </p>
        )}
        {templateOptions.length > 0 ? (
          <label className="dd-start-prompt__template">
            <span>Template</span>
            <select
              className="modal-input"
              value={selectedTemplateId}
              disabled={!canWrite || starting}
              onChange={(e) => setSelectedTemplateId(e.target.value)}
            >
              {templateOptions.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.label || t.name}
                  {t.itemCount != null ? ` (${t.itemCount} items)` : ''}
                </option>
              ))}
            </select>
          </label>
        ) : null}
        {selectedTpl ? (
          <p className="crm-muted dd-start-prompt__hint">
            Using <strong>{selectedTpl.label || selectedTpl.name}</strong>
            {selectedTpl.groupCount != null
              ? ` — ${selectedTpl.groupCount} groups, ${selectedTpl.itemCount} items`
              : ''}
            .
          </p>
        ) : null}
        <label className="dd-start-prompt__template">
          <span>Target diligence date (optional)</span>
          <input
            type="date"
            className="modal-input"
            value={targetDate}
            disabled={!canWrite || starting}
            onChange={(e) => setTargetDate(e.target.value)}
          />
        </label>
        <div className="dd-start-milestones">
          <p className="dd-start-milestones__label">Milestones — add a date to create a task</p>
          {milestones.map((row, index) => (
            <div key={index} className="dd-start-milestones__row">
              <input
                type="text"
                className="modal-input"
                value={row.title}
                disabled={!canWrite || starting}
                onChange={(e) => {
                  const next = milestones.map((m, i) => (i === index ? { ...m, title: e.target.value } : m));
                  setMilestones(next);
                }}
                aria-label={`Milestone ${index + 1} title`}
              />
              <input
                type="date"
                className="modal-input"
                value={row.dueAt}
                disabled={!canWrite || starting}
                onChange={(e) => {
                  const next = milestones.map((m, i) => (i === index ? { ...m, dueAt: e.target.value } : m));
                  setMilestones(next);
                }}
                aria-label={`Milestone ${index + 1} date`}
              />
            </div>
          ))}
        </div>
        <button
          type="button"
          className="btn-primary"
          disabled={starting || !canWrite}
          onClick={handleStart}
        >
          {starting ? 'Starting…' : 'Start DD checklist'}
        </button>
        {!canWrite ? <p className="crm-muted">Viewer role — DD is read-only.</p> : null}
      </div>
    );
  }

  const progress = checklist.progress || {};
  const selectedCount = selected.size;

  return (
    <div className="dd-checklist">
      <header className="dd-checklist__header">
        <div>
          <h3>Due Diligence</h3>
          <p className="dd-checklist__progress">
            {progress.percent ?? 0}% complete
            {progress.overdueItems ? ` · ${progress.overdueItems} overdue` : ''}
            {checklist.target_date ? ` · target ${formatDate(checklist.target_date)}` : ''}
          </p>
        </div>
        <div className="dd-checklist__actions">
          <div className="dd-view-toggle panel-position-toggle" role="tablist" aria-label="Due diligence view">
            <button
              type="button"
              role="tab"
              aria-selected={view === 'cards'}
              className={view === 'cards' ? 'active' : ''}
              onClick={() => handleViewChange('cards')}
            >
              Cards
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={view === 'list'}
              className={view === 'list' ? 'active' : ''}
              onClick={() => handleViewChange('list')}
            >
              List
            </button>
          </div>
          {canWrite ? (
            <button type="button" className="btn-secondary" onClick={() => openShareForm('view_only')}>
              Share link…
            </button>
          ) : (
            <span className="crm-muted">Viewer — read only</span>
          )}
          {(checklist.shareLinks || []).length > 0 ? (
            <button
              type="button"
              className={`btn-secondary${showShareLinks ? ' dd-group__add-item--active' : ''}`}
              aria-expanded={showShareLinks}
              onClick={() => {
                setShowShareLinks((open) => !open);
                console.log('[DdChecklist] share links', !showShareLinks);
              }}
            >
              {showShareLinks
                ? 'Hide links'
                : `Links (${checklist.shareLinks.length})`}
            </button>
          ) : null}
        </div>
      </header>

      {shareForm.open ? (
        <div className="dd-share-form">
          <label>
            Access
            <select
              value={shareForm.mode}
              onChange={(e) => setShareForm({ ...shareForm, mode: e.target.value })}
              className="modal-input"
            >
              <option value="view_only">View only — browse checklist</option>
              <option value="collaborative">Collaborate — update status, comment, upload</option>
            </select>
          </label>
          <label>
            Label (who is this for?)
            <input
              className="modal-input"
              value={shareForm.label}
              onChange={(e) => setShareForm({ ...shareForm, label: e.target.value })}
              placeholder="Seller attorney"
            />
          </label>
          <label>
            Password (optional)
            <input
              type="password"
              className="modal-input"
              value={shareForm.password}
              onChange={(e) => setShareForm({ ...shareForm, password: e.target.value })}
            />
          </label>
          <label>
            Expires
            <input
              type="date"
              className="modal-input"
              value={shareForm.expiresAt}
              onChange={(e) => setShareForm({ ...shareForm, expiresAt: e.target.value })}
            />
          </label>
          <fieldset className="dd-share-form__groups">
            <legend>Sections to include</legend>
            <p className="crm-muted dd-share-form__hint">
              Uncheck sections to share a scoped link. All selected = full checklist.
            </p>
            {(checklist.groups || []).map((g) => (
              <label key={g.id} className="dd-share-form__check">
                <input
                  type="checkbox"
                  checked={shareForm.selectedGroupIds.map(Number).includes(Number(g.id))}
                  onChange={() => toggleShareGroup(g.id)}
                />
                <span>{g.name}</span>
              </label>
            ))}
          </fieldset>
          <div className="dd-share-form__actions">
            <button type="button" className="btn-primary" onClick={handleShareSubmit}>
              Create &amp; copy link
            </button>
            <button
              type="button"
              className="btn-secondary"
              onClick={() => setShareForm((f) => ({ ...f, open: false }))}
            >
              Cancel
            </button>
          </div>
        </div>
      ) : null}

      {showShareLinks && (checklist.shareLinks || []).length > 0 ? (
        <div className="dd-share-links-panel">
          {shareUrl ? (
            <p className="dd-share-url">
              Latest link: <a href={shareUrl} target="_blank" rel="noopener noreferrer">{shareUrl}</a>
            </p>
          ) : null}
          <ul className="dd-share-links">
            {checklist.shareLinks.map((link) => (
              <li key={link.id} className="dd-share-links__item">
                <div className="dd-share-links__meta">
                  <strong>{link.label}</strong>
                  {' · '}
                  {modeLabel(link.mode)}
                  {link.hasPassword ? ' · password' : ''}
                  {link.groupIds?.length ? ` · ${link.groupIds.length} sections` : ' · all sections'}
                  {link.expiresAt ? ` · expires ${formatDate(link.expiresAt)}` : ''}
                  {link.accessCount ? ` · ${link.accessCount} opens` : ''}
                </div>
                {(link.recentAccess || []).length > 0 ? (
                  <ul className="dd-share-links__access">
                    {link.recentAccess.slice(0, 4).map((a, idx) => (
                      <li key={`${link.id}-${idx}`}>
                        {a.action}
                        {a.guestName ? ` · ${a.guestName}` : ''}
                        {a.createdAt ? ` · ${formatDate(a.createdAt)}` : ''}
                      </li>
                    ))}
                  </ul>
                ) : null}
                <button type="button" className="btn-secondary btn-secondary--sm" onClick={() => handleRevokeLink(link.id)}>
                  Revoke
                </button>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {selectedCount > 0 ? (
        <div className="dd-bulk-bar">
          <strong>{selectedCount} selected</strong>
          <button
            type="button"
            className="btn-secondary btn-secondary--sm"
            onClick={() => {
              setSelected(new Set(allItemIds));
              setAnchorId(allItemIds[0] || null);
            }}
          >
            Select all
          </button>
          <button
            type="button"
            className="btn-secondary btn-secondary--sm"
            onClick={() => {
              setSelected(new Set());
              setAnchorId(null);
            }}
          >
            Clear
          </button>
          {canWrite ? (
            <>
              <label className="dd-bulk-bar__field">
                <span>Due</span>
                <input
                  type="date"
                  className="modal-input"
                  value={bulkDue}
                  onChange={(e) => setBulkDue(e.target.value)}
                  aria-label="Bulk due date"
                />
              </label>
              <label className="dd-bulk-bar__field">
                <span>Assign</span>
                <select
                  className="modal-input"
                  value={bulkAssignee}
                  onChange={(e) => setBulkAssignee(e.target.value)}
                  disabled={members.length === 0}
                  aria-label="Bulk assignee"
                >
                  <option value="">Keep assignee</option>
                  <option value="__unassign__">Unassigned</option>
                  {members.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.displayName || displayNameFromEmail(m.email)}
                    </option>
                  ))}
                </select>
              </label>
              <label className="dd-bulk-bar__field">
                <span>Status</span>
                <select
                  className="modal-input"
                  value={bulkStatus}
                  onChange={(e) => setBulkStatus(e.target.value)}
                  aria-label="Bulk status"
                >
                  <option value="">Keep status</option>
                  {DD_STATUSES.map((s) => (
                    <option key={s.value} value={s.value}>{s.label}</option>
                  ))}
                </select>
              </label>
              <button
                type="button"
                className="btn-primary"
                disabled={bulkSaving}
                onClick={handleBulkApply}
              >
                {bulkSaving ? 'Applying…' : 'Apply'}
              </button>
            </>
          ) : null}
        </div>
      ) : (
        <p className="crm-muted dd-select-hint">
          Drag to select · Shift-click a range · ⌘-click to toggle · then assign dates and people
        </p>
      )}

      <div className="dd-add-group">
        <button
          type="button"
          className={`btn-secondary${showAddGroup ? ' dd-group__add-item--active' : ''}`}
          onClick={handleAddGroup}
        >
          {showAddGroup ? 'Cancel' : '+ Group'}
        </button>
      </div>

      {showAddGroup ? (
        <div className="dd-add-item-form dd-add-group-form">
          <input
            type="text"
            className="modal-input"
            placeholder="New group name"
            value={newGroupName}
            onChange={(e) => setNewGroupName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleAddGroupSubmit();
              if (e.key === 'Escape') cancelAddGroup();
            }}
            autoFocus
            aria-label="New group name"
          />
          <button
            type="button"
            className="btn-primary"
            disabled={addingGroup || !newGroupName.trim()}
            onClick={handleAddGroupSubmit}
          >
            {addingGroup ? 'Adding…' : 'Add group'}
          </button>
        </div>
      ) : null}

      <div
        ref={workspaceRef}
        className={`dd-workspace dd-workspace--${view}`}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerCancel}
      >
        {view === 'list' ? <DdListHead /> : null}
        {(checklist.groups || []).map((group) => {
          const done = (group.items || []).filter((i) => i.status === 'complete' || i.status === 'na').length;
          const total = (group.items || []).length;
          const groupIds = (group.items || []).map((i) => String(i.id));
          const allOn = total > 0 && groupIds.every((id) => selected.has(id));
          const someOn = groupIds.some((id) => selected.has(id));
          return (
            <section key={group.id} className="dd-group">
              <h4 className="dd-group__title">
                <label className="dd-group__select">
                  <input
                    type="checkbox"
                    checked={allOn}
                    ref={(el) => {
                      if (el) el.indeterminate = someOn && !allOn;
                    }}
                    onChange={() => toggleGroupSelected(group)}
                    aria-label={`Select all in ${group.name}`}
                  />
                </label>
                <DdFolderIcon />
                {group.name} <span>({done}/{total})</span>
                <button
                  type="button"
                  className={`btn-secondary dd-group__add-item${addingItemGroupId === group.id ? ' dd-group__add-item--active' : ''}`}
                  onClick={() => handleAddItem(group.id)}
                >
                  {addingItemGroupId === group.id ? 'Cancel' : '+ Item'}
                </button>
              </h4>
              {addingItemGroupId === group.id ? (
                <div className="dd-add-item-form">
                  <input
                    type="text"
                    className="modal-input"
                    placeholder="Checklist item title"
                    value={newItemTitle}
                    onChange={(e) => setNewItemTitle(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') handleAddItemSubmit(group.id);
                      if (e.key === 'Escape') cancelAddItem();
                    }}
                    autoFocus
                    aria-label="New checklist item title"
                  />
                  <button
                    type="button"
                    className="btn-primary"
                    disabled={addingItem || !newItemTitle.trim()}
                    onClick={() => handleAddItemSubmit(group.id)}
                  >
                    {addingItem ? 'Adding…' : 'Add'}
                  </button>
                </div>
              ) : null}
              {view === 'cards' ? (
                <ul className="dd-icon-grid">
                  {(group.items || []).map((item) => (
                    <DdIconCard
                      key={item.id}
                      item={item}
                      selected={selected.has(String(item.id))}
                      meta={iconMeta(item, assigneeLabel)}
                      onOpenDoc={item.requests_document && canWrite ? handleDocLink : null}
                    />
                  ))}
                </ul>
              ) : (
                <ul className="dd-item-list dd-item-list--table">
                  {(group.items || []).map((item) => {
                    const isOn = selected.has(String(item.id));
                    return (
                      <li
                        key={item.id}
                        data-dd-item-id={item.id}
                        className={`dd-list-row${isOn ? ' is-selected' : ''}`}
                        aria-selected={isOn}
                      >
                        <label className="dd-list-row__check">
                          <input
                            type="checkbox"
                            checked={isOn}
                            onChange={(e) => {
                              const next = new Set(selected);
                              const key = String(item.id);
                              if (e.target.checked) next.add(key);
                              else next.delete(key);
                              setSelected(next);
                              setAnchorId(key);
                            }}
                            aria-label={`Select ${item.title}`}
                          />
                        </label>
                        <div className="dd-list-row__item">
                          <span className="dd-item__title">{item.title}</span>
                          {item.requests_document ? <span className="dd-item__badge">Doc</span> : null}
                        </div>
                        <input
                          type="date"
                          className="modal-input dd-item__due-input"
                          value={item.due_at ? item.due_at.slice(0, 10) : ''}
                          onChange={(e) => handleDueChange(item.id, dueToIso(e.target.value))}
                          aria-label={`Due date for ${item.title}`}
                          disabled={!canWrite}
                        />
                        {renderAssigneeSelect(item, 'modal-input dd-item__assignee')}
                        <select
                          className="modal-input dd-item__status"
                          value={item.status}
                          onChange={(e) => handleStatusChange(item.id, e.target.value)}
                          disabled={!canWrite}
                          aria-label={`Status for ${item.title}`}
                        >
                          {DD_STATUSES.map((s) => (
                            <option key={s.value} value={s.value}>{s.label}</option>
                          ))}
                        </select>
                        {item.requests_document ? (
                          <button type="button" className="btn-secondary btn-secondary--sm" onClick={() => handleDocLink(item.id)}>+ Doc</button>
                        ) : (
                          <span />
                        )}
                        {renderItemExtras(item)}
                      </li>
                    );
                  })}
                </ul>
              )}
            </section>
          );
        })}
        {marquee ? (
          <div
            className="dd-marquee"
            style={{
              left: marquee.left,
              top: marquee.top,
              width: marquee.right - marquee.left,
              height: marquee.bottom - marquee.top
            }}
          />
        ) : null}
      </div>
    </div>
  );
}
