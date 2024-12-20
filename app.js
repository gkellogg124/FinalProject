const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const app = express();
const db = new sqlite3.Database('./database.db');

// Set up EJS as the templating engine
app.set('view engine', 'ejs');

// Set up static file directory
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.urlencoded({ extended: true }));

// Initialize the database with tables and sample data
db.serialize(() => {
    db.run("CREATE TABLE IF NOT EXISTS devices (id INTEGER PRIMARY KEY, name TEXT, type TEXT, status TEXT DEFAULT 'off')");
    db.run("CREATE TABLE IF NOT EXISTS users (id INTEGER PRIMARY KEY, username TEXT, role TEXT)");
    db.run("CREATE TABLE IF NOT EXISTS schedules (id INTEGER PRIMARY KEY, device_id INTEGER, action TEXT, schedule_time TEXT)");
    db.run("CREATE TABLE IF NOT EXISTS alerts (id INTEGER PRIMARY KEY, message TEXT, status TEXT DEFAULT 'unread')");
	db.run("CREATE TABLE IF NOT EXISTS automation_rules (id INTEGER PRIMARY KEY, trigger_device_id INTEGER, action_device_id INTEGER, action TEXT)");
	db.run("CREATE TABLE IF NOT EXISTS groups (id INTEGER PRIMARY KEY, name TEXT)");
    db.run("CREATE TABLE IF NOT EXISTS device_groups (device_id INTEGER, group_id INTEGER, PRIMARY KEY (device_id, group_id))");
			
    // Check if the users table is empty
    db.get("SELECT COUNT(*) AS count FROM users", (err, row) => {
        if (err) return console.error(err.message);
        if (row.count === 0) {
            // Insert sample users
            const users = [
                { username: 'Alice', role: 'Admin' },
                { username: 'Bob', role: 'Homeowner' },
                { username: 'Charlie', role: 'Technician' }
            ];
            const insertUser = db.prepare("INSERT INTO users (username, role) VALUES (?, ?)");
            users.forEach(user => {
                insertUser.run(user.username, user.role);
            });
            insertUser.finalize();
        }
    });
	
	db.get("SELECT COUNT(*) AS count FROM alerts", (err, row) => {
        if (err) return console.error(err.message);
        if (row.count === 0) {
            // Insert sample alerts
            const alerts = [
                { message: 'Motion detected in Living Room', status: 'unread' }, // Critical
                { message: 'Thermostat temperature adjusted', status: 'read' },  // Regular
                { message: 'Smoke detected in Kitchen', status: 'unread' },     // Critical
                { message: 'Device Battery Low: Door Lock', status: 'read' }    // Regular
            ];

            const insertAlert = db.prepare("INSERT INTO alerts (message, status) VALUES (?, ?)");
            alerts.forEach(alert => {
                insertAlert.run(alert.message, alert.status);
            });
            insertAlert.finalize();
        }
    });
	
});

// Sample Data for Activity Logs
const activityLogs = [
    { id: 1, user: 'Admin', action: 'Added a device', timestamp: '2024-12-17 10:00 AM' },
    { id: 2, user: 'Technician', action: 'Ran diagnostics', timestamp: '2024-12-17 10:15 AM' },
    { id: 3, user: 'Homeowner', action: 'Scheduled lights', timestamp: '2024-12-17 11:00 AM' }
];

// Sample Data for Energy Analytics
const energyData = [
    { device: 'Living Room Light', consumption: '10 kWh' },
    { device: 'Thermostat', consumption: '25 kWh' },
    { device: 'Kitchen Light', consumption: '8 kWh' }
];

// Home route (Dashboard)
app.get('/', (req, res) => {
    res.render('dashboard');
});

app.get('/devices', (req, res) => {
    db.all("SELECT * FROM devices", (err, devices) => {
        if (err) console.error(err);

        // Fetch groups
        db.all("SELECT * FROM groups", (err, groups) => {
            if (err) console.error(err);

            res.render('devices', { devices: devices, groups: groups });
        });
    });
});

app.post('/add_group', (req, res) => {
    const { group_name } = req.body;
    db.run("INSERT INTO groups (name) VALUES (?)", [group_name], (err) => {
        if (err) console.error(err);
        res.redirect('/devices');
    });
});


app.post('/assign_device_to_group', (req, res) => {
    const { group_id, device_id } = req.body;
    db.run("INSERT OR IGNORE INTO device_groups (device_id, group_id) VALUES (?, ?)", [device_id, group_id], (err) => {
        if (err) console.error(err);
        res.redirect('/devices');
    });
});



