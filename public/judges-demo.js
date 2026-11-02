const app = (screen) => `/?mode=simulation&realm=emberwatch&screen=${screen}&view=streamer`;
const steps = [
  {
    title: 'Hand off from real Twitch',
    time: '0:00–0:30',
    action:
      'First show your real channel, an actual !join command, and the matching Live citizen. Then explicitly switch to this separate Simulation rehearsal.',
    say: 'That was real Twitch input. Now I’ll use clearly simulated communities to show what a larger stream can become.',
    proof:
      'An actual chat command proves integration. Synthetic citizens demonstrate mechanics and scale.',
    links: [['Open Stream room', app('overview')]],
  },
  {
    title: 'Give a viewer something to own',
    time: '0:30–1:20',
    action:
      'Stream room → See citizen experience → Armory & upgrades. Mira has earned gold. Upgrade her equipped weapon once. Keep the price, stat comparison and updated balance in frame.',
    say: 'Viewers earn gold through participation and spend it on equipment. The wallet and battle stats change together; subscription tiers only change recognition.',
    proof:
      'Show one real purchase, not just the shop. Gold, XP and contribution are different systems.',
    links: [['Open viewer entry point', app('overview')]],
  },
  {
    title: 'Turn personal progress into a shared defense',
    time: '1:20–2:00',
    action:
      'In Mira’s companion, open My kingdom → Territory development. Fund Frostpass level one for 100 gold. Return to the owner map and select Frostpass.',
    say: 'A viewer can also invest in their community. Frostpass now has sixty extra defending health, paid for from the same wallet.',
    proof:
      'The development level, defending HP and gold deduction persist. The game engine uses the defense in the battle.',
    links: [['Open Frostpass map', app('world')]],
  },
  {
    title: 'Make community growth visible',
    time: '2:00–2:40',
    action:
      'On Realm map, find North’s growth row. Click its Welcome 25 simulated citizens button twice. North grows from 220 to 270 and crosses the 250-citizen milestone.',
    say: 'More people reveal new land. This frontier stays discovered, while population health bonuses are capped so growth does not become unlimited power.',
    proof:
      'North’s discovered outposts increase from two to three; population fortress HP rises from 1,980 to 2,070. District defense is an additional battle-specific bonus.',
    links: [['Open realm development', app('world')]],
  },
  {
    title: 'Let chat decide, then reveal the consequence',
    time: '2:40–4:00',
    action:
      'Open War Room. The prepared Frostpass vote is paused: Resume, then Rally simulated citizens. Change Mira’s sealed tactic if desired. Show the pinned overlay. Click Run full simulated battle; replay and show the final result.',
    say: 'The streamer opens a short decision window and returns to the game. Citizens pledge and vote; the same seeded engine calculates the result, rewards and territory consequence.',
    proof:
      'Both sides have participants. The overlay and battle page agree. The result is computed, never chosen by the presenter or narrator.',
    links: [
      ['Open War Room', app('battles')],
      ['Open overlay setup', app('settings')],
    ],
  },
  {
    title: 'Show the history that remains',
    time: '4:00–4:40',
    action:
      'Open Chronicle and the latest Frostpass result. Then show Season standings and the selected citizen’s gold ledger. Visit Studio → AI Steward to show provider/fallback status.',
    say: 'The battle leaves a durable history and capped participation rewards. Narration follows recorded facts. This rehearsal uses the deterministic fallback because no AI provider is configured.',
    proof:
      'Replay does not pay twice. Influence ranks kingdoms; gold buys upgrades. No generated or spoken AI is being claimed here.',
    links: [
      ['Open Chronicle', app('chronicle')],
      ['Open standings', app('leaderboard')],
      ['Open Steward', app('steward')],
    ],
  },
  {
    title: 'Race other communities on game objectives',
    time: '4:40–5:25',
    action:
      'War Room → World races. Show the default ten members PLUS streamer completion rule, review deadlines and first/second/third prestige. Explain screenshot review. Use the optional evidence walkthrough in the written runbook for a longer demo.',
    say: 'Communities can race on game-specific objectives. The default requires ten distinct members and their streamer. Reviewers verify evidence; server receipt times determine provisional placement.',
    proof:
      'The four listed communities are fictional local realms. This is not a hosted worldwide network or automatic game-result detection.',
    links: [['Open World races', app('world-tasks')]],
  },
  {
    title: 'Separate citizen, Lord and streamer powers',
    time: '5:25–6:10',
    action:
      'Stream room → Lord preview → Lord’s council. Show proposal controls and term. Return to Studio to show the inbox and final streamer review. In Character & gear, expand ceremonial ranks.',
    say: 'Citizens participate, elected Lords propose strategy, and the streamer retains final control. Subscription recognition is ceremonial and gives no paid combat multiplier.',
    proof:
      'These are identity-bound Simulation previews, not proof of a newly completed real election.',
    links: [
      ['Open role previews', app('overview')],
      ['Open character ranks', app('character')],
    ],
  },
  {
    title: 'One world per streamer; one broader atlas',
    time: '6:10–6:45',
    action:
      'Open World atlas. Enter Moonharbor to show its distinct artwork and independent state, then return to Emberwatch. Keep this short in the recorded cut.',
    say: 'Each streamer has an individual realm. The atlas connects their identities without pretending that live cross-channel warfare is already deployed.',
    proof:
      'Realm images and saved worlds differ. Cross-streamer Live federation remains future work.',
    links: [['Open World atlas', app('atlas')]],
  },
  {
    title: 'Close on streamer value and technical proof',
    time: '6:45–7:15',
    action:
      'Return to Stream room: show Quiet mode and minimal controls. In your editor, show a real Codex change, deterministic replay tests and the current test run. End on the kingdom map.',
    say: 'The streamer keeps playing. Viewers have reasons to return. Codex helped build one authoritative engine behind the dashboard, viewer companion and OBS overlay.',
    proof:
      'Show actual build/test footage. Keep session IDs, credentials and unlock codes out of the capture.',
    links: [
      ['Return to Stream room', app('overview')],
      ['End on the realm', app('world')],
    ],
  },
];
const video = [
  {
    title: 'Real Twitch proof — your opening',
    time: '0:00–0:30',
    action:
      'Record the genuine Twitch command and resulting Live state first. Do not replace it with the rehearsal.',
    say: 'ChatVerse turns a Twitch community into a persistent kingdom while the streamer keeps playing.',
    proof: 'Reserve this portion for your actual connection proof.',
    links: [],
  },
  {
    title: 'Explicit transition + realm identity',
    time: '0:30–0:45',
    action: 'Cut to the Emberwatch map with Simulation visible. Brief atlas insert if useful.',
    say: 'That was real Twitch. These are fictional communities showing the larger experience.',
    proof: 'Keep the synthetic label readable.',
    links: [['Open realm', app('world')]],
  },
  {
    title: 'Viewer progression + shared development',
    time: '0:45–1:10',
    action:
      'Capture one weapon upgrade, its before/after and wallet change. Cut to funding Frostpass. Use recorded growth before/after as a brief insert.',
    say: 'Participation earns gold and XP. Viewers improve equipment or fund shared defenses; community growth opens new territory.',
    proof: 'Use actual purchases and actual growth, not animated mock statistics.',
    links: [['Open viewer entry', app('overview')]],
  },
  {
    title: 'The decisive battle and overlay',
    time: '1:10–1:45',
    action:
      'Resume the paused battle, rally both armies, run it, and cut between the actual overlay and final result. Include the district defense in the input panel.',
    say: 'The streamer opens a short vote. Citizens choose the strategy. A seeded, testable engine settles the fight and records its consequences once.',
    proof: 'Give the outcome time to be read. Do not promise a particular winner.',
    links: [['Open battle', app('battles')]],
  },
  {
    title: 'Races, roles and persistent history',
    time: '1:45–2:10',
    action:
      'Brief inserts: ten members plus streamer race requirement; Lord council; Chronicle result. Avoid clicking through an entire election or evidence-review cycle.',
    say: 'Game challenges create community races. Elected Lords propose strategy; the streamer decides. Their choices become a lasting chronicle.',
    proof:
      'World races here are local Simulation; ranks are cosmetic. Shown screens are not proof of all workflows being performed in this take.',
    links: [
      ['Open races', app('world-tasks')],
      ['Open Chronicle', app('chronicle')],
    ],
  },
  {
    title: 'Narration that cannot change the winner',
    time: '2:10–2:25',
    action: 'Show Steward provider status and the factual battle recap.',
    say: 'The Steward narrates recorded events. Without an AI key, the deterministic fallback still works. Narration never decides rewards or winners.',
    proof: 'Do not describe fallback text as a live model response or voice narration.',
    links: [['Open Steward', app('steward')]],
  },
  {
    title: 'Codex contribution and closing value',
    time: '2:25–2:55',
    action:
      'Use real Codex/build footage and the current test result, then return to the map and quiet streamer controls.',
    say: 'Codex helped connect real Twitch events to persistent progression, deterministic combat and a coherent interface. The streamer keeps playing; chat gets a world worth returning to.',
    proof:
      'Leave five seconds of breathing room at the end. This is an editing target, not a statement of submission rules.',
    links: [['Closing map', app('world')]],
  },
];
const container = document.querySelector('#steps');
function render(list) {
  container.replaceChildren();
  list.forEach((step, index) => {
    const section = document.createElement('section');
    section.className = 'step';
    const top = document.createElement('div');
    top.className = 'step-top';
    const heading = document.createElement('h2');
    heading.textContent = `${index + 1}. ${step.title}`;
    const time = document.createElement('span');
    time.className = 'step-time';
    time.textContent = step.time;
    top.append(heading, time);
    section.append(top);
    for (const [className, text] of [
      ['action', step.action],
      ['say', step.say],
      ['proof', `Proof: ${step.proof}`],
    ]) {
      const p = document.createElement('p');
      p.className = className;
      p.textContent = text;
      section.append(p);
    }
    for (const [text, url] of step.links) {
      const a = document.createElement('a');
      a.textContent = text + ' ↗';
      a.href = url;
      a.target = 'chatverse-demo';
      section.append(a);
    }
    const label = document.createElement('label'),
      check = document.createElement('input');
    check.type = 'checkbox';
    label.append(check, document.createTextNode('Captured / rehearsed'));
    section.append(label);
    container.append(section);
  });
}
let videoMode = false,
  elapsed = 0,
  startedAt = null;
