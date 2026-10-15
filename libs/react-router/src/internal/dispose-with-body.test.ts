import { describe, expect, it, vi } from 'vitest';

import { disposeWithBody } from './dispose-with-body.js';

function streamOf(...chunks: string[]): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  return new ReadableStream({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(encoder.encode(chunk));
      controller.close();
    },
  });
}

describe('disposeWithBody', () => {
  it('disposes once the consumer has read the whole body', async () => {
    const dispose = vi.fn(async () => {});
    const res = disposeWithBody(
      new Response(streamOf('a', 'b')),
      dispose,
      'GET',
    );
    expect(dispose).not.toHaveBeenCalled();
    expect(await res.text()).toBe('ab');
    expect(dispose).toHaveBeenCalledTimes(1);
  });

  it('keeps the status and the headers', () => {
    const res = disposeWithBody(
      new Response('x', {
        status: 201,
        headers: { 'x-mission-id': 'survey-7' },
      }),
      async () => {},
      'GET',
    );
    expect(res.status).toBe(201);
    expect(res.headers.get('x-mission-id')).toBe('survey-7');
  });

  it('disposes when the consumer cancels the body', async () => {
    const dispose = vi.fn(async () => {});
    const res = disposeWithBody(new Response(streamOf('a')), dispose, 'GET');
    await res.body?.cancel('client gone');
    expect(dispose).toHaveBeenCalledTimes(1);
  });

  it('disposes when the original body errors', async () => {
    const dispose = vi.fn(async () => {});
    const failing = new ReadableStream<Uint8Array>({
      pull(controller) {
        controller.error(new Error('relay lost'));
      },
    });
    const res = disposeWithBody(new Response(failing), dispose, 'GET');
    await expect(res.text()).rejects.toThrow('relay lost');
    expect(dispose).toHaveBeenCalledTimes(1);
  });

  it.each([
    ['a null body', new Response(null), 'GET'],
    ['a HEAD request', new Response('x'), 'HEAD'],
    ['a 204', new Response(null, { status: 204 }), 'GET'],
    ['a 304', new Response(null, { status: 304 }), 'GET'],
  ])(
    'disposes at once and returns the same response for %s',
    (_, response, method) => {
      const dispose = vi.fn(async () => {});
      expect(disposeWithBody(response, dispose, method)).toBe(response);
      expect(dispose).toHaveBeenCalledTimes(1);
    },
  );
});
