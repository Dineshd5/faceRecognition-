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
        background: 'rgba(255, 255, 255, 0.95)', 
        backdropFilter: 'blur(8px)',
        borderBottom: '1px solid #E2E8F0',
        padding: '16px 32px', 
        display: 'flex', 
        justifyContent: 'center',
        gap: '32px', 
        zIndex: 1000,
        boxShadow: '0 1px 2px 0 rgba(0, 0, 0, 0.05)'
      }}>
        <a 
          href="#user" 
          style={{ 
            color: currentView === 'user' ? '#1D4ED8' : '#64748B', 
            textDecoration: 'none', 
            fontWeight: '600',
            fontSize: '15px',
            borderBottom: currentView === 'user' ? '2px solid #2563EB' : '2px solid transparent',
            paddingBottom: '4px',
            transition: 'all 0.2s'
          }}
        >
          User Portal
        </a>
        <a 
          href="#admin" 
          style={{ 
            color: currentView === 'admin' ? '#1D4ED8' : '#64748B', 
            textDecoration: 'none', 
            fontWeight: '600',
            fontSize: '15px',
            borderBottom: currentView === 'admin' ? '2px solid #2563EB' : '2px solid transparent',
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
