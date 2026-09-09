import { clamp01 } from "./spring";

/**
 * Fully synthesised audio. Nothing is streamed or bundled, which means:
 *  - no sample licensing cost or attribution burden,
 *  - no download weight (the reference app is a 270 MB binary, largely assets),
 *  - every sound can be parameterised by game state (pitch rises with a streak, timbre changes
 *    per room), which pre-baked samples cannot do.
 *
 * Design intent: warm, soft-attack tones on a pentatonic scale so nothing can ever sound "wrong"
 * against anything else, and so a run of correct answers plays as a rising melody rather than the
 * same beep repeated. Incorrect answers get a *gentle downward* two-note figure — never a buzzer.
 */

// Pentatonic (major) degrees in semitones. Any subset played in any order stays consonant.
const PENTATONIC = [0, 2, 4, 7, 9, 12, 14, 16, 19, 21, 24];
const BASE_HZ = 261.63; // C4

function semitoneToHz(semitones: number): number {
  return BASE_HZ * Math.pow(2, semitones / 12);
}

class AudioEngine {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private musicBus: GainNode | null = null;
  private sfxBus: GainNode | null = null;
  private ambientNodes: { osc: OscillatorNode; gain: GainNode; lfo?: OscillatorNode }[] = [];
  private unlocked = false;

  muted = false;

