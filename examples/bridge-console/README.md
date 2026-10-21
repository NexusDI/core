# Bridge console

The Meridian bridge console: a React Router 8 app in framework mode, rendered
on the server. Its server graph `BridgeConsole` calls the bridge API
(`examples/bridge-api`) over HTTP, and its client graph `BridgeClient` runs in
the browser.

```sh
npx nx run @nexusdi/bridge-console:dev
npx nx run @nexusdi/bridge-console:build
```
