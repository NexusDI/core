# Scale results

2,500 providers is the scale of the largest applications measured, which hold 1,200 to 2,250 providers of their own. 5,000 is headroom past every application measured; no claim cites it.

Timings from run abc1234. Relative figures are NexusDI's divided by the library's, so a figure above 1 means NexusDI takes longer.

## Startup, mixed

Median startup in ms (load plus ready), and NexusDI's startup divided by the library's with its 95% interval; above 1 means NexusDI takes longer. 1,000 measured rounds per size after 10 warm-up rounds, 1 library skipped above n = 200.

| library  | 50                           | 200                          | 1,000                        | 2,500                        | 5,000                         |
| -------- | ---------------------------- | ---------------------------- | ---------------------------- | ---------------------------- | ----------------------------- |
| NexusDI  | 4.00 ms                      | 5.00 ms                      | 9.00 ms                      | 16.00 ms                     | 30.00 ms                      |
| tsyringe | 6.00 ms<br>0.67 [0.63, 0.70] | 7.00 ms<br>0.71 [0.68, 0.75] | runtime-error<sup>1</sup>    | runtime-error<sup>2</sup>    | runtime-error<sup>3</sup>     |
| awilix   | 3.00 ms<br>1.33 [1.27, 1.40] | 3.50 ms<br>1.43 [1.36, 1.50] | 5.00 ms<br>1.80 [1.71, 1.89] | 8.00 ms<br>2.00 [1.90, 2.10] | 14.00 ms<br>2.14 [2.04, 2.25] |

<sup>1</sup> tsyringe at 1,000 providers: runtime-error (RangeError: Maximum call stack size exceeded)  
<sup>2</sup> tsyringe at 2,500 providers: runtime-error (RangeError: Maximum call stack size exceeded)  
<sup>3</sup> tsyringe at 5,000 providers: runtime-error (RangeError: Maximum call stack size exceeded)

## First resolve, mixed

Median load, create and the first get: the time until the target is usable. 1,000 measured rounds per size after 10 warm-up rounds, 1 library skipped above n = 200. The target is the provider with the largest closure; a first get builds 16 providers at 50, 16 at 200, 16 at 1,000, 16 at 2,500 and 16 at 5,000 (32%, 8.0%, 1.6%, 0.64% and 0.32% of the graph).

| library  | 50                           | 200                          | 1,000                        | 2,500                        | 5,000                         |
| -------- | ---------------------------- | ---------------------------- | ---------------------------- | ---------------------------- | ----------------------------- |
| NexusDI  | 3.20 ms                      | 4.00 ms                      | 7.20 ms                      | 12.80 ms                     | 24.00 ms                      |
| tsyringe | 4.80 ms<br>0.67 [0.63, 0.70] | 5.60 ms<br>0.71 [0.68, 0.75] | runtime-error<sup>1</sup>    | runtime-error<sup>2</sup>    | runtime-error<sup>3</sup>     |
| awilix   | 2.40 ms<br>1.33 [1.27, 1.40] | 2.80 ms<br>1.43 [1.36, 1.50] | 4.00 ms<br>1.80 [1.71, 1.89] | 6.40 ms<br>2.00 [1.90, 2.10] | 11.20 ms<br>2.14 [2.04, 2.25] |

<sup>1</sup> tsyringe at 1,000 providers: runtime-error (RangeError: Maximum call stack size exceeded)  
<sup>2</sup> tsyringe at 2,500 providers: runtime-error (RangeError: Maximum call stack size exceeded)  
<sup>3</sup> tsyringe at 5,000 providers: runtime-error (RangeError: Maximum call stack size exceeded)

## Ready, mixed

Median create, the first get and one get of every other provider. 1,000 measured rounds per size after 10 warm-up rounds, 1 library skipped above n = 200.

