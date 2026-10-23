# Meridian G8, the Railgun: Implementation Plan

> For agentic workers: REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task by task. Steps use checkbox (`- [ ]`) syntax for tracking. Ledger: `.superpowers/sdd/meridian-g8/progress.md`.

Goal: the Starship Meridian gets its railgun. `Weapons` is a static module that the `meridianSystems` aggregate imports and re-exports after `Helm`. It contributes `WeaponsPhysics` to `SHIP_SYSTEMS` (phase 3) and `WeaponsPower` to `POWER_CONSUMERS`, and it adds `WeaponsCommands` to `COMMAND_HANDLERS` and binds `WEAPON_MOUNT`. The snapshot gains `weapons` (status, charge in J, shots, hits, last shot) and the setpoints gain `weapons` (armed, range), both directly after `comms`. The capacitor draws `railgun` at priority 6 with heat share 0 and charges 150,000,000 J a tick to 400,000,000 J. A shot needs 300,000,000 J, draws one number from the loop's `fork('Weapons')` stream, hits when that number is under `0.8 · exp(-range / 50,000 m)` and heats the coolant loop by 0.08992805755395683 K. The crew fires with `{ system: 'weapons', action: 'fire', range }` on `POST /commands`. G8 adds the pure physics in `src/physics/weapons.ts`, a library module test and a golden, a route block on three frameworks and an eighth runtime case, the console's `/systems/weapons` page with its growth case, and the spec and README text for all of it.

Architecture: one pull request, `feat/meridian-g8-weapons`, cut from `release/0.4` at `41cacb5a` (G0 to G7 merged). The library gains `src/physics/weapons.ts` and `src/systems/weapons/`, and `pulseCoolant` moves from `src/physics/ftl.ts` to `src/physics/thermal.ts`. `bridge-api` gains a route block, a runtime case and one regenerated `graph.json`, and no source file. The console gains the weapons page and an eighth growth project. G8 changes nothing under `libs/`, the federation shell or the docs.

Tech stack: Node from `.nvmrc` (24.20.0), TypeScript 6.0.3, Vitest 5.0.5, Nx 23.3.0, Hono 4.13.13, Express 5.3.0, Fastify 5.12.7, React Router 8.4.0, Playwright 1.64, Deno 2.9.6, Bun 1.4.2.

Spec: `specs/2026-10-21-meridian-ship-systems-design.md` (§ below). Earlier plans: `specs/plans/2026-10-21-meridian-g0-kernel.md`, `-g0b-telemetry.md`, `-g1-engineering.md`, `-g2-lifesupport.md`, `-g3-safety.md`, `-g4-airlock.md`, `-g5-comms.md`, `-g6-propulsion.md`, `-g7-ftl.md`. Also the `nexusdi-ways-of-working` skill.

G7 is complete and merged: this plan reads `FtlDrive`, `pulseCoolant`, the ftl golden, `levelArgument`, `LevelForm` and the `ftl` growth project as they stand at `41cacb5a`.

## Owner rulings

1. Earlier e2e test bodies and earlier goldens stay unchanged, and a golden may only gain lines. Enumerating unit assertions may grow with the ship under G5 ruling 14, G6 ruling 12 and G7 ruling 13; ruling 11 below names each one.
2. Console gauges show SI units: K as whole numbers, kPa, Pa, mol and W, plus the propulsion units of G6. The joule and the watt are SI units, and mega is an SI prefix, so `Capacitor charge` in MJ to 0.1 and `Capacitor power` in MW to 0.1 meet the rule. The range shows in whole m. Words and ticks (status, arm, last shot) carry no unit.
3. Deterministic checks gate the growth track: the unit tests, `check.test.ts`'s graph check and the purity checks run in `main`, and `e2e-growth` never gates.
4. The rule of three applies everywhere except lists of figures or ids. No absolute local path and no vault path appears in a committed file.
5. The duplication limit is `.fallowrc.jsonc`'s 2.25 %. The branch aims at 2.15 % or less and never raises the limit.
6. The branch stays at 100 commits or fewer, the limit of GitHub's rebase merge.
7. No hook is bypassed in any way: no `HUSKY=0`, no `--no-verify`, no `git commit-tree`, no `git update-ref` on a commit, no `-c core.hooksPath`, in the main worktree or in a scratch worktree. An `amend!` fixup carries the full message, the subject line included.
8. Issues #188, #191 and #194 are out of G8's scope.

## Rulings this plan carries

The architect proposed and the tech lead decided these on 2026-10-23. The tech lead's text overrides the architect's, and the numbering below is the tech lead's. The full text and the node scripts behind each figure sit in the session scratchpad's `meridian-g8/` folder (`architect.md`, `rulings.md`, the `arch-*` and `tl-*` scripts and their logs). Task 8 writes them into the spec, each as "tech lead, G8 ruling N".

1. Core APIs. The architect's section 0 stands (`arch-core.log`, equal to `tl-core.log`). A direct `POWER_ROUTER` dep on the mount fails the build with `NEXUS_BLUEPRINT_INVALID` and `NEXUS_CIRCULAR_DEPENDENCY` on `["PowerRouter","PowerConsumers","WeaponMount","PowerRouter"]`, and `lazy(POWER_ROUTER)` passes `Nexus.check`. The loop forks `fork('Weapons')` once, at `add()`, and the step reads it from `TickContext.rng`. Seed 7 draws u1 0.5776788084767759 and u2 0.8633130805101246 there, and `fork('Safety')` reads the same stream with and without `fork('Weapons')` drawn first (S5). G8 changes nothing under `libs/`.

2. The record and the setpoints. The shot type is `RailgunShot`.

   ```ts
   /**
    * `idle`: unarmed. `held`: armed below a full bank, and the router shed the
    * capacitor this tick. `charging`: armed below a full bank. `charged`: the
    * bank holds `capacity`.
    */
   export type WeaponsStatus = 'idle' | 'held' | 'charging' | 'charged';
   export interface RailgunShot {
     readonly tick: number;
     /** The range the crew ordered, in m. */
     readonly range: number;
     readonly hit: boolean;
   }
   export interface WeaponsRecord {
     readonly status: WeaponsStatus;
     /** The capacitor's charge, in J. */
     readonly charge: number;
     /** Shots fired since tick 0, and how many hit. */
     readonly shots: number;
     readonly hits: number;
     /** The newest shot, or null before the first. */
     readonly lastShot: RailgunShot | null;
   }
   export interface WeaponsSetpoints {
     /** True once the crew fired: the capacitor charges to `capacity` and holds it. */
     readonly armed: boolean;
     /** The range of the shot that waits for the charge, in m, or null. */
     readonly range: number | null;
   }
   ```

   `RAILGUN = { capacity: 400e6, shot: 300e6, power: 300e6, pulseShare: 0.25, accuracy: 0.8, falloff: 50_000, range: 100_000 }` and `RAILGUN_LOAD = { id: 'railgun', priority: 6, heatShare: 0 }`. The store starts the record at `{ status: 'idle', charge: 0, shots: 0, hits: 0, lastShot: null }` and the setpoints at `{ armed: false, range: null }`, frozen at every level. Weapons is a static module, so the record needs no `offline` status. Every field is an integer, a boolean or null, so the runtime case compares exact values on every engine. The record keeps no hit chance, since `Math.exp` is not fixed bit for bit across engines (§8.3).

3. The step and its order in the tick. `stepWeapons(weapons, setpoints, { tick, dt, allocated, shed, draw }, rating)` returns `{ weapons, setpoints, pulse }` and the objects it got when nothing changes.

   ```text
   E1     = min(E_max, E + P_w,allocated * dt)                                   the charge first
   fire   when range != null and E1 >= E_shot:
            E' = E1 - E_shot, u = draw(), hit = u < 0.8 * exp(-range / 50 km),
            shots' += 1, hits' += hit, lastShot' = { tick, range, hit }, range' = null,
            pulse = 0.25 * E_shot = 75,000,000 J
   status = charged at E' >= E_max, else idle when unarmed, else held when shed, else charging
   ```

   The step charges first and then fires, the order §5.9 writes, so an empty bank fires on its second charging tick. `draw` runs on a shot tick alone, so shot n always reads the nth draw of `fork('Weapons')`. On the tick a full bank fires the status reads `charging` with the tick's load at 0 W, since the bank holds 100 MJ from that tick on. A fifth status `fired` would hold for one tick and tell the crew nothing `lastShot.tick` does not.

4. Spec line 1088: how the shot reaches the loop. The shot enters the loop in phase 3, in `WeaponsPhysics`, through `pulseCoolant(coolant, pulse, LITHIUM_LOOP)`, the call G7's jump makes. The rise is `0.25 · E_shot / C_c` = 0.08992805755395683 K. On the golden's shot tick the loop reads 0.08992805755394784 K above the same run with no shot. G8 adds no `Q_pulse` field: a field Engineering reads in phase 1 of the next tick would add a snapshot field and a one-tick delay, and the jump and the shot would reach the loop on two mechanisms. With both pulses in phase 3 the `Q_pulse` term of §5.6's equation is always 0, so the spec drops the term and its definition (error 4). On a tick with a jump and a shot, `FtlDrive` sorts before `Weapons`, so the two pulses add in one fixed order.

5. Power, the load id and the heat share. `railgun` at priority 6 with heat share 0: the capacitor stores what it draws, and the shot puts its quarter into the loop as the pulse. A heat share of 0.25 on the charge would heat the loop twice for one shot (error 3). The router cases are in the numbers section.

6. The top-up tick tapers. `railgunDemand(weapons, setpoints, rating, dt)` asks `min(P_w, (E_max - E) / dt)` while armed below `E_max`, and 0 W otherwise. At dt 0.5 the bank charges 150, 300 and 400 MJ at 300, 300 and 200 MW, and after a shot from full 250 and 400 MJ at 300 and 300 MW. No tick loses energy. The architect's clamp drew 300 MW for 0.5 s on the third tick and stored 100 MJ of the 150 MJ with heat share 0, so 50 MJ left the model with no account. §5.9's clamp `E' = min(E_max, E + P_w · dt)` stays as written, with `P_w` the allocation; it guards rounding at a `dt` where `(x / dt) · dt` differs from `x` by an ulp. The taper needs `dt`, so `WeaponsPower` takes `[WEAPON_MOUNT, SIM_OPTIONS]`, and `RailgunMount` takes `SIM_OPTIONS` too, so its `divert` asks exactly the load the next tick asks: `railgunDemand(ship.weapons, { ...ship.setpoints.weapons, armed: true }, rating, dt)`. An unarmed bank holds 0 J, so at dt 0.5 that is 300 MW and at dt 2 it is 200 MW, where a fixed 300 MW check would refuse a load the router fits. Both classes call the one pure function, so the rule lives in `physics/weapons.ts` alone. Figures that move: the golden tick 35 and the bridge's tick 35 read the railgun load at 200,000,000 W, scenario G's tick 106 reads the railgun at 200 MW with `ftl-spool` still shed, and the console's tick-35 gauge reads `200.0 MW`.

