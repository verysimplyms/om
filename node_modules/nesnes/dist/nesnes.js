(function(f){if(typeof exports==="object"&&typeof module!=="undefined"){module.exports=f()}else if(typeof define==="function"&&define.amd){define([],f)}else{var g;if(typeof window!=="undefined"){g=window}else if(typeof global!=="undefined"){g=global}else if(typeof self!=="undefined"){g=self}else{g=this}g.NesNes = f()}})(function(){var define,module,exports;return (function e(t,n,r){function s(o,u){if(!n[o]){if(!t[o]){var a=typeof require=="function"&&require;if(!u&&a)return a(o,!0);if(i)return i(o,!0);var f=new Error("Cannot find module '"+o+"'");throw f.code="MODULE_NOT_FOUND",f}var l=n[o]={exports:{}};t[o][0].call(l.exports,function(e){var n=t[o][1][e];return s(n?n:e)},l,l.exports,e,t,n,r)}return n[o].exports}var i=typeof require=="function"&&require;for(var o=0;o<r.length;o++)s(r[o]);return s})({1:[function(require,module,exports){
exports.readFile = function( filename, callback ) {
	var xhr = new XMLHttpRequest();
	xhr.open( "GET", filename );
	xhr.responseType = "arraybuffer";

	xhr.onload = function() {
		callback( xhr.response );
	};

	xhr.onerror = function( e ) {
		throw e;
	};

	xhr.send( null );
};
},{}],2:[function(require,module,exports){
module.exports={
	"input": [
		{
			"type": "standard",
			"input": "keyboard",
			"config": {
				"z": "a",
				"x": "b",
				"shift": "select",
				"return": "start",
				"up": "up",
				"down": "down",
				"left": "left",
				"right": "right"
			}
		}
	]
}
},{}],3:[function(require,module,exports){
var CPU = require("./system/cpu");
var APU = require("./system/apu");
var PPU = require("./system/ppu");
var Cartridge = require("./system/cartridge");
var Controllers = require("./system/controllers");
var Output = require("./system/output");
var Memory = require("./system/memory");
var utils = require("./utils");
var Input = require("./system/input");

var config = require("./config.json");

function System( el ) {
	this.config = config;

	// system timing flags
	this.frameEnded = false;
	this.tickAPU = false;

	// IO
	this.controllers = new Controllers();
	this.input = new Input( this );
	this.output = new Output();

	// video output
	if ( el ) {
		this.output.video.setElement( el );
	}

	// reserve for timing
	this.interval = null;
	this.running = false;
	this.paused = true;

	// reserve for system core
	this.cartridge = null;
	this.cpu = null;
	this.apu = null;
	this.ppu = null;
	this.memory = null;

	Object.preventExtensions( this );
}

System.prototype = {
	/**
	 * Load a ROM and optionally run it.
	 * @param {string} filename - Path of ROM to run.
	 * @param autorun - If true, run ROM when loaded. If a function, call that function.
	 */
	load: function( filename, autorun ) {
		var self = this;

		utils.readFile( filename, function( data ) {
			self.initCartridge( data );

			if ( typeof autorun === "function" ) {
				autorun();
			} else if ( autorun === true ) {
				self.run();
			}
		});
	},

	/**
	 * Turn on and run emulator.
	 */
	run: function() {
		if ( this.interval ) {
			// once is enough
			return;
		}

		var self = this;
		this.interval = setInterval( function() {
			if ( !self.paused) {
				self.runFrame();
			}
		}, 1000 / 60 );

		this.output.video.run();

		this.running = true;
		this.paused = false;
	},

	/**
	 * Run a single frame (1/60s NTCS, 1/50s PAL).
	 */
	runFrame: function() {
		var cpu = this.cpu,
		    ppu = this.ppu,
		    apu = this.apu;

		while ( !ppu.frameEnded ) {
			cpu.tick();

			ppu.tick();
			ppu.tick();
			ppu.tick();

			if ( this.tickAPU ) {
				apu.tick();
			}
			this.tickAPU = !this.tickAPU;
		}

		ppu.frameEnded = false;
	},

	/**
	 * Synchronously simulate running for a number of milliseconds.
	 * @param {number} milliseconds - The number of milliseconds to simulate.
	 */
	simulate: function( milliseconds ) {
		var i,
		    frames = ( milliseconds / 1000 ) * 60;

		for ( i = 0; i < frames; i++ ) {
			this.runFrame();
		}
	},

	/**
	 * Resume running.
	 */
	play: function() {
		this.paused = false;

		if ( !this.running ) {
			this.run();
		}
	},

	/**
	 * Stop running.
	 */
	pause: function() {
		this.paused = true;
	},

	/**
	 * On/off switch.
	 */
	toggle: function() {
		if ( this.paused ) {
			this.play();
		} else {
			this.pause();
		}

		return this.paused;
	},

	/**
	 * Initialize cartridge and hook into system.
	 */
	initCartridge: function( data ) {
		this.cartridge = new Cartridge( data, this );
	
		this.initCore();
		this.reset();
	},

	loadCartridge: function( cartridge ) {
		//this.cartridge = cartridge;
		this.memory.loadCartridge( cartridge );
		this.ppu.memory.loadCartridge( cartridge );
	},

	/**
	 * Initialize the core of our emulator (processor etc).
	 */
	initCore: function() {
		this.cpu = new CPU( this );
		this.apu = new APU( this );
		this.ppu = new PPU( this );
		this.memory = new Memory( this );

		this.loadCartridge( this.cartridge );
	},

	/**
	 * Reset the console.
	 */
	reset: function() {
		this.cpu.reset();
		this.apu.reset();
	}
};

module.exports = System;
},{"./config.json":2,"./system/apu":6,"./system/cartridge":10,"./system/controllers":11,"./system/cpu":13,"./system/input":14,"./system/memory":23,"./system/output":25,"./system/ppu":31,"./utils":1}],4:[function(require,module,exports){
"use strict";

function Channel() {
	this.enabled = false;

	this.lengthCounter = 0;
	this.lengthCounterHalt = false;

	this.sample = 0;

	this.volume = 0;
	this.masterVolume = 0;

	this.envelopeStart = true;
	this.envelopeLoop = false;
	this.envelopeCounter = 0;
	this.envelopeDividerPeriod = 0;
	this.envelopeDividerCount = 0;
	this.envelopeDisabled = false;
}

Channel.prototype = {
	toggle: function( flag ) {
		if ( flag ) {
			this.enable();
		} else {
			this.disable();
		}
	},

	disable: function() {
		this.enabled = false;
		this.lengthCounter = 0;
	},

	enable: function() {
		this.enabled = true;
	},

	doLengthCounter: function() {
		if ( this.lengthCounter && !this.lengthCounterHalt ) {
			this.lengthCounter--;
		}
	},

	setLengthCounter: function( value ) {
		if ( this.enabled ) {
			this.lengthCounter = lengthCounterLookup[ value ];
		}
	},

	doEnvelope: function() {
		if ( this.envelopeStart ) {
			this.envelopeStart = false;
			this.envelopeCounter = 15;
			this.envelopeDividerCount = this.envelopeDividerPeriod;
		} else {
			if ( this.envelopeDividerCount ) {
				this.envelopeDividerCount -= 1;

				if ( this.envelopeDividerCount === 0 ) {
					if ( this.envelopeCounter === 0 && this.envelopeLoop ) {
						// looping envelope
						this.envelopeCounter = 15;
					} else if ( this.envelopeCounter ) {
						// decrement envelope counter while it is non-zero
						this.envelopeCounter -= 1;
					}

					this.envelopeDividerCount = this.envelopeDividerPeriod;
				}
			} else {
				this.envelopeCounter = 0;
			}
		}

		if ( this.envelopeDisabled ) {
			this.masterVolume = this.volume;
		} else {
			this.masterVolume = this.envelopeCounter;
		}
	},

	setEnvelope: function( value ) {
		this.volume = ( value & 0xf ); // || this.volume;
		
		this.lengthCounterHalt = this.envelopeLoop = !!( value & 0x20 );
		this.envelopeDisabled = !!( value & 0x10 );
		this.envelopeDividerPeriod = this.volume + 1;
		this.envelopeStart = true;
	}
};

var lengthCounterLookup = [
	10,254, 20,  2, 40,  4, 80,  6, 160,  8, 60, 10, 14, 12, 26, 14,
	12, 16, 24, 18, 48, 20, 96, 22, 192, 24, 72, 26, 16, 28, 32, 30
];

module.exports = Channel;
},{}],5:[function(require,module,exports){
"use strict";

var Channel = require("./channel");

function DMC( apu ) {
	this.apu = apu;

	this.timerMax = periodLookup[ 0 ];
	this.timer = this.period;

	this.silence = false;
	this.output = 0;

	this.sampleAddress = 0;
	this.sampleCurrentAddress = 0;
	this.sampleLength = 0;
	this.sampleBytesLeft = 0;
	this.sampleBuffer = 0;
	this.loop = false;
	this.interrupt = false;

	this.bitsLeft = 8;
	this.shifter = 0;

	this.irqEnabled = false;

	Channel.call( this );
	Object.preventExtensions( this );
}

DMC.prototype = new Channel();

DMC.prototype.writeRegister = function( index, value ) {
	switch ( index ) {
	case 0:
		this.irqEnabled = !!( value & 0x80 );
		if ( !this.irqEnabled ) {
			this.interrupt = false;
		}

		this.loop = !!( value & 0x40 );
		this.timerMax = this.timer = periodLookup[ value & 0xf ] >>> 1;

		break;
	case 1:
		this.output = value & 0x7f;
		break;
	case 2:
		this.sampleAddress = this.sampleCurrentAddress = ( 0xc000 | ( value << 6 ) );
		break;
	case 3:
		this.sampleLength = this.sampleBytesLeft = value && (( value << 4 ) | 1);
		break;
	}
};

DMC.prototype.doTimer = function() {
	if ( this.timerMax ) {
		this.timer--;

		if ( this.timer <= 0 ) {
			// output bit of shift register
			if ( !this.silence ) {
				// TODO: should not do inc/dec if limit would be exceeded
				if ( this.shifter & 1 ) {
					this.output = Math.min( this.output + 2, 127 );
				} else {
					this.output = Math.max( this.output - 2, 0 );
				}

				this.sample = this.output;
			} else {
				this.sample = 0;
			}

			// clock shift register
			this.shifter >>>= 1;

			// decrement bits left counter, possibly ending output cycle
			this.bitsLeft--;

			if ( !this.bitsLeft ) {
				this.bitsLeft = 8;

				this.silence = !this.sampleBytesLeft;
				if ( !this.silence ) {
					this.readSample();
				}
			}

			this.timer += this.timerMax;
		}
	}

	if ( this.irqEnabled && this.interrupt ) {
		this.apu.system.cpu.requestIRQ();
	}
};

DMC.prototype.readSample = function() {
	this.shifter = this.sampleBuffer;

	// TODO stall CPU
	this.sampleBuffer = this.apu.system.memory.read( this.sampleCurrentAddress );

	this.sampleCurrentAddress++;
	if ( this.sampleCurrentAddress === 0xffff ) {
		this.sampleCurrentAddress = 0x8000;
	}

	this.sampleBytesLeft--;
	if ( !this.sampleBytesLeft ) {
		this.sampleCurrentAddress = this.sampleAddress;

		if ( this.loop ) {
			this.sampleBytesLeft = this.sampleLength;
		} else {
			this.interrupt = this.irqEnabled;
		}
	}
};

// TODO PAL
var periodLookup = [
	428, 380, 340, 320, 286, 254, 226, 214, 190, 160, 142, 128, 106,  84,  72,  54
];

module.exports = DMC;
},{"./channel":4}],6:[function(require,module,exports){
"use strict";

var Pulse = require("./pulse");
var Triangle = require("./triangle");
var Noise = require("./noise");
var DMC = require("./dmc");

function APU( system ) {
	this.system = system;
	this.output = system.output.audio;

	this.sampleCounter = 0;
	this.sampleCounterMax = ( 1789773 / 2 / this.output.sampleRate ); // TODO, this is NTSC-only

	this.frameCounterMode = 0;
	this.frameCounterInterrupt = false;
	this.frameCount = 0;

	this.cycles = 0;

	this.pulse1 = new Pulse();
	this.pulse2 = new Pulse();
	this.triangle = new Triangle();
	this.noise = new Noise();
	this.dmc = new DMC( this );

	Object.preventExtensions( this );
}

APU.prototype = {
	/**
	 * Handle system reset.
	 */
	reset: function() {
		this.writeStatus( 0x0 );
	},

	/**
	 * Read APU registers.
	 * The APU only has a single readable register: 0x4015.
	 */
	readRegister: function( address ) {
		if ( address === 0x15 ) {
			return this.readStatus();
		}

		return 0;
	},

	/**
	 * Read channel status.
	 */
	readStatus: function() {
		return (
			( (!!this.pulse1.lengthCounter) << 0 ) |
			( (!!this.pulse2.lengthCounter) << 1 ) |
			( (!!this.triangle.lengthCounter) << 2 ) |
			( (!!this.noise.lengthCounter) << 3 ) |
			( (!!this.dmc.sampleBytesLeft) << 4 )
		);
	},

	/**
	 * Write to APU registers.
	 */
	writeRegister: function( address, value ) {
		if ( address < 0x4 ) {
			// pulse 1 registers
			this.pulse1.writeRegister( address, value );
		} else if ( address < 0x8 ) {
			// pulse 2 registers
			this.pulse2.writeRegister( address - 0x4, value );
		} else if ( address < 0xc ) {
			// triangle registers
			this.triangle.writeRegister( address - 0x8, value );
		} else if ( address < 0x10 ) {
			// noise registers
			this.noise.writeRegister( address - 0xc, value );
		} else if ( address < 0x14 ) {
			// DMC registers
			this.dmc.writeRegister( address - 0x10, value );
		} else if ( address === 0x15 ) {
			// enabling / disabling channels
			this.writeStatus( value );
		} else if ( address === 0x17 ) {
			// set framecounter mode

			this.frameCounterMode = +!!(value & 0x80);
			this.frameCounterInterrupt = !( value & 0x40 );

			this.cycles = 0;
			// TODO:
			// If the write occurs during an APU cycle, the effects occur 3 CPU cycles
			// after the $4017 write cycle, and if the write occurs between APU cycles,
			// the effects occurs 4 CPU cycles after the write cycle.

			if ( this.frameCounterMode ) {
				// Writing to $4017 with bit 7 set will immediately generate a clock for
				// both the quarter frame and the half frame units, regardless of what
				// the sequencer is doing.

				this.doQuarterFrame();
				this.doHalfFrame();
			}

		}
	},

	/**
	 * Enabled and/or disabled channels.
	 */
	writeStatus: function( value ) {
		this.pulse1.toggle( value & 1 );
		this.pulse2.toggle( value & 2 );
		this.triangle.toggle( value & 4 );
		this.noise.toggle( value & 8 );
	},

	/**
	 * Do a single APU tick.
	 */
	tick: function() {
		switch( this.frameCounterMode ) {
		case 0:
			this.tick0();
			break;
		default:
			this.tick1();
		}

		this.cycles += 1;

		this.updateSample();

		return;		
	},

	/**
	 * Tick for framecounter mode 0.
	 */
	tick0: function() {
		switch( this.cycles ) {
		case 3728:
		case 7457:
		case 11186:
		case 14915:
			this.doQuarterFrame();
			break;
		}

		switch( this.cycles ) {
		case 7457:
		case 14915:
			this.doHalfFrame();
			break;
		}

		if ( this.cycles >= 14915 ) {
			this.cycles = 0;

			if( this.frameCounterInterrupt ) {
				this.system.cpu.requestIRQ();
			}
		}
	},

	/**
	 * Tick for framecounter mode 1.
	 */
	tick1: function() {
		switch( this.cycles ) {
		case 3729:
		case 7457:
		case 11186:
		case 18641:
			this.doQuarterFrame();
			break;
		}

		switch( this.cycles ) {
		case 7457:
		case 18641:
			this.doHalfFrame();
			break;
		}

		if ( this.cycles >= 18641 ) {
			this.cycles = 0;
		}
	},

	/**
	 * Do quarter frame tick (envelopes and linear counter).
	 */
	doQuarterFrame: function() {
		this.pulse1.doEnvelope();
		this.pulse2.doEnvelope();
		this.noise.doEnvelope();
		this.triangle.doLinearCounter();
	},

	/**
	 * Do half frame tick (sweeps and length counters).
	 */
	doHalfFrame: function() {
		this.pulse1.doSweep();
		this.pulse1.doLengthCounter();

		this.pulse2.doSweep();
		this.pulse2.doLengthCounter();

		this.triangle.doLengthCounter();

		this.noise.doLengthCounter();
		// TODO
	},

	/**
	 * Update output sample.
	 */
	updateSample: function() {
		var tndOut = 0, // triangle, noise, dmc
			pulseOut = 0;

		this.pulse1.doTimer();
		this.pulse2.doTimer();
		this.triangle.doTimer();
		this.noise.doTimer();
		this.dmc.doTimer();

		if ( this.output.enabled ) {
			// no need to do calculations if output is disabled
			if ( this.sampleCounter >= this.sampleCounterMax ) {
				pulseOut =  pulseTable[ this.pulse1.sample + this.pulse2.sample ];
				tndOut = tndTable[ 3 * this.triangle.sample + 2 * this.noise.sample + this.dmc.sample ];

				this.output.writeSample( pulseOut + tndOut );

				this.sampleCounter -= this.sampleCounterMax;
			}

			this.sampleCounter += 1;
		}
	}
};

/**
 * Calculate lookup tables for audio samples.
 */
var i = 0;
var pulseTable = new Float32Array( 31 );
for ( i = 0; i < 31; i++ ) {
	pulseTable[ i ] = 95.52 / ( 8128.0 / i + 100 );
}
var tndTable = new Float32Array( 203 );
for ( i = 0; i < 203; i++ ) {
	tndTable[ i ] = 163.67 / (24329.0 / i + 100);
}

module.exports = APU;
},{"./dmc":5,"./noise":7,"./pulse":8,"./triangle":9}],7:[function(require,module,exports){
"use strict";

var Channel = require("./channel");

function Noise() {
	this.shift = 1;
	this.mode = 0;

	this.timerMax = periodLookup[ 0 ];
	this.timer = this.period;

	this.index = 3;

	Channel.call( this );
	Object.preventExtensions( this );
}

Noise.prototype = new Channel();

Noise.prototype.doTimer = function() {
	var feedback = 0,
		otherBit = 0;

	if ( this.timerMax ) {
		if ( this.timer ) {
			this.timer--;
		} else {
			if ( this.mode ) {
				otherBit = ( this.shift & 0x40 ) >> 6;
			} else {
				otherBit = ( this.shift & 0x2 ) >> 1;
			}

			feedback = ( this.shift ^ otherBit ) & 1;

			this.shift >>>= 1;
			this.shift |= ( feedback << 14 );

			if ( this.lengthCounter && !( this.shift & 1 ) ) {
				this.sample = this.masterVolume;
			} else {
				this.sample = 0;
			}

			this.timer += this.timerMax;
		}
	}
};

Noise.prototype.writeRegister = function( index, value ) {
	switch ( index ) {
	case 0:
		// set envelope
		this.setEnvelope( value );

		break;
	case 1:
		// unused
		break;
	case 2:
		// set mode and timer period
		this.mode = ( value & 0x80 ) >>> 7;
		this.timerMax = this.timer = periodLookup[ value & 15 ];

		break;
	case 3:
		// set length counter load and restart envelope
		this.setLengthCounter( value >>> 3 );
		this.envelopeStart = true;

		break;
	}
};

var periodLookup = [
	4, 8, 16, 32, 64, 96, 128, 160, 202, 254, 380, 508, 762, 1016, 2034, 4068
]; // TODO support PAL

module.exports = Noise;
},{"./channel":4}],8:[function(require,module,exports){
"use strict";

var Channel = require("./channel");

function Pulse() {
	this.timerMax = 0;
	this.timer = 0;

	this.duty = 0;

	this.sweepStart = true;
	this.sweepEnabled = false;
	this.sweepDividerPeriod = 0;
	this.sweepDividerCount = 0;
	this.sweepNegate = false;
	this.sweepShiftCount = 0;

	this.pulseCounter = 0;

	this.silence = false;

	Channel.call( this );
	Object.preventExtensions( this );
}

Pulse.prototype = new Channel();

Pulse.prototype.doSweep = function() {
	var adjustPulse = !this.sweepDividerCount,
		timerDelta = 0,
		targetTimer = 0;

	if ( this.sweepStart ) {
		this.sweepDividerCount = this.sweepDividerPeriod;
		this.sweepStart = false;
	}

	if ( adjustPulse ) {
		if ( this.sweepShiftCount ) {
			timerDelta = this.timerMax >>> this.sweepShiftCount;
			// TODO broken sweep, see last line on http://wiki.nesdev.com/w/index.php/APU_Sweep
		}

		if ( this.sweepNegate ) {
			timerDelta = -timerDelta;
		}

		targetTimer = this.timerMax + timerDelta;

		if (
			this.timerMax >= 8 &&
			this.timerMax <= 0x7ff
		) {
			if ( this.sweepEnabled ) {
				this.timerMax = targetTimer;
			}
			this.silence = false;
		} else {
			this.silence = true;
		}

		this.sweepDividerCount = this.sweepDividerPeriod;
	} else if ( this.sweepDividerCount ) {
		this.sweepDividerCount--;
	}
};

Pulse.prototype.doTimer = function() {
	if ( !this.silence && this.lengthCounter && this.timerMax) {
		if ( this.timer ) {
			this.timer--;
		} else {
			this.timer += this.timerMax;
			this.pulseCounter = ( this.pulseCounter + 1 ) & 7;
			this.sample = pulseDutyLookup[ ( this.duty << 3 ) + this.pulseCounter ] * this.masterVolume;
		}
	} else {
		this.sample = 0;
	}
};

Pulse.prototype.writeRegister = function( index, value ) {
	switch( index ) {
	case 0:
		this.duty = ( value & 0xc0 ) >> 6;
		this.setEnvelope( value );
		break;
	case 1:
		this.sweepStart = true;
		this.sweepEnabled = !!( value & 0x80 );
		this.sweepDividerPeriod = ( ( value & 0x70 ) >> 4 ) + 1;
		this.sweepNegate = !!( value & 0x8 );
		this.sweepShiftCount = value & 0x7;

		break;
	case 2:
		this.timer = this.timerMax = ( this.timerMax & ~0xff ) | value;
		break;
	case 3:
		// set timer high and length counter
		this.timer = this.timerMax = ( this.timerMax & ~0xff00 ) | ( (value & 0x7) << 8);
		this.setLengthCounter( value >>> 3 );

		// restart envelope and sequencer
		this.envelopeStart = true;
		this.pulseCounter = 0;

		break;
	}

	this.silence = ( this.timerMax < 8 );
};

var pulseDutyLookup = [
	0, 1, 0, 0, 0, 0, 0, 0,	// duty 0
	0, 1, 1, 0, 0, 0, 0, 0,	// duty 1
	0, 1, 1, 1, 1, 0, 0, 0,	// duty 2
	1, 0, 0, 1, 1, 1, 1, 1	// duty 3
];

module.exports = Pulse;
},{"./channel":4}],9:[function(require,module,exports){
"use strict";

var Channel = require("./channel");

function Triangle() {
	this.linearCounter = 0;
	this.linearCounterMax = 0;
	this.linearCounterControl = false;
	this.linearCounterStart = false;

	this.timerMax = 0;
	this.timer = 0;

	this.sequenceCounter = 0;

	Channel.call( this );
	Object.preventExtensions( this );
}

Triangle.prototype = new Channel();

Triangle.prototype.doLinearCounter = function() {
	if ( this.linearCounterStart ) {
		this.linearCounter = this.linearCounterMax; 
	} else if ( this.linearCounter ) {
		this.linearCounter--;
	}

	if ( !this.linearCounterControl ) {
		this.linearCounterStart = false;
	}
};

Triangle.prototype.doTimer = function() {
	if ( this.timerMax ) {
		this.timer -= 2;

		if ( this.timer <= 0 ) {
			this.timer += this.timerMax;
			this.sequenceCounter = ( this.sequenceCounter + 1 ) & 31;
			this.sample = sequence[ this.sequenceCounter ];
		}
	}

	if ( !this.lengthCounter || !this.linearCounter ) {
		this.sample = 0;
	}
};

Triangle.prototype.writeRegister = function( index, value ) {
	switch ( index ) {
	case 0:
		this.linearCounterMax = value & ~0x80;
		this.lengthCounterHalt = this.linearCounterControl = !!( value & 0x80 );
		break;
	case 1:
		// unused
		break;
	case 2:
		// set timer low
		this.timer = this.timerMax = ( this.timerMax & ~0xff ) | value;
		break;
	case 3:
		// set timer high, set length counter and linear counter reload flag
		this.timer = this.timerMax = ( this.timerMax & ~0xff00 ) | ( ( value & 0x7 ) << 8 );
		this.setLengthCounter( value >>> 3 );
		this.linearCounterStart = true;
		
		break;
	}
};

var sequence = [
	15, 14, 13, 12, 11, 10,  9,  8,  7,  6,  5,  4,  3,  2,  1,  0,
 	0,  1,  2,  3,  4,  5,  6,  7,  8,  9, 10, 11, 12, 13, 14, 15
];

module.exports = Triangle;
},{"./channel":4}],10:[function(require,module,exports){
"use strict";

var mappers = require("./mappers");

var HORIZONTAL = 0,
    VERTICAL = 1,
    FOUR_SCREEN = 2,
    SINGLE_SCREEN_LOWER = 3,
    SINGLE_SCREEN_UPPER = 4;

function Cartridge( data, system ) {
	this.system = system;

	this.raw = data;
	this.data = new Uint8Array( data, 0x10, data.byteLength - 0x10);
	this.header = new Uint8Array( data, 0, 0x10 );

	this.validate();

	this.initHeader();
	this.initData();

	Object.preventExtensions( this );
}

Cartridge.prototype = {
	/**
	 * Validate INES header.
	 * Throws an exception if invalid.
	 */
	validate: function() {
		if ( !( this.header[0] === 0x4e && // 'N'
		        this.header[1] === 0x45 && // 'E'
		        this.header[2] === 0x53 && // 'S'
		        this.header[3] === 0x1a // ending character
		)) {
			throw new Error("Invalid ROM!");
		}
		
		if ( this.header[7] & 0xe ) {
			throw new Error("Bit 1-3 of byte 7 in ROM header must all be zeroes!");
		}
		
		if ( this.header[9] & 0xfe ) {
			throw new Error("Bit 1-7 of byte 9 in header must all be zeroes!");
		}
		
		var i;
		for ( i=10; i <= 15; i++ ) {
			if ( this.header[i] ) {
				throw new Error("Byte " + i + " in ROM header must be zero.");
			}
		}
		
		if ( this.header[6] & 0x4 ) {
			// TODO support trainers
			throw new Error("Trained ROMs are not supported");
		}
	},

	/**
	 * Init header flags.
	 */
	initHeader: function() {
		var flags6 = this.header[6];
		this.mirroring = ( flags6 & 0x1 ) ? VERTICAL : HORIZONTAL;
		this.battery = ( flags6 & 0x2 );
		this.trainer = ( flags6 & 0x4 );
		this.mirroring = ( flags6 & 0x8 ) ? FOUR_SCREEN : this.mirroring;
		
		var flags7 = this.header[7];
		this.vs = (flags7 & 0x1);

		this.mapper = (
			(( flags6 & 0xf0 ) >> 4) |
			( flags7 & 0xf0 )
		);
		
		this.pal = (this.header[9] & 0x1);
	},

	/**
	 * Init prg/chr/ram data.
	 */
	initData: function() {
		this.prgBanks = this.header[4];
		this.chrBanks = this.header[5];
		this.ramBanks = this.header[8] || 1;

		this.prgSize = this.prgBanks * 16 * 1024;
		this.chrSize = this.chrBanks * 8 * 1024;
		this.ramSize = this.ramBanks * 8 * 1024;

		this.prgData = this.data.subarray( 0, this.prgSize );

		if ( this.chrBanks ) {
			this.chrData = this.data.subarray( this.prgSize, this.prgSize + this.chrSize );
		} else {
			// no CHR banks, but probably still CHR RAM
			this.chrData = new Uint8Array( 0x2000 );
		}

		this.ramData = new Uint8Array( this.ramSize );

		this.initMapper();
	},

	/**
	 * Init mapper data and logic.
	 * NESNES copies data around to a dedicated typed array to emulate mapper
	 * behavior. See also loadChrBank and loadPrgBank.
	 */
	initMapper: function() {
		this.prgRead = new Uint8Array( 0x8000 );
		this.prgRead.set( this.prgData.subarray( 0, 0x2000 ) );

		this.chrRead = new Uint8Array( 0x2000 );
		this.chrRead.set( this.chrData.subarray( 0, 0x2000 ) );

		mappers.init( this );
	},

	/**
	 * Write to mapper register.
	 * Should be overridden by mapper classes.
	 */
	writeRegister: function( address, value ) {
		// jshint unused: false
		return;
	},

	/**
	 * Read program data.
	 * Note: also implements the most common mapper behavior.
	 */
	readPRG: function( address ) {
		if ( address & 0x8000 ) {
			return this.prgRead[ address & 0x7fff ];
		} else if( address >= 0x6000 ) {
			return this.ramData[ address - 0x6000 ];
		}

		return 0;
	},

	/**
	 * Write program data.
	 * This is usually used to write to cartridge RAM or mapper registers. Cartridges
	 * don't have mappers by default, but mapperless cartridges can also not be written
	 * to. This method implements the most common mapper register locations.
	 */
	writePRG: function( address, value ) {
		if ( address & 0x8000 ) {
			this.writeRegister( address, value );
		} else if ( address >= 0x6000 ) {
			// writing RAM
			this.ramData[ address - 0x6000 ] = value;
		}

		return;
	},

	/**
	 * Load a PRG Bank at a specific addres.
	 * @param {number} address - The absolute address to load bank at (eg. 0x8000).
	 * @param {bank} bank - Index of bank to load at given address.
	 * @param {size} size - Size of all banks.
	 */
	loadPRGBank: function( address, bank, size ) {
		var offset = bank * size,
			bankData = this.prgData.subarray( offset, offset + size );

		this.prgRead.set( bankData, address - 0x8000 );
	},

	/**
	 * Read graphics data.
	 */
	readCHR: function( address ) {
		return this.chrRead[ address ]; 
	},

	/**
	 * Write graphics data.
	 * Usually only for cartridges with CHR RAM.
	 */
	writeCHR: function( address, value ) {
		if ( !this.chrBanks ) {
			// TODO, probably not doing this right for all ROMs (eg, ROMs that have both CHR ROM *and* CHR RAM)
			this.chrRead[ address ] = value;
		}

		return value;
	},

	readTile: function( baseTable, tileIndex, y ) {
		var tileAddress = ( tileIndex << 4 ) + baseTable + y;

		return (
			( this.readCHR( tileAddress ) << 8 ) |
			this.readCHR( tileAddress + 8 )
		);
	},

	/**
	 * Load a CHR Bank at a specific addres.
	 * @param {number} address - The absolute address to load bank at (eg. 0x8000).
	 * @param {bank} bank - Index of bank to load at given address.
	 * @param {size} size - Size of all banks.
	 */
	loadCHRBank: function( address, bank, size ) {
		var offset = bank * size,
			bankData = this.chrData.subarray( offset, offset + size );

		this.chrRead.set( bankData, address );
	},

	/**
	 * Map a nametable address to our internal memory, taking mirroring into account.
	 */
	getNameTableAddress: function( address ) {
		switch( this.mirroring ) {
		case HORIZONTAL:
			if ( address >= 0x400 ) {
				address -= 0x400;
			}
			if ( address >= 0x800 ) {
				address -= 0x400;
			}
			break;
		case VERTICAL:
			address &= 0x07ff;
			break;
		case FOUR_SCREEN:
			// we still don't implement any mappers that support four screen mirrroring
			throw new Error("TODO, four screen mirroring");
		case SINGLE_SCREEN_LOWER:
		case SINGLE_SCREEN_UPPER:
			address &= 0x3ff;

			if ( this.mirroring === 4 ) {
				address += 0x400;
			}
			break;
		}

		return address;
	},

	/**
	 * Read from nametables.
	 */
	readNameTable: function( address ) {
		return this.system.ppu.ram[ this.getNameTableAddress( address ) ];
	},

	/**
	 * Write to nametables.
	 */
	writeNameTable: function( address, value ) {
		this.system.ppu.ram[ this.getNameTableAddress( address ) ] = value;
	}
};

module.exports = Cartridge;
},{"./mappers":17}],11:[function(require,module,exports){
var CONTROLLER_COUNT = 2;

function Controllers( system ) {
	this.system = system;

	this.controller0 = new NoController();
	this.controller1 = new NoController();

	this.controllers = new Array( CONTROLLER_COUNT );
	this.strobe = 0;
}

Controllers.prototype = {
	/**
	 * Get a connected controller.
	 * @param {number} index - Either 0 or 1.
	 */
	get: function( index ) {
		if ( index ) {
			return this.controller1;
		} else {
			return this.controller0;
		}
	},

	/**
	 * Connect a controller to the system.
	 * @param {number} index - Either 0 or 1.
	 * @param {object} controller - A controller object.
	 */
	connect: function( index, controller ) {
		if ( index ) {
			this.controller1 = controller;
		} else {
			this.controller0 = controller;
		}
	},

	/**
	 * Read controller data at given index.
	 * This is the handler for reading 0x4016 or 0x4017.
	 * @param {number} index - either 0 or 1.
	 */
	read: function( index ) {
		return this.get( index ).read();
	},

	/**
	 * Write controller strobe.
	 * This is the handler for writes to 0x4016.
	 */
	write: function( value ) {
		var strobe = value & 1;

		this.controller0.setStrobe( strobe );
		this.controller1.setStrobe( strobe );
	}
};

/**
 * If no controller is connected, this controller is implicitly connected.
 * This way we don't have to implement safeguards againts unconnected controllers.
 */
function NoController() {}
NoController.prototype = {
	read: function( index ) {
		// jshint unused: false
		return 0;
	},
	setStrobe: function() {
		// do nothing
	}
};

module.exports = Controllers;
},{}],12:[function(require,module,exports){
"use strict";

function StandardController() {
	this.data = 0;
	this.mask = 0;
	this.strobe = 0;

	Object.preventExtensions( this );
}

StandardController.prototype = {
	/**
	 * Press a button.
	 * @param {string} button - The button to press ('a', 'b', 'start', 'select', 'left', 'right', 'up', 'down').
	 */
	press: function( button ) {
		this._press( getBitMask(button) );
	},

	/**
	 * Deress a button.
	 * @param {string} button - The button to depress ('a', 'b', 'start', 'select', 'left', 'right', 'up', 'down').
	 */
	depress: function( button ) {
		this._depress( getBitMask(button) );
	},

	/**
	 * Press several buttons.
	 * Note: prevents pressing of 'impossible' combinations on the NES (like left+right).
	 * @param {number} bitmask - An 8-bit bitmask of buttons to press.
	 */
	_press: function( bitmask ) {
		// prevent input that would be impossible with a standard controller
		// (this can cause some seriously weird behavior in some games)
		if ( bitmask & 3 ) {
			// prevent left + right
			this._depress( 3 );
		} else if ( bitmask & 12 ) {
			// prevent up + down
			this._depress( 12 );
		}

		this.data |= bitmask;
	},

	/**
	 * Dress several buttons.
	 * @param {number} bitmask - An 8-bit bitmask of buttons to press.
	 */
	_depress: function( bitmask ) {
		this.data &= ~bitmask;
	},

	/**
	 * Read controller output.
	 * The output is returned 1 bit at a time.
	 */
	read: function() {
		if ( !this.mask ) {
			// all buttons have been output, always return 1
			return 1;
		}

		var result = this.data & this.mask;

		if ( !this.strobe ) {
			this.mask >>= 1;
		}

		return +!!result;
	},

	/**
	 * Set controller strobe.
	 * If strobe is high, bit shifter is reset until strobe is low.
	 * @param {number} value - If truthy strobe is high, otherwise strobe is low.
	 */
	setStrobe: function( value ) {
		if ( value ) {
			this.mask = 0x80;
		}
		this.strobe = value;
	}
};

/**
 * Convert a button string ('a', 'start', etc) to an internal bitmask.
 */
function getBitMask( button ) {
	return buttonMap[ button.toLowerCase() ] || 0;
}

var buttonMap = {
	"a": 128,
	"b": 64,
	"select": 32,
	"start": 16,
	"up": 8,
	"down": 4,
	"left": 2,
	"right": 1
};

module.exports = StandardController;
},{}],13:[function(require,module,exports){
function CPU( system ) {
	"use strict";

	var address,
		writeToA, op,
		cyclesBurnt = 0,
	    A = 0,
	    X = 0,
	    Y = 0,
	    SP = 0,
	    PC = 0x8000,
	    P = 0,
	    debugPC = PC,
	    delayInterrupt = false,
	    flagI = false,
	    flagB = true,
	    flagC = false,
	    flagN = true,
	    flagD = false,
	    flagV = false,
	    flagZ = false,
	    irqRequested = false,
	    nmiRequested = false,
	    LOW = 0xff,
	    HIGH = 0xff00;

	var VECTOR_NMI = 0xfffa,
	    VECTOR_RESET = 0xfffc,
	    VECTOR_IRQ = 0xfffe;

	function reset() {
		interrupt( VECTOR_RESET );
	}

	/**
	 * Request an NMI interrupt.
	 */
	function requestNMI() {
		nmiRequested = true;
	}

	/**
	 * Request an IRQ interrupt.
	 */
	function requestIRQ() {
		irqRequested = true;
	}

	/**
	 * Handle an NMI interrupt.
	 */
	function doNMI() {
		interrupt( VECTOR_NMI );
		nmiRequested = false;
	}

	/**
	 * Handle an IRQ interrupt.
	 */
	function doIRQ() {
		interrupt( VECTOR_IRQ );
		irqRequested = false;
	}

	function interrupt( vector ) {
		// push PC and P onto stack
		push( (PC & HIGH) >> 8 );
		push( PC & LOW );

		setP();
		push( P );

		// make sure NMI handler doesn't get interrupted
		flagI = 1;

		// go to interrupt handler
		PC = peekWord( vector );

		burn( 7 );
	}

	function burn( cycles ) {
		cyclesBurnt += cycles;
	}

	function tick() {
		cyclesBurnt -= 1;

		if ( cyclesBurnt > 0 ) {
			return;
		}

		cyclesBurnt = 0;

		setP();

		if ( irqRequested && !flagI /*&& !delayInterrupt*/ ) {
			doIRQ();
		}

		op = peek( PC );

		/*console.log(
			PC.toString(16).toUpperCase() +
			" " + op.toString(16).toUpperCase() +
			" A:" + A.toString(16) +
			" X:" + X.toString(16) +
			" Y:" + Y.toString(16) +
			" P:" + P.toString(16) +
			" SP:" + SP.toString(16)
		);*/

		execute( op );

		if ( nmiRequested ) {
			doNMI();
		}

		delayInterrupt = false; // TODO, all other interrupt delays
	}

	/**
	 * Execute a single opcode.
	 */
	function execute( op ) {
		writeToA = 0;
		address = 0xf0000;

		debugPC = PC;

		switch( op ) {
		case 0x3e:
			absoluteIndexedX();
			ROL();
			burn(7);
			break;
		case 0x3d:
			absoluteIndexedX();
			AND();
			burn(4);
			break;
		case 0x85:
			zeroPage();
			STA();
			burn(3);
			break;
		case 0x84:
			zeroPage();
			STY();
			burn(3);
			break;
		case 0x28:
			implied();
			PLP();
			burn(4);
			break;
		case 0x29:
			immediate();
			AND();
			burn(2);
			break;
		case 0xf8:
			implied();
			SED();
			burn(2);
			break;
		case 0xf9:
			absoluteIndexedY();
			SBC();
			burn(4);
			break;
		case 0xf6:
			zeroPageIndexedX();
			INC();
			burn(6);
			break;
		case 0x20:
			absolute();
			JSR();
			burn(6);
			break;
		case 0x21:
			indexedIndirectX();
			AND();
			burn(6);
			break;
		case 0x26:
			zeroPage();
			ROL();
			burn(5);
			break;
		case 0x86:
			zeroPage();
			STX();
			burn(3);
			break;
		case 0x24:
			zeroPage();
			BIT();
			burn(3);
			break;
		case 0x25:
			zeroPage();
			AND();
			burn(2);
			break;
		case 0x35:
			zeroPageIndexedX();
			AND();
			burn(3);
			break;
		case 0x36:
			zeroPageIndexedX();
			ROL();
			burn(6);
			break;
		case 0x31:
			indirectIndexedY();
			AND();
			burn(5);
			break;
		case 0x30:
			relative();
			BMI();
			burn(2);
			break;
		case 0x39:
			absoluteIndexedY();
			AND();
			burn(4);
			break;
		case 0x38:
			implied();
			SEC();
			burn(2);
			break;
		case 0x8c:
			absolute();
			STY();
			burn(4);
			break;
		case 0x2c:
			absolute();
			BIT();
			burn(4);
			break;
		case 0xfd:
			absoluteIndexedX();
			SBC();
			burn(4);
			break;
		case 0xfe:
			absoluteIndexedX();
			INC();
			burn(7);
			break;
		case 0x2d:
			absolute();
			AND();
			burn(4);
			break;
		case 0x2e:
			absolute();
			ROL();
			burn(6);
			break;
		case 0xba:
			implied();
			TSX();
			burn(2);
			break;
		case 0x5e:
			absoluteIndexedX();
			LSR();
			burn(7);
			break;
		case 0x5d:
			absoluteIndexedX();
			EOR();
			burn(4);
			break;
		case 0x40:
			implied();
			RTI();
			burn(6);
			break;
		case 0x41:
			indexedIndirectX();
			EOR();
			burn(6);
			break;
		case 0x45:
			zeroPage();
			EOR();
			burn(3);
			break;
		case 0x46:
			zeroPage();
			LSR();
			burn(5);
			break;
		case 0x48:
			implied();
			PHA();
			burn(3);
			break;
		case 0x49:
			immediate();
			EOR();
			burn(2);
			break;
		case 0xae:
			absolute();
			LDX();
			burn(4);
			break;
		case 0xad:
			absolute();
			LDA();
			burn(4);
			break;
		case 0xac:
			absolute();
			LDY();
			burn(4);
			break;
		case 0xaa:
			implied();
			TAX();
			burn(2);
			break;
		case 0x4a:
			accumulator();
			LSR();
			burn(2);
			break;
		case 0x4c:
			absolute();
			JMP();
			burn(3);
			break;
		case 0x4d:
			absolute();
			EOR();
			burn(4);
			break;
		case 0x4e:
			absolute();
			LSR();
			burn(6);
			break;
		case 0x51:
			indirectIndexedY();
			EOR();
			burn(5);
			break;
		case 0x50:
			relative();
			BVC();
			burn(2);
			break;
		case 0x56:
			zeroPageIndexedX();
			LSR();
			burn(6);
			break;
		case 0x55:
			zeroPageIndexedX();
			EOR();
			burn(4);
			break;
		case 0x9a:
			implied();
			TXS();
			burn(2);
			break;
		case 0xe5:
			zeroPage();
			SBC();
			burn(3);
			break;
		case 0x59:
			absoluteIndexedY();
			EOR();
			burn(4);
			break;
		case 0x58:
			implied();
			CLI();
			burn(2);
			break;
		case 0x2a:
			accumulator();
			ROL();
			burn(2);
			break;
		case 0xa9:
			immediate();
			LDA();
			burn(2);
			break;
		case 0xa8:
			implied();
			TAY();
			burn(2);
			break;
		case 0xa6:
			zeroPage();
			LDX();
			burn(3);
			break;
		case 0xa5:
			zeroPage();
			LDA();
			burn(3);
			break;
		case 0xa2:
			immediate();
			LDX();
			burn(2);
			break;
		case 0xa1:
			indexedIndirectX();
			LDA();
			burn(6);
			break;
		case 0xa0:
			immediate();
			LDY();
			burn(2);
			break;
		case 0xa4:
			zeroPage(0);
			LDY();
			burn(3);
			break;
		case 0xf5:
			zeroPageIndexedX();
			SBC();
			burn(4);
			break;
		case 0x7e:
			absoluteIndexedX();
			ROR();
			burn(7);
			break;
		case 0x7d:
			absoluteIndexedX();
			ADC();
			burn(4);
			break;
		case 0xf0:
			relative();
			BEQ();
			burn(2);
			break;
		case 0x68:
			implied();
			PLA();
			burn(4);
			break;
		case 0x69:
			immediate();
			ADC();
			burn(2);
			break;
		case 0x66:
			zeroPage();
			ROR();
			burn(5);
			break;
		case 0x65:
			zeroPage();
			ADC();
			burn(3);
			break;
		case 0x60:
			implied();
			RTS();
			burn(6);
			break;
		case 0x61:
			indexedIndirectX();
			ADC();
			burn(6);
			break;
		case 0xce:
			absolute();
			DEC();
			burn(6);
			break;
		case 0xcd:
			absolute();
			CMP();
			burn(4);
			break;
		case 0xb8:
			implied();
			CLV();
			burn(2);
			break;
		case 0xb9:
			absoluteIndexedY();
			LDA();
			burn(4);
			break;
		case 0xca:
			implied();
			DEX();
			burn(2);
			break;
		case 0xcc:
			absolute();
			CPY();
			burn(4);
			break;
		case 0xb0:
			relative();
			BCS();
			burn(2);
			break;
		case 0xb1:
			indirectIndexedY();
			LDA();
			burn(5);
			break;
		case 0xb6:
			zeroPageIndexedY();
			LDX();
			burn(4);
			break;
		case 0xb4:
			zeroPageIndexedX();
			LDY();
			burn(4);
			break;
		case 0xb5:
			zeroPageIndexedX();
			LDA();
			burn(4);
			break;
		case 0x8a:
			implied();
			TXA();
			burn(2);
			break;
		case 0x6d:
			absolute();
			ADC();
			burn(4);
			break;
		case 0x6e:
			absolute();
			ROR();
			burn(6);
			break;
		case 0x6c:
			indirect();
			JMP();
			burn(5);
			break;
		case 0x6a:
			accumulator();
			ROR();
			burn(2);
			break;
		case 0x79:
			absoluteIndexedY();
			ADC();
			burn(4);
			break;
		case 0x78:
			implied();
			SEI();
			burn(2);
			break;
		case 0x71:
			indirectIndexedY();
			ADC();
			burn(5);
			break;
		case 0x70:
			relative();
			BVS();
			burn(2);
			break;
		case 0x75:
			zeroPageIndexedX();
			ADC();
			burn(4);
			break;
		case 0x76:
			zeroPageIndexedX();
			ROR();
			burn(6);
			break;
		case 0xc5:
			zeroPage();
			CMP();
			burn(3);
			break;
		case 0xc4:
			zeroPage();
			CPY();
			burn(3);
			break;
		case 0xc6:
			zeroPage();
			DEC();
			burn(5);
			break;
		case 0xc1:
			indexedIndirectX();
			CMP();
			burn(6);
			break;
		case 0xc0:
			immediate();
			CPY();
			burn(2);
			break;
		case 0xbc:
			absoluteIndexedX();
			LDY();
			burn(4);
			break;
		case 0xe4:
			zeroPage();
			CPX();
			burn(3);
			break;
		case 0xc9:
			immediate();
			CMP();
			burn(2);
			break;
		case 0xc8:
			implied();
			INY();
			burn(2);
			break;
		case 0xbd:
			absoluteIndexedX();
			LDA();
			burn(4);
			break;
		case 0xbe:
			absoluteIndexedY();
			LDX();
			burn(4);
			break;
		case 0xf1:
			indirectIndexedY();
			SBC();
			burn(5);
			break;
		case 0xe9:
			immediate();
			SBC();
			burn(2);
			break;
		case 0xd0:
			relative();
			BNE();
			burn(2);
			break;
		case 0xd1:
			indirectIndexedY();
			CMP();
			burn(5);
			break;
		case 0x9d:
			absoluteIndexedX();
			STA();
			burn(5);
			break;
		case 0x08:
			implied();
			PHP();
			burn(3);
			break;
		case 0xd5:
			zeroPageIndexedX();
			CMP();
			burn(4);
			break;
		case 0xd6:
			zeroPageIndexedX();
			DEC();
			burn(6);
			break;
		case 0xd8:
			implied();
			CLD();
			burn(2);
			break;
		case 0xd9:
			absoluteIndexedY();
			CMP();
			burn(4);
			break;
		case 0x06:
			zeroPage();
			ASL();
			burn(5);
			break;
		case 0x00:
			implied();
			BRK();
			burn(7);
			break;
		case 0x01:
			indexedIndirectX();
			ORA();
			burn(6);
			break;
		case 0xec:
			absolute();
			CPX();
			burn(4);
			break;
		case 0x05:
			zeroPage();
			ORA();
			burn(2);
			break;
		case 0xea:
			implied();
			NOP();
			burn(2);
			break;
		case 0x81:
			indexedIndirectX();
			STA();
			burn(6);
			break;
		case 0xee:
			absolute();
			INC();
			burn(6);
			break;
		case 0xed:
			absolute();
			SBC();
			burn(4);
			break;
		case 0x1e:
			absoluteIndexedX();
			ASL();
			burn(7);
			break;
		case 0x1d:
			absoluteIndexedX();
			ORA();
			burn(4);
			break;
		case 0x88:
			implied();
			DEY();
			burn(2);
			break;
		case 0x09:
			immediate();
			ORA();
			burn(2);
			break;
		case 0x8d:
			absolute();
			STA();
			burn(4);
			break;
		case 0x8e:
			absolute();
			STX();
			burn(4);
			break;
		case 0xe1:
			indexedIndirectX();
			SBC();
			burn(6);
			break;
		case 0xe0:
			immediate();
			CPX();
			burn(2);
			break;
		case 0xe6:
			zeroPage();
			INC();
			burn(5);
			break;
		case 0x19:
			absoluteIndexedY();
			ORA();
			burn(4);
			break;
		case 0x18:
			implied();
			CLC();
			burn(2);
			break;
		case 0x16:
			zeroPageIndexedX();
			ASL();
			burn(6);
			break;
		case 0x15:
			zeroPageIndexedX();
			ORA();
			burn(3);
			break;
		case 0xe8:
			implied();
			INX();
			burn(2);
			break;
		case 0x11:
			indirectIndexedY();
			ORA();
			burn(5);
			break;
		case 0x10:
			relative();
			BPL();
			burn(2);
			break;
		case 0x96:
			zeroPageIndexedY();
			STX();
			burn(4);
			break;
		case 0x95:
			zeroPageIndexedX();
			STA();
			burn(4);
			break;
		case 0x94:
			zeroPageIndexedX();
			STY();
			burn(4);
			break;
		case 0xdd:
			absoluteIndexedX();
			CMP();
			burn(4);
			break;
		case 0xde:
			absoluteIndexedX();
			DEC();
			burn(7);
			break;
		case 0x91:
			indirectIndexedY();
			STA();
			burn(6);
			break;
		case 0x90:
			relative();
			BCC();
			burn(2);
			break;
		case 0x0d:
			absolute();
			ORA();
			burn(4);
			break;
		case 0x0e:
			absolute();
			ASL();
			burn(6);
			break;
		case 0x0a:
			accumulator();
			ASL();
			burn(2);
			break;
		case 0x99:
			absoluteIndexedY();
			STA();
			burn(5);
			break;
		case 0x98:
			implied();
			TYA();
			burn(2);
			break;
		default:
			PC += 1;
			//throw new Error("Invalid opcode! " + op);
		}
	}

	function read() {
		if ( !writeToA && address === 0xf0000 ) {
			throw new Error("invalid read");
		}

		if ( writeToA ) {
			return A;
		} else {
			return peek( address );
		}
	}

	/**
	 * Read method for read-mod-write instructions.
	 * Read-mod-write instructions incorrectly write back the read value before
	 * writing any correct value.
	 */
	function modRead() {
		return write(read());
	}

	function write( value ) {
		if ( writeToA ) {
			writeA( value );
		} else {
			poke( address, value );
		}

		if ( value > 0xff ) {
			throw new Error("invalid write");
		}

		return value;
	}

	function writeA( value ) {
		A = value;
	}

	/*******************************************************
	 * Addressing modes
	 */

	function implied() {
		PC += 1;
	}

	function accumulator() {
		writeToA = 1;

		PC += 1;
	}

	function immediate() {
		address = PC + 1;

		PC += 2;
	}

	function relative() {
		address = PC + 1;

		PC += 2;
	}

	function absolute() {
		var high = peek( PC + 2 ) << 8,
			low = peek( PC + 1 );

		address = high | low;

		PC += 3;
	}

	function zeroPage( index ) {
		var	base = peek( PC + 1 );

		index = index || 0;
		address = ( base + index ) & 0xff;

		PC += 2;
	}

	function absoluteIndexed( index ) {
		var high = peek( PC + 2 ) << 8,
			low = peek( PC + 1 ),
			base = high | low;

		address = ( base + index ) & 0xffff;

		if ( ( low + X ) & 0xff00 ) {
			// oops cycle
			burn( 1 );
		}

		PC += 3;
	}

	function absoluteIndexedX() {
		absoluteIndexed( X );
	}

	function absoluteIndexedY() {
		absoluteIndexed( Y );
	}

	function zeroPageIndexedX() {
		zeroPage( X );
	}

	function zeroPageIndexedY() {
		zeroPage( Y );
	}

	function indirect() {
		var lowAddress = peekWord( PC + 1 ),
			highAddress = lowAddress + 1,
			low = 0,
			high = 0;

		// due to a bug in the 6502, the most significant byte of the address is always fetched
		// from the same page as the least significant byte
		if ( (lowAddress & 0xff) === 0xff ) {
			highAddress = lowAddress - 0xff;
		}

		low = peek( lowAddress );
		high = peek( highAddress ) << 8;

		address = high | low;

		PC += 3;
	}

	function indexedIndirectX() {
		var peeked = peek( PC + 1 ),
			newAddress = peeked + X,
			low = peek( newAddress & 0xff ),
			high = peek( (newAddress + 1) & 0xff ) << 8;

		address = high | low;

		if ( (peeked & 0xff00) !== (newAddress & 0xff00) ) {
			burn( 1 );
		}

		PC += 2;
	}

	function indirectIndexedY() {
		var newAddress = peek( PC + 1 ),
			low = peek( newAddress ),
			high = peek( (newAddress + 1) & 0xff ) << 8;

		address = ( (high | low) + Y ) & 0xffff;

		PC += 2;
		// TODO oops cycle
	}

	/*******************************************************
	 * Operations
	 */

	/**
	 * Add with carry.
	 * Opcodes: 0x69, 0x65, 0x75, 0x6d, 0x7d, 0x79, 0x61, 0x71
	 */
	function ADC() {
		doADC( read() );
	}

	/**
	 * Actually performe add with carry.
	 * Useful, as SBC is also a modified add-with-carry.
	 */
	function doADC( value ) {
		var t = A + value + flagC;
			
		flagV = !!((A ^ t) & (value ^ t) & 0x80) && 1;
		flagN = !!( t & 0x80 );
		flagC = ( t > 255 );
		flagZ = !( t & 0xff );

		writeA( t & 0xff );
	}

	/**
	 * Bitwise AND.
	 * Opcodes: 0x29, 0x25, 0x35, 0x2d, 0x3d, 0x39, 0x21, 0x31
	 */
	function AND() {
		var value = read();
		if ( value === 4 ) {
			value = value;
		}
		writeA( A & value );
		flagN = ( A & 0x80 ) && 1;
		flagZ = +( A === 0 );
	}

	/**
	 * Arithmetic Shift Left.
	 * Opcodes: 0x0a, 0x06, 0x16, 0x0e, 0x1e.
	 */
	function ASL() {
		var value = modRead(),
			result = write( (value << 1) & 0xfe );

		flagC = ( value & 0x80 ) && 1;
		flagN = ( result & 0x80 ) && 1;
		flagZ = +( result === 0 );
	}

	/**
	 * Branch on Carry Set.
	 * Opcodes: 0xb0
	 */
	function BCS() {
		branch( flagC );
	}

	/**
	 * Branch on Carry Clear.
	 * Opcodes: 0x90
	 */
	function BCC() {
		branch( !flagC );
	}

	/**
	 * Branch on EQual.
	 * Opcodes: 0xf0
	 */
	function BEQ() {
		branch( flagZ );
	}

	/**
	 * Branch on Not Equal.
	 * Opcodes: 0xd0
	 */
	function BNE() {
		branch( !flagZ );
	}

	/**
	 * Branch on MInus.
	 * Opcodes: 0x30
	 */
	function BMI() {
		branch( flagN );
	}

	/**
	 * Branch on PLus.
	 * Opcodes: 0x10
	 */
	function BPL() {
		branch( !flagN );
	}

	/**
	 * Branch on oVerflow Set.
	 * Opcodes: 0x70
	 */
	function BVS() {
		branch( flagV );
	}

	/**
	 * Branch on oVerflow Clear.
	 * Opcodes: 0x50
	 */
	function BVC() {
		branch( !flagV );
	}

	/**
	 * Helper function for all branching operations.
	 * @param {boolean} flag - If true, do branch. Otherwise do nothing.
	 */
	function branch( flag ) {
		var offset = read(),
			prevHigh = PC & HIGH,
			curHigh = 0;

		if ( flag ) {
			// branching burns a cycle
			burn(1);

			if ( offset & 0x80 ) {
				offset = -complement( offset );
			}

			PC += offset;
			curHigh = PC & HIGH;

			if ( prevHigh !== curHigh ) {
				// crossing page boundary, burns a cycle
				burn(1);
			}
		}
	}

	/**
	 * Test bits in memory.
	 * Opcodes: 0x24, 0x2c
	 * BIT sets the Z flag as though the value in the address tested were ANDed with
	 * the accumulator. The S and V flags are set to match bits 7 and 6 respectively
	 * in the value stored at the tested address.
	 */
	function BIT() {
		var value = read(),
			t = A & value;
		flagN = ( value & 0x80 ) && 1;
		flagV = ( value & 0x40 ) && 1;
		flagZ = +( t === 0 );
	}

	/**
	 * Trigger an non-maskable interrupt.
	 * Opcodes: 0x00
	 */
	function BRK() {
		var high, low;

		PC += 1;
		push( (PC & HIGH) >> 8 );
		push( PC & LOW );

		setP();
		push( P|0x10 );

		low = peek(0xfffe);
		high = peek(0xffff) << 8;
		PC = high | low;
	}

	/**
	 * Clear Carry flag.
	 * Opcodes: 0x18
	 */
	function CLC() {
		flagC = 0;
	}

	/**
	 * Clear Decimal flag.
	 * Opcodes: 0x58
	 */
	function CLD() {
		flagD = 0;
	}

	/**
	 * Clear Interrupt flag.
	 * Opcodes: 0x58
	 */
	function CLI() {
		flagI = 0;
		delayInterrupt = true;
	}

	/**
	 * Clear oVerflow flag.
	 * Opcodes: 0xbe
	 */
	function CLV() {
		flagV = 0;
	}

	/**
	 * Compare Accumulator with memory.
	 * Opcodes: 0xc9, 0xc5, 0xd5, 0xcd, 0xdd, 0xd9, 0xc1, 0xd1
	 * @see xCMP
	 */
	function CMP() {
		xCMP( A );
	}

	/**
	 * Compare X with memory.
	 * Opcodes: 0xe0, 0xe4, 0xec
	 * @see xCMP
	 */
	function CPX() {
		xCMP( X );
	}

	/**
	 * Compare Y with memory.
	 * Opcodes: 0xc0, 0xc4, 0xcc
	 * @see xCMP
	 */
	function CPY() {
		xCMP( Y );
	}

	/**
	 * Compare value with memory as if subtraction was carried out.
	 * @param {number} value - The value to compare with memory.
	 */
	function xCMP( value ) {
		var readValue = read(),
			t = ( value - readValue ) & 0xff;
		flagN = ( t & 0x80 ) && 1;
		flagC = +( value >= readValue );
		flagZ = +( t === 0 );
	}

	/**
	 * Decrement memory.
	 * Opcodes: 0xc6, 0xd6, 0xce, 0xde
	 */
	function DEC() {
		var result = write( (modRead() - 1) & 0xff );
		flagN = +!!(result & 0x80);
		flagZ = +( result === 0 );
	}

	/**
	 * Decrement X.
	 * Opcodes: 0xca
	 */
	function DEX() {
		X = ( X - 1 ) & 0xff;
		flagZ = +( X === 0 );
		flagN = ( X & 0x80 ) && 1;
	}

	/**
	 * Decrement Y.
	 * Opcodes: 0x88
	 */
	function DEY() {
		Y = ( Y - 1 ) & 0xff;
		flagZ = +( Y === 0 );
		flagN = ( Y & 0x80 ) && 1;
	}

	/**
	 * Exclusive bitwise OR.
	 * Opcodes: 0x49, 0x45, 0x55, 0x4d, 0x5d, 0x59, 0x41, 0x51
	 */
	function EOR() {
		writeA( A ^ read() );
		flagN = ( A & 0x80 ) && 1;
		flagZ = +( A === 0 );
	}

	/**
	 * Increment memory.
	 * Opcodes: 0xe6, 0xf6, 0xee, 0xfe
	 */
	function INC() {
		var result = write( (modRead() + 1) & 0xff );
		flagN = !!( result & 0x80 );
		flagZ = ( result === 0 );
	}

	/**
	 * Increment X.
	 * Opcodes: 0xe8
	 */
	function INX() {
		X = ( X + 1 ) & 0xff;
		flagN = ( X & 0x80 ) && 1;
		flagZ = +( X === 0 );
	}

	/**
	 * Increment Y.
	 * Opcodes: 0xc8
	 */
	function INY() {
		Y = ( Y + 1 ) & 0xff;
		flagN = ( Y & 0x80 ) && 1;
		flagZ = +( Y === 0 );
	}

	/**
	 * Jump to memory location.
	 * Opcodes: 0x4c, 0x6c
	 */
	function JMP() {
		PC = address;
	}

	/**
	 * Jump to Sub-Routine.
	 * Opcodes: 0x20
	 */
	function JSR() {
		var t = PC - 1;
		push( ( t & HIGH ) >> 8 );
		push( t & LOW );
		PC = address;
	}

	/**
	 * Load Accumulator with memory.
	 * Opcodes: 0xa9, 0xa5, 0xb5, 0xad, 0xbd, 0xb9, 0xa1, 0xb1
	 */
	function LDA() {
		var value = read();

		writeA( value );
		flagN = ( A & 0x80 ) && 1;
		flagZ = +( A === 0 );
	}

	/**
	 * Load X with memory.
	 * Opcodes: 0xa2, 0xa6, 0xb6, 0xae, 0xbe
	 */
	function LDX() {
		X = read();
		flagN = ( X & 0x80 ) && 1;
		flagZ = +( X === 0 );
	}

	/**
	 * Load Y with memory.
	 * Opcodes: 0xa0, 0xa4, 0xb4, 0xac, 0xbc
	 */
	function LDY() {
		Y = read();
		flagN = ( Y & 0x80 ) && 1;
		flagZ = +( Y === 0 );
	}

	/**
	 * Logical Shift Right.
	 * Opcodes: 0x4a, 0x46, 0x56, 0x4e, 0x5e
	 */
	function LSR() {
		var value = modRead();

		flagN = 0;
		flagC = ( value & 0x01 ) && 1;
		var result = write( (value >>> 1) & 0xff );
		flagZ = +( result === 0 );
	}

	/**
	 * No operation. Aside from performing no operation, it also does nothing.
	 * Opcodes: 0xea
	 */
	function NOP() {
		// do nothing
	}

	/**
	 * Bitwise OR with Accumulator.
	 * Opcodes: 0x09, 0x05, 0x15, 0x0d, 0x1d, 0x19, 0x01, 0x11
	 */
	function ORA() {
		writeA( A | read() );
		flagN = ( A & 0x80 ) && 1;
		flagZ = +( A === 0 );
	}

	/**
	 * Push Accumulator to stack.
	 * Opcodes: 0x48
	 */
	function PHA() {
		push( A );
	}

	/**
	 * Push P to stack.
	 * Opcodes: 0x08
	 */
	function PHP() {
		setP();
		push( P|0x10 );
	}

	/**
	 * Pull Accumulator from stack.
	 * Opcodes: 0x68
	 */
	function PLA() {
		writeA( pop() );
		flagN = ( A & 0x80 ) && 1;
		flagZ = +( A === 0 );
	}

	/**
	 * Pull P from stack.
	 * Opcodes: 0x28
	 */
	function PLP() {
		P = pop();
		setFlags();
	}

	/**
	 * Rotate left.
	 * Opcodes: 0x2a, 0x26, 0x36, 0x2e, 0x3e
	 */
	function ROL() {
		var value = modRead(),
			result = ( value << 1 ) & 0xfe;

		result = write( result | flagC );
		flagC = ( value & 0x80 ) && 1;
		flagZ = +( result === 0 );
		flagN = ( result & 0x80 ) && 1;
	}

	/**
	 * Rotate right.
	 * Opcodes: 0x6a, 0x66, 0x76, 0x6e, 0x7e.
	 */
	function ROR() {
		var value = modRead(),
			result = ( value >>> 1 ) & 0xff;

		result = write( result | (flagC ? 0x80 : 0) );
		flagC = value & 0x01;
		flagZ = +( result === 0 );
		flagN = ( result & 0x80 ) && 1;
	}

	/**
	 * Return from interrupt.
	 * Opcodes: 0x40
	 */
	function RTI() {
		var low, high;

		P = pop();
		setFlags();
		low = pop();
		high = pop() << 8;
		PC = high | low;
	}

	/**
	 * Return from subroutine.
	 * Opcodes: 0x60
	 */
	function RTS() {
		var low, high;

		low = pop();
		high = pop() << 8;
		PC = ( high | low ) + 1;
	}

	/**
	 * Subtract with carry.
	 * Opcodes: 0xe9, 0xe5, 0xf5, 0xed, 0xfd, 0xf9, 0xe1, 0xf1
	 */
	function SBC() {
		doADC( read() ^ 0xff );
	}

	/**
	 * Set Carry flag.
	 * Opcodes: 0x38
	 */
	function SEC() {
		flagC = 1;
	}

	/**
	 * Set Decimal flag.
	 * Opcodes: 0xf8
	 */
	function SED() {
		flagD = 1;
	}

	/**
	 * Set interrupt flag.
	 * Opcodes: 0x78
	 */
	function SEI() {
		flagI = 1;
	}

	/**
	 * Store accumulator in memory.
	 * Opcodes: 0x85, 0x95, 0x8d, 0x9d, 0x99, 0x81, 0x91
	 */
	function STA() {
		write( A );
	}

	/**
	 * Store X in memory.
	 * Opcodes: 0x86, 0x96, 0x8e
	 */
	function STX() {
		write( X );
	}

	/**
	 * Store Y in memory.
	 * Opcodes: 0x84, 0x94, 0x8c
	 */
	function STY() {
		write( Y );
	}

	/**
	 * Transfer Accumulator to X.
	 * Opcodes: 0xaa
	 */
	function TAX() {
		X = A;
		flagN = ( X & 0x80 ) && 1;
		flagZ = +( X === 0 );
	}

	/**
	 * Transfer Accumulator to Y.
	 * Opcodes: 0xa8
	 */
	function TAY() {
		Y = A;
		flagN = ( Y & 0x80 ) && 1;
		flagZ = +( Y === 0 );
	}

	/**
	 * Transfer Stack Pointer to X.
	 * Opcodes: 0xba
	 */
	function TSX() {
		X = SP;
		flagN = ( X & 0x80 ) && 1;
		flagZ = +( X === 0 );
	}

	/**
	 * Transer X to Accumulator.
	 * Opcodes: 0x8a
	 */
	function TXA() {
		writeA( X );
		flagN = ( A & 0x80 ) && 1;
		flagZ = +( A === 0 );
	}

	/**
	 * Transfer X to Stack Pointer.
	 * Opcodes: 0x9a
	 */
	function TXS() {
		SP = X;
	}

	/**
	 * Transfer Y to Accumulator.
	 * Opcodes: 0x98
	 */
	function TYA() {
		writeA( Y );
		flagN = ( A & 0x80 ) && 1;
		flagZ = +( A === 0 );
	}

	/**
	 * Write a value to memory.
	 */
	function poke( index, value ) {
		system.memory.write( index, value );
	}

	/**
	 * Read a value from memory.
	 */
	function peek( index ) {
		return system.memory.read( index );
	}

	/**
	 * Peek a 16-bit word from memory.
	 */
	function peekWord( index ) {
		var low = peek( index ),
			high = peek( (index + 1) & 0xffff ) << 8;

		return ( low | high );
	}

	/**
	 * Pop a value from stack.
	 */
	function pop() {
		SP = ( SP + 1 ) & 0xff;
		var result = peek( SP | 0x100 );

		return result;
	}

	/**
	 * Push a value to stack.
	 */
	function push( value ) {
		poke( SP | 0x100, value);
		SP = ( SP - 1 ) & 0xff;
	}

	function complement( value ) {
		return ( ~value & 0xff ) + 1;
	}

	/**
	 * Set flags from value in P.
	 */
	function setFlags() {
		flagN = !!( P & 0x80 );
		flagV = !!( P & 0x40 );
		flagB = !!( P & 0x10 );
		flagD = !!( P & 0x08 );
		flagI = !!( P & 0x04 );
		flagZ = !!( P & 0x02 );
		flagC = !!( P & 0x01 );
	}

	/**
	 * Set P from value in flags.
	 */
	function setP() {
		P = (
			(flagN << 7) |
			(flagV << 6) |
			0x20 |
			(flagB << 4) |
			(flagD << 3) |
			(flagI << 2) |
			(flagZ << 1) |
			flagC
		);
	}

	/**
	 * Set the Program Counter (PC).
	 * Mostly for debugging/testing purposes.
	 */
	function setPC( value ) {
		PC = value;
	}

	function resetCycles() {
		cyclesBurnt = 0;
	}

	function getCycles() {
		return cyclesBurnt;
	}

	this.burn = burn;
	this.reset = reset;
	this.tick = tick;
	this.setPC = setPC;

	this.requestNMI = requestNMI;
	this.requestIRQ = requestIRQ;

	this.getCycles = getCycles;
	this.resetCycles = resetCycles;
	this.execute = execute;
}

module.exports = CPU;
},{}],14:[function(require,module,exports){
var Keyboard = require("./keyboard");
var StandardController = require("../controllers/standardcontroller");

function Input( system  ) {
	this.system = system;
	this.controllers = system.controllers;
	this.inputHandlers = new Array( 2 );

	this.initConfig();

	// only enable input in browsers
	if ( typeof window !== "undefined" ) {
		this.enable();
	}
}

Input.prototype = {
	/**
	 * Enable all input.
	 */
	enable: function() {
		this._setEnabled( true );
	},

	/**
	 * Disable all input.
	 */
	disable: function() {
		this._setEnabled( false );
	},

	/**
	 * Set enabled yes/no.
	 * Helper method for enable and disable.
	 * @param {boolean} enabled - If true enable, otherwise disable.
	 */
	_setEnabled: function( enabled ) {
		var handler,
			method = enabled ? "enable" : "disable";

		for ( var i = 0; i < this.inputHandlers.length; i++ ) {
			handler = this.inputHandlers[ i ];
			if ( handler )  {
				handler[ method ]();
			}
		}
	},

	/**
	 * Initialize total input config.
	 */
	initConfig: function() {
		var item,
		    config = this.config = this.system.config.input;

		for ( var i = 0; i < config.length; i++ ) {
			item = config[ i ];
			
			this.setController( i, item.type );
			this.setInputHandler( i, item.input, item.config );
		}
	},

	/**
	 * Connect a controller of given type.
	 * @param {number} index - Either 0 or 1.
	 * @param {string} type - Type of controller (eg. 'standard').
	 */
	setController: function( index, type ) {
		var Controller = controllerMap[ type ];
		this.controllers.connect( index, new Controller() );
	},

	/**
	 * Bind input handler to controller.
	 * @param {number} index - Either 0 or 1.
	 * @param {string} input - Type of input handler (eg. 'keyboard').
	 * @param {object} config - Configuration for keyboard handler.
	 */
	setInputHandler: function( index, input, config ) {
		var InputHandler = inputHandlerMap[ input ],
			controller = this.controllers.get( index );
		this.inputHandlers[ index ] = new InputHandler( controller, config );
	}
};

var controllerMap = {
	"standard": StandardController
};

var inputHandlerMap = {
	"keyboard": Keyboard
};

module.exports = Input;
},{"../controllers/standardcontroller":12,"./keyboard":15}],15:[function(require,module,exports){
function Keyboard( controller, config ) {
	this.controller = controller;
	this.handlers = {};

	if ( config ) {
		this.configure( config );
	}

	this.enabled = false;
}

Keyboard.prototype = {
	/**
	 * Load configuration.
	 * @param {object} config - An mapping of keyboard keys to controller buttons.
	 */
	configure: function( config ) {
		this.config = config;
		this.initKeyCodes();
	},

	/**
	 * Bind keyboard events.
	 */
	enable: function() {
		// make sure event handlers aren't bound twice
		if ( !this.enabled ) {
			this.bindHandler( "keydown" );
			this.bindHandler( "keyup" );
		}

		this.enabled = true;
	},

	/**
	 * Unbind keyboard events.
	 */
	disable: function() {
		this.unbindHandler( "keydown" );
		this.unbindHandler( "keyup" );

		this.enabled = false;
	},

	/**
	 * Bind keyboard event of specific type.
	 * @param {string} type - Either 'keydown' or 'keyup'.
	 */
	bindHandler: function( type ) {
		window.addEventListener( type, this.getHandler( type ) );
	},

	/**
	 * Unbind keyboard event of specific type.
	 * @param {string} type - Either 'keydown' or 'keyup'.
	 */
	unbindHandler: function( type ) {
		window.removeEventListener( type, this.getHandler( type ) );
	},

	/**
	 * Get keyboard event handler of specific type.
	 * @param {string} type - Either 'keydown' or 'keyup'.
	 */
	getHandler: function( type ) {
		if ( this.handlers[ type ] ) {
			return this.handlers[ type ];
		}

		var self = this,
		    handler = type === "keydown" ? "press" : "depress";

		this.handlers[ type ] = function( e ) {
			var keyCode = e.keyCode;

			if ( keyCode in self.keyCodes ) {
				self.controller[ handler ]( self.keyCodes[ keyCode ] );
				e.preventDefault();
			}
		};

		return this.handlers[ type ];
	},

	/**
	 * Initialize keycodes from config.
	 * Converts config key strings to numeric keycodes that can be used in event handlers.
	 */
	initKeyCodes: function() {
		var name, keyCode,
		    keyCodes = {};

		for ( name in this.config ) {
			if ( name in keyCodeMap ) {
				// special cases ('ctrl', 'shift', etc)
				keyCode = keyCodeMap[ name ];
			} else {
				// letters and numbers
				keyCode = name.toUpperCase().charCodeAt();
			}

			keyCodes[ keyCode ] = this.config[ name ];
		}

		this.keyCodes = keyCodes;
	}
};

var keyCodeMap = {
	"backspace": 8,
	"tab": 9,
	"return": 13,
	"shift": 16,
	"ctrl": 17,
	"alt": 18,
	"capslock": 20,
	"space": 32,
	"left": 37,
	"up": 38,
	"right": 39,
	"down": 40,
};

module.exports = Keyboard;
},{}],16:[function(require,module,exports){
module.exports = {
	init: function() {
		this.axRomBanks = this.prgBanks >> 1;
		this.setPrgBank( 0 );
	},

	setPrgBank: function( bank ) {
		this.prgBank = bank;
		this.loadPRGBank( 0x8000, bank, 0x8000 );
	},

	writeRegister: function( address, value ) {
		this.setPrgBank( value & 7 );

		this.mirroring = ( value & 0x10 ) ? 4 : 3;
	}
};
},{}],17:[function(require,module,exports){
var NROM = require("./nrom"),
	MMC1 = require("./mmc1"),
	MMC2 = require("./mmc2"),
	MMC3 = require("./mmc3"),
	UxROM = require("./uxrom"),
	AxROM = require("./axrom");

var mapperList = {};

mapperList[ 0 ] = NROM;
mapperList[ 1 ] = MMC1;
mapperList[ 2 ] = UxROM;
mapperList[ 4 ] = MMC3;
mapperList[ 7 ] = AxROM;
mapperList[ 9 ] = MMC2;

exports.init = function( cartridge ) {
	var mapper, method,
		mapperID = cartridge.mapper;

	if ( !( mapperID in mapperList ) ) {
		throw new Error( "Unknown mapper " + mapperID );
	}

	mapper = mapperList[ mapperID ];
	for ( method in mapper ) {
		cartridge[ method ] = mapper[ method ];
	}

	cartridge.init();
};
},{"./axrom":16,"./mmc1":18,"./mmc2":19,"./mmc3":20,"./nrom":21,"./uxrom":22}],18:[function(require,module,exports){
// map MMC1 mirroring modes to INES mirroring values
var mirrorMap = [ 3, 4, 1, 0 ];

module.exports = {
	init: function() {
		this.lastPRG = this.prgBanks - 1;
		this.prgBank = 0;

		this.chrBank0 = 0;
		this.chrBank1 = 1;

		this.registerWrites = 0;
		this.registerShift = 0;

		this.mapperControl( 0xc );
	},

	mapperControl: function( value ) {
		var mirroring = value & 0x3,
			prgMode = ( value & 0xc ) >> 2,
			chrMode = ( value & 0x10 ) >> 4;

		this.mapperFlags = value;

		this.mirroring = mirrorMap[ mirroring ];
		this.prgMode = prgMode;
		this.chrMode = chrMode;

		this.setPRGBanks();
	},

	setRegister: function( address, value ) {
		switch( address & 0x6000 ) {
		case 0x0000:
			this.mapperControl( value );
			break;
		case 0x2000:
			this.chrBank0 = value;
			this.setChrBanks();

			break;
		case 0x4000:
			this.chrBank1 = value;
			this.setChrBanks();

			break;
		case 0x6000:
			// TODO -- enable/disable RAM on bit 5
			value &= 0xf;

			this.prgBank = value;
			this.setPRGBanks();

			break;
		}

		this.registerWrites = 0;
		this.registerShift = 0;
	},

	setPRGBanks: function() {
		var bank0, bank1;

		switch( this.prgMode ) {
		case 0:	
		case 1:
			bank0 = this.prgBank & ~1;
			bank1 = this.prgBank + 1;
			break;
		case 2:
			bank0 = 0;
			bank1 = this.prgBank;
			break;
		case 3:
			bank0 = this.prgBank;
			bank1 = this.lastPRG;
			break;
		}

		this.loadPRGBank( 0x8000, bank0, 0x4000 );
		this.loadPRGBank( 0xc000, bank1, 0x4000 );
	},

	setChrBanks: function() {
		var bank0, bank1;

		if ( !this.chrMode ) {
			bank0 = this.chrBank0 & ~1;
			bank1 = bank0 + 1;
		} else {
			bank0 = this.chrBank0;
			bank1 = this.chrBank1;

			if ( this.chrBanks < 2 ) {
				bank0 &= 1;
				bank1 &= 1;
			}
		}

		this.loadCHRBank( 0, bank0, 0x1000 );
		this.loadCHRBank( 0x1000, bank1, 0x1000 );
	},

	writeRegister: function( address, value ) {
		// TODO ignore consecutive writes
		if ( value & 0x80 ) {
			// reset mapper register

			this.registerShift = 0;
			this.registerWrites = 0;
			this.mapperControl( this.mapperFlags | 0xc );
		} else {
			// write to register

			this.registerShift = ( this.registerShift >> 1 ) | (( value & 1 ) << 4);
			this.registerWrites++;

			if ( this.registerWrites === 5 ) {
				this.setRegister( address, this.registerShift );
			}
		}
	}
};
},{}],19:[function(require,module,exports){
module.exports = {
	init: function() {
		this.setPrgBank( 0 );

		this.mmc2PRG = this.prgBanks << 1;
		this.loadPRGBank( 0xa000, this.mmc2PRG - 3, 0x2000 );
		this.loadPRGBank( 0xc000, this.mmc2PRG - 2, 0x2000 );
		this.loadPRGBank( 0xe000, this.mmc2PRG - 1, 0x2000 );

		this.chrLatch0 = false;
		this.chrLatch1 = false;

		this.chrBank0 = this.chrBank1 = 0;
		this.chrBank2 = this.chrBank3 = 0;

		this.chrBankA = this.chrBank0;
		this.chrBankB = this.chrBank1;

		this.setChrBanks();

		this.initLatchSwitches();

		this._readCHR = Object.getPrototypeOf( this ).readCHR;
	},

	initLatchSwitches: function() {
		var i,
			switches = new Uint8Array( 0x2000 );
		switches[ 0xfd8 ] = 1;
		switches[ 0xfe8 ] = 2;

		for ( i = 0x1fd8; i < 0x1fe0; i++ ) {
			switches[ i ] = 3;
		}
		for ( i = 0x1fe8; i < 0x1ff0; i++ ) {
			switches[ i ] = 4;
		}

		this.latchSwitches = switches;
	},

	setChrBanks: function() {
		var bank0 = ( this.chrLatch0 ? this.chrBank1 : this.chrBank0 ),
			bank1 = ( this.chrLatch1 ? this.chrBank3 : this.chrBank2 );

		this.loadCHRBank( 0x0000, bank0, 0x1000 );
		this.loadCHRBank( 0x1000, bank1, 0x1000 );
	},

	setPrgBank: function( bank ) {
		this.prgBank = bank;
		this.loadPRGBank( 0x8000, this.prgBank, 0x2000 );
	},

	writeRegister: function( address, value ) {
		switch ( address & 0x7000 ) {
		case 0x2000:
			// $a000 - $afff
			this.setPrgBank( value & 0xf );
			break;
		case 0x3000:
			// $b000 - $bfff
			this.chrBank0 = value & 0x1f;
			break;
		case 0x4000:
			// $c000 - $cfff
			this.chrBank1 = value & 0x1f;
			break;
		case 0x5000:
			// $d000 - $dfff
			this.chrBank2 = value & 0x1f;
			break;
		case 0x6000:
			// $e000 - $efff
			this.chrBank3 = value & 0x1f;
			break;
		case 0x7000:
			// $f000 - $ffff
			this.mirroring = +!( value & 1 );
			break;
		}

		this.setChrBanks();
	},

	readCHR: function( address ) {
		var value = this._readCHR( address );

		switch ( this.latchSwitches[address] ) {
		case 0:
			break;
		case 1:
			if ( this.chrLatch0 ) {
				this.chrLatch0 = false;
				this.setChrBanks();
			}
			break;
		case 2:
			if ( !this.chrLatch0 ) {
				this.chrLatch0 = true;
				this.setChrBanks();
			}
			break;
		case 3:
			if ( this.chrLatch1 ) {
				this.chrLatch1 = false;
				this.setChrBanks();
			}
			break;
		case 4:
			if ( !this.chrLatch1 ) {
				this.chrLatch1 = true;
				this.setChrBanks();
			}
			break;
		}

		return value;
	}
};
},{}],20:[function(require,module,exports){
module.exports = {
	init: function() {
		this.lastA14 = 0;
		this.irqEnabled = false;
		this.irqCounter = 0;
		this.irqCounterReset = 0;
		this.willReloadIRQ = false;

		this.prgBank0 = 0;
		this.prgBank1 = 1;
		this.prgBase0 = 0x8000;
		this.prgBase1 = 0xa000;
		this.mmc3PRG = this.prgBanks << 1;
		this.lastPRG = this.mmc3PRG - 1;
		this.lastPRG2 = this.lastPRG - 1;

		this.mmc3CHR = this.chrBanks << 3;

		this.setBankSelect( 0 );

		this._readCHR = Object.getPrototypeOf( this ).readCHR;
	},

	setBankSelect: function( value ) {
		var prgMode = +!!( value & 0x40 ),
			chrMode = +!!( value & 0x80 );

		this.bankSelectMode = value & 7;

		if ( prgMode !== this.prgMode ) {
			this.setPRGMode( prgMode );
		} 
		if ( chrMode !== this.chrMode ) {
			this.setCHRMode( chrMode );
		}
	},

	setPRGMode: function( mode ) {
		this.prgMode = mode;

		if ( mode ) {
			this.loadPRGBank( 0x8000, this.lastPRG2, 0x2000 );
			this.prgBase0 = 0xc000;
		} else {
			this.loadPRGBank( 0xc000, this.lastPRG2, 0x2000 );
			this.prgBase0 = 0x8000;
		}

		this.loadPRGBank( 0xe000, this.lastPRG, 0x2000 );
		this.prgBase1 = 0xa000;

		this.setPRGBanks();
	},

	setBank: function( value ) {
		var bank = 0,
			base = 0;

		switch ( this.bankSelectMode ) {
		case 1:
			bank = 1;
			/* falls through */
		case 0:
			base = this.chrBigBase + bank * 0x800;
			this.loadCHRBank( base, value & ~1, 0x400 );
			this.loadCHRBank( base + 0x400, value | 1, 0x400 );
			break;
		case 2:
		case 3:
		case 4:
		case 5:
			bank = this.bankSelectMode - 2;
			base = this.chrSmallBase + ( bank * 0x400 );
			this.loadCHRBank( base, value, 0x400 );
			break;
		case 6:
			this.prgBank0 = value & ( this.mmc3PRG - 1 );
			this.setPRGBanks();
			break;
		case 7:
			this.prgBank1 = value & ( this.mmc3PRG - 1 );
			this.setPRGBanks();
			break;
		}
	},

	setPRGBanks: function() {
		this.loadPRGBank( this.prgBase0, this.prgBank0, 0x2000 );
		this.loadPRGBank( this.prgBase1, this.prgBank1, 0x2000 );
	},

	setCHRMode: function( mode ) {
		this.chrMode = mode;

		if ( mode ) {
			this.chrBigBase = 0x1000;
			this.chrSmallBase = 0;
		} else {
			this.chrBigBase = 0;
			this.chrSmallBase = 0x1000;
		}
	},

	setMirroring: function( value ) {
		this.mirroring = +!( value & 1 );
	},

	setRAMProtect: function() {
		// TODO, implement
	},

	reloadIRQ: function() {
		this.willReloadIRQ = true;
	},

	setIRQCounter: function( value ) {
		this.irqCounterReset = value;
	},

	enableIRQ: function( enabled ) {
		this.irqEnabled = enabled;

		// TODO: should acknowledge any pending interrupts if !enabled?
	},

	writeRegister: function( address, value ) {
		var odd = ( address & 1 );

		switch( address & 0x6000 ) {
		case 0x0000:
			// $8000 - $9fff
			if ( odd ) {
				this.setBank( value );
			} else {
				// even
				this.setBankSelect( value );
			}
			break;
		case 0x2000:
			// $a000 - $bfff
			if ( odd ) {
				this.setRAMProtect( value );
			} else {
				// even
				this.setMirroring( value );
			}
			break;
		case 0x4000:
			// $c000 - $dfff
			if ( odd ) {
				this.reloadIRQ();
			} else {
				// even
				this.setIRQCounter( value );
			}
			break;
		case 0x6000:
			// $e000 - $ffff
			this.enableIRQ( !!odd );
			break;
		}
	},

	readCHR: function( address ) {
		var a14 = address & 0x1000;

		if ( a14 && ( a14 !== this.lastA14 ) ) {
			this.clockScanlineCounter();
		}

		this.lastA14 = a14;

		return this._readCHR( address );
	},

	clockScanlineCounter: function() {
		if( this.willReloadIRQ || !this.irqCounter ) {
			this.irqCounter = this.irqCounterReset;
			this.willReloadIRQ = false;
		} else {
			this.irqCounter--;

			if ( !this.irqCounter && this.irqEnabled ) {
				this.system.cpu.requestIRQ();
			}
		}
	}
};
},{}],21:[function(require,module,exports){
module.exports = {
	init: function() {
		var nrom128 = ( this.prgBanks === 1 );

		if ( nrom128 ) {
			this.loadPRGBank( 0x8000, 0, 0x4000 );
			this.loadPRGBank( 0xc000, 0, 0x4000 );
		} else {
			this.loadPRGBank( 0x8000, 0, 0x8000 );
		}
	},

	readCHR: function( address ) {
		return this.chrData[ address ]; 
	},

	writeCHR: function( address, value ) {
		if ( !this.chrBanks ) {
			// TODO, probably not doing this right for all ROMs (eg, ROMs that have both CHR ROM *and* CHR RAM)
			this.chrData[ address ] = value;
		}

		return value;
	}
};
},{}],22:[function(require,module,exports){
module.exports = {
	init: function() {
		this.prgBank = 0;
		this.loadPRGBank( 0x8000, this.prgBank, 0x4000 );
		this.loadPRGBank( 0xc000, this.prgBanks - 1, 0x4000 );
	},

	writeRegister: function( address, value ) {
		this.prgBank = value & 0xf; // TODO, difference between UNROM and UOROM?
		this.loadPRGBank( 0x8000, this.prgBank, 0x4000 );
	}
};
},{}],23:[function(require,module,exports){
"use strict";

function Memory( system ) {
	var i = 0;

	this.system = system;

	this.ram = new Uint8Array( 0x0800 );

	// initialize RAM to 0xff
	for ( ; i < 0x0800; i++ ) {
		this.ram[ i ] = 0xff;
	}

	this.address = 0;

	this.cartridge = null;

	Object.preventExtensions( this );
}

Memory.prototype = {
	loadCartridge: function( cartridge ) {
		this.cartridge = cartridge;
	},

	readWrite: function( address, write, value ) {
		this.address = address; // TODO, do I use this anywhere?

		switch ( address ) {
		case 0x4014:
			// OAM DMA, write-only
			if ( write ) {
				var i, base = value << 8;

				for ( i = 0; i < 0x100; i++ ) {
					this.write( 0x2004, this.read( base + i ) );
				}

				this.system.cpu.burn(513);
			}
			return 0;
		case 0x4016:
			// read controller 1, or write controller strobe
			if ( write) {
				this.system.controllers.write( value );
				return 0;
			} else {
				return this.system.controllers.read( 0 );
			}
			break;
		case 0x4017:
			// read controller 2
			if ( write ) {
				// do nothing, APU frame counter
			} else {
				return this.system.controllers.read( 1 );
			}
		}

		if ( address >= 0x4020 ) {
			// address is in cartridge space
			if ( write ) {
				return this.system.cartridge.writePRG( address, value );
			} else {
				return this.system.cartridge.readPRG( address );
			}
		} else if ( address < 0x2000 ) {
			address &= 0x07ff;

			// RAM
			if ( write ) {
				this.ram[ address ] = value;
				return 0;
			} else {
				return this.ram[ address ];
			}
		} else if ( address < 0x4000 ) {
			// PPU registers
			address &= 7;
			if ( write ) {
				return this.system.ppu.writeRegister( address, value );
			} else {
				return this.system.ppu.readRegister( address );
			}
		} else { // 0x4000 <= address < 0x4020
			// APU registers
			address &= 0xff;
			if ( write ) {
				return this.system.apu.writeRegister( address, value );
			} else {
				return this.system.apu.readRegister( address );
			}
		}
	},

	read: function( address ) {
		return this.readWrite( address, false, 0 );
	},

	write: function( address, value ) {
		return this.readWrite( address, true, value );
	}
};

module.exports = Memory;
},{}],24:[function(require,module,exports){
function AudioOutput() {
	this.bufferIndex = 0;
	this.bufferLength = 8192;
	this.sampleRate = 44100; // will be overwritten by AudioContext sample rate
	this.volume = 1.0;

	this.playing = null;

	this.setEnabled( true );
}

AudioOutput.prototype = {
	/**
	 * Write sample to buffer.
	 */
	writeSample: function( sample ) {
		this.bufferData[ this.bufferIndex++ ] = sample;

		if ( this.bufferIndex === this.bufferLength ) {
			this.bufferIndex = 0;

			if ( this.playing ) {
				this.playing.stop();
			}
			
			this.bufferSource.buffer = this.buffer;
			this.playing = this.bufferSource;
			this.playing.start( 0 );

			this.initBuffer();
		}
	},

	/**
	 * Enable or disable audio output.
	 * Note: only actually enabled if audio is supported.
	 * @param {boolean} enabled - Sets whether enabled or not.
	 */
	setEnabled: function( enabled ) {
		this.enabled = enabled && this.isSupported();

		if ( this.enabled ) {
			this.initContext();
			this.initBuffer();
		}
	},

	/**
	 * Set volume of audio output.
	 * @param {number} value - The volume, ranging from 0.0 to 1.0 (inclusive).
	 */
	setVolume: function( value ) {
		this.gainNode.gain.value = value;
		this.volume = value;
	},

	/**
	 * Initialize audio context.
	 */
	initContext: function() {
		this.context = new AudioContext();
		this.sampleRate = this.context.sampleRate;
		this.gainNode = this.context.createGain();
		this.gainNode.connect( this.context.destination );
	},

	/**
	 * Initialize audio buffer.
	 */
	initBuffer: function() {
		this.buffer = this.context.createBuffer(1, this.bufferLength, this.context.sampleRate);
		this.bufferData = this.buffer.getChannelData( 0 );

		this.bufferSource = this.context.createBufferSource();
		this.bufferSource.connect( this.gainNode );
	},

	/**
	 * Check if audio output is supported.
	 */
	isSupported: function() {
		return ( typeof AudioContext !== "undefined" );
	}
};

module.exports = AudioOutput;
},{}],25:[function(require,module,exports){
var AudioOutput = require("./audiooutput");
var VideoOutput = require("./videooutput");

function Output() {
	this.audio = new AudioOutput();
	this.video = new VideoOutput();
}

module.exports = Output;
},{"./audiooutput":24,"./videooutput":29}],26:[function(require,module,exports){
var palette = require("./palette").data;

function Canvas2DRenderer( el ) {
	this.el = el;

	this.initData();
	this.initPalette();
}

Canvas2DRenderer.isSupported = function( el ) {
	return !!getContext( el );
};

Canvas2DRenderer.prototype = {
	renderFrame: function( output ) {
		var bgBuffer = output.bgBuffer,
		    spriteBuffer = output.spriteBuffer,
		    prioBuffer = output.prioBuffer,
		    bgColor = output.bgColor,

		    reds = this.reds,
		    greens = this.greens,
		    blues = this.blues,

		    end = bgBuffer.length;
		    data = this.data;

		var pixelIndex = 0,
			outputIndex = 0,
			color = 0;

		for ( ; pixelIndex < end; pixelIndex++ ) {
			color = bgBuffer[ pixelIndex ];
			if ( spriteBuffer[ pixelIndex ] && !( prioBuffer[ pixelIndex ] && color ) ) {
				color = spriteBuffer[ pixelIndex ];
			}
			color = ( color || bgColor );

			data[ outputIndex++ ] = reds[ color ];
			data[ outputIndex++ ] = greens[ color ];
			data[ outputIndex++ ] = blues[ color ];
			outputIndex++; // skip alpha channel
		}

		this.image.data.set( data );
		this.context.putImageData( this.image, 0, 0 );
	},

	/**
	 * Initialize the video output.
	 */
	initData: function() {
		this.width = 256;
		this.height = 224;
		this.data = new Uint8Array( this.width * this.height * 4 );

		for ( var i = 0; i < this.data.length; i++  ) {
			this.data[ i ] = 0xff;
		}

		this.context = getContext( this.el );
		this.image = this.context.getImageData( 0, 0, this.width, this.height );

		this.index = 0;
	},

	/**
	 * Initialize palette for video output.
	 */
	initPalette: function() {
		var color = 0,
		    i = 0,
		    address = 0,
		    view = palette,
		    buffer = new ArrayBuffer( 0xc0 ),
		    splitPalette = new Uint8Array( buffer );

		// first, re-arrange RGB values in a single array (first reds, then blues, then greens)
		for ( color = 0; color < 3; color +=1 ) {
			for ( i = 0; i < 192; i += 3 ) {
				splitPalette[ address ] = view[ i + color ];
				address += 1;
			}
		}

		// then, make color values separately available in separate arrays:
		this.palette = view;
		this.reds = new Uint8Array( buffer, 0, 0x40 );
		this.greens = new Uint8Array( buffer, 0x40, 0x40 );
		this.blues = new Uint8Array( buffer, 0x80, 0x40 );
	}
};

function getContext( el ) {
	return el.getContext( "2d" );
}

module.exports = Canvas2DRenderer;
},{"./palette":27}],27:[function(require,module,exports){
exports.data = new Uint8Array([102,102,102,0,42,136,20,18,167,59,0,164,92,0,126,110,0,64,108,7,0,86,29,0,51,53,0,12,72,0,0,82,0,0,79,8,0,64,77,0,0,0,0,0,0,0,0,0,173,173,173,21,95,217,66,64,255,117,39,254,160,26,204,183,30,123,181,49,32,153,78,0,107,109,0,56,135,0,13,147,0,0,143,50,0,124,141,0,0,0,0,0,0,0,0,0,255,255,255,100,176,255,146,144,255,198,118,255,242,106,255,255,110,204,255,129,112,234,158,34,188,190,0,136,216,0,92,228,48,69,224,130,72,205,222,79,79,79,0,0,0,0,0,0,255,255,255,192,223,255,211,210,255,232,200,255,250,194,255,255,196,234,255,204,197,247,216,165,228,229,148,207,239,150,189,244,171,179,243,204,181,235,242,184,184,184,0,0,0,0,0,0]);
},{}],28:[function(require,module,exports){
var palette = require("./palette").data;

function WebGLRenderer( el ) {
	this.el = el;

	this.initGL();	
}

WebGLRenderer.isSupported = function( el ) {
	return !!getGL( el );
};

WebGLRenderer.prototype = {
	renderFrame: function( output ) {
		var gl = this.gl;

		gl.clearColor( 0, 0, 0, 1 );
		gl.clear( gl.COLOR_BUFFER_BIT );

		// upload background pixels
		gl.activeTexture( gl.TEXTURE0 );
		gl.bindTexture( gl.TEXTURE_2D, this.bgTexture );
		gl.texImage2D( gl.TEXTURE_2D, 0, gl.LUMINANCE, 256, 224, 0,	gl.LUMINANCE, gl.UNSIGNED_BYTE,	output.bgBuffer );

		// upload sprite pixels
		gl.activeTexture( gl.TEXTURE1 );
		gl.bindTexture( gl.TEXTURE_2D, this.spriteTexture );
		gl.texImage2D( gl.TEXTURE_2D, 0, gl.LUMINANCE, 256, 224, 0,	gl.LUMINANCE, gl.UNSIGNED_BYTE,	output.spriteBuffer );

		// upload sprite priority pixels
		gl.activeTexture( gl.TEXTURE2 );
		gl.bindTexture( gl.TEXTURE_2D, this.prioTexture );
		gl.texImage2D( gl.TEXTURE_2D, 0, gl.LUMINANCE, 256, 224, 0,	gl.LUMINANCE, gl.UNSIGNED_BYTE,	output.prioBuffer );

		// activate palette texturre
		gl.activeTexture( gl.TEXTURE3 );
		gl.bindTexture( gl.TEXTURE_2D, this.paletteTexture );

		var positionLocation = gl.getAttribLocation( this.program, "vertCoord" );
		gl.enableVertexAttribArray( positionLocation );
		gl.vertexAttribPointer( positionLocation, 2, gl.FLOAT, false, 0, 0 );

		// set default background color
		var color = output.bgColor * 3;
		gl.uniform4f( this.bgColorLocation, palette[ color ] / 256, palette[ color + 1 ] / 256 , palette[ color + 2 ] / 256, 1.0  );

		gl.drawArrays( gl.TRIANGLES, 0, 6 );
	},

	initGL: function() {
		var gl = this.gl = getGL( this.el );

		// set up viewport
		gl.viewport( 0, 0, 256, 224 );

		// initialize everything we need to enable rendering
		this.initShaders();
		this.initProgram();
		this.initBuffers();
		this.initTextures();

		// initialize background color variable
		this.bgColorLocation = gl.getUniformLocation(this.program, "bgColor");
	},

	/**
	 * Initialize the quad to draw to.
	 */
	initBuffers: function() {
		var gl = this.gl;

		var buffer = this.buffer = gl.createBuffer();
		gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
		gl.bufferData(
			gl.ARRAY_BUFFER,
			new Float32Array([
				-1.0, -1.0, 
				1.0, -1.0,
				-1.0,  1.0,
				-1.0,  1.0,
				1.0, -1.0,
				1.0,  1.0
			]),
			gl.STATIC_DRAW
		);
	},

	/**
	 * Initialize textures.
	 * One 'dynamic' texture that contains the screen pixel data, and one fixed texture containing
	 * the system palette.
	 */
	initTextures: function() {
		var gl = this.gl,
		      program = this.program;


		// initialize pixel textures
		this.bgTexture = createTexture( 0, "bgTexture" );
		this.spriteTexture = createTexture( 1, "spriteTexture" );
		this.prioTexture = createTexture( 2, "prioTexture" );

		// initialize palette texture
		this.paletteTexture = createTexture( 3, "paletteTexture" );
		gl.texImage2D( gl.TEXTURE_2D, 0, gl.RGB, 64, 1, 0, gl.RGB, gl.UNSIGNED_BYTE, palette );

		function createTexture( index, name ) {
			var texture = gl.createTexture();
			gl.bindTexture(gl.TEXTURE_2D, texture);

			gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
			gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
			gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
			gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

			gl.uniform1i(gl.getUniformLocation(program, name), index);

			return texture;
		}
	},

	/**
	 * Initialize WebGL shaders.
	 */
	initShaders: function() {
		var gl = this.gl;

		var fragmentShaderSource = [
			"precision mediump float;",
			"uniform sampler2D bgTexture;",
			"uniform sampler2D spriteTexture;",
			"uniform sampler2D prioTexture;",
			"uniform sampler2D paletteTexture;",
			"uniform vec4 bgColor;",
			"varying vec2 texCoord;",

			"void main(void) {",
				"float bgIndex = texture2D(bgTexture, texCoord).r;",
				"float spriteIndex = texture2D(spriteTexture, texCoord).r;",
				"float prioIndex = texture2D(prioTexture, texCoord).r;",
				"float colorIndex = ((spriteIndex > 0.0 && (prioIndex == 0.0 || bgIndex == 0.0)) ? spriteIndex : bgIndex);",
				"vec4 color = texture2D(paletteTexture, vec2( colorIndex * 4.0 + 0.0078, 0.5));", // 0.0078 == ( 0.5 * 3 / 192 ) === ( 0.5 * [RGB colors] / [palette width] )
				"if ( colorIndex > 0.0 ) {",
					"gl_FragColor = color;",
				"} else {",
					"gl_FragColor = vec4(1.0, 0.0, 0.0, 1.0);",
					"gl_FragColor = bgColor;",
				"}",
			"}"
		].join("\n");

		var vertexShaderSource = [
			"attribute vec2 vertCoord;",
			"varying vec2 texCoord;",

			"void main() {",
				"gl_Position = vec4(vertCoord, 0, 1);",
				"texCoord = vec2( 0.5 * ( vertCoord.x + 1.0 ), 0.5 * (1.0 - vertCoord.y));",
			"}"
		].join("");

		this.fragmentShader = compileShader( gl.FRAGMENT_SHADER, fragmentShaderSource );
		this.vertexShader = compileShader( gl.VERTEX_SHADER, vertexShaderSource );

		function compileShader( shaderType, shaderSource ) {
			var shader = gl.createShader( shaderType );
			gl.shaderSource( shader, shaderSource );
			gl.compileShader( shader );

			if ( !gl.getShaderParameter( shader, gl.COMPILE_STATUS ) ) {  
				throw ( "An error occurred compiling the shaders: " + gl.getShaderInfoLog( shader ) );
			}

			return shader;
		}
	},

	/**
	 * Initialize WebGL program.
	 */
	initProgram: function() {
		var gl = this.gl;

		var program = gl.createProgram();
		gl.attachShader( program, this.vertexShader );
		gl.attachShader( program, this.fragmentShader );
		gl.linkProgram( program );	
		gl.useProgram( program );

		this.program = program;
	}
};

function getGL( el ) {
	return ( el.getContext( "webgl" ) || el.getContext( "experimental-webgl" ) );
}

module.exports = WebGLRenderer;
},{"./palette":27}],29:[function(require,module,exports){
var WebGLRenderer = require( "./renderer/webgl" ),
    Canvas2DRenderer = require( "./renderer/canvas2d" );

function VideoOutput() {
	var width = 256,
	      height = 225,
	      length = width * height;

	this.pixelBuffer = new Uint8Array( length );
	this.bgBuffer = new Uint8Array( length );
	this.spriteBuffer = new Uint8Array( length );
	this.prioBuffer = new Uint8Array( length );

	this.index = 0;
	this.bgColor = 0;
}

VideoOutput.prototype = {
	force2D: false, // force 2d canvas rendering over WebGL

	/**
	 * 'run' method for WebGL mode.
	 */
	run: function() {
		var self = this;

		requestAnimationFrame(function flush() {
			requestAnimationFrame( flush );

			self.renderer.renderFrame( self );
		});		
	},

	/**
	 * Reset output pixel position.
	 */
	reset: function( bgColor ) {
		this.index = 0;
		this.bgColor = bgColor;
	},

	/**
	 * Set screen color intensity.
	 * TODO: actually support this.
	 */
	setIntensity: function( red, green, blue ) {
		// jshint unused: false
		// do nothing for now
	},

	/**
	 * Switch grayscale mode.
	 * TODO: actually support this.
	 */
	setGrayscale: function( grayscale ) {
		// jshint unused: false
		// do nothing for now
	},

	/**
	 * Output a scanline.
	 * @param {Uint8Array} background - Scanline background buffer
	 * @param {Uint8Array} sprites - Scanline sprite buffer
	 * @param {Uint8Array} priorities - Scanline sprite priority buffer
	 */
	outputScanline: function( background, sprites, priorities ) {
		this.bgBuffer.set( background, this.index );
		this.spriteBuffer.set( sprites, this.index );
		this.prioBuffer.set( priorities, this.index );
		this.index += 256;
	},

	/**
	 * Connect video output to a Canvas DOM element.
	 */
	setElement: function( el ) {
		this.el = el;	

		this.initRenderer();
	},

	/**
	 * Initialize renderer.
	 */
	initRenderer: function() {
		if ( !this.force2D && WebGLRenderer.isSupported( this.el ) ) {
			this.renderer = new WebGLRenderer( this.el );
		} else if ( Canvas2DRenderer.isSupported( this.el ) ) {
			this.renderer = new Canvas2DRenderer( this.el );
		} else {
			throw new Error( "No supported renderer!" );
		}
	}
};

module.exports = VideoOutput;
},{"./renderer/canvas2d":26,"./renderer/webgl":28}],30:[function(require,module,exports){
"use strict";

var bitmap = require( "../utils/bitmap" );

// bitmasks
var NAMETABLE_BITMASK = 0xc00,
    NAMETABLE_RESET = ~NAMETABLE_BITMASK,

    attrAddresses = initAttrAddresses(),
    tileCycles = initTileCycles(),
    palettes = initPalettes(),
    masks = initMasks();

function Background( ppu ) {
	this.ppu = ppu;
	this.memory = ppu.memory;

	this.enabled = true;
	this.enabledLeft = true;
	this.pixelOffset = 0;

	this.loopyV = 0;
	this.loopyT = 0;
	this.loopyW = 0;
	this.loopyX = 0;

	this.baseTable = 0;

	this.x = 0;
	this.y = 0;

	this.scanlineColors = new Uint8Array( 0x100 );
	this.scanlineReset = new Uint8Array( 0x100 );

	Object.preventExtensions( this );
}

Background.prototype = {
	toggle: function( flag ) {
		this.enabled = !!flag;
	},

	toggleLeft: function( flag ) {
		this.enabledLeft = !!flag;
	},

	writeAddress: function( value ) {
		if ( this.loopyW ) {
			value &= 0xff;
			this.loopyT = ( this.loopyT & 0xff00 ) | value;
			this.loopyV = this.loopyT;
		} else {
			value &= 0x3f; // only use lowest 6 bits
			value = value << 8;
			this.loopyT = ( this.loopyT & 0x00ff ) | value; // note, also resets bit 14 of loopy_t (for unknown reason)
		}

		this.loopyW = !this.loopyW;
	},

	writeScroll: function( value ) {
		if ( this.loopyW ) {
			// set vertical scroll
			this.loopyT = this.loopyT & ~0x73e0;
			this.loopyT = this.loopyT | ( (value & 0x7) << 12 );
			this.loopyT = this.loopyT | ( (value & 0xf8) << 2 );

			this.loopyW = 0;
		} else {
			// set horizontal scroll
			this.loopyT = this.loopyT & 0x7fe0;
			this.loopyT |= ( value >> 3 );

			this.loopyX = value & ( 0x7 );

			this.loopyW = 1;
		}
	},

	evaluate: function() {
		var ppu = this.ppu,
		    lineCycle = ppu.lineCycle;

		if ( tileCycles[ lineCycle ] ) {
			this.fetchTile();
		}

		// finish initialization of loopy_v from loopy_t at end of pre-render scanline
		if ( 
			ppu.scanline === -1 &&
			lineCycle > 280 &&
			lineCycle < 304
		) {
			// copy vertical bits from loopy_t to loopy_v
			this.loopyV = ( this.loopyV & 0x41f ) | ( this.loopyT & 0x7be0 );
			//this.oddY = false;
		}
	},

	initScanline: function() {
		this.pixelOffset = ( this.enabledLeft ? 0 : 8 );
	},

	endScanline: function() {
		// increment coarse X position every 8th cycle
		this.incrementVY();

		// reset horizontal at end of scanline
		// copy horizontal bits from loopy_t to loopy_v
		// TODO: should actually happen on *next* cycle, is this OK?
		this.loopyV = ( this.loopyV & 0x7be0 ) | ( this.loopyT & 0x41f );

		this.scanlineColors.set( this.scanlineReset );
		this.x = -this.loopyX;
	},

	/**
	 * Increment coarse X scroll in loopy_v.
	 */
	incrementVX: function() {
		if ( ( this.loopyV & 0x1f ) === 31 ) {
			// coarse X is maxed out, wrap around to next nametable
			this.loopyV = ( this.loopyV & ( 0xffff & ~0x1f ) ) ^ 0x0400;
		}
		else {
			// we can safely increment loopy_v (since X is in the lowest bits)
			this.loopyV += 1;
		}

		this.x += 8;
	},

	/**
	 * Increment Y scroll in loopy_v.
	 * TODO optimizations
	 */
	incrementVY: function() {
		if ((this.loopyV & 0x7000) != 0x7000) {
			// fine Y < 7: increment
			this.loopyV += 0x1000;
		} else {
			// fine Y at maximum: reset fine Y, increment coarse Y
			this.loopyV &= ~0x7000; 

			var coarseY = (this.loopyV & 0x03e0) >>> 5;
			if (coarseY == 29) {
				// switch vertical nametable
				coarseY = 0;
				this.loopyV ^= 0x0800;
			} else if (coarseY == 31) {
				// reset coarse Y without switching nametable
				coarseY = 0;
			} else {
				// simply increment coarse Y
				coarseY += 1;
			}

			// set coarse Y in loopy_v
			this.loopyV = (this.loopyV & ~0x03e0) | (coarseY << 5);
		}

		this.y = ( this.loopyV & 0x7000 ) >> 12;
	},

	/**
	 * Fetch background tile data.
	 */
	fetchTile: function() {
		var cartridge = this.memory.cartridge,

		      attrAddress = attrAddresses[ this.loopyV ],
		      attribute = cartridge.readNameTable( attrAddress & 0x1fff ),

		      nametableAddress = 0x2000 | ( this.loopyV & 0x0fff ),
		      tileIndex = cartridge.readNameTable( nametableAddress & 0x1fff ),
	          tile = cartridge.readTile( this.baseTable, tileIndex, this.y );

		if ( tile ) {
			this.renderTile(
				tile,
				palettes[ attribute & masks[ this.loopyV & 0xfff ] ]
			);
		}

		this.incrementVX();
	},

	renderTile: function( tile, palette ) {
		var colors = bitmap.getColors( tile),
		    color = 0,
		    begin = Math.max( this.pixelOffset, this.x ),
		    end = Math.min( 0xff, this.x + 7 ),
		    i = 7 - ( end - begin );

		for ( ; end >= begin; end-- ) {
		    color = colors[ i++ ];

			if ( color ) {
				this.scanlineColors[ end ] = this.ppu.memory.palette[ palette | color ];
			}
		}
	},

	setNameTable: function( index ) {
		this.loopyT = ( this.loopyT & NAMETABLE_RESET ) | ( index << 10 );
	}
};

/**
 * Initialize attribute address lookup table.
 * Maps loopy_v values to attribute addresses.
 */
function initAttrAddresses() {
	var i,
	    result = new Uint16Array( 0x8000 );

	for ( i = 0; i < 0x8000; i++ ) {
		result[ i ] = 0x23c0 | (i & 0x0c00) | ((i >> 4) & 0x38) | ((i >> 2) & 0x07);
	}

	return result;
}

/**
 * Inititialze mask lookup table.
 * Maps loopy_v values to bitmasks for attribute bytes to get the correct palette value.
 */
function initMasks() {
	var i, mask,
	    result = new Uint8Array( 0x10000 );

	for ( i = 0; i < 0x10000; i++ ) {
		mask = 3;
		if ( i & 0x2 ) {
			// right
			mask <<= 2;
		}
		if ( i & 0x40 ) {
			// bottom
			mask <<= 4;
		}

		result[ i ] = mask;
	}

	return result;
}

/**
 * Initialize tile palette lookup table.
 * Maps ( attribute byte & mask ) to palette value.
 */
function initPalettes() {
	var i, j,
	    result = new Uint8Array( 0x100 );

	for ( i = 0; i < 4; i++ ) {
		for ( j = 0; j < 8; j += 2 ) {
			result[ i << j ] = i << 2; // shift by 2 places, so value can be easily ORed with color
		}
	}

	return result;
}

/**
 * Initialize tile fetch cycles.
 * Returns a typed array containing a 1 at every cycle a background tile should be fetched.
 */
function initTileCycles() {
	var i,
	    result = new Uint8Array( 400 );

	for ( i = 7; i < 256; i += 8 ) {
		result[ i ] = 1;
	}
	for ( i = 327; i < 336; i += 8 ) {
		result[ i ] = 1;
	}

	return result;
}

module.exports = Background;
},{"../utils/bitmap":34}],31:[function(require,module,exports){
"use strict";

var Background = require("./background");
var Sprites = require("./sprites");
var Memory = require("./memory");

function PPU( system ) {
	this.system = system;
	this.ram = new Uint8Array( 0x0800 );

	this.enabled = true;
	this.frameEnded = false;

	this.vBlank = false;
	this.warmup = 2;

	this.scanline = -1;
	this.lineCycle = 0;

	// control flags
	this.increment = 1;
	this.masterSlave = 0; // TODO, don't quite know what this is
	this.generateNMI = false; // TODO implement NMI

	// status flags
	this.sprite0Hit = false;
	this.nmiOccurred = false;
	this.checkNMI = false;

	// flags to check if a pixel should be output
	this.pixelInRange = false;
	this.yInRange = false;
	this.inRenderScanline = true;
	//this.inLeft8px = false;

	this.readBuffer = 0;
	this.countdown = 0;

	this.memory = new Memory( this );
	this.background = new Background( this );
	this.sprites = new Sprites( this );

	this.output = this.system.output.video;

	Object.preventExtensions( this );
}

PPU.prototype = {
	readStatus: function() {
		var result = (
			( !!this.nmiOccurred << 7 ) |
			( !!this.sprite0Hit << 6 ) |
			( !!this.sprites.spriteOverflow << 5 )
		);

		this.nmiOccurred = false;

		return result;
	},

	/**
	 * Set various flags to control video output behavior.
	 */
	mask: function( value ) {
		this.output.setGrayscale( value & 0x1 );
		this.output.setIntensity( value & 0x20, value & 0x40, value & 0x80 );

		this.sprites.toggle( value & 0x10 );
		this.sprites.toggleLeft( value & 0x4 );

		this.background.toggle( value & 0x8 );
		this.background.toggleLeft( value & 0x2 );

		this.enabled = ( this.sprites.enabled || this.background.enabled );
	},

	/**
	 * Set various flags to control rendering behavior.
	 */
	control: function( value ) {
		var nametableFlag = value & 0x3,
			incrementFlag = value & 0x4,
			spriteFlag = value & 0x8,
			backgroundFlag = value & 0x10,
			sizeFlag = value & 0x20,
			nmiFlag = value & 0x80;

		this.background.setNameTable( nametableFlag );

		this.increment = incrementFlag ? 32 : 1;
		this.sprites.baseTable = spriteFlag ? 0x1000 : 0x0000;
		this.background.baseTable = backgroundFlag ? 0x1000 : 0x0000;
		this.sprites.spriteSize = sizeFlag ? 16 : 8;
		this.generateNMI = !!nmiFlag;

		// TODO multiple NMIs can occure when writing to PPUCONTROL without reading
		// PPUSTATUS
	},

	readRegister: function( address ) {
		var result;

		switch ( address ) {
		case 2:
			result = this.readStatus();
			this.background.loopyW = 0; // also reset first write flag

			return result;
		case 4:
			return this.sprites.readOAM();
		case 7:
			// read from ppu memory

			// result is buffered and not only returned on next read
			result = this.readBuffer;
			this.readBuffer = this.memory.read( this.background.loopyV );

			// palette memory is not buffered ..
			if ( (this.background.loopyV & 0x3f00 ) === 0x3f00 ) {
				result = this.readBuffer;

				// but does put the mirrored nametable byte in the read buffer
				this.readBuffer = this.memory.read( this.background.loopyV & 0x2fff );
			}

			this.background.loopyV += this.increment; // TODO only outside of rendering

			return result;
		}
	},

	writeRegister: function( address, value ) {
		switch ( address ) {
		case 0:
			this.control( value );
			break;
		case 1:
			this.mask( value );
			break;
		case 3:
			this.sprites.oamAddress = value;
			break;
		case 4:
			this.sprites.writeOAM( value );

			// TODO, should actually do glitchy increment, see http://wiki.nesdev.com/w/index.php/PPU_registers

			break;
		case 5:
			this.background.writeScroll( value );

			break;
		case 6:
			this.background.writeAddress( value );
			
			break;
		case 7:
			this.memory.write( this.background.loopyV, value);
			this.background.loopyV += this.increment; // TODO only outside of rendering
			break;
		}
	},

	/**
	 * A single PPU tick.
	 */
	tick: function() {
		var sprites = this.sprites,
		    background = this.background;

		if ( this.inRenderScanline ) {
			if ( this.enabled ) {
				background.evaluate();
				sprites.evaluate();
			}

			if ( this.pixelInRange ) {
				if ( 
					this.pixelInRange &&
					sprites.sprite0InRange &&
					sprites.scanlineSprite0[ this.lineCycle - 1 ] &&
					!this.sprite0Hit
				) {
					this.sprite0Hit = !!background.scanlineColors[ this.lineCycle - 1 ];
				}
			}

			this.incrementRenderCycle();
		} else {
			this.incrementIdleCycle();
		}
	},

	incrementRenderCycle: function() {
		switch( ++this.lineCycle ) {
		case 1:
			this.background.initScanline();
			this.sprites.initScanline();
			this.pixelInRange = this.yInRange;

			break;
		case 257:
			this.pixelInRange = false;

			if ( this.yInRange ) {
				this.output.outputScanline(
					this.background.scanlineColors,
					this.sprites.scanlineColors,
					this.sprites.scanlinePriority
				);
			}

			if ( this.enabled ) {
				this.background.endScanline();
				this.sprites.endScanline();
			}

			break;
		case 341:
			this.incrementScanline();
			break;
		}
	},

	incrementIdleCycle: function() {
		if ( !(this.countdown--) ) {
			this.scanline = -1;
			this.frameEnded = true;
			this.inRenderScanline = true;

			this.vBlank = this.nmiOccurred = false;
			this.checkNMI = false;
			this.sprites.spriteOverflow = false;
			this.sprite0Hit = false;
		}
	},

	incrementScanline: function() {
		this.scanline++;
		this.lineCycle = 0;

		switch( this.scanline ) {
		case 8:
			this.output.reset( this.memory.palette[ 0 ] );
			this.yInRange = true;

			// at scanline === 8 because of overscan
			break;
		case 233:
			this.yInRange = false;

			// at scanline === 233 because of overscan
			break;
		case 240:
			this.inRenderScanline = false;

			this.vBlank = this.nmiOccurred = this.checkNMI = true;

			if ( this.generateNMI ) {
				this.system.cpu.requestNMI();
			}

			this.countdown = 6800;

			break;
		}
	}
};

module.exports = PPU;
},{"./background":30,"./memory":32,"./sprites":33}],32:[function(require,module,exports){
"use strict";

function Memory( ppu ) {
	this.ppu = ppu;
	this.system = ppu.system;
	this.palette = new Uint8Array( 0x20 );
	this.cartridge = null;

	Object.preventExtensions( this );
}

Memory.prototype = {
	loadCartridge: function( cartridge ) {
		this.cartridge = cartridge;
	},

	read: function( address ) {
		return this._readWrite( address, 0, 0 );
	},

	write: function( address, value ) {
		this._readWrite( address, value, 1 );
	},

	_readWrite: function( address, value, write ) {	
		var relativeAddress = 0;
		address &= 0x3fff;

		if ( !( address & ~0x1fff ) ) {
			if ( write ) {
				return this.cartridge.writeCHR( address, value );
			} else {
				return this.cartridge.readCHR( address );
			}
		} else if ( !( address & ~0x2fff ) ) {
			relativeAddress = address & 0x1fff;

			if ( write ) {
				this.cartridge.writeNameTable( relativeAddress, value );
				return 0;
			} else {
				return this.cartridge.readNameTable( relativeAddress );
			}
		} else if ( address < 0x3f00 ) {
			// mirror of 0x2000-0x2fff
			return this._readWrite( address - 0x1000, value, write );
		} else if ( address < 0x3fff ) {
			relativeAddress = address & 31;

			if ( 
				( (relativeAddress & 3) === 0 )
			) {
				relativeAddress &= ~16;
			}

			if ( write ) {
				this.palette[ relativeAddress ] = value;
				return 0;
			} else {
				return this.palette[ relativeAddress ];
			}

			return 0;
		}
	}	
};

module.exports = Memory;
},{}],33:[function(require,module,exports){
"use strict";

var bitmap = require("../utils/bitmap");

var tileCycles = initTileCycles();

function Sprites( ppu ) {
	this.ppu = ppu;
	this.memory = ppu.memory;

	this.enabled = true;
	this.enabledLeft = true;
	this.pixelOffset = 0;

	// OAM
	this.oamAddress = 0;
	this.oam = new Uint8Array( 0x100 );
	this.oam2 = new Uint8Array( 0x21 );
	this.oam2reset = new Uint8Array( this.oam2.length );
	for ( var i = 0; i < this.oam2reset.length; i++ ) {
		this.oam2reset[ i ] = 0xff;
	}

	this.spriteProgress = 0;
	this.currentSprite = 0;

	this.spriteSize = 8;
	this.baseTable = 0;

	this.sprite0Next = false;
	this.sprite0InRange = false;
	this.spriteOverflow = false;
	this.scanlineOverflow = false;
	this.spriteCount = 0;
	this.nextSpriteCount = 0;

	this.yCounters = new Uint8Array( 0x40 );
	this.yCountersReset = new Uint8Array( this.yCounters.length );

	this.nextScanlineSprite0 = new Uint8Array( 0x100 );
	this.nextScanlinePriority = new Uint8Array( 0x100 );
	this.nextScanlineColors = new Uint8Array( 0x100 );

	this.scanlineSprite0 = new Uint8Array( 0x100 );
	this.scanlinePriority = new Uint8Array( 0x100 );
	this.scanlineColors = new Uint8Array( 0x100 );

	this.scanlineReset = new Uint8Array( this.scanlineColors.length );

	Object.preventExtensions( this );
}

Sprites.prototype = {
	toggle: function( flag ) {
		this.enabled = !!flag;
	},

	toggleLeft: function( flag ) {
		this.enabledLeft = !!flag;
	},

	evaluate: function() {
		if ( tileCycles[ this.ppu.lineCycle ] ) {
			this.fetchTile();
		}
	},

	initScanline: function() {
		this.currentSprite = 0;
		this.sprite0InRange = this.sprite0Next;
		this.sprite0Next = false;
		this.scanlineOverflow = false;

		this.oamAddress = 0;

		this.clearSecondaryOAM();

		this.scanlineSprite0.set( this.nextScanlineSprite0 );
		this.scanlinePriority.set( this.nextScanlinePriority );
		this.scanlineColors.set( this.nextScanlineColors );

		if ( this.nextSpriteCount ) {
			this.nextScanlineSprite0.set( this.scanlineReset );
			this.nextScanlinePriority.set( this.scanlineReset );
			this.nextScanlineColors.set( this.scanlineReset );
		}

		this.spriteCount = this.nextSpriteCount;
		this.nextSpriteCount = 0;
	},

	endScanline: function() {
		this.initSecondaryOAM();
	},

	readOAM: function() {
		if ( this.ppu.vBlank ) { // TODO
			return this.oam[ this.oamAddress ];

			// TODO increment?
		}

		return 0;
	},

	writeOAM: function( value ) {
		if ( this.ppu.vBlank ) {
			this.oam[ this.oamAddress ] = value;
			this.oamAddress = ( this.oamAddress + 1 ) & 0xff;
		}
	},

	/**
	 * Clear secondary OAM.
	 */
	clearSecondaryOAM: function() {
		this.oam2.set( this.oam2reset );

		if ( this.ppu.scanline === -1 ) {
			this.yCounters.set( this.yCountersReset );
		}
	},


	/**
	 * Initialize secondary OAM ('sprite evaluation').
	 */
	initSecondaryOAM: function() {
		var ppu = this.ppu;

		if ( !ppu.enabled  ) {
			return;
		}

		var value,
			oam2Index = 0,
			index = this.oamAddress;

		for ( var n = 0; n < 64; n++ ) {
			value = this.oam[ index ];

			this.oam2[ oam2Index ] = value;

			if ( ppu.scanline === value ) {
				this.yCounters[ n ] = this.spriteSize;
			}

			if ( this.yCounters[ n ] ) {
				// sprite is in range

				if ( !this.scanlineOverflow ) {
					// there's still space left in secondary OAM
					this.oam2.set( this.oam.subarray(index, index + 4), oam2Index );

					if ( n === 0 ) {
						this.sprite0Next = true;
					}

					this.nextSpriteCount++;
					oam2Index += 4;

					if ( oam2Index === 32 ) {
						this.scanlineOverflow = true;
					}
				} else {
					// secondary OAM is full but sprite is in range. Trigger sprite overflow
					this.spriteOverflow = true;

					// TODO buggy 'm' overflow behavior
				}

				this.yCounters[ n ]--;
			}

			index += 4;
		}

		this.oamAddress = index;
		this.oam2[ oam2Index ] = 0;
	},

	/**
	 * Fetch sprite data and feed appropriate shifters, counters and latches.
	 */
	fetchTile: function() {
		var spriteIndex = this.currentSprite << 2,
			y = this.oam2[ spriteIndex ],
			tileIndex = this.oam2[ spriteIndex + 1 ],
			attributes = this.oam2[ spriteIndex + 2 ],
			x = this.oam2[ spriteIndex + 3 ],
			baseTable = this.baseTable,
			tile = 0,
			flipX = attributes & 0x40,
			flipY = 0,
			fineY = 0;

		flipY = attributes & 0x80;
		fineY = ( this.ppu.scanline - y ) & ( this.spriteSize - 1 );
		// (the '& spriteSize' is needed because fineY can overflow due
		// to uninitialized tiles in secondary OAM)

		if ( this.spriteSize === 16 ) {
			// big sprite, select proper nametable and handle flipping
			baseTable = ( tileIndex & 1 ) ? 0x1000 : 0;
			tileIndex = tileIndex & ~1;

			if ( fineY > 7 ) {
				fineY -= 8;
				if ( !flipY ) {
					tileIndex++;
				}
			} else if ( flipY ) {
				tileIndex++;
			}
		}

		if ( flipY ) {
			fineY = 8 - fineY - 1;
		}

		tile = this.memory.cartridge.readTile( baseTable, tileIndex, fineY );

		if ( flipX ) {
			tile = bitmap.reverseTile( tile );
		}

		if ( this.currentSprite < this.nextSpriteCount ) {
			this.renderTile( x, tile, attributes );
		}

		this.currentSprite += 1;
	},

	renderTile: function( x, tile, attributes ) {
		var colors = bitmap.getColors( tile ),
			palette = 0x10 | ( (attributes & 3) << 2 ),
			priority = attributes & 0x20,
			sprite0 = ( this.currentSprite === 0 ) && this.sprite0Next,

			color = 0,
			i = 8;

		for ( ; i >= 0 && x >= this.pixelOffset && x < 0x100; i-- ) {
			if ( !this.nextScanlineColors[ x ] ) {
				color = colors[ i ];

				if ( color ) {
					this.nextScanlineColors[ x ] = this.ppu.memory.palette[ palette | color ];
					this.nextScanlinePriority[ x ] = priority;
					this.nextScanlineSprite0[ x ] = sprite0;
				}
			}

			x++;
		}
	}
};

function initTileCycles() {
	var i,
	    result = new Uint8Array( 0x200 );
	
	for ( i = 264; i <= 320; i += 8 ) {
		result[ i ] = 1;
	}

	return result;
}

module.exports = Sprites;
},{"../utils/bitmap":34}],34:[function(require,module,exports){
var colors = initColors();
var reversedBytes = initReversedBytes();
var reversedTiles = initReversedTiles();

/**
 * Get the colors of a tile.
 * Note that a 'tile' is a 16 bit word, with the low colors as the first 8 bits and the high
 * colors as the last 8 bits.
 */
exports.getColors = function( tile ) {
	var offset = tile << 8;
	return colors.subarray( offset, offset + 8 );
};

exports.reverseByte = reverseByte;

/**
 * Reverse all the pixels in a tile.
 * Note that a 'tile' is a 16 bit word, with the low colors as the first 8 bits and the high
 * colors as the last 8 bits.
 */
exports.reverseTile = function( tile ) {
	return reversedTiles[ tile ];
};

/**
 * Reverse all the bits in a byte.
 */
function reverseByte( byte ) {
	return reversedBytes[ byte ];
}

/**
 * Initialize lookup table for getColors().
 */
function initColors() {
	var low, high,
	    result = new Uint8Array( 0x1000000 );

	for ( low = 0; low < 0x100; low++ ) {
		for ( high = 0; high < 0x100; high++ ) {
			addTile( low, high );
		}
	}

	return result;

	function addTile( low, high ) {
		var colorLow, colorHigh, color,
		    offset = ( low << 16 ) | ( high << 8 );

		for ( var i = 0; i < 8; i++ ) {
			colorLow = ( low & 1 );
	    	colorHigh = ( high & 1 ) << 1;
	    	color = ( colorHigh | colorLow );

			result[ offset + i ] = color;

			low >>= 1;
	    	high >>= 1;
		}
	}
}

/**
 * Initialize lookup table for reverseTile().
 */
function initReversedTiles() {
	var low, high, tile, reversed,
		result = new Uint16Array( 0x10000 );
		
	for ( low = 0; low < 0x100; low++ ) {
		for ( high = 0; high < 0x100; high++ ) {
			tile = ( low << 8 ) | high;
			reversed = ( reverseByte( low ) << 8 ) | reverseByte( high );
			result[ tile ] = reversed;
		}
	}

	return result;
}

/**
 * Initialize lookup table for reverseByte().
 */
function initReversedBytes() {
	var i,
	    result = new Uint8Array( 0x100 );

	for ( i = 0; i < 0x100; i++ ) {
		result[ i ] = calcReverse( i );
	}

	return result;

	function calcReverse( original ) {
		var i,
			reverse = 0;

		for ( i = 7; i >= 0; i-- ) {
			reverse |= ( ( original & 1 ) << i );
			original >>>= 1;
		}

		return reverse;
	}
}
},{}]},{},[3])(3)
});