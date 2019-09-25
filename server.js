//TODO: clear up dependencies
const express = require('express'); //for serving
const fs = require('fs'); //for reading and writing into data.json
const uniqid = require('uniqid'); //for generate unique ids TODO: replace this with something less easy to guess
const shuffle = require('shuffle-array');

String.prototype.replaceAll = function(str1, str2, ignore) 
{
    return this.replace(new RegExp(str1.replace(/([\/\,\!\\\^\$\{\}\[\]\(\)\.\*\+\?\|\<\>\-\&])/g,"\\$&"),(ignore?"gi":"g")),(typeof(str2)=="string")?str2.replace(/\$/g,"$$$$"):str2);
} 

require('dotenv').config();

let app = express();
app.use(express.urlencoded());
//set view engine to handlebars
const exphbs  = require('express-handlebars');
app.engine('handlebars', exphbs());
app.set('view engine', 'handlebars');

app.get('/', function(req, res) {
    res.render('home');
});

//Write form info into eventdata.json
app.post('/addevent', function (req, res) {
    let event = {}; //all data about given event
    if (req.body.event_name) {
        event.event_name = req.body.event_name;
    } else {
        event.event_name = ""; //TODO: replace with some error/default event name
    }

    if (req.body.host_name) {
        event.host_name = req.body.host_name;
    } else {
        event.host_name = ""; //TODO: replace with some error/default host name
    }

    if (req.body.intro_email_subject) {
        event.intro_email_subject = req.body.intro_email_subject;
    } else {
        event.intro_email_subject = ""; //TODO: replace with some error/default email subject
    }

    if (req.body.intro_email_body) {
        event.intro_email_body = req.body.intro_email_body;
    } else {
        event.intro_email_body = ""; //TODO: replace with some error/default email body
    }


    let emails = req.body.email_list.split("\r\n").filter((e) => is_email_format(e)); //TODO: convert to unique email format
    event.attendees = [];

    for (let e of emails) {
        event.attendees.push({ 
            email: e, 
            name: "", 
            description: "", 
            id: uniqid(), //id is event specific, and only for verification. emails are used to identify attendees across events
            intro_sent: false,
            connected: false, //connected means they get emails
            findable: false //findable means they have their profile sent
        });
    }

    event.event_id = "event_" + uniqid();

    //TODO: Use MongoDB O.E.
    let raw = fs.readFileSync('eventdata.json');
    let data = JSON.parse(raw);
    
    //add event to events array on data.json
    if (data.events === undefined) {
        data.events = [];
        data.events.push(event);
    } else {
        data.events.push(event);
    }
    
    fs.writeFileSync('eventdata.json', JSON.stringify(data, null, 2));
    update_user_data(); //TODO: check if this call is necessary, and if not remove it
    res.send('Email sent! Thank you for trying out the linkbaby.io prototype! If anything seems to be broken, email ed@newspeak.house'); //TODO: make this nice
});

function is_email_format(email) { //returns true if input is valid email address
    let re = /^(([^<>()\[\]\\.,;:\s@"]+(\.[^<>()\[\]\\.,;:\s@"]+)*)|(".+"))@((\[[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\])|(([a-zA-Z\-0-9]+\.)+[a-zA-Z]{2,}))$/;
    return re.test(String(email).toLowerCase());
}

