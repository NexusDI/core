# Scale results

2,500 providers is the scale of the largest applications measured, which hold 1,200 to 2,250 providers of their own. 5,000 is headroom past every application measured. README, docs and post claims stop at 2,500; the per-provider columns use 1,000 and 5,000, the widest span, so the fixed cost weighs least.

Timings from run f824f4a. Relative figures are NexusDI's divided by the library's, so a figure above 1 means NexusDI takes longer.

## Startup, mixed

Median startup in ms (load plus ready), and NexusDI's startup divided by the library's with its 95% interval; above 1 means NexusDI takes longer. 1,000 measured rounds per size after 10 warm-up rounds, measured on AMD EPYC 9V74 80-Core Processor, 4 cores.

| library     | 50                           | 200                           | 1,000                         | 2,500                          | 5,000                          |
| ----------- | ---------------------------- | ----------------------------- | ----------------------------- | ------------------------------ | ------------------------------ |
| NexusDI     | 8.96 ms                      | 17.82 ms                      | 57.94 ms                      | 136.79 ms                      | 257.63 ms                      |
| InversifyJS | 9.52 ms<br>0.94 [0.94, 0.95] | 19.53 ms<br>0.91 [0.91, 0.92] | 64.02 ms<br>0.91 [0.90, 0.91] | 144.87 ms<br>0.94 [0.94, 0.94] | 258.96 ms<br>1.00 [0.99, 1.00] |
| tsyringe    | 3.83 ms<br>2.34 [2.34, 2.35] | 8.99 ms<br>1.98 [1.97, 1.99]  | 33.70 ms<br>1.73 [1.72, 1.73] | 81.57 ms<br>1.68 [1.68, 1.69]  | 156.60 ms<br>1.65 [1.64, 1.65] |
| awilix      | 4.40 ms<br>2.04 [2.03, 2.05] | 8.80 ms<br>2.02 [2.01, 2.03]  | 38.11 ms<br>1.53 [1.53, 1.54] | 86.78 ms<br>1.58 [1.58, 1.58]  | 183.00 ms<br>1.41 [1.41, 1.42] |
| needle-di   | 4.16 ms<br>2.17 [2.16, 2.17] | 10.63 ms<br>1.68 [1.67, 1.68] | 46.11 ms<br>1.26 [1.26, 1.26] | 115.09 ms<br>1.19 [1.18, 1.19] | 240.99 ms<br>1.07 [1.07, 1.07] |

## Startup, wide

Median startup in ms (load plus ready), and NexusDI's startup divided by the library's with its 95% interval; above 1 means NexusDI takes longer. 200 measured rounds per size after 10 warm-up rounds, measured on AMD EPYC 9V74 80-Core Processor, 4 cores.

| library     | 50                           | 200                           | 1,000                         | 2,500                          | 5,000                          |
| ----------- | ---------------------------- | ----------------------------- | ----------------------------- | ------------------------------ | ------------------------------ |
| NexusDI     | 7.68 ms                      | 14.65 ms                      | 48.10 ms                      | 112.35 ms                      | 206.92 ms                      |
| InversifyJS | 7.69 ms<br>1.00 [0.99, 1.00] | 16.53 ms<br>0.88 [0.88, 0.89] | 59.41 ms<br>0.81 [0.81, 0.81] | 137.81 ms<br>0.81 [0.81, 0.82] | 254.27 ms<br>0.81 [0.81, 0.82] |
| tsyringe    | 3.33 ms<br>2.31 [2.30, 2.31] | 7.82 ms<br>1.88 [1.86, 1.90]  | 31.79 ms<br>1.51 [1.50, 1.53] | 72.27 ms<br>1.55 [1.53, 1.56]  | 150.14 ms<br>1.38 [1.37, 1.39] |
| awilix      | 4.08 ms<br>1.88 [1.15, 1.92] | 7.45 ms<br>1.97 [1.96, 1.98]  | 33.03 ms<br>1.46 [1.45, 1.47] | 72.95 ms<br>1.53 [1.52, 1.54]  | 151.24 ms<br>1.38 [1.37, 1.38] |
| needle-di   | 4.23 ms<br>1.81 [1.81, 1.83] | 11.25 ms<br>1.30 [1.29, 1.31] | 51.09 ms<br>0.95 [0.94, 0.96] | 130.37 ms<br>0.86 [0.85, 0.87] | 272.67 ms<br>0.76 [0.76, 0.76] |

