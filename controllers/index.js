var express = require('express');
var request = require('request'); // "Request" library
var querystring = require('querystring');
var cookieParser = require('cookie-parser');
var _ = require('underscore');

var config = require('../config.js');
var spotify = require('../middlewares/spotify.js');
var echonest = require('../middlewares/echonest.js');
var util = require('../helpers/util');
var router = express.Router();
var client_id = config.SPOTIFY_CLIENT_ID; // Your client id
var client_secret = config.SPOTFIY_CLIENT_SECRET; // Your client secret
var redirect_uri = 'http://localhost:8888/player/modifyPlaylist'; // Your redirect uri

var stateKey = 'spotify_auth_state';
var tokenKey = 'OAuth';
var refreshToken = 'refreshToken';
var userId = 'userId';

router.get('/login', function(req, res) {

  var state = util.generateRandomString(16);
  res.cookie(stateKey, state);

  // application requests authorization
  var scope = 'user-read-private user-read-email';
  res.redirect('https://accounts.spotify.com/authorize?' +
    querystring.stringify({
      response_type: 'code',
      client_id: client_id,
      scope: scope,
      redirect_uri: redirect_uri,
      state: state
    })
  );
});

router.get('/player/modifyPlaylist', function(req, res) {

  // application requests refresh and access tokens
  // after checking the state parameter

  var code = req.query.code || null;
  var state = req.query.state || null;
  var storedState = req.cookies ? req.cookies[stateKey] : null;

  if (state === null || state !== storedState) {
    res.redirect('/#' +
      querystring.stringify({
        error: 'state_mismatch'
      }));
  }
  res.clearCookie(stateKey);
  spotify.getToken(code, redirect_uri)
  .then(function (body) {
    var access_token = body.access_token,
        refresh_token = body.refresh_token,
        expires_in = body.expires_in;
    res.cookie(tokenKey, access_token);
    res.cookie(refreshToken, refresh_token);
    return spotify.getUser(access_token);
  })
  .then(function(user){
    res.cookie(userId,user.id);
    res.redirect('/#/player/modifyPlaylist');
  });
});

router.get('/refresh_token', function(req, res) {

  // requesting access token from refresh token
  var refresh_token = req.cookies[refreshToken];
  spotify.refreshToken(refresh_token)
  .then(function (body) {
    var access_token = body.access_token;
    res.send({
      'access_token': access_token
    });
  });
});

/**
* route for getting playlist based on user id
*/
router.get('/user/playlists', function(req,res) {
  var access_token = req.cookies[tokenKey];
  var target_id = req.cookies[userId];

  spotify.getUserPlaylist(target_id, access_token)
  .then(function(playListArr) {
    res.json(playListArr);
  });
});

/**
* route for getting songs/tracks from playlist
*/
router.get('/user/playlist/:playlistId', function(req, res) {
  var access_token = req.cookies[tokenKey];
  var target_userId = req.cookies[userId];
  //target_userId = 'rickyhendrawan';
  var target_playlistId = req.params.playlistId;

  spotify.getPlaylistTracks(target_userId, target_playlistId, access_token)
  .then(function(playlist) {
    var songUris = playlist.items.map(function(item) {
      return item.track.uri;
    });
    echonest.getTrackData(songUris)
    .then(function(songs) {
      res.json(_.sortBy(songs, function(song) {
        return song.audio_summary.danceability;
      }));
    });
  });
});

module.exports = router;
