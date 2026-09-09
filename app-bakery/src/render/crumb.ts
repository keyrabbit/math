import { Spring, clamp, clamp01, damp, lerp } from "../core/spring";
import { glow, withAlpha } from "./stage";

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
 * The single most important rule here: **the resting face is friendly and browless.** The sibling
 * MVP learned this the hard way — an early build drew brows at full strength in every mood with the
 * inner corners angled down, and the character read as permanently cross, which for a
 * five-year-old's companion is fatal. Brows fade in only when there is an actual emotion to show,
 * and positive tilt means inner-corners-up.
 */
const POSES: Record<Mood, MoodPose> = {
  idle: { browLift: 0.2, browAngle: 0.05, browAlpha: 0, eyeOpen: 1, mouthCurve: 0.5, mouthOpen: 0.1, cheek: 0.34, earTilt: 0, bodyLift: 0, glowBoost: 0 },
  curious: { browLift: 0.75, browAngle: 0.1, browAlpha: 0.55, eyeOpen: 1.18, mouthCurve: 0.25, mouthOpen: 0.28, cheek: 0.36, earTilt: -0.14, bodyLift: 2, glowBoost: 0.1 },
  thinking: { browLift: -0.15, browAngle: 0.42, browAlpha: 0.7, eyeOpen: 0.8, mouthCurve: 0.05, mouthOpen: 0.04, cheek: 0.22, earTilt: 0.12, bodyLift: -2, glowBoost: -0.05 },
  delighted: { browLift: 0.9, browAngle: 0.08, browAlpha: 0.35, eyeOpen: 0.12, mouthCurve: 1, mouthOpen: 0.7, cheek: 0.85, earTilt: -0.22, bodyLift: 8, glowBoost: 0.45 },
  encouraging: { browLift: 0.45, browAngle: 0.34, browAlpha: 0.5, eyeOpen: 1.05, mouthCurve: 0.75, mouthOpen: 0.15, cheek: 0.5, earTilt: -0.06, bodyLift: 1, glowBoost: 0.08 },
  sleepy: { browLift: -0.2, browAngle: 0.3, browAlpha: 0.4, eyeOpen: 0.22, mouthCurve: 0.3, mouthOpen: 0.06, cheek: 0.34, earTilt: 0.24, bodyLift: -4, glowBoost: -0.25 },
  proud: { browLift: 0.6, browAngle: 0.06, browAlpha: 0.3, eyeOpen: 0.28, mouthCurve: 0.95, mouthOpen: 0.3, cheek: 0.65, earTilt: -0.16, bodyLift: 5, glowBoost: 0.3 },
};

export interface CrumbPalette {
  bodyTop: string;
  bodyBottom: string;
  belly: string;
  ear: string;
  eye: string;
  glow: string;
  /** Colour of the sprinkles orbiting the character. */
  sprinkle: string;
  /** The apron. */
  apron: string;
  apronTrim: string;
  /** The chef's hat. */
  hat: string;
  hatShade: string;
}

/**
 * Crumb is the colour of fresh dough.
 *
 * That is not decoration — it is the same idea as the sibling MVP's mascot being made of starlight.
 * The character is literally made of the material the game is about, so growing brighter and
 * rounder as the child bakes more is a visual promise the art keeps for free.
 */
export const DEFAULT_PALETTE: CrumbPalette = {
  bodyTop: "#F7D9A8",
  bodyBottom: "#DFA967",
  belly: "#FFF3DE",
  ear: "#EFC48D",
  eye: "#3A2113",
  glow: "#FFD08A",
  sprinkle: "#FFB3D1",
  apron: "#FFF6E6",
  apronTrim: "#E4785F",
  hat: "#FFFBF2",
  hatShade: "#E9D9BE",
};

/** The sprinkle colours that tumble around Crumb — a whole jar's worth, not one hue. */
const SPRINKLE_COLORS = ["#FF9EC4", "#FFD166", "#8FD9A8", "#8FC6FF", "#FFFFFF"];

/**
 * Crumb.
 *
 * Procedurally drawn and skeletally animated rather than a sprite sheet. Every part sits on its
 * own spring, so the character is *never* in a static pose: it breathes, blinks on a natural
 * cadence, tracks whatever the child is touching with its eyes, squashes when it lands, and shifts
 * emotional state in response to gameplay. That constant micro-motion is what makes a mascot read
 * as alive rather than as clip-art, and it is the thing a static illustration can never do.
 *
 * The rig is shared with the sibling MVP's Pipkin — the springs, the blink cycle, the overlapping
 * ear action, the look-at, the extents API. What changed is the sculpt: rounder ears, a toque that
 * squashes with the body, an apron, and a tumbling ring of sprinkles instead of orbiting motes of
 * starlight.
 */
