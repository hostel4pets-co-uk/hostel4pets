# Hostel4Pets Website

**Version 1.0.0**

Public booking frontend for [hostel4pets.co.uk](https://hostel4pets.co.uk).

## Features

- Backend booking-price requests with a browser-side fallback and parity check.
- Availability calendar with booking markers, bank holidays and daily booking details.
- Guest chat with notification controls, typing state and staff hand-off notices.
- Pet taxi coverage and price requests.
- Browser-side calendar caching with server metadata checks.
- Responsive layouts for desktop and mobile screens.
- Persistent light and dark themes with operating-system preference detection.

## Stack

- Static HTML.
- Native modern CSS with cascade layers, imports and selector nesting.
- Strict TypeScript compiled to browser-ready ES modules.
- GitHub Pages deployment from `main`.

## Requirements

- Node.js 24 or newer.
- npm.

## Install

```sh
npm install
```

## Validate

```sh
npm run validate
```

This checks both TypeScript projects, rejects JavaScript source and inline scripts, validates the stylesheet entry point, confirms the release version is consistent, and verifies the booking API contract, parity detection and offline fallback.

## Build

```sh
npm run build
```

The production site is written to `dist/`. Compiled browser modules are placed in `dist/generated/`.

## Project layout

- `src/` — TypeScript application source.
- `generated/` — compiled browser modules tracked for branch-based GitHub Pages.
- `styles/` — layered stylesheet entry point and feature modules.
- `scripts/` — source validation, production build and design-audit scripts.
- `docs/` — integration and maintenance documentation.
- `graphics/` and `sounds/` — static media.
- `.github/workflows/pages.yml` — validation, compilation and deployment checks.

## Deployment

A push to `main` runs the build workflow. The workflow validates the source, compiles TypeScript, updates `generated/` when required and checks the published assets on the production domain.

`generated/` is committed intentionally because the configured GitHub Pages site serves the repository branch directly.

## Services

The calendar, chat, booking and taxi clients use the Hostel4Pets service endpoints hosted at `h4p.kittycrow.dev`.

Booking prices are requested from the backend while the previous browser calculator remains as an offline fallback and parity oracle. The backend result is canonical. When frontend and backend values diverge, the frontend fallback values or logic must be updated to match the backend before release. See [Booking pricing](docs/booking-pricing.md).
