// Description: Acceccory Shim to use with homebridge https://github.com/nfarina/homebridge

// Copy this file into the folder: homebridge/accessories
// This shim is for the ZWave Aeotec LED Bulb ZW098-C55
// The attribute in fhem.cfg has to be added (replace led_bulb with the name of your device):
//
// attr led_bulb userReadings onoff {ReadingsVal("led_bulb","state","") =~/^on|^off/?
// ReadingsVal("led_bulb","state",""):ReadingsVal("led_bulb","onoff","")},dim {ReadingsVal("led_bulb","state","") 
// =~/^dim/?ReadingsNum("led_bulb","state",""):ReadingsVal("led_bulb","dim","")},rgb 
// {ReadingsVal("led_bulb","state","") =~/^rgb/?substr(ReadingsVal("led_bulb","state",""),
// 4):ReadingsVal("led_bulb","rgb","")}


/* config.json Example:
{   
    "global": {
        "url": "127.0.0.1",
        "port": "8083"
    },
        
    "bridge": {
        "name": "Homebridge",
        "username": "CC:22:3D:E3:CE:27",
        "port": 51826,
        "pin": "031-45-154"
    },

    "platforms": [],                        
    
    "accessories": [
        {
            "accessory": "FhemLightbulb",
            "name": "led_bulb"
        },
        {
            "accessory": "FhemLightbulb",
            "name": "dining_bulb"
        }
    ]                      
}
*/

var Service = require("HAP-NodeJS").Service;
var Characteristic = require("HAP-NodeJS").Characteristic;
var request = require("request");

var fs = require('fs');
var path = require('path');

module.exports = {
  accessory: FhemLightbulb
}

'use strict';

// Load fhem-url
var configPath = path.join(__dirname, "../config.json");
var config = JSON.parse(fs.readFileSync(configPath));
var url = config.global.url;
var port = config.global.port;
var base_url = 'http://' + url + ':' + port;
//console.log("base_url " + base_url);

/**
 * Converts an HSV color value to RGB. Conversion formula
 * adapted from http://en.wikipedia.org/wiki/HSV_color_space.
 * Assumes h, s, and v are contained in the set [0, 1] and
 * returns rgb (FFFFFF)
 *
 * @param   Number  h       The hue
 * @param   Number  s       The saturation
 * @param   Number  v       The value (brigthness)
 * @return  HexNumber       The RGB representation
 */
function hsv2rgb(h, s, v) {
  var r, g, b;

  var i = Math.floor(h * 6);
  var f = h * 6 - i;
  var p = v * (1 - s);
  var q = v * (1 - f * s);
  var t = v * (1 - (1 - f) * s);

  switch(i % 6){
    case 0: r = v, g = t, b = p; break;
    case 1: r = q, g = v, b = p; break;
    case 2: r = p, g = v, b = t; break;
    case 3: r = p, g = q, b = v; break;
    case 4: r = t, g = p, b = v; break;
    case 5: r = v, g = p, b = q; break;
  }

  r = Math.round(r*255);
  g = Math.round(g*255);
  b = Math.round(b*255);
  // console.log("r: " + r + " g: " + g + " b: " + b);
  return Number(0x1000000 + r*0x10000 + g*0x100 + b).toString(16).substring(1).toUpperCase();
}

/**
 * Converts an RGB color value to HSV. Conversion formula
 * adapted from http://en.wikipedia.org/wiki/HSV_color_space.
 * Assumes r, g, and b are contained in the set [0, 255] and
 * returns h, s, and v in the set [0, 1].
 *
 * @param   Number  r       The red color value
 * @param   Number  g       The green color value
 * @param   Number  b       The blue color value
 * @return  Array           The HSV representation
 */
function rgb2hsv(r, g, b) {
  r = r/255, g = g/255, b = b/255;
  var max = Math.max(r, g, b), min = Math.min(r, g, b);
  var h, s, v = max;

  var d = max - min;
  s = max == 0 ? 0 : d / max;

  if(max == min){
      h = 0; // achromatic
  } else {
      switch(max){
          case r: h = (g - b) / d + (g < b ? 6 : 0); break;
          case g: h = (b - r) / d + 2; break;
          case b: h = (r - g) / d + 4; break;
      }
      h /= 6;
  }

  return [h, s, v];
}

