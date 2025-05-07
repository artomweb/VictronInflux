import { SerialPort } from "serialport";
import path from "path";
import { fileURLToPath } from "url";
import { config } from "dotenv";
import { InfluxDB, Point } from "@influxdata/influxdb-client";
import VictronParser from "./victronParser.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
config({ path: path.join(__dirname, ".env") });

const influxUrl = process.env.INFLUX_URL || "http://localhost:8086";
const influxToken = process.env.INFLUX_TOKEN;
const influxOrg = process.env.INFLUX_ORG;
const influxBucket = process.env.INFLUX_BUCKET;

const influxClient = new InfluxDB({ url: influxUrl, token: influxToken });
const writeApi = influxClient.getWriteApi(influxOrg, influxBucket);
writeApi.useDefaultTags({ source: "vedirect-logger" });

console.log("Influx Config:", {
  url: influxUrl,
  org: influxOrg,
  bucket: influxBucket,
  token: influxToken?.substring(0, 8) + "****",
});

const SERIAL_PORT = process.env.PORT;
const BAUD_RATE = 19200;

if (!SERIAL_PORT) {
  console.error("Missing environment variable: PORT");
  process.exit(1);
}

// --- Serial Port Setup (VE.Direct) ---
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
  console.error(`Error opening serial port ${SERIAL_PORT}:`, error);
  process.exit(1);
}

port.on("error", (err) => {
  console.error("Serial Port Error: ", err.message);
});

let latestData = null;
let isFirstUpload = true;

async function writeToInflux(data) {
  try {
    const point = new Point("vedirect")
      .floatField("voltage", parseFloat(data.V))
      .floatField("current", parseFloat(data.I))
      .floatField("pv_voltage", parseFloat(data.VPV))
      .floatField("pv_power", parseFloat(data.PPV))
      .floatField("yield_today", parseFloat(data.H20))
      .floatField("yield_total", parseFloat(data.H19))
      .floatField("max_power_today", parseFloat(data.H21))
      .tag("state", data.CS || "unknown")
      .tag("MPPT", data.MPPT || "unknown");

    writeApi.writePoint(point);
    console.log("InfluxDB: VE.Direct data written.");
  } catch (err) {
    console.error("InfluxDB VE.Direct write error:", err.message);
  }
}

const parser = new VictronParser();

// VE.Direct port handling
port.on("data", async (data) => {
  const parsedFrames = parser.processData(data);
  for (const parsed of parsedFrames) {
    latestData = parsed;
    if (isFirstUpload) {
      console.log("Uploading first valid VE.Direct data immediately.");
      isFirstUpload = false;
      await writeToInflux(latestData);
    }
  }
});

const influxUploadInterval = setInterval(async () => {
  if (latestData) {
    console.log("Influx interval: uploading VE.Direct data...");
    await writeToInflux(latestData);
  }
}, 60 * 1000);

process.on("SIGINT", async () => {
  console.log("\nSIGINT received");

  clearInterval(influxUploadInterval);

  // Close InfluxDB client
  if (writeApi) {
    try {
      await writeApi.close();
      console.log("InfluxDB client closed.");
    } catch (err) {
      console.error("Error closing InfluxDB:", err.message);
    }
  }

  // Wait for serial port to close
  if (port && port.isOpen) {
    try {
      await new Promise((resolve, reject) => {
        port.close((err) => {
          if (err) {
            reject(err);
          } else {
            resolve();
          }
        });
      });
      console.log("Serial port closed.");
    } catch (err) {
      console.error("Error closing serial port:", err.message);
    }
  } else {
    console.log("Serial port already closed or not initialized.");
  }

  console.log("Cleanup complete. Exiting...");
  process.exit(0);
});

console.log("VE.Direct logger started. Waiting for data...");
