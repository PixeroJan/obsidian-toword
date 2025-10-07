# ToWord - Obsidian Plugin

Export your Obsidian markdown files to Microsoft Word (docx) format with full text styling, syntax highlighting, and **complete mobile support**. Files are saved directly in your vault for easy access across all platforms including iOS and Android.

## 🎉 Version 1.4.0 - Major Mobile Update!

This version includes a complete rewrite for mobile compatibility:

-  **True iOS Support**: Resolved Buffer API incompatibilities that prevented mobile usage 
-  **Enhanced Syntax Highlighting**: Professional VS Code Default Light color scheme
-  **Universal Compatibility**: Works seamlessly on iPhone, iPad, Android, and desktop
-  **Improved Code Processing**: Better HTML entity handling and nested formatting

## Features

-  **Full Markdown Support**: Converts headings, lists, tables, code blocks, blockquotes, and more
-  **Text Styling**: Preserves bold, italic, strikethrough, highlights, and inline code
-  **Obsidian Appearance Matching**: Automatically uses your Obsidian fonts and sizes
-  **Professional Code Formatting**: Syntax highlighting with VS Code Default Light colors
-  **Tables**: Exports markdown tables with proper formatting and alignment
-  **Images**: Supports both standard markdown and Obsidian-style embedded images
-  **Hyperlinks**: Clickable links with proper styling
-  **Page Sizes**: Choose from A4, A5, A3, Letter, Legal, or Tabloid
-  **Vault Integration**: Saves files directly in your vault (not browser downloads)
-  **Flexible Output**: Choose where to save - same folder, vault root, or custom folder
-  **Configurable**: Settings panel to customize export behavior
-  **Mobile Optimized**: Full functionality on iOS, Android, and all desktop platforms
-  **Multiple Export Options**: 
  - Ribbon icon for quick export
  - Command palette integration
  - Right-click context menu on files

## Installation

### Manual Installation

1. Download the latest release from the releases page
2. Extract the files to your vault's plugins folder: `<vault>/.obsidian/plugins/to-word/`
3. Reload Obsidian
4. Enable the plugin in Settings → Community Plugins

### Development Installation

1. Clone this repository into your vault's plugins folder
2. Run `npm install` to install dependencies
3. Run `npm run dev` to start compilation in watch mode
4. Reload Obsidian
5. Enable the plugin in Settings → Community Plugins

## Usage

### Export Current File

1. **Using Ribbon Icon**: Click the document icon in the left ribbon
2. **Using Command Palette**: Press `Ctrl/Cmd + P` and search for "Export current file to Word"
3. **Using Context Menu**: Right-click on a markdown file and select "Export to Word"

The exported Word document will be saved in your vault according to your output location settings.

## Settings

Access plugin settings via Settings → ToWord:

