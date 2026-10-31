/**
 * The ONLY module that talks to the RUN SDK. Every call waits for the SDK to
 * finish starting, catches its own errors and degrades gracefully, so screens
 * never see a rejected promise.
 *
 * Shared vote tallies use UGC entries: each vote is one entry whose contentType
 * names the season, day and option (`v_<season>_d<day>_<option>`), and a
 * tally is `ugc.count({ contentType })`. Creating an entry needs a signed-in
 * player (RUN prompts guests to log in); counting works for everyone.
 *
 * Sandbox: in local mock mode (npm run dev) votes and tallies come from a seeded
 * stand-in crowd plus votes kept in appStorage, and ?day=N jumps to any night.
 */
import RundotGameAPI from '@series-inc/rundot-game-sdk/api';
import { HapticFeedbackStyle } from '@series-inc/rundot-game-sdk';
import { simulatedCrowd, simulatedRubble } from '../game/crowd';
import { ROOM_TYPE, type BattleProtocol } from '../game/battleWire';
import type { Reminder } from '../game/reminders';
import { DAY_MS, SEASON } from '../game/schedule';

const INIT_TIMEOUT_MS = 8000;
const SAVE_KEY = 'save';
/** Owner test mode's throwaway save (the real one is never touched). */
const PREVIEW_SAVE_KEY = 'save_preview';
const DEV_VOTES_KEY = 'devVotes';
const DEV_RUBBLE_KEY = 'devRubble';
/** Left behind by the retired Test Lab; removed once on boot. */
const RETIRED_KEYS = ['testLab', 'save_test', 'testVotes'];

let readyPromise: Promise<void> | null = null;
let clockOffsetMs = 0;
/** Dev only (?day=N): the night to pretend it is (-1 before launch, 19 the vigil, 20 Halloween). */
let devDayOverride: number | null = null;
/** ?day=N in local dev, kept so leaving test mode goes back to it. */
let urlDayOverride: number | null = null;
/** Owner test mode on the live build: the day it pretends to be (null when off). */
let previewDay: number | null = null;

function warn(label: string, err: unknown): void {
  console.warn(`[run] ${label}:`, err);
}

/** Attach a catch to fire-and-forget SDK calls (anything thenable). */
function quiet(result: unknown, label: string): void {
  try {
    if (result && typeof (result as Promise<unknown>).catch === 'function') {
      (result as Promise<unknown>).catch((err) => warn(label, err));
    }
  } catch (err) {
    warn(label, err);
  }
}

/** Resolves once the SDK has initialised (or after a timeout). Never rejects. */
export function ready(): Promise<void> {
  if (!readyPromise) {
    readyPromise = (async () => {
      try {
        await Promise.race([
          RundotGameAPI.initializeAsync(),
          new Promise((resolve) => setTimeout(resolve, INIT_TIMEOUT_MS)),
        ]);
      } catch (err) {
        warn('init', err);
      }
      if (isMock()) {
        // Dev-only time travel for testing: ?day=N jumps to voting day N.
        const param = new URLSearchParams(window.location.search).get('day');
        if (param !== null && /^-?\d+$/.test(param))
          devDayOverride = urlDayOverride = Number(param);
      } else {
        quiet(RundotGameAPI.appStorage.removeMultipleItems(RETIRED_KEYS), 'retire test lab');
      }
      await syncClock();
    })();
  }
  return readyPromise;
}

/** True when votes are fake and private (local dev). */
export function sandboxed(): boolean {
  return isMock();
}

/** Nothing written counts: local dev, or the owner's test mode on the live build. */
function fakeWrites(): boolean {
  return isMock() || previewDay !== null;
}

// ---------------------------------------------------------------- owner test mode

/** The game's owner on RUN (its link is w.run/rhuneark/its-alive). */
const OWNER_HANDLE = 'rhuneark';
const ROLE_TIMEOUT_MS = 4000;
/** Test mode unlocked by hand (Diagnostics' title tapped 5 times) for this session. */
let previewUnlocked = false;

export interface PreviewAccess {
  allowed: boolean;
  /** What the owner check found, shown in Diagnostics. */
  detail: string;
}

