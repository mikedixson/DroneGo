-- Sample Data for DroneGo Application
-- Includes restriction zones, airspace classifications, and TOAL sites for London area

-- Clean existing test data
DELETE FROM restriction_zones;
DELETE FROM airspace_classifications;
DELETE FROM toal_sites;
DELETE FROM data_sources WHERE authority_name IN ('CAA', 'NATS', 'DfT', 'Test Authority');

-- Insert data sources
INSERT INTO data_sources (source_id, authority_name, data_type, confidence_level) VALUES
('af89aacf-85de-4053-8829-afcdee6e58f3', 'CAA', 'geographic_zones', 'primary-authority'),
('b1234567-89ab-cdef-0123-456789abcdef', 'NATS', 'airspace', 'primary-authority'),
('c2345678-9abc-def0-1234-56789abcdef0', 'DfT', 'landing_sites', 'secondary-source');

-- ============================================================================
-- RESTRICTION ZONES
-- ============================================================================

-- 1. Heathrow Airport Flight Restriction Zone (No-Fly)
INSERT INTO restriction_zones (
  zone_type, restriction_name, geometry, authority_source, data_source_id,
  altitude_floor, altitude_ceiling, authorization_possible, confidence_level,
  description
) VALUES (
  'airport-frz',
  'Heathrow Airport FRZ',
  ST_Multi(ST_Buffer(ST_SetSRID(ST_MakePoint(-0.4543, 51.4700), 4326)::geography, 2500)::geometry),
  'CAA',
  'af89aacf-85de-4053-8829-afcdee6e58f3',
  0,
  2000,
  false,
  'primary-authority',
  'Flight Restriction Zone around London Heathrow Airport. No drone flights permitted without specific authorization.'
);

-- 2. City Airport Flight Restriction Zone
INSERT INTO restriction_zones (
  zone_type, restriction_name, geometry, authority_source, data_source_id,
  altitude_floor, altitude_ceiling, authorization_possible, confidence_level,
  description
) VALUES (
  'airport-frz',
  'London City Airport FRZ',
  ST_Multi(ST_Buffer(ST_SetSRID(ST_MakePoint(0.0553, 51.5053), 4326)::geography, 2000)::geometry),
  'CAA',
  'af89aacf-85de-4053-8829-afcdee6e58f3',
  0,
  1500,
  false,
  'primary-authority',
  'Flight Restriction Zone around London City Airport.'
);

-- 3. Buckingham Palace No-Fly Zone
INSERT INTO restriction_zones (
  zone_type, restriction_name, geometry, authority_source, data_source_id,
  altitude_floor, altitude_ceiling, authorization_possible, confidence_level,
  description
) VALUES (
  'no-fly',
  'Buckingham Palace Protected Area',
  ST_Multi(ST_Buffer(ST_SetSRID(ST_MakePoint(-0.1419, 51.5014), 4326)::geography, 1000)::geometry),
  'CAA',
  'af89aacf-85de-4053-8829-afcdee6e58f3',
  0,
  2500,
  false,
  'primary-authority',
  'Protected area around Buckingham Palace. No drone flights permitted.'
);

-- 4. Houses of Parliament No-Fly Zone
INSERT INTO restriction_zones (
  zone_type, restriction_name, geometry, authority_source, data_source_id,
  altitude_floor, altitude_ceiling, authorization_possible, confidence_level,
  description
) VALUES (
  'no-fly',
  'Westminster Protected Area',
  ST_Multi(ST_Buffer(ST_SetSRID(ST_MakePoint(-0.1246, 51.4995), 4326)::geography, 800)::geometry),
  'CAA',
  'af89aacf-85de-4053-8829-afcdee6e58f3',
  0,
  2500,
  false,
  'primary-authority',
  'Protected area around Houses of Parliament and Westminster Abbey.'
);

