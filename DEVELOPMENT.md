# Development Guide

## Getting Started with Development

### Prerequisites
- Node.js 16+ installed
- npm or yarn package manager
- Obsidian installed
- Basic TypeScript knowledge
- Familiarity with Obsidian plugin API

### Initial Setup

```bash
# Navigate to plugin directory
cd "c:\Users\pixer\Dropbox\remotely-save\Plugin development\.obsidian\plugins\ToWord"

# Install dependencies
npm install

# Start development mode
npm run dev
```

Development mode will watch for file changes and automatically rebuild.

## Project Architecture

### File Responsibilities

#### `main.ts` - Plugin Core
- Obsidian plugin lifecycle management
- Settings management
- UI integration (ribbon, commands, context menu)
- File export orchestration
- User notifications

**Key Classes:**
- `ToWordPlugin` - Main plugin class
- `ToWordSettingTab` - Settings UI

#### `converter.ts` - Conversion Engine
- Markdown parsing
- DOCX generation
- Text formatting
- Document structure creation

**Key Class:**
- `MarkdownToDocxConverter` - Handles all conversion logic

#### `manifest.json` - Plugin Metadata
- Plugin ID and name
- Version information
- Minimum Obsidian version
- Author information

#### `package.json` - Dependencies
- npm dependencies
- Build scripts
- Project metadata

#### `esbuild.config.mjs` - Build Configuration
- Entry point definition
- External dependencies
- Bundle settings
- Development/production modes

## Development Workflow

### Making Changes

1. **Edit Source Files**
   ```bash
   # Edit main.ts or converter.ts
   # Changes are auto-detected in dev mode
   ```

2. **Reload Obsidian**
   - Press `Ctrl/Cmd + R` in Obsidian
   - Or use Developer Tools: `Ctrl/Cmd + Shift + I`

3. **Test Changes**
   - Try exporting a file
   - Check console for errors
   - Verify output in Word

### Adding New Features

#### Example: Adding Image Support

1. **Update Converter**
   ```typescript
   // In converter.ts
   private async handleImage(imagePath: string): Promise<ImageRun> {
       // Load image data
       // Create ImageRun
       // Return formatted image
   }
   ```

2. **Update Parser**
   ```typescript
   // In parseMarkdown method
   const imageMatch = line.match(/!\[([^\]]*)\]\(([^)]+)\)/);
   if (imageMatch) {
       const [, alt, src] = imageMatch;
       // Handle image
   }
   ```

3. **Test Thoroughly**
   - Test with different image formats
   - Test with local and remote images
   - Test with missing images

4. **Update Documentation**
   - Add to FEATURES.md
   - Update README.md
   - Add examples to SAMPLE.md

### Debugging

#### Enable Developer Tools
```
Ctrl/Cmd + Shift + I
```

#### Console Logging
```typescript
console.log('Debug info:', variable);
console.error('Error occurred:', error);
```

#### Breakpoints
1. Open Developer Tools
2. Go to Sources tab
3. Find your compiled code
4. Click line numbers to set breakpoints

#### Common Issues

**Plugin not loading:**
- Check manifest.json is valid
- Verify main.js exists
- Check Obsidian console for errors

**Changes not appearing:**
- Ensure dev mode is running
- Reload Obsidian (Ctrl/Cmd + R)
- Check for TypeScript errors

**Export failing:**
- Check converter.ts for errors
- Verify docx library is installed
- Test with simple markdown first

## Code Style Guidelines

### TypeScript Best Practices

```typescript
// Use explicit types
function exportFile(file: TFile): Promise<void> {
    // Implementation
}

// Use async/await
async function convert(content: string): Promise<Blob> {
    const result = await this.parseMarkdown(content);
    return result;
}

// Handle errors gracefully
try {
    await this.exportToWord(file);
} catch (error) {
    console.error('Export failed:', error);
    new Notice(`Error: ${error.message}`);
}
```

### Naming Conventions

- **Classes**: PascalCase (`MarkdownToDocxConverter`)
- **Methods**: camelCase (`parseMarkdown`)
- **Constants**: UPPER_SNAKE_CASE (`DEFAULT_SETTINGS`)
- **Interfaces**: PascalCase with 'I' prefix optional (`ToWordSettings`)

### Code Organization

```typescript
// 1. Imports
import { Plugin, Notice } from 'obsidian';

// 2. Interfaces/Types
interface MySettings {
    option: string;
}

// 3. Constants
const DEFAULT_VALUE = 'default';

// 4. Main Class
export default class MyPlugin extends Plugin {
    // Properties
    settings: MySettings;
    
    // Lifecycle methods
    async onload() { }
    
    // Public methods
    async exportFile() { }
    
    // Private methods
    private parseContent() { }
}
```

## Testing Strategy

### Manual Testing Checklist

- [ ] Install plugin fresh
- [ ] Enable plugin
- [ ] Test ribbon icon
- [ ] Test command palette
- [ ] Test context menu
- [ ] Test with SAMPLE.md
- [ ] Test with empty file
- [ ] Test with large file
- [ ] Test all formatting types
- [ ] Test settings changes
- [ ] Test on different platforms

