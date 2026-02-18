import './style.css';
import 'leaflet/dist/leaflet.css';
import { DroneGoMap } from './components/map.js';

/**
 * DroneGo Frontend - Bootstrap File
 * 
 * This file initializes the DroneGo map application.
 */

// Application entry point
async function initializeApp() {
  const app = document.querySelector<HTMLDivElement>('#app');
  
  if (!app) {
    console.error('App container not found');
    return;
  }

  // Set up main UI structure
  app.innerHTML = `
    <div style="
      display: flex;
      flex-direction: column;
      height: 100vh;
      width: 100vw;
      overflow: hidden;
    ">
      <!-- Header -->
      <header style="
        background: #2563eb;
        color: white;
        padding: 12px 20px;
        display: flex;
        align-items: center;
        justify-content: space-between;
        box-shadow: 0 2px 8px rgba(0,0,0,0.1);
        z-index: 1000;
      ">
        <div style="display: flex; align-items: center; gap: 12px;">
          <h1 style="margin: 0; font-size: 20px; font-weight: 600;">🚁 DroneGo</h1>
          <span style="font-size: 13px; opacity: 0.9;">Flight Zone Mapper</span>
        </div>
        <div style="font-size: 12px; opacity: 0.9;">
          Click the map to check if you can fly at a location
        </div>
      </header>

      <!-- Map Container -->
      <div id="map" style="flex: 1; position: relative;"></div>

      <!-- Legend -->
      <div style="
        position: absolute;
        bottom: 30px;
        right: 10px;
        background: white;
        padding: 12px 16px;
        border-radius: 8px;
        box-shadow: 0 2px 8px rgba(0,0,0,0.15);
        z-index: 1000;
        font-size: 12px;
        max-width: 220px;
      ">
        <div style="font-weight: 600; margin-bottom: 8px; color: #1f2937;">Restriction Zones</div>
        <div style="display: flex; flex-direction: column; gap: 4px; margin-bottom: 12px;">
          <div style="display: flex; align-items: center; gap: 8px;">
            <div style="width: 16px; height: 16px; background: #dc2626; border-radius: 2px;"></div>
            <span style="color: #4b5563;">No-Fly Zone</span>
          </div>
          <div style="display: flex; align-items: center; gap: 8px;">
            <div style="width: 16px; height: 16px; background: #f59e0b; border-radius: 2px;"></div>
            <span style="color: #4b5563;">Controlled Airspace</span>
          </div>
          <div style="display: flex; align-items: center; gap: 8px;">
            <div style="width: 16px; height: 16px; background: #6b7280; border-radius: 2px;"></div>
            <span style="color: #4b5563;">Other Restriction</span>
          </div>
        </div>
        <div style="font-weight: 600; margin-bottom: 8px; color: #1f2937; padding-top: 8px; border-top: 1px solid #e5e7eb;">Airspace Classes</div>
        <div style="display: flex; flex-direction: column; gap: 4px;">
          <div style="display: flex; align-items: center; gap: 8px;">
            <div style="width: 16px; height: 16px; border: 2px dashed #6366f1; border-radius: 2px; background: rgba(99, 102, 241, 0.1);"></div>
            <span style="color: #4b5563;">Class A-D</span>
          </div>
          <div style="display: flex; align-items: center; gap: 8px;">
            <div style="width: 16px; height: 16px; border: 2px dashed #10b981; border-radius: 2px; background: rgba(16, 185, 129, 0.1);"></div>
            <span style="color: #4b5563;">Class E-G</span>
          </div>
        </div>
        <div style="margin-top: 8px; padding-top: 8px; border-top: 1px solid #e5e7eb; font-size: 11px; color: #6b7280;">
          Click map to check any location
        </div>
      </div>
    </div>
  `;

  // Initialize the map
  try {
    const map = new DroneGoMap('map');
    await map.init();
    console.log('DroneGo map application initialized successfully');
  } catch (error) {
    console.error('Failed to initialize map:', error);
    app.innerHTML = `
      <div style="
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        height: 100vh;
        font-family: system-ui, sans-serif;
        text-align: center;
        padding: 20px;
      ">
        <h1 style="color: #dc2626; margin-bottom: 10px;">Error Loading Map</h1>
        <p style="color: #64748b; max-width: 600px;">
          Failed to initialize the map. Please check the console for details.
        </p>
      </div>
    `;
  }
}

// Start the app when DOM is ready
initializeApp();
