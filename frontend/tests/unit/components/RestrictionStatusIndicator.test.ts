import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { RestrictionStatusIndicator, StatusIndicatorConfig } from '../../../src/components/RestrictionStatusIndicator';

/**
 * Restriction Status Indicator Test Suite
 * 
 * SAFETY-CRITICAL: Tests visual status display for flight permissions
 * Red (prohibited), Yellow (authorization required), Green (permitted)
 * 
 * Target Coverage: 90% - focuses on safety-critical display logic
 */

describe('RestrictionStatusIndicator - SAFETY CRITICAL', () => {
  let container: HTMLElement;
  let indicator: RestrictionStatusIndicator;

  beforeEach(() => {
    // Create container for indicator
    container = document.createElement('div');
    container.id = 'status-indicator';
    document.body.appendChild(container);

    indicator = new RestrictionStatusIndicator('status-indicator');
  });

  afterEach(() => {
    document.body.removeChild(container);
    vi.restoreAllMocks();
  });

  describe('show - Safety-Critical Status Display', () => {
    it('should display no-fly zone status (red) when canFly is false', () => {
      const config: StatusIndicatorConfig = {
        canFly: false,
        restrictionStatus: 'no-fly',
        authorizationRequired: false,
        zonesCount: 1,
      };

      indicator.show(config);

      const statusElement = container.querySelector('#restriction-status-indicator');
      expect(statusElement).not.toBeNull();
      expect(statusElement?.textContent).toContain('NO FLY ZONE');
      expect(statusElement?.textContent).toContain('prohibited');
    });

    it('should display authorization-required status (yellow) when authorization needed', () => {
      const config: StatusIndicatorConfig = {
        canFly: true,
        restrictionStatus: 'controlled',
        authorizationRequired: true,
        zonesCount: 1,
      };

      indicator.show(config);

      const statusElement = container.querySelector('#restriction-status-indicator');
      expect(statusElement).not.toBeNull();
      expect(statusElement?.textContent).toContain('AUTHORIZATION REQUIRED');
      expect(statusElement?.textContent?.toLowerCase()).toContain('authorization');
    });

    it('should display permitted status (green) when flight is allowed', () => {
      const config: StatusIndicatorConfig = {
        canFly: true,
        restrictionStatus: 'permitted',
        authorizationRequired: false,
        zonesCount: 0,
      };

      indicator.show(config);

      const statusElement = container.querySelector('#restriction-status-indicator');
      expect(statusElement).not.toBeNull();
      expect(statusElement?.textContent).toContain('FLIGHT PERMITTED');
      expect(statusElement?.textContent).toContain('No restrictions');
    });

    it('should show zone count in message for multiple zones', () => {
      const config: StatusIndicatorConfig = {
        canFly: false,
        restrictionStatus: 'no-fly',
        authorizationRequired: false,
        zonesCount: 3,
      };

      indicator.show(config);

      const statusElement = container.querySelector('#restriction-status-indicator');
      expect(statusElement?.textContent).toContain('3');
      expect(statusElement?.textContent).toContain('zones');
    });

    it('should replace existing indicator when shown multiple times', () => {
      const config1: StatusIndicatorConfig = {
        canFly: true,
        restrictionStatus: 'permitted',
        authorizationRequired: false,
        zonesCount: 0,
      };

      const config2: StatusIndicatorConfig = {
        canFly: false,
        restrictionStatus: 'no-fly',
        authorizationRequired: false,
        zonesCount: 1,
      };

      indicator.show(config1);
      const indicators1 = container.querySelectorAll('#restriction-status-indicator');
      expect(indicators1.length).toBe(1);

      indicator.show(config2);
      const indicators2 = container.querySelectorAll('#restriction-status-indicator');
      expect(indicators2.length).toBe(1);
      expect(indicators2[0].textContent).toContain('NO FLY ZONE');
    });

    it('should handle unknown status gracefully', () => {
      const config: StatusIndicatorConfig = {
        canFly: false,
        restrictionStatus: 'unknown',
        authorizationRequired: false,
        zonesCount: 0,
      };

      indicator.show(config);

      const statusElement = container.querySelector('#restriction-status-indicator');
      expect(statusElement).not.toBeNull();
      // Unknown status with canFly=false still shows as prohibited
      expect(statusElement?.textContent).toContain('prohibited');
    });

    it('should handle missing container gracefully', () => {
      const badIndicator = new RestrictionStatusIndicator('non-existent-container');

      expect(() => {
        badIndicator.show({
          canFly: true,
          restrictionStatus: 'permitted',
          authorizationRequired: false,
          zonesCount: 0,
        });
      }).not.toThrow();
    });
  });

  describe('hide', () => {
    it('should remove indicator from DOM after animation', async () => {
      vi.useFakeTimers();

      const config: StatusIndicatorConfig = {
        canFly: true,
        restrictionStatus: 'permitted',
        authorizationRequired: false,
        zonesCount: 0,
      };

      indicator.show(config);
      let statusElement = container.querySelector('#restriction-status-indicator');
      expect(statusElement).not.toBeNull();

      indicator.hide();

      // Wait for fade animation (300ms)
      vi.advanceTimersByTime(300);

      statusElement = container.querySelector('#restriction-status-indicator');
      expect(statusElement).toBeNull();

      vi.useRealTimers();
    });

    it('should handle hide when no indicator exists', () => {
      expect(() => {
        indicator.hide();
      }).not.toThrow();
    });
  });

  describe('Auto-hide Behavior', () => {
    it('should auto-hide after 8 seconds', async () => {
      vi.useFakeTimers();

      const config: StatusIndicatorConfig = {
        canFly: true,
        restrictionStatus: 'permitted',
        authorizationRequired: false,
        zonesCount: 0,
      };

      indicator.show(config);

      let statusElement = container.querySelector('#restriction-status-indicator');
      expect(statusElement).not.toBeNull();

      // Fast-forward 8 seconds
      vi.advanceTimersByTime(8000);

      // Wait for fade animation
      vi.advanceTimersByTime(300);

      statusElement = container.querySelector('#restriction-status-indicator');
      expect(statusElement).toBeNull();

      vi.useRealTimers();
    });
  });

  describe('Display Content', () => {
    it('should show red emoji for no-fly zones', () => {
      const config: StatusIndicatorConfig = {
        canFly: false,
        restrictionStatus: 'no-fly',
        authorizationRequired: false,
        zonesCount: 1,
      };

      indicator.show(config);

      const statusElement = container.querySelector('#restriction-status-indicator');
      expect(statusElement?.textContent).toContain('🚫');
    });

    it('should show warning emoji for authorization required', () => {
      const config: StatusIndicatorConfig = {
        canFly: true,
        restrictionStatus: 'controlled',
        authorizationRequired: true,
        zonesCount: 1,
      };

      indicator.show(config);

      const statusElement = container.querySelector('#restriction-status-indicator');
      expect(statusElement?.textContent).toContain('⚠️');
    });

    it('should show checkmark for permitted zones', () => {
      const config: StatusIndicatorConfig = {
        canFly: true,
        restrictionStatus: 'permitted',
        authorizationRequired: false,
        zonesCount: 0,
      };

      indicator.show(config);

      const statusElement = container.querySelector('#restriction-status-indicator');
      expect(statusElement?.textContent).toContain('✓');
    });
  });

  describe('Edge Cases', () => {
    it('should handle zero zones count', () => {
      const config: StatusIndicatorConfig = {
        canFly: false,
        restrictionStatus: 'no-fly',
        authorizationRequired: false,
        zonesCount: 0,
      };

      indicator.show(config);

      const statusElement = container.querySelector('#restriction-status-indicator');
      expect(statusElement).not.toBeNull();
      expect(statusElement?.textContent).toContain('prohibited');
    });

    it('should handle single zone count (singular text)', () => {
      const config: StatusIndicatorConfig = {
        canFly: false,
        restrictionStatus: 'no-fly',
        authorizationRequired: false,
        zonesCount: 1,
      };

      indicator.show(config);

      const statusElement = container.querySelector('#restriction-status-indicator');
      expect(statusElement?.textContent).toMatch(/1 restricted zone(?!s)/);
    });

    it('should handle large zone count', () => {
      const config: StatusIndicatorConfig = {
        canFly: false,
        restrictionStatus: 'no-fly',
        authorizationRequired: false,
        zonesCount: 50,
      };

      indicator.show(config);

      const statusElement = container.querySelector('#restriction-status-indicator');
      expect(statusElement?.textContent).toContain('50');
      expect(statusElement?.textContent).toContain('zones');
    });

    it('should handle rapid show calls without leaking elements', () => {
      for (let i = 0; i < 10; i++) {
        indicator.show({
          canFly: true,
          restrictionStatus: 'permitted',
          authorizationRequired: false,
          zonesCount: 0,
        });
      }

      // Should only have one indicator
      const indicators = container.querySelectorAll('#restriction-status-indicator');
      expect(indicators.length).toBe(1);
    });
  });

  describe('Status Priority Logic', () => {
    it('should prioritize no-fly over authorization-required', () => {
      const config: StatusIndicatorConfig = {
        canFly: false,
        restrictionStatus: 'no-fly',
        authorizationRequired: true,
        zonesCount: 2,
      };

      indicator.show(config);

      const statusElement = container.querySelector('#restriction-status-indicator');
      expect(statusElement?.textContent).toContain('NO FLY ZONE');
      expect(statusElement?.textContent).not.toContain('AUTHORIZATION REQUIRED');
    });

    it('should show authorization when canFly is true but auth required', () => {
      const config: StatusIndicatorConfig = {
        canFly: true,
        restrictionStatus: 'controlled',
        authorizationRequired: true,
        zonesCount: 1,
      };

      indicator.show(config);

      const statusElement = container.querySelector('#restriction-status-indicator');
      expect(statusElement?.textContent).toContain('AUTHORIZATION REQUIRED');
      expect(statusElement?.textContent).not.toContain('NO FLY ZONE');
    });
  });
});

