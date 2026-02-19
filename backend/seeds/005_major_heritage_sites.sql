-- Curated Major UK Heritage Sites for Testing
-- National Trust and Historic England properties

-- First, let's add more National Trust properties (major tourist sites)
INSERT INTO property_restrictions (
  property_name, managing_organization, restriction_category, geometry,
  policy_text, contact_info, policy_effective_date, data_source_id
) VALUES

-- Stonehenge (World Heritage Site)
('Stonehenge', 'English Heritage', 'HERITAGE_SITE',
  ST_Multi(ST_GeomFromGeoJSON('{"type":"Polygon","coordinates":[[
    [-1.8275, 51.1810], [-1.8230, 51.1815], [-1.8200, 51.1800],
    [-1.8195, 51.1770], [-1.8220, 51.1750], [-1.8260, 51.1755],
    [-1.8285, 51.1775], [-1.8275, 51.1810]
  ]]}')),
  'World Heritage Site. Drone flights strictly prohibited without prior authorization from English Heritage. This is a Scheduled Monument under the Ancient Monuments and Archaeological Areas Act 1979. Special permissions required for any aerial photography.',
  'drones@english-heritage.org.uk', '2020-01-01',
  (SELECT source_id FROM data_sources WHERE authority_name LIKE 'Historic%' LIMIT 1)
),

-- Tower of London
('Tower of London', 'Historic Royal Palaces', 'HERITAGE_SITE',
  ST_Multi(ST_GeomFromGeoJSON('{"type":"Polygon","coordinates":[[
    [-0.0780, 51.5085], [-0.0750, 51.5090], [-0.0735, 51.5075],
    [-0.0740, 51.5055], [-0.0770, 51.5050], [-0.0785, 51.5070],
    [-0.0780, 51.5085]
  ]]}')),
  'World Heritage Site and Royal Palace. Drone flights strictly prohibited. This is a security-sensitive location with no-fly restrictions.',
  'info@hrp.org.uk', '2020-01-01',
  (SELECT source_id FROM data_sources WHERE authority_name LIKE 'Historic%' LIMIT 1)
),

-- Bath (World Heritage City)
('City of Bath World Heritage Site', 'Bath & North East Somerset Council', 'HERITAGE_SITE',
  ST_Multi(ST_GeomFromGeoJSON('{"type":"Polygon","coordinates":[[
    [-2.3700, 51.3900], [-2.3500, 51.3920], [-2.3450, 51.3850],
    [-2.3480, 51.3750], [-2.3650, 51.3730], [-2.3750, 51.3820],
    [-2.3700, 51.3900]
  ]]}')),
  'UNESCO World Heritage Site. Drone use requires permission from Bath & North East Somerset Council. Respectful flying practices essential in this historic urban environment.',
  'heritage@bathnes.gov.uk', '2020-01-01',
  (SELECT source_id FROM data_sources WHERE authority_name = 'National Trust' LIMIT 1)
),

-- Lake District National Park (major NT area)
('Castlerigg Stone Circle', 'National Trust', 'HERITAGE_SITE',
  ST_Multi(ST_GeomFromGeoJSON('{"type":"Polygon","coordinates":[[
    [-3.0990, 54.6040], [-3.0970, 54.6050], [-3.0950, 54.6035],
    [-3.0960, 54.6015], [-3.0985, 54.6010], [-3.1000, 54.6025],
    [-3.0990, 54.6040]
  ]]}')),
  'National Trust property in Lake District National Park. Scheduled Ancient Monument. Drone flights permitted with responsible practices. Respect archaeological site and visitor privacy.',
  'lakedistrict@nationaltrust.org.uk', '2024-01-01',
  (SELECT source_id FROM data_sources WHERE authority_name = 'National Trust' LIMIT 1)
),

-- Peak District - Chatsworth
('Chatsworth House', 'Chatsworth House Trust', 'HERITAGE_SITE',
  ST_Multi(ST_GeomFromGeoJSON('{"type":"Polygon","coordinates":[[
    [-1.6120, 53.2280], [-1.6050, 53.2300], [-1.6010, 53.2260],
    [-1.6030, 53.2220], [-1.6090, 53.2210], [-1.6130, 53.2250],
    [-1.6120, 53.2280]
  ]]}')),
  'Historic house and gardens. Drone flights require prior written permission. Contact estate office for authorization. Commercial filming strictly regulated.',
  'info@chatsworth.org', '2020-01-01',
  (SELECT source_id FROM data_sources WHERE authority_name = 'National Trust' LIMIT 1)
),

-- Edinburgh Castle(Scotland's most visited site)
('Edinburgh Castle', 'Historic Environment Scotland', 'HERITAGE_SITE',
  ST_Multi(ST_GeomFromGeoJSON('{"type":"Polygon","coordinates":[[
    [-3.2010, 55.9495], [-3.1980, 55.9500], [-3.1970, 55.9485],
    [-3.1975, 55.9475], [-3.2000, 55.9470], [-3.2015, 55.9485],
    [-3.2010, 55.9495]
  ]]}')),
  'Scheduled Ancient Monument and military installation. Drone flights strictly prohibited. This is a security-sensitive location.',
  'hs.drones@gov.scot', '2020-01-01',
  (SELECT source_id FROM data_sources WHERE authority_name LIKE 'Historic%' LIMIT 1)
),

-- White Cliffs of Dover
('White Cliffs of Dover', 'National Trust', 'HERITAGE_SITE',
  ST_Multi(ST_GeomFromGeoJSON('{"type":"Polygon","coordinates":[[
    [1.3200, 51.1300], [1.3350, 51.1350], [1.3400, 51.1310],
    [1.3380, 51.1260], [1.3250, 51.1230], [1.3180, 51.1270],
    [1.3200, 51.1300]
  ]]}')),
  'National Trust coastal property. Drone flights permitted with responsible practices. Be aware of high winds, cliff edges, and migrating birds. Avoid disturbance to ground-nesting seabirds (March-August).',
  'whitecliffs@nationaltrust.org.uk', '2024-01-01',
  (SELECT source_id FROM data_sources WHERE authority_name = 'National Trust' LIMIT 1)
),

-- Giant's Causeway (Northern Ireland)
('Giant''s Causeway', 'National Trust', 'HERITAGE_SITE',
  ST_Multi(ST_GeomFromGeoJSON('{"type":"Polygon","coordinates":[[
    [-6.5120, 55.2410], [-6.5080, 55.2425], [-6.5050, 55.2405],
    [-6.5065, 55.2385], [-6.5100, 55.2380], [-6.5130, 55.2395],
    [-6.5120, 55.2410]
  ]]}')),
  'UNESCO World Heritage Site managed by National Trust. Drone flights require National Trust permission. Area of Outstanding Natural Beauty with sensitive geology and wildlife.',
  'giantscauseway@nationaltrust.org.uk', '2024-01-01',
  (SELECT source_id FROM data_sources WHERE authority_name = 'National Trust' LIMIT 1)
)

ON CONFLICT DO NOTHING;

-- Mark RETURNING clause
SELECT COUNT(*) as heritage_sites_added FROM property_restrictions WHERE restriction_category = 'HERITAGE_SITE';
