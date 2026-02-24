import express from 'express';
import cors from 'cors';
import Busboy from 'busboy';
import unzipper from 'unzipper';
import { SaxesParser } from 'saxes';

const PORT = process.env.PORT || 8080;

const LIMITS = {
  MAX_RECORDS: 50000,
  MAX_WORKOUTS: 50000,
  MAX_ROUTE_POINTS: 20000,
  MAX_ECG_SAMPLES: 10000
};

const app = express();
const allowedOrigins = new Set(
  (process.env.FRONTEND_ORIGINS || 'https://yarivms.github.io,http://localhost:5173,http://127.0.0.1:5173')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean)
);

app.use(
  cors({
    origin: (origin, callback) => {
      if (!origin || allowedOrigins.has(origin)) {
        callback(null, true);
        return;
      }
      callback(new Error('Origin not allowed by CORS'));
    }
  })
);

app.get('/health', (_req, res) => {
  res.json({ ok: true });
});

app.post('/api/parse', (req, res) => {
  console.log('[API] POST /api/parse - Request received');
  const stats = createStats();
  const busboy = Busboy({
    headers: req.headers,
    limits: {
      files: 1,
      fileSize: 2 * 1024 * 1024 * 1024
    }
  });

  let fileHandled = false;
  let responded = false;

  const sendOnce = (status, payload) => {
    if (responded) return;
    responded = true;
    res.status(status).json(payload);
  };

  busboy.on('file', (_name, file, info) => {
    if (fileHandled) {
      file.resume();
      return;
    }

    fileHandled = true;
    stats.uploadedFileName = info?.filename || null;
    stats.uploadedMimeType = info?.mimeType || null;
    console.log(`[API] File received: ${info?.filename}, type: ${info?.mimeType}`);

    console.log('[API] Starting ZIP parse...');
    parseZipStream(file, stats)
      .then(() => {
        finalizeStats(stats);
        console.log(`[API] Parse complete: ${stats.totalRecords} records, ${stats.totalWorkouts} workouts`);
        sendOnce(200, stats);
      })
      .catch((err) => {
        console.error('[API] Parse error:', err.message);
        sendOnce(400, { error: err.message || 'Failed to parse ZIP' });
      });
  });

  busboy.on('finish', () => {
    if (!fileHandled && !responded) {
      sendOnce(400, { error: 'No file uploaded' });
    }
  });

  busboy.on('error', (err) => {
    sendOnce(400, { error: err.message || 'Upload failed' });
  });

  req.pipe(busboy);
});

app.listen(PORT, () => {
  console.log(`Server listening on ${PORT}`);
});

function createStats() {
  return {
    uploadedFileName: null,
    uploadedMimeType: null,
    totalRecords: 0,
    totalWorkouts: 0,
    totalECGs: 0,
    totalRoutes: 0,
    mainRecords: [],
    clinicalRecords: [],
    workouts: [],
    ecgs: [],
    workoutRoutes: [],
    recordsTruncated: false,
    clinicalTruncated: false,
    workoutsTruncated: false,
    routesTruncated: false,
    ecgSamplesTruncated: false,
    warnings: []
  };
}

function finalizeStats(stats) {
  stats.totalECGs = stats.ecgs.length;
  stats.totalRoutes = stats.workoutRoutes.length;
}

