import React, { useState, useEffect } from 'react';
import { Settings, CheckCircle, WifiOff, Wifi, X } from 'lucide-react';
import { getApiBaseUrl, setApiBaseUrl, hasApiBaseUrl } from '../utils/apiConfig';
import './ApiSettings.css';

export default function ApiSettings() {
  const [open, setOpen] = useState(false);
  const [url, setUrl] = useState(getApiBaseUrl());
  const [status, setStatus] = useState('unknown'); // unknown | ok | error | checking
  const [saved, setSaved] = useState(false);

  // Check connectivity on mount and when URL changes
  useEffect(() => {
    if (!url) { setStatus('unknown'); return; }
    let cancelled = false;
    setStatus('checking');
    const ctrl = new AbortController();
    fetch(`${url.replace(/\/$/, '')}/health`, { signal: ctrl.signal, mode: 'cors' })
      .then(r => { if (!cancelled) setStatus(r.ok ? 'ok' : 'error'); })
      .catch(() => { if (!cancelled) setStatus('error'); });
    return () => { cancelled = true; ctrl.abort(); };
  }, [url]);

  const handleSave = () => {
    setApiBaseUrl(url);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const statusIcon = () => {
    if (!url) return <WifiOff size={14} className="status-icon off" />;
    if (status === 'checking') return <span className="status-icon checking">⟳</span>;
    if (status === 'ok') return <Wifi size={14} className="status-icon ok" />;
    return <WifiOff size={14} className="status-icon off" />;
  };

  const statusLabel = () => {
    if (!url) return 'No server';
    if (status === 'checking') return 'Checking…';
    if (status === 'ok') return 'Connected';
    return 'Unreachable';
  };

  return (
    <div className="api-settings">
      <button
        className={`api-settings-toggle ${status === 'ok' ? 'connected' : ''}`}
        onClick={() => setOpen(o => !o)}
        title="Backend server settings"
      >
        {statusIcon()}
        <span className="toggle-label">{statusLabel()}</span>
        <Settings size={14} />
      </button>

      {open && (
        <div className="api-settings-panel">
          <div className="panel-header">
            <h4>Backend Server</h4>
            <button className="close-btn" onClick={() => setOpen(false)}><X size={16} /></button>
          </div>
          <p className="panel-desc">
            Enter the URL of your backend server (e.g. <code>http://localhost:8080</code>).
            Leave empty to use client-side parsing only.
          </p>
          <div className="url-row">
            <input
              type="text"
              value={url}
              onChange={e => setUrl(e.target.value)}
              placeholder="http://localhost:8080"
              className="url-input"
              spellCheck={false}
            />
            <button className="save-btn" onClick={handleSave}>
              {saved ? <><CheckCircle size={14} /> Saved</> : 'Save'}
            </button>
          </div>
          {status === 'error' && url && (
            <p className="panel-warn">
              ⚠ Cannot reach <strong>{url}/health</strong>. Make sure the server is running.
            </p>
          )}
          {status === 'ok' && (
            <p className="panel-ok">✓ Server is reachable</p>
          )}
        </div>
      )}
    </div>
  );
}
