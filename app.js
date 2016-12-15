var express = require('express');
var path = require('path');
var favicon = require('serve-favicon');
var logger = require('morgan');
var cookieParser = require('cookie-parser');
var bodyParser = require('body-parser');
//var https = require('https');
var http = require('http');
var fs = require('fs');

/*
var options = {
    key: fs.readFileSync('./invalidCerts/57926271-192.168.0.3.key'),
    cert: fs.readFileSync('./invalidCerts/57926271-192.168.0.3.cert'),
}
*/

var routes = require('./routes/index');
var users = require('./routes/users');

var app = express();
//var server = https.createServer(options, app);
var serverUnsecure = http.createServer(app);
var io = require('socket.io')(serverUnsecure, {'pingInterval': 2000, 'pingTimeout': 5000});
var p2p = require('socket.io-p2p-server').Server

function redirectSec(req, res, next) {
  if (req.headers['x-forwarded-proto'] == 'http') {
      res.redirect('https://' + req.headers.host + req.path);
  } else {
      return next();
  }
}

app.all('*', redirectSec);

var port = process.env.OPENSHIFT_NODEJS_PORT || 8080;
var ipaddress = process.env.OPENSHIFT_NODEJS_IP || "localhost";
//var portUnsecure = 80;
//server.listen(port);
serverUnsecure.listen(port, ipaddress);
// view engine setup
app.set('views', path.join(__dirname, 'views'));
app.set('view engine', 'hjs');

// uncomment after placing your favicon in /public
//app.use(favicon(path.join(__dirname, 'public', 'favicon.ico')));
app.use(logger('dev'));
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: false }));
app.use(cookieParser());
app.use(express.static(path.join(__dirname, 'public')));


app.use('/', routes);
app.use('/users', users);

// catch 404 and forward to error handler
app.use(function(req, res, next) {
  var err = new Error('Not Found');
  err.status = 404;
  next(err);
});

//random pairing

var quene = {};    // list of sockets waiting for peers
var rooms = {};    // map socket.id => room
var names = {};    // map socket.id => name
var allUsers = {}; // map socket.id => socket
var IPbySocketId = {};
var socketReports = {};

var findPeerForLoneSocket = function(socket) {
	if(typeof quene[socket.interest] != 'undefined') {
		if(quene[socket.interest]) {
			if(quene[socket.interest].length > 0) {
				var peer = quene[socket.interest].pop()
				var roomName = socket.id + '@' + peer.id;
				
				if(peer.id != socket.id) {
										
					peer.join(roomName);
					socket.join(roomName);

					p2p(socket, null, roomName)
					p2p(peer, null, roomName)
					
					rooms[peer.id] = roomName;
					rooms[socket.id] = roomName;
				
					peer.emit('chat start', {name: names[socket.id], 'room': roomName, partnerId: socket.id});
					socket.emit('chat start', {name: names[peer.id], 'room': roomName, partnerId: peer.id});
					socket.currentlySearching = false;
					peer.currentlySearching = false;
					console.log('Matched:  ' + names[socket.id] + ' and ' + names[peer.id]);
				} else {
					
					if(!socket.currentlySearching) {
						quene[socket.interest].push(socket);
						socket.currentlySearching = true;
						
						console.log(quene[socket.interest][0].id + ' was added to quene')
						console.log("In quene: " + quene[socket.interest].length)
					}
				}
			} else {
				if(!socket.currentlySearching) {
					quene[socket.interest].push(socket);
					socket.currentlySearching = true;
					
					console.log(quene[socket.interest][0].id + ' was added to quene')
					console.log("In quene: " + quene[socket.interest].length)
				}				
			}
		}
	}
	
}

