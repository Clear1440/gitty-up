import '@fontsource-variable/inter';
import '@fontsource-variable/jetbrains-mono';
import './styles/index.css';

import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App.jsx';
import { readStoredAppearance } from './appearance/AppearanceContext.jsx';
import { applyTheme } from './styles/themes.js';

// Colors first, so the app never shows a frame in the wrong ones.
applyTheme(readStoredAppearance());

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