function update_user_data() { //this will refresh userdata.json using eventdata.json
    //add links from event
    let user_raw = fs.readFileSync('userdata.json');
    let users = JSON.parse(user_raw).users; //get usersdata that already exists
    let event_raw = fs.readFileSync('eventdata.json'); //eventdata.json is read but not changed here!!
    let event_data = JSON.parse(event_raw);
    if (event_data.events) {
        for (let e of event_data.events) {
            for (let attendee of e.attendees) {
                if (attendee.connected) {
                    //check if attendee is already user, and add user or links accordingly
                    let attendee_already_user = false;
                    for (let user of users) {
                        if (user.email == attendee.email) {
                            //go through other attendees of event
                            for (let other_attendee of e.attendees) {
                                if (other_attendee.email != attendee.email) {
                                    //check if already linked
                                    let is_already_linked = false;
                                    for (let link of user.links) {
                                        if (link.email == other_attendee.email) { //check if already linked from some event
                                            //check if event in question is in link
                                            let event_in_question_is_in_link = false;
                                            for (let link_event of link.events) {
                                                if (link_event.event_id == e.event_id) { //linked through event in question
                                                    if (!other_attendee.findable || link_event.attendee.name == "") {
                                                        link_event.clearup = true; //mark link
                                                    }
                                                    event_in_question_is_in_link = true;
                                                    break;
                                                }
                                            }
                                            link.events = link.events.filter((e) => !e.clearup);
                                            if (link.events.length == 0) {
                                                link.clearup = true;
                                            }
                                            if (!event_in_question_is_in_link) {
                                                link.events.push({
                                                    event_id: e.event_id, 
                                                    user_id: attendee.id,
                                                    event_name: e.event_name,
                                                    host_name: e.host_name,
                                                    linked: false,
                                                    when_linked: 0,
                                                    attendee: { 
                                                        id: other_attendee.id,
                                                        email: other_attendee.email,
                                                        name: other_attendee.name, 
                                                        description: other_attendee.description 
                                                    }
                                                })
                                            }
                                            is_already_linked = true;
                                            break;
                                        }
                                    }
                                    user.links = user.links.filter((l) => !l.clearup);
                                    if (!is_already_linked && other_attendee.findable) {
                                        user.links.push({ 
                                            email: other_attendee.email, 
                                            events: [{ 
                                                event_id: e.event_id, 
                                                user_id: attendee.id,
                                                event_name: e.event_name,
                                                host_name: e.host_name,
                                                linked: false,
                                                when_linked: 0,
                                                attendee: { 
                                                    id: other_attendee.id,
                                                    email: other_attendee.email,
                                                    name: other_attendee.name, 
                                                    description: other_attendee.description 
                                                }
                                            }]
                                        });
                                    }
                                }
                            }
                            attendee_already_user = true;
                            break;
                        }
                    }
                    
                    if (!attendee_already_user) {
                        let new_user_links = [];
                        for (let other_attendee of e.attendees) {
                            //add links from event
                            if (other_attendee.email != attendee.email && other_attendee.findable) {
                                new_user_links.push({ 
                                    email: other_attendee.email, 
                                    events: [{ 
                                        event_id: e.event_id, 
                                        user_id: attendee.id,
                                        event_name: e.event_name,
                                        host_name: e.host_name,
                                        linked: false,
                                        when_linked: 0,
                                        attendee: { 
                                            id: other_attendee.id,
                                            email: other_attendee.email,
                                            name: other_attendee.name, 
                                            description: other_attendee.description 
                                        }
                                    }]
                                }); 
                            }
                        }
                        users.push({
                            email: attendee.email, 
                            name: attendee.name,
                            date_last_sent: Date.now(), //such that the first email isn't until the next day
                            prefered_time: 0, //TODO: implement this
                            links: new_user_links
                        });
                    }
                } else {
                    //if not connected from event, remove any links from that event
                    for(let user of users) {
                        if (user.email == attendee.email) {
                            for (let link of user.links) {
                                for (let unlink_event of link.events) {
                                    if (e.event_id == unlink_event.event_id){
                                        unlink_event.clearup = true; //mark events which user is not connected to
                                    }
                                }
                                link.events = link.events.filter((e) => !e.clearup); //remove all marked events
                                if (link.events.length == 0) {
                                    link.clearup = true; //mark all links without any events
                                }
                            }
                            user.links = user.links.filter((l) => !l.clearup); //remove all marked links (those without any events)
                        }
                    }
                }
            }
        }
    }

    //TODO: sort links of each user based on order they *should* be linked
    for (let user of users){
        shuffle(user.links);
    }

    //update user database
    let user_data = {};
    user_data.users = users;
    fs.writeFileSync('userdata.json', JSON.stringify(user_data, null, 2));
}

app.get('/linkme/:event_id/:id', function (req, res) {
    //TODO: check if already linked
    fs.readFile('eventdata.json', (err, raw) => {
        if (err) {
            console.log(err);
            return;
        }
        let data = JSON.parse(raw);
        let event = data.events.find((e) => (e.event_id == req.params.event_id));
        if (!event) {
            res.send("Error: Could not find event");
        } else {
            let attendee = event.attendees.find((a) => (a.id == req.params.id)); //TODO: check if this finds the right user
            if (!attendee){
                res.send("Error: Could not find user");
            } else {
                res.render('linkme', { email: attendee.email, event_id: req.params.event_id, id: req.params.id });
            }
        }
    })
})

app.post('/submit', function (req, res) {
    let raw = fs.readFileSync('eventdata.json');
    let data = JSON.parse(raw);
    let event = data.events.find((e) => (e.event_id == req.body.event_id));
    if (!event) {
        res.send("Error: Could not find event");
    } else {
        let attendee = event.attendees.find((a) => (a.id == req.body.id));
        if (!attendee){
            res.send("Error: Could not find user");
        } else {
            attendee.name = req.body.name;
            attendee.description = req.body.description;
            if(req.body.connected) {
                attendee.connected = true;
            } else {
                attendee.connected = false;
                console.log("unconnected!");
            }
            if(req.body.findable) {
                attendee.findable = true;
            } else {
                attendee.findable = false;
            }
            fs.writeFileSync('eventdata.json', JSON.stringify(data, null, 2));
            update_user_data();
            res.send('You\'re all linked up!');
        }
    }
})

