/****************************************************************************
 * index.js
 * openacousticdevices.info
 * February 2021
 *****************************************************************************/

'use strict';

/* global document */

const electron = require('electron');
const { dialog, getCurrentWindow } = require('@electron/remote');

const nightMode = require('./nightMode.js');
const versionChecker = require('./versionChecker.js');

const uiOutput = require('./uiOutput');

const path = require('path');
const fs = require('fs');

const audiomothUtils = require('audiomoth-utils');

var currentWindow = getCurrentWindow();

const selectionRadios = document.getElementsByName('selection-radio');

const prefixCheckbox = document.getElementById('prefix-checkbox');
const prefixInput = document.getElementById('prefix-input');

const synced192Checkbox = document.getElementById('synced-192-checkbox');
const autoResolveCheckbox = document.getElementById('auto-resolve-checkbox');

const fileLabel = document.getElementById('file-label');
const fileButton = document.getElementById('file-button');
const syncButton = document.getElementById('sync-button');

var files = [];
var syncing = false;

const RESAMPLE_RATE = 192000;

const DEFAULT_SLEEP_AMOUNT = 2000;

function getSelectedRadioValue (radioName) {

    return parseInt(document.querySelector('input[name="' + radioName + '"]:checked').value);

}

electron.ipcRenderer.on('night-mode', (e, nm) => {

    if (nm !== undefined) {

        nightMode.setNightMode(nm);

    } else {

        nightMode.toggle();

    }

});

electron.ipcRenderer.on('poll-night-mode', function () {

    electron.ipcRenderer.send('night-mode-poll-reply', nightMode.isEnabled());

});

/* Pause execution */

function sleep (milliseconds) {

    const date = Date.now();
    let currentDate = null;

    do {

        currentDate = Date.now();

    } while (currentDate - date < milliseconds);

}

/* Update text on selection button to reflect selection mode (file or folder selection) */

function updateButtonText () {

    const selectionType = getSelectedRadioValue('selection-radio');

    if (selectionType === 0) {

        fileButton.innerText = 'Select Files';

    } else {

        fileButton.innerText = 'Select Folders';

    }

}

/* Disable UI elements in main window while progress bar is open and sync is in progress */

function disableUI () {

    fileButton.disabled = true;
    syncButton.disabled = true;
    selectionRadios[0].disabled = true;
    selectionRadios[1].disabled = true;

    synced192Checkbox.disabled = true;
    autoResolveCheckbox.disabled = true;

    uiOutput.disableOutputCheckbox();
    uiOutput.disableOutputButton();

    prefixCheckbox.disabled = true;
    prefixInput.disabled = true;

}

function enableUI () {

    fileButton.disabled = false;
    syncButton.disabled = false;
    selectionRadios[0].disabled = false;
    selectionRadios[1].disabled = false;

    synced192Checkbox.disabled = false;
    autoResolveCheckbox.disabled = false;

    uiOutput.enableOutputCheckbox();
    uiOutput.enableOutputButton();

    prefixCheckbox.disabled = false;

    if (prefixCheckbox.checked) {

        prefixInput.disabled = false;

    }

    syncing = false;

}

/* Sync selected files */

