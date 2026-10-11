// Critical solid foreground/background pairs used by the landing, app, auth
// and cookie surfaces. Translucent decorative strokes are non-text and are
// intentionally excluded from the WCAG text contrast gate.
const pairs = [
  ["landing body", "#171A18", "#F7F4EE"],
  ["landing secondary", "#5F625E", "#F7F4EE"],
  ["landing primary button", "#FCFBF8", "#173D32"],
  ["app body", "#171A18", "#FCFBF8"],
  ["app secondary", "#5F625E", "#FCFBF8"],
  ["app primary button", "#FCFBF8", "#173D32"],
  ["auth body", "#17211D", "#F1F5F1"],
  ["auth secondary", "#4D5D55", "#FFFFFF"],
  ["auth error", "#7C3026", "#FFF1EE"],
  ["auth success", "#245C32", "#EDF7EF"],
  ["cookie body", "#F7F4EE", "#173D32"],
  ["cookie link", "#F2D29A", "#173D32"],
  ["cookie primary button", "#173D32", "#F2D29A"],
  ["results coral badge", "#FFFFFF", "#00754A"],
  ["results rose badge", "#111111", "#B78D97"],
  ["results lavender badge", "#111111", "#9B93B5"],
  ["results overuse label", "#111111", "#FAFAFA"],
  // Orbita app primary (view-base.css --primary/--primary-hover/--accent):
  // white-on-green button/badge/lang-toggle text and primary text on soft fill.
  ["orbita primary on white", "#FFFFFF", "#007A3E"],
  ["orbita primary hover on white", "#FFFFFF", "#006E36"],
  ["orbita primary text on soft", "#007A3E", "#E6F5ED"],
  ["orbita muted on soft", "#6B6B6B", "#FAFAFA"],
  ["orbita muted on paper", "#6B6B6B", "#EFEDED"],
];

function rgb(hex) {
  const value = hex.replace("#", "");
  const expanded = value.length === 3 ? value.split("").map((part) => part + part).join("") : value;
  if (!/^[0-9a-f]{6}$/i.test(expanded)) throw new Error(`Invalid color: ${hex}`);
  return [0, 2, 4].map((offset) => Number.parseInt(expanded.slice(offset, offset + 2), 16) / 255);
}

function luminance(hex) {
  return rgb(hex).map((channel) => channel <= 0.03928 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4)
    .reduce((sum, channel, index) => sum + channel * [0.2126, 0.7152, 0.0722][index], 0);
}

function contrast(foreground, background) {
  const foregroundLum = luminance(foreground);
  const backgroundLum = luminance(background);
  return (Math.max(foregroundLum, backgroundLum) + 0.05) / (Math.min(foregroundLum, backgroundLum) + 0.05);
}

const results = pairs.map(([name, foreground, background]) => ({ name, ratio: contrast(foreground, background) }));
const failures = results.filter((result) => result.ratio < 4.5);
if (failures.length) {
  throw new Error(`CONTRAST_CHECK_FAILED ${failures.map((result) => `${result.name}=${result.ratio.toFixed(2)}`).join(",")}`);
}
const minimum = Math.min(...results.map((result) => result.ratio));
console.log(`CONTRAST_CHECK=PASS pairs=${results.length} minimum_ratio=${minimum.toFixed(2)} wcag_text_target=4.5`);
