import json
import subprocess

CALENDAR_EVENTS_FS_PATH = '/usr/app/calendar-data/events.json';

all_events = []

with open(CALENDAR_EVENTS_FS_PATH) as f:
    raw_content = f.read()
    all_events = json.loads(raw_content)['items']

# Event summary: event['summary']
# Event start time: event['start']['dateTime']

