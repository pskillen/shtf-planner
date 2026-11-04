import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { App } from './app/App';
import { installDebugHook } from './app/debug';
import { installEngineDebug } from './app/state/debugEngine';
import { installStoreDebug } from './app/state/debugStore';
import './styles.css';

const debugHook = installDebugHook();
installStoreDebug(debugHook);
installEngineDebug(debugHook);

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </StrictMode>,
);
