// Preset unit list for quantity-based percentage tasks (plan §2.1, §10).
// Grouped by category; a "Custom" free-text option is always available as a
// fallback, so this list only needs to cover the common cases.

export interface UnitPreset {
  value: string;
  label: string;
}

export interface UnitGroup {
  group: string;
  units: UnitPreset[];
}

export const UNIT_GROUPS: UnitGroup[] = [
  {
    group: "Volume",
    units: [
      { value: "L", label: "liters (L)" },
      { value: "mL", label: "milliliters (mL)" },
      { value: "cups", label: "cups" },
      { value: "glasses", label: "glasses" },
    ],
  },
  {
    group: "Time",
    units: [
      { value: "min", label: "minutes" },
      { value: "hrs", label: "hours" },
    ],
  },
  {
    group: "Distance / Count",
    units: [
      { value: "km", label: "kilometers (km)" },
      { value: "mi", label: "miles (mi)" },
      { value: "steps", label: "steps" },
      { value: "pages", label: "pages" },
      { value: "reps", label: "reps" },
      { value: "items", label: "items" },
      { value: "count", label: "count" },
    ],
  },
  {
    group: "Currency",
    units: [
      { value: "$", label: "dollars ($)" },
      { value: "₹", label: "rupees (₹)" },
      { value: "€", label: "euros (€)" },
    ],
  },
];

export const ALL_PRESET_UNITS = UNIT_GROUPS.flatMap((g) => g.units.map((u) => u.value));
