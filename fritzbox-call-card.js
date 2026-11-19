/* FRITZ!Box Call Card – current call and call list (answered, dialled, missed) from the FRITZ!Box call monitor integration.
   MIT License – see LICENSE */
const FCC_VERSION = '1.0.2';
const FCC_LANG = (h) => { const l = ((h && ((h.locale && h.locale.language) || h.language)) || 'en').slice(0, 2); return l === 'de' ? 'de' : 'en'; };
const FCC_I18N = {
  en: { title: 'Phone', unknown: 'Unknown number', today: 'today', yesterday: 'yesterday', ringing: 'Ringing', silent: ' · phones stay silent', dialing: 'Dialling', talking: 'On a call', loading: 'Loading calls …', missed: 'missed', called: 'called', notReached: 'called, not reached', answered: 'answered', empty: 'No calls recorded yet. The list fills up from the next call on.', newMissed: (n) => `${n} missed`, nothingMissed: 'nothing missed', quietOn: (to) => `🔕 Do not disturb · phones silent until ${to}:00`, quietOff: (f, t) => `🔔 Do not disturb daily ${f}:00–${t}:00` },
  de: { title: 'Telefon', unknown: 'Unbekannte Nummer', today: 'heute', yesterday: 'gestern', ringing: 'Es klingelt', silent: ' · Telefone bleiben stumm', dialing: 'Es wird gewählt', talking: 'Im Gespräch', loading: 'Anrufe werden geladen …', missed: 'verpasst', called: 'angerufen', notReached: 'angerufen, nicht erreicht', answered: 'angenommen', empty: 'Noch keine Anrufe aufgezeichnet. Die Liste füllt sich ab dem nächsten Anruf.', newMissed: (n) => `${n} verpasst`, nothingMissed: 'nichts verpasst', quietOn: (to) => `🔕 Klingelsperre aktiv · Telefone stumm bis ${to} Uhr`, quietOff: (f, t) => `🔔 Klingelsperre täglich ${f}–${t} Uhr` },
};
class FritzboxCallCard extends HTMLElement {
  static getStubConfig() { return { entity: '' }; }
  setConfig(c) { if (!c || !c.entity) throw new Error('entity (call monitor sensor) is required'); this._c = c; this._st = null; this._calls = null; if (!this.shadowRoot) this.attachShadow({ mode: 'open' }); }
  getCardSize() { return this._c.compact ? 3 : 6; }
  getGridOptions() { return { columns: 12, rows: 'auto' }; }
  connectedCallback() { this._tm = setInterval(() => { const s = this._hass && this._hass.states[this._c.entity]; const hh = new Date().getHours(); if ((s && s.state !== 'idle') || hh !== this._hh) { this._hh = hh; this._render(); } }, 1000); }
  disconnectedCallback() { clearInterval(this._tm); }

  set hass(h) {
    this._hass = h;
    const s = h.states[this._c.entity], sig = (s ? s.state + s.last_updated : '-') + FCC_LANG(h);
    if (sig !== this._st) { const was = this._st; this._st = sig; this._render(); if (!was || (s && s.state === 'idle')) this._load(true); }
    this._load();
  }

  async _load(force) {
    if (this._busy || (!force && Date.now() - (this._t || 0) < 600000) || !this._hass.callWS) return;
    this._busy = true;
    try {
      const c = this._c, now = new Date(), r = await this._hass.callWS({ type: 'history/history_during_period', start_time: new Date(now.getTime() - (c.days || 10) * 86400e3).toISOString(), end_time: now.toISOString(), entity_ids: [c.entity], minimal_response: false, no_attributes: false, significant_changes_only: false });
      const rows = (r && r[c.entity]) || [], nm = (v) => (v && !['unknown', 'Unknown', 'None', ''].includes(String(v)) ? String(v) : ''), calls = []; let cur = null;
      rows.forEach((x) => {
        const s = x.s != null ? x.s : x.state, a = x.a || x.attributes || {}, t = x.lu != null ? x.lu * 1000 : new Date(x.last_updated || x.last_changed).getTime();
        if (s === 'ringing') cur = { dir: 'in', num: nm(a.from), name: nm(a.from_name), t, ans: false };
        else if (s === 'dialing') cur = { dir: 'out', num: nm(a.to), name: nm(a.to_name), t, ans: false };
        else if (s === 'talking') { if (!cur) cur = { dir: 'in', num: nm(a.with), name: nm(a.with_name), t }; cur.ans = true; if (!cur.name) cur.name = nm(a.with_name); if (!cur.num) cur.num = nm(a.with); }
        else if (s === 'idle' && cur) { cur.dur = Number(a.duration) || 0; calls.push(cur); cur = null; }
      });
      this._calls = calls.reverse(); this._t = Date.now();
    } catch (e) { this._t = Date.now() - 540000; if (!this._calls) this._calls = []; }
    this._busy = false; this._render();
  }