  /**
   * Browsers require a user gesture before audio can start. Called from the first pointer/key
   * event; safe to call repeatedly.
   */
  unlock(): void {
    if (this.unlocked) return;
    try {
      const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!Ctor) return;
      this.ctx = new Ctor();
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.9;
      this.master.connect(this.ctx.destination);

      this.musicBus = this.ctx.createGain();
      this.musicBus.gain.value = 0.0;
      this.musicBus.connect(this.master);

      this.sfxBus = this.ctx.createGain();
      this.sfxBus.gain.value = 0.85;
      this.sfxBus.connect(this.master);

      this.unlocked = true;
    } catch {
      // Audio is a progressive enhancement; a failure here must never break gameplay.
      this.unlocked = false;
    }
    void this.ctx?.resume();
  }

  private get ready(): boolean {
    return this.unlocked && !!this.ctx && !this.muted;
  }

  /** Core voice: a soft-attack sine/triangle blend with a gentle lowpass, so nothing is harsh. */
  private voice(
    hz: number,
    opts: {
      duration?: number;
      gain?: number;
      type?: OscillatorType;
      attack?: number;
      delay?: number;
      detune?: number;
      bus?: GainNode | null;
      filterHz?: number;
    } = {}
  ): void {
    if (!this.ready || !this.ctx) return;
    const ctx = this.ctx;
    const now = ctx.currentTime + (opts.delay ?? 0);
    const duration = opts.duration ?? 0.35;
    const peak = opts.gain ?? 0.2;
    const attack = opts.attack ?? 0.012;

    const osc = ctx.createOscillator();
    osc.type = opts.type ?? "sine";
    osc.frequency.value = hz;
    if (opts.detune) osc.detune.value = opts.detune;

    const filter = ctx.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.value = opts.filterHz ?? 2600;
    filter.Q.value = 0.6;

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), now + attack);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);

    osc.connect(filter);
    filter.connect(gain);
    gain.connect(opts.bus ?? this.sfxBus ?? ctx.destination);

    osc.start(now);
    osc.stop(now + duration + 0.05);
  }

  /** Short filtered-noise burst, used for sparkle/whoosh textures. */
  private noise(opts: { duration?: number; gain?: number; hz?: number; delay?: number; q?: number } = {}): void {
    if (!this.ready || !this.ctx) return;
    const ctx = this.ctx;
    const duration = opts.duration ?? 0.25;
    const now = ctx.currentTime + (opts.delay ?? 0);
    const frames = Math.floor(ctx.sampleRate * duration);
    const buffer = ctx.createBuffer(1, frames, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < frames; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / frames);

    const src = ctx.createBufferSource();
    src.buffer = buffer;

    const filter = ctx.createBiquadFilter();
    filter.type = "bandpass";
    filter.frequency.value = opts.hz ?? 3200;
    filter.Q.value = opts.q ?? 1.2;

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(opts.gain ?? 0.12, now);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);

    src.connect(filter);
    filter.connect(gain);
    gain.connect(this.sfxBus ?? ctx.destination);
    src.start(now);
  }

  // ---------------------------------------------------------------- public sounds

  /** Soft, low-cost tick for taps. Deliberately tiny — this fires constantly. */
  tap(): void {
    this.voice(semitoneToHz(19), { duration: 0.07, gain: 0.06, type: "sine", filterHz: 1800 });
  }

  /** Keypad digit press — pitch rises slightly across a multi-digit entry. */
  key(index = 0): void {
    this.voice(semitoneToHz(12 + Math.min(index, 4)), { duration: 0.09, gain: 0.09, type: "triangle", filterHz: 2200 });
  }

  /** Navigation/confirm. */
  select(): void {
    this.voice(semitoneToHz(7), { duration: 0.16, gain: 0.13, type: "triangle" });
    this.voice(semitoneToHz(14), { duration: 0.22, gain: 0.08, type: "sine", delay: 0.045 });
  }

  back(): void {
    this.voice(semitoneToHz(9), { duration: 0.14, gain: 0.1, type: "triangle" });
    this.voice(semitoneToHz(4), { duration: 0.2, gain: 0.08, type: "sine", delay: 0.05 });
  }

  /**
   * Correct answer. `streak` walks up the pentatonic scale so consecutive correct answers play a
   * rising melody — the single most effective bit of audio design in a practice loop, because the
   * child *hears* their run getting better.
   */
  correct(streak = 0): void {
    const degree = PENTATONIC[Math.min(streak, PENTATONIC.length - 1)];
    this.voice(semitoneToHz(degree), { duration: 0.3, gain: 0.16, type: "triangle" });
    this.voice(semitoneToHz(degree + 7), { duration: 0.42, gain: 0.1, type: "sine", delay: 0.055 });
    this.noise({ duration: 0.3, gain: 0.05, hz: 5200 + streak * 260, delay: 0.02 });
  }

  /**
   * Not-yet-correct. A soft, low, *descending* pair — reads as "hmm, try again", never as a
   * failure buzzer. Reviews of the reference app specifically called out its harsh feedback.
   */
  softMiss(): void {
    this.voice(semitoneToHz(2), { duration: 0.22, gain: 0.1, type: "sine", filterHz: 1200 });
    this.voice(semitoneToHz(-3), { duration: 0.3, gain: 0.09, type: "sine", delay: 0.08, filterHz: 1000 });
  }

  /** A treat coming out of the oven and landing on the shelf. */
  treatBaked(index = 0): void {
    const degree = PENTATONIC[Math.min(index + 3, PENTATONIC.length - 1)];
    this.voice(semitoneToHz(degree + 12), { duration: 0.5, gain: 0.11, type: "sine" });
    this.noise({ duration: 0.5, gain: 0.05, hz: 6400, q: 2 });
  }

  /** A recipe finished — the big moment. An arpeggio that resolves upward. */
  fanfare(): void {
    const notes = [0, 4, 7, 12, 16, 19];
    notes.forEach((n, i) => {
      this.voice(semitoneToHz(n), { duration: 0.7, gain: 0.14, type: "triangle", delay: i * 0.075 });
      this.voice(semitoneToHz(n + 12), { duration: 0.6, gain: 0.07, type: "sine", delay: i * 0.075 + 0.02 });
    });
    this.noise({ duration: 0.9, gain: 0.06, hz: 4200, q: 0.8, delay: 0.1 });
  }

  /** Crumb hopping / landing. */
  hop(): void {
    this.voice(semitoneToHz(12), { duration: 0.12, gain: 0.08, type: "sine" });
    this.voice(semitoneToHz(19), { duration: 0.16, gain: 0.05, type: "sine", delay: 0.06 });
  }

  /** Sprinkles being collected — a quick ascending flurry. */
  collect(count = 3): void {
    for (let i = 0; i < Math.min(count, 6); i++) {
      this.voice(semitoneToHz(PENTATONIC[Math.min(i + 4, PENTATONIC.length - 1)] + 12), {
        duration: 0.18,
        gain: 0.08,
        type: "sine",
        delay: i * 0.05,
      });
    }
  }

  // ---------------------------------------------------------------- ambience

  /**
   * A slow, barely-there drone bed that gives each room its own emotional colour. Two detuned
   * oscillators plus a slow LFO on the filter — enough to feel like "somewhere", cheap enough to
   * run forever.
   */
  startAmbience(rootSemitone = -12): void {
    if (!this.ready || !this.ctx || !this.musicBus) return;
    this.stopAmbience();
    const ctx = this.ctx;

    for (const [i, offset] of [0, 7, 12].entries()) {
      const osc = ctx.createOscillator();
      osc.type = i === 2 ? "sine" : "triangle";
      osc.frequency.value = semitoneToHz(rootSemitone + offset);
      osc.detune.value = (i - 1) * 6;

      const filter = ctx.createBiquadFilter();
      filter.type = "lowpass";
      filter.frequency.value = 700;

      const gain = ctx.createGain();
      gain.gain.value = i === 2 ? 0.05 : 0.09;

      // Slow breathing motion so the pad is never static.
      const lfo = ctx.createOscillator();
      lfo.frequency.value = 0.05 + i * 0.017;
      const lfoGain = ctx.createGain();
      lfoGain.gain.value = 180;
      lfo.connect(lfoGain);
      lfoGain.connect(filter.frequency);

      osc.connect(filter);
      filter.connect(gain);
      gain.connect(this.musicBus);
      osc.start();
      lfo.start();
      this.ambientNodes.push({ osc, gain, lfo });
    }

    // Fade the bed in slowly; an abrupt drone start is jarring.
    this.musicBus.gain.cancelScheduledValues(ctx.currentTime);
    this.musicBus.gain.setValueAtTime(0.0001, ctx.currentTime);
    this.musicBus.gain.linearRampToValueAtTime(0.5, ctx.currentTime + 2.5);
  }

  stopAmbience(): void {
    if (!this.ctx) return;
    const ctx = this.ctx;
    if (this.musicBus) {
      this.musicBus.gain.cancelScheduledValues(ctx.currentTime);
      this.musicBus.gain.linearRampToValueAtTime(0.0001, ctx.currentTime + 0.6);
    }
    const nodes = this.ambientNodes;
    this.ambientNodes = [];
    setTimeout(() => {
      for (const n of nodes) {
        try {
          n.osc.stop();
          n.lfo?.stop();
        } catch {
          /* already stopped */
        }
      }
    }, 800);
  }

  setMuted(muted: boolean): void {
    this.muted = muted;
    if (this.master && this.ctx) {
      this.master.gain.linearRampToValueAtTime(muted ? 0.0001 : 0.9, this.ctx.currentTime + 0.15);
    }
  }

  setMusicLevel(level: number): void {
    if (this.musicBus && this.ctx) {
      this.musicBus.gain.linearRampToValueAtTime(clamp01(level) * 0.5 + 0.0001, this.ctx.currentTime + 0.4);
    }
  }
}

export const audio = new AudioEngine();
