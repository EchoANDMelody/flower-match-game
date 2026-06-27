// ====== 花朵消消除 - 纯 Canvas 2D ======
// 炸弹💣 / 复制📋 / 铲除🪓 | 音效 | 5关卡

// ==================== 常量 & 关卡 ====================
const COLS = 7, ROWS = 7;
const EMOJIS = ['🌹','🌻','🌷','🌼','🌺','🌸'];
const LEVELS = [
  { id:1, name:'春日花园', target:1000, moves:30, bomb:1, copy:1, shovel:1, types:5 },
  { id:2, name:'夏日花海', target:2000, moves:28, bomb:1, copy:1, shovel:2, types:5 },
  { id:3, name:'秋日花径', target:3500, moves:26, bomb:2, copy:1, shovel:1, types:6 },
  { id:4, name:'冬日花房', target:5000, moves:24, bomb:2, copy:2, shovel:2, types:6 },
  { id:5, name:'四季花园', target:7000, moves:22, bomb:2, copy:2, shovel:2, types:6 },
];

// ==================== 全局状态 ====================
let CELL, PAD, BW, BH; // 根据 DPI 动态计算
let canvas, ctx, dpr;
let board = [];          // board[r][c] = { type, x, y, scale, alpha, removing }
let score = 0, combo = 0, moves = 30, levelIdx = 0;
let items = { bomb:1, copy:1, shovel:1 };
let selectedItem = null; // 当前激活的道具类型
let copySource = null;   // 复制道具源
let selected = null;     // 选中格 {r,c}
let busy = false;
let animations = [];     // 活跃动画列表
let soundOn = true;
let audioCtx;
let hintTimer = 0;
let lastTime = 0;

// ==================== 音效 ====================
function sfx(type) {
  if (!soundOn) return;
  try {
    if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    const ac = audioCtx, t = ac.currentTime;
    const play = (freq, dur, vol, wave, delay) => {
      const o = ac.createOscillator(), g = ac.createGain();
      o.type = wave || 'sine'; o.frequency.value = freq;
      g.gain.setValueAtTime(vol, t + (delay||0));
      g.gain.exponentialRampToValueAtTime(0.001, t + (delay||0) + dur);
      o.connect(g); g.connect(ac.destination);
      o.start(t + (delay||0)); o.stop(t + (delay||0) + dur);
    };
    switch(type) {
      case 'match':   play(523,.2,.12,'sine',0); play(659,.2,.12,'sine',.07); play(784,.2,.12,'sine',.14); break;
      case 'combo':   { const o=ac.createOscillator(),g=ac.createGain(); o.type='triangle'; o.frequency.setValueAtTime(400,t); o.frequency.exponentialRampToValueAtTime(1200,t+.3); g.gain.setValueAtTime(.12,t); g.gain.exponentialRampToValueAtTime(.001,t+.4); o.connect(g); g.connect(ac.destination); o.start(t); o.stop(t+.4); } break;
      case 'swap':    play(330,.1,.08); break;
      case 'invalid': play(150,.15,.06,'square'); break;
      case 'bomb':    play(80,.5,.18,'sawtooth'); play(400,.15,.08,'square',.05); break;
      case 'shovel':  play(900,.12,.12,'triangle'); break;
      case 'copy':    play(660,.18,.08,'sine',0); play(880,.18,.08,'sine',.05); play(1100,.18,.08,'sine',.1); break;
      case 'levelup': play(523,.3,.12,'sine',0); play(659,.3,.12,'sine',.1); play(784,.3,.12,'sine',.2); play(1047,.4,.12,'sine',.3); break;
      case 'gameover':play(400,.25,.1,'sine',0); play(350,.25,.1,'sine',.12); play(300,.25,.1,'sine',.24); play(200,.35,.1,'sine',.36); break;
      case 'drop':    play(300,.06,.04); break;
    }
  } catch(e){}
}

function toggleSound() {
  soundOn = !soundOn;
  document.getElementById('sound-toggle').textContent = soundOn ? '🔊' : '🔇';
}

function toggleHelp() {
  const overlay = document.getElementById('help-overlay');
  overlay.classList.toggle('show');
}

