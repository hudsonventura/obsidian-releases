import { Modal, App, Setting } from "obsidian";

export class AddStatusModal extends Modal {
	private callback: (statusName: string | null) => void;
	private statusName: string = "";
	private existingStatuses: string[];

	constructor(app: App, existingStatuses: string[], callback: (statusName: string | null) => void) {
		super(app);
		this.existingStatuses = existingStatuses;
		this.callback = callback;
	}

	onOpen(): void {
		const { contentEl } = this;
		contentEl.empty();

		contentEl.createEl("h2", { text: "Add New Status Column" });
		
		contentEl.createEl("p", { 
			text: "Create a custom status column for your kanban board.",
			cls: "setting-item-description"
		});

		// Status name input
		let statusNameInput: any;
		new Setting(contentEl)
			.setName("Status name")
			.setDesc("Enter the name for the new status (e.g., 'Review', 'Blocked', 'Testing')")
			.addText((text) => {
				statusNameInput = text;
				text
					.setPlaceholder("Status name...")
					.setValue(this.statusName)
					.onChange((value) => {
						this.statusName = value;
					});
				text.inputEl.focus();
				text.inputEl.addEventListener("keydown", (e) => {
					if (e.key === "Enter") {
						e.preventDefault();
						this.submit();
					}
				});
			});

		// Show existing statuses
		if (this.existingStatuses.length > 0) {
			const existingDiv = contentEl.createDiv("existing-statuses");
			existingDiv.createEl("strong", { text: "Existing statuses:" });
			const statusList = existingDiv.createEl("ul");
			this.existingStatuses.forEach(status => {
				statusList.createEl("li", { text: status });
			});
		}

		// Buttons
		const buttonContainer = contentEl.createDiv("modal-button-container");
		buttonContainer.style.display = "flex";
		buttonContainer.style.justifyContent = "flex-end";
		buttonContainer.style.gap = "0.5rem";
		buttonContainer.style.marginTop = "1rem";

		new Setting(buttonContainer)
			.addButton((btn) =>
				btn
					.setButtonText("Add Status")
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
		const trimmedStatusName = this.statusName.trim();
		
		if (!trimmedStatusName) {
			// Show error or just close
			return;
		}

		// Check if status already exists (case-insensitive)
		const statusExists = this.existingStatuses.some(
			status => status.toLowerCase() === trimmedStatusName.toLowerCase()
		);

		if (statusExists) {
			// Could show an error here
			console.warn("Status already exists:", trimmedStatusName);
			return;
		}

		this.close();
		this.callback(trimmedStatusName);
	}

	onClose(): void {
		const { contentEl } = this;
		contentEl.empty();
	}
}

