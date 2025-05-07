const CHECKSUM_LABEL = Buffer.from("Checksum\t");
const FRAME_SEPARATOR = Buffer.from("\r\n");

class VictronParser {
  constructor() {
    this.buffer = Buffer.alloc(0);
  }

  processData(data) {
    this.buffer = Buffer.concat([this.buffer, data]);
    const parsedFrames = [];

    while (true) {
      const checksumPos = this.buffer.indexOf(CHECKSUM_LABEL);
      if (checksumPos === -1) break;

      const frameEnd =
        this.buffer.indexOf(FRAME_SEPARATOR, checksumPos) +
        FRAME_SEPARATOR.length;
      if (frameEnd <= FRAME_SEPARATOR.length) break;

      const frame = this.buffer.subarray(0, frameEnd);
      this.buffer = this.buffer.subarray(frameEnd);

      if (this.calculateChecksum(frame) === 0) {
        const parsed = this.parseVEDirectFrame(frame);
        if (Object.keys(parsed).length > 0) {
          parsedFrames.push(parsed);
        }
      }
    }

    if (this.buffer.length > 10240) {
      this.buffer = Buffer.alloc(0);
    }

    return parsedFrames;
  }

  calculateChecksum(buf) {
    if (!Buffer.isBuffer(buf)) return -1;
    let checksum = 0;
    for (const byte of buf) {
      checksum = (checksum + byte) & 0xff;
    }
    return checksum;
  }

  parseVEDirectFrame(buf) {
    const frame = {};
    try {
      const lines = buf.toString("ascii").split("\r\n");
      for (const line of lines) {
        if (!line || line.startsWith("Checksum") || line.startsWith(":"))
          continue;
        const [key, ...valueParts] = line.split("\t");
        if (key) {
          frame[key] = valueParts.join("\t");
        }
      }
    } catch (error) {
      console.error(
        "Error parsing VE.Direct frame:",
        error,
        buf.toString("ascii")
      );
    }
    return frame;
  }
}

export default VictronParser;
