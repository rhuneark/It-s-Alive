import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import { ErrorBoundary } from './components/ErrorBoundary';
import './style.css';

// Last-resort safety net: a missed rejection must never crash the player back to the catalog.
window.addEventListener('unhandledrejection', (event) => {
  console.warn('[its-alive] unhandled rejection:', event.reason);
  event.preventDefault();
});

const rootElement = document.getElementById('root');
if (!rootElement) throw new Error('[its-alive] Root element not found');

createRoot(rootElement).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </StrictMode>,
);