/**
 * Who may use test mode: anyone in local dev; on RUN, the game's owners and editors (RUN's
 * server-verified role), or the owner's account by name, because the role check has not always
 * answered inside the app; or anyone who unlocked it by hand this session. Test mode can't
 * change anything real, so the hand unlock is only a convenience gate.
 */
export async function canPreview(): Promise<PreviewAccess> {
  await ready();
  if (isMock()) return { allowed: true, detail: 'local dev' };
  let name = '';
  try {
    name = RundotGameAPI.getProfile()?.username ?? '';
  } catch {
    // no profile: a guest
  }
  const byName = name.toLowerCase() === OWNER_HANDLE;
  let detail: string;
  let role = 'none';
  try {
    const started = Date.now();
    const answer = await Promise.race([
      RundotGameAPI.app.getMyRole(),
      new Promise<'timed out'>((resolve) =>
        setTimeout(() => resolve('timed out'), ROLE_TIMEOUT_MS),
      ),
    ]);
    role = String(answer);
    detail = `role ${role} (${Date.now() - started} ms)`;
  } catch (err) {
    warn('getMyRole', err);
    detail = `role check failed: ${err instanceof Error ? err.message : String(err)}`;
  }
  detail += `, account ${name || 'none'}`;
  const allowed = role === 'owner' || role === 'editor' || byName || previewUnlocked;
  return { allowed, detail: previewUnlocked ? `${detail}, unlocked by hand` : detail };
}

/** The hand unlock (Diagnostics' title tapped 5 times), for this session. */
export function unlockPreview(): void {
  previewUnlocked = true;
}

/** The day test mode pretends it is, or null when it is off. */
export function previewing(): number | null {
  return previewDay;
}

/**
 * Turn the owner's test mode on (pretend it is `day`, on its own throwaway save) or off (null).
 * Takes effect at once (the save key and the clock switch together). In test mode the past nights
 * are still read from the real tallies (it is the real creature), but nothing is written to them:
 * votes and rubble stay on this device, the rampage's community numbers are made up, and no
 * reminders or analytics are sent.
 */
export function setPreview(day: number | null): void {
  previewDay = day;
  devDayOverride = day ?? urlDayOverride;
}

/** Ask RUN to sign the player in (voting needs an account). */
export async function signIn(): Promise<boolean> {
  await ready();
  try {
    const res = await RundotGameAPI.accessGate.promptLogin();
    return !!res && (res as { success?: boolean }).success !== false;
  } catch (err) {
    warn('signIn', err);
    return false;
  }
}

export interface Diagnostics {
  mock: boolean;
  signedIn: string;
  user: string;
}

export function diagnostics(): Diagnostics {
  let signedIn = 'unknown';
  let user = 'unknown';
  try {
    signedIn = RundotGameAPI.accessGate.isAnonymous() ? 'no (guest)' : 'yes';
  } catch (err) {
    signedIn = `error: ${err instanceof Error ? err.message : String(err)}`;
  }
  try {
    const p = RundotGameAPI.getProfile();
    user = p?.username ? `${p.username}${p.isAnonymous ? ' (guest)' : ''}` : 'none';
  } catch (err) {
    user = `error: ${err instanceof Error ? err.message : String(err)}`;
  }
  return { mock: isMock(), signedIn, user };
}

export function isMock(): boolean {
  try {
    return RundotGameAPI.isMock();
  } catch {
    return false;
  }
}

/** Re-sync with the server clock. Players can't vote on tomorrow by changing their phone's date. */
export async function syncClock(): Promise<void> {
  try {
    const t = await RundotGameAPI.requestTimeAsync();
    if (t && Number.isFinite(t.serverTime)) clockOffsetMs = t.serverTime - Date.now();
  } catch (err) {
    warn('requestTime', err);
  }
}

/** Trusted "now" in epoch ms. */
export function now(): number {
  const real = Date.now() + clockOffsetMs;
  if (devDayOverride === null) return real;
  const intoDay = (((real - SEASON.startMs) % DAY_MS) + DAY_MS) % DAY_MS;
  return SEASON.startMs + devDayOverride * DAY_MS + intoDay;
}

