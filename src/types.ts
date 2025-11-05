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
}

export interface KanbanData {
	tasks?: KanbanTask[];
	columns?: string[];
}

