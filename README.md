# Forge Engineering Portal

Build a standalone Engineering Portal web application for MES asset and process engineering, separated from shop-floor operations.

Key requirements:
1. Access and Permission Integration:
   - Integrate access controls with Command Access Hub (project 4d41681d-1b32-4118-8d6c-ed698c2f2f72).
   - Query user status, roles, and permissions via the Command Access Hub API endpoint (GET /api/public/v1/access?email=<email> with x-api-key header).
   - Enforce role-based permissions (e.g., Plant Engineer, Automation Specialist, Process Designer) across all configuration modules.

2. Core Engineering Modules:
   - Workstation Management: Create, define, and configure workstations, operational parameters, hardware bindings, and line assignments.
   - Production Line Management: Define production lines, workstation sequencing, buffer rules, and structural line relationships.
   - Machine Management: Register machines, technical configurations, telemetry/edge connection protocols, and calibration settings.
   - Operator App Configuration: Step template authoring, procedure designer, evidence requirements (camera/measurements), and app preview before publishing.
   - HMI Runtime Configuration: Touchscreen HMI layout builder, tile bindings, action button palettes, and display properties.
   - Change Management & Versioning: Formal lifecycle stages (Draft -> Under Review -> Approved -> Active), change logs, and e-signature approvals for master data and engineering revisions.

3. Interface & UX:
   - High-density industrial engineering portal interface with dark/light themes, asset hierarchy trees, version badges, and clean configuration forms.

This project was built with [Lovable](https://lovable.dev).

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/737cd389-2e90-4351-a810-021c86554798).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `main` on GitHub and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```
