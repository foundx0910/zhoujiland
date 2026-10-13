import './polyfills.js'; // 必须最先加载：补齐老浏览器缺失的方法
import React from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App.jsx';
import { applySiteTheme } from './theme.js';
import { AuthProvider } from './store.jsx';
import './styles.css';

// 应用 site.js 里的配色与站点名
applySiteTheme();

createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <BrowserRouter>
      <AuthProvider>
        <App />
      </AuthProvider>
    </BrowserRouter>
  </React.StrictMode>
);
