
import './utils/buffer-polyfill';
import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './index.css';

// Types are handled in buffer-polyfill.ts
const browserProcess = {
  env: { NODE_DEBUG: '' },
  stdout: null,
  stderr: null,
  stdin: null,
  argv: [],
  argv0: '',
  execArgv: [],
  execPath: '',
  abort: () => { throw new Error('process.abort() is not supported') },
  chdir: () => {},
  cwd: () => '/',
  exit: () => { throw new Error('process.exit() is not supported') },
  version: '1.0.0',
  versions: {},
  platform: 'browser',
  pid: 1,
  ppid: 0,
  title: 'browser',
  arch: 'web'
};

window.process = browserProcess;

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
