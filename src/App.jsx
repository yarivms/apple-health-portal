import React, { useState, useRef } from 'react';
import { Upload, Heart, Zap, Activity, TrendingUp, Calendar, Sparkles, Navigation } from 'lucide-react';
import Dashboard from './components/Dashboard';
import MetricsCards from './components/MetricsCards';
import ChartsSection from './components/ChartsSection';
import RunsView from './components/RunsView';
import ActivityHeatmap from './components/ActivityHeatmap';
import AchievementBadges from './components/AchievementBadges';
import InsightsAI from './components/InsightsAI';
import PersonalRecords from './components/PersonalRecords';
import SleepTracking from './components/SleepTracking';
import StressAnalysis from './components/StressAnalysis';
import FileUploader from './components/FileUploader';
import ECGViewer from './components/ECGViewer';
import WorkoutRoutes from './components/WorkoutRoutes';
import './App.css';

// Advanced parser with proper aggregation and statistics
async function parseHealthDataChunked(file, onProgress) {
  let buffer = '';
  const CHUNK_SIZE = 3 * 1024 * 1024; // 3MB chunks
  let offset = 0;

  // Aggregated data structure
  const stats = {
    totalRecords: 0,
    totalWorkouts: 0,
    metricsByType: {}, // type -> { values: [{date, value}], count, min, max, avg, sum }
    workoutsByDate: {}, // YYYY-MM-DD -> count
    allDates: new Set(),
    dateRange: { min: null, max: null },
  };

  const extractAttribute = (attrs, attrName) => {
    const pattern = `${attrName}="`;
    const startIdx = attrs.indexOf(pattern);
    if (startIdx === -1) return null;
    
    const valueStart = startIdx + pattern.length;
    let valueEnd = attrs.indexOf('"', valueStart);
    
    // Handle edge case of escaped quotes
    while (valueEnd !== -1 && attrs[valueEnd - 1] === '\\') {
      valueEnd = attrs.indexOf('"', valueEnd + 1);
    }
    
    if (valueEnd === -1) return null;
    return attrs.substring(valueStart, valueEnd);
  };

  const parseDate = (dateStr) => {
    if (!dateStr) return null;
    // Parse timestamps like "2023-09-08 07:12:58 +0200"
    const match = dateStr.match(/(\d{4})-(\d{2})-(\d{2})/);
    if (!match) return null;
    return new Date(`${match[1]}-${match[2]}-${match[3]}`).getTime();
  };

  const getDateKey = (timestamp) => {
    if (!timestamp) return null;
    const date = new Date(timestamp);
    return date.toISOString().split('T')[0]; // YYYY-MM-DD
  };

  const parseRecords = (text) => {
    let idx = 0;
    while (true) {
      idx = text.indexOf('<Record ', idx);
      if (idx === -1) break;
      
      const endIdx = text.indexOf('/>', idx);
      if (endIdx === -1) break;
      
      const attrs = text.substring(idx + 8, endIdx);
      
      const type = extractAttribute(attrs, 'type');
      const value = extractAttribute(attrs, 'value');
      const endDate = extractAttribute(attrs, 'endDate');
      const unit = extractAttribute(attrs, 'unit');
      const source = extractAttribute(attrs, 'sourceName') || 'Unknown';

      if (type && value !== null && endDate) {
        const timestamp = parseDate(endDate);
        const dateKey = getDateKey(timestamp);
        const numValue = parseFloat(value);

        if (timestamp && dateKey) {
          stats.totalRecords++;
          stats.allDates.add(dateKey);

          if (stats.dateRange.min === null || timestamp < stats.dateRange.min) {
            stats.dateRange.min = timestamp;
          }
          if (stats.dateRange.max === null || timestamp > stats.dateRange.max) {
            stats.dateRange.max = timestamp;
          }

          // Track metric
          if (!stats.metricsByType[type]) {
            stats.metricsByType[type] = {
              values: [],
              dates: [],
              count: 0,
              sum: 0,
              min: Infinity,
              max: -Infinity,
              unit,
              source,
            };
          }

          const metric = stats.metricsByType[type];
          metric.count++;

          if (!isNaN(numValue)) {
            metric.sum += numValue;
            metric.min = Math.min(metric.min, numValue);
            metric.max = Math.max(metric.max, numValue);

            // Store every 10th value to sample data
            if (metric.count % 10 === 0 || metric.count <= 100) {
              metric.values.push({ date: dateKey, value: numValue, timestamp });
              metric.dates.push(dateKey);
            }
          }
        }
      }
      
      idx = endIdx + 2;
    }
  };

  const parseWorkouts = (text) => {
    let idx = 0;
    while (true) {
      idx = text.indexOf('<Workout ', idx);
      if (idx === -1) break;
      
      const endIdx = text.indexOf('</Workout>', idx);
      if (endIdx === -1) break;
      
      const workoutBlock = text.substring(idx, endIdx + 10);
      
      // Extract opening tag attributes
      const tagEndIdx = workoutBlock.indexOf('>');
      if (tagEndIdx === -1) {
        idx = endIdx + 2;
        continue;
      }
      
      const attrs = workoutBlock.substring(9, tagEndIdx);
      const type = extractAttribute(attrs, 'workoutActivityType');
      const startDate = extractAttribute(attrs, 'startDate');

      if (type && startDate) {
        const timestamp = parseDate(startDate);
        const dateKey = getDateKey(timestamp);

        if (timestamp && dateKey) {
          stats.totalWorkouts++;
          stats.allDates.add(dateKey);
          stats.workoutsByDate[dateKey] = (stats.workoutsByDate[dateKey] || 0) + 1;

          // Also extract WorkoutStatistics data for distance, duration, energy
          const statsMatch = workoutBlock.match(/<WorkoutStatistics[^>]*?type="([^"]*)"[^>]*?value="([^"]*)"[^>]*?unit="([^"]*)"/g);
          if (statsMatch) {
            statsMatch.forEach(stat => {
              const typeMatch = stat.match(/type="([^"]*)"/);
              const valueMatch = stat.match(/value="([^"]*)"/);
              const unitMatch = stat.match(/unit="([^"]*)"/);
              
              if (typeMatch && valueMatch) {
                const metricType = typeMatch[1];
                const value = valueMatch[1];
                const unit = unitMatch ? unitMatch[1] : '';

                // Track distance, energy, and duration from workouts
                let normalizedType = metricType;
                if (metricType.includes('Distance')) {
                  normalizedType = 'HKQuantityTypeIdentifierDistanceWalkingRunning';
                } else if (metricType.includes('Energy')) {
                  normalizedType = 'HKQuantityTypeIdentifierEnergyBurned';
                } else if (metricType.includes('HeartRate')) {
                  normalizedType = 'HKQuantityTypeIdentifierHeartRate';
                }

                if (!stats.metricsByType[normalizedType]) {
                  stats.metricsByType[normalizedType] = {
                    values: [],
                    dates: [],
                    count: 0,
                    sum: 0,
                    min: Infinity,
                    max: -Infinity,
                    unit,
                    source: 'Workout Stats',
                  };
                }

                const metric = stats.metricsByType[normalizedType];
                const numValue = parseFloat(value);
                if (!isNaN(numValue)) {
                  metric.count++;
                  metric.sum += numValue;
                  metric.min = Math.min(metric.min, numValue);
                  metric.max = Math.max(metric.max, numValue);

                  if (metric.count % 5 === 0 || metric.count <= 50) {
                    metric.values.push({ date: dateKey, value: numValue, timestamp });
                    metric.dates.push(dateKey);
                  }
                }
              }
            });
          }
        }
      }
      
      idx = endIdx + 10;
    }
  };

  // Process file in chunks
  while (offset < file.size) {
    try {
      const chunk = file.slice(offset, offset + CHUNK_SIZE);
      const text = await chunk.text();
      offset += CHUNK_SIZE;
      
      const percentComplete = Math.round((offset / file.size) * 100);
      const MB = (offset / 1024 / 1024).toFixed(1);
      
      onProgress(`Analyzing... ${percentComplete}% (${MB}MB) - ${stats.totalRecords} records, ${Object.keys(stats.metricsByType).length} metric types`);
      
      buffer += text;

      const lastRecordEnd = buffer.lastIndexOf('/>');
      if (lastRecordEnd > 100) {
        const toProcess = buffer.substring(0, lastRecordEnd);
        parseRecords(toProcess);
        parseWorkouts(toProcess);
        buffer = buffer.substring(lastRecordEnd + 2);
      }

      await new Promise(resolve => setTimeout(resolve, 0));
    } catch (err) {
      console.error('Chunk parsing error:', err);
      onProgress(`Parsing... ${Math.round((offset / file.size) * 100)}% - recovering from error...`);
    }
  }

  // Parse remaining buffer
  if (buffer.length > 10) {
    parseRecords(buffer);
    parseWorkouts(buffer);
  }

  onProgress('Generating summary...');

  // Create summary
  const summary = {
    totalRecords: stats.totalRecords,
    totalWorkouts: stats.totalWorkouts,
    metricsAvailable: Object.keys(stats.metricsByType),
    uniqueDates: stats.allDates.size,
    dateRange: {
      start: stats.dateRange.min,
      end: stats.dateRange.max,
    },
    topMetrics: Object.entries(stats.metricsByType)
      .sort((a, b) => b[1].count - a[1].count)
      .slice(0, 10)
      .map(([type, data]) => ({
        type,
        count: data.count,
        avg: (data.sum / data.count).toFixed(2),
        min: data.min === Infinity ? 0 : data.min,
        max: data.max === -Infinity ? 0 : data.max,
        unit: data.unit,
      })),
  };

  // Return aggregated data
  const healthRecords = Object.entries(stats.metricsByType).flatMap(([type, data]) =>
    data.values.map(v => ({
      type,
      value: v.value,
      timestamp: v.timestamp,
      dateKey: v.date,
    }))
  );

  return {
    healthRecords,
    workouts: [],
    summary,
    metricsByType: stats.metricsByType,
    workoutsByDate: stats.workoutsByDate,
    allDates: Array.from(stats.allDates).sort(),
  };
}