| library  | 50                           | 200                          | 1,000                        | 2,500                        | 5,000                         |
| -------- | ---------------------------- | ---------------------------- | ---------------------------- | ---------------------------- | ----------------------------- |
| NexusDI  | 3.60 ms                      | 4.50 ms                      | 8.10 ms                      | 14.40 ms                     | 27.00 ms                      |
| tsyringe | 5.40 ms<br>0.67 [0.63, 0.70] | 6.30 ms<br>0.71 [0.68, 0.75] | runtime-error<sup>1</sup>    | runtime-error<sup>2</sup>    | runtime-error<sup>3</sup>     |
| awilix   | 2.70 ms<br>1.33 [1.27, 1.40] | 3.15 ms<br>1.43 [1.36, 1.50] | 4.50 ms<br>1.80 [1.71, 1.89] | 7.20 ms<br>2.00 [1.90, 2.10] | 12.60 ms<br>2.14 [2.04, 2.25] |

<sup>1</sup> tsyringe at 1,000 providers: runtime-error (RangeError: Maximum call stack size exceeded)  
<sup>2</sup> tsyringe at 2,500 providers: runtime-error (RangeError: Maximum call stack size exceeded)  
<sup>3</sup> tsyringe at 5,000 providers: runtime-error (RangeError: Maximum call stack size exceeded)

## Phases, mixed

Absolute medians in ms per phase. NexusDI builds its singletons in `create` and the others build on `get`, so `create` and `first-get` compare different work. Relative statements on this page use first-resolve, ready and startup.

### 50 providers

| library  | load | create | first-get | rest |
| -------- | ---- | ------ | --------- | ---- |
| NexusDI  | 1.60 | 1.20   | 0.40      | 0.80 |
| tsyringe | 2.40 | 1.80   | 0.60      | 1.20 |
| awilix   | 1.20 | 0.90   | 0.30      | 0.60 |

### 200 providers

| library  | load | create | first-get | rest |
| -------- | ---- | ------ | --------- | ---- |
| NexusDI  | 2.00 | 1.50   | 0.50      | 1.00 |
| tsyringe | 2.80 | 2.10   | 0.70      | 1.40 |
| awilix   | 1.40 | 1.05   | 0.35      | 0.70 |

### 1,000 providers

| library  | load                      | create                    | first-get                 | rest                      |
| -------- | ------------------------- | ------------------------- | ------------------------- | ------------------------- |
| NexusDI  | 3.60                      | 2.70                      | 0.90                      | 1.80                      |
| tsyringe | runtime-error<sup>1</sup> | runtime-error<sup>2</sup> | runtime-error<sup>3</sup> | runtime-error<sup>4</sup> |
| awilix   | 2.00                      | 1.50                      | 0.50                      | 1.00                      |

<sup>1</sup> tsyringe at 1,000 providers: runtime-error (RangeError: Maximum call stack size exceeded)  
<sup>2</sup> tsyringe at 1,000 providers: runtime-error (RangeError: Maximum call stack size exceeded)  
<sup>3</sup> tsyringe at 1,000 providers: runtime-error (RangeError: Maximum call stack size exceeded)  
<sup>4</sup> tsyringe at 1,000 providers: runtime-error (RangeError: Maximum call stack size exceeded)

### 2,500 providers

| library  | load                      | create                    | first-get                 | rest                      |
| -------- | ------------------------- | ------------------------- | ------------------------- | ------------------------- |
| NexusDI  | 6.40                      | 4.80                      | 1.60                      | 3.20                      |
| tsyringe | runtime-error<sup>1</sup> | runtime-error<sup>2</sup> | runtime-error<sup>3</sup> | runtime-error<sup>4</sup> |
| awilix   | 3.20                      | 2.40                      | 0.80                      | 1.60                      |

<sup>1</sup> tsyringe at 2,500 providers: runtime-error (RangeError: Maximum call stack size exceeded)  
<sup>2</sup> tsyringe at 2,500 providers: runtime-error (RangeError: Maximum call stack size exceeded)  
<sup>3</sup> tsyringe at 2,500 providers: runtime-error (RangeError: Maximum call stack size exceeded)  
<sup>4</sup> tsyringe at 2,500 providers: runtime-error (RangeError: Maximum call stack size exceeded)