-- 5. Tower of London Protected Area
INSERT INTO restriction_zones (
  zone_type, restriction_name, geometry, authority_source, data_source_id,
  altitude_floor, altitude_ceiling, authorization_possible, confidence_level,
  description
) VALUES (
  'no-fly',
  'Tower of London Protected Area',
  ST_Multi(ST_Buffer(ST_SetSRID(ST_MakePoint(-0.0759, 51.5081), 4326)::geography, 600)::geometry),
  'CAA',
  'af89aacf-85de-4053-8829-afcdee6e58f3',
  0,
  2000,
  false,
  'primary-authority',
  'Historic protected site. No drone operations permitted.'
);

-- 6. Olympic Park Controlled Airspace (Authorization Possible)
INSERT INTO restriction_zones (
  zone_type, restriction_name, geometry, authority_source, data_source_id,
  altitude_floor, altitude_ceiling, authorization_possible, confidence_level,
  description,
  effective_start,
  effective_end
) VALUES (
  'controlled-airspace',
  'Olympic Park Controlled Zone',
  ST_Multi(ST_Buffer(ST_SetSRID(ST_MakePoint(-0.0157, 51.5434), 4326)::geography, 1500)::geometry),
  'CAA',
  'af89aacf-85de-4053-8829-afcdee6e58f3',
  0,
  1000,
  true,
  'primary-authority',
  'Controlled airspace around Olympic Park. Authorization required from local authority.',
  '2024-01-01 00:00:00',
  NULL
);

-- 7. Temporary Event Restriction - Hyde Park Concert
INSERT INTO restriction_zones (
  zone_type, restriction_name, geometry, authority_source, data_source_id,
  altitude_floor, altitude_ceiling, authorization_possible, confidence_level,
  description,
  effective_start,
  effective_end
) VALUES (
  'temporary-restriction',
  'Hyde Park Summer Concert TFR',
  ST_Multi(ST_Buffer(ST_SetSRID(ST_MakePoint(-0.1656, 51.5074), 4326)::geography, 3000)::geometry),
  'CAA',
  'af89aacf-85de-4053-8829-afcdee6e58f3',
  0,
  3000,
  false,
  'primary-authority',
  'Temporary Flight Restriction for major outdoor concert event.',
  '2026-07-15 14:00:00',
  '2026-07-15 23:59:59'
);

-- 8. Richmond Park Controlled Zone (Recreational Flying Allowed with Authorization)
INSERT INTO restriction_zones (
  zone_type, restriction_name, geometry, authority_source, data_source_id,
  altitude_floor, altitude_ceiling, authorization_possible, confidence_level,
  description
) VALUES (
  'controlled-airspace',
  'Richmond Park Aviation Zone',
  ST_Multi(ST_Buffer(ST_SetSRID(ST_MakePoint(-0.2865, 51.4514), 4326)::geography, 2000)::geometry),
  'CAA',
  'af89aacf-85de-4053-8829-afcdee6e58f3',
  0,
  800,
  true,
  'primary-authority',
  'Recreational drone flying permitted below 400ft with Royal Parks authorization.'
);

-- ============================================================================
-- AIRSPACE CLASSIFICATIONS
-- ============================================================================

-- 1. Class D Airspace - Heathrow Control Zone
INSERT INTO airspace_classifications (
  class_designation, airspace_name, geometry, altitude_floor, altitude_ceiling,
  controlling_authority, rules_description, uas_authorization_required,
  authorization_process, data_source_id
) VALUES (
  'D',
  'Heathrow Control Zone',
  ST_Multi(ST_Buffer(ST_SetSRID(ST_MakePoint(-0.4543, 51.4700), 4326)::geography, 15000)::geometry),
  0,
  5500,
  'NATS',
  'Controlled airspace around London Heathrow. ATC clearance required for all operations.',
  true,
  'Contact NATS London Terminal Control',
  'b1234567-89ab-cdef-0123-456789abcdef'
);

