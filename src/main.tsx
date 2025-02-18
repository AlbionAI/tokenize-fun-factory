
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

const browserProcess = {
  env: { NODE_DEBUG: '' }
};

window.process = browserProcess;

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
