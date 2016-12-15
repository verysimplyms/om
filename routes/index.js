var express = require('express');
var router = express.Router();

/* GET home page. */
router.get('/', function(req, res, next) {
  res.render('index', { title: 'om' });
});

router.get('/test', function(req, res, next) {
	res.render('test')
})

router.get('/openpgp.min.js', function(req, res, next){
	res.sendFile('public/javascripts/openpgp.min.js' , { root : __dirname + '/../'});;
});

router.get('/emojify.min.js', function(req, res, next){
	res.sendFile('bower_components/emojify.js/dist/js/emojify.min.js' , { root : __dirname + '/../'});;
});

router.get('/emojify.min.css', function(req, res, next){
	res.sendFile('bower_components/emojify.js/dist/css/basic/emojify.min.css' , { root : __dirname + '/../'});;
});

router.get('/p2pfinished.js', function(req, res, next){
	res.sendFile('public/javascripts/p2pfinished.js' , { root : __dirname + '/../'});;
});

router.get('/messageAudio.mp3', function(req, res, next){
	res.sendFile('public/sound/Blop-Mark_DiAngelo-79054334.mp3' , { root : __dirname + '/../'});;
});

router.get('/openpgp.worker.min.js', function(req, res, next){
	res.sendFile('public/javascripts/openpgp.worker.min.js' , { root : __dirname + '/../'});;
});

router.get('/bower_components/jquery/dist/jquery.min.js', function(req, res, next){
	res.sendFile('bower_components/jquery-2.2.3.min/index.js' , { root : __dirname + '/../'});;
});



module.exports = router;
