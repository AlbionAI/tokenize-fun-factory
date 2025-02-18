
import './utils/buffer-polyfill';
import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './index.css';

// Polyfill for process
declare global {
  interface Window {
    process: {
      env: { [key: string]: string | undefined };
    };
  }
}

window.process = {
  ...window.process,
  env: { NODE_DEBUG: '' }
};

// Polyfill for Buffer
if (!window.Buffer) {
  window.Buffer = Buffer;
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
