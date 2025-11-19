# Table View Feature Documentation

## Overview

The Sprint Control plugin now includes a **Table View** mode, providing a third way to visualize and manage your tasks alongside the existing Horizontal and Vertical kanban views.

## Features

### View Modes

The plugin now supports three view modes:
1. **Horizontal View** - Status columns stacked vertically, tasks flow horizontally
2. **Vertical View** - Classic kanban with status columns side-by-side
3. **Table View** - Tabular layout with status sections (NEW!)

### Table View Characteristics

#### Layout Structure
- **Status Sections**: Each status (e.g., "To Do", "In Progress", "Done") becomes a collapsible section
- **Clean Design**: No vertical borders - only horizontal lines for better readability
- **Responsive**: Adapts to different screen sizes

#### Columns

The table displays the following columns for each task:

1. **Name** - The task title (supports markdown rendering)
2. **Tags** - Assignee or categorization tags
3. **Due Date** - When the task is due (with visual indicators for overdue/soon)
4. **Last Updated** - When the task was last modified
5. **Time Spent** - Total time tracked for the task (sortable)
6. **Target Time** - Configured target/estimate time for the task (sortable)
7. **Progress** - Visual progress bar showing completion percentage (when target time is set)
8. **Actions** - Timer control buttons (play/stop)

#### Sorting

- Click any column header to sort tasks within that status section
- Sortable columns: Name, Due Date, Last Updated, Time Spent, Target Time
- Toggle between ascending/descending order
- Each status section maintains its own sort preferences

#### Column Resizing

- Drag the right edge of any column header to resize it
- Column widths are automatically saved and persist across sessions
- Minimum column width is 50px to maintain usability
- Resize handle appears on hover at the right edge of column headers

#### Task Filtering

- **Search box** in the header allows filtering tasks by title
- Type any text to instantly filter tasks across all views (horizontal, vertical, table)
- Filter is case-insensitive and searches within task titles
- Tasks that don't match are hidden automatically
- Clear the filter to show all tasks again
- **Filter persists** across:
  - View changes (horizontal ↔ vertical ↔ table)
  - Status changes and task updates
  - File saves and reloads
  - All task operations (drag-and-drop, editing, etc.)

#### Visual Indicators

- **Date format**: All dates displayed as "ddd, YYYY-MM-DD HH:mm" (e.g., "Mon, 2025-11-07 14:30")
- **Overdue tasks**: Red text for past-due dates
- **Soon tasks**: Orange text for tasks due within 24 hours
- **Running timers**: Blue animated text for active time tracking
- **Progress bar colors** (customizable in settings):
  - 🟢 Green: 0-69% complete (default)
  - 🟡 Yellow: 70-84% complete (default)
  - 🟠 Orange: 85-99% complete (default)
  - 🔴 Red: 100%+ over target (default)
  - Animated pulse effect when timer is running
  - Thresholds can be customized in plugin settings
- **Status emojis**: 
  - ▶️ for "In Progress" states
  - ✅ for "Done" states

## Usage

### Switching to Table View

1. Click the view toggle button in the kanban header
2. The view cycles through: **Horizontal → Vertical → Table → Horizontal**
3. The button icon and label update to show the next available view

### Interacting with Tasks

#### Inline Editing

- **Double-click task title** (Table view only): Edit the task name directly in the table
  - Double-click on any task title to enter edit mode
  - Press `Enter` to save changes
  - Press `Escape` to cancel
  - Click away (blur) to auto-save
  - Drag-and-drop is disabled while editing
  - Tags are preserved when editing task names

#### Context Menu (Right-click)

All views (Horizontal, Vertical, and Table) now share a unified context menu with the following options:

- **Edit Timer Entries**: View and edit all timer entries for a task
- **Edit Tags**: Modify task tags/assignees
- **Edit Due Date & Target Time**: Set or update both the task due date and target time in one dialog
- **Duplicate Task**: Create a copy of the task (including timer entries, tags, and settings)
- **Delete Task**: Remove the task (requires confirmation to prevent accidental deletion)

