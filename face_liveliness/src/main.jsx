import { StrictMode, useState } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'
import AdminPanel from './AdminPanel.jsx'

const Router = () => {
  // Use a simple state to toggle between views
  const [currentView, setCurrentView] = useState(
    window.location.hash === '#admin' ? 'admin' : 'user'
  );

  // Listen to hash changes so we can use back/forward buttons
  window.addEventListener('hashchange', () => {
    setCurrentView(window.location.hash === '#admin' ? 'admin' : 'user');
  });

  return (
    <>
      {/* Global Navigation Bar */}
      <nav style={{ 
        position: 'fixed', 
        top: 0, 
        width: '100%', 
        background: 'rgba(15, 23, 42, 0.8)', 
        backdropFilter: 'blur(12px)',
        borderBottom: '1px solid rgba(255, 255, 255, 0.05)',
        padding: '16px 32px', 
        display: 'flex', 
        justifyContent: 'center',
        gap: '32px', 
        zIndex: 1000 
      }}>
        <a 
          href="#user" 
          style={{ 
            color: currentView === 'user' ? '#f8fafc' : '#64748b', 
            textDecoration: 'none', 
            fontWeight: '600',
            fontSize: '15px',
            borderBottom: currentView === 'user' ? '2px solid #3b82f6' : '2px solid transparent',
            paddingBottom: '4px',
            transition: 'all 0.2s'
          }}
        >
          User Portal
        </a>
        <a 
          href="#admin" 
          style={{ 
            color: currentView === 'admin' ? '#f8fafc' : '#64748b', 
            textDecoration: 'none', 
            fontWeight: '600',
            fontSize: '15px',
            borderBottom: currentView === 'admin' ? '2px solid #3b82f6' : '2px solid transparent',
            paddingBottom: '4px',
            transition: 'all 0.2s'
          }}
        >
          Admin Portal
        </a>
      </nav>

      {/* Spacer so content doesn't hide behind nav */}
      <div style={{ height: '64px' }}></div>

      {/* Render the correct app based on the hash */}
      {currentView === 'admin' ? <AdminPanel /> : <App />}
    </>
  );
};

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <Router />
  </StrictMode>,
)
