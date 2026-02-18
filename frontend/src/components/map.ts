import L from 'leaflet';
import { apiClient } from '../services/api-client.js';
import { geolocationService, GeolocationError } from '../services/geolocation.js';
import { RestrictionStatusIndicator } from './RestrictionStatusIndicator.js';

/**
 * DroneGo Map Component
 * 
 * Interactive Leaflet map displaying:
 * - Restriction zones (no-fly, controlled, etc.)
 * - Airspace classifications
 * - TOAL sites (Take-Off And Landing)
 */
export class DroneGoMap {
  private map: L.Map | null = null;
  private zonesLayer: L.LayerGroup;
  private airspaceLayer: L.LayerGroup;
  private toalLayer: L.LayerGroup;
  private currentLocationMarker: L.Marker | null = null;
  private userLocationMarker: L.Marker | null = null;
  private userLocation: { lat: number; lng: number } | null = null;
  private statusIndicator: RestrictionStatusIndicator;
  private layersEnabled = {
    zones: true,
    airspace: true,
  };

  constructor(private containerId: string) {
    this.zonesLayer = L.layerGroup();
    this.airspaceLayer = L.layerGroup();
    this.toalLayer = L.layerGroup();
    this.statusIndicator = new RestrictionStatusIndicator(containerId);
  }

