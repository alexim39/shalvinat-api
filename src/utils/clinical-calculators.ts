export type VitalFlagInput = {
  systolicBp?: number;
  diastolicBp?: number;
  spo2?: number;
  temperatureC?: number;
  painScore?: number;
};

export function calculateBmi(weightKg?: number, heightCm?: number) {
  if (!weightKg || !heightCm) {
    return undefined;
  }

  const heightM = heightCm / 100;
  return Number((weightKg / (heightM * heightM)).toFixed(1));
}

export function detectVitalFlags(vitals: VitalFlagInput) {
  const flags: string[] = [];

  if ((vitals.systolicBp ?? 0) > 180 || (vitals.diastolicBp ?? 0) > 120) {
    flags.push("Critical blood pressure");
  }
  if ((vitals.spo2 ?? 100) < 90) {
    flags.push("Low oxygen saturation");
  }
  if ((vitals.temperatureC ?? 0) > 39.5) {
    flags.push("High fever");
  }
  if ((vitals.painScore ?? 0) >= 8) {
    flags.push("Severe pain");
  }

  return flags;
}

export function earlyWarningScore(vitals: VitalFlagInput) {
  let score = 0;

  if ((vitals.systolicBp ?? 120) > 180 || (vitals.systolicBp ?? 120) < 90) score += 3;
  if ((vitals.spo2 ?? 98) < 92) score += 3;
  if ((vitals.temperatureC ?? 37) > 39 || (vitals.temperatureC ?? 37) < 35) score += 2;

  return score;
}
