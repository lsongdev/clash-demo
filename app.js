import { h, render } from 'https://esm.sh/preact@10.27.1';
import { useEffect, useMemo, useState } from 'https://esm.sh/preact@10.27.1/hooks';
import htm from 'https://esm.sh/htm@3.1.1';
import { Clash } from './clash.js';

const html = htm.bind(h);
const tabs = ['overview', 'proxies', 'rules', 'connections', 'settings'];
const controllersKey = 'clash-demo:controllers';
const legacyControllerKey = 'clash-demo:controller';
const defaultController = { id: 'default', name: 'Default', api: 'https://clash.lsong.one', secret: '' };

const readControllers = () => {
  try {
    const saved = JSON.parse(localStorage.getItem(controllersKey) || 'null');
    if (saved?.items?.length) return saved;
    const legacy = JSON.parse(localStorage.getItem(legacyControllerKey) || 'null');
    if (legacy?.api) {
      return {
        activeId: 'default',
        items: [{ ...defaultController, ...legacy }],
      };
    }
  } catch {}
  return { activeId: defaultController.id, items: [defaultController] };
};

const bytes = value => {
  const n = Number(value) || 0;
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.min(Math.floor(Math.log(Math.max(n, 1)) / Math.log(1024)), units.length - 1);
  return `${(n / 1024 ** i).toFixed(i ? 1 : 0)} ${units[i]}`;
};
const rate = value => `${bytes(value)}/s`;
const ago = value => value ? new Date(value).toLocaleString() : '—';
const target = meta => meta?.host || meta?.destinationIP || meta?.remoteDestination || '—';
const expiry = value => {
  const n = Number(value) || 0;
  if (!n) return null;
  return new Date(n > 1e12 ? n : n * 1000).toLocaleString();
};
const subscription = info => {
  if (!info) return null;
  const upload = Number(info.Upload ?? info.upload) || 0;
  const download = Number(info.Download ?? info.download) || 0;
  const total = Number(info.Total ?? info.total) || 0;
  const expire = info.Expire ?? info.expire;
  const used = upload + download;
  const expiresAt = expiry(expire);
  if (!used && !total && !expiresAt) return null;
  return { used, total, remaining: Math.max(0, total - used), percent: total ? Math.min(100, used / total * 100) : 0, expire: expiresAt };
};
const chartPoints = (values, max) => {
  if (!values.length) return '';
  const ceiling = max || Math.max(...values, 1);
  const last = Math.max(values.length - 1, 1);
  return values.map((value, i) => `${(i / last) * 100},${30 - (Number(value) || 0) / ceiling * 28}`).join(' ');
};

function useRoute() {
  const read = () => {
    const route = location.hash.slice(1).split('/')[0];
    return tabs.includes(route) ? route : 'overview';
  };
  const [route, setRoute] = useState(read);
  useEffect(() => {
    const changed = () => setRoute(read());
    addEventListener('hashchange', changed);
    if (!location.hash) location.hash = '#overview';
    return () => removeEventListener('hashchange', changed);
  }, []);
  return route;
}

function useSocket(clash, path, initial) {
  const [data, setData] = useState(initial);
  const [online, setOnline] = useState(false);
  useEffect(() => {
    let close;
    let timer;
    let stopped = false;
    const connect = () => {
      close = clash.socket(path, value => {
        setOnline(true);
        setData(value);
      }, () => {
        setOnline(false);
        if (!stopped) timer = setTimeout(connect, 2000);
      });
    };
    connect();
    return () => {
      stopped = true;
      clearTimeout(timer);
      close?.();
    };
  }, [clash, path]);
  return [data, online];
}

const Notice = ({ error }) => error ? html`<p class="error">${error.message || String(error)}</p>` : null;
const Stat = ({ label, value, detail }) => html`
  <article class="stat"><small>${label}</small><strong>${value}</strong>${detail && html`<small>${detail}</small>`}</article>
`;
const Delay = ({ value }) => {
  if (!value) return html`<span class="delay muted">—</span>`;
  const level = value < 300 ? 'good' : value < 1000 ? 'warn' : 'bad';
  return html`<span class=${`delay ${level}`}>${value} ms</span>`;
};