function parseZipStream(stream, stats) {
  return new Promise((resolve, reject) => {
    const tasks = [];
    const zip = stream.pipe(unzipper.Parse({ forceStream: true }));

    zip.on('entry', (entry) => {
      const path = entry.path || '';
      if (entry.type !== 'File') {
        entry.autodrain();
        return;
      }

      if (isZip(path)) {
        console.log(`[ZIP] Found nested ZIP: ${path}`);
        tasks.push(parseZipStream(entry, stats));
        return;
      }

      if (isExportXml(path)) {
        console.log(`[ZIP] Found export XML: ${path}`);
        tasks.push(parseHealthXml(entry, stats, 'main'));
        return;
      }

      if (isCdaXml(path)) {
        console.log(`[ZIP] Found clinical XML: ${path}`);
        tasks.push(parseHealthXml(entry, stats, 'clinical'));
        return;
      }

      if (isEcgXml(path)) {
        console.log(`[ZIP] Found ECG XML: ${path}`);
        tasks.push(parseEcgXml(entry, stats, path));
        return;
      }

      if (isRouteFile(path)) {
        console.log(`[ZIP] Found route file: ${path}`);
        tasks.push(parseRouteFile(entry, stats, path));
        return;
      }

      entry.autodrain();
    });

    zip.on('close', () => {
      console.log(`[ZIP] All entries processed, waiting for ${tasks.length} parsing tasks...`);
      Promise.all(tasks).then(resolve).catch(reject);
    });
    zip.on('error', reject);
  });
}

function parseHealthXml(stream, stats, target) {
  return new Promise((resolve, reject) => {
    console.log(`[XML] Starting ${target} XML parsing...`);
    const parser = new SaxesParser({ xmlns: false });
    let recordCount = 0;
    let workoutCount = 0;

    parser.on('error', (err) => {
      stats.warnings.push(`${target} XML parse error: ${err.message}`);
      parser.error = null;
      parser.resume();
    });

    parser.on('opentag', (node) => {
      if (node.name === 'Record') {
        stats.totalRecords += 1;
        recordCount += 1;
        if (recordCount % 10000 === 0) {
          console.log(`[XML] ${target}: Processed ${recordCount} records...`);
        }
        const record = {
          type: getAttr(node, 'type'),
          startDate: getAttr(node, 'startDate'),
          endDate: getAttr(node, 'endDate'),
          value: getAttr(node, 'value'),
          unit: getAttr(node, 'unit'),
          sourceName: getAttr(node, 'sourceName'),
          sourceVersion: getAttr(node, 'sourceVersion')
        };

        if (target === 'main') {
          if (stats.mainRecords.length < LIMITS.MAX_RECORDS) {
            stats.mainRecords.push(record);
          } else {
            stats.recordsTruncated = true;
          }
        } else {
          if (stats.clinicalRecords.length < LIMITS.MAX_RECORDS) {
            stats.clinicalRecords.push(record);
          } else {
            stats.clinicalTruncated = true;
          }
        }
      }

      if (node.name === 'Workout') {
        stats.totalWorkouts += 1;
        workoutCount += 1;
        if (workoutCount % 1000 === 0) {
          console.log(`[XML] ${target}: Processed ${workoutCount} workouts...`);
        }
        const workout = {
          workoutActivityType: getAttr(node, 'workoutActivityType'),
          startDate: getAttr(node, 'startDate'),
          endDate: getAttr(node, 'endDate'),
          duration: getAttr(node, 'duration'),
          durationUnit: getAttr(node, 'durationUnit'),
          totalEnergyBurned: getAttr(node, 'totalEnergyBurned'),
          totalEnergyBurnedUnit: getAttr(node, 'totalEnergyBurnedUnit'),
          totalDistance: getAttr(node, 'totalDistance'),
          totalDistanceUnit: getAttr(node, 'totalDistanceUnit')
        };

        if (stats.workouts.length < LIMITS.MAX_WORKOUTS) {
          stats.workouts.push(workout);
        } else {
          stats.workoutsTruncated = true;
        }
      }
    });

    stream.on('data', (chunk) => {
      parser.write(chunk.toString('utf8'));
    });

    stream.on('end', () => {
      parser.close();
      console.log(`[XML] ${target} XML parsing complete: ${recordCount} records, ${workoutCount} workouts`);
      resolve();
    });

    stream.on('error', reject);
  });
}

