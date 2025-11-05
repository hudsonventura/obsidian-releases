import { Plugin, MarkdownPostProcessorContext, App, TFile } from "obsidian";
import { KanbanTask, KanbanData, KanbanStatus } from "../types";

const DEFAULT_COLUMNS: KanbanStatus[] = ["todo", "in progress", "done"];

// Map status to display name
function statusToDisplayName(status: KanbanStatus): string {
	const displayMap: Record<KanbanStatus, string> = {
		"todo": "To Do",
		"in progress": "In Progress",
		"done": "Done"
	};
	return displayMap[status];
}

export function renderKanban(
	containerEl: HTMLElement, 
	data: KanbanData, 
	plugin: Plugin, 
	ctx: MarkdownPostProcessorContext,
	originalSource: string
) {
	console.log("Kanban Plugin: renderKanban called", { containerEl, data });
	
	// Clear the container
	containerEl.empty();
	containerEl.classList.add("kanban-container");
	
	// Ensure the container is visible
	containerEl.style.display = "block";
	containerEl.style.visibility = "visible";
	
	// Use status-based columns if not specified, otherwise map custom columns to statuses
	const statusColumns: KanbanStatus[] = data.columns 
		? data.columns.map(col => {
			// Try to map custom column names to statuses
			const normalized = col.toLowerCase().trim();
			if (normalized === "todo" || normalized === "to do" || normalized === "to-do") return "todo";
			if (normalized === "in progress" || normalized === "in-progress" || normalized === "inprogress" || normalized === "doing") return "in progress";
			if (normalized === "done" || normalized === "completed" || normalized === "complete") return "done";
			// Default to todo if unrecognized
			return "todo";
		}) as KanbanStatus[]
		: DEFAULT_COLUMNS;
	
	// Group tasks by status
	const tasksByStatus = new Map<KanbanStatus, KanbanTask[]>();
	
	// Initialize all status columns
	statusColumns.forEach(status => tasksByStatus.set(status, []));
	
	// Assign tasks to status columns
	if (data.tasks) {
		data.tasks.forEach(task => {
			const status = task.status || "todo";
			const existing = tasksByStatus.get(status) || [];
			existing.push(task);
			tasksByStatus.set(status, existing);
		});
	}
	
	// Create header with add task button
	const headerEl = containerEl.createDiv("kanban-header");
	const addTaskButton = headerEl.createEl("button", { 
		cls: "kanban-add-task-button",
		text: "+ Add Task"
	});
	
	// Create kanban board
	const boardEl = containerEl.createDiv("kanban-board");
	
	// Create columns
	const columnElements = new Map<KanbanStatus, HTMLElement>();
	const taskElements = new Map<HTMLElement, { task: KanbanTask; status: KanbanStatus }>();
	
	// Function to create a task element
	function createTaskElement(task: KanbanTask, status: KanbanStatus, tasksContainer: HTMLElement): HTMLElement {
		const taskEl = tasksContainer.createDiv("kanban-task");
		taskEl.setAttr("draggable", "true");
		taskEl.setAttr("data-task", task.task);
		taskEl.setAttr("data-status", status);
		taskEl.classList.add("kanban-task-draggable");
		
		const taskContent = taskEl.createDiv("kanban-task-content");
		taskContent.setText(task.task);
		
		// Store mapping
		taskElements.set(taskEl, { task, status });
		
		// Drag event handlers
		setupTaskDragHandlers(taskEl, status);
		
		return taskEl;
	}
	
	// Function to update the file with current tasks
	async function saveTasksToFile(updatedTaskText?: string) {
		const allTasks: KanbanTask[] = [];
		taskElements.forEach((info) => {
			allTasks.push({ 
				task: info.task.task, 
				status: info.status
			});
		});
		
		console.log("Kanban: Saving tasks to file. Total tasks:", allTasks.length);
		console.log("Kanban: Tasks to save:", allTasks);
		if (updatedTaskText) {
			console.log("Kanban: Updated task:", updatedTaskText);
		}
		
		await updateKanbanInFile(plugin.app, ctx, updatedTaskText || "", "todo" as KanbanStatus, originalSource, { tasks: allTasks, columns: data.columns }).catch(err => {
			console.error("Error saving tasks to file:", err);
		});
	}
	
	// Create input field for new tasks (hidden by default)
	const taskInputContainer = headerEl.createDiv("kanban-task-input-container");
	taskInputContainer.style.display = "none";
	
	const taskInput = taskInputContainer.createEl("input", {
		type: "text",
		cls: "kanban-task-input",
		attr: { placeholder: "Enter task name..." }
	});
	
	const taskInputButtons = taskInputContainer.createDiv("kanban-task-input-buttons");
	const confirmButton = taskInputButtons.createEl("button", {
		cls: "kanban-task-input-confirm",
		text: "Add"
	});
	const cancelButton = taskInputButtons.createEl("button", {
		cls: "kanban-task-input-cancel",
		text: "Cancel"
	});
	
	// Function to show input field
	function showTaskInput() {
		taskInputContainer.style.display = "flex";
		taskInput.focus();
		addTaskButton.style.display = "none";
	}
	
	// Function to hide input field
	function hideTaskInput() {
		taskInputContainer.style.display = "none";
		taskInput.value = "";
		addTaskButton.style.display = "block";
	}
	
	// Function to create and add the task
	async function createNewTask(taskName: string) {
		const trimmedTaskName = taskName.trim();
		
		if (!trimmedTaskName) {
			return; // Empty task name
		}
		
		// Check if task already exists
		const taskExists = Array.from(taskElements.values()).some(
			info => info.task.task === trimmedTaskName
		);
		
		if (taskExists) {
			console.warn("Kanban: Task already exists:", trimmedTaskName);
			return;
		}
		
		// Create new task with "todo" status
		const newTask: KanbanTask = {
			task: trimmedTaskName,
			status: "todo"
		};
		
		// Find the todo column
		const todoColumn = columnElements.get("todo");
		if (!todoColumn) {
			console.error("Kanban: Could not find todo column");
			return;
		}
		
		const tasksContainer = todoColumn.querySelector(".kanban-column-tasks") as HTMLElement;
		if (!tasksContainer) {
			console.error("Kanban: Could not find tasks container in todo column");
			return;
		}
		
		// Create and add the task element
		const taskEl = createTaskElement(newTask, "todo", tasksContainer);
		
		// Verify the task was added to the map
		if (!taskElements.has(taskEl)) {
			console.error("Kanban: Failed to add task to taskElements map");
			return;
		}
		
		// Update the file
		await saveTasksToFile();
		
		console.log("Kanban: Created new task:", trimmedTaskName);
		hideTaskInput();
	}
	
	// Add task button handler
	addTaskButton.addEventListener("click", () => {
		showTaskInput();
	});
	
	// Confirm button handler
	confirmButton.addEventListener("click", async () => {
		await createNewTask(taskInput.value);
	});
	
	// Cancel button handler
	cancelButton.addEventListener("click", () => {
		hideTaskInput();
	});
	
	// Enter key handler
	taskInput.addEventListener("keydown", async (e: KeyboardEvent) => {
		if (e.key === "Enter") {
			e.preventDefault();
			await createNewTask(taskInput.value);
		} else if (e.key === "Escape") {
			e.preventDefault();
			hideTaskInput();
		}
	});
	
	statusColumns.forEach(status => {
		const displayName = statusToDisplayName(status);
		const columnEl = boardEl.createDiv("kanban-column");
		columnEl.setAttr("data-status", status);
		columnEl.classList.add("kanban-column-dropzone");
		columnElements.set(status, columnEl);
		
		// Column header
		const headerEl = columnEl.createDiv("kanban-column-header");
		const headerTitle = headerEl.createEl("h3");
		headerTitle.setText(displayName);
		
		// Column tasks container
		const tasksEl = columnEl.createDiv("kanban-column-tasks");
		const tasks = tasksByStatus.get(status) || [];
		
		// Create tasks
		tasks.forEach(task => {
			createTaskElement(task, task.status || "todo", tasksEl);
		});
		
		// Column drop zone handlers
		setupColumnDropHandlers(tasksEl, status);
	});
	
	// Set up drag handlers for tasks
	function setupTaskDragHandlers(taskEl: HTMLElement, sourceStatus: KanbanStatus) {
		taskEl.addEventListener("dragstart", (e: DragEvent) => {
			if (!e.dataTransfer) return;
			
			taskEl.classList.add("kanban-task-dragging");
			e.dataTransfer.effectAllowed = "move";
			e.dataTransfer.setData("text/plain", taskEl.getAttribute("data-task") || "");
			// Read current status from the element's attribute (updated when task moves)
			const currentStatus = (taskEl.getAttribute("data-status") || sourceStatus) as KanbanStatus;
			e.dataTransfer.setData("application/x-kanban-status", currentStatus);
			
			// Add visual feedback
			document.body.classList.add("kanban-drag-active");
		});
		
		taskEl.addEventListener("dragend", (e: DragEvent) => {
			taskEl.classList.remove("kanban-task-dragging");
			document.body.classList.remove("kanban-drag-active");
			
			// Remove drop indicators from all columns
			columnElements.forEach((colEl) => {
				colEl.classList.remove("kanban-column-drag-over");
			});
		});
	}
	
	// Set up drop handlers for columns
	function setupColumnDropHandlers(tasksContainer: HTMLElement, targetStatus: KanbanStatus) {
		tasksContainer.addEventListener("dragover", (e: DragEvent) => {
			e.preventDefault();
			if (!e.dataTransfer) return;
			
			e.dataTransfer.dropEffect = "move";
			
			// Add visual feedback
			const columnEl = tasksContainer.parentElement;
			if (columnEl) {
				columnEl.classList.add("kanban-column-drag-over");
			}
		});
		
		tasksContainer.addEventListener("dragleave", (e: DragEvent) => {
			const columnEl = tasksContainer.parentElement;
			if (columnEl && !columnEl.contains(e.relatedTarget as Node)) {
				columnEl.classList.remove("kanban-column-drag-over");
			}
		});
		
		tasksContainer.addEventListener("drop", (e: DragEvent) => {
			e.preventDefault();
			if (!e.dataTransfer) return;
			
			const sourceStatus = e.dataTransfer.getData("application/x-kanban-status") as KanbanStatus;
			const taskText = e.dataTransfer.getData("text/plain");
			
			// Remove visual feedback
			const columnEl = tasksContainer.parentElement;
			if (columnEl) {
				columnEl.classList.remove("kanban-column-drag-over");
			}
			
			// If dropped in the same status column, do nothing
			if (sourceStatus === targetStatus) {
				return;
			}
			
			// Find the task element in the source column
			const sourceColumnEl = columnElements.get(sourceStatus);
			if (!sourceColumnEl) return;
			
			const sourceTasksEl = sourceColumnEl.querySelector(".kanban-column-tasks");
			if (!sourceTasksEl) return;
			
			const taskEl = Array.from(sourceTasksEl.children).find(
				(el) => el.getAttribute("data-task") === taskText
			) as HTMLElement;
			
			if (!taskEl) return;
			
			// Move the task element to the new column
			taskEl.setAttribute("data-status", targetStatus);
			tasksContainer.appendChild(taskEl);
			
			// Update the stored task information with new status
			const taskInfo = taskElements.get(taskEl);
			if (taskInfo) {
				// Update both the status in the info and the task object
				taskInfo.status = targetStatus;
				taskInfo.task.status = targetStatus;
				
				console.log("Kanban: Updating task", taskText, "to status", targetStatus);
				
				// Update the file with the new status
				saveTasksToFile(taskText).catch(err => {
					console.error("Error saving task status change:", err);
				});
			} else {
				console.warn("Kanban: Could not find task info for:", taskText);
			}
		});
	}
}

