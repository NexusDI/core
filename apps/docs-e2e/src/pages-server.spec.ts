import { expect, test } from '@playwright/test';

/**
 * The static server stands in for GitHub Pages: trailing-slash redirects, an
 * index.html per directory, the root 404.html for any missing path, and no
 * rewrites. A test that passes here and fails on Pages means this server
 * differs from Pages.
 */
test.describe('the GitHub Pages stand-in', () => {
  test('redirects a directory path to its trailing slash', async ({
    request,
  }) => {
    const response = await request.get('/next/tokens', { maxRedirects: 0 });
    expect(response.status()).toBe(301);
    expect(response.headers()['location']).toBe('/next/tokens/');
  });

  test('serves index.html for a directory', async ({ request }) => {
    const response = await request.get('/next/tokens/');
    expect(response.status()).toBe(200);
    expect(response.headers()['content-type']).toContain('text/html');
    expect(await response.text()).toContain('Tokens');
  });

  test('serves a file with its content type', async ({ request }) => {
    const response = await request.get('/next/404.html');
    expect(response.status()).toBe(200);
    expect(response.headers()['content-type']).toContain('text/html');
  });

  test('answers a missing path with the root 404.html', async ({ request }) => {
    const response = await request.get('/next/no-such-page/');
    expect(response.status()).toBe(404);
    expect(await response.text()).toContain('/next/404.html');
  });
});