  _key() { return 'fritzbox-call-card-seen-' + this._c.entity; }
  _seen() { try { return Number(localStorage.getItem(this._key()) || 0); } catch (e) { return 0; } }

  _render() {
    const h = this._hass, c = this._c; if (!h) return;
    const T = FCC_I18N[FCC_LANG(h)], loc = (h.locale && h.locale.language) || h.language || 'en';
    const s = h.states[c.entity], a = (s && s.attributes) || {};
    const esc = (t) => String(t == null ? '' : t).replace(/[&<>"]/g, (m) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[m]));
    const nm = (v) => (v && !['unknown', 'Unknown', 'None', ''].includes(String(v)) ? String(v) : '');
    const who = (name, num) => (name ? esc(name) : num ? esc(num) : T.unknown);
    const mmss = (sec) => `${Math.floor(sec / 60)}:${String(Math.floor(sec % 60)).padStart(2, '0')}`;
    const when = (t) => { const d = new Date(t), d0 = new Date(); d0.setHours(0, 0, 0, 0); const n = Math.round((new Date(d).setHours(0, 0, 0, 0) - d0.getTime()) / 86400e3), hm = d.toLocaleTimeString(loc, { hour: '2-digit', minute: '2-digit' }); return (n === 0 ? T.today : n === -1 ? T.yesterday : d.toLocaleDateString(loc, { weekday: 'short', day: 'numeric', month: 'numeric' })) + ' ' + hm; };
    let live = '';
    const qh = (v) => { const n = Number(v); return Number.isInteger(n) && n >= 0 && n <= 24 ? n : null; }, q = c.quiet && qh(c.quiet.from) != null && qh(c.quiet.to) != null ? { from: qh(c.quiet.from), to: qh(c.quiet.to) } : null, hr = new Date().getHours(), qon = !!q && (q.from > q.to ? hr >= q.from || hr < q.to : hr >= q.from && hr < q.to);
    if (s && !['idle', 'unavailable', 'unknown'].includes(s.state)) {
      const since = Math.max(0, (Date.now() - new Date(s.last_changed || s.last_updated).getTime()) / 1000);
      if (s.state === 'ringing') live = `<div class="lv ring"><span class="li">📞</span><div><b>${T.ringing}${qon ? T.silent : ''}</b><span>${who(nm(a.from_name), nm(a.from))}${nm(a.from_name) && nm(a.from) ? ' · ' + esc(a.from) : ''}</span></div><i>${mmss(since)}</i></div>`;
      else if (s.state === 'dialing') live = `<div class="lv dial"><span class="li">📱</span><div><b>${T.dialing}</b><span>${who(nm(a.to_name), nm(a.to))}</span></div><i>${mmss(since)}</i></div>`;
      else live = `<div class="lv talk"><span class="li">🗣️</span><div><b>${T.talking}</b><span>${who(nm(a.with_name), nm(a.with))}</span></div><i>${mmss(since)}</i></div>`;
    }
    const calls = this._calls, seen = this._seen(), missed = (calls || []).filter((x) => x.dir === 'in' && !x.ans), fresh = missed.filter((x) => x.t > seen);
    let body = `<div class="em">${T.loading}</div>`;
    if (calls) {
      const list = calls.slice(0, c.max || (c.compact ? 4 : 15));
      body = list.length ? list.map((x) => { const miss = x.dir === 'in' && !x.ans, cls = miss ? 'ms' : x.dir === 'out' ? 'ou' : 'in'; return `<div class="r ${cls}${miss && x.t > seen ? ' nw' : ''}"><span class="ic">${miss ? '✕' : x.dir === 'out' ? '↗' : '↙'}</span><div><div class="a">${who(x.name, x.num)}</div><div class="b">${miss ? T.missed : x.dir === 'out' ? (x.ans ? T.called : T.notReached) : T.answered}${x.name && x.num ? ' · ' + esc(x.num) : ''}</div></div><div class="w">${when(x.t)}${x.ans && x.dur ? `<small>${mmss(x.dur)} min</small>` : ''}</div></div>`; }).join('') : `<div class="em">${T.empty}</div>`;
    }
    const hd = fresh.length ? `<span class="pl no">${T.newMissed(fresh.length)}</span>` : calls && calls.length ? `<span class="pl ok">${T.nothingMissed}</span>` : '';
    this.shadowRoot.innerHTML = `<style>
ha-card{display:block;padding:14px;overflow:hidden}
.hd{display:flex;justify-content:space-between;align-items:center;gap:8px;margin-bottom:6px}.tt{font-size:20px}
.pl{font-size:12px;padding:3px 10px;border-radius:99px}.pl.no{background:rgba(229,57,53,.15);color:#c62828;cursor:pointer}.pl.ok{background:rgba(67,185,107,.16);color:#1e8a4c}
.lv{display:grid;grid-template-columns:34px 1fr auto;gap:10px;align-items:center;border-radius:14px;padding:12px;margin-bottom:8px;color:#fff}
.lv.ring{background:#d63b36;animation:rg 1s ease-in-out infinite}.lv.talk{background:#2e9b57}.lv.dial{background:#3d7fc4}
@keyframes rg{50%{background:#f0625d}}
.li{font-size:24px}.lv b{display:block;font-size:13px;font-weight:600;opacity:.9}.lv span{font-size:17px;font-weight:600}.lv i{font-style:normal;font-variant-numeric:tabular-nums;font-size:14px}
.r{display:grid;grid-template-columns:26px 1fr auto;gap:8px;align-items:center;padding:8px 0;border-top:1px solid var(--divider-color,#e3e3e3)}
.r:first-of-type{border-top:none}
.ic{width:24px;height:24px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:14px;font-weight:700}
.in .ic{background:rgba(67,185,107,.18);color:#1e8a4c}.ou .ic{background:rgba(61,127,196,.18);color:#1f6fb8}.ms .ic{background:rgba(229,57,53,.15);color:#c62828}
.a{font-size:14.5px;font-weight:600}.ms .a{color:#c62828}.nw .a::after{content:' •'}
.b{font-size:12px;color:var(--secondary-text-color,#666)}
.w{font-size:12.5px;text-align:right;white-space:nowrap}.w small{display:block;font-size:11.5px;color:var(--secondary-text-color,#666)}
.em{font-size:13.5px;color:var(--secondary-text-color,#666);padding:4px 0}
.qt{margin-top:8px;font-size:12.5px;color:var(--secondary-text-color,#666);border-radius:9px;padding:6px 10px;background:rgba(127,127,127,.10)}.qt.on{background:rgba(92,107,192,.16);color:#3f51b5;font-weight:600}
</style><ha-card><div class="hd"><div class="tt">${esc(c.title || T.title)}</div>${hd}</div>${live}${body}${q ? `<div class="qt${qon ? ' on' : ''}">${qon ? T.quietOn(q.to) : T.quietOff(q.from, q.to)}</div>` : ''}</ha-card>`;
    const mark = () => { try { localStorage.setItem(this._key(), String(Date.now())); } catch (e) { /* no storage */ } this._render(); };
    const p = this.shadowRoot.querySelector('.pl.no'); if (p) p.addEventListener('click', mark);
    this.shadowRoot.querySelectorAll('.r.nw').forEach((e) => e.addEventListener('click', mark));
  }
}
if (!customElements.get('fritzbox-call-card')) customElements.define('fritzbox-call-card', FritzboxCallCard);
window.customCards = window.customCards || [];
if (!window.customCards.some((c) => c.type === 'fritzbox-call-card')) window.customCards.push({ type: 'fritzbox-call-card', name: 'FRITZ!Box Call Card', description: 'Current call and call list from the FRITZ!Box call monitor' });
console.info(`%c FRITZBOX-CALL-CARD %c ${FCC_VERSION} `, 'color:#fff;background:#d63b36;font-weight:700', 'color:#d63b36;background:#fff');
