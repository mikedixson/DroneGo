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
