//browserify p2p.js -o ./public/javascripts/p2pfinished.js

var P2P = require('socket.io-p2p');
var io = require('socket.io-client');

var openpgp = window.openpgp; 
openpgp.initWorker({ path:'openpgp.worker.min.js' }) 

if(typeof localStorage.publicKey == 'undefined' || typeof localStorage.privateKey == 'undefined' || typeof localStorage.pass == 'undefined') {
	
	var cryptoArray = new Uint32Array(4);
	window.crypto.getRandomValues(cryptoArray);
	localStorage.pass = cryptoArray[2].toString()
	var options = {
		userIds: [{name: cryptoArray[3].toString(), email: cryptoArray[0] + '@' + cryptoArray[1] + '.' + 'com' }],
		numBits: 512,
		passphrase: localStorage.pass
	}

	openpgp.generateKey(options).then(function(key) {
		localStorage.setItem('privateKey', key.privateKeyArmored);
		localStorage.setItem('publicKey', key.publicKeyArmored);
	})	
}

navigator.getUserMedia = navigator.getUserMedia ||
                        navigator.webkitGetUserMedia;

if(navigator.getUserMedia) {
	navigator.getUserMedia({video: {width: 440, height: 330}, audio: true
		
	}, function(stream){
		main(stream);
		
	}, function(){
		main(false);
	})
} else if(navigator.mediaDevices.getUserMedia) {
	navigator.mediaDevices.getUserMedia({video: {width: 440, height: 330}, audio: true}).then(function(stream){
		main(stream);
	}).catch(function(err) {
		main(false);
	})
}

