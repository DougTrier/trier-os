// Copyright © 2026 Trier OS. All Rights Reserved.

/**
 * © 2026 Doug Trier. All Rights Reserved.
 * Trier OS is proprietary software. Unauthorized copying,
 * distribution, or reverse engineering is strictly prohibited.
 */
/**
 * Trier OS — Live Studio In-App IDE
 * ====================================
 * The in-browser code editor and deploy pipeline for authorized Creators and
 * IT Admins. Renders as a full-screen modal portal. Never loads for standard
 * users — the entire component tree is gated behind the Creator/IT Admin RBAC
 * check in App.jsx, so the Monaco bundle never reaches plant-floor endpoints.
 *
 * TABS:
 *   Editor  — Monaco-powered code editor with file browser sidebar.
 *             Files are scoped to src/components/ and server/routes/ only.
 *   Deploy  — Git branch management, legal warning banner, build pipeline
 *             trigger with mandatory "DEPLOY NOW" confirmation, and live
 *             build log streaming via polling.
 *   Ledger  — Immutable history of every deploy and revert operation.
 *
 * KEY FEATURES:
 *   - Monaco Editor (VS Code engine) lazy-loaded only when modal opens
 *   - Hard file whitelist enforced on both client and server
 *   - Persistent legal warning: "Operations here permanently modify Trier OS"
 *   - Sandbox branch creation with studio/<user>/<descriptor> naming convention
 *   - Deploy pipeline: stage → commit → npm build → stable tag → PM2 reload
 *   - Client-side state machine: Idle → Building → Success/Failed
 *   - Exponential backoff health polling during deploy
 *   - Revert-to-last-stable with single button + confirmation
 *   - Full deploy log display in real-time via 2s polling
 *
 * SECURITY:
 *   - Only renders when App.jsx confirms Creator username or IT Admin role
 *   - All API calls include the auth Bearer token automatically via apiFetch
 *   - No code execution in the browser — all run server-side in child processes
 *   - File writes rejected by server if path not in whitelist
 *
 * DATA SOURCES:
 *   GET  /api/studio/files          — file tree
 *   GET  /api/studio/file?path=...  — file content
 *   POST /api/studio/file           — save file
 *   GET  /api/studio/git/status     — branch info
 *   POST /api/studio/git/branch     — create/switch branch
 *   POST /api/studio/deploy                  — trigger deploy
 *   GET  /api/studio/deploy/:id              — poll deploy status
 *   POST /api/studio/deploy/revert           — revert to stable
 *   GET  /api/studio/ledger                  — deploy history
 *   POST /api/studio/analyze/friction        — Frictional Cost Engine analysis
 *   POST /api/studio/simulation/create       — clone + strip plant DB
 *   GET  /api/studio/simulation/:id/compare  — split-screen KPI comparison
 *   GET  /api/studio/plants                  — plant list for simulation picker
 *   POST /api/studio/analyze/blast-radius   — blast-radius route impact map (§14)
 *   GET  /api/studio/ledger/search          — filtered deploy history search (§15)
 */

import React, { useState, useEffect, useRef, useCallback, lazy, Suspense } from 'react';
import { createPortal } from 'react-dom';
import { X, Code, FolderOpen, Rocket, ClipboardList, Save, GitBranch, RefreshCw, AlertTriangle, CheckCircle, XCircle, ChevronRight, DollarSign, FlaskConical, TrendingDown, TrendingUp, Minus, Zap, Search, FileDown, Copy, Check, PanelRight } from 'lucide-react';

// Monaco is lazy-loaded — it only downloads when the Studio modal is actually opened.
// The RBAC gate in App.jsx ensures this never loads for technician sessions.
// In production builds, serve Monaco from /monaco-vs (self-hosted, no CDN, CSP-safe).
// In dev, the Vite dev server has no CSP so the default CDN path works fine.
import('@monaco-editor/react').then(({ loader }) => {
    if (import.meta.env.PROD) {
        loader.config({ paths: { vs: '/monaco-vs' } });
    }
});
const MonacoEditor = lazy(() => import('@monaco-editor/react').then(m => ({ default: m.default })));

// ── API helper ───────────────────────────────────────────────────────────────
function apiFetch(path, options = {}) {
    const token = localStorage.getItem('authToken');
    return fetch(path, {
        ...options,
        headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
            ...(options.headers || {}),
        },
    }).then(r => r.json());
}

// ── Status badge ─────────────────────────────────────────────────────────────
function StatusBadge({ status }) {
    const map = {
        SUCCESS:  { color: '#10b981', label: 'Success' },
        FAILED:   { color: '#ef4444', label: 'Failed' },
        BUILDING: { color: '#f59e0b', label: 'Building…' },
        REVERTED: { color: '#6366f1', label: 'Reverted' },
        PENDING:  { color: '#64748b', label: 'Pending' },
    };
    const s = map[status] || map.PENDING;
    return (
        <span style={{
            display: 'inline-flex', alignItems: 'center', gap: 5,
            padding: '2px 10px', borderRadius: 99, fontSize: '0.75rem', fontWeight: 600,
            background: s.color + '22', color: s.color, border: `1px solid ${s.color}44`,
        }}>
            <span style={{ width: 6, height: 6, borderRadius: '50%', background: s.color }} />
            {s.label}
        </span>
    );
}

// ── Highlight matching text with an indigo glow ──────────────────────────────
function highlightMatch(text, query) {
    if (!query) return text;
    const lower = text.toLowerCase();
    const q = query.toLowerCase();
    const parts = [];
    let cursor = 0;
    let idx = lower.indexOf(q, cursor);
    while (idx !== -1) {
        if (idx > cursor) parts.push(<span key={cursor}>{text.slice(cursor, idx)}</span>);
        parts.push(
            <span key={idx} style={{
                color: '#c7d2fe',
                fontWeight: 700,
                textShadow: '0 0 6px rgba(99,102,241,1), 0 0 14px rgba(99,102,241,0.7)',
            }}>
                {text.slice(idx, idx + query.length)}
            </span>
        );
        cursor = idx + query.length;
        idx = lower.indexOf(q, cursor);
    }
    if (cursor < text.length) parts.push(<span key={cursor}>{text.slice(cursor)}</span>);
    return parts.length ? parts : text;
}

