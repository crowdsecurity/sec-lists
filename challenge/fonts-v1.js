/*
 * Font measurements for the CrowdSec AppSec bot challenge.
 *
 * This module measures and reports. It reaches no conclusion: which advance
 * means "spoofed" depends on the platform the visitor claims, and that
 * comparison belongs in the appsec-config rules, where an operator can read
 * and tune it.
 *
 * Every key is written on every run, using -1 when a measurement is
 * impossible. An absent key therefore means this module did not run at all,
 * which the rules score in its own right.
 */

// Wide enough to accumulate a measurable difference, and all Latin so no
// font falls back mid-string.
const PROBE = "mmmmmmmmmmlliWWMMOO0123";
const SIZE = 60;

// Emoji need their own baseline: an emoji glyph in a text font is a tofu box,
// which has nothing to do with the Latin advance above.
const EMOJI = "\u{1F600}\u{1F1EB}\u{1F1F7}";
const EMOJI_SIZE = 48;

function round2(n) {
  return Math.round(n * 100) / 100;
}

// A font is present when naming it moves the advance away from the generic
// fallback. Returning the raw width (not a boolean) keeps the comparison in
// the rules.
function advance(ctx, family, text, size) {
  ctx.font = size + 'px "' + family + '", monospace';
  return round2(ctx.measureText(text).width);
}

export function collectSignals(fp) {
  fp.custom = fp.custom || {};

  // Sentinels first, so a throw part-way through still leaves every key
  // present and the run stays distinguishable from a stripped module.
  fp.custom.cfFontBase = -1;
  fp.custom.cfFontSegoe = -1;
  fp.custom.cfFontHelv = -1;
  fp.custom.cfFontRoboto = -1;
  fp.custom.cfFontDejavu = -1;
  fp.custom.cfFontSys = "";
  fp.custom.cfFontFrac = -1;
  fp.custom.cfFontEmojiBase = -1;
  fp.custom.cfFontEmojiApple = -1;
  fp.custom.cfFontEmojiSegoe = -1;
  fp.custom.cfFontEmojiNoto = -1;

  try {
    const ctx = document.createElement("canvas").getContext("2d");

    ctx.font = SIZE + "px monospace";
    const base = round2(ctx.measureText(PROBE).width);
    fp.custom.cfFontBase = base;

    // One per platform, measured unconditionally. The rules decide which one
    // matters for the platform this visitor claims.
    const ui = {
      cfFontSegoe: advance(ctx, "Segoe UI", PROBE, SIZE),
      cfFontHelv: advance(ctx, "Helvetica Neue", PROBE, SIZE),
      cfFontRoboto: advance(ctx, "Roboto", PROBE, SIZE),
      cfFontDejavu: advance(ctx, "DejaVu Sans", PROBE, SIZE),
    };
    for (const k of Object.keys(ui)) {
      fp.custom[k] = ui[k];
    }

    // How many advances landed on a whole pixel. Mainstream desktop stacks
    // position sub-pixel; a full set of integers means hinting was pinned.
    // Reported as a count so the rule owns the threshold.
    let whole = 0;
    for (const v of [base, ui.cfFontSegoe, ui.cfFontHelv, ui.cfFontRoboto, ui.cfFontDejavu]) {
      if (v === Math.floor(v)) {
        whole++;
      }
    }
    fp.custom.cfFontFrac = whole;
  } catch {
    // leave the sentinels
  }

  try {
    // The CSS system-font keyword resolves to the platform's own UI font.
    // A build that spoofs the user agent but leaves font resolution to the
    // host answers with whatever the host default is.
    const probe = document.createElement("div");
    probe.style.font = "menu";
    probe.style.position = "absolute";
    probe.style.visibility = "hidden";
    document.body.appendChild(probe);
    fp.custom.cfFontSys = String(getComputedStyle(probe).fontFamily || "").slice(0, 64);
    probe.remove();
  } catch {
    // leave the sentinel
  }

  try {
    const ctx = document.createElement("canvas").getContext("2d");
    ctx.font = EMOJI_SIZE + "px monospace";
    fp.custom.cfFontEmojiBase = round2(ctx.measureText(EMOJI).width);
    fp.custom.cfFontEmojiApple = advance(ctx, "Apple Color Emoji", EMOJI, EMOJI_SIZE);
    fp.custom.cfFontEmojiSegoe = advance(ctx, "Segoe UI Emoji", EMOJI, EMOJI_SIZE);
    fp.custom.cfFontEmojiNoto = advance(ctx, "Noto Color Emoji", EMOJI, EMOJI_SIZE);
  } catch {
    // leave the sentinels
  }
}
