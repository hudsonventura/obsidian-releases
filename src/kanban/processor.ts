import { MarkdownPostProcessorContext, Plugin } from "obsidian";
import { KanbanTask, KanbanData } from "../types";
import { renderKanban } from "./renderer";

export function registerKanbanProcessor(plugin: Plugin) {
	return plugin.registerMarkdownCodeBlockProcessor("kanban", (
		source: string,
		el: HTMLElement,
		ctx: MarkdownPostProcessorContext
	) => {
		try {
			// Parse the kanban data
			const data = parseKanbanData(source);
			
			// Render the kanban board
			renderKanban(el, data);
		} catch (error) {
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
	
	// Try to parse as JSON first
	try {
		// Try parsing as JSON array directly: [{"task": "test"}]
		if (cleaned.startsWith("[")) {
			const tasks = JSON.parse(cleaned) as KanbanTask[];
			return { tasks };
		}
		
		// Try parsing as JSON object: {"tasks": [...], "columns": [...]}
		if (cleaned.startsWith("{")) {
			const data = JSON.parse(cleaned) as KanbanData;
			return data;
		}
	} catch (e) {
		// If direct JSON parsing fails, try to fix the syntax
	}
	
	// Try parsing the user's syntax: {["task": "test"]}
	// Convert to valid JSON: [{"task": "test"}]
	if (cleaned.includes("[") && cleaned.includes("task")) {
		try {
			// Replace {[ with [ and ]} with ]
			let fixed = cleaned.replace(/^\{\[/, "[").replace(/\]\}$/, "]");
			// Ensure proper JSON formatting
			fixed = fixed.replace(/"task":/g, '"task":');
			const tasks = JSON.parse(fixed) as KanbanTask[];
			return { tasks };
		} catch (e) {
			// If that fails, continue to text parsing
		}
	}
	
	// If JSON parsing fails, try to extract tasks from the text
	const tasks: KanbanTask[] = [];
	const lines = source.split("\n").filter(line => line.trim());
	
	for (const line of lines) {
		// Try to extract task from various formats
		const taskMatch = line.match(/["']?task["']?\s*:\s*["']?([^"']+)["']?/i);
		if (taskMatch) {
			tasks.push({ task: taskMatch[1] });
		} else if (line.trim()) {
			// If no explicit task field, use the line as task text
			tasks.push({ task: line.trim() });
		}
	}
	
	if (tasks.length > 0) {
		return { tasks };
	}
	
	// Default: return empty kanban
	return { tasks: [] };
}