/**
 * T021: Tri-State Display Tests (User Story 1)
 * 
 * Tests tri-state flight status display for property restrictions:
 * - Red indicator: flight_status='prohibited' (airspace restricted)
 * - Green indicator: flight_status='permitted' (both clear)
 * - Amber indicator: flight_status='check-property-restrictions' (property advisory)
 * 
 * Verifies correct colors, messages, and property advisory details.
 */
describe('RestrictionStatusIndicator - Tri-State Display (User Story 1)', () => {
  let container: HTMLElement;
  let indicator: RestrictionStatusIndicator;

  beforeEach(() => {
    container = document.createElement('div');
    container.id = 'status-indicator-tristate';
    document.body.appendChild(container);

    indicator = new RestrictionStatusIndicator('status-indicator-tristate');
  });

  afterEach(() => {
    if (container && container.parentNode) {
      document.body.removeChild(container);
    }
    vi.restoreAllMocks();
  });

  describe('State 1: Prohibited (Red)', () => {
    it('should display red indicator for flight_status="prohibited"', () => {
      const config = {
        flight_status: 'prohibited',
        airspace_clear: false,
        property_advisory: false,
        zones: [{ zone_id: '1', zone_type: 'no-fly', restriction_name: 'Test No-Fly' }],
        property_restrictions: [],
        message: 'Flight prohibited due to airspace restrictions',
      };

      indicator.showTriState(config);

      const statusElement = container.querySelector('#restriction-status-indicator');
      expect(statusElement).not.toBeNull();
      
      // Should have red indicator class/styling
      expect(statusElement?.classList.contains('status-prohibited') || 
             statusElement?.classList.contains('status-red')).toBe(true);
      
      expect(statusElement?.textContent).toContain('prohibited');
      expect(statusElement?.textContent).toMatch(/no.*fly|prohibited|restricted/i);
    });

    it('should display "No Flight Permitted" message for prohibited status', () => {
      const config = {
        flight_status: 'prohibited',
        airspace_clear: false,
        property_advisory: false,
        zones: [{ zone_id: '1', zone_type: 'no-fly', restriction_name: 'Test Zone' }],
        property_restrictions: [],
        message: 'Flight prohibited',
      };

      indicator.showTriState(config);

      const statusElement = container.querySelector('#restriction-status-indicator');
      expect(statusElement?.textContent).toMatch(/No.*Flight.*Permitted|Flight.*Prohibited/i);
    });
  });

  describe('State 2: Check Property Restrictions (Amber)', () => {
    it('should display amber indicator for flight_status="check-property-restrictions"', () => {
      const config = {
        flight_status: 'check-property-restrictions',
        airspace_clear: true,
        property_advisory: true,
        zones: [],
        property_restrictions: [
          { property_name: 'Stonehenge', organization: 'English Heritage Trust', policy_summary: 'Authorization required', contact: 'permissions@english-heritage.org.uk' }
        ],
        message: 'Airspace clear, but property restrictions may apply',
      };

      indicator.showTriState(config);

      const statusElement = container.querySelector('#restriction-status-indicator');
      expect(statusElement).not.toBeNull();
      
      // Should have amber indicator class/styling
      expect(statusElement?.classList.contains('status-check-property') || 
             statusElement?.classList.contains('status-amber') ||
             statusElement?.classList.contains('status-yellow')).toBe(true);
    });

    it('should display "Check Property Policy" message for property restrictions', () => {
      const config = {
        flight_status: 'check-property-restrictions',
        airspace_clear: true,
        property_advisory: true,
        zones: [],
        property_restrictions: [
          { property_name: 'Heritage Site', organization: 'Historic England', policy_summary: 'Policy', contact: 'contact@example.com' }
        ],
        message: 'Check property policy',
      };

      indicator.showTriState(config);

      const statusElement = container.querySelector('#restriction-status-indicator');
      expect(statusElement?.textContent).toMatch(/Check.*Property.*Policy|Property.*Restrictions/i);
    });

    it('should display property restrictions count when multiple properties', () => {
      const config = {
        flight_status: 'check-property-restrictions',
        airspace_clear: true,
        property_advisory: true,
        zones: [],
        property_restrictions: [
          { property_name: 'Site 1', organization: 'Org 1', policy_summary: 'Policy 1', contact: 'contact1@example.com' },
          { property_name: 'Site 2', organization: 'Org 2', policy_summary: 'Policy 2', contact: 'contact2@example.com' },
          { property_name: 'Site 3', organization: 'Org 3', policy_summary: 'Policy 3', contact: 'contact3@example.com' },
        ],
        message: 'Multiple property restrictions detected',
      };

      indicator.showTriState(config);

      const statusElement = container.querySelector('#restriction-status-indicator');
      // Should display count: "3 property restrictions"
      expect(statusElement?.textContent).toMatch(/3.*propert/i);
    });

    it('should display property name and organization', () => {
      const config = {
        flight_status: 'check-property-restrictions',
        airspace_clear: true,
        property_advisory: true,
        zones: [],
        property_restrictions: [
          { 
            property_name: 'Stonehenge', 
            organization: 'English Heritage Trust', 
            policy_summary: 'World Heritage Site. Authorization required.', 
            contact: 'permissions@english-heritage.org.uk' 
          }
        ],
        message: 'Property restrictions detected',
      };

      indicator.showTriState(config);

      const statusElement = container.querySelector('#restriction-status-indicator');
      expect(statusElement?.textContent).toContain('Stonehenge');
      expect(statusElement?.textContent).toContain('English Heritage Trust');
    });

    it('should display contact information', () => {
      const config = {
        flight_status: 'check-property-restrictions',
        airspace_clear: true,
        property_advisory: true,
        zones: [],
        property_restrictions: [
          { 
            property_name: 'Heritage Site', 
            organization: 'National Trust', 
            policy_summary: 'Authorization required', 
            contact: 'permissions@nationaltrust.org.uk' 
          }
        ],
        message: 'Property restrictions detected',
      };

      indicator.showTriState(config);

      const statusElement = container.querySelector('#restriction-status-indicator');
      expect(statusElement?.textContent).toContain('permissions@nationaltrust.org.uk');
    });
  });

  describe('State 3: Permitted (Green)', () => {
    it('should display green indicator for flight_status="permitted"', () => {
      const config = {
        flight_status: 'permitted',
        airspace_clear: true,
        property_advisory: false,
        zones: [],
        property_restrictions: [],
        message: 'Flight permitted - no restrictions',
      };

      indicator.showTriState(config);

      const statusElement = container.querySelector('#restriction-status-indicator');
      expect(statusElement).not.toBeNull();
      
      // Should have green indicator class/styling
      expect(statusElement?.classList.contains('status-permitted') || 
             statusElement?.classList.contains('status-green')).toBe(true);
    });

    it('should display "Flight Permitted" message for permitted status', () => {
      const config = {
        flight_status: 'permitted',
        airspace_clear: true,
        property_advisory: false,
        zones: [],
        property_restrictions: [],
        message: 'Flight permitted',
      };

      indicator.showTriState(config);

      const statusElement = container.querySelector('#restriction-status-indicator');
      expect(statusElement?.textContent).toMatch(/Flight.*Permitted|No.*Restrictions/i);
    });
  });
});
