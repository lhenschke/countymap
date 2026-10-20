export const LABEL_FONT = 'system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif';

const measureCtx = document.createElement("canvas").getContext("2d");

/** Text width in ems for the given font weight. */
export function measureEm(text: string, weight: number, letterSpacingEm = 0): number {
  if (!measureCtx) return text.length * (0.6 + letterSpacingEm);
  measureCtx.font = `${weight} 100px ${LABEL_FONT}`;
  return measureCtx.measureText(text).width / 100 + Math.max(0, text.length - 1) * letterSpacingEm;
}
