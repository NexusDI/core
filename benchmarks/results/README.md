# Benchmark results

<!-- scale:begin -->

## Scaling

2,500 providers is the scale of the largest applications measured, which hold 1,200 to 2,250 providers of their own. 5,000 is headroom past every application measured. README, docs and post claims stop at 2,500; the per-provider columns use 1,000 and 5,000, the widest span, so the fixed cost weighs least.

Gzip bytes of the bundle on `mixed` graphs.

| library     | 50     | 200    | 1,000  | 2,500   | 5,000   |
| ----------- | ------ | ------ | ------ | ------- | ------- |
| NexusDI     | 20,451 | 25,186 | 50,405 | 97,815  | 177,279 |
| InversifyJS | 23,586 | 28,663 | 54,599 | 106,247 | 193,288 |
| tsyringe    | 11,097 | 15,014 | 35,708 | 76,082  | 142,529 |
| awilix      | 5,105  | 8,932  | 28,236 | 65,454  | 126,169 |
| needle-di   | 4,610  | 8,219  | 26,865 | 62,442  | 121,438 |

![Bundle size against providers, mixed](scale-bundle.svg)

Every table, with the other shapes, the phases and the growth exponents, is in [scale.md](scale.md).

<!-- scale:end -->