// ==================== 布局计算 ====================
function calcLayout() {
  dpr = window.devicePixelRatio || 1;
  const maxW = Math.min(window.innerWidth - 24, 500);
  CELL = Math.floor((maxW - 32) / COLS);
  PAD = 12;
  BW = COLS * CELL + PAD * 2;
  BH = ROWS * CELL + PAD * 2;

  canvas = document.getElementById('game-canvas');
  // 设置 width/height 会重置 canvas 上下文
  canvas.width = BW * dpr;
  canvas.height = BH * dpr;
  canvas.style.width = BW + 'px';
  canvas.style.height = BH + 'px';
  ctx = canvas.getContext('2d');
  // 必须在每次 width/height 赋值后重新设置缩放
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}

function cellX(c) { return PAD + c * CELL + CELL / 2; }
function cellY(r) { return PAD + r * CELL + CELL / 2; }

// ==================== 棋盘操作 ====================
function makeCell(r, c, type) {
  if (type === undefined) {
    const lv = LEVELS[levelIdx];
    type = Math.floor(Math.random() * lv.types);
  }
  return { type, x: cellX(c), y: cellY(r), scale: 1, alpha: 1, removing: false };
}

function initBoard() {
  board = [];
  for (let r = 0; r < ROWS; r++) {
    board[r] = [];
    for (let c = 0; c < COLS; c++) {
      board[r][c] = makeCell(r, c);
    }
  }
  // 消除初始匹配
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      let tries = 0;
      while (matchAt(r, c) && tries < 100) {
        const lv = LEVELS[levelIdx];
        board[r][c].type = Math.floor(Math.random() * lv.types);
        tries++;
      }
    }
  }
}

function matchAt(r, c) {
  const t = board[r][c].type;
  if (c >= 2 && board[r][c-1].type === t && board[r][c-2].type === t) return true;
  if (r >= 2 && board[r-1][c].type === t && board[r-2][c].type === t) return true;
  return false;
}

// ==================== 匹配检测 ====================
function findMatches() {
  const set = new Set();
  // 横向
  for (let r = 0; r < ROWS; r++) {
    let run = 1;
    for (let c = 1; c < COLS; c++) {
      if (board[r][c] && board[r][c-1] && board[r][c].type === board[r][c-1].type) {
        run++;
      } else {
        if (run >= 3) for (let i = c - run; i < c; i++) set.add(r * COLS + i);
        run = 1;
      }
    }
    if (run >= 3) for (let i = COLS - run; i < COLS; i++) set.add(r * COLS + i);
  }
  // 纵向
  for (let c = 0; c < COLS; c++) {
    let run = 1;
    for (let r = 1; r < ROWS; r++) {
      if (board[r][c] && board[r-1][c] && board[r][c].type === board[r-1][c].type) {
        run++;
      } else {
        if (run >= 3) for (let i = r - run; i < r; i++) set.add(i * COLS + c);
        run = 1;
      }
    }
    if (run >= 3) for (let i = ROWS - run; i < ROWS; i++) set.add(i * COLS + c);
  }
  return [...set].map(idx => ({ r: Math.floor(idx / COLS), c: idx % COLS }));
}

// ==================== 动画系统 ====================
function tween(obj, props, dur, ease) {
  return new Promise(resolve => {
    const start = {};
    for (const k in props) start[k] = obj[k];
    const t0 = performance.now();
    animations.push({ obj, props, start, dur, ease: ease || 'easeOut', t0, resolve });
  });
}

function tickAnimations(now) {
  for (let i = animations.length - 1; i >= 0; i--) {
    const a = animations[i];
    let t = Math.min((now - a.t0) / a.dur, 1);
    // 缓动
    switch (a.ease) {
      case 'easeOut':    t = 1 - (1-t)*(1-t); break;
      case 'easeIn':     t = t*t; break;
      case 'backOut':    t = 1 + 2.7*Math.pow(t-1,3) + 1.7*Math.pow(t-1,2); break;
      case 'backIn':     { const s=2; t = t*t*((s+1)*t-s); } break;
      case 'bounceOut':  {
        if(t<1/2.75) t=7.5625*t*t;
        else if(t<2/2.75){t-=1.5/2.75;t=7.5625*t*t+.75;}
        else if(t<2.5/2.75){t-=2.25/2.75;t=7.5625*t*t+.9375;}
        else{t-=2.625/2.75;t=7.5625*t*t+.984375;}
      } break;
      case 'linear': break;
    }
    for (const k in a.props) {
      a.obj[k] = a.start[k] + (a.props[k] - a.start[k]) * t;
    }
    if (t >= 1) {
      for (const k in a.props) a.obj[k] = a.props[k];
      animations.splice(i, 1);
      a.resolve();
    }
  }
}

