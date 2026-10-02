import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { crmAPI } from '../../../utils/api';
import { useAuth } from '../../../context/AuthContext.jsx';
import { formatDate } from '../../../utils/normalizeDeal';
import { applyClickSelection } from './ddSelection.js';
import useDdMarquee from './useDdMarquee.js';
import { DdFolderIcon, DdIconCard, DdListHead } from './DdItemViews.jsx';
import DdGantt from './DdGantt.jsx';
import { blockedLabel, blockedTooltip, canSetStatus } from './ddBlocked.js';
import { GANTT_STAGES, customGroupId, groupMatchesStage, milestoneKeyForGroup, stageIdForGroup } from './ddGantt.js';

function GroupName({ group, canWrite, onRename }) {
  const editable = canWrite && stageIdForGroup(group.name) === 'custom';
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(group.name || '');

  useEffect(() => {
    if (!editing) setValue(group.name || '');
  }, [group.name, editing]);

  if (!editable) return group.name;

  const commit = async () => {
    const next = value.trim();
    if (!next || next === group.name) {
      setValue(group.name || '');
      setEditing(false);
      return;
    }
    try {
      await onRename(group.id, next);
      setEditing(false);
    } catch (err) {
      console.error('[DdChecklist] group rename failed', err);
      setValue(group.name || '');
      setEditing(false);
    }
  };

  if (editing) {
    return (
      <input
        type="text"
        className="modal-input dd-group__name-input"
        value={value}
        maxLength={255}
        aria-label="Group name"
        autoFocus
        onChange={(e) => setValue(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            e.currentTarget.blur();
          }
          if (e.key === 'Escape') {
            setValue(group.name || '');
            setEditing(false);
          }
        }}
        onPointerDown={(e) => e.stopPropagation()}
      />
    );
  }

  return (
    <button
      type="button"
      className="dd-group__name"
      title="Rename this group"
      onClick={() => setEditing(true)}
    >
      {group.name}
    </button>
  );
}

const CHART_HEIGHT_KEY = 'vettr.dd.chartHeight';
const CHART_HIDDEN_KEY = 'vettr.dd.chartHidden';
const CHART_MIN = 140;
const TASK_MIN = 180;
const CHART_DEFAULT = 280;

function readChartHeight() {
  try {
    const stored = window.localStorage.getItem(CHART_HEIGHT_KEY);
    if (stored == null || stored === '') return CHART_DEFAULT;
    const raw = Number(stored);
    if (!Number.isFinite(raw)) return CHART_DEFAULT;
    const cap = Math.max(CHART_MIN, Math.round(window.innerHeight * 0.55));
    return Math.min(cap, Math.max(CHART_MIN, Math.round(raw)));
  } catch (err) {
    console.error('[DdChecklist] chart height unreadable', err);
    return CHART_DEFAULT;
  }
}

function readChartHidden() {
  try {
    return window.localStorage.getItem(CHART_HIDDEN_KEY) === '1';
  } catch (err) {
    console.error('[DdChecklist] chart visibility unreadable', err);
    return false;
  }
}

function saveChartHidden(hidden) {
  try {
    window.localStorage.setItem(CHART_HIDDEN_KEY, hidden ? '1' : '0');
    console.log('[DdChecklist] chart', hidden ? 'hidden' : 'shown');
  } catch (err) {
    console.error('[DdChecklist] chart visibility not saved', err);
  }
}

function saveChartHeight(height) {
  try {
    window.localStorage.setItem(CHART_HEIGHT_KEY, String(height));
    console.log('[DdChecklist] chart height', height);
  } catch (err) {
    console.error('[DdChecklist] chart height not saved', err);
  }
}

const DEFAULT_MILESTONES = [
  { title: 'Request data room / remaining docs', dueAt: '' },
  { title: 'First diligence review', dueAt: '' },
  { title: 'Go / no-go decision', dueAt: '' }
];

const DD_STATUSES = [
  { value: 'not_started', label: 'Not started' },
  { value: 'in_progress', label: 'In progress' },
  { value: 'waiting_on_other', label: 'Waiting' },
  { value: 'blocked', label: 'Blocked' },
  { value: 'complete', label: 'Complete' },
  { value: 'na', label: 'N/A' }
];

const KANBAN_STATUSES = DD_STATUSES.filter((status) => status.value !== 'na');

const VIEW_KEY = 'vettr.ddChecklist.view';
const WORK_VIEW_KEY = 'vettr.ddChecklist.workspaceView';

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
    return v === 'list' || v === 'cards' || v === 'gantt' ? v : 'cards';
  } catch {
    return 'cards';
  }
}