// ---------------------------------------------------------------- saves

export async function loadSave(): Promise<string | null> {
  await ready();
  try {
    return await RundotGameAPI.appStorage.getItem(
      previewDay === null ? SAVE_KEY : PREVIEW_SAVE_KEY,
    );
  } catch (err) {
    warn('loadSave', err);
    return null;
  }
}

export async function writeSave(json: string): Promise<boolean> {
  await ready();
  try {
    await RundotGameAPI.appStorage.setItem(previewDay === null ? SAVE_KEY : PREVIEW_SAVE_KEY, json);
    return true;
  } catch (err) {
    warn('writeSave', err);
    return false;
  }
}

// ---------------------------------------------------------------- votes

function voteType(season: string, day: number, optionId: string): string {
  return `v_${season}_d${day}_${optionId}`;
}

type DevVotes = Record<string, Record<string, number>>;

async function readDevVotes(): Promise<DevVotes> {
  try {
    const raw = await RundotGameAPI.appStorage.getItem(DEV_VOTES_KEY);
    return raw ? (JSON.parse(raw) as DevVotes) : {};
  } catch {
    return {};
  }
}

export type CastResult = { ok: true } | { ok: false; reason: 'login' | 'offline' | 'error' };

/** Record one vote in the shared tally. Callers must check the player has a vote left first. */
export async function castVote(season: string, day: number, optionId: string): Promise<CastResult> {
  await ready();
  if (fakeWrites()) {
    const all = await readDevVotes();
    const today = (all[String(day)] ??= {});
    today[optionId] = (today[optionId] ?? 0) + 1;
    try {
      await RundotGameAPI.appStorage.setItem(DEV_VOTES_KEY, JSON.stringify(all));
    } catch (err) {
      warn('dev vote', err);
      return { ok: false, reason: 'error' };
    }
    return { ok: true };
  }
  try {
    await RundotGameAPI.ugc.create({
      contentType: voteType(season, day, optionId),
      data: { season, day, option: optionId },
      title: 'vote',
    });
    return { ok: true };
  } catch (err) {
    warn('castVote', err);
    // ugc.create is login-gated: guests get RUN's sign-in prompt, and cancelling it lands here.
    const e = err as { name?: string; action?: string; code?: string };
    if (
      e.name === 'AccessDeniedError' ||
      e.action === 'prompt_login' ||
      e.code === 'PROFILE_REQUIRED'
    ) {
      return { ok: false, reason: 'login' };
    }
    const offline = typeof navigator !== 'undefined' && navigator.onLine === false;
    return { ok: false, reason: offline ? 'offline' : 'error' };
  }
}

/** Shared vote counts for one day, in option order. Null if any count could not be read. */
export async function fetchCounts(
  season: string,
  day: number,
  optionIds: readonly string[],
): Promise<number[] | null> {
  await ready();
  if (sandboxed()) {
    const crowd = simulatedCrowd(`${season}:${day}`, optionIds.length);
    const mine = (await readDevVotes())[String(day)] ?? {};
    return optionIds.map((id, i) => crowd[i]! + (mine[id] ?? 0));
  }
  try {
    const results = await Promise.all(
      optionIds.map((id) =>
        withRetry(() => RundotGameAPI.ugc.count({ contentType: voteType(season, day, id) })),
      ),
    );
    return results.map((r) => (r && Number.isFinite(r.count) ? r.count : 0));
  } catch (err) {
    warn('fetchCounts', err);
    return null;
  }
}

// ---------------------------------------------------------------- the rampage's rubble

function rubbleType(season: string, day: number, band: number): string {
  return `r_${season}_d${day}_b${band}`;
}

/** A guest (not signed in). Their runs only count once they sign in. */
export function isGuest(): boolean {
  if (fakeWrites()) return false;
  try {
    return RundotGameAPI.accessGate.isAnonymous();
  } catch {
    return true;
  }
}

export type RubbleResult = 'counted' | 'guest' | 'failed';