7. The fire command. One action, `{ system: 'weapons', action: 'fire', range }` on `POST /commands`, through the desk as `comms hail` and the helm's commands go. G8 adds no route, no `BRIDGE_LINK` method and no error code.
   - The first fire arms the mount and the mount stays armed. G8 adds no stand-down command, as G7 added none. A full bank draws 0 W, so §5.7's "let the railgun go cold" means stop firing.
   - A fire on an uncharged bank answers 202 with the next tick, and the shot leaves on the first tick the bank holds 300 MJ. A command-time refusal would refuse a shot the next tick's charge fires, since the command reads tick t and the charge of t + 1 comes after. G7's `MERIDIAN_FTL_NOT_SPOOLED` differs: a jump needs 100 s of spool the crew ordered, and a shot needs at most two ticks the mount charges itself.
   - An unarmed fire asks `divert` and refuses with `MERIDIAN_POWER_BUDGET`; an armed fire asks none and queues the range alone. This is G7 ruling 6's second spool: a re-check would refuse an armed mount on a tick the router sheds its charger.
   - The range is a number from 0 to 100,000 m, `RAILGUN.range`, both ends allowed. `WeaponsCommands` refuses anything else with reason `argument`, and the mount throws `RangeError` for a caller that skips the desk.
   - `numberArgument(command, name, low, high, refuse)` joins `command-arguments.ts`, and `levelArgument` calls it with 0 and 1. `levelArgument` keeps its export and every test.

8. Modules, tokens and exports.

   | Class             | Token              | Deps                                            |
   | ----------------- | ------------------ | ----------------------------------------------- |
   | `RailgunMount`    | `WEAPON_MOUNT`     | `[SHIP_STATE, SIM_OPTIONS, lazy(POWER_ROUTER)]` |
   | `WeaponsPhysics`  | `SHIP_SYSTEMS`     | `[WEAPON_MOUNT]`                                |
   | `WeaponsPower`    | `POWER_CONSUMERS`  | `[WEAPON_MOUNT, SIM_OPTIONS]`                   |
   | `WeaponsCommands` | `COMMAND_HANDLERS` | `[WEAPON_MOUNT]`                                |

   The hit draw comes from `TickContext.rng`, so the mount needs no `RNG` (error 1). The physics and the power classes read the rating from `WEAPON_MOUNT`, as `HelmPower` reads `THRUSTERS.rating`, so a test that overrides the mount with another rating changes the step and the load together. `Weapons` exports `WEAPON_MOUNT`, `SHIP_SYSTEMS`, `POWER_CONSUMERS` and `COMMAND_HANDLERS` (error 2), and the aggregate imports and re-exports it after `Helm`. The index exports `WEAPON_MOUNT` and the types `IWeaponMount`, `RailgunRating`, `RailgunShot`, `WeaponsRecord`, `WeaponsSetpoints` and `WeaponsStatus`, and no module object, as G5 and G6 export none for a static module. The two `SIM_OPTIONS` reads go through the global `Simulation`, as `SeededRandom` and `FixedStepClock` read it. P1 to P5 hold: the library owns `WEAPON_MOUNT`, the record, the load id, `WEAPONS_ACTIONS` and the refusal words (P1); `Weapons` joins the ship through the three contribution points and no file of Engineering, the loop or the desk names it (P2); G8 reaches core through public `lazy()` and the contribution points (P3); the console prints the library's `status` and the record's tallies and computes no hit chance or charge rule (P4); no new dependency between packages (P5).

   ```text
   src/physics/weapons.ts                  RailgunRating, RAILGUN, RAILGUN_LOAD, WeaponsStatus, RailgunShot,
                                           WeaponsRecord, WeaponsSetpoints, railgunDemand, hitChance, stepWeapons
   src/physics/thermal.ts                  pulseCoolant, moved from ftl.ts
   src/systems/weapons/contracts.ts        IWeaponMount, WEAPON_MOUNT, WEAPONS_ACTIONS
   src/systems/weapons/railgun-mount.ts    RailgunMount (WEAPON_MOUNT)
   src/systems/weapons/weapons-physics.ts  WeaponsPhysics (SHIP_SYSTEMS), phase 3
   src/systems/weapons/weapons-power.ts    WeaponsPower (POWER_CONSUMERS)
   src/systems/weapons/weapons-commands.ts WeaponsCommands (COMMAND_HANDLERS)
   src/systems/weapons/weapons.module.ts   Weapons
   src/simulation/contracts.ts             ShipSnapshot.weapons
   src/simulation/commands.ts              Setpoints.weapons
   src/simulation/command-arguments.ts     numberArgument; levelArgument calls it
   src/simulation/ship-state-store.ts      the initial record, setpoints and 0 W railgun load
   src/meridian-systems.module.ts          imports and re-exports Weapons after Helm
   src/index.ts                            WEAPON_MOUNT and the six types
   ```

   ```ts
   export const WEAPONS_ACTIONS = 'fire with a range from 0 to 100,000 m';
   export interface IWeaponMount {
     /** The railgun's fixed figures, in J, W and m. */
     readonly rating: RailgunRating;
     /**
      * Queues a shot at `range` m. On an unarmed mount it first checks that the
      * router fits the capacitor's load now and throws PowerBudgetError when it
      * does not; the shot then arms the mount. The shot leaves on the first tick
      * the capacitor holds 300 MJ. Throws RangeError outside 0 to 100,000 m.
      */
     fire(range: number): QueuedCommand;
   }
   export const WEAPON_MOUNT = new Token<IWeaponMount>('WeaponMount');
   ```

9. The graph and the notes. `graph.json` gains the module `Weapons`, four providers and ten edges: the loop's, the desk's and the router's `all` edges to the three contributions, `WeaponMount` to `ShipState` and to `SimOptions` (required), `WeaponMount` to `PowerRouter` (lazy), the three contributions to `WeaponMount`, and `PowerConsumers in Weapons` to `SimOptions in Simulation`. That makes 17 to 18 modules, 56 to 60 providers and 90 to 100 edges, none removed. `shipNotes` labels the four providers `system: Weapons`, and `ShipSystems in Weapons` also `phase: 3`, with no change to `notes.ts`.

10. The key order. `weapons` sits directly after `comms` in both the snapshot and the setpoints:

    ```text
    snapshot   tick, time, compartments, reactor, coolant, power, lifeSupport, comms, weapons, drive, helm, ftl, safety, setpoints
    setpoints  reactor, shields, lifeSupport, comms, weapons, drive, helm, ftl, safety
    ```

    Earlier assertions pin positions in this list. G5's pins `comms` after `lifeSupport`, G6's two `slice(-4)` reads pin the tail, and G7's pins `ftl` directly after `helm`. This order keeps every one of them as committed, where the architect's order (between `helm` and `ftl`) rewrites three of them. One order serves both lists, and §4.1's sentence changes to "comms, weapons, drive, helm, FTL and safety", so no reader learns a false order. The key order carries no meaning in the model, and `/sim`, the frames and the goldens read keys by name.

11. Earlier assertions. The owner's rule covers earlier e2e bodies and goldens. Five enumerating unit assertions grow with the ship, each by an appended id, row, line or count, and none rewrites an earlier value. All five sit in commit 6.
    1. `ship-state-store.test.ts:324`, the tick-0 load list: the `railgun` row is appended.
    2. The desk's list in `test/comms.test.ts:108`, `test/helm.test.ts:52`, `test/simulation.test.ts:59` and `test/ftl.test.ts:132`: `weapons` is appended to the joined list.
    3. `test/ftl.test.ts:80` and `:108`, the load ids: the list at `:80` has no `ftl-spool`, so `railgun` is appended there, and at `:108` `railgun` goes before `ftl-spool`, the list sorted by priority as the router serves it.
    4. bridge-api `test/ftl.test.ts:118`: `toHaveLength(5)` becomes `toHaveLength(6)`.
    5. bridge-api `test/check.test.ts`, the notes case: new `expect` lines for `Weapons` beside the Helm lines.

    The `slice(-4)` reads of `ship-state-store.test.ts:614-625` and G7's placement case stay as committed (ruling 10). `pulseCoolant` is no public export (`src/index.ts` does not name it), so the move to `thermal.ts` removes no public API. `ftl.test.ts` keeps both its cases (`:126` and `describe('pulseCoolant')` at `:163`) with their bodies unchanged, and only the import specifier moves to `./thermal`. `thermal.test.ts` gains the 75,000,000 J case. `LevelForm` keeps its export and renders `NumberForm`; `levelArgument` keeps its export and calls `numberArgument`.

12. Library tests and the golden.
    - `src/physics/weapons.test.ts`: three charging ticks reach 150,000,000, 300,000,000 and 400,000,000 J and a fourth keeps 400,000,000; the third charging tick from empty asks 200,000,000 W; at dt 1 a bank at 300,000,000 J asks 100,000,000 W; at dt 2 an empty armed bank asks 200,000,000 W; `railgunDemand` asks 0 W unarmed or full; `stepWeapons` returns the objects it got unarmed, reads `charging` with an allocation, `held` when shed and `charged` at full; a shot waits at 150 MJ and leaves at 300 MJ with `charge` 0; a shot from 400 MJ leaves 100 MJ; a draw of 0 hits and a draw of 0.99 misses; the shot writes `lastShot`, `shots`, `hits`, `range: null` and a pulse of 75,000,000 J; `draw` runs on a shot tick alone (a counting stub); `hitChance(0)` is 0.8 and `hitChance(50_000)` is `0.8 / Math.E` to 1e-15; every built record is frozen.
    - `src/physics/thermal.test.ts` gains `pulseCoolant`: 500 K plus 75,000,000 J reads 500.08992805755395 K.
    - `src/simulation/command-arguments.test.ts`: `numberArgument` takes the bounds, allows both ends and refuses `NaN`, a string and a number outside; `levelArgument`'s cases stay.
    - `railgun-mount.test.ts` (fakes): the rating is `RAILGUN`; an unarmed fire diverts `{ id: 'railgun', priority: 6, demand: 300e6, heatShare: 0 }` and queues `{ weapons: { armed: true, range } }`; at dt 2 (a fake `SimOptions`) an unarmed fire diverts 200,000,000 W; a refused divert queues nothing; an armed fire asks no divert and queues `{ weapons: { range } }`; a range outside 0 to 100,000 throws `RangeError`; the constructor never calls the router thunk.
    - `weapons-physics.test.ts`: phase 3 and the name `Weapons`; an idle ship comes back as it went in; a shot writes the record, the setpoints and the loop 0.0899 K higher in a frozen snapshot; the draw comes from `TickContext.rng`. `weapons-power.test.ts` reads `dt` from a fake `SimOptions` and reads the load from `railgunDemand` and the mount's rating. `weapons-commands.test.ts`: the two refusals with `expected: WEAPONS_ACTIONS`, and a fire handed to the mount.
    - `ship-state-store.test.ts`, one new case: "starts the weapons record idle and the setpoints unarmed after comms, frozen", with `indexOf('weapons')` equal to `indexOf('comms') + 1` in both lists.
    - The console's `shipAtStart` puts `weapons` after `comms` in both lists.

