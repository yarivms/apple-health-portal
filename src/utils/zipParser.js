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

    // Parse export.xml (main health data)
    if (loadedZip.file('apple_health_export/export.xml')) {
      const xmlText = await loadedZip.file('apple_health_export/export.xml').async('text');
      health.mainData = parseXML(xmlText);
    }

    // Parse export_cda.xml (clinical format)
    if (loadedZip.file('apple_health_export/export_cda.xml')) {
      const xmlText = await loadedZip.file('apple_health_export/export_cda.xml').async('text');
      health.clinicalData = parseXML(xmlText);
    }

    // Extract ECG files
    loadedZip.folder('apple_health_export/electrocardiograms')?.forEach((relativePath, file) => {
      if (relativePath.endsWith('.xml')) {
        file.async('text').then(xmlText => {
          health.ecgs.push({
            filename: relativePath,
            data: parseXML(xmlText)
          });
        });
      }
    });

    // Extract workout route files
    loadedZip.folder('apple_health_export/workout-routes')?.forEach((relativePath, file) => {
      if (relativePath.endsWith('.gpx') || relativePath.endsWith('.xml')) {
        file.async('text').then(data => {
          health.workoutRoutes.push({
            filename: relativePath,
            data: data
          });
        });
      }
    });

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

export function extractHealthRecords(xmlDoc) {
  if (!xmlDoc) return [];
  
  const records = [];
  const elements = xmlDoc.querySelectorAll('Record, HKQuantityTypeRecord, HKCategoryTypeRecord, HKWorkoutTypeRecord');
  
  elements.forEach(el => {
    const record = {
      type: el.getAttribute('type') || el.tagName,
      startDate: el.getAttribute('startDate') || el.getAttribute('creationDate'),
      endDate: el.getAttribute('endDate'),
      value: el.getAttribute('value'),
      unit: el.getAttribute('unit'),
      sourceName: el.getAttribute('sourceName'),
      sourceVersion: el.getAttribute('sourceVersion')
    };
    
    if (record.startDate) {
      records.push(record);
    }
  });
  
  return records;
}

export function extractWorkouts(xmlDoc) {
  if (!xmlDoc) return [];
  
  const workouts = [];
  const elements = xmlDoc.querySelectorAll('Workout, HKWorkoutTypeRecord');
  
  elements.forEach(el => {
    const workout = {
      workoutActivityType: el.getAttribute('workoutActivityType'),
      startDate: el.getAttribute('startDate'),
      endDate: el.getAttribute('endDate'),
      duration: el.getAttribute('duration'),
      durationUnit: el.getAttribute('durationUnit'),
      totalEnergyBurned: el.getAttribute('totalEnergyBurned'),
      totalEnergyBurnedUnit: el.getAttribute('totalEnergyBurnedUnit'),
      totalDistance: el.getAttribute('totalDistance'),
      totalDistanceUnit: el.getAttribute('totalDistanceUnit')
    };
    workouts.push(workout);
  });
  
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
