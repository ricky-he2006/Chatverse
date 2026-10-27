import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from 'react';
import {
  Activity,
  ArrowDown,
  ArrowRight,
  ArrowUpRight,
  Bell,
  BookOpen,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Circle,
  CircleHelp,
  Compass,
  Copy,
  Crown,
  ExternalLink,
  Eye,
  Flag,
  FlaskConical,
  Gem,
  Home,
  KeyRound,
  LayoutDashboard,
  LoaderCircle,
  Map,
  Menu,
  MessageSquare,
  Monitor,
  Moon,
  MoreHorizontal,
  Pause,
  Play,
  Plus,
  Radio,
  RefreshCw,
  Search,
  Settings as SettingsIcon,
  Shield,
  ShieldCheck,
  ShoppingBag,
  Sparkles,
  Sun,
  Swords,
  Trophy,
  Users,
  Volume2,
  VolumeX,
  WandSparkles,
  Wifi,
  WifiOff,
  X,
  Zap,
} from 'lucide-react';
import type {
  Character,
  Chapter,
  Election,
  Faction,
  Mode,
  Settings,
  WorldEvent,
  WorldSnapshot,
} from '../shared/types';
import { CLASSES, FACTIONS, ITEMS, SCENARIOS, TACTICS } from '../shared/catalog';
import { ApiError, mutate, request, realmRequest, realmUrl, setCsrf } from './api';
import { realmIdentity, REALMS } from '../shared/realms';
import { WorldAtlas } from './WorldAtlas';
import { Crest, Landscape, RealmArtwork, WorldMap } from './WorldMap';
import { SUPPORTER_RANKS, type SupporterTier } from '../shared/supporters';
import {
  ago,
  Avatar,
  Button,
  ClassIcon,
  countdown,
  date,
  Empty,
  FactionTag,
  Gold,
  LinkButton,
  num,
  Panel,
  PanelTitle,
  Progress,
  StatIcon,
  SupporterBadge,
  Tag,
  time,
} from './ui';

type Screen =
  | 'overview'
  | 'atlas'
  | 'world'
  | 'kingdoms'
  | 'citizens'
  | 'character'
  | 'battles'
  | 'leaderboard'
  | 'chronicle'
  | 'steward'
  | 'settings';
const navigation: { id: Screen; label: string; icon: typeof Home }[] = [
  { id: 'overview', label: 'Overview', icon: LayoutDashboard },
  { id: 'atlas', label: 'World atlas', icon: Compass },
  { id: 'world', label: 'Realm map', icon: Map },
  { id: 'kingdoms', label: 'Kingdoms', icon: Crown },
  { id: 'citizens', label: 'Citizens', icon: Users },
  { id: 'character', label: 'Character & gear', icon: Shield },
  { id: 'battles', label: 'Battles', icon: Swords },
  { id: 'leaderboard', label: 'Leaderboard', icon: Trophy },
  { id: 'chronicle', label: 'Chronicle', icon: BookOpen },
  { id: 'steward', label: 'AI Steward', icon: Sparkles },
  { id: 'settings', label: 'Settings', icon: SettingsIcon },
];
type ModalState = {
  kind:
    | 'chapter'
    | 'announcement'
    | 'join'
    | 'class'
    | 'scenario'
    | 'upgrade'
    | 'buy'
    | 'dismiss'
    | 'help';
  item?: string;
  faction?: Faction;
} | null;
type Context = {
  s: WorldSnapshot;
  openRealm: (id: string) => void;
  hero: Character | null;
  now: number;
  busy: boolean;
  persona: string;
  setPersona: (id: string) => void;
  go: (screen: Screen) => void;
  setModal: (m: ModalState) => void;
  run: <T>(fn: () => Promise<T>, success?: string) => Promise<T | undefined>;
  action: (path: string, body?: unknown, method?: string) => Promise<any>;
  command: (type: string, argument?: string) => Promise<any>;
  notify: (text: string) => void;
  selectedFaction: Faction;
  setFaction: (f: Faction) => void;
  selectedTerritory: string;
  setTerritory: (id: string) => void;
  selectedBattle: string | null;
  setBattle: (id: string) => void;
};
const savedRealm = (value: string | null) => (REALMS.some((r) => r.id === value) ? value! : 'home');

