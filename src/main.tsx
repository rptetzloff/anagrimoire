import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import { initAnalytics } from './analytics';
import '@fontsource-variable/inter';
// The wordmark's face, one weight of Latin letters (18 KB), bundled for the
// same reason Inter is. Nothing else is set in it.
import '@fontsource/fraunces/latin-600.css';
import './index.css';

initAnalytics();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>
);
