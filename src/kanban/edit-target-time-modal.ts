import { Modal, App, Setting } from "obsidian";

export class EditTargetTimeModal extends Modal {
	private callback: (targetTime: string | null) => void;
	private targetTimeInput: string;

	constructor(app: App, currentTargetTime: string | undefined, callback: (targetTime: string | null) => void) {
		super(app);
		this.targetTimeInput = currentTargetTime || "";
		this.callback = callback;
	}

	onOpen(): void {
		const { contentEl } = this;
		contentEl.empty();

		contentEl.createEl("h2", { text: "Edit Target Time" });

		// Info section
		const infoEl = contentEl.createDiv("edit-target-time-info");
		infoEl.createEl("p", { text: "Enter the target time for this task" });
		
		const exampleList = infoEl.createEl("ul", { cls: "edit-target-time-examples" });
		exampleList.createEl("li", { text: "Examples: 2h, 30m, 1h 30m, 3.5h" });
		exampleList.createEl("li", { text: "Leave empty to remove target time" });

		// Target time input
		let targetTimeInputField: any;
		new Setting(contentEl)
			.setName("Target Time")
			.setDesc("Format: Xh Ym (e.g., 2h 30m, 1.5h, 45m)")
			.addText((text) => {
				targetTimeInputField = text;
				text
					.setPlaceholder("2h 30m")
					.setValue(this.targetTimeInput)
					.onChange((value) => {
						this.targetTimeInput = value;
					});
				text.inputEl.focus();
				text.inputEl.select();
				
				// Handle Enter to submit
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
					.setButtonText("Clear")
					.setWarning()
					.onClick(() => {
						this.targetTimeInput = "";
						this.submit();
					})
			)
			.addButton((btn) =>
				btn
					.setButtonText("Save")
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
		// Trim the input
		let trimmedInput = this.targetTimeInput.trim();
		
		// If empty, return empty string to clear target time
		if (trimmedInput.length === 0) {
			this.close();
			this.callback("");
			return;
		}

		// If input is just a number, treat it as hours
		const numberOnlyPattern = /^\d+(\.\d+)?$/;
		if (numberOnlyPattern.test(trimmedInput)) {
			trimmedInput = trimmedInput + "h";
		}

		// Basic validation - check if it matches common time patterns
		const timePattern = /^(\d+(\.\d+)?\s*[hH])?(\s*\d+\s*[mM])?$/;
		if (!timePattern.test(trimmedInput)) {
			// Show error but don't close
			const errorEl = this.contentEl.querySelector(".edit-target-time-error");
			if (errorEl) {
				errorEl.remove();
			}
			const newError = this.contentEl.createDiv("edit-target-time-error");
			newError.style.color = "var(--text-error)";
			newError.style.marginTop = "0.5rem";
			newError.setText("Invalid format. Use: 2h, 30m, or 1h 30m");
			return;
		}

		this.close();
		this.callback(trimmedInput);
	}

	onClose(): void {
		const { contentEl } = this;
		contentEl.empty();
	}
}

