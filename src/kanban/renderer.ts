import { Plugin, MarkdownPostProcessorContext, App, TFile, moment, Menu, MarkdownRenderer, Component, Modal } from "obsidian";
import { KanbanTask, KanbanData, KanbanStatus, TimerEntry, ColumnState, ColumnMetadata, KanbanView, SortField, SortOrder } from "../types";
import { TimerEntriesModal } from "./timer-modal";
import { AddTaskModal } from "./add-task-modal";
import { AddStatusModal } from "./add-status-modal";
import { EditTagsModal } from "./edit-tags-modal";
import { DueDateModal } from "./due-date-modal";
import { EditTargetTimeModal } from "./edit-target-time-modal";

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

export function renderKanban(
	containerEl: HTMLElement, 
	data: KanbanData, 
	plugin: Plugin, 
	ctx: MarkdownPostProcessorContext,
	originalSource: string
) {
	console.log("Kanban Plugin: renderKanban called", { containerEl, data });
	
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
		const metadata = data.columnMetadata?.find(m => m.name === status);
		return metadata?.state || "todo";
	};
	
	// Initialize view mode (default to horizontal)
	if (!data.view) {
		data.view = "horizontal";
	}
	
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
	
	// Create header with buttons
	const headerEl = containerEl.createDiv("kanban-header");
	
	// View toggle button on the left
	const viewToggleButton = headerEl.createEl("button", { 
		cls: "kanban-view-toggle-button"
	});
	
	const updateViewButton = () => {
		if (data.view === "horizontal") {
			viewToggleButton.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="7" height="7"></rect><rect x="14" y="3" width="7" height="7"></rect><rect x="14" y="14" width="7" height="7"></rect><rect x="3" y="14" width="7" height="7"></rect></svg><span>Vertical View</span>`;
		} else {
			viewToggleButton.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="3" y1="12" x2="21" y2="12"></line><line x1="3" y1="6" x2="21" y2="6"></line><line x1="3" y1="18" x2="21" y2="18"></line></svg><span>Horizontal View</span>`;
		}
	};
	updateViewButton();
	
	viewToggleButton.addEventListener("click", async () => {
		// Toggle view
		data.view = data.view === "horizontal" ? "vertical" : "horizontal";
		
		// Update button
		updateViewButton();
		
		// Update board classes
		boardEl.removeClass("kanban-board-horizontal", "kanban-board-vertical");
		boardEl.addClass(`kanban-board-${data.view}`);
		
		// Save view preference
		await saveViewPreference();
		
		console.log("Kanban: View toggled to", data.view);
	});
	
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
		
		// Target time and timer controls row
		const targetTimeRow = taskEl.createDiv("kanban-task-target-time-row");
		
		// Target time display
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
		
		// Timer buttons on the same row
		const timerButtons = targetTimeRow.createDiv("kanban-timer-buttons");
		
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
					
					// Add appropriate color class based on percentage
					let colorClass = "green";
					if (percentage >= 100) {
						colorClass = "red";
					} else if (percentage >= 85) {
						colorClass = "orange";
					} else if (percentage >= 70) {
						colorClass = "yellow";
					}
					
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
		
		// DateTime row (update datetime and due date)
		const dateTimeRow = taskEl.createDiv("kanban-task-datetime-row");
		
		// Update DateTime display on the left
		const updateDateTimeEl = dateTimeRow.createDiv("kanban-task-update-datetime");
		
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
				const formattedDate = updateDate.format("MMM D, YYYY HH:mm");
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
		
		// Due date display on the right
		const dueDateEl = dateTimeRow.createDiv("kanban-task-due-date");
		
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
				const formattedDate = dueDate.format("MMM D, YYYY HH:mm");
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
		
		// Tags section (below datetime row)
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
			view: data.view
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
			
			allTasks.push(taskData);
		});
		
		console.log("Kanban: Saving collapsed state:", data.collapsedColumns);
		console.log("Kanban: Saving column metadata:", data.columnMetadata);
		
		await updateKanbanInFile(plugin.app, ctx, "", "todo" as KanbanStatus, originalSource, { 
			tasks: allTasks, 
			columns: data.columns,
			columnMetadata: data.columnMetadata,
			collapsedColumns: data.collapsedColumns,
			view: data.view
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
			view: data.view
		}).catch(err => {
			console.error("Error saving view preference to file:", err);
		});
	}
	
	// Add status button handler - opens modal
	addStatusButton.addEventListener("click", () => {
		const modal = new AddStatusModal(plugin.app, statusColumns, async (newStatus) => {
			if (!newStatus) return; // User cancelled
			
			// Add the new status to the columns array
			if (!data.columns || data.columns.length === 0) {
				// Initialize with current columns (including any existing ones)
				data.columns = [...statusColumns];
			}
			
			// Add the new status
			data.columns.push(newStatus);
			
			console.log("Kanban: Adding new status column:", newStatus);
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
			
			// Find the first column (prefer "todo" if it exists, otherwise use first available)
			const firstStatus = statusColumns[0];
			let targetColumn = columnElements.get("todo");
			let targetStatus: KanbanStatus = "todo";
			
			if (!targetColumn && firstStatus) {
				// "todo" doesn't exist, use first column
				targetColumn = columnElements.get(firstStatus);
				targetStatus = firstStatus;
			}
			
			if (!targetColumn) {
				console.error("Kanban: Could not find any column to add task");
				return;
			}
			
			const tasksContainer = targetColumn.querySelector(".kanban-column-tasks") as HTMLElement;
			if (!tasksContainer) {
				console.error("Kanban: Could not find tasks container in column");
				return;
			}
			
			// Set the task status to the target column
			newTask.status = targetStatus;
			
			// Create and add the task element
			const taskEl = createTaskElement(newTask, targetStatus, tasksContainer);
			
			// Verify the task was added to the map
			if (!taskElements.has(taskEl)) {
				console.error("Kanban: Failed to add task to taskElements map");
				return;
			}
			
			// Update the file
			await saveTasksToFile();
			
			console.log("Kanban: Created new task:", newTask.task, "in column:", targetStatus);
		});
		modal.open();
	});
	
	statusColumns.forEach(status => {
		const displayName = statusToDisplayName(status);
		const columnEl = boardEl.createDiv("kanban-column");
		columnEl.setAttr("data-status", status);
		columnEl.classList.add("kanban-column-dropzone");
		columnElements.set(status, columnEl);
		
		// Column header
		const headerEl = columnEl.createDiv("kanban-column-header");
		
		// Collapse button
		const collapseBtn = headerEl.createEl("button", {
			cls: "kanban-column-collapse-btn"
		});
		collapseBtn.setAttribute("aria-label", "Toggle column");
		
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
		
		// Add state indicator to title
		const updateHeaderTitle = () => {
			const columnState = getColumnState(status);
			const stateEmoji = columnState === "in-progress" ? "▶️ " : columnState === "done" ? "✅ " : "";
			headerTitle.setText(stateEmoji + displayName);
		};
		updateHeaderTitle();
		
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
				metadata = { name: status, state: "todo", sortField: "updateDateTime", sortOrder: "desc" };
				if (!data.columnMetadata) {
					data.columnMetadata = [];
				}
				data.columnMetadata.push(metadata);
			}
			if (!metadata.sortField) metadata.sortField = "updateDateTime";
			if (!metadata.sortOrder) metadata.sortOrder = "desc";
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
			sortFieldButton.innerHTML = `${fieldIcons[metadata.sortField!]} ${fieldLabels[metadata.sortField!]}`;
			
			// Update order button
			sortOrderButton.innerHTML = metadata.sortOrder === "asc" ? "↑" : "↓";
		};
		
		updateSortButtons();
		
		// Sort field button click - cycle through sort fields
		sortFieldButton.addEventListener("click", async (e) => {
			e.stopPropagation();
			const metadata = getColumnMetadata();
			const fields: SortField[] = ["updateDateTime", "dueDate", "title", "timeSpent"];
			const currentIndex = fields.indexOf(metadata.sortField!);
			metadata.sortField = fields[(currentIndex + 1) % fields.length];
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
			const currentState = getColumnState(status);
			
			menu.addItem((item) => {
				item
					.setTitle("Set as To Do State")
					.setIcon("circle")
					.setChecked(currentState === "todo")
					.onClick(async () => {
						const metadata = data.columnMetadata?.find(m => m.name === status);
						if (metadata) {
							metadata.state = "todo";
							updateHeaderTitle();
							await saveCollapsedState();
							console.log("Kanban: Set column", status, "to todo state");
						}
					});
			});
			
			menu.addItem((item) => {
				item
					.setTitle("Set as In Progress State")
					.setIcon("play")
					.setChecked(currentState === "in-progress")
					.onClick(async () => {
						const metadata = data.columnMetadata?.find(m => m.name === status);
						if (metadata) {
							metadata.state = "in-progress";
							updateHeaderTitle();
							await saveCollapsedState();
							console.log("Kanban: Set column", status, "to in-progress state");
						}
					});
			});
			
			menu.addItem((item) => {
				item
					.setTitle("Set as Done State")
					.setIcon("check")
					.setChecked(currentState === "done")
					.onClick(async () => {
						const metadata = data.columnMetadata?.find(m => m.name === status);
						if (metadata) {
							metadata.state = "done";
							updateHeaderTitle();
							await saveCollapsedState();
							console.log("Kanban: Set column", status, "to done state");
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
			chevronIcon.innerHTML = '<polyline points="9 18 15 12 9 6"></polyline>';
		}
		
		// Collapse button click handler
		collapseBtn.addEventListener("click", async (e) => {
			e.stopPropagation();
			isCollapsed = !isCollapsed;
			
			if (isCollapsed) {
				columnEl.addClass("kanban-column-collapsed");
				tasksEl.style.display = "none";
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
			const tasks = tasksByStatus.get(status) || [];
			const sortedTasks = sortTasks(tasks);
			
			// Remove old task elements from the taskElements Map
			const oldElements = Array.from(tasksEl.children);
			oldElements.forEach(el => {
				if (taskElements.has(el as HTMLElement)) {
					taskElements.delete(el as HTMLElement);
				}
			});
			
			// Clear existing tasks from DOM
			tasksEl.empty();
			
			// Render sorted tasks
			sortedTasks.forEach(task => {
				createTaskElement(task, task.status || "todo", tasksEl);
			});
		};
		
		// Initial render with sorting
		sortAndRenderTasks();
		
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
				
				// Update only the update datetime when moving between statuses
				const currentDateTime = moment().toISOString();
				taskInfo.task.updateDateTime = currentDateTime;
				console.log("Kanban: Updated update datetime:", currentDateTime);
				
				// Update the update datetime display if the update function exists
				const updateDateTimeUpdateFn = (taskEl as any).updateUpdateDateTimeDisplay;
				if (updateDateTimeUpdateFn) {
					updateDateTimeUpdateFn();
				}
				
				console.log("Kanban: Updating task", taskText, "to status", targetStatus);
				
				// Handle automatic timer control based on column state
				const newColumnState = getColumnState(targetStatus);
				
				if (newColumnState === "in-progress") {
					// Stop all other running timers
					taskElements.forEach((info, otherTaskEl) => {
						if (info.task !== taskInfo.task && isTaskTimerRunning(info.task)) {
							stopTaskTimer(info.task);
							// Update the display for the stopped task
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
				
				// Update the file with the new status
				saveTasksToFile(taskText).catch(err => {
					console.error("Error saving task status change:", err);
				});
			} else {
				console.warn("Kanban: Could not find task info for:", taskText);
			}
		});
	}
	
	// Set up interval to update timer displays for running timers
	const timerInterval = window.setInterval(() => {
		// Check if container is still in the DOM
		if (!containerEl.isConnected) {
			window.clearInterval(timerInterval);
			return;
		}
		
		// Update all task timer displays
		taskElements.forEach((info, taskEl) => {
			if (isTaskTimerRunning(info.task)) {
				const updateFn = (taskEl as any).updateTimerDisplay;
				if (updateFn) {
					updateFn();
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

