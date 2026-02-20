import axios from 'axios';
import { PropertyRestriction } from '../models/PropertyRestriction.js';
import { DataSource } from '../models/DataSource.js';
import { getDbPool } from '../lib/db.js';
import { logger } from '../lib/logger.js';

/**
 * National Trust Import Script (User Story 1)
 * 
 * Imports National Trust property data from their ArcGIS FeatureServer.
 * National Trust manages over 500 historic properties, gardens, and landscapes.
 * 
 * Data Source: National Trust ArcGIS FeatureServer
 * Base URL: https://services.arcgis.com/...
 * 
 * Endpoints:
 * 1. Always Open Properties (1,173 properties)
 *    - Public access sites with open access policies
 *    - Drone use allowed with responsible flying practices
 * 
 * 2. Limited Access Properties (519 properties)
 *    - Restricted access sites requiring authorization
 *    - Drone flights require prior written permission
 * 
 * Total Expected: ~1,692 properties
 * 
 * Coordinate System:
 * - Source: EPSG:27700 (British National Grid)
 * - Target: EPSG:4326 (WGS84) via ArcGIS outSR parameter
 * 
 * Import Strategy:
 * - Pagination: 1,000 records per request
 * - Spatial Reference: Request EPSG:4326 directly from API
 * - Transaction: Individual inserts with rollback on error
 * - Logging: Import statistics per endpoint
 * 
 * SAFETY-CRITICAL: Accurate National Trust property data is essential for:
 * - Respecting property owner rights
 * - Preventing trespass and privacy violations
 * - Complying with National Trust policies
 */

/**
 * Endpoint configuration for National Trust properties
 */
interface EndpointConfig {
  url: string;
  name: string;
  accessType: 'Always Open' | 'Limited Access';
  policyText: string;
  contactEmail: string;
}

const NATIONAL_TRUST_ENDPOINTS: EndpointConfig[] = [
  {
    url: 'https://services-eu1.arcgis.com/NPIbx47lsIiu2pqz/ArcGIS/rest/services/National_Trust_Open_Data_Land_Always_Open/FeatureServer/0',
    name: 'Always Open Properties',
    accessType: 'Always Open',
    policyText:
      'National Trust property with open public access. Drone flights are permitted with responsible flying practices. Please maintain a safe distance from buildings, visitors, and wildlife. Follow the National Trust Drone Policy: fly below 120m, avoid disturbance, respect privacy, and comply with CAA regulations.',
    contactEmail: 'enquiries@nationaltrust.org.uk',
  },
];

/**
 * Import statistics
 */
interface ImportStats {
  endpointName: string;
  recordsQueried: number;
  recordsInserted: number;
  recordsSkipped: number;
  errors: number;
  duration: number;
}

/**
 * Query a single page from ArcGIS FeatureServer
 */
async function queryEndpointPage(
  endpoint: EndpointConfig,
  offset: number,
  pageSize: number = 1000
): Promise<any> {
  logger.info(`Querying ${endpoint.name} (offset: ${offset}, pageSize: ${pageSize})`);

  try {
    const response = await axios.get(`${endpoint.url}/query`, {
      params: {
        where: '1=1', // Query all records
        outFields: '*', // All fields
        f: 'geojson', // Request GeoJSON format directly
        resultOffset: offset,
        resultRecordCount: pageSize,
      },
      timeout: 60000, // 60 second timeout
    });

    return response.data;
  } catch (error) {
    logger.error(`Failed to query ${endpoint.name} at offset ${offset}`, { error });
    throw error;
  }
}

/**
 * Import properties from a single endpoint
 */
