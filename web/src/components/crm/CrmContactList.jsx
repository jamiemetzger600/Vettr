import { useState, useEffect, useCallback } from 'react';
import { crmAPI } from '../../utils/api';

function normalizeLinkedDeals(contact) {
  if (Array.isArray(contact.linked_deals) && contact.linked_deals.length > 0) {
    return contact.linked_deals;
  }
  const names = contact.deal_names || [];
  return names.map((name) => ({ id: null, name }));
}

const EMPTY = { name: '', email: '', phone: '', title: '', companyName: '', tags: '' };

export default function CrmContactList({ onSelectDeal, deals = [], highlightContactId = null }) {
  const [contacts, setContacts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(EMPTY);
  const [editingId, setEditingId] = useState(null);
  const [saving, setSaving] = useState(false);
  const [tagFilter, setTagFilter] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await crmAPI.getContacts();
      setContacts(data.contacts || []);
    } catch (err) {
      setError(err.message || 'Failed to load contacts');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const resolveDealId = (linkedDeal) => {
    if (linkedDeal?.id) return linkedDeal.id;
    const name = (linkedDeal?.name || '').trim();
    if (!name) return null;
    const match = deals.find((d) => (d.name || '').trim() === name);
    return match?.id ?? match?.vettrId ?? null;
  };

  const resetForm = () => {
    setForm(EMPTY);
    setEditingId(null);
    setShowForm(false);
  };

  const startEdit = (c) => {
    setEditingId(c.id);
    setShowForm(true);
    setForm({
      name: c.name || '',
      email: c.email || '',
      phone: c.phone || '',
      title: c.title || '',
      companyName: c.company_name || '',
      tags: Array.isArray(c.tags) ? c.tags.join(', ') : ''
    });
  };

  const handleSave = async (e) => {
    e.preventDefault();
    if (saving) return;
    if (!form.name.trim() && !form.email.trim()) {
      alert('Name or email required');
      return;
    }
    setSaving(true);
    try {
      const payload = {
        name: form.name.trim(),
        email: form.email.trim(),
        phone: form.phone.trim() || null,
        title: form.title.trim() || null,
        companyName: form.companyName.trim() || null,
        tags: form.tags.split(/[|,]/).map((t) => t.trim().toLowerCase()).filter(Boolean)
      };
      if (editingId) {
        await crmAPI.updateContact(editingId, payload);
      } else {
        await crmAPI.createContact(payload);
      }
      resetForm();
      await load();
    } catch (err) {
      alert(err.message || 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Delete this contact?')) return;
    try {
      await crmAPI.deleteContact(id);
      await load();
    } catch (err) {
      alert(err.message || 'Delete failed');
    }
  };

  const filtered = tagFilter
    ? contacts.filter((c) => (c.tags || []).some((t) => String(t).includes(tagFilter.toLowerCase())))
    : contacts;

  const duplicateEmails = (() => {
    const counts = {};
    for (const c of contacts) {
      const e = String(c.email || '').trim().toLowerCase();
      if (!e) continue;
      counts[e] = (counts[e] || 0) + 1;
    }
    return new Set(Object.keys(counts).filter((e) => counts[e] > 1));
  })();

  if (loading) return <div className="crm-panel">Loading contacts…</div>;
  if (error) {
    return (
      <div className="crm-panel crm-panel--error">
        <p>{error}</p>
        <button type="button" className="btn-secondary" onClick={load}>Retry</button>
      </div>
    );
  }

  return (
    <div className="crm-contacts">
      <div className="crm-contacts__toolbar">
        <input
          className="modal-input crm-contacts__tag-filter"
          placeholder="Filter by tag…"
          value={tagFilter}
          onChange={(e) => setTagFilter(e.target.value)}
        />
        <button
          type="button"
          className="btn-primary btn-secondary--sm"
          onClick={() => {
            setEditingId(null);
            setForm(EMPTY);
            setShowForm((v) => !v);
          }}
        >
          {showForm && !editingId ? 'Close' : 'New contact'}
        </button>
      </div>

      {showForm ? (
        <form className="crm-contacts__form" onSubmit={handleSave}>
          <div className="crm-deal-contacts__row">
            <input className="modal-input" placeholder="Name" value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} />
            <input className="modal-input" placeholder="Email" value={form.email} onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))} />
          </div>
          <div className="crm-deal-contacts__row">
            <input className="modal-input" placeholder="Phone" value={form.phone} onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))} />
            <input className="modal-input" placeholder="Title" value={form.title} onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))} />
          </div>
          <div className="crm-deal-contacts__row">
            <input className="modal-input" placeholder="Company" value={form.companyName} onChange={(e) => setForm((f) => ({ ...f, companyName: e.target.value }))} />
            <input className="modal-input" placeholder="Tags (comma-separated)" value={form.tags} onChange={(e) => setForm((f) => ({ ...f, tags: e.target.value }))} />
          </div>
          <div className="crm-deal-contacts__row">
            <button type="submit" className="btn-primary" disabled={saving}>
              {saving ? 'Saving…' : editingId ? 'Update contact' : 'Create contact'}
            </button>
            <button type="button" className="btn-secondary" onClick={resetForm}>Cancel</button>
          </div>
        </form>
      ) : null}

      {filtered.length === 0 ? (
        <div className="crm-empty">
          <h2>No contacts yet</h2>
          <p>Add people manually, or save listings — broker contacts hydrate automatically.</p>
        </div>
      ) : (
        <table className="crm-contacts-table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Email</th>
              <th>Company</th>
              <th>Tags</th>
              <th>Deals</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {filtered.map((c) => {
              const linked = normalizeLinkedDeals(c);
              const shown = linked.slice(0, 3);
              const extra = (c.deal_count ?? linked.length) - shown.length;
              return (
                <tr
                  key={c.id}
                  className={
                    highlightContactId != null && String(highlightContactId) === String(c.id)
                      ? 'crm-contacts-row--highlight'
                      : undefined
                  }
                >
                  <td>
                    {c.name || '—'}
                    {c.title ? <div className="crm-muted">{c.title}</div> : null}
                  </td>
                  <td>
                    {c.email ? <a href={`mailto:${c.email}`}>{c.email}</a> : '—'}
                    {c.email && duplicateEmails.has(String(c.email).trim().toLowerCase()) ? (
                      <div className="crm-muted">Possible duplicate</div>
                    ) : null}
                  </td>
                  <td>{c.company_name || '—'}</td>
                  <td>
                    {(c.tags || []).map((t) => (
                      <span key={t} className="crm-tag">{t}</span>
                    ))}
                  </td>
                  <td>
                    {shown.map((linkedDeal) => {
                      const id = resolveDealId(linkedDeal);
                      const label = linkedDeal.name || 'Untitled deal';
                      return id ? (
                        <button
                          key={`${c.id}-${id}-${linkedDeal.role || ''}`}
                          type="button"
                          className="crm-contacts-deal-link"
                          onClick={() => onSelectDeal?.(id)}
                        >
                          {label}
                          {linkedDeal.role ? ` (${linkedDeal.role})` : ''}
                        </button>
                      ) : (
                        <span key={`${c.id}-${label}`} className="crm-contacts-deal-name">{label}</span>
                      );
                    })}
                    {extra > 0 ? <span className="crm-muted"> +{extra}</span> : null}
                  </td>
                  <td className="crm-contacts__actions">
                    <button type="button" className="btn-secondary btn-secondary--sm" onClick={() => startEdit(c)}>Edit</button>
                    <button type="button" className="btn-secondary btn-secondary--sm" onClick={() => handleDelete(c.id)}>Delete</button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </div>
  );
}
