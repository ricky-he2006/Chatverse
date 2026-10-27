import { useId, useState } from 'react';
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
const regions: Record<string, string> = {
  northhold: '185,25 430,30 505,100 450,180 335,192 225,150 140,90',
  frostpass: '140,90 225,150 335,192 368,262 280,294 167,248 82,205',
  eastkeep: '600,75 757,100 805,205 745,286 650,245 590,180',
  sunreach: '505,100 600,75 590,180 650,245 578,319 489,270 450,180',
  westspire: '75,322 167,248 280,294 277,390 180,462 50,435 27,375',
  shadegrove: '280,294 368,262 489,270 449,378 345,431 277,390',
  crossroads: '335,192 450,180 489,270 368,262',
};
export function WorldMap({
  territories,
  onSelect,
  selected,
  compact = false,
}: {
  territories: Territory[];
  onSelect?: (id: string) => void;
  selected?: string;
  compact?: boolean;
}) {
  const prefix = useId().replaceAll(':', '');
  const [hovered, setHovered] = useState<string | null>(null);
  const map: Territory[] = territories.length ? territories : TERRITORIES;
  const active = map.find((territory) => territory.id === (hovered ?? selected));
  const points: Record<string, [number, number]> = {
    northhold: [340, 100],
    frostpass: [245, 221],
    eastkeep: [693, 182],
    sunreach: [549, 230],
    westspire: [147, 365],
    shadegrove: [354, 342],
    crossroads: [408, 231],
  };
  return (
    <svg
      viewBox="0 0 840 480"
      className={`world-svg ${compact ? 'compact' : ''}`}
      role={onSelect ? 'group' : 'img'}
      aria-label="The seven territories of Everfall. North, East and West compete for the borders."
    >
      <defs>
        <linearGradient id={`${prefix}sea`} x2="0" y2="1">
          <stop stopColor="#192b3a" />
          <stop offset="1" stopColor="#0e1c28" />
        </linearGradient>
        <radialGradient id={`${prefix}glow`}>
          <stop stopColor="#ad996a" stopOpacity=".12" />
          <stop offset="1" stopColor="#ad996a" stopOpacity="0" />
        </radialGradient>
        <pattern id={`${prefix}grid`} width="40" height="40" patternUnits="userSpaceOnUse">
          <path d="M40 0H0v40" fill="none" stroke="#71889a" strokeOpacity=".04" />
        </pattern>
        <pattern id={`${prefix}terrain`} width="85" height="70" patternUnits="userSpaceOnUse">
          <path
            d="M-10 31C9 8 24 12 40 27S74 49 95 25M-10 40C9 17 24 21 40 36S74 58 95 34M-10 49C9 26 24 30 40 45S74 67 95 43"
            fill="none"
            stroke="#d5cd9b"
            strokeWidth=".55"
            opacity=".16"
          />
        </pattern>
        {(['north', 'east', 'west'] as Faction[]).map((faction) => (
          <linearGradient key={faction} id={`${prefix}land-${faction}`} x2=".8" y2="1">
            <stop
              stopColor={
                faction === 'north' ? '#48676d' : faction === 'east' ? '#795c41' : '#5c506c'
              }
            />
            <stop
              offset="1"
              stopColor={
                faction === 'north' ? '#253f46' : faction === 'east' ? '#453c31' : '#343447'
              }
            />
          </linearGradient>
        ))}
        <filter id={`${prefix}shadow`}>
          <feDropShadow dx="0" dy="5" stdDeviation="5" floodOpacity=".3" />
        </filter>
      </defs>
      <rect width="840" height="480" fill={`url(#${prefix}sea)`} />
      <rect width="840" height="480" fill={`url(#${prefix}grid)`} />
      <ellipse cx="425" cy="239" rx="390" ry="225" fill={`url(#${prefix}glow)`} />
      <g className="land-regions">
        {map.map((t) => (
          <polygon
            key={t.id}
            points={regions[t.id]}
            fill={`url(#${prefix}land-${t.owner})`}
            stroke={active?.id === t.id ? '#f0d8a2' : FACTIONS[t.owner].color}
            strokeWidth={active?.id === t.id ? 2.5 : 0.8}
            strokeOpacity={active?.id === t.id ? 1 : 0.45}
            className={onSelect ? 'map-region' : ''}
            tabIndex={onSelect ? 0 : undefined}
            role={onSelect ? 'button' : undefined}
            aria-label={`${t.name}, ${t.owner}${t.capital ? ', capital' : ''}`}
            aria-pressed={onSelect ? selected === t.id : undefined}
            onMouseEnter={() => setHovered(t.id)}
            onMouseLeave={() => setHovered(null)}
            onFocus={() => setHovered(t.id)}
            onBlur={() => setHovered(null)}
            onClick={() => onSelect?.(t.id)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                onSelect?.(t.id);
              }
            }}
          />
        ))}
      </g>
      <g pointerEvents="none">
        {map.map((t) => (
          <polygon key={`terrain-${t.id}`} points={regions[t.id]} fill={`url(#${prefix}terrain)`} />
        ))}
        <path
          d="M16 16h38M16 16v38M824 16h-38M824 16v38M16 464h38M16 464v-38M824 464h-38M824 464v-38"
          stroke="#d5c18b"
          strokeOpacity=".32"
          fill="none"
        />
        <path
          d="M401 64Q365 150 390 188T407 232Q468 308 460 381T489 464"
          fill="none"
          stroke="#49757e"
          strokeWidth="7"
          opacity=".6"
        />
        <path
          d="M401 64Q365 150 390 188T407 232Q468 308 460 381T489 464"
          fill="none"
          stroke="#7aa0a2"
          strokeWidth="1.5"
          opacity=".45"
        />
        {Array.from({ length: 28 }, (_, i) => {
          const x = 150 + ((i * 47) % 410),
            y = 45 + ((i * 19) % 95),
            h = 17 + ((i * 7) % 22);
          return (
            <g key={`mount-${i}`}>
              <path d={`M${x - 16} ${y + h}l17 ${-h} 18 ${h}Z`} fill="#52656a" />
              <path d={`M${x - 3} ${y + 9}l4-9 8 12-5-2-3 2Z`} fill="#c0cbc3" opacity=".75" />
              <path d={`M${x + 1} ${y}v${h}h17Z`} fill="#263e48" opacity=".55" />
            </g>
          );
        })}
        {Array.from({ length: 105 }, (_, i) => {
          const x = 80 + ((i * 73) % 630),
            y = 155 + ((i * 41) % 250);
          if ((x > 450 && y < 300) || (x < 115 && y < 280)) return null;
          return (
            <g key={`tree-${i}`} transform={`translate(${x} ${y})`} opacity=".65">
              <path d="M0 5v11" stroke="#7b7360" strokeWidth="1.4" />
              <path d="m0-12-7 14h4l-7 12h20L3 2h4Z" fill={x < 450 ? '#223f39' : '#594b34'} />
              <path d="m0-12v26h10L3 2h4Z" fill="#182c2d" opacity=".4" />
            </g>
          );
        })}
        <g fill="none" stroke="#cbbf97" strokeWidth="1.3" strokeDasharray="3 6" opacity=".5">
          <path d="M340 100 245 221 408 231 549 230 693 182M408 231 354 342 147 365" />
        </g>
        {map.map((t) => {
          const [x, y] = points[t.id];
          return (
            <g key={t.id} filter={`url(#${prefix}shadow)`}>
              {active?.id === t.id && (
                <>
                  <ellipse
                    cx={x}
                    cy={y - 7}
                    rx="37"
                    ry="17"
                    fill={FACTIONS[t.owner].color}
                    opacity=".12"
                  />
                  <ellipse
                    className="map-selection-ring"
                    cx={x}
                    cy={y - 7}
                    rx="28"
                    ry="12"
                    fill="none"
                    stroke="#edd9a7"
                    strokeWidth="1"
                    strokeDasharray="3 4"
                  />
                </>
              )}
              {t.capital ? (
                <Castle
                  x={x}
                  y={y - 5}
                  color={FACTIONS[t.owner].color}
                  scale={compact ? 0.65 : 0.85}
                />
              ) : (
                <>
                  <circle
                    cx={x}
                    cy={y - 10}
                    r={t.id === 'crossroads' ? 10 : 5}
                    fill="#1a2931"
                    stroke={FACTIONS[t.owner].color}
                    strokeWidth="1.5"
                  />
                  <path
                    d={`M${x - 5} ${y - 10}h10M${x} ${y - 15}v10`}
                    stroke={FACTIONS[t.owner].color}
                    strokeWidth="1.5"
                  />
                </>
              )}
              <rect
                x={x - 59}
                y={y + 13}
                width="118"
                height={t.capital ? 37 : 25}
                rx="4"
                fill="#0f1b23"
                fillOpacity=".88"
                stroke={FACTIONS[t.owner].color}
                strokeOpacity=".2"
              />
              <text
                x={x}
                y={y + 30}
                textAnchor="middle"
                fill="#e2e6dd"
                fontSize={compact ? 11 : 12}
                fontFamily="Georgia,serif"
              >
                {t.name}
              </text>
              {t.capital && (
                <text
                  x={x}
                  y={y + 43}
                  textAnchor="middle"
                  fill={FACTIONS[t.owner].color}
                  fontSize="8"
                  letterSpacing="2"
                >
                  {t.owner.toUpperCase()} KINGDOM
                </text>
              )}
            </g>
          );
        })}
        {active && !compact && (
          <g transform="translate(586 24)">
            <rect
              width="224"
              height="62"
              rx="5"
              fill="#101c25"
              fillOpacity=".94"
              stroke={FACTIONS[active.owner].color}
              strokeOpacity=".45"
            />
            <circle cx="17" cy="19" r="3" fill={FACTIONS[active.owner].color} />
            <text x="29" y="23" fill="#f0eadc" fontFamily="Georgia,serif" fontSize="15">
              {active.name}
            </text>
            <text x="14" y="44" fill="#aebebd" fontSize="9">
              {active.capital
                ? 'Protected capital'
                : active.contestedToday
                  ? 'Resting until the next campaign day'
                  : 'Contested border'}{' '}
              · {active.owner.toUpperCase()}
            </text>
          </g>
        )}
        <g transform="translate(763 405)" opacity=".55" stroke="#c8bc96" fill="none">
          <path d="M0-25v50M-25 0h50M-16-16l32 32M-16 16l32-32" strokeWidth=".6" />
          <path d="M0-20 5-5 0 0-5-5Z" fill="#c8bc96" />
          <text y="-31" textAnchor="middle" fill="#c8bc96" stroke="none" fontSize="9">
            N
          </text>
          <circle r="17" strokeWidth=".5" />
        </g>
        <text x="45" y="453" fill="#9ba9a4" fontSize="9" letterSpacing="4" opacity=".5">
          THE REALM OF EVERFALL
        </text>
      </g>
    </svg>
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
