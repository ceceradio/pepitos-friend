var config = require('./config.js');
var twitter = require('twitter');
var fs = require('fs');
var twit = new twitter(config.twitter);
var moment = require('moment');

var intervalLength = 10000;
var saveData = {since_id: 0, lastNormalTweet: 0};

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
        if(error) console.log(error);
        if (tweets.length > 0) {
            var tweetData = getResponseTweet(tweets[0]);
            doTweet(tweetData);
        }
        else if (new Date(saveData.lastNormalTweet).getTime() + config.normalTweetInterval < Date.now()) {
            twit.get('statuses/show/'+saveData.since_id, data, function(error, tweet, response){
                if(error) console.log(error);
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
    response.status=config.athome;
    if (tweet.text.indexOf("out") >= 0)
        response.status=config.outtoolong;
    
    response.status += " ("+moment().zone("+0100").format("HH:mm:ss")+")";
    console.log("No activity: "+response.status);
    saveData.lastNormalTweet = now.getTime();
    SaveData();
    return response;
}
function getResponseTweet(tweet) {
    var response = {};
    if (tweet.id_str != saveData.since_id) {
        response.status=config.welcomehome;
        if (tweet.text.indexOf("out") >= 0)
            response.status=config.staysafe;
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
checkPepitosTweets();
setInterval(checkPepitosTweets, intervalLength);