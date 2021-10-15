/* eslint-env es6 */

const fs = require('fs');
const { join } = require('path');
const express = require('express');
const bodyParser = require('body-parser');
const { getSdk } = require('balena-sdk');
const favicon = require('serve-favicon');
const app = express();
const PORT = 80;
const POLL_INTERVAL = process.env.EVENTS_POLL || 600000; // 10 minutes by default
const calendarId = 'primary';
const AUTH_TOKEN_FS_PATH = '/usr/app/auth-data/authToken';
const CALENDAR_EVENTS_FS_PATH = '/usr/app/calendar-data/events.json';

const sdk = getSdk({
	// only required if the device is not running on balena-cloud.com
	apiUrl: process.env.BALENA_API_URL,
});

app.use(favicon(join(__dirname, 'public', 'favicon.ico')));
app.set('views', join(__dirname, 'views'));

app.engine('html', require('ejs').renderFile);
app.set('view engine', 'html');

// Enable the public directory for resource files
app.use('/public', express.static(join(__dirname, 'public')));

const JSON_REGEXP = /^application\/(([\w!//\$%&\*`\-\.\^~]*\+)?json|csp-report)/i;
const isJson = req => {
	const contentType = req.headers['content-type'];
	if (contentType == null) {
		return false;
	}
	return JSON_REGEXP.test(contentType);
};
// app.use(bodyParser.json({ type: isJson, limit: '512kb' }));
const jsonParser = bodyParser.json({ type: isJson, limit: '512kb' });

// reply to request with the hello world html file
app.get('/', function(req, res) {
	res.render('index', {
		GOOGLE_API_KEY: process.env.GOOGLE_API_KEY,
		GOOGLE_CLIENT_ID: process.env.GOOGLE_CLIENT_ID,
	});
});

app.post('/', jsonParser, (req, res) => {
	const authToken = req.body.authToken;
	if (!authToken) {
		res.send('Missing Token');
		return;
	}
	console.log('authToken ', authToken);
	fs.writeFileSync(AUTH_TOKEN_FS_PATH, authToken);
	updateEvents();
	res.send('OK');
});

// start a server on port 80 and log its start to our console
app.listen(PORT, () => {
	console.log(`App listening on port ${PORT}`);
});

const updateEvents = async () => {
	const authToken =
		fs.existsSync(AUTH_TOKEN_FS_PATH) &&
		fs.readFileSync(AUTH_TOKEN_FS_PATH, 'utf8');
	if (!authToken || !authToken.length) {
		fs.writeFileSync(
			CALENDAR_EVENTS_FS_PATH,
			'Please login into your Google account first from the device URL',
		);
	} else {
		try {
			const { body: events } = await sdk.request.send({
				method: 'GET',
				// url: `/calendar/v3/calendars/${calendarId}/events?futureevents=true&orderby=starttime&sortorder=ascending&maxresults=10&timeMin=${new Date().toISOString()}&showdeleted=false`,
				url: `/calendar/v3/calendars/${calendarId}/events?maxResults=10&orderBy=startTime&timeMin=${new Date().toISOString()}&singleEvents=true`,
				baseUrl: 'https://www.googleapis.com',
				sendToken: false,
				headers: {
					Authorization: `Bearer ${authToken}`,
				},
			});
			console.log('EVENTS RESPONE : ', events.items?.length, events.items?.slice?.(0,2), '...');
			events.items.forEach((item) => {
				delete item.attendees;
			});
			const now = new Date();
			events.items = events.items.filter(
				({ start }) => new Date(start.dateTime ?? start.date) >= now,
			);
			const storedEvents = fs.existsSync(CALENDAR_EVENTS_FS_PATH)
				? fs.readFileSync(CALENDAR_EVENTS_FS_PATH, 'utf-8')
				: '';
			if (JSON.stringify(events) === storedEvents) {
				return;
			}
			fs.writeFileSync(CALENDAR_EVENTS_FS_PATH, JSON.stringify(events));
			try {
				await restartDisplayService();
			} catch {
				console.log('Restarting the display service failed');
			}
		} catch (err) {
			console.log(err)
			if (err.statusCode === 401) {
				fs.writeFileSync(
					CALENDAR_EVENTS_FS_PATH,
					'Please login into your Google account again from the device URL',
				);
			}
		}
	}
};

const restartDisplayService = async () => {
	await sdk.request.send({
		method: 'POST',
		url: `/v2/applications/${process.env.BALENA_APP_ID}/restart-service`,
		baseUrl: process.env.BALENA_SUPERVISOR_ADDRESS,
		apiKey: process.env.BALENA_SUPERVISOR_API_KEY,
		body: {
			serviceName: 'inkyshot',
		},
	});
};

const poll = ({ fn, interval = POLL_INTERVAL, maxAttempts }) => {
	let attempts = 0;

	const executePoll = async (resolve, reject) => {
		const result = await fn();
		attempts++;

		if (maxAttempts && attempts === maxAttempts) {
			return reject(new Error('Exceeded max attempts'));
		} else {
			setTimeout(executePoll, interval, resolve, reject);
		}
	};

	return new Promise(executePoll);
};

poll({ fn: updateEvents });
