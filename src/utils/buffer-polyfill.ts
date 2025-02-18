
import { Buffer } from 'buffer';

declare global {
  interface Window {
    process: {
      env: { [key: string]: string | undefined };
    };
  }
}

window.process = window.process || {
  env: { NODE_DEBUG: '' }
};

window.Buffer = Buffer;
