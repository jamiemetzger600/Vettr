const NAV_ITEMS = [
  { id: 'cards', label: 'Cards', badgeKey: 'cards' },
  { id: 'tasks', label: 'Tasks', badgeKey: 'tasks' },
  { id: 'home', label: 'Pipeline', badgeKey: 'badge' },
  { id: 'list', label: 'List', badgeKey: 'deals' },
  { id: 'contacts', label: 'Contacts' },
  { id: 'calendar', label: 'Calendar' },
  { id: 'analytics', label: 'Analytics' }
];

/**
 * Left object rail (desktop) / wrap chips (mobile) for Vettr CRM views.
 */
export default function CrmObjectNav({
  crmView,
  onViewChange,
  badges = {},
  onSearchFocus = null,
  isMobile = false
}) {
  if (isMobile) {
    return (
      <nav className="crm-subnav" aria-label="Vettr CRM views">
        {NAV_ITEMS.map((item) => {
          const badge = item.badgeKey ? badges[item.badgeKey] : null;
          return (
            <button
              key={item.id}
              type="button"
              className={`crm-subnav__btn${crmView === item.id ? ' crm-subnav__btn--active' : ''}`}
              onClick={() => onViewChange(item.id)}
            >
              {item.label}
              {badge > 0 ? <span className="crm-subnav__badge">{badge}</span> : null}
            </button>
          );
        })}
      </nav>
    );
  }

  return (
    <nav className="crm-object-nav" aria-label="Vettr CRM objects">
      {typeof onSearchFocus === 'function' ? (
        <button
          type="button"
          className="crm-object-nav__search"
          onClick={onSearchFocus}
          title="Search ( / or ⌘K )"
        >
          <span className="crm-object-nav__search-icon" aria-hidden>⌕</span>
          <span className="crm-object-nav__search-label">Search</span>
          <kbd className="crm-object-nav__kbd">/</kbd>
        </button>
      ) : null}
      <ul className="crm-object-nav__list">
        {NAV_ITEMS.map((item) => {
          const badge = item.badgeKey ? badges[item.badgeKey] : null;
          return (
            <li key={item.id}>
              <button
                type="button"
                className={`crm-object-nav__item${crmView === item.id ? ' crm-object-nav__item--active' : ''}`}
                onClick={() => {
                  console.log('[CrmObjectNav] view', item.id);
                  onViewChange(item.id);
                }}
              >
                <span className="crm-object-nav__item-label">{item.label}</span>
                {badge > 0 ? <span className="crm-object-nav__badge">{badge}</span> : null}
              </button>
            </li>
          );
        })}
      </ul>
      <p className="crm-object-nav__hint">⌘K for commands</p>
    </nav>
  );
}
