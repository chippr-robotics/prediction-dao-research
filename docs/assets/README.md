# Logo Assets

This directory contains the logo assets for the platform suite.

## Required Logo Files

The following logo files are referenced in the application and documentation:

1. **`logo_fwcp.png`** ✓ (exists)
   - Combined logo for both ClearPath and FairWins
   - Used on: Platform selector landing page
   - Dimensions: Recommended 300px width
   - Format: PNG with transparent background

2. **`logo_clearpath.png`** ⚠️ (needs to be added)
   - ClearPath DAO platform logo
   - Used on: ClearPath app header, platform selector card
   - Dimensions: Recommended 150px width (card), 50px height (header)
   - Format: PNG with transparent background
   - Color scheme: Kelly green (#2D7A4F) to match DAO theme

3. **`logo_fairwins.png`** ⚠️ (needs to be added)
   - FairWins prediction market platform logo
   - Used on: FairWins app header, platform selector card
   - Dimensions: Recommended 150px width (card), 50px height (header)
   - Format: PNG with transparent background
   - Color scheme: Blue (#3B82F6) to match prediction market theme

## Fallback Behavior

The application includes fallback behavior when logos are not found:
- Platform selector cards will show emoji icons (🏛️ for ClearPath, 🎯 for FairWins)
- App headers will only show text branding if logos are missing

## Adding New Logos

To add the missing logo files:

1. Create or obtain the logo images following the specifications above
2. Save them to this directory (`docs/assets/`)
3. Ensure file names match exactly: `logo_clearpath.png` and `logo_fairwins.png`
4. Test in the application by running `npm run dev` in the frontend directory

## Usage in Code

Logos are referenced in:
- `/frontend/src/components/PlatformSelector.jsx` - all three logos
- `/frontend/src/components/ClearPathApp.jsx` - ClearPath logo
- `/frontend/src/components/FairWinsApp.jsx` - FairWins logo
- `/README.md` - combined logo
- `/docs/index.md` - combined logo