function Chart({ title, value, series }) {
  const max = Math.max(1, ...series.flatMap(item => item.values));
  return html`
    <article class="chart">
      <header class="row"><strong>${title}</strong><span>${value}</span></header>
      <svg viewBox="0 0 100 32" preserveAspectRatio="none" aria-label=${title}>
        ${series.map(item => html`<polyline class=${item.className || ''} points=${chartPoints(item.values, max)} />`)}
      </svg>
      ${series.length > 1 && html`<div class="chart-legend">${series.map(item => html`<small class=${item.className || ''}>${item.name}</small>`)}</div>`}
    </article>
  `;
}

function Subscription({ info }) {
  const data = subscription(info);
  if (!data) return null;
  return html`
    <div class="subscription">
      ${data.total > 0 ? html`
        <progress max="100" value=${data.percent}></progress>
        <small>${data.percent.toFixed(1)}% · ${bytes(data.used)} used · ${bytes(data.remaining)} remaining · ${bytes(data.total)} total</small>
      ` : html`<small>${bytes(data.used)} used</small>`}
      ${data.expire && html`<small>Expires ${data.expire}</small>`}
    </div>
  `;
}

function Overview({ version, traffic, connections, history, online }) {
  return html`
    <section>
      <header class="section-head">
        <div><h2>Overview</h2><p>Mihomo ${version?.version || '—'} · ${online ? 'connected' : 'connecting…'}</p></div>
      </header>
      <div class="stats">
        <${Stat} label="Upload" value=${rate(traffic.up)} detail=${`Total ${bytes(traffic.upTotal ?? connections.uploadTotal)}`} />
        <${Stat} label="Download" value=${rate(traffic.down)} detail=${`Total ${bytes(traffic.downTotal ?? connections.downloadTotal)}`} />
        <${Stat} label="Memory" value=${bytes(connections.memory)} />
        <${Stat} label="Connections" value=${connections.connections?.length || 0} />
      </div>
      <div class="charts">
        <${Chart}
          title="Traffic"
          value=${`↑ ${rate(traffic.up)} · ↓ ${rate(traffic.down)}`}
          series=${[
            { name: 'Upload', className: 'upload', values: history.map(item => item.up) },
            { name: 'Download', className: 'download', values: history.map(item => item.down) },
          ]}
        />
        <${Chart} title="Memory" value=${bytes(connections.memory)}
          series=${[{ name: 'Memory', values: history.map(item => item.memory) }]} />
        <${Chart} title="Connections" value=${connections.connections?.length || 0}
          series=${[{ name: 'Connections', values: history.map(item => item.connections) }]} />
      </div>
      <p class="muted">Charts keep the latest 60 traffic samples in memory. The controller exposes memory but no stable CPU usage metric.</p>
    </section>
  `;
}

