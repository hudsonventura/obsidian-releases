using System;
using System.Collections.Generic;
using System.Text.Json;
using ObsidianKanban.Models;

namespace ObsidianKanban.Examples
{
    /// <summary>
    /// Example demonstrating how to create and serialize kanban board data
    /// </summary>
    public class KanbanExample
    {
        public static void Main()
        {
            // Create a kanban board with custom columns
            var kanbanData = new KanbanData
            {
                Columns = new List<string> { "Backlog", "To Do", "In Progress", "Review", "Done" },
                ColumnMetadata = new List<ColumnMetadata>
                {
                    new ColumnMetadata
                    {
                        Name = "Backlog",
                        State = ColumnState.Todo,
                        Icon = "📋"
                    },
                    new ColumnMetadata
                    {
                        Name = "To Do",
                        State = ColumnState.Todo,
                        Icon = "⏳"
                    },
                    new ColumnMetadata
                    {
                        Name = "In Progress",
                        State = ColumnState.InProgress,
                        Icon = "🔄"
                    },
                    new ColumnMetadata
                    {
                        Name = "Review",
                        State = ColumnState.Pending,
                        Icon = "👀"
                    },
                    new ColumnMetadata
                    {
                        Name = "Done",
                        State = ColumnState.Done,
                        Icon = "✅"
                    }
                },
                Tasks = new List<KanbanTask>
                {
                    new KanbanTask
                    {
                        Task = "Implement user authentication",
                        Status = "In Progress",
                        TargetTime = "8h",
                        Tags = new List<string> { "#backend", "#security" },
                        DueDate = DateTime.UtcNow.AddDays(3).ToString("yyyy-MM-ddTHH:mm:ss.fffZ"),
                        UpdateDateTime = DateTime.UtcNow.ToString("yyyy-MM-ddTHH:mm:ss.fffZ"),
                        TimerEntries = new List<TimerEntry>
                        {
                            new TimerEntry
                            {
                                StartTime = DateTime.UtcNow.AddHours(-2).ToString("yyyy-MM-ddTHH:mm:ss.fffZ"),
                                EndTime = null // Running timer
                            }
                        }
                    },
                    new KanbanTask
                    {
                        Task = "Design database schema",
                        Status = "Done",
                        TargetTime = "4h",
                        Tags = new List<string> { "#database", "#design" },
                        UpdateDateTime = DateTime.UtcNow.AddDays(-1).ToString("yyyy-MM-ddTHH:mm:ss.fffZ"),
                        TimerEntries = new List<TimerEntry>
                        {
                            new TimerEntry
                            {
                                StartTime = DateTime.UtcNow.AddDays(-1).AddHours(-4).ToString("yyyy-MM-ddTHH:mm:ss.fffZ"),
                                EndTime = DateTime.UtcNow.AddDays(-1).ToString("yyyy-MM-ddTHH:mm:ss.fffZ")
                            }
                        }
                    },
                    new KanbanTask
                    {
                        Task = "Write API documentation",
                        Status = "To Do",
                        TargetTime = "2h",
                        Tags = new List<string> { "#documentation" },
                        DueDate = DateTime.UtcNow.AddDays(5).ToString("yyyy-MM-ddTHH:mm:ss.fffZ")
                    },
                    new KanbanTask
                    {
                        Task = "Code review for PR #42",
                        Status = "Review",
                        TargetTime = "1h",
                        Tags = new List<string> { "#review" }
                    }
                },
                View = KanbanView.Table,
                SlimMode = false
            };

            // Serialize to JSON
            var options = new JsonSerializerOptions
            {
                WriteIndented = true,
                PropertyNamingPolicy = JsonNamingPolicy.CamelCase,
                DefaultIgnoreCondition = System.Text.Json.Serialization.JsonIgnoreCondition.WhenWritingNull,
                Converters = { new System.Text.Json.Serialization.JsonStringEnumConverter(JsonNamingPolicy.CamelCase) }
            };

            string json = JsonSerializer.Serialize(kanbanData, options);

            // Output the JSON (this would be inserted into Obsidian markdown)
            Console.WriteLine("```kanban");
            Console.WriteLine(json);
            Console.WriteLine("```");

            // Example: Create a simple task array (alternative format)
            var simpleTasks = new List<KanbanTask>
            {
                new KanbanTask { Task = "Task 1", Status = "todo" },
                new KanbanTask { Task = "Task 2", Status = "in progress" },
                new KanbanTask { Task = "Task 3", Status = "done" }
            };

            string simpleJson = JsonSerializer.Serialize(simpleTasks, options);
            Console.WriteLine("\n--- Simple format (array only) ---");
            Console.WriteLine("```kanban");
            Console.WriteLine(simpleJson);
            Console.WriteLine("```");
        }
    }
}

