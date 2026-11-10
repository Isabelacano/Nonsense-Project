# Provisorium

*Temporary structures outlast permanent ones.*

A playable 3D browser prototype. A construction worker tries to take the last bit of scaffolding off the
main building of the Bauhaus-Universität Weimar. The scaffolding is the demon. Every attempt to remove it
makes it replicate, rearrange itself and press into the architecture. How it ends depends on the session:
the building always ends up completely destroyed, but around that the crew may simply run, the students may jump out of the
windows, the scaffolding may get up and walk away or (rarely) fly off in flocks, or the founder himself may rise from the ruins.

## Run it

Requires Node.js 18+.

```bash
cd game
npm install
npm run dev        # opens http://localhost:5173
```

`npm run build` writes a static version to `game/dist/` (relative paths, so it can be hosted anywhere).
`npm run preview` serves that build.

## Controls

| Key | Action |
| --- | --- |
| Arrow keys (or WASD) | move (relative to the camera) |
| Shift + arrows | run: **the scaffolding's simulation runs ×2.7 faster** |
| Ctrl + arrows | creep: **the scaffolding slows to ×0.12** (Alt/Option also works, e.g. on macOS where Ctrl+arrows switch desktops) |
| Standing still | scaffolding runs at ×0.55 |
| Space | jump (you can climb onto scaffold stacks and rubble) |
| E | dismantle the highlighted bay |
| M | mute / unmute (also the button bottom-right) |
| H | hide the key panel |
| Mouse drag / wheel | orbit / zoom the camera |
| R | new shift (after the ending) |

After the ending, **Keep looking** hands the camera over for free exploration of the final state (nothing is reset or replayed):
drag to orbit (all the way round), wheel to zoom, right-drag (or Shift + drag) or the arrow keys to pan, Q / E to lower / raise the
pivot, Shift to move faster.

The "Scaffold tempo" panel shows the current multiplier. Tempo is a real simulation factor: growth,
replication delays, tricks, wall damage and the collapse schedule all run on `dt × tempo`.

## A session is not a script

Every session has a **seed** (`seed.js`). `Math.random` is replaced by a seeded generator, so one session is internally
coherent and (on the dev server) a seed can be replayed with `?seed=1234` in the URL. Ordinary sessions get a fresh seed from the clock.

The **session director** (`director.js`) turns the seed into a scaffolding with its own **tendencies**: curiosity, mischief,
destruction, playfulness, escalation and evasion (each 0–1). It also gets a starting **lean** towards one of the five endings.
The tendencies feed the mind, the demon and the crowd through multipliers: how much it likes each kind of trick, how fast it grows,
how often it plays pranks, and how patient the workers are. A session leaning towards the student ending keeps the crew small;
one leaning towards the resignation ending calls people in much sooner.

Stages are not fixed thresholds. The director keeps an event-driven **tension** value. Every dismantle, dodge, refusal,
regrowth, trick, laugh, arrival, argument, resignation and bit of wall damage is reported to it (`director.note(kind)`), and each
event also adds to per-ending **scores**. When tension passes jittered thresholds (about 0.12, 0.32 and 0.62), the stage advances.
At the climax the director picks a weighted ending among those that are *eligible* in the current state. The lean, the
tendencies and what actually happened all count, so the same seed played differently can end differently.

**No repeats, and deliberate frequencies:** each ending has a base weight (standard destruction 4, students 2.5, walking
scaffolding 2.5, ghost 1.1, flying scaffolding 0.3). The last few endings are remembered in the browser (`localStorage`, key
`pandaemonium.endings`). The previous session's ending is excluded whenever there is any alternative, endings from the last
three sessions are weighted down, and the flying ending is weighted down further for four sessions after it has been played.
Over 20,000 simulated sessions this gives roughly: standard destruction 31 %, students 25 %, walking scaffolding 25 %,
ghost 15 %, flying scaffolding 4 %, with no immediate repeats. It is a weighted choice, not a rotation. (If storage is
unavailable, for example in a private window, every session simply chooses from the base weights.)

The broad arc stays the same. The scaffolding starts **innocent** (deniable little slips), turns **mischievous** (fake
cooperation, swaps, taunts) and ends **malicious** (coordinated moves, walls, false calm). The stage names are:
Order → Resistance → Escalation → Domination → the ending's own stage name.

