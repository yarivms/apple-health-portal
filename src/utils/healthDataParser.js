export default class HealthDataParser {
  constructor(xmlString) {
    this.xmlString = xmlString;
  }

  parse() {
    // Use regex-based parsing for memory efficiency with large files
    const healthRecords = this.parseHealthRecordsRegex();
    const workouts = this.parseWorkoutsRegex();

    const data = {
      healthRecords,
      workouts,
      summary: {},
    };

    data.summary = this.generateSummary(healthRecords, workouts);
    return data;
  }

  parseHealthRecordsRegex() {
    const recordsArray = [];
    // Match <Record type="..." value="..." unit="..." startDate="..." endDate="..." sourceName="..." />
    const recordRegex = /<Record\s+([^>]*?)\/>/g;
    let match;

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
      const startDate = startDateMatch ? new Date(startDateMatch[1]) : null;
      const endDate = endDateMatch ? new Date(endDateMatch[1]) : null;
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
      }
    }

    return recordsArray;
  }

  parseWorkoutsRegex() {
    const workoutsArray = [];
    // Match <Workout workoutActivityType="..." startDate="..." endDate="..." totalEnergyBurned="..." totalDistance="..." />
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
      const startDate = startDateMatch ? new Date(startDateMatch[1]) : null;
      const endDate = endDateMatch ? new Date(endDateMatch[1]) : null;
      const totalEnergyBurned = energyMatch ? parseFloat(energyMatch[1]) : 0;
      const totalDistance = distanceMatch ? parseFloat(distanceMatch[1]) : 0;

      if (startDate && endDate) {
        const duration = (endDate - startDate) / (1000 * 60); // in minutes
        workoutsArray.push({
          type: workoutType,
          startDate,
          endDate,
          duration,
          totalEnergyBurned,
          totalDistance,
        });
      }
    }

    return workoutsArray;
  }

  generateSummary(records, workouts) {
    const summary = {
      totalRecords: records.length,
      totalWorkouts: workouts.length,
      metricsAvailable: [...new Set(records.map((r) => r.type))],
      dateRange: {
        start: records.length > 0 ? Math.min(...records.map((r) => r.timestamp)) : null,
        end: records.length > 0 ? Math.max(...records.map((r) => r.timestamp)) : null,
      },
    };

    // Calculate metric-specific summaries
    const heartRateRecords = records.filter((r) =>
      r.type.includes('HeartRate')
    );
    if (heartRateRecords.length > 0) {
      const values = heartRateRecords.map((r) => r.value);
      summary.heartRate = {
        average: (
          values.reduce((a, b) => a + b, 0) / values.length
        ).toFixed(1),
        min: Math.min(...values),
        max: Math.max(...values),
        count: values.length,
      };
    }

    const stepsRecords = records.filter((r) => r.type === 'HKQuantityTypeIdentifierStepCount');
    if (stepsRecords.length > 0) {
      const values = stepsRecords.map((r) => r.value);
      summary.steps = {
        total: Math.round(values.reduce((a, b) => a + b, 0)),
        average: Math.round(values.reduce((a, b) => a + b, 0) / values.length),
        count: values.length,
      };
    }

    const calorieRecords = records.filter(
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

  getRecordsByType(records, type) {
    return records.filter((r) => r.type === type);
  }

  getRecordsByDateRange(records, startDate, endDate) {
    return records.filter(
      (r) => r.timestamp >= startDate && r.timestamp <= endDate
    );
  }
}
