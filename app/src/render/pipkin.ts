import { Spring, clamp, clamp01, damp, lerp } from "../core/spring";
import { glow, sparkle, withAlpha } from "./stage";

export type Mood = "idle" | "curious" | "thinking" | "delighted" | "encouraging" | "sleepy" | "proud";

interface MoodPose {
  browLift: number; // -1 lowered .. 1 raised
  /** Inner-corner tilt. Positive = inner ends UP (concerned/kind). Negative = inner ends down (cross). */
  browAngle: number;
  /** Brows are near-invisible at rest; they only appear when the character is emoting. */
  browAlpha: number;
  eyeOpen: number; // 0..1.3
  mouthCurve: number; // -1 frown .. 1 smile
  mouthOpen: number; // 0..1
  cheek: number; // blush opacity
  earTilt: number; // radians, outward
  bodyLift: number; // px
  glowBoost: number;
}

/**
 * Expression poses.
 *
 * The single most important rule here: **the resting face is friendly and browless.** An early
 * build drew brows at full strength in every mood with the inner corners angled down, and the
 * character read as permanently cross — which for a five-year-old's companion is fatal. Brows now
 * fade in only when there is an actual emotion to show, and positive tilt means inner-corners-up.
 */
const POSES: Record<Mood, MoodPose> = {
  idle: { browLift: 0.2, browAngle: 0.05, browAlpha: 0, eyeOpen: 1, mouthCurve: 0.5, mouthOpen: 0.1, cheek: 0.3, earTilt: 0, bodyLift: 0, glowBoost: 0 },
  curious: { browLift: 0.75, browAngle: 0.1, browAlpha: 0.55, eyeOpen: 1.18, mouthCurve: 0.25, mouthOpen: 0.28, cheek: 0.32, earTilt: -0.2, bodyLift: 2, glowBoost: 0.1 },
  thinking: { browLift: -0.15, browAngle: 0.42, browAlpha: 0.7, eyeOpen: 0.8, mouthCurve: 0.05, mouthOpen: 0.04, cheek: 0.2, earTilt: 0.18, bodyLift: -2, glowBoost: -0.05 },
  delighted: { browLift: 0.9, browAngle: 0.08, browAlpha: 0.35, eyeOpen: 0.12, mouthCurve: 1, mouthOpen: 0.7, cheek: 0.8, earTilt: -0.32, bodyLift: 8, glowBoost: 0.45 },
  encouraging: { browLift: 0.45, browAngle: 0.34, browAlpha: 0.5, eyeOpen: 1.05, mouthCurve: 0.75, mouthOpen: 0.15, cheek: 0.45, earTilt: -0.08, bodyLift: 1, glowBoost: 0.08 },
  sleepy: { browLift: -0.2, browAngle: 0.3, browAlpha: 0.4, eyeOpen: 0.22, mouthCurve: 0.3, mouthOpen: 0.06, cheek: 0.32, earTilt: 0.34, bodyLift: -4, glowBoost: -0.25 },
  proud: { browLift: 0.6, browAngle: 0.06, browAlpha: 0.3, eyeOpen: 0.28, mouthCurve: 0.95, mouthOpen: 0.3, cheek: 0.6, earTilt: -0.24, bodyLift: 5, glowBoost: 0.3 },
};

export interface PipkinPalette {
  bodyTop: string;
  bodyBottom: string;
  belly: string;
  ear: string;
  eye: string;
  glow: string;
  pip: string;
}

export const DEFAULT_PALETTE: PipkinPalette = {
  bodyTop: "#B6EEFF",
  bodyBottom: "#63A8F5",
  belly: "#F4FCFF",
  ear: "#9BE2FF",
  eye: "#141A38",
  glow: "#8FD9FF",
  pip: "#FFD782",
};

/**
 * The Pipkin.
 *
 * Procedurally drawn and skeletally animated rather than a sprite sheet. Every part sits on its
 * own spring, so the character is *never* in a static pose: it breathes, blinks on a natural
 * cadence, tracks whatever the child is touching with its eyes, squashes when it lands, and shifts
 * emotional state in response to gameplay. That constant micro-motion is what makes a mascot read
 * as alive rather than as clip-art, and it is the thing a static illustration can never do.
 */