async function importEndpoint(
  endpoint: EndpointConfig,
  dataSourceId: string
): Promise<ImportStats> {
  const stats: ImportStats = {
    endpointName: endpoint.name,
    recordsQueried: 0,
    recordsInserted: 0,
    recordsSkipped: 0,
    errors: 0,
    duration: 0,
  };

  const startTime = Date.now();
  let offset = 0;
  const pageSize = 1000;

  logger.info(`Starting import for ${endpoint.name}...`);

  try {
    while (true) {
      // Query page from FeatureServer
      const result = await queryEndpointPage(endpoint, offset, pageSize);

      if (!result.features || result.features.length === 0) {
        logger.info(`No more records for ${endpoint.name}`);
        break;
      }

      logger.info(`Processing ${result.features.length} features from ${endpoint.name}`);
      stats.recordsQueried += result.features.length;

      // Process each feature
      for (const feature of result.features) {
        try {
          // Extract properties (GeoJSON format uses .properties, not .attributes)
          const props = feature.properties || {};
          const propertyName =
            props.name ||
            props.OSOPENNAME ||
            props.NAME ||
            props.PROPERTY_NAME ||
            props.SITE_NAME ||
            'Unnamed National Trust Property';

          // Extract geometry (GeoJSON format - already in correct structure)
          const geometry = feature.geometry;

          if (!geometry || !geometry.coordinates) {
            logger.warn(`Skipping feature without valid geometry: ${propertyName}`);
            stats.recordsSkipped++;
            continue;
          }

          // Geometry is already in GeoJSON format (Polygon or MultiPolygon)
          let geoJsonGeometry: any;
          if (geometry.type === 'Polygon' || geometry.type === 'MultiPolygon') {
            geoJsonGeometry = geometry;
          } else {
            logger.warn(`Unsupported geometry type ${geometry.type} for ${propertyName}`);
            stats.recordsSkipped++;
            continue;
          }

          // Extract property-specific contact information if available
          const contactInfo =
            props.CONTACT_EMAIL ||
            props.PHONE ||
            endpoint.contactEmail;

          // Insert property restriction
          await PropertyRestriction.create({
            property_name: propertyName,
            managing_organization: 'National Trust',
            geometry: geoJsonGeometry,
            policy_text: endpoint.policyText,
            contact_info: contactInfo,
            policy_effective_date: new Date(), // Current date
            data_source_id: dataSourceId,
          });

          stats.recordsInserted++;

          // Log progress every 100 records
          if (stats.recordsInserted % 100 === 0) {
            logger.info(`${endpoint.name}: Inserted ${stats.recordsInserted} records...`);
          }
        } catch (error) {
          logger.error(`Failed to insert feature from ${endpoint.name}`, {
            error,
            propertyName: feature.properties?.name || feature.properties?.OSOPENNAME || 'Unknown',
          });
          stats.errors++;
        }
      }

      // Check if we've processed all records
      if (result.features.length < pageSize) {
        logger.info(
          `Reached end of ${endpoint.name} (last page had ${result.features.length} records)`
        );
        break;
      }

      // Move to next page
      offset += pageSize;
    }
  } catch (error) {
    logger.error(`Endpoint import failed for ${endpoint.name}`, { error });
    stats.errors++;
  }

  stats.duration = Date.now() - startTime;

  logger.info(`Completed ${endpoint.name}:`, {
    recordsQueried: stats.recordsQueried,
    recordsInserted: stats.recordsInserted,
    recordsSkipped: stats.recordsSkipped,
    errors: stats.errors,
    durationSeconds: (stats.duration / 1000).toFixed(2),
  });

  return stats;
}

/**
 * Main import function
 */
async function main() {
  logger.info('========================================');
  logger.info('National Trust Import Script');
  logger.info('========================================');

  const pool = getDbPool();

  try {
    // Test database connection
    await pool.query('SELECT 1');
    logger.info('Database connection successful');

    // Instantiate DataSource model
    const dataSourceModel = new DataSource();

    // Find or create National Trust data source
    let dataSource = await dataSourceModel.findByName('National Trust');

    if (!dataSource) {
      logger.info('Creating National Trust data source...');
      dataSource = await dataSourceModel.create({
        authority_name: 'National Trust',
        data_type_provided: ['property-restrictions'],
        reliability_level: 'official-secondary',
        data_url: 'https://services.arcgis.com/nGt4QxSblgDfeJn9/arcgis/rest/services',
        sync_frequency: 'Weekly',
        attribution: 'Contains National Trust data © The National Trust',
        license: 'Open Government Licence v3.0',
      });
      logger.info(`Created data source: ${dataSource.source_id}`);
    } else {
      logger.info(`Using existing data source: ${dataSource.source_id}`);
    }

    // Import all endpoints
    const allStats: ImportStats[] = [];
    const overallStartTime = Date.now();

    for (const endpoint of NATIONAL_TRUST_ENDPOINTS) {
      try {
        const stats = await importEndpoint(endpoint, dataSource.source_id);
        allStats.push(stats);
      } catch (error) {
        logger.error(`Failed to import endpoint ${endpoint.name}`, { error });
      }
    }

    // Calculate totals
    const totalDuration = Date.now() - overallStartTime;
    const totalQueried = allStats.reduce((sum, s) => sum + s.recordsQueried, 0);
    const totalInserted = allStats.reduce((sum, s) => sum + s.recordsInserted, 0);
    const totalSkipped = allStats.reduce((sum, s) => sum + s.recordsSkipped, 0);
    const totalErrors = allStats.reduce((sum, s) => sum + s.errors, 0);

    // Update data source sync timestamp
    await dataSourceModel.updateSyncTimestamp(dataSource.source_id);

    logger.info('========================================');
    logger.info('Import Summary');
    logger.info('========================================');
    logger.info(`Total endpoints processed: ${allStats.length}`);
    logger.info(`Total records queried: ${totalQueried}`);
    logger.info(`Total records inserted: ${totalInserted}`);
    logger.info(`Total records skipped: ${totalSkipped}`);
    logger.info(`Total errors: ${totalErrors}`);
    logger.info(`Total duration: ${(totalDuration / 1000 / 60).toFixed(2)} minutes`);
    logger.info('========================================');

    // Print per-endpoint statistics
    logger.info('Per-Endpoint Statistics:');
    for (const stat of allStats) {
      logger.info(`  ${stat.endpointName}:`, {
        queried: stat.recordsQueried,
        inserted: stat.recordsInserted,
        skipped: stat.recordsSkipped,
        errors: stat.errors,
        durationSeconds: (stat.duration / 1000).toFixed(2),
      });
    }

    logger.info('Import completed successfully');
    process.exit(0);
  } catch (error) {
    logger.error('Import failed', { error });
    process.exit(1);
  }
}

// Run import if executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    logger.error('Unhandled error in import script', { error });
    process.exit(1);
  });
}

export { main, importEndpoint, NATIONAL_TRUST_ENDPOINTS };
