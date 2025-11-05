import { Plugin, MarkdownPostProcessorContext, App, TFile, moment, Menu, MarkdownRenderer, Component } from "obsidian";
import { KanbanTask, KanbanData, KanbanStatus, TimerEntry } from "../types";
import { TimerEntriesModal } from "./timer-modal";
import { AddTaskModal } from "./add-task-modal";
import { AddStatusModal } from "./add-status-modal";

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
			if (!progressFill || !progressText || !task.targetTime) return;
			
			const totalDuration = getTaskTimerDuration(task);
			const targetDuration = parseTargetTime(task.targetTime);
			
			if (targetDuration > 0) {
				const percentage = (totalDuration / targetDuration) * 100;
				const displayPercentage = Math.min(100, percentage);
				
				progressFill.setCssStyles({ width: `${displayPercentage}%` });
				
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
				const isRunning = isTaskTimerRunning(task);
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
		
		// Progress bar at the bottom (only if target time exists)
		if (task.targetTime && parseTargetTime(task.targetTime) > 0) {
			progressContainer = taskEl.createDiv("kanban-progress-container");
			const progressBar = progressContainer.createDiv("kanban-progress-bar");
			progressFill = progressBar.createDiv("kanban-progress-fill");
			progressText = progressContainer.createDiv("kanban-progress-text");
			
			// Initial update
			updateProgressBar();
		}
		
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
			
			// Delete Task option
			menu.addSeparator();
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
			collapsedColumns: data.collapsedColumns
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
			
			allTasks.push(taskData);
		});
		
		console.log("Kanban: Saving collapsed state:", data.collapsedColumns);
		
		await updateKanbanInFile(plugin.app, ctx, "", "todo" as KanbanStatus, originalSource, { 
			tasks: allTasks, 
			columns: data.columns,
			collapsedColumns: data.collapsedColumns
		}).catch(err => {
			console.error("Error saving collapsed state to file:", err);
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
		headerTitle.setText(displayName);
		
		// Column tasks container
		const tasksEl = columnEl.createDiv("kanban-column-tasks");
		
		// Check if this column is collapsed in the saved state
		const collapsedColumns = data.collapsedColumns || [];
		let isCollapsed = collapsedColumns.includes(status);
		
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