// ── Main component ───────────────────────────────────────────────────────────
export default function LiveStudio({ isOpen, onClose, initialFile = null }) {
    const [activeTab, setActiveTab] = useState('editor');
    // Start docked when opened via "Go to Code" (initialFile provided), full-screen when opened from the nav button.
    const [isDocked, setIsDocked] = useState(!!initialFile);
    const [panelWidth, setPanelWidth] = useState(50); // percentage of viewport width when docked
    const [files, setFiles] = useState([]);
    const [selectedFile, setSelectedFile] = useState(null);
    const [editorContent, setEditorContent] = useState('');
    const [savedContent, setSavedContent] = useState('');
    const [saving, setSaving] = useState(false);
    const [saveMsg, setSaveMsg] = useState('');
    const [gitStatus, setGitStatus] = useState(null);
    const [branchInput, setBranchInput] = useState('');
    const [deployConfirm, setDeployConfirm] = useState('');
    const [deployNotes, setDeployNotes] = useState('');
    const [deployState, setDeployState] = useState('idle'); // idle | building | success | failed
    const [commitMsg, setCommitMsg] = useState('');
    const [commitState, setCommitState] = useState('idle'); // idle | working | success | error
    const [commitResult, setCommitResult] = useState(null);
    const [deployLog, setDeployLog] = useState('');
    const [currentLedgerId, setCurrentLedgerId] = useState(null);
    const [ledger, setLedger] = useState([]);
    const [revertConfirm, setRevertConfirm] = useState(false);
    const pollRef = useRef(null);
    const searchDebounceRef = useRef(null);
    const editorRef = useRef(null);          // Monaco editor instance
    const decorationsRef = useRef([]);       // current highlight decoration IDs
    const matchRangesRef = useRef([]);       // Monaco Range objects for each match

    // ── Codebase search state ─────────────────────────────────────
    const [codeSearch, setCodeSearch] = useState('');
    const [searchResults, setSearchResults] = useState(null); // null = not in search mode
    const [isSearching, setIsSearching] = useState(false);
    const [matchIndex, setMatchIndex] = useState(0);   // which match is "current" in the editor
    const [totalMatches, setTotalMatches] = useState(0);
    const [editingLine, setEditingLine] = useState(null); // line number being inline-edited in filtered view

    // §9 Frictional Cost Engine state
    const [frictionResult, setFrictionResult] = useState(null);
    const [frictionLoading, setFrictionLoading] = useState(false);

    // §14 Blast Radius state
    const [blastResult, setBlastResult] = useState(null);
    const [blastLoading, setBlastLoading] = useState(false);

    // §15 Ledger search state
    const [ledgerSearchQ, setLedgerSearchQ]           = useState('');
    const [ledgerSearchUser, setLedgerSearchUser]     = useState('');
    const [ledgerSearchFrom, setLedgerSearchFrom]     = useState('');
    const [ledgerSearchTo, setLedgerSearchTo]         = useState('');
    const [ledgerSearchStatus, setLedgerSearchStatus] = useState('');
    const [ledgerSearching, setLedgerSearching]       = useState(false);
    const [copiedSHA, setCopiedSHA]                   = useState(null);

    // §10 Parallel Universe state
    const [plants, setPlants] = useState([]);
    const [simPlant, setSimPlant] = useState('');
    const [simDate, setSimDate] = useState(new Date().toISOString().slice(0, 10));
    const [simState, setSimState] = useState('idle'); // idle | creating | ready | error
    const [simId, setSimId] = useState(null);
    const [simResult, setSimResult] = useState(null);

    const isDirty = editorContent !== savedContent;

    // ── Load file tree on open, auto-load initialFile if provided ───────────
    useEffect(() => {
        if (!isOpen) return;
        apiFetch('/api/studio/files').then(d => {
            if (d.files) {
                setFiles(d.files);
                if (initialFile) {
                    const match = d.files.find(f => f.path === initialFile || f.path.endsWith(initialFile));
                    if (match) loadFile(match);
                }
            }
        }).catch(() => {});
        refreshGitStatus();
    }, [isOpen]); // eslint-disable-line react-hooks/exhaustive-deps

    // ── Load plants list for Parallel Universe picker ────────────────────────
    useEffect(() => {
        if (isOpen && plants.length === 0) {
            apiFetch('/api/studio/plants').then(d => { if (d.plants) setPlants(d.plants); }).catch(() => {});
        }
    }, [isOpen]); // eslint-disable-line react-hooks/exhaustive-deps

    // ── Load ledger when tab opens ───────────────────────────────────────────
    useEffect(() => {
        if (activeTab === 'ledger') {
            apiFetch('/api/studio/ledger').then(d => { if (d.entries) setLedger(d.entries); }).catch(() => {});
        }
    }, [activeTab]);

    // ── Load ledger after deploy completes ───────────────────────────────────
    useEffect(() => {
        if (deployState === 'success' || deployState === 'failed') {
            apiFetch('/api/studio/ledger').then(d => { if (d.entries) setLedger(d.entries); }).catch(() => {});
        }
    }, [deployState]);

    const refreshGitStatus = useCallback(() => {
        apiFetch('/api/studio/git/status').then(d => { if (d.branch) setGitStatus(d); }).catch(() => {});
    }, []);

    // ── Select and load a file ───────────────────────────────────────────────
    const loadFile = useCallback((file) => {
        if (isDirty) {
            if (!window.confirm(`You have unsaved changes in ${selectedFile?.name}. Discard them?`)) return;
        }
        apiFetch(`/api/studio/file?path=${encodeURIComponent(file.path)}`)
            .then(d => {
                if (d.content !== undefined) {
                    setSelectedFile(file);
                    setEditorContent(d.content);
                    setSavedContent(d.content);
                    setSaveMsg('');
                }
            }).catch(() => {});
    }, [isDirty, selectedFile]);

    // ── Resize main page when docked so it occupies the left portion ─
    // panelWidth is intentionally excluded — the drag handler updates body directly
    // so there's no per-frame animation lag. This effect only runs on dock/undock toggle.
    useEffect(() => {
        const easing = '0.2s cubic-bezier(0.4, 0, 0.2, 1)';
        document.body.style.transition = `padding-right ${easing}`;
        document.body.style.paddingRight = (isOpen && isDocked) ? `${panelWidth}vw` : '';
        return () => {
            document.body.style.paddingRight = '';
            document.body.style.transition = '';
        };
    }, [isOpen, isDocked]); // eslint-disable-line react-hooks/exhaustive-deps

    // ── Drag-to-resize handle ──────────────────────────────────────
    const handleDragStart = useCallback((e) => {
        e.preventDefault();
        document.body.style.transition = '';      // kill transition during drag for instant feedback
        document.body.style.cursor = 'col-resize';
        document.body.style.userSelect = 'none';

        const onMouseMove = (ev) => {
            const pct = Math.min(80, Math.max(20,
                ((window.innerWidth - ev.clientX) / window.innerWidth) * 100
            ));
            setPanelWidth(pct);
            document.body.style.paddingRight = `${pct}vw`;
        };
        const onMouseUp = () => {
            document.body.style.cursor = '';
            document.body.style.userSelect = '';
            window.removeEventListener('mousemove', onMouseMove);
            window.removeEventListener('mouseup', onMouseUp);
        };
        window.addEventListener('mousemove', onMouseMove);
        window.addEventListener('mouseup', onMouseUp);
    }, []);

    // ── Handle external 'Go to Code' dynamic navigation ───────────
    useEffect(() => {
        const handleOpenStudio = (e) => {
            const targetPath = e.detail?.file;
            if (!targetPath || files.length === 0) return;
            const match = files.find(f => f.path === targetPath || f.path.endsWith(targetPath));
            if (match) {
                loadFile(match);
                setActiveTab('editor');
                setIsDocked(true); // Switch to side-by-side so the manual page stays visible
            }
        };
        window.addEventListener('open-studio', handleOpenStudio);
        return () => window.removeEventListener('open-studio', handleOpenStudio);
    }, [files, loadFile]);

    // ── Save file ────────────────────────────────────────────────────────────
    const saveFile = useCallback(() => {
        if (!selectedFile) return;
        setSaving(true);
        apiFetch('/api/studio/file', {
            method: 'POST',
            body: JSON.stringify({ path: selectedFile.path, content: editorContent }),
        }).then(d => {
            if (d.success) {
                setSavedContent(editorContent);
                setSaveMsg('Saved ✓');
                setTimeout(() => setSaveMsg(''), 2500);
            } else {
                setSaveMsg('Error: ' + (d.error || 'Unknown error'));
            }
        }).catch(e => setSaveMsg('Save failed: ' + e.message))
          .finally(() => setSaving(false));
    }, [selectedFile, editorContent]);

    // Ctrl+S to save
    useEffect(() => {
        const handler = (e) => { if ((e.ctrlKey || e.metaKey) && e.key === 's') { e.preventDefault(); saveFile(); } };
        window.addEventListener('keydown', handler);
        return () => window.removeEventListener('keydown', handler);
    }, [saveFile]);

    // ── Apply Monaco decorations for all matches, highlighting currentIdx ──
    const applyMatchDecorations = useCallback((editor, ranges, currentIdx) => {
        decorationsRef.current = editor.deltaDecorations(
            decorationsRef.current,
            ranges.map((range, i) => ({
                range,
                options: {
                    inlineClassName: i === currentIdx
                        ? 'studio-match-current'
                        : 'studio-match-all',
                    overviewRuler: {
                        color: i === currentIdx ? '#fde047' : '#6366f1',
                        position: 1,
                    },
                },
            }))
        );
    }, []);

    // ── Rebuild decorations when search query or file content changes ─
    useEffect(() => {
        const editor = editorRef.current;
        if (!editor) return;
        decorationsRef.current = editor.deltaDecorations(decorationsRef.current, []);
        matchRangesRef.current = [];
        setMatchIndex(0);
        setTotalMatches(0);
        const q = codeSearch.trim();
        if (!q || q.length < 2) return;
        const model = editor.getModel();
        if (!model) return;
        const matches = model.findMatches(q, false, false, false, null, false);
        const ranges = matches.map(m => m.range);
        matchRangesRef.current = ranges;
        setTotalMatches(ranges.length);
        if (ranges.length === 0) return;
        applyMatchDecorations(editor, ranges, 0);
        editor.revealRangeInCenter(ranges[0]);
    }, [codeSearch, editorContent, applyMatchDecorations]);

    // ── Navigate to prev/next match in the editor ────────────────
    const navigateMatch = useCallback((dir) => {
        const ranges = matchRangesRef.current;
        if (!ranges.length) return;
        setMatchIndex(prev => {
            const next = (prev + dir + ranges.length) % ranges.length;
            const editor = editorRef.current;
            if (editor) {
                applyMatchDecorations(editor, ranges, next);
                editor.revealRangeInCenter(ranges[next]);
            }
            return next;
        });
    }, [applyMatchDecorations]);

    // ── Codebase search (debounced 400ms) ────────────────────────
    const handleCodeSearch = useCallback((val) => {
        setCodeSearch(val);
        if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current);
        if (!val.trim() || val.trim().length < 2) { setSearchResults(null); setIsSearching(false); return; }
        setIsSearching(true);
        searchDebounceRef.current = setTimeout(() => {
            apiFetch(`/api/studio/search?q=${encodeURIComponent(val.trim())}`)
                .then(d => { setSearchResults(d.results || []); setIsSearching(false); })
                .catch(() => setIsSearching(false));
        }, 400);
    }, []);

    // ── Auto-suggest branch name from current user + open file ──────────────
    useEffect(() => {
        // Use the loaded file name, or fall back to the initialFile prop so the
        // branch name is populated immediately on open even before the file loads.
        const fileName = selectedFile?.name
            || (initialFile ? initialFile.split('/').pop().split('\\').pop() : null);
        if (!fileName) return;
        const username = (localStorage.getItem('currentUser') || 'user')
            .toLowerCase().replace(/\s+/g, '');
        const descriptor = 'edit-' + fileName.replace(/\.[^.]+$/, '').toLowerCase();
        const suggested = `studio/${username}/${descriptor}`;
        setBranchInput(prev => {
            // Only overwrite if the field is empty or still holds a previous auto-suggestion
            if (!prev || prev.startsWith('studio/')) return suggested;
            return prev;
        });
    }, [selectedFile, initialFile]);

    // ── Create / switch branch ───────────────────────────────────────────────
    const createBranch = useCallback(() => {
        if (!branchInput.trim()) return;
        apiFetch('/api/studio/git/branch', {
            method: 'POST',
            body: JSON.stringify({ branchName: branchInput.trim() }),
        }).then(d => {
            if (d.success) { refreshGitStatus(); } // keep field filled — auto-fill already set it
            else alert('Branch error: ' + (d.error || 'Unknown'));
        }).catch(() => {});
    }, [branchInput, refreshGitStatus]);

    // ── Deploy pipeline ──────────────────────────────────────────────────────
    const triggerDeploy = useCallback(() => {
        if (deployConfirm !== 'DEPLOY NOW') return;
        setDeployState('building');
        setDeployLog('Initiating deploy pipeline…');

        apiFetch('/api/studio/deploy', {
            method: 'POST',
            body: JSON.stringify({ confirmation: deployConfirm, notes: deployNotes }),
        }).then(d => {
            if (d.error) {
                setDeployState('failed');
                setDeployLog('Deploy blocked: ' + d.error);
                return;
            }
            setCurrentLedgerId(d.ledgerId);
            startPolling(d.ledgerId);
        }).catch(e => {
            setDeployState('failed');
            setDeployLog('Network error: ' + e.message);
        });
    }, [deployConfirm, deployNotes]);

    // Poll deploy status with exponential backoff
    const startPolling = useCallback((ledgerId) => {
        let attempt = 0;
        const poll = () => {
            const delay = Math.min(2000 * Math.pow(1.3, attempt), 10000);
            pollRef.current = setTimeout(async () => {
                try {
                    const d = await apiFetch(`/api/studio/deploy/${ledgerId}`);
                    if (d.BuildLog) setDeployLog(d.BuildLog);
                    if (d.Status === 'SUCCESS') {
                        setDeployState('success');
                        setDeployConfirm('');
                        refreshGitStatus();
                    } else if (d.Status === 'FAILED') {
                        setDeployState('failed');
                    } else {
                        attempt++;
                        poll();
                    }
                } catch {
                    attempt++;
                    poll();
                }
            }, delay);
        };
        poll();
    }, [refreshGitStatus]);

    useEffect(() => () => clearTimeout(pollRef.current), []);

    // ── Revert ───────────────────────────────────────────────────────────────
    const triggerRevert = useCallback(() => {
        if (!revertConfirm) return;
        apiFetch('/api/studio/deploy/revert', { method: 'POST' })
            .then(d => {
                if (d.success) {
                    setRevertConfirm(false);
                    refreshGitStatus();
                    setDeployLog(`Reverted to ${d.revertedTo}`);
                } else {
                    alert('Revert failed: ' + (d.error || 'Unknown'));
                }
            }).catch(() => {});
    }, [revertConfirm, refreshGitStatus]);

    // ── §9 Frictional Cost Engine ────────────────────────────────────────────
    const runFrictionAnalysis = useCallback(() => {
        if (!selectedFile) return;
        setFrictionLoading(true);
        setFrictionResult(null);
        apiFetch('/api/studio/analyze/friction', {
            method: 'POST',
            body: JSON.stringify({ filePath: selectedFile.path, currentContent: editorContent }),
        }).then(d => setFrictionResult(d))
          .catch(e => setFrictionResult({ error: e.message }))
          .finally(() => setFrictionLoading(false));
    }, [selectedFile, editorContent]);

    // ── §10 Parallel Universe ────────────────────────────────────────────────
    const createSimulation = useCallback(() => {
        if (!simPlant || !simDate) return;
        setSimState('creating');
        setSimResult(null);
        apiFetch('/api/studio/simulation/create', {
            method: 'POST',
            body: JSON.stringify({ plantId: simPlant, cutoffDate: simDate }),
        }).then(d => {
            if (d.simId) {
                setSimId(d.simId);
                // Auto-load comparison
                return apiFetch(`/api/studio/simulation/${d.simId}/compare`);
            }
            throw new Error(d.error || 'Failed to create simulation');
        }).then(d => {
            setSimResult(d);
            setSimState('ready');
        }).catch(e => {
            setSimResult({ error: e.message });
            setSimState('error');
        });
    }, [simPlant, simDate]);

    const destroySimulation = useCallback(() => {
        if (!simId) return;
        apiFetch(`/api/studio/simulation/${simId}`, { method: 'DELETE' }).catch(() => {});
        setSimId(null);
        setSimResult(null);
        setSimState('idle');
    }, [simId]);

    // ── §14 Blast Radius ─────────────────────────────────────────────────────
    const runBlastRadius = useCallback(() => {
        setBlastLoading(true);
        setBlastResult(null);
        // Use current file if open, otherwise server falls back to git diff
        const body = selectedFile ? { filePath: selectedFile.path } : {};
        apiFetch('/api/studio/analyze/blast-radius', {
            method: 'POST',
            body: JSON.stringify(body),
        }).then(d => setBlastResult(d))
          .catch(e => setBlastResult({ error: e.message }))
          .finally(() => setBlastLoading(false));
    }, [selectedFile]);

    // ── §15 Ledger search ────────────────────────────────────────────────────
    const searchLedger = useCallback(() => {
        setLedgerSearching(true);
        const params = new URLSearchParams();
        if (ledgerSearchQ)      params.set('q',      ledgerSearchQ);
        if (ledgerSearchUser)   params.set('user',   ledgerSearchUser);
        if (ledgerSearchFrom)   params.set('from',   ledgerSearchFrom);
        if (ledgerSearchTo)     params.set('to',     ledgerSearchTo);
        if (ledgerSearchStatus) params.set('status', ledgerSearchStatus);
        apiFetch(`/api/studio/ledger/search?${params}`)
            .then(d => { if (d.entries) setLedger(d.entries); })
            .catch(() => {})
            .finally(() => setLedgerSearching(false));
    }, [ledgerSearchQ, ledgerSearchUser, ledgerSearchFrom, ledgerSearchTo, ledgerSearchStatus]);

    // §15 PDF export — opens a print-ready window with the current ledger view
    const exportLedgerPDF = useCallback(() => {
        const rows = ledger.map(e => `
            <tr>
                <td>#${e.ID}</td>
                <td>${e.Status}</td>
                <td>${e.DeployedBy || ''}</td>
                <td>${e.SandboxBranch || '--'}</td>
                <td>${e.StableTag || '--'}</td>
                <td style="font-family:monospace;font-size:11px">${e.CommitSHA ? e.CommitSHA.slice(0, 12) : '--'}</td>
                <td>${e.StartedAt ? new Date(e.StartedAt).toLocaleString() : '--'}</td>
                <td>${e.Notes ? e.Notes.replace(/</g, '&lt;') : ''}</td>
            </tr>`).join('');
        const html = `<!DOCTYPE html><html><head><title>Trier OS -- Deploy Ledger</title>
            <style>
                body{font-family:system-ui,sans-serif;padding:24px;font-size:12px;color:#111}
                h1{font-size:17px;margin:0 0 4px}p{color:#666;font-size:11px;margin:0 0 14px}
                table{width:100%;border-collapse:collapse;page-break-inside:auto}
                th,td{border:1px solid #d1d5db;padding:5px 8px;text-align:left;vertical-align:top}
                th{background:#f3f4f6;font-weight:700;font-size:11px}
                tr:nth-child(even){background:#f9fafb}
                .btn{display:inline-block;padding:6px 14px;background:#4f46e5;color:#fff;border:none;border-radius:5px;cursor:pointer;margin-bottom:14px;font-size:12px}
                @media print{.btn{display:none}}
            </style></head>
            <body>
                <h1>Trier OS -- Executive Deploy Ledger</h1>
                <p>Exported: ${new Date().toLocaleString()} &nbsp;|&nbsp; ${ledger.length} entries</p>
                <button class="btn" onclick="window.print()">Print / Save as PDF</button>
                <table>
                    <thead><tr><th>#</th><th>Status</th><th>Deployed By</th><th>Branch</th><th>Tag</th><th>Commit SHA</th><th>Started</th><th>Notes</th></tr></thead>
                    <tbody>${rows}</tbody>
                </table>
            </body></html>`;
        const win = window.open('', '_blank');
        if (win) { win.document.write(html); win.document.close(); }
    }, [ledger]);

    // §15 SHA copy to clipboard
    const copySHA = useCallback((sha) => {
        navigator.clipboard.writeText(sha).then(() => {
            setCopiedSHA(sha);
            setTimeout(() => setCopiedSHA(null), 2000);
        }).catch(() => {});
    }, []);

    // ── File tree grouped by section ─────────────────────────────────────────
    const sections = files.reduce((acc, f) => {
        if (!acc[f.section]) acc[f.section] = [];
        acc[f.section].push(f);
        return acc;
    }, {});

    const tabBtn = (id, icon, label) => (
        <button
            onClick={() => setActiveTab(id)}
            style={{
                display: 'flex', alignItems: 'center', gap: 6,
                padding: '7px 16px', border: 'none', cursor: 'pointer',
                borderRadius: '6px 6px 0 0', fontSize: '0.82rem', fontWeight: 600,
                background: activeTab === id ? 'rgba(99,102,241,0.18)' : 'transparent',
                color: activeTab === id ? '#818cf8' : '#64748b',
                borderBottom: activeTab === id ? '2px solid #6366f1' : '2px solid transparent',
                transition: 'all 0.15s',
            }}
        >
            {icon}{label}
        </button>
    );

    if (!isOpen) return null;

    return createPortal(
        <div style={{
            position: 'fixed',
            inset: isDocked ? undefined : 0,
            top: isDocked ? 0 : undefined,
            bottom: isDocked ? 0 : undefined,
            right: isDocked ? 0 : undefined,
            width: isDocked ? `${panelWidth}vw` : undefined,
            zIndex: 300000,
            background: 'rgba(0,0,0,0.85)', backdropFilter: 'blur(6px)',
            borderLeft: isDocked ? '1px solid rgba(255,255,255,0.1)' : undefined,
            boxShadow: isDocked ? '-10px 0 30px rgba(0,0,0,0.5)' : undefined,
            display: 'flex', flexDirection: 'column',
        }}>
            {/* ── Drag-to-resize handle (docked mode only) ───────────────── */}
            {isDocked && (
                <div
                    onMouseDown={handleDragStart}
                    style={{
                        position: 'absolute', left: 0, top: 0, bottom: 0, width: 6,
                        cursor: 'col-resize', zIndex: 1,
                        background: 'rgba(99,102,241,0.15)',
                        transition: 'background 0.15s',
                    }}
                    onMouseEnter={e => e.currentTarget.style.background = 'rgba(99,102,241,0.5)'}
                    onMouseLeave={e => e.currentTarget.style.background = 'rgba(99,102,241,0.15)'}
                    title="Drag to resize"
                />
            )}
            {/* ── Legal Warning Banner ────────────────────────────────────── */}
            <div style={{
                background: 'linear-gradient(90deg, rgba(239,68,68,0.25), rgba(245,158,11,0.18))',
                borderBottom: '1px solid rgba(239,68,68,0.4)',
                padding: '7px 20px', display: 'flex', alignItems: 'center', gap: 10,
                fontSize: '0.8rem', color: '#fca5a5', fontWeight: 600,
                flexShrink: 0,
            }}>
                <AlertTriangle size={14} />
                Caution: Operations in this workspace will permanently modify the running Trier OS environment.
            </div>

            {/* ── Header ─────────────────────────────────────────────────── */}
            <div style={{
                display: 'flex', flexDirection: 'column', gap: 8,
                padding: '10px 16px', borderBottom: '1px solid rgba(255,255,255,0.08)',
                background: 'rgba(15,23,42,0.95)', flexShrink: 0,
            }}>
                {/* Top row: title/branch + tabs + controls */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', rowGap: 6 }}>
                    {/* Left: title + branch badge */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, flex: '0 0 auto' }}>
                        <Code size={18} color="#6366f1" />
                        <span style={{ color: '#e2e8f0', fontWeight: 700, fontSize: '1rem', whiteSpace: 'nowrap' }}>Trier OS Live Studio</span>
                        {gitStatus && (
                            <span style={{
                                display: 'flex', alignItems: 'center', gap: 5,
                                padding: '2px 10px', borderRadius: 99, fontSize: '0.72rem',
                                background: 'rgba(99,102,241,0.12)', color: '#818cf8',
                                border: '1px solid rgba(99,102,241,0.2)', whiteSpace: 'nowrap',
                            }}>
                                <GitBranch size={10} /> {gitStatus.branch}
                                {gitStatus.isDirty && <span style={{ color: '#f59e0b', marginLeft: 4 }}>● {gitStatus.changedFiles} changed</span>}
                            </span>
                        )}
                    </div>

                    {/* Right: tabs + controls — pushed to end, wraps below title on narrow */}
                    <div style={{ display: 'flex', gap: 8, marginLeft: 'auto', flex: '0 0 auto', flexWrap: 'wrap', rowGap: 6 }}>
                        {tabBtn('editor', <Code size={12} />, 'Editor')}
                        {tabBtn('deploy', <Rocket size={12} />, 'Deploy')}
                        {tabBtn('friction', <DollarSign size={12} />, 'Friction')}
                        {tabBtn('universe', <FlaskConical size={12} />, 'Universe')}
                        {tabBtn('impact', <Zap size={12} />, 'Impact')}
                        {tabBtn('ledger', <ClipboardList size={12} />, 'Ledger')}

                        <button onClick={() => setIsDocked(!isDocked)} style={{
                            width: 30, height: 30, borderRadius: '50%', border: 'none',
                            background: isDocked ? 'rgba(99,102,241,0.2)' : 'rgba(255,255,255,0.05)',
                            color: isDocked ? '#818cf8' : '#cbd5e1',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            cursor: 'pointer', marginLeft: 8, transition: 'all 0.2s'
                        }} title={isDocked ? "Maximize" : "Dock Side-by-Side"}>
                            <PanelRight size={14} />
                        </button>

                        <button onClick={onClose} style={{
                            width: 30, height: 30, borderRadius: '50%', border: 'none',
                            background: 'rgba(239,68,68,0.1)', color: '#f87171',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            cursor: 'pointer', marginLeft: 4,
                        }}>
                            <X size={14} />
                        </button>
                    </div>
                </div>

                {/* Bottom row: search box always full width */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <div style={{
                        display: 'flex', alignItems: 'center', gap: 8, flex: 1, minWidth: 0,
                        background: 'rgba(255,255,255,0.05)', border: `1px solid ${codeSearch ? 'rgba(99,102,241,0.5)' : 'rgba(255,255,255,0.1)'}`,
                        borderRadius: 8, padding: '5px 10px', transition: 'border-color 0.15s',
                    }}>
                        <Search size={13} color={isSearching ? '#818cf8' : '#475569'} style={{ flexShrink: 0 }} />
                        <input
                            value={codeSearch}
                            onChange={e => handleCodeSearch(e.target.value)}
                            placeholder="Search codebase…"
                            style={{
                                background: 'none', border: 'none', outline: 'none',
                                color: '#e2e8f0', fontSize: '0.82rem', width: '100%', minWidth: 0,
                            }}
                        />
                        {codeSearch && (
                            <button onClick={() => handleCodeSearch('')} style={{
                                background: 'none', border: 'none', cursor: 'pointer',
                                color: '#475569', padding: 0, lineHeight: 1, flexShrink: 0,
                            }}>✕</button>
                        )}
                        {totalMatches > 0 && (
                            <span style={{ fontSize: '0.7rem', color: '#818cf8', flexShrink: 0, whiteSpace: 'nowrap' }}>
                                {matchIndex + 1}/{totalMatches}
                            </span>
                        )}
                        {searchResults !== null && !isSearching && totalMatches === 0 && (
                            <span style={{ fontSize: '0.7rem', color: '#475569', flexShrink: 0 }}>
                                {searchResults.length} file{searchResults.length !== 1 ? 's' : ''}
                            </span>
                        )}
                    </div>
                    {totalMatches > 0 && (
                        <>
                            <button onClick={() => navigateMatch(-1)} title="Previous match" style={{
                                width: 26, height: 26, borderRadius: 6, border: '1px solid rgba(255,255,255,0.1)',
                                background: 'rgba(255,255,255,0.05)', color: '#94a3b8',
                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                cursor: 'pointer', flexShrink: 0, fontSize: '0.75rem',
                            }}>▲</button>
                            <button onClick={() => navigateMatch(1)} title="Next match" style={{
                                width: 26, height: 26, borderRadius: 6, border: '1px solid rgba(255,255,255,0.1)',
                                background: 'rgba(255,255,255,0.05)', color: '#94a3b8',
                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                cursor: 'pointer', flexShrink: 0, fontSize: '0.75rem',
                            }}>▼</button>
                        </>
                    )}
                    {selectedFile && (
                        <button
                            onClick={saveFile}
                            disabled={!isDirty}
                            style={{
                                display: 'flex', alignItems: 'center', gap: 5,
                                padding: '5px 12px', borderRadius: 7, border: 'none', cursor: isDirty ? 'pointer' : 'default',
                                background: isDirty ? 'rgba(99,102,241,0.25)' : 'rgba(255,255,255,0.04)',
                                color: isDirty ? '#818cf8' : '#334155',
                                fontSize: '0.78rem', fontWeight: 600, whiteSpace: 'nowrap', transition: 'all 0.15s',
                            }}
                            title="Save (Ctrl+S)"
                        >
                            <Save size={12} /> {saving ? 'Saving…' : saveMsg || 'Save'}
                        </button>
                    )}
                </div>
            </div>

            {/* ── Editor Tab ─────────────────────────────────────────────── */}
            {activeTab === 'editor' && (
                <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
                    {/* File browser */}
                    <div style={{
                        width: 240, flexShrink: 0, overflowY: 'auto',
                        borderRight: '1px solid rgba(255,255,255,0.07)',
                        background: 'rgba(15,23,42,0.97)', padding: '12px 0',
                    }}>
                        <div style={{ padding: '0 12px 8px', display: 'flex', alignItems: 'center', gap: 6, color: '#475569', fontSize: '0.72rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                            {searchResults !== null ? <Search size={11} /> : <FolderOpen size={11} />}
                            {searchResults !== null ? 'Results' : 'Files'}
                        </div>

                        {/* ── Search results mode ── */}
                        {searchResults !== null ? (
                            isSearching ? (
                                <div style={{ padding: '20px 12px', color: '#475569', fontSize: '0.78rem', textAlign: 'center' }}>Searching…</div>
                            ) : searchResults.length === 0 ? (
                                <div style={{ padding: '20px 12px', color: '#475569', fontSize: '0.78rem', textAlign: 'center' }}>No matches found</div>
                            ) : searchResults.map(r => (
                                <div key={r.path}>
                                    <button
                                        onClick={() => { const f = files.find(x => x.path === r.path); if (f) loadFile(f); }}
                                        style={{
                                            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                                            width: '100%', padding: '6px 12px 2px 12px',
                                            background: selectedFile?.path === r.path ? 'rgba(99,102,241,0.15)' : 'transparent',
                                            border: 'none', cursor: 'pointer', textAlign: 'left',
                                            borderLeft: selectedFile?.path === r.path ? '2px solid #6366f1' : '2px solid transparent',
                                        }}
                                    >
                                        <span style={{ color: selectedFile?.path === r.path ? '#a5b4fc' : '#e2e8f0', fontSize: '0.78rem', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.name}</span>
                                        <span style={{ fontSize: '0.68rem', color: '#6366f1', background: 'rgba(99,102,241,0.15)', padding: '1px 6px', borderRadius: 99, flexShrink: 0, marginLeft: 4 }}>{r.matchCount}</span>
                                    </button>
                                    {r.matches.map((m, i) => (
                                        <div key={i} style={{ padding: '1px 12px 1px 20px', fontSize: '0.68rem', color: '#475569', fontFamily: 'monospace', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                            <span style={{ color: '#334155', marginRight: 6 }}>{m.line}</span>
                                            {highlightMatch(m.text, codeSearch.trim())}
                                        </div>
                                    ))}
                                </div>
                            ))
                        ) : (
                        /* ── Normal file tree mode ── */
                        Object.entries(sections).map(([section, sFiles]) => (
                            <div key={section}>
                                <div style={{ padding: '4px 12px', color: '#475569', fontSize: '0.7rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', marginTop: 8 }}>
                                    {section}
                                </div>
                                {sFiles.map(f => (
                                    <button
                                        key={f.path}
                                        onClick={() => loadFile(f)}
                                        style={{
                                            display: 'flex', alignItems: 'center', gap: 6,
                                            width: '100%', padding: '5px 12px 5px 20px',
                                            background: selectedFile?.path === f.path ? 'rgba(99,102,241,0.15)' : 'transparent',
                                            border: 'none', cursor: 'pointer', textAlign: 'left',
                                            color: selectedFile?.path === f.path ? '#a5b4fc' : '#94a3b8',
                                            fontSize: '0.78rem',
                                            borderLeft: selectedFile?.path === f.path ? '2px solid #6366f1' : '2px solid transparent',
                                        }}
                                    >
                                        <ChevronRight size={10} style={{ flexShrink: 0, opacity: 0.4 }} />
                                        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{f.name}</span>
                                    </button>
                                ))}
                            </div>
                        ))
                        )}
                    </div>

                    {/* Monaco editor */}
                    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
                        {/* Editor toolbar */}
                        <div style={{
                            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                            padding: '6px 14px', borderBottom: '1px solid rgba(255,255,255,0.06)',
                            background: 'rgba(15,23,42,0.95)', flexShrink: 0,
                        }}>
                            <span style={{ color: selectedFile ? '#94a3b8' : '#475569', fontSize: '0.8rem' }}>
                                {selectedFile ? selectedFile.path : 'Select a file from the sidebar'}
                            </span>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                                {isDirty && <span style={{ color: '#f59e0b', fontSize: '0.75rem' }}>● Unsaved</span>}
                                {saveMsg && <span style={{ color: saveMsg.startsWith('Error') ? '#ef4444' : '#10b981', fontSize: '0.75rem' }}>{saveMsg}</span>}
                                <button
                                    onClick={saveFile}
                                    disabled={!selectedFile || saving || !isDirty}
                                    style={{
                                        display: 'flex', alignItems: 'center', gap: 5,
                                        padding: '4px 12px', borderRadius: 6, border: 'none',
                                        background: isDirty ? 'rgba(99,102,241,0.2)' : 'rgba(255,255,255,0.04)',
                                        color: isDirty ? '#818cf8' : '#475569',
                                        cursor: isDirty ? 'pointer' : 'default',
                                        fontSize: '0.78rem', fontWeight: 600,
                                    }}
                                >
                                    <Save size={12} /> {saving ? 'Saving…' : 'Save (Ctrl+S)'}
                                </button>
                            </div>
                        </div>

                        {/* Filtered line view — only shown when search is active */}
                        {selectedFile && codeSearch.trim().length >= 2 && (() => {
                            const q = codeSearch.trim();
                            const matchingLines = editorContent.split('\n').reduce((acc, line, idx) => {
                                if (line.toLowerCase().includes(q.toLowerCase())) acc.push({ lineNum: idx + 1, text: line });
                                return acc;
                            }, []);
                            return (
                                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', background: '#1e1e1e' }}>
                                    <div style={{ padding: '5px 14px', background: 'rgba(99,102,241,0.1)', borderBottom: '1px solid rgba(99,102,241,0.2)', fontSize: '0.75rem', color: '#818cf8', display: 'flex', alignItems: 'center', gap: 12, flexShrink: 0 }}>
                                        <Search size={11} />
                                        <span><strong style={{ color: '#a5b4fc' }}>{matchingLines.length}</strong> matching line{matchingLines.length !== 1 ? 's' : ''} for "<strong style={{ color: '#a5b4fc' }}>{q}</strong>"</span>
                                        <span style={{ color: '#475569' }}>— click a line to edit it inline</span>
                                        <button onClick={() => handleCodeSearch('')} style={{ marginLeft: 'auto', background: 'none', border: '1px solid rgba(99,102,241,0.3)', borderRadius: 5, color: '#818cf8', cursor: 'pointer', fontSize: '0.72rem', padding: '2px 8px' }}>Clear search → Edit full file</button>
                                    </div>
                                    <div style={{ flex: 1, overflowY: 'auto', padding: '8px 0' }}>
                                        {matchingLines.length === 0 ? (
                                            <div style={{ padding: '40px', textAlign: 'center', color: '#475569', fontSize: '0.85rem' }}>No matches in this file</div>
                                        ) : matchingLines.map(({ lineNum, text }) => (
                                            <div
                                                key={lineNum}
                                                style={{ display: 'flex', alignItems: 'baseline', gap: 0, padding: '2px 0', background: editingLine === lineNum ? 'rgba(99,102,241,0.08)' : 'transparent' }}
                                                onMouseEnter={e => { if (editingLine !== lineNum) e.currentTarget.style.background = 'rgba(255,255,255,0.04)'; }}
                                                onMouseLeave={e => { if (editingLine !== lineNum) e.currentTarget.style.background = 'transparent'; }}
                                            >
                                                <span style={{ minWidth: 56, textAlign: 'right', paddingRight: 20, color: editingLine === lineNum ? '#818cf8' : '#4b5563', fontSize: 12, fontFamily: 'monospace', userSelect: 'none', flexShrink: 0, paddingTop: 2 }}>{lineNum}</span>
                                                {editingLine === lineNum ? (
                                                    <input
                                                        autoFocus
                                                        defaultValue={text}
                                                        onChange={e => {
                                                            const newText = e.target.value;
                                                            const editor = editorRef.current;
                                                            if (!editor) return;
                                                            const model = editor.getModel();
                                                            if (!model) return;
                                                            const lineCount = model.getLineCount();
                                                            const endCol = model.getLineMaxColumn(lineNum);
                                                            editor.executeEdits('inline-edit', [{
                                                                range: { startLineNumber: lineNum, startColumn: 1, endLineNumber: lineNum, endColumn: endCol },
                                                                text: newText,
                                                            }]);
                                                            setEditorContent(editor.getValue());
                                                        }}
                                                        onBlur={() => setEditingLine(null)}
                                                        onKeyDown={e => {
                                                            if (e.key === 'Escape') setEditingLine(null);
                                                            if (e.key === 'Enter') setEditingLine(null);
                                                        }}
                                                        style={{
                                                            flex: 1, background: 'rgba(99,102,241,0.06)',
                                                            border: '1px solid rgba(99,102,241,0.4)',
                                                            borderRadius: 4, outline: 'none',
                                                            color: '#e2e8f0', fontSize: 13,
                                                            fontFamily: "'JetBrains Mono','Fira Code',monospace",
                                                            padding: '1px 6px', whiteSpace: 'pre',
                                                        }}
                                                    />
                                                ) : (
                                                    <span
                                                        onClick={() => setEditingLine(lineNum)}
                                                        style={{ flex: 1, color: '#d4d4d4', fontSize: 13, fontFamily: "'JetBrains Mono','Fira Code',monospace", whiteSpace: 'pre', overflow: 'hidden', textOverflow: 'ellipsis', cursor: 'text' }}
                                                    >
                                                        {highlightMatch(text, q)}
                                                    </span>
                                                )}
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            );
                        })()}

                        {/* Monaco — always mounted to preserve state, hidden while filter is active */}
                        <div style={{ flex: 1, overflow: 'hidden', display: (selectedFile && codeSearch.trim().length >= 2) ? 'none' : 'flex', flexDirection: 'column' }}>
                            {selectedFile ? (
                                <Suspense fallback={
                                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: '#475569', fontSize: '0.85rem' }}>
                                        Loading Monaco Editor…
                                    </div>
                                }>
                                    <MonacoEditor
                                        height="100%"
                                        language={selectedFile.name.endsWith('.jsx') || selectedFile.name.endsWith('.tsx') ? 'javascript' : selectedFile.name.endsWith('.json') ? 'json' : selectedFile.name.endsWith('.css') ? 'css' : 'javascript'}
                                        value={editorContent}
                                        theme="vs-dark"
                                        onChange={v => setEditorContent(v ?? '')}
                                        onMount={(editor) => {
                                            editorRef.current = editor;
                                            const styleId = 'studio-search-glow';
                                            if (!document.getElementById(styleId)) {
                                                const style = document.createElement('style');
                                                style.id = styleId;
                                                style.textContent = `
                                                    .studio-match-all {
                                                        background: rgba(99,102,241,0.45) !important;
                                                        border-radius: 3px !important;
                                                        color: #e0e7ff !important;
                                                        font-weight: 700 !important;
                                                        filter: drop-shadow(0 0 5px rgba(99,102,241,1)) drop-shadow(0 0 10px rgba(99,102,241,0.8)) !important;
                                                        outline: 1.5px solid rgba(129,140,248,0.9) !important;
                                                        outline-offset: 1px;
                                                    }
                                                    .studio-match-current {
                                                        background: rgba(253,224,71,0.55) !important;
                                                        border-radius: 3px !important;
                                                        color: #1e1b4b !important;
                                                        font-weight: 900 !important;
                                                        filter: drop-shadow(0 0 6px rgba(253,224,71,1)) drop-shadow(0 0 14px rgba(253,224,71,0.9)) drop-shadow(0 0 22px rgba(253,224,71,0.5)) !important;
                                                        outline: 2px solid rgba(253,224,71,1) !important;
                                                        outline-offset: 1px;
                                                    }
                                                `;
                                                document.head.appendChild(style);
                                            }
                                        }}
                                        options={{
                                            fontSize: 13,
                                            fontFamily: "'JetBrains Mono', 'Fira Code', 'Cascadia Code', monospace",
                                            minimap: { enabled: true },
                                            scrollBeyondLastLine: false,
                                            wordWrap: 'on',
                                            formatOnPaste: true,
                                            tabSize: 4,
                                            lineNumbers: 'on',
                                            automaticLayout: true,
                                        }}
                                    />
                                </Suspense>
                            ) : (
                                <div style={{
                                    display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                                    height: '100%', color: '#334155', gap: 12,
                                }}>
                                    <Code size={40} style={{ opacity: 0.2 }} />
                                    <span style={{ fontSize: '0.9rem' }}>Select a file to begin editing</span>
                                    <span style={{ fontSize: '0.75rem', color: '#1e293b' }}>Only src/components/ and server/routes/ are accessible</span>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}

            {/* ── Deploy Tab ─────────────────────────────────────────────── */}
            {activeTab === 'deploy' && (
                <div style={{ flex: 1, overflowY: 'auto', padding: 28, display: 'flex', flexDirection: 'column', gap: 20 }}>

                    {/* How-to guide */}
                    <details style={{ background: 'rgba(99,102,241,0.06)', border: '1px solid rgba(99,102,241,0.2)', borderRadius: 10, padding: '14px 18px' }}>
                        <summary style={{ cursor: 'pointer', color: '#818cf8', fontWeight: 700, fontSize: '0.85rem', listStyle: 'none', display: 'flex', alignItems: 'center', gap: 8 }}>
                            <span style={{ fontSize: '1rem' }}>ℹ</span> How to Use Live Studio — Step-by-Step
                        </summary>
                        <div style={{ marginTop: 14, display: 'flex', flexDirection: 'column', gap: 10, fontSize: '0.8rem', color: '#94a3b8', lineHeight: 1.6 }}>
                            <div style={{ display: 'flex', gap: 10 }}><span style={{ color: '#6366f1', fontWeight: 700, minWidth: 20 }}>1.</span><span><strong style={{ color: '#e2e8f0' }}>Open a file.</strong> Click the indigo <code style={{ background: 'rgba(255,255,255,0.07)', padding: '1px 5px', borderRadius: 4 }}>&lt;/&gt; Go to Code</code> button on any page in the Operations Manual. The studio opens docked on the right and pre-loads that file in the Editor tab.</span></div>
                            <div style={{ display: 'flex', gap: 10 }}><span style={{ color: '#6366f1', fontWeight: 700, minWidth: 20 }}>2.</span><span><strong style={{ color: '#e2e8f0' }}>Edit the code.</strong> Make your changes in the Editor tab. Press <code style={{ background: 'rgba(255,255,255,0.07)', padding: '1px 5px', borderRadius: 4 }}>Ctrl+S</code> to save — Vite picks up the change and hot-reloads the left panel automatically within a second or two.</span></div>
                            <div style={{ display: 'flex', gap: 10, background: 'rgba(245,158,11,0.08)', padding: '8px 10px', borderRadius: 8, border: '1px solid rgba(245,158,11,0.2)' }}><span style={{ color: '#f59e0b', fontWeight: 700, minWidth: 20 }}>⚠</span><span><strong style={{ color: '#fbbf24' }}>Translation gotcha.</strong> Text wrapped in <code style={{ background: 'rgba(255,255,255,0.07)', padding: '1px 5px', borderRadius: 4 }}>t('key', 'fallback')</code> is served from <code style={{ background: 'rgba(255,255,255,0.07)', padding: '1px 5px', borderRadius: 4 }}>src/i18n/en.json</code>, not the JSX fallback string. If you change display text in a <code>t()</code> call, you must also update the matching key in en.json — otherwise the old translated value will still show.</span></div>
                            <div style={{ display: 'flex', gap: 10 }}><span style={{ color: '#6366f1', fontWeight: 700, minWidth: 20 }}>3.</span><span><strong style={{ color: '#e2e8f0' }}>Create your sandbox branch.</strong> Go to the Deploy tab. The branch name is auto-filled from your username and the file you have open (e.g. <code style={{ background: 'rgba(255,255,255,0.07)', padding: '1px 5px', borderRadius: 4 }}>studio/doug/edit-aboutview</code>). Click <strong>Create / Switch</strong> to move onto that branch before making changes.</span></div>
                            <div style={{ display: 'flex', gap: 10 }}><span style={{ color: '#6366f1', fontWeight: 700, minWidth: 20 }}>4.</span><span><strong style={{ color: '#e2e8f0' }}>Commit to branch.</strong> Once your edits look good, go to <strong>Commit to Branch</strong>, type a short description of what you changed (e.g. "Updated intro text on manual page"), and click <strong>Commit</strong>. This saves a snapshot of your work to the branch. You can commit multiple times as you go.</span></div>
                            <div style={{ display: 'flex', gap: 10 }}><span style={{ color: '#6366f1', fontWeight: 700, minWidth: 20 }}>5.</span><span><strong style={{ color: '#e2e8f0' }}>Deploy.</strong> When you're ready to go live, add optional notes, type <code style={{ background: 'rgba(255,255,255,0.07)', padding: '1px 5px', borderRadius: 4 }}>DEPLOY NOW</code> to confirm, and click Deploy. The pipeline runs <code>npm run build</code>, tags the release, and reloads PM2. Poll the log until you see SUCCESS.</span></div>
                            <div style={{ display: 'flex', gap: 10 }}><span style={{ color: '#6366f1', fontWeight: 700, minWidth: 20 }}>6.</span><span><strong style={{ color: '#e2e8f0' }}>Emergency revert.</strong> If something goes wrong, click <strong>Revert to Stable Tag</strong> — this rolls back to the last known-good <code style={{ background: 'rgba(255,255,255,0.07)', padding: '1px 5px', borderRadius: 4 }}>stable-YYYY-MM-DD</code> git tag, rebuilds, and reloads PM2 automatically.</span></div>
                            <div style={{ display: 'flex', gap: 10, background: 'rgba(239,68,68,0.08)', padding: '8px 10px', borderRadius: 8, border: '1px solid rgba(239,68,68,0.2)' }}><span style={{ color: '#ef4444', fontWeight: 700, minWidth: 20 }}>🛑</span><span><strong style={{ color: '#fca5a5' }}>If the server crashes and this studio goes offline.</strong> A syntax error in a <code style={{ background: 'rgba(255,255,255,0.07)', padding: '1px 5px', borderRadius: 4 }}>server/routes/</code> file can crash the Express process — taking this studio with it. The deploy pipeline runs a pre-flight syntax check to prevent this, but if it ever happens, recover from the server terminal:<br /><code style={{ display: 'block', marginTop: 6, background: 'rgba(0,0,0,0.3)', padding: '6px 10px', borderRadius: 4, fontFamily: 'monospace', fontSize: '0.78rem', color: '#86efac' }}>git checkout $(git tag --list "stable-*" --sort=-v:refname | head -1) && npm run build && pm2 reload all</code></span></div>
                        </div>
                    </details>

                    {/* Git status card */}
                    <div style={{ background: 'rgba(15,23,42,0.8)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 10, padding: 18 }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                            <span style={{ color: '#94a3b8', fontWeight: 700, fontSize: '0.85rem', display: 'flex', alignItems: 'center', gap: 8 }}>
                                <GitBranch size={14} /> Git Status
                            </span>
                            <button onClick={refreshGitStatus} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#475569' }}>
                                <RefreshCw size={13} />
                            </button>
                        </div>
                        {gitStatus ? (
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                                <div style={{ fontSize: '0.8rem' }}>
                                    <div style={{ color: '#475569', marginBottom: 3 }}>Current Branch</div>
                                    <div style={{ color: '#a5b4fc', fontWeight: 600 }}>{gitStatus.branch}</div>
                                </div>
                                <div style={{ fontSize: '0.8rem' }}>
                                    <div style={{ color: '#475569', marginBottom: 3 }}>Working Tree</div>
                                    <div style={{ color: gitStatus.isDirty ? '#f59e0b' : '#10b981', fontWeight: 600 }}>
                                        {gitStatus.isDirty ? `${gitStatus.changedFiles} changed file(s)` : 'Clean'}
                                    </div>
                                </div>
                                <div style={{ fontSize: '0.8rem', gridColumn: '1 / -1' }}>
                                    <div style={{ color: '#475569', marginBottom: 3 }}>Last Stable Tag</div>
                                    <div style={{ color: '#10b981', fontWeight: 600 }}>{gitStatus.lastStableTag || 'None yet'}</div>
                                </div>
                            </div>
                        ) : (
                            <div style={{ color: '#475569', fontSize: '0.8rem' }}>Loading…</div>
                        )}
                    </div>

                    {/* Branch management */}
                    <div style={{ background: 'rgba(15,23,42,0.8)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 10, padding: 18 }}>
                        <div style={{ color: '#94a3b8', fontWeight: 700, fontSize: '0.85rem', marginBottom: 12 }}>Create Sandbox Branch</div>
                        <div style={{ fontSize: '0.75rem', color: '#475569', marginBottom: 10 }}>Pattern: studio/&lt;user&gt;/&lt;descriptor&gt; — e.g. studio/doug/fix-calendar-bug</div>
                        <div style={{ display: 'flex', gap: 8 }}>
                            <input
                                value={branchInput}
                                onChange={e => setBranchInput(e.target.value)}
                                placeholder="studio/your-name/feature-name"
                                style={{
                                    flex: 1, padding: '7px 12px', borderRadius: 7,
                                    background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)',
                                    color: '#e2e8f0', fontSize: '0.82rem', outline: 'none',
                                }}
                            />
                            <button
                                onClick={createBranch}
                                disabled={!branchInput.trim()}
                                style={{
                                    padding: '7px 16px', borderRadius: 7, border: 'none',
                                    background: branchInput.trim() ? 'rgba(99,102,241,0.2)' : 'rgba(255,255,255,0.04)',
                                    color: branchInput.trim() ? '#818cf8' : '#475569',
                                    cursor: branchInput.trim() ? 'pointer' : 'default',
                                    fontSize: '0.82rem', fontWeight: 600,
                                }}
                            >
                                Create / Switch
                            </button>
                        </div>
                    </div>

                    {/* Commit to branch */}
                    <div style={{ background: 'rgba(15,23,42,0.8)', border: '1px solid rgba(99,102,241,0.2)', borderRadius: 10, padding: 18 }}>
                        <div style={{ color: '#818cf8', fontWeight: 700, fontSize: '0.85rem', marginBottom: 4, display: 'flex', alignItems: 'center', gap: 8 }}>
                            <GitBranch size={14} /> Commit to Branch
                        </div>
                        <div style={{ color: '#64748b', fontSize: '0.75rem', marginBottom: 14, lineHeight: 1.5 }}>
                            Save all current changes to the current branch with a commit message. Do this before deploying.
                        </div>
                        <div style={{ display: 'flex', gap: 8 }}>
                            <input
                                value={commitMsg}
                                onChange={e => setCommitMsg(e.target.value)}
                                placeholder="Describe what you changed…"
                                style={{
                                    flex: 1, padding: '7px 12px', borderRadius: 7,
                                    background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)',
                                    color: '#e2e8f0', fontSize: '0.82rem', outline: 'none',
                                }}
                            />
                            <button
                                disabled={!commitMsg.trim() || commitState === 'working'}
                                onClick={async () => {
                                    setCommitState('working');
                                    setCommitResult(null);
                                    try {
                                        const r = await fetch('/api/studio/git/commit', {
                                            method: 'POST',
                                            headers: { 'Content-Type': 'application/json' },
                                            body: JSON.stringify({ message: commitMsg }),
                                        });
                                        const data = await r.json();
                                        if (!r.ok) throw new Error(data.error);
                                        setCommitResult({ ok: true, text: `Committed ${data.hash}` });
                                        setCommitMsg('');
                                        refreshGitStatus();
                                    } catch (err) {
                                        setCommitResult({ ok: false, text: err.message });
                                    } finally {
                                        setCommitState('idle');
                                    }
                                }}
                                style={{
                                    padding: '7px 16px', borderRadius: 7, border: 'none', whiteSpace: 'nowrap',
                                    background: commitMsg.trim() ? 'rgba(99,102,241,0.2)' : 'rgba(255,255,255,0.04)',
                                    color: commitMsg.trim() ? '#818cf8' : '#475569',
                                    cursor: commitMsg.trim() ? 'pointer' : 'default',
                                    fontSize: '0.82rem', fontWeight: 600,
                                }}
                            >
                                {commitState === 'working' ? 'Committing…' : 'Commit'}
                            </button>
                        </div>
                        {commitResult && (
                            <div style={{ marginTop: 10, fontSize: '0.78rem', color: commitResult.ok ? '#34d399' : '#f87171', display: 'flex', alignItems: 'center', gap: 6 }}>
                                {commitResult.ok ? '✓' : '✕'} {commitResult.text}
                            </div>
                        )}
                    </div>

                    {/* Deploy pipeline */}
                    <div style={{ background: 'rgba(15,23,42,0.8)', border: '1px solid rgba(239,68,68,0.2)', borderRadius: 10, padding: 18 }}>
                        <div style={{ color: '#f87171', fontWeight: 700, fontSize: '0.85rem', marginBottom: 4, display: 'flex', alignItems: 'center', gap: 8 }}>
                            <Rocket size={14} /> Deploy Pipeline
                        </div>
                        <div style={{ color: '#64748b', fontSize: '0.75rem', marginBottom: 16, lineHeight: 1.5 }}>
                            Stage src/components/ + server/routes/ → commit → npm run build → tag stable-YYYY-MM-DD → PM2 reload
                        </div>

                        {deployState === 'idle' && (
                            <>
                                <textarea
                                    value={deployNotes}
                                    onChange={e => setDeployNotes(e.target.value)}
                                    placeholder="Deploy notes (optional)…"
                                    rows={2}
                                    style={{
                                        width: '100%', padding: '8px 12px', borderRadius: 7, resize: 'vertical',
                                        background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)',
                                        color: '#e2e8f0', fontSize: '0.82rem', outline: 'none',
                                        marginBottom: 12, boxSizing: 'border-box',
                                    }}
                                />
                                <div style={{ fontSize: '0.78rem', color: '#64748b', marginBottom: 8 }}>
                                    Type <strong style={{ color: '#f87171' }}>DEPLOY NOW</strong> to confirm:
                                </div>
                                <div style={{ display: 'flex', gap: 8 }}>
                                    <input
                                        value={deployConfirm}
                                        onChange={e => setDeployConfirm(e.target.value)}
                                        placeholder="DEPLOY NOW"
                                        style={{
                                            flex: 1, padding: '8px 12px', borderRadius: 7,
                                            background: 'rgba(255,255,255,0.04)',
                                            border: deployConfirm === 'DEPLOY NOW' ? '1px solid rgba(239,68,68,0.5)' : '1px solid rgba(255,255,255,0.08)',
                                            color: '#e2e8f0', fontSize: '0.85rem', outline: 'none',
                                        }}
                                    />
                                    <button
                                        onClick={triggerDeploy}
                                        disabled={deployConfirm !== 'DEPLOY NOW'}
                                        style={{
                                            padding: '8px 20px', borderRadius: 7, border: 'none',
                                            background: deployConfirm === 'DEPLOY NOW' ? 'rgba(239,68,68,0.2)' : 'rgba(255,255,255,0.04)',
                                            color: deployConfirm === 'DEPLOY NOW' ? '#f87171' : '#475569',
                                            cursor: deployConfirm === 'DEPLOY NOW' ? 'pointer' : 'default',
                                            fontSize: '0.85rem', fontWeight: 700,
                                        }}
                                    >
                                        <Rocket size={13} style={{ marginRight: 6 }} />
                                        Deploy
                                    </button>
                                </div>
                            </>
                        )}

                        {(deployState === 'building' || deployState === 'success' || deployState === 'failed') && (
                            <div>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
                                    {deployState === 'building' && <StatusBadge status="BUILDING" />}
                                    {deployState === 'success' && <StatusBadge status="SUCCESS" />}
                                    {deployState === 'failed' && <StatusBadge status="FAILED" />}
                                    {(deployState === 'success' || deployState === 'failed') && (
                                        <button
                                            onClick={() => { setDeployState('idle'); setDeployLog(''); setDeployConfirm(''); setDeployNotes(''); }}
                                            style={{ padding: '3px 10px', borderRadius: 6, border: 'none', background: 'rgba(255,255,255,0.06)', color: '#94a3b8', cursor: 'pointer', fontSize: '0.75rem' }}
                                        >
                                            New Deploy
                                        </button>
                                    )}
                                </div>
                                <pre style={{
                                    background: 'rgba(0,0,0,0.4)', borderRadius: 7, padding: 14,
                                    color: deployState === 'failed' ? '#fca5a5' : '#94a3b8',
                                    fontSize: '0.72rem', lineHeight: 1.6, overflowX: 'auto',
                                    maxHeight: 280, overflowY: 'auto', margin: 0, whiteSpace: 'pre-wrap',
                                    border: '1px solid rgba(255,255,255,0.05)',
                                }}>
                                    {deployLog || 'Waiting for pipeline output…'}
                                </pre>
                            </div>
                        )}
                    </div>

                    {/* Revert */}
                    <div style={{ background: 'rgba(15,23,42,0.8)', border: '1px solid rgba(99,102,241,0.15)', borderRadius: 10, padding: 18 }}>
                        <div style={{ color: '#94a3b8', fontWeight: 700, fontSize: '0.85rem', marginBottom: 8 }}>Emergency Revert</div>
                        <div style={{ color: '#475569', fontSize: '0.78rem', marginBottom: 12, lineHeight: 1.5 }}>
                            Reverts working tree to <strong style={{ color: '#818cf8' }}>{gitStatus?.lastStableTag || 'the last stable-* tag'}</strong>.
                            This is the Boot Safe Mode recovery path.
                        </div>
                        {!revertConfirm ? (
                            <button
                                onClick={() => setRevertConfirm(true)}
                                disabled={!gitStatus?.lastStableTag}
                                style={{
                                    padding: '7px 16px', borderRadius: 7, border: 'none',
                                    background: 'rgba(99,102,241,0.12)', color: '#818cf8',
                                    cursor: gitStatus?.lastStableTag ? 'pointer' : 'default',
                                    fontSize: '0.8rem', fontWeight: 600, opacity: gitStatus?.lastStableTag ? 1 : 0.4,
                                }}
                            >
                                Revert to Stable Tag
                            </button>
                        ) : (
                            <div style={{ display: 'flex', gap: 8 }}>
                                <button
                                    onClick={triggerRevert}
                                    style={{
                                        padding: '7px 16px', borderRadius: 7, border: 'none',
                                        background: 'rgba(239,68,68,0.2)', color: '#f87171',
                                        cursor: 'pointer', fontSize: '0.8rem', fontWeight: 700,
                                    }}
                                >
                                    Confirm Revert
                                </button>
                                <button
                                    onClick={() => setRevertConfirm(false)}
                                    style={{
                                        padding: '7px 16px', borderRadius: 7, border: 'none',
                                        background: 'rgba(255,255,255,0.05)', color: '#64748b',
                                        cursor: 'pointer', fontSize: '0.8rem',
                                    }}
                                >
                                    Cancel
                                </button>
                            </div>
                        )}
                    </div>
                </div>
            )}

            {/* ── §9 Friction Tab ────────────────────────────────────────── */}
            {activeTab === 'friction' && (
                <div style={{ flex: 1, overflowY: 'auto', padding: 28, display: 'flex', flexDirection: 'column', gap: 20 }}>
                    <details style={{ background: 'rgba(245,158,11,0.06)', border: '1px solid rgba(245,158,11,0.2)', borderRadius: 10, padding: '14px 18px' }}>
                        <summary style={{ cursor: 'pointer', color: '#f59e0b', fontWeight: 700, fontSize: '0.85rem', listStyle: 'none', display: 'flex', alignItems: 'center', gap: 8 }}>
                            <span style={{ fontSize: '1rem' }}>ℹ</span> How to Use — Frictional Cost Engine
                        </summary>
                        <div style={{ marginTop: 14, display: 'flex', flexDirection: 'column', gap: 10, fontSize: '0.8rem', color: '#94a3b8', lineHeight: 1.6 }}>
                            <div style={{ color: '#64748b', fontSize: '0.78rem', marginBottom: 4 }}>The Friction Engine calculates the real dollar cost of adding or removing UI elements from operator workflows. Run it before deploying any screen change.</div>
                            <div style={{ display: 'flex', gap: 10 }}><span style={{ color: '#f59e0b', fontWeight: 700, minWidth: 20 }}>1.</span><span><strong style={{ color: '#e2e8f0' }}>Select a plant and shift.</strong> The engine uses that plant's labor rate and shift headcount to project annual cost impact across all operators.</span></div>
                            <div style={{ display: 'flex', gap: 10 }}><span style={{ color: '#f59e0b', fontWeight: 700, minWidth: 20 }}>2.</span><span><strong style={{ color: '#e2e8f0' }}>Enter element counts.</strong> Input how many fields, dropdowns, barcode scans, and taps exist Before and After your change. The delta drives the calculation.</span></div>
                            <div style={{ display: 'flex', gap: 10 }}><span style={{ color: '#f59e0b', fontWeight: 700, minWidth: 20 }}>3.</span><span><strong style={{ color: '#e2e8f0' }}>Run the simulation.</strong> Click Run Friction Analysis. The engine returns an annual cost verdict — e.g. <code style={{ background: 'rgba(255,255,255,0.07)', padding: '1px 5px', borderRadius: 4 }}>"This change costs 63 hours/yr (-$1,575)"</code> — and a per-element breakdown.</span></div>
                            <div style={{ display: 'flex', gap: 10 }}><span style={{ color: '#f59e0b', fontWeight: 700, minWidth: 20 }}>4.</span><span><strong style={{ color: '#e2e8f0' }}>Use it as a gate.</strong> A negative verdict (cost increase) doesn't block the deploy, but it gives you hard data to justify or reconsider the change before it ships.</span></div>
                        </div>
                    </details>
                    <div style={{ color: '#94a3b8', fontWeight: 700, fontSize: '0.95rem', display: 'flex', alignItems: 'center', gap: 8 }}>
                        <DollarSign size={16} color="#f59e0b" /> Frictional Cost Engine
                        <span style={{ marginLeft: 'auto', color: '#475569', fontSize: '0.75rem', fontWeight: 400 }}>
                            Physics baseline: 1 scan=1.5s · 1 tap=0.5s · 1 field=3.0s · 1 dropdown=1.0s
                        </span>
                    </div>

                    {/* File context */}
                    <div style={{ background: 'rgba(15,23,42,0.8)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 10, padding: 16 }}>
                        <div style={{ fontSize: '0.8rem', color: '#475569', marginBottom: 8 }}>Analyzing against git HEAD baseline:</div>
                        <div style={{ color: selectedFile ? '#a5b4fc' : '#334155', fontSize: '0.85rem', fontWeight: 600 }}>
                            {selectedFile ? selectedFile.path : 'No file selected — open a file in the Editor tab first'}
                        </div>
                        <button
                            onClick={runFrictionAnalysis}
                            disabled={!selectedFile || frictionLoading}
                            style={{
                                marginTop: 12, padding: '8px 20px', borderRadius: 7, border: 'none',
                                background: selectedFile ? 'rgba(245,158,11,0.18)' : 'rgba(255,255,255,0.04)',
                                color: selectedFile ? '#f59e0b' : '#475569',
                                cursor: selectedFile ? 'pointer' : 'default',
                                fontSize: '0.82rem', fontWeight: 700, display: 'flex', alignItems: 'center', gap: 6,
                            }}
                        >
                            <DollarSign size={13} /> {frictionLoading ? 'Analyzing…' : 'Run Friction Analysis'}
                        </button>
                    </div>

                    {/* Results */}
                    {frictionResult && !frictionResult.error && (
                        <>
                            {/* Verdict banner */}
                            <div style={{
                                borderRadius: 10, padding: '14px 20px',
                                background: frictionResult.annual.verdict === 'savings' ? 'rgba(16,185,129,0.1)' :
                                            frictionResult.annual.verdict === 'cost'    ? 'rgba(239,68,68,0.1)' :
                                                                                           'rgba(99,102,241,0.1)',
                                border: `1px solid ${frictionResult.annual.verdict === 'savings' ? 'rgba(16,185,129,0.3)' :
                                                      frictionResult.annual.verdict === 'cost'   ? 'rgba(239,68,68,0.3)' :
                                                                                                    'rgba(99,102,241,0.3)'}`,
                                display: 'flex', alignItems: 'center', gap: 14,
                            }}>
                                {frictionResult.annual.verdict === 'savings' && <TrendingDown size={22} color="#10b981" />}
                                {frictionResult.annual.verdict === 'cost'    && <TrendingUp   size={22} color="#ef4444" />}
                                {frictionResult.annual.verdict === 'neutral' && <Minus        size={22} color="#818cf8" />}
                                <div>
                                    {frictionResult.annual.verdict === 'neutral' && (
                                        <div style={{ color: '#818cf8', fontWeight: 700, fontSize: '0.9rem' }}>No interactive element changes detected.</div>
                                    )}
                                    {frictionResult.annual.verdict === 'savings' && (
                                        <>
                                            <div style={{ color: '#10b981', fontWeight: 700, fontSize: '0.95rem' }}>
                                                This change SAVES {frictionResult.annual.hours} hours/yr (+${frictionResult.annual.dollars.toLocaleString()}/yr in operator productivity)
                                            </div>
                                            <div style={{ color: '#64748b', fontSize: '0.75rem', marginTop: 3 }}>
                                                {frictionResult.totals.deltaSeconds}s saved per workflow · {frictionResult.assumptions.dailyUsage} runs/day · {frictionResult.assumptions.PLANT_COUNT} plants
                                            </div>
                                        </>
                                    )}
                                    {frictionResult.annual.verdict === 'cost' && (
                                        <>
                                            <div style={{ color: '#ef4444', fontWeight: 700, fontSize: '0.95rem' }}>
                                                ⚠️ This change adds {frictionResult.annual.hours} hrs of lost wrench-time/yr (−${frictionResult.annual.dollars.toLocaleString()}/yr)
                                            </div>
                                            <div style={{ color: '#64748b', fontSize: '0.75rem', marginTop: 3 }}>
                                                +{frictionResult.totals.deltaSeconds}s per workflow · {frictionResult.assumptions.dailyUsage} runs/day · {frictionResult.assumptions.PLANT_COUNT} plants · ${frictionResult.assumptions.HOURLY_WAGE}/hr
                                            </div>
                                        </>
                                    )}
                                </div>
                            </div>

                            {/* Breakdown table */}
                            {frictionResult.breakdown.length > 0 && (
                                <div style={{ background: 'rgba(15,23,42,0.8)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 10, overflow: 'hidden' }}>
                                    <div style={{ padding: '10px 16px', borderBottom: '1px solid rgba(255,255,255,0.06)', fontSize: '0.78rem', color: '#475569', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                                        Element Delta Breakdown
                                    </div>
                                    {frictionResult.breakdown.map((row, i) => (
                                        <div key={i} style={{
                                            display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 1fr',
                                            padding: '10px 16px', borderBottom: '1px solid rgba(255,255,255,0.04)',
                                            fontSize: '0.8rem', alignItems: 'center',
                                        }}>
                                            <span style={{ color: '#94a3b8' }}>{row.icon} {row.label}</span>
                                            <span style={{ color: row.delta > 0 ? '#ef4444' : '#10b981', fontWeight: 700 }}>
                                                {row.delta > 0 ? '+' : ''}{row.delta} {row.unit}{Math.abs(row.delta) !== 1 ? 's' : ''}
                                            </span>
                                            <span style={{ color: '#64748b' }}>{row.msEach / 1000}s each</span>
                                            <span style={{ color: row.costMs > 0 ? '#ef4444' : '#10b981', fontWeight: 600 }}>
                                                {row.costMs > 0 ? '+' : ''}{(row.costMs / 1000).toFixed(1)}s total
                                            </span>
                                        </div>
                                    ))}
                                </div>
                            )}

                            {/* Assumptions */}
                            <div style={{ background: 'rgba(15,23,42,0.6)', borderRadius: 8, padding: '10px 16px', fontSize: '0.73rem', color: '#334155', display: 'flex', gap: 20, flexWrap: 'wrap' }}>
                                <span>Daily usage: <strong style={{ color: '#475569' }}>{frictionResult.assumptions.dailyUsage}×</strong></span>
                                <span>Plants: <strong style={{ color: '#475569' }}>{frictionResult.assumptions.PLANT_COUNT}</strong></span>
                                <span>Working days/yr: <strong style={{ color: '#475569' }}>{frictionResult.assumptions.WORKING_DAYS}</strong></span>
                                <span>Operator wage: <strong style={{ color: '#475569' }}>${frictionResult.assumptions.HOURLY_WAGE}/hr</strong></span>
                            </div>
                        </>
                    )}
                    {frictionResult?.error && (
                        <div style={{ color: '#ef4444', fontSize: '0.82rem', padding: 14, background: 'rgba(239,68,68,0.08)', borderRadius: 8 }}>
                            Analysis error: {frictionResult.error}
                        </div>
                    )}
                </div>
            )}

            {/* ── §10 Parallel Universe Tab ───────────────────────────────── */}
            {activeTab === 'universe' && (
                <div style={{ flex: 1, overflowY: 'auto', padding: 28, display: 'flex', flexDirection: 'column', gap: 20 }}>
                    <details style={{ background: 'rgba(99,102,241,0.06)', border: '1px solid rgba(99,102,241,0.2)', borderRadius: 10, padding: '14px 18px' }}>
                        <summary style={{ cursor: 'pointer', color: '#818cf8', fontWeight: 700, fontSize: '0.85rem', listStyle: 'none', display: 'flex', alignItems: 'center', gap: 8 }}>
                            <span style={{ fontSize: '1rem' }}>ℹ</span> How to Use — Parallel Universe Simulation Engine
                        </summary>
                        <div style={{ marginTop: 14, display: 'flex', flexDirection: 'column', gap: 10, fontSize: '0.8rem', color: '#94a3b8', lineHeight: 1.6 }}>
                            <div style={{ color: '#64748b', fontSize: '0.78rem', marginBottom: 4 }}>The Parallel Universe engine clones a plant database to a historical point in time, strips events after that date, and runs a split-screen KPI comparison against the live system. Use it to validate logic changes against real historical data before deploying.</div>
                            <div style={{ display: 'flex', gap: 10 }}><span style={{ color: '#818cf8', fontWeight: 700, minWidth: 20 }}>1.</span><span><strong style={{ color: '#e2e8f0' }}>Select a plant and cutoff date.</strong> The engine copies that plant's database and removes all Work Orders, PM schedules, and audit events created after the cutoff date.</span></div>
                            <div style={{ display: 'flex', gap: 10 }}><span style={{ color: '#818cf8', fontWeight: 700, minWidth: 20 }}>2.</span><span><strong style={{ color: '#e2e8f0' }}>Run the simulation.</strong> Click Create Simulation. The engine spins up the snapshot database and calculates KPIs for both the live system and the simulated state.</span></div>
                            <div style={{ display: 'flex', gap: 10 }}><span style={{ color: '#818cf8', fontWeight: 700, minWidth: 20 }}>3.</span><span><strong style={{ color: '#e2e8f0' }}>Read the split-screen.</strong> KPIs are shown side by side — Live vs. Simulation. Delta badges highlight every metric that differs, colored green (improved) or red (regressed).</span></div>
                            <div style={{ display: 'flex', gap: 10 }}><span style={{ color: '#818cf8', fontWeight: 700, minWidth: 20 }}>4.</span><span><strong style={{ color: '#e2e8f0' }}>Use it as a proof of impact.</strong> If your logic change produces better KPIs against historical data, you have objective evidence before deploying to production.</span></div>
                        </div>
                    </details>
                    <div style={{ color: '#94a3b8', fontWeight: 700, fontSize: '0.95rem', display: 'flex', alignItems: 'center', gap: 8 }}>
                        <FlaskConical size={16} color="#6366f1" /> Parallel Universe — Future Simulation Engine
                    </div>
                    <div style={{ color: '#475569', fontSize: '0.8rem', lineHeight: 1.6 }}>
                        Clone a plant DB, strip it back to a target date, and compare KPIs between the live system and the simulation snapshot.
                        Events from the audit ledger are used to project what the metrics would have looked like at that point in time.
                    </div>

                    {/* Config card */}
                    {simState === 'idle' || simState === 'error' ? (
                        <div style={{ background: 'rgba(15,23,42,0.8)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 10, padding: 18 }}>
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 14 }}>
                                <div>
                                    <div style={{ fontSize: '0.75rem', color: '#475569', marginBottom: 6 }}>Plant</div>
                                    <select
                                        value={simPlant}
                                        onChange={e => setSimPlant(e.target.value)}
                                        style={{ width: '100%', padding: '7px 10px', borderRadius: 7, background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)', color: '#e2e8f0', fontSize: '0.82rem', outline: 'none' }}
                                    >
                                        <option value="">Select a plant…</option>
                                        {plants.map(p => <option key={p.id} value={p.id}>{p.label}</option>)}
                                    </select>
                                </div>
                                <div>
                                    <div style={{ fontSize: '0.75rem', color: '#475569', marginBottom: 6 }}>Cutoff Date (T:00:00:00)</div>
                                    <input
                                        type="date"
                                        value={simDate}
                                        onChange={e => setSimDate(e.target.value)}
                                        style={{ width: '100%', padding: '7px 10px', borderRadius: 7, background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)', color: '#e2e8f0', fontSize: '0.82rem', outline: 'none', boxSizing: 'border-box' }}
                                    />
                                </div>
                            </div>
                            {simState === 'error' && simResult?.error && (
                                <div style={{ color: '#ef4444', fontSize: '0.78rem', marginBottom: 10 }}>Error: {simResult.error}</div>
                            )}
                            <button
                                onClick={createSimulation}
                                disabled={!simPlant || !simDate}
                                style={{
                                    padding: '8px 20px', borderRadius: 7, border: 'none',
                                    background: simPlant ? 'rgba(99,102,241,0.18)' : 'rgba(255,255,255,0.04)',
                                    color: simPlant ? '#818cf8' : '#475569',
                                    cursor: simPlant ? 'pointer' : 'default',
                                    fontSize: '0.82rem', fontWeight: 700, display: 'flex', alignItems: 'center', gap: 6,
                                }}
                            >
                                <FlaskConical size={13} /> Clone & Run Simulation
                            </button>
                        </div>
                    ) : simState === 'creating' ? (
                        <div style={{ padding: 30, textAlign: 'center', color: '#475569', fontSize: '0.85rem' }}>
                            <FlaskConical size={28} style={{ marginBottom: 10, opacity: 0.4 }} />
                            <div>Cloning plant DB and stripping records after {simDate}…</div>
                        </div>
                    ) : simResult && simState === 'ready' ? (
                        <>
                            {/* Split-screen comparison */}
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
                                {[simResult.sim, simResult.live].map((side, si) => (
                                    <div key={si} style={{
                                        background: 'rgba(15,23,42,0.8)', borderRadius: 10, padding: 16,
                                        border: `1px solid ${si === 0 ? 'rgba(99,102,241,0.2)' : 'rgba(16,185,129,0.2)'}`,
                                    }}>
                                        <div style={{ fontWeight: 700, fontSize: '0.82rem', color: si === 0 ? '#818cf8' : '#10b981', marginBottom: 14 }}>
                                            {si === 0 ? '🔬 ' : '🟢 '}{side.label}
                                        </div>
                                        {[
                                            ['Open Work Orders',   'openWOs'],
                                            ['Completed WOs',      'completedWOs'],
                                            ['Overdue WOs',        'overdueWOs'],
                                            ['Active PM Schedules','pmSchedules'],
                                            ['PM Compliance %',    'pmCompliance'],
                                            ['Total Assets',       'totalAssets'],
                                        ].map(([label, key]) => (
                                            <div key={key} style={{ display: 'flex', justifyContent: 'space-between', padding: '5px 0', borderBottom: '1px solid rgba(255,255,255,0.04)', fontSize: '0.78rem' }}>
                                                <span style={{ color: '#64748b' }}>{label}</span>
                                                <span style={{ color: '#94a3b8', fontWeight: 600 }}>
                                                    {side[key] !== null && side[key] !== undefined ? (key === 'pmCompliance' ? `${side[key]}%` : side[key].toLocaleString()) : '—'}
                                                </span>
                                            </div>
                                        ))}
                                    </div>
                                ))}
                            </div>

                            {/* Delta summary */}
                            <div style={{ background: 'rgba(15,23,42,0.8)', borderRadius: 10, padding: 16, border: '1px solid rgba(255,255,255,0.07)' }}>
                                <div style={{ fontWeight: 700, fontSize: '0.82rem', color: '#94a3b8', marginBottom: 12 }}>Delta: Live vs Simulation</div>
                                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
                                    {Object.entries(simResult.deltas || {}).map(([key, delta]) => (
                                        <div key={key} style={{
                                            padding: '6px 14px', borderRadius: 8, fontSize: '0.78rem',
                                            background: delta === 0 ? 'rgba(255,255,255,0.04)' : delta > 0 ? 'rgba(16,185,129,0.1)' : 'rgba(239,68,68,0.1)',
                                            color: delta === 0 ? '#475569' : delta > 0 ? '#10b981' : '#ef4444',
                                            border: `1px solid ${delta === 0 ? 'rgba(255,255,255,0.06)' : delta > 0 ? 'rgba(16,185,129,0.25)' : 'rgba(239,68,68,0.25)'}`,
                                            fontWeight: 600,
                                        }}>
                                            {key}: {delta > 0 ? '+' : ''}{delta}
                                        </div>
                                    ))}
                                </div>
                            </div>

                            <button onClick={destroySimulation} style={{ alignSelf: 'flex-start', padding: '7px 16px', borderRadius: 7, border: 'none', background: 'rgba(255,255,255,0.05)', color: '#64748b', cursor: 'pointer', fontSize: '0.78rem' }}>
                                Destroy Simulation &amp; Reset
                            </button>
                        </>
                    ) : null}
                </div>
            )}

            {/* ── §14 Impact Tab — Blast-Radius Analyzer ─────────────────── */}
            {activeTab === 'impact' && (
                <div style={{ flex: 1, overflowY: 'auto', padding: 28, display: 'flex', flexDirection: 'column', gap: 20 }}>
                    <details style={{ background: 'rgba(245,158,11,0.06)', border: '1px solid rgba(245,158,11,0.2)', borderRadius: 10, padding: '14px 18px' }}>
                        <summary style={{ cursor: 'pointer', color: '#f59e0b', fontWeight: 700, fontSize: '0.85rem', listStyle: 'none', display: 'flex', alignItems: 'center', gap: 8 }}>
                            <span style={{ fontSize: '1rem' }}>ℹ</span> How to Use — Visual Change Consequence Analyzer
                        </summary>
                        <div style={{ marginTop: 14, display: 'flex', flexDirection: 'column', gap: 10, fontSize: '0.8rem', color: '#94a3b8', lineHeight: 1.6 }}>
                            <div style={{ color: '#64748b', fontSize: '0.78rem', marginBottom: 4 }}>The Impact Analyzer traces modified source files through the ES6 import chain to every React Router route they affect, and translates that into plain-English business workflow impact. Run this before deploying to know exactly what the change touches.</div>
                            <div style={{ display: 'flex', gap: 10 }}><span style={{ color: '#f59e0b', fontWeight: 700, minWidth: 20 }}>1.</span><span><strong style={{ color: '#e2e8f0' }}>Run the analysis.</strong> Click Analyze Blast Radius. The engine inspects your uncommitted changes and maps each modified file through import chains to the React routes it affects.</span></div>
                            <div style={{ display: 'flex', gap: 10 }}><span style={{ color: '#f59e0b', fontWeight: 700, minWidth: 20 }}>2.</span><span><strong style={{ color: '#e2e8f0' }}>Read the impact map.</strong> Each affected route is listed with a plain-English description of the business workflow it supports — e.g. <code style={{ background: 'rgba(255,255,255,0.07)', padding: '1px 5px', borderRadius: 4 }}>"Touches Work Order close-out flow"</code>.</span></div>
                            <div style={{ display: 'flex', gap: 10 }}><span style={{ color: '#f59e0b', fontWeight: 700, minWidth: 20 }}>3.</span><span><strong style={{ color: '#e2e8f0' }}>Check the risk level.</strong> Routes marked high-traffic or tied to critical workflows (PM scheduling, LOTO permits, cost close-out) warrant extra testing before going live.</span></div>
                            <div style={{ display: 'flex', gap: 10 }}><span style={{ color: '#f59e0b', fontWeight: 700, minWidth: 20 }}>4.</span><span><strong style={{ color: '#e2e8f0' }}>Use it before every deploy.</strong> Run Impact Analysis → Friction Analysis → Deploy in sequence for a complete pre-flight on any change.</span></div>
                        </div>
                    </details>
                    <div style={{ color: '#94a3b8', fontWeight: 700, fontSize: '0.95rem', display: 'flex', alignItems: 'center', gap: 8 }}>
                        <Zap size={16} color="#f59e0b" /> Visual Change Consequence Analyzer
                    </div>
                    <div style={{ color: '#475569', fontSize: '0.8rem', lineHeight: 1.6 }}>
                        Traces component changes through ES6 import chains to React Router routes,
                        translating code diffs into plain-English business workflow impact.
                    </div>

                    {/* Scope card */}
                    <div style={{ background: 'rgba(15,23,42,0.8)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 10, padding: 16 }}>
                        <div style={{ fontSize: '0.78rem', color: '#475569', marginBottom: 8 }}>
                            Scope: {selectedFile
                                ? <><strong style={{ color: '#a5b4fc' }}>{selectedFile.path}</strong> (current editor file)</>
                                : <strong style={{ color: '#f59e0b' }}>All uncommitted changes (git diff HEAD)</strong>
                            }
                        </div>
                        <button
                            onClick={runBlastRadius}
                            disabled={blastLoading}
                            style={{
                                padding: '8px 20px', borderRadius: 7, border: 'none',
                                background: 'rgba(245,158,11,0.18)', color: '#f59e0b',
                                cursor: 'pointer', fontSize: '0.82rem', fontWeight: 700,
                                display: 'flex', alignItems: 'center', gap: 6,
                                opacity: blastLoading ? 0.6 : 1,
                            }}
                        >
                            <Zap size={13} /> {blastLoading ? 'Analyzing import chains…' : 'Map Blast Radius'}
                        </button>
                    </div>

                    {blastResult && !blastResult.error && (
                        <>
                            {/* Summary banner */}
                            <div style={{
                                borderRadius: 10, padding: '14px 20px',
                                background: blastResult.affectedRoutes.length > 0 ? 'rgba(239,68,68,0.08)' : 'rgba(99,102,241,0.08)',
                                border: `1px solid ${blastResult.affectedRoutes.length > 0 ? 'rgba(239,68,68,0.25)' : 'rgba(99,102,241,0.25)'}`,
                                display: 'flex', alignItems: 'center', gap: 12,
                            }}>
                                <Zap size={18} color={blastResult.affectedRoutes.length > 0 ? '#f87171' : '#818cf8'} />
                                <span style={{ color: blastResult.affectedRoutes.length > 0 ? '#fca5a5' : '#a5b4fc', fontWeight: 700, fontSize: '0.88rem' }}>
                                    {blastResult.summary}
                                </span>
                            </div>

                            {/* Changed components */}
                            {blastResult.changedComponents.length > 0 && (
                                <div style={{ background: 'rgba(15,23,42,0.8)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 10, overflow: 'hidden' }}>
                                    <div style={{ padding: '8px 16px', borderBottom: '1px solid rgba(255,255,255,0.06)', fontSize: '0.72rem', color: '#475569', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em' }}>
                                        Changed Components ({blastResult.changedComponents.length})
                                    </div>
                                    {blastResult.changedComponents.map((c, i) => (
                                        <div key={i} style={{ padding: '8px 16px', borderBottom: '1px solid rgba(255,255,255,0.03)', fontSize: '0.8rem', color: '#f59e0b', fontFamily: 'monospace' }}>
                                            {c.file}
                                        </div>
                                    ))}
                                </div>
                            )}

                            {/* Affected routes */}
                            {blastResult.affectedRoutes.length > 0 && (
                                <div style={{ background: 'rgba(15,23,42,0.8)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 10, overflow: 'hidden' }}>
                                    <div style={{ padding: '8px 16px', borderBottom: '1px solid rgba(255,255,255,0.06)', fontSize: '0.72rem', color: '#475569', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em' }}>
                                        Affected Routes ({blastResult.affectedRoutes.length})
                                    </div>
                                    {blastResult.affectedRoutes.map((r, i) => (
                                        <div key={i} style={{
                                            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                                            padding: '10px 16px', borderBottom: '1px solid rgba(255,255,255,0.03)', fontSize: '0.8rem',
                                        }}>
                                            <div>
                                                <div style={{ color: '#ef4444', fontFamily: 'monospace', fontWeight: 600, marginBottom: 2 }}>{r.path}</div>
                                                <div style={{ color: '#475569', fontSize: '0.72rem' }}>
                                                    Component: <span style={{ color: '#818cf8' }}>{r.component}</span>
                                                    {r.via && <> &mdash; via <span style={{ color: '#64748b', fontFamily: 'monospace' }}>{r.via}</span></>}
                                                </div>
                                            </div>
                                            <span style={{
                                                padding: '2px 9px', borderRadius: 99, fontSize: '0.7rem', fontWeight: 700,
                                                background: r.impact === 'direct' ? 'rgba(239,68,68,0.15)' : 'rgba(245,158,11,0.12)',
                                                color: r.impact === 'direct' ? '#f87171' : '#f59e0b',
                                                border: `1px solid ${r.impact === 'direct' ? 'rgba(239,68,68,0.3)' : 'rgba(245,158,11,0.25)'}`,
                                                flexShrink: 0, marginLeft: 12,
                                            }}>
                                                {r.impact}
                                            </span>
                                        </div>
                                    ))}
                                </div>
                            )}

                            {/* Downstream importers */}
                            {blastResult.importingComponents.length > 0 && (
                                <div style={{ background: 'rgba(15,23,42,0.8)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 10, overflow: 'hidden' }}>
                                    <div style={{ padding: '8px 16px', borderBottom: '1px solid rgba(255,255,255,0.06)', fontSize: '0.72rem', color: '#475569', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em' }}>
                                        Downstream Importers ({blastResult.importingComponents.length})
                                    </div>
                                    {blastResult.importingComponents.map((c, i) => (
                                        <div key={i} style={{ padding: '8px 16px', borderBottom: '1px solid rgba(255,255,255,0.03)', fontSize: '0.8rem', display: 'flex', gap: 10 }}>
                                            <span style={{ color: '#94a3b8', fontFamily: 'monospace' }}>{c.file}</span>
                                            <span style={{ color: '#475569', fontSize: '0.73rem' }}>imports: {c.imports.join(', ')}</span>
                                        </div>
                                    ))}
                                </div>
                            )}

                            {blastResult.changedComponents.length > 0 && blastResult.affectedRoutes.length === 0 && (
                                <div style={{ color: '#475569', fontSize: '0.8rem', textAlign: 'center', padding: 20, background: 'rgba(15,23,42,0.5)', borderRadius: 8 }}>
                                    No route mappings found. These may be utility/shared components not directly mounted on any route.
                                </div>
                            )}
                        </>
                    )}
                    {blastResult?.error && (
                        <div style={{ color: '#ef4444', fontSize: '0.82rem', padding: 14, background: 'rgba(239,68,68,0.08)', borderRadius: 8 }}>
                            Analysis error: {blastResult.error}
                        </div>
                    )}
                </div>
            )}

            {/* ── §15 Ledger Tab — Executive Intelligence Audit Ledger ──────── */}
            {activeTab === 'ledger' && (
                <div style={{ flex: 1, overflowY: 'auto', padding: 28, display: 'flex', flexDirection: 'column', gap: 16 }}>

                    {/* How-to guide */}
                    <details style={{ background: 'rgba(99,102,241,0.06)', border: '1px solid rgba(99,102,241,0.18)', borderRadius: 10, padding: '10px 14px', fontSize: '0.78rem', color: '#94a3b8' }}>
                        <summary style={{ cursor: 'pointer', fontWeight: 700, color: '#818cf8', fontSize: '0.8rem', userSelect: 'none' }}>
                            How to use the Deployment Ledger
                        </summary>
                        <ol style={{ margin: '10px 0 4px 0', paddingLeft: 18, lineHeight: 1.7 }}>
                            <li><strong style={{ color: '#c7d2fe' }}>Read the history</strong> — Every deploy triggered from the Deploy tab is recorded here with its branch, commit SHA, stable tag, status, and full build log. Green = success, red = failed.</li>
                            <li><strong style={{ color: '#c7d2fe' }}>Filter by status or branch</strong> — Use the Search &amp; Filter panel to narrow by date range, branch name, or pass/fail status. Useful for auditing a specific release line.</li>
                            <li><strong style={{ color: '#c7d2fe' }}>Expand an entry</strong> — Click any row to see the full build log output. The stable tag (e.g. <code style={{ background: 'rgba(99,102,241,0.15)', borderRadius: 3, padding: '1px 5px' }}>v1.0.0-stable</code>) is the version pinned to that deploy.</li>
                            <li><strong style={{ color: '#c7d2fe' }}>Use for rollback decisions</strong> — Before reverting, check the ledger for the last successful deploy's commit SHA. Pass that to your team or use it with <code style={{ background: 'rgba(99,102,241,0.15)', borderRadius: 3, padding: '1px 5px' }}>git checkout &lt;sha&gt;</code> to restore a known-good state.</li>
                        </ol>
                    </details>

                    {/* Header row */}
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                        <span style={{ color: '#94a3b8', fontWeight: 700, fontSize: '0.9rem', display: 'flex', alignItems: 'center', gap: 8 }}>
                            <ClipboardList size={15} /> Executive Deployment Ledger
                            {ledger.length > 0 && <span style={{ color: '#334155', fontWeight: 400, fontSize: '0.78rem' }}>({ledger.length} entries)</span>}
                        </span>
                        <div style={{ display: 'flex', gap: 8 }}>
                            <button
                                onClick={exportLedgerPDF}
                                disabled={ledger.length === 0}
                                style={{ background: 'rgba(99,102,241,0.1)', border: '1px solid rgba(99,102,241,0.2)', cursor: ledger.length > 0 ? 'pointer' : 'default', color: ledger.length > 0 ? '#818cf8' : '#334155', borderRadius: 6, padding: '4px 12px', display: 'flex', alignItems: 'center', gap: 5, fontSize: '0.75rem' }}
                            >
                                <FileDown size={12} /> Export PDF
                            </button>
                            <button
                                onClick={() => apiFetch('/api/studio/ledger').then(d => d.entries && setLedger(d.entries))}
                                style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#475569', display: 'flex', alignItems: 'center', gap: 5, fontSize: '0.78rem' }}
                            >
                                <RefreshCw size={12} /> All
                            </button>
                        </div>
                    </div>

                    {/* §15 Deep-Search Filters */}
                    <div style={{ background: 'rgba(15,23,42,0.8)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 10, padding: 14 }}>
                        <div style={{ fontSize: '0.72rem', color: '#475569', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 10 }}>
                            Search &amp; Filter
                        </div>
                        <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 1fr 1fr', gap: 8, marginBottom: 10 }}>
                            <input
                                value={ledgerSearchQ}
                                onChange={e => setLedgerSearchQ(e.target.value)}
                                onKeyDown={e => e.key === 'Enter' && searchLedger()}
                                placeholder="Search notes, branch, SHA, user…"
                                style={{ padding: '6px 10px', borderRadius: 6, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', color: '#e2e8f0', fontSize: '0.78rem', outline: 'none' }}
                            />
                            <input
                                value={ledgerSearchUser}
                                onChange={e => setLedgerSearchUser(e.target.value)}
                                placeholder="User…"
                                style={{ padding: '6px 10px', borderRadius: 6, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', color: '#e2e8f0', fontSize: '0.78rem', outline: 'none' }}
                            />
                            <input
                                type="date"
                                value={ledgerSearchFrom}
                                onChange={e => setLedgerSearchFrom(e.target.value)}
                                style={{ padding: '6px 8px', borderRadius: 6, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', color: '#e2e8f0', fontSize: '0.75rem', outline: 'none' }}
                            />
                            <input
                                type="date"
                                value={ledgerSearchTo}
                                onChange={e => setLedgerSearchTo(e.target.value)}
                                style={{ padding: '6px 8px', borderRadius: 6, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', color: '#e2e8f0', fontSize: '0.75rem', outline: 'none' }}
                            />
                            <select
                                value={ledgerSearchStatus}
                                onChange={e => setLedgerSearchStatus(e.target.value)}
                                style={{ padding: '6px 8px', borderRadius: 6, background: 'rgba(15,23,42,0.95)', border: '1px solid rgba(255,255,255,0.08)', color: '#e2e8f0', fontSize: '0.75rem', outline: 'none' }}
                            >
                                <option value="">Any Status</option>
                                <option value="SUCCESS">Success</option>
                                <option value="FAILED">Failed</option>
                                <option value="REVERTED">Reverted</option>
                                <option value="BUILDING">Building</option>
                            </select>
                        </div>
                        <button
                            onClick={searchLedger}
                            disabled={ledgerSearching}
                            style={{
                                display: 'flex', alignItems: 'center', gap: 6,
                                padding: '6px 16px', borderRadius: 6, border: 'none',
                                background: 'rgba(99,102,241,0.18)', color: '#818cf8',
                                cursor: 'pointer', fontSize: '0.78rem', fontWeight: 700,
                                opacity: ledgerSearching ? 0.6 : 1,
                            }}
                        >
                            <Search size={12} /> {ledgerSearching ? 'Searching…' : 'Search'}
                        </button>
                    </div>

                    {/* Ledger entries */}
                    {ledger.length === 0 ? (
                        <div style={{ color: '#334155', textAlign: 'center', padding: 40, fontSize: '0.85rem' }}>
                            No deploy history yet. Deploy something to begin building your ledger.
                        </div>
                    ) : (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                            {ledger.map(entry => (
                                <div key={entry.ID} style={{
                                    background: 'rgba(15,23,42,0.8)', border: '1px solid rgba(255,255,255,0.06)',
                                    borderRadius: 9, padding: 16,
                                }}>
                                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                                            <StatusBadge status={entry.Status} />
                                            <span style={{ color: '#94a3b8', fontSize: '0.8rem' }}>#{entry.ID}</span>
                                            <span style={{ color: '#475569', fontSize: '0.78rem' }}>by {entry.DeployedBy}</span>
                                        </div>
                                        <span style={{ color: '#334155', fontSize: '0.72rem' }}>
                                            {entry.StartedAt ? new Date(entry.StartedAt).toLocaleString() : '--'}
                                        </span>
                                    </div>
                                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 14, fontSize: '0.75rem', alignItems: 'center' }}>
                                        {entry.SandboxBranch && (
                                            <span style={{ color: '#475569' }}>
                                                Branch: <span style={{ color: '#818cf8' }}>{entry.SandboxBranch}</span>
                                            </span>
                                        )}
                                        {entry.StableTag && (
                                            <span style={{ color: '#475569' }}>
                                                Tag: <span style={{ color: '#10b981' }}>{entry.StableTag}</span>
                                            </span>
                                        )}
                                        {entry.CommitSHA && (
                                            <span style={{ color: '#475569', display: 'flex', alignItems: 'center', gap: 5 }}>
                                                SHA:
                                                <code style={{ color: '#64748b', fontFamily: 'monospace', fontSize: '0.73rem', background: 'rgba(255,255,255,0.04)', padding: '1px 6px', borderRadius: 4 }}>
                                                    {entry.CommitSHA.slice(0, 12)}
                                                </code>
                                                <button
                                                    onClick={() => copySHA(entry.CommitSHA)}
                                                    title="Copy full SHA"
                                                    style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 2, color: copiedSHA === entry.CommitSHA ? '#10b981' : '#334155', display: 'flex' }}
                                                >
                                                    {copiedSHA === entry.CommitSHA ? <Check size={11} /> : <Copy size={11} />}
                                                </button>
                                            </span>
                                        )}
                                        {entry.CompletedAt && (
                                            <span style={{ color: '#334155', fontSize: '0.72rem' }}>
                                                Completed: {new Date(entry.CompletedAt).toLocaleString()}
                                            </span>
                                        )}
                                    </div>
                                    {entry.Notes && (
                                        <div style={{ marginTop: 8, color: '#475569', fontSize: '0.75rem', fontStyle: 'italic' }}>"{entry.Notes}"</div>
                                    )}
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            )}
        </div>,
        document.body
    );
}
