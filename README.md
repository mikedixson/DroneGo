# DroneGo - UK Drone Flight Zone Map

**A Progressive Web App for UK drone pilots to check flight restrictions and find suitable launch sites**

## 🎯 Overview

DroneGo provides an interactive map showing UK drone flight restriction zones, controlled airspace, and official TOAL (Take Off and Landing) sites. The app helps drone pilots quickly answer "Can I fly here?" while complying with UK Civil Aviation Authority regulations.

## ✨ Features

- **🗺️ Real-time Restriction Map**: View no-fly zones, controlled airspace, and suitable flying areas
- **📍 Current Location Check**: Instantly see if your current location permits drone flight
- **🔍 Location Search**: Search for addresses and postcodes to plan future flights
- **🚁 TOAL Sites**: Find official Take Off and Landing locations with facilities
- **📋 Detailed Information**: View restriction details, altitude limits, and authorization requirements
- **📱 Offline Access**: Previously viewed areas work without internet connectivity
- **🎯 PWA Support**: Install on mobile devices for native app-like experience

## 🚀 Quick Start

See [quickstart.md](specs/001-flight-zone-map/quickstart.md) for detailed setup instructions.

### Prerequisites

- Node.js 20 LTS or higher
- PostgreSQL 15 with PostGIS 3.x extension (or Docker)
- npm 10 or higher
- Docker and Docker Compose (optional, recommended)

### Installation

#### Option 1: Docker (Recommended)

```bash
# Clone repository
git clone https://github.com/dronego/flight-zone-map.git
cd flight-zone-map

# Start PostgreSQL with PostGIS
docker-compose -f docker-compose.dev.yml up -d

# Install dependencies
cd backend && npm install
cd ../frontend && npm install

# Setup database
cd ../backend
npm run migrate
npm run seed

# Start development servers
npm run dev                 # Backend API (port 3000)
cd ../frontend && npm run dev  # Frontend PWA (port 5173)
```

#### Option 2: Local PostgreSQL

```bash
# Install backend dependencies
cd backend
npm install

# Install frontend dependencies
cd ../frontend
npm install

# Setup database (see quickstart.md for PostgreSQL setup)
cd ../backend
npm run migrate
npm run seed

# Start development servers
npm run dev                 # Backend API (port 3000)
cd ../frontend && npm run dev  # Frontend PWA (port 5173)
```

Visit `http://localhost:5173` to view the app.

## 📚 Documentation

- **[Feature Specification](specs/001-flight-zone-map/spec.md)**: User stories and requirements
- **[Implementation Plan](specs/001-flight-zone-map/plan.md)**: Technical architecture and design decisions
- **[Quickstart Guide](specs/001-flight-zone-map/quickstart.md)**: Developer setup and troubleshooting
- **[Data Model](specs/001-flight-zone-map/data-model.md)**: Database schema and entities
- **[API Specification](specs/001-flight-zone-map/contracts/api-spec.yaml)**: OpenAPI REST API documentation
- **[Task Breakdown](specs/001-flight-zone-map/tasks.md)**: Implementation task list

## 🛠️ Development

### Project Structure

```
├── backend/              # Node.js + Express API
│   ├── src/
│   │   ├── models/      # Database models
│   │   ├── services/    # Business logic
│   │   ├── api/         # REST endpoints
│   │   └── lib/         # Shared utilities
│   ├── tests/           # Unit, integration, contract tests
│   └── migrations/      # Database migrations
│
├── frontend/             # Vite + TypeScript PWA
│   ├── src/
│   │   ├── components/  # Map UI components
│   │   ├── pages/       # Application pages
│   │   ├── services/    # API client, cache, geolocation
│   │   └── lib/         # Utilities
│   ├── tests/           # Unit and E2E tests
│   └── public/          # Static assets, PWA manifest
│
└── specs/               # Feature specifications
```

### Running Tests

```bash
# Backend tests
cd backend
npm test                    # Unit tests
npm run test:coverage       # Coverage report

# Frontend tests
cd frontend
npm test                    # Unit tests
npm run test:e2e           # Playwright E2E tests
npm run test:coverage      # Coverage report
```

### Deployment

See [deployment documentation](docs/deployment.md) (coming soon).

## 📊 Tech Stack

- **Frontend**: TypeScript 5.x, Vite 5.x, Leaflet 1.9.4, Turf.js 6.5.0, Workbox 7.x
- **Backend**: Node.js 20 LTS, Express 4.x, PostgreSQL 15 + PostGIS 3.x
- **Testing**: Vitest 1.x (unit), Playwright 1.x (E2E)
- **Data Sources**: UK CAA GeoJSON, NATS AIS (eAIP/AIXM), UK NOTAM Service

## 📜 Data Attribution

Contains public sector information licensed under the [Open Government License v3.0](https://www.nationalarchives.gov.uk/doc/open-government-licence/version/3/).

Data sources:
- UK Civil Aviation Authority (CAA)
- NATS (National Air Traffic Services)
- UK NOTAM Service

## 🤝 Contributing

This project follows [Test-Driven Development](https://learn.microsoft.com/en-us/azure/devops/learn/agile/what-is-test-driven-development) and modular architecture principles. See [.specify/memory/constitution.md](.specify/memory/constitution.md) for development guidelines.

## 📝 License

MIT License - See [LICENSE](LICENSE) file for details.

## ⚠️ Disclaimer

This application is for informational purposes only. Pilots are responsible for verifying airspace restrictions through official sources before flight operations. Always refer to UK CAA regulations and current NOTAMs.
