import React, { useState, useRef } from 'react';
import { Heart, Zap, Activity, TrendingUp, Calendar, Sparkles, Navigation, BarChart3, Brain, RotateCcw } from 'lucide-react';
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
import WorkoutStore from './components/WorkoutStore';
import HealthAIChat from './components/HealthAIChat';
import ApiSettings from './components/ApiSettings';
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
      {/* Modern hero / landing when no data */}
      {!healthData ? (
        <>
          <header className="hero-header">
            <div className="hero-glow" />
            <div className="hero-topbar"><ApiSettings /></div>
            <div className="hero-content">
              <div className="hero-badge">Apple Health Portal</div>
              <h1 className="hero-title">
                <Heart className="hero-heart" />
                Your Health,<br /><span>Beautifully Visualized</span>
              </h1>
              <p className="hero-subtitle">Upload your Apple Health export and explore interactive dashboards, workout maps, AI insights and more.</p>
            </div>
          </header>

          <main className="app-main">
            <div className="upload-section">
              <FileUploader onDataLoaded={(data) => {
                setImportedHealthData(data);
                const dashboardData = {
                  healthRecords: [],
                  workouts: data.workouts || [],
                  workoutRoutes: data.workoutRoutes || [],
                  summary: data.summary || {},
                  metricsByType: data.metricsByType || {},
                  workoutsByDate: data.workoutsByDate || {},
                  allDates: data.allDates || [],
                };
                setHealthData(dashboardData);
                setActiveTab('metrics');
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

              <div className="feature-grid">
                <div className="feature-card">
                  <div className="feature-icon heart"><Heart size={24} /></div>
                  <h3>Heart & Vitals</h3>
                  <p>Resting HR, HRV, blood pressure and more</p>
                </div>
                <div className="feature-card">
                  <div className="feature-icon activity"><Activity size={24} /></div>
                  <h3>Activity & Steps</h3>
                  <p>Daily step counts, flights climbed, move goals</p>
                </div>
                <div className="feature-card">
                  <div className="feature-icon energy"><Zap size={24} /></div>
                  <h3>Workouts & Maps</h3>
                  <p>GPS routes, pace charts, elevation profiles</p>
                </div>
                <div className="feature-card">
                  <div className="feature-icon brain"><Brain size={24} /></div>
                  <h3>AI Insights</h3>
                  <p>Ask questions about your data with GPT-4</p>
                </div>
              </div>

              <div className="trust-strip">
                <span>🔒 100 % local processing</span>
                <span>📱 Works with any Apple Health export</span>
                <span>🚫 No data stored on servers</span>
              </div>
            </div>
          </main>
        </>
        ) : (
          <>
          {/* Compact top bar when dashboard is loaded */}
          <header className="dash-header">
            <div className="dash-header-inner">
              <div className="dash-brand">
                <Heart size={22} className="dash-heart" />
                <span>Health Portal</span>
              </div>
              <div className="dash-header-actions">
                <ApiSettings />
                <button
                  className="reload-btn"
                  onClick={() => {
                    setHealthData(null);
                    setImportedHealthData(null);
                    fileInputRef.current = null;
                  }}
                >
                  <RotateCcw size={16} />
                  Load Different File
                </button>
              </div>
            </div>
          </header>

          <main className="app-main">
          <div className="dashboard-section">

            {/* Pill-style Tab Navigation */}
            <nav className="tab-bar">
              <button className={`pill ${activeTab === 'metrics' ? 'active' : ''}`} onClick={() => setActiveTab('metrics')}>
                <TrendingUp size={16} /> Overview
              </button>
              {healthData.workouts?.length > 0 && (
                <button className={`pill ${activeTab === 'workouts' ? 'active' : ''}`} onClick={() => setActiveTab('workouts')}>
                  <Navigation size={16} /> Workouts
                </button>
              )}
                {healthData.workouts?.length > 0 && (
                <button className={`pill ${activeTab === 'runs' ? 'active' : ''}`} onClick={() => setActiveTab('runs')}>
                  <Activity size={16} /> Runs
                </button>
              )}
              <button className={`pill ${activeTab === 'charts' ? 'active' : ''}`} onClick={() => setActiveTab('charts')}>
                <BarChart3 size={16} /> Charts
              </button>
              <button className={`pill ${activeTab === 'details' ? 'active' : ''}`} onClick={() => setActiveTab('details')}>
                <Calendar size={16} /> Details
              </button>
              <button className={`pill ${activeTab === 'analytics' ? 'active' : ''}`} onClick={() => setActiveTab('analytics')}>
                <Sparkles size={16} /> Analytics
              </button>
              <button className={`pill ${activeTab === 'ai-chat' ? 'active' : ''}`} onClick={() => setActiveTab('ai-chat')}>
                <Brain size={16} /> AI Chat
              </button>
            </nav>

            {/* Tab Content */}
            {healthData && (
              <>
                {activeTab === 'metrics' && (
                  <>
                    <MetricsCards data={healthData} />
                  </>
                )}
                {activeTab === 'workouts' && healthData.workouts && healthData.workouts.length > 0 && (
                  <WorkoutStore
                    workouts={healthData.workouts}
                    workoutRoutes={healthData.workoutRoutes || (importedHealthData?.workoutRoutes) || []}
                    metricsByType={healthData.metricsByType}
                  />
                )}
                {activeTab === 'runs' && healthData.workouts?.length > 0 && (
                  <RunsView workouts={healthData.workouts} workoutRoutes={healthData.workoutRoutes || []} />
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
                {activeTab === 'ai-chat' && (
                  <HealthAIChat healthData={healthData} importedHealthData={importedHealthData} />
                )}
              </>
            )}
          </div>
          </main>
          </>
        )}

      <footer className="app-footer">
        <p>Apple Health Portal &middot; 100% local &middot; No data stored</p>
      </footer>
    </div>
  );
}

export default App;
