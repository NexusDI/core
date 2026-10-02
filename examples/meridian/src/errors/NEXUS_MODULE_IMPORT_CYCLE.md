# NEXUS_MODULE_IMPORT_CYCLE examples

Regions for `apps/docs/content/errors/NEXUS_MODULE_IMPORT_CYCLE.mdx`. Every block runs as a test.

<!-- #region reproduce -->

```ts @import.meta.vitest
import { Nexus, declareModuleClass, defineModule } from '@nexusdi/core';
import { isNexusError } from '@nexusdi/core';
import { errors } from '@nexusdi/errors';

// Two module classes that import each other. @Module from
// @nexusdi/decorators writes the same declaration.
class Engineering {}
class Tactical {}
declareModuleClass(Engineering, { name: 'Engineering', imports: [Tactical] });
declareModuleClass(Tactical, { name: 'Tactical', imports: [Engineering] });

const Meridian = defineModule({ name: 'Meridian', imports: [Engineering] });

const thin = await Nexus.create(Meridian).catch((error: unknown) => error);
if (!isNexusError(thin, 'NEXUS_BLUEPRINT_INVALID')) throw thin;
const line = thin.errors[0]?.message; // -> '[NEXUS_MODULE_IMPORT_CYCLE] path=Engineering,Tactical,Engineering. https://nexus.js.org/errors/NEXUS_MODULE_IMPORT_CYCLE'
console.log(line);

const full = await Nexus.create(Meridian, { plugins: [errors()] }).catch(
  (error: unknown) => error,
);
if (!isNexusError(full, 'NEXUS_BLUEPRINT_INVALID')) throw full;
const text = full.errors[0]?.message.split('\n'); // -> ['[NEXUS_MODULE_IMPORT_CYCLE] Engineering → Tactical → Engineering is a module import cycle.', '  Fix: move the shared providers into a module that both import.']
console.log(text);
```

<!-- #endregion reproduce -->

<!-- #region fix -->

```ts @import.meta.vitest
import { Nexus, Token, defineModule, provide } from '@nexusdi/core';

interface IShipComputer {
  status(): string;
}
const COMPUTER = new Token<IShipComputer>('ShipComputer');
class QuantumComputer implements IShipComputer {
  status() {
    return 'online';
  }
}

// The provider both modules needed moves to a module that both import.
const Core = defineModule({
  name: 'Core',
  providers: [provide(COMPUTER, { useClass: QuantumComputer })],
  exports: [COMPUTER],
});
const Engineering = defineModule({ name: 'Engineering', imports: [Core] });
const Tactical = defineModule({ name: 'Tactical', imports: [Core] });
const Meridian = defineModule({
  name: 'Meridian',
  imports: [Engineering, Tactical, Core],
});

await using ship = await Nexus.create(Meridian);
const status = ship.get(COMPUTER).status(); // -> 'online'
console.log(status);
```

<!-- #endregion fix -->
