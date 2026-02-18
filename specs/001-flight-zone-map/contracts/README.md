# API Contracts

This directory contains the API contract specifications for the DroneGo Flight Zone Map backend REST API.

## Files

- **api-spec.yaml**: OpenAPI 3.0.3 specification for the REST API

## Viewing the API Documentation

### Online Viewers
- **Swagger Editor**: https://editor.swagger.io/ (paste the YAML content)
- **Redoc**: Generate interactive docs with `npx @redocly/cli preview-docs contracts/api-spec.yaml`

### Local Setup
```bash
# Install Redoc CLI
npm install -g @redocly/cli

# Preview documentation
cd specs/001-flight-zone-map
redocly preview-docs contracts/api-spec.yaml
```

## API Endpoints Summary

### Core Endpoints (Public)
- `GET /zones` - Query restriction zones by bounding box
- `GET /zones/{zoneId}` - Get zone details
- `GET /location/check` - Check flight permission at coordinates (P1)
- `GET /location/search` - Search locations by address/postcode (P2)
- `GET /toal` - Query TOAL sites by bounding box
- `GET /toal/nearest` - Find nearest TOAL site
- `GET /health` - API health and data freshness

### Admin Endpoints (Authentication Required)
- `POST /admin/zones/refresh` - Trigger manual data refresh

## Authentication

Admin endpoints require JWT bearer token authentication:
```
Authorization: Bearer <JWT_TOKEN>
```

Public endpoints (zones, location, toal, health) require no authentication.

## Data Formats

All geographic data uses:
- **Coordinate System**: WGS84 (EPSG:4326)
- **Geometry Format**: GeoJSON
- **Date/Time Format**: ISO 8601 (e.g., `2026-02-17T10:30:00Z`)

## Rate Limiting

(To be implemented in Phase 2)
- Public endpoints: 100 requests/minute per IP
- Admin endpoints: 10 requests/minute per token

## Response Codes

- `200 OK`: Successful request
- `202 Accepted`: Async operation started
- `400 Bad Request`: Invalid parameters
- `401 Unauthorized`: Authentication required
- `403 Forbidden`: Insufficient permissions
- `404 Not Found`: Resource not found
- `500 Internal Server Error`: Server error
- `503 Service Unavailable`: Service unhealthy

## Contract Testing

Contract tests validate API implementation against this specification. See `backend/tests/contract/` for test implementations.

```bash
# Run contract tests
npm run test:contract
```

## Version History

| Version | Date       | Changes                         |
|---------|------------|---------------------------------|
| 1.0.0   | 2026-02-17 | Initial API specification       |
