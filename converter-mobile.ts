import { zip, strToU8 } from 'fflate';
import MarkdownIt from 'markdown-it';
import type Token from 'markdown-it/lib/token';
import { full as markdownItEmoji } from 'markdown-it-emoji';
import markdownItMark from 'markdown-it-mark';
import hljs from 'highlight.js';

interface ToWordSettings {
	defaultFontFamily: string;
	defaultFontSize: number;
	includeMetadata: boolean;
	preserveFormatting: boolean;
	useObsidianAppearance: boolean;
	includeFilenameAsHeader: boolean;
	pageSize: 'A4' | 'A5' | 'A3' | 'Letter' | 'Legal' | 'Tabloid';
	chunkingThreshold: number;
	enablePreprocessing: boolean;
}

interface TextStyle {
	bold?: boolean;
	italic?: boolean;
	strikethrough?: boolean;
	code?: boolean;
	highlight?: boolean;
	underline?: boolean;
	color?: string;
	superScript?: boolean;
	subScript?: boolean;
	backgroundColor?: string;
	codeBlock?: boolean;
}

interface ObsidianFontSettings {
	textFont: string;
	monospaceFont: string;
	baseFontSize: number;
	lineHeight: number;
	sizeMultiplier: number;
	headingSizes: number[];
	headingFonts: string[];
	headingColors: string[];
}

interface DocumentElement {
	type: 'paragraph' | 'heading' | 'list' | 'codeblock' | 'table' | 'break' | 'blockquote' | 'tasklist' | 'horizontal-rule' | 'image';
	content?: string;
	level?: number;
	style?: TextStyle;
	children?: DocumentElement[];
	rows?: string[][];
	alignments?: string[];
	language?: string;
	listType?: 'ordered' | 'unordered';
	items?: string[];
	tasks?: Array<{ checked: boolean; text: string }>;
	quoteLevel?: number;
	imageData?: ArrayBuffer;
	imageAlt?: string;
	imageWidth?: number;
	imageHeight?: number;
}

export class MarkdownToDocxConverter {
	private settings: ToWordSettings;
	private obsidianFonts: ObsidianFontSettings | null = null;
	private filename: string = '';
	private resourceLoader?: (link: string) => Promise<ArrayBuffer | null>;
	private footnoteDefinitions: Map<string, string> = new Map();
	private footnotes: { [key: string]: string } = {};
	private usedFootnotes: string[] = [];
	private imageCounter: number = 0;
	private imageRelationships: Array<{id: string, data: ArrayBuffer, extension: string}> = [];
	private md: MarkdownIt;

	constructor(settings: ToWordSettings) {
		this.settings = settings;
		this.md = new MarkdownIt({ html: true, linkify: false, typographer: false, breaks: false });
		this.md.use(markdownItEmoji);
		this.md.use(markdownItMark);
	}

	// Chunked processing for large documents
	private splitMarkdownByHeadings(markdown: string, maxChunkSize: number = 50000): string[] {
		const chunks: string[] = [];
		const lines = markdown.split('\n');
		
		let currentChunk: string[] = [];
		let currentSize = 0;
		
		for (let i = 0; i < lines.length; i++) {
			const line = lines[i];
			const lineSize = line.length + 1; // +1 for newline
			
			// Check if this is a heading (H1, H2, H3)
			const isHeading = /^#{1,3}\s/.test(line.trim());
			
			// If we hit a heading and current chunk is getting large, split here
			if (isHeading && currentSize > maxChunkSize * 0.7 && currentChunk.length > 0) {
				chunks.push(currentChunk.join('\n'));
				currentChunk = [line];
				currentSize = lineSize;
			} else {
				currentChunk.push(line);
				currentSize += lineSize;
				
				// Force split if chunk gets too large
				if (currentSize > maxChunkSize) {
					chunks.push(currentChunk.join('\n'));
					currentChunk = [];
					currentSize = 0;
				}
			}
		}
		
		// Add remaining content
		if (currentChunk.length > 0) {
			chunks.push(currentChunk.join('\n'));
		}
		
		return chunks.filter(chunk => chunk.trim().length > 0);
	}

	private async processChunkedConversion(
		markdown: string,
		title: string,
		obsidianFonts?: ObsidianFontSettings | null,
		resourceLoader?: (link: string) => Promise<ArrayBuffer | null>,
	): Promise<Blob> {
		this.obsidianFonts = obsidianFonts || null;
		this.filename = title;
		this.resourceLoader = resourceLoader;

		// Note: markdown is already pre-processed by convert() method
		const { content: cleanedMarkdown, definitions } = this.extractFootnotes(markdown);
		this.footnoteDefinitions = definitions;
		
		// Reset state
		this.footnotes = {};
		this.usedFootnotes = [];
		this.imageCounter = 0;
		this.imageRelationships = [];
		definitions.forEach((value, key) => {
			this.footnotes[key] = value;
		});

		// Split into chunks
		const chunks = this.splitMarkdownByHeadings(cleanedMarkdown);
		let allElements: DocumentElement[] = [];

		// Add filename as header if enabled
		if (this.settings.includeFilenameAsHeader) {
			allElements.push({
				type: 'heading',
				level: 1,
				content: title
			});
		}

		// Process each chunk
		for (let i = 0; i < chunks.length; i++) {
			try {
				const chunkElements = await this.parseMarkdownToElements(chunks[i]);
				allElements = allElements.concat(chunkElements);
				
				// Force garbage collection hint after each chunk
				if (globalThis.gc) {
					globalThis.gc();
				}
				
				// Small delay to prevent UI blocking
				await new Promise(resolve => setTimeout(resolve, 10));
				
			} catch (error) {
				console.error(`Error processing chunk ${i + 1}:`, error);
				// Continue with other chunks even if one fails
			}
		}

		// Add footnotes at the end if any were used
		const hasExistingFootnotes = allElements.some(element => 
			element.type === 'heading' && 
			element.content && 
			/^footnotes?$/i.test(element.content.trim())
		);
		
		if (this.usedFootnotes.length > 0 && !hasExistingFootnotes) {
			allElements.push({ type: 'break' });
			allElements.push({
				type: 'heading',
				level: 2,
				content: 'Footnotes'
			});

			for (let i = 0; i < this.usedFootnotes.length; i++) {
				const footnoteLabel = this.usedFootnotes[i];
				const footnoteText = this.footnoteDefinitions.get(footnoteLabel) || `[Missing footnote: ${footnoteLabel}]`;
				
				allElements.push({
					type: 'paragraph',
					content: `${i + 1}. ${footnoteText}`
				});
			}
		}

		const docxBlob = await this.generateDocx(allElements, title);

		this.resourceLoader = undefined;
		return docxBlob;
	}

	async convert(
		markdown: string,
		title: string,
		obsidianFonts?: ObsidianFontSettings | null,
		resourceLoader?: (link: string) => Promise<ArrayBuffer | null>,
	): Promise<Blob> {
		// Pre-process markdown to fix common issues (if enabled)
		const cleanedMarkdown = this.settings.enablePreprocessing ? this.preprocessMarkdown(markdown) : markdown;
		
		// Check if we should use chunked processing for large documents
		const threshold = this.settings.chunkingThreshold || 100000; // Fallback to 100KB
		
		if (cleanedMarkdown.length > threshold) {
			return this.processChunkedConversion(cleanedMarkdown, title, obsidianFonts, resourceLoader);
		}

		// Normal processing for smaller documents
		return this.processNormalConversion(cleanedMarkdown, title, obsidianFonts, resourceLoader);
	}

	// Pre-process markdown to fix common conversion issues
	private preprocessMarkdown(markdown: string): string {
		let cleaned = markdown;

		// 1. Convert Obsidian wikilinks to standard markdown links
		// [[Link]] -> [Link](Link.md)
		// But avoid matching parts of URLs or image syntax
		cleaned = cleaned.replace(/\[\[([^\]]+)\]\]/g, (match, content, offset, string) => {
			// Skip if this is part of an image syntax (preceded by !)
			if (offset > 0 && string[offset - 1] === '!') {
				return match; // Keep original
			}
			
			// Skip if content looks like a URL or file path
			if (content.includes('http://') || content.includes('https://') || content.includes('://')) {
				return match; // Keep original
			}
			
			// Handle section links like [[File#Section]]
			if (content.includes('#')) {
				const [file, section] = content.split('#', 2);
				return `[${content}](${file.trim()}.md#${section.trim().replace(/\s+/g, '-').toLowerCase()})`;
			}
			return `[${content}](${content.trim()}.md)`;
		});

		// 2. Convert Obsidian image embeds to standard markdown images  
		// ![[image.png]] -> ![image.png](image.png)
		// DISABLED: This conversion interferes with resourceLoader functionality
		// Keep original embedded syntax for proper processing
		// cleaned = cleaned.replace(/!\[\[([^\]]+)\]\]/g, (match, imagePath) => {
		// 	// Extract just the filename, handle paths with special characters
		// 	const filename = imagePath.split('/').pop() || imagePath;
		// 	const altText = filename.split('.')[0]; // Use filename without extension as alt text
		// 	return `![${altText}](${imagePath})`;
		// });

		// 3. Convert Obsidian callouts to standard blockquotes
		// > [!NOTE] Title -> > **NOTE: Title**
		cleaned = cleaned.replace(/^>\s*\[!(\w+)\](\s*(.+))?$/gm, (match, type, titlePart, title) => {
			const calloutTitle = title ? ` ${title.trim()}` : '';
			return `> **${type.toUpperCase()}:${calloutTitle}**`;
		});