function Proxies({ clash }) {
  const [proxies, setProxies] = useState([]);
  const [proxyProviders, setProxyProviders] = useState([]);
  const [latency, setLatency] = useState({});
  const [busy, setBusy] = useState('');
  const [error, setError] = useState(null);

  const load = async () => {
    try {
      const [nextProxies, nextProxyProviders] = await Promise.all([
        clash.getProxies(), clash.getProxyProviders(),
      ]);
      setProxies(nextProxies);
      setProxyProviders(nextProxyProviders.filter(provider =>
        String(provider.vehicleType || '').toLowerCase() === 'http'
      ));
      setError(null);
    } catch (e) {
      setError(e);
    }
  };
  useEffect(() => { load(); }, [clash]);

  const groups = proxies
    .filter(proxy => Array.isArray(proxy.all))
    .sort((a, b) => a.name === 'GLOBAL' ? 1 : b.name === 'GLOBAL' ? -1 : 0);

  const test = async group => {
    setBusy(`group:${group.name}`);
    for (const name of group.all) {
      try {
        const value = await clash.delay(name);
        setLatency(current => ({ ...current, [name]: value }));
      } catch {
        setLatency(current => ({ ...current, [name]: 0 }));
      }
    }
    setBusy('');
  };
  const choose = async (group, name) => {
    if (group.type !== 'Selector') return;
    await clash.switchProxy(group.name, name);
    await load();
  };
  const action = async (key, fn) => {
    setBusy(key);
    try {
      await fn();
      setTimeout(load, 500);
    } finally {
      setBusy('');
    }
  };

  return html`
    <section>
      <header class="section-head">
        <div><h2>Proxies</h2><p>${groups.length} groups · ${proxyProviders.length} subscription providers</p></div>
        <button onClick=${load}>Refresh</button>
      </header>
      <${Notice} error=${error} />

      ${groups.map(group => html`
        <article>
          <header class="row">
            <div><h3>${group.name}</h3><small>${group.type} · selected: ${group.now || 'automatic'}</small></div>
            <button disabled=${busy === `group:${group.name}`} onClick=${() => test(group)}>
              ${busy === `group:${group.name}` ? 'Testing…' : 'Test all'}
            </button>
          </header>
          <div class="proxy-list">${group.all.map(name => {
            const proxy = proxies.find(item => item.name === name);
            const value = latency[name] ?? proxy?.history?.at(-1)?.delay;
            return html`
              <button class=${`proxy ${group.now === name ? 'selected' : ''}`}
                onClick=${() => choose(group, name)} title=${proxy?.type || ''}>
                <span>${name}</span><${Delay} value=${value} />
              </button>
            `;
          })}</div>
        </article>
      `)}

      <header class="section-head providers-head">
        <div><h2>Proxy Providers</h2><p>HTTP subscription providers only</p></div>
      </header>
      <div class="stack">${proxyProviders.map(provider => html`
        <article>
          <header class="row">
            <div class="grow">
              <strong>${provider.name}</strong>
              <div><small>${provider.proxies?.length || 0} proxies · updated ${ago(provider.updatedAt)}</small></div>
              <${Subscription} info=${provider.subscriptionInfo} />
            </div>
            <div class="actions">
              <button disabled=${busy === `provider:${provider.name}`}
                onClick=${() => action(`provider:${provider.name}`, () => clash.updateProxyProvider(provider.name))}>Refresh</button>
              <button disabled=${busy === `health:${provider.name}`}
                onClick=${() => action(`health:${provider.name}`, () => clash.healthcheckProxyProvider(provider.name))}>Test</button>
            </div>
          </header>
        </article>
      `)}</div>
    </section>
  `;
}

