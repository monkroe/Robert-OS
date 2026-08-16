// ════════════════════════════════════════════════════════════════
// ROBERT OS - MODULES/SESSION-SYNC.JS v1.0.0
// Purpose: Realtime observation of work_sessions in the Benas project.
//
// Session Domain Multi-Door milestone, step 3 (Realtime subscription only).
// robert-os-hub/docs/05-roadmap/session-domain-multi-door-milestone.md §9
//
// SCOPE, DELIBERATE: this module does not touch state.activeShift, does not
// call any rpc_session_* write path, and does not read or write
// finance_shifts or expenses. It is a SECOND, independent Supabase client.
// The primary db.js client stays pointed at this PWA's own project for
// everything else, because work_sessions has no equivalent table there and
// switching the shared client would break existing shift/expense
// functionality -- the milestone's own acceptance criterion is that
// existing PWA behaviour without Realtime must not break.
//
// CANONICAL-REFETCH DISCIPLINE: on ANY postgres_changes event this module
// re-SELECTs the active session row rather than trusting the event payload.
// Event ordering, reconnects and missed updates are handled by "go ask the
// database again", not by reconstructing state from whatever the event
// happened to carry.
//
// CROSS-PROJECT IDENTITY TRAP, do not repeat it here: the milestone doc's
// §10 found the same email resolves to a DIFFERENT auth.users UUID in each
// Supabase project. Every filter/query below uses the user id from THIS
// client's OWN session (`benasDb.auth`), never state.user.id, which belongs
// to the primary (PWA-project) session.
// ════════════════════════════════════════════════════════════════

import { state } from '../state.js';

const BENAS_CONFIG = {
    SUPABASE_URL: 'https://vcenflikaxwcuqhtqori.supabase.co',
    SUPABASE_KEY: 'sb_publishable_jsLejK7NODrOdyRmi0Ys_A_V2QMZzOt',
};

// Explicit storageKey, not left to the library default. Verified 2026-08-16
// (same jsdelivr @supabase/supabase-js@2 chain this app loads, resolved to
// 2.112.3): the default key is already project-ref-derived and does not
// collide with db.js's primary client (sb-sopcisskptiqlllehhgb-auth-token
// vs sb-vcenflikaxwcuqhtqori-auth-token). Named here anyway so isolation is
// a stated fact in this file, not an inference from Supabase internals a
// future reader would have to re-derive.
export const benasDb = window.supabase.createClient(BENAS_CONFIG.SUPABASE_URL, BENAS_CONFIG.SUPABASE_KEY, {
    auth: { storageKey: 'sb-benas-work-sessions-auth-token' },
});

let channel = null;
let currentUserId = null;

/**
 * One-time bootstrap: call right after a successful PRIMARY login, with the
 * same email/password the user just typed. This establishes this second
 * client's own session in the Benas project, which it then persists itself
 * (its own localStorage key, same mechanism db.js's primary client already
 * relies on) -- the credentials are never stored anywhere beyond this call.
 *
 * Failure here must never block the primary login/reload; it only means
 * Realtime observation stays off until the next successful bootstrap.
 */
export async function bootstrapWithCredentials(email, password) {
    try {
        const { data, error } = await benasDb.auth.signInWithPassword({ email, password });
        if (error) {
            console.warn('⚠️ session-sync: Benas bootstrap login failed:', error.message);
            return;
        }
        await subscribe(data.user.id);
    } catch (err) {
        console.warn('⚠️ session-sync: Benas bootstrap threw:', err);
    }
}

/**
 * Call on every app init, not just fresh logins. If this client already
 * holds a persisted Benas session from a prior bootstrap, resumes the
 * subscription silently. If not -- e.g. the first load after this feature
 * shipped, with no fresh login since -- it does nothing and logs why,
 * rather than guessing at credentials it was never given. Logging out and
 * back in once bootstraps it.
 */
export async function resumeIfBootstrapped() {
    try {
        const { data: { session } } = await benasDb.auth.getSession();
        if (!session) {
            console.log('ℹ️ session-sync: no Benas session yet – log out/in once to bootstrap Realtime observation.');
            return;
        }
        await subscribe(session.user.id);
    } catch (err) {
        console.warn('⚠️ session-sync: resume failed:', err);
    }
}

