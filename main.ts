import { Plugin } from 'obsidian';
import { registerKanbanProcessor } from './src/kanban/processor';

export default class KanbanPlugin extends Plugin {
	async onload() {
		console.log("Kanban Plugin: Loading...");
		// Register the kanban code block processor
		registerKanbanProcessor(this);
		console.log("Kanban Plugin: Loaded successfully");
	}

	onunload() {
		// Cleanup is handled automatically by Obsidian
	}
}