## Startup, deep

Median startup in ms (load plus ready), and NexusDI's startup divided by the library's with its 95% interval; above 1 means NexusDI takes longer. 200 measured rounds per size after 10 warm-up rounds, measured on AMD EPYC 9V74 80-Core Processor, 4 cores.

| library     | 50                           | 200                           | 1,000                         | 2,500                          | 5,000                          |
| ----------- | ---------------------------- | ----------------------------- | ----------------------------- | ------------------------------ | ------------------------------ |
| NexusDI     | 9.41 ms                      | 17.24 ms                      | 56.63 ms                      | 133.66 ms                      | 250.87 ms                      |
| InversifyJS | 9.11 ms<br>1.04 [1.02, 1.04] | 20.06 ms<br>0.86 [0.85, 0.87] | 68.89 ms<br>0.82 [0.82, 0.83] | 162.60 ms<br>0.82 [0.82, 0.83] | 289.80 ms<br>0.87 [0.86, 0.87] |
| tsyringe    | 3.89 ms<br>2.41 [2.40, 2.42] | 8.99 ms<br>1.93 [1.90, 1.94]  | 37.98 ms<br>1.52 [1.51, 1.53] | 84.55 ms<br>1.59 [1.58, 1.60]  | 176.64 ms<br>1.41 [1.40, 1.42] |
| awilix      | 5.19 ms<br>1.81 [1.73, 1.86] | 9.66 ms<br>1.79 [1.78, 1.80]  | 39.24 ms<br>1.44 [1.43, 1.46] | 83.22 ms<br>1.60 [1.60, 1.62]  | 178.68 ms<br>1.41 [1.40, 1.42] |
| needle-di   | 4.99 ms<br>1.88 [1.87, 1.90] | 13.72 ms<br>1.26 [1.24, 1.27] | 59.91 ms<br>0.94 [0.94, 0.95] | 155.81 ms<br>0.86 [0.85, 0.87] | 328.40 ms<br>0.77 [0.76, 0.77] |

## Startup, modular

Median startup in ms (load plus ready), and NexusDI's startup divided by the library's with its 95% interval; above 1 means NexusDI takes longer. 200 measured rounds per size after 10 warm-up rounds, measured on AMD EPYC 7763 64-Core Processor, 4 cores.

| library     | 50                            | 200                           | 1,000                         | 2,500                          | 5,000                          |
| ----------- | ----------------------------- | ----------------------------- | ----------------------------- | ------------------------------ | ------------------------------ |
| NexusDI     | 11.85 ms                      | 21.96 ms                      | 72.78 ms                      | 162.65 ms                      | 308.64 ms                      |
| InversifyJS | 11.68 ms<br>1.01 [1.01, 1.02] | 25.01 ms<br>0.88 [0.87, 0.88] | 85.18 ms<br>0.85 [0.85, 0.86] | 185.87 ms<br>0.87 [0.87, 0.88] | 320.65 ms<br>0.96 [0.96, 0.97] |
| tsyringe    | 4.41 ms<br>2.70 [2.68, 2.71]  | 10.42 ms<br>2.11 [2.10, 2.13] | 40.16 ms<br>1.81 [1.79, 1.82] | 90.88 ms<br>1.79 [1.78, 1.80]  | 179.37 ms<br>1.72 [1.71, 1.73] |
| awilix      | 5.58 ms<br>2.13 [2.11, 2.16]  | 11.55 ms<br>1.91 [1.89, 1.92] | 48.11 ms<br>1.51 [1.50, 1.52] | 102.35 ms<br>1.59 [1.58, 1.60] | 213.44 ms<br>1.45 [1.44, 1.46] |
| needle-di   | 5.65 ms<br>2.10 [2.09, 2.10]  | 15.30 ms<br>1.44 [1.43, 1.44] | 66.03 ms<br>1.10 [1.09, 1.11] | 161.17 ms<br>1.01 [1.00, 1.01] | 329.67 ms<br>0.94 [0.93, 0.94] |

## Startup, mixed-async