### The five endings

**Every ending destroys the university building completely, step by step**, and the scaffolding does it.

- **During play** (`demon.wear`): everything the scaffold does against the facade wears it down a little: a bay sprouting
  against it, a stack moving along it, a dismantled bay replicating, the frames pressing on it all the time. Each stage caps
  how far this may go. While it is innocent there are only cracks. In escalation windows break and walls lean. In domination
  upper floors and roofs can fall, and the ground floors hold out longest.
- **In the ending** (`director._destroy`, two stages): first *erosion*. The scaffold keeps working module by module, wherever
  it is thickest and the facade already hurt; modules crack, lose their windows and topple, and integrity falls steadily
  (typically about 93 % → 30 % over 10–15 s). Then the *final collapse*: the rest goes in a quick cascade and one big impact,
  and the end walls sink last.
- **Integrity** counts damage, not just fallen pieces, so the HUD figure drops gradually.
- **The final state** is `building.allDown()`: everything is rubble and nothing is still falling. `finish()` never shows the
  end card before that.

| Ending | How common | What happens around the destruction | Ends when | Safety limit | End card |
| --- | --- | --- | --- | --- | --- |
| **Standard destruction** (`collapse`) | the most common (about a third) | the night shift is called in (about 40 workers) while the scaffold erodes the building; then the final collapse, framed wide. The moment it lands the whole crowd runs, most of them towards the north gap. Tools are thrown and slip out of their hands, lines are shouted on the run, and the chase camera follows the crowd and closes in on it. When the crowd is out, the camera finds the one worker trudging far behind, who delivers the final remark ("They don't pay us enough for this." when it is the foreman) | the building is gone, the crowd has left, and the slow worker's remark has played (escape capped at 18 s) | 42 s | *Aftermath* |
| **The Dean Has Left the Building** (`students`) | regular | students, two or three professors and the dean fill the windows, watch, film, call each other over and duck at each crash while the scaffolded wing comes down. Then, before their part of the building goes (the destruction waits for them), they climb onto the sills, jump down (with a bonk on landing) and run for the exits, each with one line on the way ("What happened to our university?!", "I'm the dean! Let me through!", "Somebody save the library!"). The crew runs too | the building is gone, every student is out of the courtyard, and the crew has left | 48 s | *The Dean Has Left the Building* |
| **The living scaffolding** (`walker`) | regular | most of the building is eroded first (integrity down to about 15 %); the three columns where the creature will form are protected until then, while the crew backs off into the courtyard and watches. Then it goes quiet, the bays pull together into the four-legged creature, which stands up, giggles, and head-butts the remaining columns and finally an end wall down: its blows cause the final destruction. When nothing is left it trots off through the nearest wide exit, while the crew stares, points, backs off and comments | the building is gone and the creature's whole body is past the courtyard boundary | 72 s | *It Left* |
| **The ghost of Walter Gropius** (`ghost`) | occasional | the building is destroyed completely while the crew backs off into the courtyard; the rubble settles, and the crew stands on clear paving in front of the outermost rubble (never inside it). Only then do the ruins hum and glow, and the ghost rises among them in a column of light. He looks at the ruins in exaggerated despair, then at the crew: "WHAT HAVE YOU DONE TO MY UNIVERSITY?!" Somebody blames the scaffold, which titters innocently. One more dry line, the crew slinks off and he sinks back into the rubble | he has gone and the crew has left (or after a few seconds) | 55 s | *The Founder* |
| **Flying scaffolding** (`fly`) | the rarest | it multiplies faster than ever while it eats the building, and starts to float. Only once nothing is left standing do the bays peel off, rise into a circling flock, tighten and fly off in four flocks. Workers look up, point and duck. One little bay is left behind, hops, giggles and flies after them | the building is gone and every bay has flown off (removed past a boundary 110 m out) | 62 s | *Migration* |

Each ending is an explicit state in the director (`director.E`): a start, its phases, a completion condition, and a safety
limit. After the limit the destruction is hurried to its end; a hard limit 15 s later ends it regardless. `finish()` is the
single transition to the end card, and a second ending can never start. While an ending runs, the ordinary escalation stops:
no new arrivals, no pranks, no rare events, no extra wall damage.

