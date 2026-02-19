-- Clear test property restrictions
DELETE FROM property_restrictions WHERE managing_organization IN ('Historic Royal Palaces', 'Royal Household', 'Church of England');

-- Add real London heritage sites with accurate locations and policies
INSERT INTO property_restrictions (
  property_name,
  managing_organization,
  restriction_category,
  geometry,
  policy_text,
  contact_info,
  data_source_id
) VALUES
-- Tower of London (real coordinates)
(
  'Tower of London',
  'Historic Royal Palaces',
  'HERITAGE_SITE',
  ST_GeomFromGeoJSON('{"type":"MultiPolygon","coordinates":[[[[-0.0761,51.5081],[-0.0761,51.5086],[-0.0751,51.5086],[-0.0751,51.5081],[-0.0761,51.5081]]]]}'),
  'Drone flights over or near the Tower of London require prior written authorization from Historic Royal Palaces. Unauthorized drone operations within sight of this UNESCO World Heritage Site are prohibited under Article 241 of the Air Navigation Order 2016. The Tower houses Crown Jewels and sensitive security operations.',
  'security@hrp.org.uk',
  (SELECT source_id FROM data_sources WHERE authority_name = 'Historic England' LIMIT 1)
),
-- Buckingham Palace  
(
  'Buckingham Palace',
  'Royal Household',
  'HERITAGE_SITE',
  ST_GeomFromGeoJSON('{"type":"MultiPolygon","coordinates":[[[[-0.1419,51.5014],[-0.1419,51.5023],[-0.1404,51.5023],[-0.1404,51.5014],[-0.1419,51.5014]]]]}'),
  'Drone operations prohibited within 500m of Buckingham Palace under Royal Parks and Other Open Spaces Regulations 1997. This is a security-sensitive location and unauthorized drone flights may result in prosecution.',
  'royalparks@royalparks.org.uk',
  (SELECT source_id FROM data_sources WHERE authority_name = 'MoD' LIMIT 1)
),
-- Houses of Parliament
(
  'Palace of Westminster',
  'UK Parliament',
  'HERITAGE_SITE',
  ST_GeomFromGeoJSON('{"type":"MultiPolygon","coordinates":[[[[-0.1246,51.4995],[-0.1246,51.5007],[-0.1227,51.5007],[-0.1227,51.4995],[-0.1246,51.4995]]]]}'),
  'Drone operations strictly prohibited under Counter-Terrorism Act 2008. Palace of Westminster is a security-restricted site. Drone detection systems are active. Violations will be prosecuted.',
  'security@parliament.uk',
  (SELECT source_id FROM data_sources WHERE authority_name = 'MoD' LIMIT 1)
),
-- St Paul Cathedral
(
  'St Paul Cathedral', 
  'Chapter of St Paul Cathedral',
  'HERITAGE_SITE',
  ST_GeomFromGeoJSON('{"type":"MultiPolygon","coordinates":[[[[-0.0983,51.5138],[-0.0983,51.5142],[-0.0976,51.5142],[-0.0976,51.5138],[-0.0983,51.5138]]]]}'),
  'Drone flights require prior written permission from the Cathedral Chapter. St Paul is a working place of worship and Grade I listed building. Respectful distance required during services.',
  'info@stpaulscathedral.org.uk',
  (SELECT source_id FROM data_sources WHERE authority_name = 'Historic England' LIMIT 1)
),
-- Greenwich Observatory
(
  'Royal Observatory Greenwich',
  'Royal Museums Greenwich',
  'HERITAGE_SITE',
  ST_GeomFromGeoJSON('{"type":"MultiPolygon","coordinates":[[[[0.0014,51.4769],[0.0014,51.4780],[0.0002,51.4780],[0.0002,51.4769],[0.0014,51.4769]]]]}'),
  'Drone use permitted with responsible flying practices. Avoid disturbing visitors and maintain safe distance from buildings. Part of UNESCO Maritime Greenwich World Heritage Site.',
  'info@rmg.co.uk',
  (SELECT source_id FROM data_sources WHERE authority_name = 'Historic England' LIMIT 1)
),
-- Hampton Court Palace
(
  'Hampton Court Palace',
  'Historic Royal Palaces',
  'HERITAGE_SITE',
  ST_GeomFromGeoJSON('{"type":"MultiPolygon","coordinates":[[[[-0.3369,51.4035],[-0.3369,51.4045],[-0.3354,51.4045],[-0.3354,51.4035],[-0.3369,51.4035]]]]}'),
  'Drone flights over Hampton Court Palace and gardens require written authorization. Contact Historic Royal Palaces Events & Filming team at least 14 days in advance.',
  'filming@hrp.org.uk',
  (SELECT source_id FROM data_sources WHERE authority_name = 'Historic England' LIMIT 1)
),
-- Kew Gardens (SSSI example)
(
  'Royal Botanic Gardens Kew',
  'Royal Botanic Gardens',
  'SSSI',
  ST_GeomFromGeoJSON('{"type":"MultiPolygon","coordinates":[[[[-0.2948,51.4778],[-0.2948,51.4821],[-0.2878,51.4821],[-0.2878,51.4778],[-0.2948,51.4778]]]]}'),
  'Site of Special Scientific Interest (SSSI). Drone flights prohibited under Wildlife and Countryside Act 1981 to protect rare botanical specimens and nesting birds. Natural England authorization required.',
  'info@kew.org',
  (SELECT source_id FROM data_sources WHERE authority_name = 'Historic England' LIMIT 1)
),
-- Richmond Park SSSI
(
  'Richmond Park SSSI',
  'The Royal Parks',
  'SSSI',
  ST_GeomFromGeoJSON('{"type":"MultiPolygon","coordinates":[[[[-0.2851,51.4314],[-0.2851,51.4521],[-0.2541,51.4521],[-0.2541,51.4314],[-0.2851,51.4314]]]]}'),
  'Site of Special Scientific Interest with protected deer populations and ancient trees. Drone use prohibited April-July (breeding season) and requires Natural England license year-round.',
  'richmond@royalparks.org.uk',
  (SELECT source_id FROM data_sources WHERE authority_name = 'Historic England' LIMIT 1)
);

-- Show import summary
SELECT 
  restriction_category,
  COUNT(*) as count,
  STRING_AGG(property_name, ', ' ORDER BY property_name) as properties
FROM property_restrictions 
GROUP BY restriction_category;