		// 4. Process reference-style links
		// Collect all reference definitions first
		const referenceDefinitions = new Map<string, string>();
		cleaned = cleaned.replace(/^\s*\[([^\]]+)\]:\s*(.+)$/gm, (match, ref, url) => {
			referenceDefinitions.set(ref.toLowerCase(), url.trim());
			return ''; // Remove the definition line
		});
		
		// Convert reference links to inline links
		cleaned = cleaned.replace(/\[([^\]]+)\]\[([^\]]+)\]/g, (match, text, ref) => {
			const url = referenceDefinitions.get(ref.toLowerCase());
			return url ? `[${text}](${url})` : match;
		});
		
		// 6. Convert math notation to plain text (temporary solution)
		// Block math $$...$$
		cleaned = cleaned.replace(/\$\$([^$]+?)\$\$/g, (match, math) => {
			return `\n\n**[Math Formula]**: ${math.trim()}\n\n`;
		});
		
		// Inline math $...$
		cleaned = cleaned.replace(/\$([^$\n]+?)\$/g, (match, math) => {
			return `**[Math]**: ${math.trim()}`;
		});
		
		// 7. Convert auto-links and email links
		cleaned = cleaned.replace(/<(https?:\/\/[^>\s]+)>/g, '[$1]($1)');
		cleaned = cleaned.replace(/<([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})>/g, '[$1](mailto:$1)');
		
		// 8. Convert alternative heading syntax (setext-style headings)
		// H1 with equals: Text\n===== -> # Text
		cleaned = cleaned.replace(/^(.+)\n={3,}$/gm, '# $1');
		// H2 with dashes: Text\n----- -> ## Text  
		cleaned = cleaned.replace(/^(.+)\n-{3,}$/gm, '## $1');
		
		// 9. Clean up escaped characters that might interfere with parsing
		// These will be properly handled by markdown-it, but we ensure they're not double-escaped
		cleaned = cleaned.replace(/\\([*_`~=\[\]\\])/g, '\\$1'); // Preserve escaping

		// 5. Fix YAML frontmatter issues - ensure proper fences
		if (cleaned.startsWith('---')) {
			const lines = cleaned.split('\n');
			let frontmatterEnd = -1;
			for (let i = 1; i < lines.length; i++) {
				if (lines[i].trim() === '---') {
					frontmatterEnd = i;
					break;
				}
			}
			// If no closing fence found, add one
			if (frontmatterEnd === -1) {
				const firstEmptyLine = lines.findIndex((line, index) => index > 0 && line.trim() === '');
				if (firstEmptyLine > 0) {
					lines.splice(firstEmptyLine, 0, '---');
					cleaned = lines.join('\n');
				}
			}
		}

		// 5. Clean up invisible/problematic characters
		cleaned = cleaned
			// Remove BOM
			.replace(/^\uFEFF/, '')
			// Replace non-breaking spaces with regular spaces
			.replace(/\u00A0/g, ' ')
			// Remove zero-width spaces
			.replace(/\u200B/g, '')
			// Replace curly quotes with straight quotes
			.replace(/[""]/g, '"')
			.replace(/['']/g, "'");

		// 6. Fix unclosed HTML tags in common cases
		cleaned = cleaned
			// Ensure <br> tags are self-closing
			.replace(/<br(?!\s*\/?>)/g, '<br />')
			// Close common unclosed tags
			.replace(/<(div|span|p)([^>]*)>(?![^<]*<\/\1>)/g, '<$1$2></$1>');

		// 7. Fix malformed tables - ensure header separator row exists
		cleaned = this.fixMalformedTables(cleaned);

		// 8. Clean up math notation - ensure proper fencing
		cleaned = cleaned
			// Fix unclosed inline math
			.replace(/\$([^$\n]+)(?!\$)/g, '$$$1$$')
			// Fix unclosed block math - use multiline approach without 's' flag
			.replace(/\$\$([^$]+?)(?!\$\$)/g, '$$$$1$$$$');

		return cleaned;
	}

	// Fix malformed tables by ensuring header separator rows exist
	private fixMalformedTables(markdown: string): string {
		const lines = markdown.split('\n');
		const result: string[] = [];
		
		for (let i = 0; i < lines.length; i++) {
			const line = lines[i];
			result.push(line);
			
			// Check if this looks like a table header
			if (line.includes('|') && line.trim().startsWith('|') && line.trim().endsWith('|')) {
				const nextLine = lines[i + 1];
				
				// If next line doesn't look like a separator, add one
				if (nextLine && !nextLine.match(/^\s*\|[\s\-:]*\|/)) {
					// Count columns in header
					const columns = line.split('|').length - 2; // -2 for leading/trailing empty parts
					if (columns > 0) {
						// Create separator row
						const separator = '|' + ' --- |'.repeat(columns);
						result.push(separator);
					}
				}
			}
		}
		
		return result.join('\n');
	}

	// Public method to force chunked processing regardless of size
	async convertWithChunking(
		markdown: string,
		title: string,
		obsidianFonts?: ObsidianFontSettings | null,
		resourceLoader?: (link: string) => Promise<ArrayBuffer | null>,
		maxChunkSize: number = 50000
	): Promise<Blob> {
		return this.processChunkedConversion(markdown, title, obsidianFonts, resourceLoader);
	}

	private async processNormalConversion(
		markdown: string,
		title: string,
		obsidianFonts?: ObsidianFontSettings | null,
		resourceLoader?: (link: string) => Promise<ArrayBuffer | null>,
	): Promise<Blob> {
		this.obsidianFonts = obsidianFonts || null;
		this.filename = title;
		this.resourceLoader = resourceLoader;

		// Note: markdown is already pre-processed by convert() method
		const { content: cleanedMarkdown, definitions } = this.extractFootnotes(markdown);
		this.footnoteDefinitions = definitions;
		
		// Convert Map to object for easier access and reset used footnotes
		this.footnotes = {};
		this.usedFootnotes = [];
		this.imageCounter = 0;
		this.imageRelationships = [];
		definitions.forEach((value, key) => {
			this.footnotes[key] = value;
		});

		// Parse markdown to document elements
		const elements = await this.parseMarkdownToElements(cleanedMarkdown);

		// Add filename as header if enabled
		if (this.settings.includeFilenameAsHeader) {
			elements.unshift({
				type: 'heading',
				level: 1,
				content: title
			});
		}

		// Add footnotes at the end if any were used (only if no existing footnote section found)
		const hasExistingFootnotes = elements.some(element => 
			element.type === 'heading' && 
			element.content && 
			/^footnotes?$/i.test(element.content.trim())
		);
		
		if (this.usedFootnotes.length > 0 && !hasExistingFootnotes) {
			elements.push({ type: 'break' });
			elements.push({
				type: 'heading',
				level: 2,
				content: 'Footnotes'
			});

			for (let i = 0; i < this.usedFootnotes.length; i++) {
				const footnoteLabel = this.usedFootnotes[i];
				const footnoteText = this.footnoteDefinitions.get(footnoteLabel) || `[Missing footnote: ${footnoteLabel}]`;
				
				elements.push({
					type: 'paragraph',
					content: `${i + 1}. ${footnoteText}`
				});
			}
		}

		// Generate DOCX
		const docxBlob = await this.generateDocx(elements, title);

		this.resourceLoader = undefined;
		return docxBlob;
	}

	private generateDocx(elements: DocumentElement[], title: string): Promise<Blob> {
		// Generate document XML first (this processes images and populates imageRelationships)
		const documentXml = this.getDocumentXml(elements);

		// Create files object for fflate
		const files: { [path: string]: Uint8Array } = {};

		// Add required DOCX structure (relationships must come after document generation)
		files['[Content_Types].xml'] = strToU8(this.getContentTypesXml());
		files['_rels/.rels'] = strToU8(this.getRelsXml());
		files['word/_rels/document.xml.rels'] = strToU8(this.getDocumentRelsXml());
		files['word/styles.xml'] = strToU8(this.getStylesXml());
		files['word/numbering.xml'] = strToU8(this.getNumberingXml());
		files['word/document.xml'] = strToU8(documentXml);

		// Add image files to the ZIP
		this.imageRelationships.forEach(rel => {
			const filename = `word/media/image${rel.id.replace('rId', '')}.${rel.extension}`;
			files[filename] = rel.data instanceof Uint8Array ? rel.data : new Uint8Array(rel.data);
		});

		// Create ZIP using fflate
		return new Promise((resolve, reject) => {
			zip(files, { level: 6 }, (err, data) => {
				if (err) {
					console.error('ZIP creation failed:', err);
					reject(err);
				} else {
					const blob = new Blob([new Uint8Array(data)], {
						type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
					});
					resolve(blob);
				}
			});
		});
	}

	private getContentTypesXml(): string {
		let imageTypes = '';
		const extensions = new Set(this.imageRelationships.map(rel => rel.extension));
		extensions.forEach(ext => {
			let contentType = '';
			switch (ext) {
				case 'png':
					contentType = 'image/png';
					break;
				case 'jpeg':
				case 'jpg':
					contentType = 'image/jpeg';
					break;
				case 'gif':
					contentType = 'image/gif';
					break;
				default:
					contentType = 'image/png';
			}
			imageTypes += `  <Default Extension="${ext}" ContentType="${contentType}"/>\n`;
		});
		
		return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
${imageTypes}  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
  <Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>
  <Override PartName="/word/numbering.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.numbering+xml"/>
</Types>`;
	}

	private getRelsXml(): string {
		return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>`;
	}

	private getDocumentRelsXml(): string {
		let imageRels = '';
		this.imageRelationships.forEach(rel => {
			const target = `media/image${rel.id.replace('rId', '')}.${rel.extension}`;
			imageRels += `  <Relationship Id="${rel.id}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="${target}"/>\n`;
		});
		
		return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
  <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/numbering" Target="numbering.xml"/>
${imageRels}</Relationships>`;
	}

	private getNumberingXml(): string {
		return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:numbering xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:abstractNum w:abstractNumId="0">
    <w:nsid w:val="0001"/>
    <w:multiLevelType w:val="singleLevel"/>
    <w:lvl w:ilvl="0">
      <w:start w:val="1"/>
      <w:numFmt w:val="bullet"/>
      <w:lvlText w:val="•"/>
      <w:lvlJc w:val="left"/>
      <w:pPr>
        <w:ind w:left="720" w:hanging="360"/>
      </w:pPr>
    </w:lvl>
    <w:lvl w:ilvl="1">
      <w:start w:val="1"/>
      <w:numFmt w:val="bullet"/>
      <w:lvlText w:val="◦"/>
      <w:lvlJc w:val="left"/>
      <w:pPr>
        <w:ind w:left="1440" w:hanging="360"/>
      </w:pPr>
    </w:lvl>
  </w:abstractNum>
  <w:abstractNum w:abstractNumId="1">
    <w:nsid w:val="0002"/>
    <w:multiLevelType w:val="singleLevel"/>
    <w:lvl w:ilvl="0">
      <w:start w:val="1"/>
      <w:numFmt w:val="decimal"/>
      <w:lvlText w:val="%1."/>
      <w:lvlJc w:val="left"/>
      <w:pPr>
        <w:ind w:left="720" w:hanging="360"/>
      </w:pPr>
    </w:lvl>
    <w:lvl w:ilvl="1">
      <w:start w:val="1"/>
      <w:numFmt w:val="lowerLetter"/>
      <w:lvlText w:val="%2."/>
      <w:lvlJc w:val="left"/>
      <w:pPr>
        <w:ind w:left="1440" w:hanging="360"/>
      </w:pPr>
    </w:lvl>
  </w:abstractNum>
  <w:num w:numId="1">
    <w:abstractNumId w:val="0"/>
  </w:num>
  <w:num w:numId="2">
    <w:abstractNumId w:val="1"/>
  </w:num>
</w:numbering>`;
	}

	private getStylesXml(): string {
		const fontFamily = this.getFontFamily();
		const fontSize = this.getFontSize() * 2; // Half-points

		return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:docDefaults>
    <w:rPrDefault>
      <w:rPr>
        <w:rFonts w:ascii="${fontFamily}" w:hAnsi="${fontFamily}" w:cs="${fontFamily}"/>
        <w:sz w:val="${fontSize}"/>
        <w:szCs w:val="${fontSize}"/>
        <w:lang w:val="en-US"/>
      </w:rPr>
    </w:rPrDefault>
    <w:pPrDefault>
      <w:pPr>
        <w:spacing w:after="120" w:line="276" w:lineRule="auto"/>
      </w:pPr>
    </w:pPrDefault>
  </w:docDefaults>
  <w:style w:type="paragraph" w:default="1" w:styleId="Normal">
    <w:name w:val="Normal"/>
    <w:qFormat/>
    <w:rPr>
      <w:rFonts w:ascii="${fontFamily}" w:hAnsi="${fontFamily}" w:cs="${fontFamily}"/>
      <w:sz w:val="${fontSize}"/>
      <w:szCs w:val="${fontSize}"/>
    </w:rPr>
  </w:style>
  ${this.generateHeadingStyles()}
  ${this.generateCodeStyle()}
</w:styles>`;
	}

	private generateHeadingStyles(): string {
		const fontFamily = this.getFontFamily();
		const baseFontSize = this.getFontSize();
		let styles = '';

		for (let i = 1; i <= 6; i++) {
			const headingSize = this.getHeadingSize(i);
			const sizeInHalfPoints = headingSize * 2;

			styles += `
  <w:style w:type="paragraph" w:styleId="Heading${i}">
    <w:name w:val="heading ${i}"/>
    <w:basedOn w:val="Normal"/>
    <w:next w:val="Normal"/>
    <w:link w:val="Heading${i}Char"/>
    <w:uiPriority w:val="9"/>
    <w:qFormat/>
    <w:pPr>
      <w:keepNext/>
      <w:keepLines/>
      <w:spacing w:before="240" w:after="120"/>
      <w:outlineLvl w:val="${i - 1}"/>
    </w:pPr>
    <w:rPr>
      <w:rFonts w:ascii="${fontFamily}" w:hAnsi="${fontFamily}" w:cs="${fontFamily}"/>
      <w:b/>
      <w:bCs/>
      <w:sz w:val="${sizeInHalfPoints}"/>
      <w:szCs w:val="${sizeInHalfPoints}"/>
    </w:rPr>
  </w:style>`;
		}

		return styles;
	}

	private generateCodeStyle(): string {
		const codeFont = this.getCodeFont();
		const fontSize = this.getFontSize() * 2;

		return `
  <w:style w:type="character" w:styleId="CodeChar">
    <w:name w:val="Code"/>
    <w:rPr>
      <w:rFonts w:ascii="${codeFont}" w:hAnsi="${codeFont}" w:cs="${codeFont}"/>
      <w:b/>
      <w:sz w:val="${fontSize}"/>
      <w:szCs w:val="${fontSize}"/>
      <w:shd w:val="clear" w:color="auto" w:fill="F5F5F5"/>
    </w:rPr>
  </w:style>
  <w:style w:type="paragraph" w:styleId="CodeBlock">
    <w:name w:val="Code Block"/>
    <w:basedOn w:val="Normal"/>
    <w:rPr>
      <w:rFonts w:ascii="${codeFont}" w:hAnsi="${codeFont}" w:cs="${codeFont}"/>
      <w:sz w:val="${Math.round(fontSize * 0.9)}"/>
      <w:szCs w:val="${Math.round(fontSize * 0.9)}"/>
      <w:color w:val="2F3337"/>
    </w:rPr>
    <w:pPr>
      <w:shd w:val="clear" w:color="auto" w:fill="F8F8F8"/>
      <w:spacing w:before="120" w:after="120" w:line="276" w:lineRule="auto"/>
      <w:ind w:left="240" w:right="240"/>
      <w:contextualSpacing/>
      <w:bdr>
        <w:top w:val="single" w:sz="4" w:space="1" w:color="E1E4E8"/>
        <w:left w:val="single" w:sz="4" w:space="1" w:color="E1E4E8"/>
        <w:bottom w:val="single" w:sz="4" w:space="1" w:color="E1E4E8"/>
        <w:right w:val="single" w:sz="4" w:space="1" w:color="E1E4E8"/>
      </w:bdr>
    </w:pPr>
  </w:style>`;
	}

	private getDocumentXml(elements: DocumentElement[]): string {
		const pageSize = this.getPageSize();

		let content = '';
		let convertedCount = 0;
		for (const element of elements) {
			content += this.elementToXml(element);
			convertedCount++;
		}

		// Skip footnote XML generation - let the document handle its own footnotes
		let footnotesXml = '';
		/*
		// Add footnotes at the end of the document
		if (this.usedFootnotes.length > 0) {
			footnotesXml = '<w:p><w:pPr><w:pStyle w:val="Heading2"/></w:pPr><w:r><w:t>Footnotes</w:t></w:r></w:p>';
			this.usedFootnotes.forEach((footnoteId, index) => {
				const footnoteText = this.footnotes[footnoteId] || footnoteId;
				// Process footnote text for inline formatting
				const formattedFootnoteText = this.parseInlineFormatting(footnoteText);
				footnotesXml += `<w:p><w:pPr></w:pPr><w:r><w:rPr><w:vertAlign w:val="superscript"/></w:rPr><w:t>${index + 1}</w:t></w:r><w:r><w:t> </w:t></w:r>${formattedFootnoteText}</w:p>`;
			});
		}
		*/

		const finalXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" 
            xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing"
            xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"
            xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture"
            xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <w:body>
    ${content}
    ${footnotesXml}
    <w:sectPr>
      <w:pgSz w:w="${pageSize.width}" w:h="${pageSize.height}"/>
      <w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440"/>
    </w:sectPr>
  </w:body>
</w:document>`;

		return finalXml;
	}

	private elementToXml(element: DocumentElement): string {
		try {
			switch (element.type) {
				case 'heading':
					return this.headingToXml(element);
				case 'paragraph':
					return this.paragraphToXml(element);
				case 'codeblock':
					return this.codeBlockToXml(element);
				case 'list':
					return this.listToXml(element);
				case 'table':
					return this.tableToXml(element);
				case 'blockquote':
					return this.blockquoteToXml(element);
				case 'tasklist':
					return this.taskListToXml(element);
				case 'horizontal-rule':
					return this.horizontalRuleToXml();
				case 'image':
					return this.imageToXml(element);
				case 'break':
					return '<w:p><w:pPr></w:pPr></w:p>';
				default:
					return '';
			}
		} catch (error) {
			console.error('Error converting element to XML:', element.type, error);
			// Return a safe fallback instead of crashing
			return `<w:p><w:pPr></w:pPr><w:r><w:t>[Error processing ${element.type}]</w:t></w:r></w:p>`;
		}
	}

	private headingToXml(element: DocumentElement): string {
		const styleId = `Heading${element.level || 1}`;
		
		// Parse inline formatting in headings if preservation is enabled
		let content;
		if (this.settings.preserveFormatting) {
			content = this.parseInlineFormatting(element.content || '');
		} else {
			content = `<w:r><w:t>${this.escapeXml(element.content || '')}</w:t></w:r>`;
		}

		return `<w:p>
  <w:pPr>
    <w:pStyle w:val="${styleId}"/>
  </w:pPr>
  ${content}
</w:p>`;
	}

	private paragraphToXml(element: DocumentElement): string {
		const text = this.escapeXml(element.content || '');
		
		if (!this.settings.preserveFormatting) {
			return `<w:p>
  <w:pPr></w:pPr>
  <w:r>
    <w:t>${text}</w:t>
  </w:r>
</w:p>`;
		}

		// Parse inline formatting
		const runs = this.parseInlineFormatting(element.content || '');
		
		return `<w:p>
  <w:pPr></w:pPr>
  ${runs}
</w:p>`;
	}

	private codeBlockToXml(element: DocumentElement): string {
		const content = element.content || '';
		const language = element.language || '';
		
		// Apply syntax highlighting if language is specified
		let highlightedHtml = '';
		if (language) {
			try {
				const result = hljs.highlight(content, { language: language, ignoreIllegals: true });
				highlightedHtml = result.value;
			} catch (e) {
				// If highlighting fails, fall back to plain text
				highlightedHtml = this.escapeXml(content);
			}
		} else {
			highlightedHtml = this.escapeXml(content);
		}
		
		// Convert highlighted HTML to Word XML with colors
		const highlightedXml = this.convertHighlightedToWord(highlightedHtml);
		
		// Split the highlighted XML into lines and wrap each in a paragraph
		const lines = content.split('\n');
		let xml = '';

		if (highlightedHtml.includes('<span class=')) {
			// Has syntax highlighting - process line by line
			const highlightedLines = highlightedHtml.split('\n');
			for (let i = 0; i < highlightedLines.length; i++) {
				const lineXml = this.convertHighlightedToWord(highlightedLines[i]);
				xml += `<w:p>
  <w:pPr>
    <w:pStyle w:val="CodeBlock"/>
    <w:spacing w:line="240" w:lineRule="auto"/>
    <w:contextualSpacing/>
  </w:pPr>
  ${lineXml}
</w:p>`;
			}
		} else {
			// No syntax highlighting - use simple approach
			for (let i = 0; i < lines.length; i++) {
				const line = lines[i];
				const escapedLine = this.escapeXml(line);
				
				xml += `<w:p>
  <w:pPr>
    <w:pStyle w:val="CodeBlock"/>
    <w:spacing w:line="240" w:lineRule="auto"/>
    <w:contextualSpacing/>
  </w:pPr>
  <w:r><w:rPr><w:rFonts w:ascii="Courier New" w:hAnsi="Courier New" w:cs="Courier New"/><w:b/><w:color w:val="2F3337"/></w:rPr><w:t xml:space="preserve">${escapedLine}</w:t></w:r>
</w:p>`;
			}
		}

		return xml;
	}

	private convertHighlightedToWord(highlightedHtml: string): string {
		// Check if HTML contains actual highlighting
		if (!highlightedHtml.includes('<span class=')) {
			// No highlighting, return as monospace text with proper formatting
			return `<w:r><w:rPr><w:rFonts w:ascii="Courier New" w:hAnsi="Courier New" w:cs="Courier New"/><w:b/><w:color w:val="2F3337"/></w:rPr><w:t xml:space="preserve">${this.escapeXml(highlightedHtml)}</w:t></w:r>`;
		}
		
		// Enhanced color mappings for better syntax highlighting
		const colorMap: { [key: string]: string } = {
			// Keywords (blue)
			'hljs-keyword': '0000FF',
			'hljs-built_in': '0000FF', 
			'hljs-literal': '0000FF',
			
			// Strings (red)
			'hljs-string': 'D14',
			'hljs-regexp': 'D14',
			
			// Comments (green) 
			'hljs-comment': '008000',
			'hljs-doctag': '008000',
			
			// Numbers (purple)
			'hljs-number': '800080',
			
			// Functions (brown)
			'hljs-function': 'B07219',
			'hljs-title': 'B07219',
			'hljs-title function_': 'B07219',
			'hljs-title class_': 'B07219',
			
			// Variables (dark blue)
			'hljs-variable': '36BCF7',
			'hljs-variable language_': '36BCF7',
			'hljs-attr': '36BCF7',
			'hljs-property': '36BCF7',
			'hljs-params': '36BCF7',
			
			// Types (teal)
			'hljs-type': '267F99',
			'hljs-class': '267F99',
			
			// Tags (red)
			'hljs-tag': 'D14',
			'hljs-name': 'D14',
			'hljs-selector-tag': 'D14',
			
			// Meta (brown)
			'hljs-meta': 'B07219',
			'hljs-meta-string': 'D14',
			
			// Default (dark gray)
			'hljs-punctuation': '2F3337',
			'hljs-operator': '2F3337'
		};

		return this.parseHtmlToWordXml(highlightedHtml, colorMap);
	}

	private parseHtmlToWordXml(html: string, colorMap: { [key: string]: string }): string {
		let result = '';
		let pos = 0;

		while (pos < html.length) {
			const spanStart = html.indexOf('<span', pos);
			
			if (spanStart === -1) {
				// No more spans, add remaining text
				const remainingText = html.substring(pos);
				if (remainingText) {
					result += `<w:r><w:rPr><w:rFonts w:ascii="Courier New" w:hAnsi="Courier New" w:cs="Courier New"/><w:b/><w:color w:val="2F3337"/></w:rPr><w:t xml:space="preserve">${this.escapeXmlForCode(remainingText)}</w:t></w:r>`;
				}
				break;
			}

			// Add text before the span (preserve all whitespace)
			if (spanStart > pos) {
				const beforeText = html.substring(pos, spanStart);
				if (beforeText) {
					result += `<w:r><w:rPr><w:rFonts w:ascii="Courier New" w:hAnsi="Courier New" w:cs="Courier New"/><w:b/><w:color w:val="2F3337"/></w:rPr><w:t xml:space="preserve">${this.escapeXmlForCode(beforeText)}</w:t></w:r>`;
				}
			}

			// Find the class attribute
			const classStart = html.indexOf('class="', spanStart);
			if (classStart === -1) {
				pos = spanStart + 5; // Skip this span
				continue;
			}

			const classValueStart = classStart + 7; // Length of 'class="'
			const classValueEnd = html.indexOf('"', classValueStart);
			if (classValueEnd === -1) {
				pos = spanStart + 5;
				continue;
			}

			const className = html.substring(classValueStart, classValueEnd);
			
			// Find the end of the opening tag
			const tagEnd = html.indexOf('>', classValueEnd);
			if (tagEnd === -1) {
				pos = spanStart + 5;
				continue;
			}

			// Find the matching closing tag, handling nesting
			const spanContent = this.extractSpanContent(html, tagEnd + 1);
			if (!spanContent) {
				pos = spanStart + 5;
				continue;
			}

			const color = colorMap[className] || '000000';

			// If the content contains nested spans, parse them recursively
			if (spanContent.content.includes('<span')) {
				const nestedResult = this.parseHtmlToWordXml(spanContent.content, colorMap);
				result += nestedResult;
			} else {
				// Simple text content
				result += `<w:r><w:rPr><w:rFonts w:ascii="Courier New" w:hAnsi="Courier New" w:cs="Courier New"/><w:b/><w:color w:val="${color}"/></w:rPr><w:t xml:space="preserve">${this.escapeXmlForCode(spanContent.content)}</w:t></w:r>`;
			}

			pos = spanContent.endPos;
		}

		return result;
	}

	private extractSpanContent(html: string, startPos: number): { content: string; endPos: number } | null {
		let depth = 1;
		let pos = startPos;

		while (pos < html.length && depth > 0) {
			const nextOpen = html.indexOf('<span', pos);
			const nextClose = html.indexOf('</span>', pos);

			if (nextClose === -1) {
				return null; // Unclosed span
			}

			if (nextOpen !== -1 && nextOpen < nextClose) {
				// Found opening span before closing
				depth++;
				pos = nextOpen + 5;
			} else {
				// Found closing span
				depth--;
				if (depth === 0) {
					const content = html.substring(startPos, nextClose);
					return { content, endPos: nextClose + 7 }; // 7 = length of '</span>'
				}
				pos = nextClose + 7;
			}
		}

		return null;
	}	private listToXml(element: DocumentElement): string {
		let xml = '';
		const items = element.items || [];
		const children = element.children || [];

		for (let i = 0; i < items.length; i++) {
			const item = items[i];
			const childElement = children[i];
			const level = Math.min(childElement?.level || 0, 8); // Word supports max 9 levels (0-8)
			const runs = this.parseInlineFormatting(item);
			
			// Calculate indentation based on level - more generous spacing for readability
			const leftIndent = 720 + (level * 540); // 0.5 inch base + 0.375 inch per level
			const hanging = level === 0 ? 360 : 270; // Slightly less hanging for sub-levels

			// For better multi-level support, ensure we use the correct level value
			// Word's built-in numbering should handle different styles at different levels
			xml += `<w:p>
  <w:pPr>
    <w:ind w:left="${leftIndent}" w:hanging="${hanging}"/>
    <w:numPr>
      <w:ilvl w:val="${level}"/>
      <w:numId w:val="${element.listType === 'ordered' ? '2' : '1'}"/>
    </w:numPr>
    <w:spacing w:before="60" w:after="60"/>
  </w:pPr>
  ${runs}
</w:p>`;
		}

		return xml;
	}

	private tableToXml(element: DocumentElement): string {
		const rows = element.rows || [];
		const alignments = element.alignments || [];
		
		if (rows.length === 0) return '';

		let tableXml = '<w:tbl><w:tblPr><w:tblStyle w:val="TableGrid"/><w:tblW w:w="5000" w:type="pct"/></w:tblPr>';

		for (let rowIndex = 0; rowIndex < rows.length; rowIndex++) {
			const row = rows[rowIndex];
			const isHeader = rowIndex === 0;

			tableXml += '<w:tr>';
			for (let colIndex = 0; colIndex < row.length; colIndex++) {
				const cell = row[colIndex];
				const alignment = alignments[colIndex] || 'left';
				const cellRuns = this.parseInlineFormatting(cell);

				let justification = 'left';
				if (alignment === 'center') justification = 'center';
				if (alignment === 'right') justification = 'right';

				tableXml += `<w:tc>
  <w:tcPr>
    <w:tcW w:w="1800" w:type="dxa"/>
    ${isHeader ? '<w:shd w:val="clear" w:color="auto" w:fill="E7E6E6"/>' : ''}
  </w:tcPr>
  <w:p>
    <w:pPr>
      <w:jc w:val="${justification}"/>
    </w:pPr>
    ${isHeader ? cellRuns.replace(/<w:rPr>/, '<w:rPr><w:b/>') : cellRuns}
  </w:p>
</w:tc>`;
			}
			tableXml += '</w:tr>';
		}

		tableXml += '</w:tbl>';
		return tableXml;
	}

	private blockquoteToXml(element: DocumentElement): string {
		const content = element.content || '';
		const runs = this.parseInlineFormatting(content);
		const indentValue = 720 * (element.quoteLevel || 1); // 0.5 inch per level
		
		// Check if this is a callout (starts with **TYPE:**)
		const calloutMatch = content.match(/^\*\*(\w+):\s*(.*?)\*\*(.*)$/);
		if (calloutMatch) {
			const [, type, title, remaining] = calloutMatch;
			const calloutType = type.toLowerCase();
			
			// Define colors for different callout types
			const calloutColors: { [key: string]: { bg: string; border: string } } = {
				note: { bg: 'E7F3FF', border: '2196F3' },
				tip: { bg: 'E8F5E8', border: '4CAF50' },
				warning: { bg: 'FFF8E1', border: 'FF9800' },
				error: { bg: 'FFEBEE', border: 'F44336' },
				success: { bg: 'E8F5E8', border: '4CAF50' },
				info: { bg: 'E3F2FD', border: '2196F3' }
			};
			
			const colors = calloutColors[calloutType] || calloutColors.note;
			const titleText = title ? title.trim() : '';
			const contentText = remaining ? remaining.trim() : '';
			
			// Common paragraph properties for callout
			const calloutPProps = `
    <w:ind w:left="${indentValue}"/>
    <w:shd w:val="clear" w:color="auto" w:fill="${colors.bg}"/>
    <w:pBdr>
      <w:left w:val="single" w:sz="18" w:space="4" w:color="${colors.border}"/>
      <w:top w:val="single" w:sz="6" w:space="4" w:color="${colors.border}"/>
      <w:right w:val="single" w:sz="6" w:space="4" w:color="${colors.border}"/>
      <w:bottom w:val="single" w:sz="6" w:space="4" w:color="${colors.border}"/>
    </w:pBdr>
    <w:spacing w:before="60" w:after="60"/>`;
			
			// Create title paragraph
			let xml = `<w:p>
  <w:pPr>${calloutPProps}
  </w:pPr>
  <w:r>
    <w:rPr>
      <w:b/>
      <w:color w:val="${colors.border}"/>
    </w:rPr>
    <w:t>${type.toUpperCase()}:${titleText ? ' ' + titleText : ''}</w:t>
  </w:r>
</w:p>`;
			
			// If there's content, split it into lines and create separate paragraphs for each
			if (contentText) {
				const contentLines = contentText.split('\n');
				for (let i = 0; i < contentLines.length; i++) {
					const line = contentLines[i].trim();
					if (line) {
						xml += `<w:p>
  <w:pPr>${calloutPProps}
  </w:pPr>
  ${this.parseInlineFormatting(line)}
</w:p>`;
					} else {
						// Empty line - add spacing paragraph
						xml += `<w:p>
  <w:pPr>${calloutPProps}
  </w:pPr>
  <w:r><w:t> </w:t></w:r>
</w:p>`;
					}
				}
			}
			
			return xml;
		}
		
		// Regular blockquote
		return `<w:p>
  <w:pPr>
    <w:ind w:left="${indentValue}"/>
    <w:pBdr>
      <w:left w:val="single" w:sz="12" w:space="1" w:color="CCCCCC"/>
    </w:pBdr>
  </w:pPr>
  ${runs}
</w:p>`;
	}

	private taskListToXml(element: DocumentElement): string {
		const tasks = element.tasks || [];
		let xml = '';

		for (const task of tasks) {
			const checkbox = task.checked ? '☑' : '☐';
			const runs = this.parseInlineFormatting(task.text);
			
			// Use Word's proper list numbering system for consistency
			xml += `<w:p>
  <w:pPr>
    <w:ind w:left="720" w:hanging="360"/>
    <w:numPr>
      <w:ilvl w:val="0"/>
      <w:numId w:val="1"/>
    </w:numPr>
    <w:spacing w:before="60" w:after="60"/>
  </w:pPr>
  <w:r>
    <w:t>${checkbox}  </w:t>
  </w:r>
  ${runs}
</w:p>`;
		}

		return xml;
	}

	private horizontalRuleToXml(): string {
		return `<w:p>
  <w:pPr>
    <w:pBdr>
      <w:bottom w:val="single" w:sz="8" w:space="1" w:color="000000"/>
    </w:pBdr>
    <w:spacing w:before="120" w:after="120"/>
  </w:pPr>
  <w:r>
    <w:t></w:t>
  </w:r>
</w:p>`;
	}

	private imageToXml(element: DocumentElement): string {
		if (!element.imageData) {
			// Image not found, show placeholder text
			const alt = element.imageAlt || 'Image not found';
			return `<w:p>
  <w:pPr>
    <w:jc w:val="center"/>
  </w:pPr>
  <w:r>
    <w:t>[Image not found: ${this.escapeXml(alt)}]</w:t>
  </w:r>
</w:p>`;
		}

		// Generate relationship ID for this image
		this.imageCounter++;
		const relationshipId = `rId${this.imageCounter + 10}`; // Start from rId11 to avoid conflicts
		
		// Determine image extension from data or default to png
		let extension = 'png';
		const imageData = element.imageData;
		
		// Try to detect image type from magic bytes
		if (imageData.byteLength >= 4) {
			const view = new Uint8Array(imageData, 0, 4);
			if (view[0] === 0xFF && view[1] === 0xD8) {
				extension = 'jpeg';
			} else if (view[0] === 0x89 && view[1] === 0x50 && view[2] === 0x4E && view[3] === 0x47) {
				extension = 'png';
			} else if (view[0] === 0x47 && view[1] === 0x49 && view[2] === 0x46) {
				extension = 'gif';
			}
		}
		
		// Store relationship info
		this.imageRelationships.push({
			id: relationshipId,
			data: imageData,
			extension: extension
		});
		
		// Get actual image dimensions or use reasonable defaults
		const dimensions = this.getImageDimensions(imageData);
		let originalWidth = dimensions.width;
		let originalHeight = dimensions.height;
		
		// If dimensions couldn't be determined, use more reasonable defaults that maintain aspect ratio
		if (!originalWidth || !originalHeight) {
			// Use a 4:3 aspect ratio as default (more natural than the previous 4:3)
			originalWidth = 400;
			originalHeight = 300;
		}
		
		// Check if custom dimensions were specified by Resizer plugin
		let finalWidth: number;
		let finalHeight: number;
		
		if (element.imageWidth || element.imageHeight) {
			// Custom dimensions specified
			if (element.imageWidth && element.imageHeight) {
				// Both width and height specified
				finalWidth = element.imageWidth;
				finalHeight = element.imageHeight;
			} else if (element.imageWidth) {
				// Only width specified - maintain aspect ratio
				const ratio = originalHeight / originalWidth;
				finalWidth = element.imageWidth;
				finalHeight = Math.round(element.imageWidth * ratio);
			} else {
				// Only height specified - maintain aspect ratio
				const ratio = originalWidth / originalHeight;
				finalHeight = element.imageHeight!;
				finalWidth = Math.round(element.imageHeight! * ratio);
			}
		} else {
			// No custom dimensions - use original with constraints
			finalWidth = originalWidth;
			finalHeight = originalHeight;
			
			// Max width constraint (600px to fit in document)
			if (originalWidth > 600) {
				const ratio = originalHeight / originalWidth;
				finalWidth = 600;
				finalHeight = Math.round(600 * ratio);
			}
			
			// Max height constraint (450px to avoid very tall images)
			if (finalHeight > 450) {
				const ratio = finalWidth / finalHeight;
				finalHeight = 450;
				finalWidth = Math.round(450 * ratio);
			}
			
			// Min size constraints (avoid tiny images)
			if (finalWidth < 100) {
				const ratio = finalHeight / finalWidth;
				finalWidth = 100;
				finalHeight = Math.round(100 * ratio);
			}
		}
		
		// Convert to EMUs (English Metric Units - Word's internal unit)
		const emuWidth = Math.round(finalWidth * 9525); // 1 pixel ≈ 9525 EMUs at 96 DPI
		const emuHeight = Math.round(finalHeight * 9525);
		
		const alt = element.imageAlt || 'Image';
		
		
		return `<w:p>
  <w:pPr>
    <w:jc w:val="center"/>
  </w:pPr>
  <w:r>
    <w:drawing>
      <wp:inline distT="0" distB="0" distL="0" distR="0">
        <wp:extent cx="${emuWidth}" cy="${emuHeight}"/>
        <wp:effectExtent l="0" t="0" r="0" b="0"/>
        <wp:docPr id="${this.imageCounter}" name="${this.escapeXml(alt)}"/>
        <wp:cNvGraphicFramePr>
          <a:graphicFrameLocks noChangeAspect="1"/>
        </wp:cNvGraphicFramePr>
        <a:graphic>
          <a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture">
            <pic:pic>
              <pic:nvPicPr>
                <pic:cNvPr id="${this.imageCounter}" name="${this.escapeXml(alt)}"/>
                <pic:cNvPicPr/>
              </pic:nvPicPr>
              <pic:blipFill>
                <a:blip r:embed="${relationshipId}"/>
                <a:stretch>
                  <a:fillRect/>
                </a:stretch>
              </pic:blipFill>
              <pic:spPr>
                <a:xfrm>
                  <a:off x="0" y="0"/>
                  <a:ext cx="${emuWidth}" cy="${emuHeight}"/>
                </a:xfrm>
                <a:prstGeom prst="rect">
                  <a:avLst/>
                </a:prstGeom>
              </pic:spPr>
            </pic:pic>
          </a:graphicData>
        </a:graphic>
      </wp:inline>
    </w:drawing>
  </w:r>
</w:p>`;
	}

	private convertTemporaryTagsToWordXml(text: string): string {
		// Process nested content recursively
		const conversionOrder = ['BOLDITALIC', 'BOLD', 'ITALIC', 'STRIKE', 'HIGHLIGHT', 'CODE', 'UNDERLINE', 'SUPER', 'SUB', 'LINK'];
		
		let result = text;
		
		for (const tagType of conversionOrder) {
			const regex = new RegExp(`<${tagType}(?: data-url="([^"]+)")?>([^<]*?)</${tagType}>`, 'g');
			
			result = result.replace(regex, (match, url, content) => {
				// Process nested content recursively
				const processedContent = this.convertTemporaryTagsToWordXml(content);
				
				switch (tagType) {
					case 'BOLDITALIC':
						return `<w:r><w:rPr><w:b/><w:i/></w:rPr><w:t xml:space="preserve">${this.escapeXml(content)}</w:t></w:r>`;
					case 'BOLD':
						// If content has formatting, wrap in spans
						if (processedContent.includes('<w:r>')) {
							return processedContent.replace(/<w:r><w:rPr>/g, '<w:r><w:rPr><w:b/>').replace(/<w:r><w:t>/g, '<w:r><w:rPr><w:b/></w:rPr><w:t>');
						}
						return `<w:r><w:rPr><w:b/></w:rPr><w:t xml:space="preserve">${this.escapeXml(content)}</w:t></w:r>`;
					case 'ITALIC':
						if (processedContent.includes('<w:r>')) {
							return processedContent.replace(/<w:r><w:rPr>/g, '<w:r><w:rPr><w:i/>').replace(/<w:r><w:t>/g, '<w:r><w:rPr><w:i/></w:rPr><w:t>');
						}
						return `<w:r><w:rPr><w:i/></w:rPr><w:t xml:space="preserve">${this.escapeXml(content)}</w:t></w:r>`;
					case 'STRIKE':
						return `<w:r><w:rPr><w:strike/></w:rPr><w:t xml:space="preserve">${this.escapeXml(content)}</w:t></w:r>`;
					case 'HIGHLIGHT':
						return `<w:r><w:rPr><w:highlight w:val="yellow"/></w:rPr><w:t xml:space="preserve">${this.escapeXml(content)}</w:t></w:r>`;
					case 'CODE':
						return `<w:r><w:rPr><w:rFonts w:ascii="Courier New" w:hAnsi="Courier New" w:cs="Courier New"/><w:b/></w:rPr><w:t xml:space="preserve">${this.escapeXml(content)}</w:t></w:r>`;
					case 'UNDERLINE':
						return `<w:r><w:rPr><w:u w:val="single"/></w:rPr><w:t xml:space="preserve">${this.escapeXml(content)}</w:t></w:r>`;
					case 'SUPER':
						return `<w:r><w:rPr><w:vertAlign w:val="superscript"/></w:rPr><w:t xml:space="preserve">${this.escapeXml(content)}</w:t></w:r>`;
					case 'SUB':
						return `<w:r><w:rPr><w:vertAlign w:val="subscript"/></w:rPr><w:t xml:space="preserve">${this.escapeXml(content)}</w:t></w:r>`;
					case 'LINK':
						return `<w:hyperlink><w:r><w:rPr><w:color w:val="0000FF"/><w:u w:val="single"/></w:rPr><w:t xml:space="preserve">${this.escapeXml(content)}</w:t></w:r></w:hyperlink>`;
					default:
						return match;
				}
			});
		}

		// Handle remaining text that wasn't formatted
		const parts = result.split(/(<w:r>.*?<\/w:r>|<w:hyperlink>.*?<\/w:hyperlink>)/);
		let finalResult = '';

		for (const part of parts) {
			if (part && !part.startsWith('<w:r>') && !part.startsWith('<w:hyperlink>')) {
				if (part.trim()) {
					const escapedText = this.escapeXml(part);
					finalResult += `<w:r><w:t xml:space="preserve">${escapedText}</w:t></w:r>`;
				}
			} else {
				finalResult += part;
			}
		}

		return finalResult;
	}

	private parseInlineFormatting(text: string): string {
		if (!this.settings.preserveFormatting) {
			const escapedText = this.escapeXml(text);
			return `<w:r><w:t>${escapedText}</w:t></w:r>`;
		}

		// Use a much simpler approach for better nested formatting support
		let result = text;

		// First handle emojis
		result = this.convertEmojis(result);

		// Clean up block-level HTML tags
		result = result.replace(/<\/?div[^>]*>/g, '');
		result = result.replace(/<\/?p[^>]*>/g, '');
		result = result.replace(/<br\s*\/?>/g, ' ');

		// Process formatting with proper nested support
		// 1. Code first (highest priority, no further processing)
		result = result.replace(/`([^`\n]+?)`/g, '|||CODE|||$1|||/CODE|||');
		
		// 2. Handle complex nested patterns (***text*** - bold+italic)
		result = result.replace(/\*\*\*([^*\n]+?)\*\*\*/g, '|||BOLDITALIC|||$1|||/BOLDITALIC|||');
		result = result.replace(/___([^_\n]+?)___/g, '|||BOLDITALIC|||$1|||/BOLDITALIC|||');
		
		// 3. Handle nested patterns with detailed processing
		// Bold with italic inside: **text *italic* text**
		result = result.replace(/\*\*([^*]*?\*[^*]+?\*[^*]*?)\*\*/g, (match, content) => {
			// Process italic inside bold
			const processed = content.replace(/\*([^*]+?)\*/g, '<ITALIC>$1</ITALIC>');
			return `|||BOLD|||${processed}|||/BOLD|||`;
		});
		
		// Italic with bold inside: *text **bold** text*
		result = result.replace(/\*([^*]*?\*\*[^*]+?\*\*[^*]*?)\*/g, (match, content) => {
			// Process bold inside italic
			const processed = content.replace(/\*\*([^*]+?)\*\*/g, '<BOLD>$1</BOLD>');
			return `|||ITALIC|||${processed}|||/ITALIC|||`;
		});
		
		// 4. Regular bold and italic (for non-nested cases)
		result = result.replace(/\*\*([^*\n]+?)\*\*/g, '|||BOLD|||$1|||/BOLD|||');
		result = result.replace(/\*([^*\n]+?)\*/g, '|||ITALIC|||$1|||/ITALIC|||');
		
		// 5. Underscore variants
		result = result.replace(/__([^_\n]+?)__/g, '|||BOLD|||$1|||/BOLD|||');
		result = result.replace(/_([^_\n]+?)_/g, '|||ITALIC|||$1|||/ITALIC|||');
		
		// 6. Other formatting
		result = result.replace(/~~([^~\n]+?)~~/g, '|||STRIKE|||$1|||/STRIKE|||');
		result = result.replace(/==([^=\n]+?)==/g, '|||HIGHLIGHT|||$1|||/HIGHLIGHT|||');
		result = result.replace(/\^([^\^\s\n]+?)\^/g, '|||SUPER|||$1|||/SUPER|||');
		result = result.replace(/~([^~\s\n]+?)~/g, '|||SUB|||$1|||/SUB|||');
		
		// 7. HTML formatting tags
		result = result.replace(/<b>([^<]+?)<\/b>/g, '|||BOLD|||$1|||/BOLD|||');
		result = result.replace(/<strong>([^<]+?)<\/strong>/g, '|||BOLD|||$1|||/BOLD|||');
		result = result.replace(/<i>([^<]+?)<\/i>/g, '|||ITALIC|||$1|||/ITALIC|||');
		result = result.replace(/<em>([^<]+?)<\/em>/g, '|||ITALIC|||$1|||/ITALIC|||');
		result = result.replace(/<u>([^<]+?)<\/u>/g, '|||UNDERLINE|||$1|||/UNDERLINE|||');
		result = result.replace(/<mark>([^<]+?)<\/mark>/g, '|||HIGHLIGHT|||$1|||/HIGHLIGHT|||');
		result = result.replace(/<sup>([^<]+?)<\/sup>/g, '|||SUPER|||$1|||/SUPER|||');
		result = result.replace(/<sub>([^<]+?)<\/sub>/g, '|||SUB|||$1|||/SUB|||');
		result = result.replace(/<code>([^<]+?)<\/code>/g, '|||CODE|||$1|||/CODE|||');
		
		// 8. Footnote references
		result = result.replace(/\[\^([^\]]+)\]/g, (match, footnoteLabel) => {
			// Add to used footnotes if not already present
			if (!this.usedFootnotes.includes(footnoteLabel)) {
				this.usedFootnotes.push(footnoteLabel);
			}
			const footnoteIndex = this.usedFootnotes.indexOf(footnoteLabel) + 1;
			return `|||SUPER|||${footnoteIndex}|||/SUPER|||`;
		});
		
		// 9. Links
		result = result.replace(/\[([^\]]+)\]\(([^\s)]+)(?:\s+"[^"]*")?\)/g, '|||LINK|||$1|||DATA:$2|||/LINK|||');
		
		// Convert to Word XML
		return this.convertMarkersToWordXml(result);
	}

	private convertMarkersToWordXml(text: string): string {
		let result = text;
		
		// Convert temporary markers to Word XML in correct order
		// Handle nested formatting by processing inner markers first
		
		// Process CODE first (no nesting allowed)
		result = result.replace(/\|\|\|CODE\|\|\|([^|]*?)\|\|\|\/CODE\|\|\|/g, 
			'<w:r><w:rPr><w:rFonts w:ascii="Courier New" w:hAnsi="Courier New" w:cs="Courier New"/><w:b/></w:rPr><w:t xml:space="preserve">$1</w:t></w:r>');
		
		// Process BOLDITALIC first (combination of both)
		result = result.replace(/\|\|\|BOLDITALIC\|\|\|([^|]*?)\|\|\|\/BOLDITALIC\|\|\|/g, 
			'<w:r><w:rPr><w:b/><w:i/></w:rPr><w:t xml:space="preserve">$1</w:t></w:r>');
		
		// Process other formatting
		result = result.replace(/\|\|\|SUPER\|\|\|([^|]*?)\|\|\|\/SUPER\|\|\|/g, 
			'<w:r><w:rPr><w:vertAlign w:val="superscript"/></w:rPr><w:t xml:space="preserve">$1</w:t></w:r>');
		result = result.replace(/\|\|\|SUB\|\|\|([^|]*?)\|\|\|\/SUB\|\|\|/g, 
			'<w:r><w:rPr><w:vertAlign w:val="subscript"/></w:rPr><w:t xml:space="preserve">$1</w:t></w:r>');
		result = result.replace(/\|\|\|STRIKE\|\|\|([^|]*?)\|\|\|\/STRIKE\|\|\|/g, 
			'<w:r><w:rPr><w:strike/></w:rPr><w:t xml:space="preserve">$1</w:t></w:r>');
		result = result.replace(/\|\|\|HIGHLIGHT\|\|\|([^|]*?)\|\|\|\/HIGHLIGHT\|\|\|/g, 
			'<w:r><w:rPr><w:highlight w:val="yellow"/></w:rPr><w:t xml:space="preserve">$1</w:t></w:r>');
		result = result.replace(/\|\|\|UNDERLINE\|\|\|([^|]*?)\|\|\|\/UNDERLINE\|\|\|/g, 
			'<w:r><w:rPr><w:u w:val="single"/></w:rPr><w:t xml:space="preserve">$1</w:t></w:r>');
		
		// Process nested ITALIC and BOLD with proper support
		result = result.replace(/\|\|\|ITALIC\|\|\|(.*?)\|\|\|\/ITALIC\|\|\|/g, (match, content) => {
			// Check if content has nested tags
			if (content.includes('<BOLD>')) {
				// Convert nested bold tags to proper Word XML with both italic and bold
				return content.replace(/<BOLD>([^<]+?)<\/BOLD>/g, 
					'<w:r><w:rPr><w:b/><w:i/></w:rPr><w:t xml:space="preserve">$1</w:t></w:r>');
			} else {
				// Simple italic
				const escapedContent = this.escapeXml(content);
				return `<w:r><w:rPr><w:i/></w:rPr><w:t xml:space="preserve">${escapedContent}</w:t></w:r>`;
			}
		});
		
		result = result.replace(/\|\|\|BOLD\|\|\|(.*?)\|\|\|\/BOLD\|\|\|/g, (match, content) => {
			// Check if content has nested tags
			if (content.includes('<ITALIC>')) {
				// Convert nested italic tags to proper Word XML with both bold and italic
				return content.replace(/<ITALIC>([^<]+?)<\/ITALIC>/g, 
					'<w:r><w:rPr><w:b/><w:i/></w:rPr><w:t xml:space="preserve">$1</w:t></w:r>');
			} else {
				// Simple bold
				const escapedContent = this.escapeXml(content);
				return `<w:r><w:rPr><w:b/></w:rPr><w:t xml:space="preserve">${escapedContent}</w:t></w:r>`;
			}
		});
		
		// Process links
		result = result.replace(/\|\|\|LINK\|\|\|([^|]*?)\|\|\|DATA:([^|]*?)\|\|\|\/LINK\|\|\|/g, 
			'<w:hyperlink><w:r><w:rPr><w:color w:val="0000FF"/><w:u w:val="single"/></w:rPr><w:t xml:space="preserve">$1</w:t></w:r></w:hyperlink>');
		
		// Handle any remaining plain text
		const parts = result.split(/(<w:r>.*?<\/w:r>|<w:hyperlink>.*?<\/w:hyperlink>)/);
		let finalResult = '';

		for (const part of parts) {
			if (part && !part.startsWith('<w:r>') && !part.startsWith('<w:hyperlink>')) {
				if (part.trim()) {
					const escapedText = this.escapeXml(part);
					finalResult += `<w:r><w:t xml:space="preserve">${escapedText}</w:t></w:r>`;
				}
			} else {
				finalResult += part;
			}
		}

		return finalResult || `<w:r><w:t xml:space="preserve">${this.escapeXml(text)}</w:t></w:r>`;
	}

	private async parseMarkdownToElements(markdown: string): Promise<DocumentElement[]> {
		const elements: DocumentElement[] = [];
		const lines = markdown.split('\n');
		
		let i = 0;
		let inCodeBlock = false;
		let codeBlockContent: string[] = [];
		let codeBlockLanguage: string | null = null;
		let inTable = false;
		let tableRows: string[][] = [];
		let tableAlignments: string[] = [];

		while (i < lines.length) {
			const line = lines[i];

			// Handle code blocks
			const fenceMatch = line.trim().match(/^(```|~~~)(.*)$/);
			if (fenceMatch) {
				if (inCodeBlock) {
					// End of code block
					elements.push({
						type: 'codeblock',
						content: codeBlockContent.join('\n'),
						language: codeBlockLanguage || undefined
					});
					codeBlockContent = [];
					codeBlockLanguage = null;
					inCodeBlock = false;
				} else {
					// Start of code block
					inCodeBlock = true;
					codeBlockLanguage = fenceMatch[2]?.trim() || null;
				}
				i++;
				continue;
			}

			if (inCodeBlock) {
				codeBlockContent.push(line);
				i++;
				continue;
			}

			const trimmedLine = line.trim();

			// Handle horizontal rules - be more permissive with the patterns
			const cleanLine = trimmedLine.replace(/\s/g, '');
			if ((cleanLine.match(/^-{3,}$/) || cleanLine.match(/^\*{3,}$/) || cleanLine.match(/^_{3,}$/)) && 
			    trimmedLine.length >= 3) {
				elements.push({ type: 'horizontal-rule' });
				i++;
				continue;
			}

			// Handle headings
			if (trimmedLine.startsWith('#')) {
				const level = trimmedLine.match(/^#+/)?.[0].length || 1;
				const content = trimmedLine.replace(/^#+\s*/, '').trim();
				if (content) {
					elements.push({
						type: 'heading',
						content: content,
						level: Math.min(level, 6) // Cap at H6
					});
				}
				i++;
				continue;
			}

			// Handle task list items (checkboxes) - MUST come before regular list items
			if (trimmedLine.match(/^[-*+]\s+\[[ x]\]\s+/)) {
				const checked = trimmedLine.includes('[x]');
				const content = trimmedLine.replace(/^[-*+]\s+\[[ x]\]\s+/, '').trim();
				
				// Check if previous element is also a task list
				const lastElement = elements[elements.length - 1];
				if (lastElement && lastElement.type === 'tasklist' && lastElement.tasks) {
					// Add to existing task list
					lastElement.tasks.push({ checked, text: content });
				} else {
					// Create new task list
					elements.push({
						type: 'tasklist',
						tasks: [{ checked, text: content }]
					});
				}
				i++;
				continue;
			}

			// Handle unordered list items
			if (trimmedLine.match(/^[-*+]\s+/)) {
				const content = trimmedLine.replace(/^[-*+]\s+/, '').trim();
				
				// Check if previous element is also an unordered list
				const lastElement = elements[elements.length - 1];
				if (lastElement && lastElement.type === 'list' && lastElement.listType === 'unordered' && lastElement.items) {
					// Add to existing list
					lastElement.items.push(content);
				} else {
					// Create new list
					elements.push({
						type: 'list',
						listType: 'unordered',
						items: [content]
					});
				}
				i++;
				continue;
			}

			// Handle ordered list items
			if (trimmedLine.match(/^\d+\.\s+/)) {
				const content = trimmedLine.replace(/^\d+\.\s+/, '').trim();
				
				// Check if previous element is also an ordered list
				const lastElement = elements[elements.length - 1];
				if (lastElement && lastElement.type === 'list' && lastElement.listType === 'ordered' && lastElement.items) {
					// Add to existing list
					lastElement.items.push(content);
				} else {
					// Create new list
					elements.push({
						type: 'list',
						listType: 'ordered',
						items: [content]
					});
				}
				i++;
				continue;
			}

			// Handle blockquotes
			if (trimmedLine.startsWith('>')) {
				const content = trimmedLine.replace(/^>\s*/, '').trim();
				
				// Check if previous element is also a blockquote
				const lastElement = elements[elements.length - 1];
				if (lastElement && lastElement.type === 'blockquote' && lastElement.content) {
					// Add to existing blockquote (multi-line blockquote)
					lastElement.content += '\n' + content;
				} else {
					// Create new blockquote
					elements.push({
						type: 'blockquote',
						content: content
					});
				}
				i++;
				continue;
			}

			// Handle tables
			if (line.trim().startsWith('|') && line.trim().endsWith('|')) {
				if (!inTable) {
					inTable = true;
					tableRows = [];
					tableAlignments = [];
				}

				const cells = line.split('|').slice(1, -1).map(cell => cell.trim());
				
				// Check if this is the alignment row
				if (cells.every(cell => /^:?-+:?$/.test(cell))) {
					tableAlignments = cells.map(cell => {
						if (cell.startsWith(':') && cell.endsWith(':')) return 'center';
						if (cell.endsWith(':')) return 'right';
						return 'left';
					});
				} else {
					tableRows.push(cells);
				}

				i++;
				continue;
			} else if (inTable) {
				// End of table
				elements.push({
					type: 'table',
					rows: tableRows,
					alignments: tableAlignments
				});
				inTable = false;
				tableRows = [];
				tableAlignments = [];
			}

			// Handle standard markdown images ![alt](url) or ![alt](url "title")
			// Also handle Obsidian Resizer plugin syntax: ![alt](url|size) or ![alt](url|widthxheight)
			const standardImageMatch = trimmedLine.match(/^!\[([^\]]*)\]\(([^\s\|]+)(?:\s*\|(\d+)(?:x(\d+))?)?\s*(?:"[^"]*")?\)$/);
			if (standardImageMatch) {
				const alt = standardImageMatch[1];
				const url = standardImageMatch[2];
				const customWidth = standardImageMatch[3] ? parseInt(standardImageMatch[3]) : undefined;
				const customHeight = standardImageMatch[4] ? parseInt(standardImageMatch[4]) : undefined;
				
				// Try to load image data (but don't let it break the parsing)
				let imageData = null;
				if (url.startsWith('http://') || url.startsWith('https://')) {
					// External image - try to fetch it
					try {
						const response = await fetch(url);
						if (response.ok) {
							imageData = await response.arrayBuffer();
						} else {
							console.warn(`Failed to fetch external image: ${response.status}`);
						}
					} catch (error) {
						console.error(`Error fetching external image:`, error);
						imageData = null;
					}
				} else if (this.resourceLoader) {
					// Local image - use resourceLoader
					try {
						imageData = await this.resourceLoader(url);
					} catch (error) {
						console.error(`Error loading local image ${url}:`, error);
						imageData = null;
					}
				} else {
					console.warn('No resourceLoader available for local image');
				}
				
				elements.push({
					type: 'image',
					imageAlt: alt,
					imageData: imageData || undefined,
					imageWidth: customWidth,
					imageHeight: customHeight
				});
				i++;
				continue;
			}

			// Handle Obsidian-style embedded images ![[image.png]]
			// Also handle with Resizer plugin: ![[image.png|size]] or ![[image.png|widthxheight]]
			// Note: PDFs are skipped as they cannot be embedded in Word documents
			
			const wikiImageMatch = trimmedLine.match(/^!\[\[([^\]]+?)\]\](?:\s*<!--\s*pdf-scale:([\d.]+)\s*-->)?/);
			
			if (wikiImageMatch) {
				const fullPath = wikiImageMatch[1]; // e.g., "image.png|447" or "image.png"
				
				// Split the path and size if present
				const parts = fullPath.split('|');
				const fileName = parts[0];
				let customWidth: number | undefined;
				let customHeight: number | undefined;
				
				if (parts[1]) {
					// Size specification exists, parse it
					const sizeMatch = parts[1].match(/^(\d+)(?:x(\d+))?$/);
					if (sizeMatch) {
						customWidth = parseInt(sizeMatch[1]);
						customHeight = sizeMatch[2] ? parseInt(sizeMatch[2]) : undefined;
					}
				}
				
				// Check if this is a PDF file - skip PDFs as they cannot be embedded in Word
				const isPDF = fileName.toLowerCase().endsWith('.pdf');
				
				if (isPDF) {
					// Skip PDF files entirely
					i++;
					continue;
				}
				
				// Try to load file data (but don't let it break the parsing)
				let fileData = null;
				if (this.resourceLoader) {
					try {
						fileData = await this.resourceLoader(fileName);
					} catch (error) {
						console.error(`Error loading file ${fileName}:`, error);
						fileData = null;
					}
				}
				
				// Regular image
				elements.push({
					type: 'image',
					imageAlt: fileName,
					imageData: fileData || undefined,
					imageWidth: customWidth,
					imageHeight: customHeight
				});
				i++;
				continue;
			}

			// Handle empty lines
			if (trimmedLine === '') {
				elements.push({ type: 'break' });
				i++;
				continue;
			}

			// Handle headings
			const headingMatch = line.match(/^(#{1,6})\s+(.+)$/);
			if (headingMatch) {
				const level = headingMatch[1].length;
				const text = headingMatch[2];
				elements.push({
					type: 'heading',
					level: level,
					content: text
				});
				i++;
				continue;
			}

			// Handle blockquotes
			const blockquoteMatch = line.match(/^(\s*>+\s*)(.*)$/);
			if (blockquoteMatch) {
				const marker = blockquoteMatch[1];
				const quoteLevel = marker.replace(/[^>]/g, '').length;
				const quoteText = blockquoteMatch[2];

				elements.push({
					type: 'blockquote',
					content: quoteText,
					quoteLevel: quoteLevel
				});
				i++;
				continue;
			}

			// Handle task lists
			const taskListMatch = line.match(/^(\s*)[-*+]\s+\[( |x|X)\]\s+(.*)$/);
			if (taskListMatch) {
				const checked = taskListMatch[2].toLowerCase() === 'x';
				const taskText = taskListMatch[3];
				
				// Find consecutive task items
				const tasks = [{ checked, text: taskText }];
				let j = i + 1;
				
				while (j < lines.length) {
					const nextLine = lines[j];
					const nextTask = nextLine.match(/^(\s*)[-*+]\s+\[( |x|X)\]\s+(.*)$/);
					if (nextTask) {
						const nextChecked = nextTask[2].toLowerCase() === 'x';
						const nextText = nextTask[3];
						tasks.push({ checked: nextChecked, text: nextText });
						j++;
					} else {
						break;
					}
				}

				elements.push({
					type: 'tasklist',
					tasks: tasks
				});

				i = j;
				continue;
			}

			// Handle lists with proper nesting
			const unorderedListMatch = line.match(/^(\s*)([-*+])\s+(.+)$/);
			const orderedListMatch = line.match(/^(\s*)(\d+)\.\s+(.+)$/);
			
			if (unorderedListMatch || orderedListMatch) {
				const isOrdered = !!orderedListMatch;
				const text = isOrdered ? orderedListMatch![3] : unorderedListMatch![3];
				const indent = isOrdered ? orderedListMatch![1].length : unorderedListMatch![1].length;
				const level = Math.min(Math.floor(indent / 2), 1); // Limit to 2 levels (0 and 1)
				
				// Find consecutive list items
				const listItems: Array<{text: string, level: number}> = [{ text, level }];
				let j = i + 1;
				
				while (j < lines.length) {
					const nextLine = lines[j];
					const nextUnordered = nextLine.match(/^(\s*)([-*+])\s+(.+)$/);
					const nextOrdered = nextLine.match(/^(\s*)(\d+)\.\s+(.+)$/);
					
					if ((isOrdered && nextOrdered) || (!isOrdered && nextUnordered)) {
						const nextText = isOrdered ? nextOrdered![3] : nextUnordered![3];
						const nextIndent = isOrdered ? nextOrdered![1].length : nextUnordered![1].length;
						const nextLevel = Math.min(Math.floor(nextIndent / 2), 1);
						listItems.push({ text: nextText, level: nextLevel });
						j++;
					} else {
						break;
					}
				}

				// Create list element with items and their levels
				elements.push({
					type: 'list',
					listType: isOrdered ? 'ordered' : 'unordered',
					items: listItems.map(item => item.text),
					children: listItems.map(item => ({
						type: 'paragraph' as const,
						content: item.text,
						level: item.level
					}))
				});

				i = j;
				continue;
			}

			// Handle HTML collapsible sections (details/summary)
			if (trimmedLine.match(/^<details/i)) {
				// Find the end of the details block
				let detailsContent = '';
				let summaryText = 'Details';
				let j = i;
				let depth = 0;
				
				while (j < lines.length) {
					const currentLine = lines[j];
					if (currentLine.includes('<details')) depth++;
					if (currentLine.includes('</details>')) depth--;
					
					// Extract summary
					const summaryMatch = currentLine.match(/<summary[^>]*>(.*?)<\/summary>/i);
					if (summaryMatch) {
						summaryText = summaryMatch[1].trim();
					}
					
					detailsContent += currentLine + '\n';
					j++;
					
					if (depth === 0) break;
				}
				
				// Clean up the content and add as expandable section
				const cleanContent = detailsContent
					.replace(/<\/?details[^>]*>/gi, '')
					.replace(/<\/?summary[^>]*>/gi, '')
					.trim();
				
				// Add summary with indicator
				elements.push({
					type: 'paragraph',
					content: `▼ ${summaryText}`
				});
				
				// Add content if any
				if (cleanContent) {
					// Parse the inner content recursively
					const innerElements = await this.parseMarkdownToElements(cleanContent);
					elements.push(...innerElements);
				}
				
				i = j;
				continue;
			}

			// Handle definition lists (term followed by : definition)
			if (trimmedLine !== '' && !trimmedLine.startsWith('#') && lines[i + 1] && /^:\s+/.test(lines[i + 1])) {
				const definitionMatch = lines[i + 1].match(/^:\s+(.+)$/);
				if (definitionMatch) {
					const termRuns = this.parseInlineFormatting(trimmedLine);
					const defRuns = this.parseInlineFormatting(definitionMatch[1]);
					
					elements.push({
						type: 'paragraph',
						content: `${trimmedLine}: ${definitionMatch[1]}`
					});
					i += 2;
					continue;
				}
			}

			// Handle regular paragraphs
			elements.push({
				type: 'paragraph',
				content: line
			});

			i++;
		}

		// Handle any remaining table
		if (inTable) {
			elements.push({
				type: 'table',
				rows: tableRows,
				alignments: tableAlignments
			});
		}

		return elements;
	}

	private getFontFamily(): string {
		if (this.settings.useObsidianAppearance && this.obsidianFonts) {
			return this.obsidianFonts.textFont || this.settings.defaultFontFamily;
		}
		return this.settings.defaultFontFamily;
	}

	private getFontSize(): number {
		if (this.settings.useObsidianAppearance && this.obsidianFonts) {
			return this.obsidianFonts.baseFontSize || this.settings.defaultFontSize;
		}
		return this.settings.defaultFontSize;
	}

	private getCodeFont(): string {
		if (this.settings.useObsidianAppearance && this.obsidianFonts) {
			let font = this.obsidianFonts.monospaceFont;
			if (!font || font === 'undefined' || font === '??' || font.includes('??')) {
				font = 'Courier New';
			}
			return font;
		}
		return 'Courier New';
	}

	private getHeadingSize(level: number): number {
		const baseFontSize = this.getFontSize();
		const multipliers = [2.0, 1.6, 1.4, 1.2, 1.1, 1.0];
		
		if (this.settings.useObsidianAppearance && this.obsidianFonts) {
			const obsidianSize = this.obsidianFonts.headingSizes[level - 1];
			if (obsidianSize) {
				return obsidianSize;
			}
		}
		
		return Math.round(baseFontSize * multipliers[level - 1]);
	}

	private getPageSize(): { width: number; height: number } {
		// All dimensions in twentieths of a point (twips)
		const sizes = {
			'A4': { width: 11906, height: 16838 },
			'A5': { width: 8391, height: 11906 },
			'A3': { width: 16838, height: 23811 },
			'Letter': { width: 12240, height: 15840 },
			'Legal': { width: 12240, height: 20160 },
			'Tabloid': { width: 15840, height: 24480 }
		};
		
		return sizes[this.settings.pageSize] || sizes['A4'];
	}

	private escapeXml(text: string): string {
		return text
			.replace(/&/g, '&amp;')
			.replace(/</g, '&lt;')
			.replace(/>/g, '&gt;')
			.replace(/"/g, '&quot;')
			.replace(/'/g, '&apos;');
	}

	private escapeXmlForCode(text: string): string {
		// First decode HTML entities, then escape for XML
		const decoded = this.decodeHtmlEntities(text);
		return decoded
			.replace(/&/g, '&amp;')
			.replace(/</g, '&lt;')
			.replace(/>/g, '&gt;');
	}

	private decodeHtmlEntities(text: string): string {
		// Decode common HTML entities that appear in highlighted code
		return text
			.replace(/&#x27;/g, "'")  // Single quote
			.replace(/&#x22;/g, '"')  // Double quote
			.replace(/&quot;/g, '"')  // Double quote
			.replace(/&apos;/g, "'")  // Single quote
			.replace(/&lt;/g, '<')    // Less than
			.replace(/&gt;/g, '>')    // Greater than
			.replace(/&amp;/g, '&');  // Ampersand (do this last)
	}

	private extractFootnotes(markdown: string): { content: string; definitions: Map<string, string> } {
		const lines = markdown.split('\n');
		const filteredLines: string[] = [];
		const definitions = new Map<string, string>();

		for (let i = 0; i < lines.length; i++) {
			const line = lines[i];
			const match = line.match(/^\[\^([^\]]+)\]:\s*(.*)$/);
			if (match) {
				const label = match[1].trim();
				const definitionParts: string[] = [];
				if (match[2]) {
					definitionParts.push(match[2].trim());
				}

				let j = i + 1;
				while (j < lines.length && /^\s{2,}.+/.test(lines[j])) {
					definitionParts.push(lines[j].trim());
					j++;
				}

				definitions.set(label, definitionParts.join(' ').trim());
				i = j - 1;
			} else {
				filteredLines.push(line);
			}
		}

		return { content: filteredLines.join('\n'), definitions };
	}

	private getImageDimensions(imageData: ArrayBuffer): { width: number; height: number } {
		try {
			const view = new Uint8Array(imageData);
			
			// PNG format
			if (view[0] === 0x89 && view[1] === 0x50 && view[2] === 0x4E && view[3] === 0x47) {
				// PNG header starts at byte 16 with width (4 bytes) and height (4 bytes)
				if (imageData.byteLength >= 24) {
					const width = (view[16] << 24) | (view[17] << 16) | (view[18] << 8) | view[19];
					const height = (view[20] << 24) | (view[21] << 16) | (view[22] << 8) | view[23];
					// Validate dimensions (reasonable bounds)
					if (width > 0 && height > 0 && width < 10000 && height < 10000) {
						return { width, height };
					}
				}
			}
			
			// JPEG format  
			if (view[0] === 0xFF && view[1] === 0xD8) {
				let offset = 2;
				while (offset < view.length - 8) {
					if (view[offset] === 0xFF) {
						const marker = view[offset + 1];
						// SOF markers (Start of Frame)
						if ((marker >= 0xC0 && marker <= 0xC3) || (marker >= 0xC5 && marker <= 0xC7) || 
							(marker >= 0xC9 && marker <= 0xCB) || (marker >= 0xCD && marker <= 0xCF)) {
							const height = (view[offset + 5] << 8) | view[offset + 6];
							const width = (view[offset + 7] << 8) | view[offset + 8];
							// Validate dimensions
							if (width > 0 && height > 0 && width < 10000 && height < 10000) {
								return { width, height };
							}
						}
						// Skip this segment
						const segmentLength = (view[offset + 2] << 8) | view[offset + 3];
						offset += segmentLength + 2;
					} else {
						offset++;
					}
				}
			}
			
			// GIF format
			if (view[0] === 0x47 && view[1] === 0x49 && view[2] === 0x46) {
				if (imageData.byteLength >= 10) {
					const width = view[6] | (view[7] << 8);
					const height = view[8] | (view[9] << 8);
					// Validate dimensions
					if (width > 0 && height > 0 && width < 10000 && height < 10000) {
						return { width, height };
					}
				}
			}
			
			// SVG format - check if it's text-based SVG
			try {
				const text = new TextDecoder('utf-8').decode(imageData);
				if (text.includes('<svg') && text.includes('</svg>')) {
					// Extract width and height from SVG element
					const svgMatch = text.match(/<svg[^>]*width=['"]?(\d+)['"]?[^>]*height=['"]?(\d+)['"]?[^>]*>/i) ||
									text.match(/<svg[^>]*height=['"]?(\d+)['"]?[^>]*width=['"]?(\d+)['"]?[^>]*>/i);
					
					if (svgMatch) {
						const width = parseInt(svgMatch[1]);
						const height = parseInt(svgMatch[2]);
						if (width > 0 && height > 0 && width < 10000 && height < 10000) {
							return { width, height };
						}
					}
					
					// If no explicit dimensions, try viewBox
					const viewBoxMatch = text.match(/viewBox=['"]?[^'"]*?\s+(\d+)\s+(\d+)['"]?/i);
					if (viewBoxMatch) {
						const width = parseInt(viewBoxMatch[1]);
						const height = parseInt(viewBoxMatch[2]);
						if (width > 0 && height > 0 && width < 10000 && height < 10000) {
							return { width, height };
						}
					}
					
					// Default SVG size if no dimensions found
					return { width: 300, height: 200 }; // More reasonable default for SVG
				}
			} catch (e) {
				// Not a text-based SVG, continue to fallback
			}
		} catch (error) {
			console.warn('Error reading image dimensions:', error);
		}
		
		// Return empty dimensions to signal that detection failed  
		return { width: 0, height: 0 };
	}

	private convertEmojis(text: string): string {
		// Simple emoji conversion for common patterns
		const emojiMap: Record<string, string> = {
			':smile:': '😊',
			':grin:': '😁',
			':wink:': '😉',
			':heart:': '❤️',
			':thumbsup:': '👍',
			':thumbsdown:': '👎',
			':fire:': '🔥',
			':star:': '⭐',
			':rocket:': '🚀',
			':check:': '✅',
			':x:': '❌',
			':warning:': '⚠️',
			':info:': 'ℹ️',
			':bulb:': '💡',
			':book:': '📖',
			':computer:': '💻',
			':phone:': '📱',
			':email:': '📧',
			':calendar:': '📅',
			':clock:': '🕐',
			':money:': '💰',
			':key:': '🔑',
			':lock:': '🔒',
			':unlock:': '🔓'
		};

		let result = text;
		for (const [shortcode, emoji] of Object.entries(emojiMap)) {
			result = result.replace(new RegExp(this.escapeRegex(shortcode), 'g'), emoji);
		}
		
		return result;
	}

	private escapeRegex(string: string): string {
		return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
	}
}
