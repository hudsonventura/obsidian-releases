import { Plugin, MarkdownPostProcessorContext, App, TFile, moment, Menu, MarkdownRenderer, Component, Modal } from "obsidian";
import { KanbanTask, KanbanData, KanbanStatus, TimerEntry, ColumnState, ColumnMetadata, KanbanView, SortField, SortOrder } from "../types";
import { TimerEntriesModal } from "./timer-modal";
import { AddTaskModal } from "./add-task-modal";
import { AddStatusModal } from "./add-status-modal";
import { EditStatusModal } from "./edit-status-modal";
import { EditTagsModal } from "./edit-tags-modal";
import { DueDateModal } from "./due-date-modal";
import { EditTargetTimeModal } from "./edit-target-time-modal";
import type KanbanPlugin from "../../main";
import type { KanbanPluginSettings } from "../../main";

const DEFAULT_COLUMNS: KanbanStatus[] = ["todo", "in progress", "done"];

// Map status to display name
function statusToDisplayName(status: KanbanStatus): string {
	const displayMap: Record<string, string> = {
		"todo": "To Do",
		"in progress": "In Progress",
		"done": "Done"
	};
	// Return mapped name or capitalize the custom status
	return displayMap[status] || status.charAt(0).toUpperCase() + status.slice(1);
}

// Timer helper functions
function getTaskTimerDuration(task: KanbanTask): number {
	if (!task.timerEntries || task.timerEntries.length === 0) {
		return 0;
	}
	
	let total = 0;
	for (const entry of task.timerEntries) {
		const startTime = moment(entry.startTime);
		const endTime = entry.endTime ? moment(entry.endTime) : moment();
		total += endTime.diff(startTime);
	}
	return total;
}

function isTaskTimerRunning(task: KanbanTask): boolean {
	if (!task.timerEntries || task.timerEntries.length === 0) {
		return false;
	}
	return task.timerEntries.some(entry => entry.endTime === null);
}

function formatTimerDuration(milliseconds: number): string {
	const duration = moment.duration(milliseconds);
	const hours = Math.floor(duration.asHours());
	const minutes = duration.minutes();
	const seconds = duration.seconds();
	
	if (hours > 0) {
		return `${hours}h ${minutes}m ${seconds}s`;
	} else if (minutes > 0) {
		return `${minutes}m ${seconds}s`;
	} else {
		return `${seconds}s`;
	}
}

function formatTimerDurationNoSeconds(milliseconds: number): string {
	const duration = moment.duration(milliseconds);
	const hours = Math.floor(duration.asHours());
	const minutes = duration.minutes();
	
	if (hours > 0) {
		return `${hours}h ${minutes}m`;
	} else if (minutes > 0) {
		return `${minutes}m`;
	} else {
		return `0m`;
	}
}

function parseTargetTime(targetTime: string | undefined): number {
	if (!targetTime) return 0;

	// Try parsing as date first
	const dateMatch = targetTime.match(/^\d{4}-\d{2}-\d{2}/);
	if (dateMatch) {
		const targetDate = moment(targetTime);
		if (targetDate.isValid()) {
			const now = moment();
			return Math.max(0, targetDate.diff(now));
		}
	}

	// Parse as duration (2h, 1d, etc.)
	const regex = /(?:(\d+)y)?(?:(\d+)M)?(?:(\d+)d)?(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s)?/;
	const match = targetTime.match(regex);
	if (!match) return 0;

	const years = parseInt(match[1] || "0");
	const months = parseInt(match[2] || "0");
	const days = parseInt(match[3] || "0");
	const hours = parseInt(match[4] || "0");
	const minutes = parseInt(match[5] || "0");
	const seconds = parseInt(match[6] || "0");

	return (
		(years * 365 * 24 * 60 * 60 +
			months * 30 * 24 * 60 * 60 +
			days * 24 * 60 * 60 +
			hours * 60 * 60 +
			minutes * 60 +
			seconds) *
		1000
	);
}

function startTaskTimer(task: KanbanTask): void {
	if (!task.timerEntries) {
		task.timerEntries = [];
	}
	task.timerEntries.push({
		startTime: moment().toISOString(),
		endTime: null
	});
}

function stopTaskTimer(task: KanbanTask): void {
	if (!task.timerEntries) return;
	
	const runningEntry = task.timerEntries.find(entry => entry.endTime === null);
	if (runningEntry) {
		runningEntry.endTime = moment().toISOString();
	}
}

function getProgressBarColor(percentage: number, settings: KanbanPluginSettings): string {
	if (percentage >= settings.progressBarRedThreshold) {
		return "red";
	} else if (percentage > settings.progressBarOrangeThreshold) {
		return "orange";
	} else if (percentage > settings.progressBarYellowThreshold) {
		return "yellow";
	} else {
		return "green";
	}
}

