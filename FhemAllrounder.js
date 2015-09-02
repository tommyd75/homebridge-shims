// Description: Acceccory Shim to use with homebridge https://github.com/nfarina/homebridge
// Copy this file into the folder: homebridge/accessories

/*
For ZWave FIBARO System FGRM-222 Roller Shutter Controller 2
The following attribute in fhem.cfg has to be added (replace garden_blind with the name of your device):

The attribute in fhem.cfg has to be added (replace led_bulb with the name of your device):
onoff {ReadingsVal("garden_blind","state","")=~/^on|^off/?ReadingsVal("garden_blind","state",""):ReadingsVal("garden_blind","onoff","")},pct  {ReadingsVal("garden_blind","state","")=~/^dim/?ReadingsNum("garden_blind","state",""):ReadingsVal("garden_blind","state","")=~/^off/?0:ReadingsVal("garden_blind","state","")=~/^on/?99:ReadingsVal("garden_blind","pct","")}
*/


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
            "accessory": "FhemAllrounder",
            "name": "garden_blind"
        },
        {
            "accessory": "FhemAllrounder",
            "name": "bathroom_blind"
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
  accessory: FhemAllrounder
}

'use strict';

/**
* Load url
*/
  
var configPath = path.join(__dirname, "../config.json");
var config = JSON.parse(fs.readFileSync(configPath));
var url = config.global.url;
var port = config.global.port;
var base_url = 'http://' + url + ':' + port;
//console.log("base_url " + base_url);

/**
* Accessory: FhemAllrounder
*/

function FhemAllrounder(log, config) {
  //this.log = log;
  this.log = this.mylog;
  this.name = config["name"];
  this.base_url = base_url;
  this.connection = { 'base_url': this.base_url, 'request': request };
  
  this.Characteristic = {};
  this.currentValue = {};
  
  this.longpoll_running = false;
  this.startLongpoll();
}