export class Pipkin {
  // Position/motion
  x = 0;
  y = 0;
  scale = 1;
  private posX = new Spring(0, { duration: 0.65, bounce: 0.22 });
  private posY = new Spring(0, { duration: 0.55, bounce: 0.3 });
  private squash = new Spring(0, { duration: 0.42, bounce: 0.45 });
  private lean = new Spring(0, { duration: 0.6, bounce: 0.25 });
  private scaleSpring = new Spring(1, { duration: 0.6, bounce: 0.28 });

  // Look-at
  private lookX = new Spring(0, { duration: 0.35, bounce: 0.1 });
  private lookY = new Spring(0, { duration: 0.35, bounce: 0.1 });
  private headX = new Spring(0, { duration: 0.5, bounce: 0.18 });
  private headY = new Spring(0, { duration: 0.5, bounce: 0.18 });

  // Ears trail the head with extra bounce — classic secondary animation.
  private earL = new Spring(0, { duration: 0.5, bounce: 0.55 });
  private earR = new Spring(0, { duration: 0.52, bounce: 0.55 });

  // Expression channels, all smoothed so mood changes read as a performance, not a cut.
  private browLift = 0;
  private browAngle = 0;
  private browAlpha = 0;
  private eyeOpen = 1;
  private mouthCurve = 0.45;
  private mouthOpen = 0.12;
  private cheek = 0.25;
  private earTilt = 0;
  private bodyLift = 0;
  private glowBoost = 0;

  private blinkTimer = 2;
  private blinkProgress = 1; // 1 = fully open
  private blinking = false;
  private t = 0;

  mood: Mood = "idle";
  palette: PipkinPalette = { ...DEFAULT_PALETTE };
  /** Number of orbiting pips — the visible representation of progress. */
  pipCount = 3;
  private pipPhase = 0;

  constructor(x = 0, y = 0, scale = 1) {
    this.x = x;
    this.y = y;
    this.posX.reset(x);
    this.posY.reset(y);
    this.scale = scale;
    this.scaleSpring.reset(scale);
  }

  moveTo(x: number, y: number): this {
    this.posX.set(x);
    this.posY.set(y);
    // Lean into the direction of travel — anticipation makes movement feel intentional.
    this.lean.set(clamp((x - this.posX.value) * 0.0025, -0.22, 0.22));
    return this;
  }

  teleport(x: number, y: number): this {
    this.posX.reset(x);
    this.posY.reset(y);
    return this;
  }

  setScale(s: number): this {
    this.scaleSpring.set(s);
    return this;
  }

  /** Point the eyes (and slightly the head) at a screen coordinate. */
  lookAt(x: number, y: number): this {
    const dx = clamp((x - this.posX.value) / 260, -1, 1);
    const dy = clamp((y - this.posY.value) / 260, -1, 1);
    this.lookX.set(dx);
    this.lookY.set(dy);
    this.headX.set(dx * 0.55);
    this.headY.set(dy * 0.4);
    return this;
  }

  lookForward(): this {
    this.lookX.set(0);
    this.lookY.set(0);
    this.headX.set(0);
    this.headY.set(0);
    return this;
  }

  setMood(mood: Mood): this {
    this.mood = mood;
    return this;
  }

  /** A vertical hop with squash on take-off and landing. */
  hop(height = 34): this {
    this.posY.impulse(-height * 6);
    this.squash.set(-0.16);
    setTimeout(() => this.squash.set(0), 160);
    return this;
  }

  /** Reaction to a correct answer: pop, brighten, then settle. */
  celebrate(): this {
    this.setMood("delighted");
    this.hop(42);
    this.scaleSpring.impulse(1.6);
    this.earL.impulse(-9);
    this.earR.impulse(9);
    setTimeout(() => this.setMood("idle"), 1500);
    return this;
  }

  /** Reaction to a wrong answer: a small sympathetic tilt. Never a sad or scolding pose. */
  encourage(): this {
    this.setMood("encouraging");
    this.lean.impulse(1.1);
    setTimeout(() => this.setMood("idle"), 1600);
    return this;
  }