// Add device route
app.post('/add_device', (req, res) => {
    const { name, type } = req.body;
    db.run("INSERT INTO devices (name, type) VALUES (?, ?)", [name, type], (err) => {
        if (err) console.error(err);
        res.redirect('/devices');
    });
});

// Toggle device status
app.post('/toggle_device/:id', (req, res) => {
    const deviceId = req.params.id;
    db.get("SELECT status FROM devices WHERE id = ?", [deviceId], (err, row) => {
        if (err) console.error(err);
        const newStatus = row.status === 'on' ? 'off' : 'on';
        db.run("UPDATE devices SET status = ? WHERE id = ?", [newStatus, deviceId], (err) => {
            if (err) console.error(err);
            res.redirect('/devices');
        });
    });
});

// Roles page
app.get('/roles', (req, res) => {
    db.all("SELECT * FROM users", (err, rows) => {
        if (err) console.error(err);
        res.render('roles', { users: rows });
    });
});

// Modify user role
app.post('/modify_role/:id', (req, res) => {
    const userId = req.params.id;
    const newRole = req.body.role;
    db.run("UPDATE users SET role = ? WHERE id = ?", [newRole, userId], (err) => {
        if (err) console.error(err);
        res.redirect('/roles');
    });
});

// Add automation rule
app.post('/add_automation_rule', (req, res) => {
    const { trigger_device, action_device, action } = req.body;
    db.run(
        `INSERT INTO automation_rules (trigger_device_id, action_device_id, action) 
         VALUES (?, ?, ?)`,
        [trigger_device, action_device, action],
        (err) => {
            if (err) {
                console.error(err.message);
                res.status(500).send("Error adding automation rule");
            } else {
                res.redirect('/schedules');
            }
        }
    );
});

// Retrieve and display automation rules
app.get('/schedules', (req, res) => {
    db.all(`SELECT schedules.id, devices.name AS device_name, schedules.action, schedules.schedule_time 
            FROM schedules
            JOIN devices ON schedules.device_id = devices.id`, 
    (err, schedules) => {
        if (err) console.error(err);

        db.all("SELECT * FROM devices", (err, devices) => {
            if (err) console.error(err);

            // Retrieve automation rules
            db.all(`SELECT r.id, d1.name AS trigger_device, d2.name AS action_device, r.action 
                    FROM automation_rules r
                    JOIN devices d1 ON r.trigger_device_id = d1.id
                    JOIN devices d2 ON r.action_device_id = d2.id`,
            (err, rules) => {
                if (err) console.error(err);
                res.render('schedules', { schedules: schedules, devices: devices, rules: rules });
            });
        });
    });
});


// Add schedule
app.post('/add_schedule', (req, res) => {
    const { device_id, action, schedule_time } = req.body;
    db.run("INSERT INTO schedules (device_id, action, schedule_time) VALUES (?, ?, ?)", [device_id, action, schedule_time], (err) => {
        if (err) console.error(err);
        res.redirect('/schedules');
    });
});

// Diagnostics page
app.get('/diagnostics', (req, res) => {
    db.all("SELECT * FROM devices", (err, rows) => {
        if (err) console.error(err);
        res.render('diagnostics', { devices: rows });
    });
});

// Run diagnostics
app.post('/run_diagnostics/:id', (req, res) => {
    const deviceId = req.params.id;
    const health = Math.random() > 0.5 ? 'healthy' : 'issue';
    db.run("UPDATE devices SET status = ? WHERE id = ?", [health, deviceId], (err) => {
        if (err) console.error(err);
        res.redirect('/diagnostics');
    });
});

// Alerts page
app.get('/alerts', (req, res) => {
    // Fetch all alerts
    db.all("SELECT * FROM alerts", (err, alerts) => {
        if (err) {
            console.error(err);
            return res.status(500).send("Error retrieving alerts");
        }

        // Filter critical alerts (status === 'unread')
        const critical_alerts = alerts.filter(alert => alert.status === 'unread');

        // Render alerts and pass both all alerts and critical alerts
        res.render('alerts', { alerts: alerts, critical_alerts: critical_alerts });
    });
});


// Acknowledge alert
app.post('/acknowledge_alert/:id', (req, res) => {
    const alertId = req.params.id;
    db.run("UPDATE alerts SET status = 'read' WHERE id = ?", [alertId], (err) => {
        if (err) console.error(err);
        res.redirect('/alerts');
    });
});

// Route for Activity Logs Page
app.get('/activity_logs', (req, res) => {
    res.render('activity_logs', { logs: activityLogs });
});

// Route for Energy Analytics Page
app.get('/analytics', (req, res) => {
    res.render('analytics', { energyData });
});

// Start the server
const PORT = 3000;
app.listen(PORT, () => {
    console.log(`Server running at http://localhost:${PORT}`);
});
