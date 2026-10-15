/*
 * CPU architecture probe for the CrowdSec AppSec bot challenge.
 */

// Compiled from cpu-arch-v1.wat, 60 bytes. Embedded rather than fetched: the
// module contract forbids import, and a second network round trip would not
// fit the budget every detector shares. Rebuild with:
//   wat2wasm cpu-arch-v1.wat -o cpu-arch-v1.wasm && base64 -w0 cpu-arch-v1.wasm
const MODULE_B64 =
  "AGFzbQEAAAABBAFgAAADAgEABQMBAAEHDQIDbWVtAgADcnVuAAAKFAESAEEAQwAAAABDAAAAAJU4AgAL";

function hex4(bytes) {
  let out = "";
  for (let i = 0; i < 4; i++) {
    out += bytes[i].toString(16).padStart(2, "0");
  }
  return out;
}

export function collectSignals(fp) {
  fp.custom = fp.custom || {};

  // Written first: an absent key means this module never ran, while the empty
  // string means it ran and could not measure. The rules tell those apart.
  fp.custom.cfArchNan = "";

  try {
    const bin = atob(MODULE_B64);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) {
      bytes[i] = bin.charCodeAt(i);
    }

    const instance = new WebAssembly.Instance(new WebAssembly.Module(bytes), {});
    instance.exports.run();
    fp.custom.cfArchNan = hex4(new Uint8Array(instance.exports.mem.buffer, 0, 4));
  } catch {
    // No WebAssembly, or a CSP without 'wasm-unsafe-eval'. Sentinel stands.
  }
}
