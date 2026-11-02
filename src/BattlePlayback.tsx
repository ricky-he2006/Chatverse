import { useEffect, useState } from 'react';
import type { Chapter } from '../shared/types';
import { FACTIONS } from '../shared/catalog';
import { battleFrame, battleConsequence } from '../shared/battle-presentation';
import { Crest } from './WorldMap';
export function BattlePlayback({
  chapter: ch,
  autoplay = false,
  compact = false,
  staticMode = false,
  onPlaying,
}: {
  chapter: Chapter;
  autoplay?: boolean;
  compact?: boolean;
  staticMode?: boolean;
  onPlaying?: (value: boolean) => void;
}) {
  const result = ch.result!;
  const reduced = staticMode || matchMedia('(prefers-reduced-motion: reduce)').matches;
  const [round, setRound] = useState(autoplay && !reduced ? 0 : result.rounds.length);
  const [playing, setPlaying] = useState(autoplay && !reduced);
  const done = round >= result.rounds.length;
  useEffect(() => {
    onPlaying?.(!done);
  }, [done, onPlaying]);
  useEffect(() => {
    if (reduced) {
      setPlaying(false);
      setRound(result.rounds.length);
      return;
    }
    if (!playing) return;
    const timer = setTimeout(() => {
      if (round < result.rounds.length) setRound(round + 1);
      else setPlaying(false);
    }, 1800);
    return () => clearTimeout(timer);
  }, [playing, round, reduced, result.rounds.length]);
  const frame = battleFrame(result, round);
  return (
    <section
      className={`recorded-battle ${compact ? 'compact' : ''} ${reduced ? 'static' : ''}`}
      aria-label="Recorded battle"
    >
      <div className="recorded-heading">
        {done
          ? 'Territory settled'
          : round
            ? `Exchange ${round} / ${result.rounds.length}`
            : 'Armies assembled'}
      </div>
      <div className="recorded-armies">
        {([ch.attacker, ch.defender] as const).map((faction, i) => {
          const health = i ? frame.healthB : frame.healthA,
            max = i ? result.maxHealthB : result.maxHealthA;
          const hit = i ? frame.exchange?.scoreA : frame.exchange?.scoreB;
          return (
            <div
              className="recorded-fortress"
              key={faction}
              style={{ '--faction': FACTIONS[faction].color } as React.CSSProperties}
            >
              <Crest faction={faction} size={compact ? 32 : 64} />
              <strong>{FACTIONS[faction].name}</strong>
              {ch.input?.sides[i] && <small>{ch.input.sides[i].tactic.toUpperCase()}</small>}
              <div
                key={`fortress-${round}`}
                className="fortress-silhouette"
                style={{ opacity: max ? 0.35 + (0.65 * health) / max : 1 }}
                aria-hidden="true"
              >
                <i />
                <i />
                <i />
                <i />
                <i />
              </div>
              {max ? (
                <>
                  <meter
                    min={0}
                    max={max}
                    value={health}
                    aria-label={`${FACTIONS[faction].name} fortress health`}
                  />
                  <b>
                    {health.toLocaleString()} / {max.toLocaleString()} HP
                  </b>
                </>
              ) : (
                <b>{i ? frame.damageB : frame.damageA} score</b>
              )}
              <span className="recorded-impact" key={round}>
                {round > 0
                  ? max
                    ? `Last hit: −${hit} HP`
                    : `Opponent exchange score: ${hit}`
                  : `${ch.pledged[faction]} pledged citizens`}
              </span>
            </div>
          );
        })}
      </div>
      <p className="recorded-outcome" aria-live="polite">
        {done ? battleConsequence(ch) : 'Recorded exchanges · territory outcome follows'}
      </p>
      {!compact && (
        <div className="replay-controls">
          <button
            className="button"
            disabled={reduced}
            onClick={() => {
              if (done) setRound(0);
              setPlaying(!playing || done);
            }}
          >
            {playing && !done ? 'Pause replay' : done ? 'Replay chapter' : 'Resume replay'}
          </button>
          <button
            className="button"
            onClick={() => {
              setRound(result.rounds.length);
              setPlaying(false);
            }}
          >
            Show final result
          </button>
          <small>
            {reduced
              ? 'Reduced motion · static result'
              : 'Read-only replay · rewards are already recorded'}
          </small>
        </div>
      )}
    </section>
  );
}
