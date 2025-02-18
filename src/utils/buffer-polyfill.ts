
import { Buffer } from 'buffer';

declare global {
  interface Window {
    process: BrowserProcess;
  }
}

interface BrowserProcess {
  env: { [key: string]: string | undefined };
}

const browserProcess: BrowserProcess = {
  env: { NODE_DEBUG: '' }
};

window.process = browserProcess;
window.Buffer = Buffer;
