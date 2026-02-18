// ZIP file handling and parsing utilities
import JSZip from 'jszip';

export async function parseAppleHealthZip(file) {
  try {
    const zip = new JSZip();
    const loadedZip = await zip.loadAsync(file);
    
    const health = {
      mainData: null,
      clinicalData: null,
      ecgs: [],
      workoutRoutes: [],
      metadata: {}
    };

    // Parse export.xml (main health data) - store as string to avoid parser memory issues
    if (loadedZip.file('apple_health_export/export.xml')) {
      const xmlText = await loadedZip.file('apple_health_export/export.xml').async('text');
      health.mainData = xmlText; // Store raw XML string
    }

    // Parse export_cda.xml (clinical format)
    if (loadedZip.file('apple_health_export/export_cda.xml')) {
      const xmlText = await loadedZip.file('apple_health_export/export_cda.xml').async('text');
      health.clinicalData = xmlText; // Store raw XML string
    }

    // Extract ECG files
    const ecgPromises = [];
    loadedZip.folder('apple_health_export/electrocardiograms')?.forEach((relativePath, file) => {
      if (relativePath.endsWith('.xml')) {
        ecgPromises.push(
          file.async('text').then(xmlText => {
            const doc = parseXML(xmlText);
            if (doc) {
              health.ecgs.push({
                filename: relativePath,
                data: doc
              });
            }
          })
        );
      }
    });

    // Extract workout route files
    const routePromises = [];
    loadedZip.folder('apple_health_export/workout-routes')?.forEach((relativePath, file) => {
      if (relativePath.endsWith('.gpx') || relativePath.endsWith('.xml')) {
        routePromises.push(
          file.async('text').then(data => {
            health.workoutRoutes.push({
              filename: relativePath,
              data: data
            });
          })
        );
      }
    });

    // Wait for all async operations
    await Promise.all([...ecgPromises, ...routePromises]);

    return health;
  } catch (error) {
    console.error('Error parsing ZIP file:', error);
    throw new Error('Failed to parse Apple Health export: ' + error.message);
  }
}

function parseXML(xmlString) {
  try {
    const parser = new DOMParser();
    const doc = parser.parseFromString(xmlString, 'text/xml');
    
    if (doc.parsererror) {
      throw new Error('XML parsing error: ' + doc.parsererror);
    }
    
    return doc;
  } catch (error) {
    console.error('XML parsing error:', error);
    return null;
  }
}

export function extractHealthRecords(xmlString) {
  if (!xmlString || typeof xmlString !== 'string') return [];
  
  const records = [];
  
  // Parse records using regex to avoid DOMParser memory issues with large files
  const recordRegex = /<Record[^>]*?type="([^"]*)"[^>]*?startDate="([^"]*)"[^>]*?(?:endDate="([^"]*)")?[^>]*?(?:value="([^"]*)")?[^>]*?(?:unit="([^"]*)")?[^>]*?(?:sourceName="([^"]*)")?[^>]*?(?:sourceVersion="([^"]*)")?[^>]*/g;
  
  let match;
  while ((match = recordRegex.exec(xmlString)) !== null) {
    records.push({
      type: match[1],
      startDate: match[2],
      endDate: match[3],
      value: match[4],
      unit: match[5],
      sourceName: match[6],
      sourceVersion: match[7]
    });
    
    // Limit to prevent memory overload
    if (records.length > 50000) break;
  }
  
  return records;
}

export function extractWorkouts(xmlString) {
  if (!xmlString || typeof xmlString !== 'string') return [];
  
  const workouts = [];
  
  // Parse workouts using regex
  const workoutRegex = /<Workout[^>]*?workoutActivityType="([^"]*)"[^>]*?startDate="([^"]*)"[^>]*?(?:endDate="([^"]*)")?[^>]*?(?:duration="([^"]*)")?[^>]*?(?:durationUnit="([^"]*)")?[^>]*?(?:totalEnergyBurned="([^"]*)")?[^>]*?(?:totalEnergyBurnedUnit="([^"]*)")?[^>]*?(?:totalDistance="([^"]*)")?[^>]*?(?:totalDistanceUnit="([^"]*)")?[^>]*/g;
  
  let match;
  while ((match = workoutRegex.exec(xmlString)) !== null) {
    workouts.push({
      workoutActivityType: match[1],
      startDate: match[2],
      endDate: match[3],
      duration: match[4],
      durationUnit: match[5],
      totalEnergyBurned: match[6],
      totalEnergyBurnedUnit: match[7],
      totalDistance: match[8],
      totalDistanceUnit: match[9]
    });
  }
  
  return workouts;
}

export function extractECGData(xmlDoc) {
  if (!xmlDoc) return null;
  
  const ecgElement = xmlDoc.querySelector('ElectrocardiogramData, ECG, Electrocardiogram');
  if (!ecgElement) return null;
  
  return {
    timestamp: ecgElement.getAttribute('timestamp') || ecgElement.getAttribute('recordingDate'),
    heartRate: ecgElement.getAttribute('heartRate') || ecgElement.getAttribute('hr'),
    classification: ecgElement.getAttribute('classification'),
    sampleRate: ecgElement.getAttribute('sampleRate'),
    samples: Array.from(ecgElement.querySelectorAll('Sample')).map(s => ({
      time: s.getAttribute('time'),
      value: s.getAttribute('value') || s.textContent
    }))
  };
}

export function parseGPXRoute(gpxString) {
  try {
    const parser = new DOMParser();
    const doc = parser.parseFromString(gpxString, 'text/xml');
    
    const trackpoints = [];
    doc.querySelectorAll('trkpt').forEach(pt => {
      trackpoints.push({
        lat: parseFloat(pt.getAttribute('lat')),
        lon: parseFloat(pt.getAttribute('lon')),
        elevation: pt.querySelector('ele')?.textContent,
        time: pt.querySelector('time')?.textContent,
        speed: pt.querySelector('speed')?.textContent
      });
    });
    
    return trackpoints;
  } catch (error) {
    console.error('GPX parsing error:', error);
    return [];
  }
}
