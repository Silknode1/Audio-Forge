import { AudioConfig, RANGES } from './types';

// Helper to replace ~ with $HOME for shell expansion inside double quotes
const resolveShellPath = (path: string): string => {
  if (!path) return path;
  if (path.startsWith('~/')) {
    return path.replace(/^~\//, '$HOME/');
  }
  return path;
};

// --- VOICE IMPACT HELPERS ---
export const getFrequencyImpact = (val: number): string => {
  if (val <= 60) return "Removes rumble only, keeps all voice warmth";
  if (val <= 80) return "RECOMMENDED: Balanced warmth & clarity";
  if (val <= 120) return "Cleaner sound, slight warmth reduction";
  return "Very clean but may thin male voices";
};

export const getClarityImpact = (val: number): string => {
  if (val < 3000) return "Muffled but warm (AM Radio style)";
  if (val < 5000) return "RECOMMENDED: Natural clarity";
  if (val < 8000) return "Bright and crisp, enhances consonants";
  return "Very bright, open air";
};

export const getDeesserImpact = (val: number): string => {
  if (val === 0) return "OFF: Natural but may have harsh S sounds";
  if (val <= 0.3) return "LIGHT: Subtle reduction, very natural";
  if (val <= 0.6) return "RECOMMENDED: Noticeable but pleasant";
  return "HEAVY: Strong reduction, may cause lisp effect";
};

export const getNoiseImpact = (val: number): string => {
  if (val === 0) return "OFF: All natural room tone preserved";
  if (val <= 0.3) return "LIGHT: Reduces obvious hiss only";
  if (val <= 0.6) return "RECOMMENDED: Clean but natural";
  return "AGGRESSIVE: Very clean but may sound processed";
};

export const getCompressionImpact = (val: number): string => {
  if (val <= 0.2) return "NATURAL: Preserves performance dynamics";
  if (val <= 0.5) return "AUDIOBOOK: Gentle evening out";
  if (val <= 0.7) return "PODCAST: Consistent volume, punchy";
  return "BROADCAST: Heavy compression, radio-style";
};

export const getLoudnessImpact = (val: number): string => {
  if (val <= -23) return "ACX / Audible Standard";
  if (val <= -18) return "RECOMMENDED: Sweet spot for narration";
  if (val <= -16) return "Podcast Standard";
  return "Music Streaming / Loud";
};

// --- FFMPEG GENERATOR ---

export const generateFFmpegCommand = (
  config: AudioConfig,
  inputPath: string,
  mode: 'test-45s' | 'test-10s' | 'full',
  outputFilePath?: string
): string => {
  const inputFile = inputPath || "input.m4b";
  const safeInput = resolveShellPath(inputFile);
  
  // MAPPINGS
  // Noise Reduction
  const nr = Math.round(config.noiseReduction * 40); 
  const nf = Math.round(-80 + (config.noiseReduction * 40)); 
  const afftdn = `afftdn=nr=${nr}:nf=${nf}:tn=1`;

  // Compressor (acompressor logic)
  const ratio = 2 + (config.compressionAmount * 3); 
  const attack = 20 - (config.compressionAmount * 18);
  const release = 250 - (config.compressionAmount * 200);
  const makeup = 2 + (config.compressionAmount * 2);
  
  const compressor = `acompressor=threshold=-20dB:ratio=${ratio.toFixed(1)}:attack=${attack.toFixed(1)}:release=${release.toFixed(0)}:makeup=${makeup.toFixed(1)}`;

  // De-esser
  // f is 0-1 where 1 is Nyquist. Assuming 44100Hz sr, Nyquist is 22050Hz.
  const deesserFreqVal = (config.deesserFreq / 22050).toFixed(3);
  const deesser = `deesser=i=${config.deesserAmount.toFixed(2)}:m=0.5:f=${deesserFreqVal}:s=o`;

  // Limiter
  const limiter = `alimiter=limit=${config.loudnormTp}dB:attack=5:release=50`;

  // EQ & Cleanup
  const highpass = `highpass=f=${config.highpassFreq}:poles=2`;
  const lowpass = `lowpass=f=${config.lowpassFreq}:poles=2`;
  const click = `adeclick=w=55:o=75:t=25`;

  if (mode === 'full') {
    const safeOutput = resolveShellPath(outputFilePath || "processed_audiobook.m4b");
    
    return `#!/bin/bash
# VOICE ENHANCEMENT STUDIO - AUDIOBOOK MASTERING SCRIPT (FLAC Workflow)

INPUT="${safeInput}"
OUTPUT="${safeOutput}"
TEMP_FLAC="/tmp/temp_analysis_$(date +%s).flac"

echo ">> 🎧 PHASE 1: ANALYSIS & MEASUREMENT"
# Extract to temporary FLAC (Lossless, Compressed Level ${config.flacCompressionLevel})
# -map_metadata 0 preserves chapters and tags from source
# -nostdin prevents ffmpeg from consuming the rest of this script as input
echo "   ...extracting to intermediate FLAC..."
ffmpeg -nostdin -v warning -i "$INPUT" -vn -acodec flac -compression_level ${config.flacCompressionLevel} -ar 44100 -map_metadata 0 "$TEMP_FLAC" -y

# Analyze loudness and noise floor from FLAC
echo "   ...measuring dynamics and spectrum..."
LOUDNESS_DATA=$(ffmpeg -nostdin -i "$TEMP_FLAC" -af loudnorm=I=${config.loudnormTarget}:TP=${config.loudnormTp}:LRA=${config.loudnormLra}:print_format=json -f null - 2>&1 | grep -A 12 "loudnorm" | tail -n 12)

# Extract measured values
# Uses escaped newline for tr to prevent multiline syntax errors in bash
MEASURED_I=$(echo "$LOUDNESS_DATA" | grep '"input_i"' | cut -d : -f 2 | tr -d '", \\n')
MEASURED_TP=$(echo "$LOUDNESS_DATA" | grep '"input_tp"' | cut -d : -f 2 | tr -d '", \\n')
MEASURED_LRA=$(echo "$LOUDNESS_DATA" | grep '"input_lra"' | cut -d : -f 2 | tr -d '", \\n')
MEASURED_THRESH=$(echo "$LOUDNESS_DATA" | grep '"input_thresh"' | cut -d : -f 2 | tr -d '", \\n')
OFFSET=$(echo "$LOUDNESS_DATA" | grep '"target_offset"' | cut -d : -f 2 | tr -d '", \\n')

echo "   ...Captured: I=$MEASURED_I TP=$MEASURED_TP LRA=$MEASURED_LRA"

# Fallback values in case analysis failed (prevents syntax errors in next step)
: \${MEASURED_I:=${config.loudnormTarget}}
: \${MEASURED_TP:=${config.loudnormTp}}
: \${MEASURED_LRA:=${config.loudnormLra}}
: \${MEASURED_THRESH:=-70.0}
: \${OFFSET:=0.0}

echo ">> 🎹 PHASE 2: PRECISION PROCESSING"
# Process from the intermediate FLAC
# Map metadata from it to ensure chapters are preserved
ffmpeg -nostdin -i "$TEMP_FLAC" -filter_complex "\\
[0:a]aformat=sample_fmts=fltp:sample_rates=44100:channel_layouts=stereo,\\
${highpass},\\
${afftdn},\\
${lowpass},\\
${click},\\
${deesser},\\
${compressor},\\
loudnorm=I=${config.loudnormTarget}:TP=${config.loudnormTp}:LRA=${config.loudnormLra}:measured_I=$MEASURED_I:measured_TP=$MEASURED_TP:measured_LRA=$MEASURED_LRA:measured_thresh=$MEASURED_THRESH:offset=$OFFSET:linear=true:print_format=summary,\\
${limiter},\\
aformat=channel_layouts=mono[out]" \\
-map "[out]" \\
-vn -map_metadata 0 \\
-c:a aac -b:a ${config.bitrate}k -movflags +faststart \\
"$OUTPUT"

# Cleanup
rm "$TEMP_FLAC"
echo ">> ✅ PROCESSING COMPLETE: $OUTPUT"
`;
  } else {
    // PREVIEW MODE
    // Use dynamic loudness, single pass, operate on input file directly
    const duration = mode === 'test-45s' ? 45 : 10;
    const suffix = mode === 'test-45s' ? '-preview-45s.m4b' : '-preview-10s.m4b';
    const outputName = outputFilePath || `preview${suffix}`;
    const safeOutput = resolveShellPath(outputName);

    return `ffmpeg -nostdin -ss 00:05:00 -i "${safeInput}" -t ${duration} \\
-filter_complex "\\
[0:a]aformat=sample_fmts=fltp:sample_rates=44100:channel_layouts=stereo,\\
${highpass},${afftdn},${lowpass},${click},${deesser},${compressor},\\
loudnorm=I=${config.loudnormTarget}:TP=${config.loudnormTp}:LRA=${config.loudnormLra},\\
${limiter},aformat=channel_layouts=mono" \\
-vn -c:a aac -b:a ${config.bitrate}k "${safeOutput}"`;
  }
};

export const randomGlitchText = (text: string) => {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789@#$%&*";
  return text.split('').map(char => {
    if (Math.random() > 0.95) return chars[Math.floor(Math.random() * chars.length)];
    return char;
  }).join('');
};