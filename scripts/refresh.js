let refresh = function (loop) {
    if (loop) setTimeout(() => { refresh(true) }, 15 * 1000);
    let reqs = [];
    let resData = {}
    for (let stop in app.refreshData.stops) {
        reqs.push(addDepartures(stop, {}).then(data => {
            resData[stop] = data;
        }));
    }
    return Promise.all(reqs).then(() => {
        app.departs = {};
        for (let station in resData) {
            let departs = [];
            let alreadyUsed = [];
            for (let i = 0; i < resData[station].Departures.length; i++) {
                let depart = resData[station].Departures[i];
                let line = depart.LineName;
                let dir = depart.Direction;
                let availableLines = app.refreshData.stops[station].lines;
                for (l in availableLines) availableLines[l.replace(/\s/g, '')] = availableLines[l]; // so that "S 1" matches "S1" as well
                if (line.includes('SDG') && 'Lößnitzgrundbahn' in availableLines) line = 'Lößnitzgrundbahn';
                if (line.includes('SDG') && 'Weißeritztalbahn' in availableLines) line = 'Weißeritztalbahn';
                if (line.match(/[(]/)) line = line.match(/^(.*\S)\s*[(]/)[1]; // Transfer things like "A (Freital)" to "A".
                let lineNotWanted = (line in availableLines) ? (!availableLines[line].use) : (!app.refreshData.stops[station].otherLines);
                let dirNotWanted;
                if (line in availableLines) dirNotWanted = filterByUserPreference(dir, availableLines[line].filterMode, availableLines[line].useOnly, availableLines[line].doNotUse);
                let istFernferkehr = /(IC|ICE|EC|RJ)/.test(line);
                let willKeinFernverkehr = !availableLines.otherLines;
                if ('IC/ICE' in availableLines) willKeinFernverkehr = availableLines['IC/ICE'].use;
                if (lineNotWanted || dirNotWanted || (istFernferkehr && willKeinFernverkehr)) continue;
                let identifier = line + depart.Direction + depart.ScheduledTime;
                if (alreadyUsed.indexOf(identifier) == -1) {
                    let leaveTime = parseInt(depart.ScheduledTime.match(/[0-9]+/)[0]);
                    let schedTime = (leaveTime - Date.now()) / 60000;
                    if ('RealTime' in depart) leaveTime = parseInt(depart.RealTime.match(/[0-9]+/)[0]);
                    let timeToGo = (leaveTime - Date.now()) / 60000;
                    if (line == 'Standseilbahn') line = 'StB';
                    if (line == 'Schwebebahn') line = 'SwB';
                    if (line == 'Kirnitzschtalbahn') line = 'KiB';
                    if (line == 'Lößnitzgrundbahn') line = 'LöB';
                    if (line == 'Weißeritztalbahn') line = 'WeB';
                    if (line.length > 10) line = '';
                    let platf;
                    if (!('Platform' in depart)) platf = '';
                    else if (!('Type' in depart.Platform && 'Name' in depart.Platform)) platf = '';
                    else if (depart.Platform.Type == 'Railtrack') platf = 'Gleis ' + depart.Platform.Name;
                    else platf = 'Steig ' + depart.Platform.Name;
                    if (timeToGo >= 0 && timeToGo <= 60) {
                        departs.push({
                            line: line,
                            dir: depart.Direction,
                            mot: depart.Mot,
                            time: Math.floor(timeToGo),
                            state: depart.State,
                            dly: timeToGo - schedTime,
                            platf: platf
                        });
                        alreadyUsed.push(identifier);
                    }
                }
            }
            Vue.set(app.departs, station, {
                name: resData[station].Name,
                city: resData[station].Place,
                departs: departs
            });
        }
    });
}

let addDepartures = function (station, data) {
    return new Promise((resolve, reject) => {
        let requestNeeded = false;
        let requestTime = new Date().toISOString();
        let leaveTime;
        if (!('Departures' in data)) requestNeeded = true;
        else {
            let lastDep = data.Departures[data.Departures.length - 1];
            leaveTime = parseInt(lastDep.ScheduledTime.match(/[0-9]+/)[0]);
            if ('RealTime' in lastDep) leaveTime = parseInt(lastDep.RealTime.match(/[0-9]+/)[0]);
            requestTime = new Date(leaveTime - 60 * 1000).toISOString();
            let dif = leaveTime - Date.now();
            requestNeeded = dif < 60 * 60 * 1000;
        }
        if (requestNeeded) fetchAPI('https://webapi.vvo-online.de/dm?format=json', {
            stopid: station,
            time: requestTime,
            isarrival: false,
            limit: 30,
            shorttermchanges: true,
            mentzonly: false,
            mot: ["Tram", "CityBus", "IntercityBus", "SuburbanRailway", "Train", "Cableway", "Ferry", "HailedSharedTaxi"]
        }).then(result => {
            if (result.Departures.length == 0) resolve(data);
            else {
                let lastDep = result.Departures[result.Departures.length - 1];
                let newLastLeave = parseInt(lastDep.ScheduledTime.match(/[0-9]+/)[0]);
                if ('RealTime' in lastDep) newLastLeave = parseInt(lastDep.RealTime.match(/[0-9]+/)[0]);
                if (newLastLeave <= leaveTime) resolve(data);
                else {
                    data.Name = result.Name;
                    data.Place = result.Place;
                    if (!('Departures' in data)) data.Departures = [];
                    for (let i = 0; i < result.Departures.length; i++) data.Departures.push(result.Departures[i]);
                    addDepartures(station, data).then(newData => { resolve(newData) });
                }
            }
        }).catch(errData => {
            console.log(errData);
            data.Name = errData[1].Name;
            data.Place = errData[1].Place;
            if (!('Departures' in data)) data.Departures = [];
            resolve(data);
        });
        else resolve(data);
    });
}

let filterByUserPreference = function(dir, fmode, useOnly, doNotUse) {
    let wanted;
    if (fmode == 0) {
        wanted = true;
        for (let i = 0; i < doNotUse.length; i++) {
            let query = doNotUse[i].split(' ');
            let allMatch = true;
            for (let j = 0; j < query.length; j++) {
                if (!dir.toLowerCase().includes(query[j].toLowerCase())) allMatch = false;
            }
            if (allMatch) wanted = false;
        }
    } else {
        wanted = false;
        for (let i = 0; i < useOnly.length; i++) {
            let query = useOnly[i].split(' ');
            let allMatch = true;
            for (let j = 0; j < query.length; j++) {
                if (!dir.toLowerCase().includes(query[j].toLowerCase())) allMatch = false;
            }
            if (allMatch) wanted = true;
        }
    }
    return !wanted;
}