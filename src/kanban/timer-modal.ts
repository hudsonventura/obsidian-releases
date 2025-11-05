import { Modal, App, Setting, moment } from "obsidian";
import { TimerEntry } from "../types";

export class TimerEntriesModal extends Modal {
	private taskName: string;
	private entries: TimerEntry[];
	private callback: (entries: TimerEntry[]) => void;
	private contentContainer: HTMLElement;

	constructor(app: App, taskName: string, entries: TimerEntry[], callback: (entries: TimerEntry[]) => void) {
		super(app);
		this.taskName = taskName;
		this.entries = entries ? JSON.parse(JSON.stringify(entries)) : []; // Deep clone
		this.callback = callback;
	}

	onOpen(): void {
		const { contentEl } = this;
		contentEl.empty();

		contentEl.createEl("h2", { text: `Timer Entries: ${this.taskName}` });
		
		// Container for entries list
		this.contentContainer = contentEl.createDiv("timer-entries-container");
		this.renderEntries();

		// Add new entry button
		new Setting(contentEl)
			.addButton((btn) =>
				btn
					.setButtonText("+ Add Entry")
					.setClass("mod-cta")
					.onClick(() => {
						this.entries.push({
							startTime: moment().toISOString(),
							endTime: moment().add(1, "hour").toISOString()
						});
						this.renderEntries();
					})
			);

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
						this.close();
						this.callback(this.entries);
					})
			)
			.addButton((btn) =>
				btn
					.setButtonText("Cancel")
					.onClick(() => {
						this.close();
					})
			);
	}

	private renderEntries(): void {
		this.contentContainer.empty();

		if (this.entries.length === 0) {
			this.contentContainer.createEl("p", { 
				text: "No timer entries yet. Click 'Add Entry' to create one.",
				cls: "timer-entries-empty"
			});
			return;
		}

		this.entries.forEach((entry, index) => {
			const entryDiv = this.contentContainer.createDiv("timer-entry-item");
			
			const headerDiv = entryDiv.createDiv("timer-entry-header");
			headerDiv.createEl("strong", { text: `Entry ${index + 1}` });
			
			const duration = this.calculateDuration(entry);
			headerDiv.createSpan({ 
				text: ` (${this.formatDuration(duration)})`,
				cls: "timer-entry-duration"
			});

			// Delete button
			const deleteBtn = headerDiv.createEl("button", {
				cls: "timer-entry-delete",
				attr: { "aria-label": "Delete entry" }
			});
			deleteBtn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>`;
			deleteBtn.addEventListener("click", () => {
				this.entries.splice(index, 1);
				this.renderEntries();
			});

			// Start time
			new Setting(entryDiv)
				.setName("Start time")
				.addText((text) => {
					text
						.setValue(moment(entry.startTime).format("YYYY-MM-DD HH:mm:ss"))
						.onChange((value) => {
							const parsed = moment(value, "YYYY-MM-DD HH:mm:ss");
							if (parsed.isValid()) {
								entry.startTime = parsed.toISOString();
								this.renderEntries();
							}
						});
					text.inputEl.type = "text";
					text.inputEl.placeholder = "YYYY-MM-DD HH:mm:ss";
				});

			// End time
			new Setting(entryDiv)
				.setName("End time")
				.addText((text) => {
					const endValue = entry.endTime ? moment(entry.endTime).format("YYYY-MM-DD HH:mm:ss") : "";
					text
						.setValue(endValue)
						.setPlaceholder("Leave empty if still running")
						.onChange((value) => {
							if (!value.trim()) {
								entry.endTime = null;
							} else {
								const parsed = moment(value, "YYYY-MM-DD HH:mm:ss");
								if (parsed.isValid()) {
									entry.endTime = parsed.toISOString();
									this.renderEntries();
								}
							}
						});
					text.inputEl.type = "text";
					text.inputEl.placeholder = "YYYY-MM-DD HH:mm:ss";
				});
		});
	}

	private calculateDuration(entry: TimerEntry): number {
		const startTime = moment(entry.startTime);
		const endTime = entry.endTime ? moment(entry.endTime) : moment();
		return endTime.diff(startTime);
	}

	private formatDuration(milliseconds: number): string {
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

	onClose(): void {
		const { contentEl } = this;
		contentEl.empty();
	}
}