Median startup in ms (load plus ready), and NexusDI's startup divided by the library's with its 95% interval; above 1 means NexusDI takes longer. 200 measured rounds per size after 10 warm-up rounds, measured on INTEL(R) XEON(R) PLATINUM 8573C, 4 cores.

| library     | 50                           | 200                           | 1,000                         | 2,500                          | 5,000                          |
| ----------- | ---------------------------- | ----------------------------- | ----------------------------- | ------------------------------ | ------------------------------ |
| NexusDI     | 9.07 ms                      | 18.33 ms                      | 58.97 ms                      | 135.63 ms                      | 246.99 ms                      |
| InversifyJS | 9.76 ms<br>0.93 [0.93, 0.93] | 19.66 ms<br>0.93 [0.93, 0.94] | 64.81 ms<br>0.91 [0.91, 0.91] | 139.77 ms<br>0.97 [0.97, 0.98] | 252.37 ms<br>0.98 [0.97, 0.98] |
| tsyringe    | n/a                          | n/a                           | n/a                           | n/a                            | n/a                            |
| awilix      | n/a                          | n/a                           | n/a                           | n/a                            | n/a                            |
| needle-di   | 4.72 ms<br>1.92 [1.91, 1.93] | 12.19 ms<br>1.51 [1.49, 1.52] | 51.81 ms<br>1.14 [1.13, 1.14] | 120.16 ms<br>1.13 [1.12, 1.13] | 238.93 ms<br>1.03 [1.03, 1.04] |

## First resolve, mixed

Median load, create and the first get: the time until the target is usable. 1,000 measured rounds per size after 10 warm-up rounds, measured on AMD EPYC 9V74 80-Core Processor, 4 cores. The target is the provider with the largest closure; a first get builds 17 providers at 50, 45 at 200, 280 at 1,000, 342 at 2,500 and 1,156 at 5,000 (34%, 23%, 28%, 14% and 23% of the graph).

| library     | 50                           | 200                           | 1,000                         | 2,500                          | 5,000                          |
| ----------- | ---------------------------- | ----------------------------- | ----------------------------- | ------------------------------ | ------------------------------ |
| NexusDI     | 8.87 ms                      | 17.52 ms                      | 56.93 ms                      | 135.02 ms                      | 255.00 ms                      |
| InversifyJS | 8.35 ms<br>1.06 [1.06, 1.07] | 14.69 ms<br>1.19 [1.19, 1.20] | 46.23 ms<br>1.23 [1.23, 1.23] | 100.70 ms<br>1.34 [1.33, 1.34] | 190.08 ms<br>1.34 [1.34, 1.34] |
| tsyringe    | 3.29 ms<br>2.70 [2.69, 2.70] | 6.22 ms<br>2.82 [2.81, 2.83]  | 25.12 ms<br>2.28 [2.27, 2.29] | 54.00 ms<br>2.51 [2.50, 2.52]  | 112.91 ms<br>2.26 [2.26, 2.27] |
| awilix      | 4.06 ms<br>2.19 [2.18, 2.20] | 7.10 ms<br>2.46 [2.45, 2.47]  | 30.80 ms<br>1.86 [1.86, 1.87] | 64.51 ms<br>2.10 [2.09, 2.11]  | 138.30 ms<br>1.85 [1.85, 1.86] |
| needle-di   | 3.71 ms<br>2.40 [2.40, 2.41] | 8.41 ms<br>2.08 [2.08, 2.09]  | 36.69 ms<br>1.56 [1.55, 1.56] | 90.75 ms<br>1.49 [1.48, 1.49]  | 195.79 ms<br>1.30 [1.30, 1.31] |

## Ready, mixed

Median create, the first get and one get of every other provider. 1,000 measured rounds per size after 10 warm-up rounds, measured on AMD EPYC 9V74 80-Core Processor, 4 cores.

