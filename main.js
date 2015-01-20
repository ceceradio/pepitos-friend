var config = require('./config.js');
var twitter = require('twitter');
var fs = require('fs');
var twit = new twitter(config.twitter);
var moment = require('moment');

var intervalLength = 10000;
var saveData = {since_id: 0, lastNormalTweet: 0};
var currentState = 0;

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
            var tweetData = getResponseTweet(tweets[0]);
            doTweet(tweetData);
        }
        else if (new Date(saveData.lastNormalTweet).getTime() + config.normalTweetInterval < Date.now()) {
            twit.get('statuses/show/'+saveData.since_id, data, function(error, tweet, response){
                if(error) { console.log(error); return; }
                var tweetData = getNormalTweet(tweet);
                doTweet(tweetData);
            });
        }
    });
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
    if (typeof config.athome === "string")
        response.status=config.athome;
    else
        response.status=config.athome[Math.floor(Math.random() * config.athome.length)];
    if (tweet.text.indexOf("out") >= 0) {
        if (typeof config.outtoolong === "string")
            response.status=config.outtoolong;
        else
            response.status=config.outtoolong[Math.floor(Math.random() * config.outtoolong.length)];
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
        if (typeof config.welcomehome === "string")
            response.status=config.welcomehome;
        else
            response.status=config.welcomehome[Math.floor(Math.random() * config.welcomehome.length)];
        if (tweet.text.indexOf("out") >= 0) {
            if (typeof config.staysafe === "string")
                response.status=config.staysafe;
            else
                response.status=config.staysafe[Math.floor(Math.random() * config.staysafe.length)];
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
    var threshold = 75;
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
potentiallyChangeState();
setInterval(potentiallyChangeState, intervalLength);