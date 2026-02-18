// Web Worker for parsing extremely large XML files (2GB+) in chunks
class HealthDataParser {
  constructor() {
    this.healthRecords = [];
    this.workouts = [];
    this.buffer = '';
    this.lastRecordIndex = -1;
  }

  // Process a chunk of data
  processChunk(chunk) {
    this.buffer += chunk;

    // Find complete records in the buffer
    const recordRegex = /<Record\s+([^>]*?)\/>/g;
    let match;

    while ((match = recordRegex.exec(this.buffer)) !== null) {
      const attrs = match[1];
      const typeMatch = /type="([^"]*)"/i.exec(attrs);
      const valueMatch = /value="([^"]*)"/i.exec(attrs);
      const unitMatch = /unit="([^"]*)"/i.exec(attrs);
      const startDateMatch = /startDate="([^"]*)"/i.exec(attrs);
      const endDateMatch = /endDate="([^"]*)"/i.exec(attrs);
      const sourceMatch = /sourceName="([^"]*)"/i.exec(attrs);

      const type = typeMatch ? typeMatch[1] : null;
      const value = valueMatch ? valueMatch[1] : null;
      const unit = unitMatch ? unitMatch[1] : null;
      const startDate = startDateMatch ? new Date(startDateMatch[1]).getTime() : null;
      const endDate = endDateMatch ? new Date(endDateMatch[1]).getTime() : null;
      const source = sourceMatch ? sourceMatch[1] : 'Unknown';

      if (type && value && endDate) {
        this.healthRecords.push({
          type,
          value: parseFloat(value) || value,
          unit,
          startDate,
          endDate,
          source,
          timestamp: endDate,
        });

        // Send progress every 50000 records
        if (this.healthRecords.length % 50000 === 0) {
          self.postMessage({
            type: 'progress',
            count: this.healthRecords.length,
            message: `Parsed ${this.healthRecords.length} records...`,
          });
        }
      }
    }

    // Parse workouts similarly
    const workoutRegex = /<Workout\s+([^>]*?)\/>/g;
    while ((match = workoutRegex.exec(this.buffer)) !== null) {
      const attrs = match[1];
      const typeMatch = /workoutActivityType="([^"]*)"/i.exec(attrs);
      const startDateMatch = /startDate="([^"]*)"/i.exec(attrs);
      const endDateMatch = /endDate="([^"]*)"/i.exec(attrs);
      const energyMatch = /totalEnergyBurned="([^"]*)"/i.exec(attrs);
      const distanceMatch = /totalDistance="([^"]*)"/i.exec(attrs);

      const workoutType = typeMatch ? typeMatch[1] : 'Unknown';
      const startDate = startDateMatch ? startDateMatch[1] : null;
      const endDate = endDateMatch ? endDateMatch[1] : null;
      const totalEnergyBurned = energyMatch ? parseFloat(energyMatch[1]) : 0;
      const totalDistance = distanceMatch ? parseFloat(distanceMatch[1]) : 0;

      if (startDate && endDate) {
        const startTime = new Date(startDate).getTime();
        const endTime = new Date(endDate).getTime();
        const duration = (endTime - startTime) / (1000 * 60);

        this.workouts.push({
          type: workoutType,
          startDate: startTime,
          endDate: endTime,
          duration,
          totalEnergyBurned,
          totalDistance,
        });
      }
    }

    // Keep only incomplete data in buffer to save memory
    // Remove data that we've already processed
    const lastCompleteRecord = this.buffer.lastIndexOf('/>');
    if (lastCompleteRecord > -1) {
      this.buffer = this.buffer.substring(lastCompleteRecord + 2);
    }
  }

  finalize() {
    // Process any remaining data
    if (this.buffer.trim()) {
      const recordRegex = /<Record\s+([^>]*?)\/>/g;
      let match;
      while ((match = recordRegex.exec(this.buffer)) !== null) {
        const attrs = match[1];
        const typeMatch = /type="([^"]*)"/i.exec(attrs);
        const valueMatch = /value="([^"]*)"/i.exec(attrs);
        const unitMatch = /unit="([^"]*)"/i.exec(attrs);
        const startDateMatch = /startDate="([^"]*)"/i.exec(attrs);
        const endDateMatch = /endDate="([^"]*)"/i.exec(attrs);
        const sourceMatch = /sourceName="([^"]*)"/i.exec(attrs);

        const type = typeMatch ? typeMatch[1] : null;
        const value = valueMatch ? valueMatch[1] : null;
        const unit = unitMatch ? unitMatch[1] : null;
        const startDate = startDateMatch ? new Date(startDateMatch[1]).getTime() : null;
        const endDate = endDateMatch ? new Date(endDateMatch[1]).getTime() : null;
        const source = sourceMatch ? sourceMatch[1] : 'Unknown';

        if (type && value && endDate) {
          this.healthRecords.push({
            type,
            value: parseFloat(value) || value,
            unit,
            startDate,
            endDate,
            source,
            timestamp: endDate,
          });
        }
      }
    }

    this.buffer = '';
    return this.generateSummary();
  }
  constructor(xmlString) {
    this.xmlString = xmlString;
  }

  parseHealthRecordsRegex() {
    const recordsArray = [];
    const recordRegex = /<Record\s+([^>]*?)\/>/g;
    let match;
    let count = 0;

    while ((match = recordRegex.exec(this.xmlString)) !== null) {
      const attrs = match[1];
      
      const typeMatch = /type="([^"]*)"/i.exec(attrs);
      const valueMatch = /value="([^"]*)"/i.exec(attrs);
      const unitMatch = /unit="([^"]*)"/i.exec(attrs);
      const startDateMatch = /startDate="([^"]*)"/i.exec(attrs);
      const endDateMatch = /endDate="([^"]*)"/i.exec(attrs);
      const sourceMatch = /sourceName="([^"]*)"/i.exec(attrs);

      const type = typeMatch ? typeMatch[1] : null;
      const value = valueMatch ? valueMatch[1] : null;
      const unit = unitMatch ? unitMatch[1] : null;
      const startDate = startDateMatch ? new Date(startDateMatch[1]).getTime() : null;
      const endDate = endDateMatch ? new Date(endDateMatch[1]).getTime() : null;
      const source = sourceMatch ? sourceMatch[1] : 'Unknown';

      if (type && value && endDate) {
        recordsArray.push({
          type,
          value: parseFloat(value) || value,
          unit,
          startDate,
          endDate,
          source,
          timestamp: endDate,
        });

        count++;
        // Send progress update every 10000 records
        if (count % 10000 === 0) {
          self.postMessage({
            type: 'progress',
            count,
            message: `Parsed ${count} records...`,
          });
        }
      }
    }

    return recordsArray;
  }

  parseWorkoutsRegex() {
    const workoutsArray = [];
    const workoutRegex = /<Workout\s+([^>]*?)\/>/g;
    let match;

    while ((match = workoutRegex.exec(this.xmlString)) !== null) {
      const attrs = match[1];
      
      const typeMatch = /workoutActivityType="([^"]*)"/i.exec(attrs);
      const startDateMatch = /startDate="([^"]*)"/i.exec(attrs);
      const endDateMatch = /endDate="([^"]*)"/i.exec(attrs);
      const energyMatch = /totalEnergyBurned="([^"]*)"/i.exec(attrs);
      const distanceMatch = /totalDistance="([^"]*)"/i.exec(attrs);

      const workoutType = typeMatch ? typeMatch[1] : 'Unknown';
      const startDate = startDateMatch ? startDateMatch[1] : null;
      const endDate = endDateMatch ? endDateMatch[1] : null;
      const totalEnergyBurned = energyMatch ? parseFloat(energyMatch[1]) : 0;
      const totalDistance = distanceMatch ? parseFloat(distanceMatch[1]) : 0;

      if (startDate && endDate) {
        const startTime = new Date(startDate).getTime();
        const endTime = new Date(endDate).getTime();
        const duration = (endTime - startTime) / (1000 * 60);
        
        workoutsArray.push({
          type: workoutType,
          startDate: startTime,
          endDate: endTime,
          duration,
          totalEnergyBurned,
          totalDistance,
        });
      }
    }

    return workoutsArray;
  }

  generateSummary() {
    const summary = {
      totalRecords: this.healthRecords.length,
      totalWorkouts: this.workouts.length,
      metricsAvailable: [...new Set(this.healthRecords.map((r) => r.type))],
      dateRange: {
        start: this.healthRecords.length > 0 ? Math.min(...this.healthRecords.map((r) => r.timestamp)) : null,
        end: this.healthRecords.length > 0 ? Math.max(...this.healthRecords.map((r) => r.timestamp)) : null,
      },
    };

    const heartRateRecords = this.healthRecords.filter((r) => r.type.includes('HeartRate'));
    if (heartRateRecords.length > 0) {
      const values = heartRateRecords.map((r) => r.value);
      summary.heartRate = {
        average: (values.reduce((a, b) => a + b, 0) / values.length).toFixed(1),
        min: Math.min(...values),
        max: Math.max(...values),
        count: values.length,
      };
    }

    const stepsRecords = this.healthRecords.filter((r) => r.type === 'HKQuantityTypeIdentifierStepCount');
    if (stepsRecords.length > 0) {
      const values = stepsRecords.map((r) => r.value);
      summary.steps = {
        total: Math.round(values.reduce((a, b) => a + b, 0)),
        average: Math.round(values.reduce((a, b) => a + b, 0) / values.length),
        count: values.length,
      };
    }

    const calorieRecords = this.healthRecords.filter(
      (r) =>
        r.type === 'HKQuantityTypeIdentifierActiveEnergyBurned' ||
        r.type === 'HKQuantityTypeIdentifierBasalEnergyBurned'
    );
    if (calorieRecords.length > 0) {
      const values = calorieRecords.map((r) => r.value);
      summary.calories = {
        total: Math.round(values.reduce((a, b) => a + b, 0)),
        average: Math.round(values.reduce((a, b) => a + b, 0) / values.length),
        count: values.length,
      };
    }

    return summary;
  }
}

// Global parser instance
let parserInstance = null;

// Listen for messages from main thread
self.onmessage = function (event) {
  try {
    const { type, data, fileSize } = event.data;

    if (type === 'init') {
      // Initialize parser for a new file
      parserInstance = new HealthDataParser();
      self.postMessage({
        type: 'progress',
        message: `Starting to parse ${(fileSize / 1024 / 1024 / 1024).toFixed(2)}GB file...`,
      });
    } else if (type === 'chunk') {
      // Process a chunk of data
      if (!parserInstance) {
        throw new Error('Parser not initialized');
      }
      parserInstance.processChunk(data);
      self.postMessage({ type: 'chunk_processed' });
    } else if (type === 'finalize') {
      // Finalize and send results
      if (!parserInstance) {
        throw new Error('Parser not initialized');
      }
      const summary = parserInstance.finalize();
      
      self.postMessage({
        type: 'complete',
        data: {
          healthRecords: parserInstance.healthRecords,
          workouts: parserInstance.workouts,
          summary,
        },
      });
      
      // Clean up
      parserInstance = null;
    }
  } catch (error) {
    self.postMessage({
      type: 'error',
      error: error.message || String(error),
    });
  }
};