// Normalize path for comparison (remove leading/trailing slashes, handle case)
function normalizePath(path: string): string {
	return path.replace(/^\/+|\/+$/g, "").toLowerCase();
}

// Update the kanban code block in the markdown file
async function updateKanbanInFile(
	app: App,
	ctx: MarkdownPostProcessorContext,
	taskText: string,
	newStatus: KanbanStatus,
	originalSource: string,
	currentData: KanbanData
) {
	try {
		let file = null;
		
		// Strategy 1: Try the active file first (most reliable for user interactions)
		// Use active file if it exists - user is likely viewing the file with the kanban
		const activeFile = app.workspace.getActiveFile();
		if (activeFile instanceof TFile && activeFile.extension === "md") {
			file = activeFile;
			console.log("Kanban: Using active file:", activeFile.path);
		} else {
			console.log("Kanban: No active file available or not a markdown file");
		}
		
		// Strategy 2: Try to get the file directly using the source path
		if (!file) {
			file = app.vault.getAbstractFileByPath(ctx.sourcePath);
			if (file) {
				console.log("Kanban: Found file by sourcePath:", ctx.sourcePath);
			}
		}
		
		// Strategy 3: Try with leading slash
		if (!file && !ctx.sourcePath.startsWith("/")) {
			file = app.vault.getAbstractFileByPath("/" + ctx.sourcePath);
			if (file) {
				console.log("Kanban: Found file with leading slash:", "/" + ctx.sourcePath);
			}
		}
		
		// Strategy 4: Search for the file by name (case-insensitive comparison)
		if (!file) {
			const sourceFileName = ctx.sourcePath.split("/").pop() || ctx.sourcePath;
			const allFiles = app.vault.getMarkdownFiles();
			const normalizedFileName = normalizePath(sourceFileName);
			
			console.log("Kanban: Searching for file by name:", sourceFileName, "normalized:", normalizedFileName);
			
			const foundFile = allFiles.find(f => {
				const normalizedPath = normalizePath(f.path);
				const normalizedName = normalizePath(f.name);
				const normalizedBasename = normalizePath(f.basename);
				
				const matches = normalizedPath === normalizedFileName ||
				       normalizedName === normalizedFileName ||
				       normalizedBasename === normalizedFileName.replace(/\.md$/, "") ||
				       normalizedPath.endsWith(normalizedFileName) ||
				       normalizedFileName.endsWith(normalizedPath);
				
				if (matches) {
					console.log("Kanban: Potential match found:", f.path, "path:", normalizedPath, "name:", normalizedName);
				}
				
				return matches;
			});
			
			if (foundFile) {
				file = foundFile;
				console.log("Kanban: Found file by name match:", foundFile.path);
			} else {
				console.log("Kanban: No file found by name. Available files:", allFiles.map(f => ({ path: f.path, name: f.name, normalized: normalizePath(f.name) })));
			}
		}
		
		// Strategy 5: Search all files for kanban blocks containing the task (most reliable fallback)
		if (!file) {
			console.log("Kanban: Searching files by kanban content...");
			const allFiles = app.vault.getMarkdownFiles();
			const normalizedOriginal = originalSource.trim();
			
			// Try to find a file that contains this kanban block
			// First try exact match, then try matching by task content
			for (const candidateFile of allFiles) {
				try {
					const content = await app.vault.read(candidateFile as any);
					const kanbanBlockRegex = /```kanban\s*\n?([\s\S]*?)\n?```/g;
					let match;
					let found = false;
					
					while ((match = kanbanBlockRegex.exec(content)) !== null) {
						const blockContent = match[1].trim();
						
						// Try exact match first
						if (blockContent === normalizedOriginal) {
							file = candidateFile;
							console.log("Kanban: Found file by exact content match:", candidateFile.path);
							found = true;
							break;
						}
						
						// If we're updating a specific task, check if this block contains that task
						if (taskText) {
							try {
								const blockData = JSON.parse(blockContent);
								const tasks = Array.isArray(blockData) ? blockData : (blockData.tasks || []);
								if (tasks.some((t: any) => t.task === taskText)) {
									file = candidateFile;
									console.log("Kanban: Found file by task content match:", candidateFile.path, "task:", taskText);
									found = true;
									break;
								}
							} catch (e) {
								// If parsing fails, skip this block
							}
						}
					}
					if (found) break;
				} catch (e) {
					// Skip files that can't be read
					continue;
				}
			}
			
			if (!file) {
				console.log("Kanban: No file found by content search");
			}
		}
		
		// Final fallback: Explicit search by exact filename match
		if (!file) {
			const sourceFileName = ctx.sourcePath.split("/").pop() || ctx.sourcePath;
			const allFiles = app.vault.getMarkdownFiles();
			
			console.log("Kanban: Final fallback - searching for exact filename:", sourceFileName);
			
			// Try exact match first (case-sensitive)
			file = allFiles.find(f => f.name === sourceFileName || f.path === ctx.sourcePath);
			
			// If not found, try case-insensitive
			if (!file) {
				const lowerSourceName = sourceFileName.toLowerCase();
				file = allFiles.find(f => f.name.toLowerCase() === lowerSourceName);
			}
			
			if (file) {
				console.log("Kanban: Found file by final fallback:", file.path);
			}
		}
		
		if (!file) {
			console.warn("Kanban: Could not find file to update:", ctx.sourcePath);
			console.warn("Kanban: Source path:", ctx.sourcePath);
			console.warn("Kanban: Available files:", app.vault.getMarkdownFiles().map(f => ({ path: f.path, name: f.name })));
			return;
		}
		
		// Verify it's a TFile (markdown file) by checking if it has extension property
		if (!(file instanceof TFile) || file.extension !== "md") {
			console.warn("Kanban: File is not a markdown file:", file.path, "type:", file.constructor.name);
			return;
		}

		const content = await app.vault.read(file as any);
		
		// Find the kanban code block and update it
		// Match kanban code blocks more flexibly - handle different whitespace patterns
		const kanbanBlockRegex = /```kanban\s*\n?([\s\S]*?)\n?```/g;
		let updatedContent = content;
		let found = false;
		let matchCount = 0;

		updatedContent = updatedContent.replace(kanbanBlockRegex, (match, blockContent) => {
			matchCount++;
			// Check if this is the block we're updating (compare normalized content)
			const normalizedBlock = blockContent.trim();
			const normalizedOriginal = originalSource.trim();
			
			// Determine if we should update this block
			// For new tasks (taskText === ""), always update the first block
			// For existing tasks, try to match by content first, but also check if the block contains the task
			// If we can't find a match, update the first block (most common case)
			const isNewTask = taskText === "";
			const matchesOriginal = normalizedBlock === normalizedOriginal;
			const isFirstBlock = matchCount === 1;
			
			// Check if this block contains the task we're updating (for status changes)
			let containsTask = false;
			if (taskText && !isNewTask) {
				try {
					const blockData = JSON.parse(normalizedBlock);
					const tasks = Array.isArray(blockData) ? blockData : (blockData.tasks || []);
					containsTask = tasks.some((t: any) => t.task === taskText);
					if (containsTask) {
						console.log("Kanban: Found task in block", matchCount, "task:", taskText);
					}
				} catch (e) {
					// If parsing fails, ignore
					console.warn("Kanban: Failed to parse block", matchCount, "for task matching:", e);
				}
			}
			
			const shouldUpdate = isNewTask ? isFirstBlock : 
			                     (matchesOriginal || containsTask || (isFirstBlock && !found));
			
			if (shouldUpdate) {
				console.log("Kanban: Will update block", matchCount, "isNewTask:", isNewTask, "matchesOriginal:", matchesOriginal, "containsTask:", containsTask);
				found = true;
				
				// Use the updated data from currentData (which already has the updated status)
				// This ensures we have all tasks with their current statuses
				const updatedData = currentData;
				
				// Generate new JSON string - preserve original format
				let newBlockContent: string;
				if (normalizedBlock.startsWith("[")) {
					// Original was array format
					newBlockContent = JSON.stringify(updatedData.tasks || [], null, 2);
				} else {
					// Original was object format - preserve columns if they exist
					newBlockContent = JSON.stringify(updatedData, null, 2);
				}
				
				console.log("Kanban: Updating kanban block with", updatedData.tasks?.length || 0, "tasks");
				console.log("Kanban: New block content:", newBlockContent);
				
				return `\`\`\`kanban\n${newBlockContent}\n\`\`\``;
			}
			
			return match;
		});

		if (found && updatedContent !== content) {
			await app.vault.modify(file as any, updatedContent);
			console.log("Kanban: Successfully updated kanban in file");
		} else if (!found) {
			console.warn("Kanban: Could not find matching kanban block to update");
		} else if (!updatedContent || updatedContent === content) {
			console.warn("Kanban: No changes detected in kanban block");
		}
	} catch (error) {
		console.error("Error updating kanban in file:", error);
	}
}