FhemAllrounder.prototype = {

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
          break; // exit for-loop
         
        var dataset = datastr.substr(offset, nIndex-offset);
        
        offset = nIndex + 1;
        if(!dataset.length)
          continue;
        
        var dataobj = JSON.parse(dataset);
                
        //this.log("dataset: " + dataset);
        //this.log('dataobj: ' + dataobj[0] + ', ' + dataobj[1]);
        
        var fhemvalue;
        var reading;
        
        switch (dataobj[0]) {
          case (this.name + '-onoff'):
          
            switch(dataobj[1]) {
              case 'on':  fhemvalue = true; break;
              case 'off': fhemvalue = false; break;
            }
            
            if(fhemvalue != this.currentValue.On) { 
              this.log( 'Fhem onoff: ' + fhemvalue);
              this.currentValue.On = fhemvalue;
              this.Characteristic.On.setValue(fhemvalue);
            }
            break;
          
          case (this.name + '-dim'):
            fhemvalue = parseInt(dataobj[1]);
          
            // Fibaro FGRM-222
            switch (fhemvalue) {
              case 1:   fhemvalue = 0; break;
              case 99:  fhemvalue = 100; break;
              default:  // nothing
            }
                          
            if(fhemvalue != this.currentValue.Brightness) {
              this.log( 'Fhem Brightness: ' + fhemvalue);
              this.currentValue.Brightness = fhemvalue;
              this.Characteristic.Brightness.setValue(fhemvalue);
            }
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
    var cmd = '{ReadingsVal("' + this.name + '","onoff","")}';
    var fhem_url = this.base_url + '/fhem?cmd=' + cmd + '&XHR=1';

    request.get({url: fhem_url}, function(err, response, body) {
      //this.log('body: ' + body);
      if (!err && response.statusCode == 200) {
        var state = body.trim();
        if (state.match(/^[A-D]./))  // EnOcean
          state = state.slice(1,2);
        
        this.log('getPowerState: >' + state + '<');
                
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
       
    this.log("setStatePower: " + boolvalue);
    
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
    this.log("cmd: " + cmd);
    
    var fhem_url = this.base_url + '/fhem?cmd=' + cmd + '&XHR=1';    
    //this.log(fhem_url);
        
    request({url: fhem_url}, function(err, response, body) {

      if (!err && response.statusCode == 200) {
        this.currentValue.On = boolvalue;
        callback();
        //this.log("State change complete.");
      }
      else {
        callback(err)
        this.log(err);
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
        
        if(this.currentValue.Brightness == 99) this.currentValue.Brightness = 100;  // Fibaro FGRM-222
        if(this.currentValue.Brightness == 1) this.currentValue.Brightness = 0;     // Fibaro FGRM-222
        
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
  
    callback();  // callback immmidiatly to avoid display delay 
    
    if(value == 100) value = 99;  // Fibaro FGRM-222 
    
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
          this.currentValue.Brightness = value;
          this.log("cmd: " + cmd);
          // callback();
        } 
        else {
          // callback(err);
          this.log(err);
          if(response)
            this.log("statusCode: " + response.statusCode + " Message: " + response.statusMessage );
        }
      }.bind(this));
    }.bind(this), 1000);
  },
  
 /**
  * Characteristic.HoldPosition
  */

  getHoldPosition: null, //  N/A
  
  setHoldPosition: function(boolvalue, callback) {
  
    //this.log('setHoldPosition: ' + boolvalue);
  
    if (boolvalue == this.currentValue.HoldPosition) {
      callback();
      return;
    }
    
    var state = "";
    
    switch (boolvalue) {
      case 0:
      case false:       break;
      case 1:
      case true:        state = 'stop';  break; 
      default:          
        this.log("setPowerState: state undefined " + boolvalue + "<");
        callback();
        return;
    }
    
    if (state != 'stop') {
      this.currentValue.HoldPosition = boolvalue;
      callback();
      return;
    }
    
    var cmd = 'set ' + this.name + ' ' + state;
    //this.log("cmd: " + cmd);
    
    var fhem_url = this.base_url + '/fhem?cmd=' + cmd + '&XHR=1';    
    //this.log(fhem_url);
    
    
    request({url: fhem_url}, function(err, response, body) {

      if (!err && response.statusCode == 200) {
        this.currentValue.HoldPosition = boolvalue;
        this.log("setHoldPosition: " + boolvalue);
        callback();
      }
      else {
        callback(err)
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
    this.log("Identify requested!");
    callback();
  },
  
  /**
  * Services and Characteristics
  */
  
  getServices: function() {
    
    var informationService = new Service.AccessoryInformation();
    
    informationService
      .setCharacteristic(Characteristic.Manufacturer, "Aeon Labs")
      .setCharacteristic(Characteristic.Model, "Aeotec FGRM-222")
      .setCharacteristic(Characteristic.SerialNumber, "V2/2")
      .setCharacteristic(Characteristic.Name, this.name);
        
    //var FhemAllrounderService = new Service.Switch();
    var FhemAllrounderService = new Service.Lightbulb();
        
    this.Characteristic.On = FhemAllrounderService
      .getCharacteristic(Characteristic.On)
      .on('get', this.getPowerState.bind(this))
      .on('set', this.setPowerState.bind(this));
    this.currentValue.On = false;
 
    this.Characteristic.Brightness = FhemAllrounderService
      .addCharacteristic(Characteristic.Brightness)
      .on('get', this.getBrightness.bind(this))
      .on('set', this.setBrightness.bind(this));
    this.currentValue.Brightness = 0;   // 0 .. 100
      
    this.Characteristic.HoldPosition = FhemAllrounderService
      .addCharacteristic(Characteristic.HoldPosition)
      .on('set', this.setHoldPosition.bind(this));
    this.currentValue.HoldPosition = false;
    
    this.Characteristic.HoldPosition.readable = true;
    this.Characteristic.HoldPosition.setValue(this.currentValue.HoldPosition);
    
    return [informationService, FhemAllrounderService];
  }
};
