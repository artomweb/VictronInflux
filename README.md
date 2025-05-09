Read from Victron VEDirect port and save to InfluxDB.

`.env` looks like this:

```bash
PORT=/dev/victron
INFLUX_URL=http://localhost:8086
INFLUX_TOKEN=
INFLUX_ORG=
INFLUX_BUCKET=
```

## Tests

There is a test written for the parser `victronParser.js`. The test generates 10 frames which a Victron device would send, computes the checksum byte and then runs it through the parer.

You can run it with:

```bash
npm test
```
