# year-in-pixels-to-daylio
This NodeJS script converts data exported from [the "Pixels - Mood & Mental Health" Android/iOS app](https://teovogel.me/pixels/) to a format compatible with [the Daylio Android/iOS app](https://daylio.net/) - and the other way around!

## Prerequisites
1. Ensure NodeJS is installed.
    - I'm using [v16.15.1](https://nodejs.org/en/download/).
2. Clone this repository to your local disk.
3. Using your favorite terminal application, `cd` into the directory containing this repository.
4. Run `npm install` to install the script's dependencies.

## Usage
- Run `node index.js -d <path to Daylio .daylio backup file>` to convert the log entries contained within your Daylio backup file to a `.json` file compatible with Year in Pixels.
- Run `node index.js -p <path to Year in Pixels .json backup file>` to convert the log entries contained within your Year in Pixels backup file to a `.daylio` file compatible with Daylio.
- Run `node index.js -h` for some help.

### Usage Examples
- `index.js -d mybackup.daylio`
    - Converts the Daylio backup file at `./mybackup.daylio` to a Year in Pixels JSON file at `./mybackup.daylio-converted.json`.
- `index.js -p pixels-backup.json`
    - Converts the Year in Pixels backup file at `./pixels-backup.json` to a Daylio file at `./pixels-backup.json-converted.daylio`.
