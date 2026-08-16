import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import { tokensToCss } from './design/tokens';
import './design/global.css';

// Tasarim tokenlari CSS degiskenlerine tek kaynaktan aktarilir.
const tokenStyle = document.createElement('style');
tokenStyle.textContent = tokensToCss();
document.head.prepend(tokenStyle);

const container = document.getElementById('root');
if (!container) throw new Error('root bulunamadi');

createRoot(container).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
