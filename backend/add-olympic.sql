INSERT INTO toal_sites (
  site_name, geometry, access_type, surface_type,
  operating_hours, contact_info, verified, data_source,
  facilities, restrictions
) VALUES (
  'Queen Elizabeth Olympic Park',
  ST_SetSRID(ST_MakePoint(-0.0157, 51.5434), 4326),
  'permit-required',
  'concrete',
  'By appointment',
  'LLDC Events',
  true,
  'DfT',
  '{"commercial": true}'::jsonb,
  'Commercial ops - booking required'
);
