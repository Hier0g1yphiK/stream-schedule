# Requirements Document

## Introduction

A Discord bot that automates the posting of weekly stream schedules. Server administrators configure the bot by selecting a target channel, a posting day, and a posting time. Each week, streamers input their schedule entries, and the bot automatically posts the compiled schedule at the configured day and time in the designated channel.

## Glossary

- **Bot**: The Discord bot application that manages stream schedule configuration and posting
- **Server_Admin**: A Discord user with administrator permissions who configures the bot
- **Streamer**: A Discord user who inputs their weekly stream schedule entries
- **Schedule_Entry**: A single time slot in the weekly schedule containing a day, time, and stream title
- **Weekly_Schedule**: The collection of all Schedule_Entry items for a given week
- **Target_Channel**: The Discord text channel selected during setup where the schedule will be posted
- **Posting_Day**: The day of the week when the bot automatically posts the Weekly_Schedule
- **Posting_Time**: The specific time on the Posting_Day when the bot posts the Weekly_Schedule
- **Setup_Configuration**: The stored settings including Target_Channel, Posting_Day, and Posting_Time

## Requirements

### Requirement 1: Bot Setup - Channel Selection

**User Story:** As a Server_Admin, I want to select which Discord channel the schedule will be posted in, so that the schedule appears in the appropriate channel for my community.

#### Acceptance Criteria

1. WHEN the Server_Admin initiates bot setup, THE Bot SHALL present a list of available text channels in the server that the Bot has permission to view
2. WHEN the Server_Admin selects a Target_Channel, THE Bot SHALL store the selected channel as part of the Setup_Configuration and display a confirmation message indicating the saved Target_Channel
3. IF the Server_Admin selects a channel where the Bot lacks send permissions, THEN THE Bot SHALL notify the Server_Admin that the channel is invalid and prompt for a different selection
4. THE Bot SHALL restrict the setup command to users with administrator permissions
5. IF a non-admin user attempts to run the setup command, THEN THE Bot SHALL respond with an error message indicating that administrator permissions are required

### Requirement 2: Bot Setup - Posting Day Configuration

**User Story:** As a Server_Admin, I want to choose which day of the week the schedule is posted, so that it aligns with my community's planning rhythm.

#### Acceptance Criteria

1. WHEN the Server_Admin configures the Posting_Day, THE Bot SHALL present exactly seven selectable options: Monday, Tuesday, Wednesday, Thursday, Friday, Saturday, and Sunday
2. WHEN the Server_Admin selects a Posting_Day, THE Bot SHALL store the selected day as part of the Setup_Configuration and display a confirmation message indicating the saved Posting_Day
3. IF the Server_Admin provides an invalid day value, THEN THE Bot SHALL display an error message listing the seven valid day options (Monday through Sunday) and prompt the Server_Admin to select again

### Requirement 3: Bot Setup - Posting Time Configuration

**User Story:** As a Server_Admin, I want to set the time of day when the schedule is posted, so that the schedule goes out when my community is most active.

#### Acceptance Criteria

1. WHEN the Server_Admin configures the Posting_Time, THE Bot SHALL accept a time value in 24-hour format (HH:MM) within the valid range of 00:00 to 23:59
2. WHEN the Server_Admin provides a valid Posting_Time, THE Bot SHALL store the provided time in UTC as part of the Setup_Configuration
3. IF the Server_Admin provides a time value that does not match HH:MM format or falls outside the valid range of 00:00 to 23:59, THEN THE Bot SHALL display an error message indicating the expected format and valid range
4. WHEN all setup steps (Target_Channel, Posting_Day, and Posting_Time) are completed, THE Bot SHALL display a summary showing the stored Target_Channel name, Posting_Day, and Posting_Time in UTC to the Server_Admin for confirmation
5. WHEN the Server_Admin configures the Posting_Time, THE Bot SHALL accept the time value as UTC

### Requirement 4: Schedule Input

**User Story:** As a Streamer, I want to input my weekly stream schedule, so that my streams appear in the posted schedule for the community.

#### Acceptance Criteria

1. WHEN a Streamer submits a Schedule_Entry, THE Bot SHALL store the entry associated with the current week's Weekly_Schedule
2. THE Bot SHALL accept Schedule_Entry data containing a day of the week, a start time in HH:MM 24-hour format, and a stream title with a maximum length of 100 characters
3. WHEN a Streamer submits multiple Schedule_Entry items, THE Bot SHALL store all entries for that Streamer in the current Weekly_Schedule up to a maximum of 20 entries per Streamer per week
4. WHEN a Streamer resubmits a Schedule_Entry for the same day and time, THE Bot SHALL replace the previous entry with the new one
5. IF a Streamer submits a Schedule_Entry after the Posting_Time on the Posting_Day, THEN THE Bot SHALL associate the entry with the next week's Weekly_Schedule
6. IF a Streamer provides invalid input (incorrect time format, title exceeding 100 characters, or invalid day), THEN THE Bot SHALL display an error message indicating which field is invalid and the expected format
7. WHEN a Schedule_Entry is successfully stored, THE Bot SHALL display a confirmation message to the Streamer showing the saved entry details

### Requirement 5: Automated Schedule Posting

**User Story:** As a Server_Admin, I want the bot to automatically post the compiled schedule at the configured day and time, so that my community receives a consistent weekly update without manual effort.

#### Acceptance Criteria

1. WHEN the Posting_Day and Posting_Time arrive, THE Bot SHALL post the compiled Weekly_Schedule in the Target_Channel within 5 minutes of the configured Posting_Time
2. THE Bot SHALL format the Weekly_Schedule as a message grouping Schedule_Entry items by day of the week, sorted by start time within each day, and displaying the Streamer name, start time, and stream title for each entry
3. WHEN the Weekly_Schedule contains no Schedule_Entry items, THE Bot SHALL post a message in the Target_Channel indicating no streams are scheduled for the week
4. WHEN the Bot successfully posts the Weekly_Schedule, THE Bot SHALL clear the current week's schedule entries and begin accepting entries for the next week
5. IF the Bot fails to post the Weekly_Schedule due to missing permissions or the Target_Channel being unavailable, THEN THE Bot SHALL retry posting once after 1 minute and notify the Server_Admin via direct message if the retry also fails
6. IF the Setup_Configuration is incomplete at the scheduled Posting_Time, THEN THE Bot SHALL not attempt to post and SHALL notify the Server_Admin via direct message that setup must be completed

### Requirement 6: Setup Modification

**User Story:** As a Server_Admin, I want to modify the bot's setup configuration after initial setup, so that I can adjust the channel, day, or time as my community's needs change.

#### Acceptance Criteria

1. WHEN the Server_Admin re-runs the setup command, THE Bot SHALL allow modification of individual Setup_Configuration values (Target_Channel, Posting_Day, or Posting_Time) without requiring all values to be re-entered
2. WHEN the Setup_Configuration is modified, THE Bot SHALL preserve any existing Schedule_Entry items for the current week
3. WHEN the Setup_Configuration is updated, THE Bot SHALL use the new values starting from the next occurring Posting_Day and Posting_Time, even if the update occurs on the current Posting_Day before the Posting_Time
4. IF the Server_Admin modifies the Posting_Day or Posting_Time to a day and time that has already passed in the current week, THEN THE Bot SHALL apply the new configuration starting the following week
5. WHEN the Setup_Configuration is successfully modified, THE Bot SHALL confirm the updated configuration (Target_Channel, Posting_Day, Posting_Time) to the Server_Admin
