import { MarkdownPostProcessorContext, Plugin } from "obsidian";
import { KanbanTask, KanbanData, KanbanStatus } from "../types";
import { renderKanban } from "./renderer";

const DEFAULT_STATUS: KanbanStatus = "todo";
const VALID_STATUSES: KanbanStatus[] = ["todo", "in progress", "done"];

// Normalize status value to ensure it's a valid KanbanStatus
function normalizeStatus(status: string | undefined): KanbanStatus {
	if (!status) return DEFAULT_STATUS;
	
	const normalized = status.toLowerCase().trim();
	
	// Map common variations to valid statuses
	const statusMap: Record<string, KanbanStatus> = {
		"todo": "todo",
		"to do": "todo",
		"to-do": "todo",
		"in progress": "in progress",
		"in-progress": "in progress",
		"inprogress": "in progress",
		"doing": "in progress",
		"done": "done",
		"completed": "done",
		"complete": "done",
	};
	
	// Return mapped status if found, otherwise return the status as-is (allowing custom statuses)
	return statusMap[normalized] || (normalized as KanbanStatus);
}

export function registerKanbanProcessor(plugin: Plugin) {
	console.log("Kanban Plugin: Registering code block processor");
	return plugin.registerMarkdownCodeBlockProcessor("kanban", (
		source: string,
		el: HTMLElement,
		ctx: MarkdownPostProcessorContext
	) => {
		console.log("Kanban Plugin: Processing kanban code block", source);
		try {
			// Parse the kanban data
			const data = parseKanbanData(source);
			console.log("Kanban Plugin: Parsed data", data);
			
			// Render the kanban board with context for file updates
			renderKanban(el, data, plugin, ctx, source);
			console.log("Kanban Plugin: Rendering complete");
		} catch (error) {
			console.error("Kanban Plugin: Error rendering kanban", error);
			const errorMessage = error instanceof Error ? error.message : String(error);
			const errorEl = el.createEl("div", { cls: "kanban-error" });
			errorEl.setText(`Error rendering kanban: ${errorMessage}`);
		}
	});
}

function parseKanbanData(source: string): KanbanData {
	// Clean up the source - remove any leading/trailing whitespace
	const cleaned = source.trim();
	
	if (!cleaned) {
		return { tasks: [] };
	}
	
	// Only accept JSON format - parse as JSON
	try {
		// Try parsing as JSON array directly: [{"task": "test", "status": "todo"}]
		if (cleaned.startsWith("[")) {
			const tasks = JSON.parse(cleaned) as KanbanTask[];
			
			// Validate that each item has a task property
			if (!Array.isArray(tasks)) {
				throw new Error("Expected JSON array of tasks");
			}
			
			// Normalize status for each task
			const normalizedTasks = tasks.map((task, index) => {
				if (!task || typeof task !== "object") {
					throw new Error(`Task at index ${index} is not a valid object`);
				}
				if (!task.task || typeof task.task !== "string") {
					throw new Error(`Task at index ${index} is missing required "task" field`);
				}
				return {
					...task,
					status: normalizeStatus(task.status || (task as any).column)
				};
			});
			return { tasks: normalizedTasks };
		}
		
		// Try parsing as JSON object: {"tasks": [...], "columns": [...]}
		if (cleaned.startsWith("{")) {
			const data = JSON.parse(cleaned) as KanbanData;
			
			// Validate structure
			if (data.tasks && !Array.isArray(data.tasks)) {
				throw new Error('"tasks" must be an array');
			}
			
			// Normalize status for each task
			if (data.tasks) {
				data.tasks = data.tasks.map((task, index) => {
					if (!task || typeof task !== "object") {
						throw new Error(`Task at index ${index} is not a valid object`);
					}
					if (!task.task || typeof task.task !== "string") {
						throw new Error(`Task at index ${index} is missing required "task" field`);
					}
					return {
						...task,
						status: normalizeStatus(task.status || (task as any).column)
					};
				});
			}
			return data;
		}
		
		// If it doesn't start with [ or {, it's not valid JSON
		throw new Error("Kanban data must be valid JSON (array or object)");
	} catch (error) {
		// Re-throw with more context if it's a JSON parse error
		if (error instanceof SyntaxError) {
			throw new Error(`Invalid JSON format: ${error.message}`);
		}
		// Re-throw validation errors
		throw error;
	}
}

