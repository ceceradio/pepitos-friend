var config = require('./config.js');
var twitter = require('twitter');
var fs = require('fs');
var twit = new twitter(config.twitter);
var moment = require('moment');
var rx = require('rx');

var intervalLength = 10000;
var saveData = {since_id: false, lastNormalTweet: 0};
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
    .retry()
    .map(function(tweets) {
        if (tweets.length >= 1) return tweets[0];
        return null;
    })
    .filter(tweet => tweet != null)
    .shareReplay(1) // this ensures that getPepitosTweets is only called once per latestPepitoTweetStream subscriber;
latestPepitoTweetStream.subscribe(()=>{}, (error) => {console.log(error)});
var distinctTweetStream = latestPepitoTweetStream
    .filter(tweet => tweet.id_str != saveData.since_id);

var pepitoSaidSubscription = distinctTweetStream
    .subscribe(function next(tweet) {
        console.log("Pepito just tweeted: "+tweet.text);
    }
    ,function err(error) {
        console.log(error);
    })
var responseTweetComposerStream = distinctTweetStream
    .map(startPartial)
    .map((partial) => { partial.state = currentState; return partial; } )
    .map(composeResponseTweet)
    .share();
    
var normalTweetMakerStream = latestPepitoTweetStream
    .filter(() => { return Date.now() > (saveData.lastNormalTweet + config.normalTweetInterval)})
    .map(startPartial)
    .map(determineState)
    .shareReplay(1) // this ensures that determineState is only called once per normalTweetStream subscriber
var newStateStream = normalTweetMakerStream
    .filter(hasStateChanged)
    .map(getState);
var changedStateLogSubscription = newStateStream
    .subscribe((state) => {console.log("State changed to: "+state.name)})
var accountPicSubscription = newStateStream
    .flatMap(getPictureData)
    .flatMap(changePicture)
    .subscribe(() => { console.log("Picture successfully changed")})

var normalTweetComposerStream = normalTweetMakerStream
    .map(determineTweetType)
    .map(composeTweet)
    .map(determinePhotoTweet).share(); // this ensures that everything is only called once per normalTweetComposerStream subscriber

var tweetLogOutputSubscription = rx.Observable.merge(normalTweetComposerStream, responseTweetComposerStream)
    .subscribe(function(partial) {
        console.log(partial.tweetData.status);
        saveData.lastNormalTweet = Date.now();
        saveData.since_id = partial.originTweet.id_str;
        saveDataToDisk();
    },function err(error) {
        console.log(error);    
    });

var tweetPosterSubscription = rx.Observable.merge(normalTweetComposerStream, responseTweetComposerStream)
    .flatMap(uploadPhotoIfNecessary)
    .flatMap((partial) => { return rxTwitPost('statuses/update', partial.tweetData); })
    .retry(5)
    .catch((e) => {
        console.log('There was an error', e);
        return tweetPosterSubscription;
    })
    .subscribe(function success(result) {
        if (result !== false) console.log('Tweet posted successfully')
    },function err(error) {
    	console.log("Tweeting error: ");
        console.log(error);
        process.exit();
    });

function getPepitosTweets() {
    var data = {screen_name: "pepitothecat", exclude_replies: true, count: 1};
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
            .retry(1)
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
function getMessageFromState(stringOrArray) {
    if (typeof stringOrArray === "string") {
        return stringOrArray;
    }
    var index = Math.floor(Math.random()*stringOrArray.length);
    return stringOrArray[index];
}
function composeTweet(partial) {
    var state = config.states[partial.state];
    var type = partial.tweetType;
    partial.tweetData.status = getMessageFromState(state[type]);
    return partial;
}
function composeResponseTweet(partial) {
    var state = config.states[partial.state];
    if (partial.originTweet.text.indexOf("out") >= 0) {
        partial.tweetData.status = getMessageFromState(state.staysafe)
    }
    else {
        partial.tweetData.status = getMessageFromState(state.welcomehome)
    }
    // if there's no date, this is a weird tweet, so just say something nice
    if (partial.originTweet.text.match(/\([\d]+:[\d]+:[\d]+\)/) === null) {
        partial.tweetData.status = "@PepitoTheCat Wow! That's neat, I think!";
    }
    else {
        var dateText = partial.originTweet.text.match(/\([\d]+:[\d]+:[\d]+\)/)[0];
        partial.tweetData.status = "@PepitoTheCat "+partial.tweetData.status+" "+dateText;
    }
    partial.tweetData.in_reply_to_status_id = partial.originTweet.id_str;
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
function saveDataToDisk() {
    fs.writeFile('saveData.json', JSON.stringify(saveData), {}, function(err) {
        if (err) console.log(err);
        else console.log("Saved");
    });
}
process.stdin.resume();
