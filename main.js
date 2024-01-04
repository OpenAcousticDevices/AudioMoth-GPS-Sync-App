/****************************************************************************
 * main.js
 * openacousticdevices.info
 * September 2022
 *****************************************************************************/

const { app, BrowserWindow, ipcMain, Menu, shell } = require('electron');

const ProgressBar = require('electron-progressbar');

require('@electron/remote/main').initialize();

require('electron-debug')({
    showDevTools: true,
    devToolsMode: 'undocked'
});

const path = require('path');

var syncProgressBar;
var mainWindow, aboutWindow;

const iconLocation = (process.platform === 'linux') ? '/build/icon.png' : '/build/icon.ico';
const standardWindowSettings = {
    resizable: false,
    fullscreenable: false,
    autoHideMenuBar: true,
    icon: path.join(__dirname, iconLocation),
    useContentSize: true,
    webPreferences: {
        enableRemoteModule: true,
        nodeIntegration: true,
        contextIsolation: false
    }
};

const standardProgressBarSettings = {
    closeOnComplete: false,
    indeterminate: false
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

function generateProgressBarSettings (title, text, detail, fileCount, parent) {

    const uniqueSettings = {
        title,
        text,
        detail,
        maxValue: fileCount * 100
    };

    const settings = Object.assign({}, standardProgressBarSettings, uniqueSettings);

    settings.browserWindow = {
        parent,
        webPreferences: {
            enableRemoteModule: true,
            nodeIntegration: true,
            contextIsolation: false
        },
        closable: true,
        modal: false,
        height: process.platform === 'linux' ? 140 : 175
    };

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

    aboutWindow.setMenu(null);
    aboutWindow.loadURL(path.join('file://', __dirname, '/about.html'));

    require('@electron/remote/main').enable(aboutWindow.webContents);

    aboutWindow.on('close', (e) => {

        e.preventDefault();

        aboutWindow.hide();

    });

    aboutWindow.webContents.on('dom-ready', function () {

        mainWindow.webContents.send('poll-night-mode');

    });

    ipcMain.on('night-mode-poll-reply', (e, nightMode) => {

        if (aboutWindow) {

            aboutWindow.webContents.send('night-mode', nightMode);

        }

    });

}

function toggleNightMode () {

    mainWindow.webContents.send('night-mode');

    if (aboutWindow) {

        aboutWindow.webContents.send('night-mode');

    }

}

const createWindow = () => {

    let windowWidth = 565;
    let windowHeight = 480;

    if (process.platform === 'linux') {

        windowWidth = 560;
        windowHeight = 455;

    } else if (process.platform === 'darwin') {

        windowWidth = 560;
        windowHeight = 458;

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
            contextIsolation: false
        }
    });

    mainWindow.on('restore', function () {

        /* When minimised and restored, Windows platforms alter the BrowserWindow such that the height no longer includes the menu bar */
        /* This resize cannot be blocked so this fix resizes it, taking into account the menu change */
        if (process.platform === 'win32') {

            mainWindow.setSize(w, h + 20);

        }

    });

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

    mainWindow.loadURL(path.join('file://', __dirname, '/index.html'));

    require("@electron/remote/main").enable(mainWindow.webContents);

}

app.whenReady().then(() => {

    createWindow();

    app.on('activate', () => {

        if (BrowserWindow.getAllWindows().length === 0) {

            createWindow();

        }

    });

});

app.on('window-all-closed', () => {

    app.quit();

});

/* Syncing progress bar functions */

ipcMain.on('start-sync-bar', (event, fileCount) => {

    if (syncProgressBar) {

        return;

    }

    let detail = 'Starting to sync file';
    detail += (fileCount > 1) ? 's' : '';
    detail += '.';

    const settings = generateProgressBarSettings('AudioMoth GPS Sync App', 'Syncing files...', detail, fileCount, mainWindow);

    syncProgressBar = new ProgressBar(settings);

    syncProgressBar.on('aborted', () => {

        if (syncProgressBar) {

            syncProgressBar.close();
            syncProgressBar = null;

        }

    });

});

ipcMain.on('set-sync-bar-progress', (event, fileNum, progress) => {

    if (syncProgressBar) {

        syncProgressBar.value = (fileNum * 100) + progress;

    }

});

ipcMain.on('set-sync-bar-file', (event, fileNum, name) => {

    const index = fileNum + 1;
    const fileCount = syncProgressBar.getOptions().maxValue / 100;

    if (syncProgressBar) {

        syncProgressBar.detail = 'Syncing ' + name + ' (' + index + ' of ' + fileCount + ').';

    }

});

ipcMain.on('set-sync-bar-error', (event, name) => {

    if (syncProgressBar) {

        syncProgressBar.detail = 'Error when syncing ' + name + '.';

    }

});

ipcMain.on('set-sync-bar-completed', (event, successCount, errorCount, errorWritingLog) => {

    if (syncProgressBar) {

        let messageText;

        syncProgressBar.setCompleted();

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

        syncProgressBar.detail = messageText;

        setTimeout(function () {

            syncProgressBar.close();
            syncProgressBar = null;

            if (mainWindow) {

                mainWindow.send('sync-summary-closed');

            }

        }, 5000);

    }

});

ipcMain.on('poll-sync-cancelled', (event) => {

    if (syncProgressBar) {

        event.returnValue = false;

    } else {

        event.returnValue = true;

    }

});