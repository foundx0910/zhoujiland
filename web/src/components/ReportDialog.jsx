import React, { useState } from 'react';
import { api } from '../api.js';
import { useAuth } from '../store.jsx';
import { site } from '../site.js';

const REASONS = site.text.reportReasons;

/** 举报弹窗：楼层与主题共用 */
export default function ReportDialog({ targetType = 'post', targetId, onClose, onDone }) {
  const { notify } = useAuth();
  const [reason, setReason] = useState(REASONS[0]);
  const [detail, setDetail] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  const submit = async () => {
    setBusy(true);
    setErr('');
    try {
      await api.post('/api/reports', { targetType, targetId, reason, detail });
      notify(site.text.reportDone, 'ok');
      onDone?.();
      onClose?.();
    } catch (e) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="modal-mask" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h3>{targetType === 'thread' ? site.text.reportTitleThread : site.text.reportTitlePost}</h3>
        <p className="muted small">
          {site.text.reportHint}
        </p>

        <div className="reason-grid">
          {REASONS.map((r) => (
            <button key={r} type="button" className={reason === r ? 'on' : ''} onClick={() => setReason(r)}>
              {r}
            </button>
          ))}
        </div>

        <textarea
          rows={3}
          maxLength={300}
          value={detail}
          onChange={(e) => setDetail(e.target.value)}
          placeholder={site.text.reportDetailPlaceholder}
        />

        {err && <div className="error small">{err}</div>}

        <div className="row gap end">
          <button type="button" onClick={onClose}>
            {site.text.reportCancel}
          </button>
          <button type="button" className="primary" disabled={busy} onClick={submit}>
            {busy ? '…' : site.text.reportSubmit}
          </button>
        </div>
      </div>
    </div>
  );
}