app.get('/unsubscribe/:event_id/:id', function (req, res) {
    //TODO: Include other data in unsubscribe screen
    let raw = fs.readFileSync('eventdata.json');
    let data = JSON.parse(raw);
    let event = data.events.find((e) => (e.event_id == req.params.event_id));
    if (!event) {
        res.send("Error: Could not find event");
    } else {
        let attendee = event.attendees.find((a) => (a.id == req.params.id));
        if (!attendee){
            res.send("Error: Could not find user");
        } else {
            res.render('unsubscribe', { email: attendee.email, event_id: req.params.event_id, id: req.params.id });
        }
    }
})

app.post('/unsubscribe_confirm', function (req, res) {
    let raw = fs.readFileSync('eventdata.json');
    let data = JSON.parse(raw);
    let event = data.events.find((e) => (e.event_id == req.body.event_id));
    if (!event) {
        res.send("Error: Could not find event");
    } else {
        let attendee = event.attendees.find((a) => (a.id == req.body.id));
        if (!attendee){
            res.send("Error: Could not find user");
        } else {
            let email = attendee.email;
            if (req.body.disconnect) {
                attendee.connected = false;
            }
            if (req.body.make_unfindable) {
                attendee.findable = false;
            }
            fs.writeFileSync('eventdata.json', JSON.stringify(data, null, 2));
            update_user_data();
            res.send('Unsubscribed successfully');
        }
    }
})

//Check data for unsent regularly
function send_unsent_emails() { //TODO: check if async calls could fuck stuff up here
    //send intro emails which haven't been sent
    let event_raw = fs.readFileSync('eventdata.json');
    let event_data = JSON.parse(event_raw);
    if (event_data.events) {
        for (let event of event_data.events) {
            for (let attendee of event.attendees) {
                if (!attendee.intro_sent) {
                    send_intro(attendee.email, event, attendee.id, (err) => { //TODO: fix that sometimes user id isn't right
                        if (err){
                            console.log(err);
                        }
                    });
                    attendee.intro_sent = true; //not in callback to avoid repeat send errors
                    fs.writeFileSync('eventdata.json', JSON.stringify(event_data, null, 2));
                }
            }
        }
    }

    //send daily emails if they haven't been sent
    let user_raw = fs.readFileSync('userdata.json');
    let user_data = JSON.parse(user_raw);
    if (user_data.users) {
        for (let u of user_data.users) {
            DAY_LENGTH = 24*60*60*1000; //TODO: change this to 24*60*60*1000 rather than 30 secs
            if(Date.now() - u.date_last_sent > DAY_LENGTH /*- 1800000 */) { // - 1800000 so that it doesn't creep forward in time TODO: uncomment this
                //TODO: also check that it is past prefered time of day
                for (link of u.links) {
                    if (link.events.find( (e) => (!e.linked) )) { //if [not linked] from at least one event
                        for (let event of link.events) {
                            if (!event.linked && event.attendee.name != "") { //the  ~ && event.attendee.name != ""  ~ is covering over a bug where you would get empty emails
                                send_link(u.email, event, (err) => {
                                    if (err) {
                                        console.log(err);
                                    }
                                });
                                event.linked = true; //not in callback to avoid repeat send errors
                                event.when_linked = Date.now(); 
                                u.date_last_sent = Date.now();
                                fs.writeFileSync('userdata.json', JSON.stringify(user_data, null, 2));
                                break;
                            }
                        }
                        break; //stop at first email
                    }
                }
            }
        }
    }
}

setInterval(send_unsent_emails, 3000); //TODO: call this function regularly reliably

//EMAILS SENT: EDIT ANY COPY HERE (ALL OTHER COPY IS IN THE FORMS, SEE views/layouts/SOMETHING.handlebars)

function send_intro(email, event, user_id, callback){
    let link = "https://www.linkbaby.io/linkme/" + event.event_id + "/" + user_id; //TODO: change to actual link !! IMPORTANT
    sendmail({
        from: event.host_name + " via Linkbaby <hello@linkbaby.io>",
        to: email,
        subject: event.intro_email_subject,
        text: event.intro_email_body + "\n\nLink me: " + link,
        html: event.intro_email_body.replaceAll("\n", "<br>") + "<br><br><a href=\"" + link + "\">Link me!</a>"
    }, (err) => callback(err)); //TODO: make email prettier
}

