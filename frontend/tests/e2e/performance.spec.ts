/**
 * Performance E2E Test
 * 
 * Validates NFR-003, FR-026, SC-001: 
 * "System MUST determine and display current location restriction status 
 * within 5 seconds of app opening"
 * 
 * This test measures the complete user journey from opening the app
 * to seeing a clear go/no-go decision.
 */

import { test, expect } from '@playwright/test';

test.describe('Performance: Time to Decision', () => {
  test('should display restriction status within 5 seconds of page load', async ({ page }) => {
    // Start performance measurement
    const startTime = Date.now();

    // Navigate to the application
    await page.goto('/');

    // Wait for the map to initialize (Leaflet container appears)
    await page.waitForSelector('.leaflet-container', { timeout: 10000 });

    // Wait for the restriction status indicator to appear
    // This is the critical metric: time from page load to decision display
    await page.waitForSelector('#restriction-status-indicator', { timeout: 10000 });

    // Calculate elapsed time
    const endTime = Date.now();
    const elapsedSeconds = (endTime - startTime) / 1000;

    // Log performance metrics for debugging
    console.log(`⏱️  Time to decision: ${elapsedSeconds.toFixed(2)}s`);

    // Verify the status indicator is visible
    const statusIndicator = page.locator('#restriction-status-indicator');
    await expect(statusIndicator).toBeVisible();

    // Verify it contains actual status information (not just loading)
    const hasContent = await statusIndicator.evaluate((el) => {
      const text = el.textContent || '';
      // Should contain one of the status messages
      return text.includes('Permitted') || 
             text.includes('No Flight') || 
             text.includes('Authorization Required') ||
             text.includes('Unknown');
    });
    expect(hasContent).toBe(true);

    // CRITICAL ASSERTION: Must be under 5 seconds (NFR-003, FR-026, SC-001)
    expect(elapsedSeconds).toBeLessThan(5);

    // Additional validation: Check that map layers are loaded
    const hasZoneLayers = await page.evaluate(() => {
      const mapElement = document.querySelector('.leaflet-container');
      if (!mapElement) return false;
      
      // Check if SVG paths exist (zones are rendered as SVG paths)
      const svgPaths = document.querySelectorAll('.leaflet-pane svg path');
      return svgPaths.length > 0;
    });

    // Log layer status for debugging
    console.log(`📍 Map layers loaded: ${hasZoneLayers}`);
  });

  test('should load map tiles within 3 seconds (FR-025)', async ({ page }) => {
    const startTime = Date.now();

    await page.goto('/');

    // Wait for map container
    await page.waitForSelector('.leaflet-container', { timeout: 10000 });

    // Wait for at least one tile to load
    await page.waitForSelector('.leaflet-tile', { timeout: 10000 });

    const endTime = Date.now();
    const elapsedSeconds = (endTime - startTime) / 1000;

    console.log(`🗺️  Map initial load: ${elapsedSeconds.toFixed(2)}s`);

    // FR-025: Map MUST load and become interactive within 3 seconds on 4G
    // Note: This is testing on localhost which is faster than 4G,
    // but validates the baseline performance
    expect(elapsedSeconds).toBeLessThan(3);

    // Verify map is interactive (can zoom)
    const zoomInButton = page.locator('.leaflet-control-zoom-in');
    await expect(zoomInButton).toBeVisible();
    await expect(zoomInButton).toBeEnabled();
  });

  test('should handle geolocation permission gracefully', async ({ page, context }) => {
    // Deny geolocation permission to test fallback behavior
    await context.grantPermissions([], { origin: page.url() });

    const startTime = Date.now();
    await page.goto('/');

    // Even without GPS permission, map should still load with default location
    await page.waitForSelector('.leaflet-container', { timeout: 10000 });

    const endTime = Date.now();
    const elapsedSeconds = (endTime - startTime) / 1000;

    console.log(`🌍 Fallback load time: ${elapsedSeconds.toFixed(2)}s`);

    // Map should load quickly even without geolocation
    expect(elapsedSeconds).toBeLessThan(5);

    // Verify map is centered on default location (UK center approximately)
    const mapCenter = await page.evaluate(() => {
      const mapElement = document.querySelector('.leaflet-container') as any;
      if (!mapElement || !mapElement._leaflet_map) return null;
      const center = mapElement._leaflet_map.getCenter();
      return { lat: center.lat, lng: center.lng };
    });

    expect(mapCenter).toBeTruthy();
    
    // UK is roughly between 50-60°N, -8 to 2°E
    // Default fallback should be somewhere in this range
    if (mapCenter) {
      expect(mapCenter.lat).toBeGreaterThan(49);
      expect(mapCenter.lat).toBeLessThan(61);
      expect(mapCenter.lng).toBeGreaterThan(-9);
      expect(mapCenter.lng).toBeLessThan(3);
    }
  });

  test('should measure complete performance metrics', async ({ page }) => {
    // Navigate and collect performance timing
    await page.goto('/');
    
    await page.waitForSelector('#restriction-status-indicator', { timeout: 10000 });

    // Collect browser performance metrics
    const metrics = await page.evaluate(() => {
      const perf = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming;
      
      return {
        // Time to first byte
        ttfb: perf.responseStart - perf.requestStart,
        // DOM content loaded
        domContentLoaded: perf.domContentLoadedEventEnd - perf.domContentLoadedEventStart,
        // DOM interactive
        domInteractive: perf.domInteractive - perf.fetchStart,
        // Total load time
        loadComplete: perf.loadEventEnd - perf.fetchStart,
        // DNS lookup
        dnsLookup: perf.domainLookupEnd - perf.domainLookupStart,
        // TCP connection
        tcpConnection: perf.connectEnd - perf.connectStart,
      };
    });

    console.log('📊 Performance Metrics:');
    console.log(`  TTFB: ${metrics.ttfb.toFixed(2)}ms`);
    console.log(`  DOM Interactive: ${metrics.domInteractive.toFixed(2)}ms`);
    console.log(`  DOM Content Loaded: ${metrics.domContentLoaded.toFixed(2)}ms`);
    console.log(`  Load Complete: ${metrics.loadComplete.toFixed(2)}ms`);
    console.log(`  DNS Lookup: ${metrics.dnsLookup.toFixed(2)}ms`);
    console.log(`  TCP Connection: ${metrics.tcpConnection.toFixed(2)}ms`);

    // Verify reasonable performance
    expect(metrics.domInteractive).toBeLessThan(2000); // DOM should be interactive quickly
    expect(metrics.loadComplete).toBeLessThan(5000); // Total load should be fast
  });
});
