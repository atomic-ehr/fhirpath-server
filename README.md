# Multi-Version FHIRPath Server

A high-performance FHIRPath evaluation server using Bun runtime, supporting multiple FHIR versions (R4, R5, R6-ballot3) with the `@atomic-ehr/fhirpath` library.

## Features

- **Multi-version FHIR Support**: R4, R5, and R6-ballot3
- **High Performance**: Built with Bun runtime and native web server
- **Zero External Dependencies**: Only Bun + your FHIRPath library
- **Auto-version Detection**: Automatically detect FHIR version from resources
- **Debug Support**: AST parsing and trace information
- **CORS Ready**: Built-in CORS support for web applications

## Quick Start

### Prerequisites

- [Bun](https://bun.sh) runtime installed
- Local `@atomic-ehr/fhirpath` library (included via file reference)

### Installation

```bash
# Install dependencies
bun install

# Start development server with hot reload
bun run dev

# Or start production server
bun run start
```

### Usage

The server will start on `http://localhost:3000` by default.

## API Endpoints

### Information
- `GET /` - API information and supported features
- `GET /health` - Health check endpoint

### FHIRPath Evaluation
- `POST /r4` - Evaluate expressions using FHIR R4
- `POST /r5` - Evaluate expressions using FHIR R5
- `POST /r6` - Evaluate expressions using FHIR R6-ballot3
- `POST /` - Auto-detect FHIR version and evaluate

## Request Format

All FHIRPath evaluation endpoints expect a FHIR Parameters resource:

```json
{
  "resourceType": "Parameters",
  "parameter": [
    {
      "name": "expression",
      "valueString": "Patient.name.given.join(' ')"
    },
    {
      "name": "resource",
      "resource": {
        "resourceType": "Patient",
        "name": [{"given": ["John"], "family": "Doe"}]
      }
    }
  ]
}
```

## Examples

### Basic Evaluation

```bash
curl -X POST http://localhost:3000/\$fhirpath-r4 \
  -H "Content-Type: application/fhir+json" \
  -d '{
    "resourceType": "Parameters",
    "parameter": [
      {
        "name": "expression",
        "valueString": "Patient.gender"
      },
      {
        "name": "resource",
        "resource": {
          "resourceType": "Patient",
          "gender": "female"
        }
      }
    ]
  }'
```

## Development

```bash
# Development with hot reload
bun run dev

# Build for production
bun run build

# Run tests
bun test
```

This project was created using `bun init` and leverages Bun's native web server capabilities.
