import { KanbanTask, KanbanData } from "../types";

export function renderKanban(containerEl: HTMLElement, data: KanbanData) {
	containerEl.empty();
	containerEl.addClass("kanban-container");
	
	// Default columns if not specified
	const columns = data.columns || ["To Do", "In Progress", "Done"];
	
	// Group tasks by column/status
	const tasksByColumn = new Map<string, KanbanTask[]>();
	
	// Initialize all columns
	columns.forEach(col => tasksByColumn.set(col, []));
	
	// Assign tasks to columns
	if (data.tasks) {
		data.tasks.forEach(task => {
			const column = task.column || task.status || columns[0];
			const existing = tasksByColumn.get(column) || [];
			existing.push(task);
			tasksByColumn.set(column, existing);
		});
	}
	
	// Create kanban board
	const boardEl = containerEl.createDiv("kanban-board");
	
	// Create columns
	columns.forEach(columnName => {
		const columnEl = boardEl.createDiv("kanban-column");
		columnEl.setAttr("data-column", columnName);
		
		// Column header
		const headerEl = columnEl.createDiv("kanban-column-header");
		const headerTitle = headerEl.createEl("h3");
		headerTitle.setText(columnName);
		
		// Column tasks
		const tasksEl = columnEl.createDiv("kanban-column-tasks");
		const tasks = tasksByColumn.get(columnName) || [];
		
		tasks.forEach(task => {
			const taskEl = tasksEl.createDiv("kanban-task");
			const taskContent = taskEl.createDiv("kanban-task-content");
			taskContent.setText(task.task);
		});
	});
}