/**
 * Add one run to the community's rubble for a rampage day, filed under its band (the shared tally
 * can only count entries). Guests are not asked to sign in here, after every run: they choose to.
 */
export async function recordRubble(
  season: string,
  day: number,
  band: number,
): Promise<RubbleResult> {
  await ready();
  if (fakeWrites()) {
    try {
      const raw = await RundotGameAPI.appStorage.getItem(DEV_RUBBLE_KEY);
      const all = raw ? (JSON.parse(raw) as Record<string, number[]>) : {};
      const today = (all[String(day)] ??= []);
      today[band] = (today[band] ?? 0) + 1;
      await RundotGameAPI.appStorage.setItem(DEV_RUBBLE_KEY, JSON.stringify(all));
      return 'counted';
    } catch (err) {
      warn('dev rubble', err);
      return 'failed';
    }
  }
  if (isGuest()) return 'guest';
  try {
    await RundotGameAPI.ugc.create({
      contentType: rubbleType(season, day, band),
      data: { season, day, band },
      title: 'rampage',
    });
    return 'counted';
  } catch (err) {
    warn('recordRubble', err);
    return 'failed';
  }
}

/** Runs per rubble band for one rampage day, from everyone. Null if a count could not be read. */
export async function fetchRubble(
  season: string,
  day: number,
  bands: number,
): Promise<number[] | null> {
  await ready();
  if (fakeWrites()) {
    const crowd = simulatedRubble(`${season}:${day}`, bands);
    try {
      const raw = await RundotGameAPI.appStorage.getItem(DEV_RUBBLE_KEY);
      const mine = (raw ? (JSON.parse(raw) as Record<string, number[]>) : {})[String(day)] ?? [];
      return crowd.map((n, b) => n + (mine[b] ?? 0));
    } catch {
      return crowd;
    }
  }
  try {
    const results = await Promise.all(
      Array.from({ length: bands }, (_, b) =>
        withRetry(() => RundotGameAPI.ugc.count({ contentType: rubbleType(season, day, b) })),
      ),
    );
    return results.map((r) => (r && Number.isFinite(r.count) ? r.count : 0));
  } catch (err) {
    warn('fetchRubble', err);
    return null;
  }
}

async function withRetry<T>(fn: () => Promise<T>, attempts = 3): Promise<T> {
  let lastErr: unknown;
  for (let i = 0; i < attempts; i++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      const e = err as { code?: string; retryAfterMs?: number };
      if (e.code !== 'RATE_LIMITED' && i > 0) break;
      await new Promise((r) => setTimeout(r, Math.max(1000, e.retryAfterMs ?? 1000 * (i + 1))));
    }
  }
  throw lastErr;
}

// ---------------------------------------------------------------- ads

export async function rewardedAdReady(): Promise<boolean> {
  await ready();
  try {
    return await RundotGameAPI.ads.isRewardedAdReadyAsync();
  } catch (err) {
    warn('adReady', err);
    return false;
  }
}

/** Shows a rewarded ad. Resolves true ONLY when the SDK reports the reward was earned. */
export async function showRewardedAd(): Promise<boolean> {
  await ready();
  try {
    const earned = await RundotGameAPI.ads.showRewardedAdAsync({
      adDisplayId: 'extra_vote',
      adDisplayName: 'Extra Vote',
    });
    return earned === true;
  } catch (err) {
    warn('showRewardedAd', err);
    return false;
  }
}

// ---------------------------------------------------------------- assets

/** Where the theme came from, for the diagnostics panel. */
export interface ThemeSource {
  url: string;
  from: 'cdn' | 'cdn-url' | 'same-origin' | 'stream';
  bytes: number;
  type: string;
  /**
   * True when `url` is a remote URL played directly (last resort). It must not be
   * routed through Web Audio: a cross-origin stream without CORS would be silent.
   */
  direct: boolean;
}

