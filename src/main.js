/**
 * Circle Calendar - Entry Point
 * A circular year calendar for tracking events
 */

import './style.css';
import { init } from './app.js';

// Initialize the application when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
