# Realm artwork and progression

The four configured sample realms keep independent SQLite worlds and now use distinct landscape files. Everfall retains `public/everfall-realms-v2.png`; Emberwatch uses `public/realm-emberwatch-v1.png`; Moonharbor uses `public/realm-moonharbor-v1.png`; Stormgarden uses `public/realm-stormgarden-v1.png`. Mapping lives in `shared/realms.ts`. Owner maps, kingdom banners, atlas cards and viewer maps consume the selected realm's artwork. Actual ownership, adjacency, growth and rewards remain authoritative game state, not inferred from the picture. Live still supports one authorized broadcaster; automatic bespoke map generation/uploads for arbitrary future channels are not implemented.

## Where the systems live

- Streamer navigation exposes Citizens, Character & gear and Leaderboard alongside the realm, battles and chronicle. Backstage is reserved for setup and Steward management.
- Stream room provides direct identity-bound viewer Armory and Challenges links. Simulation links are explicitly fictional previews; Live links require the viewer's own Twitch identity.
- Viewer My story explains gold, XP and contribution. Armory & upgrades shows spendable gold, owned gear, costs, before/after bonuses, purchases and the private gold ledger. Purchases/commands use existing backend rules and actor binding.
- My kingdom shows Lord, citizens, territory and fortress health. Realm map highlights that viewer's kingdom and uses the same realm landscape as the streamer. Challenges retain their existing first-completion rewards.
- Season rankings shows public kingdom influence/wins and tie-aware ranking; this is separate from spendable gold. Contribution is the character's participation score for the current season.

## Economy disclosure

The first successful command in a UTC day awards up to 10 XP/10 gold, settled battles award winners up to 30 each and other participants up to 20 each, and challenges declare their rewards. Total daily rewards remain capped at 100 XP/100 gold. Levels and item upgrades are unchanged. This update does not introduce a second spendable points currency, paid boosts, reward minting buttons or admin permissions for viewers.

## Asset generation record

Generated with the built-in image generation tool, using `public/everfall-realms-v2.png` as a style/composition reference. All three outputs are 2172×724 PNGs, copied into the project; originals remain under the tool's generated-images directory. No text or gameplay data is baked into the artwork.

### emberwatch

```
Use case: stylized-concept. Create one original ultra-wide 3:1 cinematic fantasy landscape background for an interactive community strategy map. Reference image is style/composition guidance only; do not copy its terrain. Match its detailed painterly environment art, atmospheric depth, restrained fantasy architecture and readable panoramic scale. Emberwatch Dominion: dramatic ochre sandstone citadels amid terracotta canyons, terraced desert oases, sunlit aqueducts and a winding turquoise river under copper sunset skies. Left capital is a cool blue stone fortress at x20% y29%, central capital a golden sun citadel at x60% y35%, right capital an obsidian cliff palace at x89% y28%. Distinct desert geography, no snowy landscape. Viewpoint: elevated panorama surveying the entire realm. Three main castle landmarks across the upper half with valley settlements, waterways and roads across lower half. Keep all three landmarks visible. No people, dragons, labels, text, borders, UI, logos, map pins or symbols. This must be a clean landscape asset, not a screenshot or interface. Output one image.
```

### moonharbor

```
Use case: stylized-concept. Create one original ultra-wide 3:1 cinematic fantasy landscape background for an interactive community strategy map. Reference image is style/composition guidance only; do not copy its terrain. Match its detailed painterly environment art, atmospheric depth, restrained fantasy architecture and readable panoramic scale. Moonharbor Court: a moonlit coastal archipelago, navy sea, silver mist, tidal causeways, lantern-lit stone harbor towns and three cliff castles. Left capital a pale silver-blue sea fortress at x20% y29%, central capital a warm lantern-lit cathedral harbor at x60% y35%, right capital a violet lunar palace at x89% y28%. Clearly different island geography and night lighting, no desert. Viewpoint: elevated panorama surveying the entire realm. Three main castle landmarks across the upper half with valley settlements, waterways and roads across lower half. Keep all three landmarks visible. No people, dragons, labels, text, borders, UI, logos, map pins or symbols. This must be a clean landscape asset, not a screenshot or interface. Output one image.
```

### stormgarden

```
Use case: stylized-concept. Create one original ultra-wide 3:1 cinematic fantasy landscape background for an interactive community strategy map. Reference image is style/composition guidance only; do not copy its terrain. Match its detailed painterly environment art, atmospheric depth, restrained fantasy architecture and readable panoramic scale. Stormgarden Reach: a lush temperate emerald highland realm, ancient wooded castles, mossy bridges, roaring waterfalls, wildflower meadows and storm clouds opening to soft morning light. Left capital a blue-gray mountain keep at x20% y29%, central capital an amber stone garden citadel at x60% y35%, right capital a green forest palace at x89% y28%. Distinct verdant valley geography, no snowy main landscape. Viewpoint: elevated panorama surveying the entire realm. Three main castle landmarks across the upper half with valley settlements, waterways and roads across lower half. Keep all three landmarks visible. No people, dragons, labels, text, borders, UI, logos, map pins or symbols. This must be a clean landscape asset, not a screenshot or interface. Output one image.
```
