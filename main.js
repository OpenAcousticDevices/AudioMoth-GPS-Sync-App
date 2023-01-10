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
var win, aboutWindow;

function shrinkWindowHeight (windowHeight) {

    if (process.platform === 'darwin') {

        windowHeight -= 20;

    } else if (process.platform === 'linux') {

        windowHeight -= 50;

    }

    return windowHeight;

}

function openAboutWindow () {

    if (aboutWindow) {

        return;

    }

    const iconLocation = (process.platform === 'linux') ? '/build/icon.png' : '/build/icon.ico';

    aboutWindow = new BrowserWindow({
        width: 400,
        height: shrinkWindowHeight(320),
        title: 'About',
        resizable: false,
        fullscreenable: false,
        icon: path.join(__dirname, iconLocation),
        parent: win,
        webPreferences: {
            enableRemoteModule: true,
            nodeIntegration: true,
            contextIsolation: false
        }
    });

    aboutWindow.setMenu(null);
    aboutWindow.loadURL(path.join('file://', __dirname, '/about.html'));

    require("@electron/remote/main").enable(aboutWindow.webContents);

    aboutWindow.on('close', function () {

        aboutWindow = null;

    });

    aboutWindow.webContents.on('dom-ready', function () {

        win.webContents.send('poll-night-mode');

    });

    ipcMain.on('night-mode-poll-reply', (e, nightMode) => {

        if (aboutWindow) {

            aboutWindow.webContents.send('night-mode', nightMode);

        }

    });

}

function toggleNightMode () {

    win.webContents.send('night-mode');

    if (aboutWindow) {

        aboutWindow.webContents.send('night-mode');

    }

}

const createWindow = () => {

    const iconLocation = (process.platform === 'linux') ? '/build/icon.png' : '/build/icon.ico';

    const w = 565;
    const h = shrinkWindowHeight(490);

    win = new BrowserWindow({
        width: w,
        height: h,
        title: 'AudioMoth GPS Sync App (RC1)',
        resizable: false,
        fullscreenable: false,
        icon: path.join(__dirname, iconLocation),
        webPreferences: {
            enableRemoteModule: true,
            nodeIntegration: true,
            contextIsolation: false
        }
    });

    win.on('restore', function () {

        /* When minimised and restored, Windows platforms alter the BrowserWindow such that the height no longer includes the menu bar */
        /* This resize cannot be blocked so this fix resizes it, taking into account the menu change */
        if (process.platform === 'win32') {

            win.setSize(w, h + 20);

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
        label: 'Edit',
        submenu: [{
            label: 'Cut',
            accelerator: 'CommandOrControl+X',
            selector: 'cut:'
        }, {
            label: 'Copy',
            accelerator: 'CommandOrControl+C',
            selector: 'copy:'
        }, {
            label: 'Paste',
            accelerator: 'CommandOrControl+V',
            selector: 'paste:'
        }, {
            label: 'Select All',
            accelerator: 'CommandOrControl+A',
            selector: 'selectAll:'
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

                win.webContents.send('update-check');

            }
        }, {
            type: 'separator'
        }, {
            label: 'AudioMoth Filter Playground',
            click: function () {

                shell.openExternal('https://playground.openacousticdevices.info/');

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

    win.loadURL(path.join('file://', __dirname, '/index.html'));

    require("@electron/remote/main").enable(win.webContents);

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

    syncProgressBar = new ProgressBar({
        title: 'AudioMoth GPS Sync App',
        text: 'Syncing files...',
        detail: detail,
        closeOnComplete: false,
        indeterminate: false,
        browserWindow: {
            parent: win,
            webPreferences: {
                enableRemoteModule: true,
                nodeIntegration: true,
                contextIsolation: false
            },
            closable: true,
            modal: false
        },
        maxValue: fileCount * 100
    });

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

            if (win) {

                win.send('sync-summary-closed');

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