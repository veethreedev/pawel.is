// Decrypts an OpenSSL-format ("Salted__") AES-256-CBC ciphertext whose key and IV
// were derived from the passphrase with PBKDF2-HMAC-SHA256. The ciphertext doesn't
// record the iteration count, so the common defaults are tried in turn
// (OpenSSL: 10000, CryptoJS 4.2+: 250000). A wrong passphrase fails the PKCS#7
// padding check or produces invalid UTF-8, either of which counts as a miss.
(function () {
  var CIPHERTEXT =
    "U2FsdGVkX19v62+dfcI8BgQhtoMPVsZiFdDqZ9IeXAaJ3jXysePHpDF3i/xaLVEGZdTRvuIUPm+srepv/LXNqAjk2dTrmL1aaQon5ruUtN/B2DJ1ZkExX91KJaugcT3pu1zerkYzZYJ/6YJoqQhoYuu/8OflQWB9QHxan1qmA70=";
  var ITERATIONS = [10000, 250000, 1000, 100000, 1];

  var form = document.getElementById("passphrase-form");
  var input = document.getElementById("passphrase");
  var output = document.getElementById("passphrase-output");
  if (!form || !input || !output) return;

  function b64ToBytes(b64) {
    var bin = atob(b64);
    var out = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  }

  var raw = b64ToBytes(CIPHERTEXT);
  var salt = raw.slice(8, 16);
  var body = raw.slice(16);

  async function tryDecrypt(passphrase, iterations) {
    var subtle = crypto.subtle;
    var baseKey = await subtle.importKey("raw", new TextEncoder().encode(passphrase), "PBKDF2", false, ["deriveBits"]);
    var bits = new Uint8Array(await subtle.deriveBits(
      { name: "PBKDF2", hash: "SHA-256", salt: salt, iterations: iterations },
      baseKey,
      384 // 256-bit key + 128-bit IV
    ));
    var key = await subtle.importKey("raw", bits.slice(0, 32), "AES-CBC", false, ["decrypt"]);
    var plain = await subtle.decrypt({ name: "AES-CBC", iv: bits.slice(32, 48) }, key, body);
    return new TextDecoder("utf-8", { fatal: true }).decode(plain);
  }

  async function decrypt(passphrase) {
    // Try the input as typed, then uppercased, so the case people type doesn't matter.
    var candidates = [passphrase];
    if (passphrase.toUpperCase() !== passphrase) candidates.push(passphrase.toUpperCase());
    for (var c = 0; c < candidates.length; c++) {
      for (var i = 0; i < ITERATIONS.length; i++) {
        try {
          var text = await tryDecrypt(candidates[c], ITERATIONS[i]);
          // Reject stray successes that decode to control characters.
          if (!/[\u0000-\u0008\u000e-\u001f]/.test(text)) return text;
        } catch (e) { /* wrong passphrase for this iteration count */ }
      }
    }
    return null;
  }

  function show(text) {
    output.className = "output";
    output.textContent = "";
    // Turn e-mail addresses and URLs into links; everything else stays plain text.
    var re = /([\w.+-]+@[\w-]+(?:\.[\w-]+)+)|(https?:\/\/[^\s]+)/g;
    var last = 0, m;
    while ((m = re.exec(text))) {
      output.appendChild(document.createTextNode(text.slice(last, m.index)));
      var a = document.createElement("a");
      a.textContent = m[0];
      a.href = m[1] ? "mailto:" + m[1] : m[2];
      if (m[2]) { a.target = "_blank"; a.rel = "noopener"; }
      output.appendChild(a);
      last = re.lastIndex;
    }
    output.appendChild(document.createTextNode(text.slice(last)));
  }

  // Put the cursor in the prompt on desktop; skip on touch so no keyboard pops up.
  if (window.matchMedia && matchMedia("(pointer: fine)").matches) input.focus({ preventScroll: true });

  var busy = false;
  form.addEventListener("submit", async function (e) {
    e.preventDefault();
    var value = input.value.trim();
    if (!value || busy) return;
    if (!window.crypto || !crypto.subtle) {
      output.className = "output denied";
      output.textContent = "ERROR: this browser can't decrypt (needs HTTPS).";
      return;
    }
    busy = true;
    output.className = "output";
    output.textContent = "decrypting...";
    var text = await decrypt(value);
    busy = false;
    if (text !== null) {
      show(text);
    } else {
      output.className = "output denied";
      output.textContent = "ACCESS DENIED.";
      input.select();
    }
  });
})();