| library     | 50                           | 200                           | 1,000                         | 2,500                         | 5,000                          |
| ----------- | ---------------------------- | ----------------------------- | ----------------------------- | ----------------------------- | ------------------------------ |
| NexusDI     | 6.74 ms                      | 13.09 ms                      | 38.38 ms                      | 88.20 ms                      | 147.63 ms                      |
| InversifyJS | 6.66 ms<br>1.01 [1.01, 1.02] | 13.71 ms<br>0.95 [0.95, 0.96] | 42.29 ms<br>0.91 [0.91, 0.91] | 93.36 ms<br>0.94 [0.94, 0.95] | 145.98 ms<br>1.01 [1.01, 1.01] |
| tsyringe    | 1.15 ms<br>5.90 [5.87, 5.94] | 3.87 ms<br>3.37 [3.33, 3.42]  | 12.73 ms<br>3.02 [3.01, 3.02] | 33.44 ms<br>2.63 [2.62, 2.63] | 57.38 ms<br>2.58 [2.58, 2.59]  |
| awilix      | 2.99 ms<br>2.25 [2.24, 2.27] | 6.29 ms<br>2.07 [2.06, 2.08]  | 28.52 ms<br>1.36 [1.35, 1.36] | 63.62 ms<br>1.39 [1.38, 1.39] | 135.89 ms<br>1.09 [1.09, 1.09] |
| needle-di   | 1.47 ms<br>4.60 [4.59, 4.61] | 3.85 ms<br>3.41 [3.40, 3.42]  | 16.29 ms<br>2.36 [2.35, 2.37] | 33.63 ms<br>2.61 [2.60, 2.62] | 67.70 ms<br>2.19 [2.18, 2.19]  |

## Phases, mixed

Absolute medians in ms per phase. NexusDI builds its singletons in `create` and the others build on `get`, so `create` and `first-get` compare different work. Relative statements on this page use first-resolve, ready and startup.

### 50 providers

| library     | load | create | first-get | rest |
| ----------- | ---- | ------ | --------- | ---- |
| NexusDI     | 2.22 | 6.56   | 0.09      | 0.09 |
| InversifyJS | 2.82 | 2.44   | 3.03      | 1.16 |
| tsyringe    | 2.69 | 0.01   | 0.59      | 0.54 |
| awilix      | 1.41 | 2.13   | 0.53      | 0.34 |
| needle-di   | 2.69 | 0.35   | 0.67      | 0.45 |

### 200 providers

| library     | load | create | first-get | rest |
| ----------- | ---- | ------ | --------- | ---- |
| NexusDI     | 4.73 | 12.70  | 0.09      | 0.30 |
| InversifyJS | 5.82 | 5.08   | 3.80      | 4.85 |
| tsyringe    | 5.11 | 0.02   | 1.09      | 2.74 |
| awilix      | 2.49 | 3.75   | 0.85      | 1.69 |
| needle-di   | 6.78 | 0.52   | 1.11      | 2.22 |

### 1,000 providers

| library     | load  | create | first-get | rest  |
| ----------- | ----- | ------ | --------- | ----- |
| NexusDI     | 19.55 | 37.31  | 0.10      | 1.01  |
| InversifyJS | 21.74 | 16.25  | 8.26      | 17.80 |
| tsyringe    | 20.54 | 0.02   | 4.25      | 8.46  |
| awilix      | 9.43  | 16.53  | 4.53      | 7.11  |
| needle-di   | 29.58 | 1.68   | 5.26      | 9.26  |

### 2,500 providers

| library     | load  | create | first-get | rest  |
| ----------- | ----- | ------ | --------- | ----- |
| NexusDI     | 48.47 | 86.24  | 0.11      | 1.82  |
| InversifyJS | 51.54 | 38.98  | 10.30     | 44.09 |
| tsyringe    | 47.52 | 0.03   | 5.73      | 27.62 |
| awilix      | 22.99 | 35.27  | 5.57      | 22.26 |
| needle-di   | 81.32 | 3.94   | 5.36      | 24.29 |

### 5,000 providers

| library     | load   | create | first-get | rest  |
| ----------- | ------ | ------ | --------- | ----- |
| NexusDI     | 110.25 | 144.86 | 0.12      | 2.71  |
| InversifyJS | 113.02 | 51.41  | 25.80     | 68.83 |
| tsyringe    | 99.32  | 0.04   | 13.50     | 43.74 |
| awilix      | 46.79  | 77.79  | 13.63     | 44.61 |
| needle-di   | 173.46 | 7.97   | 14.23     | 45.23 |

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

