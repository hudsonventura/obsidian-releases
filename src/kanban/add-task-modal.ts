import { Modal, App, Setting } from "obsidian";
import { KanbanTask } from "../types";

export class AddTaskModal extends Modal {
	private callback: (task: KanbanTask | null) => void;
	private taskName: string = "";
	private targetTime: string = "";

	constructor(app: App, callback: (task: KanbanTask | null) => void) {
		super(app);
		this.callback = callback;
	}

	onOpen(): void {
		const { contentEl } = this;
		contentEl.empty();

		contentEl.createEl("h2", { text: "Add New Task" });

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
						// Move to target time input
						targetTimeInput.inputEl.focus();
					}
				});
			});

		// Target time input
		let targetTimeInput: any;
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
		const trimmedTargetTime = this.targetTime.trim();
		if (trimmedTargetTime) {
			newTask.targetTime = trimmedTargetTime;
		}

		this.close();
		this.callback(newTask);
	}

	onClose(): void {
		const { contentEl } = this;
		contentEl.empty();
	}
}

