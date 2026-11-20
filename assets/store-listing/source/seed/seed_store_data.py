#!/usr/bin/env python3
"""Seed a fresh simulator install of Chits with fictional, store-ready sample data.

Usage: python3 seed_store_data.py <path/to/chits.db> <path/to/Documents>

Run it against a NEW simulator device only, after Chits has launched once (so the
schema exists) and while the app is not running. Every name and note here is
fictional. Nothing is read from, or written to, a real user's data.
"""
import json
import shutil
import sqlite3
import sys
import time
from datetime import date, datetime, timedelta
from pathlib import Path

HERE = Path(__file__).resolve().parent
db_path, documents = Path(sys.argv[1]), Path(sys.argv[2])

now = int(time.time() * 1000)
MIN = 60_000
HOUR = 60 * MIN
DAY = 24 * HOUR
today = date.today()


def day_key(offset: int) -> str:
    return (today + timedelta(days=offset)).isoformat()


def at(offset_days: int, hour: int, minute: int = 0) -> int:
    moment = datetime.combine(today + timedelta(days=offset_days), datetime.min.time()).replace(hour=hour, minute=minute)
    return int(moment.timestamp() * 1000)


con = sqlite3.connect(db_path)
con.execute("PRAGMA foreign_keys = ON")
cur = con.cursor()

# ── First run already done, so captures show the app as people use it ──────
settings = {
    "onboarding.version": "1",
    "onboarding.firstRun": "shown",
    "onboarding.completedAt": str(now - 7 * DAY),
    "onboarding.checklist": json.dumps(["firstNote", "firstCard", "firstReminder", "firstSpace"]),
    "onboarding.checklistHome": "dismissed",
    "onboarding.celebrated": "4",
    "notes_layout": "grid",
    "cards_order_mode": "recent",
}
for key, value in settings.items():
    cur.execute("INSERT OR REPLACE INTO app_settings (key, value, updated_at) VALUES (?, ?, ?)", (key, value, now))


def text_note(note_id, created, text, blocks=None, kind="text"):
    content = json.dumps(blocks) if blocks else None
    cur.execute(
        "INSERT INTO messages (id, text, type, created_at, updated_at, archived_at, pinned, deleted_at, is_hidden_content, content_json) VALUES (?, ?, ?, ?, ?, NULL, 0, NULL, 0, ?)",
        (note_id, text, kind, created, created, content),
    )


def checklist(title, items, list_id):
    blocks = []
    for index, (label, done) in enumerate(items):
        block = {"type": "text", "text": label, "list": {"kind": "checklist", "id": f"{list_id}-{index}", "checked": done}}
        if index == 0 and title:
            block["title"] = title
        blocks.append(block)
    words = "\n".join(label for label, _ in items)
    return (f"{title}\n{words}" if title else words), blocks


# ── Chat notes: the quick capture timeline ─────────────────────────────────
text_note("store-m10", at(-2, 19, 5), "Water the basil 🌿")
text_note("store-m11", at(-2, 19, 6), "Mia's cake at 6 🎂")
text_note("store-m12", at(-2, 19, 8), "Vet · Thu 10 AM 🐾")
text_note("store-m13", at(-2, 19, 9), "Rent is due Friday")
text_note("store-m01", at(-1, 8, 12), "Book club: finish chapter 9 before Thursday 📚")
text_note("store-m02", at(-1, 12, 40), "Idea: a no-spend weekend challenge with Sam — picnic instead of brunch?")
words, blocks = checklist("Groceries", [("Oat milk", True), ("Spinach", False), ("Eggs", True), ("Tortillas", False), ("Lemons", False), ("Coffee beans", False)], "groc")
text_note("store-m03", at(-1, 18, 5), words, blocks)
text_note("store-m04", at(0, 7, 48), "Call the vet about Mochi's checkup 🐾")
words, blocks = checklist("Weekend in Lisbon", [("Book the Alfama walking tour", True), ("Pastéis de Belém", False), ("Pack a light rain jacket", True), ("Sunset at Miradouro da Graça", False)], "lis")
text_note("store-m05", at(0, 8, 30), words, blocks)
text_note("store-m06", at(0, 9, 2), "Pick up Mia's birthday cake from the bakery before 6 🎂")

