// Minimal QR code encoder (byte mode, error correction level M, versions 1-40).
// Follows ISO/IEC 18004; structure after Project Nayuki's reference design.
// Usage: QR.svg("https://youtu.be/...", { size: 96 }) -> SVG string
(function (global) {
  "use strict";

  // Error correction level M.
  const ECC_PER_BLOCK = [-1, 10, 16, 26, 18, 24, 16, 18, 22, 22, 26, 30, 22, 22, 24, 24, 28, 28, 26, 26, 26, 26, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28];
  const NUM_BLOCKS = [-1, 1, 1, 1, 2, 2, 4, 4, 4, 5, 5, 5, 8, 9, 9, 10, 10, 11, 13, 14, 16, 17, 17, 18, 20, 21, 23, 25, 26, 28, 29, 31, 33, 35, 37, 38, 40, 43, 45, 47, 49];
  const ECL_FORMAT_BITS = 0; // M

  function numRawDataModules(ver) {
    let result = (16 * ver + 128) * ver + 64;
    if (ver >= 2) {
      const numAlign = Math.floor(ver / 7) + 2;
      result -= (25 * numAlign - 10) * numAlign - 55;
      if (ver >= 7) result -= 36;
    }
    return result;
  }
  function numDataCodewords(ver) {
    return Math.floor(numRawDataModules(ver) / 8) - ECC_PER_BLOCK[ver] * NUM_BLOCKS[ver];
  }

  // Reed-Solomon over GF(256) with polynomial 0x11D.
  function rsMultiply(x, y) {
    let z = 0;
    for (let i = 7; i >= 0; i--) {
      z = (z << 1) ^ ((z >>> 7) * 0x11D);
      z ^= ((y >>> i) & 1) * x;
    }
    return z;
  }
  function rsDivisor(degree) {
    const result = new Array(degree).fill(0);
    result[degree - 1] = 1;
    let root = 1;
    for (let i = 0; i < degree; i++) {
      for (let j = 0; j < result.length; j++) {
        result[j] = rsMultiply(result[j], root);
        if (j + 1 < result.length) result[j] ^= result[j + 1];
      }
      root = rsMultiply(root, 0x02);
    }
    return result;
  }
  function rsRemainder(data, divisor) {
    const result = divisor.map(() => 0);
    for (const b of data) {
      const factor = b ^ result.shift();
      result.push(0);
      divisor.forEach((coef, i) => { result[i] ^= rsMultiply(coef, factor); });
    }
    return result;
  }

  function utf8Bytes(str) {
    return Array.from(new TextEncoder().encode(str));
  }

  function encode(text) {
    const data = utf8Bytes(text);
    let ver;
    for (ver = 1; ver <= 40; ver++) {
      const ccBits = ver <= 9 ? 8 : 16;
      if (4 + ccBits + data.length * 8 <= numDataCodewords(ver) * 8) break;
    }
    if (ver > 40) throw new Error("Text too long for a QR code");

    // Bit stream: mode 0100 (byte), count, data, terminator, padding.
    const bits = [];
    const push = (val, len) => { for (let i = len - 1; i >= 0; i--) bits.push((val >>> i) & 1); };
    push(4, 4);
    push(data.length, ver <= 9 ? 8 : 16);
    data.forEach(b => push(b, 8));
    const capacity = numDataCodewords(ver) * 8;
    push(0, Math.min(4, capacity - bits.length));
    push(0, (8 - bits.length % 8) % 8);
    for (let pad = 0xEC; bits.length < capacity; pad ^= 0xEC ^ 0x11) push(pad, 8);
    const codewords = [];
    for (let i = 0; i < bits.length; i += 8) {
      let b = 0;
      for (let j = 0; j < 8; j++) b = (b << 1) | bits[i + j];
      codewords.push(b);
    }

    // Split into blocks, add ECC, interleave.
    const numBlocks = NUM_BLOCKS[ver], blockEccLen = ECC_PER_BLOCK[ver];
    const rawCodewords = Math.floor(numRawDataModules(ver) / 8);
    const numShortBlocks = numBlocks - rawCodewords % numBlocks;
    const shortBlockLen = Math.floor(rawCodewords / numBlocks);
    const divisor = rsDivisor(blockEccLen);
    const blocks = [];
    for (let i = 0, k = 0; i < numBlocks; i++) {
      const dat = codewords.slice(k, k + shortBlockLen - blockEccLen + (i < numShortBlocks ? 0 : 1));
      k += dat.length;
      const ecc = rsRemainder(dat, divisor);
      if (i < numShortBlocks) dat.push(0);
      blocks.push(dat.concat(ecc));
    }
    const all = [];
    for (let i = 0; i < blocks[0].length; i++) {
      blocks.forEach((block, j) => {
        if (i !== shortBlockLen - blockEccLen || j >= numShortBlocks) all.push(block[i]);
      });
    }

    return drawMatrix(ver, all);
  }

  function drawMatrix(ver, allCodewords) {
    const size = ver * 4 + 17;
    const modules = Array.from({ length: size }, () => new Array(size).fill(false));
    const isFunction = Array.from({ length: size }, () => new Array(size).fill(false));
    const set = (x, y, dark) => { modules[y][x] = dark; isFunction[y][x] = true; };

    // Timing patterns.
    for (let i = 0; i < size; i++) { set(6, i, i % 2 === 0); set(i, 6, i % 2 === 0); }
    // Finder patterns with separators.
    const finder = (cx, cy) => {
      for (let dy = -4; dy <= 4; dy++) for (let dx = -4; dx <= 4; dx++) {
        const dist = Math.max(Math.abs(dx), Math.abs(dy)), x = cx + dx, y = cy + dy;
        if (x >= 0 && x < size && y >= 0 && y < size) set(x, y, dist !== 2 && dist !== 4);
      }
    };
    finder(3, 3); finder(size - 4, 3); finder(3, size - 4);
    // Alignment patterns.
    const alignPos = (() => {
      if (ver === 1) return [];
      const numAlign = Math.floor(ver / 7) + 2;
      const step = ver === 32 ? 26 : Math.ceil((ver * 4 + 4) / (numAlign * 2 - 2)) * 2;
      const result = [6];
      for (let pos = size - 7; result.length < numAlign; pos -= step) result.splice(1, 0, pos);
      return result;
    })();
    alignPos.forEach((ax, i) => alignPos.forEach((ay, j) => {
      if ((i === 0 && j === 0) || (i === 0 && j === alignPos.length - 1) || (i === alignPos.length - 1 && j === 0)) return;
      for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++)
        set(ax + dx, ay + dy, Math.max(Math.abs(dx), Math.abs(dy)) !== 1);
    }));
    // Reserve format areas (drawn properly later) and version info.
    drawFormat(modules, isFunction, size, 0, set);
    if (ver >= 7) {
      let rem = ver;
      for (let i = 0; i < 12; i++) rem = (rem << 1) ^ ((rem >>> 11) * 0x1F25);
      const bits = ver << 12 | rem;
      for (let i = 0; i < 18; i++) {
        const bit = ((bits >>> i) & 1) === 1;
        const a = size - 11 + i % 3, b = Math.floor(i / 3);
        set(a, b, bit); set(b, a, bit);
      }
    }

    // Data in zigzag.
    let i = 0;
    for (let right = size - 1; right >= 1; right -= 2) {
      if (right === 6) right = 5;
      for (let vert = 0; vert < size; vert++) {
        for (let j = 0; j < 2; j++) {
          const x = right - j;
          const upward = ((right + 1) & 2) === 0;
          const y = upward ? size - 1 - vert : vert;
          if (!isFunction[y][x] && i < allCodewords.length * 8) {
            modules[y][x] = ((allCodewords[i >>> 3] >>> (7 - (i & 7))) & 1) === 1;
            i++;
          }
        }
      }
    }

    // Choose the mask with the lowest penalty.
    let best = null, bestPenalty = Infinity;
    for (let mask = 0; mask < 8; mask++) {
      const m = modules.map(r => r.slice());
      applyMask(m, isFunction, mask, size);
      drawFormat(m, isFunction, size, mask, (x, y, d) => { m[y][x] = d; });
      const p = penalty(m, size);
      if (p < bestPenalty) { bestPenalty = p; best = m; }
    }
    return best;
  }

  function drawFormat(m, isFunction, size, mask, set) {
    const data = ECL_FORMAT_BITS << 3 | mask;
    let rem = data;
    for (let i = 0; i < 10; i++) rem = (rem << 1) ^ ((rem >>> 9) * 0x537);
    const bits = (data << 10 | rem) ^ 0x5412;
    const bit = i => ((bits >>> i) & 1) === 1;
    for (let i = 0; i <= 5; i++) set(8, i, bit(i));
    set(8, 7, bit(6)); set(8, 8, bit(7)); set(7, 8, bit(8));
    for (let i = 9; i < 15; i++) set(14 - i, 8, bit(i));
    for (let i = 0; i < 8; i++) set(size - 1 - i, 8, bit(i));
    for (let i = 8; i < 15; i++) set(8, size - 15 + i, bit(i));
    set(8, size - 8, true); // dark module
  }

  function applyMask(m, isFunction, mask, size) {
    for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
      let invert;
      switch (mask) {
        case 0: invert = (x + y) % 2 === 0; break;
        case 1: invert = y % 2 === 0; break;
        case 2: invert = x % 3 === 0; break;
        case 3: invert = (x + y) % 3 === 0; break;
        case 4: invert = (Math.floor(x / 3) + Math.floor(y / 2)) % 2 === 0; break;
        case 5: invert = x * y % 2 + x * y % 3 === 0; break;
        case 6: invert = (x * y % 2 + x * y % 3) % 2 === 0; break;
        case 7: invert = ((x + y) % 2 + x * y % 3) % 2 === 0; break;
      }
      if (!isFunction[y][x] && invert) m[y][x] = !m[y][x];
    }
  }

  function penalty(m, size) {
    let result = 0;
    const lineScore = get => {
      let s = 0;
      for (let a = 0; a < size; a++) {
        let run = 1;
        const seq = [];
        for (let b = 0; b < size; b++) seq.push(get(a, b) ? 1 : 0);
        for (let b = 1; b <= size; b++) {
          if (b < size && seq[b] === seq[b - 1]) run++;
          else { if (run >= 5) s += 3 + run - 5; run = 1; }
        }
        const padded = [0, 0, 0, 0].concat(seq, [0, 0, 0, 0]);
        for (let b = 0; b + 11 <= padded.length; b++) {
          const w = padded.slice(b, b + 11).join("");
          if (w === "10111010000" || w === "00001011101") s += 40;
        }
      }
      return s;
    };
    result += lineScore((a, b) => m[a][b]);
    result += lineScore((a, b) => m[b][a]);
    for (let y = 0; y < size - 1; y++) for (let x = 0; x < size - 1; x++) {
      const c = m[y][x];
      if (c === m[y][x + 1] && c === m[y + 1][x] && c === m[y + 1][x + 1]) result += 3;
    }
    let dark = 0;
    m.forEach(r => r.forEach(v => { if (v) dark++; }));
    const total = size * size;
    const k = Math.ceil(Math.abs(dark * 20 - total * 10) / total) - 1;
    result += k * 10;
    return result;
  }

  function svg(text, opts = {}) {
    const m = encode(text);
    const n = m.length, quiet = 4, dim = n + quiet * 2;
    let path = "";
    for (let y = 0; y < n; y++) for (let x = 0; x < n; x++)
      if (m[y][x]) path += `M${x + quiet},${y + quiet}h1v1h-1z`;
    const size = opts.size || 96;
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${dim} ${dim}" width="${size}" height="${size}" shape-rendering="crispEdges" role="img" aria-label="QR code"><rect width="${dim}" height="${dim}" fill="#fff"/><path d="${path}" fill="#000"/></svg>`;
  }

  global.QR = { encode, svg };
  if (typeof module !== "undefined") module.exports = global.QR;
})(typeof window !== "undefined" ? window : globalThis);
