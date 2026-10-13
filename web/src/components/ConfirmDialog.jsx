import React, { useEffect, useState } from 'react';
import { setConfirmHandler } from '../confirm.js';
import { site } from '../site.js';

/**
 * 确认框宿主：挂在 Layout 里（全局一个就够）。
 * 任何地方 `await askConfirm({...})` 都会走到这里弹站内对话框。
 */
export default function ConfirmHost() {
  const [req, setReq] = useState(null);

  useEffect(() => {
    setConfirmHandler(
      (opts) =>
        new Promise((resolve) => {
          setReq({ ...opts, resolve });
        })
    );
    return () => setConfirmHandler(null);
  }, []);

  useEffect(() => {
    if (!req) return undefined;
    const onKey = (e) => {
      if (e.key === 'Escape') done(false);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [req]);

  if (!req) return null;

  function done(ok) {
    const resolve = req.resolve;
    setReq(null);
    resolve(ok);
  }

  const t = site.confirm ?? {};

  return (
    <div className="modal-mask" onClick={() => done(false)}>
      <div
        className="modal confirm-modal"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
      >
        <h3>{req.title || t.title}</h3>
        {req.message && <p className="confirm-message">{req.message}</p>}
        {req.hint && <p className="muted small">{req.hint}</p>}
        <div className="modal-foot">
          <button className="tiny" onClick={() => done(false)}>
            {req.cancelText || t.cancel}
          </button>
          <button
            className={req.danger ? 'danger' : 'primary'}
            onClick={() => done(true)}
            autoFocus
          >
            {req.confirmText || t.ok}
          </button>
        </div>
      </div>
    </div>
  );
}
