import L from 'leaflet';
import { apiClient } from '../services/api-client.js';
import { geolocationService, GeolocationError } from '../services/geolocation.js';
import { RestrictionStatusIndicator } from './RestrictionStatusIndicator.js';
import { SearchBar } from './SearchBar.js';

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
  private propertyRestrictionsLayer: L.LayerGroup;
  private sssiLayer: L.LayerGroup;
  private currentLocationMarker: L.Marker | null = null;
  private userLocationMarker: L.Marker | null = null;
  private userLocation: { lat: number; lng: number } | null = null;
  private searchBar: SearchBar | null = null;
  private searchResultMarker: L.Marker | null = null;
  private statusIndicator: RestrictionStatusIndicator;
  private layersEnabled = {
    zones: true,
    airspace: true,
    toal: true,
    propertyRestrictions: true,
    sssi: true,
  };

  constructor(private containerId: string) {
    this.zonesLayer = L.layerGroup();
    this.airspaceLayer = L.layerGroup();
    this.toalLayer = L.layerGroup();
    this.propertyRestrictionsLayer = L.layerGroup();
    this.sssiLayer = L.layerGroup();
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

    // Create custom panes for layering (T034)
    this.createCustomPanes();

    // Add layers to map
    this.zonesLayer.addTo(this.map);
    this.airspaceLayer.addTo(this.map);
    this.toalLayer.addTo(this.map);
    this.propertyRestrictionsLayer.addTo(this.map);
    this.sssiLayer.addTo(this.map);

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
    this.initializeSearchBar();

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
      // Clear all layers before loading new data
      // This prevents controlled-airspace zones from being cleared by displayAirspace
      this.zonesLayer.clearLayers();
      this.airspaceLayer.clearLayers();
      this.toalLayer.clearLayers();
      
      // Load zones, airspace, TOAL sites, and property restrictions in parallel
      const [zonesData, airspaceData, toalData] = await Promise.all([
        apiClient.getZones(boundsCoords),
        apiClient.getAirspace(boundsCoords),
        apiClient.getTOALSites(boundsCoords),
      ]);

      this.displayZones(zonesData);
      this.displayAirspace(airspaceData);
      this.displayTOAL(toalData);
      
      // Load property restrictions (T034)
      await this.displayPropertyRestrictions();

      console.log(
        `Loaded ${zonesData.metadata?.result_count || 0} zones, ` +
        `${airspaceData.metadata?.result_count || 0} airspace, ` +
        `${toalData.metadata?.result_count || 0} TOAL sites`
      );
      console.log('🗺️ All map data loaded successfully');
    } catch (error) {
      console.error('❌ Failed to load map data:', error);
    }
  }

  /**
   * Display restriction zones on the map
   */
  private displayZones(data: any): void {
    // Note: Layers are cleared in loadMapData() before this is called
    
    if (!data.features || data.features.length === 0) {
      console.log('⚠️ No zone features to display');
      return;
    }

    console.log(`📍 Rendering ${data.features.length} zone features...`);
    
    let zonesLayerCount = 0;
    let airspaceLayerCount = 0;

    // Add each zone to the map
    data.features.forEach((feature: any) => {
      const zoneType = feature.properties.zone_type;
      const isTemporary = zoneType === 'temporary-restriction';
      const isControlledAirspace = zoneType === 'controlled-airspace';

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

      // Create style object
      const style: any = {
        color: color,
        fillColor: color,
        weight: 2,
        opacity: 0.8,
        fillOpacity: 0.3,
      };

      // Add visual distinction for temporary restrictions (FR-017: NOTAMs)
      // - Dashed border pattern
      // - Pulsing glow animation (via CSS class)
      // - Higher fill opacity
      if (isTemporary) {
        style.className = 'temporary-restriction-zone';
        style.fillOpacity = 0.5; // More visible fill
        style.dashArray = '10, 5'; // Dashed border for visual distinction
        style.weight = 3; // Thicker border for emphasis
      }

      // Controlled airspace gets more subtle styling (like dedicated airspace)
      if (isControlledAirspace) {
        style.opacity = 0.6;
        style.fillOpacity = 0.2;
        style.dashArray = '5, 5'; // Dashed to differentiate from hard restrictions
      }

      // Determine which pane and layer to use
      // BUG FIX: Controlled airspace zones should be added to airspaceLayer, not zonesLayer
      const targetLayer = isControlledAirspace ? this.airspaceLayer : this.zonesLayer;
      const targetPane = 'airspaceRestrictionsPane'; // All use same pane for consistent z-index

      // Create GeoJSON layer
      const geoJsonLayer = L.geoJSON(feature, {
        pane: targetPane,
        style: style,
      });

      // Add click handler to show both zone AND location check info
      geoJsonLayer.on('click', async (e: L.LeafletMouseEvent) => {
        L.DomEvent.stopPropagation(e); // Prevent map click
        
        try {
          // Fetch location check data
          const locationResult = await apiClient.checkLocation(e.latlng.lat, e.latlng.lng);
          
          // Create combined popup with zone AND flight permission info
          const popup = this.createCombinedZonePopup(
            feature.properties, 
            locationResult,
            e.latlng.lat,
            e.latlng.lng
          );
          
          // Show popup at click location
          L.popup()
            .setLatLng(e.latlng)
            .setContent(popup)
            .openOn(this.map!);
            
        } catch (error) {
          console.error('Failed to check location:', error);
          // Fallback to just zone info
          const popup = this.createZonePopup(feature.properties);
          L.popup()
            .setLatLng(e.latlng)
            .setContent(popup)
            .openOn(this.map!);
        }
      });

      // Add to appropriate layer based on zone type
      geoJsonLayer.addTo(targetLayer);
      
      if (isControlledAirspace) {
        airspaceLayerCount++;
      } else {
        zonesLayerCount++;
      }
    });
    
    console.log(`✅ Distributed zones: ${zonesLayerCount} to Restriction Zones layer, ${airspaceLayerCount} to Airspace Classes layer`);
  }

  /**
   * Display airspace classifications on the map
   */
  private displayAirspace(data: any): void {
    // Note: Layers are cleared in loadMapData() before this is called
    // This allows controlled-airspace zones from displayZones() to remain
    
    if (!data.features || data.features.length === 0) {
      console.log('⚠️ No airspace features to display');
      return;
    }

    console.log(`✈️ Rendering ${data.features.length} airspace features...`);

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

      // Create GeoJSON layer with dashed border (T034: assign to airspaceRestrictionsPane)
      const geoJsonLayer = L.geoJSON(feature, {
        pane: 'airspaceRestrictionsPane',
        style: {
          color: color,
          fillColor: color,
          weight: 2,
          opacity: 0.6,
          fillOpacity: 0.1,
          dashArray: '5, 5',  // Dashed line to differentiate from zones
        },
      });

      // Add click handler to show both airspace AND location check info
      geoJsonLayer.on('click', async (e: L.LeafletMouseEvent) => {
        L.DomEvent.stopPropagation(e); // Prevent map click
        
        try {
          // Fetch location check data
          const locationResult = await apiClient.checkLocation(e.latlng.lat, e.latlng.lng);
          
          // Create combined popup with airspace AND flight permission info
          const popup = this.createCombinedAirspacePopup(
            feature.properties, 
            locationResult,
            e.latlng.lat,
            e.latlng.lng
          );
          
          // Show popup at click location
          L.popup()
            .setLatLng(e.latlng)
            .setContent(popup)
            .openOn(this.map!);
            
        } catch (error) {
          console.error('Failed to check location:', error);
          // Fallback to just airspace info
          const popup = this.createAirspacePopup(feature.properties);
          L.popup()
            .setLatLng(e.latlng)
            .setContent(popup)
            .openOn(this.map!);
        }
      });

      // Add to layer
      geoJsonLayer.addTo(this.airspaceLayer);
    });
    
    console.log(`✅ Added ${data.features.length} airspace features to airspaceLayer (pane: airspaceRestrictionsPane)`);
  }

  /**
   * Display TOAL (Take-Off And Landing) sites on the map
   */
  private displayTOAL(data: any): void {
    // Note: Layers are cleared in loadMapData() before this is called

    if (!data.features || data.features.length === 0) {
      return;
    }

    // Add each TOAL site to the map
    data.features.forEach((feature: any) => {
      const [lng, lat] = feature.geometry.coordinates;
      const props = feature.properties;

      // Create marker with confidence badge icon
      const icon = this.createTOALIcon(props);
      const marker = L.marker([lat, lng], { icon });

      // Add click handler to show both TOAL AND location check info
      marker.on('click', async (_e: L.LeafletMouseEvent) => {
        try {
          // Fetch location check data
          const locationResult = await apiClient.checkLocation(lat, lng);
          
          // Create combined popup with TOAL AND flight permission info
          const popup = this.createCombinedTOALPopup(props, locationResult, lat, lng);
          
          // Show popup
          marker.bindPopup(popup, { maxWidth: 350 }).openPopup();
            
        } catch (error) {
          console.error('Failed to check location:', error);
          // Fallback to just TOAL info
          const popup = this.createTOALPopup(props);
          marker.bindPopup(popup).openPopup();
        }
      });

      // Add to layer
      marker.addTo(this.toalLayer);
    });
  }

  /**
   * Create marker icon for TOAL site based on confidence level
   */
  private createTOALIcon(properties: any): L.DivIcon {
    const badge = properties.confidence_badge;
    
    // Color coding by confidence level
    const colors: Record<string, string> = {
      'verified': '#16a34a',         // Green
      'community-reported': '#f59e0b', // Orange
      'unverified': '#6b7280',       // Gray
    };
    
    const icons: Record<string, string> = {
      'verified': '✓',
      'community-reported': 'i',
      'unverified': '?',
    };
    
    const level = badge?.level || 'unverified';
    const color = colors[level] || colors['unverified'];
    const iconText = icons[level] || icons['unverified'];
    
    const html = `
      <div style="
        position: relative;
        width: 32px;
        height: 32px;
        background: ${color};
        border: 3px solid white;
        border-radius: 50%;
        box-shadow: 0 2px 8px rgba(0,0,0,0.3);
        display: flex;
        align-items: center;
        justify-content: center;
        font-weight: bold;
        color: white;
        font-size: 16px;
        cursor: pointer;
      ">
        ${iconText}
      </div>
    `;
    
    return L.divIcon({
      className: 'toal-marker',
      html: html,
      iconSize: [32, 32],
      iconAnchor: [16, 16],
      popupAnchor: [0, -16],
    });
  }

  /**
   * Create popup content for a TOAL site
   */
  private createTOALPopup(properties: any): string {
    const badge = properties.confidence_badge;
    
    // Badge colors
    const badgeColors: Record<string, string> = {
      'verified': '#16a34a',
      'community-reported': '#f59e0b',
      'unverified': '#6b7280',
    };
    
    const level = badge?.level || 'unverified';
    const badgeColor = badgeColors[level] || badgeColors['unverified'];
    const badgeLabel = badge?.label || 'Unverified';
    
    // Format access type
    const accessLabels: Record<string, string> = {
      'public': '🌍 Public Access',
      'private': '🔒 Private',
      'permit-required': '📋 Permit Required',
      'club-only': '🛡️ Club Members Only',
    };
    const accessText = accessLabels[properties.access_type] || properties.access_type;
    
    // Format facilities
    let facilitiesHtml = '';
    if (properties.facilities && Object.keys(properties.facilities).length > 0) {
      const facilityIcons: Record<string, string> = {
        'parking': '🅿️ Parking',
        'shelter': '🏠 Shelter',
        'toilets': '🚻 Toilets',
        'charging': '🔌 Charging',
      };
      const facilityList = Object.entries(properties.facilities)
        .filter(([_, value]) => value)
        .map(([key]) => facilityIcons[key] || key)
        .join(' • ');
      
      if (facilityList) {
        facilitiesHtml = `
          <tr>
            <td colspan="2" style="padding: 8px; background: #f3f4f6; border-radius: 4px; font-size: 11px;">
              ${facilityList}
            </td>
          </tr>
        `;
      }
    }
    
    // Format restrictions
    let restrictionsHtml = '';
    if (properties.restrictions) {
      restrictionsHtml = `
        <tr>
          <td colspan="2" style="padding: 8px; background: #fef3c7; border-radius: 4px; font-size: 11px; color: #92400e;">
            ⚠️ ${properties.restrictions}
          </td>
        </tr>
      `;
    }
    
    return `
      <div style="min-width: 280px; font-family: system-ui, sans-serif;">
        <h3 style="margin: 0 0 8px 0; font-size: 14px; font-weight: 600;">
          ${properties.site_name || 'TOAL Site'}
        </h3>
        <div style="background: ${badgeColor}; color: white; padding: 6px 10px; border-radius: 4px; margin-bottom: 8px; font-weight: 600; font-size: 12px; display: flex; align-items: center; gap: 6px;">
          <span>${badge?.icon || '?'}</span>
          <span>${badgeLabel}</span>
        </div>
        <table style="width: 100%; font-size: 12px;">
          <tr>
            <td style="padding: 4px 0; color: #666;"><strong>Access:</strong></td>
            <td style="padding: 4px 0;">${accessText}</td>
          </tr>
          ${properties.surface_type ? `
            <tr>
              <td style="padding: 4px 0; color: #666;"><strong>Surface:</strong></td>
              <td style="padding: 4px 0;">${properties.surface_type}</td>
            </tr>
          ` : ''}
          ${properties.operating_hours ? `
            <tr>
              <td style="padding: 4px 0; color: #666;"><strong>Hours:</strong></td>
              <td style="padding: 4px 0;">${properties.operating_hours}</td>
            </tr>
          ` : ''}
          ${properties.contact_info ? `
            <tr>
              <td style="padding: 4px 0; color: #666;"><strong>Contact:</strong></td>
              <td style="padding: 4px 0;">${properties.contact_info}</td>
            </tr>
          ` : ''}
          ${facilitiesHtml}
          ${restrictionsHtml}
        </table>
        <div style="margin-top: 8px; padding: 6px 8px; background: #f3f4f6; border-radius: 4px; font-size: 10px; color: #666;">
          Source: ${properties.data_source || 'Unknown'}
          ${properties.last_updated ? ` • Updated: ${new Date(properties.last_updated).toLocaleDateString('en-GB')}` : ''}
        </div>
      </div>
    `;
  }

  /**
   * Create combined popup with TOAL AND location check info
   */
  private createCombinedTOALPopup(
    toalProps: any, 
    locationResult: any, 
    _lat: number, 
    _lng: number
  ): string {
    const badge = toalProps.confidence_badge;
    
    // Badge colors
    const badgeColors: Record<string, string> = {
      'verified': '#16a34a',
      'community-reported': '#f59e0b',
      'unverified': '#6b7280',
    };
    
    const level = badge?.level || 'unverified';
    const badgeColor = badgeColors[level] || badgeColors['unverified'];
    const badgeLabel = badge?.label || 'Unverified';

    // Flight permission status
    const statusColor = locationResult.can_fly ? '#16a34a' : '#dc2626';
    const statusIcon = locationResult.can_fly ? '✓' : '✗';
    const statusText = locationResult.can_fly ? 'YOU CAN FLY HERE' : 'NO FLIGHT PERMITTED';
    
    // Format access type
    const accessLabels: Record<string, string> = {
      'public': '🌍 Public Access',
      'private': '🔒 Private',
      'permit-required': '📋 Permit Required',
      'club-only': '🛡️ Club Members Only',
    };
    const accessText = accessLabels[toalProps.access_type] || toalProps.access_type;
    
    // Format facilities
    let facilitiesHtml = '';
    if (toalProps.facilities && Object.keys(toalProps.facilities).length > 0) {
      const facilityIcons: Record<string, string> = {
        'parking': '🅿️ Parking',
        'shelter': '🏠 Shelter',
        'toilets': '🚻 Toilets',
        'charging': '🔌 Charging',
      };
      const facilityList = Object.entries(toalProps.facilities)
        .filter(([_, value]) => value)
        .map(([key]) => facilityIcons[key] || key)
        .join(' • ');
      
      if (facilityList) {
        facilitiesHtml = `
          <div style="padding: 6px; background: #f9fafb; border-radius: 3px; font-size: 11px; margin-top: 6px;">
            ${facilityList}
          </div>
        `;
      }
    }

    // Restriction zones in this area
    let zonesHtml = '';
    if (locationResult.zones && locationResult.zones.length > 0) {
      zonesHtml = `
        <div style="margin-top: 12px; padding-top: 12px; border-top: 1px solid #e5e7eb;">
          <strong style="color: #666; font-size: 11px;">RESTRICTION ZONES (${locationResult.zones.length}):</strong>
          <ul style="margin: 4px 0; padding-left: 20px; font-size: 11px;">
            ${locationResult.zones.map((zone: any) => `
              <li style="margin: 2px 0;">${zone.restriction_name}</li>
            `).join('')}
          </ul>
        </div>
      `;
    }
    
    return `
      <div style="min-width: 300px; font-family: system-ui, sans-serif;">
        <!-- Flight Permission Status -->
        <div style="background: ${statusColor}; color: white; padding: 10px 12px; border-radius: 4px; margin-bottom: 12px; font-weight: 600; font-size: 13px; text-align: center;">
          ${statusIcon} ${statusText}
        </div>

        <!-- TOAL Site Details -->
        <div style="background: #f9fafb; padding: 12px; border-radius: 4px; margin-bottom: 8px;">
          <h3 style="margin: 0 0 6px 0; font-size: 13px; font-weight: 600; color: #374151;">
            🎯 ${toalProps.site_name || 'TOAL Site'}
          </h3>
          <div style="background: ${badgeColor}; color: white; padding: 4px 8px; border-radius: 3px; margin-bottom: 8px; font-weight: 600; font-size: 11px; display: inline-flex; align-items: center; gap: 4px;">
            <span>${badge?.icon || '?'}</span>
            <span>${badgeLabel}</span>
          </div>
          <table style="width: 100%; font-size: 11px;">
            <tr>
              <td style="padding: 3px 0; color: #666;"><strong>Access:</strong></td>
              <td style="padding: 3px 0;">${accessText}</td>
            </tr>
            ${toalProps.surface_type ? `
              <tr>
                <td style="padding: 3px 0; color: #666;"><strong>Surface:</strong></td>
                <td style="padding: 3px 0;">${toalProps.surface_type}</td>
              </tr>
            ` : ''}
            ${toalProps.operating_hours ? `
              <tr>
                <td style="padding: 3px 0; color: #666;"><strong>Hours:</strong></td>
                <td style="padding: 3px 0;">${toalProps.operating_hours}</td>
              </tr>
            ` : ''}
          </table>
          ${facilitiesHtml}
          ${toalProps.restrictions ? `
            <div style="padding: 6px; background: #fef3c7; border-radius: 3px; font-size: 10px; color: #92400e; margin-top: 6px;">
              ⚠️ ${toalProps.restrictions}
            </div>
          ` : ''}
        </div>

        ${zonesHtml}

        <!-- Source Info -->
        <div style="font-size: 10px; color: #9ca3af; text-align: center; margin-top: 8px;">
          Source: ${toalProps.data_source || 'Unknown'}
          ${toalProps.last_updated ? ` • ${new Date(toalProps.last_updated).toLocaleDateString('en-GB')}` : ''}
        </div>
      </div>
    `;
  }

  /**
   * Create popup content for a restriction zone
   */
  private createZonePopup(properties: any): string {
    const canFly = !['no-fly', 'airport-frz'].includes(properties.zone_type);
    const authRequired = properties.authorization_possible;
    const isTemporary = properties.zone_type === 'temporary-restriction';

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

    // Format dates for temporary restrictions (NOTAM)
    let effectiveDatesHtml = '';
    if (isTemporary && properties.effective_start && properties.effective_end) {
      const startDate = new Date(properties.effective_start).toLocaleString('en-GB', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      });
      const endDate = new Date(properties.effective_end).toLocaleString('en-GB', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      });
      effectiveDatesHtml = `
        <tr style="background: #fff3cd;">
          <td colspan="2" style="padding: 8px; border-radius: 4px;">
            <div style="font-size: 11px; font-weight: 600; color: #856404; margin-bottom: 4px;">
              ⏱️ TEMPORARY RESTRICTION
            </div>
            <div style="font-size: 11px; color: #856404;">
              <strong>Effective:</strong> ${startDate}<br>
              <strong>Expires:</strong> ${endDate}
            </div>
          </td>
        </tr>
      `;
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
          ${effectiveDatesHtml}
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
   * Create combined popup with zone AND location check info
   */
  private createCombinedZonePopup(
    zoneProps: any, 
    locationResult: any, 
    lat: number, 
    lng: number
  ): string {
    const canFly = !['no-fly', 'airport-frz'].includes(zoneProps.zone_type);
    const authRequired = zoneProps.authorization_possible;
    const isTemporary = zoneProps.zone_type === 'temporary-restriction';

    // Determine overall status color (prioritize zone status)
    let statusColor = '';
    let statusText = '';
    
    if (!canFly) {
      statusText = '🚫 NO FLY ZONE';
      statusColor = '#dc2626';
    } else if (authRequired) {
      statusText = '⚠️ AUTHORIZATION REQUIRED';
      statusColor = '#f59e0b';
    } else if (locationResult.can_fly) {
      statusText = '✓ YOU CAN FLY HERE';
      statusColor = '#16a34a';
    } else {
      statusText = '✗ NO FLIGHT PERMITTED';
      statusColor = '#dc2626';
    }

    // Format dates for temporary restrictions (NOTAM)
    let effectiveDatesHtml = '';
    if (isTemporary && zoneProps.effective_start && zoneProps.effective_end) {
      const startDate = new Date(zoneProps.effective_start).toLocaleString('en-GB', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      });
      const endDate = new Date(zoneProps.effective_end).toLocaleString('en-GB', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      });
      effectiveDatesHtml = `
        <div style="background: #fff3cd; padding: 8px; border-radius: 4px; margin-top: 8px;">
          <div style="font-size: 11px; font-weight: 600; color: #856404; margin-bottom: 4px;">
            ⏱️ TEMPORARY RESTRICTION
          </div>
          <div style="font-size: 11px; color: #856404;">
            <strong>Effective:</strong> ${startDate}<br>
            <strong>Expires:</strong> ${endDate}
          </div>
        </div>
      `;
    }

    // Additional zones in the area
    let additionalZonesHtml = '';
    if (locationResult.zones && locationResult.zones.length > 1) {
      const otherZones = locationResult.zones.filter((z: any) => z.restriction_name !== zoneProps.restriction_name);
      if (otherZones.length > 0) {
        additionalZonesHtml = `
          <div style="margin-top: 12px; padding-top: 12px; border-top: 1px solid #e5e7eb;">
            <strong style="color: #666; font-size: 11px;">OTHER ZONES HERE (${otherZones.length}):</strong>
            <ul style="margin: 4px 0; padding-left: 20px; font-size: 11px;">
              ${otherZones.map((zone: any) => `
                <li style="margin: 2px 0;">${zone.restriction_name}</li>
              `).join('')}
            </ul>
          </div>
        `;
      }
    }

    return `
      <div style="min-width: 280px; font-family: system-ui, sans-serif;">
        <!-- Flight Permission Status -->
        <div style="background: ${statusColor}; color: white; padding: 10px 12px; border-radius: 4px; margin-bottom: 12px; font-weight: 600; font-size: 13px; text-align: center;">
          ${statusText}
        </div>

        <!-- Zone Details -->
        <div style="background: #f9fafb; padding: 12px; border-radius: 4px; margin-bottom: 8px;">
          <h3 style="margin: 0 0 8px 0; font-size: 13px; font-weight: 600; color: #374151;">
            ${zoneProps.restriction_name}
          </h3>
          <table style="width: 100%; font-size: 11px;">
            <tr>
              <td style="padding: 3px 0; color: #666;"><strong>Type:</strong></td>
              <td style="padding: 3px 0;">${this.formatZoneType(zoneProps.zone_type)}</td>
            </tr>
            <tr>
              <td style="padding: 3px 0; color: #666;"><strong>Authority:</strong></td>
              <td style="padding: 3px 0;">${zoneProps.authority_source}</td>
            </tr>
            <tr>
              <td style="padding: 3px 0; color: #666;"><strong>Altitude:</strong></td>
              <td style="padding: 3px 0;">${zoneProps.altitude_floor}ft - ${zoneProps.altitude_ceiling}ft</td>
            </tr>
          </table>
          ${effectiveDatesHtml}
          ${zoneProps.description ? `
            <div style="margin-top: 8px; padding: 6px; background: white; border-radius: 3px; font-size: 10px; color: #555; line-height: 1.4;">
              ${zoneProps.description}
            </div>
          ` : ''}
        </div>

        ${additionalZonesHtml}

        <!-- Property Restrictions Section -->
        ${this.createPropertyRestrictionsHtml(locationResult)}

        <!-- Coordinates -->
        <div style="font-size: 10px; color: #9ca3af; text-align: center; margin-top: 8px;">
          ${lat.toFixed(5)}°, ${lng.toFixed(5)}°
        </div>
      </div>
    `;
  }

  /**
   * Create HTML for property restrictions display
   * Shared between zone popup and location check popup
   */
  private createPropertyRestrictionsHtml(locationResult: any): string {
    if (!locationResult.property_restrictions || locationResult.property_restrictions.length === 0) {
      return '';
    }

    const heritageSites = locationResult.property_restrictions.filter((p: any) => p.restriction_category !== 'SSSI');
    const sssiSites = locationResult.property_restrictions.filter((p: any) => p.restriction_category === 'SSSI');
    
    let html = '';

    // Show heritage sites if any
    if (heritageSites.length > 0) {
      html += `
        <div style="margin-top: 12px; padding: 10px; background: #fef3c7; border-left: 3px solid #f59e0b; border-radius: 4px; text-align: left;">
          <strong style="color: #92400e; font-size: 11px;">🏛️ HERITAGE SITES (${heritageSites.length}):</strong>
          <div style="margin-top: 6px; max-height: 120px; overflow-y: auto;">
            ${heritageSites.map((prop: any) => `
              <div style="margin: 4px 0; padding: 6px; background: white; border-radius: 3px; font-size: 10px; text-align: left;">
                <div style="font-weight: 600; color: #1f2937;">${prop.property_name}</div>
                <div style="color: #6b7280; font-size: 9px; margin-top: 1px;">${prop.organization}</div>
                ${prop.policy_summary ? `
                  <div style="margin-top: 3px; font-style: italic; color: #4b5563; line-height: 1.3; font-size: 9px;">
                    ${prop.policy_summary}
                  </div>
                ` : ''}
                ${prop.contact ? `
                  <div style="margin-top: 3px; color: #6b7280; font-size: 9px;">
                    <strong>Contact:</strong> ${prop.contact}
                  </div>
                ` : ''}
              </div>
            `).join('')}
          </div>
        </div>
      `;
    }
    
    // Show SSSI sites if any
    if (sssiSites.length > 0) {
      html += `
        <div style="margin-top: 12px; padding: 10px; background: #fee2e2; border-left: 3px solid #dc2626; border-radius: 4px; text-align: left;">
          <strong style="color: #7f1d1d; font-size: 11px;">🦋 SSSI PROTECTED (${sssiSites.length}):</strong>
          <div style="margin-top: 6px; max-height: 120px; overflow-y: auto;">
            ${sssiSites.map((prop: any) => `
              <div style="margin: 4px 0; padding: 6px; background: white; border-radius: 3px; font-size: 10px; text-align: left;">
                <div style="font-weight: 600; color: #1f2937;">${prop.property_name}</div>
                <div style="color: #6b7280; font-size: 9px; margin-top: 1px;">${prop.organization}</div>
                ${prop.policy_summary ? `
                  <div style="margin-top: 3px; font-style: italic; color: #4b5563; line-height: 1.3; font-size: 9px;">
                    ${prop.policy_summary}
                  </div>
                ` : ''}
                ${prop.contact ? `
                  <div style="margin-top: 3px; color: #6b7280; font-size: 9px;">
                    <strong>Contact:</strong> ${prop.contact}
                  </div>
                ` : ''}
              </div>
            `).join('')}
          </div>
        </div>
      `;
    }

    return html;
  }

  /**
   * Create custom Leaflet panes for layering (T034)
   * - Property restrictions pane (z-index 410) below airspace
   * - SSSI pane (z-index 415) above property restrictions
   * - Airspace restrictions pane (z-index 420) on top
   */
  private createCustomPanes(): void {
    if (!this.map) return;

    // Property restrictions pane (heritage sites, etc.)
    if (!this.map.getPane('propertyRestrictionsPane')) {
      const propertyPane = this.map.createPane('propertyRestrictionsPane');
      propertyPane.style.zIndex = '410';
      console.log('✅ Created propertyRestrictionsPane with z-index 410');
    }

    // SSSI pane (legally protected areas) - above heritage sites
    if (!this.map.getPane('sssiPane')) {
      const sssiPane = this.map.createPane('sssiPane');
      sssiPane.style.zIndex = '415';
      console.log('✅ Created sssiPane with z-index 415');
    }

    // Airspace restrictions pane (controlled airspace, no-fly zones)
    if (!this.map.getPane('airspaceRestrictionsPane')) {
      const airspacePane = this.map.createPane('airspaceRestrictionsPane');
      airspacePane.style.zIndex = '420';
      console.log('✅ Created airspaceRestrictionsPane with z-index 420');
    }
  }

  /**
   * Display property restrictions (heritage sites and SSSI) on the map (T034)
   */
  private async displayPropertyRestrictions(): Promise<void> {
    await this.displayPropertyRestrictionsByCategory('HERITAGE_SITE');
    await this.displayPropertyRestrictionsByCategory('SSSI');
  }

  /**
   * Display property restrictions of a specific category
   */
  private async displayPropertyRestrictionsByCategory(category: string): Promise<void> {
    if (!this.map) return;

    const bounds = this.map.getBounds();
    const boundsCoords = {
      minLon: bounds.getWest(),
      minLat: bounds.getSouth(),
      maxLon: bounds.getEast(),
      maxLat: bounds.getNorth(),
    };

    const isSSSI = category === 'SSSI';
    const targetLayer = isSSSI ? this.sssiLayer : this.propertyRestrictionsLayer;
    const targetPane = isSSSI ? 'sssiPane' : 'propertyRestrictionsPane';

    try {
      const collection = await apiClient.getPropertyRestrictions(boundsCoords, category);

      // Clear existing restrictions for this category
      targetLayer.clearLayers();

      if (!collection.features || collection.features.length === 0) {
        console.log(`⚠️ No ${category} features to display`);
        return;
      }

      console.log(`🏛️ Rendering ${collection.features.length} ${category} features...`);

      // Add each property restriction to the map
      collection.features.forEach((feature) => {
        const props = feature.properties;

        // Style based on category: SSSI = red (no-fly), Heritage = amber (advisory)
        const style = isSSSI
          ? {
              fillColor: '#DC2626',      // Red for SSSI (legally protected)
              fillOpacity: 0.35,
              color: '#991B1B',          // Darker red border
              weight: 2,
              dashArray: undefined,      // Solid line for legally protected
            }
          : {
              fillColor: '#FFA500',      // Amber for heritage (advisory)
              fillOpacity: 0.3,
              color: '#FF8C00',          // Darker amber border
              weight: 2,
              dashArray: '5, 5',         // Dashed line for advisory
            };

        // Create GeoJSON layer
        const geoJsonLayer = L.geoJSON(feature, {
          pane: targetPane,
          style,
        });

        // Add click handler to show property details
        geoJsonLayer.on('click', async (e: L.LeafletMouseEvent) => {
          L.DomEvent.stopPropagation(e);

          try {
            // Fetch location check data
            const locationResult = await apiClient.checkLocation(e.latlng.lat, e.latlng.lng);

            // Create combined popup with property AND flight permission info
            // Filter out the current property from the list to avoid duplication
            const filteredResult = {
              ...locationResult,
              property_restrictions: (locationResult.property_restrictions || []).filter(
                (p: any) => p.property_name !== props.property_name
              )
            };
            
            const popup = this.createCombinedPropertyPopup(
              props,
              filteredResult,
              e.latlng.lat,
              e.latlng.lng
            );

            // Show popup at click location
            L.popup()
              .setLatLng(e.latlng)
              .setContent(popup)
              .openOn(this.map!);

          } catch (error) {
            console.error('Failed to check location:', error);
            // Fallback to just property info
            const popup = this.createPropertyPopup(props);
            L.popup()
              .setLatLng(e.latlng)
              .setContent(popup)
              .openOn(this.map!);
          }
        });

        // Add to appropriate layer
        geoJsonLayer.addTo(targetLayer);
      });
      
      console.log(`✅ Added ${collection.features.length} ${category} features to ${targetPane}`);

    } catch (error) {
      console.error(`Failed to load ${category} restrictions:`, error);
    }
  }

  /**
   * Create popup content for a property restriction
   */
  private createPropertyPopup(properties: any): string {
    const isSSSI = properties.restriction_category === 'SSSI';
    const icon = isSSSI ? '🦋' : '🏛️';
    const bgColor = isSSSI ? '#DC2626' : '#FFA500';
    const label = isSSSI ? 'SSSI Protected Area' : 'Heritage Site';
    
    return `
      <div style="min-width: 280px; font-family: system-ui, sans-serif;">
        <h3 style="margin: 0 0 8px 0; font-size: 14px; font-weight: 600; color: #1f2937;">
          ${properties.property_name}
        </h3>
        <div style="background: ${bgColor}; color: white; padding: 6px 10px; border-radius: 4px; margin-bottom: 8px; font-weight: 600; font-size: 12px;">
          ${icon} ${label}
        </div>
        <table style="width: 100%; font-size: 12px;">
          <tr>
            <td style="padding: 4px 0; color: #666;"><strong>Organization:</strong></td>
            <td style="padding: 4px 0;">${properties.organization}</td>
          </tr>
          ${properties.policy_text ? `
            <tr>
              <td colspan="2" style="padding: 8px; background: #fef3c7; border-radius: 4px; margin-top: 8px; font-size: 11px; color: #92400e;">
                <strong>Policy:</strong><br/>
                ${properties.policy_text.substring(0, 200)}${properties.policy_text.length > 200 ? '...' : ''}
              </td>
            </tr>
          ` : ''}
          ${properties.contact_info ? `
            <tr>
              <td style="padding: 4px 0; color: #666;"><strong>Contact:</strong></td>
              <td style="padding: 4px 0;">${properties.contact_info}</td>
            </tr>
          ` : ''}
          ${properties.policy_effective_date ? `
            <tr>
              <td style="padding: 4px 0; color: #666;"><strong>Effective:</strong></td>
              <td style="padding: 4px 0;">${new Date(properties.policy_effective_date).toLocaleDateString()}</td>
            </tr>
          ` : ''}
        </table>
      </div>
    `;
  }

  /**
   * Create combined popup for property restriction with flight status
   */
  private createCombinedPropertyPopup(
    properties: any,
    locationResult: any,
    lat: number,
    lng: number
  ): string {
    const isSSSI = properties.restriction_category === 'SSSI';
    const icon = isSSSI ? '🦋' : '🏛️';
    const bgColor = isSSSI ? '#DC2626' : '#FFA500';
    const policyBgColor = isSSSI ? '#fee2e2' : '#fef3c7';
    const policyTextColor = isSSSI ? '#7f1d1d' : '#92400e';
    
    // Create property info section
    const propertySection = `
      <div style="background: ${bgColor}; color: white; padding: 10px 12px; margin: -12px -12px 12px -12px; border-radius: 8px 8px 0 0;">
        <h3 style="margin: 0; font-size: 14px; font-weight: 600; text-align: left;">
          ${icon} ${properties.property_name}
        </h3>
        <div style="font-size: 11px; margin-top: 4px; opacity: 0.9; text-align: left;">
          ${properties.organization}
        </div>
      </div>
      
      ${properties.policy_text ? `
        <div style="background: ${policyBgColor}; padding: 10px; border-radius: 4px; margin-bottom: 12px; text-align: left;">
          <div style="font-size: 11px; font-weight: 600; color: ${policyTextColor}; margin-bottom: 4px;">Policy:</div>
          <div style="font-size: 11px; color: ${policyTextColor}; line-height: 1.4;">
            ${properties.policy_text.substring(0, 250)}${properties.policy_text.length > 250 ? '...' : ''}
          </div>
        </div>
      ` : ''}
      
      ${properties.contact_info ? `
        <div style="font-size: 11px; color: #4b5563; margin-bottom: 12px; text-align: left;">
          <strong style="color: #374151;">Contact:</strong> ${properties.contact_info}
        </div>
      ` : ''}
    `;

    // Create flight status section
    const flightSection = this.createLocationCheckPopup(locationResult, lat, lng);

    return `
      <div style="min-width: 320px; max-width: 380px; font-family: system-ui, sans-serif; text-align: left;">
        ${propertySection}
        <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 16px 0;" />
        ${flightSection}
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
  private createLocationCheckPopup(result: any, _lat: number, _lng: number): string {
    // Tri-state logic (T038)
    let statusColor: string;
    let statusIcon: string;
    let statusText: string;

    if (result.flight_status === 'prohibited') {
      statusColor = '#dc2626';
      statusIcon = '🚫';
      statusText = 'NO FLIGHT PERMITTED';
    } else if (result.flight_status === 'check-property-restrictions') {
      statusColor = '#f59e0b';
      statusIcon = '⚠️';
      statusText = 'CHECK PROPERTY POLICY';
    } else if (result.flight_status === 'permitted') {
      statusColor = '#16a34a';
      statusIcon = '✓';
      statusText = 'FLIGHT PERMITTED';
    } else {
      // Legacy logic
      statusColor = result.can_fly ? '#16a34a' : '#dc2626';
      statusIcon = result.can_fly ? '✓' : '✗';
      statusText = result.can_fly ? 'YOU CAN FLY HERE' : 'NO FLIGHT PERMITTED';
    }

    // Property restrictions section (T038)
    let propertyHtml = '';
    if (result.property_restrictions && result.property_restrictions.length > 0) {
      // Group by category
      const heritageSites = result.property_restrictions.filter((p: any) => p.restriction_category !== 'SSSI');
      const sssiSites = result.property_restrictions.filter((p: any) => p.restriction_category === 'SSSI');
      
      // Show heritage sites if any
      if (heritageSites.length > 0) {
        propertyHtml += `
          <div style="margin-top: 12px; padding: 10px; background: #fef3c7; border-left: 3px solid #f59e0b; border-radius: 4px; text-align: left;">
            <strong style="color: #92400e; font-size: 12px;">🏛️ HERITAGE SITES (${heritageSites.length}):</strong>
            <div style="margin-top: 8px; max-height: 150px; overflow-y: auto;">
              ${heritageSites.map((prop: any) => `
                <div style="margin: 6px 0; padding: 8px; background: white; border-radius: 4px; font-size: 11px; text-align: left;">
                  <div style="font-weight: 600; color: #1f2937;">${prop.property_name}</div>
                  <div style="color: #6b7280; margin-top: 2px;">${prop.organization}</div>
                  ${prop.policy_summary ? `
                    <div style="margin-top: 4px; font-style: italic; color: #4b5563; line-height: 1.4;">
                      ${prop.policy_summary}
                    </div>
                  ` : ''}
                  ${prop.contact ? `
                    <div style="margin-top: 4px; color: #6b7280;">
                      <strong>Contact:</strong> ${prop.contact}
                    </div>
                  ` : ''}
                </div>
              `).join('')}
            </div>
          </div>
        `;
      }
      
      // Show SSSI sites if any
      if (sssiSites.length > 0) {
        propertyHtml += `
          <div style="margin-top: 12px; padding: 10px; background: #fee2e2; border-left: 3px solid #dc2626; border-radius: 4px; text-align: left;">
            <strong style="color: #7f1d1d; font-size: 12px;">🦋 SSSI PROTECTED AREAS (${sssiSites.length}):</strong>
            <div style="margin-top: 8px; max-height: 150px; overflow-y: auto;">
              ${sssiSites.map((prop: any) => `
                <div style="margin: 6px 0; padding: 8px; background: white; border-radius: 4px; font-size: 11px; text-align: left;">
                  <div style="font-weight: 600; color: #1f2937;">${prop.property_name}</div>
                  <div style="color: #6b7280; margin-top: 2px;">${prop.organization}</div>
                  ${prop.policy_summary ? `
                    <div style="margin-top: 4px; font-style: italic; color: #4b5563; line-height: 1.4;">
                      ${prop.policy_summary}
                    </div>
                  ` : ''}
                  ${prop.contact ? `
                    <div style="margin-top: 4px; color: #6b7280;">
                      <strong>Contact:</strong> ${prop.contact}
                    </div>
                  ` : ''}
                </div>
              `).join('')}
            </div>
          </div>
        `;
      }
    }

    let zonesHtml = '';
    if (result.zones && result.zones.length > 0) {
      zonesHtml = `
        <div style="margin-top: 12px; text-align: left;">
          <strong style="color: #6b7280; font-size: 11px;">RESTRICTION ZONES (${result.zones.length}):</strong>
          <ul style="margin: 6px 0; padding-left: 20px; font-size: 11px; color: #374151;">
            ${result.zones.map((zone: any) => `
              <li style="margin: 3px 0; line-height: 1.4;">${zone.restriction_name}</li>
            `).join('')}
          </ul>
        </div>
      `;
    }

    let toalHtml = '';
    if (result.nearest_toal) {
      const distanceKm = (result.nearest_toal.distance_meters / 1000).toFixed(2);
      toalHtml = `
        <div style="margin-top: 12px; padding: 10px; background: #f3f4f6; border-radius: 4px; text-align: left;">
          <strong style="color: #6b7280; font-size: 11px; display: block; margin-bottom: 4px;">NEAREST TOAL SITE:</strong>
          <div style="font-size: 12px; color: #374151;">
            📍 ${result.nearest_toal.site_name}
          </div>
          <div style="color: #6b7280; font-size: 11px; margin-top: 4px;">
            Distance: ${distanceKm} km
          </div>
        </div>
      `;
    }

    // Status description
    let statusDescription = '';
    if (result.flight_status) {
      if (result.flight_status === 'prohibited') {
        statusDescription = 'Airspace restrictions prevent flight at this location.';
      } else if (result.flight_status === 'check-property-restrictions') {
        statusDescription = 'Heritage site restrictions may apply. Contact property managers.';
      } else if (result.flight_status === 'permitted') {
        statusDescription = 'No restrictions detected. Fly safely!';
      }
    } else {
      statusDescription = this.formatStatus(result.restriction_status);
    }

    return `
      <div style="min-width: 300px; font-family: system-ui, sans-serif; text-align: left;">
        <div style="background: ${statusColor}; color: white; padding: 14px 12px; margin: -8px -8px 12px -8px; border-radius: 4px 4px 0 0; text-align: center;">
          <div style="font-size: 24px; margin-bottom: 6px;">${statusIcon}</div>
          <div style="font-weight: 600; font-size: 13px; letter-spacing: 0.5px;">${statusText}</div>
        </div>
        <div style="margin-bottom: 12px; padding: 8px 0; text-align: left;">
          <div style="font-size: 11px; color: #6b7280; font-weight: 600; margin-bottom: 4px;">Status:</div>
          <div style="font-size: 12px; color: #374151; line-height: 1.5;">${statusDescription}</div>
        </div>
        ${result.authorization_required ? `
          <div style="background: #fef3c7; border-left: 3px solid #f59e0b; padding: 10px; margin-bottom: 12px; border-radius: 4px; text-align: left;">
            <div style="font-size: 11px; color: #92400e; line-height: 1.4;">
              ⚠️ Authorization required from local authority
            </div>
          </div>
        ` : ''}
        ${propertyHtml}
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
   * Create combined popup with airspace AND location check info
   */
  private createCombinedAirspacePopup(
    airspaceProps: any, 
    locationResult: any, 
    lat: number, 
    lng: number
  ): string {
    const icaoClass = airspaceProps.class_designation;
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

    // Flight permission status
    const statusColor = locationResult.can_fly ? '#16a34a' : '#dc2626';
    const statusIcon = locationResult.can_fly ? '✓' : '✗';
    const statusText = locationResult.can_fly ? 'YOU CAN FLY HERE' : 'NO FLIGHT PERMITTED';

    // Zones list
    let zonesHtml = '';
    if (locationResult.zones && locationResult.zones.length > 0) {
      zonesHtml = `
        <div style="margin-top: 12px; padding-top: 12px; border-top: 1px solid #e5e7eb;">
          <strong style="color: #666; font-size: 11px;">RESTRICTION ZONES (${locationResult.zones.length}):</strong>
          <ul style="margin: 4px 0; padding-left: 20px; font-size: 11px;">
            ${locationResult.zones.map((zone: any) => `
              <li style="margin: 2px 0;">${zone.restriction_name}</li>
            `).join('')}
          </ul>
        </div>
      `;
    }

    return `
      <div style="min-width: 280px; font-family: system-ui, sans-serif;">
        <!-- Flight Permission Status -->
        <div style="background: ${statusColor}; color: white; padding: 10px 12px; border-radius: 4px; margin-bottom: 12px; font-weight: 600; font-size: 13px; text-align: center;">
          ${statusIcon} ${statusText}
        </div>

        <!-- Airspace Info -->
        <div style="background: #f9fafb; padding: 12px; border-radius: 4px; margin-bottom: 12px;">
          <h3 style="margin: 0 0 8px 0; font-size: 13px; font-weight: 600; color: #374151;">
            ${airspaceProps.airspace_name || 'Airspace'}
          </h3>
          <div style="background: ${color}; color: white; padding: 4px 8px; border-radius: 3px; margin-bottom: 8px; font-weight: 600; font-size: 11px; display: inline-block;">
            ✈️ Class ${icaoClass} Airspace
          </div>
          <table style="width: 100%; font-size: 11px;">
            <tr>
              <td style="padding: 3px 0; color: #666;"><strong>Authority:</strong></td>
              <td style="padding: 3px 0;">${airspaceProps.controlling_authority || 'N/A'}</td>
            </tr>
            <tr>
              <td style="padding: 3px 0; color: #666;"><strong>Floor:</strong></td>
              <td style="padding: 3px 0;">${airspaceProps.altitude_floor || 0}ft</td>
            </tr>
            <tr>
              <td style="padding: 3px 0; color: #666;"><strong>Ceiling:</strong></td>
              <td style="padding: 3px 0;">${airspaceProps.altitude_ceiling || 'Unlimited'}ft</td>
            </tr>
          </table>
          <div style="margin-top: 6px; padding: 6px; background: white; border-radius: 3px; font-size: 10px; color: #555;">
            ℹ️ ${this.getAirspaceClassDescription(icaoClass)}
          </div>
        </div>

        ${zonesHtml}

        <!-- Coordinates -->
        <div style="font-size: 10px; color: #9ca3af; text-align: center; margin-top: 8px;">
          ${lat.toFixed(5)}°, ${lng.toFixed(5)}°
        </div>
      </div>
    `;
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
      
      // Show status indicator with tri-state support (T037)
      this.statusIndicator.show({
        flightStatus: result.flight_status,
        airspaceClear: result.airspace_clear,
        propertyAdvisory: result.property_advisory,
        propertyRestrictions: result.property_restrictions,
        // Legacy fields for backward compatibility
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
              // Show status indicator with tri-state support (T037)
              this.statusIndicator.show({
                flightStatus: result.flight_status,
                airspaceClear: result.airspace_clear,
                propertyAdvisory: result.property_advisory,
                propertyRestrictions: result.property_restrictions,
                // Legacy fields for backward compatibility
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
        <label style="display: flex; align-items: center; gap: 8px; cursor: pointer; font-size: 13px; color: #4b5563;">
          <input type="checkbox" id="toggle-toal" checked style="width: 16px; height: 16px; cursor: pointer;">
          <span>🎯 TOAL Sites</span>
        </label>
        <label style="display: flex; align-items: center; gap: 8px; cursor: pointer; font-size: 13px; color: #4b5563;">
          <input type="checkbox" id="toggle-property-restrictions" checked style="width: 16px; height: 16px; cursor: pointer;">
          <span>🏛️ Heritage Sites</span>
        </label>
        <label style="display: flex; align-items: center; gap: 8px; cursor: pointer; font-size: 13px; color: #4b5563;">
          <input type="checkbox" id="toggle-sssi" checked style="width: 16px; height: 16px; cursor: pointer;">
          <span>🦋 SSSI Protected</span>
        </label>
      </div>
    `;

    // Zone toggle handler
    const zonesCheckbox = panel.querySelector('#toggle-zones') as HTMLInputElement;
    zonesCheckbox.onchange = () => {
      this.layersEnabled.zones = zonesCheckbox.checked;
      if (zonesCheckbox.checked) {
        this.map?.addLayer(this.zonesLayer);
        this.loadMapData(); // Reload data when layer is turned back on
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
        this.loadMapData(); // Reload data when layer is turned back on
      } else {
        this.map?.removeLayer(this.airspaceLayer);
      }
    };

    // TOAL toggle handler
    const toalCheckbox = panel.querySelector('#toggle-toal') as HTMLInputElement;
    toalCheckbox.onchange = () => {
      this.layersEnabled.toal = toalCheckbox.checked;
      if (toalCheckbox.checked) {
        this.map?.addLayer(this.toalLayer);
        this.loadMapData(); // Reload data when layer is turned back on
      } else {
        this.map?.removeLayer(this.toalLayer);
      }
    };

    // Property restrictions (heritage sites) toggle handler (T035)
    const propertyCheckbox = panel.querySelector('#toggle-property-restrictions') as HTMLInputElement;
    propertyCheckbox.onchange = () => {
      this.layersEnabled.propertyRestrictions = propertyCheckbox.checked;
      if (propertyCheckbox.checked) {
        this.map?.addLayer(this.propertyRestrictionsLayer);
        this.loadMapData(); // Reload data when layer is turned back on
      } else {
        this.map?.removeLayer(this.propertyRestrictionsLayer);
      }
    };

    // SSSI toggle handler
    const sssiCheckbox = panel.querySelector('#toggle-sssi') as HTMLInputElement;
    sssiCheckbox.onchange = () => {
      this.layersEnabled.sssi = sssiCheckbox.checked;
      if (sssiCheckbox.checked) {
        this.map?.addLayer(this.sssiLayer);
        this.loadMapData(); // Reload data when layer is turned back on
      } else {
        this.map?.removeLayer(this.sssiLayer);
      }
    };

    // Prevent click-through to map (fix for checkbox clicks triggering map location checks)
    panel.addEventListener('click', (e: MouseEvent) => {
      e.stopPropagation();
    });
    panel.addEventListener('dblclick', (e: MouseEvent) => {
      e.stopPropagation();
    });

    const container = document.getElementById(this.containerId);
    container?.appendChild(panel);
  }

  /**
   * Initialize search bar for address/postcode search
   */
  private initializeSearchBar(): void {
    // Create search bar container in the map
    const searchContainer = document.createElement('div');
    searchContainer.id = 'search-bar-container';
    searchContainer.style.cssText = `
      position: absolute;
      top: 10px;
      left: 50%;
      transform: translateX(-50%);
      z-index: 1000;
      width: 90%;
      max-width: 500px;
    `;
    
    const container = document.getElementById(this.containerId);
    container?.appendChild(searchContainer);
    
    // Initialize SearchBar component
    this.searchBar = new SearchBar('search-bar-container');
    
    // Set up callback for when a location is selected
    this.searchBar.onSelect((lat, lon, displayName) => {
      if (!this.map) return;
      
      // Fly to the selected location
      this.map.flyTo([lat, lon], 16, {
        duration: 1.5,
      });
      
      // Clear previous search result marker
      if (this.searchResultMarker) {
        this.searchResultMarker.remove();
      }
      
      // Create marker for search result
      const icon = L.divIcon({
        className: 'search-result-marker',
        html: `
          <div style="
            width: 40px;
            height: 40px;
            background: #3b82f6;
            border: 3px solid white;
            border-radius: 50%;
            box-shadow: 0 2px 8px rgba(0,0,0,0.3);
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: 20px;
            color: white;
            animation: pulse 2s infinite;
          ">
            📍
          </div>
        `,
        iconSize: [40, 40],
        iconAnchor: [20, 20],
        popupAnchor: [0, -20],
      });
      
      this.searchResultMarker = L.marker([lat, lon], { icon });
      this.searchResultMarker.addTo(this.map);
      this.searchResultMarker.bindPopup(`
        <div style="font-family: system-ui, sans-serif; min-width: 200px;">
          <h3 style="margin: 0 0 8px 0; font-size: 14px; font-weight: 600;">
            Search Result
          </h3>
          <p style="margin: 0; font-size: 12px; color: #666;">
            ${displayName}
          </p>
        </div>
      `).openPopup();
      
      // Auto-check restriction status at this location
      this.checkLocation(lat, lon);
    });
  }

  /**
   * Clean up map resources
   */
  destroy(): void {
    if (this.searchBar) {
      this.searchBar.destroy();
      this.searchBar = null;
    }
    if (this.map) {
      this.map.remove();
      this.map = null;
    }
  }
}