async function wait(ms) { return new Promise(r => setTimeout(r, ms)); }

// ==================== 消除流程 ====================
async function removeMatches(matches) {
  // 缩小动画
  const proms = matches.map(({r, c}) => {
    const cell = board[r][c];
    cell.removing = true;
    return tween(cell, { scale: 0, alpha: 0 }, 220, 'backIn');
  });
  await Promise.all(proms);

  // 生成粒子
  matches.forEach(({r, c}) => {
    const cell = board[r][c];
    spawnParticles(cell.x, cell.y, EMOJIS[cell.type]);
    board[r][c] = null;
  });
}

let particles = [];
function spawnParticles(x, y, emoji) {
  for (let i = 0; i < 5; i++) {
    const angle = Math.random() * Math.PI * 2;
    const speed = 50 + Math.random() * 60;
    particles.push({
      emoji, x, y, vx: Math.cos(angle)*speed, vy: Math.sin(angle)*speed,
      alpha: 1, life: 0.5, age: 0
    });
  }
}

async function dropAndFill() {
  // 下落
  const proms = [];
  for (let c = 0; c < COLS; c++) {
    let emptyRow = ROWS - 1;
    for (let r = ROWS - 1; r >= 0; r--) {
      if (board[r][c] !== null) {
        if (r !== emptyRow) {
          board[emptyRow][c] = board[r][c];
          board[r][c] = null;
          const targetY = cellY(emptyRow);
          proms.push(tween(board[emptyRow][c], { y: targetY }, 200 + (emptyRow - r) * 20, 'bounceOut'));
        }
        emptyRow--;
      }
    }
  }
  if (proms.length) { await Promise.all(proms); sfx('drop'); }

  // 填充
  const fillProms = [];
  for (let c = 0; c < COLS; c++) {
    let idx = 0;
    for (let r = ROWS - 1; r >= 0; r--) {
      if (board[r][c] === null) {
        const cell = makeCell(r, c);
        cell.y = cellY(-1 - idx); // 从上方掉落
        board[r][c] = cell;
        const targetY = cellY(r);
        fillProms.push(tween(cell, { y: targetY }, 250 + idx * 30, 'bounceOut'));
        idx++;
      }
    }
  }
  if (fillProms.length) await Promise.all(fillProms);
}

async function processChain() {
  let matches = findMatches();
  while (matches.length > 0) {
    combo++;
    const pts = matches.length * 10 * combo;
    score += pts;
    if (combo > 1) { showCombo(combo); sfx('combo'); }
    else sfx('match');
    updateHUD();

    await removeMatches(matches);
    await dropAndFill();
    matches = findMatches();
  }
}

// ==================== 交互 ====================
function getCellAt(px, py) {
  // px, py 是 canvas CSS 坐标
  const c = Math.floor((px - PAD) / CELL);
  const r = Math.floor((py - PAD) / CELL);
  if (r < 0 || r >= ROWS || c < 0 || c >= COLS) return null;
  if (!board[r][c]) return null;
  return { r, c };
}

function canvasCoords(e) {
  const rect = canvas.getBoundingClientRect();
  const x = (e.clientX - rect.left);
  const y = (e.clientY - rect.top);
  return { x, y };
}

let pointerStart = null;
let pointerStartPos = null;

function onDown(e) {
  if (busy) return;
  e.preventDefault();
  const {x, y} = canvasCoords(e);
  const cell = getCellAt(x, y);
  if (!cell) return;

  // 道具模式
  if (selectedItem) {
    handleItemUse(cell.r, cell.c);
    return;
  }

  pointerStart = cell;
  pointerStartPos = { x, y };
}