#### Drag and Drop
- Tasks remain draggable in table view
- Drag a row to a different status section to move the task
- Visual feedback shows valid drop zones

#### Collapsing Sections
- Click the chevron button next to any status header to collapse/expand that section
- Collapsed state is preserved when switching views or reloading

## Technical Implementation

### Files Modified

1. **src/types.ts**
   - Added `"table"` to the `KanbanView` type

2. **src/kanban/renderer.ts**
   - Added `renderTableView()` function
   - Modified view toggle logic to cycle through three views
   - Implemented table-specific rendering with status sections
   - Added sorting functionality for table columns
   - Integrated progress bar rendering in table cells
   - Added real-time progress bar updates for running timers

3. **styles.css**
   - Added comprehensive table view styles
   - Removed vertical borders (only horizontal lines)
   - Added responsive design for smaller screens
   - Included visual indicators for task states
   - Added progress bar styling with color-coded states
   - Implemented progress bar animation for running timers

### Key CSS Classes

- `.kanban-board-table` - Main table view container
- `.kanban-table-section` - Individual status section
- `.kanban-table` - The actual table element
- `.kanban-table-row` - Individual task rows
- `.kanban-table-cell-*` - Specific cell types
- `.kanban-table-cell-progress` - Progress bar cell
- `.kanban-table-progress-bar` - Progress bar background
- `.kanban-table-progress-fill` - Colored fill based on percentage
- `.kanban-table-progress-text` - Percentage text display

## Design Decisions

### No Vertical Lines
As requested, vertical borders are explicitly removed using:
```css
.kanban-table th,
.kanban-table td {
    border-left: none;
    border-right: none;
}
```

### Status as Subdivisions
Rather than showing all tasks in a single table with a "Status" column, the table is subdivided by status. This approach:
- Maintains consistency with the kanban views
- Allows independent sorting per status
- Provides better visual organization
- Supports collapsing individual status sections

### Column Selection
The columns provide comprehensive task information:
- Name (primary identifier)
- Tags (serves as "Assignee" field)
- Due Date (deadline tracking)
- Last Updated (activity tracking)
- Time Spent (total time tracked, sortable)
- Target Time (target/estimate time, sortable)
- Progress (visual progress bar with percentage when target time is set)
- Actions (timer control buttons for starting/stopping time tracking)

## Settings

### Progress Bar Color Thresholds

You can customize the progress bar colors to match your workflow preferences:

1. Open Obsidian **Settings** → **Community plugins** → **Kanban Plugin**
2. Adjust the threshold percentages for each color:
   - **Green threshold**: Maximum percentage for green color (default: 69%)
   - **Yellow threshold**: Maximum percentage for yellow color (default: 84%)
   - **Orange threshold**: Maximum percentage for orange color (default: 99%)
   - **Red threshold**: Minimum percentage for red color (default: 100%)

**Example custom configuration:**
- Set green to 79% for more lenient early progress
- Set yellow to 89% to narrow the "approaching deadline" range
- Set orange to 95% to give more warning before going over
- Set red to 100% to highlight tasks that exceed their target time

Settings apply immediately to all progress bars across all three views (horizontal, vertical, table).

## Future Enhancements

Possible improvements for future versions:
- Custom column configuration
- Column reordering
- Inline editing of cell values
- Export to CSV
- Filtering capabilities
- Bulk actions via checkboxes

## Compatibility

- Works with all existing kanban features (timers, tags, due dates, etc.)
- Preserves drag-and-drop functionality
- Maintains data format compatibility
- Mobile-friendly (responsive design included)

## Testing

Build the plugin and test:
```bash
npm run build
```

The compiled `main.js` will be generated and ready to use in Obsidian.

## Notes

- The view preference is saved automatically and persists across sessions
- Sorting preferences are saved per status column
- All task interactions (edit, delete, move) work the same as in other views

