-- Seed: 001_data_sources.sql
-- Description: Seed initial data source records (CAA, NATS, NOTAM)
-- Date: 2026-02-17

-- Insert UK Civil Aviation Authority (CAA) as primary data source
INSERT INTO data_sources (
  authority_name,
  data_type,
  confidence_level,
  api_endpoint,
  license_info,
  update_frequency
) VALUES (
  'UK Civil Aviation Authority',
  'Restriction Zones',
  'primary-authority',
  'https://nats-uk.ead-it.com/cms-nats/opencms/en/Publications/AIP/',
  'Open Government License v3.0',
  'daily'
), (
  'UK Civil Aviation Authority',
  'Flight Restriction Zones',
  'primary-authority',
  'https://www.caa.co.uk/commercial-industry/airspace/airspace-restrictions/',
  'Open Government License v3.0',
  'weekly'
);

-- Insert NATS (National Air Traffic Services) as primary source
INSERT INTO data_sources (
  authority_name,
  data_type,
  confidence_level,
  api_endpoint,
  license_info,
  update_frequency
) VALUES (
  'NATS',
  'Airspace Classifications',
  'primary-authority',
  'https://www.nats-uk.ead-it.com/cms-nats/opencms/en/eAIP/',
  'Crown Copyright - NATS',
  'monthly'
), (
  'NATS',
  'Controlled Airspace',
  'primary-authority',
  'https://www.nats-uk.ead-it.com/',
  'Crown Copyright - NATS',
  'monthly'
);

-- Insert UK NOTAM Service
INSERT INTO data_sources (
  authority_name,
  data_type,
  confidence_level,
  api_endpoint,
  license_info,
  update_frequency
) VALUES (
  'UK NOTAM Service',
  'Temporary Restrictions',
  'primary-authority',
  'https://notaminfo.com/ukmap',
  'Open Government License v3.0',
  'real-time'
);

-- Insert community-submitted source (for TOAL sites)
INSERT INTO data_sources (
  authority_name,
  data_type,
  confidence_level,
  license_info,
  update_frequency
) VALUES (
  'Community Submitted',
  'TOAL Sites',
  'unverified',
  'CC BY-SA 4.0',
  'on-demand'
);

-- Success message
DO $$
BEGIN
  RAISE NOTICE 'Seed 001_data_sources.sql completed successfully';
  RAISE NOTICE 'Data sources seeded: 6 (CAA, NATS, NOTAM Service, Community)';
END $$;
