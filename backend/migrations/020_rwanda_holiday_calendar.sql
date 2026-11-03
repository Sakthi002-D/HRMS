-- Migration 020: Rwanda Holiday Calendar
-- Adds rwandaHolidayCalendar key to leave_policy_settings.policy JSON
-- Safe to run multiple times (jsonb_set only updates if key absent or empty)

UPDATE public.leave_policy_settings
SET policy = jsonb_set(
    policy,
    '{rwandaHolidayCalendar}',
    '[
        {"name": "New Year''s Day",        "date": "1 January",   "days": 1},
        {"name": "Heroes'' Day",           "date": "1 February",  "days": 1},
        {"name": "International Women''s Day", "date": "8 March",  "days": 1},
        {"name": "Genocide Memorial Day",  "date": "7 April",     "days": 1},
        {"name": "Labour Day",             "date": "1 May",       "days": 1},
        {"name": "Liberation Day",         "date": "4 July",      "days": 1},
        {"name": "Umuganura Day",          "date": "First Friday of August", "days": 1},
        {"name": "Assumption Day",         "date": "15 August",   "days": 1},
        {"name": "Christmas Day",          "date": "25 December", "days": 1},
        {"name": "Boxing Day",             "date": "26 December", "days": 1},
        {"name": "Good Friday",            "date": "Islamic calendar", "days": 1},
        {"name": "Easter Monday",          "date": "Islamic calendar", "days": 1}
    ]'::jsonb,
    true   -- create key even if not present
)
WHERE id = 1
  AND (policy->'rwandaHolidayCalendar' IS NULL
       OR jsonb_array_length(policy->'rwandaHolidayCalendar') = 0);
