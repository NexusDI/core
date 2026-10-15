# Benchmark results

<!-- scale:begin -->

## Scaling

Gzip bytes of the bundle on `mixed` graphs.

| library     | 50     | 200    | 1,000  | 5,000   |
| ----------- | ------ | ------ | ------ | ------- |
| NexusDI     | 20,451 | 25,186 | 50,405 | 177,309 |
| InversifyJS | 23,586 | 28,663 | 54,599 | 193,492 |
| tsyringe    | 11,097 | 15,014 | 35,708 | 140,881 |
| awilix      | 5,105  | 8,932  | 28,236 | 126,145 |
| needle-di   | 4,610  | 8,219  | 26,865 | 121,330 |

![Bundle size against providers, mixed](scale-bundle.svg)

Every table, with the other shapes, the phases and the growth exponents, is in [scale.md](scale.md).

<!-- scale:end -->
