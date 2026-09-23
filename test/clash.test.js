import test from 'node:test';
import assert from 'node:assert/strict';
import { Clash } from '../clash.js';

test('uses an injected fetch implementation', async () => {
  let request;
  const fetch = async (url, options) => {
    request = { url, options };
    return {
      ok: true,
      status: 204,
      statusText: 'No Content',
      text: async () => '',
      json: async () => ({}),
    };
  };

  const clash = new Clash({
    api: 'http://127.0.0.1:9090/',
    secret: 'secret',
    fetch,
  });

  assert.equal(await clash.setConfig({ mode: 'rule' }), true);
  assert.equal(request.url, 'http://127.0.0.1:9090/configs');
  assert.equal(request.options.method, 'PATCH');
  assert.equal(request.options.headers.Authorization, 'Bearer secret');
  assert.equal(request.options.body, JSON.stringify({ mode: 'rule' }));
});

test('uses an injected WebSocket implementation', () => {
  class MockWebSocket {
    constructor(url) {
      this.url = String(url);
      MockWebSocket.instance = this;
    }
    close() {}
  }

  let message;
  const clash = new Clash({
    api: 'https://example.com',
    secret: 'token',
    WebSocket: MockWebSocket,
  });

  const close = clash.socket('/traffic', value => {
    message = value;
  });

  assert.equal(MockWebSocket.instance.url, 'wss://example.com/traffic?token=token');
  MockWebSocket.instance.onmessage({ data: '{"up":42}' });
  assert.deepEqual(message, { up: 42 });
  close();
});

test('explains missing runtime transports', async () => {
  const clash = new Clash({
    api: 'http://127.0.0.1:9090',
    fetch: null,
    WebSocket: null,
  });

  await assert.rejects(() => clash.getVersion(), /fetch is not available/);
  assert.throws(() => clash.socket('/traffic', () => {}), /WebSocket is not available/);
});
