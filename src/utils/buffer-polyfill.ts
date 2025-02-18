
import { Buffer } from 'buffer';

// Ensure process exists
window.process = window.process || {
  env: { NODE_DEBUG: '' },
  browser: true,
  version: '',
};

window.Buffer = Buffer;
