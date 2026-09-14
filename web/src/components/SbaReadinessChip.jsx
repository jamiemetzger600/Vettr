import { useEffect, useId, useRef, useState } from 'react';
import { SBA_READINESS_DISCLAIMER, sbaReadinessTone } from '../utils/sbaReadiness';

export default function SbaReadinessChip({ sba }) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef(null);
  const tipId = useId();

  useEffect(() => {
    if (!open) return undefined;
    const onPointerDown = (event) => {
      if (!wrapRef.current?.contains(event.target)) setOpen(false);
    };
    const onKey = (event) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  if (!sba) return null;

  const tone = sbaReadinessTone(sba.score);
  const checks = Array.isArray(sba.checks) ? sba.checks : [];

  const toggle = () => {
    setOpen((prev) => {
      const next = !prev;
      console.debug('[SBA] readiness tooltip', { open: next, score: sba.score, label: sba.label });
      return next;
    });
  };

  return (
    <span
      ref={wrapRef}
      className={`sba-readiness-chip sba-readiness-chip--${tone}${open ? ' is-open' : ''}`}
    >
      <button
        type="button"
        className="sba-readiness-chip__btn"
        aria-expanded={open}
        aria-describedby={tipId}
        aria-label={`SBA readiness ${sba.score}, ${sba.label}. Indication only, not a loan guarantee.`}
        onClick={toggle}
      >
        <span className="sba-readiness-chip__kicker">SBA</span>
        <strong className="sba-readiness-chip__score">{sba.score}</strong>
        <span className="sba-readiness-chip__label">{sba.label}</span>
        <span className="sba-readiness-chip__info" aria-hidden="true">i</span>
      </button>
      <span className="sba-readiness-chip__tip" id={tipId} role="tooltip">
        <strong className="sba-readiness-chip__tip-title">SBA readiness</strong>
        <p className="sba-readiness-chip__tip-disclaimer">{SBA_READINESS_DISCLAIMER}</p>
        <ul className="sba-readiness-chip__tip-list">
          {checks.map((check) => (
            <li key={check.label} className={check.ok ? 'is-ok' : 'is-gap'}>
              <span aria-hidden="true">{check.ok ? '✓' : '!'}</span>
              {check.label}
            </li>
          ))}
        </ul>
      </span>
    </span>
  );
}
