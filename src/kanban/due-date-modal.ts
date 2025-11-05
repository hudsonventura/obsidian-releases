import { App, Modal, moment } from "obsidian";

export class DueDateModal extends Modal {
	private selectedDate: moment.Moment;
	private selectedHour: number = 9;
	private selectedMinute: number = 0;
	private onSubmit: (date: string | null) => void;
	
	constructor(
		app: App,
		currentDate: string | undefined,
		onSubmit: (date: string | null) => void
	) {
		super(app);
		this.onSubmit = onSubmit;
		
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
		const { contentEl } = this;
		contentEl.empty();
		contentEl.addClass("due-date-modal");
		
		// Modal title
		contentEl.createEl("h2", { text: "Set Due Date" });
		
		// Calendar container
		const calendarContainer = contentEl.createDiv("due-date-calendar-container");
		
		// Month/Year navigation
		const navContainer = calendarContainer.createDiv("calendar-nav");
		
		const prevButton = navContainer.createEl("button", {
			cls: "calendar-nav-button",
			text: "←"
		});
		
		const monthYearDisplay = navContainer.createEl("div", {
			cls: "calendar-month-year",
			text: this.selectedDate.format("MMMM YYYY")
		});
		
		const nextButton = navContainer.createEl("button", {
			cls: "calendar-nav-button",
			text: "→"
		});
		
		// Calendar grid
		const calendarGrid = calendarContainer.createDiv("calendar-grid");
		
		// Function to render calendar
		const renderCalendar = () => {
			calendarGrid.empty();
			monthYearDisplay.setText(this.selectedDate.format("MMMM YYYY"));
			
			// Day headers
			const dayHeaders = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
			dayHeaders.forEach(day => {
				const dayHeader = calendarGrid.createDiv("calendar-day-header");
				dayHeader.setText(day);
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
		
		// Time picker
		const timeContainer = contentEl.createDiv("due-date-time-container");
		timeContainer.createEl("label", { text: "Time:", cls: "due-date-time-label" });
		
		const timeInputContainer = timeContainer.createDiv("due-date-time-inputs");
		
		const hourInput = timeInputContainer.createEl("input", {
			type: "number",
			cls: "due-date-time-input",
			attr: {
				min: "0",
				max: "23",
				value: this.selectedHour.toString()
			}
		});
		
		timeInputContainer.createSpan({ text: ":", cls: "due-date-time-separator" });
		
		const minuteInput = timeInputContainer.createEl("input", {
			type: "number",
			cls: "due-date-time-input",
			attr: {
				min: "0",
				max: "59",
				value: this.selectedMinute.toString().padStart(2, '0')
			}
		});
		
		// Preview
		const previewContainer = contentEl.createDiv("due-date-preview");
		const previewText = previewContainer.createEl("div", {
			cls: "due-date-preview-text"
		});
		
		const updatePreview = () => {
			const previewDate = this.selectedDate.clone()
				.hour(this.selectedHour)
				.minute(this.selectedMinute);
			previewText.setText(`Selected: ${previewDate.format("MMM D, YYYY HH:mm")}`);
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
		
		// Quick time buttons
		const quickTimeContainer = contentEl.createDiv("due-date-quick-time");
		const quickTimes = [
			{ label: "Morning (9:00)", hour: 9, minute: 0 },
			{ label: "Afternoon (14:00)", hour: 14, minute: 0 },
			{ label: "Evening (18:00)", hour: 18, minute: 0 },
			{ label: "End of Day (23:59)", hour: 23, minute: 59 }
		];
		
		quickTimes.forEach(({ label, hour, minute }) => {
			const btn = quickTimeContainer.createEl("button", {
				text: label,
				cls: "due-date-quick-time-btn"
			});
			btn.addEventListener("click", () => {
				this.selectedHour = hour;
				this.selectedMinute = minute;
				hourInput.value = hour.toString();
				minuteInput.value = minute.toString().padStart(2, '0');
				updatePreview();
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
			text: "Set Due Date",
			cls: "due-date-modal-button due-date-modal-submit"
		});
		
		clearButton.addEventListener("click", () => {
			this.onSubmit(null);
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
			this.onSubmit(finalDate);
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

