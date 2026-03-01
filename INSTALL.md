# Installation and Setup Guide

## Quick Start

Your plugin is now ready to use! Here's how to get started:

### 1. Enable the Plugin in Obsidian

1. Open Obsidian
2. Go to **Settings** → **Community Plugins**
3. Make sure "Safe mode" is **OFF**
4. Click **Browse** and search for your plugin (if published) OR
5. If testing locally, the plugin should already appear in your installed plugins list
6. Toggle the plugin **ON**

### 2. Verify Installation

You should now see:
- A document icon in the left ribbon bar
- "Export to Word" command in the command palette (Ctrl/Cmd + P)
- "Export to Word" option when right-clicking markdown files

### 3. Test the Plugin

1. Open the included `SAMPLE.md` file
2. Click the document icon in the ribbon, OR
3. Press `Ctrl/Cmd + P` and type "Export to Word"
4. The Word document will download to your default downloads folder

## Configuration

Access plugin settings via **Settings** → **Export to Word**:

### Available Settings

- **Default Font Family**: Choose your preferred font (default: Calibri)
  - Examples: Arial, Times New Roman, Calibri, Georgia
  
- **Default Font Size**: Set the base font size in points (default: 11)
  - Recommended range: 10-14 points
  
- **Include Metadata**: Toggle to include/exclude frontmatter in exports
  - Useful if you use YAML frontmatter in your notes
  
- **Preserve Formatting**: Enable/disable markdown formatting conversion
  - When enabled: Bold, italic, etc. are preserved
  - When disabled: Plain text export

## Platform-Specific Notes

### Windows
- ✅ Fully supported
- Downloads go to your default Downloads folder
- Double-click the .docx file to open in Microsoft Word

### macOS
- ✅ Fully supported
- Downloads go to your Downloads folder
- Opens with Microsoft Word or Pages

### iOS/iPadOS
- ✅ Supported
- Files save to the Files app
- Can be opened with Microsoft Word app or Pages

### Linux
- ✅ Fully supported
- Downloads to your Downloads folder
- Opens with LibreOffice Writer or Microsoft Word (if installed)

## Troubleshooting

### Plugin doesn't appear
- Make sure you've disabled "Safe mode" in Community Plugins
- Restart Obsidian
- Check that `main.js` and `manifest.json` exist in the plugin folder

### Export fails
- Check the console (Ctrl/Cmd + Shift + I) for error messages
- Ensure you have write permissions to your downloads folder
- Try exporting a simple document first

### Formatting issues
- Check your "Preserve Formatting" setting
- Some complex markdown features may not translate perfectly to Word
- Try adjusting font settings in the plugin configuration

## Development Mode

If you want to modify the plugin:

```bash
# Install dependencies
npm install

# Start development mode (auto-rebuild on changes)
npm run dev

# Build for production
npm run build
```

After making changes, reload Obsidian (Ctrl/Cmd + R) to see updates.

## File Structure

```
ToWord/
├── main.ts              # Main plugin code
├── converter.ts         # Markdown to DOCX conversion logic
├── manifest.json        # Plugin metadata
├── package.json         # Dependencies
├── tsconfig.json        # TypeScript configuration
├── esbuild.config.mjs   # Build configuration
├── main.js              # Compiled output (generated)
└── README.md            # Documentation
```

## Support

For issues, feature requests, or questions:
1. Check the README.md for detailed documentation
2. Review the SAMPLE.md for supported features
3. Open an issue on GitHub (if published)

## Next Steps

1. Try exporting different types of markdown files
2. Customize the settings to match your preferences
3. Share feedback or contribute improvements!

Enjoy exporting your notes to Word! 📝✨