13. bridge-api route block and the eighth runtime case. The route block's tick-35 read gives the load at 200,000,000 W. On the tech lead's prototype the runtime case logs byte-identical output on Node, the Node bundle, Deno 2.9.6 and Bun 1.4.2 (md5 `3b73c5c0…` on all four), with `/sim` at tick 35 at 2,283 bytes (FNV-1a `c26a8ac8`) and the final `/sim` at 2,267 bytes (`7c92885a`). Task 5 records the committed code's hashes on those four and on workerd.

14. The console. `/systems/weapons` shows the charge in MJ to 0.1, the power in MW to 0.1 and the range in whole m, which meets the owner's SI rule. The gauge readings are in the numbers section. The growth config moves `comms` behind `weapons`, a config line, as G6 and G7 moved it.

15. `pulseCoolant`'s home. `src/physics/thermal.ts`, moved in its own refactor commit, with ruling 11's test handling.

16. Spec errors and amendments. The architect's errors 1 to 8 stand, with these changes.
    - Error 1: §3.3 and §10.1, the `IWeaponMount` row gives deps `[SHIP_STATE, RNG]`. The hit draw runs in the phase-3 step on the loop's `fork('Weapons')`, which `TickContext.rng` carries (§4.3, S5), and a direct router dep closes the cycle of ruling 1. The row reads `[SHIP_STATE, SIM_OPTIONS, lazy(POWER_ROUTER)]`, and three rows join for `WeaponsPhysics` (`[WEAPON_MOUNT]`), `WeaponsPower` (`[WEAPON_MOUNT, SIM_OPTIONS]`) and `WeaponsCommands` (`[WEAPON_MOUNT]`).
    - Error 2: §3.2, the `Weapons` row lists `WEAPON_MOUNT` alone. §10.2 lists `Weapons` among the modules that contribute to `SHIP_SYSTEMS`, and §3.2's router paragraph says G8 adds its load through `POWER_CONSUMERS`. The row reads `WEAPON_MOUNT`, `SHIP_SYSTEMS`, `POWER_CONSUMERS` and `COMMAND_HANDLERS`.
    - Error 3: §5.6, line 1054 lists "0.25 for a railgun shot" among the `h_i`. The sentence becomes "G8 adds 0 for the railgun's capacitor, which stores its power; a shot puts 0.25 of `E_shot` into the loop as a pulse (section 5.9)."
    - Error 4: §5.6's equation loses `+ Q_pulse`, and the sentence "`Q_pulse` is a one-tick heat pulse from a shot or a jump." gives way to "A jump and a shot add their pulses to the loop in phase 3 (section 5.9)." §5.9's fire line becomes `fire when E' >= E_shot: E' -= E_shot, T_c' = T_c + 0.25 · E_shot / C_c`. Line 1088's "G8 decides how its shot reaches the loop" gets ruling 4.
    - Error 5: §5.9 gives the order "charge, then fire when `E >= E_shot`" with no tick rule. Ruling 3 fixes it as written.
    - Error 6: §5.9 gains the demand line `demand = min(P_w, (E_max - E) / dt) while armed below E_max, else 0 W`, and the clamp stays.
    - Error 7: §7.4 and §8.3: the G8 row reads "`Weapons`" alone and the runtime sentence counts seven cases. They become the G8 text of the extensions below and eight cases.
    - Error 8: §3.1, the tree lacks `src/physics/weapons.ts (G8)` and `src/systems/weapons/   Weapons: the railgun (G8)`.
    - Error 9: §4.1's record order reads "comms, weapons, drive, helm, FTL and safety" (ruling 10).
    - Error 10: §8.1 has no `weapons.test.ts` entry; it gains one with ruling 12's figures.

    The spec amendments Task 8 applies, beyond the errors: §4.1 describes the record and the setpoints; §5.7 gains "From G8 the capacitor draws `railgun` at priority 6 with heat share 0: `min(P_w, (E_max - E) / dt)` while armed below a full bank, and 0 W otherwise"; §5.9 carries the charge, the fire line and the demand line; a new §5.15 holds the figures of the module test; §6 and §7.1 gain the `weapons fire` command and its refusals; §7.2 gains `/systems/weapons`; §8.2 gains the route block; §8.3 gains the golden's 882 lines, the line counts of the earlier goldens and the eighth runtime case; §10.1 and §10.2 gain the rows of error 1; §13 gains "G8 leaves out a stand-down command, a target model, ammunition, a cooldown past the charge, damage, a hit chance on the wire and a seventh bundle sentinel."; §15 gains the rows below and the closing paragraph lists `specs/plans/2026-10-21-meridian-g8-weapons.md`.

    The §15 rows G8 adds, each dated 2026-10-23 and ending "tech lead, G8 ruling N":
    1. The snapshot gains `weapons` (`status`, `charge` in J, `shots`, `hits`, `lastShot`) and the setpoints `weapons` (`armed`, `range`), both directly after `comms`, from tick 0 and frozen (rulings 2 and 10).
    2. The step charges first and then fires; an empty bank fires on its second charging tick, and `draw` runs on a shot tick alone (ruling 3).
    3. The shot heats the loop in phase 3 through the jump's `pulseCoolant`, and §5.6 drops its `Q_pulse` term (ruling 4).
    4. The capacitor draws `railgun` at priority 6 with heat share 0 (ruling 5).
    5. The charger tapers on the tick that fills the bank, so no energy leaves the model, and `WeaponsPower` and `RailgunMount` read `SIM_OPTIONS` (ruling 6).
    6. `weapons fire` takes a range from 0 to 100,000 m through `POST /commands`; the first fire arms the mount and G8 adds no stand-down command (ruling 7).
    7. A fire on an uncharged capacitor answers 202 and waits for the charge; an unarmed fire asks the router and an armed fire asks none (ruling 7).
    8. `RailgunMount` takes `[SHIP_STATE, SIM_OPTIONS, lazy(POWER_ROUTER)]` and `Weapons` exports four tokens (ruling 8).
    9. `graph.json` gains the module, four providers and ten edges (ruling 9).
    10. Five enumerating unit assertions grow with the ship, and no earlier assertion is rewritten (ruling 11).
    11. The library gains `test/weapons.test.ts` and the golden `weapons.seed-7.json`; every earlier golden only gains lines (rulings 10 and 12).
    12. bridge-api gains `the weapons commands on %s` and the eighth runtime case `fireRailgun` (ruling 13).
    13. The console gains `/systems/weapons` in MJ, MW and m, a shared `NumberForm` behind `LevelForm`, and a growth project `weapons` before `comms` (ruling 14).
    14. `pulseCoolant` moves from `physics/ftl.ts` to `physics/thermal.ts` (ruling 15).
    15. G8 changes no docs page or docs region, and `npx fallow dupes` stays at 2.15 % or under from 2.1137 % (ruling 17).

17. Duplication. `npx fallow dupes` reads 2.1137 % at `41cacb5a` (1,464 of 69,262 lines, 96 clone groups; `tl-dupes-base.json`). The branch may add `25.1 + 0.0215 · N` duplicated lines for `N` new counted lines. The architect measured 2.1251 % (1,483 of 69,784 lines, 97 groups) with the prototype library, the runtime case and the console page, and ruling 6 adds about six counted lines and no clone. The expected end is 2.125 % to 2.135 %. Where a clone stays:

    | Place                                                                            | Answer                                                                           |
    | -------------------------------------------------------------------------------- | -------------------------------------------------------------------------------- |
    | `e2e/weapons.e2e.ts`, the 6-line opening `Nexus.create`, `desk`, `loop`          | a fourth instance of an existing group; earlier e2e bodies cannot change         |
    | `e2e/weapons.e2e.ts`, the 4-line `toMatchFileSnapshot` close beside `ftl.e2e.ts` | the same                                                                         |
    | `e2e/growth/weapons.e2e.ts`, the 5-line `describe.each` group                    | a fifth instance, as G7's was a fourth                                           |
    | `WeaponsPhysics` beside `FtlPhysics`                                             | none found; both call `pulseCoolant`                                             |
    | the mount beside the power class                                                 | none; both call `railgunDemand`                                                  |
    | the range form beside `LevelForm`                                                | none; `LevelForm` renders `NumberForm`                                           |
    | `fireRailgun` beside the other cases                                             | none; it reads through `send`, `advanceTo` and `expectEqual`                     |
    | the weapons block of `test/routes.test.ts` beside the other route blocks         | none expected; test files are skipped by fallow, and the implementer confirms it |

    Each task that adds a counted file runs `npx fallow dupes` and records the figure in the ledger. A figure over 2.15 % removes its own clone in a fixup of the task's commit, inside G8's new files. `.fallowrc.jsonc` keeps 2.25 %. `npx fallow dead-code --fail-on-issues` runs in Task 2 and in the gate; `hitChance` stays exported for `weapons.test.ts`.

18. Tasks and commits. 17 commits before review fixups, far under 100. Each task gets an opus reviewer before the next task in its line starts. The task table and the order are in the Tasks section.

## Numbers the tests assert

Every figure comes from the architect's scripts (`arch-physics.log`, `arch-core.log`, `arch-golden-lines.log`, `arch-gauges.log`, `arch-dupes.json`) and the tech lead's (`tl-figures.log`, `tl-gauges.log`, `tl-core.log`, `tl-bridge.log`, `tl-golden-lines.log`, `tl-runtime.*.log`, `tl-tests.log`, `tl-dupes-base.json`). `tl-rerun-*.log` equal the architect's logs byte for byte. Where the tech lead's figure differs from the architect's, the tech lead's holds. Task 0 reran `arch-physics.mts`, `tl-figures.mts`, `tl-gauges.mts`, `tl-core.mts` and `tl-golden-lines.mjs` from the worktree root with `npx tsx --conditions=@nexusdi/source <script>` (the last with `node`) into `t0-physics.log`, `t0-figures.log`, `t0-gauges.log`, `t0-core.log` and `t0-golden-lines.log`; each equals its source log byte for byte. Each task's reviewer recomputes the figures its task asserts. All the scripts and logs live in the session scratchpad's `meridian-g8/` folder.