export function renderKanban(
	containerEl: HTMLElement, 
	data: KanbanData, 
	plugin: Plugin, 
	ctx: MarkdownPostProcessorContext,
	originalSource: string
) {
	console.log("Kanban Plugin: renderKanban called", { containerEl, data });
	
	// Get plugin settings
	const kanbanPlugin = plugin as KanbanPlugin;
	const settings = kanbanPlugin.settings;
	
	// Create a component for markdown rendering
	const component = new Component();
	component.load();
	
	// Clear the container
	containerEl.empty();
	containerEl.classList.add("kanban-container");
	
	// Ensure the container is visible
	containerEl.style.display = "block";
	containerEl.style.visibility = "visible";
	
	// Use custom columns if specified, otherwise use defaults
	const statusColumns: KanbanStatus[] = data.columns && data.columns.length > 0
		? data.columns
		: DEFAULT_COLUMNS;
	
	// Initialize column metadata with defaults if not present
	if (!data.columnMetadata || data.columnMetadata.length === 0) {
		data.columnMetadata = statusColumns.map(col => {
			// Set default states based on column name
			let state: ColumnState = "todo";
			if (col === "in progress" || col === "in-progress" || col === "doing") {
				state = "in-progress";
			} else if (col === "done" || col === "completed" || col === "complete") {
				state = "done";
			}
			return { name: col, state };
		});
	} else {
		// Ensure all columns have metadata
		statusColumns.forEach(col => {
			if (!data.columnMetadata!.find(m => m.name === col)) {
				data.columnMetadata!.push({ name: col, state: "todo" });
			}
		});
	}
	
	// Helper function to get column state
	const getColumnState = (status: KanbanStatus): ColumnState => {
		// Try exact match first, then case-insensitive match
		let metadata = data.columnMetadata?.find(m => m.name === status);
		if (!metadata) {
			metadata = data.columnMetadata?.find(m => m.name.toLowerCase() === status.toLowerCase());
		}
		return metadata?.state || "todo";
	};

	// Helper function to get column icon
	const getColumnIcon = (status: KanbanStatus): string => {
		// Try exact match first, then case-insensitive match
		let metadata = data.columnMetadata?.find(m => m.name === status);
		if (!metadata) {
			metadata = data.columnMetadata?.find(m => m.name.toLowerCase() === status.toLowerCase());
		}
		// Return custom icon if available
		if (metadata?.icon) {
			return metadata.icon + " ";
		}
		// Otherwise return state-based emoji
		const columnState = metadata?.state || getColumnState(status);
		if (columnState === "in-progress") {
			return "▶️ ";
		} else if (columnState === "done") {
			return "✅ ";
		}
		return "";
	};
	
	// Initialize view mode (default to horizontal)
	if (!data.view) {
		data.view = "horizontal";
	}
	
	// Initialize slim mode (default to false - Full View)
	if (data.slimMode === undefined) {
		data.slimMode = false;
	}
	
	// Group tasks by status
	const tasksByStatus = new Map<KanbanStatus, KanbanTask[]>();
	
	// Initialize all status columns
	statusColumns.forEach(status => tasksByStatus.set(status, []));
	
	// Assign tasks to status columns
	if (data.tasks) {
		data.tasks.forEach(task => {
			const status = task.status || "todo";
			// Try exact match first, then case-insensitive match
			let matchedStatus = statusColumns.find(col => col === status);
			if (!matchedStatus) {
				matchedStatus = statusColumns.find(col => col.toLowerCase() === status.toLowerCase());
			}
			const finalStatus = matchedStatus || status;
			
			const existing = tasksByStatus.get(finalStatus) || [];
			existing.push(task);
			tasksByStatus.set(finalStatus, existing);
		});
	}
	
	// Create header with buttons
	const headerEl = containerEl.createDiv("kanban-header");
	
	// View toggle button on the left
	const viewToggleButton = headerEl.createEl("button", { 
		cls: "kanban-view-toggle-button"
	});
	
	const updateViewButton = () => {
		if (data.view === "horizontal") {
			viewToggleButton.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="7" height="7"></rect><rect x="14" y="3" width="7" height="7"></rect><rect x="14" y="14" width="7" height="7"></rect><rect x="3" y="14" width="7" height="7"></rect></svg><span>Vertical View</span>`;
		} else if (data.view === "vertical") {
			viewToggleButton.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="4"></rect><rect x="3" y="10" width="18" height="4"></rect><rect x="3" y="17" width="18" height="4"></rect></svg><span>Table View</span>`;
		} else {
			viewToggleButton.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="3" y1="12" x2="21" y2="12"></line><line x1="3" y1="6" x2="21" y2="6"></line><line x1="3" y1="18" x2="21" y2="18"></line></svg><span>Horizontal View</span>`;
		}
	};
	updateViewButton();
	
	viewToggleButton.addEventListener("click", async () => {
		// Toggle view: horizontal -> vertical -> table -> horizontal
		if (data.view === "horizontal") {
			data.view = "vertical";
		} else if (data.view === "vertical") {
			data.view = "table";
		} else {
			data.view = "horizontal";
		}
		
		// Update button
		updateViewButton();
		
		// Update board classes
		boardEl.removeClass("kanban-board-horizontal", "kanban-board-vertical", "kanban-board-table");
		boardEl.addClass(`kanban-board-${data.view}`);
		
		// Save view preference
		await saveViewPreference();
		
		console.log("Kanban: View toggled to", data.view);
	});
	
	// Slim mode toggle button
	const slimModeButton = headerEl.createEl("button", { 
		cls: "kanban-slim-mode-button"
	});
	
	const updateSlimModeButton = () => {
		if (data.slimMode) {
			slimModeButton.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect><line x1="9" y1="3" x2="9" y2="21"></line></svg><span>Full View</span>`;
			containerEl.addClass("kanban-slim-mode");
		} else {
			slimModeButton.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect><line x1="3" y1="9" x2="21" y2="9"></line></svg><span>Slim Mode</span>`;
			containerEl.removeClass("kanban-slim-mode");
		}
	};
	updateSlimModeButton();
	
	slimModeButton.addEventListener("click", async () => {
		// Toggle slim mode
		data.slimMode = !data.slimMode;
		
		// Update button and container class
		updateSlimModeButton();
		
		// Save slim mode preference
		await saveSlimModePreference();
		
		console.log("Kanban: Slim mode toggled to", data.slimMode);
	});
	
	// Filter input
	const filterContainer = headerEl.createDiv("kanban-filter-container");
	const filterIcon = filterContainer.createEl("span", { 
		cls: "kanban-filter-icon",
		text: "🔍"
	});
	const filterInput = filterContainer.createEl("input", {
		cls: "kanban-filter-input",
		attr: {
			type: "text",
			placeholder: "Filter tasks...",
			"aria-label": "Filter tasks"
		}
	});
	
	// Filter state
	let filterText = "";
	
	// Filter input handler
	filterInput.addEventListener("input", () => {
		filterText = filterInput.value.toLowerCase().trim();
		applyFilter();
	});
	
	// Function to apply filter
	const applyFilter = () => {
		const allTaskElements = containerEl.querySelectorAll(".kanban-task, .kanban-table-row");
		
		allTaskElements.forEach((taskEl) => {
			const taskElement = taskEl as HTMLElement;
			const taskTitle = taskElement.getAttribute("data-task-title")?.toLowerCase() || "";
			
			if (filterText === "" || taskTitle.includes(filterText)) {
				taskElement.style.display = "";
			} else {
				taskElement.style.display = "none";
			}
		});
	};
	
	const addStatusButton = headerEl.createEl("button", { 
		cls: "kanban-add-status-button",
		text: "+ Add Status"
	});
	const addTaskButton = headerEl.createEl("button", { 
		cls: "kanban-add-task-button",
		text: "+ Add Task"
	});
	
	// Create kanban board
	const boardEl = containerEl.createDiv("kanban-board");
	
	// Apply view class
	boardEl.addClass(`kanban-board-${data.view}`);
	
	// Create columns
	const columnElements = new Map<KanbanStatus, HTMLElement>();
	const taskElements = new Map<HTMLElement, { task: KanbanTask; status: KanbanStatus }>();
	
	// Function to create a task element
	function createTaskElement(task: KanbanTask, status: KanbanStatus, tasksContainer: HTMLElement): HTMLElement {
		const taskEl = tasksContainer.createDiv("kanban-task");
		taskEl.setAttr("draggable", "true");
		taskEl.setAttr("data-task", task.task);
		taskEl.setAttr("data-task-title", task.task); // For filtering
		taskEl.setAttr("data-status", status);
		taskEl.classList.add("kanban-task-draggable");
		
		// Task header with content and copy button
		const taskHeader = taskEl.createDiv("kanban-task-header");
		const taskContent = taskHeader.createDiv("kanban-task-content");
		
		// Copy button
		const copyBtn = taskHeader.createEl("button", {
			cls: "kanban-task-copy-btn"
		});
		copyBtn.setAttribute("aria-label", "Copy task title");
		
		// Copy icon
		const copyIcon = document.createElementNS("http://www.w3.org/2000/svg", "svg");
		copyIcon.setAttribute("xmlns", "http://www.w3.org/2000/svg");
		copyIcon.setAttribute("width", "14");
		copyIcon.setAttribute("height", "14");
		copyIcon.setAttribute("viewBox", "0 0 24 24");
		copyIcon.setAttribute("fill", "none");
		copyIcon.setAttribute("stroke", "currentColor");
		copyIcon.setAttribute("stroke-width", "2");
		copyIcon.setAttribute("stroke-linecap", "round");
		copyIcon.setAttribute("stroke-linejoin", "round");
		copyIcon.innerHTML = '<rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>';
		copyBtn.appendChild(copyIcon);
		
		// Copy button click handler
		copyBtn.addEventListener("click", async (e) => {
			e.stopPropagation();
			
			// Convert markdown to plain text
			const plainText = task.task
				// Remove markdown links [text](url) -> text
				.replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
				// Remove bold **text** -> text
				.replace(/\*\*([^*]+)\*\*/g, '$1')
				// Remove italic *text* -> text
				.replace(/\*([^*]+)\*/g, '$1')
				// Remove inline code `code` -> code
				.replace(/`([^`]+)`/g, '$1')
				// Remove strikethrough ~~text~~ -> text
				.replace(/~~([^~]+)~~/g, '$1');
			
			try {
				await navigator.clipboard.writeText(plainText);
				
				// Visual feedback - change icon temporarily
				copyIcon.innerHTML = '<polyline points="20 6 9 17 4 12"></polyline>'; // Check mark
				copyBtn.addClass("kanban-task-copy-btn-success");
				
				setTimeout(() => {
					copyIcon.innerHTML = '<rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>';
					copyBtn.removeClass("kanban-task-copy-btn-success");
				}, 1500);
				
			console.log("Kanban: Copied task title:", plainText);
		} catch (err) {
			console.error("Kanban: Failed to copy task title:", err);
		}
	});
	
	// Render task name as markdown to support links
		MarkdownRenderer.render(
			plugin.app,
			task.task,
			taskContent,
			ctx.sourcePath,
			component
		).then(() => {
			// Remove wrapping paragraph if present
			const paragraph = taskContent.querySelector("p");
			if (paragraph) {
				while (paragraph.firstChild) {
					taskContent.appendChild(paragraph.firstChild);
				}
				paragraph.remove();
			}
		});
		
		// First row: Update datetime and timer controls
		const updateDateTimeRow = taskEl.createDiv("kanban-task-datetime-row");
		
		// Update DateTime display on the left
		const updateDateTimeEl = updateDateTimeRow.createDiv("kanban-task-update-datetime");
		
		const updateIcon = document.createElementNS("http://www.w3.org/2000/svg", "svg");
		updateIcon.setAttribute("xmlns", "http://www.w3.org/2000/svg");
		updateIcon.setAttribute("width", "12");
		updateIcon.setAttribute("height", "12");
		updateIcon.setAttribute("viewBox", "0 0 24 24");
		updateIcon.setAttribute("fill", "none");
		updateIcon.setAttribute("stroke", "currentColor");
		updateIcon.setAttribute("stroke-width", "2");
		updateIcon.setAttribute("stroke-linecap", "round");
		updateIcon.setAttribute("stroke-linejoin", "round");
		updateIcon.innerHTML = '<polyline points="23 4 23 10 17 10"></polyline><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"></path>';
		updateDateTimeEl.appendChild(updateIcon);
		
		const updateDateTimeText = updateDateTimeEl.createSpan({ cls: "kanban-update-datetime-text" });
		
		function updateUpdateDateTimeDisplay() {
		if (task.updateDateTime) {
			const updateDate = moment(task.updateDateTime);
			const formattedDate = updateDate.format("ddd, YYYY-MM-DD HH:mm");
			updateDateTimeText.setText(formattedDate);
			updateDateTimeText.removeClass("kanban-update-datetime-empty");
			} else {
				updateDateTimeText.setText("Not updated");
				updateDateTimeText.addClass("kanban-update-datetime-empty");
			}
		}
		
		// Initial update datetime display
		updateUpdateDateTimeDisplay();
		
		// Store update function for external calls
		(taskEl as any).updateUpdateDateTimeDisplay = updateUpdateDateTimeDisplay;
		
		// Timer buttons on the same row (right side)
		const timerButtons = updateDateTimeRow.createDiv("kanban-timer-buttons");
		
		// Start button
		const startButton = timerButtons.createEl("button", {
			cls: "kanban-timer-button kanban-timer-start",
			attr: { "aria-label": "Start timer" }
		});
		startButton.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="5 3 19 12 5 21 5 3"></polygon></svg>`;
		
		// Stop button
		const stopButton = timerButtons.createEl("button", {
			cls: "kanban-timer-button kanban-timer-stop",
			attr: { "aria-label": "Stop timer" }
		});
		stopButton.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect></svg>`;
		
		// Second row: Target time and due date
		const targetTimeRow = taskEl.createDiv("kanban-task-target-time-row");
		
		// Target time display on the left
		const targetTimeEl = targetTimeRow.createDiv("kanban-task-target-time");
		const clockIcon = document.createElementNS("http://www.w3.org/2000/svg", "svg");
		clockIcon.setAttribute("xmlns", "http://www.w3.org/2000/svg");
		clockIcon.setAttribute("width", "14");
		clockIcon.setAttribute("height", "14");
		clockIcon.setAttribute("viewBox", "0 0 24 24");
		clockIcon.setAttribute("fill", "none");
		clockIcon.setAttribute("stroke", "currentColor");
		clockIcon.setAttribute("stroke-width", "2");
		clockIcon.setAttribute("stroke-linecap", "round");
		clockIcon.setAttribute("stroke-linejoin", "round");
		clockIcon.innerHTML = '<circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline>';
		targetTimeEl.appendChild(clockIcon);
		
		const targetTimeText = targetTimeEl.createSpan({ 
			text: task.targetTime || "No target time", 
			cls: "kanban-target-time-text" 
		});
		
		if (!task.targetTime) {
			targetTimeText.addClass("kanban-target-time-empty");
		}
		
		// Due date display on the right
		const dueDateEl = targetTimeRow.createDiv("kanban-task-due-date");
		
		const calendarIcon = document.createElementNS("http://www.w3.org/2000/svg", "svg");
		calendarIcon.setAttribute("xmlns", "http://www.w3.org/2000/svg");
		calendarIcon.setAttribute("width", "12");
		calendarIcon.setAttribute("height", "12");
		calendarIcon.setAttribute("viewBox", "0 0 24 24");
		calendarIcon.setAttribute("fill", "none");
		calendarIcon.setAttribute("stroke", "currentColor");
		calendarIcon.setAttribute("stroke-width", "2");
		calendarIcon.setAttribute("stroke-linecap", "round");
		calendarIcon.setAttribute("stroke-linejoin", "round");
		calendarIcon.innerHTML = '<rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect><line x1="16" y1="2" x2="16" y2="6"></line><line x1="8" y1="2" x2="8" y2="6"></line><line x1="3" y1="10" x2="21" y2="10"></line>';
		dueDateEl.appendChild(calendarIcon);
		
		const dueDateText = dueDateEl.createSpan({ cls: "kanban-due-date-text" });
		
		function updateDueDateDisplay() {
			if (task.dueDate) {
				const dueDate = moment(task.dueDate);
				const now = moment();
			
			// Format the date/time
			const formattedDate = dueDate.format("ddd, YYYY-MM-DD HH:mm");
			dueDateText.setText(formattedDate);
			dueDateText.removeClass("kanban-due-date-empty", "kanban-due-date-overdue", "kanban-due-date-soon", "kanban-due-date-future");
				
				// Add class based on due date status
				if (dueDate.isBefore(now)) {
					dueDateText.addClass("kanban-due-date-overdue");
				} else if (dueDate.diff(now, "hours") <= 24) {
					dueDateText.addClass("kanban-due-date-soon");
				} else {
					dueDateText.addClass("kanban-due-date-future");
				}
			} else {
				dueDateText.setText("No due date");
				dueDateText.addClass("kanban-due-date-empty");
				dueDateText.removeClass("kanban-due-date-overdue", "kanban-due-date-soon", "kanban-due-date-future");
			}
		}
		
		// Initial due date display
		updateDueDateDisplay();
		
		// Store update function for external calls
		(taskEl as any).updateDueDateDisplay = updateDueDateDisplay;
		
		// Double-click to edit due date
		dueDateEl.addEventListener("dblclick", (e) => {
			e.stopPropagation();
			
			// Open calendar modal
			const modal = new DueDateModal(
				plugin.app,
				task.dueDate,
				async (newDate) => {
					if (newDate === null) {
						// Clear due date
						task.dueDate = undefined;
					} else {
						// Set new due date
						task.dueDate = newDate;
					}
					
					// Update display
					updateDueDateDisplay();
					
					// Save to file
					await saveTasksToFile(task.task);
					console.log("Kanban: Due date updated:", task.dueDate);
				}
			);
			modal.open();
		});
		
		// Double-click to edit target time
		let isEditingTargetTime = false;
		targetTimeEl.addEventListener("dblclick", (e) => {
			e.stopPropagation();
			if (isEditingTargetTime) return;
			
			isEditingTargetTime = true;
			const currentTargetTime = task.targetTime || "";
			
			// Create input field
			const input = targetTimeText.createEl("input", {
				type: "text",
				cls: "kanban-task-edit-input kanban-target-time-edit-input",
				value: currentTargetTime
			});
			
			// Clear the content and add input
			targetTimeText.empty();
			targetTimeText.appendChild(input);
			
			// Focus and select text
			input.focus();
			input.select();
			
			// Disable dragging while editing
			taskEl.setAttr("draggable", "false");
			taskEl.classList.remove("kanban-task-draggable");
			
			// Function to save changes
			const saveEdit = async () => {
				if (!isEditingTargetTime) return;
				
				const newTargetTime = input.value.trim();
				
				// Restore content
				targetTimeText.empty();
				
				// Update task
				if (newTargetTime) {
					task.targetTime = newTargetTime;
					targetTimeText.setText(newTargetTime);
					targetTimeText.removeClass("kanban-target-time-empty");
				} else {
					task.targetTime = undefined;
					targetTimeText.setText("No target time");
					targetTimeText.addClass("kanban-target-time-empty");
				}
				
				// Re-enable dragging
				taskEl.setAttr("draggable", "true");
				taskEl.classList.add("kanban-task-draggable");
				isEditingTargetTime = false;
				
				// Save to file
				await saveTasksToFile(task.task);
				console.log("Kanban: Target time updated:", task.targetTime);
			};
			
			// Function to cancel edit
			const cancelEdit = () => {
				if (!isEditingTargetTime) return;
				
				targetTimeText.empty();
				targetTimeText.setText(currentTargetTime || "No target time");
				
				if (!currentTargetTime) {
					targetTimeText.addClass("kanban-target-time-empty");
				}
				
				// Re-enable dragging
				taskEl.setAttr("draggable", "true");
				taskEl.classList.add("kanban-task-draggable");
				isEditingTargetTime = false;
			};
			
			// Save on Enter
			input.addEventListener("keydown", async (e: KeyboardEvent) => {
				if (e.key === "Enter") {
					e.preventDefault();
					await saveEdit();
				} else if (e.key === "Escape") {
					e.preventDefault();
					await cancelEdit();
				}
			});
			
			// Save on blur (click outside)
			input.addEventListener("blur", async () => {
				// Small delay to allow other click events to process
				setTimeout(async () => {
					if (isEditingTargetTime) {
						await saveEdit();
					}
				}, 100);
			});
		});
		
		// Progress bar (only if target time exists)
		let progressContainer: HTMLElement | undefined;
		let progressFill: HTMLElement | undefined;
		let progressText: HTMLElement | undefined;
		
		function updateProgressBar() {
			if (!progressFill || !progressText) return;
			
			const totalDuration = getTaskTimerDuration(task);
			const isRunning = isTaskTimerRunning(task);
			
			if (task.targetTime) {
				// Has target time - show progress bar with percentage
				const targetDuration = parseTargetTime(task.targetTime);
				
				if (targetDuration > 0) {
					const percentage = (totalDuration / targetDuration) * 100;
					const displayPercentage = Math.min(100, percentage);
					
					progressFill.setCssStyles({ width: `${displayPercentage}%` });
					progressFill.style.display = "block";
					
					// Remove all color classes
					progressFill.removeClass("kanban-progress-green");
					progressFill.removeClass("kanban-progress-yellow");
					progressFill.removeClass("kanban-progress-orange");
					progressFill.removeClass("kanban-progress-red");
					progressText.removeClass("kanban-progress-text-green");
					progressText.removeClass("kanban-progress-text-yellow");
					progressText.removeClass("kanban-progress-text-orange");
					progressText.removeClass("kanban-progress-text-red");
					
				// Add appropriate color class based on percentage and settings
				const colorClass = getProgressBarColor(percentage, settings);
				
				progressFill.addClass(`kanban-progress-${colorClass}`);
				progressText.addClass(`kanban-progress-text-${colorClass}`);
					
					// Add running indicator
					if (isRunning) {
						progressFill.addClass("kanban-progress-running");
					} else {
						progressFill.removeClass("kanban-progress-running");
					}
					
					// Format the text
					const runningText = isRunning ? " ● RUNNING" : "";
					progressText.setText(`${formatTimerDuration(totalDuration)} / ${task.targetTime} (${percentage.toFixed(1)}%)${runningText}`);
					
					if (isRunning) {
						progressText.addClass("kanban-progress-text-running");
					} else {
						progressText.removeClass("kanban-progress-text-running");
					}
				}
			} else {
				// No target time - just show time spent without bar fill
				progressFill.style.display = "none";
				
				// Remove all color classes
				progressText.removeClass("kanban-progress-text-green");
				progressText.removeClass("kanban-progress-text-yellow");
				progressText.removeClass("kanban-progress-text-orange");
				progressText.removeClass("kanban-progress-text-red");
				
				// Format the text - just time spent
				const runningText = isRunning ? " ● RUNNING" : "";
				progressText.setText(`${formatTimerDuration(totalDuration)}${runningText}`);
				
				if (isRunning) {
					progressText.addClass("kanban-progress-text-running");
				} else {
					progressText.removeClass("kanban-progress-text-running");
				}
			}
		}
		
		// Update timer display and button states
		function updateTimerDisplay() {
			const isRunning = isTaskTimerRunning(task);
			
			// Update button states
			if (isRunning) {
				startButton.disabled = true;
				stopButton.disabled = false;
				startButton.addClass("kanban-timer-button-disabled");
				stopButton.removeClass("kanban-timer-button-disabled");
				taskEl.addClass("kanban-task-timer-running");
			} else {
				startButton.disabled = false;
				stopButton.disabled = true;
				startButton.removeClass("kanban-timer-button-disabled");
				stopButton.addClass("kanban-timer-button-disabled");
				taskEl.removeClass("kanban-task-timer-running");
			}
			
			// Update progress bar if it exists
			updateProgressBar();
		}
		
		// Start button click handler
		startButton.addEventListener("click", async (e) => {
			e.stopPropagation();
			
			// Stop all other running timers in this kanban board
			taskElements.forEach((info, otherTaskEl) => {
				if (info.task !== task && isTaskTimerRunning(info.task)) {
					stopTaskTimer(info.task);
					// Update the display for the stopped task
					const updateFn = (otherTaskEl as any).updateTimerDisplay;
					if (updateFn) {
						updateFn();
					}
					console.log("Kanban: Auto-stopped timer for task:", info.task.task);
				}
			});
			
			// Start the timer for this task
			startTaskTimer(task);
			updateTimerDisplay();
			
			// Save all changes to file
			await saveTasksToFile(task.task);
		});
		
		// Stop button click handler
		stopButton.addEventListener("click", async (e) => {
			e.stopPropagation();
			stopTaskTimer(task);
			updateTimerDisplay();
			await saveTasksToFile(task.task);
		});
		
		// Initial display update
		updateTimerDisplay();
		
		// Store update function for interval
		(taskEl as any).updateTimerDisplay = updateTimerDisplay;
		
		// Progress bar at the bottom (always visible)
		progressContainer = taskEl.createDiv("kanban-progress-container");
		const progressBar = progressContainer.createDiv("kanban-progress-bar");
		progressFill = progressBar.createDiv("kanban-progress-fill");
		progressText = progressContainer.createDiv("kanban-progress-text");
		
		// Initial update
		updateProgressBar();
		
		// Tags section (below progress bar)
		const tagsContainer = taskEl.createDiv("kanban-task-tags");
		
		function updateTagsDisplay() {
			tagsContainer.empty();
			
			if (task.tags && task.tags.length > 0) {
				task.tags.forEach(tag => {
					const tagEl = tagsContainer.createSpan("kanban-tag");
					tagEl.setText(tag);
				});
			}
		}
		
		// Initial tags display
		updateTagsDisplay();
		
        // Double-click to edit task name
        let isEditing = false;
        taskContent.addEventListener("dblclick", (e) => {
            e.stopPropagation();
            if (isEditing) return;
            
            isEditing = true;
            const currentText = task.task;
            
            // Create input for editing
            const input = taskContent.createEl("input", {
                type: "text",
                cls: "kanban-task-edit-input",
                value: currentText
            });
            
            // Clear the content and add input
            taskContent.empty();
            taskContent.appendChild(input);
            
            // Focus and select text
            input.focus();
            input.select();
            
            // Disable dragging while editing
            taskEl.setAttr("draggable", "false");
            taskEl.classList.remove("kanban-task-draggable");
            
            // Function to save changes
            const saveEdit = async () => {
                if (!isEditing) return;
                
                const newText = input.value.trim();
                
                // Restore content
                taskContent.empty();
                
                if (newText && newText !== currentText) {
                    // Check if task with same name already exists
                    const taskExists = Array.from(taskElements.values()).some(
                        info => info.task !== task && info.task.task === newText
                    );
                    
                    if (taskExists) {
                        // Task name already exists, revert
                        await MarkdownRenderer.render(plugin.app, currentText, taskContent, ctx.sourcePath, component);
                        const paragraph = taskContent.querySelector("p");
                        if (paragraph) {
                            while (paragraph.firstChild) {
                                taskContent.appendChild(paragraph.firstChild);
                            }
                            paragraph.remove();
                        }
                        console.warn("Kanban: Task with that name already exists");
                    } else {
                        // Update task name
                        const oldTaskName = task.task;
                        task.task = newText;
                        await MarkdownRenderer.render(plugin.app, newText, taskContent, ctx.sourcePath, component);
                        const paragraph = taskContent.querySelector("p");
                        if (paragraph) {
                            while (paragraph.firstChild) {
                                taskContent.appendChild(paragraph.firstChild);
                            }
                            paragraph.remove();
                        }
                        taskEl.setAttr("data-task", newText);
                        
                        // Save to file
                        await saveTasksToFile(oldTaskName);
                        console.log("Kanban: Task renamed from", oldTaskName, "to", newText);
                    }
                } else {
                    // No change or empty, revert
                    await MarkdownRenderer.render(plugin.app, currentText, taskContent, ctx.sourcePath, component);
                    const paragraph = taskContent.querySelector("p");
                    if (paragraph) {
                        while (paragraph.firstChild) {
                            taskContent.appendChild(paragraph.firstChild);
                        }
                        paragraph.remove();
                    }
                }
                
                // Re-enable dragging
                taskEl.setAttr("draggable", "true");
                taskEl.classList.add("kanban-task-draggable");
                isEditing = false;
            };
            
            // Function to cancel edit
            const cancelEdit = async () => {
                if (!isEditing) return;
                
                taskContent.empty();
                await MarkdownRenderer.render(plugin.app, currentText, taskContent, ctx.sourcePath, component);
                const paragraph = taskContent.querySelector("p");
                if (paragraph) {
                    while (paragraph.firstChild) {
                        taskContent.appendChild(paragraph.firstChild);
                    }
                    paragraph.remove();
                }
                
                // Re-enable dragging
                taskEl.setAttr("draggable", "true");
                taskEl.classList.add("kanban-task-draggable");
                isEditing = false;
            };
            
            // Handle keyboard shortcuts
            input.addEventListener("keydown", async (e: KeyboardEvent) => {
                if (e.key === "Enter") {
                    e.preventDefault();
                    await saveEdit();
                } else if (e.key === "Escape") {
                    e.preventDefault();
                    await cancelEdit();
                }
            });
            
            // Save on blur (click outside)
            input.addEventListener("blur", async () => {
                // Small delay to allow other click events to process
                setTimeout(async () => {
                    if (isEditing) {
                        await saveEdit();
                    }
                }, 100);
            });
        });
		
		// Right-click context menu
		taskEl.addEventListener("contextmenu", (e) => {
			e.preventDefault();
			e.stopPropagation();
			
			const menu = new Menu();
			
			// Edit Timer Entries option
			menu.addItem((item) => {
				item
					.setTitle("Edit Timer Entries")
					.setIcon("clock")
					.onClick(() => {
						const modal = new TimerEntriesModal(
							plugin.app,
							task.task,
							task.timerEntries || [],
							async (updatedEntries) => {
								// Update task with new entries
								task.timerEntries = updatedEntries.length > 0 ? updatedEntries : undefined;
								
								// Update display
								updateTimerDisplay();
								
								// Save to file
								await saveTasksToFile(task.task);
								
								console.log("Kanban: Timer entries updated for task:", task.task);
							}
						);
						modal.open();
					});
			});
			
		// Edit Tags option
		menu.addItem((item) => {
			item
				.setTitle("Edit Tags")
				.setIcon("tag")
				.onClick(() => {
					const modal = new EditTagsModal(
						plugin.app,
						task.tags || [],
						async (tagsArray) => {
							if (tagsArray === null) return; // User cancelled
							
							// Update task tags
							task.tags = tagsArray.length > 0 ? tagsArray : undefined;
							
							// Update display
							updateTagsDisplay();
							
							// Save to file
							await saveTasksToFile(task.task);
							
							console.log("Kanban: Tags updated for task:", task.task, "New tags:", task.tags);
						}
					);
					modal.open();
				});
		});
		
		// Edit Target Time option
		menu.addItem((item) => {
			item
				.setTitle("Edit Target Time")
				.setIcon("target")
				.onClick(() => {
					const modal = new EditTargetTimeModal(
						plugin.app,
						task.targetTime,
						async (newTargetTime) => {
							if (newTargetTime === null) return; // User cancelled
							
							// Update task target time
							if (newTargetTime === "") {
								task.targetTime = undefined;
							} else {
								task.targetTime = newTargetTime;
							}
							
							// Update the display
							updateProgressBar();
							
							// Save to file
							await saveTasksToFile(task.task);
							
							console.log("Kanban: Target time updated for task:", task.task, "New target:", task.targetTime);
						}
					);
					modal.open();
				});
		});
		
		// Duplicate and Delete options
		menu.addSeparator();
		
		// Duplicate Task option
		menu.addItem((item) => {
			item
				.setTitle("Duplicate Task")
				.setIcon("copy")
				.onClick(async () => {
					// Create a deep copy of the task
					const duplicatedTask: KanbanTask = {
						task: task.task,
						status: task.status,
						targetTime: task.targetTime,
						tags: task.tags ? [...task.tags] : undefined,
						timerEntries: task.timerEntries ? task.timerEntries.map(entry => ({ ...entry })) : undefined,
						dueDate: task.dueDate,
						updateDateTime: moment().toISOString() // Set current time for the duplicate
					};
					
					// Add to tasksByStatus
					const statusTasks = tasksByStatus.get(status) || [];
					statusTasks.push(duplicatedTask);
					tasksByStatus.set(status, statusTasks);
					
					// Find the parent container to add the new task element
					const parentContainer = taskEl.parentElement;
					if (parentContainer) {
						// Create the task element
						createTaskElement(duplicatedTask, status, parentContainer);
					}
					
					// Save to file
					await saveTasksToFile();
					
					console.log("Kanban: Duplicated task:", task.task);
				});
		});
		
		// Delete Task option
		menu.addItem((item) => {
			item
				.setTitle("Delete Task")
				.setIcon("trash")
				.onClick(async () => {
					// Remove from taskElements
					taskElements.delete(taskEl);
					
					// Remove from DOM
					taskEl.remove();
					
					// Save to file
					await saveTasksToFile();
					
					console.log("Kanban: Deleted task:", task.task);
				});
		});
			
			menu.showAtMouseEvent(e);
		});
		
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
			const taskData: KanbanTask = { 
				task: info.task.task, 
				status: info.status
			};
			
			// Include target time if it exists
			if (info.task.targetTime) {
				taskData.targetTime = info.task.targetTime;
			}
			
			// Include timer entries if they exist
			if (info.task.timerEntries && info.task.timerEntries.length > 0) {
				taskData.timerEntries = info.task.timerEntries;
			}
			
			// Include tags if they exist
			if (info.task.tags && info.task.tags.length > 0) {
				taskData.tags = info.task.tags;
			}
			
			// Include due date if it exists
			if (info.task.dueDate) {
				taskData.dueDate = info.task.dueDate;
			}
			
			// Include update datetime if it exists
			if (info.task.updateDateTime) {
				taskData.updateDateTime = info.task.updateDateTime;
			}
			
			allTasks.push(taskData);
		});
		
		console.log("Kanban: Saving tasks to file. Total tasks:", allTasks.length);
		console.log("Kanban: Tasks to save:", allTasks);
		if (updatedTaskText) {
			console.log("Kanban: Updated task:", updatedTaskText);
		}
		
		await updateKanbanInFile(plugin.app, ctx, updatedTaskText || "", "todo" as KanbanStatus, originalSource, { 
			tasks: allTasks, 
			columns: data.columns,
			columnMetadata: data.columnMetadata,
			collapsedColumns: data.collapsedColumns,
			view: data.view,
			slimMode: data.slimMode
		}).catch(err => {
			console.error("Error saving tasks to file:", err);
		});
	}
	
	async function saveCollapsedState() {
		const allTasks: KanbanTask[] = [];
		taskElements.forEach((info) => {
			const taskData: KanbanTask = { 
				task: info.task.task, 
				status: info.status
			};
			
			// Include target time if it exists
			if (info.task.targetTime) {
				taskData.targetTime = info.task.targetTime;
			}
			
			// Include timer entries if they exist
			if (info.task.timerEntries && info.task.timerEntries.length > 0) {
				taskData.timerEntries = info.task.timerEntries;
			}
			
			// Include tags if they exist
			if (info.task.tags && info.task.tags.length > 0) {
				taskData.tags = info.task.tags;
			}
			
			// Include due date if it exists
			if (info.task.dueDate) {
				taskData.dueDate = info.task.dueDate;
			}
			
			// Include update datetime if it exists
			if (info.task.updateDateTime) {
				taskData.updateDateTime = info.task.updateDateTime;
			}
			
			allTasks.push(taskData);
		});
		
		console.log("Kanban: Saving collapsed state:", data.collapsedColumns);
		console.log("Kanban: Saving column metadata:", data.columnMetadata);
		
		await updateKanbanInFile(plugin.app, ctx, "", "todo" as KanbanStatus, originalSource, { 
			tasks: allTasks, 
			columns: data.columns,
			columnMetadata: data.columnMetadata,
			collapsedColumns: data.collapsedColumns,
			view: data.view,
			slimMode: data.slimMode
		}).catch(err => {
			console.error("Error saving collapsed state to file:", err);
		});
	}
	
	async function saveViewPreference() {
		const allTasks: KanbanTask[] = [];
		taskElements.forEach((info) => {
			const taskData: KanbanTask = { 
				task: info.task.task, 
				status: info.status
			};
			
			// Include target time if it exists
			if (info.task.targetTime) {
				taskData.targetTime = info.task.targetTime;
			}
			
			// Include timer entries if they exist
			if (info.task.timerEntries && info.task.timerEntries.length > 0) {
				taskData.timerEntries = info.task.timerEntries;
			}
			
			// Include tags if they exist
			if (info.task.tags && info.task.tags.length > 0) {
				taskData.tags = info.task.tags;
			}
			
			// Include due date if it exists
			if (info.task.dueDate) {
				taskData.dueDate = info.task.dueDate;
			}
			
			// Include update datetime if it exists
			if (info.task.updateDateTime) {
				taskData.updateDateTime = info.task.updateDateTime;
			}
			
			allTasks.push(taskData);
		});
		
		console.log("Kanban: Saving view preference:", data.view);
		
		await updateKanbanInFile(plugin.app, ctx, "", "todo" as KanbanStatus, originalSource, { 
			tasks: allTasks, 
			columns: data.columns,
			columnMetadata: data.columnMetadata,
			collapsedColumns: data.collapsedColumns,
			view: data.view,
			slimMode: data.slimMode
		}).catch(err => {
			console.error("Error saving view preference to file:", err);
		});
	}
	
	async function saveSlimModePreference() {
		const allTasks: KanbanTask[] = [];
		taskElements.forEach((info) => {
			const taskData: KanbanTask = { 
				task: info.task.task, 
				status: info.status
			};
			
			// Include target time if it exists
			if (info.task.targetTime) {
				taskData.targetTime = info.task.targetTime;
			}
			
			// Include timer entries if they exist
			if (info.task.timerEntries && info.task.timerEntries.length > 0) {
				taskData.timerEntries = info.task.timerEntries;
			}
			
			// Include tags if they exist
			if (info.task.tags && info.task.tags.length > 0) {
				taskData.tags = info.task.tags;
			}
			
			// Include due date if it exists
			if (info.task.dueDate) {
				taskData.dueDate = info.task.dueDate;
			}
			
			// Include update datetime if it exists
			if (info.task.updateDateTime) {
				taskData.updateDateTime = info.task.updateDateTime;
			}
			
			allTasks.push(taskData);
		});
		
		console.log("Kanban: Saving slim mode preference:", data.slimMode);
		
		await updateKanbanInFile(plugin.app, ctx, "", "todo" as KanbanStatus, originalSource, { 
			tasks: allTasks, 
			columns: data.columns,
			columnMetadata: data.columnMetadata,
			collapsedColumns: data.collapsedColumns,
			view: data.view,
			slimMode: data.slimMode
		}).catch(err => {
			console.error("Error saving slim mode preference to file:", err);
		});
	}
	
	// Add status button handler - opens modal
	addStatusButton.addEventListener("click", () => {
		const modal = new AddStatusModal(plugin.app, statusColumns, async (newStatus, statusType, icon) => {
			if (!newStatus || !statusType) return; // User cancelled
			
			// Add the new status to the columns array
			if (!data.columns || data.columns.length === 0) {
				// Initialize with current columns (including any existing ones)
				data.columns = [...statusColumns];
			}
			
			// Add the new status
			data.columns.push(newStatus);
			
			// Initialize columnMetadata if it doesn't exist
			if (!data.columnMetadata) {
				data.columnMetadata = [];
			}
			
			// Add metadata for the new status column
			const metadata: ColumnMetadata = {
				name: newStatus,
				state: statusType
			};
			if (icon) {
				metadata.icon = icon;
			}
			data.columnMetadata.push(metadata);
			
			console.log("Kanban: Adding new status column:", newStatus, "with type:", statusType, "and icon:", icon);
			console.log("Kanban: Current columns:", data.columns);
			
			// Save to file to persist the new column
			await updateKanbanInFile(plugin.app, ctx, "", "todo", originalSource, data).catch(err => {
				console.error("Error saving new status column:", err);
			});
		});
		modal.open();
	});
	
	// Add task button handler - opens modal
	addTaskButton.addEventListener("click", () => {
		const modal = new AddTaskModal(plugin.app, async (newTask) => {
			if (!newTask) return; // User cancelled
			
			// Check if task already exists
			const taskExists = Array.from(taskElements.values()).some(
				info => info.task.task === newTask.task
			);
			
			if (taskExists) {
				console.warn("Kanban: Task already exists:", newTask.task);
				return;
			}
			
		// Find the first column with state "todo", otherwise use first available column
		const firstStatus = statusColumns[0];
		let targetStatus: KanbanStatus = firstStatus;
		
		// Look for the first column with state "todo"
		for (const status of statusColumns) {
			const columnState = getColumnState(status);
			if (columnState === "todo") {
				targetStatus = status;
				break;
			}
		}
		
		// If no column has state "todo", use the first column
		if (!targetStatus && firstStatus) {
			targetStatus = firstStatus;
		}
		
		if (!targetStatus) {
			console.error("Kanban: Could not find any status to add task");
			return;
		}
		
		// Set the task status
		newTask.status = targetStatus;
		
		// Handle different view modes
		if (data.view === "table") {
			// For table view, add task to tasksByStatus and re-render
			const tasks = tasksByStatus.get(targetStatus) || [];
			tasks.push(newTask);
			tasksByStatus.set(targetStatus, tasks);
			
			// Re-render table view
			renderTableView();
			setTimeout(() => applyFilter(), 0);
		} else {
			// For kanban view (horizontal/vertical), find the column element
			const targetColumn = columnElements.get(targetStatus);
			if (!targetColumn) {
				console.error("Kanban: Could not find column element for status:", targetStatus);
				return;
			}
			
			const tasksContainer = targetColumn.querySelector(".kanban-column-tasks") as HTMLElement;
			if (!tasksContainer) {
				console.error("Kanban: Could not find tasks container in column");
				return;
			}
			
			// Create and add the task element
			const taskEl = createTaskElement(newTask, targetStatus, tasksContainer);
			
			// Verify the task was added to the map
			if (!taskElements.has(taskEl)) {
				console.error("Kanban: Failed to add task to taskElements map");
				return;
			}
		}
		
		// Update the file
		await saveTasksToFile();
		
		console.log("Kanban: Created new task:", newTask.task, "in column:", targetStatus);
		});
		modal.open();
	});
	
	// Render based on view mode
	if (data.view === "table") {
		// TABLE VIEW: Render as table with status sections
		renderTableView();
		// Apply filter after rendering
		setTimeout(() => applyFilter(), 0);
	} else {
		// KANBAN VIEW: Render traditional kanban columns
		renderKanbanColumns();
		// Apply filter after rendering
		setTimeout(() => applyFilter(), 0);
	}
	
	// Function to render table view
	function renderTableView() {
		boardEl.empty();
		
		// Clear taskElements map for table view entries
		const currentTasks = new Map<string, KanbanTask>();
		taskElements.forEach((info, el) => {
			// Save task data by task name
			currentTasks.set(info.task.task, info.task);
		});
		taskElements.clear();
		
		// Create table container
		const tableContainer = boardEl.createDiv("kanban-table-container");
		
		// Shared variable to track which column is being dragged (accessible to all headers)
		let draggedColumnStatus: string | null = null;
		
		// Render each status as a section
		statusColumns.forEach(status => {
			const displayName = statusToDisplayName(status);
			// Get tasks from either tasksByStatus or currentTasks
			let tasks = tasksByStatus.get(status) || [];
			
			// If we're re-rendering, merge with current tasks
			if (currentTasks.size > 0) {
				const allTasks = new Map<string, KanbanTask>();
				
				// Add tasks from tasksByStatus
				tasks.forEach(task => {
					allTasks.set(task.task, task);
				});
				
				// Update with latest data from currentTasks
				currentTasks.forEach((task, taskName) => {
					if (task.status === status) {
						allTasks.set(taskName, task);
					}
				});
				
				tasks = Array.from(allTasks.values());
			}
			
			// Create status section
			const statusSection = tableContainer.createDiv("kanban-table-section");
			statusSection.setAttr("data-status", status);
			
			// Section header
			const sectionHeader = statusSection.createDiv("kanban-table-section-header");
			
			// Collapse button
			const collapseBtn = sectionHeader.createEl("button", {
				cls: "kanban-table-collapse-btn"
			});
			collapseBtn.setAttribute("aria-label", "Toggle section");
			
			// Prevent collapse button from triggering drag
			collapseBtn.addEventListener("mousedown", (e) => {
				e.stopPropagation();
			});
			
			const chevronIcon = document.createElementNS("http://www.w3.org/2000/svg", "svg");
			chevronIcon.setAttribute("xmlns", "http://www.w3.org/2000/svg");
			chevronIcon.setAttribute("width", "16");
			chevronIcon.setAttribute("height", "16");
			chevronIcon.setAttribute("viewBox", "0 0 24 24");
			chevronIcon.setAttribute("fill", "none");
			chevronIcon.setAttribute("stroke", "currentColor");
			chevronIcon.setAttribute("stroke-width", "2");
			chevronIcon.setAttribute("stroke-linecap", "round");
			chevronIcon.setAttribute("stroke-linejoin", "round");
			chevronIcon.innerHTML = '<polyline points="6 9 12 15 18 9"></polyline>';
			collapseBtn.appendChild(chevronIcon);
			
			// Make section header draggable for reordering
			sectionHeader.setAttr("draggable", "true");
			sectionHeader.classList.add("kanban-column-header-draggable");
			sectionHeader.setAttr("data-status", status);
			
			const sectionTitle = sectionHeader.createEl("h3", { cls: "kanban-table-section-title" });
			const updateSectionTitle = () => {
				const columnIcon = getColumnIcon(status);
				sectionTitle.setText(columnIcon + displayName);
			};
			updateSectionTitle();
			
			const taskCount = sectionHeader.createEl("span", {
				cls: "kanban-table-task-count",
				text: `${tasks.length}`
			});
			
			// Drag handlers for column reordering
			sectionHeader.addEventListener("dragstart", (e: DragEvent) => {
				if (!e.dataTransfer) return;
				e.stopPropagation(); // Prevent task drag from triggering
				sectionHeader.classList.add("kanban-column-dragging");
				e.dataTransfer.effectAllowed = "move";
				e.dataTransfer.setData("application/x-kanban-column", status);
				e.dataTransfer.setData("text/plain", status);
				draggedColumnStatus = status; // Store in variable for dragover
			});
			
			sectionHeader.addEventListener("dragend", (e: DragEvent) => {
				sectionHeader.classList.remove("kanban-column-dragging");
				draggedColumnStatus = null;
				// Remove drop indicators
				tableContainer.querySelectorAll(".kanban-column-drop-indicator").forEach(el => el.remove());
				tableContainer.querySelectorAll(".kanban-column-drag-over").forEach(el => el.classList.remove("kanban-column-drag-over"));
			});
			
			// Drop zone for column reordering
			sectionHeader.addEventListener("dragover", (e: DragEvent) => {
				e.preventDefault();
				e.stopPropagation(); // Prevent task drag from triggering
				if (!e.dataTransfer) return;
				
				// Use stored variable or try to get from dataTransfer
				const draggedStatus = draggedColumnStatus || e.dataTransfer.getData("application/x-kanban-column");
				if (!draggedStatus || draggedStatus === status) {
					e.dataTransfer.dropEffect = "none";
					sectionHeader.classList.remove("kanban-column-drag-over");
					return;
				}
				
				e.dataTransfer.dropEffect = "move";
				sectionHeader.classList.add("kanban-column-drag-over");
			});
			
			sectionHeader.addEventListener("dragleave", (e: DragEvent) => {
				// Only remove if we're actually leaving the element (not just moving to a child)
				const rect = sectionHeader.getBoundingClientRect();
				const x = e.clientX;
				const y = e.clientY;
				if (x < rect.left || x > rect.right || y < rect.top || y > rect.bottom) {
					sectionHeader.classList.remove("kanban-column-drag-over");
				}
			});
			
			sectionHeader.addEventListener("drop", async (e: DragEvent) => {
				e.preventDefault();
				e.stopPropagation(); // Prevent task drag from triggering
				if (!e.dataTransfer) return;
				
				const draggedStatus = e.dataTransfer.getData("application/x-kanban-column") || draggedColumnStatus;
				if (!draggedStatus || draggedStatus === status) {
					sectionHeader.classList.remove("kanban-column-drag-over");
					return;
				}
				
				sectionHeader.classList.remove("kanban-column-drag-over");
				draggedColumnStatus = null;
				
				console.log("Kanban: Reordering column", draggedStatus, "to position of", status);
				console.log("Kanban: Current data.columns:", data.columns);
				console.log("Kanban: Current statusColumns:", statusColumns);
				
				// Ensure data.columns exists
				// If statusColumns is a reference to data.columns, we can modify data.columns directly
				// If statusColumns is DEFAULT_COLUMNS, we need to create data.columns from it
				if (!data.columns) {
					// Create a new array from statusColumns (don't use reference)
					data.columns = [...statusColumns];
				} else if (statusColumns === data.columns) {
					// They're the same reference, so data.columns is already the source of truth
					// No need to sync
				} else {
					// They're different, sync data.columns with statusColumns
					if (data.columns.length !== statusColumns.length || 
						!data.columns.every((col, idx) => col === statusColumns[idx])) {
						data.columns = [...statusColumns];
					}
				}
				
				const draggedColIndex = data.columns.indexOf(draggedStatus);
				const targetColIndex = data.columns.indexOf(status);
				
				console.log("Kanban: Indices - dragged:", draggedColIndex, "target:", targetColIndex);
				
				if (draggedColIndex === -1 || targetColIndex === -1) {
					console.warn("Kanban: Column not found in data.columns", { draggedStatus, status, columns: data.columns });
					return;
				}
				
				// Remove dragged column from its current position
				data.columns.splice(draggedColIndex, 1);
				
				// Calculate insert position
				// After removing the dragged item, insert at target position
				// If we dragged forward, target index is unchanged. If backward, also unchanged.
				const insertIndex = targetColIndex;
				data.columns.splice(insertIndex, 0, draggedStatus);
				
				console.log("Kanban: New data.columns order:", data.columns);
				
				// Update statusColumns to match data.columns
				// Note: statusColumns might be a reference to data.columns, so we need to be careful
				// If they're the same reference, data.columns is already updated, so statusColumns is too
				// If they're different (statusColumns is DEFAULT_COLUMNS), we need to update it
				if (statusColumns !== data.columns) {
					statusColumns.length = 0;
					statusColumns.push(...data.columns);
				}
				
				// Reorder columnMetadata to match the new column order
				if (data.columnMetadata) {
					const draggedMetadata = data.columnMetadata.find(m => m.name === draggedStatus);
					const targetMetadata = data.columnMetadata.find(m => m.name === status);
					
					if (draggedMetadata && targetMetadata) {
						const draggedMetaIndex = data.columnMetadata.indexOf(draggedMetadata);
						const targetMetaIndex = data.columnMetadata.indexOf(targetMetadata);
						
						data.columnMetadata.splice(draggedMetaIndex, 1);
						const insertMetaIndex = draggedMetaIndex < targetMetaIndex ? targetMetaIndex : targetMetaIndex;
						data.columnMetadata.splice(insertMetaIndex, 0, draggedMetadata);
					}
				}
				
				console.log("Kanban: New column order:", data.columns);
				
				// Save and re-render
				await updateKanbanInFile(plugin.app, ctx, "", "todo", originalSource, data).catch(err => {
					console.error("Error reordering columns:", err);
				});
				
				// Re-render table view
				renderTableView();
				setTimeout(() => applyFilter(), 0);
			});

			// Add context menu to section header
			sectionHeader.addEventListener("contextmenu", (e) => {
				e.preventDefault();
				e.stopPropagation();
				
				const menu = new Menu();
				const currentMetadata = data.columnMetadata?.find(m => m.name === status);
				const currentState = currentMetadata?.state || getColumnState(status);
				const currentIcon = currentMetadata?.icon;
				
				// Edit status option
				menu.addItem((item) => {
					item
						.setTitle("Edit Status")
						.setIcon("pencil")
						.onClick(async () => {
							const modal = new EditStatusModal(
								plugin.app,
								status,
								currentState,
								currentIcon,
								async (newName, newType, newIcon) => {
									if (newType === null) return; // User cancelled
									
									const oldStatus = status;
									let updatedStatus = status;
									
									// Handle status name change
									if (newName && newName !== oldStatus) {
										updatedStatus = newName as KanbanStatus;
										
										// Get tasks from tasksByStatus BEFORE updating anything
										const oldTasks = tasksByStatus.get(oldStatus) || [];
										
										// Update all tasks with the old status to use the new status
										// Update both in data.tasks and in the tasks array from tasksByStatus
										oldTasks.forEach(task => {
											task.status = updatedStatus;
										});
										
										if (data.tasks) {
											data.tasks.forEach(task => {
												if (task.status === oldStatus) {
													task.status = updatedStatus;
												}
											});
										}
										
										// Update status name in columns array
										const statusIndex = data.columns?.indexOf(oldStatus);
										if (statusIndex !== undefined && statusIndex >= 0 && data.columns) {
											data.columns[statusIndex] = updatedStatus;
										}
										
										// Update status name in statusColumns array
										const statusColumnsIndex = statusColumns.indexOf(oldStatus);
										if (statusColumnsIndex >= 0) {
											statusColumns[statusColumnsIndex] = updatedStatus;
										}
										
										// Update tasksByStatus map - move tasks from old status to new status
										tasksByStatus.delete(oldStatus);
										tasksByStatus.set(updatedStatus, oldTasks);
									
									// Update metadata name
									const oldMetadata = data.columnMetadata?.find(m => m.name === oldStatus);
									if (oldMetadata) {
										oldMetadata.name = updatedStatus;
									}
									
									// Update collapsed columns array if status is collapsed
									if (data.collapsedColumns) {
										const collapsedIndex = data.collapsedColumns.indexOf(oldStatus);
										if (collapsedIndex >= 0) {
											data.collapsedColumns[collapsedIndex] = updatedStatus;
										}
									}
									
									console.log("Kanban: Renamed status from", oldStatus, "to", updatedStatus);
								}
								
								// Get or create metadata (using updated status name)
								let metadata = data.columnMetadata?.find(m => m.name === updatedStatus);
								if (!metadata) {
									metadata = { name: updatedStatus, state: newType };
									if (!data.columnMetadata) data.columnMetadata = [];
									data.columnMetadata.push(metadata);
								} else {
									metadata.state = newType;
									if (newIcon !== null) {
										metadata.icon = newIcon;
									} else {
										delete metadata.icon;
									}
								}
								
								// Re-render the table view to reflect changes
								renderTableView();
									setTimeout(() => applyFilter(), 0);
									
									await updateKanbanInFile(plugin.app, ctx, "", "todo", originalSource, data).catch(err => {
										console.error("Error saving status changes:", err);
									});
								}
							);
							modal.open();
						});
				});
				
				menu.addSeparator();
				
				// Status type options
				menu.addItem((item) => {
					item
						.setTitle("Set as To Do State")
						.setIcon("circle")
						.setChecked(currentState === "todo")
						.onClick(async () => {
							let metadata = data.columnMetadata?.find(m => m.name === status);
							if (!metadata) {
								metadata = { name: status, state: "todo" };
								if (!data.columnMetadata) data.columnMetadata = [];
								data.columnMetadata.push(metadata);
							} else {
								metadata.state = "todo";
							}
							updateSectionTitle();
							await updateKanbanInFile(plugin.app, ctx, "", "todo", originalSource, data).catch(err => {
								console.error("Error saving status changes:", err);
							});
						});
				});
				
				menu.addItem((item) => {
					item
						.setTitle("Set as In Progress State")
						.setIcon("play")
						.setChecked(currentState === "in-progress")
						.onClick(async () => {
							let metadata = data.columnMetadata?.find(m => m.name === status);
							if (!metadata) {
								metadata = { name: status, state: "in-progress" };
								if (!data.columnMetadata) data.columnMetadata = [];
								data.columnMetadata.push(metadata);
							} else {
								metadata.state = "in-progress";
							}
							updateSectionTitle();
							await updateKanbanInFile(plugin.app, ctx, "", "todo", originalSource, data).catch(err => {
								console.error("Error saving status changes:", err);
							});
						});
				});
				
				menu.addItem((item) => {
					item
						.setTitle("Set as Pending State")
						.setIcon("clock")
						.setChecked(currentState === "pending")
						.onClick(async () => {
							let metadata = data.columnMetadata?.find(m => m.name === status);
							if (!metadata) {
								metadata = { name: status, state: "pending" };
								if (!data.columnMetadata) data.columnMetadata = [];
								data.columnMetadata.push(metadata);
							} else {
								metadata.state = "pending";
							}
							updateSectionTitle();
							await updateKanbanInFile(plugin.app, ctx, "", "todo", originalSource, data).catch(err => {
								console.error("Error saving status changes:", err);
							});
						});
				});
				
				menu.addSeparator();
				
				// Exclude status option
				menu.addItem((item) => {
					item
						.setTitle("Exclude Status")
						.setIcon("trash")
						.onClick(async () => {
							// Find tasks in this status
							const tasksInStatus = Array.from(taskElements.values())
								.filter(info => info.task.status === status)
								.map(info => info.task);
							
							// Find the first available status that's not this one
							const otherStatuses = statusColumns.filter(s => s !== status);
							const targetStatus = otherStatuses.length > 0 ? otherStatuses[0] : "todo";
							
							// Move all tasks to the target status
							tasksInStatus.forEach(task => {
								task.status = targetStatus as KanbanStatus;
							});
							
							// Remove status from columns
							if (data.columns) {
								const index = data.columns.indexOf(status);
								if (index > -1) {
									data.columns.splice(index, 1);
								}
							}
							
							// Remove metadata
							if (data.columnMetadata) {
								const metadataIndex = data.columnMetadata.findIndex(m => m.name === status);
								if (metadataIndex > -1) {
									data.columnMetadata.splice(metadataIndex, 1);
								}
							}
							
							// Save and re-render
							await updateKanbanInFile(plugin.app, ctx, "", "todo", originalSource, data).catch(err => {
								console.error("Error excluding status:", err);
							});
							
							// Re-render the view to reflect changes
							if (data.view === "table") {
								renderTableView();
								setTimeout(() => applyFilter(), 0);
							} else {
								renderKanbanColumns();
								setTimeout(() => applyFilter(), 0);
							}
						});
				});
				
				menu.showAtMouseEvent(e);
			});
			
			// Create table
			const table = statusSection.createEl("table", { cls: "kanban-table" });
			const thead = table.createEl("thead");
			const headerRow = thead.createEl("tr");
			
		// Table headers with sorting
		const headers = [
			{ label: "Name", field: "title" as SortField, key: "name" },
			{ label: "Due Date", field: "dueDate" as SortField, key: "dueDate" },
			{ label: "Last Updated", field: "updateDateTime" as SortField, key: "lastUpdated" },
			{ label: "Time Spent", field: "timeSpent" as SortField, key: "timeSpent" },
			{ label: "Progress", field: null, key: "progress" }, // Progress bar column
			{ label: "", field: null, key: "actions" } // Actions column for timer buttons
		];
		
		// Get stored column widths from data or use defaults
		if (!data.columnWidths) {
			data.columnWidths = {};
		}
		
		headers.forEach((header, index) => {
			const th = headerRow.createEl("th");
			th.addClass("resizable-column");
			
			// Apply stored width if available
			if (data.columnWidths && data.columnWidths[header.key]) {
				th.style.width = data.columnWidths[header.key] + "px";
			}
			
			th.setText(header.label);
			if (header.field) {
				th.addClass("sortable");
				th.addEventListener("click", (e) => {
					// Don't trigger sort if clicking on resizer
					if ((e.target as HTMLElement).classList.contains("column-resizer")) {
						return;
					}
					
					// Get or create column metadata
					let metadata = data.columnMetadata?.find(m => m.name === status);
					if (!metadata) {
						metadata = { name: status, state: getColumnState(status), sortField: "updateDateTime", sortOrder: "desc" };
						if (!data.columnMetadata) data.columnMetadata = [];
						data.columnMetadata.push(metadata);
					}
					
					// Toggle sort
					if (metadata.sortField === header.field) {
						metadata.sortOrder = metadata.sortOrder === "asc" ? "desc" : "asc";
					} else {
						metadata.sortField = header.field;
						metadata.sortOrder = "asc";
					}
					
					// Re-render table view
					renderTableView();
					setTimeout(() => applyFilter(), 0);
					saveCollapsedState();
				});
			}
			
			// Add resize handle (except for last column)
			if (index < headers.length - 1) {
				const resizer = th.createDiv({ cls: "column-resizer" });
				
				let startX = 0;
				let startWidth = 0;
				
				resizer.addEventListener("mousedown", (e) => {
					e.preventDefault();
					e.stopPropagation();
					
					startX = e.pageX;
					startWidth = th.offsetWidth;
					
					const onMouseMove = (moveEvent: MouseEvent) => {
						const diff = moveEvent.pageX - startX;
						const newWidth = Math.max(50, startWidth + diff); // Min width 50px
						th.style.width = newWidth + "px";
						
						// Also update corresponding cells in this column
						const columnIndex = index;
						table.querySelectorAll(`tbody tr`).forEach((row) => {
							const cell = row.children[columnIndex] as HTMLElement;
							if (cell) {
								cell.style.width = newWidth + "px";
							}
						});
					};
					
				const onMouseUp = () => {
					// Store the new width
					if (!data.columnWidths) {
						data.columnWidths = {};
					}
					data.columnWidths[header.key] = th.offsetWidth;
					saveCollapsedState();
					
					document.removeEventListener("mousemove", onMouseMove);
					document.removeEventListener("mouseup", onMouseUp);
				};
					
					document.addEventListener("mousemove", onMouseMove);
					document.addEventListener("mouseup", onMouseUp);
				});
			}
		});
			
			// Table body
			const tbody = table.createEl("tbody");
			
			// Sort tasks
			const getColumnMetadata = () => {
				let metadata = data.columnMetadata?.find(m => m.name === status);
				if (!metadata) {
					metadata = { name: status, state: getColumnState(status), sortField: "updateDateTime", sortOrder: "desc" };
					if (!data.columnMetadata) data.columnMetadata = [];
					data.columnMetadata.push(metadata);
				}
				if (!metadata.sortField) metadata.sortField = "updateDateTime";
				if (!metadata.sortOrder) metadata.sortOrder = "desc";
				return metadata;
			};
			
			const sortTasks = (tasks: KanbanTask[]): KanbanTask[] => {
				const metadata = getColumnMetadata();
				const sorted = [...tasks];
				
				sorted.sort((a, b) => {
					let comparison = 0;
					
					switch (metadata.sortField) {
						case "updateDateTime":
							const aUpdate = a.updateDateTime ? moment(a.updateDateTime).valueOf() : 0;
							const bUpdate = b.updateDateTime ? moment(b.updateDateTime).valueOf() : 0;
							comparison = aUpdate - bUpdate;
							break;
						case "dueDate":
							const aDue = a.dueDate ? moment(a.dueDate).valueOf() : Number.MAX_SAFE_INTEGER;
							const bDue = b.dueDate ? moment(b.dueDate).valueOf() : Number.MAX_SAFE_INTEGER;
							comparison = aDue - bDue;
							break;
						case "title":
							comparison = a.task.localeCompare(b.task);
							break;
						case "timeSpent":
							const aTime = getTaskTimerDuration(a);
							const bTime = getTaskTimerDuration(b);
							comparison = aTime - bTime;
							break;
					}
					
					return metadata.sortOrder === "asc" ? comparison : -comparison;
				});
				
				return sorted;
			};
			
			const sortedTasks = sortTasks(tasks);
			
			// Render task rows
			sortedTasks.forEach(task => {
				const row = tbody.createEl("tr", { cls: "kanban-table-row" });
				row.setAttr("draggable", "true");
				row.setAttr("data-task", task.task);
				row.setAttr("data-task-title", task.task); // For filtering
				row.setAttr("data-status", status);
				
				// Add running class if timer is active
				if (isTaskTimerRunning(task)) {
					row.addClass("timer-running");
				}
				
				// Store task element mapping
				taskElements.set(row, { task, status });
				
				// Set up drag handlers
				setupTaskDragHandlers(row, status);
			
			// Task name cell with status button and inline tags
			const nameCell = row.createEl("td", { cls: "kanban-table-cell-name" });
			if (data.columnWidths?.name) {
				nameCell.style.width = data.columnWidths.name + "px";
			}
				
				// Status button container
				const statusButtonContainer = nameCell.createDiv("kanban-table-status-button-container");
				const statusButton = statusButtonContainer.createEl("button", { 
					cls: "kanban-table-status-button",
					attr: { "aria-label": "Change status" }
				});
				
				// Function to update status button icon based on column state
				const updateStatusButtonIcon = () => {
					const columnState = getColumnState(status);
					if (columnState === "todo") {
						statusButton.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle></svg>';
						statusButton.className = "kanban-table-status-button status-todo";
					} else if (columnState === "in-progress") {
						statusButton.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline></svg>';
						statusButton.className = "kanban-table-status-button status-in-progress";
					} else {
						statusButton.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><polyline points="9 12 11 14 15 10"></polyline></svg>';
						statusButton.className = "kanban-table-status-button status-done";
					}
				};
				
				updateStatusButtonIcon();
				
				// Status button click handler - show menu with all statuses
				statusButton.addEventListener("click", (e) => {
					e.stopPropagation();
					
					const menu = new Menu();
					
					// Add menu item for each status
					statusColumns.forEach(targetStatus => {
						const displayName = statusToDisplayName(targetStatus);
						const targetColumnState = getColumnState(targetStatus);
						
						// Determine icon
						let icon = "circle";
						if (targetColumnState === "in-progress") {
							icon = "clock";
						} else if (targetColumnState === "done") {
							icon = "check-circle";
						}
						
						menu.addItem((item) => {
							item
								.setTitle(displayName)
								.setIcon(icon)
								.setChecked(targetStatus === status)
								.onClick(async () => {
									if (targetStatus === status) {
										console.log("Kanban: Task already in status", status);
										return;
									}
									
									// Get column states for timer logic
									const oldColumnState = getColumnState(status);
									const newColumnState = getColumnState(targetStatus);
									
									// Update task status
									task.status = targetStatus;
									task.updateDateTime = moment().toISOString();
									
									// Timer logic: Start timer if moving to in-progress, stop if moving away
									if (newColumnState === "in-progress") {
										// Moving to in-progress - start timer
										// First stop all other running timers
										taskElements.forEach((info) => {
											if (isTaskTimerRunning(info.task)) {
												stopTaskTimer(info.task);
												console.log("Kanban: Auto-stopped timer for task:", info.task.task);
											}
										});
										
										// Start timer for this task if not already running
										if (!isTaskTimerRunning(task)) {
											startTaskTimer(task);
											console.log("Kanban: Auto-started timer for task:", task.task);
										}
									} else if (oldColumnState === "in-progress") {
										// Moving away from in-progress - stop timer
										if (isTaskTimerRunning(task)) {
											stopTaskTimer(task);
											console.log("Kanban: Auto-stopped timer for task:", task.task);
										}
									}
									
									// Update tasksByStatus map
									const oldStatusTasks = tasksByStatus.get(status) || [];
									const filteredOldTasks = oldStatusTasks.filter(t => t.task !== task.task);
									tasksByStatus.set(status, filteredOldTasks);
									
									const newStatusTasks = tasksByStatus.get(targetStatus) || [];
									newStatusTasks.push(task);
									tasksByStatus.set(targetStatus, newStatusTasks);
									
									// Remove from taskElements
									taskElements.delete(row);
								
								// Re-render table view
								renderTableView();
								setTimeout(() => applyFilter(), 0);
								
								// Save changes
									await saveTasksToFile(task.task);
									
									console.log("Kanban: Changed task status from", status, "to", targetStatus);
								});
						});
					});
					
					menu.showAtMouseEvent(e);
				});
				
				// Task name content
				const taskNameContent = nameCell.createDiv("kanban-table-task-content");
				MarkdownRenderer.render(
					plugin.app,
					task.task,
					taskNameContent,
					ctx.sourcePath,
					component
				).then(() => {
					const paragraph = taskNameContent.querySelector("p");
					if (paragraph) {
						while (paragraph.firstChild) {
							taskNameContent.appendChild(paragraph.firstChild);
						}
						paragraph.remove();
					}
					
					// Add tags inline after the task name
					if (task.tags && task.tags.length > 0) {
						task.tags.forEach(tag => {
							const tagEl = taskNameContent.createSpan("kanban-tag");
							tagEl.setText(tag);
						});
					}
				});
				
		// Due date cell
		const dueDateCell = row.createEl("td", { cls: "kanban-table-cell-due-date" });
		if (data.columnWidths?.dueDate) {
			dueDateCell.style.width = data.columnWidths.dueDate + "px";
		}
		
		// Function to update due date display
		const updateDueDateDisplay = () => {
			if (task.dueDate) {
				const dueDate = moment(task.dueDate);
				const now = moment();
				dueDateCell.setText(dueDate.format("ddd, YYYY-MM-DD HH:mm"));
				dueDateCell.removeClass("overdue", "soon");
				
				if (dueDate.isBefore(now)) {
					dueDateCell.addClass("overdue");
				} else if (dueDate.diff(now, "hours") <= 24) {
					dueDateCell.addClass("soon");
				}
			} else {
				dueDateCell.setText("—");
				dueDateCell.removeClass("overdue", "soon");
			}
		};
		updateDueDateDisplay();
		
		// Make due date cell editable on double-click
		dueDateCell.style.cursor = "pointer";
		dueDateCell.addEventListener("dblclick", (e) => {
			e.stopPropagation();
			const modal = new DueDateModal(
				plugin.app,
				task.dueDate,
				async (newDate) => {
					if (newDate === null) {
						task.dueDate = undefined;
					} else {
						task.dueDate = newDate;
					}
					updateDueDateDisplay();
					renderTableView();
					setTimeout(() => applyFilter(), 0);
					await saveTasksToFile(task.task);
				}
			);
			modal.open();
		});
				
		// Last updated cell
		const updatedCell = row.createEl("td", { cls: "kanban-table-cell-updated" });
		if (data.columnWidths?.lastUpdated) {
			updatedCell.style.width = data.columnWidths.lastUpdated + "px";
		}
		if (task.updateDateTime) {
				const updateDate = moment(task.updateDateTime);
				updatedCell.setText(updateDate.format("ddd, YYYY-MM-DD HH:mm"));
			} else {
				updatedCell.setText("—");
			}
			
			// Time spent cell
			const timeSpentCell = row.createEl("td", { cls: "kanban-table-cell-time-spent" });
			if (data.columnWidths?.timeSpent) {
				timeSpentCell.style.width = data.columnWidths.timeSpent + "px";
			}
			const timeDisplay = timeSpentCell.createSpan("kanban-table-time-display");
				
				// Function to update timer display (will reference buttons defined later)
				let startButton: HTMLButtonElement;
				let stopButton: HTMLButtonElement;
				let actionsCell: HTMLElement;
				
				const updateTimerDisplay = () => {
					const totalDuration = getTaskTimerDuration(task);
					const isRunning = isTaskTimerRunning(task);
					
					if (totalDuration > 0 || task.targetTime) {
						const spentText = totalDuration > 0 ? formatTimerDuration(totalDuration) : "0";
						const targetDuration = parseTargetTime(task.targetTime);
						const targetText = targetDuration > 0 ? formatTimerDurationNoSeconds(targetDuration) : "—";
						timeDisplay.setText(`${spentText} / ${targetText}`);
						timeDisplay.removeClass("empty");
					} else {
						timeDisplay.setText("—");
						timeDisplay.addClass("empty");
					}
					
					// Update button states and row visual state (only if buttons exist)
					if (startButton && stopButton && actionsCell) {
						if (isRunning) {
							startButton.disabled = true;
							stopButton.disabled = false;
							startButton.addClass("disabled");
							stopButton.removeClass("disabled");
							timeSpentCell.addClass("running");
							actionsCell.addClass("running");
							row.addClass("timer-running");
						} else {
							startButton.disabled = false;
							stopButton.disabled = true;
							startButton.removeClass("disabled");
							stopButton.addClass("disabled");
							timeSpentCell.removeClass("running");
							actionsCell.removeClass("running");
							row.removeClass("timer-running");
						}
					}
				}
				
				// Make time spent cell editable on double-click (for target time)
				timeSpentCell.style.cursor = "pointer";
				timeSpentCell.addEventListener("dblclick", (e) => {
					e.stopPropagation();
					const modal = new EditTargetTimeModal(
						plugin.app,
						task.targetTime,
						async (newTargetTime) => {
							if (newTargetTime === null) return; // User cancelled
							
							if (newTargetTime === "") {
								task.targetTime = undefined;
							} else {
								task.targetTime = newTargetTime;
							}
							
							updateTimerDisplay();
							// Update progress bar if it exists
							const updateProgressBar = (row as any).updateProgressBar;
							if (updateProgressBar) {
								updateProgressBar();
							}
							
							renderTableView();
							setTimeout(() => applyFilter(), 0);
							await saveTasksToFile(task.task);
						}
					);
					modal.open();
				});
			
			// Progress bar cell
			const progressCell = row.createEl("td", { cls: "kanban-table-cell-progress" });
			if (data.columnWidths?.progress) {
				progressCell.style.width = data.columnWidths.progress + "px";
			}
			const progressContainer = progressCell.createDiv("kanban-table-progress-container");
				const progressBar = progressContainer.createDiv("kanban-table-progress-bar");
				const progressFill = progressBar.createDiv("kanban-table-progress-fill");
				const progressText = progressContainer.createDiv("kanban-table-progress-text");
				
				// Function to update progress bar
				const updateProgressBar = () => {
					const totalDuration = getTaskTimerDuration(task);
					const isRunning = isTaskTimerRunning(task);
					
					if (task.targetTime) {
						// Has target time - show progress bar with percentage
						const targetDuration = parseTargetTime(task.targetTime);
						
						if (targetDuration > 0) {
							const percentage = (totalDuration / targetDuration) * 100;
							const displayPercentage = Math.min(100, percentage);
							
							progressFill.setCssStyles({ width: `${displayPercentage}%` });
							progressFill.style.display = "block";
							
							// Remove all color classes
							progressFill.removeClass("kanban-table-progress-green");
							progressFill.removeClass("kanban-table-progress-yellow");
							progressFill.removeClass("kanban-table-progress-orange");
							progressFill.removeClass("kanban-table-progress-red");
							progressText.removeClass("kanban-table-progress-text-green");
							progressText.removeClass("kanban-table-progress-text-yellow");
							progressText.removeClass("kanban-table-progress-text-orange");
							progressText.removeClass("kanban-table-progress-text-red");
							
						// Add appropriate color class based on percentage and settings
						const colorClass = getProgressBarColor(percentage, settings);
						
						progressFill.addClass(`kanban-table-progress-${colorClass}`);
						progressText.addClass(`kanban-table-progress-text-${colorClass}`);
							
							// Add running indicator
							if (isRunning) {
								progressFill.addClass("kanban-table-progress-running");
							} else {
								progressFill.removeClass("kanban-table-progress-running");
							}
							
							// Format the text
							progressText.setText(`${percentage.toFixed(0)}%`);
							
							if (isRunning) {
								progressText.addClass("kanban-table-progress-text-running");
							} else {
								progressText.removeClass("kanban-table-progress-text-running");
							}
						}
					} else {
						// No target time - hide the bar, show placeholder
						progressFill.style.display = "none";
						progressText.removeClass("kanban-table-progress-text-green");
						progressText.removeClass("kanban-table-progress-text-yellow");
						progressText.removeClass("kanban-table-progress-text-orange");
						progressText.removeClass("kanban-table-progress-text-red");
						progressText.removeClass("kanban-table-progress-text-running");
						progressText.setText("—");
						progressText.addClass("kanban-table-progress-text-empty");
					}
				};
				
				// Initial display
				updateProgressBar();
				
				// Store update function for interval
				(row as any).updateProgressBar = updateProgressBar;
			
			// Actions cell with timer buttons
			actionsCell = row.createEl("td", { cls: "kanban-table-cell-actions" });
			if (data.columnWidths?.actions) {
				actionsCell.style.width = data.columnWidths.actions + "px";
			}
			const timerButtons = actionsCell.createDiv("kanban-table-timer-buttons");
				
				// Start button
				startButton = timerButtons.createEl("button", {
					cls: "kanban-table-timer-button kanban-table-timer-start",
					attr: { "aria-label": "Start timer" }
				});
				startButton.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="5 3 19 12 5 21 5 3"></polygon></svg>`;
				
				// Stop button
				stopButton = timerButtons.createEl("button", {
					cls: "kanban-table-timer-button kanban-table-timer-stop",
					attr: { "aria-label": "Stop timer" }
				});
				stopButton.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect></svg>`;
				
				// Initial display
				updateTimerDisplay();
				
				// Store update function for interval
				(row as any).updateTimerDisplay = updateTimerDisplay;
				
				// Start button click handler
				startButton.addEventListener("click", async (e) => {
					e.stopPropagation();
					
					// Stop all other running timers
					taskElements.forEach((info, otherRow) => {
						if (info.task !== task && isTaskTimerRunning(info.task)) {
							stopTaskTimer(info.task);
							// Update the display for the stopped task
							const updateFn = (otherRow as any).updateTimerDisplay;
							if (updateFn) {
								updateFn();
							}
							console.log("Kanban: Auto-stopped timer for task:", info.task.task);
						}
					});
					
					// Start the timer for this task
					startTaskTimer(task);
					updateTimerDisplay();
					
					// Save changes to file
					await saveTasksToFile(task.task);
				});
				
				// Stop button click handler
				stopButton.addEventListener("click", async (e) => {
					e.stopPropagation();
					stopTaskTimer(task);
					updateTimerDisplay();
					await saveTasksToFile(task.task);
				});
				
				// Row context menu
				row.addEventListener("contextmenu", (e) => {
					e.preventDefault();
					const menu = new Menu();
					
					menu.addItem((item) => {
						item.setTitle("Edit Tags").setIcon("tag").onClick(() => {
							const modal = new EditTagsModal(
								plugin.app,
								task.tags || [],
								async (tagsArray) => {
								if (tagsArray === null) return;
								task.tags = tagsArray.length > 0 ? tagsArray : undefined;
								renderTableView();
								setTimeout(() => applyFilter(), 0);
								await saveTasksToFile(task.task);
								}
							);
							modal.open();
						});
					});
					
					menu.addItem((item) => {
						item.setTitle("Edit Due Date").setIcon("calendar").onClick(() => {
							const modal = new DueDateModal(
								plugin.app,
								task.dueDate,
								async (newDate) => {
									if (newDate === null) {
										task.dueDate = undefined;
									} else {
									task.dueDate = newDate;
								}
								renderTableView();
								setTimeout(() => applyFilter(), 0);
								await saveTasksToFile(task.task);
								}
							);
							modal.open();
						});
					});
					
					menu.addSeparator();
					
					menu.addItem((item) => {
						item.setTitle("Delete Task").setIcon("trash").onClick(async () => {
							taskElements.delete(row);
							row.remove();
							await saveTasksToFile();
						});
					});
					
					menu.showAtMouseEvent(e);
				});
			});
			
			// Collapse functionality
			const collapsedColumns = data.collapsedColumns || [];
			let isCollapsed = collapsedColumns.includes(status);
			
			if (isCollapsed) {
				statusSection.addClass("collapsed");
				table.style.display = "none";
			}
			
			collapseBtn.addEventListener("click", async () => {
				isCollapsed = !isCollapsed;
				
				if (isCollapsed) {
					statusSection.addClass("collapsed");
					table.style.display = "none";
					chevronIcon.innerHTML = '<polyline points="9 18 15 12 9 6"></polyline>';
					
					if (!data.collapsedColumns) data.collapsedColumns = [];
					if (!data.collapsedColumns.includes(status)) {
						data.collapsedColumns.push(status);
					}
				} else {
					statusSection.removeClass("collapsed");
					table.style.display = "table";
					chevronIcon.innerHTML = '<polyline points="6 9 12 15 18 9"></polyline>';
					
					if (data.collapsedColumns) {
						data.collapsedColumns = data.collapsedColumns.filter(col => col !== status);
					}
				}
				
				await saveCollapsedState();
			});
			
			// Set up drop handlers for table view - support both reordering and moving between statuses
			let draggedOverRow: HTMLElement | null = null;
			let insertBefore = true;
			
			tbody.addEventListener("dragover", (e: DragEvent) => {
				e.preventDefault();
				if (!e.dataTransfer) return;
				e.dataTransfer.dropEffect = "move";
				
				// Find the row being dragged over
				const target = e.target as HTMLElement;
				const row = target.closest("tr.kanban-table-row") as HTMLElement;
				
				if (row && row.parentElement === tbody) {
					// Remove previous indicators
					tbody.querySelectorAll(".kanban-table-drop-indicator").forEach(el => el.remove());
					
					// Determine if we should insert before or after based on mouse position
					const rect = row.getBoundingClientRect();
					const midpoint = rect.top + rect.height / 2;
					insertBefore = e.clientY < midpoint;
					
					// Add visual indicator
					const indicator = document.createElement("tr");
					indicator.className = "kanban-table-drop-indicator";
					const td = indicator.createEl("td");
					td.setAttribute("colspan", "5");
					
					if (insertBefore) {
						row.parentElement?.insertBefore(indicator, row);
					} else {
						row.parentElement?.insertBefore(indicator, row.nextSibling);
					}
					
					draggedOverRow = row;
				} else {
					statusSection.addClass("kanban-table-drag-over");
				}
			});
			
			tbody.addEventListener("dragleave", (e: DragEvent) => {
				if (!tbody.contains(e.relatedTarget as Node)) {
					statusSection.removeClass("kanban-table-drag-over");
					tbody.querySelectorAll(".kanban-table-drop-indicator").forEach(el => el.remove());
					draggedOverRow = null;
				}
			});
			
			tbody.addEventListener("drop", async (e: DragEvent) => {
				e.preventDefault();
				if (!e.dataTransfer) return;
				
				// Clean up visual indicators
				statusSection.removeClass("kanban-table-drag-over");
				tbody.querySelectorAll(".kanban-table-drop-indicator").forEach(el => el.remove());
				
				const sourceStatus = e.dataTransfer.getData("application/x-kanban-status") as KanbanStatus;
				const taskText = e.dataTransfer.getData("text/plain");
				
				// Find the task
				let movedTask: { task: KanbanTask; status: KanbanStatus } | undefined;
				let movedTaskEl: HTMLElement | undefined;
				
				taskElements.forEach((info, el) => {
					if (info.task.task === taskText && info.status === sourceStatus) {
						movedTask = info;
						movedTaskEl = el;
					}
				});
				
				if (!movedTask || !movedTaskEl) return;
				
				// Store movedTask in a const to help TypeScript
				const taskToMove = movedTask;
				
				// Remove the old element from DOM and taskElements
				taskElements.delete(movedTaskEl);
				movedTaskEl.remove();
				
				// Get column states for timer logic
				const oldColumnState = getColumnState(sourceStatus);
				const newColumnState = getColumnState(status);
				
				// Timer logic: Start timer if moving to in-progress, stop if moving away
				if (sourceStatus !== status) {
					// Only update task status if moving to a different status
					taskToMove.task.status = status;
					taskToMove.task.updateDateTime = moment().toISOString();
					taskToMove.status = status;
					// Only apply timer logic when actually changing status
					if (newColumnState === "in-progress") {
						// Moving to in-progress - start timer
						// First stop all other running timers
						taskElements.forEach((info) => {
							if (isTaskTimerRunning(info.task)) {
								stopTaskTimer(info.task);
								console.log("Kanban: Auto-stopped timer for task:", info.task.task);
							}
						});
						
						// Also stop timers in tasksByStatus (in case taskElements is out of sync)
						tasksByStatus.forEach((tasks) => {
							tasks.forEach((t) => {
								if (t.task !== taskToMove.task.task && isTaskTimerRunning(t)) {
									stopTaskTimer(t);
									console.log("Kanban: Auto-stopped timer for task (from tasksByStatus):", t.task);
								}
							});
						});
						
						// Start timer for this task if not already running
						if (!isTaskTimerRunning(taskToMove.task)) {
							startTaskTimer(taskToMove.task);
							console.log("Kanban: Auto-started timer for task:", taskToMove.task.task, "Timer entries:", taskToMove.task.timerEntries);
						}
					} else if (oldColumnState === "in-progress") {
						// Moving away from in-progress - stop timer
						if (isTaskTimerRunning(taskToMove.task)) {
							stopTaskTimer(taskToMove.task);
							console.log("Kanban: Auto-stopped timer for task:", taskToMove.task.task);
						}
					}
				}
				
				// Handle reordering within same status or moving to different status
				if (sourceStatus === status && draggedOverRow) {
					// Reordering within same status - don't change status or updateDateTime
					const targetTaskName = draggedOverRow.getAttribute("data-task");
					
					// Don't do anything if dropping on itself
					if (targetTaskName === taskText) {
					console.log("Kanban: Dropped task on itself, ignoring");
					draggedOverRow = null;
					renderTableView();
					setTimeout(() => applyFilter(), 0);
					return;
					}
					
					const statusTasks = tasksByStatus.get(status) || [];
					
					// Find original indices
					const sourceIndex = statusTasks.findIndex(t => t.task === taskText);
					const targetIndexOriginal = statusTasks.findIndex(t => t.task === targetTaskName);
					
					if (sourceIndex < 0 || targetIndexOriginal < 0) {
						console.warn("Kanban: Could not find source or target task in array");
						return;
					}
					
					// Remove the moved task from its current position
					const [movedTaskObj] = statusTasks.splice(sourceIndex, 1);
					
					// Recalculate target index after removal
					const newTargetIndex = statusTasks.findIndex(t => t.task === targetTaskName);
					
					// Insert at the correct position
					const insertIndex = insertBefore ? newTargetIndex : newTargetIndex + 1;
					statusTasks.splice(insertIndex, 0, movedTaskObj);
					tasksByStatus.set(status, statusTasks);
					
					console.log("Kanban: Reordered task", taskText, "within", status, "from index", sourceIndex, "to", insertIndex);
				} else if (sourceStatus !== status) {
					// Moving to different status
					const oldStatusTasks = tasksByStatus.get(sourceStatus) || [];
					const filteredOldTasks = oldStatusTasks.filter(t => t.task !== taskText);
					tasksByStatus.set(sourceStatus, filteredOldTasks);
					
					const newStatusTasks = tasksByStatus.get(status) || [];
					
					if (draggedOverRow) {
						// Insert at specific position
						const targetTaskName = draggedOverRow.getAttribute("data-task");
						
						// Safety check - don't insert if target is the same task
						if (targetTaskName === taskText) {
							const existingIndex = newStatusTasks.findIndex(t => t.task === taskText);
							if (existingIndex >= 0) {
								// Update existing task with timer state
								newStatusTasks[existingIndex] = taskToMove.task;
							} else {
								newStatusTasks.push(taskToMove.task);
							}
						} else {
							const targetIndex = newStatusTasks.findIndex(t => t.task === targetTaskName);
							
							if (targetIndex >= 0) {
								const insertIndex = insertBefore ? targetIndex : targetIndex + 1;
								// Remove existing task if it exists, then insert at correct position
								const existingIndex = newStatusTasks.findIndex(t => t.task === taskText);
								if (existingIndex >= 0) {
									newStatusTasks.splice(existingIndex, 1);
									// Recalculate target index after removal
									const newTargetIndex = newStatusTasks.findIndex(t => t.task === targetTaskName);
									const finalInsertIndex = insertBefore ? newTargetIndex : newTargetIndex + 1;
									newStatusTasks.splice(finalInsertIndex, 0, taskToMove.task);
								} else {
									newStatusTasks.splice(insertIndex, 0, taskToMove.task);
								}
							} else {
								// Remove existing task if it exists, then add
								const existingIndex = newStatusTasks.findIndex(t => t.task === taskText);
								if (existingIndex >= 0) {
									newStatusTasks[existingIndex] = taskToMove.task;
								} else {
									newStatusTasks.push(taskToMove.task);
								}
							}
						}
					} else {
						// Add at the end if no specific position
						const existingIndex = newStatusTasks.findIndex(t => t.task === taskText);
						if (existingIndex >= 0) {
							// Update existing task with timer state
							newStatusTasks[existingIndex] = taskToMove.task;
						} else {
							newStatusTasks.push(taskToMove.task);
						}
					}
					
					tasksByStatus.set(status, newStatusTasks);
					
					console.log("Kanban: Moved task", taskText, "from", sourceStatus, "to", status);
				}
				
				// Reset
				draggedOverRow = null;
			
			// Re-render the table view to show the updated order
			renderTableView();
			setTimeout(() => applyFilter(), 0);
			
			// Save changes
				await saveTasksToFile(taskText);
			});
		});
	}
	
	// Function to render kanban columns (original logic)
	function renderKanbanColumns() {
	statusColumns.forEach(status => {
		const displayName = statusToDisplayName(status);
		const columnEl = boardEl.createDiv("kanban-column");
		columnEl.setAttr("data-status", status);
		columnEl.classList.add("kanban-column-dropzone");
		columnElements.set(status, columnEl);
		
		// Column header
		const headerEl = columnEl.createDiv("kanban-column-header");
		
		// Make header draggable for reordering
		headerEl.setAttr("draggable", "true");
		headerEl.classList.add("kanban-column-header-draggable");
		headerEl.setAttr("data-status", status);
		
		// Collapse button
		const collapseBtn = headerEl.createEl("button", {
			cls: "kanban-column-collapse-btn"
		});
		collapseBtn.setAttribute("aria-label", "Toggle column");
		
		// Prevent collapse button from triggering drag
		collapseBtn.addEventListener("mousedown", (e) => {
			e.stopPropagation();
		});
		
		// Chevron icon
		const chevronIcon = document.createElementNS("http://www.w3.org/2000/svg", "svg");
		chevronIcon.setAttribute("xmlns", "http://www.w3.org/2000/svg");
		chevronIcon.setAttribute("width", "16");
		chevronIcon.setAttribute("height", "16");
		chevronIcon.setAttribute("viewBox", "0 0 24 24");
		chevronIcon.setAttribute("fill", "none");
		chevronIcon.setAttribute("stroke", "currentColor");
		chevronIcon.setAttribute("stroke-width", "2");
		chevronIcon.setAttribute("stroke-linecap", "round");
		chevronIcon.setAttribute("stroke-linejoin", "round");
		chevronIcon.innerHTML = '<polyline points="6 9 12 15 18 9"></polyline>';
		collapseBtn.appendChild(chevronIcon);
		
		const headerTitle = headerEl.createEl("h3");
		
		// Add icon to title
		const updateHeaderTitle = () => {
			const columnIcon = getColumnIcon(status);
			headerTitle.setText(columnIcon + displayName);
		};
		updateHeaderTitle();
		
		// Drag handlers for column reordering
		headerEl.addEventListener("dragstart", (e: DragEvent) => {
			if (!e.dataTransfer) return;
			e.stopPropagation(); // Prevent task drag from triggering
			headerEl.classList.add("kanban-column-dragging");
			e.dataTransfer.effectAllowed = "move";
			e.dataTransfer.setData("application/x-kanban-column", status);
			e.dataTransfer.setData("text/plain", status);
		});
		
		headerEl.addEventListener("dragend", (e: DragEvent) => {
			headerEl.classList.remove("kanban-column-dragging");
			// Remove drop indicators
			boardEl.querySelectorAll(".kanban-column-drop-indicator").forEach(el => el.remove());
			boardEl.querySelectorAll(".kanban-column-drag-over").forEach(el => el.classList.remove("kanban-column-drag-over"));
		});
		
		// Drop zone for column reordering
		headerEl.addEventListener("dragover", (e: DragEvent) => {
			e.preventDefault();
			e.stopPropagation(); // Prevent task drag from triggering
			if (!e.dataTransfer) return;
			
			const draggedStatus = e.dataTransfer.getData("application/x-kanban-column");
			if (!draggedStatus || draggedStatus === status) {
				e.dataTransfer.dropEffect = "none";
				return;
			}
			
			e.dataTransfer.dropEffect = "move";
			headerEl.classList.add("kanban-column-drag-over");
		});
		
		headerEl.addEventListener("dragleave", (e: DragEvent) => {
			headerEl.classList.remove("kanban-column-drag-over");
		});
		
		headerEl.addEventListener("drop", async (e: DragEvent) => {
			e.preventDefault();
			e.stopPropagation(); // Prevent task drag from triggering
			if (!e.dataTransfer) return;
			
			const draggedStatus = e.dataTransfer.getData("application/x-kanban-column");
			if (!draggedStatus || draggedStatus === status) {
				return;
			}
			
			headerEl.classList.remove("kanban-column-drag-over");
			
			// Reorder columns
			const currentIndex = statusColumns.indexOf(status);
			const draggedIndex = statusColumns.indexOf(draggedStatus);
			
			if (currentIndex === -1 || draggedIndex === -1) return;
			
			// Remove dragged column from its current position
			statusColumns.splice(draggedIndex, 1);
			
			// Insert at new position
			const newIndex = draggedIndex < currentIndex ? currentIndex : currentIndex + 1;
			statusColumns.splice(newIndex, 0, draggedStatus);
			
			// Update data.columns to match
			if (data.columns) {
				const draggedColIndex = data.columns.indexOf(draggedStatus);
				if (draggedColIndex > -1) {
					data.columns.splice(draggedColIndex, 1);
					const targetColIndex = data.columns.indexOf(status);
					const insertIndex = draggedColIndex < targetColIndex ? targetColIndex : targetColIndex + 1;
					data.columns.splice(insertIndex, 0, draggedStatus);
				}
			}
			
			// Reorder columnMetadata to match the new column order
			if (data.columnMetadata) {
				const draggedMetadata = data.columnMetadata.find(m => m.name === draggedStatus);
				const targetMetadata = data.columnMetadata.find(m => m.name === status);
				
				if (draggedMetadata && targetMetadata) {
					const draggedMetaIndex = data.columnMetadata.indexOf(draggedMetadata);
					const targetMetaIndex = data.columnMetadata.indexOf(targetMetadata);
					
					data.columnMetadata.splice(draggedMetaIndex, 1);
					const insertMetaIndex = draggedMetaIndex < targetMetaIndex ? targetMetaIndex : targetMetaIndex + 1;
					data.columnMetadata.splice(insertMetaIndex, 0, draggedMetadata);
				}
			}
			
			// Save and re-render
			await updateKanbanInFile(plugin.app, ctx, "", "todo", originalSource, data).catch(err => {
				console.error("Error reordering columns:", err);
			});
			
			// Re-render kanban columns
			renderKanbanColumns();
			setTimeout(() => applyFilter(), 0);
		});
		
		// Task count badge
		const taskCountBadge = headerEl.createEl("span", {
			cls: "kanban-column-count"
		});
		
		// Sort buttons container
		const sortButtonsContainer = headerEl.createDiv("kanban-sort-buttons");
		
		// Sort field button
		const sortFieldButton = sortButtonsContainer.createEl("button", {
			cls: "kanban-sort-field-button",
			attr: { "aria-label": "Sort field" }
		});
		
		// Sort order button
		const sortOrderButton = sortButtonsContainer.createEl("button", {
			cls: "kanban-sort-order-button",
			attr: { "aria-label": "Sort order" }
		});
		
		// Get column metadata
		const getColumnMetadata = () => {
			let metadata = data.columnMetadata?.find(m => m.name === status);
			if (!metadata) {
				metadata = { 
					name: status, 
					state: "todo", 
					sortField: "updateDateTime", 
					sortOrder: "desc",
					manualSort: true // Default to manual sort to preserve task order
				};
				if (!data.columnMetadata) {
					data.columnMetadata = [];
				}
				data.columnMetadata.push(metadata);
			}
			if (!metadata.sortField) metadata.sortField = "updateDateTime";
			if (!metadata.sortOrder) metadata.sortOrder = "desc";
			if (metadata.manualSort === undefined) metadata.manualSort = true; // Default to manual sort
			return metadata;
		};
		
		// Update sort button displays
		const updateSortButtons = () => {
			const metadata = getColumnMetadata();
			
			// Update field button
			const fieldIcons: Record<SortField, string> = {
				"updateDateTime": "🔄",
				"dueDate": "📅",
				"title": "📝",
				"timeSpent": "⏱️"
			};
			const fieldLabels: Record<SortField, string> = {
				"updateDateTime": "Update",
				"dueDate": "Due",
				"title": "Title",
				"timeSpent": "Time"
			};
			
			// Show manual sort indicator or regular sort field
			if (metadata.manualSort) {
				sortFieldButton.innerHTML = `✋ Manual`;
				sortFieldButton.style.opacity = "0.6";
			} else {
				sortFieldButton.innerHTML = `${fieldIcons[metadata.sortField!]} ${fieldLabels[metadata.sortField!]}`;
				sortFieldButton.style.opacity = "1";
			}
			
			// Update order button - dim when in manual mode
			sortOrderButton.innerHTML = metadata.sortOrder === "asc" ? "↑" : "↓";
			sortOrderButton.style.opacity = metadata.manualSort ? "0.6" : "1";
		};
		
		updateSortButtons();
		
		// Sort field button click - cycle through sort fields
		sortFieldButton.addEventListener("click", async (e) => {
			e.stopPropagation();
			const metadata = getColumnMetadata();
			const fields: SortField[] = ["updateDateTime", "dueDate", "title", "timeSpent"];
			const currentIndex = fields.indexOf(metadata.sortField!);
			metadata.sortField = fields[(currentIndex + 1) % fields.length];
			metadata.manualSort = false; // Disable manual sort when user clicks sort button
			updateSortButtons();
			sortAndRenderTasks();
			await saveCollapsedState();
			console.log("Kanban: Changed sort field to", metadata.sortField);
		});
		
		// Sort order button click - toggle asc/desc
		sortOrderButton.addEventListener("click", async (e) => {
			e.stopPropagation();
			const metadata = getColumnMetadata();
			metadata.sortOrder = metadata.sortOrder === "asc" ? "desc" : "asc";
			metadata.manualSort = false; // Disable manual sort when user clicks sort button
			updateSortButtons();
			sortAndRenderTasks();
			await saveCollapsedState();
			console.log("Kanban: Changed sort order to", metadata.sortOrder);
		});
		
		// Add context menu to header for configuring column state
		headerEl.addEventListener("contextmenu", (e) => {
			e.preventDefault();
			e.stopPropagation();
			
			const menu = new Menu();
			const currentMetadata = data.columnMetadata?.find(m => m.name === status);
			const currentState = currentMetadata?.state || getColumnState(status);
			const currentIcon = currentMetadata?.icon;
			
			// Edit status option
			menu.addItem((item) => {
				item
					.setTitle("Edit Status")
					.setIcon("pencil")
					.onClick(async () => {
						const modal = new EditStatusModal(
							plugin.app,
							status,
							currentState,
							currentIcon,
							async (newName, newType, newIcon) => {
								if (newType === null) return; // User cancelled
								
								const oldStatus = status;
								let updatedStatus = status;
								
								// Handle status name change
								if (newName && newName !== oldStatus) {
									updatedStatus = newName as KanbanStatus;
									
									// Get tasks from tasksByStatus BEFORE updating anything
									const oldTasks = tasksByStatus.get(oldStatus) || [];
									
									// Update all tasks with the old status to use the new status
									// Update both in data.tasks and in the tasks array from tasksByStatus
									oldTasks.forEach(task => {
										task.status = updatedStatus;
									});
									
									if (data.tasks) {
										data.tasks.forEach(task => {
											if (task.status === oldStatus) {
												task.status = updatedStatus;
											}
										});
									}
									
									// Update status name in columns array
									const statusIndex = data.columns?.indexOf(oldStatus);
									if (statusIndex !== undefined && statusIndex >= 0 && data.columns) {
										data.columns[statusIndex] = updatedStatus;
									}
									
									// Update status name in statusColumns array
									const statusColumnsIndex = statusColumns.indexOf(oldStatus);
									if (statusColumnsIndex >= 0) {
										statusColumns[statusColumnsIndex] = updatedStatus;
									}
									
									// Update tasksByStatus map - move tasks from old status to new status
									tasksByStatus.delete(oldStatus);
									tasksByStatus.set(updatedStatus, oldTasks);
									
									// Update metadata name
									const oldMetadata = data.columnMetadata?.find(m => m.name === oldStatus);
									if (oldMetadata) {
										oldMetadata.name = updatedStatus;
									}
									
									// Update collapsed columns array if status is collapsed
									if (data.collapsedColumns) {
										const collapsedIndex = data.collapsedColumns.indexOf(oldStatus);
										if (collapsedIndex >= 0) {
											data.collapsedColumns[collapsedIndex] = updatedStatus;
										}
									}
									
									console.log("Kanban: Renamed status from", oldStatus, "to", updatedStatus);
								}
								
								// Get or create metadata (using updated status name)
								let metadata = data.columnMetadata?.find(m => m.name === updatedStatus);
								if (!metadata) {
									metadata = { name: updatedStatus, state: newType };
									if (!data.columnMetadata) data.columnMetadata = [];
									data.columnMetadata.push(metadata);
								} else {
									metadata.state = newType;
									if (newIcon !== null) {
										metadata.icon = newIcon;
									} else {
										delete metadata.icon;
									}
								}
								
								// Re-render the kanban view to reflect changes
								if (data.view === "table") {
									renderTableView();
									setTimeout(() => applyFilter(), 0);
								} else {
									renderKanbanColumns();
								}
								
								updateHeaderTitle();
								await saveCollapsedState();
								console.log("Kanban: Updated column", updatedStatus, "type:", newType, "icon:", newIcon);
							}
						);
						modal.open();
					});
			});
			
			menu.addSeparator();
			
			// Status type options
			menu.addItem((item) => {
				item
					.setTitle("Set as To Do State")
					.setIcon("circle")
					.setChecked(currentState === "todo")
					.onClick(async () => {
						let metadata = data.columnMetadata?.find(m => m.name === status);
						if (!metadata) {
							metadata = { name: status, state: "todo" };
							if (!data.columnMetadata) data.columnMetadata = [];
							data.columnMetadata.push(metadata);
						} else {
							metadata.state = "todo";
						}
						updateHeaderTitle();
						await saveCollapsedState();
						console.log("Kanban: Set column", status, "to todo state");
					});
			});
			
			menu.addItem((item) => {
				item
					.setTitle("Set as In Progress State")
					.setIcon("play")
					.setChecked(currentState === "in-progress")
					.onClick(async () => {
						let metadata = data.columnMetadata?.find(m => m.name === status);
						if (!metadata) {
							metadata = { name: status, state: "in-progress" };
							if (!data.columnMetadata) data.columnMetadata = [];
							data.columnMetadata.push(metadata);
						} else {
							metadata.state = "in-progress";
						}
						updateHeaderTitle();
						await saveCollapsedState();
						console.log("Kanban: Set column", status, "to in-progress state");
					});
			});
			
			menu.addItem((item) => {
				item
					.setTitle("Set as Pending State")
					.setIcon("clock")
					.setChecked(currentState === "pending")
					.onClick(async () => {
						let metadata = data.columnMetadata?.find(m => m.name === status);
						if (!metadata) {
							metadata = { name: status, state: "pending" };
							if (!data.columnMetadata) data.columnMetadata = [];
							data.columnMetadata.push(metadata);
						} else {
							metadata.state = "pending";
						}
						updateHeaderTitle();
						await saveCollapsedState();
						console.log("Kanban: Set column", status, "to pending state");
					});
			});
			
			menu.addSeparator();
			
			// Exclude status option
			menu.addItem((item) => {
				item
					.setTitle("Exclude Status")
					.setIcon("trash")
					.onClick(async () => {
						// Find tasks in this status
						const tasksInStatus = Array.from(taskElements.values())
							.filter(info => info.task.status === status)
							.map(info => info.task);
						
						// Find the first available status that's not this one
						const otherStatuses = statusColumns.filter(s => s !== status);
						const targetStatus = otherStatuses.length > 0 ? otherStatuses[0] : "todo";
						
						// Move all tasks to the target status
						tasksInStatus.forEach(task => {
							task.status = targetStatus as KanbanStatus;
						});
						
						// Remove status from columns
						if (data.columns) {
							const index = data.columns.indexOf(status);
							if (index > -1) {
								data.columns.splice(index, 1);
							}
						}
						
						// Remove metadata
						if (data.columnMetadata) {
							const metadataIndex = data.columnMetadata.findIndex(m => m.name === status);
							if (metadataIndex > -1) {
								data.columnMetadata.splice(metadataIndex, 1);
							}
						}
						
						// Save and re-render
						await updateKanbanInFile(plugin.app, ctx, "", "todo", originalSource, data).catch(err => {
							console.error("Error excluding status:", err);
						});
						
						// Re-render the view to reflect changes
						if (data.view === "table") {
							renderTableView();
							setTimeout(() => applyFilter(), 0);
						} else {
							renderKanbanColumns();
							setTimeout(() => applyFilter(), 0);
						}
					});
			});
			
			menu.showAtMouseEvent(e);
		});
		
		// Column tasks container
		const tasksEl = columnEl.createDiv("kanban-column-tasks");
		
		// Check if this column is collapsed in the saved state
		const collapsedColumns = data.collapsedColumns || [];
		let isCollapsed = collapsedColumns.includes(status);
		
		// Function to update task count
		const updateTaskCount = () => {
			const tasks = tasksByStatus.get(status) || [];
			taskCountBadge.setText(`${tasks.length}`);
		};
		
		// Set initial count
		updateTaskCount();
		
		// Apply initial collapsed state
		if (isCollapsed) {
			columnEl.addClass("kanban-column-collapsed");
			tasksEl.style.display = "none";
			sortButtonsContainer.style.display = "none";
			chevronIcon.innerHTML = '<polyline points="9 18 15 12 9 6"></polyline>';
		}
		
		// Collapse button click handler
		collapseBtn.addEventListener("click", async (e) => {
			e.stopPropagation();
			isCollapsed = !isCollapsed;
			
			if (isCollapsed) {
				columnEl.addClass("kanban-column-collapsed");
				tasksEl.style.display = "none";
				sortButtonsContainer.style.display = "none";
				chevronIcon.innerHTML = '<polyline points="9 18 15 12 9 6"></polyline>';
				
				// Add to collapsed columns
				if (!data.collapsedColumns) {
					data.collapsedColumns = [];
				}
				if (!data.collapsedColumns.includes(status)) {
					data.collapsedColumns.push(status);
				}
			} else {
				columnEl.removeClass("kanban-column-collapsed");
				tasksEl.style.display = "flex";
				sortButtonsContainer.style.display = "flex";
				chevronIcon.innerHTML = '<polyline points="6 9 12 15 18 9"></polyline>';
				
				// Remove from collapsed columns
				if (data.collapsedColumns) {
					data.collapsedColumns = data.collapsedColumns.filter(col => col !== status);
				}
			}
			
			// Save the collapsed state to file
			await saveCollapsedState();
		});
		// Function to sort tasks
		const sortTasks = (tasks: KanbanTask[]): KanbanTask[] => {
			const metadata = getColumnMetadata();
			const sorted = [...tasks];
			
			sorted.sort((a, b) => {
				let comparison = 0;
				
				switch (metadata.sortField) {
					case "updateDateTime":
						const aUpdate = a.updateDateTime ? moment(a.updateDateTime).valueOf() : 0;
						const bUpdate = b.updateDateTime ? moment(b.updateDateTime).valueOf() : 0;
						comparison = aUpdate - bUpdate;
						break;
					case "dueDate":
						const aDue = a.dueDate ? moment(a.dueDate).valueOf() : Number.MAX_SAFE_INTEGER;
						const bDue = b.dueDate ? moment(b.dueDate).valueOf() : Number.MAX_SAFE_INTEGER;
						comparison = aDue - bDue;
						break;
					case "title":
						comparison = a.task.localeCompare(b.task);
						break;
					case "timeSpent":
						const aTime = getTaskTimerDuration(a);
						const bTime = getTaskTimerDuration(b);
						comparison = aTime - bTime;
						break;
				}
				
				return metadata.sortOrder === "asc" ? comparison : -comparison;
			});
			
			return sorted;
		};
		
		// Function to sort and render tasks
		const sortAndRenderTasks = () => {
			// Always use tasksByStatus as the source of truth for task order
			const currentTasks = tasksByStatus.get(status) || [];
			
			// Check if manual sorting is enabled for this column
			const metadata = getColumnMetadata();
			const useManualSort = metadata.manualSort === true;
			
			// Sort tasks only if manual sort is not enabled
			const tasksToRender = useManualSort ? currentTasks : sortTasks(currentTasks);
			
			// Remove old task elements from the taskElements Map
			const oldElements = Array.from(tasksEl.children);
			oldElements.forEach(el => {
				if (taskElements.has(el as HTMLElement)) {
					taskElements.delete(el as HTMLElement);
				}
			});
			
			// Clear existing tasks from DOM
			tasksEl.empty();
			
			// Render tasks (sorted or manual order)
			tasksToRender.forEach(task => {
				// Update task status to match the column name (handles case normalization)
				task.status = status;
				createTaskElement(task, status, tasksEl);
			});
		};
		
		// Initial render with sorting
		sortAndRenderTasks();
		
		// Column drop zone handlers
		setupColumnDropHandlers(tasksEl, status);
	});
	}
	
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
				const tasksEl = colEl.querySelector(".kanban-column-tasks");
				if (tasksEl) {
					tasksEl.querySelectorAll(".kanban-drop-indicator").forEach(el => el.remove());
				}
			});
		});
	}
	
	// Set up drop handlers for columns - supports both reordering and moving between columns
	function setupColumnDropHandlers(tasksContainer: HTMLElement, targetStatus: KanbanStatus) {
		let draggedOverTask: HTMLElement | null = null;
		let insertBefore = true;
		
		tasksContainer.addEventListener("dragover", (e: DragEvent) => {
			e.preventDefault();
			if (!e.dataTransfer) return;
			
			e.dataTransfer.dropEffect = "move";
			
			// Find the task being dragged over
			const target = e.target as HTMLElement;
			const taskCard = target.closest(".kanban-task") as HTMLElement;
			
			if (taskCard && taskCard.parentElement === tasksContainer) {
				// Remove previous indicators
				tasksContainer.querySelectorAll(".kanban-drop-indicator").forEach(el => el.remove());
				
				// Determine if we should insert before or after based on mouse position
				const rect = taskCard.getBoundingClientRect();
				
				// For vertical view: check vertical position
				// For horizontal view: check horizontal position
				const isVerticalLayout = tasksContainer.classList.contains("kanban-column-tasks") && 
					tasksContainer.style.flexDirection !== "row";
				
				if (isVerticalLayout || data.view === "vertical") {
					// Vertical layout: use Y position
					const midpoint = rect.top + rect.height / 2;
					insertBefore = e.clientY < midpoint;
				} else {
					// Horizontal layout: use X position
					const midpoint = rect.left + rect.width / 2;
					insertBefore = e.clientX < midpoint;
				}
				
				// Add visual indicator
				const indicator = document.createElement("div");
				indicator.className = "kanban-drop-indicator";
				
				if (insertBefore) {
					taskCard.parentElement?.insertBefore(indicator, taskCard);
				} else {
					taskCard.parentElement?.insertBefore(indicator, taskCard.nextSibling);
				}
				
				draggedOverTask = taskCard;
			} else {
				// Dragging over empty space - highlight column
				const columnEl = tasksContainer.parentElement;
				if (columnEl) {
					columnEl.classList.add("kanban-column-drag-over");
				}
			}
		});
		
		tasksContainer.addEventListener("dragleave", (e: DragEvent) => {
			const columnEl = tasksContainer.parentElement;
			if (columnEl && !columnEl.contains(e.relatedTarget as Node)) {
				columnEl.classList.remove("kanban-column-drag-over");
				tasksContainer.querySelectorAll(".kanban-drop-indicator").forEach(el => el.remove());
				draggedOverTask = null;
			}
		});
		
		tasksContainer.addEventListener("drop", async (e: DragEvent) => {
			e.preventDefault();
			if (!e.dataTransfer) return;
			
			// Clean up visual indicators
			const columnEl = tasksContainer.parentElement;
			if (columnEl) {
				columnEl.classList.remove("kanban-column-drag-over");
			}
			tasksContainer.querySelectorAll(".kanban-drop-indicator").forEach(el => el.remove());
			
			const sourceStatus = e.dataTransfer.getData("application/x-kanban-status") as KanbanStatus;
			const taskText = e.dataTransfer.getData("text/plain");
			
			// Find the task element in the source column
			const sourceColumnEl = columnElements.get(sourceStatus);
			if (!sourceColumnEl) return;
			
			const sourceTasksEl = sourceColumnEl.querySelector(".kanban-column-tasks");
			if (!sourceTasksEl) return;
			
			const taskEl = Array.from(sourceTasksEl.children).find(
				(el) => el.getAttribute("data-task") === taskText
			) as HTMLElement;
			
			if (!taskEl) return;
			
			// Get task info
			const taskInfo = taskElements.get(taskEl);
			if (!taskInfo) {
				console.warn("Kanban: Could not find task info for:", taskText);
				return;
			}
			
			// Handle reordering within same column or moving to different column
			if (sourceStatus === targetStatus && draggedOverTask) {
				// Reordering within same column
				const targetTaskName = draggedOverTask.getAttribute("data-task");
				
				// Don't do anything if dropping on itself
				if (targetTaskName === taskText) {
					console.log("Kanban: Dropped task on itself, ignoring");
					draggedOverTask = null;
					return;
				}
				
				const statusTasks = tasksByStatus.get(targetStatus) || [];
				
				// Find original indices
				const sourceIndex = statusTasks.findIndex(t => t.task === taskText);
				const targetIndexOriginal = statusTasks.findIndex(t => t.task === targetTaskName);
				
				if (sourceIndex < 0 || targetIndexOriginal < 0) {
					console.warn("Kanban: Could not find source or target task in array");
					return;
				}
				
				// Remove the moved task from its current position
				const [movedTaskObj] = statusTasks.splice(sourceIndex, 1);
				
				// Recalculate target index after removal
				const newTargetIndex = statusTasks.findIndex(t => t.task === targetTaskName);
				
				// Insert at the correct position
				const insertIndex = insertBefore ? newTargetIndex : newTargetIndex + 1;
				statusTasks.splice(insertIndex, 0, movedTaskObj);
				tasksByStatus.set(targetStatus, statusTasks);
				
				// Enable manual sort for this column
				const metadata = data.columnMetadata?.find(m => m.name === targetStatus);
				if (metadata) {
					metadata.manualSort = true;
					console.log("Kanban: Enabled manual sort for column", targetStatus);
				}
				
				// Move DOM element
				if (insertBefore) {
					draggedOverTask.parentElement?.insertBefore(taskEl, draggedOverTask);
				} else {
					const nextElement = draggedOverTask.nextSibling;
					if (nextElement) {
						draggedOverTask.parentElement?.insertBefore(taskEl, nextElement);
					} else {
						draggedOverTask.parentElement?.appendChild(taskEl);
					}
				}
				
				// Don't update timestamp or status when reordering within same column
				console.log("Kanban: Reordered task", taskText, "within", targetStatus, "from index", sourceIndex, "to", insertIndex);
				
				// Save changes
				await saveTasksToFile(taskText);
			} else {
				// Moving to different column
				taskEl.setAttribute("data-status", targetStatus);
				
				// Update task info
				taskInfo.status = targetStatus;
				taskInfo.task.status = targetStatus;
				taskInfo.task.updateDateTime = moment().toISOString();
				
				console.log("Kanban: Updating task", taskText, "to status", targetStatus);
				
				// Update tasksByStatus map
				const oldStatusTasks = tasksByStatus.get(sourceStatus) || [];
				const filteredOldTasks = oldStatusTasks.filter(t => t.task !== taskText);
				tasksByStatus.set(sourceStatus, filteredOldTasks);
				
				const newStatusTasks = tasksByStatus.get(targetStatus) || [];
				
				if (draggedOverTask) {
					// Insert at specific position
					const targetTaskName = draggedOverTask.getAttribute("data-task");
					
					// Don't insert if target is the same task (shouldn't happen but safety check)
					if (targetTaskName === taskText) {
						newStatusTasks.push(taskInfo.task);
						tasksContainer.appendChild(taskEl);
					} else {
						const targetIndex = newStatusTasks.findIndex(t => t.task === targetTaskName);
						
						if (targetIndex >= 0) {
							const insertIndex = insertBefore ? targetIndex : targetIndex + 1;
							newStatusTasks.splice(insertIndex, 0, taskInfo.task);
							
							// Move DOM element
							if (insertBefore) {
								draggedOverTask.parentElement?.insertBefore(taskEl, draggedOverTask);
							} else {
								const nextElement = draggedOverTask.nextSibling;
								if (nextElement) {
									draggedOverTask.parentElement?.insertBefore(taskEl, nextElement);
								} else {
									draggedOverTask.parentElement?.appendChild(taskEl);
								}
							}
						} else {
							newStatusTasks.push(taskInfo.task);
							tasksContainer.appendChild(taskEl);
						}
					}
				} else {
					// Add at the end
					newStatusTasks.push(taskInfo.task);
					tasksContainer.appendChild(taskEl);
				}
				
				tasksByStatus.set(targetStatus, newStatusTasks);
				
				// Update the update datetime display
				const updateDateTimeUpdateFn = (taskEl as any).updateUpdateDateTimeDisplay;
				if (updateDateTimeUpdateFn) {
					updateDateTimeUpdateFn();
				}
				
				// Handle automatic timer control based on column state
				const newColumnState = getColumnState(targetStatus);
				
				if (newColumnState === "in-progress") {
					// Stop all other running timers
					taskElements.forEach((info, otherTaskEl) => {
						if (info.task !== taskInfo.task && isTaskTimerRunning(info.task)) {
							stopTaskTimer(info.task);
							const updateFn = (otherTaskEl as any).updateTimerDisplay;
							if (updateFn) {
								updateFn();
							}
							console.log("Kanban: Auto-stopped timer for task:", info.task.task);
						}
					});
					
					// Start the timer for this task if not already running
					if (!isTaskTimerRunning(taskInfo.task)) {
						startTaskTimer(taskInfo.task);
						const updateFn = (taskEl as any).updateTimerDisplay;
						if (updateFn) {
							updateFn();
						}
						console.log("Kanban: Auto-started timer for task:", taskInfo.task.task);
					}
				} else {
					// Stop the timer if running (for both "todo" and "done" states)
					if (isTaskTimerRunning(taskInfo.task)) {
						stopTaskTimer(taskInfo.task);
						const updateFn = (taskEl as any).updateTimerDisplay;
						if (updateFn) {
							updateFn();
						}
						const stateLabel = newColumnState === "done" ? "done" : "todo";
						console.log(`Kanban: Auto-stopped timer (task ${stateLabel}):`, taskInfo.task.task);
					}
				}
				
				// Save changes
				await saveTasksToFile(taskText);
			}
			
			// Reset
			draggedOverTask = null;
		});
	}
	
	// Set up interval to update timer displays for running timers
	const timerInterval = window.setInterval(() => {
		// Check if container is still in the DOM
		if (!containerEl.isConnected) {
			window.clearInterval(timerInterval);
			return;
		}
		
		// Update all task timer displays and progress bars
		taskElements.forEach((info, taskEl) => {
			if (isTaskTimerRunning(info.task)) {
				const updateFn = (taskEl as any).updateTimerDisplay;
				if (updateFn) {
					updateFn();
				}
				const updateProgressFn = (taskEl as any).updateProgressBar;
				if (updateProgressFn) {
					updateProgressFn();
				}
			}
		});
	}, 1000);
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
					const kanbanBlockRegex = /```\s*kanban\s*\n?([\s\S]*?)\n?```/g;
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
		// Match kanban code blocks more flexibly - handle different whitespace patterns (including spaces before "kanban")
		const kanbanBlockRegex = /```\s*kanban\s*\n?([\s\S]*?)\n?```/g;
		let updatedContent = content;
		let found = false;
		let matchCount = 0;

	// First pass: scan all blocks to find the best match
	interface BlockInfo {
		match: string;
		blockContent: string;
		normalizedBlock: string;
		blockTasks: any[];
		matchCount: number;
		containsTask: boolean;
		hasSameTasks: boolean;
		isValidKanbanBlock: boolean;
	}
	
	const blocks: BlockInfo[] = [];
	let tempMatchCount = 0;
	
	// Collect all kanban blocks
	content.replace(kanbanBlockRegex, (match, blockContent) => {
		tempMatchCount++;
		const normalizedBlock = blockContent.trim();
		
		// Parse the block
		let blockTasks: any[] = [];
		let isValidKanbanBlock = false;
		try {
			const blockData = JSON.parse(normalizedBlock);
			blockTasks = Array.isArray(blockData) ? blockData : (blockData.tasks || []);
			isValidKanbanBlock = blockTasks.length > 0;
		} catch (e) {
			// Invalid block, skip
		}
		
		// Check if this block contains the task we're updating
		const containsTask = taskText ? blockTasks.some((t: any) => t && t.task === taskText) : false;
		
		// Check if this block contains the same set of tasks
		const currentTaskTexts = (currentData.tasks || []).map(t => t.task).sort();
		const blockTaskTexts = blockTasks.map((t: any) => t && t.task).filter(Boolean).sort();
		const hasSameTasks = currentTaskTexts.length > 0 && 
		                     currentTaskTexts.length === blockTaskTexts.length &&
		                     currentTaskTexts.every((text, idx) => text === blockTaskTexts[idx]);
		
		blocks.push({
			match,
			blockContent,
			normalizedBlock,
			blockTasks,
			matchCount: tempMatchCount,
			containsTask,
			hasSameTasks,
			isValidKanbanBlock
		});
		
		return match;
	});
	
	console.log("Kanban: Found", blocks.length, "kanban blocks");
	
	// Determine which block to update
	let blockToUpdate: BlockInfo | null = null;
	const isNewTask = taskText === "";
	
	if (isNewTask) {
		// For new tasks, update the first valid block
		blockToUpdate = blocks.find(b => b.isValidKanbanBlock) || blocks[0] || null;
		console.log("Kanban: New task - will update block", blockToUpdate?.matchCount);
	} else {
		// For task updates, prioritize: containsTask > hasSameTasks > first block
		blockToUpdate = blocks.find(b => b.containsTask) || 
		                blocks.find(b => b.hasSameTasks) ||
		                blocks[0] ||
		                null;
		
		if (blockToUpdate) {
			if (blockToUpdate.containsTask) {
				console.log("Kanban: Found block containing task:", taskText, "- block", blockToUpdate.matchCount);
			} else if (blockToUpdate.hasSameTasks) {
				console.log("Kanban: Found block with same task set - block", blockToUpdate.matchCount);
			} else {
				console.log("Kanban: Using first block as fallback - block", blockToUpdate.matchCount);
			}
		}
	}
	
	if (!blockToUpdate) {
		console.warn("Kanban: No kanban blocks found to update");
		return;
	}
	
	// Second pass: update only the selected block
	matchCount = 0;
	updatedContent = updatedContent.replace(kanbanBlockRegex, (match, blockContent) => {
		matchCount++;
		
		// Only update the block we selected
		if (matchCount === blockToUpdate!.matchCount) {
			found = true;
			const normalizedBlock = blockContent.trim();
			
			// Use the updated data from currentData (which already has the updated status)
			const updatedData = currentData;
			
			// Generate new JSON string
			let newBlockContent: string;
			
			// If we have custom columns or collapsed columns, always use object format
			const hasCustomColumns = updatedData.columns && updatedData.columns.length > 0;
			const hasCollapsedColumns = updatedData.collapsedColumns && updatedData.collapsedColumns.length > 0;
			
			if (normalizedBlock.startsWith("[") && !hasCustomColumns && !hasCollapsedColumns) {
				// Original was array format and no custom columns or collapsed state - keep array format
				newBlockContent = JSON.stringify(updatedData.tasks || [], null, 2);
			} else {
				// Use object format if: original was object, or we have custom columns, or we have collapsed columns
				newBlockContent = JSON.stringify(updatedData, null, 2);
			}
			
			console.log("Kanban: Updating kanban block", matchCount, "with", updatedData.tasks?.length || 0, "tasks");
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

