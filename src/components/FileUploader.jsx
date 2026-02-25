import React, { useState } from 'react';
import axios from 'axios';
import { Upload, AlertCircle, CheckCircle } from 'lucide-react';
import { parseAppleHealthZip, extractHealthRecords, extractWorkouts, extractECGData } from '../utils/zipParser';
import { getApiBaseUrl } from '../utils/apiConfig';
import './FileUploader.css';

export default function FileUploader({ onDataLoaded }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(false);
  const [progress, setProgress] = useState('');
  const [uploadedData, setUploadedData] = useState(null);
  const apiBaseUrl = getApiBaseUrl();

  const handleFileUpload = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setLoading(true);
    setError(null);
    setSuccess(false);
    setProgress('Parsing ZIP file...');

    try {
      let aggregatedData;

      let useServer = !!apiBaseUrl;

      if (useServer) {
        try {
          const formData = new FormData();
          formData.append('file', file);

          setProgress('Uploading to server...');
          const response = await axios.post(`${apiBaseUrl.replace(/\/$/, '')}/api/parse`, formData, {
            headers: { 'Content-Type': 'multipart/form-data' },
            timeout: 600000, // 10 minutes
            maxContentLength: Infinity,
            maxBodyLength: Infinity,
            onUploadProgress: (event) => {
              if (!event.total) return;
              const percent = Math.round((event.loaded / event.total) * 100);
              const mbLoaded = (event.loaded / 1024 / 1024).toFixed(1);
              const mbTotal = (event.total / 1024 / 1024).toFixed(1);
              setProgress(`Uploading to server... ${percent}% (${mbLoaded}/${mbTotal} MB)`);
              if (percent === 100) {
                setProgress('Processing ZIP file on server... (this may take a few minutes for large files)');
              }
            }
          });

          const serverData = response.data || {};
          aggregatedData = {
            ...serverData,
            fileSize: file.size,
            uploadDate: new Date().toISOString(),
            originalFileSize: serverData.originalFileSize || null,
            tooLarge: false,
            cdaTooLarge: false,
            warnings: serverData.warnings || []
          };
        } catch (serverErr) {
          // Network error (server unreachable) — fall back to client-side parsing
          const isNetworkError = !serverErr.response; // no response = network/DNS/CORS issue
          if (isNetworkError) {
            console.warn('Server unreachable, falling back to client-side parsing:', serverErr.message);
            useServer = false;
          } else {
            throw serverErr; // real server error — bubble up
          }
        }
      }

      if (!useServer && !aggregatedData) {
        // Parse ZIP in the browser
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
        aggregatedData = {
          totalRecords: mainRecords.length + clinicalRecords.length,
          totalWorkouts: workouts.length,
          totalECGs: ecgs.length,
          mainRecords,
          clinicalRecords,
          workouts,
          ecgs,
          workoutRoutes: healthData.workoutRoutes || [],
          fileSize: file.size,
          uploadDate: new Date().toISOString(),
          originalFileSize: healthData.metadata?.originalSize,
          tooLarge: healthData.metadata?.tooLarge || false,
          cdaTooLarge: healthData.metadata?.cdaTooLarge || false,
          warnings: []
        };
      }

      onDataLoaded?.(aggregatedData);
      setUploadedData(aggregatedData);
      setSuccess(true);
      const sizeNote = aggregatedData.tooLarge
        ? ' (main records skipped due to file size)'
        : '';
      setProgress(`Successfully loaded ${aggregatedData.totalRecords} records, ${aggregatedData.totalWorkouts} workouts, ${aggregatedData.totalECGs} ECGs${sizeNote}`);
    } catch (err) {
      const serverMessage = err?.response?.data?.error;
      setError(serverMessage || err.message || 'Failed to parse file');
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
          <div>
            <p>{progress}</p>
            {uploadedData?.tooLarge && (
              <p style={{ fontSize: '12px', marginTop: '4px', opacity: 0.8 }}>
                Note: Main records were skipped because the XML file is too large to parse in the browser.
              </p>
            )}
            {(uploadedData?.recordsTruncated || uploadedData?.clinicalTruncated || uploadedData?.workoutsTruncated || uploadedData?.routesTruncated || uploadedData?.ecgSamplesTruncated) && (
              <p style={{ fontSize: '12px', marginTop: '4px', opacity: 0.8 }}>
                Note: Some data was truncated during parsing to keep processing fast.
              </p>
            )}
            {uploadedData?.warnings?.length > 0 && (
              <p style={{ fontSize: '12px', marginTop: '4px', opacity: 0.8 }}>
                Note: {uploadedData.warnings.length} parsing warnings were reported.
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
