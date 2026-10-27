import { useEffect, useId, useState, type CSSProperties } from 'react';
import {
  ArrowRight,
  Compass,
  Globe2,
  Search,
  Users,
  Flag,
  Crown,
  Swords,
  Map,
  RefreshCw,
} from 'lucide-react';
import type { Mode } from '../shared/types';
import type { AtlasSnapshot, AtlasRealm } from '../shared/realms';
import { realmRequest } from './api';
import { Crest } from './WorldMap';
import { Button, Panel, num } from './ui';

export function WorldAtlas({
  mode,
  realmId,
  openRealm,
  busy,
  now,
}: {
  mode: Mode;
  realmId: string;
  openRealm: (id: string) => void;
  busy: boolean;
  now: number;
}) {
  const [data, setData] = useState<AtlasSnapshot | null>(null),
    [error, setError] = useState(''),
    [selected, setSelected] = useState(realmId),
    [search, setSearch] = useState(''),
    [sort, setSort] = useState('name'),
    [refresh, setRefresh] = useState(0);
  useEffect(() => {
    let active = true;
    realmRequest<AtlasSnapshot>(`/api/${mode}/atlas`, realmId)
      .then((result) => {
        if (active) {
          setData(result);
          setError('');
        }
      })
      .catch((err) => {
        if (active) setError(err.message);
      });
    return () => {
      active = false;
    };
  }, [mode, realmId, now, refresh]);
  if (!data)
    return (
      <Panel className="atlas-loading">
        <Globe2 size={35} />
        <h2>Unfolding the wider world…</h2>
        {error && (
          <>
            <p role="alert">{error}</p>
            <Button onClick={() => setRefresh((n) => n + 1)}>Try again</Button>
          </>
        )}
      </Panel>
    );
  const current = data.realms.find((r) => r.id === selected) ?? data.realms[0];
  const realms = data.realms
    .filter((r) => (r.name + ' ' + r.streamer).toLowerCase().includes(search.toLowerCase()))
    .sort((a, b) =>
      sort === 'population' ? b.citizens - a.citizens : a.name.localeCompare(b.name),
    );
  const citizens = data.realms.reduce((n, r) => n + r.citizens, 0),
    kingdoms = data.realms.reduce((n, r) => n + r.kingdoms.length, 0);
  const inspectRealm = (id: string, showDetail = false) => {
    setSelected(id);
    if (showDetail)
      document
        .getElementById('atlas-realm-detail')
        ?.scrollIntoView({
          behavior: window.matchMedia('(prefers-reduced-motion:reduce)').matches
            ? 'instant'
            : 'smooth',
          block: 'start',
        });
  };
  return (
    <div className="atlas-page">
      <div className="atlas-intro">
        <div>
          <span className="eyebrow">THE WORLD ATLAS</span>
          <h1>The Shattered Reaches</h1>
          <p>
            Beyond your borders, another community is writing its story. Find a realm, meet its
            kingdoms, and step inside.
          </p>
        </div>
        <div className="atlas-totals">
          <div>
            <strong>{data.realms.length.toString().padStart(2, '0')}</strong>
            <span>Streamer realms</span>
          </div>
          <div>
            <strong>{num(citizens)}</strong>
            <span>Citizens</span>
          </div>
          <div>
            <strong>{kingdoms}</strong>
            <span>Kingdoms</span>
          </div>
        </div>
      </div>
      <div className="atlas-source">
        <Globe2 size={15} />
        <span>
          {mode === 'simulation'
            ? 'SIMULATED WORLD · All creators and citizens are fictional. Each realm has its own persistent world.'
            : 'LIVE ATLAS · Only your authorized channel is available. Explore neighboring demo realms in Simulation.'}
        </span>
      </div>
      {error && (
        <p className="connection-alert" role="alert">
          The atlas could not refresh: {error}. Previously loaded information may be out of date.
        </p>
      )}
      <div className="atlas-layout">
        <Panel className="atlas-map-panel">
          <div className="atlas-map-heading">
            <div>
              <span className="eyebrow">WORLD ATLAS</span>
              <h3>The lands between our stories</h3>
            </div>
            <Button onClick={() => setRefresh((n) => n + 1)} aria-label="Refresh world atlas">
              <RefreshCw size={14} />
            </Button>
          </div>
          <div className="atlas-pan-hint">Swipe the map to explore neighboring realms.</div>
          <div className="atlas-map-scroll">
            <AtlasMap
              realms={data.realms}
              selected={current.id}
              home={realmId}
              onSelect={(id) => inspectRealm(id, window.innerWidth <= 1100)}
            />
          </div>
          <div className="atlas-map-legend">
            <span>
              <i />A streamer’s realm
            </span>
            <span>Three kingdoms within each realm</span>
            <small>Select a banner to explore</small>
          </div>
        </Panel>
        <Panel
          id="atlas-realm-detail"
          className={'atlas-inspector theme-' + current.theme}
          style={{ '--realm-accent': current.color } as CSSProperties}
        >
          <div className="atlas-realm-art">
            <span className="atlas-large-sigil">{current.sigil}</span>
            <span className="eyebrow">
              {current.synthetic ? 'SIMULATED STREAMER REALM' : 'YOUR TWITCH REALM'}
            </span>
          </div>
          <div className="atlas-inspector-body">
            <span className="realm-streamer">{current.streamer}</span>
            <h2>{current.name}</h2>
            <p>{current.description}</p>
            <div className="atlas-realm-numbers">
              <span>
                <Users size={14} />
                {num(current.citizens)} citizens
              </span>
              <span>
                <Flag size={14} />
                {current.territories} territories
              </span>
            </div>
            <div className="atlas-kingdoms">
              {current.kingdoms.map((k) => (
                <div key={k.id}>
                  <Crest faction={k.id} size={26} />
                  <span>
                    <strong>{k.name}</strong>
                    <small>
                      {num(k.citizens)} citizens ·{' '}
                      {k.lord ? 'Lord ' + k.lord : 'Lord’s seat vacant'}
                    </small>
                  </span>
                </div>
              ))}
            </div>
            <div className="atlas-discovery">
              <span>
                Frontiers discovered{' '}
                <b>
                  {current.discovered}/{current.maxOutposts}
                </b>
              </span>
              <progress
                value={current.discovered}
                max={current.maxOutposts}
                aria-label={current.name + ' discovered outposts'}
              />
              <small>New citizens reveal outposts and strengthen kingdom fortresses.</small>
            </div>
            <Button
              variant="primary"
              className="full"
              disabled={busy}
              onClick={() => openRealm(current.id)}
            >
              <Map size={15} />
              {current.id === realmId ? 'Return to ' + current.name : 'Enter ' + current.name}
              <ArrowRight size={14} />
            </Button>
            <small className="atlas-isolation">
              Characters, gold, Lords and battles belong to this realm.
            </small>
          </div>
        </Panel>
      </div>
      <div className="atlas-directory-heading">
        <div>
          <span className="eyebrow">COMMUNITIES OF THE REACHES</span>
          <h2>A home beyond every horizon.</h2>
        </div>
        <div className="atlas-filters">
          <label>
            <Search size={15} />
            <input
              aria-label="Search streamer realms"
              placeholder="Find a realm or creator…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </label>
          <select
            aria-label="Sort streamer realms"
            value={sort}
            onChange={(e) => setSort(e.target.value)}
          >
            <option value="name">Realm name</option>
            <option value="population">Most citizens</option>
          </select>
        </div>
      </div>
      <div className="atlas-realm-grid">
        {realms.map((r) => (
          <article
            key={r.id}
            className={'realm-card theme-' + r.theme + (r.id === realmId ? ' current-realm' : '')}
            style={{ '--realm-accent': r.color } as CSSProperties}
          >
            <button
              className="realm-card-cover"
              aria-label={'Inspect ' + r.name + ' details'}
              onClick={() => inspectRealm(r.id, true)}
            >
              <span className="realm-card-source">
                {r.synthetic ? 'SIMULATION' : 'YOUR CHANNEL'}
              </span>
              <span className="realm-card-sigil">{r.sigil}</span>
              {r.id === realmId && <span className="realm-current-label">YOUR CURRENT REALM</span>}
            </button>
            <div className="realm-card-body">
              <span className="realm-streamer">{r.streamer}</span>
              <h3>{r.name}</h3>
              <p>{r.description}</p>
              <div className="realm-card-stats">
                <span>
                  <Users size={13} />
                  {num(r.citizens)}
                </span>
                <span>
                  <Flag size={13} />
                  {r.territories} lands
                </span>
                <span>
                  <Crown size={13} />
                  {r.kingdoms.length} kingdoms
                </span>
              </div>
              <div className="realm-card-chapter">
                {r.currentBattle ? <Swords size={13} /> : <Compass size={13} />}
                <span>
                  {r.currentBattle
                    ? 'A council is gathering'
                    : (r.latestEvent ?? 'A new realm awaits its first citizen')}
                </span>
              </div>
              <Button
                className="full"
                disabled={busy}
                onClick={() => openRealm(r.id)}
                aria-label={'Open ' + r.name + ' map'}
              >
                Explore realm
                <ArrowRight size={14} />
              </Button>
            </div>
          </article>
        ))}
      </div>
      {!realms.length && (
        <Panel className="atlas-empty">
          <h3>No realms match that search.</h3>
          <Button onClick={() => setSearch('')}>Show all realms</Button>
        </Panel>
      )}
    </div>
  );
}
function AtlasMap({
  realms,
  selected,
  home,
  onSelect,
}: {
  realms: AtlasRealm[];
  selected: string;
  home: string;
  onSelect: (id: string) => void;
}) {
  const prefix = useId().replaceAll(':', '');
  return (
    <div className="reaches-map">
      <svg viewBox="0 0 1200 720" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
        <defs>
          <radialGradient id={prefix + 'sea'}>
            <stop stopColor="#223741" />
            <stop offset="1" stopColor="#0c1724" />
          </radialGradient>
          <pattern id={prefix + 'grid'} width="60" height="60" patternUnits="userSpaceOnUse">
            <path d="M60 0H0v60" fill="none" stroke="#bdd0cf" strokeOpacity=".045" />
          </pattern>
          {realms.map((r) => (
            <radialGradient id={prefix + r.id} key={r.id}>
              <stop stopColor={r.color} stopOpacity=".40" />
              <stop offset="1" stopColor={r.color} stopOpacity=".09" />
            </radialGradient>
          ))}
        </defs>
        <rect width="1200" height="720" fill={'url(#' + prefix + 'sea)'} />
        <rect width="1200" height="720" fill={'url(#' + prefix + 'grid)'} />
        {Array.from({ length: 9 }, (_, i) => (
          <path
            key={i}
            d={`M-20 ${90 + i * 70} Q260 ${i * 60} 570 ${110 + i * 65} T1250 ${30 + i * 85}`}
            fill="none"
            stroke="#9bb2bb"
            strokeOpacity=".045"
            strokeWidth="1"
          />
        ))}
        {realms.length > 1 && (
          <g className="atlas-trade-routes">
            <path
              d="M288 230Q530 95 828 194M288 230Q165 440 372 554M828 194Q1080 345 924 526M372 554Q650 680 924 526"
              fill="none"
              stroke="#c4ad7d"
              strokeWidth="1.2"
              strokeDasharray="3 8"
              opacity=".45"
            />
          </g>
        )}
        {realms.map((r, index) => (
          <g
            key={r.id}
            transform={`translate(${r.x * 12} ${r.y * 7.2}) scale(${1 + r.discovered * 0.015})`}
          >
            <path
              d="M-172-30-152-93-103-111-79-146-18-132 18-148 56-126 119-121 148-74 173-51 163 0 180 39 143 69 128 112 63 119 21 148-21 128-78 141-107 99-157 79-145 22Z"
              fill={'url(#' + prefix + r.id + ')'}
              stroke={r.id === selected ? r.color : r.color + '66'}
              strokeWidth={r.id === selected ? 2 : 1}
            />
            <path
              d="M-180-34-160-100-108-119-82-155-18-141 19-157 60-134 125-129 158-78 183-53 174 0 191 42 151 76 135 121 66 129 21 158-25 138-83 151-115 107-169 85-157 19Z"
              fill="none"
              stroke={r.color}
              opacity=".14"
            />
            {Array.from({ length: 13 }, (_, i) => {
              const x = -120 + ((i * 57 + index * 13) % 240),
                y = -106 + ((i * 29) % 200);
              return (
                <g key={i} opacity=".42">
                  <path d={`M${x - 10} ${y + 12}l10-22 12 22Z`} fill={r.color} opacity=".25" />
                  <path
                    d={`M${x - 3} ${y - 4}l3-6 4 6`}
                    fill="none"
                    stroke={r.color}
                    strokeWidth=".8"
                  />
                </g>
              );
            })}
            <path
              d="M-116-88Q-42-26-65 39T6 120"
              stroke={r.color}
              fill="none"
              opacity=".2"
              strokeWidth="2"
            />
            {r.kingdoms.map((k, i) => (
              <g key={k.id} transform={`translate(${-70 + i * 70} 122)`}>
                <circle r="5" fill={k.color} stroke="#091623" strokeWidth="3" />
              </g>
            ))}
          </g>
        ))}
        <g transform="translate(1110 78)" stroke="#c4b38a" fill="none" opacity=".6">
          <path d="M0-25V25M-25 0H25M0-25-5-6 0-10 5-6Z" />
          <circle r="18" strokeWidth=".5" />
          <text y="-33" textAnchor="middle" fill="#c4b38a" stroke="none" fontSize="9">
            N
          </text>
        </g>
        <text x="50" y="666" fill="#bfaf8c" fontSize="12" letterSpacing="7">
          THE SHATTERED REACHES
        </text>
        <text x="50" y="686" fill="#7e929c" fontSize="8" letterSpacing="3">
          A WORLD BUILT BY ITS PEOPLE
        </text>
      </svg>
      {realms.map((r) => (
        <button
          key={r.id}
          className={'atlas-map-node ' + (r.id === selected ? 'selected' : '')}
          style={{ left: r.x + '%', top: r.y + '%', '--realm-accent': r.color } as CSSProperties}
          aria-label={'Inspect ' + r.name + ' on world atlas'}
          aria-pressed={r.id === selected}
          onClick={() => onSelect(r.id)}
        >
          <span className="atlas-node-sigil">{r.sigil}</span>
          <strong>{r.name}</strong>
          <small>{r.streamer}</small>
          <span className="atlas-node-population">
            {num(r.citizens)} citizens{r.id === home ? ' · Current realm' : ''}
          </span>
        </button>
      ))}
    </div>
  );
}
