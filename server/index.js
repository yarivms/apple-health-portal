import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import path from 'path';
import fs from 'fs';
import https from 'https';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.resolve(__dirname, '.env') });
import express from 'express';
import cors from 'cors';
import Busboy from 'busboy';
import unzipper from 'unzipper';
import { SaxesParser } from 'saxes';
import { Readable } from 'stream';
import OpenAI from 'openai';

const PORT = process.env.PORT || 8080;

const LIMITS = {
  MAX_RECORDS: 50000,
  MAX_WORKOUTS: 50000,
  MAX_ROUTE_POINTS: 20000,
  MAX_ECG_SAMPLES: 10000,
  MAX_ECGS: 500
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

    // Buffer the entire file into memory first
    const chunks = [];
    let totalBytes = 0;

    file.on('data', (chunk) => {
      chunks.push(chunk);
      totalBytes += chunk.length;
      if (totalBytes % (10 * 1024 * 1024) < 65536) { // Log roughly every 10MB
        console.log(`[UPLOAD] Received ${(totalBytes / 1024 / 1024).toFixed(1)} MB`);
      }
    });

    file.on('end', async () => {
      console.log(`[UPLOAD] Upload complete: ${(totalBytes / 1024 / 1024).toFixed(1)} MB`);
      const buffer = Buffer.concat(chunks);
      console.log('[API] Starting ZIP parse from buffer...');
      
      try {
        // Open ZIP from buffer
        const directory = await unzipper.Open.buffer(buffer);
        console.log(`[ZIP] Opened ZIP, found ${directory.files.length} files`);
        
        await parseZipFromDirectory(directory, stats);
        
        finalizeStats(stats);
        console.log(`[API] Parse complete: ${stats.totalRecords} records, ${stats.totalWorkouts} workouts, ${stats.totalECGs} ECGs, ${stats.totalRoutes} routes`);
        console.log(`[API] Warnings: ${stats.warnings.length}`, stats.warnings.slice(0, 10));

        // Debug: sample workout data
        if (stats.workouts.length > 0) {
          const sample = stats.workouts.slice(0, 3);
          console.log('[DEBUG] Sample workouts:', JSON.stringify(sample, null, 2));
          // Find running workouts specifically
          const runs = stats.workouts.filter(w => w.workoutActivityType === 'HKWorkoutActivityTypeRunning');
          console.log(`[DEBUG] Running workouts: ${runs.length}`);
          if (runs.length > 0) {
            console.log('[DEBUG] First 3 runs:', JSON.stringify(runs.slice(0, 3).map(r => ({
              type: r.workoutActivityType,
              date: r.startDate,
              distance: r.totalDistance,
              distUnit: r.totalDistanceUnit,
              duration: r.duration,
              durUnit: r.durationUnit,
              energy: r.totalEnergyBurned,
              energyUnit: r.totalEnergyBurnedUnit,
            })), null, 2));
            const longest = runs.reduce((a, b) => (parseFloat(a.totalDistance) || 0) > (parseFloat(b.totalDistance) || 0) ? a : b);
            console.log('[DEBUG] Longest run:', JSON.stringify(longest, null, 2));
            const noDistance = runs.filter(r => !r.totalDistance || r.totalDistance === '0');
            console.log(`[DEBUG] Runs without distance: ${noDistance.length} of ${runs.length}`);
          }
        }

        // Debug: measure response size
        const totalRoutePoints = stats.workoutRoutes.reduce((s, r) => s + (r.points?.length || 0), 0);
        console.log(`[DEBUG] Total route points: ${totalRoutePoints}`);
        const jsonStr = JSON.stringify(stats);
        console.log(`[DEBUG] Response JSON size: ${(jsonStr.length / 1024 / 1024).toFixed(2)} MB`);

        sendOnce(200, stats);
      } catch (err) {
        console.error('[API] Parse error:', err.message);
        sendOnce(400, { error: err.message || 'Failed to parse ZIP' });
      }
    });

    file.on('error', (err) => {
      console.error('[UPLOAD] File stream error:', err.message);
      sendOnce(400, { error: 'Upload failed' });
    });
  });

  busboy.on('finish', () => {
    console.log('[BUSBOY] Finish event fired');
    if (!fileHandled && !responded) {
      sendOnce(400, { error: 'No file uploaded' });
    }
  });

  busboy.on('error', (err) => {
    console.error('[BUSBOY] Error:', err.message);
    sendOnce(400, { error: err.message || 'Upload failed' });
  });

  req.pipe(busboy);
});

