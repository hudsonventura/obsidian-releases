import { Modal, App, Setting, moment } from "obsidian";
import { KanbanTask } from "../types";
import { DueDateModal } from "./due-date-modal";

export class AddTaskModal extends Modal {
	private callback: (task: KanbanTask | null) => void;
	private taskName: string = "";
	private targetTime: string = "";
	private dueDate: string | undefined = undefined;

	constructor(app: App, callback: (task: KanbanTask | null) => void) {
		super(app);
		this.callback = callback;
	}

	onOpen(): void {
		const { contentEl } = this;
		contentEl.empty();

		contentEl.createEl("h2", { text: "Add New Task" });

		// Declare targetTimeInput before it's used
		let targetTimeInput: any;

		// Task name input
		let taskNameInput: any;
		new Setting(contentEl)
			.setName("Task name")
			.setDesc("Enter the name of the task")
			.addText((text) => {
				taskNameInput = text;
				text
					.setPlaceholder("Task name...")
					.setValue(this.taskName)
					.onChange((value) => {
						this.taskName = value;
					});
				text.inputEl.focus();
				text.inputEl.addEventListener("keydown", (e) => {
					if (e.key === "Enter") {
						e.preventDefault();
						// Move to target time input if it exists
						if (targetTimeInput) {
							targetTimeInput.inputEl.focus();
						} else {
							// If target time input doesn't exist yet, just submit
							this.submit();
						}
					}
				});
			});

		// Target time input
		new Setting(contentEl)
			.setName("Target time")
			.setDesc("Optional. Set a due time or time estimate (e.g., 2h, 1d, 2025-12-31)")
			.addText((text) => {
				targetTimeInput = text;
				text
					.setPlaceholder("e.g., 2h, 1d, 2025-12-31")
					.setValue(this.targetTime)
					.onChange((value) => {
						this.targetTime = value;
					});
				text.inputEl.addEventListener("keydown", (e) => {
					if (e.key === "Enter") {
						e.preventDefault();
						// Move to due date button or submit
						if (dueDateButton) {
							dueDateButton.focus();
						} else {
							this.submit();
						}
					}
				});
			});

		// Due date setting
		let dueDateButton: HTMLButtonElement | null = null;
		const dueDateSetting = new Setting(contentEl)
			.setName("Due date")
			.setDesc("Optional. Set a due date and time for this task")
			.addButton((btn) => {
				dueDateButton = btn.buttonEl;
				const updateDueDateButton = () => {
					if (this.dueDate) {
						const date = moment(this.dueDate);
						btn.setButtonText(date.format("MMM D, YYYY HH:mm"));
						btn.buttonEl.classList.add("has-due-date");
					} else {
						btn.setButtonText("Set due date");
						btn.buttonEl.classList.remove("has-due-date");
					}
				};
				updateDueDateButton();
				
				btn.onClick(() => {
					const modal = new DueDateModal(this.app, this.dueDate, this.targetTime, (date, targetTime) => {
						if (date === null) {
							this.dueDate = undefined;
						} else {
							this.dueDate = date;
						}
						
						// Update target time if provided
						if (targetTime !== null && targetTime !== "") {
							this.targetTime = targetTime;
							if (targetTimeInput) {
								targetTimeInput.setValue(targetTime);
							}
						}
						
						updateDueDateButton();
					});
					modal.open();
				});
				
				btn.buttonEl.addEventListener("keydown", (e) => {
					if (e.key === "Enter") {
						e.preventDefault();
						this.submit();
					}
				});
			});

		// Buttons
		const buttonContainer = contentEl.createDiv("modal-button-container");
		buttonContainer.style.display = "flex";
		buttonContainer.style.justifyContent = "flex-end";
		buttonContainer.style.gap = "0.5rem";
		buttonContainer.style.marginTop = "1rem";

		new Setting(buttonContainer)
			.addButton((btn) =>
				btn
					.setButtonText("Add Task")
					.setCta()
					.onClick(() => {
						this.submit();
					})
			)
			.addButton((btn) =>
				btn
					.setButtonText("Cancel")
					.onClick(() => {
						this.close();
						this.callback(null);
					})
			);
	}

	private submit(): void {
		const trimmedTaskName = this.taskName.trim();
		
		if (!trimmedTaskName) {
			// Show error or just close
			return;
		}

		const newTask: KanbanTask = {
			task: trimmedTaskName
			// Status will be set by the renderer based on available columns
		};

		// Add target time if provided
		let trimmedTargetTime = this.targetTime.trim();
		if (trimmedTargetTime) {
			// If input is just a number, treat it as hours
			const numberOnlyPattern = /^\d+(\.\d+)?$/;
			if (numberOnlyPattern.test(trimmedTargetTime)) {
				trimmedTargetTime = trimmedTargetTime + "h";
			}
			newTask.targetTime = trimmedTargetTime;
		}

		// Add due date if provided
		if (this.dueDate) {
			newTask.dueDate = this.dueDate;
		}

		this.close();
		this.callback(newTask);
	}

	onClose(): void {
		const { contentEl } = this;
		contentEl.empty();
	}
}

