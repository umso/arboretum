var _ = require('underscore');

module.exports = function(options) {
    options = _.extend({
        'remote-debugging-port': 9222,
        width: 800,
        height: 600
    }, options);

    const electron = require('electron');
    //const {app} = electron;
    //const {BrowserWindow} = electron;
    const app = electron.app;  // Module to control application life.
    const BrowserWindow = electron.BrowserWindow;  // Module to create native browser window.

    app.commandLine.appendSwitch('remote-debugging-port', options['remote-debugging-port']+'');

    // Keep a global reference of the window object, if you don't, the window will
    // be closed automatically when the JavaScript object is garbage collected.
    var mainWindow = null;

    // Quit when all windows are closed.
    app.on('window-all-closed', function() {
        // On OS X it is common for applications and their menu bar
        // to stay active until the user quits explicitly with Cmd + Q
        if (process.platform != 'darwin') {
            app.quit();
        }
    });

    return new Promise(function(resolve, reject) {
        // This method will be called when Electron has finished
        // initialization and is ready to create browser windows.
        app.on('ready', function() {
            // Create the browser window.
            mainWindow = new BrowserWindow({
                width: options.width,
                height: options.height,
                icon: __dirname + '/resources/logo/icon.png',
                'title-bar-style': 'hidden',
				//frame: false,
				title: 'Arboretum',
				minWidth: 350,
				minHeight: 250
            });

            // and load the index.html of the app.
            mainWindow.loadURL('file://'+__dirname+'/index.html');

            // Open the DevTools.
            //mainWindow.webContents.openDevTools();

            // Emitted when the window is closed.
            mainWindow.on('closed', function() {
                // Dereference the window object, usually you would store windows
                // in an array if your app supports multi windows, this is the time
                // when you should delete the corresponding element.
                mainWindow = null;
            });
            resolve(options);
        });
    });
}