// --- AI Chat endpoint ---
app.use(express.json({ limit: '2mb' }));

const openai = process.env.OPENAI_API_KEY
  ? new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
  : null;

app.post('/api/ask', async (req, res) => {
  if (!openai) {
    return res.status(500).json({ error: 'OPENAI_API_KEY is not configured on the server.' });
  }

  const { question, healthSummary, conversationHistory } = req.body;
  if (!question) {
    return res.status(400).json({ error: 'Missing "question" field.' });
  }

  console.log(`[AI] Question: ${question.slice(0, 120)}...`);

  // Build a compact context string from the health summary
  let contextStr = '';
  if (healthSummary) {
    const parts = [];
    if (healthSummary.totalRecords) parts.push(`Total health records: ${healthSummary.totalRecords}`);
    if (healthSummary.totalWorkouts) parts.push(`Total workouts: ${healthSummary.totalWorkouts}`);
    if (healthSummary.totalECGs) parts.push(`Total ECGs: ${healthSummary.totalECGs}`);
    if (healthSummary.allDates?.length) {
      parts.push(`Date range: ${healthSummary.allDates[0]} to ${healthSummary.allDates[healthSummary.allDates.length - 1]}`);
      parts.push(`Days tracked: ${healthSummary.allDates.length}`);
    }
    if (healthSummary.workoutsByDate) {
      const totalWk = Object.values(healthSummary.workoutsByDate).reduce((a, b) => a + b, 0);
      const wkDays = Object.keys(healthSummary.workoutsByDate).length;
      parts.push(`Workout days: ${wkDays}, Total workout sessions: ${totalWk}`);
    }
    if (healthSummary.topMetrics) {
      parts.push('\\nTop health metrics:');
      for (const m of healthSummary.topMetrics) {
        const name = m.type.replace('HKQuantityTypeIdentifier', '').replace('HKCategoryTypeIdentifier', '');
        parts.push(`  - ${name}: count=${m.count}, avg=${m.avg}, min=${m.min}, max=${m.max} ${m.unit || ''}`);
      }
    }
    if (healthSummary.metricsByType) {
      const metricNames = Object.keys(healthSummary.metricsByType)
        .map(t => t.replace('HKQuantityTypeIdentifier', '').replace('HKCategoryTypeIdentifier', ''));
      parts.push(`\\nAll available metric types (${metricNames.length}): ${metricNames.join(', ')}`);
    }
    contextStr = parts.join('\\n');
  }

  const systemPrompt = `You are a helpful health data analyst assistant for an Apple Health dashboard.
The user has uploaded their Apple Health export data. Here is a summary of their data:

${contextStr}

Guidelines:
- Answer questions about the user's health data using the summary above.
- Provide specific numbers and insights when the data supports it.
- If the data doesn't contain information to answer, say so clearly.
- Be encouraging but honest. Don't make medical diagnoses.
- Keep answers concise (2-4 paragraphs max).
- Use metric/imperial units as appropriate for the data.
- You can suggest health insights, trends, and actionable recommendations.`;

  try {
    const messages = [
      { role: 'system', content: systemPrompt }
    ];

    // Include conversation history if provided (last 10 messages)
    if (conversationHistory && Array.isArray(conversationHistory)) {
      for (const msg of conversationHistory.slice(-10)) {
        messages.push({ role: msg.role, content: msg.content });
      }
    }

    messages.push({ role: 'user', content: question });

    const completion = await openai.chat.completions.create({
      model: process.env.OPENAI_MODEL || 'gpt-4o-mini',
      messages,
      max_tokens: 1000,
      temperature: 0.7
    });

    const answer = completion.choices?.[0]?.message?.content || 'No response generated.';
    console.log(`[AI] Response length: ${answer.length} chars`);
    res.json({ answer });
  } catch (err) {
    console.error('[AI] OpenAI error:', err.message);
    res.status(500).json({ error: `AI request failed: ${err.message}` });
  }
});

