import React, { useState, useCallback } from 'react';
import './App.css'; // Reuse existing styles

const AdminPanel = () => {
  const [selectedFiles, setSelectedFiles] = useState([]);
  const [uploadStatus, setUploadStatus] = useState({}); // { filename: 'uploading' | 'success' | 'error' }
  const [isUploading, setIsUploading] = useState(false);
  
  // Login State
  const [isAuthenticated, setIsAuthenticated] = useState(() => {
    return localStorage.getItem('admin_authenticated') === 'true';
  });
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loginError, setLoginError] = useState('');

  // Use the environment variable from Vercel / .env file
  const ADMIN_API_URL = import.meta.env.VITE_AWS_ADMIN_LAMBDA_URL;

  const handleLogin = (e) => {
    e.preventDefault();
    if (password === '1522001' && email.includes('@')) {
      setIsAuthenticated(true);
      localStorage.setItem('admin_authenticated', 'true');
      setLoginError('');
    } else {
      setLoginError('Invalid email or password');
    }
  };

  const handleLogout = () => {
    setIsAuthenticated(false);
    localStorage.removeItem('admin_authenticated');
  };

  const handleFileChange = (e) => {
    const files = Array.from(e.target.files);
    setSelectedFiles(files);
    setUploadStatus({});
  };

  const convertToBase64 = (file) => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = () => resolve(reader.result);
      reader.onerror = (error) => reject(error);
    });
  };

  const handleUpload = async () => {
    if (selectedFiles.length === 0) return;

    setIsUploading(true);
    const newStatus = { ...uploadStatus };

    for (const file of selectedFiles) {
      newStatus[file.name] = 'uploading';
      setUploadStatus({ ...newStatus });

      try {
        const base64Image = await convertToBase64(file);

        // If the URL is just a placeholder, simulate a fake delay instead of crashing
        if (ADMIN_API_URL === 'YOUR_ADMIN_LAMBDA_URL_HERE') {
          await new Promise(r => setTimeout(r, 1000));
          newStatus[file.name] = 'success';
          setUploadStatus({ ...newStatus });
          continue;
        }

        const response = await fetch(ADMIN_API_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            filename: file.name,
            image: base64Image // Send as base64
          })
        });

        if (!response.ok) throw new Error('Upload failed');

        newStatus[file.name] = 'success';
      } catch (error) {
        console.error(`Error uploading ${file.name}:`, error);
        newStatus[file.name] = 'error';
      }

      setUploadStatus({ ...newStatus });
    }

    setIsUploading(false);
  };

  if (!isAuthenticated) {
    return (
      <div className="app-container admin-panel" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div className="result-screen">
          <h2 className="result-title">Admin Login</h2>
          <p style={{ color: '#64748B', fontSize: '14px', margin: '0 0 32px 0' }}>
            Please sign in to access the Photographer Portal.
          </p>

          <form onSubmit={handleLogin} style={{ display: 'flex', flexDirection: 'column', gap: '16px', textAlign: 'left', width: '100%' }}>
            <div>
              <label style={{ display: 'block', fontSize: '13px', fontWeight: '600', color: '#475569', marginBottom: '6px' }}>Email Address</label>
              <input 
                type="email" 
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="admin@studio.com"
                required
                style={{ width: '100%', padding: '12px', borderRadius: '8px', border: '1px solid #CBD5E1', fontSize: '14px' }}
              />
            </div>
            
            <div>
              <label style={{ display: 'block', fontSize: '13px', fontWeight: '600', color: '#475569', marginBottom: '6px' }}>Password</label>
              <input 
                type="password" 
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                required
                style={{ width: '100%', padding: '12px', borderRadius: '8px', border: '1px solid #CBD5E1', fontSize: '14px' }}
              />
            </div>

            {loginError && <div style={{ color: '#DC2626', fontSize: '13px', fontWeight: '600', marginTop: '8px' }}>{loginError}</div>}
            
            <button type="submit" className="primary-btn" style={{ marginTop: '12px' }}>
              Login to Portal
            </button>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div className="app-container admin-panel">
      <div className="header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '24px 32px 0 32px', width: '100%' }}>
        <div className="logo" style={{ fontSize: '20px', fontWeight: '700', color: '#0F172A', letterSpacing: '-0.02em' }}>Photographer Portal</div>
        <button 
          onClick={handleLogout} 
          style={{ background: '#FEE2E2', border: '1px solid #FCA5A5', color: '#DC2626', padding: '6px 16px', borderRadius: '8px', fontWeight: '600', cursor: 'pointer', fontSize: '13px', transition: 'all 0.2s ease' }}
        >
          Logout
        </button>
      </div>

      <div className="content">
        <div className="result-screen" style={{ textAlign: 'center', width: '100%', maxWidth: '500px' }}>
          <h2 className="result-title" style={{ fontSize: '24px' }}>Upload Event Photos</h2>
          <p style={{ color: '#64748b', fontSize: '14px', marginBottom: '24px' }}>
            Select photos to upload. They will be automatically analyzed and added to the <strong style={{ color: '#1e293b' }}>event_collection</strong>.
          </p>

          <div
            style={{
              border: '2px dashed #CBD5E1',
              borderRadius: '12px',
              padding: '40px 20px',
              background: '#F8FAFC',
              marginBottom: '24px',
              cursor: 'pointer',
              transition: 'all 0.2s ease',
            }}
            onMouseOver={(e) => {
              e.currentTarget.style.borderColor = '#2563EB';
              e.currentTarget.style.background = '#EFF6FF';
            }}
            onMouseOut={(e) => {
              e.currentTarget.style.borderColor = '#CBD5E1';
              e.currentTarget.style.background = '#F8FAFC';
            }}
            onClick={() => document.getElementById('fileInput').click()}
          >
            <span style={{ display: 'block', color: '#94a3b8', fontSize: '13px', marginTop: '4px' }}>Supports JPG and PNG</span>
            <input
              id="fileInput"
              type="file"
              multiple
              accept="image/jpeg, image/png"
              style={{ display: 'none' }}
              onChange={handleFileChange}
            />
          </div>

          {selectedFiles.length > 0 && (
            <div style={{ textAlign: 'left', marginBottom: '24px' }}>
              <h4 style={{ margin: '0 0 12px 0', color: '#1e293b' }}>Selected Files ({selectedFiles.length})</h4>
              <ul style={{ listStyle: 'none', padding: '0', margin: '0', maxHeight: '200px', overflowY: 'auto' }}>
                {selectedFiles.map(file => (
                  <li key={file.name} style={{ fontSize: '13px', padding: '8px', borderBottom: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '70%' }}>{file.name}</span>
                    <span>
                      {uploadStatus[file.name] === 'uploading' && '⏳'}
                      {uploadStatus[file.name] === 'success' && '✅'}
                      {uploadStatus[file.name] === 'error' && '❌'}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <button
            className="primary-btn"
            onClick={handleUpload}
            disabled={selectedFiles.length === 0 || isUploading}
            style={{ opacity: (selectedFiles.length === 0 || isUploading) ? 0.5 : 1 }}
          >
            {isUploading ? 'Uploading...' : 'Upload & Index Faces'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default AdminPanel;