### Test Files

Create test files for different scenarios:

```markdown
# test-simple.md
Simple text with **bold** and *italic*.

# test-complex.md
Complex document with tables, code blocks, lists, etc.

# test-edge-cases.md
Empty lines, special characters, nested structures.
```

## Performance Optimization

### Current Performance
- Small files (<100KB): Instant
- Medium files (100KB-1MB): 1-2 seconds
- Large files (>1MB): 2-5 seconds

### Optimization Tips

1. **Lazy Loading**
   ```typescript
   // Load heavy dependencies only when needed
   async convert() {
       const { Document, Packer } = await import('docx');
   }
   ```

2. **Caching**
   ```typescript
   // Cache parsed results
   private cache = new Map<string, ParsedContent>();
   ```

3. **Streaming**
   ```typescript
   // Process large files in chunks
   async processInChunks(content: string) {
       const chunks = this.splitIntoChunks(content);
       for (const chunk of chunks) {
           await this.processChunk(chunk);
       }
   }
   ```

## Building for Production

### Production Build

```bash
# Full production build
npm run build

# This runs:
# 1. TypeScript type checking
# 2. esbuild bundling (production mode)
# 3. Minification
# 4. No source maps
```

### Version Management

```bash
# Update version in package.json
npm version patch  # 1.0.0 -> 1.0.1
npm version minor  # 1.0.0 -> 1.1.0
npm version major  # 1.0.0 -> 2.0.0

# This automatically:
# - Updates package.json
# - Updates manifest.json
# - Updates versions.json
# - Creates git tag
```

### Release Checklist

- [ ] Update CHANGELOG.md
- [ ] Run `npm run build`
- [ ] Test built plugin
- [ ] Update version number
- [ ] Create git tag
- [ ] Create GitHub release
- [ ] Update documentation
- [ ] Test on all platforms

## Extending the Plugin

### Adding New Settings

1. **Update Interface**
   ```typescript
   interface ToWordSettings {
       // Existing settings...
       newSetting: boolean;
   }
   ```

2. **Update Defaults**
   ```typescript
   const DEFAULT_SETTINGS: ToWordSettings = {
       // Existing defaults...
       newSetting: false,
   }
   ```

3. **Add UI Control**
   ```typescript
   new Setting(containerEl)
       .setName('New Setting')
       .setDesc('Description of new setting')
       .addToggle(toggle => toggle
           .setValue(this.plugin.settings.newSetting)
           .onChange(async (value) => {
               this.plugin.settings.newSetting = value;
               await this.plugin.saveSettings();
           }));
   ```

### Adding New Commands

```typescript
this.addCommand({
    id: 'new-command',
    name: 'New Command Name',
    callback: async () => {
        // Command implementation
    }
});
```

### Adding New Export Formats

1. Create new converter class
2. Add format selection in settings
3. Update export logic to use selected converter
4. Add tests for new format

## Troubleshooting Development Issues

### TypeScript Errors

```bash
# Check for type errors
npx tsc --noEmit

# Fix common issues
npm install --save-dev @types/node
```

### Build Errors

```bash
# Clean and rebuild
rm -rf node_modules
rm package-lock.json
npm install
npm run build
```

### Runtime Errors

1. Check Obsidian console
2. Add console.log statements
3. Use debugger breakpoints
4. Test with minimal example

## Resources

### Official Documentation
- [Obsidian API](https://github.com/obsidianmd/obsidian-api)
- [Obsidian Plugin Developer Docs](https://docs.obsidian.md/Plugins/Getting+started/Build+a+plugin)
- [docx Library](https://docx.js.org/)
- [esbuild Documentation](https://esbuild.github.io/)

### Community Resources
- [Obsidian Discord](https://discord.gg/obsidianmd)
- [Obsidian Forum](https://forum.obsidian.md/)
- [Plugin Development Examples](https://github.com/obsidianmd/obsidian-sample-plugin)

### Useful Tools
- [TypeScript Playground](https://www.typescriptlang.org/play)
- [Regex101](https://regex101.com/) - Test regex patterns
- [JSON Validator](https://jsonlint.com/) - Validate JSON files

## Contributing

### Code Contributions
1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Test thoroughly
5. Submit a pull request

### Documentation Contributions
1. Identify gaps in documentation
2. Write clear, concise content
3. Add examples where helpful
4. Submit updates

### Bug Reports
1. Check existing issues
2. Provide minimal reproduction
3. Include error messages
4. Specify platform/version

## Best Practices Summary

✅ **DO:**
- Write type-safe code
- Handle errors gracefully
- Test on multiple platforms
- Document your changes
- Follow existing code style
- Use meaningful variable names

❌ **DON'T:**
- Commit node_modules
- Ignore TypeScript errors
- Skip testing
- Break existing functionality
- Use any type unnecessarily
- Forget to update documentation

---

**Happy Coding! 🚀**

For questions or help, refer to the README.md or open an issue.