app.listen(PORT, () => {
  console.log(`HTTP server listening on ${PORT}`);
});

// HTTPS server for GitHub Pages (HTTPS → localhost)
const HTTPS_PORT = process.env.HTTPS_PORT || 8443;
const certPath = path.resolve(__dirname, 'certs', 'localhost-cert.pem');
const keyPath = path.resolve(__dirname, 'certs', 'localhost-key.pem');

if (fs.existsSync(certPath) && fs.existsSync(keyPath)) {
  const httpsOptions = {
    key: fs.readFileSync(keyPath),
    cert: fs.readFileSync(certPath),
  };
  https.createServer(httpsOptions, app).listen(HTTPS_PORT, () => {
    console.log(`HTTPS server listening on ${HTTPS_PORT}`);
    console.log(`  → Use https://localhost:${HTTPS_PORT} from GitHub Pages`);
    console.log(`  → You must trust the self-signed cert once in your browser:`);
    console.log(`    Open https://localhost:${HTTPS_PORT}/health and accept the warning`);
  });
} else {
  console.log('No TLS certs found in server/certs/ — HTTPS disabled.');
  console.log('Run: openssl req -x509 -newkey rsa:2048 -keyout server/certs/localhost-key.pem -out server/certs/localhost-cert.pem -days 365 -nodes -subj "/CN=localhost"');
}

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
    warnings: [],
    // Aggregated data for the dashboard (avoids sending huge arrays)
    metricsByType: {},    // type -> { values, count, min, max, sum, unit, source }
    workoutsByDate: {},   // YYYY-MM-DD -> count
    allDatesSet: new Set()
  };
}

function parseDateKey(dateStr) {
  if (!dateStr) return null;
  const m = dateStr.match(/(\d{4})-(\d{2})-(\d{2})/);
  return m ? `${m[1]}-${m[2]}-${m[3]}` : null;
}

function aggregateRecord(stats, record) {
  const { type, value, endDate, unit, sourceName } = record;
  if (!type || value === null || value === undefined) return;

  const dateKey = parseDateKey(endDate);
  if (dateKey) stats.allDatesSet.add(dateKey);

  const numValue = parseFloat(value);
  if (!stats.metricsByType[type]) {
    stats.metricsByType[type] = {
      dailyAgg: {},   // dateKey -> { sum, count, min, max }
      values: [],     // built from dailyAgg in finalizeStats
      count: 0,
      sum: 0,
      min: Infinity,
      max: -Infinity,
      unit: unit || '',
      source: sourceName || 'Unknown'
    };
  }

  const metric = stats.metricsByType[type];
  metric.count += 1;

  if (!isNaN(numValue)) {
    metric.sum += numValue;
    if (numValue < metric.min) metric.min = numValue;
    if (numValue > metric.max) metric.max = numValue;

    // Aggregate by day instead of sampling raw values
    if (dateKey) {
      if (!metric.dailyAgg[dateKey]) {
        metric.dailyAgg[dateKey] = { sum: 0, count: 0, min: Infinity, max: -Infinity };
      }
      const day = metric.dailyAgg[dateKey];
      day.sum += numValue;
      day.count += 1;
      if (numValue < day.min) day.min = numValue;
      if (numValue > day.max) day.max = numValue;
    }
  }
}

function aggregateWorkout(stats, workout) {
  const dateKey = parseDateKey(workout.startDate);
  if (dateKey) {
    stats.allDatesSet.add(dateKey);
    stats.workoutsByDate[dateKey] = (stats.workoutsByDate[dateKey] || 0) + 1;
  }
}

