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

// The plain emoji advance identifies which emoji font the system uses without
// naming any family: Apple Color Emoji measures 96 here, Noto Color Emoji
// ~119.5-120. Useful on platforms that resolve no family names at all.
const EMOJI = "\u{1F600}\u{1F1EB}\u{1F1F7}";
const EMOJI_SIZE = 48;

// Naming an emoji font cannot be tested with emoji: a text font has no emoji
// glyph, so the baseline already borrows the system emoji font and both sides
// of the comparison measure the same thing. The keycap bases are the way in --
// monospace HAS "0123#*", and a colour emoji font draws them far wider, so
// naming one moves the advance and naming an absent one does not.
const KEYCAP = "0123#*";

// Must resolve to nothing. Its advance is the control: when it differs from
// the baseline, family resolution is not behaving and no name-based
// measurement below can be trusted.
const ABSENT = "NoSuchFontXYZ123";

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
  fp.custom.cfFontResolved = -1;
  fp.custom.cfFontEmojiBase = -1;
  fp.custom.cfFontKcBase = -1;
  fp.custom.cfFontKcCtrl = -1;
  fp.custom.cfFontKcApple = -1;
  fp.custom.cfFontKcSegoe = -1;
  fp.custom.cfFontKcNoto = -1;

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

    // How many of the four moved off the baseline. Zero means this client
    // resolves nothing by name -- every Android browser measured so far -- and
    // a rule that reads "naming X did not move the advance" as "X is missing"
    // must stay silent there. A desktop host always resolves at least one, so
    // one spoofing another platform is still caught.
    let resolved = 0;
    for (const v of Object.values(ui)) {
      if (v !== base) {
        resolved++;
      }
    }
    fp.custom.cfFontResolved = resolved;

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

    ctx.font = EMOJI_SIZE + "px monospace";
    fp.custom.cfFontKcBase = round2(ctx.measureText(KEYCAP).width);
    fp.custom.cfFontKcCtrl = advance(ctx, ABSENT, KEYCAP, EMOJI_SIZE);
    fp.custom.cfFontKcApple = advance(ctx, "Apple Color Emoji", KEYCAP, EMOJI_SIZE);
    fp.custom.cfFontKcSegoe = advance(ctx, "Segoe UI Emoji", KEYCAP, EMOJI_SIZE);
    fp.custom.cfFontKcNoto = advance(ctx, "Noto Color Emoji", KEYCAP, EMOJI_SIZE);
  } catch {
    // leave the sentinels
  }
}
