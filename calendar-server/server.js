/* eslint-env es6 */

const fs = require('fs')
const { join } = require('path')
const express = require('express')
const bodyParser = require('body-parser');
const { getSdk } = require('balena-sdk');
// const favicon = require('serve-favicon')
const app = express()
const PORT = 80
const calendarId = 'primary';

const sdk = getSdk({
  // only required if the device is not running on balena-cloud.com
  apiUrl: process.env.BALENA_API_URL
});

// app.use(favicon(join(__dirname, 'public', 'favicon.ico')))
app.set('views', join(__dirname, 'views'))

app.engine('html', require('ejs').renderFile);
app.set('view engine', 'html');

// Enable the public directory for resource files
app.use('/public', express.static(
  join(__dirname, 'public')
))

const JSON_REGEXP =
  /^application\/(([\w!//\$%&\*`\-\.\^~]*\+)?json|csp-report)/i;
const isJson = (req) => {
  const contentType = req.headers['content-type'];
  if (contentType == null) {
    return false;
  }
  return JSON_REGEXP.test(contentType);
};
// app.use(bodyParser.json({ type: isJson, limit: '512kb' }));
const jsonParser = bodyParser.json({ type: isJson, limit: '512kb' })

// reply to request with the hello world html file
app.get('/', function (req, res) {
  res.render('index', {
    GOOGLE_API_KEY: process.env.GOOGLE_API_KEY,
    GOOGLE_CLIENT_ID: process.env.GOOGLE_CLIENT_ID,
  });
})

app.post('/', jsonParser, (req, res) => {
  const authToken = req.body.authToken;
  if (!authToken) {
    res.send('Missing Token');
    return;
  }
  console.log('authToken ', authToken);
  fs.writeFileSync('/usr/app/auth-data/authToken', authToken);
  init();
  res.send('OK');
})

// start a server on port 80 and log its start to our console
app.listen(PORT, () => {
  console.log(`App listening on port ${PORT}`)
})

const init = () => {
  const authToken = fs.readFileSync('/usr/app/auth-data/authToken', 'utf8');
  if (!authToken || !authToken.length) {
    return;
  }
  sdk.request.send({
    method: 'GET',
    url: `/calendar/v3/calendars/${calendarId}/events?futureevents=true&orderby=starttime&sortorder=ascending&maxResults=10&timeMin=${(new Date()).toISOString()}&showDeleted=false`,
    baseUrl: 'https://www.googleapis.com',
    sendToken: false,
    headers: {
      Authorization: `Bearer ${authToken}`
    }
  }).then((data) => {
    const events = data.body;
    console.log('EVENTS RESPONE : ', events);
    // fs.writeFileSync('/usr/app/calendar-data/events.json', JSON.stringify(events));
    restartSupervisor();
  });
}

const restartSupervisor = () => {
  sdk.request.send({
    method: 'POST',
    url: `/v2/applications/${process.env.BALENA_APP_ID}/restart-service`,
    baseUrl: process.env.BALENA_SUPERVISOR_ADDRESS,
    apiKey: process.env.BALENA_SUPERVISOR_API_KEY,
    body: {
      serviceName: 'inkyshot'
    },
  });
}

init();