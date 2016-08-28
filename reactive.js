var config = require('./config-normal.js');
var twitter = require('twitter');
var fs = require('fs');
var twit = new twitter(config.twitter);
var moment = require('moment');
var rx = require('rx');

var intervalLength = 10000;
var normalTweetInterval = 10000;
var favIntervalLength = 30000;
var saveData = {since_id: 0, lastNormalTweet: 0};
var currentState = 1;

if (fs.existsSync('saveData.json')) {
    saveData = JSON.parse(fs.readFileSync('saveData.json', {encoding: 'utf8'}));
    console.log("Loaded Data: ");
    console.log(saveData);
}

var rxReadFile = rx.Observable.fromNodeCallback(fs.readFile, fs, arg0 => arg0);
var rxTwitPost = rx.Observable.fromNodeCallback(twit.post, twit, arg0 => arg0);
var rxTwitGet = rx.Observable.fromNodeCallback(twit.get, twit, arg0 => arg0);

var latestPepitoTweetStream = rx.Observable.interval(intervalLength)
    .startWith(0)
    .flatMap(getPepitosTweets)
    .map(function(tweets) {
        if (tweets.length >= 1) return tweets[0];
        return null;
    })
    .filter(tweet => tweet != null)
    .shareReplay(1) // this ensures that getPepitosTweets is only called once per latestPepitoTweetStream subscriber;
var distinctTweetStream = latestPepitoTweetStream
    .distinct((tweet) => {return tweet.id_str})
    .subscribe(function next(tweet) {
        saveData.since_id = tweet.id_str;
        console.log("Pepito just tweeted: "+tweet.text);
    }
    ,function err(error) {
        console.log(error);
    })
var normalTweetMakerStream = rx.Observable.interval(config.normalTweetInterval)
    .startWith(0)
    .flatMap(() => { return latestPepitoTweetStream; })
    .map(startPartial)
    .map(determineState)
    .share() // this ensures that determineState is only called once per normalTweetStream subscriber
var newStateStream = normalTweetMakerStream
    .filter(hasStateChanged)
    .map(getState);
var changedStateLogSubscription = newStateStream
    .subscribe((state) => {console.log("State changed to: "+state.name)})
var accountPicSubscription = newStateStream
    .flatMap(getPictureData)
    .flatMap(changePicture)
    .subscribe(() => { console.log("Picture successfully changed")})

var tweetComposerStream = normalTweetMakerStream
    .map(determineTweetType)
    .map(composeTweet)
    .map(determinePhotoTweet).share(); // this ensures that everything is only called once per tweetComposerStream subscriber

var tweetLogOutputSubscription = tweetComposerStream
    .map(partial => partial.tweetData.status)
    .subscribe(console.log);

var tweetPosterSubscription = tweetComposerStream
    .flatMap(uploadPhotoIfNecessary)
    .flatMap((partial) => { return rxTwitPost('statuses/update', partial.tweetData); })
    .subscribe(function success() {
        console.log('Tweet posted successfully');
    },function err(error) {
        console.log('');    
    });

