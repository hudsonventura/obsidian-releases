"""
Example demonstrating how to create and serialize kanban board data
"""
import json
from datetime import datetime, timedelta
from kanban_models import (
    KanbanData, KanbanTask, TimerEntry, ColumnMetadata,
    ColumnState, KanbanView
)


def create_example_kanban():
    """Create an example kanban board with tasks"""
    
    # Create tasks with various properties
    tasks = [
        KanbanTask(
            task="Implement user authentication",
            status="In Progress",
            target_time="8h",
            tags=["#backend", "#security"],
            due_date=(datetime.utcnow() + timedelta(days=3)).isoformat() + "Z",
            update_date_time=datetime.utcnow().isoformat() + "Z",
            timer_entries=[
                TimerEntry(
                    start_time=(datetime.utcnow() - timedelta(hours=2)).isoformat() + "Z",
                    end_time=None  # Running timer
                )
            ]
        ),
        KanbanTask(
            task="Design database schema",
            status="Done",
            target_time="4h",
            tags=["#database", "#design"],
            update_date_time=(datetime.utcnow() - timedelta(days=1)).isoformat() + "Z",
            timer_entries=[
                TimerEntry(
                    start_time=(datetime.utcnow() - timedelta(days=1, hours=4)).isoformat() + "Z",
                    end_time=(datetime.utcnow() - timedelta(days=1)).isoformat() + "Z"
                )
            ]
        ),
        KanbanTask(
            task="Write API documentation",
            status="To Do",
            target_time="2h",
            tags=["#documentation"],
            due_date=(datetime.utcnow() + timedelta(days=5)).isoformat() + "Z"
        ),
        KanbanTask(
            task="Code review for PR #42",
            status="Review",
            target_time="1h",
            tags=["#review"]
        )
    ]

    # Create column metadata
    column_metadata = [
        ColumnMetadata(
            name="Backlog",
            state=ColumnState.TODO,
            icon="📋"
        ),
        ColumnMetadata(
            name="To Do",
            state=ColumnState.TODO,
            icon="⏳"
        ),
        ColumnMetadata(
            name="In Progress",
            state=ColumnState.IN_PROGRESS,
            icon="🔄"
        ),
        ColumnMetadata(
            name="Review",
            state=ColumnState.PENDING,
            icon="👀"
        ),
        ColumnMetadata(
            name="Done",
            state=ColumnState.DONE,
            icon="✅"
        )
    ]

    # Create the kanban data structure
    kanban_data = KanbanData(
        columns=["Backlog", "To Do", "In Progress", "Review", "Done"],
        column_metadata=column_metadata,
        tasks=tasks,
        view=KanbanView.TABLE,
        slim_mode=False
    )

    return kanban_data


def main():
    """Main example function"""
    # Create example kanban board
    kanban = create_example_kanban()

    # Convert to JSON
    json_output = kanban.to_json()

    # Output the JSON (this would be inserted into Obsidian markdown)
    print("```kanban")
    print(json_output)
    print("```")

    # Example: Create a simple task array (alternative format)
    simple_tasks = [
        KanbanTask(task="Task 1", status="todo"),
        KanbanTask(task="Task 2", status="in progress"),
        KanbanTask(task="Task 3", status="done")
    ]

    simple_json = json.dumps(
        [task.to_dict() for task in simple_tasks],
        indent=2,
        ensure_ascii=False
    )

    print("\n--- Simple format (array only) ---")
    print("```kanban")
    print(simple_json)
    print("```")


if __name__ == "__main__":
    main()