function onMove(e) {
  if (!pointerStart || busy || selectedItem) return;
  e.preventDefault();
  const {x, y} = canvasCoords(e);
  const dx = x - pointerStartPos.x;
  const dy = y - pointerStartPos.y;
  const dist = Math.sqrt(dx*dx + dy*dy);
  if (dist > CELL * 0.3) {
    // 确定方向
    let dr = 0, dc = 0;
    if (Math.abs(dx) > Math.abs(dy)) dc = dx > 0 ? 1 : -1;
    else dr = dy > 0 ? 1 : -1;
    const nr = pointerStart.r + dr, nc = pointerStart.c + dc;
    if (nr >= 0 && nr < ROWS && nc >= 0 && nc < COLS) {
      doSwap(pointerStart.r, pointerStart.c, nr, nc);
    }
    pointerStart = null;
  }
}

function onUp(e) {
  if (!pointerStart || busy || selectedItem) { pointerStart = null; return; }
  e.preventDefault();
  const {x, y} = canvasCoords(e);
  const cell = getCellAt(x, y);

  if (cell && cell.r === pointerStart.r && cell.c === pointerStart.c) {
    // 点击模式
    if (selected) {
      const dr = Math.abs(cell.r - selected.r);
      const dc = Math.abs(cell.c - selected.c);
      if (dr + dc === 1) {
        doSwap(selected.r, selected.c, cell.r, cell.c);
        selected = null;
      } else {
        selected = { r: cell.r, c: cell.c };
      }
    } else {
      selected = { r: cell.r, c: cell.c };
    }
  }
  pointerStart = null;
}

function onPointerCancel() { pointerStart = null; }

function bindEvents() {
  canvas.removeEventListener('pointerdown', onDown);
  canvas.removeEventListener('pointermove', onMove);
  canvas.removeEventListener('pointerup', onUp);
  canvas.removeEventListener('pointercancel', onPointerCancel);
  canvas.addEventListener('pointerdown', onDown);
  canvas.addEventListener('pointermove', onMove);
  canvas.addEventListener('pointerup', onUp);
  canvas.addEventListener('pointercancel', onPointerCancel);
}

// ==================== 交换 ====================
async function doSwap(r1, c1, r2, c2) {
  busy = true;
  selected = null;
  sfx('swap');

  const cell1 = board[r1][c1], cell2 = board[r2][c2];

  // 交换动画
  const tx1 = cellX(c2), ty1 = cellY(r2);
  const tx2 = cellX(c1), ty2 = cellY(r1);
  await Promise.all([
    tween(cell1, { x: tx1, y: ty1 }, 180, 'easeOut'),
    tween(cell2, { x: tx2, y: ty2 }, 180, 'easeOut'),
  ]);

  // 数据交换
  board[r1][c1] = cell2; board[r2][c2] = cell1;

  // 检查匹配
  const matches = findMatches();
  if (matches.length === 0) {
    sfx('invalid');
    // 换回
    await Promise.all([
      tween(cell1, { x: cellX(c1), y: cellY(r1) }, 180, 'easeOut'),
      tween(cell2, { x: cellX(c2), y: cellY(r2) }, 180, 'easeOut'),
    ]);
    board[r1][c1] = cell1; board[r2][c2] = cell2;
    busy = false;
    return;
  }

  moves--;
  combo = 0;
  updateHUD();
  await processChain();
  checkState();
  busy = false;
}

// ==================== 道具 ====================
function onItemBtn(type) {
  if (items[type] <= 0 || busy) return;
  if (selectedItem === type) {
    selectedItem = null; copySource = null;
  } else {
    selectedItem = type; copySource = null;
  }
  updateItemUI();
}

async function handleItemUse(r, c) {
  if (selectedItem === 'bomb') {
    await useBomb(r, c);
  } else if (selectedItem === 'shovel') {
    await useShovel(r, c);
  } else if (selectedItem === 'copy') {
    if (!copySource) {
      copySource = { r, c };
      // 视觉提示已选中源
    } else {
      if (copySource.r !== r || copySource.c !== c) {
        await useCopy(copySource.r, copySource.c, r, c);
      }
      copySource = null;
    }
  }
}