function Rules({ clash }) {
  const [rules, setRules] = useState([]);
  const [providers, setProviders] = useState([]);
  const [query, setQuery] = useState('');
  const [busy, setBusy] = useState('');
  const [error, setError] = useState(null);

  const load = async () => {
    try {
      const [nextRules, nextProviders] = await Promise.all([clash.getRules(), clash.getRuleProviders()]);
      setRules(nextRules);
      setProviders(nextProviders);
      setError(null);
    } catch (e) {
      setError(e);
    }
  };
  useEffect(() => { load(); }, [clash]);

  const filtered = useMemo(() => {
    const q = query.toLowerCase();
    return q ? rules.filter(rule => [rule.type, rule.payload, rule.proxy].some(value =>
      String(value || '').toLowerCase().includes(q))) : rules;
  }, [rules, query]);

  const toggle = async rule => {
    const disabled = !rule.extra?.disabled;
    await clash.setRuleDisabled(rule.index, disabled);
    setRules(current => current.map(item => item.index === rule.index
      ? { ...item, extra: { ...item.extra, disabled } } : item));
  };

  const refreshProvider = async provider => {
    setBusy(provider.name);
    try {
      await clash.updateRuleProvider(provider.name);
      setTimeout(load, 500);
    } finally {
      setBusy('');
    }
  };

  return html`
    <section>
      <header class="section-head">
        <div><h2>Rules</h2><p>${rules.length} parsed rules</p></div>
        <button onClick=${load}>Reload</button>
      </header>
      <${Notice} error=${error} />
      <input class="wide" value=${query} onInput=${e => setQuery(e.currentTarget.value)} placeholder="Filter rules…" />
      <div class="table-wrap"><table>
        <thead><tr><th>#</th><th>Type</th><th>Payload</th><th>Target</th><th>Hits</th><th class="actions-cell"></th></tr></thead>
        <tbody>${filtered.map(rule => html`
          <tr class=${rule.extra?.disabled ? 'disabled' : ''}>
            <td>${rule.index}</td><td>${rule.type}</td><td class="break">${rule.payload || '—'}</td>
            <td>${rule.proxy}</td><td>${rule.extra?.hitCount ?? '—'}</td>
            <td class="actions-cell"><button onClick=${() => toggle(rule)}>${rule.extra?.disabled ? 'Enable' : 'Disable'}</button></td>
          </tr>
        `)}</tbody>
      </table></div>

      <header class="section-head providers-head">
        <div><h2>Rule Providers</h2><p>${providers.length} rule sets</p></div>
      </header>
      <div class="stack">${providers.map(provider => html`
        <article>
          <header class="row">
            <div>
              <strong>${provider.name}</strong>
              <div><small>${provider.behavior || ''} · ${provider.ruleCount ?? '—'} rules</small></div>
              <small>updated ${ago(provider.updatedAt)}</small>
            </div>
            <button disabled=${busy === provider.name} onClick=${() => refreshProvider(provider)}>
              ${busy === provider.name ? 'Refreshing…' : 'Refresh'}
            </button>
          </header>
        </article>
      `)}</div>
    </section>
  `;
}

function Connections({ clash, snapshot }) {
  const [query, setQuery] = useState('');
  const list = useMemo(() => {
    const q = query.toLowerCase();
    const all = [...(snapshot.connections || [])].sort((a, b) => (b.download + b.upload) - (a.download + a.upload));
    if (!q) return all;
    return all.filter(connection => {
      const meta = connection.metadata || {};
      return [target(meta), meta.process, meta.sourceIP, meta.destinationIP, connection.rule,
        connection.rulePayload, ...(connection.chains || [])]
        .some(value => String(value || '').toLowerCase().includes(q));
    });
  }, [snapshot, query]);

  return html`
    <section>
      <header class="section-head">
        <div><h2>Connections</h2><p>${snapshot.connections?.length || 0} active · ↑ ${bytes(snapshot.uploadTotal)} · ↓ ${bytes(snapshot.downloadTotal)}</p></div>
        <button class="danger" disabled=${!snapshot.connections?.length} onClick=${() => clash.closeAllConnections()}>Kill all</button>
      </header>
      <input class="wide" value=${query} onInput=${e => setQuery(e.currentTarget.value)} placeholder="Filter host, process, rule, chain…" />
      <div class="stack">${list.map(connection => {
        const meta = connection.metadata || {};
        return html`
          <article class="connection">
            <header class="row">
              <div class="grow">
                <strong>${target(meta)}${meta.destinationPort ? `:${meta.destinationPort}` : ''}</strong>
                <div><small>${meta.process || meta.type || 'unknown'} · ${meta.network || ''} · ${connection.rule || '—'} ${connection.rulePayload || ''}</small></div>
                <div><small>${(connection.chains || []).join(' → ') || 'DIRECT'}</small></div>
              </div>
              <button class="danger" onClick=${() => clash.closeConnection(connection.id)}>Kill</button>
            </header>
            <small>↑ ${bytes(connection.upload)} · ↓ ${bytes(connection.download)} · since ${ago(connection.start)}</small>
          </article>
        `;
      })}</div>
    </section>
  `;
}

