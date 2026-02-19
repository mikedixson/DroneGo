# Data Model: Heritage Site Integration

**Date**: 2026-02-18 | **Phase**: 1

## Entities

### PropertyRestriction (NEW TABLE)

**Schema**:
```sql
CREATE TABLE property_restrictions (
  property_id UUID PRIMARY KEY,
  property_name VARCHAR(255) NOT NULL,
  managing_organization VARCHAR(100) NOT NULL,
  geometry GEOMETRY(MultiPolygon, 4326) NOT NULL,
  policy_text TEXT CHECK (LENGTH(policy_text) <= 5000),
  contact_info VARCHAR(500),
  policy_effective_date DATE,
  data_source_id UUID REFERENCES data_sources(source_id),
  created_at TIMESTAMP DEFAULT NOW(),
  last_updated TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_property_restrictions_geom 
  ON property_restrictions USING GIST (geometry) WITH (fillfactor=90);
```

**Sample**:
```json
{
  "property_name": "Stonehenge",
  "managing_organization": "English Heritage Trust",
  "policy_text": "Drone flights require prior authorization.",
  "contact_info": "permissions@english-heritage.org.uk"
}
```

### LocationCheck (MODIFIED API RESPONSE)

**New Schema**:
```typescript
interface LocationCheck {
  flight_status: 'permitted' | 'prohibited' | 'check-property-restrictions';
  airspace_clear: boolean;
  property_advisory: boolean;
  zones: RestrictionZone[];
  property_restrictions?: Array<{
    property_name: string;
    organization: string;
    policy_summary: string;
    contact: string;
  }>;
  message: string;
}
```

**State Logic**:
- Airspace restricted → `'prohibited'`
- Property restricted only → `'check-property-restrictions'`
- No restrictions → `'permitted'`

### DataSource (EXTEND)

Add data sources for Historic England + National Trust (see migration SQL in plan.md).
