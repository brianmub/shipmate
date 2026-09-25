# Antigravity Rules

## UI Theme & Design Presets Requirement
Whenever starting a new project, feature, web app, landing page, dashboard, or frontend UI design:
1. **MANDATORY PRE-FLIGHT STEP**: You MUST ask the user which Design Preset / Theme they want before writing CSS, HTML, or styling components.
2. Present the 8 design presets defined in `design-presets.md` using the interactive question tool:
   - **Preset 1: Editorial** — Fraunces + Source Sans 3 (Publishers, portfolios, magazines)
   - **Preset 2: Brutalist Mono** — Space Mono + Work Sans (Creative studios, indie products)
   - **Preset 3: Soft Organic** — DM Serif Display + Nunito Sans (Wellness, food, human services)
   - **Preset 4: Corporate Trust** — IBM Plex Sans + IBM Plex Mono (Fintech, B2B SaaS, healthcare)
   - **Preset 5: Dark Technical** — Geist + Geist Mono (Dev tools, dashboards, APIs)
   - **Preset 6: Playful Bold** — Bricolage Grotesque + DM Sans (Consumer apps, community, games)
   - **Preset 7: Luxury Minimal** — Cormorant Garamond + Jost (Boutique, hospitality, high-end)
   - **Preset 8: Swiss Grid** — Archivo (Agencies, galleries, modern typography)
   - **Custom Client Override** (Brand color, custom logo font, tone)
3. Once selected:
   - Adhere strictly to the chosen preset's fonts, colors, border-radius, shadows, and spacing.
   - Define colors, fonts, radius, and spacing as CSS variables first.
   - Never use generic defaults (Inter, Roboto, Arial) unless the preset specifically includes them.
   - Never use purple/indigo gradients or glassmorphism unless requested by the preset.
   - Open in browser and verify fidelity before finishing.

For full specification and color tokens, refer to [design-presets.md](file:///c:/Users/Brian%20Mubvumbi/Documents/ETZ/AI%20Projects/ShipMateApp/design-presets.md).

## Git, Deployment & Build Protocol (Strict Requirement)
1. **NEVER Push or Deploy Automatically**: Never push code to GitHub or deploy to live without explicit confirmation.
2. **Mandatory Post-Change Confirmation**: After completing and verifying any changes (including type-checks and test validation):
   - **ALWAYS** ask the user if they want to push the changes to GitHub and deploy to live.
   - For mobile changes, explicitly state when the codebase is ready to build an Android App Bundle (`.aab`) or APK (`.apk`) and ask if they would like to proceed with the build.
3. **Wait for Approval**: Do not execute `git push`, deployment scripts, or mobile build commands (`eas build`, `gradlew`, etc.) until the user gives explicit consent.
