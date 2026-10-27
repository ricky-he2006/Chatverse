import { useId } from 'react';
import { WORLD_TERRITORIES } from '../shared/expansion';
import { FACTIONS, TERRITORIES } from '../shared/catalog';
import type { Faction, Territory } from '../shared/types';

export function Crest({ faction = 'north', size = 36 }: { faction?: Faction; size?: number }) {
  const color = FACTIONS[faction].color;
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 48 56"
      className="crest"
      aria-label={`${faction} crest`}
    >
      <path
        d="M5 4h38v28C43 45 24 53 24 53S5 45 5 32Z"
        fill={`${color}15`}
        stroke={color}
        strokeWidth="1.5"
      />
      <path
        d="M9 8h30v23c0 9-15 17-15 17S9 40 9 31Z"
        fill="none"
        stroke={color}
        strokeOpacity=".3"
      />
      {faction === 'north' ? (
        <path d="m24 13 4 9 10 1-8 7 3 10-9-6-9 6 3-10-8-7 10-1Z" fill={color} />
      ) : faction === 'east' ? (
        <>
          <circle cx="24" cy="27" r="7" fill={color} />
          {Array.from({ length: 8 }, (_, i) => (
            <path
              key={i}
              transform={`rotate(${i * 45} 24 27)`}
              d="M24 12v5"
              stroke={color}
              strokeWidth="2"
            />
          ))}
        </>
      ) : (
        <path d="M30 13a14 14 0 1 0 7 24A15 15 0 0 1 30 13Z" fill={color} />
      )}
    </svg>
  );
}
export function WorldMap({
  territories,
  onSelect,
  selected,
  compact = false,
  realmName = 'Everfall',
}: {
  territories: Territory[];
  onSelect?: (id: string) => void;
  selected?: string;
  compact?: boolean;
  realmName?: string;
}) {
  const map = territories.length ? territories : TERRITORIES;
  return (
    <div className={`scenic-atlas ${compact ? 'compact' : ''}`}>
      <img
        src="/everfall-realms-v2.png"
        alt={`Snowbound North, sunlit East and moonlit West surround the lake of ${realmName}`}
      />
      <svg
        viewBox="0 0 1000 360"
        preserveAspectRatio="none"
        className="scenic-routes"
        aria-hidden="true"
      >
        {map.flatMap((t) =>
          t.neighbors
            .filter((id) => id > t.id)
            .map((id) => {
              const n = map.find((n) => n.id === id);
              if (!n) return null;
              return (
                <line
                  key={t.id + id}
                  x1={t.x * 10}
                  y1={t.y * 3.6}
                  x2={n.x * 10}
                  y2={n.y * 3.6}
                  stroke={FACTIONS[t.owner].color}
                />
              );
            }),
        )}
      </svg>
      {WORLD_TERRITORIES.map((blueprint) => {
        const t = map.find((t) => t.id === blueprint.id);
        if (!t)
          return (
            !compact && (
              <div
                key={blueprint.id}
                className="frontier-fog"
                style={{ left: blueprint.x + '%', top: blueprint.y + '%' }}
              >
                <span>◇</span>
                <small>{blueprint.unlockAt} citizens</small>
                <strong>{blueprint.name}</strong>
              </div>
            )
          );
        return (
          <button
            key={t.id}
            className={`settlement ${t.capital ? 'capital' : ''} ${selected === t.id ? 'selected' : ''}`}
            style={
              {
                left: blueprint.x + '%',
                top: blueprint.y + '%',
                '--settlement': FACTIONS[t.owner].color,
              } as import('react').CSSProperties
            }
            onClick={() => onSelect?.(t.id)}
            disabled={!onSelect}
            aria-pressed={onSelect ? selected === t.id : undefined}
            aria-label={
              t.name + ', ' + FACTIONS[t.owner].name + (t.capital ? ', protected capital' : '')
            }
          >
            <span className="settlement-pin">{t.capital ? '♜' : '◆'}</span>
            <strong>{t.name}</strong>
            {!compact && <small>{t.capital ? 'PROTECTED CAPITAL' : 'OPEN FRONTIER'}</small>}
          </button>
        );
      })}
      <div className="atlas-caption">
        {realmName.toUpperCase()} <span>A world built by its people</span>
      </div>
    </div>
  );
}
function Castle({
  x,
  y,
  color,
  scale = 1,
}: {
  x: number;
  y: number;
  color: string;
  scale?: number;
}) {
  return (
    <g transform={`translate(${x} ${y}) scale(${scale})`}>
      <ellipse cy="12" rx="28" ry="8" fill="#000" opacity=".25" />
      <path
        d="M-22 10v-29h8v5h5v-5h7v29M4 10v-39h7v5h5v-5h7v39"
        fill="#465564"
        stroke="#8c9b9a"
        strokeWidth="1"
      />
      <path d="M-17-20v-9l7-10 7 10v9M5-30v-12l9-15 10 15v12" fill={color} />
      <path d="M-10 10v-27h23v27" fill="#687473" stroke="#9ba09a" />
      <path d="M-7-17 2-29l11 12" fill={color} />
      <path d="M-2 10V1a4 4 0 0 1 8 0v9" fill="#1b2730" />
      <path d="M13-57v-13l13 4-13 4" fill={color} />
      <path d="M13-70v16" stroke="#cad2ca" />
      <path d="M-19-8h3m27-9h3" stroke="#e8c678" strokeWidth="3" />
    </g>
  );
}

