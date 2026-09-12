const NAV_ITEMS = [
  { id: 'campaigns', label: 'Campaigns' },
  { id: 'research', label: 'Research' },
  { id: 'prospects', label: 'Prospects' },
  { id: 'sequences', label: 'Sequences' },
  { id: 'stats', label: 'Stats' }
];

export default function OffMarketNav({ view, onViewChange, isMobile = false }) {
  if (isMobile) {
    return (
      <nav className="crm-subnav" aria-label="Off Market views">
        {NAV_ITEMS.map((item) => (
          <button
            key={item.id}
            type="button"
            className={`crm-subnav__btn${view === item.id ? ' crm-subnav__btn--active' : ''}`}
            onClick={() => onViewChange(item.id)}
          >
            {item.label}
          </button>
        ))}
      </nav>
    );
  }

  return (
    <nav className="crm-object-nav" aria-label="Off Market">
      <ul className="crm-object-nav__list">
        {NAV_ITEMS.map((item) => (
          <li key={item.id}>
            <button
              type="button"
              className={`crm-object-nav__item${view === item.id ? ' crm-object-nav__item--active' : ''}`}
              onClick={() => {
                console.log('[OffMarketNav] view', item.id);
                onViewChange(item.id);
              }}
            >
              <span className="crm-object-nav__item-label">{item.label}</span>
            </button>
          </li>
        ))}
      </ul>
      <p className="crm-object-nav__hint">Research → send from Gmail → promote to CRM</p>
    </nav>
  );
}
