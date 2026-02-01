/**
 * Circle Calendar - Entry Point
 * A circular year calendar for tracking events
 */

import './style.css';
import { init } from './app.js';

// Wrap init with error handling to surface any JavaScript errors
async function safeInit() {
  try {
    await init();
  } catch (error) {
    console.error('Failed to initialize app:', error);
    // Show error in the UI for debugging
    const container = document.querySelector('.container');
    if (container) {
      const errorDiv = document.createElement('div');
      errorDiv.style.cssText = 'color: red; padding: 20px; background: #fee; margin: 20px; border-radius: 8px;';
      errorDiv.innerHTML = `<strong>Error initializing app:</strong><br><pre>${error.stack || error.message}</pre>`;
      container.prepend(errorDiv);
    }
  }
}

// Initialize the application when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', safeInit);
} else {
  safeInit();
}
