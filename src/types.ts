export type KanbanStatus = "todo" | "in progress" | "done";

export interface KanbanTask {
	task: string;
	status?: KanbanStatus;
}

export interface KanbanData {
	tasks?: KanbanTask[];
	columns?: string[];
}

