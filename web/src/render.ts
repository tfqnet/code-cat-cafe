// Draws the café: isometric floor, walls, furniture, the lounge and the cats.
// Everything is flat-coloured canvas shapes, so there are no image assets.

import { allCats, cats, DESKS, PLAY, TREE, type Cat, type Desk, type Role, type Stage } from './world';
import type { Director } from './director';

export const W = 420, H = 320;
const TW = 40, TH = 20, OX = 170, OY = 100;
type P = [number, number];
const g2s = (x: number, y: number): P => [OX + ((x - y) * TW) / 2, OY + ((x + y) * TH) / 2];
const up = (p: P, h: number): P => [p[0], p[1] - h];

export const STAGE_COLOR: Record<Stage, string> = {
  order: '#F2B866', plan: '#7E8C99', design: '#F28B7D', code: '#5FC27E', bug: '#E5534B', done: '#F5C842',
};

// Pixel cat template in "cat units": [x, y, w, h, colour key]
const CAT: [number, number, number, number, string][] = [
  [3, 1, 2, 1, 'f'], [2, 2, 4, 1, 'f'], [2, 3, 5, 1, 'f'], [15, 1, 2, 1, 'f'], [14, 2, 4, 1, 'f'], [13, 3, 5, 1, 'f'],
  [3, 2, 2, 1, 'p'], [15, 2, 2, 1, 'p'], [4, 3, 12, 1, 'f'], [2, 4, 16, 1, 'f'], [1, 5, 18, 6, 'f'], [2, 11, 16, 1, 'f'],
  [4, 12, 12, 1, 'f'], [4, 13, 12, 1, 'f'], [3, 14, 14, 6, 'f'], [4, 20, 12, 1, 'f'], [7, 15, 6, 4, 'b'], [5, 20, 3, 1, 'b'],
  [12, 20, 3, 1, 'b'], [17, 18, 3, 2, 't'], [19, 15, 2, 3, 't'], [18, 13, 2, 2, 't'], [3, 9, 2, 1, 'p'], [15, 9, 2, 1, 'p'],
  [9, 9, 2, 1, 'n'], [8, 10, 1, 1, 'm'], [11, 10, 1, 1, 'm'],
];

export class Renderer {
  private ctx: CanvasRenderingContext2D;
  private font: string;
  T = 0;

  constructor(private canvas: HTMLCanvasElement, private dir: Director) {
    const dpr = window.devicePixelRatio || 1;
    canvas.width = W * dpr; canvas.height = H * dpr;
    this.ctx = canvas.getContext('2d')!;
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.ctx.imageSmoothingEnabled = false;
    this.font = getComputedStyle(document.body).fontFamily || 'sans-serif';
  }

