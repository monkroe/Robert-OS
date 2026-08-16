// ════════════════════════════════════════════════════════════════
// ROBERT OS - MODULES/SESSION-SYNC-DEBUG.JS (TEMPORARY)
//
// On-screen diagnostic badge for the Session Domain Multi-Door milestone's
// §9 acceptance test (robert-os-hub docs/05-roadmap/
// session-domain-multi-door-milestone.md). Roberto is testing on a phone,
// not devtools -- state._benasSessionPreview updates with nothing visible
// to confirm it, so this renders it live.
//
// DELETE THIS FILE, and its one import + mount() call in app.js, once the
// §9 acceptance test has passed. Not part of the milestone's target
// architecture -- a test aid only.
// ════════════════════════════════════════════════════════════════

import { state, onStateChange } from '../state.js';
import { benasDb } from './session-sync.js';

let badgeEl = null;
let lastUpdatedText = '--:--:--';
let lastPaused = false;

/**
 * work_sessions.status stays 'active' through a pause -- rpc_session_pause
 * never touches it (verified against benas-bot db/v2-sessions-rpcs.sql,
 * 2026-08-16), it only inserts an open row into session_pauses. PAUSED can
 * only be known by checking for that open row, so this is a second
 * read-only query, not derivable from the canonical row alone.
 */
async function isPaused(sessionId) {
    const { data, error } = await benasDb
        .from('session_pauses')
        .select('id')
        .eq('session_id', sessionId)
        .is('pause_end', null)
        .is('deleted_at', null)
        .maybeSingle();
    if (error) {
        console.warn('⚠️ session-sync-debug: pause check failed:', error.message);
        return false;
    }
    return !!data;
}

function paint() {
    if (!badgeEl) return;
    const s = state._benasSessionPreview;
    const idPart = s ? String(s.id).slice(0, 8) : '(no session)';
    const label = s ? (lastPaused ? 'PAUSED' : 'ACTIVE') : 'NONE';
    badgeEl.textContent = `DEBUG canonical: ${label} | ${idPart} | ${lastUpdatedText}`;
}

/**
 * Fires ONLY from the onStateChange listener below, i.e. only when a real
 * canonical refetch writes to state._benasSessionPreview. lastUpdatedText
 * is set here and nowhere else -- there is no timer, no polling, no
 * periodic tick, so the displayed time changes exactly once per real
 * refetch and stays static otherwise.
 */
async function onCanonicalChange() {
    const s = state._benasSessionPreview;
    lastPaused = s ? await isPaused(s.id) : false;
    lastUpdatedText = new Date().toLocaleTimeString('lt-LT', { hour12: false });
    paint();
}

export function mount() {
    if (badgeEl) return; // idempotent, in case init() runs more than once

    badgeEl = document.createElement('div');
    badgeEl.id = 'session-sync-debug-badge';
    Object.assign(badgeEl.style, {
        position: 'fixed',
        top: '0',
        left: '0',
        right: '0',
        zIndex: '99999',
        background: '#ff00ff',
        color: '#000',
        font: '11px monospace',
        padding: '2px 6px',
        textAlign: 'center',
        pointerEvents: 'none',
    });
    document.body.appendChild(badgeEl);

    paint(); // initial paint: NONE / --:--:-- until the first real event
    onStateChange('_benasSessionPreview', onCanonicalChange);
}
