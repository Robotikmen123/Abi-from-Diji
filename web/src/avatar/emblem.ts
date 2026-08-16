/**
 * ABI'nin govdesi: isikli halka emblemi.
 *
 * Karakter bir insan yuzu degil, ekranda yasayan bir isik varligi.
 * Tamamen prosedurel cizilir; boylece her cozunurlukte net kalir, ses ve
 * durum parametreleri dogrudan geometriyi surer ve yuklenecek asset olmaz.
 *
 * Referans kutu: merkez (0,0), dis yorunge yaricapi ~100.
 */

export interface EmblemState {
  time: number;
  /** Nefes: -1..1 */
  breath: number;
  /** Sahnedeki hafif suruklenme */
  driftX: number;
  driftY: number;
  /** Cekirdek parlakligi 0..1 (kirpisma buradan) */
  coreBrightness: number;
  /** Halka enerjisi 0..1 — duruma gore kalinlik ve parlaklik */
  ringEnergy: number;
  /** Yorunge yayinin acisi (radyan) */
  spin: number;
  /** Ses genligi 0..1 */
  amplitude: number;
  /** Halka uzerindeki dalga ornekleri */
  wave: number[];
  /** Genel olcek (nefes + duygu) */
  scale: number;
  presence: number;
  dim: number;
  /** Ana renk (hex) */
  color: string;
  /** Ikincil/soguk vurgu */
  accent: string;
  /** Emblem uzerindeki yazi */
  wordmark: string;
}

const CORE_RADIUS = 46;
const ORBIT_RADIUS = 92;

export function drawEmblem(ctx: CanvasRenderingContext2D, s: EmblemState): void {
  if (s.presence <= 0.001) return;

  ctx.save();
  ctx.globalAlpha = s.presence;
  ctx.translate(s.driftX, s.driftY);
  ctx.scale(s.scale, s.scale);
  ctx.lineCap = 'round';

  const life = 1 - s.dim * 0.75;

  drawHalo(ctx, s, life);
  drawOrbit(ctx, s, life);
  drawCoreDisc(ctx, s, life);
  drawReactiveRing(ctx, s, life);
  drawWordmark(ctx, s, life);
  drawScanSweep(ctx, s, life);

  ctx.restore();
}

/* ------------------------------------------------------------------ katmanlar */