  /**
   * Initialize the map
   */
  async init(): Promise<void> {
    // Try to get user's current location
    let initialCenter: [number, number] = [51.5074, -0.1278]; // Default: London
    let hasUserLocation = false;

    try {
      const position = await geolocationService.getCurrentPosition();
      initialCenter = [position.lat, position.lng];
      hasUserLocation = true;
      this.userLocation = { lat: position.lat, lng: position.lng };
      console.log('Got user location:', position);
    } catch (error) {
      if (error instanceof GeolocationError) {
        console.warn('Geolocation unavailable:', error.message);
        // Show notification that we're using default location
        this.showLocationFallbackNotice();
      }
    }

    // Create map centered on user location or default
    this.map = L.map(this.containerId, {
      center: initialCenter,
      zoom: hasUserLocation ? 14 : 11,
      zoomControl: true,
      attributionControl: true,
    });

    // Add OpenStreetMap tiles
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '© OpenStreetMap contributors',
      maxZoom: 19,
    }).addTo(this.map);

    // Add layers to map
    this.zonesLayer.addTo(this.map);
    this.airspaceLayer.addTo(this.map);
    this.toalLayer.addTo(this.map);

    // If we have user location, show marker and auto-check
    if (hasUserLocation) {
      await this.showUserLocation(initialCenter[0], initialCenter[1]);
    }

    // Load initial data
    await this.loadMapData();

    // Update data when map moves
    this.map.on('moveend', () => {
      this.loadMapData();
    });

    // Click handler for location checks
    this.map.on('click', async (e: L.LeafletMouseEvent) => {
      await this.checkLocation(e.latlng.lat, e.latlng.lng);
    });

    // Add map controls
    this.addLocationButton();
    this.addLayerToggles();

    console.log('Map initialized successfully');
  }

  /**
   * Load zones and TOAL sites for current map bounds
   */
  private async loadMapData(): Promise<void> {
    if (!this.map) return;

    const bounds = this.map.getBounds();
    const boundsCoords = {
      minLon: bounds.getWest(),
      minLat: bounds.getSouth(),
      maxLon: bounds.getEast(),
      maxLat: bounds.getNorth(),
    };

    try {
      // Load zones and airspace in parallel
      const [zonesData, airspaceData] = await Promise.all([
        apiClient.getZones(boundsCoords),
        apiClient.getAirspace(boundsCoords),
      ]);

      this.displayZones(zonesData);
      this.displayAirspace(airspaceData);

      console.log(`Loaded ${zonesData.metadata?.result_count || 0} zones, ${airspaceData.metadata?.result_count || 0} airspace`);
    } catch (error) {
      console.error('Failed to load map data:', error);
    }
  }

  /**
   * Display restriction zones on the map
   */
  private displayZones(data: any): void {
    // Clear existing zones
    this.zonesLayer.clearLayers();

    if (!data.features || data.features.length === 0) {
      return;
    }

    // Add each zone to the map
    data.features.forEach((feature: any) => {
      const zoneType = feature.properties.zone_type;

      // Color coding by zone type
      const colors: Record<string, string> = {
        'no-fly': '#dc2626',           // Red
        'airport-frz': '#dc2626',      // Red
        'controlled-airspace': '#f59e0b',  // Orange
        'temporary-restriction': '#f59e0b', // Orange
        'military-zone': '#b91c1c',    // Dark red
        'danger-area': '#b91c1c',      // Dark red
      };

      const color = colors[zoneType] || '#6b7280'; // Gray default

      // Create GeoJSON layer
      const geoJsonLayer = L.geoJSON(feature, {
        style: {
          color: color,
          fillColor: color,
          weight: 2,
          opacity: 0.8,
          fillOpacity: 0.3,
        },
      });

      // Add popup with zone details
      const popup = this.createZonePopup(feature.properties);
      geoJsonLayer.bindPopup(popup);

      // Add to layer
      geoJsonLayer.addTo(this.zonesLayer);
    });
  }

  /**
   * Display airspace classifications on the map
   */
  private displayAirspace(data: any): void {
    // Clear existing airspace
    this.airspaceLayer.clearLayers();

    if (!data.features || data.features.length === 0) {
      return;
    }

    // Add each airspace to the map
    data.features.forEach((feature: any) => {
      const icaoClass = feature.properties.class_designation;

      // Color coding by ICAO class (more subtle than zones)
      const colors: Record<string, string> = {
        'A': '#9333ea',  // Purple
        'B': '#7c3aed',  // Purple
        'C': '#6366f1',  // Indigo
        'D': '#3b82f6',  // Blue
        'E': '#06b6d4',  // Cyan
        'F': '#10b981',  // Green
        'G': '#84cc16',  // Lime
      };

      const color = colors[icaoClass] || '#94a3b8'; // Gray default

      // Create GeoJSON layer with dashed border
      const geoJsonLayer = L.geoJSON(feature, {
        style: {
          color: color,
          fillColor: color,
          weight: 2,
          opacity: 0.6,
          fillOpacity: 0.1,
          dashArray: '5, 5',  // Dashed line to differentiate from zones
        },
      });

      // Add popup with airspace details
      const popup = this.createAirspacePopup(feature.properties);
      geoJsonLayer.bindPopup(popup);

      // Add to layer
      geoJsonLayer.addTo(this.airspaceLayer);
    });
  }

  /**
   * Create popup content for a restriction zone
   */
  private createZonePopup(properties: any): string {
    const canFly = !['no-fly', 'airport-frz'].includes(properties.zone_type);
    const authRequired = properties.authorization_possible;

    let statusText = '';
    let statusColor = '';

    if (!canFly) {
      statusText = '🚫 NO FLY ZONE';
      statusColor = '#dc2626';
    } else if (authRequired) {
      statusText = '⚠️ AUTHORIZATION REQUIRED';
      statusColor = '#f59e0b';
    } else {
      statusText = '✓ PERMITTED';
      statusColor = '#16a34a';
    }

    return `
      <div style="min-width: 250px; font-family: system-ui, sans-serif;">
        <h3 style="margin: 0 0 8px 0; font-size: 14px; font-weight: 600;">
          ${properties.restriction_name}
        </h3>
        <div style="background: ${statusColor}; color: white; padding: 6px 10px; border-radius: 4px; margin-bottom: 8px; font-weight: 600; font-size: 12px;">
          ${statusText}
        </div>
        <table style="width: 100%; font-size: 12px;">
          <tr>
            <td style="padding: 4px 0; color: #666;"><strong>Type:</strong></td>
            <td style="padding: 4px 0;">${this.formatZoneType(properties.zone_type)}</td>
          </tr>
          <tr>
            <td style="padding: 4px 0; color: #666;"><strong>Authority:</strong></td>
            <td style="padding: 4px 0;">${properties.authority_source}</td>
          </tr>
          <tr>
            <td style="padding: 4px 0; color: #666;"><strong>Altitude:</strong></td>
            <td style="padding: 4px 0;">${properties.altitude_floor}ft - ${properties.altitude_ceiling}ft</td>
          </tr>
          ${properties.description ? `
            <tr>
              <td colspan="2" style="padding: 8px 0 0 0;">
                <p style="margin: 0; font-size: 11px; color: #333; line-height: 1.4;">
                  ${properties.description}
                </p>
              </td>
            </tr>
          ` : ''}
        </table>
      </div>
    `;
  }

  /**
   * Check flight permission at specific coordinates
   */
  private async checkLocation(lat: number, lng: number): Promise<void> {
    try {
      const result = await apiClient.checkLocation(lat, lng);

      // Remove existing marker
      if (this.currentLocationMarker) {
        this.map?.removeLayer(this.currentLocationMarker);
      }

      // Create custom icon based on status
      const iconColor = result.can_fly ? '#16a34a' : '#dc2626';
      const iconHtml = result.can_fly ? '✓' : '✗';

      const customIcon = L.divIcon({
        className: 'custom-location-marker',
        html: `<div style="
          background: ${iconColor};
          color: white;
          width: 32px;
          height: 32px;
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          border: 3px solid white;
          box-shadow: 0 2px 8px rgba(0,0,0,0.3);
          font-size: 18px;
          font-weight: bold;
        ">${iconHtml}</div>`,
        iconSize: [32, 32],
        iconAnchor: [16, 16],
      });

      // Add marker
      this.currentLocationMarker = L.marker([lat, lng], { icon: customIcon });
      this.currentLocationMarker.addTo(this.map!);

      // Create popup with detailed results
      const popup = this.createLocationCheckPopup(result, lat, lng);
      this.currentLocationMarker.bindPopup(popup, { maxWidth: 350 }).openPopup();

    } catch (error) {
      console.error('Location check failed:', error);
      alert('Failed to check location. Please try again.');
    }
  }

  /**
   * Create popup content for location check result
   */
  private createLocationCheckPopup(result: any, lat: number, lng: number): string {
    const statusColor = result.can_fly ? '#16a34a' : '#dc2626';
    const statusIcon = result.can_fly ? '✓' : '✗';
    const statusText = result.can_fly ? 'YOU CAN FLY HERE' : 'NO FLIGHT PERMITTED';

    let zonesHtml = '';
    if (result.zones && result.zones.length > 0) {
      zonesHtml = `
        <div style="margin-top: 12px;">
          <strong style="color: #666; font-size: 11px;">RESTRICTION ZONES (${result.zones.length}):</strong>
          <ul style="margin: 4px 0; padding-left: 20px; font-size: 11px;">
            ${result.zones.map((zone: any) => `
              <li style="margin: 2px 0;">${zone.restriction_name}</li>
            `).join('')}
          </ul>
        </div>
      `;
    }

    let toalHtml = '';
    if (result.nearest_toal) {
      const distanceKm = (result.nearest_toal.distance_meters / 1000).toFixed(2);
      toalHtml = `
        <div style="margin-top: 12px; padding: 8px; background: #f3f4f6; border-radius: 4px;">
          <strong style="color: #666; font-size: 11px;">NEAREST TOAL SITE:</strong>
          <div style="font-size: 12px; margin-top: 4px;">
            📍 ${result.nearest_toal.site_name}
            <div style="color: #666; font-size: 11px; margin-top: 2px;">
              Distance: ${distanceKm} km
            </div>
          </div>
        </div>
      `;
    }

    return `
      <div style="min-width: 300px; font-family: system-ui, sans-serif;">
        <div style="background: ${statusColor}; color: white; padding: 12px; margin: -8px -8px 12px -8px; border-radius: 4px 4px 0 0;">
          <div style="font-size: 24px; margin-bottom: 4px;">${statusIcon}</div>
          <div style="font-weight: 600; font-size: 13px;">${statusText}</div>
        </div>
        <div style="font-size: 11px; color: #666; margin-bottom: 8px;">
          📍 ${lat.toFixed(5)}, ${lng.toFixed(5)}
        </div>
        <table style="width: 100%; font-size: 12px;">
          <tr>
            <td style="padding: 4px 0; color: #666;"><strong>Status:</strong></td>
            <td style="padding: 4px 0;">${this.formatStatus(result.restriction_status)}</td>
          </tr>
          ${result.authorization_required ? `
            <tr>
              <td colspan="2" style="padding: 8px 0;">
                <div style="background: #fef3c7; border-left: 3px solid #f59e0b; padding: 8px; font-size: 11px;">
                  ⚠️ Authorization required from local authority
                </div>
              </td>
            </tr>
          ` : ''}
        </table>
        ${zonesHtml}
        ${toalHtml}
      </div>
    `;
  }

  /**
   * Create popup content for an airspace classification
   */
  private createAirspacePopup(properties: any): string {
    const icaoClass = properties.class_designation;
    const classColors: Record<string, string> = {
      'A': '#9333ea',
      'B': '#7c3aed',
      'C': '#6366f1',
      'D': '#3b82f6',
      'E': '#06b6d4',
      'F': '#10b981',
      'G': '#84cc16',
    };
    const color = classColors[icaoClass] || '#94a3b8';

    return `
      <div style="min-width: 250px; font-family: system-ui, sans-serif;">
        <h3 style="margin: 0 0 8px 0; font-size: 14px; font-weight: 600;">
          ${properties.airspace_name || 'Airspace'}
        </h3>
        <div style="background: ${color}; color: white; padding: 6px 10px; border-radius: 4px; margin-bottom: 8px; font-weight: 600; font-size: 12px;">
          ✈️ Class ${icaoClass} Airspace
        </div>
        <table style="width: 100%; font-size: 12px;">
          <tr>
            <td style="padding: 4px 0; color: #666;"><strong>Authority:</strong></td>
            <td style="padding: 4px 0;">${properties.controlling_authority || 'N/A'}</td>
          </tr>
          <tr>
            <td style="padding: 4px 0; color: #666;"><strong>Floor:</strong></td>
            <td style="padding: 4px 0;">${properties.altitude_floor || 0}ft</td>
          </tr>
          <tr>
            <td style="padding: 4px 0; color: #666;"><strong>Ceiling:</strong></td>
            <td style="padding: 4px 0;">${properties.altitude_ceiling || 'Unlimited'}ft</td>
          </tr>
          ${properties.frequency ? `
            <tr>
              <td style="padding: 4px 0; color: #666;"><strong>Frequency:</strong></td>
              <td style="padding: 4px 0;">${properties.frequency} MHz</td>
            </tr>
          ` : ''}
        </table>
        <div style="margin-top: 8px; padding: 8px; background: #f3f4f6; border-radius: 4px; font-size: 11px; color: #333;">
          ℹ️ ${this.getAirspaceClassDescription(icaoClass)}
        </div>
      </div>
    `;
  }

  /**
   * Get description for ICAO airspace class
   */
  private getAirspaceClassDescription(icaoClass: string): string {
    const descriptions: Record<string, string> = {
      'A': 'IFR only. ATC clearance required.',
      'B': 'IFR/VFR. ATC clearance required for all.',
      'C': 'IFR/VFR. ATC clearance required. Radio contact mandatory.',
      'D': 'IFR/VFR. ATC clearance for IFR. Radio contact for VFR.',
      'E': 'IFR/VFR. ATC clearance for IFR only.',
      'F': 'IFR/VFR. Advisory service for IFR.',
      'G': 'IFR/VFR. No ATC clearance required. Flight information service available.',
    };
    return descriptions[icaoClass] || 'See local regulations.';
  }

  /**
   * Format zone type for display
   */
  private formatZoneType(type: string): string {
    const types: Record<string, string> = {
      'no-fly': 'No-Fly Zone',
      'airport-frz': 'Airport Flight Restriction Zone',
      'controlled-airspace': 'Controlled Airspace',
      'temporary-restriction': 'Temporary Flight Restriction',
      'military-zone': 'Military Zone',
      'danger-area': 'Danger Area',
    };
    return types[type] || type;
  }

  /**
   * Format restriction status for display
   */
  private formatStatus(status: string): string {
    const statuses: Record<string, string> = {
      'permitted': '✓ Permitted',
      'controlled': '⚠️ Controlled',
      'no-fly': '🚫 No-Fly',
    };
    return statuses[status] || status;
  }

  /**
   * Show user's current location marker and auto-check restrictions
   */
  private async showUserLocation(lat: number, lng: number): Promise<void> {
    if (!this.map) return;

    // Create pulsing marker for user location
    const pulsingIcon = L.divIcon({
      className: 'user-location-marker',
      html: `
        <style>
          .user-location-marker > div {
            position: relative;
          }
          .user-location-pulse {
            width: 20px;
            height: 20px;
            border-radius: 50%;
            background: #2563eb;
            border: 3px solid white;
            box-shadow: 0 0 0 0 rgba(37, 99, 235, 0.7);
            animation: pulse 2s infinite;
          }
          @keyframes pulse {
            0% {
              box-shadow: 0 0 0 0 rgba(37, 99, 235, 0.7);
            }
            70% {
              box-shadow: 0 0 0 10px rgba(37, 99, 235, 0);
            }
            100% {
              box-shadow: 0 0 0 0 rgba(37, 99, 235, 0);
            }
          }
        </style>
        <div>
          <div class="user-location-pulse"></div>
        </div>
      `,
      iconSize: [20, 20],
      iconAnchor: [10, 10],
    });

    // Add user location marker
    this.userLocationMarker = L.marker([lat, lng], { icon: pulsingIcon });
    this.userLocationMarker.addTo(this.map);
    this.userLocationMarker.bindPopup('📍 Your Location');

    // Auto-check restrictions at user location
    try {
      const result = await apiClient.checkLocation(lat, lng);
      
      // Show status indicator
      this.statusIndicator.show({
        canFly: result.can_fly,
        restrictionStatus: result.restriction_status,
        authorizationRequired: result.authorization_required,
        zonesCount: result.zones.length,
      });
    } catch (error) {
      console.error('Failed to check user location:', error);
    }
  }

  /**
   * Show notification when GPS is unavailable
   */
  private showLocationFallbackNotice(): void {
    const notice = document.createElement('div');
    notice.style.cssText = `
      position: absolute;
      top: 80px;
      left: 50%;
      transform: translateX(-50%);
      z-index: 1000;
      background: #3b82f6;
      color: white;
      padding: 12px 20px;
      border-radius: 8px;
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
      font-size: 14px;
      display: flex;
      align-items: center;
      gap: 10px;
    `;
    notice.innerHTML = `
      <span>📍</span>
      <span>Location unavailable. Showing London area. Click map to check any location.</span>
    `;
    
    const container = document.getElementById(this.containerId);
    if (container) {
      container.appendChild(notice);
      
      // Auto-hide after 5 seconds
      setTimeout(() => {
        notice.style.transition = 'opacity 0.3s';
        notice.style.opacity = '0';
        setTimeout(() => notice.remove(), 300);
      }, 5000);
    }
  }

  /**
   * Add "Return to My Location" button (FR-028)
   * Uses Leaflet Control for proper positioning
   */
  private addLocationButton(): void {
    if (!this.map) return;

    // Create a Leaflet control for the location button
    const LocationButton = L.Control.extend({
      options: {
        position: 'topright',
      },

      onAdd: () => {
        const button = L.DomUtil.create('button', 'location-button');
        button.innerHTML = '📍';
        button.title = 'Return to my location';
        button.style.cssText = `
          width: 40px;
          height: 40px;
          background: white;
          border: 2px solid rgba(0, 0, 0, 0.2);
          border-radius: 8px;
          cursor: pointer;
          font-size: 20px;
          display: flex;
          align-items: center;
          justify-content: center;
          box-shadow: 0 2px 6px rgba(0, 0, 0, 0.15);
          transition: all 0.2s;
          margin-top: 10px;
        `;

        // Prevent map clicks when clicking button
        L.DomEvent.disableClickPropagation(button);
        L.DomEvent.disableScrollPropagation(button);

        // Hover effect
        button.onmouseenter = () => {
          button.style.background = '#f3f4f6';
          button.style.transform = 'scale(1.05)';
        };
        button.onmouseleave = () => {
          button.style.background = 'white';
          button.style.transform = 'scale(1)';
        };

        // Click handler
        button.onclick = async () => {
          if (this.userLocation) {
            // Already have location, just pan to it
            this.map?.setView([this.userLocation.lat, this.userLocation.lng], 14);
            
            // Re-check restrictions
            try {
              const result = await apiClient.checkLocation(this.userLocation.lat, this.userLocation.lng);
              this.statusIndicator.show({
                canFly: result.can_fly,
                restrictionStatus: result.restriction_status,
                authorizationRequired: result.authorization_required,
                zonesCount: result.zones.length,
              });
            } catch (error) {
              console.error('Failed to check location:', error);
            }
          } else {
            // Try to get location
            button.innerHTML = '⏳';
            button.disabled = true;
            
            try {
              const position = await geolocationService.getCurrentPosition();
              this.userLocation = { lat: position.lat, lng: position.lng };
              this.map?.setView([position.lat, position.lng], 14);
              await this.showUserLocation(position.lat, position.lng);
              button.innerHTML = '📍';
              button.disabled = false;
            } catch (error) {
              console.error('Failed to get location:', error);
              button.innerHTML = '❌';
              setTimeout(() => {
                button.innerHTML = '📍';
                button.disabled = false;
              }, 2000);
              
              // Show error message
              this.showLocationError();
            }
          }
        };

        return button;
      },
    });

    // Add the control to the map
    new LocationButton().addTo(this.map);
  }

  /**
   * Show location error message
   */
  private showLocationError(): void {
    const errorMsg = document.createElement('div');
    errorMsg.style.cssText = `
      position: absolute;
      top: 130px;
      right: 10px;
      z-index: 1000;
      background: #dc2626;
      color: white;
      padding: 10px 16px;
      border-radius: 8px;
      box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15);
      font-size: 13px;
      max-width: 250px;
    `;
    errorMsg.textContent = 'Location access denied. Please enable location permissions.';
    
    const container = document.getElementById(this.containerId);
    container?.appendChild(errorMsg);
    
    setTimeout(() => {
      errorMsg.style.transition = 'opacity 0.3s';
      errorMsg.style.opacity = '0';
      setTimeout(() => errorMsg.remove(), 300);
    }, 3000);
  }

  /**
   * Add layer toggle controls
   */
  private addLayerToggles(): void {
    if (!this.map) return;

    const panel = document.createElement('div');
    panel.id = 'layer-toggles';
    panel.style.cssText = `
      position: absolute;
      top: 80px;
      left: 10px;
      z-index: 1000;
      background: white;
      padding: 12px;
      border-radius: 8px;
      box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15);
      font-family: system-ui, sans-serif;
      min-width: 180px;
    `;

    panel.innerHTML = `
      <div style="font-weight: 600; font-size: 13px; color: #1f2937; margin-bottom: 10px;">
        Map Layers
      </div>
      <div style="display: flex; flex-direction: column; gap: 8px;">
        <label style="display: flex; align-items: center; gap: 8px; cursor: pointer; font-size: 13px; color: #4b5563;">
          <input type="checkbox" id="toggle-zones" checked style="width: 16px; height: 16px; cursor: pointer;">
          <span>🚫 Restriction Zones</span>
        </label>
        <label style="display: flex; align-items: center; gap: 8px; cursor: pointer; font-size: 13px; color: #4b5563;">
          <input type="checkbox" id="toggle-airspace" checked style="width: 16px; height: 16px; cursor: pointer;">
          <span>✈️ Airspace Classes</span>
        </label>
      </div>
    `;

    // Zone toggle handler
    const zonesCheckbox = panel.querySelector('#toggle-zones') as HTMLInputElement;
    zonesCheckbox.onchange = () => {
      this.layersEnabled.zones = zonesCheckbox.checked;
      if (zonesCheckbox.checked) {
        this.map?.addLayer(this.zonesLayer);
      } else {
        this.map?.removeLayer(this.zonesLayer);
      }
    };

    // Airspace toggle handler
    const airspaceCheckbox = panel.querySelector('#toggle-airspace') as HTMLInputElement;
    airspaceCheckbox.onchange = () => {
      this.layersEnabled.airspace = airspaceCheckbox.checked;
      if (airspaceCheckbox.checked) {
        this.map?.addLayer(this.airspaceLayer);
      } else {
        this.map?.removeLayer(this.airspaceLayer);
      }
    };

    const container = document.getElementById(this.containerId);
    container?.appendChild(panel);
  }

  /**
   * Clean up map resources
   */
  destroy(): void {
    if (this.map) {
      this.map.remove();
      this.map = null;
    }
  }
}