function finalizeStats(stats) {
  stats.totalECGs = stats.ecgs.length;
  stats.totalRoutes = stats.workoutRoutes.length;

  // Convert allDatesSet to sorted array
  stats.allDates = Array.from(stats.allDatesSet).sort();
  delete stats.allDatesSet;

  // Fix Infinity values in metrics and build daily values arrays
  for (const metric of Object.values(stats.metricsByType)) {
    if (metric.min === Infinity) metric.min = 0;
    if (metric.max === -Infinity) metric.max = 0;
    if (metric.count > 0) {
      metric.avg = +(metric.sum / metric.count).toFixed(2);
    }

    // Build values array from daily aggregation
    if (metric.dailyAgg) {
      const sortedDays = Object.keys(metric.dailyAgg).sort();
      metric.values = sortedDays.map(dateKey => {
        const day = metric.dailyAgg[dateKey];
        return {
          date: dateKey,
          value: +(day.sum / day.count).toFixed(2),  // daily average
          min: +(day.min).toFixed(2),
          max: +(day.max).toFixed(2),
          count: day.count,
          timestamp: new Date(dateKey).getTime()
        };
      });
      delete metric.dailyAgg;  // free memory
    }
  }

  // Build compact summary
  stats.summary = {
    totalRecords: stats.totalRecords,
    totalWorkouts: stats.totalWorkouts,
    totalECGs: stats.totalECGs,
    uniqueDates: stats.allDates.length,
    dateRange: {
      start: stats.allDates[0] ? new Date(stats.allDates[0]).getTime() : null,
      end: stats.allDates.length ? new Date(stats.allDates[stats.allDates.length - 1]).getTime() : null
    },
    topMetrics: Object.entries(stats.metricsByType)
      .sort((a, b) => b[1].count - a[1].count)
      .slice(0, 15)
      .map(([type, data]) => ({
        type,
        count: data.count,
        avg: data.avg,
        min: data.min,
        max: data.max,
        unit: data.unit
      }))
  };

  // Drop the huge raw arrays — dashboard uses metricsByType etc.
  delete stats.mainRecords;
  delete stats.clinicalRecords;

  // Downsample route points to keep response payload manageable
  // Target: max 500 points per route (enough for smooth maps + charts)
  const MAX_DISPLAY_POINTS = 500;
  for (const route of stats.workoutRoutes) {
    if (route.points && route.points.length > MAX_DISPLAY_POINTS) {
      const original = route.points;
      const step = original.length / MAX_DISPLAY_POINTS;
      const sampled = [];
      for (let i = 0; i < MAX_DISPLAY_POINTS; i++) {
        sampled.push(original[Math.floor(i * step)]);
      }
      // Always include first and last point
      sampled[0] = original[0];
      sampled[sampled.length - 1] = original[original.length - 1];
      route.fullPointCount = original.length;
      route.points = sampled;
    }
  }
}

async function parseZipFromDirectory(directory, stats) {
  console.log(`[ZIP] Opened ZIP, found ${directory.files.length} files`);
  const tasks = [];
  const allPaths = [];
  
  for (const file of directory.files) {
    if (file.type !== 'File') continue;
    const path = file.path || '';
    allPaths.push(path);
    
    if (isZip(path)) {
      // Buffer nested ZIP and recursively parse
      console.log(`[ZIP] Nested ZIP detected: ${path}`);
      tasks.push(
        file.buffer()
          .then(buf => unzipper.Open.buffer(buf))
          .then(dir => parseZipFromDirectory(dir, stats))
      );
    } else if (isExportXml(path)) {
      console.log(`[ZIP] Found export XML: ${path}`);
      tasks.push(parseHealthXml(file.stream(), stats, 'main'));
    } else if (isCdaXml(path)) {
      console.log(`[ZIP] Found clinical XML: ${path}`);
      tasks.push(parseHealthXml(file.stream(), stats, 'clinical'));
    } else if (isEcgXml(path)) {
      console.log(`[ZIP] Found ECG XML: ${path}`);
      tasks.push(parseEcgXml(file.stream(), stats, path));
    } else if (isEcgCsv(path)) {
      console.log(`[ZIP] Found ECG CSV: ${path}`);
      tasks.push(parseEcgCsv(file.stream(), stats, path));
    } else if (isEcgGpx(path)) {
      console.log(`[ZIP] Found ECG GPX: ${path}`);
      tasks.push(parseEcgXml(file.stream(), stats, path));
    } else if (isRouteFile(path)) {
      tasks.push(
        file.buffer().then(buf => parseRouteFromBuffer(buf, stats, path))
      );
    }
  }
  
  // Debug: log ECG-related files and unmatched files
  const ecgRelated = allPaths.filter(p => {
    const l = p.toLowerCase();
    return l.includes('electro') || l.includes('ecg');
  });
  console.log(`[ZIP] Total files: ${allPaths.length}, ECG-related files: ${ecgRelated.length}`);
  for (const p of ecgRelated) {
    console.log(`  [ECG FILE] ${p}`);
  }
  // Show a sample of all file extensions
  const extensions = {};
  for (const p of allPaths) {
    const ext = p.split('.').pop()?.toLowerCase() || 'none';
    extensions[ext] = (extensions[ext] || 0) + 1;
  }
  console.log(`[ZIP] File extensions:`, JSON.stringify(extensions));

  await Promise.all(tasks);
}