-- 2. Class D Airspace - London City Airport CTR
INSERT INTO airspace_classifications (
  class_designation, airspace_name, geometry, altitude_floor, altitude_ceiling,
  controlling_authority, rules_description, uas_authorization_required,
  authorization_process, data_source_id
) VALUES (
  'D',
  'London City Airport Control Zone',
  ST_Multi(ST_Buffer(ST_SetSRID(ST_MakePoint(0.0553, 51.5053), 4326)::geography, 8000)::geometry),
  0,
  2500,
  'NATS',
  'Class D controlled airspace. UAS operations require explicit authorization.',
  true,
  'Contact London City Airport ATC',
  'b1234567-89ab-cdef-0123-456789abcdef'
);

-- 3. Class G Airspace - Greater London Area
INSERT INTO airspace_classifications (
  class_designation, airspace_name, geometry, altitude_floor, altitude_ceiling,
  controlling_authority, rules_description, uas_authorization_required,
  authorization_process, data_source_id
) VALUES (
  'G',
  'London Class G Airspace',
  ST_Multi(ST_MakeEnvelope(-0.6, 51.3, 0.3, 51.7, 4326)),
  0,
  2000,
  'CAA',
  'Uncontrolled airspace. Drone Code applies. Stay below 400ft, maintain VLOS, respect privacy.',
  false,
  'Follow CAA Drone Code. No authorization required but all regulations apply.',
  'b1234567-89ab-cdef-0123-456789abcdef'
);

-- 4. Class E Airspace - London Terminal Control Area (Upper)
INSERT INTO airspace_classifications (
  class_designation, airspace_name, geometry, altitude_floor, altitude_ceiling,
  controlling_authority, rules_description, uas_authorization_required,
  authorization_process, data_source_id
) VALUES (
  'E',
  'London TMA Upper',
  ST_Multi(ST_MakeEnvelope(-0.8, 51.2, 0.5, 51.8, 4326)),
  5500,
  19500,
  'NATS',
  'Class E controlled airspace. IFR traffic separation provided. UAS operations above 5500ft require special authorization.',
  true,
  'Contact NATS for high-altitude UAS operations',
  'b1234567-89ab-cdef-0123-456789abcdef'
);

-- ============================================================================
-- TOAL SITES (Take-Off And Landing Sites)
-- ============================================================================

-- 1. Hampstead Heath - Public TOAL
INSERT INTO toal_sites (
  site_name, geometry, access_type, surface_type,
  operating_hours, contact_info, verified, data_source,
  facilities, restrictions
) VALUES (
  'Hampstead Heath Recreation Ground',
  ST_SetSRID(ST_MakePoint(-0.1644, 51.5598), 4326),
  'public',
  'grass',
  'Dawn to dusk daily',
  'City of London Corporation: 020 7332 3322',
  true,
  'DfT',
  '{"parking": true, "toilets": true, "max_weight_kg": 25}'::jsonb,
  'Large open space suitable for recreational drone flying. Keep away from populated areas and maintain VLOS.'
);

-- 2. Primrose Hill - Public TOAL
INSERT INTO toal_sites (
  site_name, geometry, access_type, surface_type,
  operating_hours, contact_info, verified, data_source,
  facilities, restrictions
) VALUES (
  'Primrose Hill Summit',
  ST_SetSRID(ST_MakePoint(-0.1635, 51.5410), 4326),
  'public',
  'grass',
  '24/7',
  'Royal Parks: 0300 061 2000',
  true,
  'DfT',
  '{"parking": true, "scenic_view": true, "max_weight_kg": 25}'::jsonb,
  'Elevated location with good sightlines. Popular for aerial photography. Respect other park users and maintain safe distance.'
);

-- 3. Victoria Park - Public TOAL
INSERT INTO toal_sites (
  site_name, geometry, access_type, surface_type,
  operating_hours, contact_info, verified, data_source,
  facilities, restrictions
) VALUES (
  'Victoria Park East Meadow',
  ST_SetSRID(ST_MakePoint(-0.0336, 51.5319), 4326),
  'public',
  'grass',
  '7:00 AM - 9:00 PM',
  'Tower Hamlets Parks: 020 7364 5000',
  true,
  'DfT',
  '{"parking": true, "cafe": true, "max_weight_kg": 25}'::jsonb,
  'Large park in East London. Fly from open meadow areas away from playgrounds and sports pitches.'
);

