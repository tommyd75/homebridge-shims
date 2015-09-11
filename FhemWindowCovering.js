// Description: Acceccory Shim to use with homebridge https://github.com/nfarina/homebridge
// Copy this file into the folder: homebridge/accessories

/*
Accessory: ZWave FIBARO System FGRM-222 Roller Shutter 2
The following attribute in fhem.cfg has to be added (replace bathroom_blind with the name of your device):

dim {ReadingsVal("bathroom_blind","state","")=~/^dim/?ReadingsNum("bathroom_blind","state","")=~/^99/?100:ReadingsNum("bathroom_blind","state","")=~/^1/?0:ReadingsNum("bathroom_blind","state",""):ReadingsVal("bathroom_blind","dim","")},positionSlat {ReadingsVal("bathroom_blind","state","")=~/^positionSlat/?ReadingsNum("bathroom_blind","state",""):ReadingsVal("bathroom_blind","positionSlat","")}
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
            "accessory": "FhemWindowCovering",
            "name": "garden_blind"
            "operationmode" : "roller"
        },
        {
            "accessory": "FhemWindowCovering",
            "name": "bathroom_blind"
            "operationmode" : "venetian"
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
  accessory: FhemWindowCovering
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


function FhemWindowCovering(log, config) {
  this.log = this.mylog;
  this.name = config["name"];
  this.operationmode = config["operationmode"] || "roller";
  
  this.base_url = base_url;
  this.connection = { 'base_url': this.base_url, 'request': request };
  
  this.Characteristic = {};
  this.currentValue = {};

  this.longpoll_running = false;
  this.startLongpoll();
}

FhemWindowCovering.prototype = {

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
        
        var fhemvalue;
        
        //this.log("dataset: " + dataset);
        //this.log('dataobj: ' + dataobj[0] + ', ' + dataobj[1]);
       
        switch (dataobj[0]) {
          case (this.name + '-dim'):
            fhemvalue = parseInt(dataobj[1]);
            
            if(fhemvalue != this.currentValue.CurrentPosition) {
              this.log( 'Fhem CurrentPosition: ' + fhemvalue);
              this.currentValue.CurrentPosition = fhemvalue;
              this.Characteristic.CurrentPosition.setValue(fhemvalue);
            }
            
            if(fhemvalue != this.currentValue.TargetPosition) {
              this.log( 'Fhem TargetPosition: ' + fhemvalue);
              this.currentValue.TargetPosition = fhemvalue;
              this.Characteristic.TargetPosition.setValue(fhemvalue);
            }
            
            if(fhemvalue != this.currentValue.BlindPosition) {
              this.log( 'Fhem BlindPosition: ' + fhemvalue);
              this.currentValue.BlindPosition = fhemvalue;
              this.Characteristic.BlindPosition.setValue(fhemvalue);
            }
            break;
            
          case (this.name + '-positionSlat'):
            fhemvalue = parseInt(dataobj[1]);
          
            // Fibaro FGRM-222
            fhemvalue = parseInt(fhemvalue / 0.9);
                          
            if(fhemvalue != this.currentValue.SlatPosition) {
              this.log( 'Fhem SlatPosition: ' + fhemvalue);
              this.currentValue.SlatPosition = fhemvalue;
              this.Characteristic.SlatPosition.setValue(fhemvalue);
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
  * Characteristic.CurrentPosition
  */
  
  getCurrentPosition: function(callback) {
  
    var cmd = '{ReadingsVal("' + this.name + '","dim","")}'; 
    var fhem_url = this.base_url + '/fhem?cmd=' + cmd + '&XHR=1';
    
    request.get({url: fhem_url}, function(err, response, body) {
      
      if (!err && response.statusCode == 200) {
        //this.log('body: ' + body);
        this.currentValue.CurrentPosition = parseInt(body.trim());
        //this.log('getCurrentPosition: ' + this.currentValue.CurrentPosition);
        callback(null, this.currentValue.CurrentPosition);
        
      } 
      else {
        callback(err);
        this.log(err);
        if(response)
          this.log("statusCode: " + response.statusCode + " Message: " + response.statusMessage );
      }
    }.bind(this));
  },
  
  setCurrentPosition: null, // N/A
 
  
  /**
  * Characteristic.TargetPosition
  */
  
  getTargetPosition: function(callback) {
  
    var cmd = '{ReadingsVal("' + this.name + '","dim","")}';  // todo
    var fhem_url = this.base_url + '/fhem?cmd=' + cmd + '&XHR=1';
    
    request.get({url: fhem_url}, function(err, response, body) {
      
      if (!err && response.statusCode == 200) {
        this.currentValue.TargetPosition = parseInt(body.trim());
        //this.log('getTargetPosition: ' + this.currentValue.TargetPosition);
        callback(null, this.currentValue.TargetPosition);
      } 
      else {
        callback(err);
        this.log(err);
        if(response)
          this.log("statusCode: " + response.statusCode + " Message: " + response.statusMessage );
      }
    }.bind(this));
  },
  
  setTargetPosition: function(value, callback) {

    this.log('setTargetPosition: ' + value);
    callback();
    
    // todo  !!! issue: control grayed out
  },
  
  /**
  * Characteristic.BlindPosition
  */
  
  getBlindPosition: function(callback) {
  
    var cmd = '{ReadingsVal("' + this.name + '","dim","")}'; 
    var fhem_url = this.base_url + '/fhem?cmd=' + cmd + '&XHR=1';
    
    request.get({url: fhem_url}, function(err, response, body) {
      
      if (!err && response.statusCode == 200) {
        this.currentValue.TargetPosition = parseInt(body.trim());
        //this.log('getTargetPosition: ' + this.currentValue.TargetPosition);
        callback(null, this.currentValue.TargetPosition);
      } 
      else {
        callback(err);
        this.log(err);
        if(response)
          this.log("statusCode: " + response.statusCode + " Message: " + response.statusMessage );
      }
    }.bind(this));
  },
  
  setBlindPosition: function(value, callback) {
    
    if (value == this.currentValue.TargetPosition) {
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
          this.currentValue.BlindPosition = value;
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
  * Characteristic.PositionState
  */
    
  getPositionState: function(callback) {
  
    this.currentValue.PositionState = Characteristic.PositionState.STOPPED;
    callback(null, this.currentValue.PositionState);
    
/* todo 
    var cmd = '{ReadingsVal("' + this.name + '","PositionState","")}';
    var fhem_url = this.base_url + '/fhem?cmd=' + cmd + '&XHR=1';

    request.get({url: fhem_url}, function(err, response, body) {
      //this.log('body: ' + body);
      if (!err && response.statusCode == 200) {
        var state = parseInt(body.trim());
        
        //this.log('getPositionState: ' + state);
        switch(state) {
          case 0:   this.currentValue.PositionState = Characteristic.PositionState.DECREASING; break;
          case 1:   this.currentValue.PositionState = Characteristic.PositionState.INCREASING; break;
          case 2:   this.currentValue.PositionState = Characteristic.PositionState.STOPPED; break;
          default:  // nothing
        }  
        callback(null, this.currentValue.PositionState);
      } 
      else {
        callback(err);
        this.log(err);
        if(response)
          this.log("statusCode: " + response.statusCode + " Message: " + response.statusMessage );
      }
    }.bind(this));
    
*/

  },
  
  setPositionState: null,  // N/S
  
  /**
  * Characteristic.SlatPosition  (Horizontal Tilt Angle)
  */
  
  getSlatPosition: function(callback) {
  
    var cmd = '{ReadingsVal("' + this.name + '","positionSlat","")}';
    var fhem_url = this.base_url + '/fhem?cmd=' + cmd + '&XHR=1';
    
    request.get({url: fhem_url}, function(err, response, body) {
      
      if (!err && response.statusCode == 200) {
        this.currentValue.SlatPosition = parseInt(parseInt(body.trim()) / 0.9); // Fibaro FGRM-222
        
        //this.log('getSlatPosition: ' + body.trim() + ' this.currentValue.SlatPosition: ' + this.currentValue.SlatPosition);
        callback(null, this.currentValue.SlatPosition);
      } 
      else {
        callback(err);
        this.log(err);
        if(response)
          this.log("statusCode: " + response.statusCode + " Message: " + response.statusMessage );
      }
    }.bind(this));
  },
  
  setSlatPosition: function(value, callback) {
    
    if (value == this.currentValue.SlatPosition) {
      callback();
      return;
    }
  
    callback();  // callback immmidiatly to avoid display delay 
    
    if(this.timeoutObj) {
      clearTimeout(this.timeoutObj);
    }
    
    value = parseInt(value * 0.9);  // Fibaro FGRM-222 0 .. 100 => 0 .. 90
    
    var cmd = 'set ' + this.name + ' positionSlat ' + value;
    //this.log("cmd: " + cmd);
    
    var fhem_url = this.base_url + '/fhem?cmd=' + cmd + '&XHR=1';         
    //this.log(fhem_url);
     
    this.timeoutObj = setTimeout(function() { 
      
      request({url: fhem_url}, function(err, response, body) {

        if (!err && response.statusCode == 200) {
          this.currentValue.SlatPosition = value;
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
      .setCharacteristic(Characteristic.Manufacturer, "FHEM Manufacturer")
      .setCharacteristic(Characteristic.Model, "FHEM Model")
      .setCharacteristic(Characteristic.SerialNumber, "FHEM Serial Number")
      .setCharacteristic(Characteristic.Name, this.name);
      
    var FhemWindowCoveringService = new Service.WindowCovering();
    
    this.Characteristic.CurrentPosition = FhemWindowCoveringService
      .getCharacteristic(Characteristic.CurrentPosition)
      .on('get', this.getCurrentPosition.bind(this));
    this.currentValue.CurrentPosition = 0;  // 0 .. 100

    this.Characteristic.TargetPosition = FhemWindowCoveringService
      .getCharacteristic(Characteristic.TargetPosition)
      .on('get', this.getTargetPosition.bind(this))
      .on('set', this.setTargetPosition.bind(this));
    this.currentValue.TargetPosition = 0;  // 0 .. 100
      
    this.Characteristic.PositionState = FhemWindowCoveringService
      .getCharacteristic(Characteristic.PositionState)
      .on('get', this.getPositionState.bind(this));
      
    // The value property of PositionState must be one of the following:
    // Characteristic.PositionState.DECREASING = 0;
    // Characteristic.PositionState.INCREASING = 1;
    // Characteristic.PositionState.STOPPED = 2;
    this.currentValue.PositionState = Characteristic.PositionState.STOPPED;
    
    // used for the Blind Position
    this.Characteristic.BlindPosition = FhemWindowCoveringService
      .addCharacteristic(Characteristic.Brightness)
      .on('get', this.getBlindPosition.bind(this))
      .on('set', this.setBlindPosition.bind(this));
    this.currentValue.BlindPosition = 0;   // 0 .. 100
    
    if (this.operationmode == "venetian") {
      // used for the Slat Position
      this.Characteristic.SlatPosition = FhemWindowCoveringService
        .addCharacteristic(Characteristic.Saturation)
        .on('get', this.getSlatPosition.bind(this))
        .on('set', this.setSlatPosition.bind(this));
      this.currentValue.SlatPosition = 0;   // 0 .. 100 (0 .. 90)
    }
      
    return [informationService, FhemWindowCoveringService];
  }
};
