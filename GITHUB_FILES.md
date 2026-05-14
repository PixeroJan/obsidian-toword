# GitHub Repository Files Guide

This document outlines which files should be included in the GitHub repository and which should be excluded.

## Files to Include on GitHub

### Core Source Files
- `main.ts` - Your main plugin code
- `converter.ts` - Conversion logic
- `manifest.json` - Plugin manifest
- `styles.css` - Plugin styles

### Configuration Files
- `package.json` - Dependencies and scripts
- `tsconfig.json` - TypeScript configuration
- `esbuild.config.mjs` - Build configuration
- `.eslintrc` - Linting rules
- `.gitignore` - Git ignore rules

### Build/Version Scripts
- `version-bump.mjs` - Version management
- `versions.json` - Version history

### Documentation
- `README.md` - Main documentation
- `CHANGELOG.md` - Version history
- `DEVELOPMENT.md` - Development guide
- `FEATURES.md` - Feature documentation
- `INSTALL.md` - Installation instructions
- `PROJECT_STRUCTURE.md` - Project structure
- `LICENSE` - License file

### Examples
- `examples/` - Folder with all markdown samples
  - `FULL_MARKDOWN_SAMPLE.md`
  - `SAMPLE.md`
  - `TEST_ISSUES.md`
  - `WORD_LIMITATIONS.md`

### Type Definitions
- `markdown-it-plugins.d.ts` - Type definitions
- `src/` - Source folder (if it contains source files)

## Files Excluded from GitHub (via .gitignore)

These files are automatically excluded and should NOT be committed:

- ❌ `node_modules/` - Dependencies (users will run `npm install`)
- ❌ `package-lock.json` - Lock file (can be excluded or included based on preference)
- ❌ `main.js` - Built file (generated from `main.ts` during build)
- ❌ `*.js.map` - Source maps
- ❌ `data.json` - User-specific plugin data

## Current .gitignore Configuration

```gitignore
# npm
node_modules
package-lock.json

# build
main.js
*.js.map

# obsidian
data.json

# Misc
.DS_Store
```

## Notes

- Your `.gitignore` is already properly configured
- Users will build the plugin by running `npm install` and `npm run build`
- The built `main.js` file will be generated locally and is not needed in the repository
- All source files and documentation are included for transparency and collaboration