| library     | 50 to 200         | 200 to 1,000      | 1,000 to 2,500    | 2,500 to 5,000    | per provider |
| ----------- | ----------------- | ----------------- | ----------------- | ----------------- | ------------ |
| NexusDI     | 0.50 [0.49, 0.50] | 0.73 [0.73, 0.74] | 0.94 [0.93, 0.94] | 0.92 [0.92, 0.92] | 49924 ns     |
| InversifyJS | 0.52 [0.52, 0.52] | 0.74 [0.74, 0.74] | 0.89 [0.89, 0.89] | 0.84 [0.84, 0.84] | 48735 ns     |
| tsyringe    | 0.61 [0.60, 0.61] | 0.82 [0.81, 0.83] | 0.96 [0.96, 0.96] | 0.95 [0.94, 0.95] | 30726 ns     |
| awilix      | 0.50 [0.50, 0.51] | 0.90 [0.89, 0.90] | 0.90 [0.89, 0.90] | 1.08 [1.07, 1.08] | 36224 ns     |
| needle-di   | 0.68 [0.68, 0.68] | 0.91 [0.91, 0.91] | 1.00 [0.99, 1.00] | 1.07 [1.06, 1.07] | 48720 ns     |

### ready

| library     | 50 to 200         | 200 to 1,000      | 1,000 to 2,500    | 2,500 to 5,000    |
| ----------- | ----------------- | ----------------- | ----------------- | ----------------- |
| NexusDI     | 0.48 [0.48, 0.48] | 0.67 [0.67, 0.67] | 0.90 [0.90, 0.91] | 0.75 [0.74, 0.75] |
| InversifyJS | 0.52 [0.52, 0.52] | 0.70 [0.70, 0.70] | 0.87 [0.86, 0.87] | 0.65 [0.65, 0.65] |
| tsyringe    | 0.86 [0.85, 0.87] | 0.74 [0.73, 0.75] | 1.05 [1.05, 1.06] | 0.77 [0.76, 0.77] |
| awilix      | 0.54 [0.53, 0.55] | 0.92 [0.92, 0.93] | 0.87 [0.86, 0.88] | 1.10 [1.09, 1.10] |
| needle-di   | 0.69 [0.69, 0.70] | 0.90 [0.90, 0.90] | 0.79 [0.79, 0.80] | 1.00 [1.00, 1.00] |

## Retained heap, mixed

Heap retained after startup with the container referenced, in kB, minus the heap before the app loaded, and NexusDI's figure divided by the library's. The figures come from the same rounds as the timings, with the heap read after a settle before and after the app. The last column is the marginal bytes per provider between 1,000 and 5,000.

| library     | 50                            | 200                            | 1,000                          | 2,500                           | 5,000                           | per provider |
| ----------- | ----------------------------- | ------------------------------ | ------------------------------ | ------------------------------- | ------------------------------- | ------------ |
| NexusDI     | 484.4 kB                      | 1338.8 kB                      | 6080.3 kB                      | 15007.3 kB                      | 27889.9 kB                      | 5452 B       |
| InversifyJS | 657.3 kB<br>0.74 [0.74, 0.74] | 1830.6 kB<br>0.73 [0.73, 0.73] | 8153.9 kB<br>0.75 [0.75, 0.75] | 19027.4 kB<br>0.79 [0.79, 0.79] | 37930.4 kB<br>0.74 [0.74, 0.74] | 7444 B       |
| tsyringe    | 291.9 kB<br>1.66 [1.66, 1.66] | 947.6 kB<br>1.41 [1.41, 1.41]  | 4434.8 kB<br>1.37 [1.37, 1.37] | 11217.3 kB<br>1.34 [1.34, 1.34] | 20672.9 kB<br>1.35 [1.35, 1.35] | 4060 B       |
| awilix      | 229.7 kB<br>2.11 [2.11, 2.11] | 884.0 kB<br>1.51 [1.51, 1.51]  | 4366.2 kB<br>1.39 [1.39, 1.39] | 10916.6 kB<br>1.37 [1.37, 1.37] | 20416.4 kB<br>1.37 [1.37, 1.37] | 4013 B       |
| needle-di   | 273.4 kB<br>1.77 [1.77, 1.77] | 1081.4 kB<br>1.24 [1.24, 1.24] | 5438.3 kB<br>1.12 [1.12, 1.12] | 11477.1 kB<br>1.31 [1.31, 1.31] | 22929.0 kB<br>1.22 [1.22, 1.22] | 4373 B       |

## Run

