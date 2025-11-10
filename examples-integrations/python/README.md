# Python Integration Example

This directory contains Python classes and examples for generating kanban board JSON for the Obsidian Kanban Plugin.

## Files

- `kanban_models.py` - Data models representing the kanban structure
- `example.py` - Example code showing how to create and serialize kanban data

## Usage

### Basic Example

```python
from kanban_models import KanbanData, KanbanTask, ColumnState, KanbanView

kanban_data = KanbanData(
    columns=["To Do", "In Progress", "Done"],
    tasks=[
        KanbanTask(task="My first task", status="To Do")
    ]
)

json_output = kanban_data.to_json()
```

### Requirements

No external dependencies required (uses only Python standard library):
- `dataclasses` (Python 3.7+)
- `enum` (Python 3.4+)
- `json` (standard library)
- `datetime` (standard library)

## JSON Format

The plugin accepts two JSON formats:

1. **Full object format**:
```json
{
  "tasks": [...],
  "columns": [...],
  "columnMetadata": [...]
}
```

2. **Simple array format**:
```json
[
  {"task": "Task 1", "status": "todo"},
  {"task": "Task 2", "status": "in progress"}
]
```

## Integration with Obsidian

To use in Obsidian, wrap the JSON in a code block:

````markdown
```kanban
{
  "tasks": [...],
  "columns": [...]
}
```
````

## Running the Example

```bash
python example.py
```

This will output the JSON that can be copied into an Obsidian markdown file.

