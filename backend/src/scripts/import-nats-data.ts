/**
 * NATs Data Import Script
 * 
 * Imports UAS Geographic Zones from NATs Digital Datasets into the database.
 * 
 * Data Source: https://nats-uk.ead-it.com/cms-nats/opencms/en/Publications/digital-datasets/
 * 
 * Usage: npx tsx src/scripts/import-nats-data.ts [--file path/to/file.geojson] [--url https://...]
 */

import { readFile } from 'fs/promises';
import { getDbPool } from '../lib/db.js';
import { logger } from '../lib/logger.js';

interface NATSZoneProperties {
  // NATs GeoJSON properties (may vary - adapt as needed)
  name?: string;
  type?: string;
  class?: string;
  lowerLimit?: string | number;
  upperLimit?: string | number;
  restriction?: string;
  remarks?: string;
  [key: string]: any;
}

interface GeoJSONFeature {
  type: 'Feature';
  geometry: {
    type: string;
    coordinates: any;
  };
  properties: NATSZoneProperties;
}

interface GeoJSONFeatureCollection {
  type: 'FeatureCollection';
  features: GeoJSONFeature[];
}

/**
 * Parse altitude string (e.g., "FL150", "2500 ft", "GND")
 */
function parseAltitude(alt: string | number | undefined): number | null {
  if (!alt) return null;
  
  const altStr = String(alt).toUpperCase();
  
  // Ground level
  if (altStr === 'GND' || altStr === 'SFC') return 0;
  
  // Flight level (FL150 = 15,000 ft)
  if (altStr.startsWith('FL')) {
    const fl = parseInt(altStr.substring(2));
    return fl * 100;
  }
  
  // Feet (extract number)
  const match = altStr.match(/(\d+)/);
  if (match) return parseInt(match[1]);
  
  return null;
}

/**
 * Map NATs zone type to DroneGo zone_type
 */
function mapZoneType(natsType: string | undefined, natsClass: string | undefined): string {
  if (!natsType && !natsClass) return 'controlled-airspace';
  
  const type = (natsType || '').toUpperCase();
  const cls = (natsClass || '').toUpperCase();
  
  // Danger/Restricted areas
  if (type.includes('DANGER') || type.includes('RESTRICTED') || type.includes('PROHIBITED')) {
    return 'danger-area';
  }
  
  // Military zones
  if (type.includes('MILITARY') || type.includes('MOD') || type.includes('MATZ')) {
    return 'military-zone';
  }
  
  // Airport zones
  if (type.includes('ATZ') || type.includes('FRZ') || type.includes('AERODROME')) {
    return 'airport-frz';
  }
  
  // Controlled airspace (Class A-E)
  if (cls === 'A' || cls === 'B' || cls === 'C' || cls === 'D' || cls === 'E') {
    return 'controlled-airspace';
  }
  
  // Temporary (NOTAM)
  if (type.includes('TEMPORARY') || type.includes('NOTAM')) {
    return 'temporary-restriction';
  }
  
  // Default
  return 'controlled-airspace';
}

/**
 * Ensure NATs data source exists in database
 */
async function ensureDataSource(client: any): Promise<string> {
  const natsSourceId = '22222222-2222-2222-2222-222222222222';
  
  const result = await client.query(
    `SELECT source_id FROM data_sources WHERE source_id = $1`,
    [natsSourceId]
  );
  
  if (result.rows.length === 0) {
    logger.info('Creating NATs data source entry');
    await client.query(
      `INSERT INTO data_sources (
        source_id, authority_name, data_type, update_frequency,
        confidence_level, license_info
      ) VALUES ($1, $2, $3, $4, $5, $6)`,
      [
        natsSourceId,
        'NATS AIS',
        'airspace_structure',
        '28-day AIRAC',
        'primary-authority',
        'NATS AIS data © Crown Copyright'
      ]
    );
  }
  
  return natsSourceId;
}

/**
 * Import GeoJSON feature into restriction_zones table
 */
