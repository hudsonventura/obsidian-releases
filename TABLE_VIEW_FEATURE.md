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
4. **Time Spent** - Total time tracked for the task
5. **Last Updated** - When the task was last modified

#### Sorting

- Click any column header to sort tasks within that status section
- Sortable columns: Name, Due Date, Time Spent, Last Updated
- Toggle between ascending/descending order
- Each status section maintains its own sort preferences

#### Visual Indicators

- **Overdue tasks**: Red text for past-due dates
- **Soon tasks**: Orange text for tasks due within 24 hours
- **Running timers**: Blue animated text for active time tracking
- **Status emojis**: 
  - ▶️ for "In Progress" states
  - ✅ for "Done" states

## Usage

### Switching to Table View

1. Click the view toggle button in the kanban header
2. The view cycles through: **Horizontal → Vertical → Table → Horizontal**
3. The button icon and label update to show the next available view

### Interacting with Tasks

#### Context Menu (Right-click)
- **Edit Tags**: Modify task tags/assignees
- **Edit Due Date**: Set or update task due dates
- **Delete Task**: Remove the task

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

3. **styles.css**
   - Added comprehensive table view styles
   - Removed vertical borders (only horizontal lines)
   - Added responsive design for smaller screens
   - Included visual indicators for task states

### Key CSS Classes

- `.kanban-board-table` - Main table view container
- `.kanban-table-section` - Individual status section
- `.kanban-table` - The actual table element
- `.kanban-table-row` - Individual task rows
- `.kanban-table-cell-*` - Specific cell types

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
The columns were chosen to match the information visible in the provided screenshot:
- Name (primary identifier)
- Tags (serves as "Assignee" field)
- Due Date (deadline tracking)
- Time Spent (progress tracking)
- Last Updated (activity tracking)

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