-- 4. Burgess Park - Public TOAL
INSERT INTO toal_sites (
  site_name, geometry, access_type, surface_type,
  operating_hours, contact_info, verified, data_source,
  facilities, restrictions
) VALUES (
  'Burgess Park North Field',
  ST_SetSRID(ST_MakePoint(-0.0849, 51.4834), 4326),
  'public',
  'grass',
  '7:00 AM - 8:00 PM',
  'Southwark Parks: 020 7525 5000',
  true,
  'DfT',
  '{"parking": true, "sports_facilities": true, "max_weight_kg": 25}'::jsonb,
  'South London park with designated open areas for recreation. Avoid BMX track and sports areas.'
);

-- 5. Wimbledon Common - Public TOAL
INSERT INTO toal_sites (
  site_name, geometry, access_type, surface_type,
  operating_hours, contact_info, verified, data_source,
  facilities, restrictions
) VALUES (
  'Wimbledon Common',
  ST_SetSRID(ST_MakePoint(-0.2399, 51.4314), 4326),
  'public',
  'grass',
  'Dawn to dusk',
  'Wimbledon Common Conservators: 020 8788 7655',
  true,
  'DfT',
  '{"parking": true, "nature_reserve": true, "max_weight_kg": 25}'::jsonb,
  'Large common with extensive open areas. Avoid populated paths and horse riding routes. Wildlife present.'
);

-- 6. Clapham Common - Public TOAL
INSERT INTO toal_sites (
  site_name, geometry, access_type, surface_type,
  operating_hours, contact_info, verified, data_source,
  facilities, restrictions
) VALUES (
  'Clapham Common Long Pond Area',
  ST_SetSRID(ST_MakePoint(-0.1486, 51.4616), 4326),
  'public',
  'grass',
  '24/7',
  'Lambeth Parks: 020 7926 1000',
  true,
  'DfT',
  '{"parking": true, "transport": "Tube nearby", "max_weight_kg": 25}'::jsonb,
  'Popular South London common. Good for early morning flights to avoid crowds. Respect other users.'
);

-- 7. Commercial TOAL - Olympic Park Authorized Zone
INSERT INTO toal_sites (
  site_name, geometry, access_type, surface_type,
  operating_hours, contact_info, verified, data_source,
  facilities, restrictions
) VALUES (
  'Queen Elizabeth Olympic Park - Commercial Zone',
  ST_SetSRID(ST_MakePoint(-0.0157, 51.5434), 4326),
  'permit-required',
  'paved',
  'By appointment',
  'LLDC Events: bookings@queenelizabetholympicpark.co.uk',
  true,
  'DfT',
  '{"commercial_ops": true, "ground_control": true, "max_weight_kg": 150}'::jsonb,
  'Authorized commercial drone operations only. Pre-booking and authorization required. Event coverage permitted with advance notice.'
);

-- 8. Richmond Park - Restricted TOAL (Authorization Required)
INSERT INTO toal_sites (
  site_name, geometry, access_type, surface_type,
  operating_hours, contact_info, verified, data_source,
  facilities, restrictions
) VALUES (
  'Richmond Park Authorized Flying Area',
  ST_SetSRID(ST_MakePoint(-0.2865, 51.4514), 4326),
  'permit-required',
  'grass',
  '9:00 AM - 6:00 PM (with authorization)',
  'Royal Parks: drone-permits@royalparks.org.uk',
  true,
  'DfT',
  '{"scenic_views": true, "wildlife_area": true, "parking": true, "max_weight_kg": 25}'::jsonb,
  'Royal Park with restricted drone access. Written permission required from Royal Parks. Wildlife present - use extreme caution. Follow all park rules.'
);

-- Display summary
SELECT 'Restriction Zones' as category, COUNT(*) as count FROM restriction_zones
UNION ALL
SELECT 'Airspace Classifications', COUNT(*) FROM airspace_classifications
UNION ALL
SELECT 'TOAL Sites', COUNT(*) FROM toal_sites
UNION ALL
SELECT 'Data Sources', COUNT(*) FROM data_sources;