function App() {
  const [healthData, setHealthData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [progress, setProgress] = useState('');
  const [activeTab, setActiveTab] = useState('metrics');
  const [importedHealthData, setImportedHealthData] = useState(null);
  const fileInputRef = useRef(null);

  const handleFileUpload = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setLoading(true);
    setError(null);
    setProgress('Starting file processing...');

    try {
      const fileSizeGB = (file.size / 1024 / 1024 / 1024).toFixed(2);
      console.log(`Processing ${fileSizeGB}GB file...`);

      const data = await parseHealthDataChunked(file, (msg) => {
        console.log(msg);
        setProgress(msg);
      });

      if (data && data.healthRecords.length > 0) {
        console.log(
          `Successfully loaded ${data.healthRecords.length} health records and ${data.workouts.length} workouts`
        );
        setHealthData(data);
        setProgress('');
      } else {
        throw new Error('No health data found in file');
      }
    } catch (err) {
      const errorMsg = err.message || 'Unknown error occurred';
      setError(`Failed to parse file: ${errorMsg}`);
      console.error('Parse error:', err);
      setProgress('');
    } finally {
      setLoading(false);
    }
  };

  const handleDragOver = (e) => {
    e.preventDefault();
    e.stopPropagation();
    e.currentTarget.classList.add('drag-over');
  };

  const handleDragLeave = (e) => {
    e.preventDefault();
    e.stopPropagation();
    e.currentTarget.classList.remove('drag-over');
  };

  const handleDrop = (e) => {
    e.preventDefault();
    e.stopPropagation();
    e.currentTarget.classList.remove('drag-over');
    
    const file = e.dataTransfer.files?.[0];
    if (file) {
      const event = { target: { files: [file] } };
      handleFileUpload(event);
    }
  };

  return (
    <div className="app">
      <header className="app-header">
        <div className="header-content">
          <h1>
            <Heart className="header-icon" />
            Apple Health Dashboard
          </h1>
          <p className="subtitle">Visualize your health data</p>
        </div>
      </header>

      <main className="app-main">
        {!healthData ? (
          <div className="upload-section">
            <FileUploader onDataLoaded={(data) => {
              setImportedHealthData(data);
              setActiveTab('import');
            }} />

            {error && (
              <div className="error-message">
                <p>{error}</p>
              </div>
            )}

            {loading && (
              <div className="loading-message">
                <div className="spinner"></div>
                <p>Parsing your health data...</p>
                {progress && <p className="progress-text">{progress}</p>}
              </div>
            )}

            <div className="info-cards">
              <div className="info-card">
                <Heart size={24} />
                <h3>Heart Rate</h3>
                <p>Track your daily BPM trends</p>
              </div>
              <div className="info-card">
                <Activity size={24} />
                <h3>Steps</h3>
                <p>Monitor your daily activity</p>
              </div>
              <div className="info-card">
                <Zap size={24} />
                <h3>Energy</h3>
                <p>View calorie burn data</p>
              </div>
              <div className="info-card">
                <TrendingUp size={24} />
                <h3>Trends</h3>
                <p>See your weekly patterns</p>
              </div>
            </div>
          </div>
        ) : (
          <div className="dashboard-section">
            <div className="dashboard-header">
              <h2>Your Health Metrics</h2>
              <button
                className="reset-button"
                onClick={() => {
                  setHealthData(null);
                  fileInputRef.current = null;
                }}
              >
                Load Different File
              </button>
            </div>

            {/* Tab Navigation */}
            {healthData && (
              <div className="tab-navigation">
                <button
                  className={`tab-button ${activeTab === 'metrics' ? 'active' : ''}`}
                  onClick={() => setActiveTab('metrics')}
                >
                  <TrendingUp size={18} />
                  Overview
                </button>
                {healthData.workoutsByDate && Object.keys(healthData.workoutsByDate).length > 0 && (
                  <button
                    className={`tab-button ${activeTab === 'runs' ? 'active' : ''}`}
                    onClick={() => setActiveTab('runs')}
                  >
                    <Activity size={18} />
                    Runs & Workouts
                  </button>
                )}
                <button
                  className={`tab-button ${activeTab === 'charts' ? 'active' : ''}`}
                  onClick={() => setActiveTab('charts')}
                >
                  <TrendingUp size={18} />
                  Charts
                </button>
                <button
                  className={`tab-button ${activeTab === 'details' ? 'active' : ''}`}
                  onClick={() => setActiveTab('details')}
                >
                  <Calendar size={18} />
                  Details
                </button>
                <button
                  className={`tab-button ${activeTab === 'analytics' ? 'active' : ''}`}
                  onClick={() => setActiveTab('analytics')}
                >
                  <Sparkles size={18} />
                  Analytics & AI
                </button>
                <button
                  className={`tab-button ${activeTab === 'import' ? 'active' : ''}`}
                  onClick={() => setActiveTab('import')}
                >
                  <Upload size={18} />
                  Import Apple Health
                </button>
              </div>
            )}

            {/* Tab Content */}
            {healthData && (
              <>
                {activeTab === 'metrics' && (
                  <>
                    <MetricsCards data={healthData} />
                  </>
                )}
                {activeTab === 'runs' && healthData.workoutsByDate && Object.keys(healthData.workoutsByDate).length > 0 && (
                  <RunsView data={healthData} />
                )}
                {activeTab === 'charts' && (
                  <ChartsSection data={healthData} />
                )}
                {activeTab === 'details' && (
                  <Dashboard data={healthData} />
                )}
                {activeTab === 'analytics' && (
                  <div className="analytics-section">
                    <InsightsAI data={healthData} />
                    <div style={{ marginTop: '24px' }}>
                      <PersonalRecords data={healthData} />
                    </div>
                    <div style={{ marginTop: '24px' }}>
                      <AchievementBadges data={healthData} />
                    </div>
                    <div style={{ marginTop: '24px' }}>
                      <ActivityHeatmap allDates={healthData.allDates} workoutsByDate={healthData.workoutsByDate} />
                    </div>
                    <div style={{ marginTop: '24px' }}>
                      <SleepTracking metricsByType={healthData.metricsByType} />
                    </div>
                    <div style={{ marginTop: '24px' }}>
                      <StressAnalysis metricsByType={healthData.metricsByType} allDates={healthData.allDates} />
                    </div>
                  </div>
                )}
                {activeTab === 'import' && (
                  <div className="import-section">
                    <FileUploader onDataLoaded={setImportedHealthData} />
                    {importedHealthData && (
                      <>
                        <div className="import-summary">
                          <h3>Imported Data Summary</h3>
                          <div className="summary-stats">
                            <div className="summary-stat">
                              <span>Records:</span>
                              <strong>{importedHealthData.totalRecords}</strong>
                            </div>
                            <div className="summary-stat">
                              <span>Workouts:</span>
                              <strong>{importedHealthData.totalWorkouts}</strong>
                            </div>
                            <div className="summary-stat">
                              <span>ECGs:</span>
                              <strong>{importedHealthData.totalECGs}</strong>
                            </div>
                          </div>
                        </div>
                        {importedHealthData.ecgs && importedHealthData.ecgs.length > 0 && (
                          <ECGViewer ecgData={importedHealthData.ecgs} />
                        )}
                        {importedHealthData.workouts && importedHealthData.workouts.length > 0 && (
                          <WorkoutRoutes workouts={importedHealthData.workouts} routes={importedHealthData.routes || []} />
                        )}
                      </>
                    )}
                  </div>
                )}
                  </div>
                )}
              </>
            )}
          </div>
        )}
      </main>

      <footer className="app-footer">
        <p>Apple Health Portal • Local Data Only • No Data Stored</p>
      </footer>
    </div>
  );
}

export default App;
