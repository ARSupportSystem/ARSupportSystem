/**
 * Generates AR.js barcode marker images for matrixCodeType: 3x3.
 *
 * AR.js/ARToolKit 3x3 barcodes are a 5x5 visual grid:
 *   - Outer ring (row/col 0 and 4): always black
 *   - Inner 3x3: three fixed orientation cells plus six ID bits
 *
 * The six ID bits give the 64 values recognised by matrixCodeType: 3x3.
 * This is not the same layout as 3x3_HAMMING63 or BCH-style markers.
 */

const MIN_MARKER_ID = 0;
const MAX_MARKER_ID = 63;

const ORIENTATION_CELLS = new Map([
  ['1,1', true],
  ['3,1', true],
  ['3,3', false],
]);

const DATA_CELLS = [
  [3, 2], // bit 0
  [2, 3], // bit 1
  [2, 2], // bit 2
  [2, 1], // bit 3
  [1, 3], // bit 4
  [1, 2], // bit 5
];

function assertValidMarkerId(id) {
  if (!Number.isInteger(id) || id < MIN_MARKER_ID || id > MAX_MARKER_ID) {
    throw new RangeError(`AR.js 3x3 barcode marker ID must be an integer from ${MIN_MARKER_ID} to ${MAX_MARKER_ID}.`);
  }
}

function isInnerCellBlack(id, row, col) {
  const orientationValue = ORIENTATION_CELLS.get(`${row},${col}`);
  if (orientationValue !== undefined) {
    return orientationValue;
  }

  const bitIndex = DATA_CELLS.findIndex(([bitRow, bitCol]) => bitRow === row && bitCol === col);
  return bitIndex >= 0 && ((id >> bitIndex) & 1) === 1;
}

/**
 * Generate a PNG data URL of the AR.js 3x3 barcode marker for the given ID.
 *
 * @param {number} id         Marker ID 0-63
 * @param {object} [options]
 * @param {number} [options.cellSize=40]   Pixels per grid cell (5x5 grid = 200x200 default)
 * @param {number} [options.quietZone=1]   Extra white cells around the 5x5 grid
 * @returns {string} PNG data URL
 */
export function generateArucoDataUrl(id, { cellSize = 40, quietZone = 1 } = {}) {
  assertValidMarkerId(id);

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

  ctx.fillStyle = '#000000';
  for (let row = 0; row < 5; row++) {
    for (let col = 0; col < 5; col++) {
      const isBorder = row === 0 || row === 4 || col === 0 || col === 4;
      const isBlack = isBorder || isInnerCellBlack(id, row, col);

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
 * Precompute and return a Map of data URLs for all IDs 0-63.
 * Call once on app init to avoid repeated canvas operations.
 *
 * @param {object} [options]  Same options as generateArucoDataUrl
 * @returns {Map<number, string>}
 */
export function precomputeAllMarkers(options = {}) {
  const map = new Map();
  for (let id = MIN_MARKER_ID; id <= MAX_MARKER_ID; id++) {
    map.set(id, generateArucoDataUrl(id, options));
  }
  return map;
}