  blink(): this {
    if (!this.blinking) {
      this.blinking = true;
      this.blinkProgress = 1;
    }
    return this;
  }

  update(dt: number): void {
    this.t += dt;
    this.posX.step(dt);
    this.posY.step(dt);
    this.squash.step(dt);
    this.lean.step(dt);
    this.scaleSpring.step(dt);
    this.lookX.step(dt);
    this.lookY.step(dt);
    this.headX.step(dt);
    this.headY.step(dt);

    // Ears chase the head with a delay, giving overlapping action.
    this.earL.set(-this.headX.value * 0.7 - this.lean.value * 1.4).step(dt);
    this.earR.set(-this.headX.value * 0.7 + this.lean.value * 1.4).step(dt);

    this.x = this.posX.value;
    this.y = this.posY.value;
    this.scale = this.scaleSpring.value;

    // Blink cycle: closes fast, opens slightly slower, at an irregular interval.
    this.blinkTimer -= dt;
    if (this.blinkTimer <= 0 && !this.blinking) {
      this.blinking = true;
      this.blinkTimer = 1.8 + Math.random() * 4.2;
    }
    if (this.blinking) {
      this.blinkProgress -= dt * 9;
      if (this.blinkProgress <= -1) {
        this.blinkProgress = 1;
        this.blinking = false;
      }
    }

    // Ease expression channels toward the target pose.
    const pose = POSES[this.mood];
    const rate = 9;
    this.browLift = damp(this.browLift, pose.browLift, rate, dt);
    this.browAngle = damp(this.browAngle, pose.browAngle, rate, dt);
    this.browAlpha = damp(this.browAlpha, pose.browAlpha, rate, dt);
    this.eyeOpen = damp(this.eyeOpen, pose.eyeOpen, rate, dt);
    this.mouthCurve = damp(this.mouthCurve, pose.mouthCurve, rate, dt);
    this.mouthOpen = damp(this.mouthOpen, pose.mouthOpen, rate, dt);
    this.cheek = damp(this.cheek, pose.cheek, rate, dt);
    this.earTilt = damp(this.earTilt, pose.earTilt, rate, dt);
    this.bodyLift = damp(this.bodyLift, pose.bodyLift, rate, dt);
    this.glowBoost = damp(this.glowBoost, pose.glowBoost, rate, dt);

    this.pipPhase += dt * 0.7;
  }

  /** Effective eye openness including the blink. */
  private get lidOpen(): number {
    const blink = this.blinking ? Math.abs(this.blinkProgress) : 1;
    return clamp01(this.eyeOpen * blink);
  }

  /**
   * Vertical extents from the anchor point, in device-independent px.
   *
   * The anchor is the *body centre*, which is the right pivot for squash and lean but the wrong
   * thing for layout: callers want to stand the character on a line or tuck it under a heading.
   * Exposing the extents is what lets every screen position it against a measured DOM box instead
   * of guessing a viewport fraction and hoping.
   */
  get topExtent(): number {
    return 116 * this.scale;
  }

  get bottomExtent(): number {
    return 76 * this.scale;
  }

  /** Total drawn height, useful for choosing a scale that fits a reserved band. */
  get drawnHeight(): number {
    return this.topExtent + this.bottomExtent;
  }

  draw(ctx: CanvasRenderingContext2D): void {    const s = this.scale;
    const breathe = Math.sin(this.t * 1.55) * 0.022 + Math.sin(this.t * 0.73) * 0.008;
    const bob = Math.sin(this.t * 1.55) * 3 * s;

    ctx.save();
    ctx.translate(this.x, this.y + this.bodyLift * -0.3 + bob);
    ctx.rotate(this.lean.value * 0.35);
    ctx.scale(s, s);

    const sq = this.squash.value;
    const bodyW = 62 * (1 - sq + breathe);
    const bodyH = 58 * (1 + sq + breathe * 0.6);

    this.drawAura(ctx, bodyW, bodyH);
    this.drawOrbitingPips(ctx, bodyW, bodyH);
    this.drawTail(ctx, bodyW, bodyH);
    this.drawBody(ctx, bodyW, bodyH);
    this.drawEars(ctx, bodyW, bodyH);
    this.drawFace(ctx, bodyW, bodyH);
    this.drawFeet(ctx, bodyW, bodyH);

    ctx.restore();
  }

