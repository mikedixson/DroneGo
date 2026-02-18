/**
 * KML to GeoJSON Converter
 * 
 * Converts NATs KML data to GeoJSON format for import
 */

import { readFileSync, writeFileSync } from 'fs';
import { DOMParser } from '@xmldom/xmldom';
import * as toGeoJSON from '@tmcw/togeojson';

function convertKMLtoGeoJSON(kmlPath: string, outputPath: string): void {
  console.log(`Converting ${kmlPath} to GeoJSON...`);
  
  // Read KML file
  const kmlContent = readFileSync(kmlPath, 'utf-8');
  
  // Parse KML XML
  const parser = new DOMParser();
  const kmlDoc = parser.parseFromString(kmlContent, 'text/xml');
  
  // Convert to GeoJSON
  const geojson = toGeoJSON.kml(kmlDoc);
  
  // Write GeoJSON file
  writeFileSync(outputPath, JSON.stringify(geojson, null, 2));
  
  console.log(`✓ Converted to ${outputPath}`);
  console.log(`  Features: ${geojson.features.length}`);
}

// Run converter
const kmlFile = process.argv[2] || 'nats-data/extracted/eaip3d-2026-02-19.kml';
const outputFile = process.argv[3] || 'nats-data/nats-zones.geojson';

try {
  convertKMLtoGeoJSON(kmlFile, outputFile);
  console.log('\n✓ Conversion complete!');
} catch (error) {
  console.error('✗ Conversion failed:', error);
  process.exit(1);
}
