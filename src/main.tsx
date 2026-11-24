import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';
import {updateSignal, watchForUpdate} from './utils/swUpdate';

createRoot(document.getElementById('root')!).render(<App />);

// Offline support: only in production builds, so development never serves stale files.
if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => {
    navigator.serviceWorker
      .register('/sw.js')
      .then((reg) => {
        const recheck = watchForUpdate(reg, navigator.serviceWorker, () => window.location.reload(), updateSignal.announce);
        // A phone app is rarely closed: look for a new version whenever it comes back to the front.
        document.addEventListener('visibilitychange', () => document.visibilityState === 'visible' && recheck());
      })
      .catch(() => {
        // Not fatal: the app simply works online-only.
      });
  });
}
