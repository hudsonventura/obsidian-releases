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
	}
}
