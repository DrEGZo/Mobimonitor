let stationPopup = function (station) {
    let overlay = document.getElementById('station-popup');
    app.stationList = [];
    app.selectedStation = station;
    app.lineList = [];
    if (overlay.style.display != 'none') overlay.style.display = 'none';
    else {
        if (station !== null) {
            app.editing = true;
            selectStation(station).then(() => {
                overlay.style.display = 'flex';
                window.location.href = '#station-popup';
            });
        } else {
            app.editing = false;
            app.stationInput = '';
            queryStations();
            overlay.style.display = 'flex';
        };
        document.querySelector('.line-input').focus();
    }
}

let changeInputTo = function(value, keepShown) {
    app.stationInput = value;
    if (keepShown) queryStations();
    else app.stationList = [];
}

let queryStations = function () {
    let value = app.stationInput;
    app.selectedStation = null;
    app.lineList = [];
    let history = localStorage.getItem('history');
    if (history == null) history = '';
    try {
        history = JSON.parse(history);
    } catch (e) {
        history = [];
    }
    if (value.length >= 3) fetchAPI('https://webapi.vvo-online.de/tr/pointfinder?format=json', {
        limit: 5,
        query: value,
        stopsOnly: true,
        dvb: false,
        assignedStops: true
    }).then(data => {
        app.stationList = [];
        if (data.PointStatus != 'NotIdentified') {
            let usedCodes = []
            for (let i = 0; i < data.Points.length; i++) {
                let stationSplit = data.Points[i].split('|');
                if (usedCodes.indexOf(stationSplit[0]) == -1) {
                    usedCodes.push(stationSplit[0]);
                    app.stationList.push({
                        id: stationSplit[0],
                        stadt: stationSplit[2] || 'Dresden',
                        name: stationSplit[3],
                        type: 'result'
                    });
                }
            }
        }
    }).catch(errData => {
        console.log(errData);
    });
    else app.stationList = history;
}

let addToHistory = function (station) {
    let data = {
        id: station.id,
        name: station.name,
        stadt: station.stadt,
        type: 'history'
    };
    let history = localStorage.getItem('history');
    if (history == null) history = '';
    try {
        history = JSON.parse(history);
    } catch (e) {
        history = [];
    }
    let i = 0;
    while (i < history.length) {
        if (history[i].id == station.id) history.splice(i, 1);
        else i++;
    }
    history.unshift(data);
    while (history.length > 5) history.pop();
    localStorage.setItem('history', JSON.stringify(history));
    queryStations();
}

let selectStation = function (station) {
    addToHistory(station);
    let id = station.id;
    app.selectedStation = id;
    return fetchAPI('https://webapi.vvo-online.de/stt/lines?format=json', { stopid: id }).then(data => {
        app.lineList = [];
        let alreadyUsed = [];
        if (id in app.refreshData.stops) app.otherLines = app.refreshData.stops[id].otherLines;
        else app.otherLines = false;
        for (let i = 0; i < data.Lines.length; i++) {
            let line = data.Lines[i].Name;
            if (alreadyUsed.indexOf(line) == -1) {
                let preset = false;
                let filterMode = 0;
                let useOnly = [];
                let doNotUse = [];
                let refData;
                if (!(id in app.refreshData.stops)) preset = false;
                else if (!(line in app.refreshData.stops[id].lines)) preset = false;
                else {
                    refData = app.refreshData.stops[id].lines[line];
                    preset = refData.use;
                    filterMode = refData.filterMode;
                    useOnly = refData.useOnly;
                    doNotUse = refData.doNotUse;
                }
                let lineData = {
                    line: line,
                    state: preset,
                    mot: data.Lines[i].Mot,
                    filterMode: filterMode,
                    useOnly: useOnly,
                    doNotUse: doNotUse
                };
                app.lineList.push(lineData);
                alreadyUsed.push(line);
            }
        }
    }).catch(errData => {
        app.lineList = [];
        console.log(errData);
    });
}

let selectAllLines = function (bool) {
    for (let i = 0; i < app.lineList.length; i++) app.lineList[i].state = bool;
}

let submitStation = function () {
    if (app.selectedStation !== null) {
        let lineData = {};
        for (let i = 0; i < app.lineList.length; i++) {
            lineData[app.lineList[i].line] = {
                use: app.lineList[i].state,
                filterMode: app.lineList[i].filterMode,
                useOnly: app.lineList[i].useOnly,
                doNotUse: app.lineList[i].doNotUse
            }
        }
        sendToServer('/editStop' + window.location.pathname, {
            id: app.selectedStation,
            lines: lineData,
            otherLines: app.otherLines
        }).then(() => {
            return fetch('/data' + window.location.pathname);
        }).then(data => {
            app.refreshData = data;
            return refresh(false);
        }).then(() => {
            stationPopup(null);
        }).catch(alert);
    }
}

let delStation = function (id) {
    let del = confirm('Willst du die Station ' + app.departs[id].name + ' wirklich löschen?');
    if (del) sendToServer('/delStop' + window.location.pathname, { id: id }).then(() => {
        return fetch('/data' + window.location.pathname);
    }).then(data => {
        app.refreshData = data;
        return refresh(false);
    }).catch(alert);
}

let addFilter = function(line, mode) {
    let query = '';
    let rightFormat = false;
    while (!rightFormat) {
        query = prompt('Gib den Filternamen ein. Die Filterregeln werden auf alle Fahrtrichtungen angewandt, die den Filternamen enthalten.');
        if (query == null) return;
        else if (query.length == 0) alert('Feld darf nicht leer sein.');
        else if (!/^[A-Za-z0-9\/\u00c4\u00e4\u00d6\u00f6\u00dc\u00fc\u00df ]+$/.test(query)) alert('Der Name enthält nicht erlaubte Sonderzeichen.');
        else rightFormat = true;
    }
    if (mode == 0) app.lineList[line].doNotUse.push(query);
    else app.lineList[line].useOnly.push(query);
}

let removeFilter = function(line, mode, index) {
    if (mode == 0) app.lineList[line].doNotUse.splice(index, 1);
    else app.lineList[line].useOnly.splice(index, 1);
}

window.onstorage = queryStations;