export class Crumb {
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
  /** The hat's puff lags behind the head too, so it wobbles when Crumb hops. */
  private hatWobble = new Spring(0, { duration: 0.6, bounce: 0.6 });

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
  palette: CrumbPalette = { ...DEFAULT_PALETTE };
  /** Number of orbiting sprinkles — the visible representation of progress. */
  sprinkleCount = 3;
  private sprinklePhase = 0;

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
    this.hatWobble.impulse(-6);
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
    this.hatWobble.impulse(-14);
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
    this.hatWobble.set(-this.headX.value * 3.2 - this.lean.value * 5).step(dt);

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

    this.sprinklePhase += dt * 0.7;
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
   * of guessing a viewport fraction and hoping. The top extent includes the hat, which is the whole
   * reason it is a getter and not a constant.
   */
  get topExtent(): number {
    return 134 * this.scale;
  }

  get bottomExtent(): number {
    return 76 * this.scale;
  }

  /** Total drawn height, useful for choosing a scale that fits a reserved band. */
  get drawnHeight(): number {
    return this.topExtent + this.bottomExtent;
  }

  draw(ctx: CanvasRenderingContext2D): void {
    const s = this.scale;
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
    this.drawOrbitingSprinkles(ctx, bodyW, bodyH);
    this.drawTail(ctx, bodyW, bodyH);
    this.drawBody(ctx, bodyW, bodyH);
    this.drawEars(ctx, bodyW, bodyH);
    this.drawHat(ctx, bodyW, bodyH);
    this.drawApron(ctx, bodyW, bodyH);
    this.drawFace(ctx, bodyW, bodyH);
    this.drawFeet(ctx, bodyW, bodyH);

    ctx.restore();
  }

  private drawAura(ctx: CanvasRenderingContext2D, bodyW: number, bodyH: number): void {
    const pulse = 1 + Math.sin(this.t * 1.2) * 0.06;
    const strength = 0.42 + this.glowBoost;
    glow(ctx, 0, -bodyH * 0.1, bodyW * 2.5 * pulse, this.palette.glow, clamp01(strength) * 0.55);
  }

  /**
   * The ring of sprinkles.
   *
   * Drawn as little tumbling capsules rather than four-point sparkles: a sparkle reads as magic,
   * a capsule reads as something you'd shake out of a jar onto a cake. Same motion, completely
   * different genre.
   */
  private drawOrbitingSprinkles(ctx: CanvasRenderingContext2D, bodyW: number, bodyH: number): void {
    const count = clamp(this.sprinkleCount, 0, 12);
    for (let i = 0; i < count; i++) {
      const ratio = i / Math.max(count, 1);
      const angle = this.sprinklePhase * (0.6 + (i % 3) * 0.16) + ratio * Math.PI * 2;
      const radiusX = bodyW * (1.35 + (i % 3) * 0.16);
      const radiusY = bodyH * (0.75 + (i % 2) * 0.2);
      const px = Math.cos(angle) * radiusX;
      const py = Math.sin(angle * 1.3) * radiusY - bodyH * 0.25;
      // Sprinkles behind the body are dimmer — cheap depth cue.
      const depth = (Math.sin(angle) + 1) / 2;
      const alpha = 0.4 + depth * 0.6;
      const len = 3.4 + depth * 2.6;
      const color = SPRINKLE_COLORS[i % SPRINKLE_COLORS.length];

      glow(ctx, px, py, len * 4.2, color, alpha * 0.4);
      ctx.save();
      ctx.translate(px, py);
      ctx.rotate(angle * 2.1 + i);
      ctx.strokeStyle = withAlpha(color, alpha);
      ctx.lineWidth = len * 0.62;
      ctx.lineCap = "round";
      ctx.beginPath();
      ctx.moveTo(-len, 0);
      ctx.lineTo(len, 0);
      ctx.stroke();
      ctx.restore();
    }
  }

