/* Eliie Virtual Office — RPG Engine v2
   Arsitektur benar: background + occluder terpisah (dipotong dari gambar yang sama),
   depth sorting, collision, duduk beneran. Tampilan = sama persis dengan versi lama. */
(function(){
'use strict';
const W = 1920, H = 1080;
const CHAR_H = {eliie:150, ty:150, luna:150, nana:150, mimi:150, yuki:150};
const SITBODY_DH = {eliie:168.8, ty:171.4, luna:158.8, nana:171.4, mimi:166.2, yuki:154.3};
const SITBODY_BUTT = {eliie:0.85, ty:0.85, luna:0.85, nana:0.85, mimi:0.85, yuki:0.85};
const SITBODY_FACE = {ty:'left', eliie:'left', mimi:'left', nana:'right', yuki:'right', luna:'back'};
const SPEED = 230;

const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
const toastEl = document.getElementById('toast');
let toastT = null;
function toast(msg, ms){
  toastEl.textContent = msg; toastEl.classList.add('show');
  clearTimeout(toastT); toastT = setTimeout(()=>toastEl.classList.remove('show'), ms||2600);
}

const G = {
  room:null, bg:null, chars:[], selected:null, sprites:{}, time:0,
  hoverChar:null,
};

function loadImg(src){
  return new Promise((res)=>{
    const im = new Image();
    im.onload = ()=>res(im);
    im.onerror = ()=>res(null);
    im.src = src;
  });
}

async function init(){
  const roomId = (window.RPG_ROOM || 'office');
  const room = await (await fetch('rooms/'+roomId+'.json')).json();
  G.room = room;
  document.getElementById('roomName').textContent = '🏢 ' + room.name;
  G.bg = await loadImg(room.bg);
  // preload sprites
  const ids = room.characters.map(c=>c.id);
  for(const id of ids){
    const set = {};
    set.idle = await loadImg('../assets/chars/'+id+'-idle.png');
    set.wf1 = await loadImg('../assets/chars/'+id+'-walk-front-1.png');
    set.wf2 = await loadImg('../assets/chars/'+id+'-walk-front-2.png');
    set.wb1 = await loadImg('../assets/chars/'+id+'-walk-back-1.png');
    set.wb2 = await loadImg('../assets/chars/'+id+'-walk-back-2.png');
    set.ws1 = await loadImg('../assets/chars/'+id+'-walk-side-1.png');
    set.ws2 = await loadImg('../assets/chars/'+id+'-walk-side-2.png');
    set.sitbody = await loadImg('../assets/chars/'+id+'-sit-body.png');
    G.sprites[id] = set;
  }
  // spawn characters
  for(const c of room.characters){
    G.chars.push({
      id:c.id, name:c.name, x:c.spawn[0], y:c.spawn[1],
      tx:c.spawn[0], ty:c.spawn[1], moving:false,
      dir:'front', flip:false, frameT:0, bob:Math.random()*6,
      pose:'idle', sitSpot:null, sitAnim:null, selected:false,
    });
  }
  if(G.chars[0]) selectChar(G.chars[0]);
  fitCanvas();
  window.addEventListener('resize', fitCanvas);
  canvas.addEventListener('pointerdown', onTap);
  requestAnimationFrame(loop);
  toast('👆 Ketuk karakter untuk memilih • ketuk lantai untuk jalan • ketuk 🪑 untuk duduk', 4200);
}

function fitCanvas(){
  const pad = 0;
  const ww = window.innerWidth - pad, wh = window.innerHeight - pad;
  const s = Math.min(ww/W, wh/H);
  canvas.style.width = (W*s)+'px';
  canvas.style.height = (H*s)+'px';
}

function selectChar(c){
  for(const k of G.chars) k.selected = false;
  if(c){ c.selected = true; G.selected = c.id; }
  else G.selected = null;
}
function charById(id){ return G.chars.find(c=>c.id===id); }
function spotById(id){ return G.room.sitSpots.find(s=>s.id===id); }
function occById(id){ return G.room.occluders.find(o=>o.id===id); }

function toGame(e){
  const r = canvas.getBoundingClientRect();
  return { x:(e.clientX-r.left)/r.width*W, y:(e.clientY-r.top)/r.height*H };
}

function onTap(e){
  const p = toGame(e);
  // 1. karakter? (kepala/badan)
  let hit = null, best = 1e9;
  for(const c of G.chars){
    const dh = c.pose==='sitbody' ? (SITBODY_DH[c.id]||170) : (CHAR_H[c.id]||168);
    const cx = c.x, cyTop = (c.pose==='sitbody'? c.sitY : c.y) - dh;
    const cyBot = (c.pose==='sitbody'? c.sitY : c.y);
    if(p.x>cx-70 && p.x<cx+70 && p.y>cyTop-20 && p.y<cyBot+20){
      const d = Math.hypot(p.x-cx, p.y-(cyTop+cyBot)/2);
      if(d<best){ best=d; hit=c; }
    }
  }
  if(hit){
    if(hit.pose==='sitbody'){ standUp(hit); return; }
    selectChar(hit);
    toast('✅ '+hit.name+' dipilih — ketuk lantai untuk jalan, ketuk 🪑 untuk duduk');
    return;
  }
  // 2. kursi (sit spot)?
  for(const s of G.room.sitSpots){
    if(Math.hypot(p.x-s.x, p.y-s.y) < 55){
      orderSit(s);
      return;
    }
  }
  // 3. hotspot?
  for(const h of (G.room.hotspots||[])){
    const r = h.rect;
    if(p.x>=r[0] && p.x<=r[0]+r[2] && p.y>=r[1] && p.y<=r[1]+r[3]){
      toast(h.text); return;
    }
  }
  // 4. lantai → jalan
  const c = charById(G.selected);
  if(!c){ toast('👆 Pilih karakter dulu'); return; }
  if(c.pose==='sitbody'){ toast('🪑 '+c.name+' lagi duduk — ketuk dia untuk berdiri'); return; }
  const w = G.room.walk;
  const tx = Math.max(w.x, Math.min(w.x+w.w, p.x));
  const ty = Math.max(w.y, Math.min(w.y+w.h, p.y));
  c.tx = tx; c.ty = ty; c.moving = true;
}

function orderSit(s){
  if(s.occupant){
    const c = charById(s.occupant);
    toast('🪑 Sudah diduduki '+(c?c.name:'')+'!');
    return;
  }
  const c = charById(G.selected);
  if(!c){ toast('👆 Pilih karakter dulu, baru ketuk 🪑'); return; }
  if(c.pose==='sitbody'){ toast('🪑 '+c.name+' sudah duduk'); return; }
  // jalan ke titik approach dulu
  c.tx = s.approach[0]; c.ty = s.approach[1]; c.moving = true;
  c.afterWalk = ()=>doSit(c, s);
}

function doSit(c, s){
  c.pose = 'sitbody';
  c.sitSpot = s.id; s.occupant = c.id;
  const dh = SITBODY_DH[c.id]||170, bf = SITBODY_BUTT[c.id]||0.62;
  const feetY = s.y + (1-bf)*dh;
  c.sitAnim = { t:0, dur:0.45, fx:c.x, fy:c.y, tx:s.x, ty:feetY };
  const wantFace = s.face || 'left';
  const natFace = SITBODY_FACE[c.id] || 'left';
  c.flip = (natFace==='back') ? false : (wantFace !== natFace);
  const occ = occById(s.chair);
  c.sitSortY = (occ ? occ.bottomY : s.y) + 1;
  c.sitY = feetY;
  setTimeout(()=>toast('🪑 '+c.name+' duduk — nyaman~ 😌'), 500);
}

function standUp(c){
  const s = spotById(c.sitSpot);
  if(s) s.occupant = null;
  c.sitSpot = null; c.sitAnim = null; c.pose = 'idle';
  c.sitSortY = null; c.flip = false;
  if(s){ c.tx = s.approach[0]; c.ty = s.approach[1]; c.moving = true; }
  toast('🧍 '+c.name+' berdiri');
}

function solidAt(x, y){
  // di dalam walk rect?
  const w = G.room.walk;
  if(x < w.x || x > w.x+w.w || y < w.y || y > w.y+w.h) return true;
  for(const o of G.room.occluders){
    if(!o.solid) continue;
    const r = o.solid;
    if(x > r[0]-14 && x < r[0]+r[2]+14 && y > r[1]-10 && y < r[1]+r[3]+10) return true;
  }
  return false;
}

function update(dt){
  G.time += dt;
  for(const c of G.chars){
    c.bob += dt*3;
    // animasi duduk
    if(c.sitAnim){
      const a = c.sitAnim;
      a.t += dt;
      const k = Math.min(1, a.t/a.dur);
      const e = 1-Math.pow(1-k,3);
      c.x = a.fx + (a.tx-a.fx)*e;
      c.sitY = a.fy + (a.ty-a.fy)*e;
      // hop kecil
      c.sitHop = Math.sin(k*Math.PI)*-14;
      if(k>=1){ c.sitAnim = null; c.sitHop = 0; }
      continue;
    }
    if(c.pose==='sitbody') continue;
    if(c.moving){
      const dx = c.tx-c.x, dy = c.ty-c.y;
      const d = Math.hypot(dx,dy);
      if(d < 6){ c.moving = false; if(c.afterWalk){ const f=c.afterWalk; c.afterWalk=null; f(); } continue; }
      const vx = dx/d*SPEED*dt, vy = dy/d*SPEED*dt;
      // gerak per sumbu + collision slide ala RPG
      const nx = c.x + vx;
      if(!solidAt(nx, c.y)) c.x = nx;
      const ny = c.y + vy;
      if(!solidAt(c.x, ny)) c.y = ny;
      // arah & frame jalan
      if(Math.abs(dx) > Math.abs(dy)){ c.dir='side'; c.flip = dx<0; }
      else { c.dir = dy<0 ? 'back':'front'; c.flip = false; }
      c.frameT += dt;
    }
  }
  // separasi halus antar karakter (biar ga numpuk)
  for(let i=0;i<G.chars.length;i++) for(let j=i+1;j<G.chars.length;j++){
    const a=G.chars[i], b=G.chars[j];
    if(a.pose==='sitbody'||b.pose==='sitbody') continue;
    const dx=b.x-a.x, dy=b.y-a.y, d=Math.hypot(dx,dy);
    if(d<60 && d>0.01){
      const push=(60-d)/2*0.5;
      const ux=dx/d, uy=dy/d;
      if(!solidAt(a.x-ux*push, a.y-uy*push)){ a.x-=ux*push; a.y-=uy*push; }
      if(!solidAt(b.x+ux*push, b.y+uy*push)){ b.x+=ux*push; b.y+=uy*push; }
    }
  }
}

function drawChar(c){
  const set = G.sprites[c.id];
  if(!set) return;
  let img, dh, ax=c.x, ay=c.y, bobY=0;
  if(c.pose==='sitbody'){
    img = set.sitbody; dh = SITBODY_DH[c.id]||170;
    ay = (c.sitY||c.y) + (c.sitHop||0);
  } else if(c.moving){
    const ph = (c.frameT/0.16)*Math.PI;
    bobY = -Math.abs(Math.sin(ph))*6; // kaki napak: titik terendah saat ganti frame
    const alt = Math.sin(ph) > 0;
    if(c.dir==='side') img = alt?set.ws1:set.ws2;
    else if(c.dir==='back') img = alt?set.wb1:set.wb2;
    else img = alt?set.wf1:set.wf2;
    dh = CHAR_H[c.id]||168;
  } else {
    img = set.idle; dh = CHAR_H[c.id]||168;
    bobY = Math.sin(c.bob)*2.5;
  }
  if(!img) return;
  const dw = dh*img.width/img.height;
  ctx.save();
  ctx.translate(ax, ay+bobY);
  if(c.flip) ctx.scale(-1,1);
  ctx.drawImage(img, -dw/2, -dh, dw, dh);
  ctx.restore();
  if(c.selected && c.pose!=='sitbody'){
    ctx.save();
    ctx.strokeStyle='#ffb347'; ctx.lineWidth=3;
    ctx.beginPath(); ctx.ellipse(c.x, c.y, 36, 13, 0, 0, Math.PI*2); ctx.stroke();
    ctx.restore();
  }
}

function render(){
  ctx.clearRect(0,0,W,H);
  if(G.bg) ctx.drawImage(G.bg, 0, 0, W, H);
  // daftar gambar: karakter + occluder, urut berdasar Y (depth sorting)
  const items = [];
  for(const c of G.chars){
    const key = c.pose==='sitbody' ? (c.sitSortY||c.y) : c.y;
    items.push({key, type:'char', c});
  }
  for(const o of G.room.occluders){
    items.push({key:o.bottomY, type:'occ', o});
  }
  items.sort((a,b)=>a.key-b.key);
  for(const it of items){
    if(it.type==='char') drawChar(it.c);
    else {
      const o = it.o, s = o.src;
      ctx.drawImage(G.bg, s[0], s[1], s[2], s[3], s[0], s[1], s[2], s[3]);
    }
  }
  // marker kursi 🪑 (hanya yang kosong)
  ctx.save();
  ctx.font = '44px serif'; ctx.textAlign='center'; ctx.textBaseline='middle';
  for(const s of G.room.sitSpots){
    if(s.occupant) continue;
    const b = Math.sin(G.time*3 + s.x)*6;
    ctx.globalAlpha = 0.92;
    ctx.fillText('🪑', s.x, s.y-52+b);
  }
  ctx.restore();
}

let last = 0;
function loop(t){
  const dt = Math.min(0.05, (t-last)/1000 || 0.016);
  last = t;
  update(dt);
  render();
  requestAnimationFrame(loop);
}

window.RPG = { init };
document.addEventListener('DOMContentLoaded', init);
})();
