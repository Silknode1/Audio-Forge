export interface AudioConfig {
  // Frequency Shaping
  highpassFreq: number; // Rumble Cutoff
  lowpassFreq: number; // Clarity Ceiling
  
  // Sibilance
  deesserFreq: number;
  deesserAmount: number; // 0 (Off) to 1 (Heavy)
  
  // Dynamics
  noiseReduction: number; // 0 (Off) to 1 (Aggressive)
  compressionAmount: number; // 0 (Natural) to 1 (Broadcast)
  
  // Loudness
  loudnormTarget: number; // LUFS
  loudnormTp: number; // True Peak dB
  loudnormLra: number; // Loudness Range
  
  // Output
  bitrate: number;
  flacCompressionLevel: number;
}

export type AppMode = 'upload' | 'dashboard' | 'studio' | 'export';

export interface AudioAnalysis {
  estLufs: number; // Estimated RMS/Loudness
  peak: number;    // True Peak dB
  noiseFloor: number; // Estimated Noise Floor dB
  duration: number; // Seconds
  sampleRate: number;
  isEst: boolean;   // Is this an estimate or full scan?
}

export const DEFAULT_CONFIG: AudioConfig = {
  highpassFreq: 80,
  lowpassFreq: 12000, // Default open, prompt suggested 3800 for specific "Voice Impact" but 12k is safer default
  deesserFreq: 6000,
  deesserAmount: 0.5, // Moderate
  noiseReduction: 0.2, // Light/Moderate equivalent
  compressionAmount: 0.3, // Audiobook preset equivalent
  loudnormTarget: -19,
  loudnormTp: -3.0,
  loudnormLra: 11,
  bitrate: 128,
  flacCompressionLevel: 6,
};

export interface AudioPreset {
  id: string;
  name: string;
  description: string;
  config: Partial<AudioConfig>;
}

export const PRESETS: AudioPreset[] = [
  {
    id: 'acx',
    name: 'ACX Standard',
    description: 'Meets Audible requirements (-19 LUFS, -3dB TP)',
    config: {
      loudnormTarget: -20, // Aim slightly lower to be safe
      loudnormTp: -3.0,
      highpassFreq: 80,
      compressionAmount: 0.3
    }
  },
  {
    id: 'warm',
    name: 'Warm Narrator',
    description: 'Enhanced low-mids, gentle processing',
    config: {
      highpassFreq: 60,
      lowpassFreq: 8000,
      compressionAmount: 0.2,
      loudnormTarget: -20
    }
  },
  {
    id: 'clear',
    name: 'Crystal Clear',
    description: 'Bright and articulate, good for non-fiction',
    config: {
      highpassFreq: 90,
      lowpassFreq: 14000,
      deesserAmount: 0.7,
      compressionAmount: 0.4
    }
  },
  {
    id: 'home',
    name: 'Home Studio Fix',
    description: 'Heavier noise reduction for untreated rooms',
    config: {
      noiseReduction: 0.6,
      highpassFreq: 100,
      compressionAmount: 0.5
    }
  },
  {
    id: 'radio',
    name: 'Radio Ready',
    description: 'Compressed, punchy, loud',
    config: {
      loudnormTarget: -16,
      loudnormTp: -1.0,
      compressionAmount: 0.8,
      lowpassFreq: 10000
    }
  }
];

export const RANGES = {
  highpassFreq: { min: 20, max: 200, step: 5, label: "Rumble Cutoff (Hz)" },
  lowpassFreq: { min: 2000, max: 16000, step: 100, label: "Clarity Ceiling (Hz)" },
  deesserFreq: { min: 4000, max: 8000, step: 100, label: "Sibilance Freq (Hz)" },
  deesserAmount: { min: 0, max: 1, step: 0.1, label: "De-esser Strength" },
  noiseReduction: { min: 0, max: 1, step: 0.05, label: "Noise Reduction" },
  compressionAmount: { min: 0, max: 1, step: 0.1, label: "Compression Style" },
  loudnormTarget: { min: -30, max: -14, step: 0.5, label: "LUFS Target" },
  loudnormTp: { min: -6.0, max: -0.1, step: 0.1, label: "True Peak Limit (dB)" },
  bitrate: { min: 96, max: 256, step: 32, label: "Bitrate (kbps)" },
  flacCompressionLevel: { min: 0, max: 12, step: 1, label: "Intermediate FLAC Level" },
};