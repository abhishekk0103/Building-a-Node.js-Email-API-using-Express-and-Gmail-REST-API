// // server.js File
// const express = require("express"); 

// const app = express();

// const port = 8000; 

// app.listen(port, function (err) {
//   if (err) {
//     console.log("Error while starting server");
//   } else {
//     console.log("Server has been started at " + port);
//   }
// });

// app.get('/', function (req, res) {
// 	res.send('we are at the root route of our server');
// })

require('dotenv').config();
const express = require('express');
const axios = require('axios');
const fs = require('fs');
const path = require('path');
const bodyParser = require('body-parser');
const qs = require('qs');
const {google} = require('googleapis')

const app = express();
app.use(bodyParser.json());


const { CLIENT_ID, CLIENT_SECRET, REDIRECT_URI, PORT, TOKEN_PATH } = process.env;

//auth initiate
app.get('/auth/initiate', (req, res) => {
    // const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?client_id=${CLIENT_ID}&redirect_uri=${REDIRECT_URI}&response_type=code&scope=https://www.googleapis.com/auth/gmail.send&access_type=offline&prompt=consent`;
    // res.redirect(authUrl);
	// window.alert("loggedin");
	// console.log("loggedin")
	
		try {
		  const oauth2Client = new google.auth.OAuth2(
			process.env.CLIENT_ID,
			process.env.CLIENT_SECRET,
			process.env.REDIRECT_URI
		  );
	  
		  // generate a URL that asks permissions for Gmail scopes
		  const scopes = ["https://www.googleapis.com/auth/gmail.send"];
	  
		  const url = oauth2Client.generateAuthUrl({
			access_type: "offline", // gets refresh_token
			scope: scopes,
		  });
	  
		  return res.redirect(url);
		} catch (err) {
		  console.log(err);
		  return res.status(401).json({ message: "Invalid credentials" });
		}

});
// 1//04cchxPSYAzEgCgYIARAAGAQSNwF-L9IrQ2F1wEhLMZcsxIukCB0wg4QwkbSx54_QYXGCFNo1bTRJ1Ei_0H5ffJ8_n1kQRQnms6U
//auth callback
app.get('/auth/callback', async (req, res) => {
    const { code } = req.query;

    try {
		// const {code} = 
        const tokenResponse = await axios.post('https://oauth2.googleapis.com/token', qs.stringify({
			code: code,
            client_id: CLIENT_ID,
            client_secret: CLIENT_SECRET,
            redirect_uri: REDIRECT_URI,
            grant_type: 'authorization_code',
        }));
		// const {code} = code
        const tokens = tokenResponse.data;
        fs.writeFileSync(path.resolve(__dirname, TOKEN_PATH), JSON.stringify(tokens, null, 2));
        res.send('OAuth2 Token acquired and stored.');
    } catch (error) {
        console.error(error);
        res.status(500).send('Failed to exchange code for tokens.');
    }
});

// send email
app.post('/email/send', async (req, res) => {
    const { to, subject, body } = req.body;

    if (!to || !subject || !body) {
        return res.status(400).send('Missing fields in request body.');
    }

    let tokens;
    try {
        tokens = JSON.parse(fs.readFileSync(TOKEN_PATH));
    } catch (error) {
        return res.status(500).send('Failed to read tokens.');
    }

    try {
        const { access_token, refresh_token, expires_in } = tokens;
        let accessToken = access_token;

       
        if (!accessToken || Date.now() > tokens.expiry_date) {
            const tokenResponse = await axios.post('https://oauth2.googleapis.com/token', qs.stringify({
                client_id: CLIENT_ID,
                client_secret: CLIENT_SECRET,
                refresh_token: refresh_token,
                grant_type: 'refresh_token',
            }));

            const newTokens = tokenResponse.data;
            tokens.access_token = newTokens.access_token;
            tokens.expiry_date = Date.now() + newTokens.expires_in * 1000;
            fs.writeFileSync(TOKEN_PATH, JSON.stringify(tokens, null, 2));
            accessToken = newTokens.access_token;
        }

        
        const message = `To: ${to}\r\nSubject: ${subject}\r\n\r\n${body}`;
        const encodedMessage = Buffer.from(message)
            .toString('base64')
            .replace(/\+/g, '-')
            .replace(/\//g, '_')
            .replace(/=+$/, '');


        
        const gmailResponse = await axios.post(
            'https://gmail.googleapis.com/gmail/v1/users/me/messages/send',
            { raw: encodedMessage },
            {
                headers: {
                    Authorization: `Bearer ${accessToken}`,
                    'Content-Type': 'application/json',
                },
            }
        );

        res.json({ success: true, messageId: gmailResponse.data.id });
    } catch (error) {
        console.error(error.response ? error.response.data : error.message);
        res.status(500).send('Failed to send email.');
    }
});

// Start the server
app.listen(PORT, () => {
    console.log(`Server is running on http://localhost:${PORT}`);
});