io.on('connection', function(socket) {

	socket.on('login', function (data){
		var socketIPAddr = socket.handshake.address || socket.client.conn.remoteAddress;
		
		if(typeof IPbySocketId[socket.id] == 'undefined') {
			IPbySocketId[socket.id] = socketIPAddr;
		}
				
		if(typeof socketReports[IPbySocketId[socket.id]] == 'undefined') {
			socketReports[IPbySocketId[socket.id]] = {};
			socketReports[IPbySocketId[socket.id]].reportCount = 0;
			socketReports[IPbySocketId[socket.id]].banned = 0;
			socketReports[IPbySocketId[socket.id]].bannedStatus = false;
		}
		
		if(socketReports[IPbySocketId[socket.id]].banned > Date.now()) {
			if(socketReports[IPbySocketId[socket.id]].banned != 0) {
				console.log(socketReports[IPbySocketId[socket.id]].banned)
				socket.emit('banned', {untilDate: (socketReports[IPbySocketId[socket.id]].banned)});
				socket.disconnect();
			}
		} else if (socketReports[IPbySocketId[socket.id]].banned <= Date.now()) {
			if(socketReports[IPbySocketId[socket.id]].banned != 0) {
				socketReports[IPbySocketId[socket.id]].reportCount = 0;
				socketReports[IPbySocketId[socket.id]].banned = 0;
				socketReports[IPbySocketId[socket.id]].bannedStatus = false;
			}
		}		
		
		socket.on('report', function(data) {		
			socketReports[IPbySocketId[data]].reportCount++
			
			if(socketReports[IPbySocketId[data]].reportCount >= 5) {
				socketReports[IPbySocketId[data]].banned = Date.now() + (604800 * 1000);
				socketReports[IPbySocketId[data]].bannedStatus = true;
			}
		});
		
		if(data.username.length <= 15 && data.interest.length <= 15 && !socketReports[IPbySocketId[socket.id]].bannedStatus) {
			if(typeof socket.previousInterest == 'undefined' || typeof socket.interest == 'undefined') {
				socket.previousInterest = '';
				socket.interest = '';
			}
			
			socket.previousInterest = socket.interest;
			names[socket.id] = data.username.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
			console.log('User: '+ names[socket.id] + ' - ' + socket.id + ' connected');		
			socket.interest = data.interest.toLowerCase().replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(' ', '');

			if(typeof quene[socket.interest] == 'undefined') {
				quene[socket.interest] = [];
			}
			
			allUsers[socket.id] = socket;
			findPeerForLoneSocket(socket)
		} else {
			socket.emit('dataTooLong');
		}
			
	});
	
	socket.on('leave room', function(){
		var room = rooms[socket.id];	
		socket.broadcast.to(room).emit('chat end');
		
		if(typeof room != 'undefined' && room != '') {
			var peerID = room.split('@');
			peerID = peerID[0] === socket.id ? peerID[1] : peerID[0];
			console.log(socket.id + ' has left the room');
		}
	});
	
	socket.on('disconnect', function(){
		if(typeof rooms[socket.id] != 'undefined') { var room = rooms[socket.id]; }
		socket.broadcast.to(rooms[socket.id]).emit('chat end');
		
		if(typeof rooms[socket.id] == 'undefined') {
			if(typeof quene[socket.interest] != 'undefined') {
				var index = quene[socket.interest].indexOf(socket);
				console.log(index);
				if(index != -1){
					quene[socket.interest].splice(index, 1);
					console.log('Removed from quene');
				}
			}
		} else {
			var peerID = room.split('@');
			peerID = peerID[0] === socket.id ? peerID[1] : peerID[0];
			console.log('User: ' + names[socket.id] + ' left room ' + rooms[socket.id]);
			rooms[socket.id] = void 0;
		}
	});
	
	socket.on('error', function(err) {
		socket.disconnect();
		console.log('Error forced socket to be disconnected: ' + err);
	});
});

// error handlers

// development error handler
// will print stacktrace
if (app.get('env') === 'development') {
  app.use(function(err, req, res, next) {
    res.status(err.status || 500);
    res.render('error', {
      message: err.message,
      error: err
    });
  });
}

// production error handler
// no stacktraces leaked to user
app.use(function(err, req, res, next) {
  res.status(err.status || 500);
  res.render('error', {
    message: err.message,
    error: {}
  });
});


module.exports = app;
console.log('Server has begun running on ports:  ' + port); //+ ' and ' + portUnsecure); 