// The @nexusdi/devtools/live entry. Live drawing lives on a subpath of its
// own, so an app that never imports it ships none of its code.
export { liveSink } from './profile/live.js';
export type { LiveSink } from './profile/report.js';