  private drawAura(ctx: CanvasRenderingContext2D, bodyW: number, bodyH: number): void {
    const pulse = 1 + Math.sin(this.t * 1.2) * 0.06;
    const strength = 0.42 + this.glowBoost;
    glow(ctx, 0, -bodyH * 0.1, bodyW * 2.5 * pulse, this.palette.glow, clamp01(strength) * 0.55);
  }

  private drawOrbitingPips(ctx: CanvasRenderingContext2D, bodyW: number, bodyH: number): void {
    const count = clamp(this.pipCount, 0, 12);
    for (let i = 0; i < count; i++) {
      const ratio = i / Math.max(count, 1);
      const angle = this.pipPhase * (0.6 + (i % 3) * 0.16) + ratio * Math.PI * 2;
      const radiusX = bodyW * (1.35 + (i % 3) * 0.16);
      const radiusY = bodyH * (0.75 + (i % 2) * 0.2);
      const px = Math.cos(angle) * radiusX;
      const py = Math.sin(angle * 1.3) * radiusY - bodyH * 0.25;
      // Pips behind the body are dimmer — cheap depth cue.
      const depth = (Math.sin(angle) + 1) / 2;
      const alpha = 0.35 + depth * 0.65;
      const size = 3 + depth * 2.4;
      glow(ctx, px, py, size * 4.5, this.palette.pip, alpha * 0.5);
      sparkle(ctx, px, py, size, "#FFFFFF", alpha * 0.9, angle);
    }
  }

