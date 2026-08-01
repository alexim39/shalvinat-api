import { describe, expect, it } from "vitest";
import { calculateBmi, detectVitalFlags, earlyWarningScore } from "./clinical-calculators.js";

describe("clinical calculators", () => {
  it("calculates BMI to one decimal place", () => {
    expect(calculateBmi(70, 170)).toBe(24.2);
  });

  it("flags critical vital signs", () => {
    expect(
      detectVitalFlags({
        systolicBp: 190,
        diastolicBp: 110,
        spo2: 88,
        temperatureC: 40,
        painScore: 8,
      }),
    ).toEqual(["Critical blood pressure", "Low oxygen saturation", "High fever", "Severe pain"]);
  });

  it("produces an early warning score for deteriorating patients", () => {
    expect(earlyWarningScore({ systolicBp: 82, spo2: 89, temperatureC: 39.3 })).toBe(8);
  });
});
