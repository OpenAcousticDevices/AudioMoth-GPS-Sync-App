/****************************************************************************
 * main.js
 * openacousticdevices.info
 * September 2022
 *****************************************************************************/

/* global process, __dirname */

const {app, BrowserWindow, ipcMain, Menu, shell} = require('electron');

const remoteMain = require('@electron/remote/main');
remoteMain.initialize();

const electronDebug = require('electron-debug');

const path = require('path');

let mainWindow, aboutWindow, progressBarWindow;
let progressBarMaxValue = 100;
let allowProgressWindowClose = false;

const iconLocation = (process.platform === 'linux') ? '/build/icon.png' : '/build/icon.ico';
const standardWindowSettings = {
    resizable: false,
    fullscreenable: false,
    autoHideMenuBar: true,
    icon: path.join(__dirname, iconLocation),
    useContentSize: true,
    webPreferences: {
        contextIsolation: false,
        nodeIntegration: true,
        sandbox: false
    }
};

/* Generate settings objects for windows and progress bars */

function generateSettings (width, height, title) {

    const uniqueSettings = {
        width,
        height,
        title
    };

    const settings = Object.assign({}, standardWindowSettings, uniqueSettings);
    settings.parent = mainWindow;

    return settings;

}

function openAboutWindow () {

    if (aboutWindow) {

        aboutWindow.show();
        return;

    }

    let windowWidth = 400;
    let windowHeight = 310;

    if (process.platform === 'linux') {

        windowWidth = 395;
        windowHeight = 310;

    } else if (process.platform === 'darwin') {

        windowWidth = 395;
        windowHeight = 310;

    }

    const settings = generateSettings(windowWidth, windowHeight, 'About');
    aboutWindow = new BrowserWindow(settings);

    require('@electron/remote/main').enable(aboutWindow.webContents);

    aboutWindow.setMenu(null);
    aboutWindow.loadFile('about.html');

    if (!app.isPackaged) {

        electronDebug.openDevTools(aboutWindow);

    }

    aboutWindow.webContents.on('dom-ready', () => {

        mainWindow.webContents.send('poll-night-mode');

    });

    aboutWindow.on('close', (e) => {

        e.preventDefault();

        aboutWindow.hide();

    });

    aboutWindow.webContents.on('dom-ready', () => {

        mainWindow.webContents.send('poll-night-mode');

    });

}

function toggleNightMode () {

    mainWindow.webContents.send('night-mode');

    if (aboutWindow) {

        aboutWindow.webContents.send('night-mode');

    }

}

app.on('ready', () => {

    let windowWidth = 565;
    let windowHeight = 568;

    if (process.platform === 'linux') {

        windowWidth = 560;
        windowHeight = 565;

    } else if (process.platform === 'darwin') {

        windowWidth = 560;
        windowHeight = 535;

    }

    mainWindow = new BrowserWindow({
        width: windowWidth,
        height: windowHeight,
        title: 'AudioMoth GPS Sync App',
        resizable: false,
        fullscreenable: false,
        icon: path.join(__dirname, iconLocation),
        webPreferences: {
            enableRemoteModule: true,
            nodeIntegration: true,
            contextIsolation: false,
            backgroundThrottling: false
        }
    });

    // TODO: This line fixes this issue: https://github.com/electron/electron/issues/51465 Check to see if still broken
    mainWindow.setSize(windowWidth, windowHeight);

    const menuTemplate = [{
        label: 'File',
        submenu: [{
            type: 'checkbox',
            id: 'nightmode',
            label: 'Night Mode',
            accelerator: 'CommandOrControl+N',
            checked: false,
            click: toggleNightMode
        }, {
            type: 'separator'
        }, {
            label: 'Quit',
            accelerator: 'CommandOrControl+Q',
            click: function () {

                app.quit();

            }
        }]
    }, {
        label: 'Help',
        submenu: [{
            label: 'About',
            click: function () {

                openAboutWindow();

            }
        }, {
            label: 'Check For Updates',
            click: function () {

                mainWindow.webContents.send('update-check');

            }
        }, {
            type: 'separator'
        }, {
            label: 'AudioMoth Play Website',
            click: function () {

                shell.openExternal('https://play.openacousticdevices.info/');

            }
        }, {
            type: 'separator'
        }, {
            label: 'Open Acoustic Devices Website',
            click: function () {

                shell.openExternal('https://openacousticdevices.info');

            }
        }]
    }];

    const menu = Menu.buildFromTemplate(menuTemplate);

    Menu.setApplicationMenu(menu);

    require('@electron/remote/main').enable(mainWindow.webContents);

    mainWindow.loadFile('index.html');

    if (!app.isPackaged) {

        electronDebug.openDevTools(mainWindow);

    }

});