var main = function(stream){
	var inRoom = false;
	var username;
	var interest;
	var partnerId;
	var room = '';
	var text = document.getElementById('text');
	var socket = io('/');
	var opts = {autoUpgrade: false, numClients: 2, peerOpts: {trickle: false, stream: stream}};
	var p2p = new P2P(socket, opts)
	var peerPublicKey, encryptedMessage, decryptedMessage;
	var siteTitle = 'om';
	var banStatus = false;
	var messagesDiv = document.getElementById('messages');
	var firstSearch = true;
	
	var convertToEmoji = function()  {
		var input = document.getElementById('messages').innerHTML;
		var output = emojione.shortnameToImage(input);
		document.getElementById('messages').innerHTML = output;
	}
	
	convertToEmoji()
	
	var convertMixtapeMedia = function(matchMixtape) {
		if(matchMixtape) {
			if(matchMixtape[2] == 'webm') {
				document.getElementById('media').innerHTML = "<br /><video class='media' height = '100%' src ='https://my.mixtape.moe/" + matchMixtape[1] + '.' + matchMixtape[2] + "' controls></video>";
				document.getElementById('mixtapeContent').style.display = 'flex';
				document.getElementById('messages').style.height = '21%';
			} else if(matchMixtape[2] == 'png' || matchMixtape[2] == 'jpg' || matchMixtape[2] == 'gif') {
				document.getElementById('media').innerHTML = "<br /><a target='_blank' href='https://my.mixtape.moe/" + matchMixtape[1] + "." + matchMixtape[2] +"'><img class='media' width = '400' height= '300' src ='https://my.mixtape.moe/" + matchMixtape[1] + '.' + matchMixtape[2] + "' /></a>";
				document.getElementById('mixtapeContent').style.display = 'flex';
				document.getElementById('messages').style.height = '21%';
			} else if(matchMixtape[2] == 'mp3' || matchMixtape[2] == 'wav') {
				document.getElementById('media').innerHTML = "<br /><audio preload='none' src ='https://my.mixtape.moe/" + matchMixtape[1] + '.' + matchMixtape[2] + "' controls></audio>";
				document.getElementById('mixtapeContent').style.display = 'flex';
				document.getElementById('messages').style.height = '30%';
			}
			
			messagesDiv.innterHTML += " <a style='cursor:pointer' id='hideMedia'>(hide)</a>";
		}
		
		$("#messages").scrollTop($("#messages")[0].scrollHeight);
		convertToEmoji();
	}
	
	if(typeof stream != 'undefined') {
		if(stream != false) {
			var clientVideo = document.getElementById('client')
			clientVideo.src = window.URL.createObjectURL(stream);
			clientVideo.onloadedmetadata = function(e) {
				clientVideo.play();
			}
		}
	} else {
		stream = false;
	}
	
	var login = function() {
		
		username = document.getElementById('username').value
		interest = document.getElementById('interest').value
		
		if(inRoom == true || inRoom == false) {
			document.getElementById('username').disabled = inRoom;
			document.getElementById('interest').disabled = inRoom;
		}
		
		if(typeof username != 'undefined' && typeof interest != 'undefined') {
			if(username == '') {
				username = 'Anonymous';
			}
			
			socket.emit('login', {'username' : username, 'interest': interest});
			if(inRoom != 'searching') {
				if(interest != '') {		
					document.getElementById('messages').innerHTML = '<br>Searching for partner with interest in <b>' + interest + '</b>...';
					
				} else {
					document.getElementById('messages').innerHTML = '<br>Searching for partner...';
				}
			}	
			
			inRoom = 'searching';
			firstSearch = false;
		}
	}

	text.innerHTML = interest;
	
	p2p.on('banned', function(data) {
		var unbanDate = new Date(data.untilDate);		
		messagesDiv.innerHTML += '<b style="color:red;"><br>You have been banned due to being reported 5 times. You will be unbanned on <u>' + unbanDate.toString() + '<br /><br /></b></u>';
		banStatus = true;
	});
	
	p2p.on('dataTooLong', function() {
		messagesDiv.innerHTML += '<b style="color:red;"><br>One or more of your text fields is too long! You need to cut it. :joy: </b>';
		convertToEmoji()
	});
	
	p2p.on('floodDetection', function() {
		messagesDiv.innerHTML += '<b style="color:red;"><br>You\'re sending too many messages! You need to cut it. :joy:</b>'
		convertToEmoji()
	});
	
	p2p.on('connect', function (data) { 
		inRoom = false;
		document.getElementById('text').disabled = !inRoom;
	});

	p2p.on('chat start', function(data) {
		var disconnectAttempts = 0;
		
		room = data.room;
		inRoom = true;
		partnerId = data.partnerId;
		document.getElementById('text').disabled = !inRoom;
		document.getElementById('messages').innerHTML = 'You found another user! <br>';
		document.getElementById('next').value = 'Leave';
		if(inRoom == true) {
			p2p.upgrade();
			var socketDisconnectCheck = function() {
				if(inRoom && typeof peerPublicKey != 'undefined' && peerPublicKey != '') {
					socket.disconnect();
				} else {
					p2p.emit('publicKeyRequest');
					p2p.upgrade();
					if(disconnectAttempts < 5) {
						callDisconnect(disconnectAttempts);	
					} else {
						messagesDiv.innerHTML += '<b><br />Attempts to verify connection has failed. This could be due to a poor connection between the two of you...</b>';
						disconnectAttempts = 0;
					}	
				}
			}
			
			var callDisconnect = function() {setTimeout(socketDisconnectCheck, 1000, disconnectAttempts++)};
			callDisconnect(disconnectAttempts);
		}
	});

	p2p.on('public key', function(data) {
		peerPublicKey = data.peerPublicKey;
	});
	
	p2p.on('publicKeyRequest', function() {
		p2p.emit('public key', {peerPublicKey: localStorage.publicKey});
	});
	
	p2p.on('upgrade', function(){
		p2p.usePeerConnection = true;
		p2p.emit('public key', {peerPublicKey: localStorage.publicKey});
	})

	var preventDoubleMsg = '';
	var floodCount = 0;
	setInterval(function() {floodCount = 0}, 5000);
	
	p2p.on('message', function(data){
		floodCount++;
		if(floodCount <= 10) {
			if(preventDoubleMsg != data.text) {
				preventDoubleMsg = data.text;
				document.getElementById('watermark').innerHTML = siteTitle;
				privKey = openpgp.key.readArmored(localStorage.privateKey).keys[0];
				privKey.decrypt(localStorage.pass);
				
				options = {
					message: openpgp.message.readArmored(data.text),     
					privateKey: privKey, 
				};
				
				openpgp.decrypt(options).then(function(plaintext) {
					if(plaintext.data.length <= 140) {
						var regTestMixtape = new RegExp(/\[mixtape\](\w+).(\w+)\[\/mixtape]/);
						var matchMixtape = regTestMixtape.exec(plaintext.data);
						
						data.name = data.name.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
						plaintext.data = plaintext.data.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
						
						messagesDiv.innerHTML += "<br> <b style='color:red'>" + data.name + '</b>: ' + plaintext.data;
						
						if(!document.hasFocus()) {
							messageAudio.play();
						}
						
						convertMixtapeMedia(matchMixtape);						
					} else {
						p2p.emit('dataTooLong');
					}
				});
			} else {
				preventDoubleMsg = '';
			}
		} else {
			p2p.emit('floodDetection');
		}
	});
	
	p2p.on('stream', function(data){
		var peerVideo = document.getElementById('peer');
		peerVideo.src = window.URL.createObjectURL(data);
		peerVideo.onloadedmetadata = function(e) {
			peerVideo.play();
		}
	})
	
	p2p.on('chat end', function(data) {
		if(p2p.usePeerConnection == false && socket.connected == false) {
			room = '';
			inRoom = false;
			document.getElementById('text').disabled = !inRoom;
			$("#messages").append('<br><b>Partner has ended the conversation!<b>');
			document.getElementById('next').value = 'Find New Partner';
		}
	});

	p2p.on('disconnect', function(data) { 
		if(!inRoom && !banStatus) {
			messagesDiv.innerHTML += '<b style="color:red;"><br>Your connection to the server has dropped! :cry: </b><br /><b style="color:#cc7a00;"> Don\'t worry, this happens when you disconnect or search to fast. Try either searching again or refreshing if the problem persists.</b>';
			convertToEmoji()
		} else if ((inRoom == true) && !banStatus){
			messagesDiv.innerHTML += '<b style="color:#32cd32;"><br>Your connection is now private! :100: </b>';
			convertToEmoji()
		}		
	});

	p2p.on('leave room', function(){
		if(inRoom == true) {
			messagesDiv.innerHTML += '<br><b>Your partner has ended the conversation!</b>';
			p2p.usePeerConnection = false;
			p2p.disconnect();
			leave_room();
		}
	});
	
	document.getElementById('report').addEventListener('click', function() {
		reportUser();
	});
	
	var reportUser = function() {		
		if(inRoom == true) {
			leave_room();
			leave_room();
			socket.emit('report', partnerId);
			messagesDiv.innerHTML += '<br><b style="color:#32cd32;">You have reported the user!</b>';
		}
	}
		
	document.getElementById('send').addEventListener('click', function() {
		send_message();
	});
	
	document.getElementById('text').addEventListener('keydown', function(key) {		
		if(key.keyCode == 13 || key.which == 13) {
			send_message();
		}
	});
	
	
	var send_message = function() {
		document.getElementById('watermark').innerHTML = siteTitle;
			if (inRoom) {
				if(typeof peerPublicKey != 'undefined' && peerPublicKey != '' && text.value.length > 0) {
					options = {
						data: text.value,
						publicKeys: openpgp.key.readArmored(peerPublicKey).keys,
					};
					
					openpgp.encrypt(options).then(function(ciphertext) {
						encryptedMessage = ciphertext.data;
						p2p.emit('message', {name: username , 'text': encryptedMessage});
					});
				
					userMsg = text.value;
					userMsgReplaced = userMsg.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
					
					messagesDiv.innerHTML += '<br><b style=\'color:#009fff\'>You</b>: ' + userMsgReplaced;
					
					var regTestMixtape = new RegExp(/\[mixtape\](\w+).(\w+)\[\/mixtape]/);
					var matchMixtape = regTestMixtape.exec(userMsg);			
					
					convertMixtapeMedia(matchMixtape);		
					text.value = '';	
				} else {
					if(text.value.length > 0) {
						messagesDiv.innerHTML += '<br><b>Still gathering peer\'s public key, please try again!</b>';
						p2p.emit('publicKeyRequest');
					}
				}
			}
	};


	document.getElementById('hideMedia').addEventListener('click', function(){
		document.getElementById('mixtapeContent').style.display = 'none';
		document.getElementById('media').innerHTML = '';
		document.getElementById('messages').style.height = '30%';
	});
	
	document.getElementById('next').addEventListener('click', function(){
		if(inRoom == true) {
			messagesDiv.innerHTML += '<br><b>You have ended the conversation!</b>';
		}
		
		leave_room();
	});
	
	document.getElementById('dontEmitStream').addEventListener('click', function(){
		if((stream != false)) {
			if(document.getElementById('dontEmitStream').value != 'Resume Stream') {
				stream.getVideoTracks()[0].enabled = false;
				stream.getAudioTracks()[0].enabled = false;
				document.getElementById('dontEmitStream').value = 'Resume Stream';
			} else {
				stream.getVideoTracks()[0].enabled = true;
				stream.getAudioTracks()[0].enabled = true;
				document.getElementById('dontEmitStream').value = 'Stop Video/Audio Stream';
			}
		}	
	});
	
	var leave_room = function(report) { // call this when user want to end current chat
		if (inRoom == true) {
			p2p.emit('leave room');
			p2p.usePeerConnection = false;
			p2p.disconnect();
			room = '';
			peerPublicKey = '';
			inRoom = false;
			document.getElementById('text').disabled = !inRoom;
			document.getElementById('next').value = 'Find New Partner';
		} else {
			if(firstSearch) {
				login();
				firstSearch = false;
			} else if(!socket.connected) {
				socket.connect();
				login();
			} else if(socket.connected && inRoom == false) {
				socket.disconnect();
			}			
		}
	}
}
