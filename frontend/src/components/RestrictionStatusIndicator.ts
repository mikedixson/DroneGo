/**
 * RestrictionStatusIndicator Component
 * 
 * Displays red/yellow/green visual indicator for flight permission status
 * with clear text explanation for the user.
 * 
 * Updated for tri-state logic (T037):
 * - Red: prohibited (airspace restrictions)
 * - Amber: check-property-restrictions (heritage sites, etc.)
 * - Green: permitted (clear to fly)
 */

export interface StatusIndicatorConfig {
  // Tri-state fields (new)
  flightStatus?: 'permitted' | 'prohibited' | 'check-property-restrictions';
  airspaceClear?: boolean;
  propertyAdvisory?: boolean;
  propertyRestrictions?: Array<{
    property_name: string;
    organization: string;
    policy_summary: string;
    contact: string;
  }>;
  
  // Legacy fields (deprecated, optional for backward compatibility)
  canFly?: boolean;
  restrictionStatus?: 'permitted' | 'controlled' | 'no-fly' | 'unknown';
  authorizationRequired?: boolean;
  zonesCount?: number;
}

export class RestrictionStatusIndicator {
  private element: HTMLElement | null = null;

  constructor(private containerId: string) {}

  /**
   * Create and display the status indicator
   */
  show(config: StatusIndicatorConfig): void {
    const container = document.getElementById(this.containerId);
    if (!container) {
      console.error(`Container ${this.containerId} not found`);
      return;
    }

    // Remove existing indicator
    if (this.element) {
      this.element.remove();
    }

    // Determine status display
    const { icon, color, backgroundColor, text, subtext } = this.getStatusDisplay(config);

    // Create indicator element
    this.element = document.createElement('div');
    this.element.id = 'restriction-status-indicator';
    this.element.style.cssText = `
      position: absolute;
      top: 80px;
      left: 50%;
      transform: translateX(-50%);
      z-index: 1000;
      background: white;
      border-radius: 12px;
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
      padding: 16px 24px;
      display: flex;
      align-items: center;
      gap: 16px;
      min-width: 320px;
      animation: slideDown 0.3s ease-out;
    `;

    this.element.innerHTML = `
      <style>
        @keyframes slideDown {
          from {
            opacity: 0;
            transform: translate(-50%, -20px);
          }
          to {
            opacity: 1;
            transform: translate(-50%, 0);
          }
        }
      </style>
      <div style="
        width: 48px;
        height: 48px;
        border-radius: 50%;
        background: ${backgroundColor};
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 24px;
        flex-shrink: 0;
      ">
        ${icon}
      </div>
      <div style="flex: 1;">
        <div style="
          font-size: 16px;
          font-weight: 600;
          color: ${color};
          margin-bottom: 4px;
        ">
          ${text}
        </div>
        <div style="
          font-size: 13px;
          color: #6b7280;
          line-height: 1.4;
        ">
          ${subtext}
        </div>
      </div>
    `;

    container.appendChild(this.element);

    // Auto-hide after 8 seconds
    setTimeout(() => {
      this.hide();
    }, 8000);
  }

  /**
   * Hide the status indicator
   */
  hide(): void {
    if (this.element) {
      this.element.style.animation = 'fadeOut 0.3s ease-out';
      setTimeout(() => {
        if (this.element) {
          this.element.remove();
          this.element = null;
        }
      }, 300);
    }
  }

  /**
   * Get display configuration for status (T037: Tri-state support)
   */
  private getStatusDisplay(config: StatusIndicatorConfig): {
    icon: string;
    color: string;
    backgroundColor: string;
    text: string;
    subtext: string;
  } {
    // Tri-state logic (new)
    if (config.flightStatus) {
      // PROHIBITED: Airspace restrictions prevent flight
      if (config.flightStatus === 'prohibited') {
        return {
          icon: '🚫',
          color: '#dc2626',
          backgroundColor: '#fee2e2',
          text: 'NO FLIGHT PERMITTED',
          subtext: 'Airspace restrictions prevent flight at this location.',
        };
      }

      // CHECK PROPERTY RESTRICTIONS: Heritage sites with policies
      if (config.flightStatus === 'check-property-restrictions') {
        const propertyCount = config.propertyRestrictions?.length || 0;
        let subtextDetails = '';
        
        if (config.propertyRestrictions && propertyCount > 0) {
          // Show first property restriction details
          const firstProperty = config.propertyRestrictions[0];
          subtextDetails = `<strong>${firstProperty.property_name}</strong> - ${firstProperty.organization}`;
          
          if (propertyCount > 1) {
            subtextDetails += ` <em>(+${propertyCount - 1} more)</em>`;
          }
        } else {
          subtextDetails = 'Heritage site restrictions may apply.';
        }

        return {
          icon: '⚠️',
          color: '#f59e0b',
          backgroundColor: '#fef3c7',
          text: 'CHECK PROPERTY POLICY',
          subtext: subtextDetails,
        };
      }

      // PERMITTED: Clear to fly
      if (config.flightStatus === 'permitted') {
        return {
          icon: '✓',
          color: '#16a34a',
          backgroundColor: '#dcfce7',
          text: 'FLIGHT PERMITTED',
          subtext: 'No restrictions at this location. Fly safely!',
        };
      }
    }

    // Legacy logic (backward compatibility)
    const { canFly, restrictionStatus, authorizationRequired, zonesCount = 0 } = config;

    // No-fly zone (red)
    if (canFly === false || restrictionStatus === 'no-fly') {
      return {
        icon: '🚫',
        color: '#dc2626',
        backgroundColor: '#fee2e2',
        text: 'NO FLY ZONE',
        subtext: zonesCount > 0
          ? `You are in ${zonesCount} restricted zone${zonesCount > 1 ? 's' : ''}. Flight is prohibited.`
          : 'Flight is prohibited at this location.',
      };
    }

    // Controlled airspace requiring authorization (yellow/orange)
    if (authorizationRequired || restrictionStatus === 'controlled') {
      return {
        icon: '⚠️',
        color: '#f59e0b',
        backgroundColor: '#fef3c7',
        text: 'AUTHORIZATION REQUIRED',
        subtext: zonesCount > 0
          ? `${zonesCount} restriction zone${zonesCount > 1 ? 's' : ''} present. Contact local authority for permission.`
          : 'Authorization needed from local authority.',
      };
    }

    // Permitted (green)
    if (canFly === true && restrictionStatus === 'permitted') {
      return {
        icon: '✓',
        color: '#16a34a',
        backgroundColor: '#dcfce7',
        text: 'FLIGHT PERMITTED',
        subtext: 'No restrictions at this location. Fly safely!',
      };
    }

    // Unknown status (gray)
    return {
      icon: '❓',
      color: '#6b7280',
      backgroundColor: '#f3f4f6',
      text: 'STATUS UNKNOWN',
      subtext: 'Unable to determine restriction status. Check local regulations.',
    };
  }
}
