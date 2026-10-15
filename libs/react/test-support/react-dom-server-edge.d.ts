// React 19.0's Node build of react-dom/server has no renderToReadableStream,
// so the server scope test imports react-dom/server.edge, which has it on
// every 19.x. @types/react-dom 19.0 types no server.edge entry; this ambient
// declaration gives it the function react-dom/server declares, on every
// @types/react-dom the floor and latest legs install.
declare module 'react-dom/server.edge' {
  export { renderToReadableStream } from 'react-dom/server';
}