/**
 * The main theme (public/cdn-assets/audio/theme.mp3 on RUN's CDN). Prefers a
 * same-origin blob URL, which Web Audio needs for the volume control on iOS:
 * 1. cdn.fetchAsset (the SDK's normal path)
 * 2. our own fetch of the resolved CDN URL
 * 3. the same-origin cdn-assets path (when the host also serves the build's copy)
 * 4. streaming the resolved CDN URL directly
 * Throws if none works; the reasons go to the diagnostics panel.
 */
export async function loadTheme(): Promise<ThemeSource> {
  await ready();
  const errors: string[] = [];
  const note = (step: string, err: unknown) => {
    errors.push(`${step}: ${err instanceof Error ? err.message : String(err)}`);
    warn(`loadTheme ${step}`, err);
  };
  const fromBlob = (blob: Blob, from: ThemeSource['from']): ThemeSource => {
    if (!blob || blob.size < 1024) throw new Error(`only ${blob?.size ?? 0} bytes`);
    const typed = blob.type.startsWith('audio/') ? blob : new Blob([blob], { type: 'audio/mpeg' });
    return {
      url: URL.createObjectURL(typed),
      from,
      bytes: blob.size,
      type: blob.type || '(none)',
      direct: false,
    };
  };
  const fetchBlob = async (url: string) => {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.blob();
  };

  try {
    return fromBlob(
      await RundotGameAPI.cdn.fetchAsset('audio/theme.mp3', { timeout: 60_000 }),
      'cdn',
    );
  } catch (err) {
    note('cdn', err);
  }
  let resolved: string | null = null;
  try {
    resolved = await RundotGameAPI.cdn.resolveAssetUrl('audio/theme.mp3');
    return fromBlob(await fetchBlob(resolved), 'cdn-url');
  } catch (err) {
    note('cdn-url', err);
  }
  try {
    return fromBlob(
      await fetchBlob(`${import.meta.env.BASE_URL}cdn-assets/audio/theme.mp3`),
      'same-origin',
    );
  } catch (err) {
    note('same-origin', err);
  }
  if (resolved)
    return { url: resolved, from: 'stream', bytes: 0, type: '(streamed)', direct: true };
  throw new Error(errors.join(' | '));
}

// ---------------------------------------------------------------- reminders

/** Marks our local notifications (a payload key the host passes through), so we can find them again. */
const REMINDER_TAG = 'itsAliveReminder';

/**
 * Replace this player's pending reminders with `plan` (on run.world they land in the bell
 * inbox). Our earlier ones are cancelled first, and each night keeps a stable id, so
 * arming again (every Continue, Sketchbook or vote) never stacks duplicates.
 */
export function setReminders(plan: readonly Reminder[]): void {
  if (fakeWrites()) return;
  void ready().then(async () => {
    const n = RundotGameAPI.notifications;
    try {
      const pending = await n.getAllScheduledLocalNotifications().catch(() => []);
      for (const p of pending ?? []) {
        if (p?.payload && REMINDER_TAG in p.payload)
          await n.cancelNotification(p.id).catch(() => false);
      }
      for (const r of plan) {
        await n.submitMessageAsync({
          channels: ['local'],
          title: r.title,
          body: r.body,
          triggerAt: new Date(r.atMs).toISOString(),
          notificationId: r.id,
          collapseKey: r.id,
          payload: { [REMINDER_TAG]: r.id },
        });
      }
    } catch (err) {
      warn('setReminders', err);
    }
  });
}

// ---------------------------------------------------------------- misc

/**
 * Copies text to the clipboard (RUN's sandbox allows it). The game cannot open an outside page:
 * the frame is sandboxed without allow-popups, so window.open and target="_blank" links are
 * blocked (preflight: sandbox-blocked-modals). Links are copied for the player to paste instead.
 */
export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch (err) {
    warn('copyText', err);
    return false;
  }
}

export function track(event: string, payload?: Record<string, unknown>): void {
  if (previewDay !== null) return;
  void ready().then(() =>
    quiet(RundotGameAPI.analytics.recordCustomEvent(event, payload), `track ${event}`),
  );
}

export function funnel(step: number, name: string): void {
  if (previewDay !== null) return;
  void ready().then(() =>
    quiet(RundotGameAPI.analytics.trackFunnelStep(step, name, 'monster', 1), `funnel ${name}`),
  );
}

