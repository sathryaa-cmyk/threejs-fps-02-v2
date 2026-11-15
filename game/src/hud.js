// hud.js — DOM HUD: health/armor/ammo/money/timer/score/alive pips, crosshair with
// spread, minimap canvas, killfeed, radio callouts, buy menu, banners, start menu,
// damage-direction indicator and the bomb timer. No images — pure CSS/canvas.
import { WEAPONS, BUY_LIST, ARMOR_PRICE } from './weapons.js';
import { SITES, MAP } from './world.js';

export class HUD {
  constructor(root) {
    this.root = root;
    root.innerHTML = `
    <div id="crosshair"><i class="ch t"></i><i class="ch b"></i><i class="ch l"></i><i class="ch r"></i><b class="dot"></b></div>
    <div id="hitmark"></div>
    <div id="dmgdir"></div>
    <div id="vignette"></div>
    <div id="tophud">
      <div class="team atk"><span class="tname">HELIO</span><span id="scoreA">0</span><span id="aliveA" class="pips"></span></div>
      <div id="timer">1:40</div>
      <div class="team def"><span id="aliveB" class="pips"></span><span id="scoreB">0</span><span class="tname">DUST</span></div>
    </div>
    <div id="bombtimer" class="hidden">💣 <span id="bombt">40</span> — SITE <span id="bombsite">A</span></div>
    <div id="objective">Plant the charge at SITE A or SITE B — first to 8 rounds</div>
    <div id="minimap-wrap"><canvas id="minimap" width="170" height="128"></canvas><div id="mm-label">HELIOSTAT — SOLAR FARM</div></div>
    <div id="radio"></div>
    <div id="killfeed"></div>
    <div id="bottomhud">
      <div id="health"><div class="lbl">HEALTH</div><div class="bar"><i id="hpfill"></i></div><span id="hpnum">100</span></div>
      <div id="armor"><div class="lbl">ARMOR</div><div class="bar"><i id="arfill"></i></div><span id="arnum">0</span></div>
      <div id="moneybox"><div class="lbl">MONEY</div><span id="money">$800</span><div id="wname">P2000 Sidearm</div></div>
      <div id="ammo"><span id="ammomag">12</span><span id="ammores">/ 48</span><div class="lbl">AMMO — R reload · B buy · E plant/defuse</div></div>
    </div>
    <div id="banner" class="hidden"><div id="banner-title"></div><div id="banner-sub"></div></div>
    <div id="plantbar" class="hidden"><div class="lbl" id="plantlabel">PLANTING…</div><div class="bar"><i id="plantfill"></i></div></div>
    <div id="buymenu" class="hidden">
      <h2>BUY — HELIOSTAT ARMORY <span id="buymoney"></span></h2>
      <div id="buyitems"></div>
      <div class="buyfoot">Keys 1–5 buy weapon · 6 armor ($650) · B / Esc close — buy phase ends when the round starts</div>
    </div>
    <div id="startmenu">
      <div class="sm-inner">
        <div class="sm-kicker">MAKE.FUN · THREEJS-FPS-02</div>
        <h1>HELIOSTAT</h1>
        <div class="sm-sub">5v5 tactical FPS — desert solar farm at golden hour</div>
        <div class="sm-rules">
          <div><b>HELIO</b> (you, orange) attack — plant the charge at <b>SITE A</b> Inverter Station or <b>SITE B</b> Control Room.</div>
          <div><b>DUST</b> (teal) defend — defuse, or wipe the attackers. First to <b>8 rounds</b>.</div>
          <div>Win $3250 · Loss $1900 · Kill $300 · Plant $300 — spend it in the buy menu (<b>B</b>).</div>
        </div>
        <button id="playbtn">▶ DEPLOY — CLICK TO PLAY</button>
        <div class="sm-controls">WASD move · Shift walk (accurate) · Space jump · Ctrl crouch · Mouse aim · Click fire · R reload · E plant / defuse · B buy</div>
      </div>
    </div>`;
    this.el = {};
    for (const id of ['crosshair', 'hitmark', 'dmgdir', 'vignette', 'timer', 'scoreA', 'scoreB', 'aliveA', 'aliveB', 'bombtimer', 'bombt', 'bombsite', 'objective', 'radio', 'killfeed', 'hpfill', 'hpnum', 'arfill', 'arnum', 'money', 'wname', 'ammomag', 'ammores', 'banner', 'banner-title', 'banner-sub', 'plantbar', 'plantlabel', 'plantfill', 'buymenu', 'buyitems', 'buymoney', 'startmenu', 'playbtn']) {
      this.el[id] = root.querySelector('#' + id);
    }
    this.mm = root.querySelector('#minimap').getContext('2d');
    this.hitT = 0;
    this.el.playbtn.addEventListener('click', () => { if (this.onPlay) this.onPlay(); });
    this.buildBuyMenu();
  }
  buildBuyMenu() {
    const items = BUY_LIST.map((id, i) => {
      const w = WEAPONS[id];
      return `<div class="buyitem" data-w="${id}"><span class="bkey">${i + 1}</span><span class="bname">${w.name}</span><span class="bstat">${w.damage} dmg · ${w.mag} rnd · ${w.rpm} rpm</span><span class="bprice">$${w.price}</span></div>`;
    }).join('') + `<div class="buyitem" data-w="armor"><span class="bkey">6</span><span class="bname">Kevlar Armor</span><span class="bstat">absorbs 50% damage</span><span class="bprice">$${ARMOR_PRICE}</span></div>`;
    this.el.buyitems.innerHTML = items;
    this.el.buyitems.querySelectorAll('.buyitem').forEach(el => {
      el.addEventListener('click', () => { if (this.onBuy) this.onBuy(el.dataset.w); });
    });
  }
  showStart(show) { this.el.startmenu.style.display = show ? 'flex' : 'none'; }
  showBuy(show, money) {
    this.el.buymenu.classList.toggle('hidden', !show);
    if (show) this.el.buymoney.textContent = '$' + money;
  }
  setBuyAfford(money) {
    this.el.buyitems.querySelectorAll('.buyitem').forEach(el => {
      const id = el.dataset.w;
      const price = id === 'armor' ? ARMOR_PRICE : WEAPONS[id].price;
      el.classList.toggle('cant', price > money);
    });
    this.el.buymoney.textContent = '$' + money;
  }
  banner(title, sub, ms = 2600) {
    this.el['banner-title'].textContent = title;
    this.el['banner-sub'].textContent = sub || '';
    this.el.banner.classList.remove('hidden');
    clearTimeout(this._bt);
    this._bt = setTimeout(() => this.el.banner.classList.add('hidden'), ms);
  }
  radio(msg, team = 'atk') {
    const div = document.createElement('div');
    div.className = 'radio-line ' + team;
    div.textContent = msg;
    this.el.radio.prepend(div);
    while (this.el.radio.children.length > 5) this.el.radio.lastChild.remove();
    setTimeout(() => { if (div.parentNode) div.remove(); }, 9000);
  }
  killfeed(killer, victim, head) {
    const div = document.createElement('div');
    div.className = 'kf-line';
    div.innerHTML = `<span class="kf-k">${killer}</span> <span class="kf-w">${head ? '⌖' : '✕'}</span> <span class="kf-v">${victim}</span>`;
    this.el.killfeed.prepend(div);
    while (this.el.killfeed.children.length > 5) this.el.killfeed.lastChild.remove();
    setTimeout(() => { if (div.parentNode) div.remove(); }, 6000);
  }
  hitmarker(head) {
    this.el.hitmark.className = head ? 'show head' : 'show';
    this.hitT = 0.18;
  }
  damageFrom(angleDeg) {
    const d = this.el.dmgdir;
    d.style.setProperty('--rot', angleDeg + 'deg');
    d.classList.add('show');
    clearTimeout(this._dt);
    this._dt = setTimeout(() => d.classList.remove('show'), 500);
  }
  flashDamage() {
    this.el.vignette.classList.add('hurt');
    setTimeout(() => this.el.vignette.classList.remove('hurt'), 220);
  }
  setPlant(show, label, frac) {
    this.el.plantbar.classList.toggle('hidden', !show);
    if (show) { this.el.plantlabel.textContent = label; this.el.plantfill.style.width = (frac * 100).toFixed(0) + '%'; }
  }
  update(s) {
    this.el.hpnum.textContent = Math.max(0, Math.ceil(s.hp));
    this.el.hpfill.style.width = Math.max(0, s.hp) + '%';
    this.el.arnum.textContent = Math.ceil(s.armor);
    this.el.arfill.style.width = Math.min(100, s.armor) + '%';
    this.el.money.textContent = '$' + s.money;
    this.el.wname.textContent = s.weaponName;
    this.el.ammomag.textContent = s.mag;
    this.el.ammores.textContent = '/ ' + s.reserve;
    this.el.scoreA.textContent = s.scoreA;
    this.el.scoreB.textContent = s.scoreB;
    const pips = (n, cls) => Array.from({ length: 5 }, (_, i) => `<i class="${i < n ? 'on ' + cls : ''}"></i>`).join('');
    this.el.aliveA.innerHTML = pips(s.aliveA, 'atk');
    this.el.aliveB.innerHTML = pips(s.aliveB, 'def');
    const t = Math.max(0, Math.ceil(s.timeLeft));
    this.el.timer.textContent = Math.floor(t / 60) + ':' + String(t % 60).padStart(2, '0');
    this.el.timer.classList.toggle('urgent', t <= 15 && s.phase === 'round');
    this.el.bombtimer.classList.toggle('hidden', !s.bombPlanted);
    if (s.bombPlanted) { this.el.bombt.textContent = Math.ceil(s.bombTime); this.el.bombsite.textContent = s.bombSite; }
    this.el.crosshair.style.setProperty('--sp', (6 + s.spread * 900).toFixed(1) + 'px');
    this.el.crosshair.style.opacity = s.phase === 'round' || s.phase === 'buy' ? '1' : '0.4';
    this.el.objective.textContent = s.objective;
    if (this.hitT > 0) { this.hitT -= 1 / 60; if (this.hitT <= 0) this.el.hitmark.className = ''; }
  }
  drawMinimap(player, bots, bomb) {
    const c = this.mm, W = 170, H = 128;
    const sx = x => (x / MAP.w + 0.5) * W, sz = z => (z / MAP.h + 0.5) * H;
    c.clearRect(0, 0, W, H);
    c.fillStyle = 'rgba(30,20,8,0.72)'; c.fillRect(0, 0, W, H);
    c.fillStyle = '#c98f4e'; c.fillRect(sx(-48), sz(-36), W, H);
    // panel fields
    c.fillStyle = '#14263e';
    for (const [x, z] of [[-20, -16], [-20, 8], [20, -8], [20, 16]]) c.fillRect(sx(x - 13), sz(z - 2), 26 * W / MAP.w, 4 * H / MAP.h);
    // sites
    for (const key of ['A', 'B']) {
      const s = SITES[key];
      c.strokeStyle = key === 'A' ? '#ffb347' : '#19c2b8'; c.lineWidth = 1.5;
      c.beginPath(); c.arc(sx(s.cx), sz(s.cz), 7, 0, Math.PI * 2); c.stroke();
      c.fillStyle = '#fff'; c.font = 'bold 10px system-ui'; c.textAlign = 'center';
      c.fillText(key, sx(s.cx), sz(s.cz) + 3);
    }
    // bomb
    if (bomb) { c.fillStyle = '#ff3b30'; c.beginPath(); c.arc(sx(bomb.x), sz(bomb.z), 4, 0, Math.PI * 2); c.fill(); }
    // bots: allies orange, enemies teal (only show enemies when recently seen — here: always, arcade-style)
    const dot = (x, z, col, r = 3) => { c.fillStyle = col; c.beginPath(); c.arc(sx(x), sz(z), r, 0, Math.PI * 2); c.fill(); };
    for (const b of bots) if (b.alive) dot(b.pos.x, b.pos.z, b.team === 'atk' ? '#ff8c1a' : '#19c2b8', b.isPlayer ? 0 : 3);
    // player: white arrow with facing
    if (player) {
      const px = sx(player.pos.x), pz = sz(player.pos.z);
      c.save(); c.translate(px, pz); c.rotate(-player.yaw);
      c.fillStyle = '#fff'; c.beginPath(); c.moveTo(0, -6); c.lineTo(4.5, 5); c.lineTo(-4.5, 5); c.closePath(); c.fill();
      c.restore();
    }
  }
}
