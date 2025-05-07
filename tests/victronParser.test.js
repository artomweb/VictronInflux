import VictronParser from "../victronParser.js";
import { describe, beforeEach, test, expect } from "vitest";

function getRandomInt(min, max) {
  min = Math.ceil(min);
  max = Math.floor(max);
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function getRandomString(
  length,
  chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789"
) {
  let result = "";
  for (let i = 0; i < length; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

/**
 * Generates a JavaScript object containing random VE.Direct data values.
 * @returns {object} - An object with random VE.Direct key-value pairs.
 */
function generateRandomVEDirectObject() {
  const pids = ["0xA07D", "0xA053", "0xA06C", "0xA389"];
  const loadState = Math.random() > 0.5 ? "ON" : "OFF";
  const errStates = [0, 0, 0, 0, 0, 2, 17, 18, 20, 26, 33];

  const data = {
    PID: pids[getRandomInt(0, pids.length - 1)],
    FW: String(getRandomInt(100, 450)), // Firmware version
    SER: "HQ" + getRandomString(6, "0123456789") + getRandomString(3),
    V: String(getRandomInt(12000, 58000)), // Battery Voltage (mV), covers 12V, 24V, 48V
    I: String(getRandomInt(-45000, 55000)), // Battery Current (mA), positive or negative
    VPV: String(getRandomInt(0, 75000)), // Panel Voltage (mV)
    PPV: String(getRandomInt(0, 1200)), // Panel Power (W)
    CS: String(getRandomInt(0, 9)), // Charge State
    MPPT: String(getRandomInt(0, 2)), // MPPT status
    OR: "0x" + getRandomString(8, "01"), // Off Reason (binary flags)
    ERR: String(errStates[getRandomInt(0, errStates.length - 1)]), // Error code
    LOAD: loadState,
    IL: loadState === "ON" ? String(getRandomInt(0, 20000)) : "0", // Load Current (mA)
    H19: String(getRandomInt(0, 99999)), // Yield total (0.01kWh)
    H20: String(getRandomInt(0, 500)), // Yield today (0.01kWh)
    H21: String(getRandomInt(0, 1200)), // Max power today (W)
    H22: String(getRandomInt(0, 500)), // Yield yesterday (0.01kWh)
    H23: String(getRandomInt(0, 1200)), // Max power yesterday (W)
    HSDS: String(getRandomInt(0, 365)), // Day sequence number
  };

  return data;
}

/**
 * Formats a VE.Direct data object into an array of "KEY\tVALUE" strings.
 * @param {object} dataObject - The object containing VE.Direct key-value pairs.
 * @returns {string[]} - An array of strings, each in the format "KEY\tVALUE".
 */
function formatVEDirectObjectToLines(dataObject) {
  const frameLines = [];
  for (const key in dataObject) {
    // Ensure the property belongs to the object itself
    if (Object.prototype.hasOwnProperty.call(dataObject, key)) {
      frameLines.push(`${key}\t${dataObject[key]}`);
    }
  }
  return frameLines;
}

/**
 * Creates a Buffer representing a valid VE.Direct text frame from lines.
 * The checksum is calculated such that the sum of all bytes in the
 * returned Buffer, when calculated by a compliant parser, is 0.
 *
 * @param {string[]} lines - An array of strings, where each string is a "KEY\tVALUE" pair.
 * @returns {Buffer} - The complete VE.Direct frame as a Buffer.
 */
function createVEDirectFrameBufferFromLines(lines) {
  const dataLinesString = lines.join("\r\n") + "\r\n";
  const checksumPrefixString = "Checksum\t";
  const finalCRLFString = "\r\n";

  // These parts are the data lines, the "Checksum\t" label, and the final "\r\n".
  const stringPartsToSum =
    dataLinesString + checksumPrefixString + finalCRLFString;

  // Convert the combined string into a single Buffer.
  const bufferToSum = Buffer.from(stringPartsToSum, "ascii");

  // Calculate the sum of all bytes in this combined buffer.
  let currentSum = 0;
  for (const byte of bufferToSum) {
    currentSum = (currentSum + byte) & 0xff; // Sum modulo 256
  }

  // The total sum of all bytes in the frame (including the checksum byte) must be 0 (mod 256).
  // (sum_of_parts_without_checksum + checksumByteValue) % 256 === 0
  // checksumByteValue = (256 - sum_of_parts_without_checksum) % 256
  const checksumByteValue = (256 - currentSum) & 0xff;

  const dataLinesBuffer = Buffer.from(dataLinesString, "ascii");
  const checksumPrefixBuffer = Buffer.from(checksumPrefixString, "ascii");
  const finalCRLFBuffer = Buffer.from(finalCRLFString, "ascii");
  const checksumByteBuffer = Buffer.from([checksumByteValue]); // Buffer containing just the checksum byte

  return Buffer.concat([
    dataLinesBuffer, // The data lines
    checksumPrefixBuffer, // "Checksum\t"
    checksumByteBuffer, // The calculated checksum byte
    finalCRLFBuffer, // The final \r\n
  ]);
}

const numberOfTestFrames = 10;
const framesWithData = [];
for (let i = 0; i < numberOfTestFrames; i++) {
  const frameObject = generateRandomVEDirectObject();
  const frameLines = formatVEDirectObjectToLines(frameObject);
  const frameBuffer = createVEDirectFrameBufferFromLines(frameLines);
  const expectedObject = frameObject;

  framesWithData.push({
    lines: frameLines,
    buffer: frameBuffer,
    expected: expectedObject,
  });
}

describe("VictronParser", () => {
  let parser;

  beforeEach(() => {
    parser = new VictronParser();
  });

  // Test case 1: Processing individual, valid frames
  framesWithData.forEach(({ lines, buffer, expected }, index) => {
    test(`processes individual valid frame ${index + 1}`, () => {
      const parsedResults = parser.processData(buffer);

      // Expect exactly one frame to be parsed
      expect(parsedResults).toHaveLength(1);
      // Expect the parsed frame to match the expected object
      expect(parsedResults[0]).toEqual(expected);
    });
  });
});
