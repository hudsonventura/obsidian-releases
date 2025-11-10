"""
Data models for Obsidian Kanban Plugin integration
"""
from enum import Enum
from typing import Optional, List, Dict
from dataclasses import dataclass, field, asdict
from datetime import datetime
import json


class ColumnState(str, Enum):
    """Represents the state of a kanban column"""
    TODO = "todo"
    IN_PROGRESS = "in-progress"
    PENDING = "pending"
    DONE = "done"


class SortField(str, Enum):
    """Represents the sort field for column sorting"""
    UPDATE_DATE_TIME = "updateDateTime"
    DUE_DATE = "dueDate"
    TITLE = "title"
    TIME_SPENT = "timeSpent"


class SortOrder(str, Enum):
    """Represents the sort order"""
    ASC = "asc"
    DESC = "desc"


class KanbanView(str, Enum):
    """Represents the view mode for the kanban board"""
    HORIZONTAL = "horizontal"
    VERTICAL = "vertical"
    TABLE = "table"


@dataclass
class TimerEntry:
    """Represents a timer entry for tracking time spent on a task"""
    start_time: str
    end_time: Optional[str] = None

    def to_dict(self) -> dict:
        """Convert to dictionary with JSON property names"""
        return {
            "startTime": self.start_time,
            "endTime": self.end_time
        }


@dataclass
class KanbanTask:
    """Represents a task in the kanban board"""
    task: str
    status: Optional[str] = None
    timer_entries: Optional[List[TimerEntry]] = None
    target_time: Optional[str] = None  # e.g., "2h", "1d", "2025-12-31"
    tags: Optional[List[str]] = None  # e.g., ["#Test", "#John_Master"]
    due_date: Optional[str] = None  # ISO string format
    update_date_time: Optional[str] = None  # ISO string format

    def to_dict(self) -> dict:
        """Convert to dictionary with JSON property names"""
        result = {
            "task": self.task
        }
        
        if self.status is not None:
            result["status"] = self.status
        
        if self.timer_entries is not None:
            result["timerEntries"] = [entry.to_dict() for entry in self.timer_entries]
        
        if self.target_time is not None:
            result["targetTime"] = self.target_time
        
        if self.tags is not None:
            result["tags"] = self.tags
        
        if self.due_date is not None:
            result["dueDate"] = self.due_date
        
        if self.update_date_time is not None:
            result["updateDateTime"] = self.update_date_time
        
        return result


@dataclass
class ColumnMetadata:
    """Represents metadata for a kanban column"""
    name: str
    state: ColumnState = ColumnState.TODO
    icon: Optional[str] = None  # Emoji or icon name
    sort_field: Optional[SortField] = None
    sort_order: Optional[SortOrder] = None
    manual_sort: Optional[bool] = None

    def to_dict(self) -> dict:
        """Convert to dictionary with JSON property names"""
        result = {
            "name": self.name,
            "state": self.state.value
        }
        
        if self.icon is not None:
            result["icon"] = self.icon
        
        if self.sort_field is not None:
            result["sortField"] = self.sort_field.value
        
        if self.sort_order is not None:
            result["sortOrder"] = self.sort_order.value
        
        if self.manual_sort is not None:
            result["manualSort"] = self.manual_sort
        
        return result


@dataclass
class KanbanData:
    """Represents the complete kanban board data structure"""
    tasks: Optional[List[KanbanTask]] = None
    columns: Optional[List[str]] = None
    column_metadata: Optional[List[ColumnMetadata]] = None
    collapsed_columns: Optional[List[str]] = None
    view: Optional[KanbanView] = None
    slim_mode: Optional[bool] = None
    column_widths: Optional[Dict[str, int]] = None

    def to_dict(self) -> dict:
        """Convert to dictionary with JSON property names"""
        result = {}
        
        if self.tasks is not None:
            result["tasks"] = [task.to_dict() for task in self.tasks]
        
        if self.columns is not None:
            result["columns"] = self.columns
        
        if self.column_metadata is not None:
            result["columnMetadata"] = [meta.to_dict() for meta in self.column_metadata]
        
        if self.collapsed_columns is not None:
            result["collapsedColumns"] = self.collapsed_columns
        
        if self.view is not None:
            result["view"] = self.view.value
        
        if self.slim_mode is not None:
            result["slimMode"] = self.slim_mode
        
        if self.column_widths is not None:
            result["columnWidths"] = self.column_widths
        
        return result

    def to_json(self, indent: int = 2) -> str:
        """Convert to JSON string"""
        return json.dumps(self.to_dict(), indent=indent, ensure_ascii=False)

