import { last } from 'https://lsong.org/scripts/array.js';
import { ready, cls } from 'https://lsong.org/scripts/dom.js';
import { h, render, useState, useEffect, Panel, List, ListItem } from 'https://lsong.org/scripts/react/index.js';
import { Clash } from './clash.js';

const clash = new Clash({
  api: 'https://clash.lsong.one',
  secret: 'clash@lsong.org'
});

const getProxiesFromRules = (rules, proxies) => {
  const system = new Set(["REJECT", "DIRECT"]);
  const proxyMap = proxies.reduce((map, proxy) => {
    map[proxy.name] = proxy;
    return map;
  }, {});

  const proxyNames = [...new Set(rules
    .map(rule => rule.proxy)
    .filter(x => !system.has(x))
  )];

  const buildProxy = (name) => {
    const p = proxyMap[name];
    p.proxies = p.all.map(n => proxyMap[n]).filter(Boolean);
    return p;
  };

  const proxyGroup = [];
  proxyNames.forEach(name => {
    const proxy = buildProxy(name);
    if (proxy) proxyGroup.push(proxy);
  });

  const processNestedProxies = (proxies) => {
    proxies.forEach(proxy => {
      proxy.proxies.forEach(p => {
        if (p.type === 'URLTest' && !proxyGroup.includes(p)) {
          proxyGroup.push(buildProxy(p.name));
        }
      });
    });
  };

  processNestedProxies(proxyGroup);
  return proxyGroup.filter((x, i, arr) => arr.findIndex(y => y.name === x.name) === i);
};

const delayColor = (delay) => {
  if (!delay) return 'grey';
  if (delay < 1000) return '#2ecc71';
  if (delay < 2000) return '#f1c40f';
  if (delay < 3000) return '#e67e22';
  return 'red';
};

const bit2Human = (bits) => {
  if (bits < 1024) return bits + 'b';
  if (bits < 1024 * 1024) return (bits / 1024).toFixed(1) + 'kb';
  return (bits / (1024 * 1024)).toFixed(1) + 'mb';
};

const App = () => {
  const [config, setConfig] = useState({});
  const [traffic, setTraffic] = useState({});
  const [rules, setRules] = useState([]);
  const [proxies, setProxies] = useState([]);
  const [ruleProviders, setRuleProviders] = useState([]);
  const [proxyProviders, setProxyProviders] = useState([]);
  const getTraffic = async () => {
    for await (const traffic of clash.traffic()) {
      setTraffic(traffic);
    }
  };
  const load = async () => {
    const config = await clash.config();
    const rules = await clash.getRules();
    const proxies = await clash.getProxies();
    const ruleProviders = await clash.getRuleProviders();
    setRules(rules);
    setConfig(config);
    setRuleProviders(ruleProviders);
    setProxyProviders(proxyProviders);
    setProxies(getProxiesFromRules(rules, proxies));
  };
  const testLatency = async proxy => {
    for (const name of proxy.all) {
      const latency = await clash.delay(name);
      console.log(name, latency);
    }
    load();
  };
  useEffect(() => {
    load();
    getTraffic();
    setInterval(load, 1000 * 30);
  }, []);
  return [
    h(Panel, { header: h('h2', null, "Clash") }, [
      h(List, {}, [
        h(ListItem, null, [
          "Traffic",
          h('div', null, [
            h('span', null, bit2Human(traffic.up) + 'ps'),
            h('span', null, " / "),
            h('span', null, bit2Human(traffic.down) + 'ps'),
          ]),
        ]),
        h(ListItem, null, [
          "Mode",
          h('div', { className: 'button-group' }, [
            h('button', { className: cls({ active: config.mode == 'direct' }), onClick: () => clash.setMode('direct') }, "direct"),
            h('button', { className: cls({ active: config.mode == 'rule' }), onClick: () => clash.setMode('rule') }, "rule"),
            h('button', { className: cls({ active: config.mode == 'global' }), onClick: () => clash.setMode('global') }, "global"),
          ]),
        ]),
      ]),
    ]),

    h(Panel, { header: h('h2', null, "Rules") },
      h(List, null, rules.map(rule => h(ListItem, null, [
        h('div', { className: 'flex-y' }, [
          h('span', null, rule.type),
          h('a', {}, rule.payload),
        ]),
        h('span', null, rule.proxy),
      ]))),
    ),
    h('h2', null, "Proxies"),
    proxies.map(proxy =>
      h(Panel, {
        title: proxy.name,
        header: h('button', { onClick: () => testLatency(proxy) }, "⚡️"),
      }, [
        h(List, {}, proxy.proxies.map(p =>
          h(ListItem, { className: cls({ 'active': proxy.now == p.name }) }, [
            h('div', { className: 'flex-y' }, [
              h('span', null, p.name),
              h('span', null, p.type),
            ]),
            h('span', {
              style: {
                color: delayColor(last(p.history)?.delay),
              },
            }, `${p.history[0]?.delay}ms`),
          ])
        )),
      ])
    ),
  ]
}

ready(() => {
  const app = document.getElementById('app');
  render(h(App), app);
});