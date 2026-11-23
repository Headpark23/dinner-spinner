/**
 * Dinner Spinner sound design (Web Audio API). Fully self-contained, offline-ready.
 *
 * Soft and wooden rather than arcade: only sine/triangle tones with a gentle attack,
 * everything routed through one low-pass filter and a quiet master volume. No sawtooth
 * or square waves, so nothing buzzes or rasps.
 */

interface ToneOptions {
  freq: number;
  /** Glide to this frequency over the tone's length. */
  freqEnd?: number;
  /** Seconds. */
  dur: number;
  gain: number;
  /** Seconds from now. */
  delay?: number;
  type?: OscillatorType;
}

const MASTER_VOLUME = 0.55;
const ATTACK = 0.006; // a short fade-in stops the harsh "click" at the start of a tone

class SoundEngine {
  private ctx: AudioContext | null = null;
  private out: GainNode | null = null;
  private muted: boolean = false;

  private getContext(): AudioContext | null {
    if (this.muted) return null;
    try {
      if (!this.ctx) {
        const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
        this.ctx = new AudioCtx();
        // master volume -> low-pass (takes the edge off) -> gentle limiter -> speakers
        const master = this.ctx.createGain();
        master.gain.value = MASTER_VOLUME;
        const lowpass = this.ctx.createBiquadFilter();
        lowpass.type = 'lowpass';
        lowpass.frequency.value = 2400;
        lowpass.Q.value = 0.3;
        const limiter = this.ctx.createDynamicsCompressor();
        limiter.threshold.value = -18;
        limiter.ratio.value = 6;
        master.connect(lowpass);
        lowpass.connect(limiter);
        limiter.connect(this.ctx.destination);
        this.out = master;
      }
      if (this.ctx.state === 'suspended') {
        this.ctx.resume();
      }
      return this.ctx;
    } catch (e) {
      return null;
    }
  }

  private tone({ freq, freqEnd, dur, gain, delay = 0, type = 'sine' }: ToneOptions) {
    const ctx = this.getContext();
    if (!ctx || !this.out) return;
    const t0 = ctx.currentTime + delay;
    const osc = ctx.createOscillator();
    const env = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t0);
    if (freqEnd) osc.frequency.exponentialRampToValueAtTime(freqEnd, t0 + dur);
    env.gain.setValueAtTime(0.0001, t0);
    env.gain.linearRampToValueAtTime(gain, t0 + ATTACK);
    env.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    osc.connect(env);
    env.connect(this.out);
    osc.start(t0);
    osc.stop(t0 + dur + 0.02);
  }

  public toggleMute(): boolean {
    this.muted = !this.muted;
    return this.muted;
  }

  public isMuted(): boolean {
    return this.muted;
  }

  // A soft wooden tick as the reel steps past each dish.
  public playReelTick() {
    this.tone({ freq: 620 + Math.random() * 60, freqEnd: 360, dur: 0.035, gain: 0.05, type: 'triangle' });
  }

  // The reel settling: a low, muffled thud.
  public playReelLock() {
    this.tone({ freq: 150, freqEnd: 70, dur: 0.16, gain: 0.16 });
  }

  // Lever pull: one smooth downward sweep instead of a rattle of beeps.
  public playLeverPull() {
    this.tone({ freq: 260, freqEnd: 120, dur: 0.14, gain: 0.1, type: 'triangle' });
  }

  // Hold button: a soft, short pop.
  public playHold() {
    this.tone({ freq: 520, freqEnd: 600, dur: 0.07, gain: 0.07 });
  }

  // Nudge: a light two-note "step".
  public playNudge() {
    this.tone({ freq: 440, dur: 0.06, gain: 0.07 });
    this.tone({ freq: 523.25, dur: 0.09, gain: 0.07, delay: 0.05 });
  }

  // Result chime: three gentle rising bell tones, played once, not a fanfare.
  public playWin() {
    [523.25, 659.25, 783.99].forEach((freq, i) => {
      this.tone({ freq, dur: 0.55, gain: 0.07, delay: i * 0.11 });
      this.tone({ freq: freq * 2, dur: 0.3, gain: 0.015, delay: i * 0.11 }); // faint overtone for a bell-like shine
    });
  }

  // Kitchen closed: a polite two-note doorbell.
  public playTakeawayAlarm() {
    this.tone({ freq: 659.25, dur: 0.4, gain: 0.09 });
    this.tone({ freq: 523.25, dur: 0.5, gain: 0.09, delay: 0.28 });
  }

  // Veto: a short, low, soft "nope", not a buzzer.
  public playBuzzer() {
    this.tone({ freq: 220, freqEnd: 165, dur: 0.22, gain: 0.1, type: 'triangle' });
  }
}

export const sound = new SoundEngine();