- **Default Font Family**: Set the default font for exported documents (default: Calibri)
- **Default Font Size**: Set the default font size in points (default: 11)
- **Include Metadata**: Choose whether to include frontmatter metadata in exports
- **Preserve Formatting**: Toggle markdown formatting preservation (bold, italic, etc.)
- **Use Obsidian Appearance**: **Automatically match your Obsidian theme's appearance**
  - When enabled: Reads your actual Obsidian settings including:
    - Text font family from your theme
    - Monospace font for code blocks (with fallback to Courier New)
    - Base font size (e.g., 16pt if that's your setting)
    - Heading sizes that scale proportionally with your text size
    - Line height and spacing
  - When disabled: Uses standard Word document sizes with your custom settings
  - **Smart detection**: Adapts to theme changes and font size adjustments
- **Include Filename as Header**: Add the filename as an H1 heading at the top of the document
- **Page Size**: Choose document page size (default: A4)
  - A4 (210 × 297 mm)
  - A5 (148 × 210 mm)
  - A3 (297 × 420 mm)
  - Letter (8.5 × 11 inches)
  - Legal (8.5 × 14 inches)
  - Tabloid (11 × 17 inches)
- **Output Location**: Choose where to save exported files:
  - **Same folder as markdown file**: Keeps exports next to source files
  - **Vault root**: Saves all exports to the vault root directory
  - **Custom folder**: Saves to a specified folder within your vault
- **Custom Output Folder**: Specify the folder path when using custom folder option (e.g., "Exports" or "Documents/Word")

## Supported Markdown Features

### Text Formatting

- ✅ **Bold** (`**text**`)
- ✅ *Italic* (`*text*`)
- ✅ ***Bold Italic*** (`***text***`)
- ✅ ~~Strikethrough~~ (`~~text~~`)
- ✅ ==Highlight== (`==text==`)
- ✅ `Inline code` (`` `code` ``) - Bold Courier New with background
- ✅ Underline (via HTML `<u>`)
- ✅ Superscript and Subscript (via HTML `<sup>`, `<sub>`)

### Structure

- ✅ Headings (H1-H6) with proper styling
- ✅ Paragraphs with line spacing
- ✅ Horizontal rules (`---`, `***`, `___`)
- ✅ Line breaks (two trailing spaces)
- ✅ Blockquotes (with nesting support)

### Lists

- ✅ Ordered lists (numbered)
- ✅ Unordered lists (bullets)
- ✅ Nested lists (up to 3 levels)
- ✅ Task lists (`- [ ]` and `- [x]`) - rendered as ☐ and ☑

### Code

- ✅ Inline code with monospace font and background
- ✅ Fenced code blocks with language support
- ✅ **Professional syntax highlighting** with VS Code Default Light color scheme
- ✅ Courier New Bold font for all code
- ✅ Proper HTML entity handling for special characters

### Tables

- ✅ Standard markdown tables
- ✅ Column alignment (left, center, right)
- ✅ Header row styling
- ✅ Fixed column widths

### Links & References

- ✅ Inline links (`[text](url)`)
- ✅ Titled links (`[text](url "title")`)
- ✅ Clickable hyperlinks in Word
- ✅ Footnotes (`[^1]`) with superscript references

### Images

- ✅ Standard markdown images (`![alt](url)`)
- ✅ Obsidian embedded images (`![[image.png]]`)
- ✅ **Resizer Plugin Integration**: Automatically respects custom image sizes
  - `![[image.png|447]]` - Width specification (maintains aspect ratio)
  - `![[image.png|447x300]]` - Exact width and height
  - `![alt](url|447)` - Standard markdown with size
- ✅ Image formats: PNG, JPEG, GIF, SVG
- ✅ Remote images (http/https URLs)
- ✅ Local vault images
- ✅ Auto-sizing: Large images (>600px) are automatically scaled to fit

### Limitations

- ❌ PDF embeds are skipped (Word cannot embed PDF files)
- ⚠️ Task list checkboxes are static (not interactive in Word)
- ⚠️ Collapsible sections are always expanded (Word doesn't support interactive collapse)

## Platform Support

- ✅ **Windows**: Fully supported - saves to vault
- ✅ **macOS**: Fully supported - saves to vault  
- ✅ **Linux**: Fully supported - saves to vault
- ✅ **iOS/iPadOS**: **Fully supported** - Native compatibility with fflate library
- ✅ **Android**: **Fully supported** - Native compatibility with fflate library

**NEW in v1.4.0**: Complete mobile compatibility rewrite! Previous versions had Buffer API issues on iOS - now resolved with native JavaScript implementation. All platforms save the exported Word document directly to your vault according to your output location settings. No browser downloads!

## Development

### Building

```bash
# Install dependencies
npm install

# Development mode (watch)
npm run dev

# Production build
npm run build
```

### Project Structure

- `main.ts` - Main plugin file with Obsidian integration
- `converter.ts` - Markdown to DOCX conversion logic
- `manifest.json` - Plugin manifest
- `esbuild.config.mjs` - Build configuration

## Technologies Used

- [Obsidian API](https://github.com/obsidianmd/obsidian-api)
- [fflate](https://github.com/101arrowz/fflate) - Fast, native JavaScript ZIP library (mobile-optimized)
- [highlight.js](https://highlightjs.org/) - Syntax highlighting with VS Code Default Light theme
- [esbuild](https://esbuild.github.io/) - Fast JavaScript bundler
- TypeScript

**v1.4.0 Update**: Replaced JSZip with fflate for true mobile compatibility and better performance.

## License

MIT

## Support

If you encounter any issues or have feature requests, please file them in the GitHub issues section.

## Credits

Created with ❤️ for the Obsidian community.
