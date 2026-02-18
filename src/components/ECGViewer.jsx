import React from 'react';
import { Heart, TrendingUp } from 'lucide-react';
import './ECGViewer.css';

export default function ECGViewer({ ecgData }) {
  if (!ecgData || ecgData.length === 0) {
    return (
      <div className="ecg-viewer empty">
        <Heart size={32} />
        <p>No ECG data available</p>
      </div>
    );
  }

  const renderECGWaveform = (samples) => {
    if (!samples || samples.length < 2) return null;

    const values = samples.map(s => parseFloat(s.value || 0)).filter(v => !isNaN(v));
    if (values.length === 0) return null;

    const min = Math.min(...values);
    const max = Math.max(...values);
    const range = max - min || 1;
    const padding = 10;
    const width = 400;
    const height = 150;

    const points = values.map((val, i) => {
      const x = (i / (values.length - 1)) * (width - 2 * padding) + padding;
      const normalizedVal = (val - min) / range;
      const y = height - normalizedVal * (height - 2 * padding) - padding;
      return `${x},${y}`;
    }).join(' ');

    return (
      <svg width={width} height={height} className="ecg-waveform">
        <polyline
          points={points}
          fill="none"
          stroke="#ef4444"
          strokeWidth="2"
          vectorEffect="non-scaling-stroke"
        />
        <line x1={padding} y1={height / 2} x2={width - padding} y2={height / 2} stroke="#e5e7eb" strokeWidth="1" />
      </svg>
    );
  };

  return (
    <div className="ecg-viewer">
      <div className="ecg-header">
        <Heart size={24} />
        <h3>Electrocardiogram (ECG) Data</h3>
      </div>

      <div className="ecg-grid">
        {ecgData.map((ecg, idx) => (
          <div key={idx} className="ecg-card">
            <div className="ecg-timestamp">
              {new Date(ecg.timestamp).toLocaleDateString()} {new Date(ecg.timestamp).toLocaleTimeString()}
            </div>

            {ecg.heartRate && (
              <div className="ecg-metric">
                <TrendingUp size={16} />
                <span>Heart Rate: <strong>{ecg.heartRate} BPM</strong></span>
              </div>
            )}

            {ecg.classification && (
              <div className="ecg-classification">
                Classification: <strong>{ecg.classification}</strong>
              </div>
            )}

            {ecg.samples && ecg.samples.length > 0 && (
              <div className="ecg-waveform-container">
                {renderECGWaveform(ecg.samples)}
              </div>
            )}

            <div className="ecg-details">
              <p>Samples: {ecg.samples?.length || 0}</p>
              {ecg.sampleRate && <p>Sample Rate: {ecg.sampleRate} Hz</p>}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
