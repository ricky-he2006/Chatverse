import type { CSSProperties, ReactNode } from 'react';
import {
  ArrowUpRight,
  Coins,
  Crown,
  Shield,
  Sparkles,
  Swords,
  Wind,
  Heart,
  Crosshair,
} from 'lucide-react';
import { FACTIONS } from '../shared/catalog';
import type { Character, Faction } from '../shared/types';
import { SUPPORTER_RANKS } from '../shared/supporters';
export function SupporterBadge({
  character,
}: {
  character: Pick<Character, 'supporter' | 'isLord'>;
}) {
  const status = character.supporter;
  const rank = SUPPORTER_RANKS[status?.tier ?? 0];
  return (
    <span className="identity-badges">
      <span
        className={'supporter-badge tier-' + (status?.tier ?? 0)}
        style={{ '--rank': rank.color } as CSSProperties}
        title={
          status?.source === 'simulation'
            ? 'Simulated subscription rank — cosmetic only'
            : status?.source === 'twitch'
              ? 'Twitch verified — cosmetic only'
              : 'Subscription status unverified'
        }
      >
        {status?.tier === 3 ? (
          <Crown size={11} />
        ) : status?.tier === 2 ? (
          <Sparkles size={11} />
        ) : (
          <Shield size={11} />
        )}
        {rank.title}
        {status?.source === 'simulation' && <small>SIM</small>}
        {status?.source === 'unavailable' && <small>UNVERIFIED</small>}
      </span>
      {character.isLord && (
        <span className="elected-badge">
          <Crown size={11} />
          Elected Lord
        </span>
      )}
    </span>
  );
}
export function Button({
  children,
  variant = 'secondary',
  className = '',
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
}) {
  return (
    <button className={`button ${variant} ${className}`} {...props}>
      {children}
    </button>
  );
}
export function Panel({ children, className = '', ...props }: React.HTMLAttributes<HTMLElement>) {
  return (
    <section className={`panel ${className}`} {...props}>
      {children}
    </section>
  );
}
export function PanelTitle({
  title,
  eyebrow,
  action,
}: {
  title: string;
  eyebrow?: string;
  action?: ReactNode;
}) {
  return (
    <div className="panel-heading">
      <div>
        {eyebrow && <span className="eyebrow">{eyebrow}</span>}
        <h2>{title}</h2>
      </div>
      {action}
    </div>
  );
}
export function LinkButton({ children, onClick }: { children: ReactNode; onClick: () => void }) {
  return (
    <button className="text-button" onClick={onClick}>
      {children}
      <ArrowUpRight size={14} />
    </button>
  );
}
export function Tag({ children, color }: { children: ReactNode; color?: string }) {
  return (
    <span
      className="tag"
      style={color ? { color, borderColor: `${color}35`, background: `${color}0d` } : undefined}
    >
      {children}
    </span>
  );
}
export function FactionTag({ faction }: { faction: Faction }) {
  return <Tag color={FACTIONS[faction].color}>{FACTIONS[faction].name}</Tag>;
}
export function Avatar({
  character,
  small = false,
}: {
  character: Pick<Character, 'name' | 'class' | 'kingdom' | 'supporter'>;
  small?: boolean;
}) {
  const tier = character.supporter?.tier ?? 0;
  const color = tier ? SUPPORTER_RANKS[tier].color : FACTIONS[character.kingdom].color;
  return (
    <div
      className={`avatar ${small ? 'small' : ''} ${character.class} supporter-frame-${tier}`}
      style={{ '--faction': color } as CSSProperties}
      aria-hidden="true"
    >
      <svg viewBox="0 0 100 115">
        <path d="M5 115Q8 83 31 79L34 66 66 66 69 79Q92 83 95 115" fill="#30394b" />
        <path d="m32 77 18 17 18-17-8 38H40Z" fill={color} opacity=".5" />
        {character.class === 'rogue' ? (
          <path
            d="M18 75Q13 23 50 10q36 13 32 65l-15 9-34-1Z"
            fill="#262b42"
            stroke={color}
            strokeOpacity=".5"
          />
        ) : character.class === 'vanguard' ? (
          <path
            d="M23 63V31Q50 3 77 31v34l-15 17H39Z"
            fill="#4f6270"
            stroke={color}
            strokeOpacity=".5"
          />
        ) : (
          <path d="M22 67Q16 25 49 17q35 5 32 50L63 82H39Z" fill="#393f37" />
        )}
        <path d="M32 45q18-16 36 0v17Q62 83 50 83T32 62Z" fill="#9d8a80" />
        <path d="M33 46q14-8 35 0l-7-16H41Z" fill="#232a34" />
        <path d="M37 54h8m10 0h8" stroke="#1c2532" strokeWidth="2.5" />
        <path d="m48 59-2 9h7m-10 6h13" fill="none" stroke="#6f5c57" strokeWidth="1.5" />
        {character.class === 'rogue' && (
          <path d="m31 61 19 13 19-13v15L50 91 31 76Z" fill="#262d43" />
        )}
        {character.class === 'vanguard' && <path d="M24 33 50 21l26 12-7 16H31Z" fill="#6c7d83" />}
        <path d="M10 101 30 88l11 27H7m83-14L70 88l-11 27h34" fill="#46505e" />
        <path d="M14 97 31 89m55 8L69 89" stroke={color} strokeWidth="1.3" />
      </svg>
      {!small && (
        <span className="portrait-corner">
          <Sparkles size={12} />
        </span>
      )}
    </div>
  );
}
export function StatIcon({ stat, size = 15 }: { stat: string; size?: number }) {
  const Icon =
    stat === 'attack' ? Swords : stat === 'defense' ? Shield : stat === 'health' ? Heart : Wind;
  return <Icon size={size} />;
}
export function ClassIcon({ name, size = 18 }: { name: string; size?: number }) {
  return name === 'rogue' ? (
    <Swords size={size} />
  ) : name === 'ranger' ? (
    <Crosshair size={size} />
  ) : (
    <Shield size={size} />
  );
}
export function Progress({
  value,
  max = 100,
  color = 'var(--gold)',
}: {
  value: number;
  max?: number;
  color?: string;
}) {
  return (
    <div
      className="progress-track"
      role="progressbar"
      aria-valuenow={Math.min(value, max)}
      aria-valuemin={0}
      aria-valuemax={max || 100}
    >
      <div
        style={{
          width: `${Math.max(0, Math.min(100, max ? (100 * value) / max : 100))}%`,
          background: color,
        }}
      />
    </div>
  );
}
export function Empty({
  icon,
  title,
  body,
  action,
}: {
  icon?: ReactNode;
  title: string;
  body: string;
  action?: ReactNode;
}) {
  return (
    <div className="empty-state">
      {icon ?? <Crown size={32} />}
      <h3>{title}</h3>
      <p>{body}</p>
      {action}
    </div>
  );
}
export const num = (value: number) => new Intl.NumberFormat('en-US').format(value);
export const date = (value: number) =>
  new Date(value).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
export const time = (value: number) =>
  new Date(value).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
export function countdown(deadline: number, now: number) {
  const s = Math.max(0, Math.ceil((deadline - now) / 1000));
  return s >= 86400
    ? `${Math.floor(s / 86400)}d ${Math.floor((s % 86400) / 3600)}h`
    : `${Math.floor(s / 60)
        .toString()
        .padStart(2, '0')}:${(s % 60).toString().padStart(2, '0')}`;
}
export function ago(value: number, now = Date.now()) {
  const seconds = Math.max(0, Math.floor((now - value) / 1000));
  return seconds < 60
    ? 'Just now'
    : seconds < 3600
      ? `${Math.floor(seconds / 60)}m ago`
      : seconds < 86400
        ? `${Math.floor(seconds / 3600)}h ago`
        : `${Math.floor(seconds / 86400)}d ago`;
}
export function Gold({ amount }: { amount: number }) {
  return (
    <span className="gold-amount">
      <Coins size={14} />
      {num(amount)}
    </span>
  );
}