function FhemLightbulb(log, config) {
  this.log = this.mylog;
  this.name = config["name"];
  this.base_url = base_url;
  this.connection = { 'base_url': this.base_url, 'request': request };
  
  this.Characteristic = {};
  this.currentValue = {};

  this.longpoll_running = false;
  this.startLongpoll();
}

FhemLightbulb.prototype = {

  /**
  * FHEM mylog
  */
  
  mylog: function mylog(msg) {
    var now = new Date().toLocaleString();
    var logmsg = now + " [" + this.name + "] " + msg;
    console.log(logmsg);
  },
  
  /**
  * FHEM Longpoll
  */
  
  startLongpoll: function() {
  
    if( this.longpoll_running )
      return;
    
    this.longpoll_running = true;

    var since = "null";
    var query = "/fhem.pl?XHR=1&inform=type=status;filter=" + this.name + ";since=" + since + 
    ";fmt=JSON&timestamp=" + Date.now();
    var url = encodeURI( this.connection.base_url + query );
    //this.log( 'starting longpoll: ' + url );

    var offset = 0;
    var datastr = "";
    
    this.connection.request.get( { url: url } ).on( 'data', function(data) {
      //this.log( 'data: >'+ data + '<');
      if( !data ) 
        return;

      datastr += data;

      for(;;) {
      
        var nIndex = datastr.indexOf("\n", offset);
        if(nIndex < 0) 
          break;  // exit for-loop
        
        var dataset = datastr.substr(offset, nIndex-offset);
        //this.log('datastr: ' + i + '\n' + datastr);
        
        offset = nIndex + 1;
        if(!dataset.length)
          continue;
        
        var dataobj = JSON.parse(dataset);
        
        //this.log("dataset: " + dataset);
        //this.log('  dataobj: ' + dataobj[0] + ', ' + dataobj[1]);
        
        var fhemvalue;
        
        switch (dataobj[0]) {

          case (this.name + '-onoff'):
          
            switch(dataobj[1]) {
              case 'on':  fhemvalue = true; break;
              case 'off': fhemvalue = false; break;
            }            
            //this.log( 'Fhem onoff: ' + fhemvalue);
            
            if(fhemvalue != this.currentValue.On) { 
              this.currentValue.On = fhemvalue;        
              this.Characteristic.On.setValue(fhemvalue);
            }
            break;
            
          case (this.name + '-dim'):
            fhemvalue = parseInt(dataobj[1].match(/\d+/));
            //this.log("Fhem dim: " + fhemvalue);
            
            if(fhemvalue != this.currentValue.Brightness) { 
              this.currentValue.Brightness = fhemvalue;
              this.Characteristic.Brightness.setValue(fhemvalue);
            }
            break;
            
          case (this.name + '-rgb'):
            fhemvalue = dataobj[1].split(" ");
            //this.log("Fhem rgb: " + fhemvalue);
              
            var rgb = dataobj[1].split(" ");
            
            var hsv = rgb2hsv(rgb[0],rgb[1],rgb[2]);
            this.currentValue.Hue = parseInt( hsv[0] * 360 );
            this.currentValue.Saturation = parseInt( hsv[1] * 100 );
            //this.currentValue.Brightness = parseInt( hsv[2] * 100 );
            this.Characteristic.Hue.setValue(this.currentValue.Hue);
            this.Characteristic.Saturation.setValue(this.currentValue.Saturation);
            //this.Characteristic.Brightness.setValue(this.currentValue.Brightness);
            break;
            
          default: // nothing
        }
      }
      
      datastr = datastr.substr(offset);
      offset = 0;

    }.bind(this) ).on( 'end', function() {
      this.log( "longpoll ended" );

      this.longpoll_running = false;
      setTimeout( function(){this.startLongpoll()}.bind(this), 2000 );

    }.bind(this) ).on( 'error', function(err) {
      this.log( "longpoll error: " + err );

      this.longpoll_running = false;
      setTimeout( function(){this.startLongpoll()}.bind(this), 5000 );
    }.bind(this) );
  },
    
  /**
  * Characteristic.On
  */
  
  getPowerState: function(callback) {
    
    //this.log("Getting current state...");
    var cmd = '{ReadingsVal("' + this.name + '","state","")}';
    var fhem_url = this.base_url + '/fhem?cmd=' + cmd + '&XHR=1';

    request.get({url: fhem_url}, function(err, response, body) {
      //this.log('body: ' + body);
      if (!err && response.statusCode == 200) {
        var state = body.trim();
        if (state.match(/^[A-D]./))  // EnOcean
        state = state.slice(1,2);
        
        //this.log('getPowerState: >' + state + '<');
                
        switch (state) {
          case  '0':
          case  'off':   this.currentValue.On = false; break;
          case  'I':
          case  '1':
          case  'on':    this.currentValue.On = true; break;
          default:      // nothing
        }
        callback(null, this.currentValue.On);
      } 
      else {
        callback(err);
        this.log(err);
        if(response)
          this.log("statusCode: " + response.statusCode + " Message: " + response.statusMessage );
      }
    }.bind(this));
  },
   
  setPowerState: function(boolvalue, callback) {
  
    if (boolvalue == this.currentValue.On) {
      callback();
      return;
    }
    
    var state = "";

    switch (boolvalue) {
      case 0:
      case false:       state = 'off'; break;
      case 1:
      case true:        state = 'on';  break; 
      default:
        this.log("setPowerState: state undefined! boolvalue: >" + boolvalue + "<");
        callback();
        return;
    }
    
    var cmd = 'set ' + this.name + ' ' + state;
    
    var fhem_url = this.base_url + '/fhem?cmd=' + cmd + '&XHR=1';    
    //this.log(fhem_url);

    request({url: fhem_url}, function(err, response, body) {

      if (!err && response.statusCode == 200) {
        this.currentValue.On = boolvalue;
        callback();
        //this.log("State change complete.");
      } 
      else {
        callback(err);
        this.log("setPowerState " + err);
        if(response)
          this.log("statusCode: " + response.statusCode + " Message: " + response.statusMessage );
      }
    }.bind(this));
  },
  
  /**
  * Characteristic.Brightness
  */
  
  getBrightness: function(callback) {
  
    var cmd = '{ReadingsVal("' + this.name + '","dim","")}';
    var fhem_url = this.base_url + '/fhem?cmd=' + cmd + '&XHR=1';
    
    request.get({url: fhem_url}, function(err, response, body) {
      
      if (!err && response.statusCode == 200) {
        this.currentValue.Brightness = parseInt(body.trim());
        //this.log('getBrightness: >' + body.trim() + '< this.currentValue.Brightness: ' + this.currentValue.Brightness);
        callback(null, this.currentValue.Brightness);
      } 
      else {
        callback(err);
        this.log(err);
        if(response)
          this.log("statusCode: " + response.statusCode + " Message: " + response.statusMessage );
      }
    }.bind(this));
  },
  
  setBrightness: function(value, callback) {

    if (value == this.currentValue.Brightness) {
      callback();
      return;
    }

    if(this.timeoutObj) {
      clearTimeout(this.timeoutObj);
    }
    
    var cmd = 'set ' + this.name + ' dim ' + value;
    //this.log("cmd: " + cmd);
    
    var fhem_url = this.base_url + '/fhem?cmd=' + cmd + '&XHR=1';         
    //this.log(fhem_url);
     
    this.timeoutObj = setTimeout(function() { 
      
      request({url: fhem_url}, function(err, response, body) {

        if (!err && response.statusCode == 200) {
          //this.currentValue.Brightness = value;
          this.log("setBrightness: " + value);
          callback();
        } 
        else {
          callback(err);
          this.log(err);
          if(response)
            this.log("statusCode: " + response.statusCode + " Message: " + response.statusMessage );
        }
      }.bind(this)); 
    }.bind(this), 100);
  },
  
  /**
  * Characteristic.Hue
  */
  
  getHue: function(callback) {
  
    this.getRGB();  // todo error handling
    callback(null, this.currentValue.Hue);
  },
  
  setHue: function(value, callback) {

    if (value != this.currentValue.Hue) {
      this.currentValue.Hue = value;
      this.setRGB();  // todo error handling
    }
    callback();
  },
  
  getSaturation: function(callback) {
  
    this.getRGB();
    callback(null, this.currentValue.Saturation);
  },
  
  setSaturation: function(value, callback) {

    if (value != this.currentValue.Saturation) {
      this.currentValue.Saturation = value;
      // this.setRGB();
    }
    callback();
  },
  
  getRGB: function() {
  
    var cmd = '{ReadingsVal("' + this.name + '","rgb","")}';
    var fhem_url = this.base_url + '/fhem?cmd=' + cmd + '&XHR=1';
    
    request.get({url: fhem_url}, function(err, response, body) {
      
      if (!err && response.statusCode == 200) {
        
        //this.log('body ' + body.trim());
        
        var rgb = body.split(" ");
        var hsv = rgb2hsv(rgb[0],rgb[1],rgb[2]);
        
        this.currentValue.Hue = parseInt( hsv[0] * 360 );
        this.currentValue.Saturation = parseInt( hsv[1] * 100 );
        this.currentValue.Brightness = parseInt( hsv[2] * 100 );
      
        //this.log('hue: ' + this.currentValue.Hue + ' sat: ' + this.currentValue.Saturation + ' bri: ' + this.currentValue.Brightness);
      } 
      else {
        this.log(err);
        if(response)
          this.log("statusCode: " + response.statusCode + " Message: " + response.statusMessage );
      }
    }.bind(this));
  },
      
  setRGB: function() {

    value = hsv2rgb(this.currentValue.Hue / 360, this.currentValue.Saturation / 100, this.currentValue.Brightness / 100);
    cmd = 'set ' + this.name + ' rgb ' + value;
    
    var fhem_url = this.base_url + '/fhem?cmd=' + cmd + '&XHR=1';    
    //this.log(fhem_url);

    request({url: fhem_url}, function(err, response, body) {

      if (!err && response.statusCode == 200) {
        this.log("setRGB: " + value);
      } 
      else {
        this.log(err);
        if(response)
          this.log("statusCode: " + response.statusCode + " Message: " + response.statusMessage );
      }
    }.bind(this));    
  },
  
  /**
  * Accessory Information Identify 
  */
  
  identify: function(callback) {

    //this.log("Identify requested!");
    
    var cmd = 'set ' + this.name + ' ' + 'on-for-timer 2';
    //this.log("cmd: " + cmd);
    
    var fhem_url = this.base_url + '/fhem?cmd=' + cmd + '&XHR=1';    
    //this.log(fhem_url);
        
    request({url: fhem_url}, function(err, response, body) {

      if (!err && response.statusCode == 200) {
        callback();
        //this.log("State change complete.");
      } 
      else {
        this.log(err);
        callback(err)
        if(response)
          this.log("statusCode: " + response.statusCode + " Message: " + response.statusMessage );
      }
    }.bind(this));
  },
  
  /**
  * Services and Characteristics
  */
  
  getServices: function() {
    
    var informationService = new Service.AccessoryInformation();
    
    informationService
      .setCharacteristic(Characteristic.Manufacturer, "Aeon Labs")
      .setCharacteristic(Characteristic.Model, "Aeotec ZW098-C55")
      .setCharacteristic(Characteristic.SerialNumber, "0086-0003-0062")
      .setCharacteristic(Characteristic.Name, this.name);
        
    var FhemLightbulbService = new Service.Lightbulb();
    
    this.Characteristic.On = FhemLightbulbService
      .getCharacteristic(Characteristic.On)
      .on('get', this.getPowerState.bind(this))
      .on('set', this.setPowerState.bind(this));
    this.currentValue.On = false;
        
    this.Characteristic.Brightness = FhemLightbulbService
      .addCharacteristic(Characteristic.Brightness)
      .on('get', this.getBrightness.bind(this))
      .on('set', this.setBrightness.bind(this));
    this.currentValue.Brightness = 0;
      
    this.Characteristic.Hue = FhemLightbulbService
      .addCharacteristic(Characteristic.Hue)
      .on('get', this.getHue.bind(this))
      .on('set', this.setHue.bind(this));
    this.currentValue.Hue = 0;
      
    this.Characteristic.Saturation = FhemLightbulbService
      .addCharacteristic(Characteristic.Saturation)
      .on('get', this.getSaturation.bind(this))
      .on('set', this.setSaturation.bind(this));
    this.currentValue.Saturation = 0;
      
    return [informationService, FhemLightbulbService];
  }
};
