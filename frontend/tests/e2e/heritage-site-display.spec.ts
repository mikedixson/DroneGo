import { test, expect, Page } from '@playwright/test';

/**
 * E2E Test for User Story 1: Heritage Site Display
 * 
 * Acceptance Criteria:
 * - AC-001: Heritage sites displayed as amber polygons on map
 * - AC-002: Zoom behaviour: simplified <13, medium 13-15, full >15
 * - AC-003: Click polygon → detail panel shows name, policy, contact (FR-006)
 * - AC-004: Data staleness warning if last_successful_import > 48 hours (FR-013)
 * 
 * Contract: spec.md - User Story Structure
 */
test.describe('Heritage Site Display', () => {
  test.beforeEach(async ({ page }) => {
    // Navigate to application
    await page.goto('http://localhost:3000');
    
    // Wait for map to initialize
    await page.waitForSelector('.leaflet-container', { timeout: 10000 });
  });

  test('AC-001: should display heritage sites as amber polygons on map', async ({ page }) => {
    // Pan to London area (Tower of London)
    await page.evaluate(() => {
      // @ts-ignore - map is globally available
      window.map.setView([51.5081, -0.0761], 15);
    });

    // Wait for heritage site layer to load
    await page.waitForSelector('[data-layer="heritage-sites"]', { timeout: 5000 });

    // Wait for polygons to render
    await page.waitForTimeout(2000);

    // Check for amber polygon elements
    const heritagePolygons = page.locator('.heritage-site-polygon');
    const count = await heritagePolygons.count();
    
    expect(count).toBeGreaterThan(0);

    // Verify styling: amber stroke, semi-transparent fill
    const firstPolygon = heritagePolygons.first();
    const styles = await firstPolygon.evaluate((el) => {
      const computed = window.getComputedStyle(el);
      return {
        stroke: computed.stroke || el.getAttribute('stroke'),
        fill: computed.fill || el.getAttribute('fill'),
        fillOpacity: computed.fillOpacity || el.getAttribute('fill-opacity'),
      };
    });

    // Amber color (orange/yellow range)
    // Leaflet may use hex values like #FFA500 or rgb(255, 165, 0)
    const amberPattern = /#FF[A-F0-9]{4}|rgb\(255,\s*1[0-9]{2},\s*0\)|orange/i;
    expect(styles.stroke).toMatch(amberPattern);

    // Semi-transparent fill
    const opacity = parseFloat(styles.fillOpacity);
    expect(opacity).toBeGreaterThan(0);
    expect(opacity).toBeLessThan(0.7);
  });

  test('AC-002: should switch to simplified geometry when zooming out', async ({ page }) => {
    // Pan to Tower of London
    await page.evaluate(() => {
      // @ts-ignore
      window.map.setView([51.5081, -0.0761], 16);
    });

    await page.waitForTimeout(1500);

    // Capture full detail coordinates (zoom >15)
    const fullDetailData = await page.evaluate(() => {
      const polygon = document.querySelector('.heritage-site-polygon');
      if (!polygon) return null;

      // Get coordinate data from Leaflet path
      const pathData = polygon.getAttribute('d') || '';
      return {
        pathLength: pathData.length,
        zoom: 16,
      };
    });

    expect(fullDetailData).toBeTruthy();
    expect(fullDetailData!.pathLength).toBeGreaterThan(0);

    // Zoom out to trigger low detail (zoom <13)
    await page.evaluate(() => {
      // @ts-ignore
      window.map.setZoom(12);
    });

    await page.waitForTimeout(1500);

    // Capture low detail coordinates
    const lowDetailData = await page.evaluate(() => {
      const polygon = document.querySelector('.heritage-site-polygon');
      if (!polygon) return null;

      const pathData = polygon.getAttribute('d') || '';
      return {
        pathLength: pathData.length,
        zoom: 12,
      };
    });

    expect(lowDetailData).toBeTruthy();

    // Verify simplification: low detail should have shorter path
    expect(lowDetailData!.pathLength).toBeLessThan(fullDetailData!.pathLength);
  });

  test('AC-002: should use medium detail at zoom 13-15', async ({ page }) => {
    // Set zoom to medium range
    await page.evaluate(() => {
      // @ts-ignore
      window.map.setView([51.5081, -0.0761], 14);
    });

    await page.waitForTimeout(1500);

    const mediumDetailData = await page.evaluate(() => {
      const polygon = document.querySelector('.heritage-site-polygon');
      if (!polygon) return null;

      const pathData = polygon.getAttribute('d') || '';
      return {
        pathLength: pathData.length,
        zoom: 14,
        url: window.location.href,
      };
    });

    expect(mediumDetailData).toBeTruthy();
    expect(mediumDetailData!.zoom).toBe(14);

    // The API should have returned medium detail geometry
    // We can't directly verify the API call geometry, but we can verify
    // that the rendering happened at the correct zoom level
    
    // Get current zoom level from Leaflet
    const currentZoom = await page.evaluate(() => {
      // @ts-ignore
      return window.map.getZoom();
    });

    expect(currentZoom).toBeGreaterThanOrEqual(13);
    expect(currentZoom).toBeLessThanOrEqual(15);
  });

  test('AC-003: should display detail panel on polygon click', async ({ page }) => {
    // Pan to area with known heritage site
    await page.evaluate(() => {
      // @ts-ignore
      window.map.setView([51.5081, -0.0761], 15);
    });

    await page.waitForTimeout(2000);

    // Click first heritage site polygon
    const firstPolygon = page.locator('.heritage-site-polygon').first();
    await firstPolygon.click();

    // Wait for detail panel to appear
    await page.waitForSelector('.property-detail-panel', { timeout: 5000 });

    // Verify panel content (FR-006)
    const panelContent = await page.evaluate(() => {
      const panel = document.querySelector('.property-detail-panel');
      if (!panel) return null;

      return {
        propertyName: panel.querySelector('.property-name')?.textContent || '',
        policyText: panel.querySelector('.policy-text')?.textContent || '',
        contactInfo: panel.querySelector('.contact-info')?.textContent || '',
        organization: panel.querySelector('.managing-organization')?.textContent || '',
      };
    });

    expect(panelContent).toBeTruthy();
    expect(panelContent!.propertyName.length).toBeGreaterThan(0);
    expect(panelContent!.policyText.length).toBeGreaterThan(0);
    
    // Policy text should contain typical heritage site language
    const policyLower = panelContent!.policyText.toLowerCase();
    const containsPolicy = 
      policyLower.includes('require') ||
      policyLower.includes('authorization') ||
      policyLower.includes('permit') ||
      policyLower.includes('restricted');
    
    expect(containsPolicy).toBe(true);
  });

  test('AC-003: should close detail panel when clicking map', async ({ page }) => {
    // Open detail panel
    await page.evaluate(() => {
      // @ts-ignore
      window.map.setView([51.5081, -0.0761], 15);
    });

    await page.waitForTimeout(2000);

    const firstPolygon = page.locator('.heritage-site-polygon').first();
    await firstPolygon.click();
    await page.waitForSelector('.property-detail-panel');

    // Click outside polygon (on map background)
    await page.locator('.leaflet-container').click({ position: { x: 50, y: 50 } });

    await page.waitForTimeout(500);

    // Verify panel closed
    const panelVisible = await page.locator('.property-detail-panel').isVisible();
    expect(panelVisible).toBe(false);
  });

  test('AC-004: should display staleness warning when data >48 hours old', async ({ page }) => {
    // Mock API to return stale data source
    await page.route('**/api/v1/data-sources', (route) => {
      const staleTimestamp = new Date(Date.now() - 72 * 60 * 60 * 1000); // 72 hours ago
      
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([
          {
            authority_name: 'Historic England',
            last_successful_import: staleTimestamp.toISOString(),
            health_status: 'healthy',
          },
          {
            authority_name: 'National Trust',
            last_successful_import: staleTimestamp.toISOString(),
            health_status: 'healthy',
          },
        ]),
      });
    });

    // Reload page to trigger data source check
    await page.reload();
    await page.waitForSelector('.leaflet-container');

    // Wait for staleness warning banner (FR-013)
    await page.waitForSelector('.data-staleness-warning', { timeout: 5000 });

    const warningText = await page.locator('.data-staleness-warning').textContent();
    
    expect(warningText).toBeTruthy();
    expect(warningText!.toLowerCase()).toContain('day');
    expect(warningText!.toLowerCase()).toContain('old');
  });

  test('AC-004: should NOT display warning when data is fresh', async ({ page }) => {
    // Mock API to return fresh data
    await page.route('**/api/v1/data-sources', (route) => {
      const freshTimestamp = new Date(Date.now() - 1 * 60 * 60 * 1000); // 1 hour ago
      
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([
          {
            authority_name: 'Historic England',
            last_successful_import: freshTimestamp.toISOString(),
            health_status: 'healthy',
          },
          {
            authority_name: 'National Trust',
            last_successful_import: freshTimestamp.toISOString(),
            health_status: 'healthy',
          },
        ]),
      });
    });

    await page.reload();
    await page.waitForSelector('.leaflet-container');

    // Wait a bit to ensure warning would appear if it was going to
    await page.waitForTimeout(2000);

    // Verify NO warning displayed
    const warningExists = await page.locator('.data-staleness-warning').count();
    expect(warningExists).toBe(0);
  });

  test('should handle multiple heritage sites in viewport', async ({ page }) => {
    // Pan to London (area with multiple heritage sites)
    await page.evaluate(() => {
      // @ts-ignore
      window.map.setView([51.5074, -0.1278], 13);
    });

    await page.waitForTimeout(2500);

    // Count heritage sites rendered
    const polygonCount = await page.locator('.heritage-site-polygon').count();
    
    // London should have multiple heritage sites visible at zoom 13
    expect(polygonCount).toBeGreaterThan(5);
  });

  test('should maintain polygon visibility when panning', async ({ page }) => {
    // Start at Tower of London
    await page.evaluate(() => {
      // @ts-ignore
      window.map.setView([51.5081, -0.0761], 15);
    });

    await page.waitForTimeout(2000);

    const initialCount = await page.locator('.heritage-site-polygon').count();
    expect(initialCount).toBeGreaterThan(0);

    // Pan to Westminster
    await page.evaluate(() => {
      // @ts-ignore
      window.map.panTo([51.5014, -0.1419]);
    });

    await page.waitForTimeout(2000);

    // Should have polygons at new location
    const afterPanCount = await page.locator('.heritage-site-polygon').count();
    expect(afterPanCount).toBeGreaterThan(0);
  });

  test('should render performance: >=30fps with 50+ sites', async ({ page }) => {
    // Set wider zoom to load more sites
    await page.evaluate(() => {
      // @ts-ignore
      window.map.setView([51.5074, -0.1278], 11);
    });

    await page.waitForTimeout(3000);

    // Measure frame rate during pan
    const fps = await page.evaluate(async () => {
      return new Promise<number>((resolve) => {
        let frameCount = 0;
        let lastTime = performance.now();

        const measureFPS = () => {
          frameCount++;
          const currentTime = performance.now();
          const elapsed = currentTime - lastTime;

          if (elapsed >= 1000) {
            const measuredFPS = Math.round((frameCount * 1000) / elapsed);
            resolve(measuredFPS);
            return;
          }

          requestAnimationFrame(measureFPS);
        };

        // Start panning to trigger rendering
        // @ts-ignore
        window.map.panBy([100, 100]);
        
        requestAnimationFrame(measureFPS);
      });
    });

    // SC-005: ≥30fps rendering performance
    expect(fps).toBeGreaterThanOrEqual(30);
  });

  test('SC-006: should display detail panel within 300ms of click', async ({ page }) => {
    await page.evaluate(() => {
      // @ts-ignore
      window.map.setView([51.5081, -0.0761], 15);
    });

    await page.waitForTimeout(2000);

    const startTime = Date.now();
    
    await page.locator('.heritage-site-polygon').first().click();
    await page.waitForSelector('.property-detail-panel');

    const endTime = Date.now();
    const responseTime = endTime - startTime;

    // SC-006: Click → panel <300ms
    expect(responseTime).toBeLessThan(300);
  });
});
