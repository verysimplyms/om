var express = require('express');
var path = require('path');
var favicon = require('serve-favicon');
var logger = require('morgan');
var cookieParser = require('cookie-parser');
var bodyParser = require('body-parser');
//var https = require('https');
var http = require('http');
var fs = require('fs');
var mongoose = require('mongoose');

//mongoose.connect('mongodb://localhost/om');
mongoose.connect(OPENSHIFT_MONGODB_DB_URL+'om');
1
var Schema = mongoose.Schema;
var banStatusSchema = new Schema({
    ip: {type: String, index: {unique: true, required: true}},
	ids: [String],
	reportCount: Number,
	banned: Date,
	banStatus: Boolean
});

var banStatusModel = mongoose.model('banStatusModel', banStatusSchema);

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
var io = require('socket.io')(serverUnsecure);
//var io = require('socket.io')(server);
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
var portUnsecure = 80;
server.listen(port);
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

var addToDB = function(doc) {

	if(doc.ids.length > 3) {
	temp = doc.ids;
	docs.ids = [];
	doc.ids[0] = temp[temp.length];
	doc.ids[1] = temp[temp.length-1];
	doc.ids[2] = temp[temp.length-2];
	}
	
	doc.ids.push(socket.id);
	console.log(doc.ids);
	doc.save(function(err, doc) {
		if (err) throw err;
	})
}

io.on('connection', function(socket) {
	socket.on('login', function (data){
		var socketIPAddr = socket.handshake.address || socket.client.conn.remoteAddress;
		
		if(typeof IPbySocketId[socket.id] == 'undefined') {
			IPbySocketId[socket.id] = socketIPAddr;
			
			banStatusModel.findOne({'ip': socketIPAddr}, function(err, doc) {
				if(doc != null) {
					if(doc.banStatus == true) {
						if(doc.banned > Date.now()) {
							socket.emit('banned', {untilDate: (doc.banned)});
							socket.disconnect();
						} else if(doc.banned != 0 && doc.banned <= Date.now()){
							doc.reportCount = 0;
							doc.banned = 0;
							doc.banStatus = false;
							
							addToDB(doc);
						}
					} else {
						addToDB(doc);
					}
					
				} else {
					new banStatusModel({
						ip: socketIPAddr,
						ids: socket.id,
						reportCount: 0,
						banned: 0,
						banStatus: false
					}).save(function(err, doc){
						if (err) throw err;
					})
				}
			})
			}
		
		

		socket.on('report', function(data) {		
			banStatusModel.findOne({'ids': data})
							.select('ip ids reportCount banned banStatus')
							.exec(function(err, doc){
								if(doc != null) {
									doc.reportCount++;
									if(doc.reportCount >= 5) {
										doc.banned = Date.now() + (604800 * 1000);
										doc.banStatus = true;
									}
										doc.save();
									}	
								})
		});
		
		if(data.username.length <= 15 && data.interest.length <= 15) {
			if(typeof socket.interest == 'undefined') {
				socket.interest = '';
			}

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