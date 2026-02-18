// ZIP file handling and parsing utilities
import JSZip from 'jszip';

export async function parseAppleHealthZip(file) {
  try {
    const zip = new JSZip();
    let loadedZip = await zip.loadAsync(file);
    
    // Check if this is a double-zipped file (contains another .zip inside)
    const innerZipFile = Object.keys(loadedZip.files).find(name => name.endsWith('.zip'));
    if (innerZipFile) {
      const innerZipData = await loadedZip.file(innerZipFile).async('blob');
      loadedZip = await new JSZip().loadAsync(innerZipData);
    }
    
    // Find the export folder (could be named differently)
    let exportFolder = 'apple_health_export/';
    const files = Object.keys(loadedZip.files);
    
    // Check for various possible folder names
    const possibleFolders = files.filter(f => f.includes('export') || f.includes('health'));
    if (possibleFolders.length > 0) {
      const folderName = possibleFolders[0].split('/')[0];
      exportFolder = folderName + '/';
    }
    
    const health = {
      mainData: null,
      clinicalData: null,
      ecgs: [],
      workoutRoutes: [],
      metadata: {},
      exportFolder: exportFolder
    };

    // Find and parse export.xml (main health data)
    const exportXmlFile = files.find(f => f.endsWith('export.xml') && !f.includes('cda'));
    if (exportXmlFile) {
      // For large files, only read a portion to extract sample data
      const fileSize = loadedZip.file(exportXmlFile)._data.uncompressedSize;
      if (fileSize > 10 * 1024 * 1024) { // If larger than 10MB
        // Read file as array buffer and convert to string in chunks
        const arrayBuffer = await loadedZip.file(exportXmlFile).async('arraybuffer');
        const decoder = new TextDecoder();
        // Only decode first 5MB for sampling
        const sample = decoder.decode(arrayBuffer.slice(0, 5 * 1024 * 1024));
        health.mainData = sample;
        health.metadata.truncated = true;
        health.metadata.originalSize = fileSize;
      } else {
        const xmlText = await loadedZip.file(exportXmlFile).async('text');
        health.mainData = xmlText;
      }
    }

    // Find and parse export_cda.xml (clinical format)
    const cdaXmlFile = files.find(f => f.includes('cda') && f.endsWith('.xml'));
    if (cdaXmlFile) {
      const xmlText = await loadedZip.file(cdaXmlFile).async('text');
      health.clinicalData = xmlText;
    }

    // Extract ECG files
    const ecgPromises = [];
    const ecgFiles = files.filter(f => f.includes('electro') && f.endsWith('.xml'));
    for (const ecgFile of ecgFiles) {
      ecgPromises.push(
        loadedZip.file(ecgFile).async('text').then(xmlText => {
          const doc = parseXML(xmlText);
          if (doc) {
            health.ecgs.push({
              filename: ecgFile.split('/').pop(),
              data: doc
            });
          }
        }).catch(err => console.warn('Failed to parse ECG:', err))
      );
    }

    // Extract workout route files
    const routePromises = [];
    const routeFiles = files.filter(f => (f.includes('workout') || f.includes('route')) && (f.endsWith('.gpx') || f.endsWith('.xml')));
    for (const routeFile of routeFiles) {
      routePromises.push(
        loadedZip.file(routeFile).async('text').then(data => {
          health.workoutRoutes.push({
            filename: routeFile.split('/').pop(),
            data: data
          });
        }).catch(err => console.warn('Failed to parse route:', err))
      );
    }

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
