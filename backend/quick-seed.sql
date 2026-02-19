-- Quick seed script to restore test map data
-- Uses existing data sources

-- Get a data source ID to use
DO $$
DECLARE
  caa_source_id UUID;
  nats_source_id UUID;
BEGIN
  -- Get existing source IDs
  SELECT source_id INTO caa_source_id FROM data_sources WHERE authority_name = 'UK Civil Aviation Authority' LIMIT 1;
  SELECT source_id INTO nats_source_id FROM data_sources WHERE authority_name = 'NATS AIS' LIMIT 1;
  
  -- If no sources exist, create them
  IF caa_source_id IS NULL THEN
    INSERT INTO data_sources (authority_name, data_type_provided, reliability_level)
    VALUES ('UK Civil Aviation Authority', ARRAY['geographic_zones'], 'primary-authority')
    RETURNING source_id INTO caa_source_id;
  END IF;
  
  IF nats_source_id IS NULL THEN
    INSERT INTO data_sources (authority_name, data_type_provided, reliability_level)
    VALUES ('NATS AIS', ARRAY['airspace_structure'], 'primary-authority')
    RETURNING source_id INTO nats_source_id;
  END IF;

  -- Insert restriction zones around London
  INSERT INTO restriction_zones (
    zone_type, restriction_name, geometry, authority_source, data_source_id,
    altitude_floor, altitude_ceiling, authorization_possible, confidence_level
  ) VALUES
  (
    'airport-frz',
    'Heathrow Airport FRZ',
    ST_Multi(ST_Buffer(ST_SetSRID(ST_MakePoint(-0.4543, 51.4700), 4326)::geography, 2500)::geometry),
    'CAA',
    caa_source_id,
    0,
    2000,
    false,
    'primary-authority'
  ),
  (
    'controlled-airspace',
    'London TMA',
    ST_Multi(ST_MakePolygon(ST_GeomFromText(
      'LINESTRING(-0.5 51.3, -0.5 51.7, 0.3 51.7, 0.3 51.3, -0.5 51.3)',
      4326
    ))),
    'NATS',
    caa_source_id,
    1500,
    5500,
    true,
    'primary-authority'
  ),
  (
    'no-fly',
    'Hyde Park Test Zone',
    ST_Multi(ST_Buffer(ST_SetSRID(ST_MakePoint(-0.1657, 51.5074), 4326)::geography, 500)::geometry),
    'Test Authority',
    caa_source_id,
    0,
    400,
    false,
    'unverified'
  );

  -- Insert TOAL sites (using correct schema)
  INSERT INTO toal_sites (
    site_name, geometry, access_type, surface_type, verified, data_source
  ) VALUES
  (
    'Richmond Park Test TOAL',
    ST_SetSRID(ST_MakePoint(-0.2889, 51.4501), 4326),
    'public',
    'grass',
    true,
    'Test Authority'
  ),
  (
    'Greenwich Park TOAL',
    ST_SetSRID(ST_MakePoint(-0.0015, 51.4769), 4326),
    'public',
    'grass',
    true,
    'Test Authority'
  ),
  (
    'Test Airfield TOAL',
    ST_SetSRID(ST_MakePoint(-0.3500, 51.5500), 4326),
    'permit-required',
    'concrete',
    true,
    'Test Authority'
  );

  -- Insert property restrictions (heritage sites)
  INSERT INTO property_restrictions (
    property_name, managing_organization, geometry, policy_text,
    restriction_category, data_source_id
  ) VALUES
  (
    'Tower of London',
    'Historic Royal Palaces',
    ST_Multi(ST_Buffer(ST_SetSRID(ST_MakePoint(-0.0761, 51.5081), 4326)::geography, 200)::geometry),
    'Historic site. Drone operations prohibited within 200m without written permission from Historic Royal Palaces.',
    'HERITAGE_SITE',
    caa_source_id
  ),
  (
    'Buckingham Palace Grounds',
    'Royal Household',
    ST_Multi(ST_Buffer(ST_SetSRID(ST_MakePoint(-0.1419, 51.5014), 4326)::geography, 300)::geometry),
    'Royal residence. Drone flights strictly prohibited for security reasons.',
    'HERITAGE_SITE',
    caa_source_id
  ),
  (
    'Westminster Abbey Area',
    'Church of England',
    ST_Multi(ST_Buffer(ST_SetSRID(ST_MakePoint(-0.1273, 51.4994), 4326)::geography, 150)::geometry),
    'UNESCO World Heritage Site. No drone operations permitted without authorization.',
    'HERITAGE_SITE',
    caa_source_id
  );

END $$;

-- Display counts
SELECT 
  'Restriction Zones' as category, COUNT(*) as count FROM restriction_zones
UNION ALL
SELECT 
  'TOAL Sites' as category, COUNT(*) as count FROM toal_sites
UNION ALL
SELECT 
  'Property Restrictions' as category, COUNT(*) as count FROM property_restrictions;
