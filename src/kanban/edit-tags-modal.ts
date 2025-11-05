import { Modal, App, Setting } from "obsidian";

export class EditTagsModal extends Modal {
	private callback: (tags: string[] | null) => void;
	private tagsInput: string;

	constructor(app: App, currentTags: string[], callback: (tags: string[] | null) => void) {
		super(app);
		this.tagsInput = currentTags.join(" ");
		this.callback = callback;
	}

	onOpen(): void {
		const { contentEl } = this;
		contentEl.empty();

		contentEl.createEl("h2", { text: "Edit Tags" });

		// Info section
		const infoEl = contentEl.createDiv("edit-tags-info");
		infoEl.createEl("p", { text: "Enter tags separated by spaces. Tags will automatically start with #" });
		
		const exampleList = infoEl.createEl("ul", { cls: "edit-tags-examples" });
		exampleList.createEl("li", { text: "Example: #Test #John_Master #VeryCool" });
		exampleList.createEl("li", { text: "Or without #: Test John_Master VeryCool" });

		// Tags input
		let tagsInputField: any;
		new Setting(contentEl)
			.setName("Tags")
			.setDesc("Separate multiple tags with spaces")
			.addText((text) => {
				tagsInputField = text;
				text
					.setPlaceholder("#Test #Cool #Important")
					.setValue(this.tagsInput)
					.onChange((value) => {
						this.tagsInput = value;
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
		// Parse tags from input
		const tagsArray = this.tagsInput.trim()
			.split(/\s+/) // Split by whitespace
			.filter(tag => tag.length > 0) // Remove empty strings
			.map(tag => tag.startsWith("#") ? tag : "#" + tag); // Ensure all tags start with #

		this.close();
		this.callback(tagsArray);
	}

	onClose(): void {
		const { contentEl } = this;
		contentEl.empty();
	}
}

