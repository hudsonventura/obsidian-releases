export type KanbanStatus = string; // Allows custom statuses in addition to default: "todo", "in progress", "done"

export interface TimerEntry {
	startTime: string;
	endTime: string | null;
}

export interface KanbanTask {
	task: string;
	status?: KanbanStatus;
	timerEntries?: TimerEntry[];
	targetTime?: string; // Due time for the task (e.g., "2h", "1d", "2025-12-31")
	tags?: string[]; // Tags for the task (e.g., ["#Test", "#John_Master"])
}

export interface KanbanData {
	tasks?: KanbanTask[];
	columns?: string[];
	collapsedColumns?: string[]; // Array of column names that are collapsed
}

