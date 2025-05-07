import { SerialPort } from "serialport";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { config } from "dotenv";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
config({ path: path.join(__dirname, "../.env") });

const SERIAL_PORT = process.env.PORT;
const BAUD_RATE = 19200;
const OUTPUT_DIR = path.join(__dirname, "victron_logs");
const OUTPUT_FILE = path.join(
  OUTPUT_DIR,
  `victron_bytes_${new Date().toISOString().replace(/[:.]/g, "-")}.txt`
);

// Ensure output directory exists
if (!fs.existsSync(OUTPUT_DIR)) {
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  console.log(`Created output directory: ${OUTPUT_DIR}`);
}

// Initialize serial port
let port;
try {
  port = new SerialPort({
    path: SERIAL_PORT,
    baudRate: BAUD_RATE,
    dataBits: 8,
    parity: "none",
    stopBits: 1,
  });
  console.log(`Serial port ${SERIAL_PORT} opened at ${BAUD_RATE} baud.`);
} catch (error) {
  console.error(`Error opening serial port ${SERIAL_PORT}:`, error.message);
  process.exit(1);
}

// Create write stream for logging raw bytes
const logStream = fs.createWriteStream(OUTPUT_FILE, { flags: "a" });
console.log(`Logging raw bytes to: ${OUTPUT_FILE}`);

// Handle incoming serial data
port.on("data", (data) => {
  const timestamp = new Date().toISOString();
  const buffer = Buffer.from(data);

  // Log to console (hex format for readability)
  console.log(
    `${timestamp} - Received ${buffer.length} bytes: ${buffer.toString("hex")}`
  );

  // Write timestamp and raw bytes to file
  logStream.write(`${timestamp}\t${buffer.toString("hex")}\n`);
});

// Handle serial port errors
port.on("error", (err) => {
  console.error("Serial Port Error:", err.message);
});

// Graceful shutdown
process.on("SIGINT", () => {
  console.log("\nSIGINT received. Closing...");

  if (port && port.isOpen) {
    port.close((err) => {
      if (err) {
        console.error("Error closing serial port:", err.message);
      } else {
        console.log("Serial port closed.");
      }
    });
  }

  logStream.end(() => {
    console.log(`Log file closed: ${OUTPUT_FILE}`);
    process.exit(0);
  });
});

console.log("Victron byte recorder started. Waiting for data...");