Physics (`weapons.ts`), from `arch-physics.log`:

- `C_c` is 834,000,000 J/K and `P_w · dt` is 150,000,000 J, an integer, so every charge the ship reaches is a multiple of 50,000,000 J.
- Charge from empty at dt 0.5: 150, 300 and 400 MJ at 300, 300 and 200 MW (the taper), then 0 W. The clamp alone would draw 300 MW on the third tick and lose 50,000,000 J. The taper loses 0 J on every tick. After a shot from a full bank (100 MJ left) the charge reads 250 and 400 MJ at 300 and 300 MW (`tl-figures.log` D, ticks 42 and 43). Two ticks reach `E_shot` from empty and three reach `E_max`.
- A shot always waiting fires every 2 ticks (1 s), 300 MW on average.
- The shot pulse is 75,000,000 J, a rise of 0.08992805755395683 K; `pulseCoolant(500 K)` reads 500.08992805755395 K. On the golden's shot tick (tick 32) the loop reads 507.6756283905922 K, 0.08992805755394784 K above the same run with no shot (`tl-figures.log` D).
- Hit chance `0.8 · exp(-R / 50 km)` at 0, 10,000, 50,000 and 100,000 m: 0.8, 0.6549846024623855, 0.2943035529371539 and 0.10826822658929017.
- `fork('Weapons')` of seed 7: u1 0.5776788084767759, u2 0.8633130805101246 (never hits, since it is above 0.8) and u3 0.5764941128436476. A shot at 16,279 m hits and one at 16,280 m misses, since the u1 limit is 16,279.68540639589 m (`arch-physics.log`, `tl-core.log`).
- The router at full output (1,210 MW), from `arch-physics.log` and `tl-figures.log` G and H:

  | Case                                    | Free for priority 6 | Railgun | Shed        | Left      |
  | --------------------------------------- | ------------------- | ------- | ----------- | --------- |
  | the railgun alone                       | 1,210.00 MW         | 300 MW  | none        | 910.00 MW |
  | beside the spool, nothing else          | 1,210.00 MW         | 300 MW  | none        | 10.00 MW  |
  | beside the raised shields and the spool | 1,010.00 MW         | 300 MW  | `ftl-spool` | 710.00 MW |
  | priorities 1 to 4 at full               | 984.93 MW           | 300 MW  | none        | 684.93 MW |
  | 1 to 4 at full and the spool            | 984.93 MW           | 300 MW  | `ftl-spool` | 684.93 MW |
  | 1 to 4 and the spool, the bank full     | 984.93 MW           | 0 W     | none        | 84.93 MW  |
  | the drive burning                       | 610.00 MW           | 300 MW  | none        | 310.00 MW |
  | the drive and the shields               | 410.00 MW           | 300 MW  | none        | 110.00 MW |
  | 1 to 4 at full and the drive            | 384.93 MW           | 300 MW  | none        | 84.93 MW  |

- The railgun fits alone from reactor level 0.24793388429752067 (0.2479), beside the raised shields from 0.4132231404958678, beside priorities 1 to 4 at full from 0.4339421487603306, beside the drive from 0.743801652892562 and beside 1 to 4 and the drive from 0.9298099173553719.
- A throttle of 1 from tick 0: a fire at tick 0 refuses with `available` 0, and a fire at tick 24 refuses with `available` 290,400,000.00000006 W (290.4 MW). At tick 25 the level is 0.25 and the electric output 302,500,000.00000006 W.

Module test `test/weapons.test.ts` (gating), `meridianSystems({ seed: 7, dt: 0.5 })` offline (`tl-figures.log`, `tl-gauges.log`, `tl-core.log`):

| Case                | Assertion                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| ------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| check               | `Nexus.check` passes with and without `load: [FtlDrive]`; the root reads `WEAPON_MOUNT` with `RAILGUN`; `SHIP_SYSTEMS` holds `Weapons` at phase 3; the desk lists `comms, engineering, helm, life-support, safety and weapons`; the snapshot keys read `tick, time, compartments, reactor, coolant, power, lifeSupport, comms, weapons, drive, helm, ftl, safety, setpoints`                                                                                                                                                                              |
| idle                | tick 0 reads the idle record, the unarmed setpoints, frozen, and the loads `life-support, shields, comms, thrusters, main-drive, railgun` with `railgun` at `{ priority: 6, demand: 0, allocated: 0 }`; tick 1 keeps the record by identity                                                                                                                                                                                                                                                                                                               |
| refusals            | a fire at tick 0 refuses with `available` 0; at tick 24 of a throttle-1 ramp with `available` 290,400,000.00000006; the ranges `-1`, 100,001, `NaN`, `'10000'`, `undefined`, `null` and `Infinity` refuse with reason `argument`; `weapons reload` refuses with reason `action`; the log stays empty                                                                                                                                                                                                                                                      |
| golden scenario     | throttle 1 at tick 0; fire at 10,000 m after tick 30 (`{ tick: 31 }`); tick 31 `charging` 150,000,000 J at 300,000,000 W; tick 32 the hit `{ tick: 32, range: 10000, hit: true }`, `charge` 0, the loop 0.08992805755394784 K (to 1e-9) above the same run with no shot; tick 35 `charged` 400,000,000 J with the load at 200,000,000 W; tick 36 the load at 0 W; fire at 50,000 m after tick 40 (`{ tick: 41 }`); tick 41 the miss, `charge` 100,000,000, `demand` 0; tick 42 charge 250,000,000 J at 300 MW; tick 43 `charged`; log ticks `[1, 31, 41]` |
| one tick, two fires | two fires at tick 30 answer `{ tick: 31 }` and log one entry with the later range (20,000 m); a fire while the shot waits answers `{ tick: 32 }`, asks no divert and replaces the range (30,000 m); one shot at tick 32                                                                                                                                                                                                                                                                                                                                   |
| shed                | throttle 0.6, a fire at tick 60 (`{ tick: 61 }`), a full burn from tick 61 (`{ tick: 62 }`): tick 62 `held`, `power.shed` `['railgun']`, `LOAD_SHED railgun`, the charge at 150,000,000 J, the electric output 726,000,000 W; the fire at tick 60 asks range 0 m                                                                                                                                                                                                                                                                                          |
| beside the spool    | `FtlDrive` loaded, throttle 1, life support online, spool after tick 100, fire after tick 101: ticks 102 to 105 charge both (the spool 900 MW, the railgun 300 MW); raised shields shed `ftl-spool` at tick 106 with the railgun at 200 MW; the shot of tick 103 (10 km, u1) hits and the shot of tick 107 (10 km, u2) misses; a shot from the full bank at tick 107 lets the spool draw 900 MW; tick 108 sheds it again and raises `LOAD_SHED ftl-spool` with the railgun at 300 MW                                                                      |
| the stream          | a shot at 16,279 m hits and one at 16,280 m misses, the edge of u1 of `fork('Weapons')`                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |

Library golden `e2e/golden/weapons.seed-7.json` (`e2e-growth`, the `.nvmrc` Node), from `tl-golden-lines.log`: `e2e/weapons.e2e.ts` queues throttle 1 at tick 0, fires at 10,000 m after tick 30 and at 50,000 m after tick 40, and pins `roundSnapshot` at ticks 31, 32, 35 and 41 in 882 lines. The railgun load reads 300, 300, 200 and 0 MW at those ticks; the coolant reads 507.1, 507.7 (507.6 with no shot), 509.1 and 512.5 K. Tick 35 reads `charged` at 400,000,000 J, and tick 41 reads the miss and 100,000,000 J.

Golden line counts (Myers, histogram and patience agree on `+N -0`, `diff` reports 0 changed hunks, and each replay with the G8 fields stripped equals the committed golden byte for byte; `tl-golden-lines.log`). The records commit adds 11 lines a snapshot and the wiring commit 6:

| Golden                      | Records commit | Wiring commit | G8     | Lines before | Lines after |
| --------------------------- | -------------- | ------------- | ------ | ------------ | ----------- |
| `idle.seed-7.json`          | +33            | +18           | +51 -0 | 602          | 653         |
| `life-support.seed-7.json`  | +33            | +18           | +51 -0 | 602          | 653         |
| `safety.seed-7.json`        | +33            | +18           | +51 -0 | 602          | 653         |
| `airlock.seed-7.json`       | +55            | +30           | +85 -0 | 1,002        | 1,087       |
| `comms.seed-7.json`         | +33            | +18           | +51 -0 | 614          | 665         |
| `helm.seed-7.json`          | +44            | +24           | +68 -0 | 814          | 882         |
| `ftl.seed-7.json`           | +33            | +18           | +51 -0 | 620          | 671         |
| `weapons.seed-7.json` (new) |                |               | 882    |              | 882         |

`bridge-api` route block `the weapons commands on %s` (gating; Hono, Express, Fastify), after every existing block of `test/routes.test.ts`, on `OfflineMeridian` with `bridgePlugins()` (`tl-bridge.log` 4):

| Request                                          | Answer                                                                                                                                                                       |
| ------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| fire 10,000 at tick 0                            | 409 `{ code: 'MERIDIAN_POWER_BUDGET', message: 'The railgun load needs 300 MW, and the router has 0 MW free beside the loads above it.', fix }`                              |
| throttle 1, then 30 ticks                        | 202 `{ tick: 1 }`                                                                                                                                                            |
| fire `'10000'`, fire 100,001, fire with no range | 400 `MERIDIAN_BAD_COMMAND`, "weapons fire got an argument it cannot use. It takes fire with a range from 0 to 100,000 m."                                                    |
| `weapons reload`                                 | 400, "weapons has no action 'reload'. It takes fire with a range from 0 to 100,000 m."                                                                                       |
| fire 10,000 twice                                | 202 `{ tick: 31 }` each                                                                                                                                                      |
| 1 tick, `GET /sim`                               | `weapons` `{ status: 'charging', charge: 150000000, shots: 0, hits: 0, lastShot: null }`, `{ armed: true, range: 10000 }`, the load 300,000,000 W allocated                  |
| 1 tick                                           | `{ status: 'charging', charge: 0, shots: 1, hits: 1, lastShot: { tick: 32, range: 10000, hit: true } }`, `{ armed: true, range: null }`, the coolant 507.7, no alarm         |
| 3 ticks                                          | `charged`, 400,000,000 J, the load 200,000,000 W allocated at tick 35                                                                                                        |
| fire 50,000, then 1 tick                         | 202 `{ tick: 36 }`; `{ status: 'charging', charge: 100000000, shots: 2, hits: 1, lastShot: { tick: 36, range: 50000, hit: false } }`, `{ armed: true, range: null }`         |
| `GET /commands`                                  | `[{ tick: 1, change: { reactor: { throttle: 1 } } }, { tick: 31, change: { weapons: { armed: true, range: 10000 } } }, { tick: 36, change: { weapons: { range: 50000 } } }]` |

