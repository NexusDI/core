# Benchmark results

<!-- scale:begin -->

## Scaling

Gzip bytes of the bundle on `mixed` graphs.

| library     | 50     | 200    | 1,000  | 5,000   |
| ----------- | ------ | ------ | ------ | ------- |
| NexusDI     | 20,335 | 24,805 | 47,064 | 158,429 |
| InversifyJS | 23,504 | 28,129 | 51,363 | 169,226 |
| tsyringe    | 11,026 | 14,693 | 33,488 | 126,559 |
| awilix      | 5,043  | 8,578  | 25,950 | 111,342 |
| needle-di   | 4,571  | 7,746  | 24,362 | 104,871 |

![Bundle size against providers, mixed](scale-bundle.svg)

Every table, with the other shapes, the phases and the growth exponents, is in [scale.md](scale.md).

<!-- scale:end -->