function parseZipStream(stream, stats) {
  return new Promise((resolve, reject) => {
    console.log('[ZIP] Starting parseZipStream...');
    const tasks = [];
    const zip = stream.pipe(unzipper.Parse({ forceStream: true }));

    zip.on('entry', (entry) => {
      const path = entry.path || '';
      console.log(`[ZIP] Entry found: path="${path}", type="${entry.type}"`);
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

      if (isEcgCsv(path)) {
        console.log(`[ZIP] Found ECG CSV: ${path}`);
        tasks.push(parseEcgCsv(entry, stats, path));
        return;
      }

      if (isEcgGpx(path)) {
        console.log(`[ZIP] Found ECG GPX: ${path}`);
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
      console.log(`[ZIP] ZIP close event - All entries processed, waiting for ${tasks.length} parsing tasks...`);
      Promise.all(tasks).then(resolve).catch(reject);
    });
    zip.on('error', (err) => {
      console.error('[ZIP] ZIP error:', err.message);
      reject(err);
    });
    zip.on('finish', () => {
      console.log('[ZIP] ZIP finish event');
    });
  });
}

function parseHealthXml(stream, stats, target) {
  return new Promise((resolve, reject) => {
    console.log(`[XML] Starting ${target} XML parsing...`);
    const parser = new SaxesParser({ xmlns: false });
    let recordCount = 0;
    let workoutCount = 0;
    let ecgCount = 0;
    let currentEcg = null; // tracks the <Electrocardiogram> we're inside
    let currentWorkout = null; // tracks the <Workout> we're inside for child elements

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

        // Always aggregate for dashboard metrics
        aggregateRecord(stats, record);

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
        currentWorkout = {
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
        // If the <Workout> tag is self-closing, it won't trigger closetag,
        // but SaxesParser treats self-closing as open+close, so closetag handles it.
      }

      // Handle <WorkoutStatistics> child elements inside <Workout>
      // These carry distance, energy, etc. in newer Apple Health exports (iOS 16+)
      if (node.name === 'WorkoutStatistics' && currentWorkout) {
        const statType = getAttr(node, 'type') || '';
        const sum = getAttr(node, 'sum');
        const unit = getAttr(node, 'unit');

        if (statType.includes('DistanceWalkingRunning') || statType.includes('DistanceCycling') || statType.includes('DistanceSwimming') || statType.includes('DistanceDownhillSnowSports')) {
          // Only overwrite if the attribute was empty/missing
          if (sum && (!currentWorkout.totalDistance || currentWorkout.totalDistance === '0')) {
            currentWorkout.totalDistance = sum;
            currentWorkout.totalDistanceUnit = unit || 'km';
          }
        }
        if (statType.includes('ActiveEnergyBurned') || statType.includes('BasalEnergyBurned')) {
          if (sum && statType.includes('ActiveEnergyBurned') && (!currentWorkout.totalEnergyBurned || currentWorkout.totalEnergyBurned === '0')) {
            currentWorkout.totalEnergyBurned = sum;
            currentWorkout.totalEnergyBurnedUnit = unit || 'kcal';
          }
        }
      }

      // Handle <Electrocardiogram> elements — ECG metadata
      if (node.name === 'Electrocardiogram') {
        ecgCount += 1;
        if (ecgCount % 100 === 0) {
          console.log(`[XML] ${target}: Processed ${ecgCount} ECGs...`);
        }
        currentEcg = {
          filename: 'export.xml',
          timestamp: getAttr(node, 'startDate') || getAttr(node, 'endDate'),
          heartRate: getAttr(node, 'averageHeartRate'),
          classification: getAttr(node, 'classification'),
          sampleRate: getAttr(node, 'samplingFrequency'),
          sampleCount: 0,
          samples: []
        };
      }

      // Handle <VoltageMeasurement> elements — ECG waveform samples
      if (node.name === 'VoltageMeasurement' && currentEcg) {
        currentEcg.sampleCount += 1;
        if (currentEcg.samples.length < LIMITS.MAX_ECG_SAMPLES) {
          currentEcg.samples.push({
            value: getAttr(node, 'value'),
            time: getAttr(node, 'time'),
            lead: getAttr(node, 'lead')
          });
        } else {
          stats.ecgSamplesTruncated = true;
        }
      }
    });

    parser.on('closetag', (tag) => {
      const tagName = typeof tag === 'object' ? tag.name : tag;
      // Finalize workout when </Workout> closes — this ensures WorkoutStatistics data is captured
      if (tagName === 'Workout' && currentWorkout) {
        aggregateWorkout(stats, currentWorkout);
        if (stats.workouts.length < LIMITS.MAX_WORKOUTS) {
          stats.workouts.push(currentWorkout);
        } else {
          stats.workoutsTruncated = true;
        }
        currentWorkout = null;
      }

      if (tagName === 'Electrocardiogram' && currentEcg) {
        if (stats.ecgs.length < LIMITS.MAX_ECGS) {
          stats.ecgs.push(currentEcg);
        }
        currentEcg = null;
      }
    });

    stream.on('data', (chunk) => {
      parser.write(chunk.toString('utf8'));
    });

    stream.on('end', () => {
      parser.close();
      console.log(`[XML] ${target} XML parsing complete: ${recordCount} records, ${workoutCount} workouts, ${ecgCount} ECGs`);
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
      sampleCount: 0,
      samples: []
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
        ecg.timestamp = ecg.timestamp || getAttr(node, 'timestamp') || getAttr(node, 'recordingDate') || getAttr(node, 'startDate');
        ecg.heartRate = ecg.heartRate || getAttr(node, 'heartRate') || getAttr(node, 'hr') || getAttr(node, 'averageHeartRate');
        ecg.classification = ecg.classification || getAttr(node, 'classification');
        ecg.sampleRate = ecg.sampleRate || getAttr(node, 'sampleRate') || getAttr(node, 'samplingFrequency');
      }

      if (node.name === 'Sample' || node.name === 'VoltageMeasurement') {
        ecg.sampleCount += 1;
        if (ecg.samples.length < LIMITS.MAX_ECG_SAMPLES) {
          ecg.samples.push({
            value: getAttr(node, 'value'),
            time: getAttr(node, 'time'),
            lead: getAttr(node, 'lead')
          });
        } else {
          stats.ecgSamplesTruncated = true;
        }
      }
    });

    stream.on('data', (chunk) => {
      parser.write(chunk.toString('utf8'));
    });

    stream.on('end', () => {
      parser.close();
      if (stats.ecgs.length < LIMITS.MAX_ECGS) {
        stats.ecgs.push(ecg);
      }
      resolve();
    });

    stream.on('error', reject);
  });
}

