using System;
using System.Collections.Generic;
using System.Text.Json.Serialization;

namespace ObsidianKanban.Models
{
    /// <summary>
    /// Represents the state of a kanban column
    /// </summary>
    public enum ColumnState
    {
        Todo,
        [JsonPropertyName("in-progress")]
        InProgress,
        Pending,
        Done
    }

    /// <summary>
    /// Represents the sort field for column sorting
    /// </summary>
    public enum SortField
    {
        UpdateDateTime,
        DueDate,
        Title,
        TimeSpent
    }

    /// <summary>
    /// Represents the sort order
    /// </summary>
    public enum SortOrder
    {
        Asc,
        Desc
    }

    /// <summary>
    /// Represents the view mode for the kanban board
    /// </summary>
    public enum KanbanView
    {
        Horizontal,
        Vertical,
        Table
    }

    /// <summary>
    /// Represents a timer entry for tracking time spent on a task
    /// </summary>
    public class TimerEntry
    {
        public string StartTime { get; set; } = string.Empty;
        public string? EndTime { get; set; }
    }

    /// <summary>
    /// Represents a task in the kanban board
    /// </summary>
    public class KanbanTask
    {
        public string Task { get; set; } = string.Empty;
        public string? Status { get; set; }
        public List<TimerEntry>? TimerEntries { get; set; }
        public string? TargetTime { get; set; } // e.g., "2h", "1d", "2025-12-31"
        public List<string>? Tags { get; set; } // e.g., ["#Test", "#John_Master"]
        public string? DueDate { get; set; } // ISO string format
        public string? UpdateDateTime { get; set; } // ISO string format
    }

    /// <summary>
    /// Represents metadata for a kanban column
    /// </summary>
    public class ColumnMetadata
    {
        public string Name { get; set; } = string.Empty;
        public ColumnState State { get; set; } = ColumnState.Todo;
        public string? Icon { get; set; } // Emoji or icon name
        public SortField? SortField { get; set; }
        public SortOrder? SortOrder { get; set; }
        public bool? ManualSort { get; set; }
    }

    /// <summary>
    /// Represents the complete kanban board data structure
    /// </summary>
    public class KanbanData
    {
        public List<KanbanTask>? Tasks { get; set; }
        public List<string>? Columns { get; set; }
        public List<ColumnMetadata>? ColumnMetadata { get; set; }
        public List<string>? CollapsedColumns { get; set; }
        public KanbanView? View { get; set; }
        public bool? SlimMode { get; set; }
        public Dictionary<string, int>? ColumnWidths { get; set; }
    }
}

