/**
 * This is an example of a basic node.js script that performs
 * the Authorization Code oAuth2 flow to authenticate against
 * the Spotify Accounts.
 *
 * For more information, read
 * https://developer.spotify.com/web-api/authorization-guide/#authorization_code_flow
 */

var express = require("express"); // Express web server framework
var request = require("request"); // "Request" library
const axios = require("axios");
var cors = require("cors");
var querystring = require("querystring");
var cookieParser = require("cookie-parser");

var client_id = "4622c4fb20e642ea947909d93da3690b"; // Your client id
var client_secret = "16b8572a6967425593bbb8992b4c0e01"; // Your secret
// local dev uri
// var redirect_uri = "http://localhost:8888/callback"; // Your redirect uri
var redirect_uri = "https://hottest100helper.herokuapp.com/callback"; // Your redirect uri

const PORT = process.env.PORT || 8888;

/**
 * Generates a random string containing numbers and letters
 * @param  {number} length The length of the string
 * @return {string} The generated string
 */
var generateRandomString = function(length) {
  var text = "";
  var possible =
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";

  for (var i = 0; i < length; i++) {
    text += possible.charAt(Math.floor(Math.random() * possible.length));
  }
  return text;
};

var stateKey = "spotify_auth_state";

var app = express();

app
  .use(express.static(__dirname + "/public"))
  .use(cors())
  .use(cookieParser());

app.get("/login", function(req, res) {
  var state = generateRandomString(16);
  res.cookie(stateKey, state);

  // your application requests authorization
  var scope =
    "user-read-private user-read-email user-library-read playlist-modify-public playlist-modify-private user-top-read";
  res.redirect(
    "https://accounts.spotify.com/authorize?" +
      querystring.stringify({
        response_type: "code",
        client_id: client_id,
        scope: scope,
        redirect_uri: redirect_uri,
        state: state
      })
  );
});

app.get("/callback", async function(req, res) {
  // your application requests refresh and access tokens
  // after checking the state parameter

  var code = req.query.code || null;
  var state = req.query.state || null;
  var storedState = req.cookies ? req.cookies[stateKey] : null;

  if (state === null || state !== storedState) {
    res.redirect(
      "/#" +
        querystring.stringify({
          error: "state_mismatch"
        })
    );
  } else {
    res.clearCookie(stateKey);
    var authOptions = {
      url: "https://accounts.spotify.com/api/token",
      form: {
        code: code,
        redirect_uri: redirect_uri,
        grant_type: "authorization_code"
      },
      headers: {
        Authorization:
          "Basic " +
          new Buffer(client_id + ":" + client_secret).toString("base64")
      },
      json: true
    };

    request.post(authOptions, async function(error, response, body) {
      if (!error && response.statusCode === 200) {
        var access_token = body.access_token,
          refresh_token = body.refresh_token;

        console.log(body);

        let userData;
        try {
          let response = await axios.get("https://api.spotify.com/v1/me", {
            headers: { Authorization: "Bearer " + access_token }
          });
          userData = response.data;
        } catch (error) {
          console.error("couldn't get user data: " + error);
        }

        // console.log(userData);

        // use the access token to access the Spotify Web API
        let tracksBody = await axios.get(
          "https://api.spotify.com/v1/me/tracks?" +
            querystring.stringify({
              limit: 50
            }),
          { headers: { Authorization: "Bearer " + access_token } }
        );
        let tracks = tracksBody.data.items;
        var twentyEighteen = new Date("2018-12-31T00:00:00Z");
        while (new Date(tracksBody.data.items[0].added_at) > twentyEighteen) {
          if (tracksBody.body.next === null) {
            break;
          }
          tracksBody = await axios.get(tracksBody.data.next, {
            headers: { Authorization: "Bearer " + access_token }
          });
          tracks = tracks.concat(tracksBody.data.items);
        }

        tracks = tracks.filter(
          track =>
            new Date(track.track.album.release_date) >
            new Date("2018-12-31T00:00:00Z")
        );

        console.log(tracks.length);
        let trackUris = tracks.map(track => track.track.uri);

        /*
        Spotify only gives you the top 50 tracks for free, so this is kinda pointless

        // get most listened to songs
        console.log("getting top trackjs...");
        let topTracks = [];
        let topTracksURL =
          "https://api.spotify.com/v1/me/top/tracks?time_range=long_term";
        try {
          while (topTracks.length < 500) {
            const response = await axios.get(topTracksURL, {
              headers: { Authorization: "Bearer " + access_token }
            });

            console.log(response.data.items);
            topTracks = topTracks.concat(response.data.items);
            topTracksURL = response.data.next;
            console.log(topTracksURL);
          }
        } catch (error) {
          console.log(error);
        }

        console.log("top tracks:");
        console.log(topTracks);

        let topTrackUris = topTracks.map(track => track.uri);

        // filter TOPTRACKS on existance in addedSongs
        topTrackUris = topTrackUris.filter(track => trackUris.includes(track));
        

        // go through filtered topTracks and add anything from addedSongs that isn't already in there to the end
        let orderedNewSongs = topTracks.concat(
          trackUris.filter(track => !topTrackUris.includes(track))
        );
        */

        const createPlaylistURL = `https://api.spotify.com/v1/users/${userData.id}/playlists`;
        let playlistData;
        try {
          const response = await axios.post(
            createPlaylistURL,
            {
              name: "Hottest 100 2020 Shortlist"
            },
            { headers: { Authorization: "Bearer " + access_token } }
          );
          playlistData = response.data;
        } catch (error) {
          console.log(error);
        }

        console.log(playlistData);

        // playlist addition can only handle 100 tracks at a time
        const maxTracks = 100;
        const addTracksToPlaylistURL = `https://api.spotify.com/v1/playlists/${playlistData.id}/tracks`;
        while (trackUris.length > 0) {
          const uriSlice = trackUris.slice(0, maxTracks);
          try {
            const response = await axios.post(
              addTracksToPlaylistURL,
              { uris: uriSlice },
              { headers: { Authorization: "Bearer " + access_token } }
            );
            console.log(response.status);
          } catch (error) {
            console.log(error);
          }
          trackUris = trackUris.filter(track => !uriSlice.includes(track));
        }

        // we can also pass the token to the browser to make requests from there
        res.redirect(
          "/#" +
            querystring.stringify({
              access_token: access_token,
              refresh_token: refresh_token,
              playlist_url: playlistData.external_urls.spotify
            })
        );
      } else {
        res.redirect(
          "/#" +
            querystring.stringify({
              error: "invalid_token"
            })
        );
      }
    });
  }
});

app.get("/refresh_token", function(req, res) {
  // requesting access token from refresh token
  var refresh_token = req.query.refresh_token;
  var authOptions = {
    url: "https://accounts.spotify.com/api/token",
    headers: {
      Authorization:
        "Basic " +
        new Buffer(client_id + ":" + client_secret).toString("base64")
    },
    form: {
      grant_type: "refresh_token",
      refresh_token: refresh_token
    },
    json: true
  };

  request.post(authOptions, function(error, response, body) {
    if (!error && response.statusCode === 200) {
      var access_token = body.access_token;
      res.send({
        access_token: access_token
      });
    }
  });
});

console.log(`Listening on ${PORT}`);
app.listen(PORT);