function send_link(email, event, callback){ //events is in the format of userdata.json > users > links > events
    let email_body_text = "linkbaby.io is connecting you to people you met at " + event.event_name + ":";
    let email_body_html = "<p><a title=\"linkbaby\" href=\"https://linkbaby.io\" target=\"_blank\" rel=\"noopener\">linkbaby.io</a> is connecting you to people you met at <strong>" + event.event_name + "</strong>:"; 
    
    email_body_text += "\n\n\n" + event.attendee.name;
    email_body_html += "<br><br><br><big><strong>" + event.attendee.name + " (" + event.attendee.email + ")</strong>";
    
    email_body_text += "\n\"" + event.attendee.description + "\"\n\n\n";
    email_body_html += "<br>\"" + event.attendee.description + "\"</big><br><br><br>";
    
    email_body_text += "If you want to contact " + event.attendee.name + ", just reply directly to this email.\nIf not, ignore this email - they won’t know!"
    email_body_html += "If you want to contact " + event.attendee.name + ", just reply directly to this email.<br>If not, ignore this email - they won’t know!"
    
    email_body_text += "\n\nPS: linkbaby.io is just a prototype!\nIf anything seems to be broken, or you have any queries, please email ed@newspeak.house\n\n";
    email_body_html += "<br><br>PS: <a title=\"linkbaby\" href=\"https://linkbaby.io\" target=\"_blank\" rel=\"noopener\">linkbaby.io</a> is just a prototype!\nIf anything seems to be broken, or you have any queries, please email <a title=\"mailto ed@newspeak.house\" href=\"mailto:ed@newspeak.house\" target=\"_blank\" rel=\"noopener\">ed@newspeak.house</a><br><br>";

    //TODO: Add "I’ll send you another person tomorrow. If you want to see a list of everyone from $data.groupName all at once, click here!" + functionality

    let unsubscribe_link = "https://www.linkbaby.io/unsubscribe/" + event.event_id + "/" + event.user_id; //TODO: change to actual link !! IMPORTANT
    email_body_text += "Unsubscribe: " + unsubscribe_link;
    email_body_html += "<br><a href=\"" + unsubscribe_link + "\">Unsubscribe</a></p>";
    let email_subject = "Link with " + event.attendee.name + " from " + event.event_name;
    sendmail({
        from: event.attendee.name + " via Linkbaby <hello@linkbaby.io>",
        to: email, 
        subject: email_subject, 
        text: email_body_text, 
        html: email_body_html, 
        replyTo: event.attendee.email //TODO: put linkbaby email in replyto cc
    }, (err) => callback(err)); 
}

//CODE FOR ACTUALLY SENDING EMAILS

const nodemailer = require('nodemailer');
const ses = require('nodemailer-ses-transport'); //for amazon simple email service

// async..await is not allowed in global scope, must use a wrapper
async function sendmail(message, callback) {
    let transporter = nodemailer.createTransport(ses({
        accessKeyId: process.env.ACCESS_KEY_ID, //amazon access key ID
        secretAccessKey: process.env.SECRET_ACCESS_KEY_ID, //amazon secret access key
        region : "eu-west-1"
    })); //for amazon simple email service
    // let transporter = nodemailer.createTransport(sparkPostTransport({
    //     'sparkPostApiKey': ''
    // })); //for sparkpost email

    console.log(message); //TEMP

    transporter.sendMail(message, (err) => callback(err));
}

async function sendmail_test(message, callback){
    // Generate test SMTP service account from ethereal.email
    // Only needed if you don't have a real mail account for testing
    let testAccount = await nodemailer.createTestAccount();

    // create reusable transporter object using the default SMTP transport
    let transporter = nodemailer.createTransport({
        host: 'smtp.ethereal.email',
        port: 587,
        secure: false, // true for 465, false for other ports
        auth: {
            user: testAccount.user, // generated ethereal user
            pass: testAccount.pass // generated ethereal password
        }
    });

    // send mail with defined transport object
    let info = await transporter.sendMail(message, (err) => callback(err));

    console.log('Message sent: %s', info.messageId);
    // Message sent: <b658f8ca-6296-ccf4-8306-87d57a0b4321@example.com>

    // Preview only available when sending through an Ethereal account
    console.log('Preview URL: %s', nodemailer.getTestMessageUrl(info));
}

//HOSTING

app.use(express.static("public")); //TODO: change this
server = require('http').createServer(app);
//io = io.listen(server);
server.listen(3000, 'localhost');