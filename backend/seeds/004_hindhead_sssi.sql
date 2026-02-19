-- Add separate National Trust and SSSI records for Hindhead
-- National Trust: General property with advisory policy (amber)
-- SSSI: Legally protected area (red, no-fly)

-- First update the existing record to be National Trust category
UPDATE property_restrictions 
SET restriction_category = 'HERITAGE_SITE',
    policy_text = 'National Trust property with open public access. Drone flights are permitted with responsible flying practices: maintain safe distance from wildlife and visitors; fly below 120m altitude; avoid disturbance to ground-nesting birds (March-August); respect visitor privacy; comply with CAA regulations. For commercial filming, contact the property team.'
WHERE property_name = 'Hindhead Common and the Devil''s Punch Bowl';

-- Insert SSSI protected area (inner core of Devil's Punch Bowl)
INSERT INTO property_restrictions (
  property_name,
  managing_organization,
  restriction_category,
  geometry,
  policy_text,
  contact_info,
  policy_effective_date,
  data_source_id
)
SELECT
  'Hindhead Common SSSI',
  'Natural England',
  'SSSI',
  ST_Multi(ST_GeomFromGeoJSON('{"type":"Polygon","coordinates":[[
    [-0.7310, 51.1180],
    [-0.7280, 51.1195],
    [-0.7245, 51.1200],
    [-0.7210, 51.1195],
    [-0.7185, 51.1175],
    [-0.7170, 51.1150],
    [-0.7165, 51.1120],
    [-0.7170, 51.1090],
    [-0.7185, 51.1065],
    [-0.7210, 51.1050],
    [-0.7240, 51.1045],
    [-0.7270, 51.1048],
    [-0.7295, 51.1055],
    [-0.7315, 51.1068],
    [-0.7330, 51.1085],
    [-0.7340, 51.1105],
    [-0.7342, 51.1125],
    [-0.7338, 51.1145],
    [-0.7328, 51.1165],
    [-0.7310, 51.1180]
  ]]}')),
  'Site of Special Scientific Interest. SSSI designation under Wildlife and Countryside Act 1981. This protected area includes heathland and woodlands of national importance. Drone flights over SSSI areas may require authorization from Natural England. Ground-nesting birds present March-August. Commercial operations prohibited without permission. Recreational drone use strongly discouraged to minimize wildlife disturbance.',
  'sssi@naturalengland.org.uk',
  '2020-01-01',
  (SELECT source_id FROM data_sources WHERE authority_name = 'National Trust' LIMIT 1)
RETURNING property_id, property_name, restriction_category, ST_NPoints(geometry) as num_vertices;