function parseEcgCsv(stream, stats, filename) {
  return new Promise((resolve, reject) => {
    const ecg = {
      filename,
      timestamp: null,
      heartRate: null,
      classification: null,
      sampleRate: null,
      sampleCount: 0,
      samples: []
    };

    // Try to extract timestamp from filename like ecg_2024-01-15.csv
    const dateMatch = filename.match(/(\d{4}[-_]\d{2}[-_]\d{2})/);
    if (dateMatch) {
      ecg.timestamp = dateMatch[1].replace(/_/g, '-');
    }

    let buffer = '';
    let headerParsed = false;
    let valueIndex = -1;
    let timeIndex = -1;

    stream.on('data', (chunk) => {
      buffer += chunk.toString('utf8');

      const lines = buffer.split('\n');
      buffer = lines.pop(); // keep last partial line

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;

        if (!headerParsed) {
          // Parse header row
          const headers = trimmed.split(',').map(h => h.trim().toLowerCase());
          valueIndex = headers.findIndex(h => h.includes('voltage') || h === 'value' || h === 'microvolts');
          timeIndex = headers.findIndex(h => h === 'time' || h === 'elapsed time' || h.includes('second'));
          if (valueIndex === -1) valueIndex = 0; // fallback to first column
          headerParsed = true;
          continue;
        }

        const cols = trimmed.split(',');
        ecg.sampleCount += 1;
        if (ecg.samples.length < LIMITS.MAX_ECG_SAMPLES) {
          ecg.samples.push({
            value: cols[valueIndex]?.trim() || null,
            time: timeIndex >= 0 ? cols[timeIndex]?.trim() || null : null,
            lead: null
          });
        } else {
          stats.ecgSamplesTruncated = true;
        }
      }
    });

    stream.on('end', () => {
      // Process remaining buffer
      if (buffer.trim() && headerParsed) {
        const cols = buffer.trim().split(',');
        ecg.sampleCount += 1;
        if (ecg.samples.length < LIMITS.MAX_ECG_SAMPLES) {
          ecg.samples.push({
            value: cols[valueIndex]?.trim() || null,
            time: timeIndex >= 0 ? cols[timeIndex]?.trim() || null : null,
            lead: null
          });
        }
      }

      console.log(`[ECG CSV] Parsed ${filename}: ${ecg.sampleCount} samples`);
      if (stats.ecgs.length < LIMITS.MAX_ECGS) {
        stats.ecgs.push(ecg);
      }
      resolve();
    });

    stream.on('error', (err) => {
      stats.warnings.push(`ECG CSV parse error (${filename}): ${err.message}`);
      resolve(); // don't reject, just warn
    });
  });
}