- Run: f824f4a at 2026-10-25T14:43:56.364Z, seed 40202243290, graph seed 20261001
- Core ref: @nexusdi/core@0.4.0-rc.2, libs/core tree 53be1359987641e4a08808f1276752701bfb4715
- mixed block: Linux 6.17.0-1022-azure, AMD EPYC 9V74 80-Core Processor, 4 cores, 16 GB, hosted, image ubuntu24 20261023.334.3, 172 min
- wide block: Linux 6.17.0-1022-azure, AMD EPYC 9V74 80-Core Processor, 4 cores, 16 GB, hosted, image ubuntu24 20261023.334.3, 35 min
- deep block: Linux 6.17.0-1022-azure, AMD EPYC 9V74 80-Core Processor, 4 cores, 16 GB, hosted, image ubuntu24 20261023.334.3, 39 min
- modular block: Linux 6.17.0-1022-azure, AMD EPYC 7763 64-Core Processor, 4 cores, 16 GB, hosted, image ubuntu24 20261023.334.3, 42 min
- mixed-async block: Linux 6.17.0-1022-azure, INTEL(R) XEON(R) PLATINUM 8573C, 4 cores, 16 GB, hosted, image ubuntu24 20261023.334.3, 24 min
- steady-get block: Linux 6.17.0-1022-azure, AMD EPYC 7763 64-Core Processor, 4 cores, 16 GB, hosted, image ubuntu24 20261023.334.3, 1 min
- Versions: nexusdi 0.4.0-rc.2, inversify 8.2.3, tsyringe 4.10.0, awilix 13.0.5, needle-di 1.2.1, node 24.20.0

## Bundle bytes, mixed

esbuild with `--bundle --minify --format=esm`, library included, then gzip at level 9. The last column is (bytes at 5,000 minus bytes at 1,000) / 4,000: the marginal bytes of one more provider.

### gzip

| library     | 50     | 200    | 1,000  | 2,500   | 5,000   | per provider |
| ----------- | ------ | ------ | ------ | ------- | ------- | ------------ |
| NexusDI     | 24,421 | 28,935 | 54,456 | 101,406 | 180,774 | 31.58 B      |
| InversifyJS | 23,586 | 28,663 | 54,599 | 106,247 | 193,288 | 34.67 B      |
| tsyringe    | 11,097 | 15,014 | 35,708 | 76,082  | 142,529 | 26.71 B      |
| awilix      | 5,105  | 8,932  | 28,236 | 65,454  | 126,169 | 24.48 B      |
| needle-di   | 4,610  | 8,219  | 26,865 | 62,442  | 121,438 | 23.64 B      |

### minified

| library     | 50      | 200     | 1,000   | 2,500   | 5,000     | per provider |
| ----------- | ------- | ------- | ------- | ------- | --------- | ------------ |
| NexusDI     | 76,244  | 102,367 | 248,310 | 532,739 | 1,011,112 | 190.70 B     |
| InversifyJS | 100,180 | 129,535 | 288,041 | 598,953 | 1,124,064 | 209.01 B     |
| tsyringe    | 36,984  | 58,778  | 178,465 | 425,268 | 832,768   | 163.58 B     |
| awilix      | 15,149  | 34,656  | 140,876 | 359,800 | 713,095   | 143.05 B     |
| needle-di   | 25,649  | 78,363  | 359,918 | 894,761 | 1,786,845 | 356.73 B     |

## Graphs

Generated from graph seed 20261001. A graph's hash changes when the generator does.

