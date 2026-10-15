# Scale results

No timing run yet: this page holds the deterministic results from `scale.json` only.

## Bundle bytes, mixed

esbuild with `--bundle --minify --format=esm`, library included, then gzip at level 9. The last column is (bytes at 5,000 minus bytes at 1,000) / 4,000: the marginal bytes of one more provider.

### gzip

| library     | 50     | 200    | 1,000  | 5,000   | per provider |
| ----------- | ------ | ------ | ------ | ------- | ------------ |
| NexusDI     | 20,451 | 25,186 | 50,405 | 177,279 | 31.72 B      |
| InversifyJS | 23,586 | 28,663 | 54,599 | 193,288 | 34.67 B      |
| tsyringe    | 11,097 | 15,014 | 35,708 | 142,529 | 26.71 B      |
| awilix      | 5,105  | 8,932  | 28,236 | 126,169 | 24.48 B      |
| needle-di   | 4,610  | 8,219  | 26,865 | 121,438 | 23.64 B      |

### minified

| library     | 50      | 200     | 1,000   | 5,000     | per provider |
| ----------- | ------- | ------- | ------- | --------- | ------------ |
| NexusDI     | 64,800  | 90,887  | 236,792 | 999,443   | 190.66 B     |
| InversifyJS | 100,180 | 129,535 | 288,041 | 1,124,064 | 209.01 B     |
| tsyringe    | 36,984  | 58,778  | 178,465 | 832,768   | 163.58 B     |
| awilix      | 15,149  | 34,656  | 140,876 | 713,095   | 143.05 B     |
| needle-di   | 25,649  | 78,363  | 359,918 | 1,786,845 | 356.73 B     |

## Graphs

Generated from graph seed 20261001. A graph's hash changes when the generator does.

| shape       | size  | hash         | providers | edges  | modules | depth | mean fan-out | max fan-out | max fan-in | kinds                                                             | target closure |
| ----------- | ----- | ------------ | --------- | ------ | ------- | ----- | ------------ | ----------- | ---------- | ----------------------------------------------------------------- | -------------- |
| mixed       | 50    | d5b8307f3e51 | 50        | 102    | 10      | 7     | 2.04         | 7           | 14         | 39 class, 5 factory, 3 value, 3 alias                             | 17             |
| mixed       | 200   | 43b9dac1a426 | 200       | 451    | 24      | 14    | 2.26         | 14          | 32         | 160 class, 20 factory, 10 value, 10 alias                         | 45             |
| mixed       | 1,000 | fe96ee84e0db | 1,000     | 2,331  | 184     | 24    | 2.33         | 22          | 231        | 800 class, 100 factory, 50 value, 50 alias                        | 280            |
| mixed       | 5,000 | b566e9011259 | 5,000     | 12,322 | 842     | 57    | 2.46         | 47          | 1333       | 4,000 class, 500 factory, 250 value, 250 alias                    | 1156           |
| wide        | 50    | f8b42741a272 | 50        | 80     | 1       | 1     | 1.60         | 2           | 10         | 50 class                                                          | 3              |
| wide        | 200   | 90df99d9279c | 200       | 320    | 1       | 1     | 1.60         | 2           | 15         | 200 class                                                         | 3              |
| wide        | 1,000 | 939ca26eb015 | 1,000     | 1,600  | 1       | 1     | 1.60         | 2           | 19         | 1,000 class                                                       | 3              |
| wide        | 5,000 | 39f1234937b6 | 5,000     | 8,000  | 1       | 1     | 1.60         | 2           | 21         | 5,000 class                                                       | 3              |
| deep        | 50    | b699102e63db | 50        | 77     | 1       | 49    | 1.54         | 2           | 4          | 50 class                                                          | 50             |
| deep        | 200   | 51192d61165d | 200       | 309    | 1       | 99    | 1.55         | 2           | 6          | 200 class                                                         | 100            |
| deep        | 1,000 | 52f6eba9dafb | 1,000     | 1,579  | 1       | 99    | 1.58         | 2           | 8          | 1,000 class                                                       | 100            |
| deep        | 5,000 | c2318eb9e719 | 5,000     | 7,877  | 1       | 99    | 1.58         | 2           | 8          | 5,000 class                                                       | 100            |
| modular     | 50    | c40c06b1d07d | 50        | 76     | 5       | 13    | 1.52         | 2           | 9          | 50 class                                                          | 24             |
| modular     | 200   | 354dcd425810 | 200       | 312    | 20      | 19    | 1.56         | 2           | 14         | 200 class                                                         | 47             |
| modular     | 1,000 | 0477fd9a8552 | 1,000     | 1,614  | 100     | 32    | 1.61         | 2           | 21         | 1,000 class                                                       | 85             |
| modular     | 5,000 | a4cf51a0b4ea | 5,000     | 7,997  | 500     | 46    | 1.60         | 2           | 28         | 5,000 class                                                       | 205            |
| mixed-async | 50    | ece185340786 | 50        | 102    | 10      | 7     | 2.04         | 7           | 14         | 39 class, 2 factory, 3 async-factory, 3 value, 3 alias            | 17             |
| mixed-async | 200   | 491fc1116fa2 | 200       | 451    | 24      | 14    | 2.26         | 14          | 32         | 160 class, 10 factory, 10 async-factory, 10 value, 10 alias       | 45             |
| mixed-async | 1,000 | e894b28e87ca | 1,000     | 2,331  | 184     | 24    | 2.33         | 22          | 231        | 800 class, 50 factory, 50 async-factory, 50 value, 50 alias       | 280            |
| mixed-async | 5,000 | 3e91cd1ed6ed | 5,000     | 12,322 | 842     | 57    | 2.46         | 47          | 1333       | 4,000 class, 250 factory, 250 async-factory, 250 value, 250 alias | 1156           |
