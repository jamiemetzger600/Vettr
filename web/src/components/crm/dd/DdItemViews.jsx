const STATUS_FILL = {
  not_started: '#9aa0a6',
  in_progress: '#e6b84f',
  waiting_on_other: '#e07a5f',
  complete: '#5cb87a',
  blocked: '#e74c3c',
  na: '#6b6b6b'
};

export function DdFolderIcon() {
  return (
    <svg className="dd-folder-icon" viewBox="0 0 24 20" aria-hidden="true">
      <path
        d="M2 4.5A2.5 2.5 0 0 1 4.5 2h5.2l1.6 2H19.5A2.5 2.5 0 0 1 22 6.5v9A2.5 2.5 0 0 1 19.5 18h-15A2.5 2.5 0 0 1 2 15.5v-11Z"
        fill="currentColor"
      />
    </svg>
  );
}

export function DdFileIcon({ status, requestsDocument }) {
  const fill = STATUS_FILL[status] || STATUS_FILL.not_started;
  return (
    <svg className="dd-file-icon" viewBox="0 0 48 56" aria-hidden="true">
      <path
        d="M8 2h22l14 14v36a4 4 0 0 1-4 4H8a4 4 0 0 1-4-4V6a4 4 0 0 1 4-4Z"
        fill={fill}
        opacity="0.92"
      />
      <path d="M30 2v12h14" fill="rgba(0,0,0,0.22)" />
      {requestsDocument ? (
        <>
          <rect x="12" y="24" width="24" height="2.5" rx="1" fill="rgba(0,0,0,0.35)" />
          <rect x="12" y="31" width="20" height="2.5" rx="1" fill="rgba(0,0,0,0.35)" />
          <rect x="12" y="38" width="16" height="2.5" rx="1" fill="rgba(0,0,0,0.35)" />
        </>
      ) : (
        <>
          <rect x="14" y="26" width="6" height="6" rx="1" fill="rgba(0,0,0,0.35)" />
          <rect x="23" y="27.5" width="13" height="2.2" rx="1" fill="rgba(0,0,0,0.35)" />
          <rect x="14" y="37" width="6" height="6" rx="1" fill="rgba(0,0,0,0.35)" />
          <rect x="23" y="38.5" width="13" height="2.2" rx="1" fill="rgba(0,0,0,0.35)" />
        </>
      )}
      {status === 'complete' ? (
        <path
          d="M16 44.5 21 49l11-13"
          fill="none"
          stroke="rgba(0,0,0,0.55)"
          strokeWidth="3"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      ) : null}
    </svg>
  );
}

export function DdIconCard({
  item,
  selected,
  meta,
  onOpenDoc
}) {
  return (
    <li
      data-dd-item-id={item.id}
      className={`dd-icon${selected ? ' is-selected' : ''}`}
      aria-selected={selected}
    >
      <div className="dd-icon__glyph">
        <DdFileIcon status={item.status} requestsDocument={item.requests_document} />
      </div>
      <span className="dd-icon__label" title={item.title}>{item.title}</span>
      <span className="dd-icon__meta">{meta}</span>
      {selected && item.requests_document && onOpenDoc ? (
        <button
          type="button"
          className="dd-icon__doc"
          onClick={(e) => {
            e.stopPropagation();
            onOpenDoc(item.id);
          }}
        >
          + Doc
        </button>
      ) : null}
    </li>
  );
}

export function DdListHead() {
  return (
    <div className="dd-list-head" role="row">
      <span className="dd-list-head__check" />
      <span>Item</span>
      <span>Due</span>
      <span>Assigned</span>
      <span>Status</span>
      <span />
    </div>
  );
}