  /** A small round tail, mostly there to catch the light and sell the volume of the body. */
  private drawTail(ctx: CanvasRenderingContext2D, bodyW: number, bodyH: number): void {
    const wag = Math.sin(this.t * 3.1 + this.lean.value * 2) * 0.2 + this.lean.value;
    ctx.save();
    ctx.translate(bodyW * 0.86, bodyH * 0.3 + wag * 3);
    ctx.fillStyle = this.palette.ear;
    ctx.beginPath();
    ctx.arc(0, 0, bodyW * 0.16, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = withAlpha("#FFFFFF", 0.25);
    ctx.beginPath();
    ctx.arc(-bodyW * 0.04, -bodyW * 0.05, bodyW * 0.07, 0, Math.PI * 2);
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

    // Underside light. A *soft radial* rather than a hard ellipse: a crisp white oval here reads as
    // a muzzle or a face-mask sitting over the features.
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

    // Rim light along the upper-left, as a soft gradient stroke rather than a solid white arc,
    // which would read as the hard edge of a helmet.
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    const rim = ctx.createLinearGradient(-bodyW, -bodyH, bodyW * 0.3, bodyH * 0.2);
    rim.addColorStop(0, withAlpha("#FFFFFF", 0.3));
    rim.addColorStop(1, withAlpha("#FFFFFF", 0));
    ctx.strokeStyle = rim;
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.ellipse(0, 0, bodyW - 1.2, bodyH - 1.2, 0, Math.PI * 1.02, Math.PI * 1.72);
    ctx.stroke();
    ctx.restore();
  }

  /** Round, low-set ears. Soft curves read as "cub"; the tall pointed ears read as "sprite". */
  private drawEars(ctx: CanvasRenderingContext2D, bodyW: number, bodyH: number): void {
    const draw = (side: -1 | 1, spring: Spring) => {
      ctx.save();
      const baseX = side * bodyW * 0.66;
      const baseY = -bodyH * 0.66;
      ctx.translate(baseX, baseY);
      ctx.rotate(side * (0.1 + this.earTilt) + spring.value * 0.05);
      const r = bodyW * 0.26;
      const g = ctx.createLinearGradient(0, r, 0, -r);
      g.addColorStop(0, this.palette.ear);
      g.addColorStop(1, this.palette.bodyTop);
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(0, 0, r, 0, Math.PI * 2);
      ctx.fill();
      // Inner ear
      ctx.fillStyle = withAlpha("#E9A6A0", 0.55);
      ctx.beginPath();
      ctx.ellipse(side * -r * 0.08, r * 0.06, r * 0.5, r * 0.52, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    };
    draw(-1, this.earL);
    draw(1, this.earR);
  }

  /**
   * The chef's toque.
   *
   * Crumb's one accessory, and the entire reason the character reads as a baker within the first
   * frame. It is rigged, not pinned: the puff lags the head on its own spring, so it wobbles half a
   * beat behind every hop. That lag is doing all the work — a hat that moves in perfect lockstep
   * with the head looks painted on.
   */
  private drawHat(ctx: CanvasRenderingContext2D, bodyW: number, bodyH: number): void {
    const hx = this.headX.value * bodyW * 0.14;
    const wob = this.hatWobble.value * 0.01;
    ctx.save();
    ctx.translate(hx, -bodyH * 0.92);
    ctx.rotate(wob);

    const bandW = bodyW * 0.86;
    const bandH = bodyH * 0.2;

    // Puff: three overlapping domes, biggest in the middle.
    ctx.fillStyle = this.palette.hat;
    ctx.beginPath();
    ctx.ellipse(-bandW * 0.42, -bandH * 1.25, bandW * 0.36, bandH * 1.05, 0, 0, Math.PI * 2);
    ctx.ellipse(bandW * 0.42, -bandH * 1.25, bandW * 0.36, bandH * 1.05, 0, 0, Math.PI * 2);
    ctx.ellipse(0, -bandH * 1.85, bandW * 0.46, bandH * 1.35, 0, 0, Math.PI * 2);
    ctx.fill();

    // Soft shading under the puff so it sits on the band rather than floating above it.
    ctx.fillStyle = withAlpha(this.palette.hatShade, 0.55);
    ctx.beginPath();
    ctx.ellipse(0, -bandH * 0.42, bandW * 0.52, bandH * 0.42, 0, 0, Math.PI * 2);
    ctx.fill();

    // Band
    ctx.fillStyle = this.palette.hat;
    ctx.beginPath();
    ctx.ellipse(0, -bandH * 0.1, bandW * 0.5, bandH * 0.62, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = withAlpha(this.palette.hatShade, 0.8);
    ctx.lineWidth = Math.max(1, bodyW * 0.022);
    ctx.beginPath();
    ctx.ellipse(0, -bandH * 0.1, bandW * 0.5, bandH * 0.62, 0, 0, Math.PI * 2);
    ctx.stroke();

    // Highlight
    ctx.fillStyle = withAlpha("#FFFFFF", 0.6);
    ctx.beginPath();
    ctx.ellipse(-bandW * 0.16, -bandH * 2.2, bandW * 0.16, bandH * 0.34, -0.4, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  /** The apron. Drawn over the belly, under the face, so it never crowds the expression. */
  private drawApron(ctx: CanvasRenderingContext2D, bodyW: number, bodyH: number): void {
    ctx.save();
    ctx.beginPath();
    ctx.ellipse(0, 0, bodyW, bodyH, 0, 0, Math.PI * 2);
    ctx.clip();

    // Bib + skirt as one rounded shape.
    ctx.fillStyle = withAlpha(this.palette.apron, 0.94);
    ctx.beginPath();
    ctx.moveTo(-bodyW * 0.3, bodyH * 0.38);
    ctx.lineTo(bodyW * 0.3, bodyH * 0.38);
    ctx.quadraticCurveTo(bodyW * 0.56, bodyH * 0.62, bodyW * 0.54, bodyH * 1.1);
    ctx.lineTo(-bodyW * 0.54, bodyH * 1.1);
    ctx.quadraticCurveTo(-bodyW * 0.56, bodyH * 0.62, -bodyW * 0.3, bodyH * 0.38);
    ctx.closePath();
    ctx.fill();

    // Waist tie
    ctx.strokeStyle = this.palette.apronTrim;
    ctx.lineWidth = bodyW * 0.075;
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(-bodyW * 0.62, bodyH * 0.46);
    ctx.quadraticCurveTo(0, bodyH * 0.55, bodyW * 0.62, bodyH * 0.46);
    ctx.stroke();

    // Trim along the top edge of the bib.
    //
    // This is where shoulder straps *would* go, and where an earlier build put them — but this is a
    // one-circle character with no shoulders, so anything routed "over" them runs straight across
    // the cheeks and reads as a scar. The expression is the whole point of the rig; nothing is
    // allowed above the chin.
    ctx.lineWidth = bodyW * 0.04;
    ctx.beginPath();
    ctx.moveTo(-bodyW * 0.3, bodyH * 0.39);
    ctx.lineTo(bodyW * 0.3, bodyH * 0.39);
    ctx.stroke();

    // A dusting of flour on the apron, because of course there is.
    ctx.fillStyle = withAlpha("#FFFFFF", 0.5);
    for (const [fx, fy, fr] of [
      [-0.2, 0.66, 0.035],
      [0.14, 0.78, 0.028],
      [-0.02, 0.58, 0.022],
      [0.3, 0.6, 0.02],
    ] as [number, number, number][]) {
      ctx.beginPath();
      ctx.arc(fx * bodyW, fy * bodyH, fr * bodyW, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
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
      ctx.fillStyle = withAlpha("#F08A7A", this.cheek * 0.5);
      ctx.beginPath();
      ctx.ellipse(side * bodyW * 0.5, eyeY + eyeR * 1.5, bodyW * 0.13, bodyW * 0.08, 0, 0, Math.PI * 2);
      ctx.fill();
    }

    // A small round snout, which is what turns two dots and a mouth into a face with a species.
    ctx.fillStyle = withAlpha(this.palette.belly, 0.75);
    ctx.beginPath();
    ctx.ellipse(0, bodyH * 0.16, bodyW * 0.24, bodyH * 0.15, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = withAlpha(this.palette.eye, 0.9);
    ctx.beginPath();
    ctx.ellipse(0, bodyH * 0.08, bodyW * 0.07, bodyH * 0.05, 0, 0, Math.PI * 2);
    ctx.fill();

    // Mouth: a single quadratic whose control point encodes the smile, opening into an ellipse.
    const my = bodyH * 0.26;
    const mw = bodyW * 0.22;
    ctx.strokeStyle = this.palette.eye;
    ctx.lineWidth = bodyW * 0.05;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    if (this.mouthOpen > 0.25) {
      ctx.fillStyle = "#5A2418";
      ctx.beginPath();
      ctx.ellipse(0, my + mw * 0.2, mw * 0.8, mw * this.mouthOpen * 0.95, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = withAlpha("#F08A7A", 0.85);
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
   * Draw Crumb at an arbitrary place/size without disturbing the world position — used for avatars
   * in the HUD and for the profile picker.
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
 * Room tinting.
 *
 * Only the *glow* and the eye's darkest tone take the room's colour. Crumb's dough stays the same
 * everywhere, because a character whose colour changes per level has no identity — it reads as a UI
 * element being re-skinned rather than as someone working alongside you.
 */
export function paletteForRoom(accent: string, deep: string): CrumbPalette {
  return { ...DEFAULT_PALETTE, eye: deep, glow: accent };
}

export { lerp };
