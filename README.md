# WATCHTOWER

Watchtower is a public-facing recycling network that connects residents, businesses, operators, and dispatch into one simple experience.

## What changed
- Made the landing page the main public entry point.
- Added clear navigation paths for Residents, Businesses, Operators, and Learn.
- Kept the existing scanner, resident, business, dispatch, and operator flows intact.
- Prepared the site structure for Vercel-style deployment with a routing config file and deployment-safe API handlers.

## Project structure
- index.html — public landing page
- resident.html — resident portal
- business.html — business onboarding
- terminal.html — operator console
- dispatch.html — dispatch view
- scanner.html — resident scanning experience
- learn.html — educational content
- api/scan.js — resident AI scan endpoint
- api/grade.js — operator grading endpoint

## Deployment notes
- Add your Anthropic API key as a Vercel environment variable named ANTHROPIC_API_KEY.
- Deploy the repository to Vercel with the root folder as the project root.
- The included vercel.json file enables clean URLs and preserves the /api routes.
