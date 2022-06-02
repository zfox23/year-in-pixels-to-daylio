const JSZip = require("jszip");
const fs = require('fs');
const fsPromises = require('fs/promises');
const moment = require('moment');
moment().format();

const yargs = require('yargs/yargs');
const { hideBin } = require('yargs/helpers');
const argv = yargs(hideBin(process.argv))
    .command('daylio', 'Pretty-prints the contents of your Daylio backup file to a `.json` file.')
    .example('$0 -d mybackup.daylio', 'Pretty-prints the contents of your Daylio backup file to `./mybackup.daylio.json`.')
    .alias('d', 'daylio')
    .command('pixels', 'Pretty-prints the contents of your Year in Pixels backup file to a `.json` file.')
    .example('$0 -p pixels-backup.json', 'Pretty-prints the contents of your Year in Pixels backup file to `./pixels-backup.json.pretty.json`.')
    .alias('p', 'pixels')
    .help('h')
    .alias('h', 'help')
    .check(function (argv) {
        if ((argv.daylio && !argv.pixels) || (!argv.daylio && argv.pixels)) {
            return true;
        } else {
            throw (new Error('Pass the path to your Daylio backup file *or* your Year in Pixels backup file!'));
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

        if (pixelsJSON.findIndex((el) => { return el["date"] === formattedDateString;}) > -1) {
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

    const outputYearInPixelsJSONFilename = `${argv.daylio}-converted.json`;
    console.log(`Writing \`${outputYearInPixelsJSONFilename}\`...`);
    try {
        await fsPromises.writeFile(outputYearInPixelsJSONFilename, JSON.stringify(pixelsJSON));
    } catch (err) {
        console.log(err);
    }
    console.log(`Wrote \`${outputYearInPixelsJSONFilename}\`!\n`);
    console.log("Successfully converted from Daylio backup data to Year in Pixels backup data!");

    // Uncomment the lines below to write a pretty-printed version of the Daylio backup JSON to disk.
    try {
        const prettyFilename = `${argv.daylio}-pretty.json`;
        console.log(`\n\nAlso writing pretty-printed version of the Daylio backup JSON to \`${prettyFilename}\`...`);
        await fsPromises.writeFile(prettyFilename, JSON.stringify(daylioJSON, null, 4));
    } catch (err) {
        console.log(err);
    }
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

    let daylioJSON = {
        "dayEntries": [],
        "metadata": {
            "number_of_entries": pixelsJSON.length,
            "ios_version": 19,
            "platform": "iOS",
            "created_at": Date.now(),
            "android_version": 15
        },
        "version": 19,
        "platform": "iOS"
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
            "datetime": currentDateMoment.unix(),
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

    const outputDaylioZIPFilename = `${argv.pixels}-converted.daylio`;
    console.log(`Writing \`${outputDaylioZIPFilename}\`...`);
    const outputDaylioZIP = new JSZip();
    outputDaylioZIP.file("backup.daylio", daylioJSONBase64);
    outputDaylioZIP
        .generateNodeStream({ type: 'nodebuffer', streamFiles: true })
        .pipe(fs.createWriteStream(outputDaylioZIPFilename))
        .on('finish', async () => {
            // JSZip generates a readable stream with a "end" event,
            // but is piped here in a writable stream which emits a "finish" event.
            console.log(`Wrote \`${outputDaylioZIPFilename}\`!\n`);
            console.log("Successfully converted from Year in Pixels backup data to Daylio backup data!");

            // Uncomment the lines below to write a pretty-printed version of the Year in Pixels backup JSON to disk.
            // (By default, the contents of the backup JSON file generated by Year in Pixels is on one line.) 
            try {
                const prettyFilename = `${argv.pixels}-pretty.json`;
                console.log(`\n\nAlso writing pretty-printed version of the Year in Pixels backup JSON to \`${prettyFilename}\`...`);
                await fsPromises.writeFile(prettyFilename, JSON.stringify(pixelsJSON, null, 4));
            } catch (err) {
                console.log(err);
            }
        });
}

if (argv.daylio) {
    convertFromDaylioToPixels();
} else if (argv.pixels) {
    convertFromPixelsToDaylio();
}