function Settings({ clash, config, setConfig, controllers, activeId, onSaveControllers }) {
  const [runtime, setRuntime] = useState({});
  const [items, setItems] = useState(controllers);
  const [selectedId, setSelectedId] = useState(activeId);
  const [saved, setSaved] = useState('');

  useEffect(() => {
    setRuntime({
      mode: config.mode || 'rule',
      mixedPort: config['mixed-port'] ?? '',
      ipv6: !!config.ipv6,
      allowLan: !!config['allow-lan'],
      tun: !!config.tun?.enable,
      logLevel: config['log-level'] || 'info',
    });
  }, [config]);

  useEffect(() => {
    setItems(controllers);
    setSelectedId(activeId);
  }, [controllers, activeId]);

  const field = (name, value) => setRuntime(current => ({ ...current, [name]: value }));

  const saveRuntime = async event => {
    event.preventDefault();
    const patch = {
      mode: runtime.mode,
      'mixed-port': Number(runtime.mixedPort) || 0,
      ipv6: runtime.ipv6,
      'allow-lan': runtime.allowLan,
      tun: { ...(config.tun || {}), enable: runtime.tun },
      'log-level': runtime.logLevel,
    };
    await clash.setConfig(patch);
    setConfig({ ...config, ...patch });
    setSaved('Runtime settings saved');
    setTimeout(() => setSaved(''), 1500);
  };

  const updateController = (id, key, value) => {
    setItems(current => current.map(item => item.id === id ? { ...item, [key]: value } : item));
  };

  const addController = () => {
    const id = crypto.randomUUID?.() || `controller-${Date.now()}`;
    setItems(current => [...current, { id, name: `Controller ${current.length + 1}`, api: '', secret: '' }]);
    setSelectedId(id);
  };

  const removeController = id => {
    if (items.length === 1) return;
    const next = items.filter(item => item.id !== id);
    setItems(next);
    if (selectedId === id) setSelectedId(next[0].id);
  };

  const saveControllers = event => {
    event.preventDefault();
    const cleaned = items
      .map(item => ({ ...item, name: item.name.trim() || 'Controller', api: item.api.trim().replace(/\/$/, '') }))
      .filter(item => item.api);
    if (!cleaned.length) return;
    const nextActive = cleaned.some(item => item.id === selectedId) ? selectedId : cleaned[0].id;
    onSaveControllers({ activeId: nextActive, items: cleaned });
  };

  return html`
    <section>
      <h2>Settings</h2>

      <article>
        <h3>Mihomo</h3>
        <form class="settings-form" onSubmit=${saveRuntime}>
          <label class="form-row"><span>Mode</span><select value=${runtime.mode} onChange=${e => field('mode', e.currentTarget.value)}>
            <option value="direct">direct</option><option value="rule">rule</option><option value="global">global</option>
          </select></label>
          <label class="form-row"><span>Mixed port</span><input type="number" value=${runtime.mixedPort} onInput=${e => field('mixedPort', e.currentTarget.value)} /></label>
          <label class="form-row"><span>IPv6</span><input type="checkbox" checked=${runtime.ipv6} onChange=${e => field('ipv6', e.currentTarget.checked)} /></label>
          <label class="form-row"><span>Allow LAN</span><input type="checkbox" checked=${runtime.allowLan} onChange=${e => field('allowLan', e.currentTarget.checked)} /></label>
          <label class="form-row"><span>TUN</span><input type="checkbox" checked=${runtime.tun} onChange=${e => field('tun', e.currentTarget.checked)} /></label>
          <label class="form-row"><span>Log level</span><select value=${runtime.logLevel} onChange=${e => field('logLevel', e.currentTarget.value)}>
            ${['silent', 'error', 'warning', 'info', 'debug'].map(level => html`<option value=${level}>${level}</option>`)}
          </select></label>
          <div class="form-actions"><button type="submit">Save</button><small>${saved}</small></div>
        </form>
      </article>

      <article>
        <header class="row"><div><h3>Controllers</h3><small>Saved only in this browser</small></div><button type="button" onClick=${addController}>Add backend</button></header>
        <form class="settings-form" onSubmit=${saveControllers}>
          <div class="controller-list">
            ${items.map(item => html`
              <fieldset class=${item.id === selectedId ? 'controller active-controller' : 'controller'}>
                <label class="controller-active"><input type="radio" name="active-controller" checked=${item.id === selectedId} onChange=${() => setSelectedId(item.id)} /> Active</label>
                <label class="form-row"><span>Name</span><input value=${item.name} onInput=${e => updateController(item.id, 'name', e.currentTarget.value)} /></label>
                <label class="form-row"><span>API endpoint</span><input value=${item.api} onInput=${e => updateController(item.id, 'api', e.currentTarget.value)} placeholder="http://127.0.0.1:9090" /></label>
                <label class="form-row"><span>Secret</span><input type="password" value=${item.secret} onInput=${e => updateController(item.id, 'secret', e.currentTarget.value)} autocomplete="off" /></label>
                <div class="form-actions"><button class="danger" type="button" disabled=${items.length === 1} onClick=${() => removeController(item.id)}>Remove</button></div>
              </fieldset>
            `)}
          </div>
          <div class="form-actions"><button type="submit">Save controllers</button></div>
        </form>
      </article>
    </section>
  `;
}

