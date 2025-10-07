import { App, Notice, Plugin, PluginSettingTab, Setting, TFile, Platform } from 'obsidian';
import { MarkdownToDocxConverter } from './converter-mobile';

interface ToWordSettings {
	defaultFontFamily: string;
	defaultFontSize: number;
	includeMetadata: boolean;
	preserveFormatting: boolean;
	outputLocation: 'same-folder' | 'vault-root' | 'custom-folder';
	customOutputFolder: string;
	useObsidianAppearance: boolean;
	includeFilenameAsHeader: boolean;
	pageSize: 'A4' | 'A5' | 'A3' | 'Letter' | 'Legal' | 'Tabloid';
	chunkingThreshold: number;
	enablePreprocessing: boolean;
}

const DEFAULT_SETTINGS: ToWordSettings = {
	defaultFontFamily: 'Calibri',
	defaultFontSize: 11,
	includeMetadata: false,
	preserveFormatting: true,
	outputLocation: 'same-folder',
	customOutputFolder: 'Exports',
	useObsidianAppearance: false,
	includeFilenameAsHeader: false,
	pageSize: 'A4',
	chunkingThreshold: 100000,
	enablePreprocessing: false
}

export default class ToWordPlugin extends Plugin {
	settings: ToWordSettings;
	converter: MarkdownToDocxConverter;

	async onload() {
		await this.loadSettings();

		this.converter = new MarkdownToDocxConverter(this.settings);

		// Add ribbon icon
		this.addRibbonIcon('file-output', 'Export to Word', async (evt: MouseEvent) => {
			const activeFile = this.app.workspace.getActiveFile();
			if (activeFile) {
				await this.exportToWord(activeFile);
			} else {
				new Notice('No active file to export');
			}
		});

		// Add command to export current file
		this.addCommand({
			id: 'export-to-word',
			name: 'Export current file to Word',
			checkCallback: (checking: boolean) => {
				const activeFile = this.app.workspace.getActiveFile();
				if (activeFile) {
					if (!checking) {
						this.exportToWord(activeFile);
					}
					return true;
				}
				return false;
			}
		});

		// Add context menu item
		this.registerEvent(
			this.app.workspace.on('file-menu', (menu, file) => {
				if (file instanceof TFile && file.extension === 'md') {
					menu.addItem((item) => {
						item
							.setTitle('Export to Word')
							.setIcon('file-output')
							.onClick(async () => {
								await this.exportToWord(file);
							});
					});
				}
			})
		);

		// Add settings tab
		this.addSettingTab(new ToWordSettingTab(this.app, this));
	}

	async exportToWord(file: TFile) {
		try {
			new Notice('Exporting to Word...');
			
			// Read the markdown content
			const content = await this.app.vault.read(file);
			
			// Get Obsidian's actual font settings if using Obsidian appearance
			let obsidianFonts = null;
			if (this.settings.useObsidianAppearance) {
				obsidianFonts = this.getObsidianFontSettings();
			}
			
			// Prepare loader to resolve embedded resources like images
			const resourceLoader = async (link: string): Promise<ArrayBuffer | null> => {
				const targetFile = this.app.metadataCache.getFirstLinkpathDest(link, file.path);
				if (!targetFile) {
					return null;
				}
				try {
					return await this.app.vault.readBinary(targetFile);
				} catch (err) {
					console.error(`Failed to load embedded resource: ${link}`, err);
					return null;
				}
			};

			// Convert to DOCX
			const documentSize = content.length;
			const threshold = this.settings.chunkingThreshold || 100000;
			if (documentSize > threshold) {
				new Notice(`Large document detected (${Math.round(documentSize/1000)}KB). Processing in chunks for better performance...`);
			}
			
			const blob = await this.converter.convert(content, file.basename, obsidianFonts, resourceLoader);
			
			// Save the file
			const outputPath = await this.saveDocxFile(blob, file);
			
			new Notice(`Saved to: ${outputPath}`, 5000);
		} catch (error) {
			console.error('Error exporting to Word:', error);
			new Notice(`Error exporting to Word: ${error.message}`);
		}
	}

