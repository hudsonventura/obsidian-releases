import { Plugin } from 'obsidian';
import { registerKanbanProcessor } from './src/kanban/processor';

export default class KanbanPlugin extends Plugin {
	async onload() {
		// Register the kanban code block processor
		registerKanbanProcessor(this);
	}

	onunload() {
		// Cleanup is handled automatically by Obsidian
	}
}