| shape       | size  | hash         | providers | edges  | modules | depth | mean fan-out | max fan-out | max fan-in | kinds                                                             | target closure |
| ----------- | ----- | ------------ | --------- | ------ | ------- | ----- | ------------ | ----------- | ---------- | ----------------------------------------------------------------- | -------------- |
| mixed       | 50    | d5b8307f3e51 | 50        | 102    | 10      | 7     | 2.04         | 7           | 14         | 39 class, 5 factory, 3 value, 3 alias                             | 17             |
| mixed       | 200   | 43b9dac1a426 | 200       | 451    | 24      | 14    | 2.26         | 14          | 32         | 160 class, 20 factory, 10 value, 10 alias                         | 45             |
| mixed       | 1,000 | fe96ee84e0db | 1,000     | 2,331  | 184     | 24    | 2.33         | 22          | 231        | 800 class, 100 factory, 50 value, 50 alias                        | 280            |
| mixed       | 2,500 | aa2baa6f0cb0 | 2,500     | 6,234  | 397     | 42    | 2.49         | 47          | 434        | 2,000 class, 250 factory, 125 value, 125 alias                    | 342            |
| mixed       | 5,000 | b566e9011259 | 5,000     | 12,322 | 842     | 57    | 2.46         | 47          | 1333       | 4,000 class, 500 factory, 250 value, 250 alias                    | 1156           |
| wide        | 50    | f8b42741a272 | 50        | 80     | 1       | 1     | 1.60         | 2           | 10         | 50 class                                                          | 3              |
| wide        | 200   | 90df99d9279c | 200       | 320    | 1       | 1     | 1.60         | 2           | 15         | 200 class                                                         | 3              |
| wide        | 1,000 | 939ca26eb015 | 1,000     | 1,600  | 1       | 1     | 1.60         | 2           | 19         | 1,000 class                                                       | 3              |
| wide        | 2,500 | 3ec0c5a1ba7b | 2,500     | 4,000  | 1       | 1     | 1.60         | 2           | 18         | 2,500 class                                                       | 3              |
| wide        | 5,000 | 39f1234937b6 | 5,000     | 8,000  | 1       | 1     | 1.60         | 2           | 21         | 5,000 class                                                       | 3              |
| deep        | 50    | b699102e63db | 50        | 77     | 1       | 49    | 1.54         | 2           | 4          | 50 class                                                          | 50             |
| deep        | 200   | 51192d61165d | 200       | 309    | 1       | 99    | 1.55         | 2           | 6          | 200 class                                                         | 100            |
| deep        | 1,000 | 52f6eba9dafb | 1,000     | 1,579  | 1       | 99    | 1.58         | 2           | 8          | 1,000 class                                                       | 100            |
| deep        | 2,500 | 6cfe2249e512 | 2,500     | 3,951  | 1       | 99    | 1.58         | 2           | 8          | 2,500 class                                                       | 100            |
| deep        | 5,000 | c2318eb9e719 | 5,000     | 7,877  | 1       | 99    | 1.58         | 2           | 8          | 5,000 class                                                       | 100            |
| modular     | 50    | c40c06b1d07d | 50        | 76     | 5       | 13    | 1.52         | 2           | 9          | 50 class                                                          | 24             |
| modular     | 200   | 354dcd425810 | 200       | 312    | 20      | 19    | 1.56         | 2           | 14         | 200 class                                                         | 47             |
| modular     | 1,000 | 0477fd9a8552 | 1,000     | 1,614  | 100     | 32    | 1.61         | 2           | 21         | 1,000 class                                                       | 85             |
| modular     | 2,500 | 44db90b24802 | 2,500     | 3,996  | 250     | 45    | 1.60         | 2           | 27         | 2,500 class                                                       | 144            |
| modular     | 5,000 | a4cf51a0b4ea | 5,000     | 7,997  | 500     | 46    | 1.60         | 2           | 28         | 5,000 class                                                       | 205            |
| mixed-async | 50    | ece185340786 | 50        | 102    | 10      | 7     | 2.04         | 7           | 14         | 39 class, 2 factory, 3 async-factory, 3 value, 3 alias            | 17             |
| mixed-async | 200   | 491fc1116fa2 | 200       | 451    | 24      | 14    | 2.26         | 14          | 32         | 160 class, 10 factory, 10 async-factory, 10 value, 10 alias       | 45             |
| mixed-async | 1,000 | e894b28e87ca | 1,000     | 2,331  | 184     | 24    | 2.33         | 22          | 231        | 800 class, 50 factory, 50 async-factory, 50 value, 50 alias       | 280            |
| mixed-async | 2,500 | ca2c726c5efc | 2,500     | 6,234  | 397     | 42    | 2.49         | 47          | 434        | 2,000 class, 125 factory, 125 async-factory, 125 value, 125 alias | 342            |
| mixed-async | 5,000 | 3e91cd1ed6ed | 5,000     | 12,322 | 842     | 57    | 2.46         | 47          | 1333       | 4,000 class, 250 factory, 250 async-factory, 250 value, 250 alias | 1156           |
