-- Insert Hindhead Common test data
-- This provides test data for troubleshooting property restrictions display

-- First, ensure National Trust data source exists
INSERT INTO data_sources (
  authority_name,
  data_type_provided,
  reliability_level,
  data_url,
  license,
  attribution,
  sync_frequency
) VALUES (
  'National Trust',
  ARRAY['property-restrictions', 'heritage-site'],
  'official-secondary',
  'https://www.nationaltrust.org.uk/',
  'Open Government Licence v3.0',
  'Contains National Trust data © The National Trust',
  'Weekly'
) ON CONFLICT DO NOTHING;

-- Insert Hindhead Common and Devil's Punch Bowl
-- Coordinates: Center at 51.1156° N, -0.7237° E
-- Realistic boundary approximating the actual National Trust property
-- Based on the main heathland area including the Devil's Punch Bowl geological feature
INSERT INTO property_restrictions (
  property_name,
  managing_organization,
  geometry,
  policy_text,
  contact_info,
  policy_effective_date,
  data_source_id
)
SELECT
  'Hindhead Common and the Devil''s Punch Bowl',
  'National Trust',
  ST_Multi(ST_GeomFromGeoJSON('{"type":"Polygon","coordinates":[[
    [-0.7320, 51.1220],
    [-0.7280, 51.1235],
    [-0.7240, 51.1240],
    [-0.7200, 51.1235],
    [-0.7165, 51.1220],
    [-0.7140, 51.1195],
    [-0.7130, 51.1170],
    [-0.7125, 51.1140],
    [-0.7130, 51.1110],
    [-0.7145, 51.1085],
    [-0.7170, 51.1070],
    [-0.7200, 51.1060],
    [-0.7235, 51.1055],
    [-0.7270, 51.1060],
    [-0.7300, 51.1070],
    [-0.7325, 51.1085],
    [-0.7340, 51.1105],
    [-0.7350, 51.1130],
    [-0.7345, 51.1155],
    [-0.7335, 51.1180],
    [-0.7320, 51.1200],
    [-0.7320, 51.1220]
  ]]}')),
  'National Trust property with open public access. This Site of Special Scientific Interest (SSSI) includes heathland and woodlands of national importance. Drone flights are permitted with responsible flying practices: maintain safe distance from wildlife, visitors, and SSSI protected areas; fly below 120m altitude; avoid disturbance to ground-nesting birds (March-August); respect visitor privacy; comply with CAA regulations. The Devil''s Punch Bowl is a 282-hectare landscape managed for conservation. For commercial filming, contact the property team.',
  'hindheadcommons@nationaltrust.org.uk',
  '2024-01-01'::date,
  source_id
FROM data_sources
WHERE authority_name = 'National Trust'
LIMIT 1;

-- Verify insertion
SELECT 
  property_name,
  managing_organization,
  ST_AsText(ST_Centroid(geometry)) as center_point,
  SUBSTRING(policy_text, 1, 100) || '...' as policy_excerpt
FROM property_restrictions
WHERE property_name ILIKE '%hindhead%';
