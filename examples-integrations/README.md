# Integration Examples

This directory contains example code for integrating with the Obsidian Kanban Plugin from different programming languages.

## Structure

- `dotnet/` - C# (.NET) integration examples
- `python/` - Python integration examples

## Purpose

These examples demonstrate how to programmatically generate kanban board JSON that can be used with the Obsidian Kanban Plugin. This is useful for:

- Automating task creation from external systems
- Syncing tasks from project management tools
- Generating kanban boards from code
- Building integrations with other applications

## JSON Format

The plugin accepts kanban data in JSON format within a code block:

````markdown
```kanban
{
  "tasks": [
    {
      "task": "Task name",
      "status": "todo",
      "targetTime": "2h",
      "tags": ["#tag1"],
      "dueDate": "2025-12-31T23:59:59.000Z"
    }
  ],
  "columns": ["todo", "in progress", "done"],
  "columnMetadata": [
    {
      "name": "todo",
      "state": "todo",
      "icon": "📋"
    }
  ],
  "view": "table"
}
```
````

## Quick Start

### .NET

See `dotnet/README.md` for details.

```csharp
var kanban = new KanbanData
{
    Tasks = new List<KanbanTask>
    {
        new KanbanTask { Task = "My task", Status = "todo" }
    }
};
```

### Python

See `python/README.md` for details.

```python
kanban = KanbanData(
    tasks=[KanbanTask(task="My task", status="todo")]
)
```

## Data Structure

### KanbanTask

- `task` (string, required) - Task name/description
- `status` (string, optional) - Task status/column
- `targetTime` (string, optional) - Target time (e.g., "2h", "1d")
- `tags` (string[], optional) - Array of tags
- `dueDate` (string, optional) - ISO 8601 date string
- `updateDateTime` (string, optional) - ISO 8601 date string
- `timerEntries` (TimerEntry[], optional) - Timer tracking entries

### KanbanData

- `tasks` (KanbanTask[], optional) - Array of tasks
- `columns` (string[], optional) - Column names
- `columnMetadata` (ColumnMetadata[], optional) - Column configuration
- `view` (string, optional) - View mode: "horizontal", "vertical", or "table"
- `slimMode` (boolean, optional) - Enable slim mode
- `collapsedColumns` (string[], optional) - Collapsed column names
- `columnWidths` (object, optional) - Column width settings

## Examples

Each subdirectory contains:
- Data model classes/types
- Example code demonstrating usage
- README with detailed instructions

