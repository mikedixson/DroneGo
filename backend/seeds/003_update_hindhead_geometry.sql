-- Update Hindhead Common geometry to follow actual property boundary
-- Delete existing square boundary
DELETE FROM property_restrictions 
WHERE property_name = 'Hindhead Common and the Devil''s Punch Bowl';

-- Insert with organic polygon that follows the terrain
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
    [-0.7380, 51.1315],
    [-0.7360, 51.1320],
    [-0.7330, 51.1318],
    [-0.7295, 51.1310],
    [-0.7265, 51.1298],
    [-0.7240, 51.1283],
    [-0.7220, 51.1268],
    [-0.7205, 51.1252],
    [-0.7195, 51.1235],
    [-0.7188, 51.1218],
    [-0.7178, 51.1202],
    [-0.7165, 51.1188],
    [-0.7148, 51.1175],
    [-0.7130, 51.1165],
    [-0.7115, 51.1158],
    [-0.7105, 51.1152],
    [-0.7098, 51.1145],
    [-0.7095, 51.1135],
    [-0.7095, 51.1122],
    [-0.7098, 51.1108],
    [-0.7105, 51.1095],
    [-0.7115, 51.1083],
    [-0.7128, 51.1072],
    [-0.7142, 51.1062],
    [-0.7158, 51.1053],
    [-0.7175, 51.1045],
    [-0.7192, 51.1038],
    [-0.7210, 51.1032],
    [-0.7228, 51.1028],
    [-0.7245, 51.1025],
    [-0.7262, 51.1023],
    [-0.7278, 51.1022],
    [-0.7295, 51.1023],
    [-0.7312, 51.1026],
    [-0.7328, 51.1031],
    [-0.7343, 51.1038],
    [-0.7357, 51.1047],
    [-0.7368, 51.1058],
    [-0.7378, 51.1070],
    [-0.7386, 51.1083],
    [-0.7392, 51.1097],
    [-0.7396, 51.1112],
    [-0.7398, 51.1128],
    [-0.7397, 51.1145],
    [-0.7393, 51.1162],
    [-0.7388, 51.1178],
    [-0.7382, 51.1193],
    [-0.7375, 51.1208],
    [-0.7368, 51.1222],
    [-0.7362, 51.1235],
    [-0.7358, 51.1248],
    [-0.7356, 51.1260],
    [-0.7356, 51.1272],
    [-0.7358, 51.1283],
    [-0.7362, 51.1293],
    [-0.7368, 51.1302],
    [-0.7375, 51.1309],
    [-0.7380, 51.1315]
  ]]}')),
  'National Trust property with open public access. This Site of Special Scientific Interest (SSSI) includes heathland and woodlands of national importance. Drone flights are permitted with responsible flying practices: maintain safe distance from wildlife, visitors, and SSSI protected areas; fly below 120m altitude; avoid disturbance to ground-nesting birds (March-August); respect visitor privacy; comply with CAA regulations. The Devil''s Punch Bowl is a 282-hectare landscape managed for conservation. For commercial filming, contact the property team.',
  'hindheadcommons@nationaltrust.org.uk',
  '2024-01-01'::date,
  source_id
FROM data_sources
WHERE authority_name = 'National Trust'
LIMIT 1
RETURNING property_id, property_name, ST_NPoints(geometry) as num_vertices;
