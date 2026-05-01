/**
 * Generates ArUco barcode marker images for AR.js matrixCodeType: 3x3.
 *
 * Each marker is a 5×5 grid:
 *   - Outer ring (row/col 0 and 4): always black
 *   - Inner 3×3 (rows/cols 1–3): BCH(9,6) encoded bits of the ID
 *     g(x) = x³ + x + 1, 1 bit = black cell, 0 bit = white cell
 *     Bits placed MSB-first, row by row: bit 8 → inner[0][0] … bit 0 → inner[2][2]
 *
 * Valid IDs: 0–49 (the range AR.js 3x3 recognises).
 */

/**
 * Compute 3 BCH parity bits for a 6-bit data value.
 * Uses polynomial long division in GF(2) with g(x) = x³ + x + 1 (0b1011).
 */
function bchParity(id) {
  const GEN = 0b1011;
  let codeword = (id & 0b111111) << 3; // shift data up by 3 to leave room for parity
  for (let i = 8; i >= 3; i--) {
    if ((codeword >> i) & 1) {
      codeword ^= GEN << (i - 3);
    }
  }
  return codeword & 0b111;
}

/**
 * Returns the 9-bit BCH codeword for the given marker ID.
 * Bits 8..3 = data (the ID), bits 2..0 = parity.
 */
function encodeMarkerBits(id) {
  return ((id & 0b111111) << 3) | bchParity(id);
}

/**
 * Generate a PNG data URL of the ArUco marker for the given ID.
 *
 * @param {number} id         Marker ID 0–49
 * @param {object} [options]
 * @param {number} [options.cellSize=40]   Pixels per grid cell (5×5 grid = 200×200 default)
 * @param {number} [options.quietZone=1]   Extra white cells around the 5×5 grid
 * @returns {string} PNG data URL
 */
export function generateArucoDataUrl(id, { cellSize = 40, quietZone = 1 } = {}) {
  const totalCells = 5 + 2 * quietZone;
  const size = totalCells * cellSize;

  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');

  // White background (quiet zone)
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, size, size);

  const offset = quietZone * cellSize;
  const bits = encodeMarkerBits(id);

  ctx.fillStyle = '#000000';
  for (let row = 0; row < 5; row++) {
    for (let col = 0; col < 5; col++) {
      let isBlack;

      if (row === 0 || row === 4 || col === 0 || col === 4) {
        // Outer border ring — always black
        isBlack = true;
      } else {
        // Inner 3×3: map (row 1–3, col 1–3) to bit index (MSB first)
        const innerRow = row - 1; // 0..2
        const innerCol = col - 1; // 0..2
        const bitIndex = 8 - (innerRow * 3 + innerCol);
        isBlack = ((bits >> bitIndex) & 1) === 1;
      }

      if (isBlack) {
        ctx.fillRect(
          offset + col * cellSize,
          offset + row * cellSize,
          cellSize,
          cellSize,
        );
      }
    }
  }

  return canvas.toDataURL('image/png');
}

/**
 * Precompute and return a Map of data URLs for all IDs 0–49.
 * Call once on app init to avoid repeated canvas operations.
 *
 * @param {object} [options]  Same options as generateArucoDataUrl
 * @returns {Map<number, string>}
 */
export function precomputeAllMarkers(options = {}) {
  const map = new Map();
  for (let id = 0; id <= 49; id++) {
    map.set(id, generateArucoDataUrl(id, options));
  }
  return map;
}
