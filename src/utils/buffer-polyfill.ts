
import { Buffer } from 'buffer';

declare global {
  interface Window {
    process: BrowserProcess;
  }
}

interface BrowserProcess {
  env: { [key: string]: string | undefined };
  stdout: any;
  stderr: any;
  stdin: any;
  argv: string[];
  argv0: string;
  execArgv: string[];
  execPath: string;
  abort: () => never;
  chdir: () => void;
  cwd: () => string;
  exit: (code?: number) => never;
  version: string;
  versions: { [key: string]: string };
  platform: string;
  pid: number;
  ppid: number;
  title: string;
  arch: string;
}

const browserProcess: BrowserProcess = {
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
window.Buffer = Buffer;