	getObsidianFontSettings() {
		// Get the computed styles from Obsidian's editor or body element
		let editorEl = document.querySelector('.markdown-preview-view, .markdown-source-view');
		if (!editorEl || !(editorEl instanceof HTMLElement)) {
			editorEl = document.body;
		}

		const computedStyle = window.getComputedStyle(editorEl);
		
		// Extract font family - try multiple CSS variable names
		let textFont = computedStyle.getPropertyValue('--font-text').trim() || 
		               computedStyle.getPropertyValue('--default-font').trim() ||
		               computedStyle.getPropertyValue('--font-interface').trim();
		
		// If still empty, try getting from computed font-family
		if (!textFont || textFont === '') {
			textFont = computedStyle.getPropertyValue('font-family');
		}
		
		// Clean the font (remove quotes, get first font)
		if (textFont) {
			textFont = textFont.replace(/['"]/g, '').split(',')[0].trim();
		}
		
		// Final fallback
		if (!textFont || textFont === '') {
			textFont = this.settings.defaultFontFamily;
		}
		
		// Extract monospace font - try multiple CSS variable names
		let monospaceFont = computedStyle.getPropertyValue('--font-monospace').trim() || 
		                    computedStyle.getPropertyValue('--font-monospace-default').trim() ||
		                    computedStyle.getPropertyValue('--font-code').trim();
		
		// Check for invalid font names (empty, undefined, or literal "??")
		if (!monospaceFont || monospaceFont === '' || monospaceFont === 'undefined' || monospaceFont === '??' || monospaceFont.includes('??')) {
			monospaceFont = 'Courier New';
		}
		
		// Extract font size (remove 'px' and convert to points)
		const fontSizeStr = computedStyle.getPropertyValue('--font-text-size') || 
		                    computedStyle.getPropertyValue('font-size') || 
		                    '16px';
		const fontSizePx = parseFloat(fontSizeStr);
		const fontSizePt = Math.round(fontSizePx * 0.75); // Convert px to pt (1pt = 1.333px)
		
		// Calculate size multiplier: if default is 12 and actual is 16, multiplier is 16/12 = 1.333
		const sizeMultiplier = fontSizePt / this.settings.defaultFontSize;
		
		// Extract line height
		const lineHeightStr = computedStyle.getPropertyValue('--line-height-normal') ||
		                      computedStyle.getPropertyValue('line-height') ||
		                      '1.5';
		const lineHeight = parseFloat(lineHeightStr);
		
		// Get heading sizes, fonts, and colors from actual elements
		const headingData = this.getHeadingSizes(fontSizePt, sizeMultiplier);
		
		const cleanFont = (font: string, fallback: string = 'Courier New') => {
			if (!font || font === 'undefined' || font === '??' || font.includes('??')) {
				return fallback;
			}
			
			// Font might already be cleaned, so just validate
			const cleaned = font.trim();
			
			// Validate the result
			if (!cleaned || cleaned === '' || cleaned === 'undefined' || cleaned === '??' || cleaned.includes('??')) {
				return fallback;
			}
			
			return cleaned;
		};
		
		const result = {
			textFont: cleanFont(textFont, this.settings.defaultFontFamily),
			monospaceFont: cleanFont(monospaceFont, 'Courier New'),
			baseFontSize: fontSizePt,
			lineHeight: lineHeight,
			sizeMultiplier: sizeMultiplier,
			headingSizes: headingData.sizes,
			headingFonts: headingData.fonts,
			headingColors: headingData.colors
		};
		
		return result;
	}

	getHeadingSizes(baseFontSize: number, sizeMultiplier: number): { sizes: number[], fonts: string[], colors: string[] } {
		const sizes: number[] = [];
		const fonts: string[] = [];
		const colors: string[] = [];
		
		// Get the text font to use for all headers
		const editorEl = document.querySelector('.markdown-preview-view, .markdown-source-view');
		const textFont = editorEl instanceof HTMLElement ? 
			window.getComputedStyle(editorEl).getPropertyValue('--font-text').replace(/['"]/g, '').split(',')[0].trim() || 
			this.settings.defaultFontFamily : 
			this.settings.defaultFontFamily;
		
		// Try to find actual heading elements in the preview or editor
		for (let i = 1; i <= 6; i++) {
			const selectors = [
				`.markdown-preview-view h${i}`,
				`.cm-header-${i}`,
				`.HyperMD-header-${i}`
			];
			
			let found = false;
			for (const selector of selectors) {
				const headingEl = document.querySelector(selector);
				if (headingEl && headingEl instanceof HTMLElement) {
					const computedStyle = window.getComputedStyle(headingEl);
					const fontSizeStr = computedStyle.getPropertyValue('font-size') || '16px';
					const fontSizePx = parseFloat(fontSizeStr);
					let fontSizePt = Math.round(fontSizePx * 0.75);
					
					// Apply size multiplier to heading size
					fontSizePt = Math.round(fontSizePt * sizeMultiplier);
					sizes.push(fontSizePt);
					
					// Use text font for all headers (not individual heading fonts)
					fonts.push(textFont);
					
					// Get heading color
					const color = computedStyle.getPropertyValue('color') || 'inherit';
					colors.push(color);
					
					found = true;
					break;
				}
			}
			
			if (!found) {
				// Fallback: use proportional sizing with multiplier
				const multipliers = [2.0, 1.6, 1.4, 1.2, 1.1, 1.0];
				sizes.push(Math.round(baseFontSize * multipliers[i - 1] * sizeMultiplier));
				fonts.push(textFont);
				colors.push('inherit');
			}
		}
		
		return { sizes, fonts, colors };
	}

	async saveDocxFile(blob: Blob, sourceFile: TFile) {
		// Convert blob to ArrayBuffer
		const arrayBuffer = await blob.arrayBuffer();
		
		const filename = `${sourceFile.basename}.docx`;
		let outputPath = '';
		
		// Determine output location
		if (this.settings.outputLocation === 'same-folder') {
			// Save in the same folder as the markdown file
			const parentPath = sourceFile.parent?.path || '';
			outputPath = parentPath ? `${parentPath}/${filename}` : filename;
		} else if (this.settings.outputLocation === 'vault-root') {
			// Save in the vault root
			outputPath = filename;
		} else if (this.settings.outputLocation === 'custom-folder') {
			// Save in the custom folder
			const customDir = this.settings.customOutputFolder.replace(/^\/+|\/+$/g, ''); // Trim slashes
			
			// Create the folder if it doesn't exist
			if (customDir && !(await this.app.vault.adapter.exists(customDir))) {
				await this.app.vault.createFolder(customDir);
			}
			
			outputPath = customDir ? `${customDir}/${filename}` : filename;
		}
		
		// Save the file
		await this.app.vault.adapter.writeBinary(outputPath, arrayBuffer);
		
		// Return the output path so we can show it in the success message
		return outputPath;
	}

	async loadSettings() {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
	}

	async saveSettings() {
		await this.saveData(this.settings);
		// Update converter settings
		this.converter = new MarkdownToDocxConverter(this.settings);
	}
}

class ToWordSettingTab extends PluginSettingTab {
	plugin: ToWordPlugin;

	constructor(app: App, plugin: ToWordPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const {containerEl} = this;

		containerEl.empty();

		containerEl.createEl('h2', {text: 'ToWord Settings'});

		new Setting(containerEl)
			.setName('Default font family')
			.setDesc('The default font family for exported documents')
			.addText(text => text
				.setPlaceholder('Calibri')
				.setValue(this.plugin.settings.defaultFontFamily)
				.onChange(async (value) => {
					this.plugin.settings.defaultFontFamily = value || 'Calibri';
					await this.plugin.saveSettings();
				}));

		new Setting(containerEl)
			.setName('Default font size')
			.setDesc('The default font size for exported documents (in points)')
			.addText(text => text
				.setPlaceholder('11')
				.setValue(String(this.plugin.settings.defaultFontSize))
				.onChange(async (value) => {
					const size = parseInt(value);
					if (!isNaN(size) && size > 0) {
						this.plugin.settings.defaultFontSize = size;
						await this.plugin.saveSettings();
					}
				}));

		new Setting(containerEl)
			.setName('Include metadata')
			.setDesc('Include frontmatter metadata in the exported document')
			.addToggle(toggle => toggle
				.setValue(this.plugin.settings.includeMetadata)
				.onChange(async (value) => {
					this.plugin.settings.includeMetadata = value;
					await this.plugin.saveSettings();
				}));

		new Setting(containerEl)
			.setName('Preserve formatting')
			.setDesc('Preserve markdown formatting (bold, italic, etc.) in the Word document')
			.addToggle(toggle => toggle
				.setValue(this.plugin.settings.preserveFormatting)
				.onChange(async (value) => {
					this.plugin.settings.preserveFormatting = value;
					await this.plugin.saveSettings();
				}));

		new Setting(containerEl)
			.setName('Enable markdown preprocessing')
			.setDesc('Automatically fix common Obsidian syntax issues (wikilinks, callouts, malformed tables) before conversion')
			.addToggle(toggle => toggle
				.setValue(this.plugin.settings.enablePreprocessing)
				.onChange(async (value) => {
					this.plugin.settings.enablePreprocessing = value;
					await this.plugin.saveSettings();
				}));

		new Setting(containerEl)
			.setName('Use Obsidian appearance')
			.setDesc('Match Obsidian\'s font sizes and heading styles (larger headings, similar to editor view)')
			.addToggle(toggle => toggle
				.setValue(this.plugin.settings.useObsidianAppearance)
				.onChange(async (value) => {
					this.plugin.settings.useObsidianAppearance = value;
					await this.plugin.saveSettings();
				}));

		new Setting(containerEl)
			.setName('Output location')
			.setDesc('Where to save the exported Word documents')
			.addDropdown(dropdown => dropdown
				.addOption('same-folder', 'Same folder as markdown file')
				.addOption('vault-root', 'Vault root')
				.addOption('custom-folder', 'Custom folder')
				.setValue(this.plugin.settings.outputLocation)
				.onChange(async (value) => {
					this.plugin.settings.outputLocation = value as 'same-folder' | 'vault-root' | 'custom-folder';
					await this.plugin.saveSettings();
					this.display(); // Refresh to show/hide custom folder setting
				}));

		if (this.plugin.settings.outputLocation === 'custom-folder') {
			new Setting(containerEl)
				.setName('Custom output folder')
				.setDesc('Folder path relative to vault root (e.g., "Exports" or "Documents/Word")')
				.addText(text => text
					.setPlaceholder('Exports')
					.setValue(this.plugin.settings.customOutputFolder)
					.onChange(async (value) => {
						this.plugin.settings.customOutputFolder = value.replace(/^\/+|\/+$/g, '');
						await this.plugin.saveSettings();
					}));
		}

		new Setting(containerEl)
			.setName('Include filename as header')
			.setDesc('Add the filename as an H1 heading at the top of the document')
			.addToggle(toggle => toggle
				.setValue(this.plugin.settings.includeFilenameAsHeader)
				.onChange(async (value) => {
					this.plugin.settings.includeFilenameAsHeader = value;
					await this.plugin.saveSettings();
				}));

		new Setting(containerEl)
			.setName('Large document chunking threshold')
			.setDesc('File size in characters above which chunked processing is used to prevent memory issues (default: 100,000)')
			.addText(text => text
				.setPlaceholder('100000')
				.setValue(String(this.plugin.settings.chunkingThreshold))
				.onChange(async (value) => {
					const threshold = parseInt(value);
					if (!isNaN(threshold) && threshold > 0) {
						this.plugin.settings.chunkingThreshold = threshold;
						await this.plugin.saveSettings();
					}
				}));

		new Setting(containerEl)
			.setName('Page size')
			.setDesc('The page size for the exported document')
			.addDropdown(dropdown => dropdown
				.addOption('A4', 'A4')
				.addOption('A5', 'A5')
				.addOption('A3', 'A3')
				.addOption('Letter', 'Letter')
				.addOption('Legal', 'Legal')
				.addOption('Tabloid', 'Tabloid')
				.setValue(this.plugin.settings.pageSize)
				.onChange(async (value) => {
					this.plugin.settings.pageSize = value as 'A4' | 'A5' | 'A3' | 'Letter' | 'Legal' | 'Tabloid';
					await this.plugin.saveSettings();
				}));
	}
}
