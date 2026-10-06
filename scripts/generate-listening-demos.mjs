import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

// Small original instrumental sketches. No third-party recordings or melodies are used.
const sampleRate = 32000;
const duration = 80;
const output = path.resolve("public/audio");
await mkdir(output, { recursive: true });
const frequency = (midi) => 440 * 2 ** ((midi - 69) / 12);
const presets = [
  { name: "cloud-letter", bpm: 72, root: 48, chords: [[0, 4, 7, 11], [9, 12, 16, 19], [5, 9, 12, 16], [7, 11, 14, 17]], melody: [12, 16, 19, 23, 19, 16, 14, 12], drums: 0.025 },
  { name: "little-orbit", bpm: 84, root: 45, chords: [[0, 3, 7, 10], [5, 8, 12, 15], [8, 12, 15, 19], [7, 10, 14, 17]], melody: [12, 15, 19, 22, 19, 17, 15, 10], drums: 0.12 },
  { name: "night-signal", bpm: 90, root: 43, chords: [[0, 3, 7, 14], [8, 12, 15, 19], [5, 8, 12, 15], [10, 14, 17, 21]], melody: [12, 19, 22, 19, 15, 14, 10, 7], drums: 0.075 },
];

for (const preset of presets) {
  const mix = new Float32Array(sampleRate * duration);
  const beat = 60 / preset.bpm;
  let seed = 37;
  function noise() { seed = (Math.imul(seed, 1664525) + 1013904223) | 0; return (seed >>> 0) / 2147483648 - 1; }
  function note(at, length, midi, gain, voice) {
    const start = Math.floor(at * sampleRate);
    const frames = Math.min(Math.floor(length * sampleRate), mix.length - start);
    const hz = frequency(midi);
    for (let i = 0; i < frames; i++) {
      const t = i / sampleRate;
      const phase = Math.PI * 2 * hz * t;
      const envelope = voice === "pad"
        ? Math.min(1, t / 0.75) * Math.min(1, (length - t) / 1.1)
        : (1 - Math.exp(-t * 120)) * Math.exp(-t / (voice === "bass" ? 0.55 : 0.95));
      const wave = voice === "pad"
        ? (Math.sin(phase) + 0.26 * Math.sin(phase * 1.0015) + 0.12 * Math.sin(phase * 2)) / 1.38
        : Math.sin(phase) + 0.22 * Math.sin(phase * 2) * Math.exp(-t * 3) + 0.07 * Math.sin(phase * 3);
      mix[start + i] += gain * envelope * wave;
    }
  }
  const bars = Math.ceil(duration / (beat * 4));
  for (let bar = 0; bar < bars; bar++) {
    const at = bar * beat * 4;
    const chord = preset.chords[bar % preset.chords.length];
    for (const interval of chord) note(at, beat * 4 + 1.5, preset.root + interval, 0.039, "pad");
    for (let step = 0; step < 4; step++) {
      const melody = preset.melody[(bar * 4 + step) % preset.melody.length];
      note(at + step * beat + beat * 0.1, 3, preset.root + melody, 0.11, "bell");
      note(at + step * beat + beat * 0.85, 2, preset.root + melody, 0.021, "bell");
    }
    if (bar > 1 && at < duration - 7) {
      note(at, 1.9, preset.root + chord[0] - 12, 0.105, "bass");
      note(at + beat * 2, 1.7, preset.root + chord[0] - 12, 0.07, "bass");
      for (let step = 0; step < 8; step++) {
        const start = Math.floor((at + step * beat * 0.5) * sampleRate);
        for (let i = 0; i < sampleRate * 0.16 && start + i < mix.length; i++) {
          const t = i / sampleRate;
          mix[start + i] += noise() * Math.exp(-t * 70) * preset.drums * (step % 2 ? 0.24 : 0.38);
        }
      }
      for (const step of [0, 2]) {
        const start = Math.floor((at + step * beat) * sampleRate);
        for (let i = 0; i < sampleRate * 0.28 && start + i < mix.length; i++) {
          const t = i / sampleRate;
          mix[start + i] += Math.sin(Math.PI * 2 * (44 * t + 1.4 * (1 - Math.exp(-t * 30)))) * Math.exp(-t * 17) * preset.drums;
        }
      }
    }
  }
  // A soft, single-tap room echo and gentle entry/exit avoid sudden loud edges.
  const delay = Math.floor(beat * 0.75 * sampleRate);
  for (let i = mix.length - 1; i >= delay; i--) mix[i] += mix[i - delay] * 0.14;
  const wav = Buffer.alloc(44 + mix.length * 2);
  wav.write("RIFF", 0); wav.writeUInt32LE(wav.length - 8, 4); wav.write("WAVEfmt ", 8);
  wav.writeUInt32LE(16, 16); wav.writeUInt16LE(1, 20); wav.writeUInt16LE(1, 22);
  wav.writeUInt32LE(sampleRate, 24); wav.writeUInt32LE(sampleRate * 2, 28);
  wav.writeUInt16LE(2, 32); wav.writeUInt16LE(16, 34); wav.write("data", 36); wav.writeUInt32LE(mix.length * 2, 40);
  for (let i = 0; i < mix.length; i++) {
    const t = i / sampleRate;
    const fade = Math.min(1, t / 2.5, (duration - t) / 5);
    wav.writeInt16LE(Math.round(Math.tanh(mix[i] * 1.4) * 0.8 * fade * 32767), 44 + i * 2);
  }
  await writeFile(path.join(output, preset.name + ".wav"), wav);
  console.log(preset.name + ": " + duration + "s original instrumental");
}
