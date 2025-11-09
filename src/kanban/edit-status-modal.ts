import { Modal, App, Setting } from "obsidian";
import { ColumnState } from "../types";

export class EditStatusModal extends Modal {
	private callback: (newName: string | null, statusType: ColumnState | null, icon: string | null) => void;
	private statusType: ColumnState;
	private statusIcon: string;
	private statusName: string;
	private newStatusName: string;

	constructor(
		app: App, 
		statusName: string,
		currentType: ColumnState,
		currentIcon: string | undefined,
		callback: (newName: string | null, statusType: ColumnState | null, icon: string | null) => void
	) {
		super(app);
		this.statusName = statusName;
		this.newStatusName = statusName;
		this.statusType = currentType;
		this.statusIcon = currentIcon || "";
		this.callback = callback;
	}

	onOpen(): void {
		const { contentEl } = this;
		contentEl.empty();

		contentEl.createEl("h2", { text: `Edit Status: ${this.statusName}` });
		
		contentEl.createEl("p", { 
			text: "Modify the status name, type, and icon for this column.",
			cls: "setting-item-description"
		});

		// Status name input
		new Setting(contentEl)
			.setName("Status name")
			.setDesc("Change the name of this status column")
			.addText((text) => {
				text
					.setPlaceholder("Status name...")
					.setValue(this.statusName)
					.onChange((value) => {
						this.newStatusName = value.trim();
					});
			});

		// Status type selection
		new Setting(contentEl)
			.setName("Status type")
			.setDesc("Select the type of status column")
			.addDropdown((dropdown) => {
				dropdown
					.addOption("todo", "Todo")
					.addOption("in-progress", "In Progress")
					.addOption("pending", "Pending")
					.setValue(this.statusType)
					.onChange((value) => {
						this.statusType = value as ColumnState;
					});
			});

		// Status icon input
		new Setting(contentEl)
			.setName("Status icon")
			.setDesc("Enter an emoji or icon name for this status (e.g., 📋, ⏳, 🔄, or leave empty)")
			.addText((text) => {
				text
					.setPlaceholder("Icon (emoji or icon name)...")
					.setValue(this.statusIcon)
					.onChange((value) => {
						this.statusIcon = value.trim();
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
						this.callback(null, null, null);
					})
			);
	}

	private submit(): void {
		this.close();
		const newName = this.newStatusName.trim();
		if (newName && newName !== this.statusName) {
			this.callback(newName, this.statusType, this.statusIcon || null);
		} else {
			this.callback(null, this.statusType, this.statusIcon || null);
		}
	}

	onClose(): void {
		const { contentEl } = this;
		contentEl.empty();
	}
}

