import { HeraldControls } from './HeraldPlayer';
import { useEffect, useState } from 'react';
import {
  Crown,
  Monitor,
  Volume2,
  VolumeX,
  ArrowUpRight,
  Swords,
  Radio,
  Pause,
  Play,
} from 'lucide-react';
import type { Context } from './App';
import type { ChapterProposal } from '../shared/companion';
import { Button, Panel, PanelTitle, countdown } from './ui';
import { Crest, WorldMap } from './WorldMap';
import { realmRequest } from './api';
import { StreamMoments } from './StreamMoments';
export function StreamerRoom({
  ctx,
  backstage,
  preview,
}: {
  ctx: Context;
  backstage: boolean;
  preview: (lord?: boolean, pane?: string) => void;
}) {
  const [proposals, setProposals] = useState<ChapterProposal[]>([]),
    [proposalError, setProposalError] = useState(''),
    [reason, setReason] = useState('');
  useEffect(() => {
    let active = true;
    realmRequest<ChapterProposal[]>(`/api/${ctx.s.mode}/proposals`, ctx.s.realmId)
      .then((p) => {
        if (active) {
          setProposals(p);
          setProposalError('');
        }
      })
      .catch(() => {
        if (active) setProposalError('Council inbox unavailable. Reload to try again.');
      });
    return () => {
      active = false;
    };
  }, [ctx.s.revision, ctx.s.realmId]);
  const chapter = ctx.s.chapter,
    active = chapter && ['open', 'paused'].includes(chapter.status);
  if (backstage)
    return (
      <div className="experience-stack">
        <div className="experience-heading">
          <span className="eyebrow">LOCAL OWNER · SYSTEM MANAGEMENT</span>
          <h1>Backstage</h1>
          <p>Connections, configuration, and the health of your worlds.</p>
        </div>
        <div className="experience-grid">
          {[
            [
              'Twitch connection',
              ctx.s.integration.connected
                ? 'Connected'
                : ctx.s.integration.configured
                  ? 'Ready to connect'
                  : 'Setup required',
              'settings',
            ],
            [
              'AI Steward',
              ctx.s.steward.configured ? ctx.s.steward.status : 'Deterministic narration active',
              'steward',
            ],
            ['World atlas', 'Browse independent streamer realms', 'atlas'],
            ['Saved world', `${ctx.s.citizens} citizens · Season ${ctx.s.season.number}`, 'world'],
          ].map(([title, body, dest]) => (
            <Panel key={title}>
              <PanelTitle title={title} />
              <p>{body}</p>
              <Button onClick={() => ctx.go(dest as any)}>
                Open <ArrowUpRight size={14} />
              </Button>
            </Panel>
          ))}
        </div>
        <Panel>
          <PanelTitle title="Experience previews" eyebrow="SIMULATION ONLY" />
          <p>
            <a href="/judges-demo.html" target="_blank" rel="noreferrer">
              Open judge presenter guide ↗
            </a>{' '}
            · Launch <code>start-judge-demo.ps1</code> for a separate, fresh rehearsal.
          </p>
          <p>
            See the personal companion through a citizen’s identity or a current elected Lord’s
            identity. These sessions cannot administer the world.
          </p>
          <Button disabled={ctx.busy || ctx.s.mode !== 'simulation'} onClick={() => preview()}>
            Preview citizen
          </Button>{' '}
          <Button disabled={ctx.busy || ctx.s.mode !== 'simulation'} onClick={() => preview(true)}>
            Preview elected Lord
          </Button>
          <Button
            disabled={ctx.busy || ctx.s.mode !== 'simulation'}
            onClick={() =>
              void ctx.run(
                () => ctx.action('companion/previews', undefined, 'DELETE'),
                'Simulation preview sessions revoked.',
              )
            }
          >
            Revoke realm previews
          </Button>
        </Panel>
      </div>
    );
  return (
    <div className="experience-stack">
      <section className="stream-room-hero">
        <div>
          <span className="eyebrow">
            <Radio size={13} /> STREAM ROOM ·{' '}
            {ctx.s.mode === 'simulation'
              ? 'SIMULATION'
              : ctx.s.integration.connected
                ? 'TWITCH CONNECTED'
                : 'TWITCH OFFLINE'}
          </span>
          <h1>{ctx.s.realm}</h1>
          {active ? (
            <p className="room-council-clock">
              <strong>
                {ctx.s.territories.find((t) => t.id === chapter.territory)?.name ??
                  chapter.territory}
              </strong>
              {' · '}
              {chapter.attacker} vs {chapter.defender}
              {' · '}
              {chapter.status === 'paused' ? 'Paused' : 'Voting open'}
              {' · '}
              <time>
                {chapter.status === 'paused'
                  ? countdown(chapter.remaining ?? 0, 0)
                  : countdown(chapter.deadline, ctx.now)}
              </time>{' '}
              left
            </p>
          ) : (
            <p>No council in progress. Open one between rounds.</p>
          )}
          <div className="room-actions">
            {active ? (
              <Button
                variant="primary"
                disabled={ctx.busy}
                onClick={() =>
                  void ctx.run(() =>
                    ctx.action(`chapters/${chapter.id}/control`, {
                      action: chapter.status === 'paused' ? 'resume' : 'pause',
                    }),
                  )
                }
              >
                {chapter.status === 'paused' ? <Play size={16} /> : <Pause size={16} />}
                {chapter.status === 'paused' ? 'Resume council' : 'Pause council'}
              </Button>
            ) : (
              <Button
                variant="primary"
                disabled={ctx.busy}
                onClick={() => ctx.setModal({ kind: 'chapter' })}
              >
                <Swords size={16} /> Plan battle
              </Button>
            )}
            <Button
              aria-pressed={ctx.s.settings.quiet}
              disabled={ctx.busy}
              onClick={() =>
                void ctx.run(() =>
                  ctx.action('settings', { quiet: !ctx.s.settings.quiet }, 'PATCH'),
                )
              }
            >
              {ctx.s.settings.quiet ? <VolumeX size={16} /> : <Volume2 size={16} />}
              {ctx.s.settings.quiet ? 'Quiet mode on' : 'Quiet mode off'}
            </Button>
            <Button onClick={ctx.openOverlay}>
              <Monitor size={16} />
              Overlay & setup
            </Button>
          </div>
        </div>
        <aside>
          <span className="eyebrow">COMMUNITY PULSE</span>
          <strong>{ctx.s.citizens.toLocaleString()}</strong>
          <span>citizens writing this story</span>
          <small>
            {ctx.s.active} active · {ctx.s.territories.length} territories
          </small>
        </aside>
      </section>
      <div className="stream-controls">
        <Button onClick={() => ctx.setModal({ kind: 'announcement' })}>Send announcement</Button>
        <Button onClick={() => preview()} disabled={ctx.busy}>
          {ctx.s.mode === 'simulation' ? 'See citizen experience' : 'Open viewer companion'}{' '}
          <ArrowUpRight size={14} />
        </Button>
        {ctx.s.mode === 'simulation' && (
          <Button disabled={ctx.busy} onClick={() => preview(true)}>
            Lord preview
          </Button>
        )}
      </div>
      <StreamMoments
        key={`${ctx.s.mode}:${ctx.s.realmId}:${ctx.s.generation}:${ctx.s.integration.channel}`}
        ctx={ctx}
      />
      <HeraldControls ctx={ctx} />
      <section className="command-map">
        <div className="command-map-heading">
          <div>
            <span className="eyebrow">YOUR CAMPAIGN</span>
            <h2>The realm, at a glance</h2>
          </div>
          <Button onClick={() => ctx.go('world')}>
            Open realm map <ArrowUpRight size={14} />
          </Button>
        </div>
        <WorldMap
          realmId={ctx.s.realmId}
          realmName={ctx.s.realm}
          territories={ctx.s.territories}
          selected={ctx.selectedTerritory}
          onSelect={(id) => {
            ctx.setTerritory(id);
            ctx.go('world');
          }}
        />
      </section>
      <details className="progression-entry campaign-guide">
        <summary>
          Character progression & community activities <ArrowUpRight size={16} />
        </summary>
        <PanelTitle
          title="Your community’s progression"
          eyebrow="CHARACTERS · EQUIPMENT · KINGDOMS"
        />
        <p>
          Viewers earn XP and gold through participation, then buy and upgrade their own equipment.
          Kingdoms earn separate seasonal influence.
        </p>
        <div className="room-actions">
          <Button variant="primary" disabled={ctx.busy} onClick={() => preview(false, 'armory')}>
            Open viewer armory
          </Button>
          <Button onClick={() => ctx.go('character')}>Characters & gear</Button>
          <Button onClick={() => ctx.go('leaderboard')}>Season rankings</Button>
          <Button disabled={ctx.busy} onClick={() => preview(false, 'challenges')}>
            Community challenges
          </Button>
          <Button onClick={() => ctx.go('world-tasks')}>World game races</Button>
        </div>
        <small>
          {ctx.s.mode === 'simulation'
            ? 'Viewer links open an identity-bound, fictional citizen preview in this realm.'
            : 'Viewer links require each viewer’s own Twitch sign-in.'}
        </small>
      </details>
      <div className="experience-grid">
        <Panel>
          <PanelTitle
            eyebrow="NEXT COMMUNITY MOMENT"
            title={active ? 'Battle vote in progress' : 'A moment of calm'}
          />
          {active ? (
            <>
              <h3>
                {chapter.attacker} vs {chapter.defender}
              </h3>
              <p>
                {ctx.s.territories.find((t) => t.id === chapter.territory)?.name} ·{' '}
                {chapter.status === 'paused'
                  ? 'Paused'
                  : `${Math.max(0, Math.ceil((chapter.deadline - ctx.now) / 1000))}s remaining`}
              </p>
              <p>{Object.values(chapter.pledged).reduce((a, b) => a + b, 0)} citizens pledged</p>
              <Button onClick={() => ctx.go('battles')}>View battle room</Button>
            </>
          ) : (
            <>
              <p>
                The Steward can keep the chronicle moving. Start a council when the stream has a
                natural pause.
              </p>
              <Button onClick={() => ctx.setModal({ kind: 'chapter' })}>
                Choose battle target
              </Button>
            </>
          )}
        </Panel>
        <Panel>
          <PanelTitle title="Council inbox" eyebrow="LORD PROPOSALS · YOUR FINAL SAY" />
          {proposalError && <p role="alert">{proposalError}</p>}
          {!proposalError && proposals.filter((p) => p.status === 'pending').length === 0 ? (
            <p>
              No proposals waiting. Elected Lords can suggest one territory per day from their
              companion.
            </p>
          ) : (
            proposals
              .filter((p) => p.status === 'pending')
              .map((p) => (
                <div className="companion-row" key={p.id}>
                  <strong>
                    {p.name} · {p.kingdom}
                  </strong>
                  <p>Proposes {ctx.s.territories.find((t) => t.id === p.territory)?.name}</p>
                  <Button
                    disabled={ctx.busy || !!active}
                    onClick={() =>
                      void ctx.run(() =>
                        ctx.action(`proposals/${p.id}/review`, { action: 'accept', reason: '' }),
                      )
                    }
                  >
                    Accept & open council
                  </Button>
                  <input
                    aria-label="Public reason for dismissal"
                    placeholder="Public reason for dismissal"
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                    maxLength={180}
                  />
                  <Button
                    disabled={ctx.busy || reason.trim().length < 5}
                    onClick={() =>
                      void ctx.run(() =>
                        ctx.action(`proposals/${p.id}/review`, { action: 'dismiss', reason }),
                      )
                    }
                  >
                    Dismiss with reason
                  </Button>
                </div>
              ))
          )}
        </Panel>
      </div>
      <div className="kingdom-pulse">
        {ctx.s.kingdoms.map((k) => (
          <button
            key={k.id}
            onClick={() => {
              ctx.setFaction(k.id);
              ctx.go('kingdoms');
            }}
          >
            <Crest faction={k.id} />
            <span>
              <strong>{k.name}</strong>
              <small>
                {k.citizens} citizens · {k.fortressHealth ?? 1800} fortress HP
              </small>
              <small>
                <Crown size={11} /> {k.lord ?? 'Council seat open'}
              </small>
            </span>
            <ArrowUpRight size={16} />
          </button>
        ))}
      </div>
      <Panel>
        <PanelTitle
          title="The latest from your realm"
          action={<Button onClick={() => ctx.go('chronicle')}>Open chronicle</Button>}
        />
        {ctx.s.events.length === 0 && (
          <p>No community events yet. Your first chapter will appear here.</p>
        )}
        {ctx.s.events.slice(0, 4).map((e) => (
          <div className="companion-row" key={e.id}>
            <strong>{e.title}</strong>
            <p>{e.body}</p>
          </div>
        ))}
      </Panel>
    </div>
  );
}