function App() {
  const route = useRoute();
  const [controllerStore, setControllerStore] = useState(readControllers);
  const activeController = controllerStore.items.find(item => item.id === controllerStore.activeId) || controllerStore.items[0];
  const clash = useMemo(() => new Clash(activeController), [activeController.api, activeController.secret]);
  const [config, setConfig] = useState({});
  const [version, setVersion] = useState(null);
  const [error, setError] = useState(null);
  const [history, setHistory] = useState([]);
  const [traffic, trafficOnline] = useSocket(clash, '/traffic', { up: 0, down: 0, upTotal: 0, downTotal: 0 });
  const [connections, connectionsOnline] = useSocket(clash, '/connections?interval=1000', {
    uploadTotal: 0, downloadTotal: 0, memory: 0, connections: [],
  });

  useEffect(() => {
    localStorage.setItem(controllersKey, JSON.stringify(controllerStore));
    localStorage.removeItem(legacyControllerKey);
  }, [controllerStore]);

  useEffect(() => {
    setHistory([]);
    Promise.all([clash.getConfig(), clash.getVersion()])
      .then(([nextConfig, nextVersion]) => {
        setConfig(nextConfig);
        setVersion(nextVersion);
        setError(null);
      })
      .catch(setError);
  }, [clash]);

  useEffect(() => {
    setHistory(current => [...current, {
      up: Number(traffic.up) || 0,
      down: Number(traffic.down) || 0,
      memory: Number(connections.memory) || 0,
      connections: connections.connections?.length || 0,
    }].slice(-60));
  }, [traffic]);

  const saveControllers = store => {
    setControllerStore(store);
    location.hash = '#overview';
  };

  const pages = {
    overview: html`<${Overview} version=${version} traffic=${traffic} connections=${connections} history=${history} online=${trafficOnline && connectionsOnline} />`,
    proxies: html`<${Proxies} clash=${clash} />`,
    rules: html`<${Rules} clash=${clash} />`,
    connections: html`<${Connections} clash=${clash} snapshot=${connections} />`,
    settings: html`<${Settings} clash=${clash} config=${config} setConfig=${setConfig}
      controllers=${controllerStore.items} activeId=${controllerStore.activeId} onSaveControllers=${saveControllers} />`,
  };

  return html`
    <div class="shell">
      <header class="topbar">
        <div class="brand-wrap">
          <a class="brand" href="#overview"><strong>Clash</strong></a>
          <small>${activeController.name}</small>
        </div>
        <nav class="tabs">${tabs.map(tab => html`<a class=${route === tab ? 'active' : ''} href=${`#${tab}`}>${tab}</a>`)}</nav>
      </header>
      <main><${Notice} error=${error} />${pages[route]}</main>
    </div>
  `;
}

render(html`<${App} />`, document.getElementById('app'));
