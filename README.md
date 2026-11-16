# SHARDLINE

[![make.fun · threejs-fps-01](https://make.fun/badge/threejs-fps-01.svg)](https://make.fun/bounty/threejs-fps-01?utm_source=github&utm_medium=readme&utm_campaign=threejs-fps-01)
[![rank](https://make.fun/badge/threejs-fps-01/GBNK619/shardline/rank.svg)](https://make.fun/bounty/threejs-fps-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=threejs-fps-01)
[![reward](https://make.fun/badge/threejs-fps-01/GBNK619/shardline/reward.svg)](https://make.fun/bounty/threejs-fps-01?utm_source=github&utm_medium=readme&utm_campaign=threejs-fps-01)

SHARDLINE is a round-based tactical FPS that runs entirely in the browser on
three.js. Four Wardens attack Foundry Nine — a compact foundry map with a
crane yard, a furnace hall and a mid corridor — against four Jackal defenders.
Win a round by eliminating the other team or by planting the shard charge at
Site A (Crane Yard) or Site B (Furnace Hall) and defending it until it
detonates; lose it if the timer runs out or the charge is defused. Money
earned each round buys weapons, armor and grenades in the 12-second buy
phase. First to 7 rounds takes the match. Gunplay rewards stopping to aim:
spread blooms with movement and sustained fire, the first shots are
near-perfect, and headshots pay triple. Bots run waypoint routes, hold sites,
strafe and burst-fire in engagements, plant and defuse the charge, and fall
back when hurt — and they get sharper as the rounds go on.

## How to play

- **Move:** WASD · **Sprint:** Shift · **Crouch:** Ctrl · **Jump:** Space
- **Look / aim:** mouse (pointer lock) · **Fire:** left click · **Reload:** R
- **Plant the charge:** hold E inside a site ring (attackers)
- **Throw grenade:** G (buy one first) · **Scope (Needle):** right-click
- **Buy menu:** B during the buy phase, or keys 1–6
- **Pause:** Esc (releases pointer lock) · **Resume:** click Resume

Weapons: P9 Sidearm (free), Rook SMG ($900), Longbow AR ($2,700), Needle
Marksman ($4,500, scoped one-shot headshot), Vest Armor ($650, halves body
damage), Frag Grenade ($300). Kill +$300, round win +$1,400, loss +$900,
plant +$300. Rounds are 100 seconds; after a plant the charge detonates in
35 seconds unless defused (5-second channel).

## Run it locally

The game is plain static files with no build step. Serve the `game/` folder
with any static server and open `index.html` in desktop Chrome:

```sh
cd game
python3 -m http.server 8080
# open http://localhost:8080
```

No network requests, no external assets: all art is procedural geometry and
canvas textures, all sound is synthesized with WebAudio. three.js 0.187.0 is
vendored under `game/vendor/three/`.

## Staging / screenshots

The game supports deterministic staging scenes for screenshots:

- `?shot=title&seed=7` — title screen over the map
- `?shot=buy&seed=7` — buy phase with the buy menu open
- `?shot=fight&seed=7` — mid-round firefight at Site A
- `?shot=end&seed=7` — match-end screen

`?test=1` exposes `window.__shardline` for scripted play-testing
(start/buy/force win or loss/plant/teleport/fire/restart).

## Entry

`main.ts` (Node 22, standard library only) copies `game/` and `screenshots/`
to `/output` and writes `/output/dossier.json` via
`vendor/makefun-threejs.ts`:

```sh
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts
```

## License

MIT — see [LICENSE](LICENSE).
