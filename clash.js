import { connect } from 'https://lsong.org/scripts/websocket.js';
import { parseJSONLines } from 'https://lsong.org/scripts/stream.js';

/**
 * Clash API
 * @docs https://clash.gitbook.io/doc/
 * @param {*} param0 
 */
export class Clash {
  constructor({ api, secret }) {
    this.api = api;
    this.secret = secret;
  }
  request(method, path, body) {
    const { api, secret } = this;
    const headers = {
      'Content-Type': 'application/json'
    };
    if (secret) {
      headers['Authorization'] = `Bearer ${secret}`;
    }
    return fetch(api + path, {
      method,
      headers,
      body: body && JSON.stringify(body),
    })
  }
  /**
   * @docs https://clash.gitbook.io/doc/restful-api/common#获得当前的流量
   * @param {*} cb 
   */
  async *traffic() {
    const ws = connect(`${this.api}/traffic?token=${this.secret}`);
    const reader = await ws.getReader();
    for await (const line of parseJSONLines(reader)) {
      yield line;
    }
  }
  /**
   * @docs https://clash.gitbook.io/doc/restful-api/common#获得实时日志
   * @param {*} level 
   * @param {*} cb 
   */
  logs(level) {
    return this.request('get', `/logs?level=${level}`);
  }
  /**
   * @docs https://clash.gitbook.io/doc/restful-api/proxies#获取单个代理信息
   * @param {*} name 
   */
  async proxy(name) {
    const response = await this.request('get', `/proxies/${name}`);
    const proxy = await response.json();
    return proxy;
  }
  /**
   * @docs https://clash.gitbook.io/doc/restful-api/proxies#获取单个代理的延迟
   * @param {*} name 
   * @param {*} url 
   * @param {*} timeout 
   */
  async delay(name, url = 'http://www.gstatic.com/generate_204', timeout = 5000) {
    const response = await this.request('get', `/proxies/${name}/delay?url=${url}&timeout=${timeout}`);
    const data = await response.json();
    return data.delay || 0;
  }
  /**
   * @docs https://clash.gitbook.io/doc/restful-api/proxies#切换Selector中选中的代理
   * @param {*} selector 
   * @param {*} name 
   */
  async switch(selector, name) {
    const response = await this.request('put', `/proxies/${selector}`, { name })
    return response.status === 204;
  }
  /**
   * rules
   * @docs https://clash.gitbook.io/doc/restful-api/config#获取所有已经解析的规则
   */
  async getRules() {
    const response = await this.request('get', '/rules');
    const data = await response.json();
    return data.rules;
  }
  async getRuleProviders() {
    const response = await this.request('get', '/providers/rules');
    const data = await response.json();
    return Object.values(data.providers);
  }
  /**
   * @docs https://clash.gitbook.io/doc/restful-api/proxies#获取所有代理
   */
  async getProxies() {
    const response = await this.request('get', `/proxies`);
    const data = await response.json();
    return Object.entries(data.proxies).map(([name, proxy]) => {
      proxy.name = name;
      return proxy;
    });
  }
  async getProxyProviders() {
    const response = await this.request('get', `/providers/proxies`);
    const data = await response.json();
    return Object.values(data.providers);
  }
  async setConfig(conf) {
    const response = await this.request('PATCH', '/configs', conf);
    return response.status === 204;
  }
  /**
   * https://clash.gitbook.io/doc/restful-api/config#获得当前的基础设置
   */
  async getConfig() {
    const response = await this.request('get', '/configs');
    const configs = await response.json();
    return configs;
  }
  async getMode() {
    const conf = await this.getConfig();
    return conf.mode;
  }
  async setMode(mode) {
    const response = await this.request('PATCH', '/configs', { mode });
    return response.status === 204;
  }
  async config(conf) {
    if (conf) return this.setConfig(conf);
    return this.getConfig();
  }
  async mode(mode) {
    if (mode) return this.setMode(mode);
    return this.getMode();
  }
  async updateProxyProvider(name) {
    const response = await this.request('put', `/providers/proxies/${name}`);
    return response.status === 204;
  }
}