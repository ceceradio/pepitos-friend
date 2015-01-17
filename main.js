var config = require('./config.js');
var twitter = require('twitter');
var fs = require('fs');
var twit = new twitter(config.twitter);

var intervalLength = 10000;
var since_id = 0;

if (fs.existsSync('since_id.txt')) {
    var since_id_str = fs.readFileSync('since_id.txt', {encoding: 'utf8'});

    if (typeof since_id_str !== undefined && since_id_str !== false && since_id_str != "")
        since_id = since_id_str;
}
function checkPepitosTweets() {
    var data = {screen_name: "pepitothecat", exclude_replies: true};
    if (since_id > 0)
        data.since_id = since_id;
    twit.get('statuses/user_timeline', data, function(error, tweets, response){
        if(error) console.log(error);
        if (tweets.length > 0 && tweets[0].id != since_id) {
            var dateText = tweets[0].text.match(/\([\d]+:[\d]+:[\d]+\)/)[0];
            var text=config.welcomehome;
            if (tweets[0].text.indexOf("out") >= 0)
                text=config.staysafe;
            text += " "+dateText;
            twit.post('statuses/update', {in_reply_to_status_id: tweets[0].id_str, status: "@PepitoTheCat "+text}, function(error, body, response) {
                if(error) console.log(error);;
            });
            since_id = tweets[0].id_str;
            console.log(tweets[0].text);  // The tweets.
            console.log(tweets[0].id_str);
            fs.writeFile('since_id.txt', since_id, {}, function(err) {
                if (err) console.log(err);
                else console.log("Saved since_id");
            });
        }
    });
}
checkPepitosTweets();
setInterval(checkPepitosTweets, intervalLength);