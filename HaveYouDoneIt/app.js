console.log('Loading');

'use strict';
var Alexa = require("alexa-sdk");
var AWS = require("aws-sdk");
var moment = require('moment');
var momenttx = require('moment-timezone');
var sync = require('sync');

AWS.config.update({
    endpoint: "https://dynamodb.us-east-1.amazonaws.com"
});

var dynamoDB = new AWS.DynamoDB({
    accessKeyId: 'AKIAIGHAOOICEQJWINXA',
    secretAccessKey: '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'
});

var docClient = new AWS.DynamoDB.DocumentClient(options = { service: dynamoDB });

var table = "haveyoudoneit";

const dateformat = 'YYYYMMDD';

const timeformat = 'HHmmss';

const spokenTimeFormat = 'h:mm a';

var alexaContext;

process.TZ = 'America/Chicago';

var GetLastUpdated = function GetLastUpdated(date, self, callback) {

    var params = {
        TableName: table,
        KeyConditionExpression: "#d = :date",
        ExpressionAttributeNames: {
            "#d": "date"
        },
        ExpressionAttributeValues: {
            ":date": date
        }
    };

    docClient.query(params, function (err, data) {
        if (err) {
            console.error("Unable to read item. Error JSON:", JSON.stringify(err, null, 2));
        } else {
            if (data.Count > 0)
            {
                //var lastLoggedTime = data.Items[data.Count - 1].time;
                var lastLoggedTime = data.Items[data.Count - 1].utctime;
                console.log('UTC Time retrieved: ' + lastLoggedTime);

                var lastLoggedDate = moment.utc(lastLoggedTime);
                if( callback != null ) callback(self, false, lastLoggedDate);
            }
            else
                if (callback != null) callback(self, true, "");
        }
    }
    );

};

var getLastTimePillTaken = function (self, callback) {
    var todaysdatestring = new moment().tz('America/Chicago').format(dateformat);
    var yesterdaysdatestring = new moment().subtract(1, 'd').tz('America/Chicago').format(dateformat);

    //var dayString = "today";

    var result = GetLastUpdated(todaysdatestring, this, function (context, err, result) {
        if (err == false && result != null  ) {
            if( callback != null ) callback(self, false, result);
        }
        else {
            dayString = "yesterday";
            result = GetLastUpdated(yesterdaysdatestring, this, function (context, err, result) {
                if (err == false && result != null ) {
                    console.log('sending errors = false - getLastTimePullTaken');
                    if( callback != null ) callback(self, false, result);
                }
                else {
                    console.log('sending errors = true - getLastTimePullTaken');
                    if( callback != null ) callback(self, true, null);
                }
            });
        }
    });
}

var deleteLastLog = function (self, callback) {
    getLastTimePillTaken(self, function (self, err, result) {
        if (result != null) {
            var timeString = result.tz('America/Chicago').format('HHmmss');

            var currentDateTime = new moment();
            var date = currentDateTime.tz('America/Chicago').format(dateformat);
            var params = {
                TableName: table,
                Key: {
                    "date": date,
                    "time": timeString
                }
            };

            console.log("Deleting item...");
            docClient.delete(params, function (err, data) {
                if (err) {
                    console.error("Unable to delete item. Error JSON:", JSON.stringify(err, null, 2));
                    if (callback != null) callback(self, true, JSON.stringify(err, null, 2));
                } else {
                    console.log("DeleteItem succeeded:", JSON.stringify(data, null, 2));
                    if (callback != null) callback(self, false, "Delete Successful");
                }
            });
        }
    });

    
}