function syncFiles () {

    if (!files) {

        return;

    }

    let successCount = 0;
    let errorCount = 0;
    const errors = [];
    const errorFiles = [];

    let errorFilePath;

    let sleepAmount = DEFAULT_SLEEP_AMOUNT;
    let successesWithoutError = 0;

    const unwrittenErrors = [];
    let lastErrorWrite = -1;

    let errorFileStream;

    for (let i = 0; i < files.length; i++) {

        /* If progress bar is closed, the sync task is considered cancelled. This will contact the main thread and ask if that has happened */

        const cancelled = electron.ipcRenderer.sendSync('poll-sync-cancelled');

        if (cancelled) {

            console.log('Sync cancelled.');
            enableUI();
            return;

        }

        /* Let the main thread know what value to set the progress bar to */

        electron.ipcRenderer.send('set-sync-bar-progress', i, 0);

        console.log('Syncing:', files[i]);

        console.log('-');

        /* Check if the optional prefix/output directory setttings are being used. If left as null, syncer will put file(s) in the same directory as the input with no prefix */

        let outputPath = null;

        if (uiOutput.isCustomDestinationEnabled()) {

            outputPath = uiOutput.getOutputDir();

            if (uiOutput.isCreateSubdirectoriesEnabled() && selectionRadios[1].checked) {

                const dirnames = path.dirname(files[i]).replace(/\\/g, '/').split('/');

                const folderName = dirnames[dirnames.length - 1];

                outputPath = path.join(outputPath, folderName);

                if (!fs.existsSync(outputPath)) {

                    fs.mkdirSync(outputPath);

                }

            }

        }

        const prefix = (prefixCheckbox.checked && prefixInput.value !== '') ? prefixInput.value : null;

        const resample = synced192Checkbox.checked;
        const autoResolve = autoResolveCheckbox.checked;

        const response = audiomothUtils.sync(files[i], outputPath, prefix, resample ? RESAMPLE_RATE : null, autoResolve, (progress) => {

            electron.ipcRenderer.send('set-sync-bar-progress', i, progress);
            electron.ipcRenderer.send('set-sync-bar-file', i, path.basename(files[i]));

        });

        if (response.success) {

            successCount++;
            successesWithoutError++;

            if (successesWithoutError >= 10) {

                sleepAmount = DEFAULT_SLEEP_AMOUNT;

            }

        } else {

            /* Add error to log file */

            unwrittenErrors.push(errorCount);
            successesWithoutError = 0;
            errorCount++;
            errors.push(response.error);
            errorFiles.push(files[i]);

            electron.ipcRenderer.send('set-sync-bar-error', path.basename(files[i]));

            if (errorCount === 1) {

                const errorFileLocation = uiOutput.isCustomDestinationEnabled() ? uiOutput.getOutputDir() : path.dirname(errorFiles[0]);
                errorFilePath = path.join(errorFileLocation, 'ERRORS.TXT');
                errorFileStream = fs.createWriteStream(errorFilePath, {flags: 'a'});

                errorFileStream.write('-- Sync --\n');

            }

            const currentTime = new Date();
            const timeSinceLastErrorWrite = currentTime - lastErrorWrite;

            if (timeSinceLastErrorWrite > 1000 || lastErrorWrite === -1) {

                lastErrorWrite = new Date();

                const unwrittenErrorCount = unwrittenErrors.length;

                console.log('Writing', unwrittenErrorCount, 'errors');

                let fileContent = '';

                for (let e = 0; e < unwrittenErrorCount; e++) {

                    const unwrittenErrorIndex = unwrittenErrors.pop();
                    fileContent += path.basename(errorFiles[unwrittenErrorIndex]) + ' - ' + errors[unwrittenErrorIndex] + '\n';

                }

                try {

                    errorFileStream.write(fileContent);

                    console.log('Error summary written to ' + errorFilePath);

                } catch (err) {

                    console.error(err);
                    electron.ipcRenderer.send('set-sync-bar-completed', successCount, errorCount, true);
                    return;

                }

            }

            sleep(sleepAmount);
            sleepAmount = sleepAmount / 2;

        }

    }

    /* If any errors occurred, do a final error write */

    const unwrittenErrorCount = unwrittenErrors.length;

    if (unwrittenErrorCount > 0) {

        console.log('Writing remaining', unwrittenErrorCount, 'errors');

        let fileContent = '';

        for (let e = 0; e < unwrittenErrorCount; e++) {

            const unwrittenErrorIndex = unwrittenErrors.pop();
            fileContent += path.basename(errorFiles[unwrittenErrorIndex]) + ' - ' + errors[unwrittenErrorIndex] + '\n';

        }

        try {

            errorFileStream.write(fileContent);

            console.log('Error summary written to ' + errorFilePath);

            errorFileStream.end();

        } catch (err) {

            console.error(err);
            electron.ipcRenderer.send('set-sync-bar-completed', successCount, errorCount, true);
            return;

        }

    }

    /* Notify main thread that sync is complete so progress bar is closed */

    electron.ipcRenderer.send('set-sync-bar-completed', successCount, errorCount, false);

}

/* When the progress bar is complete and the summary window at the end has been displayed for a fixed amount of time, it will close and this re-enables the UI */

electron.ipcRenderer.on('sync-summary-closed', enableUI);

/* Update label to reflect new file/folder selection */

function updateInputDirectoryDisplay (directoryArray) {

    if (directoryArray.length === 0 || !directoryArray) {

        fileLabel.innerHTML = 'No AudioMoth WAV files selected.';
        syncButton.disabled = true;

    } else {

        fileLabel.innerHTML = 'Found ';
        fileLabel.innerHTML += directoryArray.length + ' AudioMoth WAV file';
        fileLabel.innerHTML += (directoryArray.length === 1 ? '' : 's');
        fileLabel.innerHTML += '.';
        syncButton.disabled = false;

    }

}

/* Reset UI back to default state, clearing the selected files */

function resetUI () {

    files = [];

    fileLabel.innerHTML = 'No AudioMoth WAV files selected.';

    syncButton.disabled = true;

    updateButtonText();

}

/* Whenever the file/folder radio button changes, reset the UI */

selectionRadios[0].addEventListener('change', resetUI);
selectionRadios[1].addEventListener('change', resetUI);

/* Select/process file(s) buttons */

fileButton.addEventListener('click', () => {

    const fileRegex = audiomothUtils.getFilenameRegex(audiomothUtils.SYNC);

    files = uiOutput.selectRecordings(fileRegex);

    if (files !== undefined) {

        updateInputDirectoryDisplay(files);
        
        updateButtonText();

    }

});

syncButton.addEventListener('click', () => {

    if (syncing) {

        return;

    }

    syncing = true;
    disableUI();

    electron.ipcRenderer.send('start-sync-bar', files.length);
    setTimeout(syncFiles, 2000);

});

electron.ipcRenderer.on('update-check', function () {

    versionChecker.checkLatestRelease(function (response) {

        if (response.error) {

            console.error(response.error);

            dialog.showMessageBox(currentWindow, {
                type: 'error',
                title: 'Failed to check for updates',
                message: response.error
            });

            return;

        }

        if (response.updateNeeded === false) {

            dialog.showMessageBox(currentWindow, {
                type: 'info',
                buttons: ['OK'],
                title: 'Update not needed',
                message: 'Your app is on the latest version (' + response.latestVersion + ').'
            });

            return;

        }

        const buttonIndex = dialog.showMessageBoxSync({
            type: 'warning',
            buttons: ['Yes', 'No'],
            title: 'Download newer version',
            message: 'A newer version of this app is available (' + response.latestVersion + '), would you like to download it?'
        });

        if (buttonIndex === 0) {

            electron.shell.openExternal('https://www.openacousticdevices.info/gps-sync');

        }

    });

});
