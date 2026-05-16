import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { Upload, Image as ImageIcon, Wand2, UserPlus, CheckCircle, AlertCircle } from 'lucide-react';
import './index.css';

const API_URL = 'http://127.0.0.1:5000/api';

function App() {
  const [profiles, setProfiles] = useState([]);
  const [addFile, setAddFile] = useState(null);
  const [blurFile, setBlurFile] = useState(null);
  const [targetName, setTargetName] = useState('');
  const [threshold, setThreshold] = useState(0.55);
  
  const [addLoading, setAddLoading] = useState(false);
  const [blurLoading, setBlurLoading] = useState(false);
  
  const [addStatus, setAddStatus] = useState(null);
  const [blurResult, setBlurResult] = useState(null);

  useEffect(() => {
    fetchProfiles();
  }, []);

  const fetchProfiles = async () => {
    try {
      const res = await axios.get(`${API_URL}/profiles`);
      setProfiles(res.data.profiles);
      if (res.data.profiles.length > 0 && !targetName) {
        setTargetName(res.data.profiles[0]);
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleAddProfile = async (e) => {
    e.preventDefault();
    if (!addFile) return;
    
    setAddLoading(true);
    setAddStatus(null);
    
    const formData = new FormData();
    formData.append('file', addFile);
    
    try {
      const res = await axios.post(`${API_URL}/add-profile`, formData);
      setAddStatus({ type: 'success', text: res.data.message });
      fetchProfiles();
      setAddFile(null);
    } catch (err) {
      setAddStatus({ type: 'error', text: err.response?.data?.error || err.message });
    } finally {
      setAddLoading(false);
    }
  };

  const handleBlurOthers = async (e) => {
    e.preventDefault();
    if (!blurFile || !targetName) return;
    
    setBlurLoading(true);
    setBlurResult(null);
    
    const formData = new FormData();
    formData.append('group_photo', blurFile);
    formData.append('target_name', targetName);
    formData.append('threshold', threshold);
    
    try {
      const res = await axios.post(`${API_URL}/blur-others`, formData);
      setBlurResult({
        url: res.data.image_url,
        matched: res.data.match_found,
        faces: res.data.total_faces
      });
    } catch (err) {
      setBlurResult({ error: err.response?.data?.error || err.message });
    } finally {
      setBlurLoading(false);
    }
  };

  return (
    <div className="app-container">
      <header className="header">
        <h1>FaceGuard AI</h1>
        <p style={{color: 'var(--text-muted)'}}>PostgreSQL + RetinaFace Privacy Engine</p>
      </header>

      <div className="grid">
        {/* ADD PROFILE CARD */}
        <div className="glass-card">
          <h2 style={{display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1.5rem'}}>
            <UserPlus className="icon" /> Add Master Profile
          </h2>
          <form onSubmit={handleAddProfile}>
            <div className={`dropzone ${addFile ? 'active' : ''}`}>
              <div className="file-input-wrapper">
                <input 
                  type="file" 
                  className="file-input" 
                  accept="image/*"
                  onChange={(e) => setAddFile(e.target.files[0])}
                />
                <Upload size={32} style={{margin: '0 auto', color: 'var(--primary)'}} />
                <p>{addFile ? addFile.name : 'Click or drop portrait photo here'}</p>
              </div>
            </div>
            
            <button className="btn" type="submit" disabled={!addFile || addLoading}>
              {addLoading ? <div className="loading-spinner" /> : 'Extract & Save to DB'}
            </button>
          </form>

          {addStatus && (
            <div className="result-container" style={{display: 'flex', alignItems: 'center', gap: '0.5rem'}}>
              {addStatus.type === 'success' ? <CheckCircle color="#4ade80" /> : <AlertCircle color="#f87171" />}
              <span className={`badge ${addStatus.type === 'error' ? 'error' : ''}`}>
                {addStatus.text}
              </span>
            </div>
          )}
        </div>

        {/* BLUR OTHERS CARD */}
        <div className="glass-card">
          <h2 style={{display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1.5rem'}}>
            <Wand2 className="icon" /> Blur Others
          </h2>
          <form onSubmit={handleBlurOthers}>
            <label style={{display: 'block', marginBottom: '0.5rem', fontSize: '0.9rem'}}>Select VIP (Target Profile)</label>
            <select 
              className="select-input" 
              value={targetName} 
              onChange={(e) => setTargetName(e.target.value)}
            >
              {profiles.map(p => <option key={p} value={p}>{p}</option>)}
              {profiles.length === 0 && <option disabled>No profiles in DB</option>}
            </select>

            <div style={{marginBottom: '1rem', background: 'rgba(0,0,0,0.2)', padding: '1rem', borderRadius: '8px'}}>
              <div style={{display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem'}}>
                <label style={{fontSize: '0.9rem'}}>AI Matching Threshold</label>
                <span style={{color: 'var(--primary)', fontWeight: 'bold'}}>{threshold}</span>
              </div>
              <input 
                type="range" 
                min="0.30" 
                max="0.85" 
                step="0.01" 
                value={threshold}
                onChange={(e) => setThreshold(parseFloat(e.target.value))}
                style={{width: '100%', cursor: 'pointer'}}
              />
              <p style={{fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.5rem', marginBottom: 0}}>
                Lower = Stricter Match (Fewer false positives). Higher = Looser Match (Finds face in bad lighting).
              </p>
            </div>

            <label style={{display: 'block', marginBottom: '0.5rem', fontSize: '0.9rem', marginTop: '1rem'}}>Upload Group Photo</label>
            <div className={`dropzone ${blurFile ? 'active' : ''}`} style={{padding: '2rem'}}>
              <div className="file-input-wrapper">
                <input 
                  type="file" 
                  className="file-input" 
                  accept="image/*"
                  onChange={(e) => setBlurFile(e.target.files[0])}
                />
                <ImageIcon size={32} style={{margin: '0 auto', color: 'var(--primary)'}} />
                <p>{blurFile ? blurFile.name : 'Click or drop group photo here'}</p>
              </div>
            </div>
            
            <button className="btn" type="submit" disabled={!blurFile || !targetName || blurLoading}>
              {blurLoading ? <div className="loading-spinner" /> : 'Apply Privacy Filter'}
            </button>
          </form>
        </div>
      </div>

      {/* RESULTS DISPLAY */}
      {blurResult && (
        <div className="glass-card result-container" style={{marginTop: '2rem'}}>
          <h3>Result</h3>
          {blurResult.error ? (
            <div style={{display: 'flex', alignItems: 'center', gap: '0.5rem'}}>
              <AlertCircle color="#f87171" />
              <span className="badge error">{blurResult.error}</span>
            </div>
          ) : (
            <div>
              <div style={{display: 'flex', gap: '1rem', marginBottom: '1rem'}}>
                <span className="badge">Faces Detected: {blurResult.faces}</span>
                <span className={`badge ${!blurResult.matched ? 'error' : ''}`}>
                  Target Matched: {blurResult.matched ? 'Yes' : 'No'}
                </span>
              </div>
              {blurResult.url && <img src={blurResult.url} alt="Blurred Result" className="preview-img" />}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default App;