var addLog = function (self, callback) {
    var currentDateTime = new moment();
    var date = currentDateTime.tz('America/Chicago').format(dateformat);
    var time = currentDateTime.tz('America/Chicago').format(timeformat);
    var utctime = currentDateTime.utc().toString();
    console.log('about to log the date of ' + date + ' and the time of ' + time + ' and UTC time ' + utctime);
    var params = {
        TableName: table,
        Item: {
            "date": date,
            "time": time,
            "utctime": utctime
        }
    };

    console.log("Adding a new item...");
    docClient.put(params, function (err, data) {
        if (err) {
            var errorString = "Unable to add item. Error JSON:" + JSON.stringify(err, null, 2);
            console.error("Unable to add item. Error JSON:", JSON.stringify(err, null, 2));
            if( callback != null ) callback(self, true, errorString);
        } else {
            console.log("Added item:", JSON.stringify(data, null, 2));
            var responseString = 'Thanks for letting me know.  I have logged that you gave Mojo his pill.';
            if( callback != null ) callback(self, false, responseString);
        }
    });
}
exports.handler = function (event, context, callback) {

    if (event != null) {
        console.log('event = ' + JSON.stringify(event));
    }
    else {
        console.log('No event object');
    }

    var handlers = {
        'LaunchRequest': function () {
            getLastTimePillTaken(this, function (context, error, data) {
                if (error == true) {
                    var responseString = 'Mojo did not have a pill in the last two days.  Ooops!';
                    context.emit(':ask', responseString + '. Would you like me to log that you gave him his pill now?', 'Say yes to log that you just gave Mojo his pill.');
                }
                else {
                    var currentTime = new moment();
                    var duration = moment.duration(currentTime.diff(data));
                    var hours = Math.floor(duration.asHours());

                    var dayString;
                    if (data.tz('America/Chicago').date() == currentTime.tz('America/Chicago').date())
                        dayString = "today";
                    else
                        dayString = "yesterday";

                    if (hours < 4)
                        context.emit(':tell', 'Mojo had his pill less than 4 hours ago at ' + data.tz('America/Chicago').format(spokenTimeFormat) + '. Unless you want to put him in a coma, I suggest you do not give him another');
                    else {
                        var responseString = 'Mojo last had his pill ' + hours + ' hours ago ' + dayString + ' at ' + data.tz('America/Chicago').format(spokenTimeFormat);
                        context.emit(':ask', responseString + '. Would you like me to log that you gave him his pill now?', 'Say yes to log that you just gave Mojo his pill.');
                    }
                }
            });
        },
        'AMAZON.YesIntent': function () {
            console.log('YesIntent Executed');
            addLog(this, function (context, error, data) {
                context.emit(':tell', data);
            });
        },
        'AMAZON.NoIntent': function () {
            console.log('NoIntent Executed');
            this.emit(':tell', "Okay.  Bye Felecia.");
        },

        'WeDidIntent': function () {
            console.log('WeDidIntent Executed');
            addLog(this, function (context, error, data) {
                context.emit(':tell', data);
            });
        },
        'DeleteIntent': function () {
            deleteLastLog(this, function (context, error, data) {
                if (error == true)
                    context.emit(':tell', 'An error occured while deleting the item.  Error message: ' + data);
                else
                    context.emit(':tell', 'The last item was deleted successfully');
            });
        },
        'DidWeIntent': function () {
            console.log('DidWeIntent Executed');
            getLastTimePillTaken(this, function (context, error, data) {
                if (error == true) {
                    var responseString = 'Mojo did not have a pill in the last two days.  Ooops!';
                    context.emit(':ask', responseString + '. Would you like me to log that you gave him his pill now?', 'Say yes to log that you just gave Mojo his pill.');
                }
                else {
                    var currentTime = new moment();
                    var duration = moment.duration(currentTime.diff(data));
                    var hours = Math.floor(duration.asHours());

                    var dayString;
                    if (data.tz('America/Chicago').date() == currentTime.tz('America/Chicago').date())
                        dayString = "today";
                    else
                        dayString = "yesterday";

                    if (hours < 4)
                        context.emit(':tell', 'Mojo had his pill less than 4 hours ago at ' + data.tz('America/Chicago').format(spokenTimeFormat) + '. Unless you want to put him in a coma, I suggest you do not give him another');
                    else {
                        var responseString = 'Mojo last had his pill ' + hours + ' hours ago ' + dayString + ' at ' + data.tz('America/Chicago').format(spokenTimeFormat);
                        context.emit(':ask', responseString + '. Would you like me to log that you gave him his pill now?', 'Say yes to log that you just gave Mojo his pill.');
                    }
                }
            });
        },
        'Unhandled': function () {
            this.emit(':tell', 'An error occurred');
        }
    };


    //var data = new moment('2017 03 23 130000', 'YYYY MM DD HHmmSS');

    //var currentTime = new moment();
    //var duration = moment.duration(currentTime.tz('America/Chicago').diff(data));
    //var hours = duration.asHours().toFixed(1);

    var alexa = Alexa.handler(event, context);
    alexa.registerHandlers(handlers);
    alexa.execute();

    //addLog(this, null);

    //deleteLastLog(null, null);

    //getLastTimePillTaken(this, function (context, error, data) {
    //    if (error == true) {
    //        var responseString = 'Mojo did not have a pill in the last two days.  Ooops!';
    //        console.log( responseString + '. Would you like me to log that you gave him his pill now?', 'Say yes to log that you just gave Mojo his pill.');
    //    }
    //    else {
    //        var currentTime = new moment();
    //        var duration = moment.duration(currentTime.diff(data));
    //        var hours = Math.floor(duration.asHours());

    //        var dayString;
    //        if (data.tz('America/Chicago').date() == currentTime.tz('America/Chicago').date())
    //            dayString = "today";
    //        else
    //            dayString = "yesterday";

    //        if (hours < 4)
    //            console.log('Mojo had his pill less than 4 hours ago at ' + data.tz('America/Chicago').format('h:mm a') + '. Unless you want to put him in a coma, I suggest you do not give him another');
    //        else {
    //            var responseString = 'Mojo last had his pill ' + hours + ' hours ago ' + dayString + ' at ' + data.tz('America/Chicago').format('H:mm a');
    //            console.log(responseString + '. Would you like me to log that you gave him his pill now?');
    //        }
    //    }
    //});

    //addLog(this, null);
 


};