  // ---- primitives ---------------------------------------------------------------
  private poly(pts: P[], c: string) {
    const x = this.ctx; x.fillStyle = c; x.beginPath(); x.moveTo(pts[0][0], pts[0][1]);
    for (let i = 1; i < pts.length; i++) x.lineTo(pts[i][0], pts[i][1]);
    x.closePath(); x.fill();
  }
  private rr(x: number, y: number, w: number, h: number, r: number, c: string) {
    const k = this.ctx; k.fillStyle = c; k.beginPath();
    if (k.roundRect) k.roundRect(x, y, w, h, r); else k.rect(x, y, w, h);
    k.fill();
  }
  private ell(x: number, y: number, rx: number, ry: number, c: string) {
    const k = this.ctx; k.fillStyle = c; k.beginPath(); k.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2); k.fill();
  }
  private box(cx: number, cy: number, w: number, d: number, h: number, z: number, top: string, l: string, r: string) {
    const x0 = cx - w / 2, x1 = cx + w / 2, y0 = cy - d / 2, y1 = cy + d / 2;
    const G = (x: number, y: number, hh: number) => up(g2s(x, y), z + hh);
    this.poly([G(x0, y1, 0), G(x1, y1, 0), G(x1, y1, h), G(x0, y1, h)], l);
    this.poly([G(x1, y0, 0), G(x1, y1, 0), G(x1, y1, h), G(x1, y0, h)], r);
    this.poly([G(x0, y0, h), G(x1, y0, h), G(x1, y1, h), G(x0, y1, h)], top);
  }
  private wallRect(y0: number, y1: number, h0: number, h1: number, c: string) {
    this.poly([up(g2s(0, y0), h0), up(g2s(0, y1), h0), up(g2s(0, y1), h1), up(g2s(0, y0), h1)], c);
  }
  private pill(t: string, x: number, y: number) {
    const k = this.ctx; k.font = `400 11px ${this.font}`;
    const tw = k.measureText(t).width;
    this.rr(x - tw / 2 - 5, y - 8, tw + 10, 15, 7, 'rgba(90,55,35,0.82)');
    k.fillStyle = '#F6E7CF'; k.textAlign = 'center'; k.textBaseline = 'middle'; k.fillText(t, x, y);
  }
  private paper(x: number, y: number, stage: Stage, lines = false) {
    this.rr(x, y, 10, 12, 2, '#FFFDF5');
    this.ctx.fillStyle = STAGE_COLOR[stage]; this.ctx.fillRect(x, y, 10, 3);
    if (lines) { this.ctx.fillStyle = '#C9B9A6'; this.ctx.fillRect(x + 2, y + 5, 6, 1); this.ctx.fillRect(x + 2, y + 8, 5, 1); }
  }

  // ---- room -------------------------------------------------------------------------
  private room() {
    for (let i = 0; i < 12; i++) for (let j = 0; j < 8; j++) {
      const lounge = i >= 7;
      this.poly([g2s(i, j), g2s(i + 1, j), g2s(i + 1, j + 1), g2s(i, j + 1)],
        lounge ? ((i + j) % 2 ? '#B9D3C3' : '#C4DBCC') : ((i + j) % 2 ? '#E2BF94' : '#EACDA6'));
    }
    const A = g2s(0, 0), L = g2s(0, 8), M = g2s(7, 0), R = g2s(12, 0);
    this.poly([L, A, up(A, 80), up(L, 80)], '#F5E4C8');
    this.poly([A, M, up(M, 80), up(A, 80)], '#EDD6B4');
    this.poly([M, R, up(R, 80), up(M, 80)], '#DCE7DE');
    this.poly([L, A, up(A, 8), up(L, 8)], '#C99A6B');
    this.poly([A, M, up(M, 8), up(A, 8)], '#B88758');
    this.poly([M, R, up(R, 8), up(M, 8)], '#9DB8A6');

    // Order board on the left wall: to do / doing / done columns as little cards.
    this.wallRect(2.8, 5.6, 24, 68, '#7A5038');
    this.wallRect(2.95, 5.45, 27, 65, '#3E5C4A');
    const cols = this.boardColumns();
    ([[cols.todo, 3.05, 3.75, '#FFFDF5'], [cols.doing, 3.85, 4.55, ''], [cols.done, 4.65, 5.35, '#86D9A2']] as const)
      .forEach(([count, y0, y1, colour]) => {
        this.wallRect(y0, y1, 61, 62, '#C9D6CC');
        for (let i = 0; i < Math.min(count, 4); i++) {
          const h1 = 57 - i * 8;
          const c = colour || (this.dir.ticket ? STAGE_COLOR[this.dir.ticket.stage] : '#F2B866');
          this.wallRect(y0 + 0.05, y1 - 0.05, h1 - 5, h1, c);
        }
      });

    // Window in the work area, fish picture and plant in the lounge.
    this.poly([up(g2s(3.4, 0), 22), up(g2s(5.0, 0), 22), up(g2s(5.0, 0), 64), up(g2s(3.4, 0), 64)], '#7A5038');
    this.poly([up(g2s(3.6, 0), 26), up(g2s(4.8, 0), 26), up(g2s(4.8, 0), 60), up(g2s(3.6, 0), 60)], '#C7E7F5');
    this.poly([up(g2s(8.4, 0), 30), up(g2s(9.2, 0), 30), up(g2s(9.2, 0), 62), up(g2s(8.4, 0), 62)], '#9DB8A6');
    this.poly([up(g2s(8.5, 0), 33), up(g2s(9.1, 0), 33), up(g2s(9.1, 0), 59), up(g2s(8.5, 0), 59)], '#F6E7CF');
    const fp = up(g2s(8.8, 0), 46);
    this.ell(fp[0], fp[1] + 2, 5, 4, '#E86A8E'); this.ell(fp[0] - 4, fp[1] - 1, 2, 2, '#E86A8E'); this.ell(fp[0] + 4, fp[1] - 1, 2, 2, '#E86A8E');
    const pl = g2s(11.5, 0.5);
    this.rr(pl[0] - 6, pl[1] - 12, 12, 12, 3, '#C97B5A');
    this.ell(pl[0], pl[1] - 18, 9, 9, '#5FA36B'); this.ell(pl[0] - 6, pl[1] - 24, 6, 6, '#5FA36B'); this.ell(pl[0] + 6, pl[1] - 25, 6, 6, '#5FA36B');
    const rg = g2s(10.2, 5.0);
    this.ell(rg[0], rg[1], 48, 22, '#E9D7EF'); this.ell(rg[0], rg[1], 38, 16, '#DCC5E6');

    const k = this.ctx;
    this.rr(10, 10, 116, 24, 8, '#6B4430');
    k.fillStyle = '#F6E7CF'; k.font = `500 13px ${this.font}`; k.textAlign = 'center'; k.textBaseline = 'middle';
    k.fillText('code cat café', 68, 22.5);
  }

  private boardColumns() {
    const d = this.dir;
    if (d.todos.length) {
      return {
        todo: d.todos.filter((t) => t.status === 'pending').length,
        doing: d.todos.filter((t) => t.status === 'in_progress').length,
        done: d.todos.filter((t) => t.status === 'completed').length,
      };
    }
    return { todo: 0, doing: d.orders.filter((o) => o.state === 'doing').length, done: d.orders.filter((o) => o.state === 'done').length };
  }

  // ---- furniture -------------------------------------------------------------------
  private bell(x: number, y: number) {
    const k = this.ctx, ringing = !!this.dir.waiting, T = this.T;
    const w = ringing ? Math.sin(T * 22) * 0.35 : 0;
    k.save(); k.translate(x, y);
    this.rr(-7, -2, 14, 3, 1, '#B07E2A');
    k.rotate(w);
    k.fillStyle = '#E8B04A'; k.beginPath(); k.moveTo(-6, -2); k.quadraticCurveTo(-6, -11, 0, -11); k.quadraticCurveTo(6, -11, 6, -2); k.closePath(); k.fill();
    this.ell(0, -12, 1.6, 1.6, '#B07E2A'); this.ell(-2, -8, 1, 2, '#F6D58A');
    k.restore();
    if (ringing && Math.floor(T * 4) % 2) {
      k.strokeStyle = '#E0A030'; k.lineWidth = 1.5;
      k.beginPath(); k.arc(x, y - 7, 11, -2.4, -1.6); k.stroke();
      k.beginPath(); k.arc(x, y - 7, 11, -1.5, -0.7); k.stroke();
    }
  }

  private desk(d: Desk) {
    const k = this.ctx, T = this.T;
    this.box(d.cx, d.cy, d.w, d.d, d.h, 0, d.top || '#D9AE80', d.l || '#B88758', d.r || '#A57650');
    const c = up(g2s(d.cx, d.cy), d.h), cx = Math.round(c[0]), cy = Math.round(c[1]);
    const busy = cats[d.role].working;
    if (d.key === 'counter') {
      this.rr(cx + 24, cy - 12, 14, 16, 3, '#6E7C86'); this.rr(cx + 27, cy - 8, 8, 4, 2, '#3F4750');
      this.bell(cx - 14, cy + 2);
    } else if (d.key === 'planner') {
      this.rr(cx - 7, cy - 6, 14, 10, 2, '#FFFDF5');
      k.fillStyle = '#A9AFB6';
      const n = busy ? 1 + (Math.floor(T * 2) % 3) : 3;
      for (let i = 0; i < n; i++) k.fillRect(cx - 5, cy - 4 + i * 3, 10 - (i === 2 ? 3 : 0), 1);
      k.fillStyle = '#F2B866'; k.fillRect(cx + 8, cy - 8, 2, 10);
    } else if (d.key === 'designer') {
      k.fillStyle = '#6B4430'; k.fillRect(cx - 6, cy - 6, 2, 8); k.fillRect(cx + 4, cy - 6, 2, 8);
      this.rr(cx - 8, cy - 22, 16, 16, 2, '#FFFDF5');
      this.rr(cx - 6, cy - 20, 6, 5, 2, '#F28B7D'); this.rr(cx, cy - 16, 6, 6, 3, '#7FBFEF');
      if (busy && Math.floor(T * 2) % 2) this.rr(cx - 5, cy - 12, 5, 4, 2, '#F5D467');
    } else if (d.key === 'developer') {
      this.rr(cx - 10, cy - 2, 20, 4, 1, '#B5BBC2'); this.rr(cx - 9, cy - 15, 18, 13, 2, '#3F4750');
      const shift = busy ? Math.floor(T * 6) % 4 : 0;
      k.fillStyle = '#86D9A2';
      for (let i = 0; i < 3; i++) k.fillRect(cx - 7, cy - 13 + i * 3, [10, 14, 7, 12][(i + shift) % 4], 1.5);
    } else if (d.key === 'tester') {
      this.rr(cx - 2, cy - 7, 8, 8, 2, '#FFFDF5'); k.fillStyle = '#7A5038'; k.fillRect(cx - 1, cy - 6, 6, 2);
      const bob = busy ? Math.sin(T * 5) * 3 : 0;
      k.strokeStyle = '#3F4750'; k.lineWidth = 2;
      k.beginPath(); k.arc(cx - 8 + bob, cy - 10, 4, 0, Math.PI * 2); k.stroke();
      k.beginPath(); k.moveTo(cx - 5 + bob, cy - 7); k.lineTo(cx - 2 + bob, cy - 4); k.stroke();
    }
    const t = this.dir.ticket;
    if (t && t.holder === d.key) this.paper(d.key === 'counter' ? cx - 34 : cx - 20, cy - 8, t.stage);
  }

  private tree() {
    const T = this.T;
    this.box(TREE.x, TREE.y, 1.2, 1.2, 5, 0, '#D8C3A5', '#B89F7E', '#A88F6E');
    this.box(TREE.x, TREE.y, 0.3, 0.3, 46, 5, '#E3CFAE', '#C9AF86', '#B89F7E');
    const p = g2s(TREE.x, TREE.y);
    this.ctx.fillStyle = '#A88F6E';
    for (let i = 0; i < 6; i++) this.ctx.fillRect(p[0] - 6, p[1] - 12 - i * 6, 6, 1);
    this.box(TREE.x + 0.35, TREE.y - 0.15, 0.9, 0.7, 4, 24, '#9C88C9', '#7E6AAB', '#6E5A9B');
    const q = up(g2s(TREE.x + 0.7, TREE.y - 0.1), 24), sway = Math.sin(T * 3) * 3;
    this.ctx.strokeStyle = '#6E5A9B'; this.ctx.lineWidth = 1;
    this.ctx.beginPath(); this.ctx.moveTo(q[0], q[1]); this.ctx.lineTo(q[0] + sway, q[1] + 14); this.ctx.stroke();
    this.ell(q[0] + sway, q[1] + 16, 3, 3, '#F28B7D');
    this.box(TREE.x, TREE.y, 1.1, 1.1, 5, 46, '#9C88C9', '#7E6AAB', '#6E5A9B');
  }
  private bed() { const p = g2s(11, 6.3); this.ell(p[0], p[1], 17, 8, '#D97A66'); this.ell(p[0], p[1] - 2, 12, 5, '#F6C9B8'); }
  private bowls() {
    const a = g2s(8.3, 7.2), b = g2s(8.9, 7.5);
    this.ell(a[0], a[1], 7, 3.5, '#5AA9E6'); this.ell(a[0], a[1] - 1, 4.5, 2, '#C7E7F5');
    this.ell(b[0], b[1], 7, 3.5, '#E86A5A'); this.ell(b[0], b[1] - 1, 4.5, 2, '#B5763F');
  }
  private ball() {
    const playing = PLAY[3].occ && cats[PLAY[3].occ].act;
    const p = g2s(9.85 + (playing ? Math.sin(this.T * 7) * 0.35 : 0), 4.85);
    this.ell(p[0], p[1] - 4, 4.5, 4.5, '#E86A8E');
    this.ctx.strokeStyle = '#F6C9D6'; this.ctx.lineWidth = 1;
    this.ctx.beginPath(); this.ctx.arc(p[0], p[1] - 4, 2.5, 0.5, 2.5); this.ctx.stroke();
  }
  private divider(y: number) { this.box(7, y + 0.5, 0.2, 1, 26, 0, '#C99A6B', '#E8D2B2', '#D9BE98'); }

  // ---- cats ----------------------------------------------------------------------------
  private catPos(c: Cat): [number, number, boolean] {
    if (c.act?.spot.n === 'tree') { const p = g2s(TREE.x, TREE.y); return [p[0], p[1] - 51 - Math.abs(Math.sin(this.T * 6)) * 3, false]; }
    const p = g2s(c.x, c.y); return [p[0], p[1], true];
  }

  private cat(c: Cat) {
    const k = this.ctx, T = this.T, [px, py, ground] = this.catPos(c);
    const ringing = c.role === 'lead' && !!this.dir.waiting;
    let bob = 0;
    if (c.walking) bob = Math.abs(Math.sin(T * 13)) * 2.5;
    else if (c.working || c.pulseT > 0) bob = Math.abs(Math.sin(T * 7));
    else if (c.act?.spot.n === 'bowl') bob = Math.abs(Math.sin(T * 9)) * 1.5;
    else if (c.act?.spot.n === 'ball') bob = Math.abs(Math.sin(T * 11)) * 2;
    else if (ringing) bob = Math.abs(Math.sin(T * 10)) * 2;
    const s = 1.5, ox = Math.round(px), oy = Math.round(py - bob);

    if (ringing) {
      k.strokeStyle = `rgba(224,160,48,${0.5 + 0.4 * Math.sin(T * 6)})`; k.lineWidth = 2;
      k.beginPath(); k.ellipse(px, py, 16 + Math.sin(T * 6) * 2, 7, 0, 0, Math.PI * 2); k.stroke();
    }
    if (ground) this.ell(px, py, 11, 4, 'rgba(70,40,20,0.18)');

    k.save(); k.translate(ox, oy); if (c.flip) k.scale(-1, 1);
    const R = (x: number, y: number, w: number, h: number, col: string) => {
      const a = Math.round((x - 10) * s), b = Math.round((y - 21) * s), e = Math.round((x + w - 10) * s), f = Math.round((y + h - 21) * s);
      k.fillStyle = col; k.fillRect(a, b, e - a, f - b);
    };
    const pal: Record<string, string> = { f: c.fur, b: c.belly, t: c.tail, p: '#F2A5B5', n: '#E8798F', m: '#3A2A20' };
    for (const r of CAT) R(r[0], r[1], r[2], r[3], pal[r[4]]);
    for (const r of c.marks) R(r[0], r[1], r[2], r[3], r[4]);
    const napping = c.act?.spot.n === 'bed';
    if (napping || (T + c.blinkOffset) % 4 < 0.13) { R(5, 8, 2, 1, c.eye); R(13, 8, 2, 1, c.eye); }
    else { R(5, 7, 2, 2, c.eye); R(5, 7, 1, 1, '#FFFFFF'); R(13, 7, 2, 2, c.eye); R(13, 7, 1, 1, '#FFFFFF'); }
    if (c.role === 'lead') { R(5, -3, 10, 4, '#FFFFFF'); R(3, 0, 14, 2, '#FFFFFF'); }
    k.restore();

    const t = this.dir.ticket;
    if (t && t.holder === `cat:${c.role}`) this.paper(ox - 5, oy - 17, t.stage, true);
  }

  private bubble(c: Cat) {
    const k = this.ctx, T = this.T, [px, py] = this.catPos(c), x = Math.round(px), y = Math.round(py - 38);
    let text = c.bubble;
    if (!text && c.act?.spot.n === 'bed') text = Math.floor(T * 2) % 2 ? 'z z' : 'z';
    if (!text && (c.working || c.pulseT > 0) && c.thoughtT > 0) text = c.thought;
    if (text) {
      k.font = `500 11px ${this.font}`;
      const warn = text === 'need you!' || text === 'your turn!';
      const bg = warn ? '#FFF1D6' : '#FFFFFF';
      const tw = k.measureText(text).width;
      this.rr(x - tw / 2 - 7, y - 20, tw + 14, 18, 8, bg);
      this.poly([[x - 4, y - 3], [x + 4, y - 3], [x, y + 3]], bg);
      k.fillStyle = text === 'bug!' ? '#C0392B' : warn ? '#9A5B00' : '#3A2A20';
      k.textAlign = 'center'; k.textBaseline = 'middle'; k.fillText(text, x, y - 11);
    } else if (c.working) {
      this.rr(x - 13, y - 14, 26, 12, 6, '#FFFFFF');
      for (let i = 0; i < 3; i++) this.ell(x - 6 + i * 6, y - 8, 1.8, 1.8, Math.floor(T * 4) % 4 > i ? '#7A5038' : '#D9C7B3');
    }
  }

  draw() {
    this.ctx.clearRect(0, 0, W, H);
    this.room();
    const items: { k: number; f: () => void }[] = DESKS.map((d) => ({ k: d.cx + d.cy, f: () => this.desk(d) }));
    for (const y of [0, 1, 2, 5, 6, 7]) items.push({ k: 7 + y + 0.5, f: () => this.divider(y) });
    items.push(
      { k: 10.4, f: () => { const a = up(g2s(7, 3), 26), b = up(g2s(7, 5), 26); this.ctx.strokeStyle = '#C99A6B'; this.ctx.lineWidth = 3; this.ctx.beginPath(); this.ctx.moveTo(a[0], a[1]); this.ctx.lineTo(b[0], b[1]); this.ctx.stroke(); } },
      { k: TREE.x + TREE.y, f: () => this.tree() }, { k: 17.2, f: () => this.bed() }, { k: 15.6, f: () => this.bowls() }, { k: 14.7, f: () => this.ball() },
    );
    for (const c of allCats()) items.push({ k: c.act?.spot.n === 'tree' ? TREE.x + TREE.y + 0.5 : c.x + c.y + 0.01, f: () => this.cat(c) });
    // Floor labels go down first so cats walk over them.
    for (const d of DESKS) { const p = g2s(d.cx - d.w / 2, d.cy + d.d / 2); this.pill(d.label, p[0] - 4, p[1] + 12); }
    const lp = g2s(11.4, 7.6); this.pill('lounge', lp[0], lp[1] + 4);
    items.sort((a, b) => a.k - b.k).forEach((i) => i.f());
    for (const c of allCats()) this.bubble(c);
  }

  /** Which cat (if any) is under a canvas point, for tap-to-inspect. */
  catAt(clientX: number, clientY: number): Role | null {
    const r = this.canvas.getBoundingClientRect();
    const x = ((clientX - r.left) / r.width) * W, y = ((clientY - r.top) / r.height) * H;
    let best: Role | null = null, bestD = 22;
    for (const c of allCats()) {
      const [px, py] = this.catPos(c);
      const d = Math.hypot(x - px, y - (py - 16));
      if (d < bestD) { bestD = d; best = c.role; }
    }
    return best;
  }
}
