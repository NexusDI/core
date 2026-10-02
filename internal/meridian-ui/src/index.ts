/**
 * The stateless Meridian components. Each imports only what an element needs
 * from React; `react-imports.test.ts` and `scripts/verify-packaging.mjs` hold
 * the allowlist.
 */
export { ConsoleFrame } from './components/console-frame.js';
export type { ConsoleFrameProps } from './components/console-frame.js';
export { Marker } from './components/marker.js';
export type { MarkerProps } from './components/marker.js';
export { Notice, NOTICE_LABELS } from './components/notice.js';
export type { NoticeKind, NoticeProps } from './components/notice.js';
export { Panel } from './components/panel.js';
export type { PanelProps } from './components/panel.js';
