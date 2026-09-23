const encode = encodeURIComponent;

export class Clash {
  constructor({
    api,
    secret = '',
    fetch: fetchImpl = globalThis.fetch,
    WebSocket: WebSocketImpl = globalThis.WebSocket,
  }) {
    if (!api) throw new TypeError('api is required');
    this.api = api.replace(/\/$/, '');
    this.secret = secret;
    this.fetch = fetchImpl;
    this.WebSocket = WebSocketImpl;
  }

  headers() {
    return {
      'Content-Type': 'application/json',
      ...(this.secret ? { Authorization: `Bearer ${this.secret}` } : {}),
    };
  }

  async request(method, path, body) {
    if (typeof this.fetch !== 'function') {
      throw new Error('fetch is not available; use Node.js 18+ or pass fetch to Clash');
    }
    const response = await this.fetch.call(globalThis, this.api + path, {
      method,
      headers: this.headers(),
      body: body == null ? undefined : JSON.stringify(body),
    });
    if (!response.ok) {
      const text = await response.text().catch(() => '');
      throw new Error(`${method} ${path}: ${response.status} ${text || response.statusText}`);
    }
    return response;
  }

  async json(path) {
    return (await this.request('GET', path)).json();
  }

  socket(path, onMessage, onError) {
    if (typeof this.WebSocket !== 'function') {
      throw new Error('WebSocket is not available; use Node.js 22+ or pass WebSocket to Clash');
    }
    const url = new URL(this.api + path);
    url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
    if (this.secret) url.searchParams.set('token', this.secret);

    const ws = new this.WebSocket(url);
    ws.onmessage = event => {
      try {
        onMessage(JSON.parse(event.data));
      } catch (error) {
        onError?.(error);
      }
    };
    ws.onerror = () => ws.close();
    ws.onclose = event => onError?.(event);
    return () => ws.close();
  }

  getConfig() {
    return this.json('/configs');
  }

  async setConfig(config) {
    return (await this.request('PATCH', '/configs', config)).status === 204;
  }

  getVersion() {
    return this.json('/version');
  }

  async getProxies() {
    const { proxies } = await this.json('/proxies');
    return Object.entries(proxies).map(([name, proxy]) => ({ name, ...proxy }));
  }

  proxy(name) {
    return this.json(`/proxies/${encode(name)}`);
  }

  async switchProxy(group, name) {
    return (await this.request('PUT', `/proxies/${encode(group)}`, { name })).status === 204;
  }

  async delay(name, url = 'http://www.gstatic.com/generate_204', timeout = 5000) {
    const params = new URLSearchParams({ url, timeout });
    const data = await this.json(`/proxies/${encode(name)}/delay?${params}`);
    return data.delay || 0;
  }

  async getProxyProviders() {
    const { providers } = await this.json('/providers/proxies');
    return Object.values(providers);
  }

  async updateProxyProvider(name) {
    return (await this.request('PUT', `/providers/proxies/${encode(name)}`)).status === 204;
  }

  async healthcheckProxyProvider(name) {
    return (await this.request('GET', `/providers/proxies/${encode(name)}/healthcheck`)).status === 204;
  }

  async getRules() {
    const { rules } = await this.json('/rules');
    return rules;
  }

  async setRuleDisabled(index, disabled) {
    return (await this.request('PATCH', '/rules/disable', { [index]: disabled })).status === 204;
  }

  async getRuleProviders() {
    const { providers } = await this.json('/providers/rules');
    return Object.values(providers);
  }

  async updateRuleProvider(name) {
    return (await this.request('PUT', `/providers/rules/${encode(name)}`)).status === 204;
  }

  getConnections() {
    return this.json('/connections');
  }

  async closeConnection(id) {
    return (await this.request('DELETE', `/connections/${encode(id)}`)).status === 204;
  }

  async closeAllConnections() {
    return (await this.request('DELETE', '/connections')).status === 204;
  }
}