export function haptic(style: 'light' | 'medium' | 'heavy' | 'success' = 'light'): void {
  const map = {
    light: HapticFeedbackStyle.Light,
    medium: HapticFeedbackStyle.Medium,
    heavy: HapticFeedbackStyle.Heavy,
    success: HapticFeedbackStyle.Success,
  };
  void ready().then(() => quiet(RundotGameAPI.triggerHapticAsync(map[style]), 'haptic'));
}

export interface Insets {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

/** Host safe-area insets; read only after ready(). */
export function safeArea(): Insets {
  try {
    const s = RundotGameAPI.system.getSafeArea();
    return { top: s.top ?? 0, right: s.right ?? 0, bottom: s.bottom ?? 0, left: s.left ?? 0 };
  } catch {
    return { top: 0, right: 0, bottom: 0, left: 0 };
  }
}

/** Subscribes to host lifecycle events. Returns an unsubscribe function. */
export function onLifecycle(handlers: {
  onResume?: () => void;
  onPause?: () => void;
  onSleep?: () => void;
  onAwake?: () => void;
}): () => void {
  const subs: Array<{ unsubscribe: () => void }> = [];
  let cancelled = false;
  void ready().then(() => {
    if (cancelled) return;
    try {
      const l = RundotGameAPI.lifecycles;
      if (handlers.onResume) subs.push(l.onResume(handlers.onResume));
      if (handlers.onPause) subs.push(l.onPause(handlers.onPause));
      if (handlers.onSleep) subs.push(l.onSleep(handlers.onSleep));
      if (handlers.onAwake) subs.push(l.onAwake(handlers.onAwake));
    } catch (err) {
      warn('lifecycles', err);
    }
  });
  return () => {
    cancelled = true;
    for (const s of subs) {
      try {
        s.unsubscribe();
      } catch (err) {
        warn('lifecycles unsubscribe', err);
      }
    }
  };
}

// ---------------------------------------------------------------- live battles

/** A live battle room, as the game uses it (RUN's realtime room underneath). */
export interface BattleLink {
  readonly playerId: string;
  send(message: BattleProtocol): void;
  on(handlers: {
    onMessage?: (message: BattleProtocol) => void;
    onDisconnect?: () => void;
    onError?: (error: string) => void;
  }): void;
  leave(): void;
}

export type BattleJoin = { ok: true; link: BattleLink } | { ok: false; reason: string };

const JOIN_TIMEOUT_MS = 12_000;

/**
 * Join an open battle, or start one (RUN's matchmaking). Live rooms need a signed-in player: RUN
 * prompts a guest to sign in. Any failure (no sign-in, offline, the service down) comes back as a
 * reason, and the game offers an offline battle against bots instead.
 */
export async function joinBattle(): Promise<BattleJoin> {
  try {
    await ready();
    const room = await Promise.race([
      RundotGameAPI.realtime.joinOrCreateRoom<BattleProtocol>(ROOM_TYPE),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('timed out')), JOIN_TIMEOUT_MS),
      ),
    ]);
    const link: BattleLink = {
      playerId: room.playerId,
      send: (message) => {
        try {
          room.send(message);
        } catch (err) {
          warn('battle send', err);
        }
      },
      // Messages to everyone and to this player alone (the match details) arrive the same way.
      on: (handlers) =>
        room.on({
          onMessage: handlers.onMessage,
          onPrivateMessage: handlers.onMessage,
          onDisconnect: handlers.onDisconnect,
          onError: handlers.onError,
        }),
      leave: () => {
        try {
          room.leave();
        } catch (err) {
          warn('battle leave', err);
        }
      },
    };
    return { ok: true, link };
  } catch (err) {
    warn('joinBattle', err);
    return { ok: false, reason: err instanceof Error ? err.message : String(err) };
  }
}

/** The signed-in player's display name (for their name tag in a battle). */
export function playerName(): string {
  try {
    return RundotGameAPI.getProfile()?.username || 'You';
  } catch {
    return 'You';
  }
}
