import type { Config } from '@react-router/dev/config';

declare module 'react-router' {
  interface Future {
    v8_middleware: true;
  }
}

export default {
  ssr: true,
  future: {
    v8_middleware: true,
  },
} satisfies Config;
