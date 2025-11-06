export type KanbanStatus = string; // Allows custom statuses in addition to default: "todo", "in progress", "done"

export type ColumnState = "todo" | "in-progress" | "done";

export interface ColumnMetadata {
	name: string;
	state: ColumnState;
}

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
	dueDate?: string; // Due date/time for the task (ISO string format)
	updateDateTime?: string; // Last update date/time (ISO string format)
}

export type KanbanView = "horizontal" | "vertical";

export interface KanbanData {
	tasks?: KanbanTask[];
	columns?: string[];
	columnMetadata?: ColumnMetadata[]; // Metadata for columns including their state
	collapsedColumns?: string[]; // Array of column names that are collapsed
	view?: KanbanView; // View mode: horizontal (statuses stacked) or vertical (statuses side-by-side)
}

