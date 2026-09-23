# Design Presets

Pick ONE preset per project. Paste the "Global rules" plus your chosen preset into that project's Antigravity Rules, or tell the agent: "Use preset 3 from design-presets.md."

## Global rules (always include)

- Follow the chosen preset exactly: fonts, hex colors, radius, spacing. Do not substitute defaults.
- Never use purple/indigo gradients, glassmorphism, or emoji as icons unless the preset says so.
- Do not use Inter, Roboto, or Arial unless the preset names them.
- Avoid the generic layout: hero, three feature cards, testimonial row, CTA banner. Design the layout around the client's content.
- Define colors, fonts, radius, and spacing as CSS variables first, then build every page from them.
- Load fonts from Google Fonts and give each a fallback stack.
- Use one accent color. Everything else is neutral.
- Before finishing, open the app in the browser, compare it to the preset, and fix anything that drifts.

---

## 1. Editorial

**Vibe:** Magazine, thoughtful, readable. **Good for:** publishers, consultants, portfolios, nonprofits.

- Fonts: Fraunces (headings, weight 600), Source Sans 3 (body)
- Colors: bg `#F7F3EC`, ink `#1C1B19`, muted `#6B665C`, rule `#D9D2C3`, accent `#B23A2E`
- Shape: radius 2px, 1px rules instead of cards or shadows
- Layout: narrow text columns (max 68ch), large headlines, pull quotes, generous margins
- Avoid: rounded cards, icons in circles, gradients

## 2. Brutalist Mono

**Vibe:** Raw, loud, unapologetic. **Good for:** creative studios, indie products, events.

- Fonts: Space Mono (headings), Work Sans (body)
- Colors: bg `#FFFFFF`, ink `#000000`, accent `#FFE600`, alt accent `#FF3B00`
- Shape: radius 0, 2px black borders, hard offset shadows `4px 4px 0 #000`
- Layout: visible grid, oversized type, buttons that shift on hover
- Avoid: soft shadows, gradients, rounded anything

## 3. Soft Organic

**Vibe:** Warm, calm, human. **Good for:** wellness, food, education, family services.

- Fonts: DM Serif Display (headings), Nunito Sans (body)
- Colors: bg `#FAF6F0`, surface `#FFFFFF`, ink `#2E2A25`, sage `#7A8F6F`, clay `#C97B5A`
- Shape: radius 20px, soft shadows `0 8px 24px rgba(46,42,37,.08)`
- Layout: lots of whitespace, blob or curved section dividers, friendly copy
- Avoid: sharp corners, dark backgrounds, neon colors

## 4. Corporate Trust

**Vibe:** Reliable, precise, calm. **Good for:** fintech, B2B SaaS, legal, healthcare admin.

- Fonts: IBM Plex Sans (all text), IBM Plex Mono (numbers and data)
- Colors: bg `#F5F7FA`, surface `#FFFFFF`, text `#1B2733`, navy `#0B2545`, accent `#1F7A8C`
- Shape: radius 6px, 1px borders, very subtle shadows
- Layout: dense tables, clear hierarchy, sidebar navigation, status badges
- Avoid: playful illustrations, bright multi-color palettes

## 5. Dark Technical

**Vibe:** Developer tool, focused, fast. **Good for:** dev tools, dashboards, APIs, security.

- Fonts: Geist (body), Geist Mono (code and labels)
- Colors: bg `#0A0B0D`, surface `#14161A`, border `#23262D`, text `#E6E8EB`, accent `#3DDC97`
- Shape: radius 6px, 1px borders, no shadows
- Layout: command-palette feel, keyboard hints, compact spacing, monospace metadata
- Avoid: gradients, glow effects, pure `#000` or `#FFF`

## 6. Playful Bold

**Vibe:** Fun, sticker-like, energetic. **Good for:** consumer apps, kids, games, community.

- Fonts: Bricolage Grotesque (headings, weight 800), DM Sans (body)
- Colors: bg `#FFF4E0`, ink `#1A1A2E`, pink `#FF5D8F`, blue `#3A86FF`, yellow `#FFBE0B`
- Shape: radius 16px, 3px ink outlines, offset shadows `3px 3px 0 #1A1A2E`
- Layout: tilted stickers, chunky buttons, big friendly headlines
- Avoid: thin lines, muted palettes, corporate tone

## 7. Luxury Minimal

**Vibe:** Quiet, refined, expensive. **Good for:** boutique brands, hospitality, real estate, jewelry.

- Fonts: Cormorant Garamond (headings, weight 500), Jost (body, small caps labels with wide letter-spacing)
- Colors: bg `#FBF9F5`, ink `#14120F`, muted `#8A847A`, accent gold `#A88B4A`
- Shape: radius 0, 1px hairlines, no shadows
- Layout: full-bleed imagery, huge whitespace, slow fades, few words per section
- Avoid: bright colors, badges, dense UI

## 8. Swiss Grid

**Vibe:** Modernist, typographic, precise. **Good for:** agencies, architecture, design tools, galleries.

- Fonts: Archivo (all text, tight tracking on headings, weights 400 and 800)
- Colors: bg `#FFFFFF`, ink `#111111`, accent `#E10600`
- Shape: radius 0, thick rules, no shadows
- Layout: strict 12-column grid, flush-left text, very large type, numbered sections
- Avoid: centered layouts, decorative images, multiple accent colors

---

## Adding a client-specific override

Append this under any preset to tailor it:

```
Client overrides:
- Brand color: #______ (replaces the preset accent)
- Logo font or style: ______
- Tone of copy: ______
- Must include: ______
- Must avoid: ______
```