# Voice note and PDF, copied into Chits' private attachment folder.
attachments_dir = documents / "chits-attachments"
attachments_dir.mkdir(parents=True, exist_ok=True)
for name in ("store-voice-note.m4a", "store-lisbon-itinerary.pdf"):
    shutil.copy(HERE / name, attachments_dir / name)

text_note("store-m07", at(0, 9, 15), "Cake order, so I don't forget", kind="audio")
cur.execute(
    "INSERT INTO attachments (id, message_id, type, storage_path, original_name, mime_type, size, duration, width, height, created_at) VALUES (?, ?, 'audio', ?, 'Voice note.m4a', 'audio/m4a', ?, ?, NULL, NULL, ?)",
    ("store-a01", "store-m07", "chits-attachments/store-voice-note.m4a", (attachments_dir / "store-voice-note.m4a").stat().st_size, int(json.load(open(HERE / "voice-note.json"))["duration_ms"]), at(0, 9, 15)),
)
text_note("store-m08", at(0, 9, 20), "Lisbon itinerary", kind="file")
cur.execute(
    "INSERT INTO attachments (id, message_id, type, storage_path, original_name, mime_type, size, duration, width, height, created_at) VALUES (?, ?, 'file', ?, 'Lisbon itinerary.pdf', 'application/pdf', ?, NULL, NULL, NULL, ?)",
    ("store-a02", "store-m08", "chits-attachments/store-lisbon-itinerary.pdf", (attachments_dir / "store-lisbon-itinerary.pdf").stat().st_size, at(0, 9, 20)),
)
text_note("store-m09", at(0, 9, 33), "Remember: water the basil on the balcony 🌿")

# Reminders on notes (Chits schedules the local notification itself on launch).
cur.execute("INSERT INTO message_reminders (message_id, scheduled_at, notification_id, completed_at, created_at, updated_at) VALUES (?, ?, NULL, NULL, ?, ?)", ("store-m04", at(1, 10, 0), now, now))
cur.execute("INSERT INTO message_reminders (message_id, scheduled_at, notification_id, completed_at, created_at, updated_at) VALUES (?, ?, NULL, NULL, ?, ?)", ("store-m06", at(1, 17, 30), now, now))

# ── A board: an apartment move, the kind of plan notes turn into ───────────
cur.execute(
    "INSERT INTO boards (id, name, icon, accent, created_at, updated_at, archived_at, pinned, last_opened_at, show_next_column_peek, show_column_navigator) VALUES (?, ?, NULL, NULL, ?, ?, NULL, 1, ?, 0, 1)",
    ("store-b1", "Apartment Move", now - 5 * DAY, now - HOUR, now - 10 * MIN),
)
columns = [("store-c1", "To do"), ("store-c2", "Doing"), ("store-c3", "Done")]
for position, (column_id, name) in enumerate(columns, start=1):
    cur.execute("INSERT INTO board_columns (id, board_id, name, position, created_at, updated_at) VALUES (?, 'store-b1', ?, ?, ?, ?)", (column_id, name, position, now - 5 * DAY, now - 5 * DAY))
cards = [
    ("store-k1", "store-c1", "Change address with the bank", 1),
    ("store-k2", "store-c1", "Transfer the internet plan", 2),
    ("store-k3", "store-c1", "Order curtains for the bedroom", 3),
    ("store-k4", "store-c2", "Book the movers", 1),
    ("store-k5", "store-c2", "Pack the kitchen", 2),
    ("store-k6", "store-c3", "Declutter the closet", 1),
    ("store-k7", "store-c3", "Measure the new living room", 2),
]
for card_id, column_id, title, position in cards:
    cur.execute(
        "INSERT INTO cards (id, board_id, column_id, title, position, archived_at, created_at, updated_at, pinned, last_opened_at) VALUES (?, 'store-b1', ?, ?, ?, NULL, ?, ?, 0, NULL)",
        (card_id, column_id, title, position, now - 4 * DAY, now - 2 * HOUR),
    )