const clock = document.querySelector('#timer'),
  start = document.querySelector('#start-timer');
function draw() {
  const ms = elapsed + (startedAt === null ? 0 : performance.now() - startedAt),
    seconds = Math.floor(ms / 1000);
  clock.textContent = `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;
  clock.style.color = videoMode && seconds > 175 ? '#efab9a' : '';
}
start.addEventListener('click', () => {
  if (startedAt === null) {
    startedAt = performance.now();
    start.textContent = 'Pause timer';
  } else {
    elapsed += performance.now() - startedAt;
    startedAt = null;
    start.textContent = 'Resume timer';
  }
  draw();
});
document.querySelector('#reset-timer').addEventListener('click', () => {
  elapsed = 0;
  startedAt = null;
  start.textContent = 'Start timer';
  draw();
});
setInterval(draw, 250);
for (const [id, value] of [
  ['live-format', false],
  ['video-format', true],
])
  document.getElementById(id).addEventListener('click', () => {
    videoMode = value;
    document.querySelector('#live-format').setAttribute('aria-pressed', String(!value));
    document.querySelector('#video-format').setAttribute('aria-pressed', String(value));
    document.querySelector('#format-note').textContent = value
      ? 'Record these shots in separate takes. The 2:55 target includes your first 30 seconds of real Twitch proof and 30 seconds of Codex evidence/closing.'
      : 'Each stop gives an action, a visible proof and the sentence to say. Read these notes off camera.';
    render(value ? video : steps);
    draw();
  });
if (location.port !== '3001')
  document
    .querySelector('#environment')
    .append(
      document.createTextNode(
        ' You are currently on the normal app port; these links use its existing Simulation world. Start the separate rehearsal before making a take.',
      ),
    );
render(steps);
