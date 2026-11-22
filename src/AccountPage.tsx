import { useEffect, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { AlertTriangle, Github, LogOut, Mail, Users } from 'lucide-react';
import { supabase } from '@/supabase';
import { clearMyStats, deleteAccount } from '@/account';
import {
  fetchDisplayName,
  setDisplayName,
  NAME_MESSAGES,
  type NameResult,
} from '@/leaderboard';
import {
  acceptInvite,
  blockFriend,
  clearPendingInvite,
  fetchCircle,
  inviteUrl,
  mintInvite,
  pendingInvite,
  removeFriend,
  unblockFriend,
  type AcceptFailure,
  type Circle,
  type InviteFailure,
} from '@/friends';
import PageWithRail, { PageTabs } from '@/PageWithRail';
import type { AccountTab } from '@/routes';

const INVITE_MESSAGES: Record<Exclude<InviteFailure, 'not signed in'>, string> = {
  'name required': 'Set a display name on the Personal tab first — friends see you by it.',
  'too many': 'Ten links are already out there. Each lasts a week; one of them can be shared again.',
  error: 'Couldn’t create a link just now — try again in a moment.',
};

const ACCEPT_MESSAGES: Record<Exclude<AcceptFailure, 'not signed in' | 'name required' | 'error'>, string> = {
  invalid: 'That invite link isn’t valid any more — ask your friend for a fresh one.',
  self: 'That’s your own invite link — it’s for sending to someone else.',
  full: 'One of you has a full friends list, so this invite can’t go through.',
};

// A different word per action, so a hand that has learned one doesn't finish
// the other on autopilot, and a fresh code beside it — a phrase you can type
// from memory is a phrase you can type without meaning to.
const CONFIRM_WORD = { stats: 'clear', account: 'delete' } as const;

// No O/0 or I/1/l. This gets read off the screen and typed back, and a code
// you have to squint at is a worse gate rather than a stronger one.
function newCode(): string {
  const alphabet = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  return Array.from(crypto.getRandomValues(new Uint8Array(4)), (b) => alphabet[b % alphabet.length]).join('');
}

export default function AccountPage({
  session,
  tab,
  tabLink,
  onSignedOut,
}: {
  session: Session | null;
  /** the open tab, which is the address */
  tab: AccountTab;
  tabLink: (t: AccountTab) => { to: string; onGo: () => void };
  /** where to go once signed out: the page is about an account there no
   *  longer is */
  onSignedOut: () => void;
}) {
  const [email, setEmail] = useState('');
  const [status, setStatus] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle');
  const [error, setError] = useState('');
  const [code, setCode] = useState('');
  const [verifying, setVerifying] = useState(false);
  const [codeError, setCodeError] = useState('');

  // The name lives in profiles rather than the synced settings blob, because
  // it has to be unique across accounts — that's a database constraint, not a
  // preference.
  const [name, setName] = useState<string | null>(null);
  const [nameDraft, setNameDraft] = useState('');
  const [nameState, setNameState] = useState<'idle' | 'saving' | 'saved' | Exclude<NameResult, 'ok'>>(
    'idle'
  );

  useEffect(() => {
    if (!session) return;
    let alive = true;
    fetchDisplayName().then((n) => {
      if (!alive) return;
      setName(n);
      setNameDraft(n ?? '');
    });
    return () => {
      alive = false;
    };
  }, [session]);

  async function saveName() {
    if (nameState === 'saving') return;
    setNameState('saving');
    const result = await setDisplayName(nameDraft.trim());
    if (result === 'ok') {
      const saved = nameDraft.trim() || null;
      setName(saved);
      setNameDraft(saved ?? '');
      setNameState('saved');
    } else {
      setNameState(result);
    }
  }

  // ---- Friends -------------------------------------------------------------
  const [circle, setCircle] = useState<Circle | null>(null);
  const [inviteLink, setInviteLink] = useState<string | null>(null);
  const [inviteMsg, setInviteMsg] = useState('');
  const [minting, setMinting] = useState(false);
  const [copied, setCopied] = useState(false);
  const [acceptMsg, setAcceptMsg] = useState('');
  const [pending, setPending] = useState<string | null>(pendingInvite);

  useEffect(() => {
    if (!session) return;
    let alive = true;
    fetchCircle().then((c) => alive && setCircle(c));
    return () => {
      alive = false;
    };
  }, [session]);

  // A stashed invite gets its chance whenever there's a session to accept it
  // as. `name` is a dependency on purpose: 'name required' keeps the stash,
  // and saving a name is what un-sticks it.
  useEffect(() => {
    if (!session || !pending) return;
    let alive = true;
    acceptInvite(pending).then((r) => {
      if (!alive) return;
      if (r.ok) {
        clearPendingInvite();
        setPending(null);
        setAcceptMsg(`You and ${r.name} are friends now.`);
        fetchCircle().then((c) => alive && setCircle(c));
      } else if (r.reason === 'name required') {
        setAcceptMsg(
          'You have a friend invite waiting — set a display name on the Personal tab and it goes through.'
        );
      } else if (r.reason === 'error' || r.reason === 'not signed in') {
        setAcceptMsg('Couldn’t reach the server to accept the invite — it will be retried here.');
      } else {
        // a dead code stays dead; keeping it would repeat this message forever
        clearPendingInvite();
        setPending(null);
        setAcceptMsg(ACCEPT_MESSAGES[r.reason]);
      }
    });
    return () => {
      alive = false;
    };
  }, [session, pending, name]);

  async function makeInvite() {
    if (minting) return;
    setMinting(true);
    setInviteMsg('');
    setCopied(false);
    const r = await mintInvite();
    setMinting(false);
    if (r.ok) {
      setInviteLink(inviteUrl(r.code));
    } else if (r.reason !== 'not signed in') {
      setInviteLink(null);
      setInviteMsg(INVITE_MESSAGES[r.reason]);
    }
  }

  async function copyInvite() {
    if (!inviteLink) return;
    try {
      await navigator.clipboard.writeText(inviteLink);
      setCopied(true);
    } catch {
      // the link is on screen; selecting it by hand still works
    }
  }

  async function circleAction(action: (name: string) => Promise<boolean>, who: string) {
    if (await action(who)) setCircle(await fetchCircle());
  }

  async function sendMagicLink(e: React.FormEvent) {
    e.preventDefault();
    if (!supabase || !email.trim() || status === 'sending') return;
    setStatus('sending');
    setError('');
    const { error: err } = await supabase.auth.signInWithOtp({
      email: email.trim(),
      options: { emailRedirectTo: window.location.origin },
    });
    if (err) {
      setStatus('error');
      setError(err.message || 'Something went wrong sending the email — please try again.');
    } else {
      setStatus('sent');
    }
  }

  // OAuth needs no email at all — the whole page redirects to the provider
  async function oauth(provider: 'github' | 'google') {
    if (!supabase) return;
    setError('');
    const { error: err } = await supabase.auth.signInWithOAuth({
      provider,
      options: { redirectTo: window.location.origin },
    });
    if (err) {
      setStatus('error');
      setError(err.message || 'Something went wrong starting the sign-in — please try again.');
    }
  }

  // fallback for when the magic link can't complete (e.g. an email scanner
  // pre-clicked it): verify with the code from the same email
  async function verifyCode(e: React.FormEvent) {
    e.preventDefault();
    if (!supabase || !code.trim() || verifying) return;
    setVerifying(true);
    setCodeError('');
    const { error: err } = await supabase.auth.verifyOtp({
      email: email.trim(),
      token: code.trim(),
      type: 'email',
    });
    setVerifying(false);
    // Signed in, this page redraws as the account once the session arrives;
    // as a dialog it closed itself here.
    if (err) setCodeError(err.message || 'That code didn’t verify — request a fresh email and try again.');
  }

  async function signOut() {
    await supabase?.auth.signOut();
    onSignedOut();
  }

  // Leaving. Nothing here fires on a single click: each one opens a panel
  // saying what it takes, and deletion also wants the word typed out.
  const [danger, setDanger] = useState<null | 'stats' | 'account'>(null);
  const [typed, setTyped] = useState('');
  // not `code` — that's the sign-in one-time code a few lines up
  const [confirmCode, setConfirmCode] = useState('');
  const [wipeLocal, setWipeLocal] = useState(true);
  const [busy, setBusy] = useState(false);
  const [dangerError, setDangerError] = useState('');
  const [statsCleared, setStatsCleared] = useState(false);

  function openDanger(which: 'stats' | 'account') {
    setDanger(which);
    setConfirmCode(newCode());
    setTyped('');
    setDangerError('');
    setStatsCleared(false);
  }

  // Every space and capital thrown away before comparing. Reading "clear NAXB"
  // off the screen, there's no way to tell whether it wants one space, four, or
  // none — and getting the letters right is the whole of the work being asked
  // for. Gating on typography would just be a second puzzle.
  const expected = danger === null ? '' : `${CONFIRM_WORD[danger]} ${confirmCode}`;
  const norm = (s: string) => s.replace(/\s+/g, '').toLowerCase();
  const typedOk = danger !== null && norm(typed) === norm(expected);

  async function confirmClearStats() {
    if (busy || !typedOk) return;
    setBusy(true);
    setDangerError('');
    const ok = await clearMyStats();
    setBusy(false);
    if (ok) {
      setDanger(null);
      setStatsCleared(true);
    } else {
      setDangerError('Couldn’t clear that just now — try again in a moment.');
    }
  }

  async function confirmDeleteAccount() {
    if (busy || !typedOk) return;
    setBusy(true);
    setDangerError('');
    const ok = await deleteAccount(wipeLocal);
    if (!ok) {
      setBusy(false);
      setDangerError(
        'Couldn’t delete the account just now. Try again, or email privacy@anagrimoire.com and it will be done by hand.'
      );
      return;
    }
    // Reload rather than unwind by hand: the sync hooks, the stats view and
    // the session listener are all holding a user that no longer exists, and
    // a fresh load is the one way to be sure none of them writes again.
    window.location.reload();
  }

  return (
    <PageWithRail
      section="Me"
      title={session ? 'Account' : 'Sign in'}
      blurb={session ? <>Signed in as <span className="text-slate-200">{session.user.email}</span></> : undefined}
    >
        {session ? (
          <>

            {/* Two halves here too: who you are, and who you play against. */}
            <div className="mb-6">
              <PageTabs
                label="Account"
                tabs={[
                  { id: 'personal', label: 'Personal' },
                  { id: 'friends', label: 'Friends' },
                ]}
                current={tab}
                link={tabLink}
              />
            </div>

            <div className={`mb-6 ${tab === 'personal' ? '' : 'hidden'}`}>
              <label
                htmlFor="display-name"
                className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2"
              >
                Display name
              </label>
              <div className="flex flex-wrap gap-2">
                <input
                  id="display-name"
                  value={nameDraft}
                  onChange={(e) => {
                    setNameDraft(e.target.value);
                    setNameState('idle');
                  }}
                  maxLength={24}
                  placeholder="Not shown to anyone"
                  className="flex-1 min-w-[10rem] h-10 px-3 rounded-lg bg-white/5 border border-white/10 text-slate-200 placeholder:text-slate-600 text-sm"
                />
                <button
                  onClick={saveName}
                  disabled={nameState === 'saving' || nameDraft.trim() === (name ?? '')}
                  className="inline-flex items-center px-4 h-10 rounded-lg text-sm font-semibold bg-accent text-slate-950 hover:brightness-110 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  {nameState === 'saving' ? 'Saving…' : 'Save'}
                </button>
              </div>
              <p className="mt-2 text-xs text-slate-500" aria-live="polite">
                {nameState === 'saved'
                  ? name
                    ? `Saved. You appear as ${name} on the leaderboards.`
                    : 'Cleared. You no longer appear on the leaderboards.'
                  : nameState !== 'idle' && nameState !== 'saving'
                    ? NAME_MESSAGES[nameState]
                    : 'The only thing other players can see. Setting one puts you on the leaderboards; clearing it takes you off. Everything else about your account stays private.'}
              </p>
            </div>

            <div className={`mb-6 ${tab === 'friends' ? '' : 'hidden'}`}>
              <h3 className="flex items-center gap-1.5 text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">
                <Users className="w-3.5 h-3.5 text-accent" />
                Friends
              </h3>

              {acceptMsg && (
                <p className="mb-3 text-xs text-emerald-300" role="status">
                  {acceptMsg}
                </p>
              )}

              {/* polite, so the link (and the Copied confirmation) get read out
                  when they appear rather than needing to be found */}
              <div className="mb-2 flex flex-wrap gap-2 items-center" aria-live="polite">
                {inviteLink ? (
                  <>
                    <code className="flex-1 min-w-[12rem] px-3 py-2 rounded-lg bg-black/30 border border-white/15 text-xs text-slate-200 break-all select-all">
                      {inviteLink}
                    </code>
                    <button
                      onClick={copyInvite}
                      className="inline-flex items-center px-3 h-9 rounded-lg text-xs font-semibold bg-white/5 border border-white/10 text-slate-300 hover:bg-white/10 hover:text-white transition-colors"
                    >
                      {copied ? 'Copied' : 'Copy'}
                    </button>
                  </>
                ) : (
                  <button
                    onClick={makeInvite}
                    disabled={minting}
                    className="inline-flex items-center px-4 h-10 rounded-lg text-sm font-semibold bg-white/5 border border-white/10 text-slate-300 hover:bg-white/10 hover:text-white transition-colors disabled:opacity-40"
                  >
                    {minting ? 'Creating…' : 'Invite a friend'}
                  </button>
                )}
              </div>
              {inviteMsg && (
                <p className="mb-2 text-xs text-amber-300" role="status">
                  {inviteMsg}
                </p>
              )}

              {circle && (circle.friends.length > 0 || circle.blocked.length > 0) && (
                <div className="mb-2 rounded-xl bg-white/5 border border-white/10 p-3">
                  {circle.friends.length > 0 ? (
                    <ul className="space-y-1 max-h-64 overflow-y-auto pr-1">
                      {circle.friends.map((f) => (
                        <li
                          key={f.name}
                          className="flex items-center gap-2 text-sm text-slate-300 rounded-md bg-white/5 px-3 py-1.5"
                        >
                          <span className="flex-1 min-w-0 truncate font-medium">{f.name}</span>
                          <button
                            onClick={() => circleAction(removeFriend, f.name)}
                            aria-label={`Remove ${f.name}`}
                            className="text-xs text-slate-500 hover:text-white transition-colors"
                          >
                            Remove
                          </button>
                          <button
                            onClick={() => circleAction(blockFriend, f.name)}
                            aria-label={`Block ${f.name}`}
                            className="text-xs text-slate-500 hover:text-rose-300 transition-colors"
                          >
                            Block
                          </button>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="text-xs text-slate-500">No friends yet — the invite link is how that changes.</p>
                  )}

                  {circle.blocked.length > 0 && (
                    <div className="mt-3">
                      <p className="text-xs text-slate-500 mb-1">
                        Blocked — they can&apos;t re-add you, and they weren&apos;t told:
                      </p>
                      <ul className="space-y-1 max-h-32 overflow-y-auto pr-1">
                        {circle.blocked.map((n) => (
                          <li
                            key={n}
                            className="flex items-center gap-2 text-sm text-slate-400 rounded-md bg-white/5 px-3 py-1.5"
                          >
                            <span className="flex-1 min-w-0 truncate">{n}</span>
                            <button
                              onClick={() => circleAction(unblockFriend, n)}
                              aria-label={`Unblock ${n}`}
                              className="text-xs text-slate-500 hover:text-white transition-colors"
                            >
                              Unblock
                            </button>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              )}

              <p className="text-xs text-slate-500">
                Friends see each other on a private leaderboard — names and scores,
                nothing else. The link is how someone becomes a friend: there&apos;s no
                search, so nobody you didn&apos;t hand it to can find you. It works for a
                week, for anyone holding it.
              </p>
            </div>

            <button
              onClick={signOut}
              className={`${tab === 'personal' ? 'inline-flex' : 'hidden'} items-center gap-1.5 px-4 h-10 rounded-lg text-sm font-semibold bg-white/5 border border-white/10 text-slate-300 hover:bg-white/10 hover:text-white transition-colors`}
            >
              <LogOut className="w-4 h-4" />
              Sign out
            </button>

            <div className={`mt-6 pt-5 border-t border-white/10 ${tab === 'personal' ? '' : 'hidden'}`}>
              <h3 className="flex items-center gap-1.5 text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">
                <AlertTriangle className="w-3.5 h-3.5 text-danger" />
                Leaving
              </h3>

              {danger === null && (
                <>
                  <p className="text-xs text-slate-500 mb-3">
                    Two different things, and most people want the first. Neither can be
                    undone.
                  </p>
                  <div className="flex flex-wrap gap-2">
                    <button
                      onClick={() => openDanger('stats')}
                      className="inline-flex items-center px-4 h-10 rounded-lg text-sm font-semibold bg-white/5 border border-white/10 text-slate-300 hover:bg-white/10 hover:text-white transition-colors"
                    >
                      Clear my statistics
                    </button>
                    <button
                      onClick={() => openDanger('account')}
                      className="inline-flex items-center px-4 h-10 rounded-lg text-sm font-semibold bg-white/5 border border-rose-500/40 text-rose-300 hover:bg-rose-400/10 transition-colors"
                    >
                      Delete my account
                    </button>
                  </div>
                  {statsCleared && (
                    <p className="mt-2 text-xs text-emerald-300" role="status">
                      Cleared. Your account is still here — start playing and it fills up
                      again.
                    </p>
                  )}
                </>
              )}

              {danger === 'stats' && (
                <div className="rounded-xl bg-white/5 border border-white/10 p-4">
                  <p className="text-sm text-slate-300 mb-2">
                    Clear your statistics?
                  </p>
                  <p className="text-xs text-slate-400 mb-3">
                    Deletes every result on your account, the daily boards stored with
                    it, and the totals this browser had before you signed in. Your
                    account, your email and your display name all stay. A daily you
                    still have open here will save itself again as you keep playing.
                  </p>

                  <label htmlFor="clear-confirm" className="block text-xs text-slate-400 mb-1.5">
                    Type{' '}
                    <span className="text-slate-200 font-semibold">
                      clear <span className="tracking-[0.2em]">{confirmCode}</span>
                    </span>{' '}
                    to confirm — spaces and capitals don&apos;t matter
                  </label>
                  <input
                    id="clear-confirm"
                    value={typed}
                    onChange={(e) => setTyped(e.target.value)}
                    autoComplete="off"
                    className="w-full h-10 px-3 mb-3 rounded-lg bg-black/30 border border-white/15 text-slate-200 text-sm"
                  />

                  <div className="flex flex-wrap gap-2">
                    <button
                      onClick={confirmClearStats}
                      disabled={busy || !typedOk}
                      className="inline-flex items-center px-4 h-10 rounded-lg text-sm font-semibold bg-rose-400 text-ink hover:bg-rose-300 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                      {busy ? 'Clearing…' : 'Clear statistics'}
                    </button>
                    <button
                      onClick={() => setDanger(null)}
                      disabled={busy}
                      className="inline-flex items-center px-4 h-10 rounded-lg text-sm font-semibold bg-white/5 border border-white/10 text-slate-300 hover:bg-white/10 hover:text-white transition-colors disabled:opacity-40"
                    >
                      Cancel
                    </button>
                  </div>
                  {dangerError && (
                    <p className="mt-2 text-xs text-danger" role="alert">
                      {dangerError}
                    </p>
                  )}
                </div>
              )}

              {danger === 'account' && (
                <div className="rounded-xl bg-rose-950/60 border border-rose-500/40 p-4">
                  <p className="text-sm text-rose-100 mb-2">Delete your account?</p>
                  <p className="text-xs text-slate-300 mb-3">
                    Everything attached to it goes at once — results, daily boards,
                    display name, settings, and the sign-in itself. It cannot be undone,
                    and signing in later with{' '}
                    <span className="text-slate-200">{session.user.email}</span> starts a
                    brand new account rather than finding this one.
                  </p>

                  <label className="flex items-start gap-2 mb-3 text-xs text-slate-300 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={wipeLocal}
                      onChange={(e) => setWipeLocal(e.target.checked)}
                      className="mt-0.5 w-4 h-4 shrink-0 accent-rose-400"
                    />
                    <span>
                      Also erase this browser&apos;s saved boards and statistics. Leave
                      it unticked to keep playing here without an account — those stay on
                      this device either way, and clearing the site&apos;s data in your
                      browser removes them whenever you like.
                    </span>
                  </label>

                  <label
                    htmlFor="delete-confirm"
                    className="block text-xs text-slate-400 mb-1.5"
                  >
                    Type{' '}
                    <span className="text-rose-200 font-semibold">
                      delete <span className="tracking-[0.2em]">{confirmCode}</span>
                    </span>{' '}
                    to confirm — spaces and capitals don&apos;t matter
                  </label>
                  <input
                    id="delete-confirm"
                    value={typed}
                    onChange={(e) => setTyped(e.target.value)}
                    autoComplete="off"
                    className="w-full h-10 px-3 mb-3 rounded-lg bg-black/30 border border-rose-500/40 text-slate-200 placeholder:text-slate-600 text-sm"
                  />

                  <div className="flex flex-wrap gap-2">
                    <button
                      onClick={confirmDeleteAccount}
                      disabled={busy || !typedOk}
                      className="inline-flex items-center px-4 h-10 rounded-lg text-sm font-semibold bg-rose-400 text-ink hover:bg-rose-300 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                      {busy ? 'Deleting…' : 'Delete account'}
                    </button>
                    <button
                      onClick={() => setDanger(null)}
                      disabled={busy}
                      className="inline-flex items-center px-4 h-10 rounded-lg text-sm font-semibold bg-white/5 border border-white/10 text-slate-300 hover:bg-white/10 hover:text-white transition-colors disabled:opacity-40"
                    >
                      Cancel
                    </button>
                  </div>
                  {dangerError && (
                    <p className="mt-2 text-xs text-danger" role="alert">
                      {dangerError}
                    </p>
                  )}
                </div>
              )}
            </div>
          </>
        ) : (
          <>
            <p className="text-sm text-slate-400 mb-5">
              No password needed. Accounts are optional — they carry your statistics
              and today&apos;s unfinished puzzles between devices, so you can start on
              a phone and finish on a laptop. Without one, everything still works,
              but each browser keeps its own separate progress.
            </p>
            <div className="space-y-2 mb-5">
              <button
                onClick={() => oauth('github')}
                className="w-full inline-flex items-center justify-center gap-2 h-11 rounded-lg text-sm font-semibold bg-white/10 border border-white/15 text-white hover:bg-white/15 transition-colors"
              >
                <Github className="w-4 h-4" />
                Continue with GitHub
              </button>
              <button
                onClick={() => oauth('google')}
                className="w-full inline-flex items-center justify-center gap-2 h-11 rounded-lg text-sm font-semibold bg-white/10 border border-white/15 text-white hover:bg-white/15 transition-colors"
              >
                <svg className="w-4 h-4" viewBox="0 0 24 24" aria-hidden="true">
                  <path
                    fill="currentColor"
                    d="M21.35 11.1h-9.17v2.73h6.51c-.33 3.81-3.5 5.44-6.5 5.44C8.36 19.27 5 16.25 5 12c0-4.1 3.2-7.27 7.2-7.27 3.09 0 4.9 1.97 4.9 1.97L19 4.72S16.56 2 12.1 2C6.42 2 2.03 6.8 2.03 12c0 5.05 4.13 10 10.22 10 5.35 0 9.25-3.67 9.25-9.09 0-1.15-.15-1.81-.15-1.81Z"
                  />
                </svg>
                Continue with Google
              </button>
            </div>
            <div className="flex items-center gap-3 mb-5">
              <div className="flex-1 h-px bg-white/10" />
              <span className="text-[0.6875rem] text-slate-500 uppercase tracking-wider">or by email</span>
              <div className="flex-1 h-px bg-white/10" />
            </div>
            {status === 'sent' ? (
              <div className="space-y-4">
                <p className="text-sm text-emerald-300">
                  Check your email — click the sign-in link, or enter the code from the
                  email below.
                </p>
                <form onSubmit={verifyCode} className="space-y-3">
                  <input
                    type="text"
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    value={code}
                    onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 10))}
                    placeholder="one-time code"
                    className="w-full h-11 px-4 rounded-lg bg-white/5 border border-white/15 text-white tracking-[0.3em] placeholder:tracking-normal placeholder:text-slate-600 focus:outline-none focus:border-amber-400/60 transition-colors"
                  />
                  <button
                    type="submit"
                    disabled={verifying || code.length < 6}
                    className="w-full inline-flex items-center justify-center gap-1.5 h-11 rounded-lg text-sm font-semibold bg-accent text-slate-950 shadow-lg shadow-accent/30 hover:brightness-110 transition-colors disabled:opacity-50"
                  >
                    {verifying ? 'Verifying…' : 'Verify code'}
                  </button>
                  {codeError && <p className="text-sm text-danger">{codeError}</p>}
                </form>
              </div>
            ) : (
              <form onSubmit={sendMagicLink} className="space-y-3">
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  className="w-full h-11 px-4 rounded-lg bg-white/5 border border-white/15 text-white placeholder:text-slate-600 focus:outline-none focus:border-amber-400/60 transition-colors"
                />
                <button
                  type="submit"
                  disabled={status === 'sending'}
                  className="w-full inline-flex items-center justify-center gap-1.5 h-11 rounded-lg text-sm font-semibold bg-accent text-slate-950 shadow-lg shadow-accent/30 hover:brightness-110 transition-colors disabled:opacity-50"
                >
                  <Mail className="w-4 h-4" />
                  {status === 'sending' ? 'Sending…' : 'Send magic link'}
                </button>
                {status === 'error' && <p className="text-sm text-danger">{error}</p>}
              </form>
            )}
          </>
        )}
    </PageWithRail>
  );
}