(The earlier "mass resignation" ending, with the night shift and forty workers giving up, is no longer one of the endings.
The workers' gesture system it used, with tools thrown down and hands up, is still in `crew.js`.)

**The courtyard boundary** (`CFG.court`, world space: x −39.5 to 62, z 0.55 to 33.2; `outsideCourt(p, margin)` in `config.js`)
is what every exit is measured against. A worker or student counts as gone as soon as they cross it. A few metres later, once
they are out of shot, they disappear, so nobody runs on for ever. The walking creature counts as gone once its whole body is past it.

**The slow worker** is in every escape (standard destruction, students, ghost). Usually (55 %) it is Bernd; otherwise it is a
random colleague. They trudge with a slumped, shuffling gait, stop once to look back with a sigh and a line ("My knees."), and
leave last. The session does not wait for them indefinitely: once the main group has left, they get a few seconds for the joke.

**Keep looking** (free camera: orbit, pan, zoom) works after every ending.

### Rare events (during the main game)

Each session rolls once for each special event (students about 65 %, administrator 45 %, tour 30 %). Even a rolled
event only happens when its **conditions** are met. Events also have **cooldowns** and **exclusions**:

- **Students at the windows**: they appear only shortly after something surprising, at most twice. They rise at first-floor
  windows of the NE block and the studio, lean out, film on their phones, point and call their friends, then duck back.
- **Dr. Brandt, Administration**: needs 12+ workers or visible damage, and never appears in a session leaning towards the
  ghost (he and the ghost are alternatives). Lines depend on the situation ("Can someone explain what happened to the
  university?", "I leave you alone for five minutes.").
- **Guided tour**: early in a session, a guide walks a small group past: "And here, the original Bauhaus scaffolding. 1919,
  I believe."

### Development parameters (dev server only)

| URL | Effect |
| --- | --- |
| `?seed=1234` | replay a session seed |
| `?ending=walker` | force an ending (`collapse`, `students`, `walker`, `ghost`, `fly`); bypasses eligibility |
| `?event=admin` | force a rare event (`students`, `admin`, `tour`) |

These, and the console hooks (`__director()`, `__mind()`, `__game`, `__step()`), exist only under `npm run dev`
(`import.meta.env.DEV`); the built game ignores `?ending=` and `?event=` and has no hooks. `__director()` prints the profile,
tension, scores, the chosen ending, its phase and the event history.

### The scaffolding has a mind (`mind.js`)

Its personality is a mischievous little monster child's: not evil and not frightening, but playful, curious, cheeky and now and
then completely out of control. Each run it rolls a **temperament** (sly, stubborn, skittish, show-off or brooding). It sets how often it dodges,
how fast and how often removed bays grow back, how much it likes its eyes and how readily it laughs, how fast it escalates, which
section of the facade it starts on, two spots where it likes to sprout, and two **signature moments** it waits for a chance to play.

It **remembers**: which sections the workers keep going for, how many attempts have failed, how many workers there are, how rattled
they are, whether they are busy arguing, which tricks it played recently (it avoids repeating itself), and how long it has been quiet.
From that it grows bolder through three **phases**:

- **innocent**: almost normal and deniable. A section shifts slightly and springs back, a reached-for bay slips away, a removed
  bay slowly regrows as though nothing happened, eyes appear only rarely, and any giggle is quiet.
- **mischievous**: it anticipates a section that someone keeps targeting, pretends to come loose and then pulls away at the
  last moment (fake cooperation), swaps one section out of a worker's way while another steps into it, does pointless taunting
  turns, bows mockingly, edges away from approaching workers, pulls a platform away just before someone lands on it, and strikes
  while the workers are arguing.
- **malicious**: coordinated moves against several workers at once, rebuilding somewhere unexpected while another section is
  being dismantled, temporary walls that appear in front of someone and vanish again, sudden stillness, and a false calm (when
  things have been quiet and the crew is settling down, something big happens).

On top runs a **strategy** (evade, resist, retreat, obstruct, rearrange, rebuild or mock) that changes every 20–40 s.

**Giggling** (`audio.laugh`): when a prank lands (a dodge the worker falls for, a section popping back in, a wave, an obstacle
taken away again), the scaffolding sometimes giggles, and you can actually hear it. It is a synthesised small child's
"hee-hee": a breathy, high voice through child formants, each syllable starting on a puff of breath, with a faint ring of steel
so that it is clearly the scaffold. There are four kinds, each with several variations: a quiet *titter*, a *giggle*, a quick
*burst* ending on a squeal, and a whole *fit* with little squeaky breaths in between (when several workers are fooled at once).
After a successful prank it sometimes does a happy little **wiggle** (the stack bounces and shimmies). Now and then a muffled
**distant giggle** comes from a far part of the frame, and someone asks "Did you hear that?". Giggles have cooldowns, only one
plays at a time, many pranks stay silent, and while one plays the other effects are ducked so it can be heard over the clatter.

### The crowd (`crew.js`)

There is no target number of workers. The first one starts alone. Failures, dodges, sections growing back, tricks seen up close,
laughs heard and the crew's rising stress add up to a **pressure**, and when it passes a threshold somebody calls for help. The
threshold grows with the crowd, and each crew has its own patience. One worker comes, or a few at once when things are really
bad, and they trickle in through the real gaps between the buildings. Some colleagues give up and walk off again. In test runs
the crowd at the climax ranged from 4 to 37. `CFG.crew.max` (90) is only a performance limit, and workers beyond the ten named
regulars are generated (names, clothes, facial hair, accessories).

Colleagues have **roles**: plain workers, organisers who shout orders nobody follows, self-declared experts whose confident plans
fail (and get mocked), onlookers who stand back and comment, and late arrivals who regret coming and leave. Dialogue is chosen by
what just happened, from about 200 lines, and avoids repeats.

Colleagues **arrive differently**: some hurry, some approach cautiously, some push through the crowd and some stroll in. Helmets
come in many colours (white, yellow, orange, red, blue, green and more). Far-away workers update their faces and limbs less often and drop
their shadows (level of detail), and each worker's static parts are baked into a few vertex-coloured meshes. At the end a big crowd scatters along the real exits at
staggered times; nobody gathers.

**Voices.** Dialogue is shown in speech bubbles only: nothing is spoken aloud, and lines have no talking blips. Workers
still make short synthesised noises when something happens to them (a yelp, "oof" when they bump, a sigh, a groan, "whoa"),
and the scaffold keeps its giggles.

## Code layout (`game/src`)

| File | Responsibility |
| --- | --- |
| `config.js` | all tuning: speeds, tempo factors, per-stage growth/replication/damage, thresholds, the campus footprints (`CFG.site`) and the courtyard boundary (`CFG.court`, `outsideCourt`) |
| `architecture.js` | procedural Hauptgebäude from its OSM footprint (one straight bar: gambrel sections, the studio section with three atelier windows, the NE end blocks, the rear stair and glass hall), split into variable-width destructible columns, damage, toppling, sinking, rubble |
| `campus.js` | the buildings round the courtyard: the Van-de-Velde-Bau L and its white mirrored L on the east side, Geschwister-Scholl-Str. 15 (kept separate between them), Liszt-Haus, Kubus |
| `scaffold.js` | lattice data, instanced rendering of tubes, decks, knuckle couplers, feet and netting, per-bay animation (grow, warm flush, shudder, scuttling slide, lean, jelly ripples, camera cutaway), and the rare, shy *peeking eyes* |
| `seed.js` | session seed (`?seed=`), seeded `Math.random`, dev overrides (`?ending=`, `?event=`) |
| `director.js` | the session director: tendencies, lean, tension, outcome scores, stage pacing, the choice of ending (avoiding the previous session's) and the five endings as explicit states, rare-event rolls with conditions, cooldowns and exclusions |
| `walker.js` | the walking scaffold creature (lattice body, head with eyes, four IK legs, trot gait) |
| `extras.js` | non-crew people: students at the windows (and en masse in the witnesses ending), the administrator, the tour group, the ghost of Gropius rising from the courtyard |
| `demon.js` | the scaffolding's behaviour: where to grow, replication on dismantle, tricks, pressure on walls, triggering collapse |
| `worker.js` | one shared stocky body for the whole crew (`BASE`, `createWorkerModel()`), ten `VARIANTS` differing only in clothes and accessories, a personality per worker (timing, intensity); thick rubber-hose limbs, hand-drawn canvas faces, spring-driven poses, reactions |
| `crew.js` | the crowd: event-driven reinforcements (pressure), roles, colleague AI (work, panic, gawk, organise, propose, watch, quit, argue, bump), reactive dialogue, LOD, the continuous escape, dropped tools |
| `shapes.js` | shape helpers: rebuildable tapered tubes (limbs, trunks, lamp posts), puffy foliage blobs |
| `fx.js` | comic effects: `!`, `?`, `#@%!`, anger mark, sweat, stars, steam, onomatopoeia, dust, debris, shards, flying tubes |
| `audio.js` | the central audio manager: a bank of sounds rendered once at start (clanks, rubble, impacts, glass, footsteps, four kinds of child giggle), played as voices with a total limit, limits and priorities per category, throttles, effect ducking under giggles, load shedding and recovery; live-synthesised creaks, scrapes, rumble, whoosh, choir and worker vocal noises (no speech) |
| `game.js` | rules: stages, tempo coupling, collisions, dismantling (shared by player and crew), event → reaction mapping, cinematic hand-off |
| `render.js` | painted pipeline: colour pass, normal/depth pass with an ink mask, composite with stable AO and contact shadows, outlines only round characters and scaffold, soft form lines, split toning, paper |
| `toon.js` | shared painted material (hue-shifted bands, world-space painted pixels with ordered dither up close, pigment drift, cloud shadows, rim, wind sway, graphic glass), mood uniforms and palette |
| `world.js` | sky objects, the courtyard planting (broadleaves, poplars, weeping trees, birches, box topiaries, bushes, ferns, clover, flower drifts, mushrooms in irregular natural patches, a fallen log), far groves, paving, lawn, crook lamps, mood |
| `flora.js` | leaf-built canopies (leaf cards on a dark inner mass with canopy normals), mushrooms, ferns, tiny flowers |
| `mind.js` | the scaffolding's mind: temperament, memory, phases (innocent / mischievous / malicious), strategies, the behaviour repertoire, laughter, run log |
| `hud.js`, `hud.css` | hearts/counters/slots HUD, crew counter, stage tag, banner, speech bubbles, cinematic mode, foreground foliage frame |
| `camera.js`, `input.js`, `textures.js` | follow camera / fixed escape shot / free exploration after "Keep looking", keyboard, canvas textures (paving, lawn, sky, lettering) |

Three.js (0.170) is the only runtime dependency, and Vite is the dev server and bundler. There are no API calls, no keys and no external assets
(textures and sounds are generated at runtime). Google Fonts are loaded for the HUD and fall back to system fonts when offline.

## Visual style: "Weimar wobble"

An illustrated cartoon universe in fully navigable 3D. Broad references: the stylised, readable worlds of Eastward,
Animal Crossing and Super Mario Galaxy, Adventure Time's shape language and character proportions, The Midnight Gospel's
imaginative freedom (the floating island, the ringed planet, the melting dusk) and GRIS's principle of one art-directed world.
Nothing is copied.

- **One shape language**: everything is inflated, slightly lopsided and hand-bent. The workers have rubber-hose limbs,
  the trees have curly noodle trunks and puffy foliage clouds, the lamps are shepherd's crooks, the kerbs and bench slats are soft
  sausages, and the town houses bulge and lean on each other.
- **Palette**: warm, mid-saturation naturals for most of the world (butter plaster, terracotta, sage, warm sandstone, dusty sky).
  Saturation goes where it matters: the workers' safety orange and cobalt, and the scaffold's periwinkle steel. Shadows lean
  blue-violet, and as the building falls the mood moves to a violet-orange dusk.
- **Workers**: everybody shares one body: short, stocky and pear-shaped, with thick fleshy arms (bare forearms under short
  sleeves), stumpy legs in clown boots, mitten fists, a big round head with a widened jaw, and curly hair. Variation comes only
  from clothes, facial hair, glasses, earrings, a pencil or a cigarette, and a few percent of size. Bernd, the player, has the most
  exaggerated face (broad jaw, huge nose, curled moustache tips, a toothy smirk), loosely inspired by Wario's proportions but not
  copying him. Faces are drawn on a canvas each frame (ink-dot eyes, shock eyes, heavy brows, smirks, gaping mouths, gritted teeth,
  deadpan lids, blush, tears).
- **Crowd**: each worker has their own spring stiffness, gesture size, walk tempo and fidget rhythm, so ten people doing the same
  reaction never move in sync. Light separation steering keeps them apart, and fast collisions turn into comic bonks and stumbles.
- **Dialogue**: compact bubbles (Gluten, with Bagel Fat One for shouts and gibberish) that follow the speaker and nudge apart when
  they overlap. A scheduler allows one line at a time, two at most. The tone is tired and dry ("Yeah, no.", "Not in my contract.",
  "Great. It has a union now.", "This is a management problem."), with occasional symbol-swearing ("@#%&!!") for real outbursts.
- **Animation**: every joint follows its target on an underdamped spring, so each pose change overshoots and settles.
  Reactions are written as beats (anticipation, action, hold, flop): disbelief freezes, tug of war, exasperated arm flings,
  facepalms, calls, arguments and shrugs. The walk changes with mood (strut, trudge, frantic windmilling, tiptoe, the
  hands-in-pockets stroll home). Idle fidgets are picked at random, and there is squash & stretch and a lagging hat.
- **Scaffolding**: ordinary-looking scaffolding that moves wrongly (and, see `mind.js`, decides how). Stacks scuttle on little feet, the frame ripples like jelly
  after every disturbance, and the steel warms toward coral when agitated. Eyes are a rare gag: one to three open briefly in a
  coupler, between the rails, under a deck or deep in the frame. They watch the nearest worker, glance at the camera, wink or
  roll, and snap shut if you look straight at them. They are triggered by gameplay events (dismantling, reconnects, tricks,
  failures), never shown permanently.
- **Typography**: Bagel Fat One (chunky, rounded display type: stage names, counters, banner, sound effects in 3D, with
  hopping letters) over Gluten (a bouncy but very readable body face for hints and dialogue). Speech bubbles are cut-paper
  cards with lopsided corners and hard ink shadows; shouted lines switch to the display face.
- **Edges and shading** (`render.js`): the old black contours came from a screen-space edge detector run over everything,
  with a time-based "line boil" that shifted the sampling every frame and screen-fixed hatching, so lines crawled whenever the
  camera moved, and every architectural crease got a thick dark line. Now there is no boil and no screen hatching. Dark outlines
  are drawn only round ink objects (workers, scaffold, flying tubes, flagged in the normal pass's alpha). The architecture,
  ground and plants get soft form lines in a darker shade of their own colour, only up close, plus a fixed-pattern depth
  ambient occlusion that gives contact shadows and soft creases without noise. The moving shadow frustum is snapped to whole
  shadow-map texels, so shadow edges no longer shimmer as the camera follows the worker.
- **Brush dabs** (`toon.js`): short strokes laid on every surface in patches of different directions, each in a few stepped
  tones of the same colour, fixed to the surface and faded out with distance (no shimmer).
- **Painted pixels** (`toon.js`): up close, light falls in crisp steps through a 4×4 ordered (Bayer) dither on a world-space
  grid of about 7 cm, glued to the surfaces so it never swims. With distance it fades into soft painted bands. Surfaces carry
  slow warm/cool pigment drift and fine grain, cloud shadows drift across the courtyard, and leaves, grass and flowers move in a
  gentle wind. The palette is unchanged.

To tune the look, edit `PAL` and the `ILL` uniforms in `toon.js`, `FAMILIES` and the `calm` and `dusty` moods in `world.js`,
`VARIANTS` in `worker.js`, and the composite uniforms in `render.js`.

## Audio stability

In earlier versions the sound sometimes stopped for many seconds around stage 4 and then came back. The cause was the number of
WebAudio nodes: every event built its own small synthesis graph. One rubble sound alone made about 100 nodes, a clank 16, and
the sinking-facade loop asked for rubble every frame. In the chaotic stage the game created up to about 5,300 nodes (1,700
sources) per second. The browser's audio thread could not keep up: the audio clock fell to about 10–15 % of real time for
18 seconds (silence, or stutter), and then the backlog played at once.

Now these effects are rendered once into a sound bank and play as voices of three nodes each, through a manager with limits,
priorities and throttles. If the audio clock ever falls behind, low-priority sounds are shed for a moment. If the browser suspends
the audio context, the game tries to resume it. Measured in the same chaotic stage (headless Chrome): about 130–360 nodes per
second, and the audio clock stays at 0.99–1.01 of real time throughout.

## Implemented vs. placeholder

**Implemented:** real-time movement, third-person camera, dismantling, replication, rearranging,
reconnection, tempo-coupled simulation, a seeded session director with stages, five endings (with memory of the previous ones) and rare events, progressive modular destruction
in real time, worker reactions and comic FX, synthesised sound with a mute toggle.

**Placeholders / approximations:**
- **Changes requested in this iteration (deliberate departures from OSM):** the east side is a mirror image of the
  Van-de-Velde-Bau's L in white, replacing the separate M18 / Marienstr. 16 blocks. The entrance is one centred porch across the
  middle studio bay. The sky objects (ringed planet, moon, floating island) and the dome-like far hills were removed, which was
  the cause of the "planets" seen behind the scaffolding after the ending; the far hills are now low, flat ridges.
- **Site and buildings:** the main building ends at its north-east gable. OSM also lists a flat block and a pyramid-roofed
  pavilion beyond it, which are left out of the scene on purpose. The Van-de-Velde-Bau is one continuous L (a single extruded
  outline, including the chamfered inner corner from OSM, with a mansard lofted over the whole L). Footprints, building parts, storey counts and roof shapes and colours come from OpenStreetMap
  (© OpenStreetMap contributors, ODbL; the Hauptgebäude is way 110288877 with its building:parts, plus the Van-de-Velde-Bau,
  No. 15, M18, Marienstr. 16, the Liszt-Haus and the lawn). They are converted to game metres along the main building's axis.
  The city of Weimar's page on the building confirms the long, narrow front broken by four pilasters reaching to the roof, the
  curved studio windows and the lower Van-de-Velde-Bau opposite. Wikimedia Commons photos confirm the colours, balconies, entrance
  and dormers. No usable, licensed 3D model of the complex was found or imported, so everything is rebuilt procedurally.
  Approximate: window counts per section, storey heights, roof pitches, the rear facades, the shallower depth of the
  south-west end (modelled at full depth), and the neighbours' facades, which are simplified.
- **Workers:** built from primitives, lathe shapes and per-frame rebuilt tubes (no skinned rig), with faces painted on a canvas.
  Swap `createWorkerModel()` for a rigged GLTF and keep the joint names.
- **Performance with big crowds:** headless Chrome on the dev machine measured about 50 fps with 31 workers, 31 fps with 61
  and 23 fps with 91. Crowds above about 50 are rare in normal play.
- **Walker:** walks a fixed path to the nearest wide exit (north gap or east side) and does not collide with trees or buildings.
- **Flying swarm:** the flock is steered with simple per-bay targets (no flocking simulation), and it is capped at 760 bays for performance.
- **Performance:** the leafy vegetation is the heaviest part (about 1–1.4 M triangles per frame across the colour, normal
  and shadow passes, depending on the view). It holds 60 fps in headless Chrome on the dev machine but is untested on weak GPUs.
- **Crew AI:** simple steering (head for a ground-level bay, sidestep when blocked, give up after a while). In a very dense
  late-game lattice a colleague can wander or stand around. During the escape the crew ignores collisions with the scaffold
  (bays round the runners are cut away instead) so nobody gets stuck; with a full 900-bay lattice some runners are still hard
  to see in the shot.
- **Voice:** worker noises are formant-synth, the giggles are synthesised offline into buffers; no recorded voice lines.
- **Physics:** pseudo-physics only. Modules topple and settle and cores sink, with no structural simulation.
  Debris does not interact with the scaffolding, which is deliberate: the scaffolding always survives.

## Ideas for the next iteration

- Model the building from measured drawings or photogrammetry, and add the real courtyard layout and the van-de-Velde-Bau opposite.
- Replace the worker with a modelled, rigged character based on the reference image.
- Let the worker walk inside bays on the decks (they are currently solid blocks you can stand on).
- Recorded foley and voice, and adaptive music that follows the tempo.
- Better camera occlusion handling in very dense late-game scaffolding (lamp posts and trees can also hide the worker).
- A quality setting for weaker GPUs (lower render scale, no hatching), since the illustrated pipeline draws the scene three times per frame.
- Touch and gamepad controls.
