-- Add remaining TOAL sites
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
  'Authorized commercial drone operations only. Pre-booking and authorization required.'
);

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
  'Royal Park with restricted drone access. Written permission required from Royal Parks.'
);

-- Display final counts
SELECT 'Restriction Zones' as category, COUNT(*) as count FROM restriction_zones
UNION ALL
SELECT 'Airspace Classifications', COUNT(*) FROM airspace_classifications
UNION ALL
SELECT 'TOAL Sites', COUNT(*) FROM toal_sites;