/**
 * Recovery refetch for the visibilitychange listener in app.js: re-reads the
 * canonical active session for whichever user this client is currently
 * signed in as, WITHOUT touching subscribe()/channel/currentUserId. A
 * foreground event firing repeatedly (tab switches, quick lock/unlock) must
 * never create a new Realtime subscription -- only `subscribe()` does that,
 * and this function never calls it. If Realtime silently missed an update
 * while backgrounded, this is what catches it back up; if it did not, this
 * is a harmless duplicate read of the same row.
 *
 * Never throws -- errors are logged and swallowed, same as every other
 * exported function here, so a failure can never break the caller's
 * lifecycle handler.
 */
export async function refetchCanonical() {
    try {
        const { data: { session } } = await benasDb.auth.getSession();
        if (!session) return; // nothing to refetch if this client was never bootstrapped
        await fetchCanonicalActiveSession(session.user.id);
    } catch (err) {
        console.warn('⚠️ session-sync: recovery refetch failed:', err);
    }
}

async function fetchCanonicalActiveSession(userId) {
    try {
        const { data, error } = await benasDb
            .from('work_sessions')
            .select('*')
            .eq('user_id', userId)
            .eq('status', 'active')
            .is('deleted_at', null)
            .maybeSingle();

        if (error) {
            console.warn('⚠️ session-sync: canonical refetch failed:', error.message);
            return;
        }

        state._benasSessionPreview = data || null;
        console.log('%c🔄 session-sync: canonical active session refetched', 'color:#14b8a6', data);
    } catch (err) {
        console.warn('⚠️ session-sync: canonical refetch threw:', err);
    }
}

/**
 * Subscribes to work_sessions AND session_pauses changes for `userId` (a
 * Benas-project user id, see the identity note above), on ONE shared
 * channel. Idempotent: if a channel already exists for this same user, this
 * is a no-op; if one exists for a DIFFERENT user, it is torn down first. A
 * rerender or a repeated init call can never leave a duplicate channel
 * subscribed.
 *
 * BOTH tables are required, not just work_sessions. rpc_session_pause and
 * rpc_session_resume never touch work_sessions -- verified against
 * benas-bot db/v2-sessions-rpcs.sql, 2026-08-16: pause inserts an open row
 * into session_pauses (pause_end IS NULL) and updates the legacy
 * bf_shifts.ts_pause mirror; resume closes that row. work_sessions.status
 * stays 'active' through the whole pause. A channel watching only
 * work_sessions never receives an event for PAUSE or RESUME -- found before
 * this broke the milestone's own PAUSE/RESUME acceptance check, not after.
 * Both event sources feed the SAME canonical refetch; a session_pauses
 * event is a signal to re-ask the database, exactly like a work_sessions
 * event, never a state to trust from its payload.
 *
 * `filter` is a convenience on both bindings -- the actual security boundary
 * is Postgres RLS (`auth.uid() = user_id`, `FOR ALL`, present on both
 * work_sessions and session_pauses), which Realtime enforces server-side
 * regardless of what the client asks for. That is why a leaked event would
 * be a defect in the DATABASE policy, not in this filter string.
 */
export async function subscribe(userId) {
    if (channel && currentUserId === userId) return;

    await unsubscribe();
    currentUserId = userId;

    const onSignal = () => {
        // Never read the event payload as truth -- always refetch canonical.
        fetchCanonicalActiveSession(userId);
    };

    channel = benasDb
        .channel(`session-sync:${userId}`)
        .on(
            'postgres_changes',
            { event: '*', schema: 'public', table: 'work_sessions', filter: `user_id=eq.${userId}` },
            onSignal,
        )
        .on(
            'postgres_changes',
            { event: '*', schema: 'public', table: 'session_pauses', filter: `user_id=eq.${userId}` },
            onSignal,
        )
        .subscribe((status) => {
            if (status === 'SUBSCRIBED') {
                console.log('%c✅ session-sync: subscribed to work_sessions + session_pauses', 'color:#14b8a6; font-weight:bold;');
                fetchCanonicalActiveSession(userId);
            } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
                console.warn('⚠️ session-sync: channel', status);
            }
        });
}

export async function unsubscribe() {
    if (channel) {
        await benasDb.removeChannel(channel);
        channel = null;
    }
    currentUserId = null;
}