subtasks = {
    "store-k4": [("Get three quotes", True), ("Compare prices", True), ("Confirm Saturday 9 AM", False), ("Send the new address", False)],
    "store-k5": [("Buy boxes and tape", True), ("Wrap the glasses", False), ("Label every box", False)],
}
for card_id, items in subtasks.items():
    for position, (title, done) in enumerate(items):
        cur.execute(
            "INSERT INTO card_subtasks (id, card_id, title, is_completed, position, created_at, updated_at, completed_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
            (f"{card_id}-s{position}", card_id, title, 1 if done else 0, position, now - 3 * DAY, now - HOUR, now - HOUR if done else None),
        )
cur.execute("INSERT INTO card_reminders (card_id, scheduled_at, notification_id, created_at, updated_at, completed_at) VALUES ('store-k4', ?, NULL, ?, ?, NULL)", (at(2, 9, 0), now, now))

# ── Spaces: notes stuck where they'll be seen ──────────────────────────────
YELLOW, PINK, BLUE, GREEN, ORANGE = "#FFE58A", "#FFC7CC", "#C4E4FF", "#D2F0C4", "#FFD6AE"
stickies = [
    ("fridge", "store-m10", 0.12, 0.08, -4, GREEN, 1, "sticky"),
    ("fridge", "store-m11", 0.60, 0.14, 3, PINK, 2, "sticky"),
    ("fridge", "store-m03", 0.16, 0.48, 2, YELLOW, 3, "index"),
    ("fridge", "store-m12", 0.62, 0.55, -3, BLUE, 4, "sticky"),
    ("fridge", "store-m13", 0.40, 0.80, 1, ORANGE, 5, "receipt"),
    ("desk", "store-m02", 0.18, 0.20, -2, ORANGE, 1, "sticky"),
    ("desk", "store-m01", 0.58, 0.45, 3, YELLOW, 2, "receipt"),
]
for index, (space, message_id, x, y, rotation, color, z, style) in enumerate(stickies):
    cur.execute(
        "INSERT INTO space_placements (id, message_id, card_id, space_id, x, y, rotation, color, z_index, pinned_at, updated_at, paper_style) VALUES (?, ?, NULL, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
        (f"store-p{index}", message_id, space, x, y, rotation, color, z, now - index * MIN, now - index * MIN, style),
    )

# ── Calendar: dated notes across this week ─────────────────────────────────
calendar = [
    ("store-e1", "store-m06", None, day_key(1), 17 * 60 + 30, None, 30),
    ("store-e6", "store-m01", None, day_key(0), 22 * 60, 23 * 60, 15),
    ("store-e7", "store-m09", None, day_key(0), 22 * 60 + 45, None, 0),
    ("store-e2", "store-m04", None, day_key(1), 10 * 60, None, 15),
    ("store-e3", "store-m02", None, day_key(2), 19 * 60, 20 * 60, 60),
    ("store-e4", None, "store-k4", day_key(2), 9 * 60, 12 * 60, 60),
    ("store-e5", "store-m05", None, day_key(4), None, None, None),
]
for entry_id, message_id, card_id, key, start, end, offset in calendar:
    cur.execute(
        "INSERT INTO calendar_entries (id, message_id, card_id, date_key, start_minute, end_minute, reminder_offset, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
        (entry_id, message_id, card_id, key, start, end, offset, now, now),
    )

# ── Plan My Day: today's few things ────────────────────────────────────────
cur.execute("INSERT INTO daily_plans (id, plan_date, status, reflection, created_at, updated_at, wrapped_at) VALUES ('store-plan', ?, 'active', NULL, ?, ?, NULL)", (day_key(0), at(0, 7, 30), now))
plan = [
    ("Pay the rent", at(0, 8, 0), None),
    ("Order Mia's birthday cake", at(0, 9, 20), None),
    ("30-minute walk", None, None),
    ("Call the vet about Mochi", None, None),
]
for position, (title, completed, reminder) in enumerate(plan):
    cur.execute(
        "INSERT INTO daily_tasks (id, plan_id, title, completed_at, position, reminder_at, message_id, card_id, carried_from, carried_to, created_at, updated_at) VALUES (?, 'store-plan', ?, ?, ?, ?, NULL, NULL, NULL, NULL, ?, ?)",
        (f"store-t{position}", title, completed, position, reminder, at(0, 7, 30), now),
    )

con.commit()
con.close()
print("seeded", db_path)
