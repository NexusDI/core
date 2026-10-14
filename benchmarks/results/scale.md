# Scale results

No timing run yet: this page holds the deterministic results from `scale.json` only.

## Bundle bytes, mixed

esbuild with `--bundle --minify --format=esm`, library included, then gzip at level 9. The last column is (bytes at 5,000 minus bytes at 1,000) / 4,000: the marginal bytes of one more provider.

### gzip

| library     | 50     | 200    | 1,000  | 5,000   | per provider |
| ----------- | ------ | ------ | ------ | ------- | ------------ |
| NexusDI     | 20,335 | 24,805 | 47,064 | 158,429 | 27.84 B      |
| InversifyJS | 23,504 | 28,129 | 51,363 | 169,226 | 29.47 B      |
| tsyringe    | 11,026 | 14,693 | 33,488 | 126,559 | 23.27 B      |
| awilix      | 5,043  | 8,578  | 25,950 | 111,342 | 21.35 B      |
| needle-di   | 4,571  | 7,746  | 24,362 | 104,871 | 20.13 B      |

### minified

| library     | 50      | 200     | 1,000   | 5,000     | per provider |
| ----------- | ------- | ------- | ------- | --------- | ------------ |
| NexusDI     | 64,828  | 90,160  | 226,558 | 941,671   | 178.78 B     |
| InversifyJS | 100,425 | 128,072 | 277,482 | 1,047,309 | 192.46 B     |
| tsyringe    | 37,220  | 58,039  | 171,775 | 763,670   | 147.97 B     |
| awilix      | 15,087  | 33,288  | 130,981 | 653,813   | 130.71 B     |
| needle-di   | 26,555  | 80,873  | 370,951 | 1,838,553 | 366.90 B     |

## Graphs

Generated from graph seed 20261001. A graph's hash changes when the generator does.

| shape       | size  | hash         | providers | edges | modules | depth | mean fan-out | max fan-out | max fan-in | kinds                                                 | target closure |
| ----------- | ----- | ------------ | --------- | ----- | ------- | ----- | ------------ | ----------- | ---------- | ----------------------------------------------------- | -------------- |
| mixed       | 50    | 868ff8f30086 | 50        | 101   | 5       | 10    | 2.02         | 4           | 18         | 42 class, 5 factory, 3 value                          | 16             |
| mixed       | 200   | e9e0741a34d7 | 200       | 357   | 20      | 11    | 1.79         | 4           | 43         | 170 class, 20 factory, 10 value                       | 27             |
| mixed       | 1,000 | dc0a808a1c32 | 1,000     | 1,799 | 103     | 12    | 1.80         | 4           | 209        | 850 class, 100 factory, 50 value                      | 31             |
| mixed       | 5,000 | 7690f0bd862b | 5,000     | 9,156 | 497     | 19    | 1.83         | 4           | 984        | 4250 class, 500 factory, 250 value                    | 42             |
| wide        | 50    | f8b42741a272 | 50        | 80    | 1       | 1     | 1.60         | 2           | 10         | 50 class                                              | 3              |
| wide        | 200   | 90df99d9279c | 200       | 320   | 1       | 1     | 1.60         | 2           | 15         | 200 class                                             | 3              |
| wide        | 1,000 | 939ca26eb015 | 1,000     | 1,600 | 1       | 1     | 1.60         | 2           | 19         | 1000 class                                            | 3              |
| wide        | 5,000 | 39f1234937b6 | 5,000     | 8,000 | 1       | 1     | 1.60         | 2           | 21         | 5000 class                                            | 3              |
| deep        | 50    | b699102e63db | 50        | 77    | 1       | 49    | 1.54         | 2           | 4          | 50 class                                              | 50             |
| deep        | 200   | 51192d61165d | 200       | 309   | 1       | 99    | 1.55         | 2           | 6          | 200 class                                             | 100            |
| deep        | 1,000 | 52f6eba9dafb | 1,000     | 1,579 | 1       | 99    | 1.58         | 2           | 8          | 1000 class                                            | 100            |
| deep        | 5,000 | c2318eb9e719 | 5,000     | 7,877 | 1       | 99    | 1.58         | 2           | 8          | 5000 class                                            | 100            |
| modular     | 50    | c40c06b1d07d | 50        | 76    | 5       | 13    | 1.52         | 2           | 9          | 50 class                                              | 21             |
| modular     | 200   | 354dcd425810 | 200       | 312   | 20      | 19    | 1.56         | 2           | 14         | 200 class                                             | 47             |
| modular     | 1,000 | 0477fd9a8552 | 1,000     | 1,614 | 100     | 32    | 1.61         | 2           | 21         | 1000 class                                            | 78             |
| modular     | 5,000 | a4cf51a0b4ea | 5,000     | 7,997 | 500     | 46    | 1.60         | 2           | 28         | 5000 class                                            | 205            |
| mixed-async | 50    | ab964e4f3c49 | 50        | 101   | 5       | 10    | 2.02         | 4           | 18         | 42 class, 2 factory, 3 async-factory, 3 value         | 16             |
| mixed-async | 200   | 926edb1318b3 | 200       | 357   | 20      | 11    | 1.79         | 4           | 43         | 170 class, 8 factory, 12 async-factory, 10 value      | 27             |
| mixed-async | 1,000 | 7cc8accc5c8e | 1,000     | 1,799 | 103     | 12    | 1.80         | 4           | 209        | 850 class, 51 factory, 49 async-factory, 50 value     | 31             |
| mixed-async | 5,000 | 8731cafb4eda | 5,000     | 9,156 | 497     | 19    | 1.83         | 4           | 984        | 4250 class, 235 factory, 265 async-factory, 250 value | 42             |
