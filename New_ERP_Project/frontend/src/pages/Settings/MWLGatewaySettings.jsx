import { useState, useEffect, useCallback } from 'react';

const API = '/api';
const AUTH = () => ({ Authorization: `Bearer ${localStorage.getItem('token')}` });
const JAUTH = () => ({ ...AUTH(), 'Content-Type': 'application/json' });

// ── Status badge ──────────────────────────────────────────────────────────────
const Badge = ({ label, color }) => {
  const map = {
    green:  'bg-emerald-100 text-emerald-700 border-emerald-200',
    red:    'bg-red-100 text-red-700 border-red-200',
    yellow: 'bg-amber-100 text-amber-700 border-amber-200',
    slate:  'bg-slate-100 text-slate-500 border-slate-200',
    blue:   'bg-blue-100 text-blue-700 border-blue-200',
  };
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold border ${map[color] || map.slate}`}>
      {color !== 'slate' && (
        <span className={`w-1.5 h-1.5 rounded-full ${
          color === 'green' ? 'bg-emerald-500' :
          color === 'red'   ? 'bg-red-500' :
          color === 'yellow'? 'bg-amber-500' :
          color === 'blue'  ? 'bg-blue-500' : 'bg-slate-400'
        }`} />
      )}
      {label}
    </span>
  );
};

// ── Relative time ─────────────────────────────────────────────────────────────
function relTime(ts) {
  if (!ts) return '—';
  const diff = Date.now() - new Date(ts).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1)   return 'just now';
  if (m < 60)  return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24)  return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

// ── Copy to clipboard ─────────────────────────────────────────────────────────
function CopyBtn({ text, label = 'Copy' }) {
  const [copied, setCopied] = useState(false);
  const copy = () => {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };
  return (
    <button onClick={copy}
      className="px-2 py-0.5 text-xs font-medium rounded border transition-colors
                 bg-teal-50 text-teal-700 border-teal-200 hover:bg-teal-100">
      {copied ? '✓ Copied' : label}
    </button>
  );
}

// ── Token reveal modal ────────────────────────────────────────────────────────
const TokenModal = ({ token, centerId, centerName, onClose }) => {
  const configBlock =
`# ARIS MWL Gateway — Local App Configuration
ARIS_SERVER_URL=https://erp.feenixtech.com
ARIS_CENTER_ID=${centerId}
ARIS_MWL_TOKEN=${token}`;

  const exampleRequest =
`GET https://erp.feenixtech.com/api/mwl/worklist?date=2026-03-24
Authorization: Bearer ${token}
X-Center-ID: ${centerId}`;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-xl max-h-[90vh] overflow-y-auto">
        <div className="px-6 py-4 border-b border-slate-100 flex items-center gap-3 sticky top-0 bg-white">
          <div className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0"
               style={{ background: '#0d9488' }}>
            <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" />
            </svg>
          </div>
          <div>
            <h3 className="text-sm font-bold text-slate-800">Token Generated — {centerName}</h3>
            <p className="text-xs text-red-600 font-medium mt-0.5">Copy this now. It will not be shown again.</p>
          </div>
        </div>

        <div className="px-6 py-5 space-y-4">

          {/* Center ID — most important config item */}
          <div className="bg-teal-50 border-2 border-teal-300 rounded-xl p-4">
            <p className="text-xs font-bold text-teal-700 uppercase tracking-wide mb-2">
              Center ID — Configure this on the local app
            </p>
            <div className="flex items-center gap-3">
              <span className="font-mono text-3xl font-black text-teal-800">{centerId}</span>
              <div>
                <p className="text-xs font-semibold text-teal-700">{centerName}</p>
                <p className="text-xs text-teal-600 mt-0.5">
                  Every API request must include <code className="bg-teal-100 px-1 rounded">X-Center-ID: {centerId}</code>
                </p>
              </div>
            </div>
          </div>

          {/* Token */}
          <div className="bg-slate-900 rounded-xl p-4">
            <p className="text-xs text-slate-400 mb-2 font-mono">Bearer Token (shown once only)</p>
            <p className="font-mono text-sm text-emerald-400 break-all leading-relaxed">{token}</p>
          </div>

          {/* Local app config block */}
          <div>
            <p className="text-xs font-bold text-slate-600 uppercase tracking-wide mb-2">
              Local App Configuration
            </p>
            <div className="bg-slate-900 rounded-xl p-4 font-mono text-xs text-slate-300 whitespace-pre-wrap break-all">
              {configBlock}
            </div>
            <div className="mt-2">
              <CopyBtn text={configBlock} label="Copy Config Block" />
            </div>
          </div>

          {/* Example request */}
          <div>
            <p className="text-xs font-bold text-slate-600 uppercase tracking-wide mb-2">
              Example API Request
            </p>
            <div className="bg-slate-900 rounded-xl p-4 font-mono text-xs text-emerald-300 whitespace-pre-wrap break-all">
              {exampleRequest}
            </div>
            <div className="mt-2 flex gap-2">
              <CopyBtn text={token} label="Copy Token" />
              <CopyBtn text={String(centerId)} label="Copy Center ID" />
              <CopyBtn text={exampleRequest} label="Copy Full Example" />
            </div>
          </div>

          <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 text-xs text-amber-800">
            <span className="font-bold">Security note:</span> The token alone is not sufficient.
            Every request must also send <code className="bg-amber-100 px-1 rounded">X-Center-ID: {centerId}</code>.
            A mismatched Center ID will be rejected and logged as an unauthorized attempt.
          </div>
        </div>

        <div className="px-6 py-4 border-t border-slate-100 flex justify-end sticky bottom-0 bg-white">
          <button onClick={onClose}
            className="px-4 py-2 text-sm font-semibold text-white rounded-xl"
            style={{ background: '#0d9488' }}>
            I've saved the token and Center ID
          </button>
        </div>
      </div>
    </div>
  );
};

// ── Log row color by status ───────────────────────────────────────────────────
const logStatusStyle = {
  SUCCESS:      { row: '', badge: 'green',  label: 'Success' },
  ERROR:        { row: 'bg-red-50',  badge: 'red',    label: 'Error' },
  UNAUTHORIZED: { row: 'bg-amber-50', badge: 'yellow', label: 'Unauthorized' },
  DISABLED:     { row: 'bg-slate-50', badge: 'slate',  label: 'Disabled' },
};

// ════════════════════════════════════════════════════════════════════════════
// MAIN COMPONENT
// ════════════════════════════════════════════════════════════════════════════
export default function MWLGatewaySettings() {
  const [tab, setTab]             = useState('centers');
  const [settings, setSettings]   = useState([]);
  const [stats, setStats]         = useState([]);
  const [logs, setLogs]           = useState([]);
  const [logTotal, setLogTotal]   = useState(0);
  const [loading, setLoading]     = useState(true);
  const [logsLoading, setLogsLoading] = useState(false);
  const [newToken, setNewToken]   = useState(null);   // { raw_token, center_id, center_name }
  const [actionBusy, setActionBusy] = useState({});   // centerId → true/false

  // Log filters
  const [logFilter, setLogFilter] = useState({ center_id: '', status: '', from: '', to: '' });
  const [logPage, setLogPage]     = useState(1);
  const LOG_LIMIT = 100;

  // ── Loaders ───────────────────────────────────────────────────────────────
  const loadSettings = useCallback(async () => {
    try {
      const [sRes, stRes] = await Promise.all([
        fetch(`${API}/mwl/settings`,      { headers: AUTH() }),
        fetch(`${API}/mwl/logs/stats`,    { headers: AUTH() }),
      ]);
      const sd = await sRes.json();
      const st = await stRes.json();
      if (sd.success) setSettings(sd.settings || []);
      if (st.success) setStats(st.stats || []);
    } catch (e) {
      console.error('MWL settings load error', e);
    } finally {
      setLoading(false);
    }
  }, []);

  const loadLogs = useCallback(async (page = 1, filter = logFilter) => {
    setLogsLoading(true);
    try {
      const q = new URLSearchParams({
        page, limit: LOG_LIMIT,
        ...(filter.center_id && { center_id: filter.center_id }),
        ...(filter.status    && { status:    filter.status }),
        ...(filter.from      && { from:      filter.from }),
        ...(filter.to        && { to:        filter.to }),
      });
      const res  = await fetch(`${API}/mwl/logs?${q}`, { headers: AUTH() });
      const data = await res.json();
      if (data.success) {
        setLogs(data.logs || []);
        setLogTotal(data.total || 0);
        setLogPage(page);
      }
    } catch (e) {
      console.error('MWL logs load error', e);
    } finally {
      setLogsLoading(false);
    }
  }, [logFilter]);

  useEffect(() => { loadSettings(); }, [loadSettings]);
  useEffect(() => { if (tab === 'logs') loadLogs(1, logFilter); }, [tab]);

  // ── Token generate ────────────────────────────────────────────────────────
  const generateToken = async (centerId, centerName) => {
    if (!window.confirm(`Generate a new API token for ${centerName}?\n\nAny existing token will be immediately invalidated.`)) return;
    setActionBusy(b => ({ ...b, [centerId]: true }));
    try {
      const res  = await fetch(`${API}/mwl/settings/${centerId}/token`, {
        method: 'POST', headers: JAUTH(), body: JSON.stringify({})
      });
      const data = await res.json();
      if (data.success) {
        setNewToken({ raw_token: data.raw_token, center_id: data.center_id, center_name: centerName });
        loadSettings();
      } else {
        alert('Error: ' + data.error);
      }
    } finally {
      setActionBusy(b => ({ ...b, [centerId]: false }));
    }
  };

  // ── Token revoke ──────────────────────────────────────────────────────────
  const revokeToken = async (centerId, centerName) => {
    if (!window.confirm(`Revoke the MWL token for ${centerName}?\n\nThe local center app will immediately lose access.`)) return;
    setActionBusy(b => ({ ...b, [centerId]: true }));
    try {
      const res  = await fetch(`${API}/mwl/settings/${centerId}/token`, {
        method: 'DELETE', headers: AUTH()
      });
      const data = await res.json();
      if (data.success) loadSettings();
      else alert('Error: ' + data.error);
    } finally {
      setActionBusy(b => ({ ...b, [centerId]: false }));
    }
  };

  // ── Toggle enable/disable ─────────────────────────────────────────────────
  const toggleEnabled = async (centerId, centerName, currentEnabled) => {
    const action = currentEnabled ? 'disable' : 'enable';
    if (!window.confirm(`${action.charAt(0).toUpperCase() + action.slice(1)} MWL for ${centerName}?`)) return;
    setActionBusy(b => ({ ...b, [centerId]: true }));
    try {
      const res  = await fetch(`${API}/mwl/settings/${centerId}/toggle`, {
        method: 'PATCH', headers: JAUTH(),
        body: JSON.stringify({ enabled: !currentEnabled })
      });
      const data = await res.json();
      if (data.success) loadSettings();
      else alert('Error: ' + data.error);
    } finally {
      setActionBusy(b => ({ ...b, [centerId]: false }));
    }
  };

  // ── Stats map by center_id ────────────────────────────────────────────────
  const statsMap = {};
  stats.forEach(s => { statsMap[s.center_id] = s; });

  // ── Connection health indicator ───────────────────────────────────────────
  const connectionHealth = (row) => {
    if (!row.token_id) return { color: 'slate', label: 'No Token' };
    if (!row.enabled)  return { color: 'yellow', label: 'Disabled' };
    const s = statsMap[row.center_id];
    if (!s || !s.last_call_at) return { color: 'blue', label: 'No Activity' };
    const minAgo = (Date.now() - new Date(s.last_call_at).getTime()) / 60000;
    if (s.error_count > 0 && s.error_count >= s.success_count) return { color: 'red', label: 'Errors' };
    if (minAgo < 60) return { color: 'green', label: 'Active' };
    return { color: 'blue', label: 'Idle' };
  };

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-slate-50">
      {/* Header */}
      <div className="bg-white border-b border-slate-200 px-6 py-5">
        <div className="max-w-screen-xl mx-auto">
          <div className="flex items-center gap-4">
            <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
                 style={{ background: 'linear-gradient(135deg, #0d9488, #134e4a)' }}>
              <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M9 3H5a2 2 0 00-2 2v4m6-6h10a2 2 0 012 2v4M9 3v18m0 0h10a2 2 0 002-2V9M9 21H5a2 2 0 01-2-2V9m0 0h18" />
              </svg>
            </div>
            <div>
              <h1 className="text-lg font-bold text-slate-900">DICOM MWL Gateway</h1>
              <p className="text-xs text-slate-500">Manage local center app API tokens and monitor worklist communications</p>
            </div>
            <div className="ml-auto flex items-center gap-2">
              <button onClick={loadSettings}
                className="px-3 py-1.5 text-xs font-semibold text-teal-700 bg-teal-50 hover:bg-teal-100 border border-teal-200 rounded-lg transition-colors">
                Refresh
              </button>
            </div>
          </div>

          {/* Tabs */}
          <div className="flex gap-1 mt-4">
            {[
              { key: 'centers', label: 'Center Tokens' },
              { key: 'logs',    label: 'Access Logs' },
              { key: 'api',     label: 'API Reference' },
            ].map(t => (
              <button key={t.key} onClick={() => setTab(t.key)}
                className={`px-4 py-2 text-sm font-semibold rounded-lg transition-colors ${
                  tab === t.key
                    ? 'text-teal-700 bg-teal-50 border border-teal-200'
                    : 'text-slate-500 hover:text-slate-700 hover:bg-slate-50'
                }`}>
                {t.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="max-w-screen-xl mx-auto px-6 py-6 space-y-5">

        {/* ── CENTERS TAB ── */}
        {tab === 'centers' && (
          <>
            {/* Summary stats */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              {[
                { label: 'Total Centers', value: settings.length },
                { label: 'Active Tokens', value: settings.filter(s => s.token_id && s.enabled).length },
                { label: 'Disabled', value: settings.filter(s => s.token_id && !s.enabled).length },
                { label: 'No Token', value: settings.filter(s => !s.token_id).length },
              ].map(card => (
                <div key={card.label} className="bg-white rounded-xl border border-slate-200 shadow-sm px-5 py-4">
                  <p className="text-xs text-slate-500 font-medium">{card.label}</p>
                  <p className="text-2xl font-bold text-slate-800 mt-1">{card.value}</p>
                </div>
              ))}
            </div>

            {/* Centers table */}
            <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
              <div className="px-5 py-3.5 border-b border-slate-100 flex items-center gap-2"
                   style={{ borderLeft: '4px solid #0d9488' }}>
                <h3 className="text-sm font-bold text-slate-800">Center API Tokens</h3>
                <span className="text-xs text-slate-400 ml-1">— one token per center</span>
              </div>

              {loading ? (
                <div className="py-16 text-center text-slate-400 text-sm">Loading…</div>
              ) : settings.length === 0 ? (
                <div className="py-16 text-center text-slate-400 text-sm">No centers found</div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-slate-50 border-b border-slate-100">
                        {['Center', 'Center ID', 'AE Title', 'Status', 'Token', 'Last Seen', 'Last IP', '24h Calls', 'Actions']
                          .map(h => (
                            <th key={h} className={`px-4 py-2.5 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide ${h === 'Center ID' ? 'bg-teal-50' : ''}`}>
                              {h}
                            </th>
                          ))}
                      </tr>
                    </thead>
                    <tbody>
                      {settings.map(row => {
                        const health = connectionHealth(row);
                        const s      = statsMap[row.center_id] || {};
                        const busy   = actionBusy[row.center_id];

                        return (
                          <tr key={row.center_id} className="border-b border-slate-50 hover:bg-slate-50/60 transition-colors">
                            {/* Center */}
                            <td className="px-4 py-3">
                              <p className="font-semibold text-slate-800">{row.center_name}</p>
                              {row.label && <p className="text-xs text-slate-400 mt-0.5">{row.label}</p>}
                            </td>

                            {/* Center ID — key config value for local app */}
                            <td className="px-4 py-3 bg-teal-50/40">
                              <div className="flex items-center gap-1.5">
                                <span className="font-mono text-lg font-black text-teal-700">{row.center_id}</span>
                                <CopyBtn text={String(row.center_id)} label="Copy" />
                              </div>
                              <p className="text-xs text-teal-500 mt-0.5">X-Center-ID</p>
                            </td>

                            {/* AE Title */}
                            <td className="px-4 py-3">
                              <span className="font-mono text-xs text-slate-600 bg-slate-100 px-2 py-0.5 rounded">
                                {row.ae_title || '—'}
                              </span>
                            </td>

                            {/* Status */}
                            <td className="px-4 py-3">
                              <Badge label={health.label} color={health.color} />
                            </td>

                            {/* Token */}
                            <td className="px-4 py-3">
                              {row.token_id ? (
                                <div className="flex items-center gap-2">
                                  <span className="font-mono text-xs text-slate-600 bg-slate-100 px-2 py-0.5 rounded">
                                    {row.token_prefix}••••••••
                                  </span>
                                  <span className={`w-2 h-2 rounded-full flex-shrink-0 ${row.enabled ? 'bg-emerald-400' : 'bg-slate-300'}`} />
                                </div>
                              ) : (
                                <span className="text-xs text-slate-400 italic">Not generated</span>
                              )}
                            </td>

                            {/* Last seen */}
                            <td className="px-4 py-3 text-xs text-slate-500">
                              {relTime(row.last_used_at)}
                            </td>

                            {/* Last IP */}
                            <td className="px-4 py-3">
                              <span className="font-mono text-xs text-slate-500">{row.last_ip || '—'}</span>
                            </td>

                            {/* 24h calls */}
                            <td className="px-4 py-3">
                              <div className="flex items-center gap-1.5">
                                <span className="text-sm font-semibold text-slate-700">
                                  {s.total_calls || 0}
                                </span>
                                {s.error_count > 0 && (
                                  <span className="text-xs text-red-600 font-medium">
                                    ({s.error_count} err)
                                  </span>
                                )}
                              </div>
                            </td>

                            {/* Actions */}
                            <td className="px-4 py-3">
                              <div className="flex items-center gap-1.5">
                                {/* Generate / Regenerate */}
                                <button
                                  disabled={busy}
                                  onClick={() => generateToken(row.center_id, row.center_name)}
                                  className="px-2.5 py-1 text-xs font-medium text-teal-700 bg-teal-50 hover:bg-teal-100 border border-teal-200 rounded-lg transition-colors disabled:opacity-50">
                                  {row.token_id ? 'Regenerate' : 'Generate Token'}
                                </button>

                                {/* Enable / Disable */}
                                {row.token_id && (
                                  <button
                                    disabled={busy}
                                    onClick={() => toggleEnabled(row.center_id, row.center_name, row.enabled)}
                                    className={`px-2.5 py-1 text-xs font-medium rounded-lg border transition-colors disabled:opacity-50 ${
                                      row.enabled
                                        ? 'text-amber-700 bg-amber-50 hover:bg-amber-100 border-amber-200'
                                        : 'text-emerald-700 bg-emerald-50 hover:bg-emerald-100 border-emerald-200'
                                    }`}>
                                    {row.enabled ? 'Disable' : 'Enable'}
                                  </button>
                                )}

                                {/* Revoke */}
                                {row.token_id && (
                                  <button
                                    disabled={busy}
                                    onClick={() => revokeToken(row.center_id, row.center_name)}
                                    className="px-2.5 py-1 text-xs font-medium text-red-600 bg-red-50 hover:bg-red-100 border border-red-200 rounded-lg transition-colors disabled:opacity-50">
                                    Revoke
                                  </button>
                                )}
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </>
        )}

        {/* ── LOGS TAB ── */}
        {tab === 'logs' && (
          <>
            {/* Filters */}
            <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4">
              <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 items-end">
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">Center</label>
                  <select value={logFilter.center_id}
                    onChange={e => setLogFilter(f => ({ ...f, center_id: e.target.value }))}
                    className="w-full border border-slate-200 rounded-lg px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500">
                    <option value="">All Centers</option>
                    {settings.map(s => (
                      <option key={s.center_id} value={s.center_id}>{s.center_name}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">Status</label>
                  <select value={logFilter.status}
                    onChange={e => setLogFilter(f => ({ ...f, status: e.target.value }))}
                    className="w-full border border-slate-200 rounded-lg px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500">
                    <option value="">All</option>
                    <option value="SUCCESS">Success</option>
                    <option value="ERROR">Error</option>
                    <option value="UNAUTHORIZED">Unauthorized</option>
                    <option value="DISABLED">Disabled</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">From</label>
                  <input type="date" value={logFilter.from}
                    onChange={e => setLogFilter(f => ({ ...f, from: e.target.value }))}
                    className="w-full border border-slate-200 rounded-lg px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500" />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">To</label>
                  <input type="date" value={logFilter.to}
                    onChange={e => setLogFilter(f => ({ ...f, to: e.target.value }))}
                    className="w-full border border-slate-200 rounded-lg px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500" />
                </div>
                <div className="flex gap-2">
                  <button onClick={() => loadLogs(1, logFilter)}
                    className="flex-1 px-3 py-1.5 text-sm font-semibold text-white rounded-lg transition-colors"
                    style={{ background: '#0d9488' }}>
                    Search
                  </button>
                  <button onClick={() => {
                    const empty = { center_id: '', status: '', from: '', to: '' };
                    setLogFilter(empty);
                    loadLogs(1, empty);
                  }}
                    className="px-3 py-1.5 text-sm font-semibold text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-lg">
                    Clear
                  </button>
                </div>
              </div>
            </div>

            {/* Per-center 24h stats strip */}
            {stats.filter(s => s.total_calls > 0).length > 0 && (
              <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-3">
                {stats.filter(s => s.total_calls > 0).map(s => (
                  <div key={s.center_id}
                    className={`rounded-xl border px-3 py-3 ${
                      parseInt(s.error_count) > 0 ? 'border-red-200 bg-red-50' : 'border-slate-200 bg-white'
                    } shadow-sm`}>
                    <p className="text-xs font-bold text-slate-700 truncate">{s.center_name}</p>
                    <div className="flex items-center gap-1 mt-1">
                      <span className="text-lg font-bold text-slate-800">{s.total_calls}</span>
                      <span className="text-xs text-slate-400">calls</span>
                    </div>
                    <div className="flex items-center gap-2 mt-1 text-xs">
                      <span className="text-emerald-600">{s.success_count} ok</span>
                      {s.error_count > 0 && <span className="text-red-600 font-bold">{s.error_count} err</span>}
                      {s.unauth_count > 0 && <span className="text-amber-600">{s.unauth_count} auth</span>}
                    </div>
                    <p className="text-xs text-slate-400 mt-0.5">{s.avg_response_ms}ms avg</p>
                  </div>
                ))}
              </div>
            )}

            {/* Logs table */}
            <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
              <div className="px-5 py-3 border-b border-slate-100 flex items-center justify-between"
                   style={{ borderLeft: '4px solid #0d9488' }}>
                <h3 className="text-sm font-bold text-slate-800">
                  Access Logs
                  <span className="ml-2 text-xs font-normal text-slate-400">({logTotal} total)</span>
                </h3>
                <button onClick={() => loadLogs(logPage, logFilter)}
                  className="text-xs text-teal-700 hover:text-teal-900 font-medium">
                  {logsLoading ? 'Loading…' : 'Refresh'}
                </button>
              </div>

              {logsLoading ? (
                <div className="py-12 text-center text-slate-400 text-sm">Loading logs…</div>
              ) : logs.length === 0 ? (
                <div className="py-12 text-center text-slate-400 text-sm">No logs found</div>
              ) : (
                <>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="bg-slate-50 border-b border-slate-100">
                          {['Time', 'Center', 'Status', 'Endpoint', 'Records', 'Response', 'IP', 'Error']
                            .map(h => (
                              <th key={h} className="px-3 py-2.5 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide">
                                {h}
                              </th>
                            ))}
                        </tr>
                      </thead>
                      <tbody>
                        {logs.map(log => {
                          const st = logStatusStyle[log.status] || logStatusStyle.SUCCESS;
                          return (
                            <tr key={log.id} className={`border-b border-slate-50 ${st.row} hover:opacity-80 transition-opacity`}>
                              <td className="px-3 py-2.5 text-xs text-slate-500 whitespace-nowrap font-mono">
                                {new Date(log.fetched_at).toLocaleString()}
                              </td>
                              <td className="px-3 py-2.5 font-medium text-slate-700 whitespace-nowrap">
                                {log.center_name || <span className="text-slate-400 italic">unknown</span>}
                              </td>
                              <td className="px-3 py-2.5">
                                <Badge label={st.label} color={st.badge} />
                              </td>
                              <td className="px-3 py-2.5 font-mono text-xs text-slate-600">
                                {log.endpoint}
                                {log.query_params && Object.keys(log.query_params).length > 0 && (
                                  <span className="text-slate-400 ml-1">
                                    ?{Object.entries(log.query_params).map(([k,v]) => `${k}=${v}`).join('&')}
                                  </span>
                                )}
                              </td>
                              <td className="px-3 py-2.5 text-center text-sm font-semibold text-slate-700">
                                {log.status === 'SUCCESS' ? log.records_returned : '—'}
                              </td>
                              <td className="px-3 py-2.5 text-xs text-slate-500 whitespace-nowrap">
                                {log.response_ms != null ? `${log.response_ms}ms` : '—'}
                              </td>
                              <td className="px-3 py-2.5 font-mono text-xs text-slate-400">
                                {log.client_ip || '—'}
                              </td>
                              <td className="px-3 py-2.5 text-xs text-red-600 max-w-xs truncate" title={log.error_message}>
                                {log.error_message || ''}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>

                  {/* Pagination */}
                  {logTotal > LOG_LIMIT && (
                    <div className="flex items-center justify-between px-5 py-3 border-t border-slate-100 bg-slate-50">
                      <p className="text-xs text-slate-500">
                        Showing {((logPage - 1) * LOG_LIMIT) + 1}–{Math.min(logPage * LOG_LIMIT, logTotal)} of {logTotal}
                      </p>
                      <div className="flex gap-2">
                        <button disabled={logPage <= 1}
                          onClick={() => loadLogs(logPage - 1, logFilter)}
                          className="px-3 py-1 text-xs font-medium text-slate-600 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 disabled:opacity-40">
                          Previous
                        </button>
                        <button disabled={logPage * LOG_LIMIT >= logTotal}
                          onClick={() => loadLogs(logPage + 1, logFilter)}
                          className="px-3 py-1 text-xs font-medium text-slate-600 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 disabled:opacity-40">
                          Next
                        </button>
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>
          </>
        )}

        {/* ── API REFERENCE TAB ── */}
        {tab === 'api' && (
          <div className="space-y-5">
            <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
              <div className="px-5 py-3.5 border-b border-slate-100" style={{ borderLeft: '4px solid #0d9488' }}>
                <h3 className="text-sm font-bold text-slate-800">MWL Worklist Endpoint</h3>
                <p className="text-xs text-slate-400 mt-0.5">Called by the local center app to fetch scheduled studies</p>
              </div>
              <div className="px-5 py-5 space-y-5">

                {/* Endpoint */}
                <div>
                  <p className="text-xs font-bold text-slate-600 uppercase tracking-wide mb-2">Endpoint</p>
                  <div className="flex items-center gap-2">
                    <span className="px-2 py-1 bg-emerald-100 text-emerald-700 text-xs font-bold rounded">GET</span>
                    <code className="font-mono text-sm text-slate-700 bg-slate-100 px-3 py-1 rounded-lg">
                      /api/mwl/worklist
                    </code>
                  </div>
                </div>

                {/* Auth */}
                <div>
                  <p className="text-xs font-bold text-slate-600 uppercase tracking-wide mb-2">Authentication — 2 Required Headers</p>
                  <div className="bg-slate-900 rounded-xl p-4 font-mono text-sm space-y-1">
                    <p className="text-slate-400">{'// Both headers are required on every request'}</p>
                    <p><span className="text-sky-400">Authorization</span><span className="text-slate-300">: </span><span className="text-emerald-400">Bearer {'<center-token>'}</span></p>
                    <p><span className="text-sky-400">X-Center-ID</span><span className="text-slate-300">:  </span><span className="text-yellow-300">{'<center-id>'}</span>
                      <span className="text-slate-500 ml-2">{'// e.g. 3'}</span></p>
                  </div>
                  <p className="text-xs text-slate-500 mt-2">
                    The <code className="bg-slate-100 px-1 rounded text-slate-700">X-Center-ID</code> must match the center the token was issued for.
                    A mismatch is logged as an unauthorized attempt even if the token is valid.
                  </p>
                </div>

                {/* Query params */}
                <div>
                  <p className="text-xs font-bold text-slate-600 uppercase tracking-wide mb-2">Query Parameters</p>
                  <table className="w-full text-sm border border-slate-200 rounded-xl overflow-hidden">
                    <thead>
                      <tr className="bg-slate-50">
                        <th className="px-3 py-2 text-left text-xs font-semibold text-slate-500">Param</th>
                        <th className="px-3 py-2 text-left text-xs font-semibold text-slate-500">Type</th>
                        <th className="px-3 py-2 text-left text-xs font-semibold text-slate-500">Default</th>
                        <th className="px-3 py-2 text-left text-xs font-semibold text-slate-500">Description</th>
                      </tr>
                    </thead>
                    <tbody>
                      {[
                        ['date',              'YYYY-MM-DD', 'today',       'Filter by appointment date'],
                        ['days_ahead',        'integer',    '0',           'Fetch N days ahead (0 = today only)'],
                        ['include_completed', 'boolean',    'false',       'Also return EXAM_COMPLETED studies'],
                        ['status',            'string',     '—',           'Direct exam_workflow_status override'],
                        ['accession',         'string',     '—',           'Exact accession number lookup'],
                      ].map(([p, t, d, desc]) => (
                        <tr key={p} className="border-t border-slate-100">
                          <td className="px-3 py-2 font-mono text-xs text-teal-700">{p}</td>
                          <td className="px-3 py-2 text-xs text-slate-500">{t}</td>
                          <td className="px-3 py-2 text-xs text-slate-400">{d}</td>
                          <td className="px-3 py-2 text-xs text-slate-600">{desc}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {/* Example request */}
                <div>
                  <p className="text-xs font-bold text-slate-600 uppercase tracking-wide mb-2">Example Request</p>
                  <div className="bg-slate-900 rounded-xl p-4 font-mono text-sm space-y-1">
                    <p className="text-slate-400">{'# Fetch today\'s full worklist for center 3 (all modalities)'}</p>
                    <p className="text-blue-400">curl \</p>
                    <p className="text-blue-400 ml-4">-H <span className="text-yellow-300">"Authorization: Bearer mwl_abc123..."</span> \</p>
                    <p className="text-blue-400 ml-4">-H <span className="text-yellow-300">"X-Center-ID: 3"</span> \</p>
                    <p className="text-blue-400 ml-4">
                      <span className="text-white">"</span>
                      <span className="text-emerald-400">{"https://erp.feenixtech.com"}</span>
                      <span className="text-white">/api/mwl/worklist?date=2026-03-24"</span>
                    </p>
                  </div>
                </div>

                {/* Example response */}
                <div>
                  <p className="text-xs font-bold text-slate-600 uppercase tracking-wide mb-2">Response Structure</p>
                  <div className="bg-slate-900 rounded-xl p-4 font-mono text-xs text-slate-300 overflow-x-auto">
                    <pre>{`{
  "success": true,
  "center": { "id": 1, "name": "ARIS Center 1", "ae_title": "ARIS_CT1" },
  "date": "2026-03-24",
  "count": 3,
  "worklist": [
    {
      "accession_number": "ACC-001234",
      "study_instance_uid": "1.2.840.xxxxx",
      "patient_id": "PID-000123",
      "patient_name_dicom": "DOE^JOHN^",     // DICOM PN format
      "patient_name": "John Doe",
      "patient_dob": "19800115",              // YYYYMMDD
      "patient_sex": "M",                     // M | F | O
      "scheduled_procedure": {
        "modality": "CT",
        "procedure_code": "CT-CHEST",
        "procedure_description": "CT Thorax",
        "cpt_code": "71250",
        "scheduled_datetime": "20260324090000",
        "station_ae_title": "ARIS_CT1",
        "contrast_used": false,
        "emergency": false
      },
      "referring_physician_dicom": "SMITH^JOHN^DR",
      "referring_physician_name": "Dr. John Smith",
      "center_name": "ARIS Center 1",
      "status": "scheduled"
    }
  ],
  "generated_at": "2026-03-24T07:30:00.000Z"
}`}</pre>
                  </div>
                </div>

                {/* Error responses */}
                <div>
                  <p className="text-xs font-bold text-slate-600 uppercase tracking-wide mb-2">Error Responses</p>
                  <table className="w-full text-sm border border-slate-200 rounded-xl overflow-hidden">
                    <thead>
                      <tr className="bg-slate-50">
                        <th className="px-3 py-2 text-left text-xs font-semibold text-slate-500">HTTP</th>
                        <th className="px-3 py-2 text-left text-xs font-semibold text-slate-500">error</th>
                        <th className="px-3 py-2 text-left text-xs font-semibold text-slate-500">Cause</th>
                      </tr>
                    </thead>
                    <tbody>
                      {[
                        ['401', 'Authorization required — provide Bearer token', 'Missing Authorization header'],
                        ['401', 'Center ID required — provide X-Center-ID header', 'Missing X-Center-ID header'],
                        ['401', 'Invalid token',          'Token hash not found in DB'],
                        ['401', 'Center ID mismatch',     'X-Center-ID does not match the token\'s bound center'],
                        ['403', 'MWL integration is disabled', 'Center has been disabled in ARIS settings'],
                        ['500', 'Internal error',         'Server error — check ARIS backend logs'],
                      ].map(([code, msg, cause]) => (
                        <tr key={code + msg} className="border-t border-slate-100">
                          <td className="px-3 py-2 font-mono text-xs text-red-600 font-bold">{code}</td>
                          <td className="px-3 py-2 font-mono text-xs text-slate-700">{msg}</td>
                          <td className="px-3 py-2 text-xs text-slate-500">{cause}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>

            {/* Health check */}
            <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
              <div className="px-5 py-3.5 border-b border-slate-100" style={{ borderLeft: '4px solid #D4841A' }}>
                <h3 className="text-sm font-bold text-slate-800">Health Check (No Auth)</h3>
              </div>
              <div className="px-5 py-4">
                <div className="flex items-center gap-2 mb-3">
                  <span className="px-2 py-1 bg-emerald-100 text-emerald-700 text-xs font-bold rounded">GET</span>
                  <code className="font-mono text-sm text-slate-700 bg-slate-100 px-3 py-1 rounded-lg">
                    /api/mwl/health
                  </code>
                </div>
                <p className="text-xs text-slate-500">Use this from the local app on startup to verify connectivity to the ARIS server before attempting worklist fetches.</p>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Token reveal modal */}
      {newToken && (
        <TokenModal
          token={newToken.raw_token}
          centerId={newToken.center_id}
          centerName={newToken.center_name}
          onClose={() => setNewToken(null)}
        />
      )}
    </div>
  );
}
