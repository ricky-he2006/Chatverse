import React from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { Overlay } from './Overlay';
import './style.css';
import './design-polish.css';
const overlay = window.location.pathname.startsWith('/overlay/');
createRoot(document.getElementById('root')!).render(
  <React.StrictMode>{overlay ? <Overlay /> : <App />}</React.StrictMode>,
);
