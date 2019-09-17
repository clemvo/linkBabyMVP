TODO: Description of Product and Code

Data Structure:
eventdata.json:
    events[]
        event_name
        host_name
        intro_email_subject
        intro_email_body
        attendees[]
            email
            name
            description
            id
            intro_sent (bool)
            connected (bool)
            findable (bool)
        event_id

userdata.json
    users[]
        email
        name
        date_last_sent
        prefered_time
        days_between
        links[]
            email
            events[]
                event_id
                user_id (SPECIFIC TO EVENT)
                event_name
                host_name
                linked (bool)
                when_linked
                attendee
                    id
                    email
                    name
                    description