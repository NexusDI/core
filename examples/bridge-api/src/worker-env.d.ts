// The binding type until Task 21 generates the Workers types.
declare module 'cloudflare:workers' {
  export const env: { readonly RELAY_URL: string };
}
