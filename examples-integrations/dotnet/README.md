# .NET Integration Example

This directory contains C# classes and examples for generating kanban board JSON for the Obsidian Kanban Plugin.

## Files

- `KanbanModels.cs` - Data models representing the kanban structure
- `Example.cs` - Example code showing how to create and serialize kanban data

## Usage

### Basic Example

```csharp
using ObsidianKanban.Models;
using System.Text.Json;

var kanbanData = new KanbanData
{
    Columns = new List<string> { "To Do", "In Progress", "Done" },
    Tasks = new List<KanbanTask>
    {
        new KanbanTask { Task = "My first task", Status = "To Do" }
    }
};

string json = JsonSerializer.Serialize(kanbanData, new JsonSerializerOptions 
{ 
    WriteIndented = true 
});
```

### Required NuGet Packages

```xml
<PackageReference Include="System.Text.Json" Version="8.0.0" />
```

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

