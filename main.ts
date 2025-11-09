import { Plugin, Editor, MarkdownView, PluginSettingTab, Setting, App } from 'obsidian';
import { registerKanbanProcessor } from './src/kanban/processor';
import { CreateKanbanModal } from './src/kanban/create-kanban-modal';

export interface KanbanPluginSettings {
	progressBarGreenThreshold: number;
	progressBarYellowThreshold: number;
	progressBarOrangeThreshold: number;
	progressBarRedThreshold: number;
}

export const DEFAULT_SETTINGS: KanbanPluginSettings = {
	progressBarGreenThreshold: 69,
	progressBarYellowThreshold: 84,
	progressBarOrangeThreshold: 99,
	progressBarRedThreshold: 100
};

export default class KanbanPlugin extends Plugin {
	settings: KanbanPluginSettings;
	async onload() {
		console.log("Kanban Plugin: Loading...");
		
		// Load settings
		await this.loadSettings();
		
		// Register the kanban code block processor
		registerKanbanProcessor(this);
		
		// Add settings tab
		this.addSettingTab(new KanbanSettingTab(this.app, this));
		
		// Add command to insert kanban board
		this.addCommand({
			id: 'insert-kanban-board',
			name: 'Insert Kanban Board',
			editorCallback: (editor: Editor, view: MarkdownView) => {
				const modal = new CreateKanbanModal(this.app, (columns) => {
					if (!columns) return; // User cancelled
					
					// Create the kanban data structure
					const kanbanData = {
						columns: columns,
						tasks: []
					};
					
					// Format as JSON
					const jsonString = JSON.stringify(kanbanData, null, 2);
					
					// Insert at cursor position
					const cursor = editor.getCursor();
					const kanbanBlock = `\`\`\`kanban\n${jsonString}\n\`\`\`\n`;
					editor.replaceRange(kanbanBlock, cursor);
					
					// Move cursor after the inserted block
					const lines = kanbanBlock.split('\n').length;
					editor.setCursor({
						line: cursor.line + lines,
						ch: 0
					});
					
					console.log("Kanban: Inserted new kanban board with columns:", columns);
				});
				modal.open();
			}
		});
		
		console.log("Kanban Plugin: Loaded successfully");
	}

	onunload() {
		// Cleanup is handled automatically by Obsidian
	}
	
	async loadSettings() {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
	}
	
	async saveSettings() {
		await this.saveData(this.settings);
	}
}

class KanbanSettingTab extends PluginSettingTab {
	plugin: KanbanPlugin;

