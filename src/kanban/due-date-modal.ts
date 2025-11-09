import { App, Modal, moment, Setting } from "obsidian";

export class DueDateModal extends Modal {
	private selectedDate: moment.Moment;
	private selectedHour: number = 9;
	private selectedMinute: number = 0;
	private targetTimeInput: string;
	private onSubmit: (date: string | null, targetTime: string | null) => void;
	
	constructor(
		app: App,
		currentDate: string | undefined,
		currentTargetTime: string | undefined,
		onSubmit: (date: string | null, targetTime: string | null) => void
	) {
		super(app);
		this.onSubmit = onSubmit;
		this.targetTimeInput = currentTargetTime || "";
		
		// Initialize with current date or today
		if (currentDate) {
			this.selectedDate = moment(currentDate);
			this.selectedHour = this.selectedDate.hour();
			this.selectedMinute = this.selectedDate.minute();
		} else {
			this.selectedDate = moment().startOf('day');
			this.selectedHour = 9;
			this.selectedMinute = 0;
		}
	}
	
	onOpen() {
		const { contentEl, modalEl } = this;
		contentEl.empty();
		contentEl.addClass("due-date-modal");
		
		// Make modal smaller
		modalEl.style.width = "400px";
		modalEl.style.maxWidth = "90vw";
		
		// Modal title
		contentEl.createEl("h2", { text: "Set Due Date & Target Time", attr: { style: "font-size: 1.1rem; margin-bottom: 0.75rem;" } });
		
		// Calendar container - make it more compact
		const calendarContainer = contentEl.createDiv("due-date-calendar-container");
		calendarContainer.style.padding = "0.5rem";
		
		// Month/Year navigation - make it more compact
		const navContainer = calendarContainer.createDiv("calendar-nav");
		navContainer.style.marginBottom = "0.5rem";
		navContainer.style.gap = "0.5rem";
		
		const prevButton = navContainer.createEl("button", {
			cls: "calendar-nav-button",
			text: "←",
			attr: { style: "padding: 0.3rem 0.6rem; font-size: 1rem;" }
		});
		
		const monthYearDisplay = navContainer.createEl("div", {
			cls: "calendar-month-year",
			text: this.selectedDate.format("MMMM YYYY"),
			attr: { style: "font-size: 0.95rem;" }
		});
		
		const nextButton = navContainer.createEl("button", {
			cls: "calendar-nav-button",
			text: "→",
			attr: { style: "padding: 0.3rem 0.6rem; font-size: 1rem;" }
		});
		
		// Calendar grid - make it more compact
		const calendarGrid = calendarContainer.createDiv("calendar-grid");
		calendarGrid.style.gap = "0.15rem";
		
		// Function to render calendar
		const renderCalendar = () => {
			calendarGrid.empty();
			monthYearDisplay.setText(this.selectedDate.format("MMMM YYYY"));
			
			// Day headers - make them smaller
			const dayHeaders = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
			dayHeaders.forEach(day => {
				const dayHeader = calendarGrid.createDiv("calendar-day-header");
				dayHeader.setText(day);
				dayHeader.style.fontSize = "0.65rem";
				dayHeader.style.padding = "0.3rem";
			});
			
			// Get calendar data
			const startOfMonth = this.selectedDate.clone().startOf('month');
			const endOfMonth = this.selectedDate.clone().endOf('month');
			const startDate = startOfMonth.clone().startOf('week');
			const endDate = endOfMonth.clone().endOf('week');
			
			const today = moment().startOf('day');
			const selectedDay = this.selectedDate.clone().startOf('day');
			
			// Generate calendar days
			let currentDate = startDate.clone();
			while (currentDate.isSameOrBefore(endDate, 'day')) {
				const dayEl = calendarGrid.createDiv("calendar-day");
				dayEl.style.fontSize = "0.75rem";
				dayEl.style.padding = "0.4rem";
				const dayDate = currentDate.clone();
				
				dayEl.setText(currentDate.format("D"));
				
				// Add classes
				if (!currentDate.isSame(this.selectedDate, 'month')) {
					dayEl.addClass("calendar-day-outside");
				}
				if (currentDate.isSame(today, 'day')) {
					dayEl.addClass("calendar-day-today");
				}
				if (currentDate.isSame(selectedDay, 'day')) {
					dayEl.addClass("calendar-day-selected");
				}
				
				// Click handler
				dayEl.addEventListener("click", () => {
					this.selectedDate = dayDate.hour(this.selectedHour).minute(this.selectedMinute);
					renderCalendar();
					updatePreview();
				});
				
				currentDate.add(1, 'day');
			}
		};
		
		// Navigation handlers
		prevButton.addEventListener("click", () => {
			this.selectedDate.subtract(1, 'month');
			renderCalendar();
		});
		
		nextButton.addEventListener("click", () => {
			this.selectedDate.add(1, 'month');
			renderCalendar();
		});
		
		// Time picker - make it more compact
		const timeContainer = contentEl.createDiv("due-date-time-container");
		timeContainer.style.padding = "0.5rem";
		timeContainer.style.marginBottom = "0.75rem";
		timeContainer.createEl("label", { text: "Time:", cls: "due-date-time-label", attr: { style: "font-size: 0.85rem;" } });
		
		const timeInputContainer = timeContainer.createDiv("due-date-time-inputs");
		
		const hourInput = timeInputContainer.createEl("input", {
			type: "number",
			cls: "due-date-time-input",
			attr: {
				min: "0",
				max: "23",
				value: this.selectedHour.toString(),
				style: "width: 50px; padding: 0.3rem; font-size: 0.85rem;"
			}
		});
		
		timeInputContainer.createSpan({ text: ":", cls: "due-date-time-separator", attr: { style: "font-size: 1rem;" } });
		
		const minuteInput = timeInputContainer.createEl("input", {
			type: "number",
			cls: "due-date-time-input",
			attr: {
				min: "0",
				max: "59",
				value: this.selectedMinute.toString().padStart(2, '0'),
				style: "width: 50px; padding: 0.3rem; font-size: 0.85rem;"
			}
		});
		
		// Preview - make it more compact
		const previewContainer = contentEl.createDiv("due-date-preview");
		previewContainer.style.padding = "0.5rem";
		previewContainer.style.marginBottom = "0.75rem";
		const previewText = previewContainer.createEl("div", {
			cls: "due-date-preview-text",
			attr: { style: "font-size: 0.85rem;" }
		});
		
		const updatePreview = () => {
			const previewDate = this.selectedDate.clone()
				.hour(this.selectedHour)
				.minute(this.selectedMinute);
			previewText.setText(`Due: ${previewDate.format("MMM D, YYYY HH:mm")}`);
		};
		
		// Time input handlers
		hourInput.addEventListener("change", () => {
			let hour = parseInt(hourInput.value);
			if (isNaN(hour) || hour < 0) hour = 0;
			if (hour > 23) hour = 23;
			this.selectedHour = hour;
			hourInput.value = hour.toString();
			updatePreview();
		});
		
		minuteInput.addEventListener("change", () => {
			let minute = parseInt(minuteInput.value);
			if (isNaN(minute) || minute < 0) minute = 0;
			if (minute > 59) minute = 59;
			this.selectedMinute = minute;
			minuteInput.value = minute.toString().padStart(2, '0');
			updatePreview();
		});
		
		// Quick time buttons - make them smaller
		const quickTimeContainer = contentEl.createDiv("due-date-quick-time");
		quickTimeContainer.style.gap = "0.4rem";
		quickTimeContainer.style.marginBottom = "0.75rem";
		const quickTimes = [
			{ label: "9:00", hour: 9, minute: 0 },
			{ label: "14:00", hour: 14, minute: 0 },
			{ label: "18:00", hour: 18, minute: 0 },
			{ label: "23:59", hour: 23, minute: 59 }
		];
		
		quickTimes.forEach(({ label, hour, minute }) => {
			const btn = quickTimeContainer.createEl("button", {
				text: label,
				cls: "due-date-quick-time-btn",
				attr: { style: "padding: 0.3rem 0.6rem; font-size: 0.8rem;" }
			});
			btn.addEventListener("click", () => {
				this.selectedHour = hour;
				this.selectedMinute = minute;
				hourInput.value = hour.toString();
				minuteInput.value = minute.toString().padStart(2, '0');
				updatePreview();
			});
		});
		
		// Target time input
		new Setting(contentEl)
			.setName("Target Time")
			.setDesc("Format: Xh Ym (e.g., 2h 30m, 1.5h, 45m)")
			.addText((text) => {
				text
					.setPlaceholder("2h 30m")
					.setValue(this.targetTimeInput)
					.onChange((value) => {
						this.targetTimeInput = value;
					});
			});
		
		// Buttons
		const buttonContainer = contentEl.createDiv("due-date-modal-buttons");
		
		const clearButton = buttonContainer.createEl("button", {
			text: "Clear",
			cls: "due-date-modal-button due-date-modal-clear"
		});
		
		const cancelButton = buttonContainer.createEl("button", {
			text: "Cancel",
			cls: "due-date-modal-button due-date-modal-cancel"
		});
		
		const submitButton = buttonContainer.createEl("button", {
			text: "Save",
			cls: "due-date-modal-button due-date-modal-submit"
		});
		
		clearButton.addEventListener("click", () => {
			this.onSubmit(null, null);
			this.close();
		});
		
		cancelButton.addEventListener("click", () => {
			this.close();
		});
		
		submitButton.addEventListener("click", () => {
			const finalDate = this.selectedDate.clone()
				.hour(this.selectedHour)
				.minute(this.selectedMinute)
				.toISOString();
			
			// Validate and format target time
			let targetTime: string | null = null;
			let trimmedTargetTime = this.targetTimeInput.trim();
			if (trimmedTargetTime.length > 0) {
				// If input is just a number, treat it as hours
				const numberOnlyPattern = /^\d+(\.\d+)?$/;
				if (numberOnlyPattern.test(trimmedTargetTime)) {
					trimmedTargetTime = trimmedTargetTime + "h";
				}
				
				// Basic validation
				const timePattern = /^(\d+(\.\d+)?\s*[hH])?(\s*\d+\s*[mM])?$/;
				if (timePattern.test(trimmedTargetTime)) {
					targetTime = trimmedTargetTime;
				} else {
					// Show error but don't close
					const errorEl = contentEl.querySelector(".target-time-error");
					if (errorEl) {
						errorEl.remove();
					}
					const newError = contentEl.createDiv("target-time-error");
					newError.style.color = "var(--text-error)";
					newError.style.marginTop = "0.5rem";
					newError.style.fontSize = "0.8rem";
					newError.setText("Invalid target time format. Use: 2h, 30m, or 1h 30m");
					return;
				}
			} else {
				targetTime = "";
			}
			
			this.onSubmit(finalDate, targetTime);
			this.close();
		});
		
		// Initial render
		renderCalendar();
		updatePreview();
	}
	
	onClose() {
		const { contentEl } = this;
		contentEl.empty();
	}
}

