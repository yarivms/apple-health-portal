import React, { useState } from 'react';
import { Upload, AlertCircle, CheckCircle } from 'lucide-react';
import { parseAppleHealthZip, extractHealthRecords, extractWorkouts, extractECGData } from '../utils/zipParser';
import './FileUploader.css';

export default function FileUploader({ onDataLoaded }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(false);
  const [progress, setProgress] = useState('');

  const handleFileUpload = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setLoading(true);
    setError(null);
    setSuccess(false);
    setProgress('Parsing ZIP file...');

    try {
      // Parse ZIP
      setProgress('Extracting health data...');
      const healthData = await parseAppleHealthZip(file);

      // Extract records
      setProgress('Processing health records...');
      const mainRecords = healthData.mainData
        ? extractHealthRecords(healthData.mainData)
        : [];
      const clinicalRecords = healthData.clinicalData
        ? extractHealthRecords(healthData.clinicalData)
        : [];
      const workouts = healthData.mainData
        ? extractWorkouts(healthData.mainData)
        : [];
      const ecgs = healthData.ecgs.map(ecg => extractECGData(ecg.data)).filter(Boolean);

      setProgress('Aggregating data...');
      const aggregatedData = {
        totalRecords: mainRecords.length + clinicalRecords.length,
        totalWorkouts: workouts.length,
        totalECGs: ecgs.length,
        mainRecords,
        clinicalRecords,
        workouts,
        ecgs,
        fileSize: file.size,
        uploadDate: new Date().toISOString()
      };

      onDataLoaded?.(aggregatedData);
      setSuccess(true);
      setProgress(`Successfully loaded ${aggregatedData.totalRecords} records, ${aggregatedData.totalWorkouts} workouts, ${aggregatedData.totalECGs} ECGs`);
    } catch (err) {
      setError(err.message || 'Failed to parse file');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="file-uploader">
      <div className="upload-box">
        <label htmlFor="file-input" className="upload-label">
          <Upload size={48} />
          <h3>Upload Apple Health Export</h3>
          <p>Select the ZIP file you exported from your iPhone Health app</p>
          <input
            id="file-input"
            type="file"
            accept=".zip"
            onChange={handleFileUpload}
            disabled={loading}
            className="file-input"
          />
        </label>
      </div>

      {loading && (
        <div className="status-message loading">
          <div className="spinner"></div>
          <p>{progress}</p>
        </div>
      )}

      {error && (
        <div className="status-message error">
          <AlertCircle size={20} />
          <p>{error}</p>
        </div>
      )}

      {success && (
        <div className="status-message success">
          <CheckCircle size={20} />
          <p>{progress}</p>
        </div>
      )}
    </div>
  );
}
