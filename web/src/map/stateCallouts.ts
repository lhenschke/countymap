// Small Northeastern states whose labels can't fit inside them at national
// zoom. Their abbreviations sit in a column out in the Atlantic (VT's goes up
// into Canada) with a leader line back to the state. Offsets are in map
// units from the state's label anchor, tuned by eye for the 975×610 map.
export const STATE_CALLOUTS: Record<string, [dx: number, dy: number]> = {
  VT: [-18, -38],
  NH: [45, -11],
  MA: [57, -12],
  RI: [36, 0],
  CT: [50, 12],
  NJ: [35, -5],
  DE: [41, -6],
  MD: [69, 22],
  DC: [67, 32],
};