async function useBomb(r, c) {
  busy = true;
  items.bomb--;
  selectedItem = null; copySource = null;
  updateItemUI();
  sfx('bomb');

  const targets = [];
  for (let dr = -1; dr <= 1; dr++) {
    for (let dc = -1; dc <= 1; dc++) {
      const nr = r+dr, nc = c+dc;
      if (nr >= 0 && nr < ROWS && nc >= 0 && nc < COLS && board[nr][nc]) {
        targets.push({r: nr, c: nc});
      }
    }
  }

  score += targets.length * 15;
  combo++;
  if (combo > 1) showCombo(combo);
  updateHUD();
  await removeMatches(targets);
  await dropAndFill();
  await processChain();
  checkState();
  busy = false;
}

async function useShovel(r, c) {
  busy = true;
  items.shovel--;
  selectedItem = null; copySource = null;
  updateItemUI();
  sfx('shovel');

  score += 20;
  combo++;
  if (combo > 1) showCombo(combo);
  updateHUD();
  await removeMatches([{r, c}]);
  await dropAndFill();
  await processChain();
  checkState();
  busy = false;
}

async function useCopy(sr, sc, tr, tc) {
  busy = true;
  items.copy--;
  selectedItem = null; copySource = null;
  updateItemUI();
  sfx('copy');

  const srcType = board[sr][sc].type;
  board[tr][tc].type = srcType;

  // 变色特效
  await tween(board[tr][tc], { scale: 1.4 }, 120, 'backOut');
  await tween(board[tr][tc], { scale: 1 }, 120, 'easeOut');

  combo = 0;
  await processChain();
  checkState();
  busy = false;
}

// ==================== 状态检查 ====================
function checkState() {
  updateHUD();
  const lv = LEVELS[levelIdx];
  if (score >= lv.target) {
    sfx('levelup');
    if (levelIdx < LEVELS.length - 1) {
      showOverlay('🎉 过关!', `${lv.name} 完成!<br>得分: ${score}`, '下一关', () => startLevel(levelIdx + 1));
    } else {
      showOverlay('🏆 通关!', `恭喜完成所有关卡!<br>总分: ${score}`, '重新挑战', () => startLevel(0));
    }
  } else if (moves <= 0) {
    sfx('gameover');
    showOverlay('😢 步数用完!', `得分: ${score}<br>目标: ${lv.target}`, '重试', () => startLevel(levelIdx));
  }
}

// ==================== HUD ====================
function updateHUD() {
  const lv = LEVELS[levelIdx];
  document.getElementById('hud-level').textContent = lv.id;
  document.getElementById('hud-score').textContent = score;
  document.getElementById('hud-combo').textContent = combo;
  document.getElementById('hud-moves').textContent = moves;
  document.getElementById('target-score').textContent = lv.target;
  const pct = Math.min(score / lv.target * 100, 100);
  document.getElementById('target-bar-fill').style.width = pct + '%';
  updateItemUI();
}

function updateItemUI() {
  ['bomb','copy','shovel'].forEach(k => {
    const btn = document.getElementById('btn-' + k);
    const cnt = document.getElementById('cnt-' + k);
    cnt.textContent = items[k];
    btn.classList.toggle('active', selectedItem === k);
    btn.classList.toggle('disabled', items[k] <= 0);
  });
}

function showCombo(n) {
  const el = document.getElementById('combo-popup');
  el.textContent = `${n}x 连击! 🔥`;
  el.classList.add('show');
  setTimeout(() => el.classList.remove('show'), 800);
}

function showOverlay(title, body, btnText, cb) {
  const overlay = document.getElementById('overlay');
  const box = document.getElementById('overlay-box');
  box.innerHTML = `<div class="big">${title}</div><div class="sub">${body}</div><button id="overlay-btn">${btnText}</button>`;
  overlay.classList.add('show');
  document.getElementById('overlay-btn').onclick = () => {
    overlay.classList.remove('show');
    if (cb) cb();
  };
}

