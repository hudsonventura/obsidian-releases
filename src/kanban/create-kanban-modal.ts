import { Modal, App, Setting } from "obsidian";

export class CreateKanbanModal extends Modal {
	private callback: (columns: string[] | null) => void;
	private columnsInput: string = "";

	constructor(app: App, callback: (columns: string[] | null) => void) {
		super(app);
		this.callback = callback;
	}

	onOpen(): void {
		const { contentEl } = this;
		contentEl.empty();

		contentEl.createEl("h2", { text: "Create New Kanban Board" });
		
		contentEl.createEl("p", { 
			text: "Enter the status columns for your kanban board, separated by commas.",
			cls: "setting-item-description"
		});

		// Columns input
		let columnsInputEl: any;
		new Setting(contentEl)
			.setName("Status columns")
			.setDesc("Comma-separated list (e.g., To Do, In Progress, Review, Done)")
			.addText((text) => {
				columnsInputEl = text;
				text
					.setPlaceholder("To Do, In Progress, Done")
					.setValue("To Do, In Progress, Done")
					.onChange((value) => {
						this.columnsInput = value;
					});
				text.inputEl.focus();
				text.inputEl.select();
				text.inputEl.addEventListener("keydown", (e) => {
					if (e.key === "Enter") {
						e.preventDefault();
						this.submit();
					}
				});
			});

		// Info text
		const infoDiv = contentEl.createDiv("create-kanban-info");
		infoDiv.createEl("p", { 
			text: "💡 Tip: You can use default columns (todo, in progress, done) or create custom ones!",
			cls: "setting-item-description"
		});
		infoDiv.createEl("p", { 
			text: "Examples:",
			cls: "setting-item-description"
		});
		const examplesList = infoDiv.createEl("ul", { cls: "create-kanban-examples" });
		examplesList.createEl("li", { text: "Backlog, To Do, In Progress, Done" });
		examplesList.createEl("li", { text: "Not Started, Working, Blocked, Review, Complete" });
		examplesList.createEl("li", { text: "Sprint Backlog, Development, Testing, Deploy, Done" });

		// Buttons
		const buttonContainer = contentEl.createDiv("modal-button-container");
		buttonContainer.style.display = "flex";
		buttonContainer.style.justifyContent = "flex-end";
		buttonContainer.style.gap = "0.5rem";
		buttonContainer.style.marginTop = "1rem";

		new Setting(buttonContainer)
			.addButton((btn) =>
				btn
					.setButtonText("Create Kanban")
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
		const trimmedInput = this.columnsInput.trim();
		
		if (!trimmedInput) {
			// Use default columns if empty
			this.close();
			this.callback(["todo", "in progress", "done"]);
			return;
		}

		// Parse comma-separated columns
		const columns = trimmedInput
			.split(",")
			.map(col => col.trim())
			.filter(col => col.length > 0);

		if (columns.length === 0) {
			// Use default if parsing resulted in empty array
			this.close();
			this.callback(["todo", "in progress", "done"]);
			return;
		}

		this.close();
		this.callback(columns);
	}

	onClose(): void {
		const { contentEl } = this;
		contentEl.empty();
	}
}

