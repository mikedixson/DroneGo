-- SSSI Protected Areas for Testing
-- Sites of Special Scientific Interest (legally protected)

INSERT INTO property_restrictions (
  property_name, managing_organization, restriction_category, geometry,
  policy_text, contact_info, policy_effective_date, data_source_id
) VALUES

-- Salisbury Plain SSSI (near Stonehenge)
('Salisbury Plain SSSI', 'Natural England', 'SSSI',
  ST_Multi(ST_GeomFromGeoJSON('{"type":"Polygon","coordinates":[[
    [-1.9500, 51.2200], [-1.8800, 51.2300], [-1.8500, 51.1900],
    [-1.8700, 51.1600], [-1.9300, 51.1550], [-1.9600, 51.1900],
    [-1.9500, 51.2200]
  ]]}')),
  'Site of Special Scientific Interest under Wildlife & Countryside Act 1981. Chalk grassland with rare flora and fauna. Drone flights prohibited without Natural England authorization. Ground-nesting birds present March-September. Military training area - additional MOD restrictions apply.',
  'enquiries@naturalengland.org.uk', '2020-01-01',
  (SELECT source_id FROM data_sources WHERE authority_name = 'National Trust' LIMIT 1)
),

-- Lake District Uplands SSSI
('Borrowdale Woodland SSSI', 'Natural England', 'SSSI',
  ST_Multi(ST_GeomFromGeoJSON('{"type":"Polygon","coordinates":[[
    [-3.1500, 54.5500], [-3.1200, 54.5600], [-3.1000, 54.5400],
    [-3.1100, 54.5200], [-3.1400, 54.5150], [-3.1600, 54.5350],
    [-3.1500, 54.5500]
  ]]}')),
  'SSSI designation for ancient Atlantic oak woodland. Rare lichens, bryophytes, and woodland birds. Drone flights may disturb wildlife and are strongly discouraged. Authorization required from Natural England for any aerial surveys.',
  'cumbria@naturalengland.org.uk', '2020-01-01',
  (SELECT source_id FROM data_sources WHERE authority_name = 'National Trust' LIMIT 1)
),

-- Peak District Limestone Dale
(' Lathkill Dale SSSI', 'Natural England', 'SSSI',
  ST_Multi(ST_GeomFromGeoJSON('{"type":"Polygon","coordinates":[[
    [-1.7200, 53.1800], [-1.7000, 53.1850], [-1.6850, 53.1750],
    [-1.6900, 53.1650], [-1.7100, 53.1620], [-1.7250, 53.1720],
    [-1.7200, 53.1800]
  ]]}')),
  'Limestone dale SSSI with rare plants and wildlife. Contains spawning grounds for rare fish species. Drone use prohibited to prevent disturbance. Nesting birds present March-August.',
  'peakdistrict@naturalengland.org.uk', '2020-01-01',
  (SELECT source_id FROM data_sources WHERE authority_name = 'National Trust' LIMIT 1)
),

-- Dover Cliffs SSSI
('Dover to Kingsdown Cliffs SSSI', 'Natural England', 'SSSI',
  ST_Multi(ST_GeomFromGeoJSON('{"type":"Polygon","coordinates":[[
    [1.3150, 51.1350], [1.3450, 51.1400], [1.3500, 51.1300],
    [1.3480, 51.1200], [1.3200, 51.1180], [1.3100, 51.1280],
    [1.3150, 51.1350]
  ]]}')),
  'Chalk cliffs SSSI with nesting seabirds including kittiwakes and fulmars. Designated for geology and coastal habitats. Drone flights prohibited during nesting season (March-August). Year-round authorization required from Natural England.',
  'kent@naturalengland.org.uk', '2020-01-01',
  (SELECT source_id FROM data_sources WHERE authority_name = 'National Trust' LIMIT 1)
),

-- Edinburgh - Arthur's Seat SSSI
('Arthur''s Seat & Salisbury Crags SSSI', 'NatureScot', 'SSSI',
  ST_Multi(ST_GeomFromGeoJSON('{"type":"Polygon","coordinates":[[
    [-3.1650, 55.9500], [-3.1550, 55.9550], [-3.1500, 55.9480],
    [-3.1520, 55.9420], [-3.1600, 55.9400], [-3.1670, 55.9450],
    [-3.1650, 55.9500]
  ]]}')),
  'Geological SSSI of international importance. Volcanic geology with rare rock formations. Nesting peregrine falcons present. Drone flights require NatureScot authorization. High visitor numbers - maintain safe distance from people.',
  'licensing@nature.scot', '2020-01-01',
  (SELECT source_id FROM data_sources WHERE authority_name = 'National Trust' LIMIT 1)
),

-- Giant's Causeway Coast SSSI
('Giant''s Causeway Coast SSSI', 'DAERA Northern Ireland', 'SSSI',
  ST_Multi(ST_GeomFromGeoJSON('{"type":"Polygon","coordinates":[[
    [-6.5200, 55.2450], [-6.5000, 55.2480], [-6.4950, 55.2380],
    [-6.5000, 55.2330], [-6.5150, 55.2320], [-6.5220, 55.2380],
    [-6.5200, 55.2450]
  ]]}')),
  'Coastal SSSI with internationally important geology and seabird colonies. Basalt formations of global significance. Drone use requires DAERA authorization. Nesting seabirds March-August - disturbance is a criminal offence.',
  'daera.ni@daera-ni.gov.uk', '2020-01-01',
  (SELECT source_id FROM data_sources WHERE authority_name = 'National Trust' LIMIT 1)
)

ON CONFLICT DO NOTHING;

SELECT COUNT(*) as sssi_sites_added FROM property_restrictions WHERE restriction_category = 'SSSI';
