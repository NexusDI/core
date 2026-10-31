# Benchmark results

<!-- scale:begin -->

## Scaling

2,500 providers is the scale of the largest applications measured, which hold 1,200 to 2,250 providers of their own. 5,000 is headroom past every application measured. README, docs and post claims stop at 2,500; the per-provider columns use 1,000 and 5,000, the widest span, so the fixed cost weighs least.

Startup on `mixed` graphs. 1,000 measured rounds per size after 10 warm-up rounds, measured on AMD EPYC 9V74 80-Core Processor, 4 cores. The second line is NexusDI's startup divided by the library's, with its 95% interval; above 1 means NexusDI takes longer.

| library     | 50                           | 200                           | 1,000                         | 2,500                          | 5,000                          |
| ----------- | ---------------------------- | ----------------------------- | ----------------------------- | ------------------------------ | ------------------------------ |
| NexusDI     | 8.96 ms                      | 17.82 ms                      | 57.94 ms                      | 136.79 ms                      | 257.63 ms                      |
| InversifyJS | 9.52 ms<br>0.94 [0.94, 0.95] | 19.53 ms<br>0.91 [0.91, 0.92] | 64.02 ms<br>0.91 [0.90, 0.91] | 144.87 ms<br>0.94 [0.94, 0.94] | 258.96 ms<br>1.00 [0.99, 1.00] |
| tsyringe    | 3.83 ms<br>2.34 [2.34, 2.35] | 8.99 ms<br>1.98 [1.97, 1.99]  | 33.70 ms<br>1.73 [1.72, 1.73] | 81.57 ms<br>1.68 [1.68, 1.69]  | 156.60 ms<br>1.65 [1.64, 1.65] |
| awilix      | 4.40 ms<br>2.04 [2.03, 2.05] | 8.80 ms<br>2.02 [2.01, 2.03]  | 38.11 ms<br>1.53 [1.53, 1.54] | 86.78 ms<br>1.58 [1.58, 1.58]  | 183.00 ms<br>1.41 [1.41, 1.42] |
| needle-di   | 4.16 ms<br>2.17 [2.16, 2.17] | 10.63 ms<br>1.68 [1.67, 1.68] | 46.11 ms<br>1.26 [1.26, 1.26] | 115.09 ms<br>1.19 [1.18, 1.19] | 240.99 ms<br>1.07 [1.07, 1.07] |

![Startup against providers, mixed](scale-startup.svg)

Gzip bytes of the bundle on `mixed` graphs.

| library     | 50     | 200    | 1,000  | 2,500   | 5,000   |
| ----------- | ------ | ------ | ------ | ------- | ------- |
| NexusDI     | 24,421 | 28,935 | 54,456 | 101,406 | 180,774 |
| InversifyJS | 23,586 | 28,663 | 54,599 | 106,247 | 193,288 |
| tsyringe    | 11,097 | 15,014 | 35,708 | 76,082  | 142,529 |
| awilix      | 5,105  | 8,932  | 28,236 | 65,454  | 126,169 |
| needle-di   | 4,610  | 8,219  | 26,865 | 62,442  | 121,438 |

![Bundle size against providers, mixed](scale-bundle.svg)

Every table, with the other shapes, the phases and the growth exponents, is in [scale.md](scale.md).

<!-- scale:end -->