async function importFeature(
  client: any, 
  feature: GeoJSONFeature, 
  dataSourceId: string
): Promise<void> {
  const props = feature.properties;
  const geometry = feature.geometry;
  
  // Map properties
  const zoneName = props.name || props.restriction || 'Unnamed Zone';
  const zoneType = mapZoneType(props.type, props.class);
  const altitudeFloor = parseAltitude(props.lowerLimit);
  const altitudeCeiling = parseAltitude(props.upperLimit);
  const description = props.remarks || props.restriction || '';
  
  // Convert GeoJSON to PostGIS geometry
  const geojsonStr = JSON.stringify(geometry);
  
  try {
    await client.query(
      `INSERT INTO restriction_zones (
        zone_id, zone_type, geometry, authority_source, restriction_name,
        altitude_floor, altitude_ceiling, description, authorization_possible,
        confidence_level, data_source_id, last_updated, created_at
      ) VALUES (
        gen_random_uuid(), $1, 
        ST_Multi(ST_Force2D(ST_SetSRID(ST_GeomFromGeoJSON($2), 4326))), 
        'NATS', $3,
        $4, $5, $6, $7, 'primary-authority', $8, NOW(), NOW()
      )`,
      [
        zoneType,
        geojsonStr,
        zoneName,
        altitudeFloor,
        altitudeCeiling,
        description,
        false, // authorization_possible (default false for NATs zones)
        dataSourceId
      ]
    );
    
    logger.debug(`Imported zone: ${zoneName}`);
  } catch (error) {
    logger.error(`Failed to import zone: ${zoneName}`, { error });
    throw error;
  }
}

/**
 * Main import function
 */
async function importNATSData(filePath?: string, url?: string): Promise<void> {
  logger.info('Starting NATs data import');
  
  let geojson: GeoJSONFeatureCollection;
  
  // Load data from file or URL
  if (filePath) {
    logger.info(`Loading GeoJSON from file: ${filePath}`);
    const fileContent = await readFile(filePath, 'utf-8');
    geojson = JSON.parse(fileContent);
  } else if (url) {
    logger.info(`Fetching GeoJSON from URL: ${url}`);
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }
    geojson = await response.json();
  } else {
    throw new Error('Must provide either --file or --url parameter');
  }
  
  // Validate GeoJSON structure
  if (geojson.type !== 'FeatureCollection' || !Array.isArray(geojson.features)) {
    throw new Error('Invalid GeoJSON: Expected FeatureCollection with features array');
  }
  
  logger.info(`Found ${geojson.features.length} features to import`);
  
  // Database connection
  const pool = getDbPool();
  const client = await pool.connect();
  
  try {
    // Ensure NATs data source exists
    await client.query('BEGIN');
    const dataSourceId = await ensureDataSource(client);
    await client.query('COMMIT');
    
    // Import each feature with individual transactions
    let imported = 0;
    let errors = 0;
    
    for (const feature of geojson.features) {
      try {
        await client.query('BEGIN');
        await importFeature(client, feature, dataSourceId);
        await client.query('COMMIT');
        imported++;
        
        // Log progress every 100 features
        if (imported % 100 === 0) {
          logger.info(`Progress: ${imported}/${geojson.features.length} features imported`);
        }
      } catch (error) {
        await client.query('ROLLBACK');
        errors++;
        logger.error('Feature import failed', { 
          feature: feature.properties?.name, 
          error 
        });
      }
    }
    
    logger.info(`NATs data import completed: ${imported} imported, ${errors} errors`);
    
    // Update data source last_update
    await client.query(
      `UPDATE data_sources SET last_update = NOW() WHERE source_id = $1`,
      [dataSourceId]
    );
    
  } catch (error) {
    logger.error('NATs data import failed', { error });
    throw error;
  } finally {
    client.release();
  }
}

/**
 * CLI entry point
 */
async function main() {
  const args = process.argv.slice(2);
  const fileArg = args.find(arg => arg.startsWith('--file='));
  const urlArg = args.find(arg => arg.startsWith('--url='));
  
  const filePath = fileArg?.split('=')[1];
  const url = urlArg?.split('=')[1];
  
  if (!filePath && !url) {
    console.error('Usage: npx tsx src/scripts/import-nats-data.ts --file=<path> OR --url=<url>');
    console.error('');
    console.error('Examples:');
    console.error('  npx tsx src/scripts/import-nats-data.ts --file=data/nats-zones.geojson');
    console.error('  npx tsx src/scripts/import-nats-data.ts --url=https://example.com/data.geojson');
    process.exit(1);
  }
  
  try {
    await importNATSData(filePath, url);
    logger.info('Import completed successfully');
    process.exit(0);
  } catch (error) {
    logger.error('Import failed', { error });
    process.exit(1);
  }
}

// Run if called directly (ESM way)
const isMainModule = import.meta.url === `file://${process.argv[1]}` ||
                     process.argv[1].endsWith('import-nats-data.ts');

if (isMainModule) {
  main().catch(error => {
    console.error('Fatal error:', error);
    process.exit(1);
  });
}

export { importNATSData };
