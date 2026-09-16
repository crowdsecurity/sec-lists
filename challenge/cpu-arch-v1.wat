;; Source for the WebAssembly module embedded in cpu-arch-v1.js.
;;
;; The WebAssembly spec leaves the bit pattern of an arithmetic NaN
;; implementation-defined, so 0.0/0.0 answers which CPU is really executing --
;; something a user agent string cannot change. Measured with this exact module
;; under Node on x86 and under Node on emulated arm64:
;;
;;   x86 -> 00 00 c0 ff   (0xffc00000, negative NaN)
;;   arm -> 00 00 c0 7f   (0x7fc00000, positive NaN)
;;
;; Rebuild after any edit and update the base64 constant in cpu-arch-v1.js:
;;   wat2wasm cpu-arch-v1.wat -o cpu-arch-v1.wasm && base64 -w0 cpu-arch-v1.wasm
(module
  (memory (export "mem") 1)
  (func (export "run")
    (f32.store (i32.const 0) (f32.div (f32.const 0) (f32.const 0)))))