`check.test.ts`: "matches graph.json" passes with the regenerated file and an unchanged body; the notes case gains `ShipSystems in Weapons` (`system: Weapons`, `phase: 3`) and the three other providers (`system: Weapons`). The graph counts are 17 to 18 modules, 56 to 60 providers and 90 to 100 edges (`tl-bridge.log` 2, `tl-graph.g8.json`). bridge-api `test/ftl.test.ts` reads six loads where it read five.

The eighth runtime case `fireRailgun` (Hono, Express, Fastify, workerd, Deno, Bun; `tl-runtime.*.log`), named "two railgun shots on the offline ship charge the capacitor, hit at 10 km and miss at 50 km". From tick 0: fire 10,000 answers 409 with the 0 MW text; throttle 1 answers 202 `{ tick: 1 }`; `advanceTo(fetch, 30, 30)` reads the idle record and the railgun load at 0 W; a fire with range `'far'` and a fire at 100,001 answer 400; fire 10,000 answers 202 `{ tick: 31 }`; `advanceTo(fetch, 1, 31)` reads 150,000,000 J and the load at 300,000,000 W; `advanceTo(fetch, 1, 32)` reads the hit; `advanceTo(fetch, 3, 35)` reads 400,000,000 J and the load at 200,000,000 W; fire 50,000 answers 202 `{ tick: 36 }`; `advanceTo(fetch, 1, 36)` reads the miss with 100,000,000 J; `GET /commands` ticks `[1, 31, 36]`. The case reads through `send`, `advanceTo`, `okJson` and `expectEqual` alone, and every value it compares is an integer, a boolean or null. Node, the Node bundle, Deno 2.9.6 and Bun 1.4.2 print byte-identical logs (md5 `3b73c5c08c79e354f55ee6171bc288b6` on all four); `/sim` at tick 35 is 2,283 bytes with FNV-1a `c26a8ac8`, and the final `/sim` is 2,267 bytes with `7c92885a`. The case fires at 10 km on u1 (0.5777 against 0.6550, a gap of 0.077) and at 50 km on u2 (0.8633, above the 0.8 ceiling of any range), so no engine can disagree on a hit.