	constructor(app: App, plugin: KanbanPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const { containerEl } = this;

		containerEl.empty();

		containerEl.createEl('h2', { text: 'Kanban Plugin Settings' });
		
		containerEl.createEl('h3', { text: 'Progress Bar Color Thresholds' });
		
		containerEl.createEl('p', { 
			text: 'Customize the percentage thresholds for progress bar colors. Progress percentage is calculated as (time spent / target time) × 100.',
			cls: 'setting-item-description'
		});

		new Setting(containerEl)
			.setName('Green threshold (max %)')
			.setDesc('Tasks with progress up to this percentage will be green')
			.addText(text => text
				.setPlaceholder('69')
				.setValue(String(this.plugin.settings.progressBarGreenThreshold))
				.onChange(async (value) => {
					const num = parseInt(value);
					if (!isNaN(num) && num >= 0 && num <= 100) {
						this.plugin.settings.progressBarGreenThreshold = num;
						await this.plugin.saveSettings();
					}
				}));

		new Setting(containerEl)
			.setName('Yellow threshold (max %)')
			.setDesc('Tasks with progress between green and this percentage will be yellow')
			.addText(text => text
				.setPlaceholder('84')
				.setValue(String(this.plugin.settings.progressBarYellowThreshold))
				.onChange(async (value) => {
					const num = parseInt(value);
					if (!isNaN(num) && num >= 0 && num <= 100) {
						this.plugin.settings.progressBarYellowThreshold = num;
						await this.plugin.saveSettings();
					}
				}));

		new Setting(containerEl)
			.setName('Orange threshold (max %)')
			.setDesc('Tasks with progress between yellow and this percentage will be orange')
			.addText(text => text
				.setPlaceholder('99')
				.setValue(String(this.plugin.settings.progressBarOrangeThreshold))
				.onChange(async (value) => {
					const num = parseInt(value);
					if (!isNaN(num) && num >= 0 && num <= 100) {
						this.plugin.settings.progressBarOrangeThreshold = num;
						await this.plugin.saveSettings();
					}
				}));

		new Setting(containerEl)
			.setName('Red threshold (min %)')
			.setDesc('Tasks with progress at or above this percentage will be red')
			.addText(text => text
				.setPlaceholder('100')
				.setValue(String(this.plugin.settings.progressBarRedThreshold))
				.onChange(async (value) => {
					const num = parseInt(value);
					if (!isNaN(num) && num >= 0) {
						this.plugin.settings.progressBarRedThreshold = num;
						await this.plugin.saveSettings();
					}
				}));
		
		containerEl.createEl('p', { 
			text: 'Example: With default settings (69, 84, 99, 100), a task with 50% progress is green, 75% is yellow, 90% is orange, and 100%+ is red.',
			cls: 'setting-item-description',
			attr: { style: 'margin-top: 1rem; font-style: italic; opacity: 0.8;' }
		});
		
		containerEl.createEl('hr', { 
			attr: { style: 'margin: 2rem 0; border: none; border-top: 1px solid var(--background-modifier-border);' }
		});
		
		// Inspiring message
		const messageContainer = containerEl.createDiv({ cls: 'kanban-settings-message' });
		messageContainer.createEl('p', { 
			text: '✨ Thank you for using Kanban Plugin! ✨',
			attr: { style: 'font-size: 1.1rem; font-weight: 600; color: var(--interactive-accent); margin-bottom: 0.5rem;' }
		});
		messageContainer.createEl('p', { 
			text: 'Stay focused, track your progress, and achieve your goals one task at a time. Remember: small consistent steps lead to great achievements!',
			attr: { style: 'font-style: italic; opacity: 0.9; margin-bottom: 1rem; line-height: 1.5;' }
		});
		
		// Buy Me a Coffee button
		const coffeeContainer = containerEl.createDiv({ 
			cls: 'kanban-settings-coffee',
			attr: { style: 'margin: 1.5rem 0; text-align: center;' }
		});
		
		const coffeeButton = coffeeContainer.createEl('a', {
			text: '☕ Buy me a coffee',
			href: 'https://www.buymeacoffee.com/hudsonventura',
			attr: { 
				style: 'display: inline-block; background-color: #FFDD00; color: #000000; padding: 0.7rem 1.5rem; border-radius: 8px; text-decoration: none; font-weight: 600; font-family: Poppins, sans-serif; border: 2px solid #000000; transition: all 0.2s ease; cursor: pointer;',
				target: '_blank',
				rel: 'noopener noreferrer'
			}
		});
		
		// Add hover effect via event listeners
		coffeeButton.addEventListener('mouseenter', () => {
			coffeeButton.style.transform = 'scale(1.05)';
			coffeeButton.style.boxShadow = '0 4px 8px rgba(0,0,0,0.2)';
		});
		coffeeButton.addEventListener('mouseleave', () => {
			coffeeButton.style.transform = 'scale(1)';
			coffeeButton.style.boxShadow = 'none';
		});
		
		coffeeContainer.createEl('p', {
			text: 'If this plugin helps you stay organized and productive, consider supporting its development!',
			attr: { style: 'margin-top: 0.5rem; font-size: 0.9rem; opacity: 0.7;' }
		});
		
		// Links to website and GitHub
		const linksContainer = containerEl.createDiv({ 
			attr: { style: 'margin: 1.5rem 0; text-align: center;' }
		});
		
		const linksText = linksContainer.createEl('p', {
			text: 'Connect with me:',
			attr: { style: 'margin-bottom: 0.75rem; font-size: 0.9rem; opacity: 0.8;' }
		});
		
		const linksWrapper = linksContainer.createDiv({ 
			attr: { style: 'display: flex; justify-content: center; gap: 1rem; flex-wrap: wrap;' }
		});
		
		// GitHub link
		const githubLink = linksWrapper.createEl('a', {
			text: '🔗 GitHub',
			href: 'https://github.com/hudsonventura',
			attr: { 
				style: 'display: inline-block; color: var(--text-normal); padding: 0.5rem 1rem; border-radius: 6px; text-decoration: none; font-weight: 500; border: 1px solid var(--background-modifier-border); transition: all 0.2s ease;',
				target: '_blank',
				rel: 'noopener noreferrer'
			}
		});
		
		githubLink.addEventListener('mouseenter', () => {
			githubLink.style.backgroundColor = 'var(--background-modifier-hover)';
			githubLink.style.borderColor = 'var(--interactive-accent)';
		});
		githubLink.addEventListener('mouseleave', () => {
			githubLink.style.backgroundColor = 'transparent';
			githubLink.style.borderColor = 'var(--background-modifier-border)';
		});
		
		// Website link
		const websiteLink = linksWrapper.createEl('a', {
			text: '🌐 Website',
			href: 'https://hudsonventura.ddnsfree.com',
			attr: { 
				style: 'display: inline-block; color: var(--text-normal); padding: 0.5rem 1rem; border-radius: 6px; text-decoration: none; font-weight: 500; border: 1px solid var(--background-modifier-border); transition: all 0.2s ease;',
				target: '_blank',
				rel: 'noopener noreferrer'
			}
		});
		
		websiteLink.addEventListener('mouseenter', () => {
			websiteLink.style.backgroundColor = 'var(--background-modifier-hover)';
			websiteLink.style.borderColor = 'var(--interactive-accent)';
		});
		websiteLink.addEventListener('mouseleave', () => {
			websiteLink.style.backgroundColor = 'transparent';
			websiteLink.style.borderColor = 'var(--background-modifier-border)';
		});
	}
}