// ==================== 渲染 ====================
function render(now) {
  const dt = (now - lastTime) / 1000;
  lastTime = now;

  // 更新动画
  tickAnimations(now);

  // 更新粒子
  for (let i = particles.length - 1; i >= 0; i--) {
    const p = particles[i];
    p.age += dt;
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.vy += 120 * dt; // 重力
    p.alpha = 1 - p.age / p.life;
    if (p.age >= p.life) particles.splice(i, 1);
  }

  // 清空（使用逻辑坐标，已通过 setTransform 缩放）
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.restore();

  // 背景
  ctx.fillStyle = '#fff8f0';
  roundRect(ctx, 0, 0, BW, BH, 16, true);

  // 格子
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      const x = PAD + c * CELL, y = PAD + r * CELL;
      ctx.fillStyle = (r + c) % 2 === 0 ? '#ffeef5' : '#fff5f8';
      roundRect(ctx, x + 1, y + 1, CELL - 2, CELL - 2, 6, true);
    }
  }

  // 选中高亮
  if (selected && board[selected.r] && board[selected.r][selected.c]) {
    const x = PAD + selected.c * CELL, y = PAD + selected.r * CELL;
    ctx.strokeStyle = '#e91e63';
    ctx.lineWidth = 3;
    roundRect(ctx, x, y, CELL, CELL, 6, false, true);
  }
  // 复制源高亮
  if (copySource && board[copySource.r] && board[copySource.r][copySource.c]) {
    const x = PAD + copySource.c * CELL, y = PAD + copySource.r * CELL;
    ctx.strokeStyle = '#9c27b0';
    ctx.lineWidth = 3;
    ctx.setLineDash([5, 3]);
    roundRect(ctx, x, y, CELL, CELL, 6, false, true);
    ctx.setLineDash([]);
  }
  // 道具目标提示（炸弹/铲除 hover 区高亮）
  if (selectedItem === 'bomb' || selectedItem === 'shovel') {
    canvas.style.cursor = 'crosshair';
  } else if (selectedItem === 'copy') {
    canvas.style.cursor = copySource ? 'crosshair' : 'pointer';
  } else {
    canvas.style.cursor = 'default';
  }

  // 花朵
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      const cell = board[r][c];
      if (!cell || cell.removing && cell.scale <= 0.01) continue;
      ctx.save();
      ctx.globalAlpha = cell.alpha;
      ctx.translate(cell.x, cell.y);
      ctx.scale(cell.scale, cell.scale);
      ctx.font = `${CELL * 0.6}px serif`;
      ctx.fillText(EMOJIS[cell.type], 0, 2);
      ctx.restore();
    }
  }

  // 粒子
  for (const p of particles) {
    ctx.save();
    ctx.globalAlpha = Math.max(0, p.alpha);
    ctx.font = '16px serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(p.emoji, p.x, p.y);
    ctx.restore();
  }

  requestAnimationFrame(render);
}

function roundRect(ctx, x, y, w, h, r, fill, stroke) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
  if (fill) ctx.fill();
  if (stroke) ctx.stroke();
}

// ==================== 启动关卡 ====================
function startLevel(idx) {
  levelIdx = idx;
  const lv = LEVELS[idx];
  score = 0; combo = 0; moves = lv.moves;
  items = { bomb: lv.bomb, copy: lv.copy, shovel: lv.shovel };
  selected = null; selectedItem = null; copySource = null; busy = false;
  particles = []; animations = [];

  initBoard();
  updateHUD();

  // 关卡名提示
  const el = document.getElementById('combo-popup');
  el.textContent = `🌸 第${lv.id}关 · ${lv.name}`;
  el.classList.add('show');
  setTimeout(() => el.classList.remove('show'), 1500);
}

// ==================== 初始化 ====================
let renderStarted = false;

function init() {
  calcLayout();
  initBoard();
  bindEvents();
  updateHUD();

  const lv = LEVELS[0];
  const el = document.getElementById('combo-popup');
  el.textContent = `🌸 第${lv.id}关 · ${lv.name}`;
  el.classList.add('show');
  setTimeout(() => el.classList.remove('show'), 1500);

  if (!renderStarted) {
    renderStarted = true;
    lastTime = performance.now();
    requestAnimationFrame(render);
  }

  window.addEventListener('resize', () => {
    calcLayout();
    bindEvents(); // 重新绑定（canvas 已替换）
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        if (board[r][c]) {
          board[r][c].x = cellX(c);
          board[r][c].y = cellY(r);
        }
      }
    }
  });
}

init();
