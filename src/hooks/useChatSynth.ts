// 简化版本的 useChatSynth，只导出必要的 SYNTH_PRESETS
export type SynthPreset = {
  name: string;
  [key: string]: any;
};

export const SYNTH_PRESETS: Record<string, SynthPreset> = {
  off: { name: "Off" },
  classic: { name: "Classic" },
  warm: { name: "Warm" },
  bright: { name: "Bright" },
  deep: { name: "Deep" },
}; 