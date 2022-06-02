const JSZip = require("jszip");
const fs = require('fs');
const fsPromises = require('fs/promises');
const moment = require('moment');
moment().format();

const yargs = require('yargs/yargs');
const { hideBin } = require('yargs/helpers');
const argv = yargs(hideBin(process.argv))
    .command('daylio', 'Converts the log entries contained within your Daylio backup file to a `.json` file compatible with Year in Pixels.')
    .example('$0 -d mybackup.daylio', 'Converts your Daylio backup file at `./mybackup.daylio` to a Year in Pixels JSON file at `./mybackup.daylio-converted.json`.')
    .alias('d', 'daylio')
    .command('pixels', 'Converts the log entries contained within your Year in Pixels backup file to a `.daylio` file compatible with Daylio.')
    .example('$0 -p pixels-backup.json', 'Converts your Year in Pixels backup file at `./pixels-backup.json` to a Daylio file at `./pixels-backup.json-converted.daylio`.')
    .alias('p', 'pixels')
    .help('h')
    .alias('h', 'help')
    .check(function (argv) {
        if ((argv.daylio && !argv.pixels) || (!argv.daylio && argv.pixels)) {
            return true;
        } else {
            throw (new Error('Pass the path to your Daylio backup file *or* your Year in Pixels backup file - not both!'));
        }
    })
    .argv;

const getDaylioJSON = async () => {
    let daylioBackupFile;
    try {
        daylioBackupFile = await fsPromises.readFile(argv.daylio);
    } catch (err) {
        console.error(err);
    }

    let daylioBackupZIPContents;
    try {
        daylioBackupZIPContents = await JSZip.loadAsync(daylioBackupFile);
    } catch (err) {
        console.error(err);
    }

    const daylioData = daylioBackupZIPContents.file('backup.daylio');

    let base64DaylioData;
    try {
        base64DaylioData = await daylioData.async("string");
    } catch (err) {
        console.error(err);
    }

    let text = Buffer.from(base64DaylioData, 'base64');

    return JSON.parse(text.toString());
}

const clamp = (num, min, max) => Math.min(Math.max(num, min), max);

const convertFromDaylioToPixels = async () => {
    const daylioJSON = await getDaylioJSON();

    console.log(`Converting ${daylioJSON.dayEntries.length} Daylio entries from \`${argv.daylio}\` to Year in Pixels entries...`);
    console.log(`CONVERSION NOTES:`);
    console.log(`- Year in Pixels "mood" values are clamped between 1 (worst) and 5 (best).`);
    console.log(`- If you made multiple Daylio entries in one day, we average your "mood" value for that day during conversion. That average value is then rounded, then clamped.`);
    console.log(`- Neither tags nor moods are included in the resulting Year in Pixels data.`);

    let pixelsJSON = [];

    for (let i = 0; i < daylioJSON.dayEntries.length; i++) {
        const entry = daylioJSON.dayEntries[i];
        const formattedDateString = `${entry.year}-${(entry.month + 1).toString().padStart(2, '0')}-${entry.day.toString().padStart(2, '0')}`;

        if (pixelsJSON.findIndex((el) => { return el["date"] === formattedDateString; }) > -1) {
            continue;
        }

        let currentDayEntries = daylioJSON.dayEntries.filter((el) => {
            return el.year === entry.year && el.month === entry.month && el.day === entry.day;
        });

        let avgMood = 0;
        let notesString = ``;
        currentDayEntries.forEach((innerEntry, idx, arr) => {
            avgMood += innerEntry.mood;
            notesString += innerEntry.note;
            if (idx < arr.length - 1) {
                notesString += `\n`;
            }
        });
        avgMood /= currentDayEntries.length;
        avgMood = Math.round(avgMood);
        avgMood = clamp(avgMood, 1, 5);
        // `6` because there are 5 default moods in Daylio and a `mood` value of `1` corresponds to "best mood"
        avgMood = 6 - avgMood;

        pixelsJSON.push({
            "date": formattedDateString,
            "entries": [
                {
                    "type": "Mood",
                    "value": avgMood,
                    "notes": notesString,
                    "isHighlighted": false,
                    "tags": []
                }
            ]
        });
    };
    console.log(`Converted ${daylioJSON.dayEntries.length} Daylio entries to Year in Pixels entries!\n`);

    const outputPixelsJSONFilename = `${argv.daylio}-converted.json`;
    console.log(`Writing \`${outputPixelsJSONFilename}\`...`);
    try {
        await fsPromises.writeFile(outputPixelsJSONFilename, JSON.stringify(pixelsJSON));
    } catch (err) {
        console.log(err);
    }
    console.log(`Wrote \`${outputPixelsJSONFilename}\`!\n`);
    console.log("Successfully converted from Daylio backup data to Year in Pixels backup data!");

    // Uncomment the lines below to write a pretty-printed version of the Daylio backup JSON to disk.
    // try {
    //     const prettyFilename = `${argv.daylio}-pretty.json`;
    //     console.log(`\n\nAlso writing pretty-printed version of the Daylio backup JSON to \`${prettyFilename}\`...`);
    //     await fsPromises.writeFile(prettyFilename, JSON.stringify(daylioJSON, null, 4));
    // } catch (err) {
    //     console.log(err);
    // }
}