function parseRouteFromBuffer(buffer, stats, filename) {
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

  let currentTag = null;
  parser.on('opentag', (node) => {
    if (node.name === 'trkpt') {
      route.pointCount += 1;
      if (route.points.length < LIMITS.MAX_ROUTE_POINTS) {
        route.points.push({
          lat: toNumber(getAttr(node, 'lat')),
          lon: toNumber(getAttr(node, 'lon')),
          elevation: null,
          time: null,
          speed: null
        });
      } else {
        route.truncated = true;
        stats.routesTruncated = true;
      }
    } else if (node.name === 'ele' || node.name === 'time' || node.name === 'speed') {
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

  parser.on('closetag', (tag) => {
    const tagName = typeof tag === 'object' ? tag.name : tag;
    if (tagName === currentTag) currentTag = null;
  });

  parser.write(buffer.toString('utf8'));
  parser.close();
  stats.workoutRoutes.push(route);
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

    let currentTag = null;
    parser.on('opentag', (node) => {
      if (node.name === 'trkpt') {
        route.pointCount += 1;
        if (route.points.length < LIMITS.MAX_ROUTE_POINTS) {
          route.points.push({
            lat: toNumber(getAttr(node, 'lat')),
            lon: toNumber(getAttr(node, 'lon')),
            elevation: null,
            time: null,
            speed: null
          });
        } else {
          route.truncated = true;
          stats.routesTruncated = true;
        }
      } else if (node.name === 'ele' || node.name === 'time' || node.name === 'speed') {
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

    parser.on('closetag', (tag) => {
      const tagName = typeof tag === 'object' ? tag.name : tag;
      if (tagName === currentTag) currentTag = null;
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
  return lower.includes('electro') && lower.endsWith('.xml') && !lower.endsWith('export.xml') && !lower.includes('cda');
}

function isEcgCsv(path) {
  const lower = path.toLowerCase();
  return (lower.includes('electrocardiogram') || lower.includes('ecg')) && lower.endsWith('.csv');
}

function isEcgGpx(path) {
  const lower = path.toLowerCase();
  return lower.includes('electro') && lower.endsWith('.gpx');
}

function isRouteFile(path) {
  const lower = path.toLowerCase();
  return (lower.includes('workout') || lower.includes('route')) && (lower.endsWith('.gpx') || lower.endsWith('.xml'));
}
