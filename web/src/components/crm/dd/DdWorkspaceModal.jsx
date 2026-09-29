import { useEffect } from 'react';
import { createPortal } from 'react-dom';
import DdChecklist from './DdChecklist';
import CrmDiligenceList from '../CrmDiligenceList';

/**
 * Full-window due diligence workspace. Gantt stays visible while Kanban or List is used to edit.
 */
export default function DdWorkspaceModal({
  dealId = null,
  dealName = '',
  canWrite = true,
  deals = [],
  onSelectDeal,
  onClose,
  onRefresh
}) {
  useEffect(() => {
    console.log('[DdWorkspaceModal] open', dealId || 'picker', dealName || '');
    const onKey = (e) => {
      if (e.key !== 'Escape') return;
      const tag = e.target?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
      e.preventDefault();
      e.stopPropagation();
      onClose?.();
    };
    window.addEventListener('keydown', onKey, true);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey, true);
      document.body.style.overflow = prev;
    };
  }, [dealId, dealName, onClose]);

  if (typeof document === 'undefined') return null;

  return createPortal(
    <div className="dd-workspace-modal" role="dialog" aria-modal="true" aria-label="Due diligence workspace">
      <header className="dd-workspace-modal__bar">
        <div>
          <p className="dd-workspace-modal__eyebrow">Due diligence</p>
          <h2>{dealId ? (dealName || 'Deal') : 'Choose a deal'}</h2>
        </div>
        <div className="dd-workspace-modal__bar-actions">
          {dealId && deals.length > 0 ? (
            <button type="button" className="btn-secondary btn-secondary--sm" onClick={() => onSelectDeal?.(null)}>
              All deals
            </button>
          ) : null}
          <button type="button" className="btn-secondary" onClick={onClose}>
            Close
          </button>
        </div>
      </header>
      <div className="dd-workspace-modal__body">
        {dealId ? (
          <DdChecklist
            dealId={dealId}
            canWrite={canWrite}
            onRefresh={onRefresh}
            workspace
          />
        ) : (
          <CrmDiligenceList
            deals={deals}
            onSelectDeal={(id) => {
              console.log('[DdWorkspaceModal] pick deal', id);
              onSelectDeal?.(id);
            }}
          />
        )}
      </div>
    </div>,
    document.body
  );
}
