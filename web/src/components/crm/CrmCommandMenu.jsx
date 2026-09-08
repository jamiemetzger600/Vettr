import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { crmAPI } from '../../utils/api';

const ACTIONS = [
  { id: 'action-add-deal', type: 'action', label: 'Add deal', action: 'addDeal' },
  { id: 'action-import', type: 'action', label: 'Import CSV', action: 'importCsv' },
  { id: 'action-cards', type: 'action', label: 'Go to Cards', action: 'view', view: 'cards' },
  { id: 'action-tasks', type: 'action', label: 'Go to Tasks', action: 'view', view: 'tasks' },
  { id: 'action-deals', type: 'action', label: 'Go to Pipeline', action: 'view', view: 'home' },
  { id: 'action-calendar', type: 'action', label: 'Go to Calendar', action: 'view', view: 'calendar' },
  { id: 'action-contacts', type: 'action', label: 'Go to Contacts', action: 'view', view: 'contacts' }
];

/**
 * Cmd+K / slash command palette for CRM — search deals, contacts, tasks + quick actions.
 */
export default function CrmCommandMenu({
  isOpen,
  onClose,
  onSelectDeal,
  onSelectContact,
  onAction,
  initialQuery = ''
}) {
  const [query, setQuery] = useState(initialQuery);
  const [results, setResults] = useState({ deals: [], contacts: [], tasks: [] });
  const [loading, setLoading] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const inputRef = useRef(null);
  const debounceRef = useRef(null);

  useEffect(() => {
    if (isOpen) {
      setQuery(initialQuery || '');
      setActiveIndex(0);
      setTimeout(() => inputRef.current?.focus(), 20);
    }
  }, [isOpen, initialQuery]);

  const runSearch = useCallback(async (q) => {
    const trimmed = String(q || '').trim();
    if (trimmed.length < 1) {
      setResults({ deals: [], contacts: [], tasks: [] });
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const data = await crmAPI.search(trimmed);
      setResults({
        deals: data?.deals || [],
        contacts: data?.contacts || [],
        tasks: data?.tasks || []
      });
      console.log('[CrmCommandMenu] search', trimmed, {
        deals: data?.deals?.length,
        contacts: data?.contacts?.length,
        tasks: data?.tasks?.length
      });
    } catch (err) {
      console.warn('[CrmCommandMenu] search failed', err.message);
      setResults({ deals: [], contacts: [], tasks: [] });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!isOpen) return undefined;
    const trimmed = String(query || '').trim();
    if (trimmed.length >= 1) setLoading(true);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => runSearch(query), 200);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query, isOpen, runSearch]);

  const filteredActions = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return ACTIONS;
    return ACTIONS.filter((a) => a.label.toLowerCase().includes(q));
  }, [query]);

  const flatItems = useMemo(() => {
    const items = [];
    results.deals.forEach((d) => {
      items.push({
        id: `deal-${d.id}`,
        type: 'deal',
        label: d.name || 'Untitled deal',
        meta: [d.progress_stage, d.city, d.state].filter(Boolean).join(' · '),
        dealId: d.id
      });
    });
    results.contacts.forEach((c) => {
      items.push({
        id: `contact-${c.id}`,
        type: 'contact',
        label: c.name || c.email || 'Contact',
        meta: [c.company_name, c.email, c.deal_count ? `${c.deal_count} deals` : null]
          .filter(Boolean)
          .join(' · '),
        contact: c
      });
    });
    results.tasks.forEach((t) => {
      items.push({
        id: `task-${t.id}`,
        type: 'task',
        label: t.title || 'Task',
        meta: t.deal_name || '',
        dealId: t.saved_deal_id
      });
    });
    filteredActions.forEach((a) => items.push(a));
    return items;
  }, [results, filteredActions]);

  useEffect(() => {
    setActiveIndex(0);
  }, [flatItems.length, query]);

  const selectItem = useCallback((item) => {
    if (!item) return;
    console.log('[CrmCommandMenu] select', item.type, item.id);
    if (item.type === 'deal' || (item.type === 'task' && item.dealId)) {
      onSelectDeal?.(item.dealId);
    } else if (item.type === 'contact') {
      onSelectContact?.(item.contact);
    } else if (item.type === 'action') {
      onAction?.(item);
    }
    onClose?.();
  }, [onSelectDeal, onSelectContact, onAction, onClose]);

  useEffect(() => {
    if (!isOpen) return undefined;
    const onKey = (e) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose?.();
        return;
      }
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setActiveIndex((i) => Math.min(i + 1, Math.max(0, flatItems.length - 1)));
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setActiveIndex((i) => Math.max(i - 1, 0));
      } else if (e.key === 'Enter') {
        e.preventDefault();
        selectItem(flatItems[activeIndex]);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isOpen, flatItems, activeIndex, onClose, selectItem]);

  if (!isOpen || typeof document === 'undefined') return null;

  return createPortal(
    <div className="crm-cmdk-root" role="presentation">
      <button
        type="button"
        className="crm-cmdk-backdrop"
        aria-label="Close command menu"
        onClick={onClose}
      />
      <div className="crm-cmdk" role="dialog" aria-modal="true" aria-label="CRM command menu">
        <input
          ref={inputRef}
          className="crm-cmdk__input"
          type="search"
          placeholder="Search deals, contacts, tasks…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          aria-autocomplete="list"
          aria-controls="crm-cmdk-list"
        />
        <ul id="crm-cmdk-list" className="crm-cmdk__list" role="listbox">
          {loading ? (
            <li className="crm-cmdk__empty">Searching…</li>
          ) : null}
          {!loading && flatItems.length === 0 ? (
            <li className="crm-cmdk__empty">
              {query.trim() ? 'No matches' : 'Type to search, or pick an action'}
            </li>
          ) : null}
          {flatItems.map((item, idx) => (
            <li key={item.id} role="option" aria-selected={idx === activeIndex}>
              <button
                type="button"
                className={`crm-cmdk__item${idx === activeIndex ? ' crm-cmdk__item--active' : ''}`}
                onMouseEnter={() => setActiveIndex(idx)}
                onClick={() => selectItem(item)}
              >
                <span className="crm-cmdk__item-type">{item.type}</span>
                <span className="crm-cmdk__item-label">{item.label}</span>
                {item.meta ? <span className="crm-cmdk__item-meta">{item.meta}</span> : null}
              </button>
            </li>
          ))}
        </ul>
      </div>
    </div>,
    document.body
  );
}