function parseEcgXml(stream, stats, filename) {
  return new Promise((resolve, reject) => {
    const parser = new SaxesParser({ xmlns: false });
    const ecg = {
      filename,
      timestamp: null,
      heartRate: null,
      classification: null,
      sampleRate: null,
      sampleCount: 0
    };

    parser.on('error', (err) => {
      stats.warnings.push(`ECG XML parse error (${filename}): ${err.message}`);
      parser.error = null;
      parser.resume();
    });

    parser.on('opentag', (node) => {
      if (
        node.name === 'ElectrocardiogramData' ||
        node.name === 'Electrocardiogram' ||
        node.name === 'ECG'
      ) {
        ecg.timestamp = ecg.timestamp || getAttr(node, 'timestamp') || getAttr(node, 'recordingDate');
        ecg.heartRate = ecg.heartRate || getAttr(node, 'heartRate') || getAttr(node, 'hr');
        ecg.classification = ecg.classification || getAttr(node, 'classification');
        ecg.sampleRate = ecg.sampleRate || getAttr(node, 'sampleRate');
      }

      if (node.name === 'Sample') {
        ecg.sampleCount += 1;
        if (ecg.sampleCount > LIMITS.MAX_ECG_SAMPLES) {
          stats.ecgSamplesTruncated = true;
        }
      }
    });

    stream.on('data', (chunk) => {
      parser.write(chunk.toString('utf8'));
    });

    stream.on('end', () => {
      parser.close();
      stats.ecgs.push(ecg);
      resolve();
    });

    stream.on('error', reject);
  });
}

function parseRouteFile(stream, stats, filename) {
  return new Promise((resolve, reject) => {
    const parser = new SaxesParser({ xmlns: false });
    const route = {
      filename,
      points: [],
      pointCount: 0,
      truncated: false
    };

    parser.on('error', (err) => {
      stats.warnings.push(`Route XML parse error (${filename}): ${err.message}`);
      parser.error = null;
      parser.resume();
    });

    parser.on('opentag', (node) => {
      if (node.name !== 'trkpt') return;

      route.pointCount += 1;
      if (route.points.length >= LIMITS.MAX_ROUTE_POINTS) {
        route.truncated = true;
        stats.routesTruncated = true;
        return;
      }

      route.points.push({
        lat: toNumber(getAttr(node, 'lat')),
        lon: toNumber(getAttr(node, 'lon')),
        elevation: null,
        time: null,
        speed: null
      });
    });

    let currentTag = null;
    parser.on('opentag', (node) => {
      if (node.name === 'ele' || node.name === 'time' || node.name === 'speed') {
        currentTag = node.name;
      }
    });

    parser.on('text', (text) => {
      if (!currentTag || route.points.length === 0) return;
      const point = route.points[route.points.length - 1];
      if (currentTag === 'ele') point.elevation = text;
      if (currentTag === 'time') point.time = text;
      if (currentTag === 'speed') point.speed = text;
    });

    parser.on('closetag', (name) => {
      if (name === currentTag) currentTag = null;
    });

    stream.on('data', (chunk) => {
      parser.write(chunk.toString('utf8'));
    });

    stream.on('end', () => {
      parser.close();
      stats.workoutRoutes.push(route);
      resolve();
    });

    stream.on('error', reject);
  });
}

function getAttr(node, key) {
  if (!node.attributes) return null;
  const attr = node.attributes[key];
  if (!attr) return null;
  if (typeof attr === 'string') return attr;
  if (typeof attr.value === 'string') return attr.value;
  return null;
}

function toNumber(value) {
  if (value === null || value === undefined) return null;
  const num = Number(value);
  return Number.isFinite(num) ? num : null;
}

function isZip(path) {
  return path.toLowerCase().endsWith('.zip');
}

function isExportXml(path) {
  const lower = path.toLowerCase();
  return lower.endsWith('export.xml') && !lower.includes('cda');
}

function isCdaXml(path) {
  const lower = path.toLowerCase();
  return lower.includes('cda') && lower.endsWith('.xml');
}

function isEcgXml(path) {
  const lower = path.toLowerCase();
  return lower.includes('electro') && lower.endsWith('.xml');
}

function isRouteFile(path) {
  const lower = path.toLowerCase();
  return (lower.includes('workout') || lower.includes('route')) && (lower.endsWith('.gpx') || lower.endsWith('.xml'));
}