/** Emblemin cevresine sizan yumusak isik. Neon degil, ortam isigi. */
function drawHalo(ctx: CanvasRenderingContext2D, s: EmblemState, life: number): void {
  const intensity = (0.14 + s.ringEnergy * 0.28 + s.amplitude * 0.12) * life;
  const radius = ORBIT_RADIUS * (1.75 + s.amplitude * 0.06);

  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  const halo = ctx.createRadialGradient(0, 0, CORE_RADIUS * 0.35, 0, 0, radius);
  halo.addColorStop(0, withAlpha(s.color, intensity * 0.42));
  halo.addColorStop(0.28, withAlpha(s.color, intensity * 0.2));
  halo.addColorStop(0.62, withAlpha(s.color, intensity * 0.06));
  halo.addColorStop(1, withAlpha(s.color, 0));
  ctx.fillStyle = halo;
  ctx.beginPath();
  ctx.arc(0, 0, radius, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

/**
 * Dis yorunge: bas tarafi parlak, kuyrugu sonen bir yay.
 * Tek parca stroke yerine segment segment ciziliyor — canvas yay boyunca
 * gradient desteklemiyor, kuyruk hissi ancak boyle olusuyor.
 */
function drawOrbit(ctx: CanvasRenderingContext2D, s: EmblemState, life: number): void {
  const arcs = [
    { radius: ORBIT_RADIUS, sweep: 4.3, width: 2.6, alpha: 0.95, offset: 0, dir: 1 },
    { radius: ORBIT_RADIUS * 0.82, sweep: 1.5, width: 1.5, alpha: 0.4, offset: Math.PI * 1.15, dir: -1 },
  ];

  ctx.save();
  // Bilerek additif degil: 'lighter' altinda ustuste binen segmentler
  // yay boyunca merdiven gibi bantlar birakiyor. Bloom ayri katmanda.
  ctx.lineCap = 'round';

  for (const arc of arcs) {
    const segments = 64;
    const head = s.spin * arc.dir + arc.offset;
    const energy = (0.45 + s.ringEnergy * 0.55) * arc.alpha * life;

    for (let i = 0; i < segments; i += 1) {
      const t = i / segments;
      // Kuyruk: ustel sonme, bas tarafta keskin.
      const fade = Math.pow(1 - t, 1.7);
      const alpha = energy * fade;
      if (alpha < 0.004) continue;

      const step = arc.sweep / segments;
      const a0 = head - t * arc.sweep;
      // Segmentler bilerek ustuste biner; aralik birakilirsa yay boncuklu cikiyor.
      // Cok kucuk bindirme: sifir birakilirsa kenar yumusatmasi tuy gibi
      // bosluklar birakiyor, fazlasi 'lighter' altinda bant yapiyor.
      const a1 = a0 - step * 1.04;

      ctx.strokeStyle = withAlpha(t < 0.1 ? s.accent : s.color, alpha);
      ctx.lineWidth = arc.width * (0.7 + fade * 0.45);
      ctx.beginPath();
      ctx.arc(0, 0, arc.radius, a1, a0);
      ctx.stroke();
    }

    // Bloom: genis, sonuk ve tek gecis — bant birakmadan isik hissi verir.
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.strokeStyle = withAlpha(s.color, 0.1 * energy);
    ctx.lineWidth = arc.width * 3.2;
    ctx.beginPath();
    ctx.arc(0, 0, arc.radius, head - arc.sweep * 0.62, head);
    ctx.stroke();
    ctx.restore();

    // Yayin ucundaki parlak nokta
    const hx = Math.cos(head) * arc.radius;
    const hy = Math.sin(head) * arc.radius;
    ctx.globalCompositeOperation = 'lighter';
    const glow = ctx.createRadialGradient(hx, hy, 0, hx, hy, 11);
    glow.addColorStop(0, withAlpha(s.accent, 0.5 * life * arc.alpha));
    glow.addColorStop(0.35, withAlpha(s.color, 0.28 * life * arc.alpha));
    glow.addColorStop(1, withAlpha(s.color, 0));
    ctx.fillStyle = glow;
    ctx.fillRect(hx - 11, hy - 11, 22, 22);
    ctx.globalCompositeOperation = 'source-over';
  }

  ctx.restore();
}

/** Cekirdek disk: neredeyse siyah, icinde derin bir isik var. */
function drawCoreDisc(ctx: CanvasRenderingContext2D, s: EmblemState, life: number): void {
  ctx.save();

  // Ic dolgu
  const fill = ctx.createRadialGradient(0, -CORE_RADIUS * 0.1, 2, 0, 0, CORE_RADIUS);
  fill.addColorStop(0, withAlpha(s.color, 0.05 * s.coreBrightness * life));
  fill.addColorStop(0.5, 'rgba(5,9,7,0.86)');
  fill.addColorStop(1, 'rgba(4,6,5,0.94)');
  ctx.fillStyle = fill;
  ctx.beginPath();
  ctx.arc(0, 0, CORE_RADIUS, 0, Math.PI * 2);
  ctx.fill();

  // Ic kenar isigi
  ctx.globalCompositeOperation = 'lighter';
  const inner = ctx.createRadialGradient(0, 0, CORE_RADIUS * 0.86, 0, 0, CORE_RADIUS);
  inner.addColorStop(0, withAlpha(s.color, 0));
  inner.addColorStop(1, withAlpha(s.color, 0.13 * s.coreBrightness * life));
  ctx.fillStyle = inner;
  ctx.beginPath();
  ctx.arc(0, 0, CORE_RADIUS, 0, Math.PI * 2);
  ctx.fill();

  ctx.restore();
}

/**
 * Ana halka. Konusurken ses genligiyle cevresi boyunca dalgalanir:
 * agiz yerine gecen ifade organi bu.
 */
function drawReactiveRing(ctx: CanvasRenderingContext2D, s: EmblemState, life: number): void {
  const samples = s.wave.length;
  const brightness = (0.55 + s.ringEnergy * 0.45) * life;

  ctx.save();
  ctx.globalCompositeOperation = 'lighter';

  // Once genis ve sonuk bir kopya (bloom), sonra keskin hat.
  const passes = [
    { width: 7, alpha: 0.1 * brightness },
    { width: 3.4, alpha: 0.22 * brightness },
    { width: 1.7, alpha: 0.92 * brightness },
  ];

  for (const pass of passes) {
    ctx.strokeStyle = withAlpha(s.color, pass.alpha);
    ctx.lineWidth = pass.width;
    // Dogru parcalari yerine orta noktalardan gecen egri: dalga organik akar.
    ctx.beginPath();
    const point = (i: number) => {
      const index = ((i % samples) + samples) % samples;
      const angle = (i / samples) * Math.PI * 2 - Math.PI / 2;
      const radius = CORE_RADIUS + (s.wave[index] ?? 0) * 3.2;
      return { x: Math.cos(angle) * radius, y: Math.sin(angle) * radius };
    };
    const first = point(0);
    const last = point(-1);
    ctx.moveTo((last.x + first.x) / 2, (last.y + first.y) / 2);
    for (let i = 0; i < samples; i += 1) {
      const current = point(i);
      const next = point(i + 1);
      ctx.quadraticCurveTo(current.x, current.y, (current.x + next.x) / 2, (current.y + next.y) / 2);
    }
    ctx.closePath();
    ctx.stroke();
  }

  ctx.restore();
}

/** Emblemin uzerindeki isim. Karakterin kimligi burada. */
function drawWordmark(ctx: CanvasRenderingContext2D, s: EmblemState, life: number): void {
  const alpha = (0.72 + s.coreBrightness * 0.28) * life;

  ctx.save();
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = '600 34px Inter, system-ui, sans-serif';

  ctx.globalCompositeOperation = 'lighter';
  // Bloom: ayni yaziyi genis ve sonuk basip uzerine keskin geciyoruz.
  ctx.fillStyle = withAlpha(s.color, 0.28 * alpha);
  ctx.filter = 'blur(7px)';
  ctx.fillText(s.wordmark, 0, 1.5);
  ctx.filter = 'none';

  ctx.fillStyle = withAlpha(lighten(s.color, 0.45), alpha);
  ctx.fillText(s.wordmark, 0, 1.5);
  ctx.restore();
}

/** Ara sira gecen tarama cizgisi: "kirpma" karsiligi, canlilik verir. */
function drawScanSweep(ctx: CanvasRenderingContext2D, s: EmblemState, life: number): void {
  const phase = s.coreBrightness;
  if (phase > 0.985) return;

  ctx.save();
  ctx.beginPath();
  ctx.arc(0, 0, CORE_RADIUS - 1, 0, Math.PI * 2);
  ctx.clip();

  const y = (1 - phase) * CORE_RADIUS * 4 - CORE_RADIUS * 2;
  ctx.globalCompositeOperation = 'lighter';
  const sweep = ctx.createLinearGradient(0, y - 10, 0, y + 10);
  sweep.addColorStop(0, withAlpha(s.color, 0));
  sweep.addColorStop(0.5, withAlpha(s.color, 0.16 * life));
  sweep.addColorStop(1, withAlpha(s.color, 0));
  ctx.fillStyle = sweep;
  ctx.fillRect(-CORE_RADIUS, y - 10, CORE_RADIUS * 2, 20);
  ctx.restore();
}

/* ------------------------------------------------------------------ renk */

export function withAlpha(hex: string, alpha: number): string {
  const { r, g, b } = parseHex(hex);
  return `rgba(${r},${g},${b},${Math.max(0, Math.min(1, alpha)).toFixed(3)})`;
}

export function lighten(hex: string, amount: number): string {
  const { r, g, b } = parseHex(hex);
  const mix = (value: number) => Math.round(value + (255 - value) * amount);
  return `#${[mix(r), mix(g), mix(b)].map((v) => v.toString(16).padStart(2, '0')).join('')}`;
}

function parseHex(hex: string): { r: number; g: number; b: number } {
  const clean = hex.replace('#', '');
  const full =
    clean.length === 3
      ? clean
          .split('')
          .map((c) => c + c)
          .join('')
      : clean;
  return {
    r: parseInt(full.slice(0, 2), 16) || 0,
    g: parseInt(full.slice(2, 4), 16) || 0,
    b: parseInt(full.slice(4, 6), 16) || 0,
  };
}
