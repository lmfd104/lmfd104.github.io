/* Rules browser — a static, offline-capable search over the catalogue the apps ship.
 *
 * Data shape (see tools/build_rules_data.py):
 *   manifest.json            { slug, label, system, kinds: { feat: {count, chunks}, ... } }
 *   <kind>.index.json        [ { i:id, n:name, l:level, t:[traits], s:sub, b:book, c:chunk } ]
 *   <kind>/<n>.json          [ { id, name, meta:{}, text, extra:{}, traits:[] } ]
 *
 * The index carries only what search and the list row need; descriptions live in the chunks and are
 * fetched when something is actually opened. That keeps the first paint of a 6,400-feat catalogue to
 * a few hundred KB instead of five megabytes.
 */
(function () {
  'use strict';

  var APP = document.body.dataset.app;
  var DATA = '../data/' + APP + '/';
  var PAGE = 120;              // rows rendered per batch; the rest stream in on scroll

  var manifest = null;
  var kind = null;
  var indexCache = {};         // kind -> index array
  var chunkCache = {};         // "kind/n" -> chunk array
  var filtered = [];
  var shown = 0;
  var activeTrait = null;
  var activeLevel = null;

  var el = {
    tabs: document.getElementById('tabs'),
    search: document.getElementById('search'),
    list: document.getElementById('list'),
    count: document.getElementById('count'),
    filters: document.getElementById('filters'),
    detail: document.getElementById('detail'),
    status: document.getElementById('status'),
  };

  // --------------------------------------------------------------------- utils

  function text(node, value) { node.textContent = value == null ? '' : String(value); return node; }

  function make(tag, cls, value) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (value != null) n.textContent = String(value);
    return n;
  }

  function getJSON(url) {
    return fetch(url).then(function (r) {
      if (!r.ok) throw new Error(url + ' -> ' + r.status);
      return r.json();
    });
  }

  var TITLE = { feat: 'Feats', spell: 'Spells', equipment: 'Equipment', ancestry: 'Ancestries',
    heritage: 'Heritages', class: 'Classes', background: 'Backgrounds', ritual: 'Rituals' };

  function levelLabel(kindName, level) {
    if (level == null) return '';
    if (kindName === 'spell' || kindName === 'ritual') return level === 0 ? 'Cantrip' : 'Rank ' + level;
    return 'Level ' + level;
  }

  // Titles differ per system but the shape does not; a heritage's "sub" is its owning ancestry id,
  // which reads better with the hyphens removed.
  function pretty(s) {
    return String(s || '').replace(/[-_]/g, ' ').replace(/\b\w/g, function (c) { return c.toUpperCase(); });
  }

  // --------------------------------------------------------------------- rendering

  function rowFor(entry) {
    var row = make('button', 'row');
    row.type = 'button';
    row.dataset.id = entry.i;

    var head = make('span', 'row-head');
    head.appendChild(make('span', 'row-name', entry.n));
    var lvl = levelLabel(kind, entry.l);
    if (lvl) head.appendChild(make('span', 'row-level', lvl));
    row.appendChild(head);

    var sub = [];
    if (entry.s) sub.push(pretty(entry.s));
    if (entry.t && entry.t.length) sub.push(entry.t.slice(0, 4).map(pretty).join(' · '));
    if (sub.length) row.appendChild(make('span', 'row-sub', sub.join('  —  ')));
    return row;
  }

  function renderMore() {
    var frag = document.createDocumentFragment();
    var upto = Math.min(shown + PAGE, filtered.length);
    for (var i = shown; i < upto; i++) frag.appendChild(rowFor(filtered[i]));
    shown = upto;
    // Drop the old sentinel before appending so it stays last.
    var old = el.list.querySelector('.sentinel');
    if (old) old.remove();
    el.list.appendChild(frag);
    if (shown < filtered.length) {
      var s = make('div', 'sentinel');
      el.list.appendChild(s);
      observer.observe(s);
    }
  }

  var observer = new IntersectionObserver(function (entries) {
    entries.forEach(function (e) {
      if (e.isIntersecting) { observer.unobserve(e.target); renderMore(); }
    });
  }, { rootMargin: '600px' });

  function applyFilter() {
    var q = el.search.value.trim().toLowerCase();
    var idx = indexCache[kind] || [];
    filtered = idx.filter(function (e) {
      if (activeLevel !== null && e.l !== activeLevel) return false;
      if (activeTrait && !(e.t || []).some(function (t) { return t === activeTrait; })) return false;
      if (!q) return true;
      if (e.n.toLowerCase().indexOf(q) !== -1) return true;
      return (e.t || []).some(function (t) { return t.indexOf(q) !== -1; });
    });

    el.list.innerHTML = '';
    shown = 0;
    text(el.count, filtered.length.toLocaleString() + ' of ' + idx.length.toLocaleString() + ' ' +
      (TITLE[kind] || kind).toLowerCase());
    if (!filtered.length) {
      el.list.appendChild(make('p', 'empty', 'Nothing matches that.'));
      return;
    }
    renderMore();
  }

  function renderFilters() {
    el.filters.innerHTML = '';
    var idx = indexCache[kind] || [];

    var levels = {};
    var traits = {};
    idx.forEach(function (e) {
      if (e.l != null) levels[e.l] = true;
      (e.t || []).forEach(function (t) { traits[t] = (traits[t] || 0) + 1; });
    });

    var levelKeys = Object.keys(levels).map(Number).sort(function (a, b) { return a - b; });
    if (levelKeys.length > 1) {
      var wrap = make('div', 'chips');
      wrap.appendChild(chip('Any level', activeLevel === null, function () {
        activeLevel = null; renderFilters(); applyFilter();
      }));
      levelKeys.forEach(function (l) {
        wrap.appendChild(chip(levelLabel(kind, l), activeLevel === l, function () {
          activeLevel = activeLevel === l ? null : l; renderFilters(); applyFilter();
        }));
      });
      el.filters.appendChild(wrap);
    }

    // Only the traits common enough to be a useful filter; a long tail of one-offs is noise.
    var top = Object.keys(traits)
      .sort(function (a, b) { return traits[b] - traits[a] || a.localeCompare(b); })
      .slice(0, 18);
    if (top.length) {
      var tw = make('div', 'chips');
      tw.appendChild(chip('All traits', !activeTrait, function () {
        activeTrait = null; renderFilters(); applyFilter();
      }));
      top.forEach(function (t) {
        tw.appendChild(chip(pretty(t), activeTrait === t, function () {
          activeTrait = activeTrait === t ? null : t; renderFilters(); applyFilter();
        }));
      });
      el.filters.appendChild(tw);
    }
  }

  function chip(label, on, onClick) {
    var b = make('button', 'chip' + (on ? ' on' : ''), label);
    b.type = 'button';
    b.addEventListener('click', onClick);
    return b;
  }

  // --------------------------------------------------------------------- detail

  function openEntry(id) {
    var entry = (indexCache[kind] || []).find(function (e) { return e.i === id; });
    if (!entry) return;
    var key = kind + '/' + entry.c;

    el.detail.classList.add('open');
    el.detail.innerHTML = '';
    el.detail.appendChild(make('p', 'muted', 'Loading…'));

    var load = chunkCache[key]
      ? Promise.resolve(chunkCache[key])
      : getJSON(DATA + kind + '/' + entry.c + '.json').then(function (c) {
          chunkCache[key] = c; return c;
        });

    load.then(function (chunk) {
      var rec = chunk.find(function (r) { return r.id === id; });
      if (!rec) throw new Error('missing ' + id);
      paintDetail(entry, rec);
      if (location.hash !== '#' + kind + '/' + id) {
        history.replaceState(null, '', '#' + kind + '/' + id);
      }
    }).catch(function (err) {
      el.detail.innerHTML = '';
      el.detail.appendChild(make('p', 'empty', 'Could not load that entry.'));
      console.error(err);
    });
  }

  function paintDetail(entry, rec) {
    el.detail.innerHTML = '';

    var close = make('button', 'detail-close', '✕');
    close.type = 'button';
    close.setAttribute('aria-label', 'Close');
    close.addEventListener('click', closeDetail);
    el.detail.appendChild(close);

    var head = make('div', 'detail-head');
    head.appendChild(make('h2', null, rec.name));
    var lvl = levelLabel(kind, entry.l);
    if (lvl) head.appendChild(make('span', 'row-level', lvl));
    el.detail.appendChild(head);

    if (rec.traits && rec.traits.length) {
      var tw = make('div', 'trait-row');
      rec.traits.forEach(function (t) { tw.appendChild(make('span', 'trait', pretty(t))); });
      el.detail.appendChild(tw);
    }

    var metaKeys = Object.keys(rec.meta || {});
    if (metaKeys.length) {
      var dl = make('dl', 'meta');
      metaKeys.forEach(function (k) {
        dl.appendChild(make('dt', null, k));
        dl.appendChild(make('dd', null, rec.meta[k]));
      });
      el.detail.appendChild(dl);
    }

    // textContent throughout: this is publisher prose from a seed file, never markup to execute.
    (rec.text || '').split(/\n{2,}/).forEach(function (para) {
      if (para.trim()) el.detail.appendChild(make('p', null, para.trim()));
    });

    Object.keys(rec.extra || {}).forEach(function (k) {
      el.detail.appendChild(make('h3', null, k));
      (rec.extra[k] || '').split(/\n{2,}/).forEach(function (para) {
        if (para.trim()) el.detail.appendChild(make('p', null, para.trim()));
      });
    });

    if (entry.b) el.detail.appendChild(make('p', 'source', entry.b));
    el.detail.scrollTop = 0;
  }

  function closeDetail() {
    el.detail.classList.remove('open');
    el.detail.innerHTML = '';
    history.replaceState(null, '', '#' + kind);
  }

  // --------------------------------------------------------------------- kinds

  function selectKind(next, skipHash) {
    kind = next;
    activeTrait = null;
    activeLevel = null;
    el.search.value = '';
    el.search.placeholder = 'Search ' + (TITLE[kind] || kind).toLowerCase() + '…';

    Array.prototype.forEach.call(el.tabs.children, function (b) {
      b.classList.toggle('on', b.dataset.kind === kind);
    });
    if (!skipHash) history.replaceState(null, '', '#' + kind);

    if (indexCache[kind]) { renderFilters(); applyFilter(); return; }

    el.list.innerHTML = '';
    el.list.appendChild(make('p', 'muted', 'Loading ' + (TITLE[kind] || kind).toLowerCase() + '…'));
    getJSON(DATA + kind + '.index.json').then(function (idx) {
      indexCache[kind] = idx;
      if (kind !== next) return;      // the reader switched tabs while this was in flight
      renderFilters();
      applyFilter();
    }).catch(function (err) {
      el.list.innerHTML = '';
      el.list.appendChild(make('p', 'empty', 'Could not load that list.'));
      console.error(err);
    });
  }

  // --------------------------------------------------------------------- boot

  el.list.addEventListener('click', function (e) {
    var row = e.target.closest('.row');
    if (row) openEntry(row.dataset.id);
  });

  el.search.addEventListener('input', applyFilter);

  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && el.detail.classList.contains('open')) closeDetail();
    if (e.key === '/' && document.activeElement !== el.search) {
      e.preventDefault();
      el.search.focus();
    }
  });

  getJSON(DATA + 'manifest.json').then(function (m) {
    manifest = m;
    var kinds = Object.keys(m.kinds);
    if (!kinds.length) throw new Error('empty manifest');

    kinds.forEach(function (k) {
      var b = make('button', 'tab');
      b.type = 'button';
      b.dataset.kind = k;
      b.appendChild(make('span', null, TITLE[k] || k));
      b.appendChild(make('span', 'tab-count', m.kinds[k].count.toLocaleString()));
      b.addEventListener('click', function () { selectKind(k); });
      el.tabs.appendChild(b);
    });

    // Deep link: #feat/adhere opens that entry directly.
    var parts = (location.hash || '').replace(/^#/, '').split('/');
    var startKind = kinds.indexOf(parts[0]) !== -1 ? parts[0] : kinds[0];
    selectKind(startKind, true);
    if (parts[1]) {
      var wait = setInterval(function () {
        if (!indexCache[startKind]) return;
        clearInterval(wait);
        openEntry(parts[1]);
      }, 60);
      setTimeout(function () { clearInterval(wait); }, 8000);
    }
    if (el.status) el.status.remove();
  }).catch(function (err) {
    if (el.status) text(el.status, 'The rules data failed to load.');
    console.error(err);
  });
})();