### 5,000 providers

| library  | load                      | create                    | first-get                 | rest                      |
| -------- | ------------------------- | ------------------------- | ------------------------- | ------------------------- |
| NexusDI  | 12.00                     | 9.00                      | 3.00                      | 6.00                      |
| tsyringe | runtime-error<sup>1</sup> | runtime-error<sup>2</sup> | runtime-error<sup>3</sup> | runtime-error<sup>4</sup> |
| awilix   | 5.60                      | 4.20                      | 1.40                      | 2.80                      |

<sup>1</sup> tsyringe at 5,000 providers: runtime-error (RangeError: Maximum call stack size exceeded)  
<sup>2</sup> tsyringe at 5,000 providers: runtime-error (RangeError: Maximum call stack size exceeded)  
<sup>3</sup> tsyringe at 5,000 providers: runtime-error (RangeError: Maximum call stack size exceeded)  
<sup>4</sup> tsyringe at 5,000 providers: runtime-error (RangeError: Maximum call stack size exceeded)

### What `create` does

| library     | `create` does                                                                                                               |
| ----------- | --------------------------------------------------------------------------------------------------------------------------- |
| NexusDI     | `await Nexus.create(App)`: compiles the blueprint, runs every validation pass and builds every singleton (eager by default) |
| InversifyJS | `new Container()`, then `load` of every `ContainerModule` (`wide`: one `bind` per provider)                                 |
| tsyringe    | nothing: `@singleton()` classes and `@registry` classes register on the global container at load                            |
| awilix      | `createContainer({ injectionMode: PROXY, strict: true })` and the `register<Module>` calls                                  |
| needle-di   | `new Container()` and the `register<Module>` calls; `@injectable()` classes bind on first `get`                             |

## Local growth exponents

The exponent between two adjacent sizes is log(R) / log(hi / lo), where R is the median over rounds of the same library's time at hi over its time at lo in the same round. The interval is the ratio's bootstrap interval through the same transform. A pair that touches a failed size has no figure. The last column is the marginal ns per provider between 1,000 and 5,000.

### startup

| library  | 50 to 200         | 200 to 1,000      | 1,000 to 2,500    | 2,500 to 5,000    | per provider |
| -------- | ----------------- | ----------------- | ----------------- | ----------------- | ------------ |
| NexusDI  | 0.16 [0.50, 1.50] | 0.37 [0.50, 1.50] | 0.63 [0.50, 1.50] | 0.91 [0.50, 1.50] | 5250 ns      |
| tsyringe | 0.11 [0.50, 1.50] | -                 | -                 | -                 | -            |
| awilix   | 0.11 [0.50, 1.50] | 0.22 [0.50, 1.50] | 0.51 [0.50, 1.50] | 0.81 [0.50, 1.50] | 2250 ns      |

### ready

| library  | 50 to 200         | 200 to 1,000      | 1,000 to 2,500    | 2,500 to 5,000    |
| -------- | ----------------- | ----------------- | ----------------- | ----------------- |
| NexusDI  | 0.16 [0.50, 1.50] | 0.37 [0.50, 1.50] | 0.63 [0.50, 1.50] | 0.91 [0.50, 1.50] |
| tsyringe | 0.11 [0.50, 1.50] | -                 | -                 | -                 |
| awilix   | 0.11 [0.50, 1.50] | 0.22 [0.50, 1.50] | 0.51 [0.50, 1.50] | 0.81 [0.50, 1.50] |

## Retained heap, mixed

Heap retained after startup with the container referenced, in kB, minus the heap before the app loaded, and NexusDI's figure divided by the library's. The last column is the marginal bytes per provider between 1,000 and 5,000.

