-- Insert sample heritage sites for testing
WITH nt_source AS (
  SELECT source_id FROM data_sources WHERE authority_name = 'National Trust' LIMIT 1
)
INSERT INTO property_restrictions (
  property_name, 
  managing_organization, 
  geometry, 
  policy_text,
  contact_info,
  restriction_category,
  data_source_id,
  policy_effective_date
) 
SELECT 
  'Tower of London',
  'Historic England',
  ST_Multi(ST_GeomFromGeoJSON('{"type":"Polygon","coordinates":[[[-0.076132,51.508112],[-0.076132,51.509],[-0.075,51.509],[-0.075,51.508112],[-0.076132,51.508112]]]}'))::geometry(MULTIPOLYGON, 4326),
  'Historic heritage site. Drone flights require advance permission from site management.',
  'heritage@historicengland.org.uk',
  'HERITAGE_SITE',
  source_id,
  CURRENT_DATE
FROM nt_source
UNION ALL
SELECT 
  'Westminster Abbey',
  'Historic England',
  ST_Multi(ST_GeomFromGeoJSON('{"type":"Polygon","coordinates":[[[-0.1275,51.4994],[-0.1275,51.5002],[-0.1265,51.5002],[-0.1265,51.4994],[-0.1275,51.4994]]]}'))::geometry(MULTIPOLYGON, 4326),
  'Protected religious heritage site. No drone flights permitted without express written authorization.',
  'heritage@historicengland.org.uk',
  'HERITAGE_SITE',
  source_id,
  CURRENT_DATE
FROM nt_source
UNION ALL
SELECT 
  'Kew Gardens',
  'Royal Botanic Gardens',
  ST_Multi(ST_GeomFromGeoJSON('{"type":"Polygon","coordinates":[[[-0.295,51.475],[-0.295,51.485],[-0.280,51.485],[-0.280,51.475],[-0.295,51.475]]]}'))::geometry(MULTIPOLYGON, 4326),
  'Royal Botanic Gardens. Drone use requires prior approval from gardens management. Respect visitor privacy and plant protection protocols.',
  'info@kew.org',
  'HERITAGE_SITE',
  source_id,
  CURRENT_DATE
FROM nt_source
UNION ALL
SELECT 
  'Greenwich Park Heritage Site',
  'Royal Parks',
  ST_Multi(ST_GeomFromGeoJSON('{"type":"Polygon","coordinates":[[[-0.001,51.476],[-0.001,51.483],[0.005,51.483],[0.005,51.476],[-0.001,51.476]]]}'))::geometry(MULTIPOLYGON, 4326),
  'Royal Park with heritage status. Drone flights allowed but restricted near observatory and palace buildings. Follow Royal Parks regulations.',
  'parks@royalparks.org.uk',
  'HERITAGE_SITE',
  source_id,
  CURRENT_DATE
FROM nt_source;
