var config = require('./config.js');
var twitter = require('twitter');
var fs = require('fs');
var twit = new twitter(config.twitter);
var moment = require('moment');

var intervalLength = 10000;
var favIntervalLength = 30000;
var saveData = {since_id: 0, lastNormalTweet: 0, pepitoIsOut: false};
var currentState = 1;

if (fs.existsSync('saveData.json')) {
    saveData = JSON.parse(fs.readFileSync('saveData.json', {encoding: 'utf8'}));
    if (typeof saveData.pepitoIsOut === "undefined")
        saveData.pepitoIsOut = false;
    console.log("Loaded Data: ");
    console.log(saveData);
}
function checkFavableTweets() {
    if (saveData.pepitoIsOut == false)
        return;
    var data = {q: "cat friend", result_type: 'recent'};
    if (typeof saveData.lastFav !== "undefined")
        data.since_id = saveData.lastFav;
    twit.get('search/tweets', data, function(error, tweets, response){
        if(error) { console.log("checkFavableTweets Error:"); console.log(error); return; }
        if (tweets.statuses.length > 0) {
            saveData.lastFav = tweets.statuses[0].id_str;
            SaveData();
            twit.post('favorites/create', {id: tweets.statuses[0].id_str}, function(error, body, response) {
                if(error) { console.log("checkFavableTweets Fav Error:"); console.log(error); return; }
            });
        }
        else
            console.log("No favable tweets found.");
    });
}
function checkPepitosTweets() {
    var data = {screen_name: "pepitothecat", exclude_replies: true};
    if (saveData.since_id > 0)
        data.since_id = saveData.since_id;
    twit.get('statuses/user_timeline', data, function(error, tweets, response){
        if(error) { console.log("checkPepitosTweets Error:"); console.log(error); return; }
        if (tweets.length > 0) {
            if (tweets[0].text.indexOf("out") >= 0)
                saveData.pepitoIsOut = true;
            else
                saveData.pepitoIsOut = false;
            potentiallyChangeState()
            var tweetData = getResponseTweet(tweets[0]);
            doTweet(tweetData);
        }
        else if (new Date(saveData.lastNormalTweet).getTime() + config.normalTweetInterval < Date.now()) {
            doNormalTweet();
        }
    });
}
function doNormalTweet() {
    var data = {screen_name: "pepitothecat", exclude_replies: true};
    if (saveData.since_id > 0)
        data.since_id = saveData.since_id;
    twit.get('statuses/show/'+saveData.since_id, data, function(error, tweet, response){
        if(error) { console.log("checkPepitosTweets get Error:"); console.log(error); return; }
        potentiallyChangeState()
        var tweetData = getNormalTweet(tweet);
        // check for chance to include state photo
        if (shouldPostPhoto()) {
            console.log('Posting Photo');
            var stateObject = config.states[currentState];
            fs.readFile(stateObject.picture,{encoding: "base64"}, function(err, data) {
                // we should still post the tweet even if we can't load the file
                if (err) { console.log(err); doTweet(tweetData); return; }
                twit.post('media/upload', {media: data}, function(error, body, response) {
                    if(error) {console.log(error); doTweet(tweetData); return }
                    tweetData.media_ids = body.media_id_string;
                    doTweet(tweetData);
                });
            });
        }
        else {
            doTweet(tweetData);
        }
    });
}
function shouldPostPhoto() {
    return Math.random() > (2 / 3);
}
function doTweet(tweetData) {
    if (typeof tweetData.status === "undefined")
        return;
    twit.post('statuses/update', tweetData, function(error, body, response) {
        if(error) {console.log("doTweet Error:");console.log(error);}
        
    });
}
function pepitoHasBeenOutReallyLong(tweet) {
    var lastTweeted = new Date(tweet.created_at);
    var threshold = 2 * 60 * 60 * 1000;
    return (Date.now()-lastTweeted.getTime()) > threshold;
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
        if (pepitoHasBeenOutReallyLong(tweet)) {
            console.log("I really miss Pepito");
            if (typeof msg.outreallylong === "string")
                response.status=msg.outreallylong;
            else
                response.status=msg.outreallylong[Math.floor(Math.random() * msg.outreallylong.length)];
        }
        else {            
            if (typeof msg.outtoolong === "string")
                response.status=msg.outtoolong;
            else
                response.status=msg.outtoolong[Math.floor(Math.random() * msg.outtoolong.length)];
        }
    }
    
    response.status += " ("+moment().utcOffset("+0100").format("HH:mm:ss")+")";
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
    if (typeof config.states[currentState].transitions == "undefined") {
        var threshold = 50;
        if (Math.random() * 100 > threshold) {
            // select random state
            var index = Math.floor(Math.random() * config.states.length);
            if (index == currentState)
                index = (index + 1) % config.states.length; 
            changeState(index);
        }
    }
    else {
        var drawNumber = Math.random() * 100;
        var minBallot = 0;
        var maxBallot = 0;
        for(var i = 0; i < config.states[currentState].transitions.length; i++) {
            var transition = config.states[currentState].transitions[i];
            maxBallot = minBallot + transition.chance;
            if (drawNumber >= minBallot && drawNumber < maxBallot) {
                changeState(transition.state);
                return;
            }
            minBallot = maxBallot;
        }
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
setInterval(checkFavableTweets, favIntervalLength);
checkFavableTweets();
//changeState(currentState);
//setInterval(potentiallyChangeState, intervalLength * 6 * 30);