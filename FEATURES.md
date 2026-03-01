# Feature Documentation

## Complete Feature List

### Core Export Features

#### Text Formatting
- **Bold Text**: `**text**` or `__text__`
- **Italic Text**: `*text*` or `_text_`
- **Bold + Italic**: `***text***` or `___text___`
- **Strikethrough**: `~~text~~`
- **Highlight**: `==text==`
- **Inline Code**: `` `code` ``

#### Headings
- H1: `# Heading 1`
- H2: `## Heading 2`
- H3: `### Heading 3`
- H4: `#### Heading 4`
- H5: `##### Heading 5`
- H6: `###### Heading 6`

#### Lists

**Unordered Lists**
```markdown
- Item 1
- Item 2
  - Nested item
  - Another nested item
- Item 3
```

**Ordered Lists**
```markdown
1. First item
2. Second item
   1. Nested item
   2. Another nested item
3. Third item
```

#### Code Blocks
````markdown
```javascript
function example() {
    console.log("Hello World");
}
```
````

Features:
- Monospace font (Courier New)
- Gray background shading
- Preserves indentation
- Supports all languages

#### Tables

```markdown
| Column 1 | Column 2 | Column 3 |
|----------|:--------:|---------:|
| Left     | Center   | Right    |
| Aligned  | Aligned  | Aligned  |
```

Features:
- Column alignment (left, center, right)
- Header row with gray background
- Automatic width distribution
- Cell text formatting preserved

#### Blockquotes

```markdown
> This is a blockquote
> It can span multiple lines
```

Features:
- Left border indicator
- Indented text
- Preserves inline formatting

#### Horizontal Rules

```markdown
---
***
___
```

All three styles create a horizontal line in the Word document.

### Configuration Options

#### Font Settings

**Default Font Family**
- Type: Text input
- Default: `Calibri`
- Common options:
  - Arial
  - Times New Roman
  - Calibri
  - Georgia
  - Verdana
  - Helvetica

**Default Font Size**
- Type: Number
- Default: `11` points
- Recommended range: 10-14 points
- Affects all body text (headings are automatically scaled)

#### Export Options

**Include Metadata**
- Type: Toggle
- Default: `OFF`
- When enabled: Exports YAML frontmatter as text
- When disabled: Skips frontmatter entirely

**Preserve Formatting**
- Type: Toggle
- Default: `ON`
- When enabled: Converts all markdown formatting to Word styles
- When disabled: Exports as plain text

### User Interface

#### Ribbon Icon
- Location: Left sidebar
- Icon: Document/file icon
- Action: Exports currently active file
- Tooltip: "Export to Word"

#### Command Palette
- Command: "Export current file to Word"
- Shortcut: None (can be customized in Obsidian settings)
- Availability: Only when a markdown file is active

#### Context Menu
- Location: File explorer right-click menu
- Availability: Only on `.md` files
- Action: Exports the selected file

### Technical Specifications

#### Supported Platforms
- ✅ Windows 10/11
- ✅ macOS 10.15+
- ✅ Linux (Ubuntu, Fedora, etc.)
- ✅ iOS 13+
- ✅ iPadOS 13+
- ✅ Android (via Obsidian mobile)

#### File Output
- Format: `.docx` (Microsoft Word 2007+)
- Compatibility: Word, LibreOffice, Google Docs, Pages
- Encoding: UTF-8
- Default location: System Downloads folder

#### Performance
- Small files (<100KB): Instant
- Medium files (100KB-1MB): 1-2 seconds
- Large files (>1MB): 2-5 seconds
- No file size limit (limited by available memory)

### Markdown Compatibility

#### Fully Supported
- ✅ CommonMark syntax
- ✅ GitHub Flavored Markdown (GFM)
- ✅ Basic Obsidian syntax
- ✅ Standard formatting

#### Partially Supported
- ⚠️ Wikilinks (exported as plain text)
- ⚠️ Custom callouts (exported as blockquotes)
- ⚠️ Math equations (exported as plain text)
- ⚠️ Footnotes (exported as plain text)

#### Images and Embeds
- ✅ **Embedded Images**: Both wikilink style `![[image.png]]` and standard markdown `![alt](image.png)` are supported
- ✅ **Resizer Plugin Integration**: Automatically respects image size specifications
  - `![[image.png|447]]` - Width specification (maintains aspect ratio)
  - `![[image.png|447x300]]` - Width and height specification
  - `![alt](image.png|447)` - Standard markdown with size
- ✅ **Image Formats**: PNG, JPEG, GIF, SVG
- ✅ **Auto-sizing**: Images larger than 600px width are automatically scaled down
- ❌ **PDF Embeds**: PDFs are skipped during export (Word cannot embed PDF files)

#### Not Supported
- ❌ PDF embeds (Word format limitation)
- ❌ Task lists (exported as regular lists)
- ❌ Mermaid diagrams
- ❌ Custom HTML

### Export Behavior

#### File Naming
- Output filename: `{original-name}.docx`
- Example: `My Note.md` → `My Note.docx`
- Special characters: Automatically sanitized

#### Download Process
1. User triggers export
2. Plugin shows "Exporting to Word..." notice
3. Markdown is parsed and converted
4. DOCX file is generated in memory
5. Browser download is triggered
6. Success notice is shown
7. File appears in Downloads folder

#### Error Handling
- Invalid markdown: Gracefully handled, exports what's possible
- File access errors: User-friendly error message
- Large files: Progress indication via notices
- Network issues: N/A (all processing is local)

### Styling Details

#### Heading Styles
- H1: 16pt, bold
- H2: 14pt, bold
- H3: 13pt, bold
- H4: 12pt, bold
- H5: 11pt, bold
- H6: 11pt, italic

#### Code Styling
- Font: Courier New
- Background: Light gray (#F5F5F5)
- Size: Same as body text
- Spacing: Preserved

#### Table Styling
- Header: Gray background (#E7E6E6)
- Borders: Single line, black
- Width: 100% of page width
- Cell padding: Standard

#### List Styling
- Bullet: Standard round bullets
- Numbering: 1, 2, 3...
- Indentation: 0.5 inches per level
- Spacing: Standard

### Best Practices

#### For Best Results
1. Use standard markdown syntax
2. Avoid complex nested structures
3. Test with SAMPLE.md first
4. Keep tables simple (< 10 columns)
5. Use consistent heading hierarchy

#### Performance Tips
1. Export smaller sections for very large notes
2. Remove unnecessary formatting if export is slow
3. Close other resource-intensive apps
4. Use "Preserve Formatting: OFF" for faster exports

#### Compatibility Tips
1. Use common fonts for better compatibility
2. Avoid special characters in filenames
3. Test exported files in your target application
4. Keep table structures simple

### Future Enhancements

See CHANGELOG.md for planned features including:
- Image support
- Hyperlink preservation
- Custom templates
- Batch export
- And more!

---

**For questions or feature requests, please refer to the README.md or open an issue on GitHub.**
