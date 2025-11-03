export interface KanbanTask {
	task: string;
	status?: string;
	column?: string;
}

export interface KanbanData {
	tasks?: KanbanTask[];
	columns?: string[];
}