const convertFromPixelsToDaylio = async () => {
    let pixelsText;
    try {
        pixelsText = await fsPromises.readFile(argv.pixels, { encoding: 'utf8' });
    } catch (err) {
        console.error(err);
    }

    let pixelsJSON;
    try {
        pixelsJSON = JSON.parse(pixelsText);
    } catch (err) {
        console.error(err);
    }

    console.log(`Converting ${pixelsJSON.length} Year in Pixels entries from \`${argv.pixels}\` to Daylio entries...`);
    console.log(`CONVERSION NOTES:`);
    console.log(`- Neither tags nor moods are included in the resulting Daylio data.`);

    const now = Date.now();
    let daylioJSON = {
        // I know what these do
        "dayEntries": [],
        // I can guess what these do based on the key names
        "achievements": [
            {
                "name": "AC_FIRST_ENTRY",
                "AC_FIRST_ENTRY_SEEN": false,
                "AC_FIRST_ENTRY_UNLOCKED_AT": 0
            },
            {
                "name": "AC_ENTRIES",
                "AC_ENTRIES_SEEN": false,
                "AC_ENTRIES_UNLOCKED_AT": 0,
                "AC_ENTRIES_CURRENT_LEVEL": 0,
                "AC_ENTRIES_CURRENT_VALUE": 0,
                "AC_ENTRIES_LAST_SEEN_LEVEL": 0
            },
            {
                "name": "AC_ENTRIES_BONUS_LVL",
                "AC_ENTRIES_BONUS_LVL_SEEN": false,
                "AC_ENTRIES_BONUS_LVL_UNLOCKED_AT": 0,
                "AC_ENTRIES_BONUS_LVL_CURRENT_LEVEL": 0,
                "AC_ENTRIES_BONUS_LVL_CURRENT_VALUE": 0,
                "AC_ENTRIES_BONUS_LVL_LAST_SEEN_LEVEL": 0
            },
            {
                "name": "AC_ENTRIES_MILLENNIUMS",
                "AC_ENTRIES_MILLENNIUMS_SEEN": false,
                "AC_ENTRIES_MILLENNIUMS_UNLOCKED_AT": 0,
                "AC_ENTRIES_MILLENNIUMS_CURRENT_LEVEL": 0,
                "AC_ENTRIES_MILLENNIUMS_CURRENT_VALUE": 0,
                "AC_ENTRIES_MILLENNIUMS_LAST_SEEN_LEVEL": 0
            },
            {
                "name": "AC_ENTRIES_ETERNITY",
                "AC_ENTRIES_ETERNITY_SEEN": false,
                "AC_ENTRIES_ETERNITY_UNLOCKED_AT": 0,
                "AC_ENTRIES_ETERNITY_CURRENT_LEVEL": 0,
                "AC_ENTRIES_ETERNITY_CURRENT_VALUE": 0,
                "AC_ENTRIES_ETERNITY_LAST_SEEN_LEVEL": 0
            },
            {
                "name": "AC_STREAK",
                "AC_STREAK_SEEN": false,
                "AC_STREAK_UNLOCKED_AT": 0,
                "AC_STREAK_CURRENT_LEVEL": 0,
                "AC_STREAK_CURRENT_VALUE": 0,
                "AC_STREAK_LAST_SEEN_LEVEL": 0
            },
            {
                "name": "AC_MEGA_STREAK",
                "AC_MEGA_STREAK_SEEN": false,
                "AC_MEGA_STREAK_UNLOCKED_AT": 0,
                "AC_MEGA_STREAK_CURRENT_LEVEL": 0,
                "AC_MEGA_STREAK_CURRENT_VALUE": 0,
                "AC_MEGA_STREAK_LAST_SEEN_LEVEL": 0
            },
            {
                "name": "AC_EPIC_STREAK",
                "AC_EPIC_STREAK_SEEN": false,
                "AC_EPIC_STREAK_UNLOCKED_AT": 0,
                "AC_EPIC_STREAK_CURRENT_LEVEL": 0,
                "AC_EPIC_STREAK_CURRENT_VALUE": 0,
                "AC_EPIC_STREAK_LAST_SEEN_LEVEL": 0
            },
            {
                "name": "AC_MYTHICAL_STREAK",
                "AC_MYTHICAL_STREAK_SEEN": false,
                "AC_MYTHICAL_STREAK_UNLOCKED_AT": 0,
                "AC_MYTHICAL_STREAK_CURRENT_LEVEL": 0,
                "AC_MYTHICAL_STREAK_CURRENT_VALUE": 0,
                "AC_MYTHICAL_STREAK_LAST_SEEN_LEVEL": 0
            },
            {
                "name": "AC_STREAK_BONUS",
                "AC_STREAK_BONUS_SEEN": false,
                "AC_STREAK_BONUS_UNLOCKED_AT": 0
            },
            {
                "name": "AC_TAGS",
                "AC_TAGS_SEEN": false,
                "AC_TAGS_UNLOCKED_AT": 1654186900414,
                "AC_TAGS_CURRENT_LEVEL": 3,
                "AC_TAGS_CURRENT_VALUE": 33,
                "AC_TAGS_LAST_SEEN_LEVEL": 3
            },
            {
                "name": "AC_MOODS",
                "AC_MOODS_SEEN": false,
                "AC_MOODS_UNLOCKED_AT": 0,
                "AC_MOODS_CURRENT_LEVEL": 0,
                "AC_MOODS_CURRENT_VALUE": 5,
                "AC_MOODS_LAST_SEEN_LEVEL": 0
            },
            {
                "name": "AC_GOALS_DEDICATED",
                "AC_GOALS_DEDICATED_SEEN": false,
                "AC_GOALS_DEDICATED_UNLOCKED_AT": 0,
                "AC_GOALS_DEDICATED_CURRENT_LEVEL": 0,
                "AC_GOALS_DEDICATED_CURRENT_VALUE": 0,
                "AC_GOALS_DEDICATED_LAST_SEEN_LEVEL": 0
            },
            {
                "name": "AC_PAPARAZZI",
                "AC_PAPARAZZI_SEEN": false,
                "AC_PAPARAZZI_UNLOCKED_AT": 0,
                "AC_PAPARAZZI_CURRENT_LEVEL": 0,
                "AC_PAPARAZZI_CURRENT_VALUE": 0,
                "AC_PAPARAZZI_LAST_SEEN_LEVEL": 0
            },
            {
                "name": "AC_COLORS",
                "AC_COLORS_SEEN": false,
                "AC_COLORS_UNLOCKED_AT": 0
            },
            {
                "name": "AC_MULTIPLE_ENTRIES",
                "AC_MULTIPLE_ENTRIES_SEEN": false,
                "AC_MULTIPLE_ENTRIES_UNLOCKED_AT": 0
            },
            {
                "name": "AC_GROUPS",
                "AC_GROUPS_SEEN": true,
                "AC_GROUPS_UNLOCKED_AT": 1654186900408
            },
            {
                "name": "AC_AUTO_BACKUP",
                "AC_AUTO_BACKUP_SEEN": false,
                "AC_AUTO_BACKUP_UNLOCKED_AT": 0
            },
            {
                "name": "AC_PREMIUM",
                "AC_PREMIUM_SEEN": false,
                "AC_PREMIUM_UNLOCKED_AT": 0
            },
            {
                "name": "AC_ROLLERCOASTER",
                "AC_ROLLERCOASTER_SEEN": false,
                "AC_ROLLERCOASTER_UNLOCKED_AT": 0
            },
            {
                "name": "AC_PIN_CODE",
                "AC_PIN_CODE_SEEN": false,
                "AC_PIN_CODE_UNLOCKED_AT": 0
            },
            {
                "name": "AC_NO_BACKUP",
                "AC_NO_BACKUP_SEEN": false,
                "AC_NO_BACKUP_UNLOCKED_AT": 0
            },
            {
                "name": "AC_MEH_DAYS",
                "AC_MEH_DAYS_SEEN": false,
                "AC_MEH_DAYS_UNLOCKED_AT": 0
            },
            {
                "name": "AC_GOOD_DAYS",
                "AC_GOOD_DAYS_SEEN": false,
                "AC_GOOD_DAYS_UNLOCKED_AT": 0
            },
            {
                "name": "AC_RAD_DAYS",
                "AC_RAD_DAYS_SEEN": false,
                "AC_RAD_DAYS_UNLOCKED_AT": 0
            },
            {
                "name": "AC_MOODS_BONUS",
                "AC_MOODS_BONUS_SEEN": false,
                "AC_MOODS_BONUS_UNLOCKED_AT": 0
            },
            {
                "name": "AC_TAGS_BONUS",
                "AC_TAGS_BONUS_SEEN": false,
                "AC_TAGS_BONUS_UNLOCKED_AT": 0
            },
            {
                "name": "AC_LUCKY_STREAK",
                "AC_LUCKY_STREAK_SEEN": false,
                "AC_LUCKY_STREAK_UNLOCKED_AT": 0
            },
            {
                "name": "AC_CRYPTIC_STREAK",
                "AC_CRYPTIC_STREAK_SEEN": false,
                "AC_CRYPTIC_STREAK_UNLOCKED_AT": 0
            },
            {
                "name": "AC_MYSTERIOUS_STREAK",
                "AC_MYSTERIOUS_STREAK_SEEN": false,
                "AC_MYSTERIOUS_STREAK_UNLOCKED_AT": 0
            },
            {
                "name": "AC_SAY_CHEESE",
                "AC_SAY_CHEESE_SEEN": false,
                "AC_SAY_CHEESE_UNLOCKED_AT": 0
            },
            {
                "name": "AC_YEARLY_REPORT_2021",
                "AC_YEARLY_REPORT_2021_SEEN": false,
                "AC_YEARLY_REPORT_2021_UNLOCKED_AT": 0
            },
            {
                "name": "AC_YEARLY_REPORT_2020",
                "AC_YEARLY_REPORT_2020_SEEN": false,
                "AC_YEARLY_REPORT_2020_UNLOCKED_AT": 0
            },
            {
                "name": "AC_YEARLY_REPORT_2019",
                "AC_YEARLY_REPORT_2019_SEEN": false,
                "AC_YEARLY_REPORT_2019_UNLOCKED_AT": 0
            },
            {
                "name": "AC_YEARLY_REPORT_2018",
                "AC_YEARLY_REPORT_2018_SEEN": false,
                "AC_YEARLY_REPORT_2018_UNLOCKED_AT": 0
            },
            {
                "name": "AC_YEARLY_REPORT_2017",
                "AC_YEARLY_REPORT_2017_SEEN": false,
                "AC_YEARLY_REPORT_2017_UNLOCKED_AT": 0
            },
            {
                "name": "AC_YEARLY_REPORT_2016",
                "AC_YEARLY_REPORT_2016_SEEN": false,
                "AC_YEARLY_REPORT_2016_UNLOCKED_AT": 0
            }
        ],
        "autoBackupIsEnabled": false,
        "colorPaletteId": 2,
        "customColorIdGreat": 33,
        "customColorIdAwful": 11,
        "customColorIdMeh": 25,
        "customColorIdGood": 39,
        "customColorIdFugly": 3,
        "customColorPrimary": 33,
        "daysInRowLongestChain": 0,
        "defaultColorPaletteId": 2,
        "goals_created_count": 0,
        "goalSuccessWeeks": [],
        "isColorPaletteReversed": false,
        "isCustomColorPaletteActive": false,
        "isReminderOn": true,
        "moodIconsPackId": 1,
        "platform": "iOS",
        "reminders": [
            {
                "id": 1,
                "state": 0,
                "minute": 0,
                "custom_text_enabled": false,
                "hour": 20
            }
        ],
        // I'm not confident about what these do
        "color_mode": "default",
        "customMoods": [
            {
                "id": 1,
                "icon_id": 1,
                "predefined_name_id": 1,
                "custom_name": "",
                "state": 0,
                "mood_group_order": 0,
                "mood_group_id": 1,
            },
            {
                "id": 2,
                "icon_id": 2,
                "predefined_name_id": 2,
                "custom_name": "",
                "state": 0,
                "mood_group_order": 0,
                "mood_group_id": 2,
            },
            {
                "id": 3,
                "icon_id": 3,
                "predefined_name_id": 3,
                "custom_name": "",
                "state": 0,
                "mood_group_order": 0,
                "mood_group_id": 3,
            },
            {
                "id": 4,
                "icon_id": 4,
                "predefined_name_id": 4,
                "custom_name": "",
                "state": 0,
                "mood_group_order": 0,
                "mood_group_id": 4,
            },
            {
                "id": 5,
                "icon_id": 5,
                "predefined_name_id": 5,
                "custom_name": "",
                "state": 0,
                "mood_group_order": 0,
                "mood_group_id": 5,
            }
        ],
        "tags": [
            {
                "id_tag_group": 1,
                "state": 0,
                "createdAt": now,
                "icon": 41,
                "id": 1,
                "order": 1,
                "name": "family"
            },
            {
                "name": "friends",
                "icon": 94,
                "state": 0,
                "createdAt": now,
                "id": 2,
                "id_tag_group": 1,
                "order": 2
            },
            {
                "icon": 53,
                "order": 3,
                "id": 3,
                "state": 0,
                "createdAt": now,
                "id_tag_group": 1,
                "name": "date"
            },
            {
                "id": 4,
                "order": 4,
                "name": "party",
                "icon": 34,
                "id_tag_group": 1,
                "createdAt": now,
                "state": 0
            },
            {
                "createdAt": now,
                "icon": 91,
                "state": 0,
                "id": 5,
                "name": "movies & tv",
                "order": 5,
                "id_tag_group": 2
            },
            {
                "name": "reading",
                "icon": 12,
                "createdAt": now,
                "state": 0,
                "order": 6,
                "id_tag_group": 2,
                "id": 6
            },
            {
                "order": 7,
                "name": "gaming",
                "createdAt": now,
                "state": 0,
                "id": 7,
                "icon": 30,
                "id_tag_group": 2
            },
            {
                "id": 8,
                "name": "sport",
                "icon": 67,
                "createdAt": now,
                "state": 0,
                "order": 8,
                "id_tag_group": 2
            },
            {
                "name": "relax",
                "id_tag_group": 2,
                "id": 9,
                "order": 9,
                "createdAt": now,
                "state": 0,
                "icon": 9
            },
            {
                "id": 10,
                "icon": 156,
                "id_tag_group": 2,
                "state": 0,
                "name": "Painting",
                "createdAt": now,
                "order": 10
            },
            {
                "createdAt": now,
                "name": "Study",
                "id": 11,
                "order": 11,
                "state": 0,
                "icon": 250,
                "id_tag_group": 3
            },
            {
                "icon": 86,
                "state": 0,
                "name": "Homework",
                "order": 12,
                "createdAt": now,
                "id_tag_group": 3,
                "id": 12
            },
            {
                "icon": 16,
                "order": 13,
                "id": 13,
                "state": 0,
                "id_tag_group": 3,
                "createdAt": now,
                "name": "Work Milestone"
            }
        ],
        // I don't know what these do
        "assets": [],
        "goalEntries": [],
        "goals": [],
        "isBiometryAllowed": true,
        "isMemoriesNoteShownInNotification": false,
        "isMemoriesReminderEnabled": true,
        "isMemoriesVisibleToUser": false,
        "isWeeklyNotificationsEnabled": true,
        "memoriesAllowedMoodGroupsIds": [
            1,
            2,
            3
        ],
        "metadata": {
            "number_of_entries": pixelsJSON.length,
            "ios_version": 19,
            "platform": "iOS",
            "created_at": now,
            "android_version": 15
        },
        "pin": "",
        "pinMode": 1,
        "preferredMoodIconsIdsForMoodIdsForIconsPack": {
            "1": {
                "1": 1,
                "2": 2,
                "3": 3,
                "4": 4,
                "5": 5
            }
        },
        "prefs": [
            {
                "key": "BACKUP_REMINDER_DONT_SHOW_AGAIN",
                "pref_name": "default",
                "value": false
            },
            {
                "key": "DAYS_IN_ROW_LONGEST_CHAIN",
                "pref_name": "default",
                "value": 0
            },
            {
                "key": "COLOR_PALETTE_DEFAULT_CODE",
                "pref_name": "default",
                "value": 1
            },
            {
                "key": "PREDEFINED_MOODS_VARIANT",
                "pref_name": "default",
                "value": 2
            },
            {
                "key": "ONBOARDING_USER_PROPERTY",
                "pref_name": "default",
                "value": "finished"
            },
            {
                "key": "SUBSCRIPTION_PAGE_NUMBER_OF_VISITS",
                "pref_name": "default",
                "value": 1
            },
            {
                "key": "SUBSCRIPTION_IS_FREE_TRIAL_POSSIBLE",
                "pref_name": "default",
                "value": true
            }
        ],
        "showNotificationAfterOneEntry": true,
        "tag_groups": [
            {
                "id": 1,
                "name": "Social",
                "is_expanded": true,
                "order": 1
            },
            {
                "id": 2,
                "name": "Hobbies",
                "is_expanded": true,
                "order": 2
            },
            {
                "id": 3,
                "name": "Sleep",
                "is_expanded": true,
                "order": 3
            },
            {
                "id": 4,
                "name": "Food",
                "is_expanded": true,
                "order": 4
            },
            {
                "id": 5,
                "name": "Health",
                "is_expanded": true,
                "order": 5
            },
            {
                "id": 6,
                "name": "Better Me",
                "is_expanded": true,
                "order": 6
            },
            {
                "id": 7,
                "name": "Chores",
                "is_expanded": true,
                "order": 7
            }
        ],
        "writingTemplates": [
            {
                "predefined_template_id": 1,
                "id": 0,
                "title": "🙏 Gratitude Entry",
                "body": "<b>List three things that you are grateful for:</b>\n<ol><li></li></ol>",
                "order": 0
            },
            {
                "order": 1,
                "id": 1,
                "predefined_template_id": 2,
                "body": "<b>How do you feel?</b><br><br>\n<b>Why do you feel this way?</b><br><br>\n<b>What will you do today?</b><br><br>\n<b>What are you looking forward to?</b><br><br>",
                "title": "🌅 Morning Reflection"
            },
            {
                "title": "✅ To-Do List",
                "id": 2,
                "body": "<b>What tasks are ahead of me?</b><br><br>\n<b>What are the priorities?</b><br><br>\n<b>Who should I reach out to?</b><br><br>\n<b>What would make this day successful?</b><br><br>",
                "predefined_template_id": 3,
                "order": 2
            },
            {
                "predefined_template_id": 4,
                "title": "😴 Night Brain Dump",
                "id": 3,
                "order": 3,
                "body": "<b>What do you need to do tomorrow?</b><br><br>\n<b>What do you need to do this week?</b><br><br>\n<b>What does worry you?</b><br><br>\n<b>What are you looking forward to?</b><br><br>"
            },
            {
                "id": 4,
                "predefined_template_id": 5,
                "body": "<b>What are you grateful for?</b><br><br>\n<b>What did you enjoy today?</b><br><br>\n<b>What are you planning for the future?</b><br><br>\n<b>What do people like about you?</b><br><br>",
                "order": 4,
                "title": "🤗 Instant Cheer-Up"
            },
            {
                "title": "🤔 Self-Reflection",
                "id": 5,
                "body": "<b>How am I feeling right now?</b><br><br>\n<b>What makes me hopeful?</b><br><br>\n<b>What makes me worried?</b><br><br>\n<b>What can I accept that I cannot change?</b><br><br>",
                "predefined_template_id": 6,
                "order": 5
            },
            {
                "body": "<b>How do I make others feel?</b><br><br>\n<b>Have I done an act of kindness?</b><br><br>\n<b>What can I do better tomorrow?</b><br><br>",
                "title": "🤝 Being Mindful of Others",
                "id": 6,
                "order": 6,
                "predefined_template_id": 7
            },
            {
                "predefined_template_id": 8,
                "id": 7,
                "body": "<b>What worries you?</b><br><br>\n<b>How would an outsider see it?</b><br><br>\n<b>What can be the positive outcome?</b><br><br>",
                "order": 7,
                "title": "😌 Letting Go of Worries"
            },
            {
                "title": "💡 Idea",
                "id": 8,
                "body": "<b>What is your idea?</b><br><br>\n<b>How does it work?</b><br><br>\n<b>What are the next steps?</b><br><br>",
                "order": 8,
                "predefined_template_id": 9
            }
        ],
        "version": 19,
    }

    pixelsJSON.forEach((entry) => {
        const currentDateMoment = moment(entry.date, 'YYYY-MM-DD');

        let newDayEntry = {
            "year": currentDateMoment.year(),
            "month": currentDateMoment.month(),
            // Not `.day()`, which is "day of the week"
            "day": currentDateMoment.date(),
            "hour": 20,
            "minute": 0,
            "datetime": currentDateMoment.unix() * 1000,
            // I don't know what this does, but it's present in all of the Daylio backup files
            "timeZoneOffset": -1,
            "note_title": "",
            "note": entry.entries[0].notes || "",
            // `6` because there are 5 default moods in Daylio and a `mood` value of `1` corresponds to "best mood"
            "mood": 6 - entry.entries[0].value,
            "assets": [],
            "tags": []
        }

        daylioJSON.dayEntries.push(newDayEntry);
    });
    console.log(`Converted ${pixelsJSON.length} Year in Pixels entries to Daylio entries!\n`);

    let buff = Buffer.from(JSON.stringify(daylioJSON));
    let daylioJSONBase64 = buff.toString('base64');
    // In original `backup.daylio` files, there's a newline after each 76th character.
    daylioJSONBase64 = daylioJSONBase64.replace(/.{76}/g, '$&\n');

    const outputDaylioZIPFilename = `${argv.pixels}-converted.daylio`;
    console.log(`Writing \`${outputDaylioZIPFilename}\`...`);
    const outputDaylioZIP = new JSZip();
    outputDaylioZIP.file("backup.daylio", daylioJSONBase64);
    outputDaylioZIP
        .generateNodeStream({ type: 'nodebuffer', streamFiles: false, platform: "UNIX" })
        .pipe(fs.createWriteStream(outputDaylioZIPFilename))
        .on('finish', async () => {
            // JSZip generates a readable stream with a "end" event,
            // but is piped here in a writable stream which emits a "finish" event.
            console.log(`Wrote \`${outputDaylioZIPFilename}\`!\n`);
            console.log("Successfully converted from Year in Pixels backup data to Daylio backup data!");

            // Uncomment the lines below to write a pretty-printed version of the Year in Pixels backup JSON to disk.
            // (By default, the contents of the backup JSON file generated by Year in Pixels is on one line.) 
            // try {
            //     const prettyFilename = `${argv.pixels}-pretty.json`;
            //     console.log(`\n\nAlso writing pretty-printed version of the Year in Pixels backup JSON to \`${prettyFilename}\`...`);
            //     await fsPromises.writeFile(prettyFilename, JSON.stringify(pixelsJSON, null, 4));
            // } catch (err) {
            //     console.log(err);
            // }
        });
}

if (argv.daylio) {
    convertFromDaylioToPixels();
} else if (argv.pixels) {
    convertFromPixelsToDaylio();
}