Console gauges (`tl-gauges.log`, written with the console's own `fixed()` and `megawatts()`). The order is `Status`, `Armed`, `Capacitor charge`, `Capacitor power`, `Shot waiting`, `Shots fired`, `Hits`, `Last shot`:

| Reading                            | Gauges                                                                                 |
| ---------------------------------- | -------------------------------------------------------------------------------------- |
| tick 0                             | `idle`, `No`, `0.0 MJ`, `0.0 MW`, `none`, `0`, `0`, `none`                             |
| golden tick 31                     | `charging`, `Yes`, `150.0 MJ`, `300.0 MW`, `10,000 m`, `0`, `0`, `none`                |
| golden tick 32                     | `charging`, `Yes`, `0.0 MJ`, `300.0 MW`, `none`, `1`, `1`, `hit at 10,000 m, tick 32`  |
| golden tick 35                     | `charged`, `Yes`, `400.0 MJ`, `200.0 MW`, `none`, `1`, `1`, `hit at 10,000 m, tick 32` |
| tick 36                            | `charged`, `Yes`, `400.0 MJ`, `0.0 MW`                                                 |
| tick 37 (the golden tick 41 shape) | `charging`, `Yes`, `100.0 MJ`, `0.0 MW`, `none`, `2`, `1`, `miss at 50,000 m, tick 37` |
| shed tick 62                       | `held`, `Yes`, `150.0 MJ`, `0.0 MW`, `0 m`, `0`, `0`, `none`                           |

Failing earlier tests on the prototype (`tl-tests.log`): five, in `test/comms.test.ts`, `test/ftl.test.ts`, `test/helm.test.ts`, `test/simulation.test.ts` and `src/simulation/ship-state-store.test.ts`, each one of the assertions of ruling 11.

## Global Constraints

- Worktree `.claude/worktrees/feat/meridian-g8-weapons`. Prefix every nx command and every `git commit` and `git push` with `NX_NO_CLOUD=true NX_DAEMON=false`. Every nx command takes `--parallel=2`. Never touch the main checkout or switch a branch.
- The branch holds 100 commits or fewer: 17 commits before review fixups. Review fixups go in `git commit --fixup=<sha>` commits of the commit each fix belongs to and fold before the PR. A fixup that amends a message uses `git commit --fixup=amend:<sha>` and carries the full message, the subject line included.
- Never change files under `libs/`. If a core API behaves differently from this plan or the spec, stop and report it.
- Every commit passes `npx nx test @nexusdi/meridian-systems --parallel=2` and `npx nx test @nexusdi/bridge-api --parallel=2 -- test/check.test.ts` on its own (`each.sh` in the session scratchpad's `meridian-g8/` folder runs both), and the final `rebase -x` checks it. A commit that changes the graph carries the regenerated `graph.json` (`npx nx run @nexusdi/bridge-api:graph --parallel=2`) and the `check.test.ts` notes. `graph.json` changes in commit 6 alone. Goldens change in commits 4, 6 and 7.
- Per-commit obligations beyond that pair:

  | Commit                             | Adds                                                                                                                                                                                                                                                                                                                                                                                                 |
  | ---------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
  | 4                                  | `npx nx run-many -t typecheck -p @nexusdi/meridian-systems @nexusdi/bridge-api @nexusdi/bridge-console --parallel=2`, the console's `test`, the library's `e2e-growth` once without `-u` (the diff shows the `weapons` fields alone, after `comms`), then with `-u`, then once more without                                                                                                          |
  | 6                                  | the full bridge-api `test`, the library's `lint` and `e2e-growth`, `npx nx run @nexusdi/bridge-api:graph --parallel=2` with the regenerated file, `npx fallow dead-code --fail-on-issues`, the console's `test` and `typecheck`; mutation in a scratch worktree: a direct `POWER_ROUTER` dep fails with `NEXUS_CIRCULAR_DEPENDENCY`, and a step that draws from the root `RNG` fails the stream case |
  | 7                                  | the library's `e2e-growth`                                                                                                                                                                                                                                                                                                                                                                           |
  | 9, 10                              | the console's `test`, `typecheck`, `lint` and `build`                                                                                                                                                                                                                                                                                                                                                |
  | 11                                 | bridge-api `e2e-growth` with workerd, Deno 2.9.6 and Bun 1.4.2                                                                                                                                                                                                                                                                                                                                       |
  | 12                                 | the console's `e2e` (the bundle sentinels) and `e2e-growth`                                                                                                                                                                                                                                                                                                                                          |
  | every commit adding a counted file | `npx fallow dupes`, figure in the ledger                                                                                                                                                                                                                                                                                                                                                             |

- Goldens: each golden-changing commit runs the library's `e2e-growth` (heavy) once without `-u`, so the diff shows the G8 fields alone, then with `-u`, then once more without. A new golden needs `CI=true` for the first run, since a local run without `-u` writes a missing file snapshot and passes.
- Mutation checks run in a scratch worktree under the session scratchpad's `meridian-g8/` folder (`git worktree add`, hooks on), never in the shared worktree while peers run. A symlinked `node_modules` resolves the relative workspace links (`@nexusdi/meridian-systems -> ../../examples/meridian-systems`) back into the shared worktree, so the mutated file is never imported. Make a real `node_modules/@nexusdi` directory in the scratch tree with the example packages linked to the scratch copies and the built libs linked absolutely, and run vitest directly there. A task may instead mutate its own uncommitted new test file in place (Task 3's 200 MW check), restoring it before the commit.
- Run `npx fallow dead-code --fail-on-issues` before handing back any task that adds an export (Tasks 1, 4 and 5). An export that nothing imports until a later commit of this branch is reported and named in the hand-back, as `RAILGUN_LOAD` is until commit 6.
- Parallel work in one worktree: stage your own files by path (`git add <paths>`), never `git add -A` or `git commit -a`, check `git diff --cached --name-only` before each commit, and commit with `git commit -- <paths>` so a peer's staged files stay out. If `index.lock` exists, wait 10 s and retry. If the pre-commit hook fails on a peer's uncommitted edit, report it and leave the peer's files alone.
- Never `--no-verify`, never `HUSKY=0`, never `git commit-tree`, `git update-ref` or `-c core.hooksPath`, in any worktree, never a bare `git stash`, never a merge commit, never a push before the final task. Every commit runs the hooks. A G5 implementer used `commit-tree` and a G6 reviewer used `-c core.hooksPath=/dev/null` in a scratch worktree; both are defects. To fix a message, use `git commit --fixup=amend:<sha>`. If the permission check refuses an action, stop and report it.
- Commit subjects follow conventional commits with a scope from `commitlint.config.js` (`meridian-systems`, `bridge-api`, `bridge-console`, `specs`), lowercase, no `@` anywhere in the message, body lines wrapped at 100 characters. Each message ends with the trailer `Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>`, whichever model writes it.
- Test first: write the failing test, run it, see it fail, then implement. Earlier e2e test bodies and earlier golden lines never change.
- Prose in READMEs, comments, specs and commits follows the writing rules of `nexusdi-ways-of-working`: no em dashes, no antithesis ("not X but Y", "instead of", "rather than"), no rule of three outside lists of figures or ids, no bold lead-ins, no metaphor verbs (bites, lands, buys, costs, earns, pays, survives, ships), no filler openers. Every example is interface-first (`Token<IFoo>` with `useClass`).
- Run `npx prettier --write` on every file a task changes.
- Duplication: `npx fallow dupes` ends at 2.15 % or under on the measured figure (start 2.1137 %), and `.fallowrc.jsonc` keeps its 2.25 % limit untouched. Each task that adds a counted file records the figure in its hand-back.
- Helpers and probe scripts live in the session scratchpad's `meridian-g8/` folder only, prefixed by task (`t5-...`), and a committed file refers to them by basename and says they live in the session scratchpad. A committed file never holds an absolute local path or a vault path.
- The docs regions (`examples/meridian/src/pages`) and the docs site (`apps/docs`) never import a private demo package and keep building. G8 changes nothing there: nothing under `apps/docs`, `examples/meridian/src`, `examples/federation-*` or any `libs/*/README.md` names `WEAPON_MOUNT`, `WeaponMount`, `RailgunMount` or `railgun`.
- Console gauges round to a fixed precision in SI units. Test fixtures feed the reading `/sim` sends: `readShip` rounds every number to four significant digits, so the doubles carry seed 7's figures as the golden holds them.
- Out of G8's scope: issues #188, #191 and #194.

### Heavy work

A heavy job is `npm ci`, a build of more than one project, any `e2e` or `e2e-growth` target, `nx run-many`, or the final `rebase -x`. Run one at a time at all hours, and never run more than two subagents at once on a weekday from 09:00 to 17:00 (check `date`); after 17:00 and on weekends at most four. On weekdays from 09:00 to 17:00 wrap every nx, vitest and playwright run in the lock, and release it promptly. Never hold it while thinking or editing:

```sh
(until mkdir /tmp/nexusdi-heavy.lock 2>/dev/null; do sleep 20; done; trap 'rmdir /tmp/nexusdi-heavy.lock' EXIT; NX_NO_CLOUD=true NX_DAEMON=false npx nx ... --parallel=2)
```

Outside those hours skip the lock but still run one heavy job at a time. Tasks 5 and 6 each run a heavy target, so both take the lock for every `e2e` and `e2e-growth` run at any hour. `--parallel=2` goes on every nx command at all hours.

### Cleanup

Every task ends with this step before its review gate:

```sh
setopt null_glob 2>/dev/null; rm -rf libs/*/test-output examples/*/dist examples/*/build \
  examples/*/test-output examples/*/out-tsc examples/bridge-console/.react-router tmp
```

### Review gate

Each task ends with a review by a fresh opus reviewer that did not write the task, and the next task in its line starts after the gate passes. The reviewer reads the task's diff against this plan and the spec, runs the task's test commands, checks that each commit passes the two per-commit suites, recomputes the figures the task names, checks the writing rules on every added comment and message, and reports findings. The implementer fixes them in fixup commits. The gate passes when the reviewer reports no finding. The branch ends with the final review of Task 10.

## Tasks

Order and parallelism (at most two agents at once in daytime):

1. Task 0 alone.
2. Task 1, then Task 2, each alone. Both change the library, and Task 2 touches bridge-api's `graph.json` and two of its tests.
3. Task 3 beside Task 4, after Task 2. bridge-api and the console share no file.
4. Task 5 beside Task 6, after Tasks 3 and 4. Both take `/tmp/nexusdi-heavy.lock` for every `e2e` and `e2e-growth` run at any hour.
5. Task 7 beside Task 8, after Tasks 5 and 6. Commit 16 of Task 8 runs first, and commit 17 runs after Task 5 records the hashes.
6. Task 9, then Task 10, each alone.

| #   | Task | Model            | Commit                                                                             | Files                                                                                                                                                                                                                                                                  |
| --- | ---- | ---------------- | ---------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | 0    | sonnet           | `docs(specs): plan the g8 weapons`                                                 | `specs/plans/2026-10-21-meridian-g8-weapons.md`                                                                                                                                                                                                                        |
| 2   | 1    | opus (physics)   | `refactor(meridian-systems): move pulseCoolant beside the coolant loop`            | `physics/thermal.ts` (+test), `physics/ftl.ts`, `ftl.test.ts` import line, `systems/ftl/ftl-physics.ts` import                                                                                                                                                         |
| 3   | 1    | opus (physics)   | `feat(meridian-systems): model the railgun capacitor and its shot`                 | `physics/weapons.ts` (+test)                                                                                                                                                                                                                                           |
| 4   | 1    | opus (physics)   | `feat(meridian-systems): add the weapons record and setpoints`                     | `simulation/contracts.ts`, `commands.ts`, `ship-state-store.ts` (+ the new case), seven goldens, console `tests/doubles.ts` record and setpoints                                                                                                                       |
| 5   | 2    | opus (DI)        | `refactor(meridian-systems): read a bounded number argument for any command`       | `simulation/command-arguments.ts` (+test)                                                                                                                                                                                                                              |
| 6   | 2    | opus (DI)        | `feat(meridian-systems): fire the railgun from the command desk`                   | `systems/weapons/*` (+ class tests), `meridian-systems.module.ts`, `index.ts`, the store's 0 W load, `test/weapons.test.ts`, ruling 11's five items, seven goldens, bridge-api `graph.json`, `test/check.test.ts`, `test/ftl.test.ts`, console `tests/doubles.ts` load |
| 7   | 2    | opus (DI)        | `test(meridian-systems): pin two railgun shots to a golden`                        | `e2e/weapons.e2e.ts`, `e2e/golden/weapons.seed-7.json`                                                                                                                                                                                                                 |
| 8   | 3    | opus (DI)        | `test(bridge-api): fire the railgun through the commands route on each framework`  | `test/routes.test.ts`                                                                                                                                                                                                                                                  |
| 9   | 4    | sonnet (console) | `refactor(bridge-console): share a number form between the level and range fields` | `app/routes/systems/system-page.tsx`                                                                                                                                                                                                                                   |
| 10  | 4    | sonnet (console) | `feat(bridge-console): add the weapons page`                                       | `app/routes/systems/weapons.tsx`, the route table, the nav link in `app/routes/layout.tsx`, `tests/routes/weapons.spec.tsx`                                                                                                                                            |
| 11  | 5    | sonnet (routine) | `test(bridge-api): fire the railgun on every runtime`                              | `test/runtime/growth-cases.ts`, `e2e/growth/weapons.e2e.ts`                                                                                                                                                                                                            |
| 12  | 6    | sonnet (console) | `test(bridge-console): fire the railgun from the weapons page in a growth case`    | `e2e/growth/weapons.spec.ts`, `playwright.e2e-growth.config.mts`                                                                                                                                                                                                       |
| 13  | 7    | sonnet (docs)    | `docs(meridian-systems): describe the weapons module`                              | `examples/meridian-systems/README.md`                                                                                                                                                                                                                                  |
| 14  | 7    | sonnet (docs)    | `docs(bridge-api): describe the weapons commands and the eighth runtime case`      | `examples/bridge-api/README.md`                                                                                                                                                                                                                                        |
| 15  | 7    | sonnet (docs)    | `docs(bridge-console): document the weapons page`                                  | `examples/bridge-console/README.md`                                                                                                                                                                                                                                    |
| 16  | 8    | opus             | `docs(specs): record the g8 rulings in the ship systems spec`                      | `specs/2026-10-21-meridian-ship-systems-design.md` (ruling 16, the §15 rows, the owner list)                                                                                                                                                                           |
| 17  | 8    | opus             | `docs(specs): record the g8 figures and ledger in the plan`                        | `specs/plans/2026-10-21-meridian-g8-weapons.md` (the measured dupes figure and the committed hashes)                                                                                                                                                                   |

Task 9 (sonnet) runs the gate and the cleanup. Task 10 (opus) does the final review, the fixup rounds and the PR.

---

### Task 0: this plan

Model: sonnet.

- [ ] Rerun `arch-physics.mts`, `tl-figures.mts`, `tl-gauges.mts`, `tl-core.mts` and `tl-golden-lines.mjs`, diff the outputs against the tech lead's logs, run `npx prettier --write` on this file, and commit `docs(specs): plan the g8 weapons` through `git commit -- specs/plans/2026-10-21-meridian-g8-weapons.md`.

### Task 1: the physics and the record

Model: opus (the pure step, the taper and the frozen records are the hard parts).

Files:

- Commit 2: modify `examples/meridian-systems/src/physics/ftl.ts`, `ftl.test.ts` (the import line only) and `src/systems/ftl/ftl-physics.ts` (the import); extend `src/physics/thermal.ts` and `thermal.test.ts`.
- Commit 3: create `examples/meridian-systems/src/physics/weapons.ts` and `weapons.test.ts`.
- Commit 4: modify `examples/meridian-systems/src/simulation/contracts.ts` (`ShipSnapshot.weapons`), `src/simulation/commands.ts` (`Setpoints.weapons`), `src/simulation/ship-state-store.ts` and `ship-state-store.test.ts`, the seven goldens `idle`, `life-support`, `safety`, `airlock`, `comms`, `helm` and `ftl` `.seed-7.json` under `examples/meridian-systems/e2e/golden/`, and `examples/bridge-console/tests/doubles.ts` (`shipAtStart`).

- [ ] Step 1: write the failing `pulseCoolant` case in `thermal.test.ts` (500 K plus 75,000,000 J reads 500.08992805755395 K) importing from `./thermal`. Run `npx nx test @nexusdi/meridian-systems --parallel=2 -- src/physics/thermal.test.ts` and see it fail on the missing export. Move `pulseCoolant` from `ftl.ts` to `thermal.ts`, change the import specifier in `ftl.test.ts` and in `ftl-physics.ts` to `./thermal`, and leave both `ftl.test.ts` cases and their bodies as they are. Run the library `test` target (every case passes), the per-commit pair and `npx fallow dupes`. Commit `refactor(meridian-systems): move pulseCoolant beside the coolant loop`.

- [ ] Step 2: write the failing `src/physics/weapons.test.ts` with the assertions of ruling 12. Test names:
  - `charges 150,000,000 J a tick to 400,000,000 J and holds it`
  - `tapers the third charging tick to 200,000,000 W`
  - `asks 100,000,000 W at dt 1 from 300,000,000 J and 200,000,000 W at dt 2 from empty`
  - `asks 0 W unarmed or full`
  - `returns the objects it got when unarmed`
  - `reads charging with an allocation, held when shed and charged at full`
  - `holds a shot at 150,000,000 J and fires it at 300,000,000 J`
  - `leaves 100,000,000 J after a shot from a full bank`
  - `hits on a draw of 0 and misses on a draw of 0.99`
  - `writes lastShot, shots, hits, range null and a pulse of 75,000,000 J`
  - `draws on a shot tick alone`
  - `gives hitChance 0.8 at 0 m and 0.8 over e at 50,000 m`
  - `freezes every record a step builds`

  Run `npx nx test @nexusdi/meridian-systems --parallel=2 -- src/physics/weapons.test.ts` and see it fail on the missing file. Write `weapons.ts` as rulings 2, 3 and 6 give it, with the `WeaponsStatus` docblock of ruling 2 and nothing imported from `@nexusdi/*`. Run it until it passes, then the per-commit pair and `npx fallow dupes` (record the figure). Commit `feat(meridian-systems): model the railgun capacitor and its shot`.

- [ ] Step 3: write the failing store case "starts the weapons record idle and the setpoints unarmed after comms, frozen". Widen `ShipSnapshot` and `Setpoints` with `weapons` directly after `comms`, start the store at the idle record and the unarmed setpoints, frozen at every level, and give the console's `shipAtStart` the record and the setpoints after `comms` in both lists. The store's power record gains no load in this commit. Run the library `e2e-growth` (heavy) once without `-u`: it fails on the seven goldens and shows the `weapons` record and setpoints as the only diff. Run it with `-u`, then once more without. `git diff --numstat` on the goldens reads idle +33 -0, life-support +33 -0, safety +33 -0, airlock +55 -0, comms +33 -0, helm +44 -0 and ftl +33 -0, and the stripped replays equal the committed goldens. Run the per-commit pair, `npx nx run-many -t typecheck -p @nexusdi/meridian-systems @nexusdi/bridge-api @nexusdi/bridge-console --parallel=2`, the console's `test`, `npx fallow dupes` and `npx nx run @nexusdi/bridge-api:graph --parallel=2` (no diff, since no module binds the mount). Commit `feat(meridian-systems): add the weapons record and setpoints`.

- [ ] Step 4: cleanup, then the review gate.

Reviewer recomputes the physics figures with `arch-physics.mts`, checks the frozen levels and the key order of ruling 10, confirms that no `slice(-4)` read and no earlier case changed, and confirms that `git diff --numstat` on the seven goldens reads 33, 33, 33, 55, 33, 44 and 33 with zero removed.

### Task 2: the command desk and the golden

Model: opus (the `lazy()` cycle, the global `Simulation` reads and the graph are the hard parts).

Files:

- Commit 5: modify `examples/meridian-systems/src/simulation/command-arguments.ts` and `command-arguments.test.ts`.
- Commit 6: create `examples/meridian-systems/src/systems/weapons/contracts.ts`, `railgun-mount.ts`, `weapons-physics.ts`, `weapons-power.ts`, `weapons-commands.ts`, `weapons.module.ts`, a `.test.ts` beside each class, and `test/weapons.test.ts`. Modify `src/meridian-systems.module.ts`, `src/index.ts`, `src/simulation/ship-state-store.ts` (the 0 W load), the five assertions of ruling 11 (`ship-state-store.test.ts:324`, `test/comms.test.ts`, `test/helm.test.ts`, `test/simulation.test.ts`, `test/ftl.test.ts`), the seven goldens, `examples/bridge-api/graph.json`, `examples/bridge-api/test/check.test.ts`, `examples/bridge-api/test/ftl.test.ts` and `examples/bridge-console/tests/doubles.ts` (the load).
- Commit 7: create `examples/meridian-systems/e2e/weapons.e2e.ts` and `examples/meridian-systems/e2e/golden/weapons.seed-7.json`.

- [ ] Step 1: write the failing `numberArgument` cases (the bounds, both ends allowed, `NaN`, a string and a number outside refused), then add `numberArgument(command, name, low, high, refuse)` and make `levelArgument` call it with 0 and 1. `levelArgument`'s cases pass unchanged. Run the library `test`, the per-commit pair and `npx fallow dupes`. `numberArgument` has no importer outside `levelArgument` until commit 6, so run `npx fallow dead-code --fail-on-issues` after commit 6 and not here. Commit `refactor(meridian-systems): read a bounded number argument for any command`.

- [ ] Step 2: write the failing class tests and `test/weapons.test.ts` (the eight rows of the module-test table, one `it` each, titled `checks as part of the ship`, `starts idle and keeps the record by identity`, `refuses a fire on a cold ship and on a ramp, and every bad argument`, `flies the golden scenario: charges, hits at tick 32, tops up at 200 MW and misses at tick 41`, `merges two fires in one tick and replaces the range of a waiting shot`, `holds the capacitor when a full burn sheds it`, `charges beside the ftl spool and sheds the spool at tick 106`, and `hits at 16,279 m and misses at 16,280 m on the first draw`), and edit the five assertions of ruling 11. Run `npx nx test @nexusdi/meridian-systems --parallel=2 -- test/weapons.test.ts` and see it fail. Write the contracts, the four classes, the module with the docblock "The railgun, stepped in phase 3, with the capacitor's load on the power router and the crew's fire command. RailgunMount reads POWER_ROUTER through lazy(), since the router reads the mount's load through POWER_CONSUMERS.", the store's 0 W `railgun` load, the aggregate's import and re-export after `Helm`, and the index exports of ruling 8. Run the module test until it passes. Run `npx nx run @nexusdi/bridge-api:graph --parallel=2`, read the diff (one module, four providers, ten edges; 17 to 18, 56 to 60, 90 to 100), stage the file and rerun for a zero exit, and extend the notes case of `check.test.ts` and the count of `test/ftl.test.ts`. Run the library `lint`, `test` and `e2e-growth` (the seven goldens gain 18, 18, 18, 30, 18, 24 and 18 lines: run without `-u`, with `-u`, without), the full bridge-api `test`, the console's `test` and `typecheck`, `npx fallow dead-code --fail-on-issues` and `npx fallow dupes`. Check `apps/docs` and the docs regions for imports of the new names: none. Mutation checks in a scratch worktree: a direct `POWER_ROUTER` dep fails with `NEXUS_CIRCULAR_DEPENDENCY`, and a step that draws from the root `RNG` fails the stream case. Commit `feat(meridian-systems): fire the railgun from the command desk`, with a body that names the files and the line counts.

- [ ] Step 3: the golden. Write `e2e/weapons.e2e.ts` on the offline graph (`seed: 7`, `dt: 0.5`): throttle 1 at tick 0, a fire at 10,000 m after tick 30 and a fire at 50,000 m after tick 40, `roundSnapshot` at ticks 31, 32, 35 and 41. Title it `pins two railgun shots on the offline ship, seed 7, to the golden`. Run `e2e-growth` (heavy) once with `CI=true` and see it fail on the missing golden, then with `-u`, then without. Check the file has 882 lines and the values of the golden paragraph of the numbers section. Run `npx fallow dupes` and record the figure, the library `lint` and the per-commit pair. Commit `test(meridian-systems): pin two railgun shots to a golden`.

- [ ] Step 4: cleanup, then the review gate.

Reviewer recomputes `tl-figures.log` A to H against the module test and the golden, `tl-bridge.log` 2 and 3 against the graph and the notes, and `tl-golden-lines.log` against the line counts. The reviewer checks that the only earlier assertions changed are the five of ruling 11, that `pulseCoolant`'s cases in `ftl.test.ts` are intact, that the earlier goldens gain lines alone, that the mutations fail as the per-commit table says, and that `fallow dead-code` reports no unused export.

### Task 3: bridge-api

Model: opus.

Files: modify `examples/bridge-api/test/routes.test.ts`. No file under `examples/bridge-api/src` changes.

- [ ] Step 1: write the failing `the weapons commands on %s` block after every existing block of `routes.test.ts`, on Hono, Express and Fastify, with the rows of the route table, on `OfflineMeridian` with `bridgePlugins()`. Run `npx nx test @nexusdi/bridge-api --parallel=2 -- test/routes.test.ts`. The library already serves the command, so the block passes on its first run. To show that it gates, change the tick-35 load to 300,000,000 W, see the block fail on all three frameworks, and restore the figure. Check each row's body against `tl-bridge.log` 4, including the 200,000,000 W read at tick 35. Run the full bridge-api `test`, `typecheck`, `lint` and `graph` (no diff), then `npx fallow dupes`. Commit `test(bridge-api): fire the railgun through the commands route on each framework`.
- [ ] Step 2: cleanup, then the review gate.

Reviewer recomputes the route answers against `tl-bridge.log` 4 and checks that no earlier block's text changed and that `test/fixtures.ts` is untouched.

### Task 4: the console's weapons page

Model: sonnet. Runs beside Task 3.

Files:

- Modify: `examples/bridge-console/app/routes/systems/system-page.tsx`, the route table `app/routes.ts`, the nav link in `app/routes/layout.tsx` beside "FTL" (line 47), `tests/doubles.ts` if a new double is needed
- Create: `examples/bridge-console/app/routes/systems/weapons.tsx`, `tests/routes/weapons.spec.tsx`

- [ ] Step 1: refactor `LevelForm` onto `NumberForm({ command, name, label, button, min, max, step, defaultValue })` in `system-page.tsx`, with `LevelForm` rendering `NumberForm` with `name="level"`, 0 to 1 and step 0.01 and the same markup. The engineering and helm specs pass unchanged. Run the console `test`, `typecheck`, `lint` and `build`. Commit `refactor(bridge-console): share a number form between the level and range fields`.
- [ ] Step 2: write the failing `tests/routes/weapons.spec.tsx` on the gauge table (tick 0, golden ticks 31, 32 and 35, tick 36, tick 37 and the shed tick 62), the "Fire" form posting `{ system: 'weapons', action: 'fire', range: 10000 }` and showing `Queued for tick 1`, a refused fire showing the 0 MW text and its `Fix:` line, and the offline page showing `Ship snapshot offline`. Each double spreads `shipAtStart`. Add the page `/systems/weapons` on `SystemPage`, `ControlSection`, `Gauges`, `SnapshotOffline` and `snapshotLoader` with the action `systemAction('weapons', { range: 'number' })` (no `BRIDGE_LINK` method, no new action helper):
  - the "Railgun" section, gauges `Railgun gauges`, with `Status`, `Armed`, `Capacitor charge`, `Capacitor power`, `Shot waiting`, `Shots fired`, `Hits` and `Last shot`;
  - the "Fire" section with `NumberForm`, the field `range`, the label `Range (m)`, 0 to 100,000 in steps of 1, default 10,000 and the button "Fire".

  Add the static route in the `ship-layout.tsx` group of `app/routes.ts` and the nav link "Weapons" after "FTL" in `app/routes/layout.tsx`. The page imports the library's main entry with `import type` only, so the bundle check of `e2e/fresh-server.spec.ts` stays green. Run the console `test`, `typecheck`, `lint` and `build`, then `npx fallow dupes` and record the figure. Commit `feat(bridge-console): add the weapons page`.

- [ ] Step 3: cleanup, then the review gate.

Reviewer recomputes the gauge strings against the gauge table and `tl-gauges.log` (computed from the golden's rounded values, which is what `/sim` sends), and checks by diff that the refactor moved the form without edits and that the earlier `tests/routes/*.spec.tsx` are untouched.

### Task 5: `fireRailgun` on six runtimes

Model: sonnet. Runs beside Task 6, after Tasks 3 and 4.

Files:

- Modify: `examples/bridge-api/test/runtime/growth-cases.ts`
- Create: `examples/bridge-api/e2e/growth/weapons.e2e.ts`

- [ ] Step 1: write `fireRailgun` as the eighth entry of `growthCases`, after `spoolAndJump`, with the name and the steps of the runtime-case paragraph of the numbers section and the file's `send`, `advanceTo`, `okJson` and `expectEqual` helpers. Write `e2e/growth/weapons.e2e.ts` first, as `describe.each(['hono', 'express', 'fastify'])` with `withShip` as `ftl.e2e.ts` does, importing `fireRailgun`. Run it and see it fail on the missing export. Then add the case, add `e2e/growth/weapons.e2e.ts` to the file's `growthCases` docblock list of the files that run it, and run it until it passes. Run `npx fallow dupes`; the group against the earlier files is a budgeted clone. Record the figure.
- [ ] Step 2: run the six legs (heavy, one run) with Deno 2.9.6 and Bun 1.4.2 first on `PATH` and workerd for the worker leg: `npx nx run @nexusdi/bridge-api:e2e-growth --parallel=2`. The earlier seven cases keep their text and pass. Node, the Node bundle, Deno and Bun print the same `/sim` bodies byte for byte: record the committed code's tick-35 and final hashes (the prototype's were 2,283 bytes `c26a8ac8` and 2,267 bytes `7c92885a`). Run `npx nx run @nexusdi/bridge-api:graph --parallel=2`: no diff. Commit `test(bridge-api): fire the railgun on every runtime`.
- [ ] Step 3: cleanup, then the review gate.

Reviewer recomputes the checkpoints against `tl-runtime.*.log` and confirms the legs ran on the pinned versions with workerd. No earlier case's text changes.

### Task 6: the console's weapons growth case

Model: sonnet. Runs beside Task 5.

Files:

- Create: `examples/bridge-console/e2e/growth/weapons.spec.ts`
- Modify: `examples/bridge-console/playwright.e2e-growth.config.mts`

- [ ] Step 1: add the project `weapons` with `dependencies: ['ftl']`, move `comms` to `dependencies: ['weapons']`, and change the `chromium` project's `testIgnore` to `/(life-support|safety|airlock|helm|ftl|weapons|comms)\.spec\.ts/` after reading the current pattern. Write `weapons.spec.ts` from the shared ship's tick `t` (throttle 1 at level 1, life support online, the burn at 0 and the FTL drive disarmed after its jump), advancing the backend through `request.post('/sim/advance')`:
  - `/systems/weapons` reads `idle`, `No` and `0.0 MJ`;
  - "Fire" at 10,000 m shows `Queued for tick t + 1`;
  - 1 backend tick and a reload read `charging`, `150.0 MJ`, `300.0 MW` and `10,000 m`;
  - 1 more tick and a reload read `1`, `1` and `hit at 10,000 m, tick t + 2`;
  - 4 more ticks and a reload read `charged`, `400.0 MJ` and `0.0 MW`;
  - `/systems/safety` reads `No alarms`, and the page logs no console error.

  The server starts fresh (`reuseExistingServer: false`, `SIM_SEED=7`) and no earlier project fires, so the shot draws u1 and hits on every run. The page exists after commit 10, so the spec passes on its first run. To show that it gates, change the expected `1` hit to `0` in a copy of the spec, see it fail, and restore it. `comms.spec.ts` stays byte-identical and its comment in the config stays true. Run `npx nx run @nexusdi/bridge-console:e2e-growth --parallel=2` and `npx nx run @nexusdi/bridge-console:e2e --parallel=2` (heavy, one at a time). Commit `test(bridge-console): fire the railgun from the weapons page in a growth case`.

- [ ] Step 2: cleanup, then the review gate.

Reviewer recomputes the page's words against the gauge table and checks that the seven earlier growth specs are untouched.

### Task 7: READMEs

Model: sonnet. Runs beside Task 8, after Tasks 5 and 6.

Files: modify `examples/meridian-systems/README.md`, `examples/bridge-api/README.md`, `examples/bridge-console/README.md`.

- [ ] Step 1: the library README gains the weapons module: the static `Weapons` with its four tokens and the `lazy(POWER_ROUTER)` dep; the record and the setpoints after `comms`; the taper on the top-up tick; the fire command and its two refusals; the shot's pulse through `pulseCoolant`; the module test and the golden. Also correct line 564 of the README, which says `ftl.ts` holds `pulseCoolant`: the function now lives in `thermal.ts` since commit 2. Commit `docs(meridian-systems): describe the weapons module`.
- [ ] Step 2: the `bridge-api` README gains `weapons fire` through `POST /commands` with its answers, the route block and the eighth runtime case with its hashes. Commit `docs(bridge-api): describe the weapons commands and the eighth runtime case`.
- [ ] Step 3: the console README gains `/systems/weapons` with its MJ and MW gauges, the shared `NumberForm` and the eighth growth project. Run `npx prettier --check` on the three files, and the README doctests if a README gains a `ts` block. Commit `docs(bridge-console): document the weapons page`.
- [ ] Step 4: cleanup, then the review gate.

Reviewer recomputes each tick and figure a README states against the numbers section.

### Task 8: the spec and the plan's record

Model: opus. Runs beside Task 7, after Tasks 5 and 6.

Files: modify `specs/2026-10-21-meridian-ship-systems-design.md` (commit 16) and this plan (commit 17).

- [ ] Step 1: apply the errors and amendments of ruling 16 section by section, add the fifteen §15 rows and the owner list below, and add this plan to the closing paragraph's list. Check each figure against the logs the numbers section names. Run `npx prettier --check` on the file. Commit `docs(specs): record the g8 rulings in the ship systems spec`.
- [ ] Step 2: after Task 5 records the hashes and the gate records the dupes figure, add both to this plan's numbers section (the committed code's hashes on Node, the Node bundle, workerd, Deno 2.9.6 and Bun 1.4.2, and the measured `npx fallow dupes` figure of the last task's ledger entry). Commit `docs(specs): record the g8 figures and ledger in the plan`. Task 9 adds the gate's dupes figure in a `git commit --fixup=<sha>` of this commit.
- [ ] Step 3: cleanup, then the review gate.

Reviewer recomputes the golden scenario in the new §5.15, the golden's 882 lines, and the 51, 51, 51, 85, 51, 68 and 51 line counts.

### Task 9: the gate

Model: sonnet.

- [ ] Step 1: run `gate.sh` from the session scratchpad's `meridian-g8/` folder (heavy, holds the lock itself): `npx nx run-many -t lint test build typecheck --parallel=2`, the bridge-api and console `e2e` targets, `npx nx run-many -t e2e-growth --projects=tag:demo --parallel=2` with Deno 2.9.6 and Bun 1.4.2 first on `PATH` and workerd for the worker leg, the `graph` target with no diff, `npx fallow dead-code --fail-on-issues`, `npx fallow dupes` and `npx prettier --check .`. Record the dupes figure, which must read 2.15 % or under, and confirm `git diff origin/release/0.4 -- .fallowrc.jsonc` is empty. Fix any finding in a fixup commit.
- [ ] Step 2: cleanup.

### Task 10: the final review and the PR

Model: opus.

- [ ] Step 1: the final branch review by an independent opus reviewer, who recomputes every figure in "Numbers the tests assert" and checks the diff of the earlier goldens and e2e files (the seven goldens only gain lines, and no earlier e2e body changes). The reviewer also reads the commit messages against the writing rules. Fix rounds go in fixup commits until it approves.
- [ ] Step 2: fold the fixups with `GIT_SEQUENCE_EDITOR=: NX_NO_CLOUD=true NX_DAEMON=false git rebase -i --autosquash origin/release/0.4`. Then check every commit on its own (heavy): `NX_NO_CLOUD=true NX_DAEMON=false git rebase origin/release/0.4 -x 'NX_NO_CLOUD=true NX_DAEMON=false npx nx test @nexusdi/meridian-systems --parallel=2 --skip-nx-cache && NX_NO_CLOUD=true NX_DAEMON=false npx nx test @nexusdi/bridge-api --parallel=2 --skip-nx-cache -- test/check.test.ts'`. A commit that fails gets its fix folded into it, and the step reruns. Check `git rev-list --count origin/release/0.4..HEAD` is 100 or fewer.
- [ ] Step 3: if `origin/release/0.4` moved, rebase onto it and rerun the graph and the gate, then Step 2. Push with `NX_NO_CLOUD=true NX_DAEMON=false git push -u origin feat/meridian-g8-weapons`, and open the PR against `release/0.4`. The body lists the rulings and the additions beyond the spec's G8 text (the list "For the owner" below) and ends with the Claude Code line. Wait for CI and fix any CodeQL alert, then report the PR number and the result.

## For the owner

Additions and divergences beyond the spec's G8 text, which reads "`Weapons`" alone. None changes a public docs page or an earlier test. None removes a public export or adds a runtime dependency between packages.

1. Crew command: `weapons fire` with a `range` in m from 0 to 100,000, through `POST /commands` as `comms hail` and the helm's commands go. The first fire arms the mount and it stays armed; G8 adds no stand-down command (ruling 7).
2. A fire on an uncharged capacitor answers 202 and the shot leaves when the bank holds 300 MJ. A fire on an unarmed mount refuses with `MERIDIAN_POWER_BUDGET` when the router cannot fit the charger, and an armed mount never refuses for power. No new error code (ruling 7).
3. Behaviour past §5.9's text: the charger tapers on the tick that fills the bank (200 MW at dt 0.5), so no energy leaves the model; the clamp stays (ruling 6).
4. The shot heats the loop in phase 3 through the jump's `pulseCoolant`, and §5.6 drops its `Q_pulse` term, which nothing feeds (ruling 4).
5. The snapshot and the setpoints place `weapons` after `comms`, and §4.1's order sentence changes to match, so no earlier assertion is rewritten (ruling 10).
6. Deps that differ from §3.3: `RailgunMount` takes `[SHIP_STATE, SIM_OPTIONS, lazy(POWER_ROUTER)]` where the spec gives `[SHIP_STATE, RNG]`, and `WeaponsPower` reads `SIM_OPTIONS` (rulings 6 and 8).
7. New public exports of `@nexusdi/meridian-systems`: `WEAPON_MOUNT` and the types `IWeaponMount`, `RailgunRating`, `RailgunShot`, `WeaponsRecord`, `WeaponsSetpoints`, `WeaponsStatus`. `/sim` and every telemetry frame gain `weapons`, `setpoints.weapons` and the `railgun` load (ruling 8).
8. Five enumerating unit assertions grow with the ship, each by an appended id, row, line or count; the G7 placement case stays as committed. Earlier goldens only gain lines (ruling 11).
9. The internal `pulseCoolant` moves from `physics/ftl.ts` to `physics/thermal.ts`; it was never a public export (ruling 15).
10. The console page `/systems/weapons` in MJ, MW and m, a shared `NumberForm` behind `LevelForm`, and a growth project `weapons` before `comms` (ruling 14).