function getPepitosTweets() {
    var data = {screen_name: "pepitothecat", exclude_replies: true};
    if (saveData.since_id > 0) data.since_id = saveData.since_id;
    return rxTwitGet('statuses/user_timeline', data);
}
function getState(partial) {
    return config.states[partial.state];
}
function hasStateChanged(partial) {
    return partial.hasOwnProperty('newState') && partial.newState === true;
}
function getPictureData(state) {
    return rxReadFile(state.picture,{encoding: "base64"});
}
function changePicture(fileData) {
    return rxTwitPost('account/update_profile_image', {image: fileData});
}
function startPartial(tweet) {
    var partial = {};
    partial.originTweet = tweet;
    partial.tweetData = {};
    return partial;
}
function determinePhotoTweet(partial) {
    if (partial.hasOwnProperty('photo')) return partial;
    if (Math.random() > 2/3) partial.photo = true;
    else partial.photo = false;
    if (partial.photo) console.log('This is a photo tweet. Posting '+getState(partial).picture);
    return partial;
}
function uploadPhotoIfNecessary(partial) {
    if (partial.photo) {
        return getPictureData(getState(partial))
            .flatMap((pictureData) => { return rxTwitPost('media/upload', {media: pictureData}); })
            .map((body) => { partial.tweetData.media_ids = body.media_id_string; return partial; });
    }
    else {
        return rx.Observable.just(partial);
    }
}
function determineTweetType(partial) {
    if (partial.originTweet.text.indexOf('out') >= 0) {
        if (hasPepitoBeenWayTooLong(partial.originTweet)) {
            partial.tweetType = 'outwaytoolong';
        }
        else if (hasPepitoBeenOutReallyLong(partial.originTweet)) {
            partial.tweetType = 'outreallylong';
        }
        else {
            partial.tweetType = 'outtoolong';
        }
    }
    else {
        partial.tweetType = 'athome';
    }
    return partial;
}
function determineState(partial) {
    var drawNumber = Math.random() * 100;
    var chosenTransition = config.states[currentState].transitions
        .reduce(function(prev, current) {
            if (prev.transition) return prev;
            if (drawNumber > prev.min && drawNumber <= prev.min+current.chance) {
                prev.transition = current;
            }
            return prev;
        }, {min:0, transition: null}).transition;
    if (chosenTransition) {
        partial.newState = true;
        partial.state = chosenTransition.state;
        currentState = partial.state;
    }
    else {
        partial.state = currentState;
    }
    return partial;
}
function composeTweet(partial) {
    var state = config.states[partial.state];
    var type = partial.tweetType;
    if (typeof state[type] === "string") {
        partial.tweetData.status = state[type];
    }
    else {
        var index = Math.floor(Math.random()*state[type].length);
        partial.tweetData.status = state[type][index];
    }
    return partial;
}
function hasPepitoBeenOutReallyLong(tweet) {
    var lastTweeted = new Date(tweet.created_at);
    var threshold = 2 * 60 * 60 * 1000;
    return (Date.now()-lastTweeted.getTime()) > threshold;
}
function hasPepitoBeenWayTooLong(tweet) {
    var lastTweeted = new Date(tweet.created_at);
    var threshold = 24 * 60 * 60 * 1000;
    return (Date.now()-lastTweeted.getTime()) > threshold;
}
function saveData(partial) {
    fs.writeFile('saveData.json', JSON.stringify(saveData), {}, function(err) {
        if (err) console.log(err);
        else console.log("Saved");
    });
}
process.stdin.resume();
/*
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
        if (pepitoHasBeenWayTooLong(tweet)) {
            console.log("When will Pepito return from the war?");
            if (typeof msg.outwaytoolong === "undefined") {
                if (typeof msg.outreallylong === "string")
                    response.status=msg.outreallylong;
                else
                    response.status=msg.outreallylong[Math.floor(Math.random() * msg.outreallylong.length)];
            }
            else {
                if (typeof msg.outwaytoolong === "string")
                    response.status=msg.outwaytoolong;
                else
                    response.status=msg.outwaytoolong[Math.floor(Math.random() * msg.outwaytoolong.length)];
            }
        }
        else if (pepitoHasBeenOutReallyLong(tweet)) {
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
        if (tweet.text.match(/\([\d]+:[\d]+:[\d]+\)/) === null) {
            response.status = "@PepitoTheCat Wow! That's neat, I think!";
        }
        else {
            var dateText = tweet.text.match(/\([\d]+:[\d]+:[\d]+\)/)[0];
            response.status = "@PepitoTheCat "+response.status+" "+dateText;
        }
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
*/
//setInterval(checkFavableTweets, favIntervalLength);
//checkFavableTweets();
//changeState(currentState);
//setInterval(potentiallyChangeState, intervalLength * 6 * 30);