function readWorkView() {
  try {
    return localStorage.getItem(WORK_VIEW_KEY) === 'list' ? 'list' : 'kanban';
  } catch {
    return 'kanban';
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
  const blocked = blockedLabel(item);
  const base = due ? `${name.split(' ')[0]} · ${due}` : name.split(' ')[0];
  return blocked ? `${base} · ${blocked}` : base;
}

const STATUS_SORT_RANK = {
  not_started: 0,
  blocked: 1,
  waiting_on_other: 2,
  in_progress: 3,
  complete: 4,
  na: 5
};

function compareDdItems(a, b, sort, assigneeLabel) {
  const key = sort?.key;
  const desc = sort?.dir === 'desc';
  const tie = (a.sort_order ?? 0) - (b.sort_order ?? 0) || String(a.id).localeCompare(String(b.id));
  if (key === 'item') {
    const cmp = String(a.title || '').localeCompare(String(b.title || ''), undefined, { sensitivity: 'base' });
    return (cmp || tie) * (desc ? -1 : 1);
  }
  if (key === 'due') {
    const ad = a.due_at ? Date.parse(a.due_at) : NaN;
    const bd = b.due_at ? Date.parse(b.due_at) : NaN;
    const aMissing = Number.isNaN(ad);
    const bMissing = Number.isNaN(bd);
    if (aMissing || bMissing) {
      if (aMissing && bMissing) return tie;
      return aMissing ? 1 : -1;
    }
    return ((ad - bd) || tie) * (desc ? -1 : 1);
  }
  if (key === 'assigned') {
    const an = assigneeLabel(a.assignees?.[0]) || '';
    const bn = assigneeLabel(b.assignees?.[0]) || '';
    if (!an || !bn) {
      if (!an && !bn) return tie;
      if (desc) return !an ? 1 : -1;
      return !an ? -1 : 1;
    }
    const cmp = an.localeCompare(bn, undefined, { sensitivity: 'base' });
    return (cmp || tie) * (desc ? -1 : 1);
  }
  if (key === 'status') {
    const cmp = (STATUS_SORT_RANK[a.status] ?? 99) - (STATUS_SORT_RANK[b.status] ?? 99);
    return (cmp || tie) * (desc ? -1 : 1);
  }
  return tie;
}

function sortDdItems(items, sort, assigneeLabel) {
  const list = [...(items || [])];
  if (!sort?.key) return list;
  list.sort((a, b) => compareDdItems(a, b, sort, assigneeLabel));
  return list;
}

function sortDdGroups(groups, sort, assigneeLabel) {
  const list = [...(groups || [])];
  if (!sort?.key) return list;
  list.sort((ga, gb) => {
    const ia = sortDdItems(ga.items, sort, assigneeLabel)[0];
    const ib = sortDdItems(gb.items, sort, assigneeLabel)[0];
    if (!ia && !ib) return String(ga.name || '').localeCompare(String(gb.name || ''));
    if (!ia) return 1;
    if (!ib) return -1;
    return compareDdItems(ia, ib, sort, assigneeLabel)
      || String(ga.name || '').localeCompare(String(gb.name || ''));
  });
  return list;
}

function MilestoneDates({ label, stageId, startOn, dueOn, disabled, onChange }) {
  const [draft, setDraft] = useState({ startOn: startOn || '', dueOn: dueOn || '' });

  useEffect(() => {
    setDraft({ startOn: startOn || '', dueOn: dueOn || '' });
  }, [startOn, dueOn, stageId]);

  const commit = (field, value) => {
    const next = value || '';
    if (draft[field] === next) return;
    setDraft((prev) => ({ ...prev, [field]: next }));
    const patch = { [field]: next || null };
    console.log('[DdChecklist] milestone input', stageId, patch);
    onChange(stageId, patch);
  };

  return (
    <div className="dd-group__dates">
      <label>
        Start
        <input
          type="date"
          className="modal-input"
          value={draft.startOn}
          disabled={disabled}
          aria-label={`Start date for ${label}`}
          onPointerDown={(e) => e.stopPropagation()}
          onChange={(e) => commit('startOn', e.target.value)}
          onBlur={(e) => commit('startOn', e.target.value)}
        />
      </label>
      <label>
        End
        <input
          type="date"
          className="modal-input"
          value={draft.dueOn}
          disabled={disabled}
          aria-label={`End date for ${label}`}
          onPointerDown={(e) => e.stopPropagation()}
          onChange={(e) => commit('dueOn', e.target.value)}
          onBlur={(e) => commit('dueOn', e.target.value)}
        />
      </label>
    </div>
  );
}

function kanbanColumnFor(status) {
  return status === 'na' ? 'complete' : status;
}

function itemMatchesKanbanAssignee(item, filter, myEmail) {
  const email = String(item.assignees?.[0]?.email || '').trim().toLowerCase();
  if (filter === 'all') return true;
  if (filter === 'unassigned') return !email;
  if (filter === 'mine') return Boolean(myEmail) && email === myEmail;
  return email === filter;
}

export default function DdChecklist({ dealId, dealName = '', onRefresh, canWrite = true, workspace = false }) {
  const { user } = useAuth() || {};
  const myEmail = String(user?.email || '').trim().toLowerCase();
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
  const [summaryForm, setSummaryForm] = useState({
    open: false,
    audience: 'internal',
    recipients: '',
    sending: false,
    result: ''
  });
  const [view, setView] = useState(readStoredView);
  const [workView, setWorkView] = useState(readWorkView);
  const [linkingId, setLinkingId] = useState(null);
  const [stageFocus, setStageFocus] = useState(null);
  const [listSort, setListSort] = useState({ key: null, dir: 'asc' });
  const [kanbanCategory, setKanbanCategory] = useState('all');
  const [kanbanStatus, setKanbanStatus] = useState('all');
  const [kanbanAssignee, setKanbanAssignee] = useState('all');
  const [kanbanSort, setKanbanSort] = useState({ key: null, dir: 'asc' });
  const [selected, setSelected] = useState(() => new Set());
  const [anchorId, setAnchorId] = useState(null);
  const workspaceRef = useRef(null);
  const splitDrag = useRef(null);
  const [chartHeight, setChartHeight] = useState(readChartHeight);
  const [chartHidden, setChartHidden] = useState(readChartHidden);

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
  }, [dealId]);

  useEffect(() => {
    if (workView !== 'kanban' || !checklist?.groups) return;
    const counts = {};
    for (const status of KANBAN_STATUSES) counts[status.label] = 0;
    for (const group of checklist.groups) {
      for (const item of group.items || []) {
        const column = kanbanColumnFor(item.status);
        const label = KANBAN_STATUSES.find((status) => status.value === column)?.label || item.status;
        counts[label] = (counts[label] || 0) + 1;
      }
    }
    console.log('[DdChecklist] kanban columns', counts);
  }, [workView, checklist]);

  const allItemIds = useMemo(() => {
    const ids = [];
    for (const group of checklist?.groups || []) {
      for (const item of group.items || []) ids.push(String(item.id));
    }
    return ids;
  }, [checklist]);

  const dependencyChoices = useMemo(() => {
    const rows = [];
    for (const group of checklist?.groups || []) {
      for (const item of group.items || []) {
        rows.push({ id: item.id, title: item.title, group: group.name });
      }
    }
    return rows;
  }, [checklist]);

  const handleViewChange = (next) => {
    setView(next);
    try { localStorage.setItem(VIEW_KEY, next); } catch { /* ignore */ }
    console.log('[DdChecklist] view', next);
  };

  const handleWorkViewChange = (next) => {
    setWorkView(next);
    try { localStorage.setItem(WORK_VIEW_KEY, next); } catch { /* ignore */ }
    console.log('[DdChecklist] workspace view', next);
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

  const saveItemPatch = async (itemId, payload, failMessage) => {
    const key = String(itemId);
    const bulk = selected.size > 1 && selected.has(key);
    const itemIds = bulk
      ? [...selected].map(Number).filter((n) => Number.isInteger(n) && n > 0)
      : null;
    try {
      console.log('[DdChecklist] item patch', {
        itemId,
        count: itemIds?.length || 1,
        payload
      });
      const data = itemIds
        ? await crmAPI.patchDdItemsBulk(dealId, { itemIds, ...payload })
        : await crmAPI.patchDdItem(dealId, itemId, payload);
      setChecklist(data.checklist);
      return bulk;
    } catch (err) {
      console.error('[DdChecklist] item patch failed', err);
      alert(failMessage + (err.message || 'unknown error'));
      return null;
    }
  };

  const handleStatusChange = async (itemId, status) => {
    const bulk = await saveItemPatch(itemId, { status }, 'Failed to update item: ');
    if (bulk !== null) onRefresh?.();
  };

  const handleMilestoneDate = async (stageId, patch) => {
    if (!canWrite) return;
    const snapshot = checklist;
    setChecklist((prev) => {
      if (!prev) return prev;
      const rows = (prev.milestones || []).map((row) => ({ ...row }));
      const index = rows.findIndex((row) => row.stageId === stageId);
      const current = index >= 0 ? rows[index] : { stageId, startOn: null, dueOn: null };
      const next = { ...current };
      if (Object.prototype.hasOwnProperty.call(patch, 'startOn')) next.startOn = patch.startOn;
      if (Object.prototype.hasOwnProperty.call(patch, 'dueOn')) next.dueOn = patch.dueOn;
      if (index >= 0) rows[index] = next;
      else rows.push(next);
      return { ...prev, milestones: rows };
    });
    try {
      const data = await crmAPI.setDdMilestone(dealId, { stageId, ...patch });
      setChecklist(data.checklist);
      const saved = (data.checklist?.milestones || []).find((row) => row.stageId === stageId);
      console.log('[DdChecklist] milestone', stageId, patch, saved || null);
    } catch (err) {
      console.error('[DdChecklist] milestone failed', err);
      if (snapshot) setChecklist(snapshot);
      alert(err.message || 'Failed to set milestone date');
    }
  };

  const datesForStage = (stageId) => {
    const rows = checklist?.milestones || [];
    const own = rows.find((row) => row.stageId === stageId);
    const shared = String(stageId).startsWith('g:')
      ? rows.find((row) => row.stageId === 'custom')
      : null;
    return {
      startOn: own?.startOn || (!own?.dueOn ? shared?.startOn : '') || '',
      dueOn: own?.dueOn || shared?.dueOn || ''
    };
  };

  const handleDueChange = async (itemId, dueAt) => {
    const bulk = await saveItemPatch(itemId, { dueAt: dueAt || null }, 'Failed to set due date: ');
    if (bulk) onRefresh?.();
  };

  const handleLinkPredecessor = async (successorId, predecessorId) => {
    if (!canWrite || !predecessorId) return;
    try {
      const data = await crmAPI.linkDdDependency(dealId, {
        predecessorId: Number(predecessorId),
        successorId: Number(successorId)
      });
      setChecklist(data.checklist);
      console.log('[DdChecklist] linked', { predecessorId, successorId });
    } catch (err) {
      alert(err.message || 'Failed to link predecessor');
    }
  };

  const handleUnlinkPredecessor = async (successorId, predecessorId) => {
    if (!canWrite) return;
    try {
      const data = await crmAPI.unlinkDdDependency(dealId, {
        predecessorId: Number(predecessorId),
        successorId: Number(successorId)
      });
      setChecklist(data.checklist);
      console.log('[DdChecklist] unlinked', { predecessorId, successorId });
    } catch (err) {
      alert(err.message || 'Failed to remove predecessor');
    }
  };

  const handleAssigneeChange = async (itemId, memberId) => {
    if (!canWrite) return;
    let assignee = null;
    if (memberId) {
      const member = members.find((m) => String(m.id) === String(memberId));
      if (!member?.email) return;
      assignee = {
        email: member.email,
        name: member.displayName || displayNameFromEmail(member.email),
        roleLabel: member.role || null
      };
    }
    const bulk = await saveItemPatch(itemId, { assignee }, 'Failed to assign: ');
    if (bulk) onRefresh?.();
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

  const handleAddGroup = () => {
    if (showAddGroup) {
      setShowAddGroup(false);
      setNewGroupName('');
      return;
    }
    setShowAddGroup(true);
    setNewGroupName('');
  };

  const handleRenameGroup = async (groupId, name) => {
    const trimmed = String(name || '').trim();
    if (!trimmed || !dealId) return;
    console.log('[DdChecklist] rename group', groupId, trimmed);
    try {
      const data = await crmAPI.renameDdGroup(dealId, groupId, trimmed);
      setChecklist(data.checklist);
      onRefresh?.();
    } catch (err) {
      alert('Failed to rename group: ' + (err.message || 'unknown error'));
      throw err;
    }
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

  const assigneeEmailList = () => {
    const emails = new Set();
    for (const group of checklist?.groups || []) {
      for (const item of group.items || []) {
        for (const assignee of item.assignees || []) {
          const email = String(assignee.email || '').trim();
          if (email) emails.add(email);
        }
      }
    }
    return [...emails].join('\n');
  };

  const openSummaryForm = () => {
    setShareForm((f) => ({ ...f, open: false }));
    const assigned = assigneeEmailList();
    setSummaryForm({
      open: true,
      audience: 'internal',
      recipients: assigned,
      sending: false,
      result: ''
    });
    console.log('[DdChecklist] open summary email', { dealId, assigned: Boolean(assigned) });
  };

  const setSummaryAudience = (audience) => {
    setSummaryForm((f) => {
      const assigned = assigneeEmailList();
      let recipients = f.recipients;
      if (audience === 'internal' && !recipients.trim()) recipients = assigned;
      if (audience === 'external' && recipients.trim() === assigned.trim()) recipients = '';
      return { ...f, audience, recipients, result: '' };
    });
  };

  const handleSummarySend = async () => {
    const recipients = summaryForm.recipients;
    if (!recipients.trim()) {
      alert('Add at least one email address');
      return;
    }
    setSummaryForm((f) => ({ ...f, sending: true, result: '' }));
    try {
      const result = await crmAPI.sendDdSummaryEmail(dealId, {
        audience: summaryForm.audience,
        recipients
      });
      console.log('[DdChecklist] summary email', result);
      if (result.notConfigured) {
        setSummaryForm((f) => ({
          ...f,
          sending: false,
          result: 'Email is not configured on this server, so nothing was sent.'
        }));
        return;
      }
      const sent = result.delivered?.length || 0;
      const failed = result.failed?.length || 0;
      setSummaryForm((f) => ({
        ...f,
        sending: false,
        result: failed
          ? `Sent to ${sent}. Could not send to ${failed}.`
          : `Sent to ${sent} ${sent === 1 ? 'person' : 'people'}.`
      }));
    } catch (err) {
      console.error('[DdChecklist] summary email failed', err);
      setSummaryForm((f) => ({ ...f, sending: false, result: '' }));
      alert(err.message || 'Failed to send the summary');
    }
  };

  const openShareForm = (mode = 'view_only') => {
    const allIds = (checklist?.groups || []).map((g) => g.id);
    setSummaryForm((f) => ({ ...f, open: false }));
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

  const renderKanbanBoard = () => {
    const cards = [];
    for (const group of groupsForWork) {
      if (kanbanCategory !== 'all' && String(group.id) !== kanbanCategory) continue;
      for (const item of group.items || []) {
        if (kanbanStatus !== 'all' && kanbanColumnFor(item.status) !== kanbanStatus) continue;
        if (!itemMatchesKanbanAssignee(item, kanbanAssignee, myEmail)) continue;
        cards.push({ item, group });
      }
    }
    const columns = kanbanStatus === 'all'
      ? KANBAN_STATUSES
      : KANBAN_STATUSES.filter((status) => status.value === kanbanStatus);
    return (
      <>
        <div className="dd-portal-board-tools dd-workspace-kanban__tools">
          <label>
            <span>Category</span>
            <select
              className="modal-input"
              value={kanbanCategory}
              onChange={(e) => {
                setKanbanCategory(e.target.value);
                console.log('[DdChecklist] kanban category', e.target.value);
              }}
            >
              <option value="all">All categories</option>
              {groupsForWork.map((group) => (
                <option key={group.id} value={String(group.id)}>{group.name}</option>
              ))}
            </select>
          </label>
          <label>
            <span>Status</span>
            <select
              className="modal-input"
              value={kanbanStatus}
              onChange={(e) => {
                setKanbanStatus(e.target.value);
                console.log('[DdChecklist] kanban status', e.target.value);
              }}
            >
              <option value="all">All statuses</option>
              {KANBAN_STATUSES.map((status) => (
                <option key={status.value} value={status.value}>{status.label}</option>
              ))}
            </select>
          </label>
          <label>
            <span>Assignee</span>
            <select
              className="modal-input"
              value={kanbanAssignee}
              onChange={(e) => {
                setKanbanAssignee(e.target.value);
                console.log('[DdChecklist] kanban assignee', e.target.value);
              }}
            >
              <option value="all">All assignees</option>
              <option value="mine">Assigned to me</option>
              <option value="unassigned">Unassigned</option>
              {members.map((member) => (
                <option key={member.id} value={String(member.email || '').trim().toLowerCase()}>
                  {member.displayName || displayNameFromEmail(member.email)}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span>Sort</span>
            <select
              className="modal-input"
              value={kanbanSort.key || ''}
              onChange={(e) => {
                const key = e.target.value || null;
                const next = { key, dir: 'asc' };
                setKanbanSort(next);
                console.log('[DdChecklist] kanban sort', next.key || 'checklist order', next.dir);
              }}
            >
              <option value="">Checklist order</option>
              <option value="assigned">Assignee</option>
              <option value="status">Status</option>
              <option value="due">Due date</option>
              <option value="item">Item</option>
            </select>
          </label>
          {kanbanSort.key ? (
            <button
              type="button"
              className="btn-secondary"
              aria-label={kanbanSort.dir === 'desc' ? 'Sort descending' : 'Sort ascending'}
              onClick={() => {
                setKanbanSort((prev) => {
                  const next = { ...prev, dir: prev.dir === 'asc' ? 'desc' : 'asc' };
                  console.log('[DdChecklist] kanban sort', next.key, next.dir);
                  return next;
                });
              }}
            >
              {kanbanSort.dir === 'desc' ? '↓' : '↑'}
            </button>
          ) : null}
        </div>
        <div className="dd-portal-board dd-workspace-kanban" aria-label="Due diligence kanban">
          {columns.map((status) => {
            const column = sortDdItems(
              cards
                .filter(({ item }) => kanbanColumnFor(item.status) === status.value)
                .map(({ item }) => item),
              kanbanSort,
              assigneeLabel
            );
            const byId = new Map(cards.map(({ item, group }) => [item.id, group]));
            return (
              <section key={status.value} className="dd-portal-column" data-status={status.value}>
                <header className="dd-portal-column__header">
                  <h2>{status.label}</h2>
                  <span>{column.length}</span>
                </header>
                <ul className="dd-portal-column__cards">
                  {column.map((item) => {
                    const group = byId.get(item.id);
                    return (
                      <li
                        key={item.id}
                        data-dd-item-id={item.id}
                        className={`dd-portal-card${item.blocked ? ' dd-portal-card--locked' : ''}${selected.has(String(item.id)) ? ' is-selected' : ''}`}
                        data-status={item.status}
                        title={blockedTooltip(item) || undefined}
                      >
                        <div className="dd-portal-card__top">
                          <label className="dd-list-row__check">
                            <input
                              type="checkbox"
                              checked={selected.has(String(item.id))}
                              onChange={(e) => {
                                const next = new Set(selected);
                                const key = String(item.id);
                                if (e.target.checked) next.add(key);
                                else next.delete(key);
                                setSelected(next);
                                setAnchorId(key);
                                console.log('[DdChecklist] kanban select', key, next.size);
                              }}
                              aria-label={`Select ${item.title}`}
                            />
                          </label>
                          <strong>{item.title}</strong>
                          {item.requests_document ? <span className="dd-item__badge">Doc</span> : null}
                          {item.blocked ? <span className="dd-dep__badge">{blockedLabel(item)}</span> : null}
                        </div>
                        <span className="dd-portal-card__group">{group?.name}</span>
                        <input
                          type="date"
                          className="modal-input dd-item__due-input"
                          value={item.due_at ? item.due_at.slice(0, 10) : ''}
                          onChange={(e) => handleDueChange(item.id, dueToIso(e.target.value))}
                          aria-label={`Due date for ${item.title}`}
                          disabled={!canWrite}
                        />
                        {renderAssigneeSelect(item, 'modal-input')}
                        <select
                          className="modal-input dd-item__status"
                          value={item.status}
                          onChange={(e) => handleStatusChange(item.id, e.target.value)}
                          disabled={!canWrite}
                          aria-label={`Status for ${item.title}`}
                        >
                          {DD_STATUSES.map((s) => (
                            <option
                              key={s.value}
                              value={s.value}
                              disabled={s.value !== item.status && !canSetStatus(item, s.value)}
                            >
                              {s.label}
                            </option>
                          ))}
                        </select>
                      </li>
                    );
                  })}
                </ul>
              </section>
            );
          })}
        </div>
      </>
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

  const clampChartHeight = (next, max) => Math.round(Math.min(max, Math.max(CHART_MIN, next)));

  const splitMax = (handle) => {
    const checklist = handle?.closest?.('.dd-checklist--workspace');
    const chart = checklist?.querySelector('.dd-workspace-split__chart');
    const tasks = checklist?.querySelector('.dd-workspace');
    if (!chart || !tasks) return Math.round(window.innerHeight * 0.55);
    const available = chart.getBoundingClientRect().height + tasks.getBoundingClientRect().height;
    return Math.max(CHART_MIN, available - TASK_MIN);
  };

  const onSplitPointerDown = (event) => {
    if (event.button != null && event.button !== 0) return;
    event.preventDefault();
    const chart = event.currentTarget.previousElementSibling;
    splitDrag.current = {
      startY: event.clientY,
      startH: chart?.getBoundingClientRect().height || chartHeight,
      max: splitMax(event.currentTarget)
    };
    document.body.style.cursor = 'row-resize';
    console.log('[DdChecklist] resize chart start', Math.round(splitDrag.current.startH));
    const move = (e) => {
      const drag = splitDrag.current;
      if (!drag) return;
      setChartHeight(clampChartHeight(drag.startH + (e.clientY - drag.startY), drag.max));
    };
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      if (!splitDrag.current) return;
      splitDrag.current = null;
      document.body.style.cursor = '';
      setChartHeight((height) => {
        saveChartHeight(height);
        return height;
      });
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    try {
      event.currentTarget.setPointerCapture(event.pointerId);
    } catch (err) {
      console.error('[DdChecklist] pointer capture', err);
    }
  };

  const onSplitKeyDown = (event) => {
    const step = event.shiftKey ? 80 : 32;
    if (event.key !== 'ArrowUp' && event.key !== 'ArrowDown' && event.key !== 'Home') return;
    event.preventDefault();
    const max = splitMax(event.currentTarget);
    setChartHeight((height) => {
      const next = event.key === 'Home'
        ? clampChartHeight(CHART_DEFAULT, max)
        : clampChartHeight(height + (event.key === 'ArrowDown' ? step : -step), max);
      saveChartHeight(next);
      return next;
    });
  };

  const progress = checklist.progress || {};
  const paneView = workspace ? workView : view;
  const namedFocusId = customGroupId(stageFocus);
  const focusedGroup = namedFocusId != null
    ? (checklist.groups || []).find((group) => Number(group.id) === namedFocusId)
    : null;
  const focusedStage = focusedGroup
    ? { id: stageFocus, label: focusedGroup.name }
    : (GANTT_STAGES.find((stage) => stage.id === stageFocus) || null);
  const groupsForWork = (checklist.groups || []).filter((group) => (
    !workspace || groupMatchesStage(group, stageFocus)
  ));
  const coveredStageIds = new Set((checklist.groups || []).map((group) => milestoneKeyForGroup(group)));
  const orphanStages = GANTT_STAGES.filter((stage) => (
    stage.id !== 'custom'
    && !coveredStageIds.has(stage.id)
    && (!stageFocus || stage.id === stageFocus)
  ));

  return (
    <div className={`dd-checklist${workspace ? ' dd-checklist--workspace' : ''}`}>
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
            {workspace ? (
              <>
                <button
                  type="button"
                  role="tab"
                  aria-selected={workView === 'kanban'}
                  className={workView === 'kanban' ? 'active' : ''}
                  onClick={() => handleWorkViewChange('kanban')}
                >
                  Kanban
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={workView === 'list'}
                  className={workView === 'list' ? 'active' : ''}
                  onClick={() => handleWorkViewChange('list')}
                >
                  List
                </button>
              </>
            ) : (
              <>
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
                <button
                  type="button"
                  role="tab"
                  aria-selected={view === 'gantt'}
                  className={view === 'gantt' ? 'active' : ''}
                  onClick={() => handleViewChange('gantt')}
                >
                  Gantt
                </button>
              </>
            )}
          </div>
          {canWrite ? (
            <>
              <button type="button" className="btn-secondary" onClick={() => openShareForm('view_only')}>
                Share link…
              </button>
              <button type="button" className="btn-secondary" onClick={openSummaryForm}>
                Email summary…
              </button>
            </>
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

      {summaryForm.open ? (
        <div className="dd-share-form">
          <div className="dd-portal-view-toggle panel-position-toggle" role="tablist" aria-label="Summary audience">
            <button
              type="button"
              role="tab"
              aria-selected={summaryForm.audience === 'internal'}
              className={summaryForm.audience === 'internal' ? 'active' : ''}
              onClick={() => setSummaryAudience('internal')}
            >
              Internal
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={summaryForm.audience === 'external'}
              className={summaryForm.audience === 'external' ? 'active' : ''}
              onClick={() => setSummaryAudience('external')}
            >
              External
            </button>
          </div>
          <p className="crm-muted">
            {summaryForm.audience === 'internal'
              ? 'Who owns each open item. Unassigned work is listed first. Assignee emails are filled in when they exist.'
              : 'For a bank, broker, or seller. Shows documents still needed, notes, due dates, and status. No assignee names.'}
          </p>
          <label>
            Send to
            <textarea
              className="modal-input"
              rows={3}
              value={summaryForm.recipients}
              onChange={(e) => setSummaryForm((f) => ({ ...f, recipients: e.target.value, result: '' }))}
              placeholder="name@firm.com"
              aria-label="Summary recipients"
            />
          </label>
          {summaryForm.result ? <p className="crm-muted">{summaryForm.result}</p> : null}
          <div className="dd-share-form__actions">
            <button
              type="button"
              className="btn-primary"
              disabled={summaryForm.sending}
              onClick={handleSummarySend}
            >
              {summaryForm.sending ? 'Sending…' : 'Send summary'}
            </button>
            <button
              type="button"
              className="btn-secondary"
              onClick={() => setSummaryForm((f) => ({ ...f, open: false }))}
            >
              Cancel
            </button>
          </div>
        </div>
      ) : null}

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

      {!workspace ? (
        <>
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
        </>
      ) : null}

      {workspace && !chartHidden ? (
        <>
          <div className="dd-workspace-split__chart" style={{ height: chartHeight, maxHeight: 'none' }}>
            <DdGantt
              groups={checklist.groups}
              startedAt={checklist.started_at}
              targetDate={checklist.target_date}
              milestones={checklist.milestones || []}
              onMilestoneDate={canWrite ? handleMilestoneDate : null}
              onRenameGroup={canWrite ? handleRenameGroup : null}
              onHide={() => {
                setChartHidden(true);
                saveChartHidden(true);
              }}
              shareTitle={dealName}
              showAudienceToggle
              activeStageId={stageFocus}
              onStageChange={(stageId) => {
                console.log('[DdChecklist] show stage items', stageId || 'all');
                setStageFocus(stageId);
              }}
            />
          </div>
          <div
            className="dd-workspace-split__handle"
            role="separator"
            aria-orientation="horizontal"
            aria-label="Resize chart and task list"
            aria-valuemin={CHART_MIN}
            aria-valuenow={chartHeight}
            tabIndex={0}
            title="Drag to show more of the chart or the tasks. Arrow keys nudge it."
            onPointerDown={onSplitPointerDown}
            onKeyDown={onSplitKeyDown}
            onDoubleClick={() => {
              setChartHeight(CHART_DEFAULT);
              saveChartHeight(CHART_DEFAULT);
            }}
          />
        </>
      ) : null}

      {workspace ? (
        <>
          <div className="dd-task-tools">
            {chartHidden ? (
              <button
                type="button"
                className="btn-secondary btn-secondary--sm dd-gantt__action"
                onClick={() => {
                  setChartHidden(false);
                  saveChartHidden(false);
                }}
              >
                Show Gantt Chart
              </button>
            ) : null}
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
        </>
      ) : null}

      {!workspace && paneView === 'gantt' ? (
        <DdGantt
          groups={checklist.groups}
          startedAt={checklist.started_at}
          targetDate={checklist.target_date}
          milestones={checklist.milestones || []}
          onMilestoneDate={canWrite ? handleMilestoneDate : null}
          onRenameGroup={canWrite ? handleRenameGroup : null}
          shareTitle={dealName}
          showAudienceToggle
        />
      ) : (
      <div
        ref={workspaceRef}
        className={`dd-workspace dd-workspace--${paneView}`}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerCancel}
      >
        {focusedStage ? (
          <p className="dd-stage-focus">
            <span>{focusedStage.label} tasks</span>
            <button
              type="button"
              className="btn-secondary btn-secondary--sm"
              onClick={() => {
                console.log('[DdChecklist] show stage items', 'all');
                setStageFocus(null);
              }}
            >
              All tasks
            </button>
          </p>
        ) : null}
        {paneView === 'kanban' ? null : orphanStages.map((stage) => (
          <section key={stage.id} className="dd-group dd-group--milestone">
            <h4 className="dd-group__title">{stage.label}</h4>
            <MilestoneDates
              label={stage.label}
              stageId={stage.id}
              disabled={!canWrite}
              onChange={handleMilestoneDate}
              {...datesForStage(stage.id)}
            />
          </section>
        ))}
        {paneView === 'kanban' ? renderKanbanBoard() : (
        <>
        {paneView === 'list' ? (
          <DdListHead
            sortKey={listSort.key}
            sortDir={listSort.dir}
            onSort={(key, dir) => {
              const next = dir === 'asc' && listSort.key === key && listSort.dir === 'desc'
                ? { key: null, dir: 'asc' }
                : { key, dir };
              console.log('[DdChecklist] list sort', next.key || 'checklist order', next.dir);
              setListSort(next);
            }}
          />
        ) : null}
        {sortDdGroups(groupsForWork, paneView === 'list' ? listSort : null, assigneeLabel).map((group) => {
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
                <GroupName group={group} canWrite={canWrite} onRename={handleRenameGroup} /> <span>({done}/{total})</span>
                <button
                  type="button"
                  className={`btn-secondary dd-group__add-item${addingItemGroupId === group.id ? ' dd-group__add-item--active' : ''}`}
                  onClick={() => handleAddItem(group.id)}
                >
                  {addingItemGroupId === group.id ? 'Cancel' : '+ Item'}
                </button>
              </h4>
              <MilestoneDates
                label={group.name}
                stageId={milestoneKeyForGroup(group)}
                disabled={!canWrite}
                onChange={handleMilestoneDate}
                {...datesForStage(milestoneKeyForGroup(group))}
              />
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
              {paneView === 'cards' ? (
                <ul className="dd-icon-grid">
                  {sortDdItems(group.items, paneView === 'cards' ? null : listSort, assigneeLabel).map((item) => (
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
                  {sortDdItems(group.items, listSort, assigneeLabel).map((item) => {
                    const isOn = selected.has(String(item.id));
                    const locked = Boolean(item.blocked);
                    const linked = new Set((item.predecessors || []).map((row) => String(row.id)));
                    return (
                      <li
                        key={item.id}
                        data-dd-item-id={item.id}
                        className={`dd-list-row${isOn ? ' is-selected' : ''}${locked ? ' dd-list-row--locked' : ''}`}
                        aria-selected={isOn}
                        title={blockedTooltip(item) || undefined}
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
                          <div className="dd-list-row__name">
                            <span className="dd-item__title">{item.title}</span>
                            {item.requests_document ? (
                              <button
                                type="button"
                                className="dd-item__badge dd-item__badge--btn"
                                onClick={() => handleDocLink(item.id)}
                              >
                                Doc
                              </button>
                            ) : null}
                            {locked ? <span className="dd-dep__badge">{blockedLabel(item)}</span> : null}
                            {canWrite && String(linkingId) !== String(item.id) ? (
                              <button
                                type="button"
                                className="dd-dep__link"
                                onClick={() => {
                                  console.log('[DdChecklist] open predecessor', item.id, item.title);
                                  setLinkingId(item.id);
                                }}
                              >
                                Depends on
                              </button>
                            ) : null}
                          </div>
                          {(item.predecessors || []).length || String(linkingId) === String(item.id) ? (
                            <div className="dd-dep">
                              {(item.predecessors || []).map((pred) => (
                                <button
                                  key={pred.id}
                                  type="button"
                                  className="dd-dep__chip"
                                  disabled={!canWrite}
                                  title={`Remove predecessor ${pred.title}`}
                                  onClick={() => handleUnlinkPredecessor(item.id, pred.id)}
                                >
                                  After {pred.title}
                                </button>
                              ))}
                              {String(linkingId) === String(item.id) ? (
                                <select
                                  className="modal-input dd-dep__add"
                                  value=""
                                  autoFocus
                                  aria-label={`Predecessor for ${item.title}`}
                                  onBlur={() => setLinkingId(null)}
                                  onKeyDown={(e) => {
                                    if (e.key === 'Escape') setLinkingId(null);
                                  }}
                                  onChange={(e) => {
                                    const value = e.target.value;
                                    e.target.value = '';
                                    setLinkingId(null);
                                    handleLinkPredecessor(item.id, value);
                                  }}
                                >
                                  <option value="">Choose a task…</option>
                                  {dependencyChoices
                                    .filter((choice) => String(choice.id) !== String(item.id) && !linked.has(String(choice.id)))
                                    .map((choice) => (
                                      <option key={choice.id} value={choice.id}>
                                        {choice.group}: {choice.title}
                                      </option>
                                    ))}
                                </select>
                              ) : null}
                            </div>
                          ) : null}
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
                            <option
                              key={s.value}
                              value={s.value}
                              disabled={s.value !== item.status && !canSetStatus(item, s.value)}
                            >
                              {s.label}
                            </option>
                          ))}
                        </select>
                        {renderItemExtras(item)}
                      </li>
                    );
                  })}
                </ul>
              )}
            </section>
          );
        })}
        </>
        )}
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
      )}
    </div>
  );
}
