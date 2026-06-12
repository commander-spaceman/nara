export interface HelmetFXParams {
  pitch_semitones: number;
  dry_gain: number;
  wet_gain: number;
  hpf: number;
  lpf: number;
  notch: number;
  drive: number;
}

export const HELMET_DEFAULTS: HelmetFXParams = {
  pitch_semitones: 2,
  dry_gain: 0.8,
  wet_gain: 0.35,
  hpf: 200,
  lpf: 4000,
  notch: 900,
  drive: 0.1,
};
