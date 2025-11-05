import { Plugin, Editor, MarkdownView } from 'obsidian';
import { registerKanbanProcessor } from './src/kanban/processor';
import { CreateKanbanModal } from './src/kanban/create-kanban-modal';

export default class KanbanPlugin extends Plugin {
	async onload() {
		console.log("Kanban Plugin: Loading...");
		
		// Register the kanban code block processor
		registerKanbanProcessor(this);
		
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
}
