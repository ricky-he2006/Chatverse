import React from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { Overlay } from './Overlay';
import { Companion } from './Companion';
import './style.css';
import './design-polish.css';
import './atlas.css';
import './experiences.css';
import './living-atlas.css';
import './progression.css';
import './world-tasks.css';
import './campaign.css';
import './release.css';
const overlay = window.location.pathname.startsWith('/overlay/');
createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    {overlay ? <Overlay /> : location.pathname === '/play' ? <Companion /> : <App />}
  </React.StrictMode>,
);