app.on('window-all-closed', () => {

    app.quit();

});

function createProgressBar (windowTitle, heading, detail, maxValue) {

    if (!progressBarWindow) {

        let windowWidth = 500;
        const windowHeight = 160;

        if (process.platform === 'linux') {

            windowWidth = 495;

        } else if (process.platform === 'darwin') {

            windowWidth = 495;

        }

        const settings = generateSettings(windowWidth, windowHeight, '');
        progressBarWindow = new BrowserWindow({
            ...settings,
            modal: true,
            parent: mainWindow
        });

        require('@electron/remote/main').enable(progressBarWindow.webContents);

        progressBarWindow.setMenu(null);
        progressBarWindow.loadFile('progressBar.html');

        if (!app.isPackaged) {

            electronDebug.openDevTools(progressBarWindow);

        }

        allowProgressWindowClose = false;

        progressBarWindow.on('close', (e) => {

            if (!allowProgressWindowClose) {

                e.preventDefault();

            }

        });

    } else {

        progressBarWindow.show();

    }

    setTimeout(() => {

        progressBarWindow.webContents.send('create-progress-bar', {
            windowTitle,
            heading,
            detail,
            maxValue
        });

        progressBarMaxValue = maxValue;

    }, 250);

}

function setProgressBarValue (newValue) {

    if (progressBarWindow) {

        progressBarWindow.webContents.send('set-progress-bar-value', newValue);

    }

}

function pollCancelled (event) {

    if (progressBarWindow) {

        event.returnValue = false;

    } else {

        event.returnValue = true;

    }

}

function closeProgressBarWindow () {

    if (progressBarWindow) {

        allowProgressWindowClose = true;
        progressBarWindow.close();
        progressBarWindow = null;

    }

}

ipcMain.on('close-progress-bar', closeProgressBarWindow);

/* Syncing progress bar functions */

ipcMain.on('start-sync-bar', (event, fileCount) => {

    let detail = 'Starting to sync file';
    detail += (fileCount > 1) ? 's' : '';
    detail += '.';

    createProgressBar('AudioMoth GPS Sync App', 'Syncing files...', detail, fileCount);

});

ipcMain.on('set-sync-bar-progress', (event, fileNum, progress) => {

    setProgressBarValue((fileNum * 100) + progress);

});

ipcMain.on('set-sync-bar-file', (event, fileNum, name) => {

    if (progressBarWindow) {

        const index = fileNum + 1;
        const fileCount = progressBarMaxValue / 100;

        progressBarWindow.webContents.send('set-progress-bar-detail', 'Syncing ' + name + ' (' + index + ' of ' + fileCount + ').');

    }

});

ipcMain.on('set-sync-bar-error', (event, name) => {

    if (progressBarWindow) {

        progressBarWindow.webContents.send('set-progress-bar-detail', 'Error when syncing ' + name + '.');

    }

});

ipcMain.on('set-sync-bar-completed', (event, successCount, errorCount, errorWritingLog) => {

    if (progressBarWindow) {

        let messageText;

        progressBarWindow.webContents.send('set-progress-bar-completed');

        if (errorCount > 0) {

            messageText = 'Errors occurred in ' + errorCount + ' file';
            messageText += (errorCount === 1 ? '' : 's');
            messageText += '.<br>';

            if (errorWritingLog) {

                messageText += 'Failed to write ERRORS.TXT to destination.';

            } else {

                messageText += 'See ERRORS.TXT for details.';

            }

        } else {

            messageText = 'Successfully synced ' + successCount + ' file';
            messageText += (successCount === 1 ? '' : 's');
            messageText += '.';

        }

        progressBarWindow.webContents.send('set-progress-bar-detail', messageText);

        setTimeout(function () {

            closeProgressBarWindow();

            if (mainWindow) {

                mainWindow.send('sync-summary-closed');

            }

        }, 5000);

    }

});

ipcMain.on('poll-sync-cancelled', pollCancelled);
