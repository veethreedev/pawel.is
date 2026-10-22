# Culator PWA

A dependency-free web port of the Android app with the same behaviour:

- Exact decimal arithmetic (BigInt-backed, matching `java.math.BigDecimal`: 12-digit HALF_UP division, trailing zeros stripped), `×`/`÷` precedence, `−5` key, `00` key, and the same input rules (operator replacement, leading `0.`, 100-character limit, new number after `=`).
- Random average: whole-number totals only, 1–1000 items, balanced ± offsets that keep the total exact, shuffle again.
- History saved on `=`, newest first, pruned by the retention setting (also while the app is open). Long-press or right-click an entry to use it or delete it.
- Settings: Dark/Light/System theme, Mint/Blue/Purple/System/Custom accent (HSV picker + hex), keep screen on (Screen Wake Lock API), history retention, offset range, restore defaults.
- The draft equation persists across restarts. The Android back button closes settings and dialogs and cancels count entry.
- Works offline after the first load (service worker), and can be installed.

Differences caused by the platform: the **System** accent uses the browser's CSS `AccentColor` and falls back to Mint where that isn't supported (like Android < 12). **Keep screen on** needs a browser with the Wake Lock API. The PWA also accepts physical keyboard input (digits, `+ - * / x`, `.`/`,`, Enter/`=`, Backspace, Delete = C, Escape = back).

## Run

Serve this folder over HTTP (service workers need `localhost` or HTTPS):

```sh
npm start            # npx serve on http://localhost:8080
# or: python -m http.server 8080
```

To deploy, upload the folder as-is to any static host (GitHub Pages, Netlify, and so on). Bump `VERSION` in `sw.js` when you change files so installed copies update.

## Test

```sh
npm test             # ports of CalculatorTest.kt / HistoryTest.kt plus BigDecimal edge cases
```