export function App() {
  const initial = new URLSearchParams(location.search);
  const [mode, setMode] = useState<Mode>(initial.get('mode') === 'live' ? 'live' : 'simulation');
  const [realm, setRealm] = useState(() =>
    initial.get('mode') === 'live'
      ? 'home'
      : savedRealm(initial.get('realm') ?? localStorage.getItem('cv:simulation:realm')),
  );
  const [screen, setScreen] = useState<Screen>(
    navigation.some((n) => n.id === initial.get('screen'))
      ? (initial.get('screen') as Screen)
      : 'overview',
  );
  const [unlocked, setUnlocked] = useState<boolean | null>(null),
    [unlockCode, setUnlockCode] = useState(''),
    [loginError, setLoginError] = useState('');
  const [snapshot, setSnapshot] = useState<WorldSnapshot | null>(null),
    [hero, setHero] = useState<Character | null>(null),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false);
  const [persona, setPersonaValue] = useState(
    () =>
      localStorage.getItem(`cv:${mode}:${realm}:persona`) ??
      (realm === 'home' ? localStorage.getItem(`cv:${mode}:persona`) : null) ??
      (mode === 'simulation' ? 'sim-0001' : 'none'),
  );
  const [selectedFaction, setFaction] = useState<Faction>('north'),
    [selectedBattle, setBattle] = useState<string | null>(null);
  const [selectedTerritory, setTerritory] = useState('crossroads');
  const [modal, setModal] = useState<ModalState>(null),
    [toast, setToast] = useState(''),
    [mobileNav, setMobileNav] = useState(false),
    [tick, setTick] = useState(Date.now()),
    [online, setOnline] = useState(true);
  const activeRealm = useRef(realm);
  const activeMode = useRef(mode),
    loadRef = useRef<() => Promise<void>>(async () => {}),
    toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const notify = (text: string) => {
    setToast(text);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(''), 5000);
  };
  useEffect(() => {
    if (mode === 'simulation') localStorage.setItem('cv:simulation:realm', realm);
  }, [mode, realm]);
  useEffect(() => {
    request('/api/session')
      .then((data) => {
        setUnlocked(data.authenticated);
        setCsrf(data.csrf ?? '');
      })
      .catch(() => {
        setUnlocked(false);
        setLoginError('Start the ChatVerse server, then reload this page.');
      });
  }, []);
  const setPersona = useCallback((id: string) => {
    localStorage.setItem(`cv:${activeMode.current}:${activeRealm.current}:persona`, id);
    setPersonaValue(id);
  }, []);
  const loadVersion = useRef(0);
  const load = useCallback(async () => {
    const requestedMode = mode;
    const requestedRealm = realm;
    const requestVersion = ++loadVersion.current;
    try {
      const data = await realmRequest<WorldSnapshot>(
        `/api/${mode}/snapshot?persona=${encodeURIComponent(persona)}`,
        realm,
      );
      if (
        activeMode.current !== requestedMode ||
        activeRealm.current !== requestedRealm ||
        requestVersion !== loadVersion.current
      )
        return;
      if ((data.realmId ?? 'home') !== realm)
        throw new Error(
          'This server cannot open that realm. Restart ChatVerse to load multi-realm support.',
        );
      setSnapshot(data);
      setError('');
    } catch (err) {
      if (
        activeMode.current === requestedMode &&
        activeRealm.current === requestedRealm &&
        requestVersion === loadVersion.current
      ) {
        setError((err as Error).message);
        if (err instanceof ApiError && err.status === 401) setUnlocked(false);
      }
    }
  }, [mode, realm, persona]);
  loadRef.current = load;
  useEffect(() => {
    if (!unlocked) return;
    activeMode.current = mode;
    activeRealm.current = realm;
    setSnapshot(null);
    setHero(null);
    setError('');
    void load();
    const events = new EventSource(realmUrl(`/api/${mode}/events`, realm));
    let pending: ReturnType<typeof setTimeout> | null = null;
    events.onopen = () => setOnline(true);
    events.onerror = () => setOnline(false);
    events.addEventListener('invalidate', () => {
      if (pending) clearTimeout(pending);
      pending = setTimeout(() => void loadRef.current(), 120);
    });
    const timer = setInterval(() => void loadRef.current(), 15000);
    return () => {
      events.close();
      clearInterval(timer);
      if (pending) clearTimeout(pending);
    };
  }, [mode, realm, unlocked]);
  useEffect(() => {
    if (unlocked) void load();
  }, [persona, load, unlocked]);
  useEffect(() => {
    const timer = setInterval(() => setTick(Date.now()), 1000);
    return () => {
      clearInterval(timer);
      if (toastTimer.current) clearTimeout(toastTimer.current);
    };
  }, []);
  useEffect(() => {
    if (!unlocked || !snapshot) return;
    if (!snapshot.citizens || persona === 'none') {
      setHero(null);
      return;
    }
    let cancelled = false;
    const id = persona;
    realmRequest<Character>(`/api/${mode}/characters/${encodeURIComponent(id)}`, realm)
      .then((c) => {
        if (!cancelled) setHero(c);
      })
      .catch(() => {
        if (!cancelled) setHero(null);
      });
    return () => {
      cancelled = true;
    };
  }, [mode, realm, persona, snapshot, unlocked]);
  const go = (next: Screen) => {
    setScreen(next);
    setMobileNav(false);
    const q = new URLSearchParams({ mode, realm, screen: next });
    history.replaceState(null, '', `/?${q}`);
    window.scrollTo({ top: 0, behavior: 'instant' });
  };
  const changeMode = (next: Mode) => {
    if (next === mode || busy) return;
    const nextRealm =
      next === 'live' ? 'home' : savedRealm(localStorage.getItem('cv:simulation:realm'));
    activeRealm.current = nextRealm;
    setRealm(nextRealm);
    loadVersion.current++;
    activeMode.current = next;
    setSnapshot(null);
    setHero(null);
    setModal(null);
    setPersonaValue(
      localStorage.getItem(`cv:${next}:${nextRealm}:persona`) ??
        (nextRealm === 'home' ? localStorage.getItem(`cv:${next}:persona`) : null) ??
        (next === 'simulation' ? 'sim-0001' : 'none'),
    );
    setMode(next);
    setBattle(null);
    setTerritory('crossroads');
    history.replaceState(null, '', `/?mode=${next}&realm=${nextRealm}&screen=${screen}`);
  };
  const openRealm = (id: string) => {
    if (busy || !REALMS.some((r) => r.id === id) || (mode === 'live' && id !== 'home')) return;
    if (id === realm) {
      go('world');
      return;
    }
    activeRealm.current = id;
    loadVersion.current++;
    setRealm(id);
    setSnapshot(null);
    setHero(null);
    setModal(null);
    setBattle(null);
    setTerritory('crossroads');
    setFaction('north');
    setScreen('world');
    if (mode === 'simulation') localStorage.setItem('cv:simulation:realm', id);
    setPersonaValue(
      localStorage.getItem(`cv:${mode}:${id}:persona`) ??
        (id === 'home' ? localStorage.getItem(`cv:${mode}:persona`) : null) ??
        (mode === 'simulation' ? 'sim-0001' : 'none'),
    );
    history.replaceState(null, '', `/?mode=${mode}&realm=${id}&screen=world`);
    window.scrollTo({ top: 0, behavior: 'instant' });
  };
  const run = async <T,>(fn: () => Promise<T>, success?: string): Promise<T | undefined> => {
    setBusy(true);
    try {
      const result = await fn();
      await loadRef.current();
      if (success) notify(success);
      return result;
    } catch (err) {
      notify((err as Error).message);
      return undefined;
    } finally {
      setBusy(false);
    }
  };
  const action = (path: string, body: unknown = {}, method = 'POST') =>
    mutate(mode, path, body, method, realm);
  const command = async (type: string, argument?: string) => {
    const requestedMode = mode,
      requestedRealm = realm;
    const result = await run(() => action('commands', { type, argument, persona }));
    if (activeMode.current !== requestedMode || activeRealm.current !== requestedRealm)
      return result;
    if (result?.message) notify(result.message);
    if (result?.characterId && result.characterId !== persona) setPersona(result.characterId);
    return result;
  };
  const now = snapshot ? snapshot.now + (tick - Date.now()) : tick;
  // Clock is synchronized on each snapshot; wall-clock ticking stays separate from server authority.
  const receivedAt = useRef(Date.now());
  useEffect(() => {
    receivedAt.current = Date.now();
  }, [snapshot]);
  const serverNow = snapshot ? snapshot.now + Math.max(0, tick - receivedAt.current) : now;
  if (unlocked === null)
    return (
      <div className="loading-screen">
        <Crown />
        <span>Opening the gates…</span>
      </div>
    );
  if (!unlocked)
    return (
      <main className="unlock-screen">
        <Landscape />
        <div className="unlock-brand">
          <Crown size={26} />
          <span>ChatVerse</span>
        </div>
        <form
          className="unlock-card"
          onSubmit={async (e) => {
            e.preventDefault();
            setBusy(true);
            try {
              const result = await request('/api/session', {
                method: 'POST',
                body: JSON.stringify({ code: unlockCode }),
              });
              setCsrf(result.csrf);
              setUnlocked(true);
            } catch (err) {
              setLoginError((err as Error).message);
            } finally {
              setBusy(false);
            }
          }}
        >
          <span className="eyebrow">
            <KeyRound size={13} /> YOUR REALM AWAITS
          </span>
          <h1>Welcome, worldbuilder.</h1>
          <p>
            A living kingdom for your community.
            <br />
            Unlock your local dashboard to begin.
          </p>
          <label htmlFor="unlock">Local access code</label>
          <input
            id="unlock"
            autoComplete="off"
            autoFocus
            value={unlockCode}
            onChange={(e) => setUnlockCode(e.target.value)}
            placeholder="Code from your server terminal"
            required
          />
          {loginError && (
            <p className="form-error" role="alert">
              {loginError}
            </p>
          )}
          <Button variant="primary" disabled={busy}>
            {busy ? <LoaderCircle className="spin" size={16} /> : <ArrowRight size={16} />}Enter the
            realm
          </Button>
          <small>
            This code is printed when you run ChatVerse.
            <br />
            Your data stays on this computer.
          </small>
        </form>
        <footer className="unlock-footer">
          CHATVERSE <span>YOUR STREAM. THEIR KINGDOM.</span>
        </footer>
      </main>
    );
  const ctx: Context | null = snapshot
    ? {
        s: snapshot,
        openRealm,
        hero,
        now: serverNow,
        busy,
        persona,
        setPersona,
        go,
        setModal,
        run,
        action,
        command,
        notify,
        selectedFaction,
        setFaction,
        selectedTerritory,
        setTerritory,
        selectedBattle,
        setBattle,
      }
    : null;
  return (
    <div
      className={`app-shell realm-theme-${realmIdentity(realm).theme} ${mobileNav ? 'nav-open' : ''}`}
      style={{ '--realm-accent': realmIdentity(realm).color } as CSSProperties}
    >
      {mobileNav && (
        <button
          className="nav-backdrop"
          aria-label="Close navigation"
          onClick={() => setMobileNav(false)}
        />
      )}
      <aside className="sidebar" id="primary-navigation">
        <a
          className="brand"
          aria-label="ChatVerse overview"
          href={`/?mode=${mode}&realm=${realm}&screen=overview`}
          onClick={(e) => {
            e.preventDefault();
            go('overview');
          }}
        >
          <div className="brand-mark">
            <Crown size={24} />
          </div>
          <span>
            ChatVerse<small>THE COMMUNITY CAMPAIGN</small>
          </span>
        </a>
        <div className="realm-label">YOUR WORLD</div>
        <button
          className="realm-selector"
          onClick={() => go('atlas')}
          aria-label="Choose a streamer realm"
        >
          <div className="realm-icon">
            <Compass size={21} />
          </div>
          <span>
            {snapshot?.realm ?? 'Your realm'}
            <small>
              {mode === 'simulation'
                ? realmIdentity(realm).streamer + ' · Simulation'
                : 'Twitch Live realm'}
            </small>
          </span>
          <ChevronDown size={14} />
        </button>
        <div className="nav-label">CAMPAIGN</div>
        <nav aria-label="Main navigation">
          {navigation.map((n, i) => (
            <div key={n.id}>
              {n.id === 'steward' && <div className="nav-label manage-label">WORLD MANAGEMENT</div>}
              <button
                aria-label={n.label}
                title={n.label}
                className={screen === n.id ? 'active' : ''}
                onClick={() => go(n.id)}
                aria-current={screen === n.id ? 'page' : undefined}
              >
                <n.icon size={18} />
                <span>{n.label}</span>
                {n.id === 'steward' && <span className="nav-ai">AI</span>}
                {n.id === 'battles' && snapshot?.chapter?.status === 'open' && (
                  <span className="nav-dot" />
                )}
              </button>
            </div>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="season-mini">
            <div>
              <Gem size={14} />
              <span>Season {snapshot?.season.number ?? 1}</span>
              <Tag>THE FIRST AGE</Tag>
            </div>
            <Progress
              value={snapshot ? Math.max(0, serverNow - snapshot.season.startsAt) : 0}
              max={7 * 86400000}
            />
            <small>{snapshot ? countdown(snapshot.season.endsAt, serverNow) : '—'} remaining</small>
          </div>
          <button className="help-link" onClick={() => setModal({ kind: 'help' })}>
            <CircleHelp size={17} /> A little guidance
            <ArrowUpRight size={14} />
          </button>
          <div className="local-status">
            <span className="status-dot" />
            Local-first · your world, saved
          </div>
        </div>
      </aside>
      <div className="workspace">
        <header className="topbar">
          <div className="breadcrumbs">
            <button
              className="mobile-menu"
              aria-label="Open navigation"
              aria-expanded={mobileNav}
              aria-controls="primary-navigation"
              onClick={() => setMobileNav(true)}
            >
              <Menu size={20} />
            </button>
            <Compass size={15} />
            <span>My realm</span>
            <ChevronRight size={13} />
            <strong>{navigation.find((n) => n.id === screen)?.label}</strong>
          </div>
          <div className="topbar-actions">
            <div className="mode-switch" aria-label="Environment">
              <button
                className={mode === 'simulation' ? 'chosen' : ''}
                onClick={() => changeMode('simulation')}
              >
                <FlaskConical size={13} />
                Simulation
              </button>
              <button
                className={mode === 'live' ? 'chosen live' : ''}
                onClick={() => changeMode('live')}
              >
                <Radio size={13} />
                Live
              </button>
            </div>
            <button
              className="icon-button top-notifications"
              aria-label="Open chronicle"
              onClick={() => go('chronicle')}
            >
              <Bell size={18} />
              <span />
            </button>
            <div className="operator-badge" title="Local worldbuilder">
              <Crown size={16} />
            </div>
          </div>
        </header>
        <main className="main-content">
          <div className={`environment-note ${mode}`}>
            <span>
              {mode === 'simulation' ? <FlaskConical size={13} /> : <Radio size={13} />}
              <strong>{mode === 'simulation' ? 'SIMULATION MODE' : 'TWITCH LIVE MODE'}</strong>
              <span className="environment-copy">
                {mode === 'simulation'
                  ? 'A fully interactive world with synthetic citizens. Make it your own.'
                  : snapshot?.integration.connected
                    ? `Connected to ${snapshot.integration.channel} · Real viewers. Real progress.`
                    : 'Connect your Twitch channel in Settings to welcome real citizens.'}
              </span>
            </span>
            <button
              onClick={() =>
                mode === 'simulation' ? setModal({ kind: 'scenario' }) : go('settings')
              }
            >
              {mode === 'simulation' ? 'Explore scenarios' : 'Connection settings'}
              <ArrowUpRight size={12} />
            </button>
          </div>
          {!online && (
            <div className="connection-alert">
              <WifiOff size={15} />
              Dashboard updates interrupted. Reconnecting to your saved world…
            </div>
          )}
          {error && (
            <div className="connection-alert error" role="alert">
              {error}
              <button onClick={() => void load()}>Try again</button>
            </div>
          )}
          {!ctx ? (
            <div className="page-loading">
              <LoaderCircle size={24} className="spin" />
              <p>Unfolding the atlas…</p>
            </div>
          ) : (
            <>
              {screen !== 'atlas' && <PageHeader ctx={ctx} screen={screen} />}
              {screen === 'overview' && <Overview ctx={ctx} />}
              {screen === 'atlas' && (
                <WorldAtlas
                  mode={mode}
                  realmId={realm}
                  openRealm={openRealm}
                  busy={busy}
                  now={ctx.s.now}
                />
              )}
              {screen === 'world' && <WorldScreen ctx={ctx} />}
              {screen === 'kingdoms' && <KingdomScreen ctx={ctx} />}
              {screen === 'citizens' && <CitizensScreen ctx={ctx} />}
              {screen === 'character' && <CharacterScreen ctx={ctx} />}
              {screen === 'battles' && <BattlesScreen ctx={ctx} />}
              {screen === 'leaderboard' && <LeaderboardScreen ctx={ctx} />}
              {screen === 'chronicle' && <ChronicleScreen ctx={ctx} />}
              {screen === 'steward' && <StewardScreen ctx={ctx} />}
              {screen === 'settings' && <SettingsScreen ctx={ctx} />}
              <footer className="page-footer">
                <span>
                  <Crown size={12} /> A world built by its people.
                </span>
                <span>
                  {mode === 'simulation'
                    ? 'All citizens and events are synthetic.'
                    : 'Live data stays in its own world.'}
                  <span className="footer-dot">·</span>ChatVerse v0.1
                </span>
              </footer>
            </>
          )}
        </main>
      </div>
      {toast && (
        <div className="toast" role="status">
          <CheckCircle2 size={18} />
          <span>{toast}</span>
          <button aria-label="Dismiss notification" onClick={() => setToast('')}>
            <X size={15} />
          </button>
        </div>
      )}
      {modal && ctx && <Modal ctx={ctx} modal={modal} close={() => setModal(null)} />}
    </div>
  );
}

function PageHeader({ ctx, screen }: { ctx: Context; screen: Screen }) {
  const titles: Record<Screen, [string, string]> = {
    overview: [
      'Your kingdom is alive.',
      'Every citizen has a story. Every stream writes a new chapter.',
    ],
    atlas: [
      'A world of communities.',
      'Discover streamer realms, then step inside their kingdoms.',
    ],
    world: [
      'A world worth fighting for.',
      'Three banners. New horizons. A realm that grows with its people.',
    ],
    kingdoms: [
      'Three banners. One realm.',
      'Find your people, raise your crest, and shape the council.',
    ],
    citizens: [
      'The people make the kingdom.',
      'Adventurers, allies, and the familiar names behind every story.',
    ],
    character: [
      'Your next chapter starts here.',
      'A little stronger. A little braver. A story all your own.',
    ],
    battles: [
      'Let the banners fly.',
      'A fair fight, a shared choice, and a consequence that lasts.',
    ],
    leaderboard: [
      'A place in the chronicles.',
      'Celebrate contribution. Every banner has a part to play.',
    ],
    chronicle: [
      'Nothing great is forgotten.',
      'The choices, victories, and people that shaped your world.',
    ],
    steward: [
      'A voice for your world.',
      'A little imagination. Always grounded in what really happened.',
    ],
    settings: ['Make the realm your own.', 'Your channel, your campaign, your pace.'],
  };
  return (
    <div className="page-heading">
      <div>
        <div className="page-eyebrow">
          {screen === 'overview'
            ? 'THE EVERFALL CAMPAIGN'
            : `CAMPAIGN / ${navigation.find((n) => n.id === screen)?.label.toUpperCase()}`}
        </div>
        <h1>{titles[screen][0]}</h1>
        <p>{titles[screen][1]}</p>
      </div>
      <div className="heading-actions">
        {screen === 'overview' ? (
          <>
            <Button
              onClick={() =>
                ctx.run(
                  () => ctx.action('settings', { quiet: !ctx.s.settings.quiet }, 'PATCH'),
                  ctx.s.settings.quiet
                    ? 'The realm is unmuted.'
                    : 'Quiet mode enabled. The campaign continues.',
                )
              }
              aria-label={ctx.s.settings.quiet ? 'Disable quiet mode' : 'Enable quiet mode'}
            >
              {ctx.s.settings.quiet ? <VolumeX size={15} /> : <Volume2 size={15} />}
              <span>{ctx.s.settings.quiet ? 'Quiet mode on' : 'Quiet mode'}</span>
            </Button>
            <Button variant="primary" onClick={() => ctx.setModal({ kind: 'chapter' })}>
              <Plus size={16} />
              Launch a chapter
            </Button>
          </>
        ) : screen === 'battles' ? (
          <Button variant="primary" onClick={() => ctx.setModal({ kind: 'chapter' })}>
            <Swords size={16} />
            New chapter
          </Button>
        ) : screen === 'character' && ctx.s.mode === 'simulation' ? (
          <Button onClick={() => ctx.setModal({ kind: 'join' })}>
            <Plus size={15} />
            New adventurer
          </Button>
        ) : (
          <span className="header-season">
            <Gem size={15} />
            Season {ctx.s.season.number}
            <span>·</span>The First Age
          </span>
        )}
      </div>
    </div>
  );
}

function Overview({ ctx }: { ctx: Context }) {
  const s = ctx.s;
  const councilOpen = s.chapter?.status === 'open' || s.chapter?.status === 'paused';
  return (
    <>
      <section className="welcome-banner">
        <RealmArtwork />
        <div className="welcome-copy">
          <span className="eyebrow">
            <span className="tiny-line" />
            YOUR STREAM. THEIR KINGDOM.
          </span>
          <h2>
            Not just a chat.
            <br />A world of its own.
          </h2>
          <p>
            Rally your community. Let them choose their path.
            <br />
            You keep playing. The story keeps growing.
          </p>
          <div className="hero-actions">
            <button
              className="hero-primary"
              onClick={() => (councilOpen ? ctx.go('battles') : ctx.setModal({ kind: 'chapter' }))}
            >
              {councilOpen ? <Swords size={14} /> : <Flag size={14} />}{' '}
              {councilOpen ? 'Return to the council' : 'Write the next chapter'}
              <ArrowRight size={14} />
            </button>
            <button onClick={() => ctx.go('world')}>
              Explore the atlas <ArrowUpRight size={14} />
            </button>
          </div>
        </div>
        <div className="hero-caption">
          <Compass size={13} />
          <span>
            EVERFALL{' '}
            <small>
              SEASON {s.season.number} · {countdown(s.season.endsAt, ctx.now)} REMAINING
            </small>
          </span>
        </div>
      </section>
      <div className="stats-grid">
        {[
          {
            label: 'Citizens of the realm',
            value: num(s.citizens),
            icon: Users,
            note:
              s.mode === 'simulation'
                ? 'Clearly simulated adventurers'
                : 'Opted-in Twitch citizens',
            color: 'blue',
          },
          {
            label: 'Active citizens',
            value: num(s.active),
            icon: Activity,
            note: 'Participated in the last 15 minutes',
            color: 'green',
          },
          {
            label: 'Kingdoms standing',
            value: '03',
            icon: Crown,
            note: 'Different banners. A shared world.',
            color: 'gold',
          },
          {
            label: 'Contested territories',
            value: String(ctx.s.territories.filter((t) => !t.capital).length).padStart(2, '0'),
            icon: Flag,
            note: 'A new border. A new possibility.',
            color: 'purple',
          },
        ].map((st) => (
          <Panel className="stat-card" key={st.label}>
            <div>
              <span>{st.label}</span>
              <div className="stat-number">{st.value}</div>
              <small>{st.note}</small>
            </div>
            <div className={`stat-icon ${st.color}`}>
              <st.icon size={20} />
            </div>
          </Panel>
        ))}
      </div>
      <div className="overview-grid">
        <Panel className="realm-map-panel">
          <PanelTitle
            title="The world at a glance"
            eyebrow="YOUR LIVING ATLAS"
            action={<LinkButton onClick={() => ctx.go('world')}>Open world map</LinkButton>}
          />
          <div className="map-frame">
            <WorldMap
              realmName={ctx.s.realm}
              territories={s.territories}
              compact
              onSelect={(id) => {
                ctx.setTerritory(id);
                ctx.setFaction(s.territories.find((t) => t.id === id)!.owner);
                ctx.go('world');
              }}
            />
            <div className="map-legend">
              {s.kingdoms.map((k) => (
                <span key={k.id}>
                  <i style={{ background: k.color }} />
                  {k.name}
                </span>
              ))}
            </div>
          </div>
          <div className="map-summary">
            <span>
              <Flag size={14} />
              {ctx.s.territories.length} territories to call home
            </span>
            <span>
              <ShieldCheck size={14} />3 protected capitals
            </span>
            <button onClick={() => ctx.go('world')}>
              Discover the borders
              <ArrowUpRight size={13} />
            </button>
          </div>
        </Panel>
        <div className="overview-side">
          <ChapterCard ctx={ctx} />
          <Panel className="steward-note">
            <div className="steward-orb">
              <Sparkles size={19} />
            </div>
            <span className="eyebrow">A WORD FROM YOUR STEWARD</span>
            <p>
              “
              {s.events.find((e) => ['battle', 'election', 'realm'].includes(e.type))?.body ??
                'Every great realm begins with a single citizen. Shall we open the gates?'}
              ”
            </p>
            <div>
              <span className="status-dot" />
              <small>
                {s.settings.aiEnabled && s.steward.configured
                  ? 'AI + verified facts'
                  : 'Template narration · always available'}
              </small>
              <button aria-label="Open AI Steward" onClick={() => ctx.go('steward')}>
                <ArrowUpRight size={14} />
              </button>
            </div>
          </Panel>
        </div>
      </div>
      <CampaignDesk ctx={ctx} />
      <div className="section-heading">
        <div>
          <span className="eyebrow">THE PEOPLE BEHIND THE BANNERS</span>
          <h2>A home for every adventurer.</h2>
        </div>
        <LinkButton onClick={() => ctx.go('kingdoms')}>All kingdoms</LinkButton>
      </div>
      <div className="kingdom-grid">
        {s.kingdoms.map((k) => (
          <KingdomCard key={k.id} ctx={ctx} faction={k.id} />
        ))}
      </div>
      <div className="bottom-grid">
        <Panel>
          <PanelTitle
            title="The latest in your realm"
            eyebrow="A HISTORY IN THE MAKING"
            action={<LinkButton onClick={() => ctx.go('chronicle')}>Full chronicle</LinkButton>}
          />
          <EventList ctx={ctx} events={s.events.slice(0, 4)} />
        </Panel>
        <Panel className="quick-start-panel">
          <PanelTitle title="Adventure is a command away." eyebrow="MADE FOR YOUR CHAT" />
          <p>No extra tab. No second game. Your community can play along right where they are.</p>
          <div className="command-examples">
            <code>!join north</code>
            <span>Find your people</span>
            <code>!pledge</code>
            <span>Stand with your kingdom</span>
            <code>!vote defend</code>
            <span>Make your voice count</span>
            <code>!profile</code>
            <span>See how far you’ve come</span>
          </div>
          <button className="text-button" onClick={() => ctx.setModal({ kind: 'help' })}>
            The adventurer’s guide
            <ArrowUpRight size={14} />
          </button>
        </Panel>
      </div>
    </>
  );
}

function CampaignDesk({ ctx }: { ctx: Context }) {
  const active = ctx.s.chapter?.status === 'open' || ctx.s.chapter?.status === 'paused';
  const connected = ctx.s.mode === 'simulation' || ctx.s.integration.connected;
  const chapterTitle = active
    ? 'Your council is gathering.'
    : !connected
      ? 'Bring your real chat home.'
      : 'Give your chat its next adventure.';
  return (
    <section className="campaign-desk" aria-label="Your next moves">
      <div className="desk-intro">
        <span className="eyebrow">THE CAMPAIGN DESK</span>
        <h2>Where will today take you?</h2>
      </div>
      <div className="desk-actions">
        <button
          onClick={() =>
            !connected
              ? ctx.go('settings')
              : active
                ? ctx.go('battles')
                : ctx.setModal({ kind: 'chapter' })
          }
        >
          <div className="desk-icon">
            <Swords size={19} />
          </div>
          <span>
            <small>FOR THE STREAMER</small>
            <strong>{chapterTitle}</strong>
            <em>
              {!connected ? 'Connect Twitch' : active ? 'Open the council' : 'Launch a chapter'}
              <ArrowUpRight size={12} />
            </em>
          </span>
        </button>
        <button onClick={() => ctx.go(ctx.hero ? 'character' : 'citizens')}>
          <div className="desk-icon viewer">
            <Shield size={19} />
          </div>
          <span>
            <small>FOR YOUR CITIZENS</small>
            <strong>
              {ctx.hero
                ? `${ctx.hero.name.split(' ')[0]}’s story continues.`
                : 'A place for every adventurer.'}
            </strong>
            <em>
              {ctx.hero ? `Level ${ctx.hero.level} · ${ctx.hero.gold} gold` : 'Explore characters'}
              <ArrowUpRight size={12} />
            </em>
          </span>
        </button>
        <button onClick={() => ctx.go('chronicle')}>
          <div className="desk-icon chronicle">
            <BookOpen size={19} />
          </div>
          <span>
            <small>FOR THE CHRONICLE</small>
            <strong>{ctx.s.events[0]?.title ?? 'Your first page awaits.'}</strong>
            <em>
              Catch up on your realm
              <ArrowUpRight size={12} />
            </em>
          </span>
        </button>
      </div>
    </section>
  );
}

function ChapterCard({ ctx }: { ctx: Context }) {
  const ch = ctx.s.chapter;
  if (!ch || ch.status === 'cancelled')
    return (
      <Panel className="chapter-card">
        <PanelTitle
          title="The next chapter"
          eyebrow="WRITE IT TOGETHER"
          action={
            <Tag>
              <Circle size={7} />
              READY
            </Tag>
          }
        />
        <div className="chapter-empty-art">
          <Swords size={35} />
          <span />
        </div>
        <h3>Every banner needs a story.</h3>
        <p>Call a council, choose a border, and give your community something to rally around.</p>
        <Button className="full" onClick={() => ctx.setModal({ kind: 'chapter' })}>
          <Plus size={15} />
          Launch your first chapter
        </Button>
        <small className="chapter-footnote">Two clicks. Your chat takes it from here.</small>
      </Panel>
    );
  return (
    <Panel className="chapter-card">
      <PanelTitle
        title={ch.status === 'resolved' ? 'The latest chapter' : 'A chapter is unfolding'}
        eyebrow={ch.territory.replaceAll('-', ' ').toUpperCase()}
        action={
          <Tag color={ch.status === 'open' ? '#a5c7a7' : undefined}>
            {ch.status === 'open' ? <span className="status-dot" /> : null}
            {ch.status.toUpperCase()}
          </Tag>
        }
      />
      <div className="battle-matchup">
        <div>
          <Crest faction={ch.attacker} size={43} />
          <span>{ch.attacker}</span>
        </div>
        <Swords size={24} />
        <div>
          <Crest faction={ch.defender} size={43} />
          <span>{ch.defender}</span>
        </div>
      </div>
      {ch.result ? (
        <>
          <ScoreBar chapter={ch} />
          <p className="battle-caption">
            {ch.result.winner ? `${FACTIONS[ch.result.winner].name} prevails` : 'An honorable draw'}
          </p>
          <Button
            className="full"
            onClick={() => {
              ctx.setBattle(ch.id);
              ctx.go('battles');
            }}
          >
            <Play size={14} />
            Watch the chapter
          </Button>
        </>
      ) : (
        <>
          <div className="chapter-timer">
            <span>{ch.status === 'paused' ? 'Council paused' : 'Council closes in'}</span>
            <strong>
              {ch.status === 'paused'
                ? countdown(ctx.now + (ch.remaining ?? 0), ctx.now)
                : countdown(ch.deadline, ctx.now)}
            </strong>
          </div>
          <div className="pledge-summary">
            <span>{num(ch.pledged[ch.attacker] + ch.pledged[ch.defender])} citizens pledged</span>
            <span>Equal citizen ballots</span>
          </div>
          <div className="button-row">
            <Button
              className="grow"
              onClick={() => {
                ctx.setBattle(ch.id);
                ctx.go('battles');
              }}
            >
              View council
              <ArrowUpRight size={13} />
            </Button>
            <Button
              aria-label={ch.status === 'paused' ? 'Resume chapter' : 'Pause chapter'}
              onClick={() =>
                ctx.run(() =>
                  ctx.action(`chapters/${ch.id}/control`, {
                    action: ch.status === 'paused' ? 'resume' : 'pause',
                  }),
                )
              }
            >
              {ch.status === 'paused' ? <Play size={14} /> : <Pause size={14} />}
            </Button>
          </div>
        </>
      )}
    </Panel>
  );
}
function ScoreBar({ chapter }: { chapter: Chapter }) {
  const r = chapter.result!;
  if (r.maxHealthA && r.maxHealthB)
    return (
      <div className="fortress-bars">
        <FortressMeter faction={chapter.attacker} health={r.healthA!} max={r.maxHealthA} />
        <FortressMeter faction={chapter.defender} health={r.healthB!} max={r.maxHealthB} />
        <small>FORTRESS HEALTH · HIGHEST REMAINING PERCENTAGE WINS</small>
      </div>
    );
  return (
    <div className="battle-score">
      <div className="score-numbers">
        <span style={{ color: FACTIONS[chapter.attacker].color }}>{num(r.scoreA)}</span>
        <span style={{ color: FACTIONS[chapter.defender].color }}>{num(r.scoreB)}</span>
      </div>
      <div className="score-track">
        <div
          style={{
            width: `${(r.scoreA / (r.scoreA + r.scoreB)) * 100}%`,
            background: FACTIONS[chapter.attacker].color,
          }}
        />
        <div style={{ flex: 1, background: FACTIONS[chapter.defender].color }} />
      </div>
      <div className="score-label">CAMPAIGN SCORE · THREE SEEDED ROUNDS</div>
    </div>
  );
}
function FortressMeter({
  faction,
  health,
  max,
}: {
  faction: Faction;
  health: number;
  max: number;
}) {
  return (
    <div
      className="fortress-meter"
      style={{ '--settlement': FACTIONS[faction].color } as CSSProperties}
    >
      <span>
        {Math.round((health / max) * 100)}% fortress HP{' '}
        <b>
          {num(health)} / {num(max)}
        </b>
      </span>
      <progress max={max} value={health} aria-label={FACTIONS[faction].name + ' fortress health'} />
    </div>
  );
}
function KingdomCard({ ctx, faction }: { ctx: Context; faction: Faction }) {
  const k = ctx.s.kingdoms.find((k) => k.id === faction)!;
  return (
    <Panel className={`kingdom-card ${faction}`} style={{ '--faction': k.color } as CSSProperties}>
      <div className="kingdom-scene">
        <div className={`kingdom-artwork artwork-${faction}`} aria-hidden="true" />
        <div className="faction-stars" />
        <div className="kingdom-silhouette" />
        <Crest faction={faction} size={64} />
        <span className="kingdom-territory-count">
          <Flag size={11} />
          {k.territories} territories
        </span>
      </div>
      <div className="kingdom-card-content">
        <span className="eyebrow" style={{ color: k.color }}>
          {k.subtitle}
        </span>
        <h3>{k.name}</h3>
        <div className="kingdom-metrics">
          <span>
            <Users size={14} />
            {num(k.citizens)} citizens
          </span>
          <span>
            <Trophy size={14} />
            {k.points} pts
          </span>
        </div>
        <div className="kingdom-lord">
          <Crown size={15} />
          <span>
            Current Lord<strong>{k.lord ?? 'A seat awaits its citizen'}</strong>
          </span>
        </div>
        <Button
          className="full"
          onClick={() => {
            ctx.setFaction(faction);
            ctx.go('kingdoms');
          }}
        >
          Enter kingdom
          <ArrowRight size={14} />
        </Button>
      </div>
    </Panel>
  );
}
function EventList({ ctx, events }: { ctx: Context; events: WorldEvent[] }) {
  return events.length ? (
    <div className="event-list">
      {events.map((e) => (
        <div className="event-item" key={e.id}>
          <div className={`event-icon ${e.type}`}>
            {e.type === 'battle' ? (
              <Swords size={16} />
            ) : e.type === 'election' || e.type === 'council' ? (
              <Crown size={16} />
            ) : e.type === 'join' ? (
              <Users size={16} />
            ) : e.type === 'upgrade' ? (
              <Gem size={16} />
            ) : (
              <Sparkles size={16} />
            )}
          </div>
          <div>
            <strong>{e.title}</strong>
            <p>{e.body}</p>
            <span>
              {e.source === 'simulated' ? 'SIMULATED' : e.source.toUpperCase()}
              <i /> {ago(e.createdAt, ctx.now)}
            </span>
          </div>
        </div>
      ))}
    </div>
  ) : (
    <Empty
      title="The first page is still blank."
      body="Your community’s choices will be remembered here."
    />
  );
}

function WorldScreen({ ctx }: { ctx: Context }) {
  const selected = ctx.selectedTerritory,
    setSelected = ctx.setTerritory;
  const [list, setList] = useState(false),
    [zoom, setZoom] = useState(1);
  const t =
      ctx.s.territories.find((t) => t.id === selected) ??
      ctx.s.territories.find((t) => t.id === 'crossroads') ??
      ctx.s.territories[0],
    k = ctx.s.kingdoms.find((k) => k.id === t.owner)!;
  return (
    <div className="world-screen-grid">
      <div className="realm-map-banner">
        <div>
          <span className="eyebrow">
            {ctx.s.mode === 'simulation' ? 'SIMULATED STREAMER REALM' : 'YOUR CHANNEL REALM'}
          </span>
          <h2>{ctx.s.realm}</h2>
          <p>
            {ctx.s.mode === 'simulation' ? realmIdentity(ctx.s.realmId).streamer + ' · ' : ''}Three
            kingdoms. One community. Its own persistent history.
          </p>
        </div>
        <Button onClick={() => ctx.go('atlas')}>
          <Compass size={15} />
          Back to world atlas
        </Button>
      </div>
      <Panel className="full-map-panel">
        <PanelTitle
          title="Kingdoms and frontiers"
          action={
            <div className="button-row">
              <Button onClick={() => setList(!list)}>
                {list ? <Map size={14} /> : <Users size={14} />}{' '}
                {list ? 'Map view' : 'Territory list'}
              </Button>
              <Button
                onClick={() => setZoom((z) => (z === 1 ? 1.3 : 1))}
                aria-label="Toggle map zoom"
              >
                {zoom === 1 ? 'Zoom in' : 'Fit map'}
              </Button>
            </div>
          }
        />
        {list ? (
          <div className="territory-list">
            {ctx.s.territories.map((t) => (
              <button
                className={t.id === selected ? 'selected' : ''}
                key={t.id}
                onClick={() => setSelected(t.id)}
              >
                <Flag size={17} style={{ color: FACTIONS[t.owner].color }} />
                <span>
                  {t.name}
                  <small>{t.capital ? 'Protected capital' : 'Contested border'}</small>
                </span>
                <FactionTag faction={t.owner} />
                <ChevronRight size={15} />
              </button>
            ))}
          </div>
        ) : (
          <div className="map-zoom-container">
            <div style={{ width: `${zoom * 100}%` }}>
              <WorldMap
                realmName={ctx.s.realm}
                territories={ctx.s.territories}
                selected={selected}
                onSelect={setSelected}
              />
            </div>
          </div>
        )}
        <div className="map-summary">
          {ctx.s.kingdoms.map((k) => (
            <span key={k.id}>
              <i className="legend-dot" style={{ background: k.color }} />
              {k.name}
            </span>
          ))}
        </div>
      </Panel>
      <div className="world-growth-strip">
        <div>
          <span className="eyebrow">THE REALM GROWS WITH YOU</span>
          <h2>More citizens. New horizons.</h2>
          <p>
            At 25, 100, 250 and 500 citizens, each kingdom reveals a new outpost and earns +5%
            fortress health. Maximum +20%. Unlocked land stays discovered.
          </p>
        </div>
        {ctx.s.kingdoms.map((k) => (
          <div
            className="growth-kingdom"
            key={k.id}
            style={{ '--settlement': k.color } as CSSProperties}
          >
            <Crest faction={k.id} size={30} />
            <strong>{k.name}</strong>
            <span>
              {k.citizens} citizens · {k.growthLevel ?? 0}/4 outposts
            </span>
            <b>
              {num(k.fortressHealth ?? 1800)} fortress HP{' '}
              <small>+{(k.healthBonusBp ?? 0) / 100}%</small>
            </b>
            <progress
              aria-label={k.name + ' population toward next frontier'}
              max={k.nextExpansionAt ?? 500}
              value={Math.min(k.populationPeak ?? k.citizens, k.nextExpansionAt ?? 500)}
            />
            <small>
              {k.nextExpansionAt
                ? k.nextExpansionAt + ' citizens unlock the next frontier'
                : 'All frontiers discovered'}
            </small>
            {ctx.s.mode === 'simulation' && ctx.s.worldVersion === 2 && (
              <Button
                disabled={ctx.busy}
                onClick={() =>
                  ctx.run(
                    () =>
                      ctx.action('welcome', { kingdom: k.id, count: 25, key: crypto.randomUUID() }),
                    '25 simulated newcomers arrived.',
                  )
                }
              >
                <Users size={13} /> Welcome 25 simulated citizens
              </Button>
            )}
          </div>
        ))}
      </div>
      <div className="realm-challenges">
        <div className="challenge-heading">
          <span className="eyebrow">REALM-WIDE RACES</span>
          <h2>Make history together.</h2>
          <p>
            Shared across this channel realm. First to the finish claims the trophy. Only new
            actions count; rewards respect daily limits.
          </p>
        </div>
        {(ctx.s.challenges ?? []).map((r) => (
          <Panel key={r.id} className={'race-card ' + r.status}>
            <span className="eyebrow">
              {r.scope === 'kingdom' ? 'KINGDOM RACE' : 'CITIZEN RACE'} · {r.status}
            </span>
            <h3>{r.title}</h3>
            <p>{r.description}</p>
            {r.winner ? (
              <strong className="race-winner">♛ {r.winner}</strong>
            ) : (
              <small>
                {r.status === 'expired'
                  ? 'Race closed without a winner'
                  : Math.max(0, Math.ceil((r.expiresAt - ctx.s.now) / 3600000)) +
                    ' hours remaining'}
              </small>
            )}
            {(r.leaders.length
              ? r.leaders
              : [{ id: 'empty', name: 'The first chapter is yours', score: 0 }]
            ).map((l) => (
              <div className="race-leader" key={l.id}>
                <span>
                  {l.name}
                  <b>
                    {l.score}/{r.target}
                  </b>
                </span>
                <progress max={r.target} value={l.score} aria-label={r.title + ': ' + l.name} />
              </div>
            ))}
            <footer>
              Up to {r.xp} XP + {r.gold} gold{' '}
              {r.scope === 'kingdom' ? 'per winning contributor' : 'for the champion'}
              <small>Permanent first-place record · 24-hour race</small>
            </footer>
          </Panel>
        ))}
        {!ctx.s.worldVersion && (
          <p>Restart ChatVerse to enable persistent growth and realm challenges.</p>
        )}
      </div>
      <div className="world-inspector">
        <Panel>
          <span className="eyebrow">TERRITORY INSPECTOR</span>
          <div className="territory-crest">
            <Crest faction={t.owner} size={62} />
          </div>
          <h2>{t.name}</h2>
          <FactionTag faction={t.owner} />
          <p>
            {t.capital
              ? 'A protected home for its citizens. Capitals never change hands.'
              : 'A border where a community’s choice can change the map.'}
          </p>
          <dl className="detail-list">
            <div>
              <dt>Status</dt>
              <dd>
                {t.capital
                  ? 'Protected capital'
                  : t.contestedToday
                    ? 'Resting until tomorrow'
                    : 'Open border'}
              </dd>
            </div>
            <div>
              <dt>Owner</dt>
              <dd>{k.subtitle}</dd>
            </div>
            <div>
              <dt>Connected regions</dt>
              <dd>
                {t.neighbors.filter((id) => ctx.s.territories.some((t) => t.id === id)).length}
              </dd>
            </div>
          </dl>
          <span className="eyebrow">NEIGHBORING TERRITORIES</span>
          <div className="neighbor-list">
            {t.neighbors
              .filter((id) => ctx.s.territories.some((t) => t.id === id))
              .map((id) => (
                <button key={id} onClick={() => setSelected(id)}>
                  {ctx.s.territories.find((t) => t.id === id)!.name}
                  <ArrowUpRight size={12} />
                </button>
              ))}
          </div>
          {!t.capital && (
            <Button
              className="full"
              variant="primary"
              disabled={t.contestedToday}
              onClick={() => ctx.setModal({ kind: 'chapter' })}
            >
              <Swords size={15} />
              {t.contestedToday ? 'Border at rest' : 'Plan a chapter'}
            </Button>
          )}
        </Panel>
        <Panel className="rules-note">
          <ShieldCheck size={20} />
          <h3>A world with fair borders.</h3>
          <p>
            Only adjacent territories can be challenged. Your gear and character are always safe,
            whatever the outcome.
          </p>
        </Panel>
      </div>
    </div>
  );
}

function KingdomScreen({ ctx }: { ctx: Context }) {
  const k = ctx.s.kingdoms.find((k) => k.id === ctx.selectedFaction)!,
    election = ctx.s.elections.find((e) => e.kingdom === k.id && e.status !== 'closed');
  return (
    <>
      <div className="faction-tabs">
        {ctx.s.kingdoms.map((k) => (
          <button
            key={k.id}
            onClick={() => ctx.setFaction(k.id)}
            className={ctx.selectedFaction === k.id ? 'active' : ''}
            style={{ '--faction': k.color } as CSSProperties}
          >
            <Crest faction={k.id} size={24} />
            {k.name}
            <span>{num(k.citizens)}</span>
          </button>
        ))}
      </div>
      <div
        className={`kingdom-detail-banner ${k.id}`}
        style={{ '--faction': k.color } as CSSProperties}
      >
        <div className="kingdom-detail-emblem">
          <Crest faction={k.id} size={92} />
        </div>
        <div>
          <span className="eyebrow">{k.subtitle}</span>
          <h2>{k.name}</h2>
          <p>
            {k.id === 'north'
              ? 'Steadfast as the mountains. Bound by a promise to endure.'
              : k.id === 'east'
                ? 'Where the sun rises, the next great adventure follows.'
                : 'Under the western moon, quiet courage finds its way.'}
          </p>
        </div>
        <div className="kingdom-detail-numbers">
          <strong>
            {num(k.citizens)}
            <small>CITIZENS</small>
          </strong>
          <strong>
            {k.territories}
            <small>TERRITORIES</small>
          </strong>
          <strong>
            {k.points}
            <small>SEASON POINTS</small>
          </strong>
        </div>
      </div>
      <div className="two-column">
        <Panel>
          <PanelTitle
            title="The council of citizens"
            eyebrow="LEADERSHIP, EARNED TOGETHER"
            action={
              !election ? (
                <Button
                  onClick={() =>
                    ctx.run(
                      () => ctx.action('elections', { kingdom: k.id }),
                      'Nominations are now open.',
                    )
                  }
                >
                  <Plus size={14} />
                  Open election
                </Button>
              ) : (
                <Tag>{election.status.toUpperCase()}</Tag>
              )
            }
          />
          <div className="lord-profile">
            <div className="lord-crown">
              <Crown size={26} />
            </div>
            <div>
              <span className="eyebrow">YOUR CURRENT LORD</span>
              <h3>{k.lord ?? 'A seat waiting to be filled'}</h3>
              <p>A seven-day term. One voice among equals.</p>
            </div>
            {k.lord && (
              <button
                className="icon-button"
                title="Dismiss Lord with a public reason"
                onClick={() => ctx.setModal({ kind: 'dismiss', faction: k.id })}
              >
                <MoreHorizontal size={20} />
              </button>
            )}
          </div>
          {election ? (
            <ElectionPanel ctx={ctx} election={election} />
          ) : (
            <div className="council-explanation">
              <p>
                Citizens at level 2 or above can stand for Lord. The role brings recognition and a
                voice in the realm, never extra combat power.
              </p>
              <div>
                <Check size={14} />
                One equal ballot per eligible citizen
              </div>
              <div>
                <Check size={14} />
                Public quorum and deterministic tie rules
              </div>
              <div>
                <Check size={14} />
                No paid votes. No hidden advantages.
              </div>
            </div>
          )}
        </Panel>
        <Panel>
          <PanelTitle title="Lands beneath your banner" eyebrow="A PLACE TO CALL HOME" />
          <div className="kingdom-territories">
            {ctx.s.territories
              .filter((t) => t.owner === k.id)
              .map((t) => (
                <div key={t.id}>
                  <Flag size={18} style={{ color: k.color }} />
                  <span>
                    <strong>{t.name}</strong>
                    <small>{t.capital ? 'Protected capital' : 'Contested territory'}</small>
                  </span>
                  <Tag>{t.capital ? 'HOME' : 'BORDER'}</Tag>
                </div>
              ))}
          </div>
          <div className="join-kingdom-box">
            <h3>Your story could start here.</h3>
            <p>
              {ctx.s.mode === 'simulation'
                ? 'Try the viewer experience with a clearly simulated citizen.'
                : 'Join from your Twitch chat with the command below.'}
            </p>
            <code>!join {k.id}</code>
            {ctx.s.mode === 'simulation' && (
              <Button onClick={() => ctx.command('join', k.id)}>
                Join this kingdom
                <ArrowRight size={14} />
              </Button>
            )}
          </div>
        </Panel>
      </div>
      <Panel className="space-top">
        <PanelTitle
          title="A few familiar faces"
          action={<LinkButton onClick={() => ctx.go('citizens')}>Meet the citizens</LinkButton>}
        />
        <div className="mini-heroes">
          {ctx.s.heroes
            .filter((h) => h.kingdom === k.id)
            .map((h) => (
              <button
                key={h.id}
                onClick={() => {
                  ctx.setPersona(h.id);
                  ctx.go('character');
                }}
              >
                <Avatar character={h} small />
                <span>
                  <strong>{h.name}</strong>
                  <small>
                    Level {h.level} · {h.class}
                  </small>
                </span>
                <ChevronRight size={14} />
              </button>
            ))}
          {!ctx.s.heroes.some((h) => h.kingdom === k.id) && (
            <p className="muted">Browse all citizens to meet the people of this kingdom.</p>
          )}
        </div>
      </Panel>
    </>
  );
}
function ElectionPanel({ ctx, election: e }: { ctx: Context; election: Election }) {
  return (
    <div className="election-panel">
      <div className="chapter-timer">
        <span>{e.status === 'nominating' ? 'Nominations close in' : 'Ballots close in'}</span>
        <strong>
          {countdown(e.status === 'nominating' ? e.nominationEnd : e.deadline, ctx.now)}
        </strong>
      </div>
      <p>
        {e.eligible} eligible citizens · {e.quorum} ballots needed for quorum · {e.ballots} received
      </p>
      {e.candidates.map((c) => (
        <div className="candidate-row" key={c.id}>
          <Crown size={17} />
          <span>
            {c.name}
            <small>!elect {c.id.slice(-6)}</small>
          </span>
          {e.status === 'voting' && ctx.s.mode === 'simulation' && (
            <Button disabled={ctx.busy} onClick={() => ctx.command('elect', c.id)}>
              Vote
            </Button>
          )}
        </div>
      ))}
      {!e.candidates.length && (
        <p className="muted">No candidates yet. A citizen’s first step is to stand.</p>
      )}
      {e.status === 'nominating' && (
        <>
          <code>!nominate</code>
          {ctx.s.mode === 'simulation' && (
            <Button onClick={() => ctx.command('nominate')}>Stand for Lord</Button>
          )}
        </>
      )}
      <small>
        Ballots remain private until close. A tie is settled by membership seniority, then stable
        ID.
      </small>
    </div>
  );
}

function CitizensScreen({ ctx }: { ctx: Context }) {
  const [search, setSearch] = useState(''),
    [faction, setFaction] = useState(''),
    [page, setPage] = useState(0),
    [data, setData] = useState<{ items: Character[]; total: number; pages: number } | null>(null),
    [error, setError] = useState('');
  useEffect(() => {
    let active = true;
    const timer = setTimeout(
      () =>
        realmRequest(
          `/api/${ctx.s.mode}/characters?search=${encodeURIComponent(search)}&kingdom=${faction}&page=${page}`,
          ctx.s.realmId ?? 'home',
        )
          .then((result) => {
            if (active) {
              setData(result);
              setError('');
            }
          })
          .catch((err) => {
            if (active) setError(err.message);
          }),
      150,
    );
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [ctx.s.mode, ctx.s.generation, ctx.s.now, search, faction, page]);
  useEffect(() => {
    setData(null);
    setError('');
  }, [ctx.s.mode, ctx.s.generation, search, faction, page]);
  return (
    <Panel>
      <PanelTitle
        title="A fellowship of familiar faces"
        eyebrow={`${num(ctx.s.citizens)} CITIZENS · ${ctx.s.mode === 'simulation' ? 'ALL SYNTHETIC' : 'REAL TWITCH IDENTITIES'}`}
        action={
          ctx.s.mode === 'simulation' ? (
            <Button onClick={() => ctx.setModal({ kind: 'join' })}>
              <Plus size={14} />
              Create adventurer
            </Button>
          ) : undefined
        }
      />
      <div className="filter-bar">
        <div className="search-field">
          <Search size={16} />
          <input
            aria-label="Search citizens"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(0);
            }}
            placeholder="Find a familiar name…"
          />
        </div>
        <select
          aria-label="Filter by kingdom"
          value={faction}
          onChange={(e) => {
            setFaction(e.target.value);
            setPage(0);
          }}
        >
          <option value="">All kingdoms</option>
          {ctx.s.kingdoms.map((k) => (
            <option key={k.id} value={k.id}>
              {k.name}
            </option>
          ))}
        </select>
        <span>{data ? `${num(data.total)} citizens` : 'Finding citizens…'}</span>
      </div>
      {error ? (
        <Empty title="The census is unavailable" body={error} />
      ) : !data ? (
        <div className="page-loading">
          <LoaderCircle className="spin" />
        </div>
      ) : !data.items.length ? (
        <Empty
          icon={<Users size={30} />}
          title="No citizens found"
          body="Try another name, or welcome the realm’s first adventurer."
        />
      ) : (
        <>
          <div className="table-scroll">
            <table className="citizens-table">
              <thead>
                <tr>
                  <th>Citizen</th>
                  <th>Kingdom</th>
                  <th>Class / level</th>
                  <th>Contribution</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {data.items.map((c) => (
                  <tr key={c.id}>
                    <td>
                      <div className="table-identity">
                        <Avatar character={c} small />
                        <div>
                          <strong>{c.name}</strong>
                          <SupporterBadge character={c} />
                          <small>{c.synthetic ? 'SIMULATED CITIZEN' : 'TWITCH CITIZEN'}</small>
                        </div>
                      </div>
                    </td>
                    <td>
                      <FactionTag faction={c.kingdom} />
                    </td>
                    <td>
                      <span className="class-label">
                        <ClassIcon name={c.class} size={14} />
                        {c.class}
                        <span className="level-pill">{c.level}</span>
                      </span>
                    </td>
                    <td>
                      <span className="contribution">
                        <Sparkles size={13} />
                        {num(c.contribution)}
                      </span>
                    </td>
                    <td>
                      <Button
                        variant="ghost"
                        onClick={() => {
                          ctx.setPersona(c.id);
                          ctx.go('character');
                        }}
                      >
                        View character
                        <ArrowUpRight size={13} />
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="pagination">
            <span>
              Page {page + 1} of {Math.max(1, data.pages)}
            </span>
            <div>
              <Button
                disabled={page === 0}
                onClick={() => setPage((p) => p - 1)}
                aria-label="Previous page"
              >
                <ChevronLeft size={15} />
              </Button>
              <Button
                disabled={page + 1 >= data.pages}
                onClick={() => setPage((p) => p + 1)}
                aria-label="Next page"
              >
                <ChevronRight size={15} />
              </Button>
            </div>
          </div>
        </>
      )}
    </Panel>
  );
}

function ItemIcon({ icon, size = 24 }: { icon: string; size?: number }) {
  return icon === 'armor' ? (
    <Shield size={size} />
  ) : icon === 'charm' ? (
    <Gem size={size} />
  ) : icon === 'bow' ? (
    <Compass size={size} />
  ) : (
    <Swords size={size} />
  );
}
function CharacterScreen({ ctx }: { ctx: Context }) {
  const [tab, setTab] = useState<'inventory' | 'shop'>('inventory'),
    [slot, setSlot] = useState('all'),
    [ledger, setLedger] = useState<any[] | null>(null);
  const c = ctx.hero;
  useEffect(() => {
    setLedger(null);
  }, [c?.id]);
  if (!c)
    return (
      <Panel>
        <Empty
          icon={<Shield size={35} />}
          title="Every hero starts somewhere."
          body={
            ctx.s.mode === 'simulation'
              ? 'Create an adventurer or select a citizen to try the viewer experience.'
              : 'Real viewers create their characters in your Twitch chat: !join north.'
          }
          action={
            <div className="button-row">
              {ctx.s.mode === 'simulation' && (
                <Button variant="primary" onClick={() => ctx.setModal({ kind: 'join' })}>
                  Begin your story
                  <ArrowRight size={14} />
                </Button>
              )}
              <Button onClick={() => ctx.go('citizens')}>Browse citizens</Button>
            </div>
          }
        />
      </Panel>
    );
  const gear = c.gear ?? [];
  return (
    <>
      <div className="persona-note">
        <span>
          <Eye size={14} />
          {ctx.s.mode === 'simulation'
            ? 'VIEWER EXPERIENCE · SIMULATED PERSONA'
            : 'READ-ONLY CHARACTER · USE TWITCH CHAT TO PLAY'}
          <strong>{c.name}</strong>
          <SupporterBadge character={c} />
        </span>
        <button onClick={() => ctx.go('citizens')}>
          Change citizen
          <ChevronDown size={12} />
        </button>
      </div>
      <div className="character-layout">
        <Panel className="character-profile">
          <div
            className="portrait-backdrop"
            style={{ '--faction': FACTIONS[c.kingdom].color } as CSSProperties}
          >
            <div className="portrait-ring" />
            <Avatar character={c} />
            <span className="character-level">
              {c.level}
              <small>LEVEL</small>
            </span>
          </div>
          <div className="character-profile-info">
            <FactionTag faction={c.kingdom} />
            <h2>{c.name}</h2>
            <SupporterBadge character={c} />
            <div className="character-class">
              <ClassIcon name={c.class} />
              <span>{c.class}</span>
              {ctx.s.mode === 'simulation' && (
                <button onClick={() => ctx.setModal({ kind: 'class' })}>Change path</button>
              )}
            </div>
            <div className="xp-label">
              <span>
                Level {c.level}
                {c.level < 20 ? ` → ${c.level + 1}` : ' · MAX'}
              </span>
              <strong>
                {c.level < 20 ? `${num(c.levelXp)} / ${num(c.nextXp)} XP` : 'Master adventurer'}
              </strong>
            </div>
            <Progress value={c.levelXp} max={c.nextXp} color={FACTIONS[c.kingdom].color} />
            <div className="lifetime-xp">
              {num(c.xp)} lifetime XP <Sparkles size={11} />
            </div>
            <div className="character-stat-list">
              {(['attack', 'defense', 'health', 'speed'] as const).map((stat) => (
                <div key={stat}>
                  <span>
                    <StatIcon stat={stat} />
                    {stat}
                  </span>
                  <strong>{c.stats[stat]}</strong>
                </div>
              ))}
            </div>
            <div className="power-rating">
              <span>Campaign power</span>
              <strong>{c.stats.power}</strong>
              <small>Transparent, shared battle strength</small>
            </div>
          </div>
        </Panel>
        <div className="gear-content">
          <Panel className="supporter-hall">
            <PanelTitle title="Your place in the realm" eyebrow="SUPPORTER HONORS" />
            <p>
              Wear your support with pride. Your title, portrait trim and ceremonial banner reflect
              your subscription. Lords are elected separately by equal citizen votes.
            </p>
            <div className="supporter-rank-grid">
              {SUPPORTER_RANKS.map((rank, tier) => (
                <div
                  key={rank.title}
                  className={'rank-honor ' + (c.supporter?.tier === tier ? 'current' : '')}
                  style={{ '--rank': rank.color } as CSSProperties}
                >
                  <span className="honor-sigil">
                    {tier === 3 ? (
                      <Crown size={25} />
                    ) : tier === 2 ? (
                      <Sparkles size={25} />
                    ) : (
                      <Shield size={25} />
                    )}
                  </span>
                  <small>{rank.label}</small>
                  <strong>{rank.title}</strong>
                  <span>{rank.banner}</span>
                  <small>{rank.appearance}</small>
                  {c.supporter?.tier === tier && (
                    <b>
                      Your current rank{c.supporter.source === 'simulation' ? ' · simulated' : ''}
                    </b>
                  )}
                  {ctx.s.mode === 'simulation' && (
                    <Button
                      disabled={ctx.busy || c.supporter?.tier === tier}
                      onClick={() =>
                        ctx.run(
                          () =>
                            ctx.action(`characters/${c.id}/supporter`, {
                              tier: tier as SupporterTier,
                            }),
                          rank.title + ' cosmetic preview applied.',
                        )
                      }
                      aria-label={'Preview ' + rank.title + ' rank'}
                    >
                      Preview rank
                    </Button>
                  )}
                </div>
              ))}
            </div>
            <div className="honor-footnote">
              <ShieldCheck size={15} />
              <span>
                Recognition only. Equal combat strength, growth health, rewards, elections and
                challenge eligibility at every tier.
              </span>
            </div>
            {c.supporter?.source === 'unavailable' && (
              <p className="muted">
                Subscription status is unverified. The streamer can authorize subscription access
                and sync in Settings. Citizen remains your community title.
              </p>
            )}
            {c.supporter?.source === 'twitch' && (
              <p className="muted">
                Twitch verified {c.supporter.verifiedAt ? time(c.supporter.verifiedAt) : 'recently'}
                {c.supporter.gifted ? ' · Gift subscription' : ''}. Refreshes every ten minutes
                while running.
              </p>
            )}
          </Panel>
          <Panel className="equipment-panel">
            <PanelTitle
              title="Ready for the next chapter"
              eyebrow="EQUIPPED FOR THE JOURNEY"
              action={<Gold amount={c.gold} />}
            />
            <div className="equipped-grid">
              {(['weapon', 'armor', 'charm'] as const).map((slot) => {
                const g = gear.find((g) => g.slot === slot && g.equipped);
                return (
                  <div className="equipped-slot" key={slot}>
                    <span className="eyebrow">{slot}</span>
                    <div className={`item-art ${slot}`}>
                      <ItemIcon icon={g?.icon ?? slot} size={34} />
                      {g && <span>+{g.upgrade}</span>}
                    </div>
                    <strong>{g?.name ?? 'Empty slot'}</strong>
                    <small>{g?.bonus ?? 'Choose something from your inventory'}</small>
                  </div>
                );
              })}
            </div>
          </Panel>
          <Panel className="inventory-panel">
            <div className="inventory-tabs">
              <button
                className={tab === 'inventory' ? 'active' : ''}
                onClick={() => setTab('inventory')}
              >
                <ShoppingBag size={15} />
                Your inventory<span>{gear.length}</span>
              </button>
              <button className={tab === 'shop' ? 'active' : ''} onClick={() => setTab('shop')}>
                <Gem size={15} />
                The marketplace
              </button>
            </div>
            <div className="slot-tabs">
              {['all', 'weapon', 'armor', 'charm'].map((s) => (
                <button className={slot === s ? 'active' : ''} key={s} onClick={() => setSlot(s)}>
                  {s === 'all'
                    ? 'All equipment'
                    : s === 'charm'
                      ? 'Charms'
                      : s === 'armor'
                        ? 'Armor'
                        : 'Weapons'}
                </button>
              ))}
            </div>
            <div className="item-list">
              {(tab === 'inventory'
                ? gear.filter((g) => slot === 'all' || g.slot === slot)
                : ITEMS.filter((g) => slot === 'all' || g.slot === slot)
              ).map((item) => {
                const owned = gear.find(
                  (g) => g.definition === ('definition' in item ? item.definition : item.id),
                );
                const def = ITEMS.find(
                  (d) => d.id === ('definition' in item ? item.definition : item.id),
                )!;
                return (
                  <div className="item-row" key={item.id}>
                    <div className={`item-art ${item.slot}`}>
                      <ItemIcon icon={item.icon} />
                      {owned && <span>+{owned.upgrade}</span>}
                    </div>
                    <div className="item-description">
                      <strong>
                        {item.name}
                        {owned?.equipped && <Tag>EQUIPPED</Tag>}
                      </strong>
                      <small>{tab === 'inventory' ? owned!.bonus : def.flavor}</small>
                      <span>
                        {item.slot === 'weapon'
                          ? 'Weapon'
                          : item.slot === 'armor'
                            ? 'Armor'
                            : 'Charm'}{' '}
                        ·{' '}
                        {tab === 'inventory'
                          ? `Upgrade ${owned!.upgrade}/5`
                          : owned
                            ? 'Already in your collection'
                            : '+4 ATK, +3 DEF or +10 HP by slot'}
                      </span>
                    </div>
                    <div className="item-actions">
                      {tab === 'shop' ? (
                        owned ? (
                          <Tag>OWNED</Tag>
                        ) : (
                          <>
                            <Gold amount={def.cost} />
                            {ctx.s.mode === 'simulation' ? (
                              <Button
                                disabled={c.gold < def.cost || ctx.busy}
                                onClick={() => ctx.setModal({ kind: 'buy', item: def.id })}
                              >
                                Buy
                              </Button>
                            ) : (
                              <code>!buy {def.id}</code>
                            )}
                          </>
                        )
                      ) : (
                        <>
                          {owned!.upgrade < 5 ? <Gold amount={owned!.cost} /> : <Tag>MAX +5</Tag>}
                          {ctx.s.mode === 'simulation' ? (
                            <>
                              {!owned!.equipped && (
                                <Button
                                  variant="ghost"
                                  onClick={() => ctx.command('equip', owned!.id)}
                                >
                                  Equip
                                </Button>
                              )}
                              <Button
                                disabled={owned!.upgrade >= 5 || c.gold < owned!.cost || ctx.busy}
                                onClick={() => ctx.setModal({ kind: 'upgrade', item: owned!.id })}
                              >
                                Upgrade
                                <ArrowUpRight size={12} />
                              </Button>
                            </>
                          ) : (
                            <code>!upgrade {def.id}</code>
                          )}
                        </>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
            <div className="inventory-footnote">
              <ShieldCheck size={14} />
              Gold is earned by participating. No paid combat advantages.
            </div>
          </Panel>
          <div className="button-row">
            <Button
              variant="ghost"
              onClick={() =>
                void realmRequest(
                  `/api/${ctx.s.mode}/characters/${c.id}/ledger`,
                  ctx.s.realmId ?? 'home',
                )
                  .then(setLedger)
                  .catch((e) => ctx.notify(e.message))
              }
            >
              <BookOpen size={14} />
              View gold ledger
            </Button>
            <span className="muted small">
              Rewards are capped at 100 XP and 100 gold per UTC campaign day.
            </span>
          </div>
          {ledger && (
            <Panel className="ledger">
              <PanelTitle title="Your gold, accounted for" />
              <div className="table-scroll">
                <table>
                  <thead>
                    <tr>
                      <th>When</th>
                      <th>Reason</th>
                      <th>Change</th>
                      <th>Balance</th>
                    </tr>
                  </thead>
                  <tbody>
                    {ledger.map((e, i) => (
                      <tr key={i}>
                        <td>
                          {date(e.created_at)} · {time(e.created_at)}
                        </td>
                        <td>{e.reason.replaceAll('-', ' ')}</td>
                        <td>
                          {e.delta > 0 ? '+' : ''}
                          {e.delta}
                        </td>
                        <td>{e.balance_after}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Panel>
          )}
        </div>
      </div>
    </>
  );
}

function BattlesScreen({ ctx }: { ctx: Context }) {
  const ch =
    (ctx.selectedBattle ? ctx.s.battles.find((b) => b.id === ctx.selectedBattle) : null) ??
    ctx.s.chapter;
  const [showMath, setShowMath] = useState(false),
    [round, setRound] = useState(3),
    [playing, setPlaying] = useState(false);
  useEffect(() => {
    setRound(3);
    setPlaying(false);
  }, [ch?.id]);
  useEffect(() => {
    if (!playing) return;
    const timer = setInterval(
      () =>
        setRound((r) => {
          if (r >= 3) {
            setPlaying(false);
            return 3;
          }
          return r + 1;
        }),
      1500,
    );
    return () => clearInterval(timer);
  }, [playing]);
  const isOpen = ch?.status === 'open' || ch?.status === 'paused';
  return (
    <>
      <div className="battle-layout">
        <Panel className="battle-stage">
          <PanelTitle
            title={
              ch
                ? (ctx.s.territories.find((t) => t.id === ch.territory)?.name ?? 'Border chapter')
                : 'The next great story'
            }
            eyebrow={isOpen ? 'THE COUNCIL IS IN SESSION' : 'CAMPAIGN CHAPTER'}
            action={ch ? <Tag>{ch.status.toUpperCase()}</Tag> : undefined}
          />
          {!ch ? (
            <Empty
              icon={<Swords size={36} />}
              title="The borders are quiet. For now."
              body="Launch a chapter. Let citizens pledge, choose their tactic, and watch a fair result unfold."
              action={
                <Button variant="primary" onClick={() => ctx.setModal({ kind: 'chapter' })}>
                  <Plus size={14} />
                  Launch a chapter
                </Button>
              }
            />
          ) : (
            <>
              <div className="battle-arena">
                <div className="battle-arena-haze" />
                <div
                  className="army-side"
                  style={{ '--faction': FACTIONS[ch.attacker].color } as CSSProperties}
                >
                  <Crest faction={ch.attacker} size={82} />
                  <span className="eyebrow">THE CHALLENGER</span>
                  <h2>{FACTIONS[ch.attacker].name}</h2>
                  <span>{ch.pledged[ch.attacker]} pledged citizens</span>
                  {ch.result?.maxHealthA && (
                    <FortressMeter
                      faction={ch.attacker}
                      max={ch.result.maxHealthA}
                      health={
                        ch.result.maxHealthA -
                        ch.result.rounds.slice(0, round).reduce((s, r) => s + r.scoreB, 0)
                      }
                    />
                  )}
                  {ch.result && (
                    <strong className="arena-score">
                      {num(ch.result.rounds.slice(0, round).reduce((s, r) => s + r.scoreA, 0))}
                    </strong>
                  )}
                </div>
                <div className="versus-mark">
                  <Swords size={40} />
                  <span>VS</span>
                </div>
                <div
                  className="army-side"
                  style={{ '--faction': FACTIONS[ch.defender].color } as CSSProperties}
                >
                  <Crest faction={ch.defender} size={82} />
                  <span className="eyebrow">THE DEFENDER</span>
                  <h2>{FACTIONS[ch.defender].name}</h2>
                  <span>{ch.pledged[ch.defender]} pledged citizens</span>
                  {ch.result?.maxHealthB && (
                    <FortressMeter
                      faction={ch.defender}
                      max={ch.result.maxHealthB}
                      health={
                        ch.result.maxHealthB -
                        ch.result.rounds.slice(0, round).reduce((s, r) => s + r.scoreA, 0)
                      }
                    />
                  )}
                  {ch.result && (
                    <strong className="arena-score">
                      {num(ch.result.rounds.slice(0, round).reduce((s, r) => s + r.scoreB, 0))}
                    </strong>
                  )}
                </div>
              </div>
              {ch.result ? (
                <>
                  <div className="battle-result-banner">
                    <Trophy size={19} />
                    {round < 3
                      ? `Round ${round} of 3`
                      : ch.result.winner
                        ? `${FACTIONS[ch.result.winner].name} prevails`
                        : 'An honorable draw'}
                    <span>
                      {round < 3
                        ? 'The chapter is unfolding…'
                        : 'The result is settled. This replay changes no rewards.'}
                    </span>
                  </div>
                  <div className="replay-controls">
                    <Button
                      onClick={() => {
                        if (playing) setPlaying(false);
                        else {
                          setRound(0);
                          setPlaying(true);
                        }
                      }}
                    >
                      {playing ? <Pause size={14} /> : <Play size={14} />}{' '}
                      {playing ? 'Pause replay' : 'Replay chapter'}
                    </Button>
                    <span>Round {round} / 3</span>
                    <Button
                      variant="ghost"
                      onClick={() => {
                        setRound(3);
                        setPlaying(false);
                      }}
                    >
                      Show final result
                    </Button>
                  </div>
                  <div className="round-timeline">
                    {ch.result.rounds.map((r, i) => (
                      <div className={round > i ? 'revealed' : ''} key={r.round}>
                        <span>ROUND {r.round}</span>
                        <strong>
                          <i style={{ color: FACTIONS[ch.attacker].color }}>
                            {round > i ? r.scoreA : '—'}
                          </i>
                          <span>:</span>
                          <i style={{ color: FACTIONS[ch.defender].color }}>
                            {round > i ? r.scoreB : '—'}
                          </i>
                        </strong>
                      </div>
                    ))}
                  </div>
                </>
              ) : isOpen ? (
                <div className="council-live-footer">
                  <div>
                    <span className="eyebrow">
                      {ch.status === 'paused'
                        ? 'THE COUNCIL IS PAUSED'
                        : 'PLEDGES & BALLOTS CLOSE IN'}
                    </span>
                    <strong>
                      {ch.status === 'paused'
                        ? countdown(ctx.now + (ch.remaining ?? 0), ctx.now)
                        : countdown(ch.deadline, ctx.now)}
                    </strong>
                  </div>
                  <div className="button-row">
                    <Button
                      onClick={() =>
                        ctx.run(() =>
                          ctx.action(`chapters/${ch.id}/control`, {
                            action: ch.status === 'paused' ? 'resume' : 'pause',
                          }),
                        )
                      }
                    >
                      {ch.status === 'paused' ? <Play size={14} /> : <Pause size={14} />}{' '}
                      {ch.status === 'paused' ? 'Resume' : 'Pause'}
                    </Button>
                    <Button
                      variant="danger"
                      onClick={() => {
                        if (
                          window.confirm(
                            'Cancel this chapter? No rewards or territory will change.',
                          )
                        )
                          void ctx.run(() =>
                            ctx.action(`chapters/${ch.id}/control`, { action: 'cancel' }),
                          );
                      }}
                    >
                      Cancel chapter
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="battle-result-banner">
                  This chapter closed without a battle. No rewards or territory changed.
                </div>
              )}
            </>
          )}
        </Panel>
        <div className="battle-council">
          <Panel>
            <PanelTitle
              title={isOpen ? 'Make your voice count.' : 'The choice behind the outcome.'}
              eyebrow="THE CITIZENS’ COUNCIL"
            />
            {isOpen ? (
              <>
                <div className="current-persona">
                  <Avatar
                    character={ctx.hero ?? { name: 'Citizen', class: 'vanguard', kingdom: 'north' }}
                    small
                  />
                  <span>
                    <strong>{ctx.hero?.name ?? 'Choose a citizen first'}</strong>
                    <small>
                      {ctx.hero ? FACTIONS[ctx.hero.kingdom].name : 'Visit the Citizens page'}
                    </small>
                  </span>
                </div>
                <p>
                  Pledge to your kingdom, then choose its tactic. Every citizen gets one equal,
                  replaceable ballot.
                </p>
                {ctx.s.mode === 'simulation' ? (
                  <Button
                    className="full"
                    disabled={ctx.busy || ch.status !== 'open' || ch.myPledge}
                    onClick={() => ctx.command('pledge')}
                  >
                    {ch.myPledge ? <Check size={14} /> : <Flag size={14} />}{' '}
                    {ch.myPledge ? 'Your pledge is recorded' : 'Pledge to this chapter'}
                  </Button>
                ) : (
                  <code>!pledge</code>
                )}
                <div className="tactic-options">
                  {TACTICS.map((t, i) => (
                    <button
                      className={ch.myVote === t ? 'selected' : ''}
                      key={t}
                      disabled={
                        ctx.s.mode === 'live' || ctx.busy || !ch.myPledge || ch.status !== 'open'
                      }
                      onClick={() => ctx.command('vote', t)}
                    >
                      <span>
                        {i === 0 ? (
                          <Swords size={18} />
                        ) : i === 1 ? (
                          <Shield size={18} />
                        ) : (
                          <Zap size={18} />
                        )}
                        <strong>{t}</strong>
                        <small>
                          {i === 0 ? 'Beats Raid' : i === 1 ? 'Beats Attack' : 'Beats Defend'}
                        </small>
                      </span>
                      {ch.myVote === t ? <CheckCircle2 size={18} /> : <Circle size={15} />}
                    </button>
                  ))}
                </div>
                <small className="muted">Results stay hidden until the council closes.</small>
                {ctx.s.mode === 'live' && <code>!vote attack | defend | raid</code>}
              </>
            ) : ch?.input ? (
              <div className="tactic-results">
                {ch.result?.maxHealthA && (
                  <p className="fortress-result">
                    Fortress health remaining: {ch.result.healthA}/{ch.result.maxHealthA} vs{' '}
                    {ch.result.healthB}/{ch.result.maxHealthB}. The highest remaining percentage
                    wins.
                  </p>
                )}
                {ch.input.sides.map((side) => (
                  <div key={side.kingdom}>
                    <Crest faction={side.kingdom} size={31} />
                    <span>
                      {FACTIONS[side.kingdom].name}
                      <strong>{side.tactic}</strong>
                      <small>
                        {side.roster.length} selected combatants · {side.pledged} pledges
                      </small>
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <p>
                Citizens choose Attack, Defend or Raid. The strongest tactic depends on the other
                side’s choice.
              </p>
            )}
          </Panel>
          {ctx.s.mode === 'simulation' && (
            <Panel className="simulation-tools">
              <span className="eyebrow">
                <FlaskConical size={12} />
                SIMULATION TOOLS
              </span>
              <p>Explore a full chapter without waiting for real chat.</p>
              <Button
                className="full"
                disabled={!isOpen || ch?.status !== 'open' || ctx.busy}
                onClick={() =>
                  ctx.run(
                    () => ctx.action('populate-chapter'),
                    'Synthetic citizens joined the council.',
                  )
                }
              >
                <Users size={14} />
                Rally simulated citizens
              </Button>
              <Button
                className="full"
                disabled={ctx.busy}
                onClick={() =>
                  ctx.run(
                    () => ctx.action('advance', { seconds: 65 }),
                    'Simulation advanced 65 seconds.',
                  )
                }
              >
                <ArrowRight size={14} />
                Advance 65 seconds
              </Button>
            </Panel>
          )}
        </div>
      </div>
      {ch?.result && (
        <Panel className="space-top">
          <button className="calculation-toggle" onClick={() => setShowMath(!showMath)}>
            <span>
              <ShieldCheck size={17} />
              Nothing hidden behind the curtain.
              <small>Inspect the exact inputs, seeded rolls and recorded result.</small>
            </span>
            <ChevronDown size={17} className={showMath ? 'rotate' : ''} />
          </button>
          {showMath && (
            <div className="calculation-details">
              <div className="math-summary">
                <span>
                  Ruleset<strong>{ch.result.ruleset}</strong>
                </span>
                <span>
                  Seed<strong>{ch.input!.seed}</strong>
                </span>
                <span>
                  Defending terrain<strong>+3%</strong>
                </span>
                <span>
                  Tactic advantage<strong>+10%</strong>
                </span>
              </div>
              <div className="table-scroll">
                <table>
                  <thead>
                    <tr>
                      <th>Round</th>
                      <th>Attacker roll</th>
                      <th>Defender roll</th>
                      <th>Attacker {ch.result.maxHealthA ? 'damage' : 'score'}</th>
                      <th>Defender {ch.result.maxHealthB ? 'damage' : 'score'}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {ch.result.rounds.map((r) => (
                      <tr key={r.round}>
                        <td>{r.round}</td>
                        <td>{r.rollA} bp</td>
                        <td>{r.rollB} bp</td>
                        <td>{r.scoreA}</td>
                        <td>{r.scoreB}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p>
                Power = 4 × ATK + 3 × DEF + floor(HP / 5) + 2 × SPD. Team strength uses average
                power, a capped participation bonus, tactics, terrain and six recorded seeded rolls.
              </p>
              <label>Input SHA-256</label>
              <code className="hash">{ch.result.inputHash}</code>
              <label>Result SHA-256</label>
              <code className="hash">{ch.result.outputHash}</code>
              <details>
                <summary>Frozen combat rosters</summary>
                {ch.input!.sides.map((s) => (
                  <div key={s.kingdom}>
                    <h3>
                      {FACTIONS[s.kingdom].name} · effective power {s.effective}
                    </h3>
                    <p>{s.roster.map((c) => `${c.name} (${c.power})`).join(' · ')}</p>
                  </div>
                ))}
              </details>
            </div>
          )}
        </Panel>
      )}
      <Panel className="space-top">
        <PanelTitle title="Chapters already written" eyebrow="BATTLE HISTORY" />
        {ctx.s.battles.length ? (
          <div className="battle-history">
            {ctx.s.battles.map((ch) => (
              <button
                key={ch.id}
                className={ctx.selectedBattle === ch.id ? 'selected' : ''}
                onClick={() => {
                  ctx.setBattle(ch.id);
                  window.scrollTo({ top: 0, behavior: 'smooth' });
                }}
              >
                <div className="history-crests">
                  <Crest faction={ch.attacker} size={25} />
                  <Swords size={13} />
                  <Crest faction={ch.defender} size={25} />
                </div>
                <span>
                  <strong>{ctx.s.territories.find((t) => t.id === ch.territory)?.name}</strong>
                  <small>
                    {date(ch.createdAt)} ·{' '}
                    {ch.status === 'cancelled'
                      ? 'No battle fought'
                      : ch.result?.winner
                        ? `${ch.result.winner} prevailed`
                        : 'Draw'}
                  </small>
                </span>
                {ch.result && (
                  <strong className="history-score">
                    {ch.result.scoreA} : {ch.result.scoreB}
                  </strong>
                )}
                <ArrowUpRight size={15} />
              </button>
            ))}
          </div>
        ) : (
          <Empty
            title="The chronicle is waiting."
            body="Your first battle will be remembered here, with a replay and calculation."
          />
        )}
      </Panel>
    </>
  );
}

function LeaderboardScreen({ ctx }: { ctx: Context }) {
  const [tab, setTab] = useState('kingdoms'),
    [citizens, setCitizens] = useState<Character[]>([]),
    [archive, setArchive] = useState<any>(null),
    [rankingError, setRankingError] = useState('');
  useEffect(() => {
    let active = true;
    Promise.all([
      realmRequest(`/api/${ctx.s.mode}/characters?page=0`, ctx.s.realmId ?? 'home'),
      realmRequest(`/api/${ctx.s.mode}/seasons`, ctx.s.realmId ?? 'home'),
    ])
      .then(([c, a]) => {
        if (active) {
          setCitizens(c.items);
          setArchive(a);
          setRankingError('');
        }
      })
      .catch((error) => {
        if (active) setRankingError(error.message);
      });
    return () => {
      active = false;
    };
  }, [ctx.s.mode, ctx.s.generation, ctx.s.revision, ctx.s.now]);
  const ranked = [...ctx.s.kingdoms].sort(
    (a, b) => b.points - a.points || b.wins - a.wins || a.id.localeCompare(b.id),
  );
  return (
    <>
      <div className="season-banner">
        <div className="season-emblem">
          <Trophy size={29} />
        </div>
        <div>
          <span className="eyebrow">THE FIRST AGE</span>
          <h2>Season {ctx.s.season.number}: a story still unfolding.</h2>
          <p>
            {date(ctx.s.season.startsAt)} – {date(ctx.s.season.endsAt)} · Characters and gear
            persist into the next age.
          </p>
        </div>
        <div>
          <span>TIME REMAINING</span>
          <strong>{countdown(ctx.s.season.endsAt, ctx.now)}</strong>
        </div>
      </div>
      {rankingError && (
        <p role="alert">
          Rankings could not refresh: {rankingError}. Previously loaded results may be out of date.
        </p>
      )}
      <Panel>
        <div className="inventory-tabs">
          <button className={tab === 'kingdoms' ? 'active' : ''} onClick={() => setTab('kingdoms')}>
            <Crown size={16} />
            Kingdoms
          </button>
          <button className={tab === 'citizens' ? 'active' : ''} onClick={() => setTab('citizens')}>
            <Users size={16} />
            Citizens
          </button>
          <button className={tab === 'archive' ? 'active' : ''} onClick={() => setTab('archive')}>
            <BookOpen size={16} />
            Past seasons
          </button>
        </div>
        {tab === 'kingdoms' ? (
          <div className="ranking-list">
            {ranked.map((k, i) => {
              const rank = ranked.findIndex((a) => a.points === k.points && a.wins === k.wins) + 1;
              return (
                <div key={k.id}>
                  <span className={`rank rank-${i + 1}`}>
                    {rank === 1 ? <Crown size={22} /> : String(rank).padStart(2, '0')}
                  </span>
                  <Crest faction={k.id} size={43} />
                  <span className="ranking-name">
                    <strong>{k.name}</strong>
                    <small>
                      {k.subtitle} · {k.citizens} citizens
                    </small>
                  </span>
                  <span className="ranking-secondary">
                    {k.wins}
                    <small>WINS</small>
                  </span>
                  <span className="ranking-secondary">
                    {k.territories}
                    <small>TERRITORIES</small>
                  </span>
                  <span className="ranking-points">
                    {k.points}
                    <small>POINTS</small>
                  </span>
                </div>
              );
            })}
          </div>
        ) : tab === 'citizens' ? (
          <div className="ranking-list">
            {citizens.map((c, i) => (
              <button
                key={c.id}
                onClick={() => {
                  ctx.setPersona(c.id);
                  ctx.go('character');
                }}
              >
                <span className="rank">
                  {citizens.findIndex((a) => a.contribution === c.contribution) + 1}
                </span>
                <Avatar character={c} small />
                <span className="ranking-name">
                  <strong>{c.name}</strong>
                  <SupporterBadge character={c} />
                  <small>
                    {FACTIONS[c.kingdom].name} · Lv {c.level} {c.class}
                  </small>
                </span>
                <span className="ranking-points">
                  {c.contribution}
                  <small>CONTRIBUTION</small>
                </span>
                <ArrowUpRight size={15} />
              </button>
            ))}
          </div>
        ) : archive?.awards?.length ? (
          <div className="archive-list">
            {archive.seasons
              .filter((s: any) => s.status === 'closed')
              .map((s: any) => (
                <div key={s.id}>
                  <h3>Season {s.number}</h3>
                  <p>
                    {date(s.starts_at)} – {date(s.ends_at)}
                  </p>
                  {archive.awards
                    .filter((a: any) => a.season_id === s.id && a.kind === 'kingdom')
                    .map((a: any) => (
                      <p key={a.subject}>
                        #{a.rank} · {FACTIONS[a.subject as Faction].name} · {a.score} points
                      </p>
                    ))}
                </div>
              ))}
          </div>
        ) : (
          <Empty
            icon={<BookOpen size={28} />}
            title="The first age is still being written."
            body="Completed seasonal standings will be preserved here."
          />
        )}
        <div className="ranking-rules">
          <ShieldCheck size={17} />
          <div>
            <strong>Contribution over clout.</strong>
            <p>
              Kingdoms earn 3 points per win, 1 per draw and 2 per border held at season close.
              Citizens earn contribution through pledged battles and election ballots. Subscriber
              status and audience size never multiply votes.
            </p>
          </div>
        </div>
      </Panel>
    </>
  );
}

function ChronicleScreen({ ctx }: { ctx: Context }) {
  const [filter, setFilter] = useState('all');
  return (
    <Panel>
      <PanelTitle
        title="The chronicle of Everfall"
        eyebrow="REAL CHOICES. LASTING STORIES."
        action={
          <Button onClick={() => ctx.setModal({ kind: 'announcement' })}>
            <MessageSquare size={14} />
            Write an announcement
          </Button>
        }
      />
      <div className="slot-tabs">
        {['all', 'battle', 'election', 'join', 'upgrade', 'milestone'].map((f) => (
          <button className={filter === f ? 'active' : ''} key={f} onClick={() => setFilter(f)}>
            {f === 'all'
              ? 'All chapters'
              : f === 'join'
                ? 'Citizens'
                : f[0].toUpperCase() + f.slice(1)}
          </button>
        ))}
      </div>
      <div className="chronicle-timeline">
        {ctx.s.events
          .filter((e) => filter === 'all' || e.type === filter)
          .map((e) => (
            <article key={e.id}>
              <div className={`timeline-marker ${e.type}`}>
                {e.type === 'battle' ? (
                  <Swords size={18} />
                ) : e.type === 'election' ? (
                  <Crown size={18} />
                ) : (
                  <Sparkles size={18} />
                )}
              </div>
              <div className="chronicle-entry">
                <div className="chronicle-meta">
                  <span>
                    {date(e.createdAt)}
                    <i /> {time(e.createdAt)}
                  </span>
                  <Tag color={e.source === 'simulated' ? '#b29be4' : undefined}>
                    {e.source === 'simulated' ? 'SIMULATED' : e.source.toUpperCase()}
                  </Tag>
                </div>
                <h3>{e.title}</h3>
                <p>{e.body}</p>
                <div className="chronicle-provenance">
                  <ShieldCheck size={12} />
                  {e.narrativeSource === 'template'
                    ? 'Deterministic template · recorded campaign facts'
                    : e.narrativeSource}
                  <span>Event #{e.id}</span>
                </div>
              </div>
            </article>
          ))}
        {!ctx.s.events.some((e) => filter === 'all' || e.type === filter) && (
          <Empty
            title="No chapters of this kind yet."
            body="The next community choice could be the start of one."
          />
        )}
      </div>
    </Panel>
  );
}

function Toggle({
  checked,
  onChange,
  label,
  description,
  disabled = false,
}: {
  checked: boolean;
  onChange: () => void;
  label: string;
  description?: string;
  disabled?: boolean;
}) {
  return (
    <div className="toggle-setting">
      <span>
        <strong>{label}</strong>
        {description && <small>{description}</small>}
      </span>
      <button
        role="switch"
        aria-checked={checked}
        aria-label={label}
        className={`toggle ${checked ? 'on' : ''}`}
        disabled={disabled}
        onClick={onChange}
      >
        <span />
      </button>
    </div>
  );
}
function StewardScreen({ ctx }: { ctx: Context }) {
  const settings = ctx.s.settings;
  const update = (patch: Partial<Settings>) =>
    ctx.run(() => ctx.action('settings', patch, 'PATCH'), 'Steward preferences saved.');
  return (
    <div className="two-column steward-layout">
      <Panel>
        <div className="steward-intro">
          <div className="steward-orb large">
            <Sparkles size={30} />
          </div>
          <span className="eyebrow">THE VOICE BETWEEN CHAPTERS</span>
          <h2>Your story deserves a good storyteller.</h2>
          <p>
            The Steward celebrates what your community actually did. It narrates settled facts,
            never decides winners or hands out power.
          </p>
          <Tag color="#a5c7a7">
            <span className="status-dot" />
            {ctx.s.steward.status}
          </Tag>
        </div>
        <div className="steward-sample">
          <span className="eyebrow">A PAGE FROM YOUR CHRONICLE</span>
          <p>
            “
            {ctx.s.events.find((e) => ['battle', 'election', 'realm'].includes(e.type))?.body ??
              'A new realm awaits its first great story.'}
            ”
          </p>
          <span>
            <ShieldCheck size={13} />
            Grounded in a recorded campaign event
          </span>
        </div>
        <div className="steward-principles">
          <div>
            <ShieldCheck size={19} />
            <strong>The engine decides.</strong>
            <p>AI cannot change stats, ballots, rewards or outcomes.</p>
          </div>
          <div>
            <BookOpen size={19} />
            <strong>The story stays honest.</strong>
            <p>Deterministic facts remain intact. AI can add brief atmosphere.</p>
          </div>
          <div>
            <WifiOff size={19} />
            <strong>The show goes on.</strong>
            <p>No key or provider outage? Safe templates keep every chapter moving.</p>
          </div>
        </div>
      </Panel>
      <div>
        <Panel>
          <PanelTitle title="The Steward’s voice" eyebrow="YOUR WORLD, YOUR TONE" />
          <Toggle
            label="Optional AI atmosphere"
            description={
              ctx.s.steward.configured
                ? 'Use the configured backend narrative provider.'
                : 'Add a provider endpoint and key in .env. Templates work now.'
            }
            checked={settings.aiEnabled}
            onChange={() => update({ aiEnabled: !settings.aiEnabled })}
          />
          <label className="field-label">Narrative tone</label>
          <div className="tone-picker">
            {(['heroic', 'cozy', 'dry'] as const).map((t) => (
              <button
                className={settings.tone === t ? 'active' : ''}
                key={t}
                onClick={() => update({ tone: t })}
              >
                {t === 'heroic' ? (
                  <Swords size={15} />
                ) : t === 'cozy' ? (
                  <Home size={15} />
                ) : (
                  <BookOpen size={15} />
                )}{' '}
                {t[0].toUpperCase() + t.slice(1)}
              </button>
            ))}
          </div>
          <Toggle
            label="Publish to Twitch chat"
            description="Send requested replies and canonical chapter results as your broadcaster account."
            checked={settings.chatOutput}
            onChange={() => update({ chatOutput: !settings.chatOutput })}
          />
          <Toggle
            label="Quiet mode"
            description="Suppress overlay notifications and outbound chat. Your campaign continues."
            checked={settings.quiet}
            onChange={() => update({ quiet: !settings.quiet })}
          />
          <div className="budget-block">
            <div>
              <span>Daily generation budget</span>
              <strong>
                {ctx.s.steward.used} / {ctx.s.steward.limit}
              </strong>
            </div>
            <Progress value={ctx.s.steward.used} max={ctx.s.steward.limit} />
            <small>Also capped at 20/hour · four-second timeout · no gameplay dependency</small>
          </div>
        </Panel>
        <Panel className="space-top">
          <PanelTitle title="Routine events, on your terms" />
          <Toggle
            label="Automatic campaign chapters"
            description="Opt in to one eligible chapter every 30 minutes. Paused and quiet realms stay quiet."
            checked={settings.autoChapters}
            onChange={() => update({ autoChapters: !settings.autoChapters })}
          />
          <p className="muted small">
            Scheduling is deterministic application code. A model cannot operate your dashboard.
          </p>
          <Button className="full" onClick={() => ctx.go('chronicle')}>
            Read the chronicle
            <ArrowUpRight size={14} />
          </Button>
        </Panel>
      </div>
    </div>
  );
}

function SettingsScreen({ ctx }: { ctx: Context }) {
  const [tab, setTab] = useState('integration'),
    [overlayUrl, setOverlayUrl] = useState(''),
    [subscriberInfo, setSubscriberInfo] = useState<any>(null);
  const integration = ctx.s.integration;
  const copy = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      ctx.notify('Copied to clipboard.');
    } catch {
      ctx.notify('Clipboard unavailable. Select and copy the URL.');
    }
  };
  return (
    <Panel>
      <div className="inventory-tabs settings-tabs">
        {[
          { id: 'integration', label: 'Twitch', icon: Radio },
          { id: 'overlay', label: 'OBS overlay', icon: Monitor },
          { id: 'gameplay', label: 'Campaign', icon: Swords },
          { id: 'data', label: 'Data & safety', icon: ShieldCheck },
          { id: 'about', label: 'About', icon: Compass },
        ].map((t) => (
          <button key={t.id} className={tab === t.id ? 'active' : ''} onClick={() => setTab(t.id)}>
            <t.icon size={15} />
            {t.label}
          </button>
        ))}
      </div>
      <div className="settings-body">
        {tab === 'integration' && (
          <>
            <div className="settings-section-title">
              <div className="settings-icon twitch">
                <Radio size={25} />
              </div>
              <div>
                <h2>A real connection to your community.</h2>
                <p>
                  Chat commands come from Twitch EventSub. Your channel’s world stays separate from
                  Simulation.
                </p>
              </div>
            </div>
            {ctx.s.mode === 'simulation' && (
              <div className="info-callout">
                <FlaskConical size={18} />
                <p>
                  You’re in Simulation. Switch to <strong>Live</strong> in the top bar to authorize
                  your channel. Simulation never connects to Twitch.
                </p>
              </div>
            )}
            <div className="integration-checklist">
              <SetupStep
                done={integration.configured}
                number="01"
                title="Register your Twitch application"
                description="Create a confidential app in the Twitch Developer Console. Set the exact callback below."
              />
              <code className="callback-code">
                http://localhost:3000/auth/twitch/callback{' '}
                <button
                  aria-label="Copy callback URL"
                  onClick={() => copy('http://localhost:3000/auth/twitch/callback')}
                >
                  <Copy size={14} />
                </button>
              </code>
              <SetupStep
                done={integration.configured}
                number="02"
                title="Configure your local backend"
                description="Copy .env.example to .env, add TWITCH_CLIENT_ID and TWITCH_CLIENT_SECRET, then restart the server. Never put credentials in the frontend."
              />
              <SetupStep
                done={integration.connected}
                number="03"
                title="Authorize your broadcaster account"
                description="Core scopes: user:read:chat and user:write:chat. Outbound replies send as your broadcaster only when enabled."
              />
              <SetupStep
                done={!!integration.lastEventAt}
                number="04"
                title="Welcome a real citizen"
                description="In your Twitch chat, type !join north. Watch the citizen appear, then try !profile and !pledge."
              />
            </div>
            <div className="integration-status-card">
              <div>
                <span className={`status-dot ${integration.connected ? '' : 'offline'}`} />
                <strong>{integration.state}</strong>
                <small>
                  {integration.channel
                    ? `Channel: ${integration.channel}`
                    : 'No authorized channel yet'}
                </small>
              </div>
              {ctx.s.mode === 'live' && (
                <div className="button-row">
                  <a
                    className={`button primary ${!integration.configured ? 'disabled' : ''}`}
                    href={integration.configured ? '/auth/twitch/start' : undefined}
                  >
                    Connect Twitch
                    <ExternalLink size={14} />
                  </a>
                  {integration.connected && (
                    <Button
                      variant="danger"
                      onClick={() => {
                        if (
                          confirm(
                            'Disconnect Twitch? The saved world remains, but incoming commands stop.',
                          )
                        )
                          void ctx.run(
                            () => ctx.action('integration/disconnect'),
                            'Twitch disconnected.',
                          );
                      }}
                    >
                      Disconnect
                    </Button>
                  )}
                </div>
              )}
            </div>
            {integration.error && <p className="form-error">{integration.error}</p>}
            <div className="scope-list">
              {integration.scopes.map((scope) => (
                <code key={scope}>{scope}</code>
              ))}
            </div>
            <Toggle
              label="Enable chat replies and chapter announcements"
              description="Off by default. Messages respect moderation, a conservative send budget, and quiet mode."
              checked={ctx.s.settings.chatOutput}
              onChange={() =>
                ctx.run(
                  () => ctx.action('settings', { chatOutput: !ctx.s.settings.chatOutput }, 'PATCH'),
                  'Chat output preference saved.',
                )
              }
            />
            {ctx.s.mode === 'live' && (
              <Button
                disabled={!integration.subscriptions || ctx.busy}
                onClick={() =>
                  ctx.run(
                    () => ctx.action('integration/supporters/sync'),
                    'Supporter ranks synced from Twitch.',
                  )
                }
              >
                Sync supporter ranks
              </Button>
            )}
            {ctx.s.mode === 'live' && (
              <Button
                disabled={!integration.subscriptions}
                onClick={() =>
                  ctx
                    .run(() => request('/api/live/integration/subscribers'))
                    .then((data) => {
                      if (data) setSubscriberInfo(data);
                    })
                }
              >
                Check optional subscriber recognition
              </Button>
            )}
            {subscriberInfo && (
              <p>
                {subscriberInfo.total} subscriptions, verified {time(subscriberInfo.verifiedAt)}.
                Cosmetic recognition only.
              </p>
            )}
            <a
              className="external-text-link"
              href="https://dev.twitch.tv/console/apps"
              target="_blank"
              rel="noreferrer"
            >
              Open Twitch Developer Console
              <ExternalLink size={13} />
            </a>
          </>
        )}
        {tab === 'overlay' && (
          <>
            <div className="settings-section-title">
              <div className="settings-icon">
                <Monitor size={25} />
              </div>
              <div>
                <h2>A window into your world.</h2>
                <p>
                  A transparent, read-only browser source for OBS. No scene-control permissions
                  required.
                </p>
              </div>
            </div>
            <div className="overlay-preview">
              <div className="overlay-safe-zone">
                <span>1920 × 1080 · TRANSPARENT CANVAS</span>
                <div className="overlay-preview-widget">
                  <Crest faction="north" size={26} />
                  <div>
                    <strong>
                      North Kingdom <Swords size={12} /> East Kingdom
                    </strong>
                    <small>Your next chapter is waiting.</small>
                  </div>
                  <Crest faction="east" size={26} />
                </div>
                <div className="overlay-safe-label">48 PX SAFE MARGIN</div>
              </div>
            </div>
            <div className="info-callout">
              <ShieldCheck size={18} />
              <p>
                Each URL contains a read-only capability. Keep it private. Generating a new key
                revokes the previous one.
              </p>
            </div>
            <Button
              variant="primary"
              onClick={() =>
                ctx
                  .run(() => ctx.action('overlay/keys'))
                  .then((result) => {
                    if (result) setOverlayUrl(result.url);
                  })
              }
            >
              <KeyRound size={14} />
              Generate overlay URL
            </Button>
            {overlayUrl && (
              <div className="overlay-url">
                <input aria-label="OBS browser-source URL" readOnly value={overlayUrl} />
                <Button onClick={() => copy(overlayUrl)}>
                  <Copy size={14} />
                  Copy
                </Button>
                <a href={overlayUrl} target="_blank" rel="noreferrer" className="button">
                  Preview
                  <ExternalLink size={14} />
                </a>
              </div>
            )}
            <div className="overlay-instructions">
              <SetupStep
                number="01"
                done={false}
                title="Add a Browser Source in OBS"
                description="Paste the generated URL. Set width 1920, height 1080 and 30 FPS."
              />
              <SetupStep
                number="02"
                done={false}
                title="Keep the background transparent"
                description="Use the default transparent browser-source CSS. Place the campaign strip clear of your game HUD."
              />
              <SetupStep
                number="03"
                done={false}
                title="Test a chapter"
                description="The source restores the current snapshot when refreshed. Simulation overlays always keep a visible synthetic badge."
              />
            </div>
            <Button
              variant="danger"
              onClick={() => {
                if (confirm('Revoke all overlay access for this environment?'))
                  void ctx.run(
                    () => ctx.action('overlay/keys', undefined, 'DELETE'),
                    'Overlay keys revoked.',
                  );
              }}
            >
              Revoke overlay access
            </Button>
          </>
        )}
        {tab === 'gameplay' && (
          <>
            <h2>Your pace. Your campaign.</h2>
            <p className="muted">
              Keep your stream the main event. ChatVerse fills the space between rounds.
            </p>
            <Toggle
              label="Quiet mode"
              description="Campaign continues, announcements and overlay toasts stay silent."
              checked={ctx.s.settings.quiet}
              onChange={() =>
                ctx.run(() => ctx.action('settings', { quiet: !ctx.s.settings.quiet }, 'PATCH'))
              }
            />
            <Toggle
              label="Automatic chapters"
              description="One eligible border challenge every 30 minutes, only when no chapter is active and quiet mode is off."
              checked={ctx.s.settings.autoChapters}
              onChange={() =>
                ctx.run(() =>
                  ctx.action('settings', { autoChapters: !ctx.s.settings.autoChapters }, 'PATCH'),
                )
              }
            />
            <div className="settings-rules">
              <h3>Rules everyone can understand.</h3>
              <p>
                Equal citizen votes. At most 50 seeded combatants per side. No paid power.
                Characters and gear persist across seven-day seasons.
              </p>
              <p>
                Core stats and costs are frozen under <code>chatverse-v1</code>. Rule changes need a
                new version, so old replays remain trustworthy.
              </p>
              <Button onClick={() => ctx.go('battles')}>
                Inspect battle calculations
                <ArrowUpRight size={13} />
              </Button>
            </div>
            <h3>Mark a moment from your actual game</h3>
            <p className="muted">
              These are explicitly streamer-confirmed story beats. They grant no combat bonuses and
              imply no automatic game telemetry.
            </p>
            <div className="button-row wrap">
              {['A hard-earned victory', 'A brave attempt', 'A new personal best'].map((m) => (
                <Button
                  key={m}
                  onClick={() =>
                    ctx.run(
                      () => ctx.action('milestone', { milestone: m }),
                      'A streamer-confirmed moment was added to the chronicle.',
                    )
                  }
                >
                  <Flag size={13} />
                  {m}
                </Button>
              ))}
            </div>
          </>
        )}
        {tab === 'data' && (
          <>
            <h2>Your world, safely kept.</h2>
            <p className="muted">
              Live and Simulation use separate SQLite databases. Token storage is encrypted for this
              Windows account.
            </p>
            <div className="data-cards">
              <div>
                <ShieldCheck size={22} />
                <h3>{ctx.s.mode === 'simulation' ? 'simulation.sqlite' : 'live.sqlite'}</h3>
                <p>Characters, gear, ballots, rewards and history saved on your computer.</p>
                <Button
                  onClick={() =>
                    ctx
                      .run(() => ctx.action('backup'))
                      .then((result) => {
                        if (result?.file) ctx.notify(`Backup saved: ${result.file}`);
                      })
                  }
                >
                  <Copy size={14} />
                  Create a backup
                </Button>
              </div>
              <div>
                <BookOpen size={22} />
                <h3>Auditable outcomes</h3>
                <p>
                  Gold ledger, immutable battle inputs and result hashes explain every consequence.
                </p>
                <Button onClick={() => ctx.go('chronicle')}>
                  Open chronicle
                  <ArrowUpRight size={13} />
                </Button>
              </div>
            </div>
            {ctx.s.mode === 'simulation' && (
              <div className="danger-zone">
                <h3>A different beginning.</h3>
                <p>
                  Reset only the synthetic world. Your Live channel and its citizens are never
                  touched.
                </p>
                <Button variant="danger" onClick={() => ctx.setModal({ kind: 'scenario' })}>
                  Load a Simulation scenario
                </Button>
              </div>
            )}
            <div className="info-callout">
              <KeyRound size={18} />
              <p>
                Sessions expire after 12 hours. Restarting the server creates a new local access
                code. Never share your dashboard code or put Twitch secrets in a repository.
              </p>
            </div>
            <Button
              onClick={() => {
                void request('/api/session', { method: 'DELETE' }).then(() => location.reload());
              }}
            >
              Lock local dashboard
            </Button>
          </>
        )}
        {tab === 'about' && (
          <div className="about-content">
            <div className="brand-mark">
              <Crown size={32} />
            </div>
            <h2>ChatVerse</h2>
            <span className="eyebrow">YOUR STREAM. THEIR KINGDOM.</span>
            <p>
              A persistent community campaign for Twitch. Built with Codex, for the people who make
              a stream feel like home.
            </p>
            <div className="about-specs">
              <span>React + TypeScript</span>
              <span>Fastify + SQLite</span>
              <span>Real Twitch OAuth + EventSub</span>
              <span>Deterministic battle engine</span>
            </div>
            <p className="muted">
              v0.1 · Local-first · No 3D game engine · No automatic Valorant or Fortnite telemetry
            </p>
            <div className="info-callout">
              <Compass size={20} />
              <p>
                This release supports one authorized channel per installation. Cross-channel wars
                and a public viewer website remain later milestones. Simulation citizens are always
                clearly synthetic.
              </p>
            </div>
          </div>
        )}
      </div>
    </Panel>
  );
}
function SetupStep({
  number,
  title,
  description,
  done,
}: {
  number: string;
  title: string;
  description: string;
  done: boolean;
}) {
  return (
    <div className="setup-step">
      <div className={done ? 'done' : ''}>{done ? <Check size={15} /> : number}</div>
      <span>
        <strong>{title}</strong>
        <p>{description}</p>
      </span>
    </div>
  );
}

function Modal({
  ctx,
  modal,
  close,
}: {
  ctx: Context;
  modal: NonNullable<ModalState>;
  close: () => void;
}) {
  const [attacker, setAttacker] = useState<Faction>(() => {
      const eligible = (f: Faction) =>
        ctx.s.territories.some(
          (t) =>
            !t.capital &&
            !t.contestedToday &&
            t.owner !== f &&
            t.neighbors.some((id) => ctx.s.territories.find((t) => t.id === id)?.owner === f),
        );
      return eligible('east')
        ? 'east'
        : ((['north', 'west'] as Faction[]).find(eligible) ?? 'east');
    }),
    [territory, setTerritory] = useState('crossroads'),
    [seconds, setSeconds] = useState(60),
    [text, setText] = useState(''),
    [selection, setSelection] = useState('baseline'),
    [choice, setChoice] = useState<string>(ctx.hero?.class ?? 'vanguard'),
    [kingdom, setKingdom] = useState<Faction>(modal.faction ?? 'north');
  const dialog = useRef<HTMLDivElement>(null),
    newPersona = useRef(`visitor-${crypto.randomUUID()}`);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement;
    const root = dialog.current;
    const focusable = () =>
      Array.from(
        root?.querySelectorAll<HTMLElement>(
          'button:not(:disabled),input,textarea,select,a[href]',
        ) ?? [],
      ).filter((el) => el.offsetParent !== null);
    focusable()[0]?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close();
      if (e.key === 'Tab') {
        const items = focusable(),
          first = items[0],
          last = items.at(-1);
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last?.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first?.focus();
        }
      }
    };
    document.addEventListener('keydown', onKey);
    const oldOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = oldOverflow;
      previous?.focus();
    };
  }, []);
  const targets = ctx.s.territories.filter(
    (t) =>
      !t.capital &&
      !t.contestedToday &&
      t.owner !== attacker &&
      t.neighbors.some((id) => ctx.s.territories.find((t) => t.id === id)?.owner === attacker),
  );
  const targetIds = targets.map((t) => t.id).join(',');
  useEffect(() => {
    if (!targets.some((t) => t.id === territory)) setTerritory(targets[0]?.id ?? '');
  }, [attacker, targetIds]);
  const item = ctx.hero?.gear?.find((g) => g.id === modal.item),
    def = ITEMS.find((i) => i.id === modal.item);
  const titles: Record<NonNullable<ModalState>['kind'], [string, string]> = {
    chapter: [
      'A chapter worth gathering for.',
      'Choose a border. Your citizens choose what happens next.',
    ],
    announcement: ['A word to your people.', 'A public campaign announcement, written by you.'],
    join: [
      'Every story needs a first step.',
      'Create a clearly simulated adventurer and find your people.',
    ],
    class: [
      'Choose your path.',
      'Three identities. Equal composite power. Your story, your style.',
    ],
    scenario: [
      'Another world is a click away.',
      'Replace only your synthetic world with a reproducible beginning.',
    ],
    upgrade: [
      'A little stronger for the journey.',
      'Spend earned gold. Gain a permanent equipment upgrade.',
    ],
    buy: ['Something for your next adventure.', 'Add a new sidegrade to your collection.'],
    dismiss: ['A seat on the council.', 'A streamer safety action, with a public reason.'],
    help: [
      'The adventurer’s field guide.',
      'A complete progression loop, right inside Twitch chat.',
    ],
  };
  async function submit() {
    let result: any;
    if (modal.kind === 'chapter') {
      result = await ctx.run(
        () => ctx.action('chapters', { attacker, territory, seconds }),
        'The council is open. Citizens can pledge and vote.',
      );
      if (result) {
        ctx.setBattle(result.id);
        ctx.go('battles');
      }
    }
    if (modal.kind === 'announcement')
      result = await ctx.run(
        () => ctx.action('announcement', { text }),
        'Your announcement is in the chronicle. Chat publishing follows your output settings.',
      );
    if (modal.kind === 'join') {
      result = await ctx.run(
        () =>
          ctx.action('commands', { type: 'join', argument: kingdom, persona: newPersona.current }),
        'Your adventure has begun.',
      );
      if (result?.characterId) {
        ctx.setPersona(result.characterId);
        ctx.go('character');
      }
    }
    if (modal.kind === 'class') result = await ctx.command('class', choice);
    if (modal.kind === 'scenario') {
      result = await ctx.run(
        () => ctx.action('scenarios/load', { scenario: selection, confirm: text }),
        'A fresh simulated chapter is ready.',
      );
      if (result) {
        ctx.setPersona(selection === 'first-citizen' ? 'new-citizen' : 'sim-0001');
        ctx.go('overview');
      }
    }
    if (modal.kind === 'upgrade') result = await ctx.command('upgrade', modal.item);
    if (modal.kind === 'buy') result = await ctx.command('buy', modal.item);
    if (modal.kind === 'dismiss')
      result = await ctx.run(
        () => ctx.action('lords/dismiss', { kingdom: modal.faction, reason: text }),
        'The council seat is now vacant.',
      );
    if (result) close();
  }
  const disabled =
    ctx.busy ||
    (modal.kind === 'chapter' && !territory) ||
    (modal.kind === 'scenario' && text !== 'RESET SIMULATION') ||
    (['announcement', 'dismiss'].includes(modal.kind) && text.trim().length < 5);
  return (
    <div
      className="modal-backdrop"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) close();
      }}
    >
      <div
        className={`modal ${modal.kind === 'help' ? 'wide' : ''}`}
        ref={dialog}
        role="dialog"
        aria-modal="true"
        aria-labelledby="modal-title"
      >
        <button className="modal-close" aria-label="Close dialog" onClick={close}>
          <X size={19} />
        </button>
        <span className="eyebrow">
          <Crown size={13} /> THE WORLD IS YOURS TO SHAPE
        </span>
        <h2 id="modal-title">{titles[modal.kind][0]}</h2>
        <p className="modal-description">{titles[modal.kind][1]}</p>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void submit();
          }}
        >
          {modal.kind === 'chapter' && (
            <>
              <label htmlFor="attacker">The challenging banner</label>
              <select
                id="attacker"
                value={attacker}
                onChange={(e) => setAttacker(e.target.value as Faction)}
              >
                {ctx.s.kingdoms.map((k) => (
                  <option key={k.id} value={k.id}>
                    {k.name}
                  </option>
                ))}
              </select>
              <label htmlFor="territory">An adjacent, enemy-held border</label>
              <select
                id="territory"
                value={territory}
                onChange={(e) => setTerritory(e.target.value)}
              >
                {targets.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name} · {FACTIONS[t.owner].name}
                  </option>
                ))}
                {!targets.length && <option value="">No eligible borders</option>}
              </select>
              <label htmlFor="seconds">Council duration</label>
              <select
                id="seconds"
                value={seconds}
                onChange={(e) => setSeconds(Number(e.target.value))}
              >
                <option value="30">30 seconds · quick chapter</option>
                <option value="60">60 seconds · recommended</option>
                <option value="120">2 minutes · a little more time</option>
                <option value="180">3 minutes · a grand gathering</option>
              </select>
              <div className="info-callout">
                <ShieldCheck size={18} />
                <p>
                  Citizens pledge and vote. At lock, both sides need at least one pledge. Rewards
                  and territory settle once; the 2D replay shows the recorded result.
                </p>
              </div>
            </>
          )}
          {modal.kind === 'announcement' && (
            <>
              <label htmlFor="announcement">Your announcement</label>
              <textarea
                id="announcement"
                value={text}
                onChange={(e) => setText(e.target.value)}
                maxLength={280}
                rows={5}
                placeholder="Adventurers, a new chapter awaits…"
                required
              />
              <small className="muted">
                {text.length}/280 · Source: streamer ·{' '}
                {ctx.s.settings.chatOutput && !ctx.s.settings.quiet
                  ? 'Live chat publishing enabled'
                  : 'Chronicle only while chat output is off or quiet'}
              </small>
            </>
          )}
          {modal.kind === 'join' && (
            <>
              <label>Your banner</label>
              <div className="join-factions">
                {ctx.s.kingdoms.map((k) => (
                  <button
                    type="button"
                    key={k.id}
                    className={kingdom === k.id ? 'selected' : ''}
                    onClick={() => setKingdom(k.id)}
                  >
                    <Crest faction={k.id} size={38} />
                    <strong>{k.name}</strong>
                    <small>{k.subtitle}</small>
                  </button>
                ))}
              </div>
              <div className="info-callout">
                <FlaskConical size={18} />
                <p>
                  This is a new synthetic persona. Real viewers join with{' '}
                  <code>!join {kingdom}</code> in the authorized Twitch chat.
                </p>
              </div>
            </>
          )}
          {modal.kind === 'class' && (
            <div className="class-choices">
              {Object.keys(CLASSES).map((c) => (
                <button
                  type="button"
                  key={c}
                  className={choice === c ? 'selected' : ''}
                  onClick={() => setChoice(c)}
                >
                  <ClassIcon name={c} size={25} />
                  <span>
                    <strong>{c}</strong>
                    <small>
                      {c === 'vanguard'
                        ? 'Steadfast. A home behind your shield.'
                        : c === 'ranger'
                          ? 'Resourceful. Always another path.'
                          : 'Quick-footed. Courage in the shadows.'}
                    </small>
                  </span>
                  {choice === c && <Check size={17} />}
                </button>
              ))}
            </div>
          )}
          {modal.kind === 'scenario' && (
            <>
              <label htmlFor="scenario">Choose a beginning</label>
              <select
                id="scenario"
                value={selection}
                onChange={(e) => setSelection(e.target.value)}
              >
                {SCENARIOS.map((s) => (
                  <option value={s.id} key={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
              <p className="muted">{SCENARIOS.find((s) => s.id === selection)?.description}</p>
              <div className="info-callout danger">
                <RefreshCw size={18} />
                <p>
                  All current Simulation progress will be replaced. Live data and Twitch
                  authorization are untouched.
                </p>
              </div>
              <label htmlFor="confirmation">Type RESET SIMULATION to continue</label>
              <input
                id="confirmation"
                value={text}
                autoComplete="off"
                onChange={(e) => setText(e.target.value)}
              />
            </>
          )}
          {modal.kind === 'upgrade' && item && ctx.hero && (
            <>
              <div className="upgrade-preview">
                <div className={`item-art ${item.slot}`}>
                  <ItemIcon icon={item.icon} size={35} />
                </div>
                <h3>{item.name}</h3>
                <div>
                  <span>+{item.upgrade}</span>
                  <ArrowRight size={20} />
                  <strong>+{item.upgrade + 1}</strong>
                </div>
                <p>
                  {item.bonus} →{' '}
                  {item.slot === 'weapon'
                    ? `+${4 + (item.upgrade + 1) * 2} Attack`
                    : item.slot === 'armor'
                      ? `+${3 + (item.upgrade + 1) * 2} Defense`
                      : `+${10 + (item.upgrade + 1) * 5} Health`}
                </p>
              </div>
              <dl className="detail-list">
                <div>
                  <dt>Upgrade cost</dt>
                  <dd>
                    <Gold amount={item.cost} />
                  </dd>
                </div>
                <div>
                  <dt>Your gold after upgrade</dt>
                  <dd>
                    <Gold amount={ctx.hero.gold - item.cost} />
                  </dd>
                </div>
              </dl>
              <p className="muted small">
                Frozen battle inputs stay unchanged. Your next chapter uses the new equipment.
              </p>
            </>
          )}
          {modal.kind === 'buy' && def && (
            <>
              <div className="upgrade-preview">
                <div className={`item-art ${def.slot}`}>
                  <ItemIcon icon={def.icon} size={35} />
                </div>
                <h3>{def.name}</h3>
                <p>{def.flavor}</p>
                <Gold amount={def.cost} />
              </div>
              <p className="muted">
                Sidegrade equipment gives you a different style, with the same base strength in its
                slot. Equip it from your inventory after buying.
              </p>
            </>
          )}
          {modal.kind === 'dismiss' && (
            <>
              <label htmlFor="reason">Public reason</label>
              <textarea
                id="reason"
                rows={4}
                maxLength={180}
                value={text}
                onChange={(e) => setText(e.target.value)}
                placeholder="Explain the safety or community reason…"
                required
              />
              <p className="muted small">
                This ends the current Lord’s term. It grants no equipment, XP, gold or special
                voting rights.
              </p>
            </>
          )}
          {modal.kind === 'help' && (
            <>
              <div className="help-command-list">
                {[
                  ['!join north|east|west', 'Find your kingdom and receive starter equipment.'],
                  ['!class vanguard|ranger|rogue', 'Choose your character’s identity.'],
                  ['!profile / !stats / !level', 'Check your XP, gold, class and effective stats.'],
                  ['!pledge', 'Stand with your kingdom in the current chapter.'],
                  ['!vote attack|defend|raid', 'Choose your side’s tactic. Change it before lock.'],
                  ['!inventory / !shop', 'See your gear and available sidegrades.'],
                  ['!buy item-id / !equip item-id', 'Buy and equip equipment using earned gold.'],
                  [
                    '!upgrade item-id',
                    'Preview the item in your profile; spend gold to strengthen it.',
                  ],
                  [
                    '!nominate / !elect candidate-id',
                    'Stand for Lord or cast an equal election ballot.',
                  ],
                  ['!kingdom / !leaderboard', 'See your community’s place in the season.'],
                  ['!cv help', 'Namespaced commands also work: !cv join north.'],
                ].map(([command, description]) => (
                  <div key={command}>
                    <code>{command}</code>
                    <span>{description}</span>
                  </div>
                ))}
              </div>
              <div className="info-callout">
                <ShieldCheck size={19} />
                <p>
                  No spam XP, paid power, real-money currency or automatic game kills. Your
                  contributions drive a transparent, persistent campaign.
                </p>
              </div>
            </>
          )}
          <div className="modal-actions">
            <Button type="button" onClick={close}>
              {modal.kind === 'help' ? 'Back to the realm' : 'Cancel'}
            </Button>
            {modal.kind !== 'help' && (
              <Button
                variant={
                  modal.kind === 'scenario' || modal.kind === 'dismiss' ? 'danger' : 'primary'
                }
                disabled={disabled}
                type="submit"
              >
                {ctx.busy ? (
                  <LoaderCircle size={15} className="spin" />
                ) : modal.kind === 'chapter' ? (
                  <Swords size={15} />
                ) : (
                  <Check size={15} />
                )}{' '}
                {modal.kind === 'chapter'
                  ? 'Open the council'
                  : modal.kind === 'scenario'
                    ? 'Reset Simulation'
                    : modal.kind === 'upgrade'
                      ? 'Confirm upgrade'
                      : modal.kind === 'buy'
                        ? 'Buy equipment'
                        : modal.kind === 'announcement'
                          ? 'Publish announcement'
                          : modal.kind === 'dismiss'
                            ? 'End Lord’s term'
                            : modal.kind === 'join'
                              ? 'Begin adventure'
                              : 'Choose this path'}
              </Button>
            )}
          </div>
        </form>
      </div>
    </div>
  );
}
