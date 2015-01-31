﻿var config = require('./config.js');
var twitter = require('twitter');
var fs = require('fs');
var twit = new twitter(config.twitter);
var moment = require('moment');

var intervalLength = 10000;
var saveData = {since_id: 0, lastNormalTweet: 0};
var currentState = 1;

if (fs.existsSync('saveData.json')) {
    saveData = JSON.parse(fs.readFileSync('saveData.json', {encoding: 'utf8'}));
    console.log("Loaded Data: ");
    console.log(saveData);
}
function checkPepitosTweets() {
    var data = {screen_name: "pepitothecat", exclude_replies: true};
    if (saveData.since_id > 0)
        data.since_id = saveData.since_id;
    twit.get('statuses/user_timeline', data, function(error, tweets, response){
        if(error) { console.log(error); return; }
        if (tweets.length > 0) {
            potentiallyChangeState()
            var tweetData = getResponseTweet(tweets[0]);
            doTweet(tweetData);
        }
        else if (new Date(saveData.lastNormalTweet).getTime() + config.normalTweetInterval < Date.now()) {
            twit.get('statuses/show/'+saveData.since_id, data, function(error, tweet, response){
                if(error) { console.log(error); return; }
                potentiallyChangeState()
                var tweetData = getNormalTweet(tweet);
                // check for chance to include state photo
                if (shouldPostPhoto()) {
                    var stateObject = config.states[currentState];
                    fs.readFile(stateObject.picture,{encoding: "base64"}, function(err, data) {
                        // we should still post the tweet even if we can't load the file
                        if (err) { console.log(err); doTweet(tweetData); return; }
                        twit.post('media/upload', {media: data}, function(error, body, response) {
                            if(error) {console.log(error); doTweet(tweetData); return }
                            tweetData.media_ids = [response.media_id_string];
                            doTweet(tweetData);
                        });
                    });
                }
                else {
                    doTweet(tweetData);
                }
            });
        }
    });
}
function shouldPostPhoto() {
    return Math.random() > (2/3);
}
function doTweet(tweetData) {
    if (typeof tweetData.status === "undefined")
        return;
    twit.post('statuses/update', tweetData, function(error, body, response) {
        if(error) console.log(error);;
    });
}
function getNormalTweet(tweet) {
    var response = {};
    var now = new Date();
    var msg = config;
    if (typeof config.states !== "undefined" && config.states.length > 0) {
        msg = config.states[currentState];
    }
    if (typeof msg.athome === "string")
        response.status=msg.athome;
    else
        response.status=msg.athome[Math.floor(Math.random() * msg.athome.length)];
    if (tweet.text.indexOf("out") >= 0) {
        if (typeof msg.outtoolong === "string")
            response.status=msg.outtoolong;
        else
            response.status=msg.outtoolong[Math.floor(Math.random() * msg.outtoolong.length)];
    }
    
    response.status += " ("+moment().zone("+0100").format("HH:mm:ss")+")";
    console.log("No activity: "+response.status);
    saveData.lastNormalTweet = now.getTime();
    SaveData();
    return response;
}
function getResponseTweet(tweet) {
    var response = {};
    if (tweet.id_str != saveData.since_id) {
        var msg = config;
        if (typeof config.states !== "undefined" && config.states.length > 0) {
            msg = config.states[currentState];
        }
        if (typeof msg.welcomehome === "string")
            response.status=msg.welcomehome;
        else
            response.status=msg.welcomehome[Math.floor(Math.random() * msg.welcomehome.length)];
        if (tweet.text.indexOf("out") >= 0) {
            if (typeof msg.staysafe === "string")
                response.status=msg.staysafe;
            else
                response.status=msg.staysafe[Math.floor(Math.random() * msg.staysafe.length)];

        }
        var dateText = tweet.text.match(/\([\d]+:[\d]+:[\d]+\)/)[0];
        response.status = "@PepitoTheCat "+response.status+" "+dateText;
        response.in_reply_to_status_id = tweet.id_str;
        saveData.since_id = tweet.id_str;
        saveData.lastNormalTweet = new Date(tweet.created_at).getTime();
        console.log(tweet.id_str + ": " + tweet.text);  // The tweets.
        console.log("Response: "+response.status);
        SaveData();
    }
    return response;
}
function SaveData() {
    fs.writeFile('saveData.json', JSON.stringify(saveData), {}, function(err) {
        if (err) console.log(err);
        else console.log("Saved");
    });
}
function potentiallyChangeState() {
    if (typeof config.states === "undefined" || config.states.length == 0)
        return;
    var threshold = 50;
    if (Math.random() * 100 > threshold) {
        var index = Math.floor(Math.random() * config.states.length);
        if (index == currentState)
            index = (index + 1) % config.states.length; 
        changeState(index);
    }
}
function changeState(state) {
    if (typeof config.states === "undefined" || typeof state == "undefined" || state < 0 && state >= config.states.length) {
        console.log("States must be defined, or state is outside of bounds");
        return;
    }
    var stateObject = config.states[state];
    currentState = state;
    fs.readFile(stateObject.picture,{encoding: "base64"}, function(err, data) {
        if (err) { console.log(err); return; }
        twit.post('account/update_profile_image', {image: data}, function(error, body, response) {
            if(error) console.log(error);
            console.log("Changed state to "+stateObject.name);
        });
    });
}
checkPepitosTweets();
setInterval(checkPepitosTweets, intervalLength);
//changeState(currentState);
//setInterval(potentiallyChangeState, intervalLength * 6 * 30);