  private drawTail(ctx: CanvasRenderingContext2D, bodyW: number, bodyH: number): void {
    const wag = Math.sin(this.t * 3.1 + this.lean.value * 2) * 0.35 + this.lean.value;
    ctx.save();
    ctx.translate(bodyW * 0.62, bodyH * 0.15);
    ctx.rotate(-0.5 + wag * 0.4);
    const g = ctx.createLinearGradient(0, 0, bodyW * 0.7, -bodyH * 0.3);
    g.addColorStop(0, this.palette.bodyBottom);
    g.addColorStop(1, withAlpha(this.palette.bodyTop, 0.15));
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.moveTo(0, 6);
    ctx.quadraticCurveTo(bodyW * 0.5, -bodyH * 0.05, bodyW * 0.66, -bodyH * 0.36);
    ctx.quadraticCurveTo(bodyW * 0.44, -bodyH * 0.06, 0, -8);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  private drawBody(ctx: CanvasRenderingContext2D, bodyW: number, bodyH: number): void {
    const g = ctx.createLinearGradient(0, -bodyH, 0, bodyH);
    g.addColorStop(0, this.palette.bodyTop);
    g.addColorStop(1, this.palette.bodyBottom);
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.ellipse(0, 0, bodyW, bodyH, 0, 0, Math.PI * 2);
    ctx.fill();

    // Underside light. A *soft radial* rather than a hard ellipse: an early build drew a crisp
    // white oval here and it read as a muzzle or a face-mask sitting over the features.
    ctx.save();
    ctx.beginPath();
    ctx.ellipse(0, 0, bodyW, bodyH, 0, 0, Math.PI * 2);
    ctx.clip();
    const belly = ctx.createRadialGradient(0, bodyH * 0.55, bodyH * 0.05, 0, bodyH * 0.55, bodyH * 1.0);
    belly.addColorStop(0, withAlpha(this.palette.belly, 0.85));
    belly.addColorStop(0.55, withAlpha(this.palette.belly, 0.3));
    belly.addColorStop(1, withAlpha(this.palette.belly, 0));
    ctx.fillStyle = belly;
    ctx.fillRect(-bodyW, -bodyH, bodyW * 2, bodyH * 2);
    ctx.restore();

    // Rim light along the upper-left. Drawn as a soft gradient stroke rather than a solid white
    // arc, which previously read as the hard edge of a helmet.
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    const rim = ctx.createLinearGradient(-bodyW, -bodyH, bodyW * 0.3, bodyH * 0.2);
    rim.addColorStop(0, withAlpha("#FFFFFF", 0.34));
    rim.addColorStop(1, withAlpha("#FFFFFF", 0));
    ctx.strokeStyle = rim;
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.ellipse(0, 0, bodyW - 1.2, bodyH - 1.2, 0, Math.PI * 1.02, Math.PI * 1.72);
    ctx.stroke();
    ctx.restore();
  }

  private drawEars(ctx: CanvasRenderingContext2D, bodyW: number, bodyH: number): void {
    const draw = (side: -1 | 1, spring: Spring) => {
      ctx.save();
      const baseX = side * bodyW * 0.55;
      const baseY = -bodyH * 0.72;
      ctx.translate(baseX, baseY);
      ctx.rotate(side * (0.32 + this.earTilt) + spring.value * 0.06);
      // Ear gradient stays inside the character's own colour family. Blending toward the biome
      // accent (as an earlier build did) turned the ears muddy brown in the warm biomes.
      const g = ctx.createLinearGradient(0, bodyH * 0.06, 0, -bodyH * 0.92);
      g.addColorStop(0, this.palette.ear);
      g.addColorStop(1, this.palette.bodyTop);
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.moveTo(-bodyW * 0.16, bodyH * 0.06);
      ctx.quadraticCurveTo(-bodyW * 0.24, -bodyH * 0.62, 0, -bodyH * 0.92);
      ctx.quadraticCurveTo(bodyW * 0.24, -bodyH * 0.62, bodyW * 0.16, bodyH * 0.06);
      ctx.closePath();
      ctx.fill();
      // Inner ear
      ctx.fillStyle = withAlpha("#FFFFFF", 0.4);
      ctx.beginPath();
      ctx.moveTo(-bodyW * 0.07, 0);
      ctx.quadraticCurveTo(-bodyW * 0.1, -bodyH * 0.42, 0, -bodyH * 0.66);
      ctx.quadraticCurveTo(bodyW * 0.1, -bodyH * 0.42, bodyW * 0.07, 0);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    };
    draw(-1, this.earL);
    draw(1, this.earR);
  }

  private drawFace(ctx: CanvasRenderingContext2D, bodyW: number, bodyH: number): void {
    const hx = this.headX.value * bodyW * 0.1;
    const hy = this.headY.value * bodyH * 0.08;
    ctx.save();
    ctx.translate(hx, hy - bodyH * 0.08);

    const eyeDx = bodyW * 0.32;
    const eyeY = -bodyH * 0.06;
    const eyeR = bodyW * 0.135;
    const open = this.lidOpen;
    const px = this.lookX.value * eyeR * 0.42;
    const py = this.lookY.value * eyeR * 0.42;

    for (const side of [-1, 1] as const) {
      const ex = side * eyeDx;
      ctx.save();
      // Squashing the eye vertically is the blink — cheaper and softer than drawing a lid shape.
      ctx.translate(ex, eyeY);
      ctx.scale(1, Math.max(0.04, open));
      ctx.fillStyle = this.palette.eye;
      ctx.beginPath();
      ctx.ellipse(0, 0, eyeR, eyeR * 1.12, 0, 0, Math.PI * 2);
      ctx.fill();

      // Pupil highlight — two specular dots, the classic "alive eye" trick.
      ctx.fillStyle = withAlpha("#FFFFFF", 0.95);
      ctx.beginPath();
      ctx.arc(px + eyeR * 0.3, py - eyeR * 0.34, eyeR * 0.32, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = withAlpha("#FFFFFF", 0.55);
      ctx.beginPath();
      ctx.arc(px - eyeR * 0.28, py + eyeR * 0.3, eyeR * 0.16, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();

      // Closed-eye smile arc when fully shut and happy (delighted pose).
      if (open < 0.2 && this.mouthCurve > 0.7) {
        ctx.strokeStyle = this.palette.eye;
        ctx.lineWidth = bodyW * 0.055;
        ctx.lineCap = "round";
        ctx.beginPath();
        ctx.arc(ex, eyeY + eyeR * 0.3, eyeR * 0.9, Math.PI * 1.15, Math.PI * 1.85);
        ctx.stroke();
      }

      // Brow. Positive browAngle raises the *inner* corners, which reads as kind or concerned;
      // negative would read as cross, so it is never used in a positive mood.
      if (this.browAlpha > 0.02) {
        const browY = eyeY - eyeR * (1.7 + this.browLift * 0.6);
        ctx.save();
        ctx.translate(ex, browY);
        ctx.rotate(side * this.browAngle);
        ctx.strokeStyle = withAlpha(this.palette.eye, 0.6 * this.browAlpha);
        ctx.lineWidth = bodyW * 0.038;
        ctx.lineCap = "round";
        ctx.beginPath();
        ctx.moveTo(-eyeR * 0.8, eyeR * 0.12);
        ctx.quadraticCurveTo(0, -eyeR * 0.24, eyeR * 0.8, eyeR * 0.12);
        ctx.stroke();
        ctx.restore();
      }

      // Cheek blush
      ctx.fillStyle = withAlpha("#FF9BB3", this.cheek * 0.5);
      ctx.beginPath();
      ctx.ellipse(side * bodyW * 0.5, eyeY + eyeR * 1.5, bodyW * 0.13, bodyW * 0.08, 0, 0, Math.PI * 2);
      ctx.fill();
    }

    // Mouth: a single quadratic whose control point encodes the smile, opening into an ellipse.
    const my = bodyH * 0.24;
    const mw = bodyW * 0.24;
    ctx.strokeStyle = this.palette.eye;
    ctx.lineWidth = bodyW * 0.05;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    if (this.mouthOpen > 0.25) {
      ctx.fillStyle = "#2A1230";
      ctx.beginPath();
      ctx.ellipse(0, my + mw * 0.2, mw * 0.8, mw * this.mouthOpen * 0.95, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = withAlpha("#FF8FA8", 0.85);
      ctx.beginPath();
      ctx.ellipse(0, my + mw * 0.5, mw * 0.42, mw * this.mouthOpen * 0.42, 0, 0, Math.PI * 2);
      ctx.fill();
    } else {
      ctx.beginPath();
      ctx.moveTo(-mw, my);
      ctx.quadraticCurveTo(0, my + this.mouthCurve * mw * 1.1, mw, my);
      ctx.stroke();
    }
    ctx.restore();
  }

  private drawFeet(ctx: CanvasRenderingContext2D, bodyW: number, bodyH: number): void {
    const step = Math.sin(this.t * 1.55);
    for (const side of [-1, 1] as const) {
      ctx.fillStyle = this.palette.bodyBottom;
      ctx.beginPath();
      ctx.ellipse(
        side * bodyW * 0.42,
        bodyH * 0.92 + step * side * 1.5,
        bodyW * 0.24,
        bodyH * 0.14,
        0,
        0,
        Math.PI * 2
      );
      ctx.fill();
    }
  }

  /**
   * Draw the Pipkin at an arbitrary place/size without disturbing its world position — used for
   * avatars in the HUD and for the profile picker.
   */
  drawPortrait(ctx: CanvasRenderingContext2D, x: number, y: number, size: number): void {
    const savedX = this.x;
    const savedY = this.y;
    const savedScale = this.scale;
    this.x = x;
    this.y = y;
    this.scale = size / 120;
    this.draw(ctx);
    this.x = savedX;
    this.y = savedY;
    this.scale = savedScale;
  }
}

/**
 * Biome tinting.
 *
 * Only the *glow* and the orbiting pips take the biome's accent colour. The body stays the same
 * luminous blue everywhere, because a character whose colour changes per level has no identity —
 * it reads as a UI element being re-skinned rather than as someone travelling with you.
 */
export function paletteForBiome(accent: string, deep: string): PipkinPalette {
  return { ...DEFAULT_PALETTE, eye: deep, glow: accent };
}

export { lerp };