| library  | 50                            | 200                           | 1,000                          | 2,500                          | 5,000                           | per provider |
| -------- | ----------------------------- | ----------------------------- | ------------------------------ | ------------------------------ | ------------------------------- | ------------ |
| NexusDI  | 102.4 kB                      | 409.6 kB                      | 2048.0 kB                      | 5120.0 kB                      | 10240.0 kB                      | 2048 B       |
| tsyringe | 102.4 kB<br>0.67 [0.63, 0.70] | 409.6 kB<br>0.71 [0.68, 0.75] | runtime-error<sup>1</sup>      | runtime-error<sup>2</sup>      | runtime-error<sup>3</sup>       | -            |
| awilix   | 102.4 kB<br>1.33 [1.27, 1.40] | 409.6 kB<br>1.43 [1.36, 1.50] | 2048.0 kB<br>1.80 [1.71, 1.89] | 5120.0 kB<br>2.00 [1.90, 2.10] | 10240.0 kB<br>2.14 [2.04, 2.25] | 2048 B       |

<sup>1</sup> tsyringe at 1,000 providers: runtime-error (RangeError: Maximum call stack size exceeded)  
<sup>2</sup> tsyringe at 2,500 providers: runtime-error (RangeError: Maximum call stack size exceeded)  
<sup>3</sup> tsyringe at 5,000 providers: runtime-error (RangeError: Maximum call stack size exceeded)

## Run

- Run: abc1234 at 2026-10-14T04:00:00Z, seed 7, graph seed 20261001
- Core ref: workspace, libs/core tree 4b825dc642cb6eb9a060e54bf8d69288fbee4904
- Runner: Linux, Xeon, 4 cores, 16 GB, hosted
- Versions: nexusdi 0.4.0-rc.1, inversify 8.2.3, tsyringe 4.10.0, awilix 13.0.5, needle-di 1.2.1, node 24.20.0

## Bundle bytes, mixed

esbuild with `--bundle --minify --format=esm`, library included, then gzip at level 9. The last column is (bytes at 5,000 minus bytes at 1,000) / 4,000: the marginal bytes of one more provider.

### gzip

| library  | 50  | 200   | 1,000 | 2,500  | 5,000  | per provider |
| -------- | --- | ----- | ----- | ------ | ------ | ------------ |
| NexusDI  | 600 | 1,200 | 4,400 | 10,400 | 20,400 | 4.00 B       |
| tsyringe | 600 | 1,200 | -     | -      | -      | -            |
| awilix   | 600 | 1,200 | 4,400 | 10,400 | 20,400 | 4.00 B       |

### minified

| library  | 50    | 200   | 1,000  | 2,500  | 5,000  | per provider |
| -------- | ----- | ----- | ------ | ------ | ------ | ------------ |
| NexusDI  | 1,500 | 3,000 | 11,000 | 26,000 | 51,000 | 10.00 B      |
| tsyringe | 1,500 | 3,000 | -      | -      | -      | -            |
| awilix   | 1,500 | 3,000 | 11,000 | 26,000 | 51,000 | 10.00 B      |

## Graphs

Generated from graph seed 20261001. A graph's hash changes when the generator does.

| shape | size  | hash         | providers | edges  | modules | depth | mean fan-out | max fan-out | max fan-in | kinds                           | target closure |
| ----- | ----- | ------------ | --------- | ------ | ------- | ----- | ------------ | ----------- | ---------- | ------------------------------- | -------------- |
| mixed | 50    | h50000000000 | 50        | 100    | 5       | 10    | 1.90         | 4           | 20         | 40 class, 5 factory, 5 value    | 16             |
| mixed | 200   | h20000000000 | 200       | 400    | 20      | 10    | 1.90         | 4           | 20         | 190 class, 5 factory, 5 value   | 16             |
| mixed | 1,000 | h10000000000 | 1,000     | 2,000  | 100     | 10    | 1.90         | 4           | 20         | 990 class, 5 factory, 5 value   | 16             |
| mixed | 2,500 | h25000000000 | 2,500     | 5,000  | 250     | 10    | 1.90         | 4           | 20         | 2,490 class, 5 factory, 5 value | 16             |
| mixed | 5,000 | h50000000000 | 5,000     | 10,000 | 500     | 10    | 1.90         | 4           | 20         | 4,990 class, 5 factory, 5 value | 16             |
