//TODO: clear up dependencies
const express = require('express'); //for serving
const fs = require('fs'); //for reading and writing into data.json
const uniqid = require('uniqid'); //for generate unique ids TODO: replace this with something less easy to guess

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
app.post('/addevent', function (req, res) { //TODO: replace with POST request 
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
    res.send('Event Added!'); //TODO: make this nice
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
                    //turn connected attendees into users
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
                                }],
                            }); 
                        }
                    }
                    //check if attendee is already user, and add user or links accordingly
                    let attendee_already_user = false;
                    for (let user of users) {
                        if (user.email == attendee.email) {
                            for (let new_link of new_user_links) {
                                //check if is already linked
                                let is_already_linked = false;
                                for (let link of user.links) {
                                    if (link.email == new_link.email) {
                                        new_event = new_link.events[0];
                                        if (!link.events.find( (e) => (e.event_id == new_event.event_id) )) { //check if event to be added in not already in link.events
                                            link.events.push(new_event);
                                        }
                                        is_already_linked = true;
                                        break;
                                    }
                                }
                                if (!is_already_linked) {
                                    user.links.push(new_link);
                                }
                            }
                            attendee_already_user = true;
                            break;
                        }
                    }
                    if (!attendee_already_user) {
                        users.push({
                            email: attendee.email, 
                            name: attendee.name,
                            date_last_sent: 0,
                            prefered_time: 0, //TODO: implement this
                            days_between: 1,
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

    //update user database
    let user_data = {};
    user_data.users = users;
    fs.writeFileSync('userdata.json', JSON.stringify(user_data, null, 2));
}

app.get('/linkme/:event_id/:id', function (req, res) {
    //TODO: check if already linked
    console.log("/link me works");
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
            let attendee = event.attendees.find((a) => (a.id == req.params.id)); //TODO: check if this finds to right user
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
    console.log(req.params.event_id)
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
    //TODO: think about having this called on launch rather than as part of regular check
    fs.readFile('eventdata.json', (err, raw) => {
        if (err) {
            console.log(err);
            return;
        }
        let data = JSON.parse(raw);
        if (data.events) {
            for (let event of data.events) {
                for (let attendee of event.attendees) {
                    if (!attendee.intro_sent) {
                        send_intro(attendee.email, event, attendee.id, (err) => {
                            if (err){
                                console.log(err)
                            } else {
                                attendee.intro_sent = true; //TODO: databaase !!
                                fs.writeFileSync('eventdata.json', JSON.stringify(data, null, 2));
                            }
                        });
                    }
                }
            }
        }
    });

    //send daily emails if they haven't been sent
    fs.readFile('userdata.json', (err, raw) => {
        if (err) {
            console.log(err);
            return;
        }
        let data = JSON.parse(raw);
        if (data.users) {
            for (let u of data.users) {
                DAY_LENGTH = 300000; //TODO: change this to 24*60*60*1000 rather than 5 minutes
                if(Date.now() - u.date_last_sent > u.days_between*DAY_LENGTH /*- 1800000 */) { // - 1800000 so that it doesn't creep forward in time TODO: uncomment this
                    //TODO: also check that it is past prefered time of day
                    for (link of u.links) {
                        if (link.events.find( (e) => (!e.linked) )) { //if [not linked] from at least one event
                            for (let event of link.events) {
                                if (!event.linked) {
                                    send_link(u.email, event);
                                    event.linked = true; //TODO: put in callback
                                    event.when_linked = Date.now(); 
                                    u.date_last_sent = Date.now();
                                    break;
                                }
                            }
                            break; //stop at first email
                        }
                    }
                }
            }
        }
        fs.writeFileSync('userdata.json', JSON.stringify(data, null, 2));
    })
}

setInterval(send_unsent_emails, 3000); //TODO: call this function regularly reliably

//EMAILS SENT: EDIT ANY COPY HERE (ALL OTHER COPY IS IN THE FORMS, SEE views/layouts/SOMETHING.handlebars)

function send_intro(email, event, user_id, callback){
    let link = "https://www.linkbaby.io/linkme/" + event.event_id + "/" + user_id; //TODO: change to actual link !! IMPORTANT
    sendmail({
        from: "hello@linkbaby.io",
        //TODO: change sender to "$host via linkbaby"
        to: email,
        subject: event.intro_email_subject,
        text: event.intro_email_body + "\n\nLink me: " + link,
        html: event.intro_email_body + "<br><br><a href=\"" + link + "\">Link me!</a>"
    }, (err) => callback(err)); //TODO: make email more pretty
}

function send_link(email, event, callback){ //events is in the format of userdata.json > users > links > events
    //TODO: improve this email (also options if there mulitple events)
    let email_body = "Link with " + event.attendee.name + " from " + event.event_name;
    email_body += "\n About  " + event.attendee.name + ":";
    email_body += "\n" + event.attendee.description;
    email_body += "\n\n";
    email_body += "If you want to talk to " + event.attendee.name + ", just reply to this email and it will go straight to them! If not, ignore this email - they won’t know!"
    email_body += "\n\n";

    //TODO: Add "I’ll send you another person tomorrow. If you want to see a list of everyone from $data.groupName all at once, click here!" + functionality

    let unsubscribe_link = "https://www.linkbaby.io/unsubscribe/" + event.event_id + "/" + event.user_id; //TODO: change to actual link !! IMPORTANT
    let email_body_text = email_body + "Unsubscribe: " + unsubscribe_link;
    let email_body_html = email_body + "\n<a href=\"" + unsubscribe_link + "\">Unsubscribe</a>";
    let email_subject = "Link with " + event.attendee.name + " from " + event.event_name;
    sendmail({ 
        from: "hello@linkbaby.io",
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
const sparkPostTransport = require('nodemailer-sparkpost-transport'); //for sparkpost email
//TODO: try sparkpost

// async..await is not allowed in global scope, must use a wrapper
async function sendmail(message, callback) {
    let transporter = nodemailer.createTransport(ses({
        accessKeyId: process.env.ACCESS_KEY_ID, //amazon access key ID
        secretAccessKey: process.env.SECRET_ACCESS_KEY_ID, //amazon secret access key TODO: secure and change this
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

//use public/index.html as basic frontend, and host on localhost:3030 ~ TODO: host website properly
app.use(express.static("public")); //TODO: change this
server = require('http').createServer(app);
//io = io.listen(server);
server.listen(3000, 'localhost');