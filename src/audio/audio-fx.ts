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
  pitch_semitones: 1,
  dry_gain: 0.25,
  wet_gain: 0.15,
  hpf: 200,
  lpf: 7000,
  notch: 1000,
  drive: 0.05,
};
