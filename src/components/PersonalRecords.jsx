import React from 'react';
import { Moon, Eye, Award, Target } from 'lucide-react';
import './PersonalRecords.css';

function PersonalRecords({ data }) {
  const { metricsByType, workoutsByDate, allDates, workouts } = data;

  const getPersonalRecords = () => {
    const records = {
      longestRun: 0,
      fastestSpeed: 0,
      maxHeartRate: 0,
      restingHeartRate: Infinity,
      maxCalories: 0,
      maxElevation: 0,
      streak: 0,
    };

    // Longest run — use workout data for accurate single-session distance
    if (data.workouts && data.workouts.length > 0) {
      const runs = data.workouts.filter(w => w.workoutActivityType === 'HKWorkoutActivityTypeRunning');
      let maxDist = 0;
      for (const r of runs) {
        let d = parseFloat(r.totalDistance) || 0;
        if (r.totalDistanceUnit === 'm') d /= 1000;
        if (d > maxDist) maxDist = d;
      }
      if (maxDist > 0) records.longestRun = maxDist.toFixed(2);
    }
    // Fallback to metric data
    if (records.longestRun === 0 && metricsByType?.HKQuantityTypeIdentifierDistanceWalkingRunning?.max) {
      records.longestRun = metricsByType.HKQuantityTypeIdentifierDistanceWalkingRunning.max.toFixed(2);
    }

    // Fastest speed (running speed or walking speed)
    if (metricsByType?.HKQuantityTypeIdentifierRunningSpeed?.max) {
      records.fastestSpeed = metricsByType.HKQuantityTypeIdentifierRunningSpeed.max.toFixed(1);
    } else if (metricsByType?.HKQuantityTypeIdentifierWalkingSpeed?.max) {
      records.fastestSpeed = metricsByType.HKQuantityTypeIdentifierWalkingSpeed.max.toFixed(1);
    }

    // Max heart rate
    if (metricsByType?.HKQuantityTypeIdentifierHeartRate?.max) {
      records.maxHeartRate = Math.round(metricsByType.HKQuantityTypeIdentifierHeartRate.max);
    }

    // Resting heart rate (min)
    if (metricsByType?.HKQuantityTypeIdentifierHeartRate?.min) {
      records.restingHeartRate = Math.round(metricsByType.HKQuantityTypeIdentifierHeartRate.min);
    }

    // Max calories — try ActiveEnergyBurned first, then BasalEnergyBurned
    if (metricsByType?.HKQuantityTypeIdentifierActiveEnergyBurned?.max) {
      records.maxCalories = Math.round(metricsByType.HKQuantityTypeIdentifierActiveEnergyBurned.max);
    } else if (metricsByType?.HKQuantityTypeIdentifierBasalEnergyBurned?.max) {
      records.maxCalories = Math.round(metricsByType.HKQuantityTypeIdentifierBasalEnergyBurned.max);
    }

    // Streak
    if (allDates && allDates.length > 0) {
      let tempStreak = 0;
      let maxStreak = 0;
      const sortedDates = [...allDates].sort().reverse();

      for (const date of sortedDates) {
        if (workoutsByDate?.[date]) {
          tempStreak++;
          maxStreak = Math.max(maxStreak, tempStreak);
        } else {
          tempStreak = 0;
        }
      }
      records.streak = maxStreak;
    }

    return records;
  };

  const records = getPersonalRecords();

  const prCards = [
    {
      icon: Target,
      label: 'Longest Run',
      value: records.longestRun > 0 ? `${records.longestRun} KM` : 'N/A',
      unit: 'distance',
      color: '#3b82f6',
    },
    {
      icon: Award,
      label: 'Fastest Speed',
      value: records.fastestSpeed > 0 ? `${records.fastestSpeed} km/h` : 'N/A',
      unit: 'speed',
      color: '#f59e0b',
    },
    {
      icon: Eye,
      label: 'Max Heart Rate',
      value: records.maxHeartRate > 0 ? `${records.maxHeartRate} BPM` : 'N/A',
      unit: 'heartrate',
      color: '#ef4444',
    },
    {
      icon: Moon,
      label: 'Resting Heart Rate',
      value: records.restingHeartRate < Infinity ? `${records.restingHeartRate} BPM` : 'N/A',
      unit: 'restinghr',
      color: '#10b981',
    },
    {
      icon: Award,
      label: 'Max Calories',
      value: records.maxCalories > 0 ? `${records.maxCalories} kcal` : 'N/A',
      unit: 'calories',
      color: '#8b5cf6',
    },
    {
      icon: Target,
      label: 'Longest Streak',
      value: records.streak > 0 ? `${records.streak} days` : 'N/A',
      unit: 'streak',
      color: '#06b6d4',
    },
  ];

  return (
    <div className="personal-records">
      <div className="pr-header">
        <Award size={24} />
        <h3>Personal Records</h3>
      </div>

      <div className="pr-grid">
        {prCards.map((card, idx) => {
          const IconComponent = card.icon;
          return (
            <div key={idx} className="pr-card">
              <div className="pr-icon" style={{ backgroundColor: `${card.color}20` }}>
                <IconComponent size={32} style={{ color: card.color }} />
              </div>
              <div className="pr-content">
                <div className="pr-label">{card.label}</div>
                <div className="pr-value">{card.value}</div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default PersonalRecords;