export function RealmArtwork() {
  return (
    <img
      className="landscape realm-artwork"
      src="/everfall-realms-v2.png"
      width={2172}
      height={724}
      alt=""
      decoding="async"
      fetchPriority="high"
    />
  );
}
export function Landscape() {
  const id = useId().replaceAll(':', '');
  return (
    <svg
      className="landscape"
      viewBox="0 0 1000 290"
      preserveAspectRatio="xMidYMid slice"
      aria-hidden="true"
    >
      <defs>
        <linearGradient id={id} x2="0" y2="1">
          <stop stopColor="#243548" />
          <stop offset="1" stopColor="#182b35" />
        </linearGradient>
        <radialGradient id={`${id}sun`}>
          <stop stopColor="#c3ad7f" stopOpacity=".3" />
          <stop offset="1" stopColor="#c3ad7f" stopOpacity="0" />
        </radialGradient>
      </defs>
      <rect width="1000" height="290" fill={`url(#${id})`} />
      <circle cx="785" cy="78" r="110" fill={`url(#${id}sun)`} />
      <circle cx="785" cy="78" r="29" fill="#c6b488" opacity=".35" />
      <path
        d="m210 230 160-100 80 40 125-120 90 84 100-70 145 141 90-50v135H0Z"
        fill="#46545a"
        opacity=".55"
      />
      <path d="m500 214 76-163 37 60-21-7-15 15-8-24-36 99Z" fill="#84908c" opacity=".25" />
      <path d="m420 235 170-70 120 55 100-69 190 54v85H300Z" fill="#273d42" />
      <g transform="translate(782 183) scale(1.8)">
        <Castle x={0} y={0} color="#8b9eaa" scale={1} />
      </g>
      <path d="M600 290q98-70 186-77l30 77" fill="#566362" opacity=".45" />
      <path d="M0 250q200-60 370 10t300-5l330 10v25H0Z" fill="#182d30" />
      {Array.from({ length: 22 }, (_, i) => {
        const x = 370 + i * 33,
          y = 217 + ((i * 7) % 37);
        return (
          <path
            key={i}
            d={`M${x} ${y - 25}l-12 27h7l-12 20h34l-12-20h7Z`}
            fill="#14272b"
            opacity=".8"
          />
        );
      })}
    </svg>
  );
}
